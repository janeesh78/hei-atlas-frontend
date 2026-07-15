// API client for the Hei Atlas backend (FastAPI)
import { apiFetch } from './apiBase';
import { authHeaders } from './auth';

/**
 * Fire-and-forget telemetry ping to the backend. Used to track frontend
 * pipeline progress in the backend log so we can diagnose silent stalls
 * without needing the user's browser console.
 *
 * Never throws. Never blocks. Never includes PHI (callers send tags only).
 */
export function pingBackend(tag: string, meta?: Record<string, unknown>): void {
  try {
    apiFetch(`/debug/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag, meta: meta || {} }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}

export interface TranscribeResponse {
  transcript: string;
  duration_seconds?: number | null;
}

export interface OncologyNote {
  note_id: string;
  created_at: string;
  transcript: string;
  chief_complaint: string;
  history_present_illness: string;
  current_medications: string;
  allergies: string;
  physical_examination: string;
  /** Legacy combined field — still populated (labs + imaging joined). */
  lab_imaging_review: string;
  /** Split fields (backend ≥2026-07-09); absent on older saved notes. */
  laboratory_review?: string | null;
  imaging_review?: string | null;
  /** Newline-separated "date | treatment | outcome" rows (backend ≥2026-07-10). */
  prior_oncologic_therapy?: string | null;
  assessment: string;
  plan: string;
  follow_up: string;
  cancer_type?: string | null;
  tnm_stage?: string | null;
  ecog_status?: string | null;
  raw_structured?: Record<string, unknown> | null;
  /** Grounded today-only coding extraction (backend ≥2026-07-14), present only
   *  when coding was enabled at generation time. Forward to /coding/analyze —
   *  never render directly, it's raw model output, not physician-facing text. */
  coding_facts?: Record<string, unknown> | null;
}

export interface NoteGenerationResponse {
  note: OncologyNote;
  fhir_bundle?: Record<string, unknown> | null;
}

export interface Citation {
  source: string;
  title: string;
  url?: string;
  section?: string;
  year?: string | number;
}

export interface Recommendation {
  title: string;
  detail: string;
  strength?: string;
  evidence?: string;
}

export interface ClinicalTrial {
  nct_id: string;
  title: string;
  phase?: string;
  status?: string;
  conditions?: string[];
  url?: string;
  brief_summary?: string;
}

export interface CdsResponse {
  recommendations: Recommendation[];
  citations: Citation[];
  clinical_trials: ClinicalTrial[];
  cancer_type?: string;
  stage?: string;
}

/**
 * Discriminated upload result for the offline-tolerant recording queue.
 * `retryable` distinguishes transient network/server issues (keep retrying)
 * from terminal client errors like 4xx no-speech (no point retrying).
 */
export type TranscribeUploadResult =
  | { ok: true; transcript: string }
  | { ok: false; retryable: boolean; message: string };

/** Upload an audio blob and return a structured result usable by the queue. */
export async function transcribeAudioSafe(audioBlob: Blob): Promise<TranscribeUploadResult> {
  try {
    const data = await transcribeAudio(audioBlob);
    if (data.transcript && data.transcript.trim()) {
      return { ok: true, transcript: data.transcript };
    }
    return { ok: false, retryable: false, message: 'Empty transcript' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    // 4xx (no speech, bad audio, validation) → not retryable. Network
    // failures, 5xx, and the generic "Failed to fetch" → retryable.
    // 401 is also retryable: sessions expire after 15 idle minutes, so a
    // recording queued offline may outlive its token. authHeaders() is read
    // per attempt, so once the user re-verifies the next drain succeeds —
    // never drop clinical audio over an expired session.
    const retryable =
      /failed to fetch|network|timeout|abort|5\d\d|429|\b401\b/i.test(message);
    return { ok: false, retryable, message };
  }
}

/** POST /transcription/ — multipart "audio" field → { transcript } */
export async function transcribeAudio(audioBlob: Blob): Promise<TranscribeResponse> {
  const formData = new FormData();
  const ext = (audioBlob.type.split('/')[1] || 'webm').split(';')[0];
  formData.append('audio', audioBlob, `recording.${ext}`);

  const res = await apiFetch(`/transcription/`, {
    method: 'POST',
    headers: authHeaders(), // no Content-Type — the browser sets the multipart boundary
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Transcription failed (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  return {
    transcript: data.transcript || data.text || '',
    duration_seconds: data.duration_seconds,
  };
}

export type OutputFormat =
  | 'History and Physical'
  | 'Consultation'
  | 'Follow Up Note'
  | 'Assessment and Plan Only';

export interface GenerateNoteOptions {
  transcript: string;
  outputFormat?: OutputFormat;
  previousNote?: string;
  /** When true, the backend also extracts grounded coding_facts from today's
   *  transcript (returned on the note). Defaults off. */
  codingEnabled?: boolean;
}

/**
 * POST /notes/generate
 * Sends `transcript`, `output_format`, and `previous_note`. The backend
 * consumes `previous_note` natively as a labeled reference block: durable
 * content (diagnosis, staging, treatment timeline, problem list) is
 * reorganized into today's note and today's transcript wins conflicts.
 * Never concatenate it into the transcript — unlabeled prior-note text gets
 * read as today's dialogue and leaks old narration into new notes.
 */
export async function generateNote(
  options: GenerateNoteOptions
): Promise<NoteGenerationResponse> {
  const { transcript, outputFormat = 'Consultation', previousNote, codingEnabled } = options;

  const res = await apiFetch(`/notes/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      transcript,
      output_format: outputFormat,
      previous_note: previousNote?.trim() || undefined,
      coding_enabled: !!codingEnabled,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Note generation failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

// ─── Coding Intelligence (backend deterministic engine) ─────────────────────
//
// Distinct from lib/coding.ts's `CodingResult` (client-side instant heuristic
// preview, computed for free with no network call). `CodingReport` is the
// authoritative, evidence-grounded output of POST /coding/analyze — it only
// ever sees today's `coding_facts` + transcript, never prior notes or claims.

export interface EvidenceSpan {
  quote: string;
  start: number;
  end: number;
  source: 'transcript' | 'note';
}

export interface MdmElement {
  level: string;
  items: string[];
  evidence_spans: EvidenceSpan[];
}

export interface MdmGrid {
  problems: MdmElement;
  data: MdmElement;
  risk: MdmElement;
}

export interface TimePath {
  documented_minutes: number | null;
  supported_code: string | null;
}

export interface EmRecommendation {
  recommended_code: string;
  basis: 'mdm' | 'time';
  mdm_level: string;
  mdm_grid: MdmGrid;
  time_path: TimePath;
  documentation_gaps: string[];
}

export interface CptSuggestion {
  code: string;
  description: string;
  units: number;
  modifiers: string[];
  w_rvu: number | null;
  total_rvu_facility: number | null;
  total_rvu_nonfacility: number | null;
  evidence_spans: EvidenceSpan[];
  sequence: number;
}

export interface IcdSuggestion {
  code: string;
  description: string;
  rank: 'primary' | 'secondary';
  evidence_span: EvidenceSpan | null;
  specificity_flags: string[];
  sequencing_rationale: string | null;
}

export interface CodingReport {
  status: 'ok' | 'coding_failed';
  error?: string | null;
  em: EmRecommendation | null;
  cpt: CptSuggestion[];
  icd10: IcdSuggestion[];
  engine_version: string;
  disclaimer: string;
}

export interface VisitMetaInput {
  new_patient?: boolean;
  total_time_minutes?: number | null;
  place_of_service?: string | null;
}

/**
 * POST /coding/analyze
 * `codingFacts` must be the note's own `coding_facts` block (today-only,
 * grounded). `transcript` is used only to resolve evidence quotes to char
 * spans server-side — never as a second source of facts.
 */
export async function analyzeCoding(payload: {
  codingFacts: Record<string, unknown>;
  transcript: string;
  visitMeta: VisitMetaInput;
}): Promise<CodingReport> {
  const res = await apiFetch(`/coding/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      coding_facts: payload.codingFacts || {},
      visit_meta: {
        new_patient: !!payload.visitMeta.new_patient,
        total_time_minutes: payload.visitMeta.total_time_minutes ?? undefined,
        place_of_service: payload.visitMeta.place_of_service || undefined,
      },
      transcript: payload.transcript || '',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Coding analysis failed (${res.status}): ${text || res.statusText}`);
  }

  return res.json();
}

/** Race a fetch against a timeout. Returns null on timeout/error so CDS is best-effort. */
async function fetchJsonWithTimeout(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await apiFetch(path, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Curated oncology vocabulary (mirrors backend _ONCO_TOKENS). Only tokens in
// this list survive the client-side sanitizer. Used to project the free-text
// query into a PHI-safe keyword bag before it crosses the wire — patient
// names, dates, conversational content, and EHR pastes get dropped.
const ONCO_TOKENS_FE = new Set<string>([
  'nsclc', 'sclc', 'lung', 'pancreatic', 'pancreas', 'pdac', 'mpdac',
  'colorectal', 'crc', 'colon', 'rectal', 'rectum', 'breast', 'tnbc',
  'idc', 'ilc', 'dcis', 'prostate', 'crpc', 'mcrpc', 'ovarian', 'endometrial',
  'uterine', 'cervical', 'melanoma', 'head', 'neck', 'hnscc',
  'lymphoma', 'hodgkin', 'nhl', 'dlbcl', 'follicular', 'mantle', 'cell',
  'myeloma', 'leukemia', 'aml', 'all', 'cll', 'cml', 'mds', 'mpn',
  'hepatocellular', 'hcc', 'gastric', 'esophageal', 'bladder', 'urothelial',
  'renal', 'rcc', 'kidney', 'thyroid', 'sarcoma', 'glioblastoma', 'gbm',
  'brain', 'cns', 'carcinoma', 'adenocarcinoma', 'squamous',
  'waldenstrom', 'macroglobulinemia', 'nasopharyngeal',
  'egfr', 'alk', 'ros1', 'braf', 'kras', 'her2', 'pdl1', 'tmb', 'msi',
  'mmr', 'tp53', 'brca', 'brca1', 'brca2', 'fgfr', 'met', 'ret', 'ntrk', 'hrr',
  'chemotherapy', 'immunotherapy', 'targeted', 'parp', 'checkpoint',
  'adc', 'metastatic', 'recurrent', 'refractory', 'unresectable', 'locally',
  'advanced', 'early', 'stage',
]);

function sanitizeQueryFE(text: string, maxChars = 200): string {
  if (!text) return '';
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const tok = raw.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
    if (!tok || seen.has(tok)) continue;
    if (ONCO_TOKENS_FE.has(tok)) {
      seen.add(tok);
      kept.push(tok);
    }
  }
  return kept.join(' ').slice(0, maxChars);
}

/**
 * GET /cds/trials — fast, returns real ClinicalTrials.gov data.
 *
 * PHI safety: the `query` argument is passed through `sanitizeQueryFE` before
 * being put on the URL. Patient names, conversational fragments, and anything
 * not in the curated oncology vocabulary are dropped client-side so they never
 * appear in browser history, network logs, or the backend's access log.
 */
export async function getTrials(
  query: string,
  cancerType?: string | null,
  maxResults = 8
): Promise<ClinicalTrial[]> {
  const safeQuery = sanitizeQueryFE(query) || (cancerType ? '' : 'cancer');
  const safeCancerType = (cancerType || '').slice(0, 120); // bounded
  const params = new URLSearchParams({
    query: safeQuery,
    max_results: String(maxResults),
  });
  if (safeCancerType) params.set('cancer_type', safeCancerType);

  try {
    const res = await apiFetch(`/cds/trials?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const trials = Array.isArray(data?.trials) ? data.trials : [];
    // Normalize fields — backend uses "summary" + "interventions", map to our shape.
    return trials.map((t: Record<string, unknown>): ClinicalTrial => ({
      nct_id: String(t.nct_id || ''),
      title: String(t.title || ''),
      phase: t.phase ? String(t.phase) : undefined,
      status: t.status ? String(t.status) : undefined,
      conditions: Array.isArray(t.conditions) ? (t.conditions as string[]) : undefined,
      url: t.nct_id ? `https://clinicaltrials.gov/study/${t.nct_id}` : undefined,
      brief_summary: typeof t.summary === 'string'
        ? (t.summary as string).replace(/\\\*/g, '').slice(0, 600)
        : undefined,
    }));
  } catch {
    return [];
  }
}

/** POST /cds/query — best-effort. Returns null on timeout / empty / error. */
export async function getCdsDecision(
  query: string,
  cancerType?: string | null,
  stage?: string | null,
  timeoutMs = 90000
): Promise<CdsResponse | null> {
  const body: Record<string, unknown> = {
    query,
    include_guidelines: true,
    include_trials: true,
    include_nccn: true,
    max_pubmed_results: 5,
  };
  if (cancerType) body.cancer_type = cancerType;
  if (stage) body.stage = stage;

  const data = await fetchJsonWithTimeout(
    `/cds/query`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  if (!data || typeof data !== 'object') return null;

  const d = data as Record<string, unknown>;
  return {
    recommendations: Array.isArray(d.recommendations)
      ? (d.recommendations as Recommendation[])
      : [],
    citations: Array.isArray(d.citations)
      ? (d.citations as Citation[])
      : Array.isArray(d.guidelines)
      ? (d.guidelines as Citation[])
      : [],
    clinical_trials: Array.isArray(d.clinical_trials)
      ? (d.clinical_trials as ClinicalTrial[])
      : Array.isArray(d.trials)
      ? (d.trials as ClinicalTrial[])
      : [],
    cancer_type: typeof d.cancer_type === 'string' ? d.cancer_type : undefined,
    stage: typeof d.stage === 'string' ? d.stage : undefined,
  };
}
