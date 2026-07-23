'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OncologyNote, CdsResponse, OutputFormat, CodingReport } from '@/lib/api';
import { decodeHtmlEntities } from '@/lib/clinicalText';
import type { ToxicityFinding } from '@/lib/ctcae';
import type { CodingResult } from '@/lib/coding';
import type { CodingDecision } from '@/lib/auth';
import ToxicityPanel from '@/components/ToxicityPanel';
import CodingPanel from '@/components/CodingPanel';
import BackendCodingPanel from '@/components/BackendCodingPanel';
import ThumbsFeedback from '@/components/ThumbsFeedback';

interface ResultsPanelProps {
  transcript: string;
  note: OncologyNote | null;
  cds: CdsResponse | null;
  outputFormat: OutputFormat;
  previousNote: string;
  toxicities: ToxicityFinding[];
  enableCTCAE: boolean;
  coding: CodingResult | null;
  enableCoding: boolean;
  loading: boolean;
  loadingStage: string;
  error: string | null;
  onClose: () => void;
  /** Re-run note generation from the transcript already in the workspace.
   *  Shown in the error card so a provider hiccup (credit exhaustion,
   *  overload) never forces a re-record. */
  onRetryNote?: () => void;
  /** Triggered when user clicks "Match Clinical Trials" under the note. */
  onMatchTrials: () => void;
  trialsLoading: boolean;
  trialsRequested: boolean;
  /** Encounter row id from /encounters — used to tie feedback back to a specific note. Null until save completes. */
  savedEncounterId?: string | null;
  // Backend Coding Intelligence (POST /coding/analyze) — separate from the
  // instant client-side `coding` heuristic above.
  backendCoding: CodingReport | null;
  backendCodingLoading: boolean;
  backendCodingError: string | null;
  backendCodingStale: boolean;
  totalTimeMinutes: number | null;
  onTotalTimeMinutesChange: (v: number | null) => void;
  placeOfService: string;
  onPlaceOfServiceChange: (v: string) => void;
  onRecalculateCoding: () => void;
  codingDecisions: Record<string, CodingDecision>;
  onCodingDecisionsChange: (decisions: Record<string, CodingDecision>) => void;
}

const NOT_DOCUMENTED = 'Not documented in encounter.';

const sourceBadgeColor = (source: string): string => {
  const s = (source || '').toUpperCase();
  if (s.includes('NCCN')) return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s.includes('ESMO')) return 'bg-purple-100 text-purple-800 border-purple-200';
  if (s.includes('ASCO')) return 'bg-green-100 text-green-800 border-green-200';
  if (s.includes('NEJM')) return 'bg-rose-100 text-rose-800 border-rose-200';
  if (s.includes('IMWG')) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (s.includes('IMF')) return 'bg-teal-100 text-teal-800 border-teal-200';
  if (s.includes('ASH')) return 'bg-red-100 text-red-800 border-red-200';
  if (s.includes('IWG')) return 'bg-cyan-100 text-cyan-800 border-cyan-200';
  if (s.includes('CHEST')) return 'bg-slate-100 text-slate-800 border-slate-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
};

const FORMAT_TITLE: Record<OutputFormat, string> = {
  'History and Physical': 'History and Physical',
  Consultation: 'Consultation Note',
  'Follow Up Note': 'Follow Up Note',
  'Assessment and Plan Only': 'Assessment and Plan',
};

const buildOncologicHistory = (note: OncologyNote): string => {
  const parts: string[] = [];
  if (note.cancer_type) parts.push(note.cancer_type);
  if (note.tnm_stage) parts.push(note.tnm_stage);
  if (note.ecog_status) parts.push(note.ecog_status);
  return parts.length ? parts.join(' · ') : '';
};

interface Section {
  label: string;
  value: string;
  /** When true and previousNote is set, highlight as "new vs. previous". */
  trackChanges?: boolean;
}

/** Build the ordered section list for the chosen format. */
function buildSections(note: OncologyNote, format: OutputFormat): Section[] {
  const oncoHx = buildOncologicHistory(note);

  switch (format) {
    case 'History and Physical':
      return [
        { label: 'Chief Complaint', value: note.chief_complaint || '' },
        { label: 'History of Present Illness', value: note.history_present_illness || '' },
        { label: 'Prior Oncologic Therapy', value: note.prior_oncologic_therapy || '' },
        { label: 'Past Medical History', value: '' },
        { label: 'Past Surgical History', value: '' },
        { label: 'Medications', value: note.current_medications || '' },
        { label: 'Allergies', value: note.allergies || '' },
        { label: 'Family History', value: '' },
        { label: 'Social History', value: '' },
        { label: 'Review of Systems', value: '' },
        { label: 'Physical Examination', value: note.physical_examination || '' },
        { label: 'Laboratory Data / Imaging', value: note.lab_imaging_review || '' },
        { label: 'Assessment', value: note.assessment || '' },
        { label: 'Plan', value: note.plan || '' },
      ];

    case 'Consultation':
      return [
        { label: 'Reason for Consultation', value: note.chief_complaint || '' },
        { label: 'Referring Provider', value: '' },
        { label: 'History of Present Illness', value: note.history_present_illness || '' },
        { label: 'Oncologic History', value: oncoHx },
        { label: 'Prior Oncologic Therapy', value: note.prior_oncologic_therapy || '' },
        { label: 'Relevant Labs / Imaging', value: note.lab_imaging_review || '' },
        { label: 'Assessment', value: note.assessment || '' },
        { label: 'Recommendations / Plan', value: note.plan || '' },
        { label: 'Follow-up', value: note.follow_up || '' },
      ];

    case 'Follow Up Note':
      // Follow Up Note has a dedicated template renderer below — this
      // return is only used by legacy code paths (fallback) and by the
      // serializer. The renderer path in the JSX uses the template
      // directly with structured extraction.
      return [];

    case 'Assessment and Plan Only':
      // Don't render via the standard section list — handled separately
      return [];
  }
}

/** Split a multi-problem A/P into discrete problem blocks. */
interface ProblemBlock {
  title: string;
  assessment: string;
  plan: string;
}

// Numbering patterns we recognize:
// - "1.", "1)", "1:" at start of line
// - "Problem 1:", "Problem #1"
// - "#1", "#2"
// - "(1)"
const PROBLEM_NUMBERING = /(?:^|\n)\s*(?:problem\s*#?\s*|#)?\(?(\d+)[.):\s]+/gi;

/**
 * Split a free-text body into numbered problem chunks.
 * Returns array of {n, body} where n is the detected problem number.
 */
function splitNumberedProblems(text: string): { n: number; body: string }[] {
  if (!text) return [];

  // Find all numbering anchor positions
  const anchors: { idx: number; n: number; matchLen: number }[] = [];
  const re = new RegExp(PROBLEM_NUMBERING.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    anchors.push({ idx: m.index, n: parseInt(m[1], 10), matchLen: m[0].length });
  }

  // Need at least 2 distinct sequential numbers to call this a numbered list
  if (anchors.length < 2) return [];
  const numbers = anchors.map((a) => a.n);
  const looksSequential = numbers.every((v, i) => i === 0 || v === numbers[i - 1] + 1 || v === numbers[i - 1]);
  if (!looksSequential) return [];

  const blocks: { n: number; body: string }[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].idx + anchors[i].matchLen;
    const end = i + 1 < anchors.length ? anchors[i + 1].idx : text.length;
    const body = text.slice(start, end).trim();
    if (body) blocks.push({ n: anchors[i].n, body });
  }
  return blocks;
}

function buildProblemBlocks(note: OncologyNote): ProblemBlock[] {
  const oncoHx = buildOncologicHistory(note) || note.cancer_type || 'Oncologic problem';
  const assessment = note.assessment?.trim() || '';
  const plan = note.plan?.trim() || '';
  if (!assessment && !plan) return [];

  const aChunks = splitNumberedProblems(assessment);
  const pChunks = splitNumberedProblems(plan);

  // Single-problem fallback if nothing was detected
  if (aChunks.length === 0 && pChunks.length === 0) {
    return [{ title: oncoHx, assessment, plan }];
  }

  // Index by detected problem number for accurate pairing
  const aByNum = new Map(aChunks.map((c) => [c.n, c.body]));
  const pByNum = new Map(pChunks.map((c) => [c.n, c.body]));
  const allNums = Array.from(new Set([...aByNum.keys(), ...pByNum.keys()])).sort(
    (a, b) => a - b
  );

  return allNums.map((n, i) => ({
    title: i === 0 ? oncoHx : `Problem ${n}`,
    assessment: aByNum.get(n) || '',
    plan: pByNum.get(n) || '',
  }));
}

/** Heuristic "is this section content new vs. previous"? Used for Follow Up diff highlight. */
function isContentNew(value: string, previous: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v || v === NOT_DOCUMENTED.toLowerCase()) return false;
  const prev = previous.toLowerCase();
  // Compare meaningful sentences against previous note body
  const sentences = v.split(/[.!?]\s+/).filter((s) => s.length > 10);
  if (sentences.length === 0) return !prev.includes(v);
  return sentences.some((s) => !prev.includes(s));
}

// Header primitives for the Follow Up template
function H1({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-bold uppercase tracking-[0.08em] text-gray-900 mt-6 first:mt-0 pb-2 border-b-2 border-gray-200">
      {children}
    </h2>
  );
}
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[14px] font-semibold text-gray-900 mt-5">{children}</h3>
  );
}
function H3({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[13px] font-semibold text-gray-800 mt-4">{children}</h4>
  );
}
function KVList({ items }: { items: KeyVal[] }) {
  return (
    <ul className="mt-1.5 space-y-1">
      {items.map((it) => (
        <li key={it.label} className="text-[14px] leading-relaxed">
          <span className="font-semibold text-gray-900">{it.label}:</span>{' '}
          <span className={it.value === NOT_DOC ? 'text-gray-500 italic' : 'text-gray-900'}>
            {it.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
function BodyBlock({ text }: { text: string }) {
  if (!text || text === NOT_DOC) {
    return <p className="mt-1.5 text-[14px] italic text-gray-500">{NOT_DOC}</p>;
  }
  return (
    <div className="mt-1.5">
      <RichClinicalText text={text} />
    </div>
  );
}
function FollowUpNoteTemplate({
  note,
  codingRationale,
  codingVisitType,
  toxicities,
  previousNote,
}: {
  note: OncologyNote;
  codingRationale?: string;
  codingVisitType?: string;
  toxicities?: ToxicityFinding[];
  previousNote?: string;
}) {
  const m = buildFollowUpModel(note, codingRationale, previousNote);
  const onActiveTx = isOnActiveTreatment(note, codingVisitType);
  return (
    <div className="space-y-2 text-[14px] leading-[1.65] text-gray-900">
      {/* SUBJECTIVE / HPI */}
      <H1>Subjective</H1>

      <H2>Interval History:</H2>
      <BodyBlock text={m.intervalHistory} />

      <H2>Oncology / Hematology History</H2>

      <H3>Primary Diagnosis</H3>
      {m.dxLine && (
        <p className="mt-1 text-[14px] font-medium text-gray-900">{m.dxLine}</p>
      )}
      <KVList items={m.primaryDx} />

      <H3>Prior Therapy</H3>
      <div className="mt-1.5 border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-200">Date</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-200">Treatment</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700 border-b border-gray-200">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {m.priorTherapyRows.length > 0 ? (
              m.priorTherapyRows.map((r, i) => (
                <tr key={`${r.date}-${r.treatment}-${i}`} className={i > 0 ? 'border-t border-gray-100' : ''}>
                  <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{r.date || '—'}</td>
                  <td className="px-3 py-2 text-gray-900">{r.treatment || '—'}</td>
                  <td className="px-3 py-2 text-gray-800">{r.outcome || '—'}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-2 text-gray-500 italic" colSpan={3}>{m.priorTherapyRaw}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <H3>Laboratory Review</H3>
      <BodyBlock text={m.labsReview} />

      <H3>Imaging Review</H3>
      {m.imagingEntries.length > 0 ? (
        <ul className="mt-1.5 space-y-3">
          {m.imagingEntries.map((e, i) => (
            <li key={`${e.key}-${i}`} className="border-l-2 border-gray-200 pl-3">
              {/* Near-verbatim study line, e.g.
                  "MRI prostate w/wo contrast (05/02/25): Prostate 5.5 x 4.3 …"
                  — physicians want the study text as dictated, not a
                  recomposed date-first header (feedback 2026-07-09). */}
              <p className="text-[13.5px] text-gray-900 leading-relaxed">{e.raw}</p>
            </li>
          ))}
        </ul>
      ) : (
        <BodyBlock text={m.imagingReview} />
      )}

      <H3>Current Treatment</H3>
      <KVList items={m.currentTreatment} />

      {/* Tumor Markers appears only when markers were actually stated —
          an empty section is noise in a copied note (feedback 2026-07-10). */}
      {m.tumorMarkers !== NOT_DOC && (
        <>
          <H3>Tumor Markers</H3>
          <BodyBlock text={m.tumorMarkers} />
        </>
      )}

      {/* Pathology / Molecular Studies section removed per physician feedback —
          histology and biomarkers already live under Primary Diagnosis. */}

      {/* ASSESSMENT & PLAN */}
      <H1>Assessment and Plan</H1>
      <BodyBlock text={m.apSummary} />
      <H3>Plan</H3>
      <BodyBlock text={m.apPlan} />

      {/* Comorbid Conditions Affecting Oncology Care — sits right below the
          primary-dx Plan, per physician preference. Each condition on its
          own line; the associated management plan (if discussed) appears on
          the immediately following line. */}
      {m.comorbidityList.length > 0 && (
        <>
          <H3>Comorbid Conditions Affecting Oncology Care</H3>
          <ul className="mt-2 space-y-2">
            {m.comorbidityList.map((c) => (
              <li key={c.name}>
                <p className="text-[14px]">
                  <span className="font-medium text-gray-900">{c.name}</span>
                </p>
                <p
                  className={`text-[13px] leading-relaxed pl-5 ${
                    c.plan ? 'text-gray-800' : 'text-gray-500 italic'
                  }`}
                >
                  {c.plan || 'Management not discussed this encounter.'}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Chemotherapy / Treatment Toxicities — shown on active treatment,
          OR whenever gradable findings exist: an ongoing suspected irAE after
          treatment discontinuation still belongs in the note (feedback
          2026-07-10). Off-treatment with no findings → section omitted. */}
      {(onActiveTx || (toxicities && toxicities.length > 0)) && (
        <>
          <H2>Chemotherapy / Treatment Toxicities</H2>
          {toxicities && toxicities.length > 0 ? (
            <ul className="mt-2 space-y-3">
              {toxicities.map((t, i) => (
                <li key={`${t.toxicity}-${i}`} className="border-l-2 border-gray-200 pl-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-semibold text-gray-900">
                      {t.toxicity}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border whitespace-nowrap ${
                        t.expected
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : t.grade === 1
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : t.grade === 2
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : t.grade === 3
                          ? 'bg-orange-50 text-orange-800 border-orange-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {t.expected ? 'Expected' : `Grade ${t.grade}`}
                    </span>
                  </div>
                  {t.management && t.management.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Management
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {t.management.map((mg, j) => (
                          <li
                            key={j}
                            className="text-[13px] text-gray-800 leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400"
                          >
                            {mg}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[13px] italic text-gray-500">
              No CTCAE-gradable toxicities documented this encounter.
            </p>
          )}
        </>
      )}

      {/* Comorbid Conditions moved above (right below Primary Diagnosis Plan)
          per physician preference. */}

      {m.followUp && m.followUp !== NOT_DOC && (
        <>
          <H2>Next Follow-up</H2>
          <BodyBlock text={m.followUp} />
        </>
      )}

      {/* MDM removed from the note body per physician feedback — coding
          rationale stays available in the Coding Intelligence panel.
          The review attestation always closes the note; the clearance
          sentences are meaningful only on active treatment. */}
      <p className="mt-3 text-[13px] italic text-gray-700">
        Labs, imaging, and interval history reviewed.
        {onActiveTx
          ? ' Toxicities acceptable for treatment. Patient is cleared to proceed with treatment.'
          : isTreatmentHeld(note)
          ? ' Holding treatment.'
          : ''}
      </p>
    </div>
  );
}

// ─── Follow Up Note template ───────────────────────────────────────────────
//
// The follow-up format follows a strict oncology/heme template. Rather than
// rendering as generic section boxes, we build a nested structure with
// explicit "Not documented." fallbacks so the physician can see gaps at a
// glance. Fields the backend LLM populates are shown verbatim; missing
// fields show "Not documented." per the spec.

const NOT_DOC = 'Not documented.';

/** True if the string has clinically meaningful content. */
function has(v: string | null | undefined): boolean {
  return !!v && !!v.trim() && v.trim().toLowerCase() !== 'not documented in encounter.';
}
function or(v: string | null | undefined, fallback = NOT_DOC): string {
  return has(v) ? (v as string).trim() : fallback;
}

/** Best-effort extract of a value line matching a label from freeform text. */
function extractLabeled(text: string | undefined, ...labels: string[]): string {
  if (!text) return '';
  for (const label of labels) {
    const re = new RegExp(
      `${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*[:=]\\s*([^\\n\\r]+)`,
      'i',
    );
    const m = re.exec(text);
    if (m && m[1]) return m[1].trim().replace(/[,;.]$/, '');
  }
  return '';
}

/**
 * True when the encounter documents ACTIVE antineoplastic treatment.
 *
 * The clearance sentence ("Toxicities acceptable for treatment. Patient is
 * cleared to proceed with treatment.") is medically meaningful only when the
 * patient is on active systemic therapy. For surveillance encounters, MGUS
 * follow-up, non-malignant hematology, or workup visits, the sentence is
 * inappropriate and would misrepresent the clinical decision.
 *
 * Signals (any suffices):
 *   1. Coding engine already classified this visit as "Active treatment".
 *   2. Cytotoxic / IO / targeted agents are named in the note (name list
 *      mirrors the backend's active-treatment detector).
 *   3. Language like "on chemotherapy", "cycle N of ...", "continues
 *      immunotherapy" appears in the note.
 */
function isOnActiveTreatment(
  note: OncologyNote,
  codingVisitType?: string,
): boolean {
  const corpus = [
    note.current_medications,
    note.history_present_illness,
    note.assessment,
    note.plan,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!corpus.trim()) return codingVisitType === 'Active treatment';

  // Agent name list — same catalog as backend `detectActiveTreatment`
  const agentRegex =
    /\b(?:folfirinox|folfox|folfiri|xelox|capox|capecitabine|gemcitabine|carboplatin|cisplatin|oxaliplatin|paclitaxel|nab[- ]?paclitaxel|docetaxel|pemetrexed|etoposide|doxorubicin|liposomal\s+doxorubicin|epirubicin|cyclophosphamide|ifosfamide|topotecan|irinotecan|bendamustine|vincristine|vinorelbine|methotrexate|5[- ]?fu|fluorouracil|leucovorin|pembrolizumab|nivolumab|durvalumab|atezolizumab|avelumab|cemiplimab|ipilimumab|dostarlimab|osimertinib|erlotinib|gefitinib|afatinib|alectinib|crizotinib|lorlatinib|brigatinib|trastuzumab|pertuzumab|t[- ]?dm1|t[- ]?dxd|enhertu|kadcyla|sacituzumab|enfortumab|ramucirumab|bevacizumab|cetuximab|panitumumab|rituximab|obinutuzumab|polatuzumab|brentuximab|daratumumab|isatuximab|elotuzumab|lenalidomide|pomalidomide|bortezomib|carfilzomib|ixazomib|olaparib|niraparib|rucaparib|talazoparib|palbociclib|ribociclib|abemaciclib|encorafenib|dabrafenib|trametinib|selumetinib|selpercatinib|entrectinib|larotrectinib|sotorasib|adagrasib)\b/i;
  // An agent mention only counts when its own sentence documents the drug
  // being GIVEN. Field report 2026-07-09: "No indication for antiviral
  // therapy, rituximab, or oncologic intervention" — a drug named to rule it
  // OUT — rendered the treatment-clearance sentence on a surveillance note.
  // Sentences with negation / historical / hypothetical cues don't count;
  // genuinely active patients always also name the agent plainly (meds list,
  // "continue X", cycle language).
  const negationCues =
    /\b(?:no\s+indication|not\s+indicated|no\s+role|no\s+need|no\s+plan|without|rather\s+than|instead\s+of|declin\w*|defer\w*|consider\w*|discuss\w*|option\w*|candidate|eligib\w*|avoid\w*|hold\w*|held|discontinu\w*|stopp\w*|completed|finished|s\/p|status\s+post|prior|previous\w*|history\s+of|allerg\w*|intoleran\w*|failed|progress\w*\s+(?:on|through)|if\s+needed|future|eventual\w*|received|transitioned|last\s+dose|rechallenge)\b/i;
  for (const sentence of corpus.split(/(?<=[.!?])\s+|\n+/)) {
    if (agentRegex.test(sentence) && !negationCues.test(sentence)) return true;
  }

  // Language signals
  const languageRegex =
    /(?:on|active|continues\s+on|continues\s+with|started|starting|initiated|initiating)\s+(?:chemotherapy|chemo|immunotherapy|targeted\s+therapy|antineoplastic\s+therapy|systemic\s+therapy)|cycle\s+\d+|c\d+d\d+/i;
  if (languageRegex.test(corpus)) return true;

  // Coding-engine signal is a LAST resort, not a hard override: the coding
  // detector has no negation handling, so a "no indication for carboplatin"
  // surveillance note can be misclassified 'Active treatment' upstream and
  // (previously) short-circuited straight to the clearance sentence. Only
  // honor it when the note isn't explicitly describing off-treatment /
  // surveillance / held status.
  if (codingVisitType === 'Active treatment') {
    const offTreatment =
      /\b(?:surveillance|no\s+evidence\s+of\s+disease|\bned\b|off\s+(?:treatment|therapy)|no\s+(?:active|further|indication)|not\s+indicated|declin\w*|defer\w*|discontinu\w*|completed\s+(?:treatment|therapy|chemo\w*)|on\s+hold|holding|held)\b/i.test(
        corpus,
      );
    return !offTreatment;
  }

  return false;
}

/**
 * Treatment explicitly on hold ("Pembrolizumab - HELD", "continue to hold
 * pembrolizumab"). Distinct from plain off-treatment: the physician's
 * closing line reads "Holding treatment." for these encounters
 * (feedback 2026-07-10).
 */
function isTreatmentHeld(note: OncologyNote): boolean {
  const corpus = [note.current_medications, note.assessment, note.plan]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!corpus.trim()) return false;
  const THERAPY_WORD = String.raw`(?:[a-z]+(?:mab|nib)|chemo\w*|immunotherap\w*|radiation|treatment|therapy)`;
  const held = new RegExp(
    String.raw`\b(?:h[eo]ld(?:ing)?|on\s+hold)\b[^.;\n]{0,60}\b${THERAPY_WORD}\b` +
      '|' +
      String.raw`\b${THERAPY_WORD}\b[^.;\n]{0,40}\b(?:h[eo]ld(?:ing)?|on\s+hold)\b`,
    'i',
  );
  // Sentence-level with negation, mirroring isOnActiveTreatment: a plan like
  // "no need to hold therapy", "would hold pembrolizumab only if ANC <1000",
  // or "hold criteria not met" must NOT stamp "Holding treatment." on the note
  // (feedback 2026-07-10: the negation guard added to isOnActiveTreatment on
  // 2026-07-09 was never applied to this sibling).
  const heldNegation =
    /\b(?:no\s+(?:need|indication|plan|reason)|not\b|would\s+hold|only\s+if|criteria|if\s+(?:needed|worsen|develop)|consider\w*|may\s+hold|might\s+hold|do\s+not|don'?t)\b/i;
  for (const sentence of corpus.split(/(?<=[.!?])\s+|\n+/)) {
    if (held.test(sentence) && !heldNegation.test(sentence)) return true;
  }
  return false;
}

/**
 * Extract documented comorbid conditions from the note. Only real, named
 * comorbidities count — no inference. When a management plan for a given
 * condition is discussed in the plan/assessment, we attach it; otherwise
 * the plan line is left blank per spec.
 */
interface Comorbidity {
  name: string;
  plan: string;
}

const COMORBIDITY_CATALOG: { label: string; patterns: RegExp[] }[] = [
  { label: 'Hypertension',              patterns: [/\bhypertension\b/i, /\bhtn\b/i, /\bessential\s+hypertension\b/i] },
  { label: 'Diabetes mellitus',         patterns: [/\bdiabetes\s+mellitus\b/i, /\btype\s*2\s*diabetes\b/i, /\bt2dm\b/i, /\bdm2\b/i, /\b(?:iddm|niddm)\b/i] },
  { label: 'Coronary artery disease',   patterns: [/\bcoronary\s+artery\s+disease\b/i, /\bcad\b/i, /\bischemic\s+heart\s+disease\b/i] },
  { label: 'Chronic kidney disease',    patterns: [/\bchronic\s+kidney\s+disease\b/i, /\bckd\b/i, /\besrd\b/i, /\brenal\s+insufficiency\b/i] },
  { label: 'COPD',                      patterns: [/\bcopd\b/i, /\bchronic\s+obstructive\s+pulmonary\s+disease\b/i, /\bemphysema\b/i] },
  { label: 'Heart failure',             patterns: [/\bcongestive\s+heart\s+failure\b/i, /\bchf\b/i, /\bheart\s+failure\b/i, /\bhfr?ef\b/i, /\bhfpef\b/i] },
  { label: 'Atrial fibrillation',       patterns: [/\batrial\s+fibrillation\b/i, /\bafib\b/i, /\ba[- ]?fib\b/i] },
  { label: 'Chronic liver disease',     patterns: [/\bchronic\s+liver\s+disease\b/i, /\bcirrhosis\b/i, /\bnash\b/i, /\bnafld\b/i] },
  { label: 'Hyperlipidemia',            patterns: [/\bhyperlipidemia\b/i, /\bdyslipidemia\b/i, /\bhypercholesterolemia\b/i] },
  { label: 'Hypothyroidism',            patterns: [/\bhypothyroidism\b/i] },
  { label: 'Asthma',                    patterns: [/\basthma\b/i] },
  { label: 'GERD',                      patterns: [/\bgerd\b/i, /\bgastroesophageal\s+reflux\b/i] },
  { label: 'Osteoporosis',              patterns: [/\bosteoporosis\b/i] },
  { label: 'Obstructive sleep apnea',   patterns: [/\bosa\b/i, /\bobstructive\s+sleep\s+apnea\b/i] },
  { label: 'Depression',                patterns: [/\bmajor\s+depressive\s+disorder\b/i, /\bmdd\b/i, /\bdepression\b/i] },
  { label: 'Anxiety',                   patterns: [/\bgeneralized\s+anxiety\s+disorder\b/i, /\bgad\b/i, /\banxiety\s+disorder\b/i] },
];

// Contexts that indicate the comorbidity is NOT a real active problem: rule
// out, denies, no history of, family history only.
const COMORBIDITY_NEGATION: RegExp[] = [
  /\bno\s+(?:history\s+of|prior|known)\s+$/i,
  /\bdenies\s+$/i,
  /\brule\s+out\s+$/i,
  /\br\/o\s+$/i,
  /\bfamily\s+history\s+of\s+$/i,
  /\bfhx?\s+of\s+$/i,
  /\bfather\s+(?:has|had)\s+$/i,
  /\bmother\s+(?:has|had)\s+$/i,
];

function extractComorbidities(note: OncologyNote): Comorbidity[] {
  const corpus = [
    note.assessment,
    note.plan,
    note.history_present_illness,
    note.current_medications,
    note.chief_complaint,
  ]
    .filter(Boolean)
    .join('\n\n');
  if (!corpus.trim()) return [];

  const found: Comorbidity[] = [];
  const seen = new Set<string>();

  for (const entry of COMORBIDITY_CATALOG) {
    let matched = false;
    for (const p of entry.patterns) {
      const re = new RegExp(p.source, (p.flags.includes('g') ? p.flags : p.flags + 'g') + (p.flags.includes('i') ? '' : 'i'));
      let m: RegExpExecArray | null;
      while ((m = re.exec(corpus)) !== null) {
        // Skip negated / family-history / rule-out contexts
        const before = corpus.slice(Math.max(0, m.index - 60), m.index);
        if (COMORBIDITY_NEGATION.some((np) => np.test(before))) continue;
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (matched && !seen.has(entry.label)) {
      seen.add(entry.label);
      found.push({ name: entry.label, plan: extractComorbidityPlan(entry, note.plan || '') });
    }
  }
  return found;
}

/**
 * Best-effort: pick up a management plan for a comorbidity by scanning
 * the plan field. Looks for the condition name/abbreviation and returns
 * the sentence containing it, minus the name itself.
 */
function extractComorbidityPlan(
  entry: { label: string; patterns: RegExp[] },
  plan: string,
): string {
  if (!plan || !plan.trim()) return '';
  // Split plan into sentences (semi-lenient — clinical text is inconsistent).
  const sentences = plan
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of sentences) {
    if (entry.patterns.some((p) => new RegExp(p.source, p.flags.includes('i') ? p.flags : p.flags + 'i').test(s))) {
      // Trim leading numbering ("1.", "-", etc.)
      return s
        .replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '')
        .replace(/^(?:continue|manage|monitor|address)\s+/i, (m) => m)
        .trim();
    }
  }
  return '';
}

/**
 * Structured imaging entry parsed out of a note's imaging section.
 * Used to merge current + previous imaging chronologically without duplication.
 */
interface ImagingEntry {
  parsedDate: Date | null;
  dateDisplay: string;
  modality: string;
  body: string;
  findings: string;
  /** Near-verbatim study text — the display source. Recomposing entries from
   *  parsed pieces kept mangling them ("MRI prostate w/wo contrast ()" after
   *  the date was ripped out; findings truncated mid-measurement), so the
   *  parsed fields now serve only sorting/dedup. */
  raw: string;
  key: string;
}

// Modality detectors. Ambiguous short tokens (US, PET, ECHO) are matched
// CASE-SENSITIVELY as their medical uppercase forms so ordinary English words
// don't register as imaging: "follow up with us in 3 months" must NOT become
// an Ultrasound entry, "scratched by her pet" must NOT become a PET, and
// "echoes her concern" must NOT become an Echocardiogram (feedback 2026-07-10).
const IMAGING_MODALITIES: { canonical: string; re: RegExp }[] = [
  { canonical: 'PET/CT',             re: /\bpet[- /]?ct\b/i },
  { canonical: 'PET',                re: /\b(?:PET(?:\s+scan)?|pet\s+scan)\b/ },
  { canonical: 'CT',                 re: /\b(?:CT(?:\s+scan)?|ct\s+scan)\b/ },
  { canonical: 'MRI',                re: /\bMRI\b/i },
  { canonical: 'Bone scan',          re: /\bbone\s+scan\b/i },
  { canonical: 'X-ray',              re: /\bx[- ]?ray\b|\bchest\s+x[- ]?ray\b|\bcxr\b/i },
  { canonical: 'Ultrasound',         re: /\b[Uu]ltrasound\b|\bsonogram\b|\bU\/S\b|\bUS\b/ },
  { canonical: 'Mammogram',          re: /\bmammogr(?:am|aphy)\b/i },
  { canonical: 'Echocardiogram',     re: /\b[Ee]chocardiogram\b|\bTTE\b|\bTEE\b|\bECHO\b/ },
  // Procedures deliberately excluded (EGD, colonoscopy, bone marrow biopsy):
  // narrative discussion of a procedure ("I considered a bone marrow biopsy
  // as the platelet count…") is not an imaging study, and prior-note A&P
  // prose kept leaking into Imaging Review through these tokens.
];

// First-person procedure narration has no place in an imaging chronology —
// it comes from pasted prior procedure reports, not radiology results.
const NARRATION_SENTENCE =
  /(?:^|(?<=[.!?]\s))\s*(?:i|we)\s+(?:visualized|performed|advanced|withdrew|recommended|discussed|obtained|reviewed|took|passed|removed)\b[^.!?]*[.!?]?/gi;

function scrubNarration(text: string): string {
  return text.replace(NARRATION_SENTENCE, ' ').replace(/\s+/g, ' ').trim();
}

/** Sentence-split with decimal shielding ("Hb 9.4" stays one sentence). */
function splitSentencesShielded(text: string): string[] {
  const P = '․'; // one-dot leader shields decimals during the split
  const shielded = text.replace(/(\d)\.(\d)/g, `$1${P}$2`);
  const parts = shielded.match(/[^.!?\n]+[.!?]*\s*/g) || [shielded];
  return parts.map((s) => s.split(P).join('.').trim()).filter(Boolean);
}

/**
 * Separate laboratory prose from imaging findings in the combined
 * lab_imaging_review field of pre-2026-07-09 notes (newer notes arrive with
 * laboratory_review / imaging_review already split by the backend).
 * Sentence-level: a sentence naming an imaging modality (CT, PET, MRI, US,
 * bone scan, mammogram, echo, X-ray) is imaging; everything else is labs.
 * Imaging sentences are joined with blank lines so extractImagingEntries
 * chunks each study into its own entry.
 */
function splitLabsFromImaging(text: string): { labs: string; imaging: string } {
  if (!text || !text.trim()) return { labs: '', imaging: '' };
  const labs: string[] = [];
  const imaging: string[] = [];
  for (const s of splitSentencesShielded(text)) {
    (findModality(s) ? imaging : labs).push(s);
  }
  return { labs: labs.join(' ').trim(), imaging: imaging.join('\n\n').trim() };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseImagingDate(raw: string): { date: Date | null; display: string } {
  const s = raw.trim();
  if (!s) return { date: null, display: '' };
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { date: isNaN(d.getTime()) ? null : d, display: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` };
  }
  m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    return { date: isNaN(d.getTime()) ? null : d, display: `${m[1]}/${m[2]}/${year}` };
  }
  m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const d = new Date(Number(m[3]), month - 1, Number(m[2]));
    return {
      date: isNaN(d.getTime()) ? null : d,
      display: `${m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()} ${m[2]}, ${m[3]}`,
    };
  }
  return { date: null, display: '' };
}

function findModality(text: string): { canonical: string; matchLen: number; matchIdx: number } | null {
  for (const mod of IMAGING_MODALITIES) {
    const m = mod.re.exec(text);
    if (m) return { canonical: mod.canonical, matchLen: m[0].length, matchIdx: m.index };
  }
  return null;
}

/** Parse imaging entries out of freeform text. Splits on likely entry boundaries. */
function extractImagingEntries(text: string | undefined | null): ImagingEntry[] {
  if (!text || !text.trim()) return [];
  const src = text.trim();
  const out: ImagingEntry[] = [];

  const chunks = src
    .split(/\n\s*\n+|(?=\n\s*(?:[-•*]|(?:\d{1,2})[.)])\s+)|(?=\n\s*(?:pet[- /]?ct|ct|mri|pet|bone\s+scan|x[- ]?ray|ultrasound|mammogr|echo)\b)/im)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const mod = findModality(chunk);
    if (!mod) continue;
    const { date, display } = parseImagingDate(chunk);

    const afterMod = chunk.slice(mod.matchIdx + mod.matchLen, mod.matchIdx + mod.matchLen + 80);
    const bodyMatch = /^[\s:—-]*([a-z][a-z\s/,-]*?)(?:\s*(?:\d|showed|revealed|demonstrated|with|shows|impression|findings|[.:—-])|$)/i.exec(afterMod);
    const body = (bodyMatch?.[1] || '').trim().replace(/\s+/g, ' ').slice(0, 60);

    const modRe = IMAGING_MODALITIES.find((m) => m.canonical === mod.canonical)!.re;
    let findings = chunk
      .replace(/^\s*(?:[-•*]|(?:\d{1,2})[.)])\s+/, '')
      .replace(/(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i, '')
      .replace(modRe, '')
      .replace(/^[\s:—-]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body && findings.toLowerCase().startsWith(body.toLowerCase())) {
      findings = findings.slice(body.length).replace(/^[\s:—-]+/, '');
    }
    findings = scrubNarration(findings)
      // Drop an orphaned measurement fragment left dangling at a chunk
      // boundary, e.g. "…extension to left soft palate (3." — the full
      // measurement lives in the sibling entry.
      .replace(/\(\d+\.?\s*$/, '')
      .trim();

    const raw = scrubNarration(
      chunk.replace(/^\s*(?:[-•*]|(?:\d{1,2})[.)])\s+/, '').replace(/\s+/g, ' ').trim(),
    );

    out.push({
      parsedDate: date,
      dateDisplay: display,
      modality: mod.canonical,
      body,
      findings: findings.length > 400 ? findings.slice(0, 400) + '…' : findings,
      raw: raw.length > 2000 ? raw.slice(0, 2000) + '…' : raw,
      // Include body region (and a short findings fingerprint when undated) so
      // two undated same-modality studies don't collide and drop one — e.g.
      // "CT chest: stable" and "CT abdomen/pelvis: new hepatic lesion" both
      // keyed 'unknown|CT' silently lost the second (feedback 2026-07-10).
      key: [
        date ? date.toISOString().slice(0, 10) : (display || 'unknown'),
        mod.canonical,
        body.toLowerCase() || (date ? '' : raw.slice(0, 40).toLowerCase()),
      ].join('|'),
    });
  }
  return out;
}

function mergeImagingEntries(current: ImagingEntry[], previous: ImagingEntry[]): ImagingEntry[] {
  const seen = new Set<string>();
  const merged: ImagingEntry[] = [];
  for (const src of [current, previous]) {
    for (const e of src) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      merged.push(e);
    }
  }
  merged.sort((a, b) => {
    if (a.parsedDate && b.parsedDate) return a.parsedDate.getTime() - b.parsedDate.getTime();
    if (a.parsedDate) return -1;
    if (b.parsedDate) return 1;
    return 0;
  });
  return merged;
}

/** Pull biomarker mentions from note fields. */
const BIOMARKER_WANTED: Record<string, RegExp> = {
  EGFR: /\begfr\b/i,
  ALK: /\balk\b/i,
  ROS1: /\bros1\b/i,
  BRAF: /\bbraf\b/i,
  KRAS: /\bkras\b/i,
  NRAS: /\bnras\b/i,
  HER2: /\bher2\b/i,
  'PD-L1': /\bpd[- ]?l1\b/i,
  'MSI/MMR': /\b(?:msi|mmr|dmmr|mmrd)\b/i,
  BRCA: /\bbrca[12]?\b/i,
  HRD: /\bhrd\b/i,
  NTRK: /\bntrk\b/i,
  RET: /\bret\b/i,
  IHC: /\bihc\b/i,
  NGS: /\bngs\b/i,
};

function extractBiomarkerLineFromText(text: string): string {
  if (!text) return '';
  const parts: string[] = [];
  for (const [k, re] of Object.entries(BIOMARKER_WANTED)) {
    if (re.test(text)) parts.push(k);
  }
  return parts.length ? parts.join(' | ') : '';
}

function extractBiomarkerLine(note: OncologyNote): string {
  const corpus = [note.cancer_type, note.assessment, note.plan, note.history_present_illness]
    .filter(Boolean)
    .join(' ');
  return extractBiomarkerLineFromText(corpus);
}

/** Merge two "A | B | C" style biomarker lines, preserving order + deduping. */
function mergeBiomarkerLines(a: string, b: string): string {
  const set = new Set<string>();
  const out: string[] = [];
  for (const src of [a, b]) {
    if (!src) continue;
    for (const tok of src.split('|').map((s) => s.trim()).filter(Boolean)) {
      if (!set.has(tok.toLowerCase())) {
        set.add(tok.toLowerCase());
        out.push(tok);
      }
    }
  }
  return out.join(' | ');
}

interface KeyVal { label: string; value: string; }

/** Structured template for Follow Up Note — populated from OncologyNote fields. */
interface FollowUpModel {
  intervalHistory: string;
  dxLine: string;               // full primary-diagnosis sentence shown under the Primary Diagnosis header
  primaryDx: KeyVal[];
  priorTherapyRaw: string;      // placeholder shown when no structured rows exist
  priorTherapyRows: { date: string; treatment: string; outcome: string }[]; // from note.prior_oncologic_therapy
  labsReview: string;           // laboratory results only — split from imaging (feedback 2026-07-09)
  imagingReview: string;
  imagingEntries: ImagingEntry[];   // structured chronological entries (merged current + previous)
  currentTreatment: KeyVal[];
  tumorMarkers: string;
  apSummary: string;            // "Primary Oncology/Hematology Diagnosis" summary + plan
  apPlan: string;
  comorbidityList: Comorbidity[];       // structured list — the new rendering source
  followUp: string;
}

function buildFollowUpModel(
  note: OncologyNote,
  codingRationale?: string,
  previousNote?: string,
): FollowUpModel {
  // Decode HTML entities up front so the raw display surfaces (KVList values,
  // dxLine, prior-therapy cells, imaging bullets) never show literal "&#39;"
  // on screen. Those surfaces render note text directly, bypassing the
  // RichClinicalText display tier; the copy path decodes too, and the decoder
  // is idempotent, so decoding here is safe for both (feedback 2026-07-10).
  note = {
    ...note,
    history_present_illness: decodeHtmlEntities(note.history_present_illness || ''),
    assessment: decodeHtmlEntities(note.assessment || ''),
    plan: decodeHtmlEntities(note.plan || ''),
    current_medications: decodeHtmlEntities(note.current_medications || ''),
    lab_imaging_review: decodeHtmlEntities(note.lab_imaging_review || ''),
    laboratory_review: note.laboratory_review != null ? decodeHtmlEntities(note.laboratory_review) : note.laboratory_review,
    imaging_review: note.imaging_review != null ? decodeHtmlEntities(note.imaging_review) : note.imaging_review,
    prior_oncologic_therapy: note.prior_oncologic_therapy != null ? decodeHtmlEntities(note.prior_oncologic_therapy) : note.prior_oncologic_therapy,
    cancer_type: note.cancer_type != null ? decodeHtmlEntities(note.cancer_type) : note.cancer_type,
    follow_up: decodeHtmlEntities(note.follow_up || ''),
  };
  const hpi = or(note.history_present_illness);
  const asmt = or(note.assessment);
  const plan = or(note.plan);
  const labImg = or(note.lab_imaging_review);
  const meds = or(note.current_medications);
  const followUp = or(note.follow_up);

  // Labs vs imaging: the backend emits separate laboratory_review /
  // imaging_review fields since 2026-07-09. The heuristic sentence splitter is
  // ONLY for pre-split saved notes. It must be gated on note VINTAGE, not
  // field emptiness: the backend maps an empty split field to null, so a NEW
  // imaging-only note has laboratory_review=null — falling back to the
  // splitter there would re-misroute imaging narrative into Laboratory Review
  // (feedback 2026-07-10). A note is "split-aware" if EITHER split field is
  // present; then trust the split fields verbatim (empty is a real empty).
  const isSplitAware =
    note.laboratory_review != null || note.imaging_review != null;
  const legacySplit = isSplitAware
    ? { labs: '', imaging: '' }
    : splitLabsFromImaging(labImg === NOT_DOC ? '' : labImg);
  const labsText = (note.laboratory_review || '').trim() || legacySplit.labs;
  const imagingText = (note.imaging_review || '').trim() || legacySplit.imaging;

  // Primary diagnosis structured extraction — CURRENT note wins; falls back
  // to the previous note when the current field is missing (diagnosis details
  // don't change encounter-to-encounter, so pulling forward is the right
  // default and mirrors how physicians manually reconcile).
  const prev = previousNote?.trim() || '';
  const fallback = (curr: string, ...labels: string[]): string => {
    if (curr && curr !== NOT_DOC) return curr;
    if (!prev) return curr || NOT_DOC;
    const p = extractLabeled(prev, ...labels);
    return p || (curr || NOT_DOC);
  };

  const histology = fallback(
    extractLabeled(note.assessment + '\n' + note.cancer_type, 'Histology', 'Type'),
    'Histology',
    'Type',
  );
  const primarySite = fallback(
    extractLabeled(note.assessment + '\n' + note.cancer_type, 'Primary Site', 'Site'),
    'Primary Site',
    'Site',
  );
  const stage = fallback(
    or(note.tnm_stage) !== NOT_DOC
      ? (note.tnm_stage as string)
      : extractLabeled(note.assessment, 'Stage', 'TNM'),
    'Stage',
    'TNM',
    'TNM Stage',
  );
  const molProfileRaw = fallback(
    extractLabeled(note.assessment, 'Molecular Profile', 'Molecular'),
    'Molecular Profile',
    'Molecular',
    'NGS',
  );
  // Accept the extracted value only when it actually reads like molecular
  // data. A mislabeled line in a pasted prior note once landed "The prostate
  // measures 5.5 x 4.3 x 3.4 cm" here, and the prior-note fallback carried
  // it forward on every visit (feedback 2026-07-09).
  const MOLECULAR_VOCAB =
    /\b(?:egfr|alk|ros1|braf|kras|nras|her2|msi|mmr|dmmr|pmmr|tmb|pd-?l1|brca[12]?|atm|palb2|chek2|ntrk|ret|met|fgfr\d?|idh[12]|flt3|npm1|jak2|calr|mpl|tp53|sf3b1|asxl1|tet2|dnmt3a|runx1|del\(|inv\(|t\(\d|monosomy|trisomy|karyotype|ngs|next[- ]generation|mutation|mutated|wild[- ]?type|variant|amplif\w*|fusion|rearrang\w*|methylat\w*|exon\s*\d)\b/i;
  const molProfile =
    molProfileRaw !== NOT_DOC && MOLECULAR_VOCAB.test(molProfileRaw) ? molProfileRaw : NOT_DOC;

  // Biomarker line: union of biomarkers from current AND previous note so a
  // driver mutation documented last time still shows this time.
  const biomarkerCurrent = extractBiomarkerLine(note);
  const biomarkerPrev = prev ? extractBiomarkerLineFromText(prev) : '';
  const biomarkerLine = mergeBiomarkerLines(biomarkerCurrent, biomarkerPrev);

  // Diagnosis summary line + histology/site derived from the diagnosis
  // sentence itself when no labeled values exist ("Histology: …" is rare in
  // dictated notes; "squamous cell carcinoma of the left tonsil…" is not).
  const dxText = [note.cancer_type, note.assessment].filter(Boolean).join(' ');
  const dxLineRaw = has(note.cancer_type)
    ? (note.cancer_type as string).trim()
    : asmt !== NOT_DOC
    ? asmt.replace(/\*\*/g, '').split(/(?<=\.)\s+/)[0] || ''
    : '';
  const dxLine = dxLineRaw.replace(/\*\*/g, '').replace(/[\s.]+$/, '').slice(0, 220);
  const histologyGuess = (() => {
    const m =
      /\b(squamous cell carcinoma|adenocarcinoma|small[- ]cell (?:lung )?carcinoma|non[- ]small cell lung cancer|urothelial carcinoma|hepatocellular carcinoma|renal cell carcinoma|melanoma|osteosarcoma|leiomyosarcoma|sarcoma|diffuse large b[- ]cell lymphoma|follicular lymphoma|hodgkin lymphoma|lymphoma|multiple myeloma|carcinoma)\b/i.exec(
        dxText,
      );
    return m ? m[1][0].toUpperCase() + m[1].slice(1) : '';
  })();
  const siteGuess = (() => {
    const m =
      /\b(?:carcinoma|cancer|melanoma|sarcoma|lymphoma|tumor)\s+of\s+the\s+([^,.;()]{3,80}?)(?=,|\.|;|\s+with\s+|\s+status|$)/i.exec(
        dxText,
      );
    if (m) {
      const escaped = m[1].trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const ext = new RegExp(escaped + String.raw`\s+(with\s+extension\s+to\s+[^,.;()]{3,120})`, 'i').exec(dxText);
      const site = m[1].trim() + (ext ? ' ' + ext[1].trim() : '');
      return site[0].toUpperCase() + site.slice(1);
    }
    // Adjectival phrasing — "lung adenocarcinoma", "pancreatic cancer" —
    // is far more common in dictation than "carcinoma of the lung"
    // (feedback 2026-07-10: Primary Site sat at "Not documented" for a
    // lung adenocarcinoma).
    const adj =
      /\b(lung|breast|prostate|colorectal|colon|rectal|pancreatic|gastric|esophageal|renal|kidney|bladder|urothelial|ovarian|endometrial|uterine|cervical|hepatocellular|liver|biliary|gallbladder|thyroid|testicular|anal|tonsillar|oropharyngeal|laryngeal|nasopharyngeal|small\s+bowel)\b(?=[^.]{0,40}\b(?:adenocarcinoma|carcinoma|cancer|sarcoma|melanoma|tumor|neoplasm)\b)/i.exec(
        dxText,
      );
    if (!adj) return '';
    const nounFor: Record<string, string> = {
      pancreatic: 'Pancreas', gastric: 'Stomach', esophageal: 'Esophagus',
      renal: 'Kidney', hepatocellular: 'Liver', colorectal: 'Colorectum',
      rectal: 'Rectum', cervical: 'Cervix', endometrial: 'Endometrium',
      uterine: 'Uterus', ovarian: 'Ovary', tonsillar: 'Tonsil',
      oropharyngeal: 'Oropharynx', laryngeal: 'Larynx',
      nasopharyngeal: 'Nasopharynx', testicular: 'Testis',
      urothelial: 'Bladder/urothelium', biliary: 'Biliary tract', anal: 'Anus',
    };
    const w = adj[1].toLowerCase().replace(/\s+/g, ' ');
    return nounFor[w] || w[0].toUpperCase() + w.slice(1);
  })();

  // Current treatment.
  // The note emits medications as "Category: value | Category: value" —
  // parse that into rows verbatim so "Chemotherapy: None" stays None and
  // externally administered hormonal therapy stays labeled as what it is,
  // rather than being promoted to "Regimen" (which physicians read as
  // active antineoplastic treatment).
  const noneish = (v: string) => /^(?:none\b|n\/a\b|not\s+on\b|no\s+active\b|nil\b)/i.test(v.trim());
  const medsKv: KeyVal[] = [];
  if (meds !== NOT_DOC && /\w\s*:\s*\S/.test(meds)) {
    for (const seg of meds.split(/\s*\|\s*/)) {
      const mm = /^([A-Za-z][A-Za-z /()-]{2,40}?)\s*:\s*(.+)$/.exec(seg.trim());
      if (mm) medsKv.push({ label: mm[1].trim(), value: mm[2].trim() });
    }
  }
  const regimenRaw = extractLabeled(note.plan ?? '', 'Regimen');
  const regimen = regimenRaw && !noneish(regimenRaw) ? regimenRaw : '';
  const cycle = extractLabeled(note.plan + '\n' + note.history_present_illness, 'Cycle', 'Cycle #');
  const intent = extractLabeled(note.plan + '\n' + note.assessment, 'Intent', 'Treatment intent');
  const startDate = extractLabeled(note.plan + '\n' + note.history_present_illness, 'Start Date', 'Initiated', 'Started');

  return {
    intervalHistory: hpi,
    dxLine,
    primaryDx: (() => {
      // fallback() returns the literal NOT_DOC string, which is truthy — it
      // was short-circuiting the derivation guesses, leaving "Histology:
      // Not documented." on a note whose dx line said "lung adenocarcinoma"
      // (feedback 2026-07-10). Treat NOT_DOC as empty before falling back.
      const real = (v: string) => (v && v !== NOT_DOC ? v : '');
      return [
        { label: 'Histology', value: real(histology) || histologyGuess || (has(note.cancer_type) ? note.cancer_type!.split(',')[0].trim() : NOT_DOC) },
        { label: 'Primary Site', value: real(primarySite) || siteGuess || NOT_DOC },
        { label: 'Stage', value: real(stage) || NOT_DOC },
        { label: 'Biomarkers', value: biomarkerLine || NOT_DOC },
        // Molecular data is usually dictated as a biomarker ("KRAS G12C-
        // mutated") — mirror it here rather than showing Not documented.
        { label: 'Molecular Profile', value: real(molProfile) || biomarkerLine || NOT_DOC },
      ];
    })(),
    priorTherapyRaw: NOT_DOC,
    // "date | treatment | outcome" lines from the backend (≥2026-07-10).
    priorTherapyRows: (note.prior_oncologic_therapy || '')
      .split('\n')
      .map((l) => l.trim().replace(/^[-•*]\s*/, ''))
      .filter(Boolean)
      .map((l) => {
        const [date = '', treatment = '', outcome = ''] = l.split('|').map((c) => c.trim());
        return { date, treatment, outcome };
      })
      .filter((r) => r.treatment || r.date),
    labsReview: labsText || NOT_DOC,
    imagingReview: imagingText || NOT_DOC,
    imagingEntries: mergeImagingEntries(
      extractImagingEntries(imagingText || note.assessment || ''),
      extractImagingEntries(prev),
    ),
    currentTreatment: medsKv.length > 0
      ? medsKv
      : [
          { label: 'Regimen', value: regimen || NOT_DOC },
          { label: 'Cycle', value: cycle || NOT_DOC },
          { label: 'Intent', value: intent || NOT_DOC },
          { label: 'Start Date', value: startDate || NOT_DOC },
        ],
    // Only the sentences that actually state a marker — dumping the whole
    // lab blob here duplicated Laboratory Review wholesale (feedback
    // 2026-07-09: this section should have read just "PSA 4.5"). Sourced
    // from labs only, so "PSA density" inside an MRI report doesn't qualify.
    tumorMarkers: (() => {
      const MARKER_RE =
        /\b(?:cea|ca[- ]?19[- ]?9|ca[- ]?125|ca[- ]?15[- ]?3|ca[- ]?27[-. ]?29|psa|afp|β?[- ]?hcg|b-?hcg|ldh|ctdna|chromogranin|5[- ]?hiaa|m[- ]?protein|free\s+light\s+chains?|thyroglobulin|calcitonin)\b/i;
      const hits = splitSentencesShielded(labsText).filter((s) => MARKER_RE.test(s));
      return hits.length > 0 ? hits.join(' ') : NOT_DOC;
    })(),
    apSummary: asmt,
    apPlan: plan,
    comorbidityList: extractComorbidities(note),
    followUp: followUp,
  };
}

/**
 * Sanitize text for copy/paste into EHRs, Word, etc.
 *
 * Two passes:
 *  1. Decode any HTML entities that snuck in from upstream (e.g., LLM output
 *     of "&#39;" instead of "'"). Handles numeric (&#NN;), hex (&#xHH;),
 *     and the common named entities.
 *  2. Replace Unicode characters that some clipboards/editors re-encode as
 *     HTML entities (smart quotes, em/en dashes, ellipsis, bullets, non-
 *     breaking space) with their ASCII-safe equivalents — so the user never
 *     sees "&#8217;" or "&#8212;" in their pasted note.
 *
 * Split into two tiers (physician request 2026-07-09): the on-screen
 * renderer stops after passes 1–2 so "ng/mL²" and "β-hCG" stay pretty in
 * the app; only the Copy button's output goes through the final
 * ASCII-only pass 3.
 */
function normalizeClinicalText(input: string): string {
  if (!input) return '';
  // Pass 1 — decode entities the upstream might have emitted (shared util;
  // also applied when a prior note is pasted in, so entities never reach
  // the LLM or the rendered note).
  let s = decodeHtmlEntities(input);

  // Pass 2 — normalize "smart" Unicode that clipboards re-entity-encode.
  s = s
    .replace(/[‘’‚‛]/g, "'")   // 'smart' single quotes → '
    .replace(/[“”„‟]/g, '"')   // "smart" double quotes → "
    .replace(/[–—―]/g, '-')         // en/em dash → -
    .replace(/…/g, '...')                     // ellipsis → ...
    .replace(/[•·]/g, '-')               // bullet / middle dot → -
    .replace(/ /g, ' ')                       // nbsp → regular space
    .replace(/[​-‍﻿]/g, '');        // zero-width junk → strip


  return s;
}

/** Copy-path sanitizer: normalizeClinicalText plus a final ASCII-only pass
 *  so EHR editors can't entity-encode anything in the paste. */
function sanitizeForClipboard(input: string): string {
  if (!input) return '';
  let s = normalizeClinicalText(input);

  // Pass 3 — transliterate everything still non-ASCII to EHR-safe ASCII.
  // Some EHR editors entity-encode ANY non-ASCII character on paste:
  // "ng/mL²" arrived in the chart as "ng/mL&#178;" (field report
  // 2026-07-09). After this pass the text is pure printable ASCII, so
  // there is nothing left for an EHR to entity-encode. Clinical symbols
  // get readable spellings rather than being dropped.
  s = s
    .replace(/[µμ]/g, 'u')
    .replace(/±/g, '+/-')
    .replace(/[×✕]/g, 'x')
    .replace(/÷/g, '/')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/≠/g, '!=')
    .replace(/[→⇒]/g, '->')
    .replace(/[←⇐]/g, '<-')
    .replace(/°/g, '')
    .replace(/α/g, 'alpha')
    .replace(/β/g, 'beta')
    .replace(/γ/g, 'gamma')
    .replace(/[δΔ]/g, 'delta')
    .replace(/κ/g, 'kappa')
    .replace(/λ/g, 'lambda');
  // NFKD decomposes the long tail (² → 2, ½ → 1⁄2, ligatures, full-width
  // forms, accented letters); strip combining marks, fix the fraction
  // slash, then drop anything that still isn't printable ASCII.
  s = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2044/g, '/')
    .replace(/[^\x20-\x7E\n\t]/g, '');

  return s;
}

/** Plain-text serialization of the structured note, for copy + download. */
function serializeNote(
  note: OncologyNote,
  format: OutputFormat,
  sections: Section[],
  problemBlocks: ProblemBlock[],
  codingVisitType?: string,
  toxicities?: ToxicityFinding[],
  previousNote?: string,
): string {
  const header = FORMAT_TITLE[format].toUpperCase();
  const meta = [
    note.note_id ? `Note ID: ${note.note_id}` : '',
    note.created_at ? `Created: ${new Date(note.created_at).toLocaleString()}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  // No ===== / ----- separator rows anywhere: pasted EHR text must be clean
  // prose, and receiving editors render dash runs as horizontal rules.
  const lines: string[] = [header];
  if (meta) lines.push('', meta);
  lines.push('');

  if (format === 'Assessment and Plan Only') {
    problemBlocks.forEach((b, i) => {
      lines.push(`Problem ${i + 1}: ${b.title}`);
      lines.push('Assessment:');
      lines.push(b.assessment || NOT_DOCUMENTED);
      lines.push('');
      lines.push('Plan:');
      lines.push(b.plan || NOT_DOCUMENTED);
      lines.push('');
    });
  } else if (format === 'Follow Up Note') {
    const m = buildFollowUpModel(note, undefined, previousNote);
    const push = (s: string) => lines.push(s);
    const rule = (s: string) => push(`\n${s.toUpperCase()}`);
    const sub = (s: string) => push(`\n${s}`);
    const kv = (items: KeyVal[]) => items.forEach((it) => push(`${it.label}: ${it.value}`));

    rule('Subjective');
    sub('Interval History:');
    push(m.intervalHistory || NOT_DOC);

    sub('Oncology / Hematology History');

    push('\nPrimary Diagnosis' + (m.dxLine ? `- ${m.dxLine}` : ''));
    kv(m.primaryDx);

    push('\nPrior Therapy');
    push('| Date | Treatment | Outcome |');
    push('| ---- | --------- | ------- |');
    if (m.priorTherapyRows.length > 0) {
      m.priorTherapyRows.forEach((r) =>
        push(`| ${r.date || '-'} | ${r.treatment || '-'} | ${r.outcome || '-'} |`),
      );
    } else {
      push(`| ${NOT_DOC} | | |`);
    }

    push('\nLaboratory Review');
    push(m.labsReview || NOT_DOC);

    push('\nImaging Review');
    if (m.imagingEntries.length > 0) {
      for (const e of m.imagingEntries) {
        push(`- ${e.raw}`);
      }
    } else {
      push(m.imagingReview || NOT_DOC);
    }

    push('\nCurrent Treatment');
    kv(m.currentTreatment);

    if (m.tumorMarkers && m.tumorMarkers !== NOT_DOC) {
      push('\nTumor Markers');
      push(m.tumorMarkers);
    }

    rule('Assessment and Plan');
    push(m.apSummary || NOT_DOC);
    push('\nPlan');
    push(m.apPlan || NOT_DOC);

    // Comorbid Conditions — placed right below the primary-dx Plan.
    // Each condition on its own line; plan on the following line.
    if (m.comorbidityList.length > 0) {
      push('\nComorbid Conditions Affecting Oncology Care');
      m.comorbidityList.forEach((c) => {
        push(`- ${c.name}`);
        push(`  ${c.plan || 'Management not discussed this encounter.'}`);
      });
    }

    // Chemotherapy / Treatment Toxicities — active treatment, or any
    // gradable findings (ongoing irAE after discontinuation still belongs).
    if (isOnActiveTreatment(note, codingVisitType) || (toxicities && toxicities.length > 0)) {
      sub('Chemotherapy / Treatment Toxicities');
      if (toxicities && toxicities.length > 0) {
        toxicities.forEach((t) => {
          push(`- ${t.toxicity} — ${t.expected ? 'Expected' : `Grade ${t.grade}`}`);
          if (t.management && t.management.length > 0) {
            push('  Management:');
            t.management.forEach((mg) => push(`    • ${mg}`));
          }
        });
      } else {
        push('No CTCAE-gradable toxicities documented this encounter.');
      }
    }

    if (m.followUp && m.followUp !== NOT_DOC) {
      sub('Next Follow-up');
      push(m.followUp);
    }

    // MDM removed from the note body per physician feedback — coding
    // rationale stays available in the Coding Intelligence panel.
    // The review attestation always closes the note; the clearance sentences
    // are appended only when the patient is on active treatment.
    push(
      '\nLabs, imaging, and interval history reviewed.' +
        (isOnActiveTreatment(note, codingVisitType)
          ? ' Toxicities acceptable for treatment. Patient is cleared to proceed with treatment.'
          : isTreatmentHeld(note)
          ? ' Holding treatment.'
          : '')
    );
  } else {
    sections.forEach((s) => {
      lines.push(s.label.toUpperCase());
      lines.push(s.value || NOT_DOCUMENTED);
      lines.push('');
    });
  }

  // Strip markdown bold markers the LLM emits for A&P diagnosis headers —
  // they render as literal asterisks when pasted into an EHR.
  const plain = lines
    .join('\n')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*/g, '')
    .trim();
  return sanitizeForClipboard(plain);
}

/**
 * Pre-process a dense clinical text blob into rendered structure.
 * Most LLM/EHR output arrives as a single paragraph with inline numbering
 * ("1. Do X. 2. Do Y.") or inline section labels ("Status: ... Toxicity: ...").
 * We inject structure before paragraph splitting so the renderer can build
 * proper lists + spaced paragraphs.
 */
function preprocessClinicalText(input: string): string {
  // Normalize entities + smart quotes / em-dashes / bullets for display,
  // but deliberately NOT the ASCII-only pass — on screen "ng/mL²" and
  // "β-hCG" stay pretty (physician request 2026-07-09). The Copy button
  // output goes through sanitizeForClipboard, which adds that pass; text
  // selected manually and Cmd+C'd carries the Unicode with it.
  let text = normalizeClinicalText(input);

  // 1) Convert inline numbered lists (e.g. ". 2. Continue X") into
  //    newline-prefixed list items, so subsequent paragraph split treats them
  //    as a list. Tight anchors — the item number must follow sentence-ending
  //    punctuation AND be followed by a capitalized clause. A bare mid-
  //    sentence "…July 8. Okay" or "measuring 1.2 cm" must never split.
  if (/\b1[.)]\s/.test(text) && /\b2[.)]\s/.test(text)) {
    text = text.replace(/([.!?;:])\s+(\d{1,2}[.)])\s+(?=[A-Z(])/g, '$1\n$2 ');
    // Ensure the first item also starts on its own line if it's mid-paragraph
    text = text.replace(/([^\n])(^|\s)(1[.)]\s)(?=[A-Z(])/m, '$1\n$3');
  }

  // 2) Convert inline section labels like "Status:", "Toxicity:",
  //    "Treatment response:", "Primary Diagnosis:" into paragraph breaks.
  //    Heuristic: a capitalized word phrase (1-3 words) followed by colon,
  //    preceded by ". " (end of previous sentence) → break to a new paragraph.
  text = text.replace(
    /\.\s+(?=(?:[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+){0,2})\s*:)/g,
    '.\n\n'
  );

  // 3) Collapse triple+ blank lines → double, and trim trailing whitespace per line
  text = text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  // 4) Split long unstructured paragraphs (e.g., HPI from the LLM) into
  //    smaller paragraphs every ~2 sentences. Improves scannability without
  //    losing meaning. Only applied to paragraphs >300 chars with no inline
  //    structure (no labels, no bullets, no numbering).
  text = text
    .split(/\n\s*\n+/)
    .map((p) => {
      const trimmed = p.trim();
      if (trimmed.length <= 300) return trimmed;
      if (/^[-•*]\s+/m.test(trimmed)) return trimmed;
      if (/^\(?\d+[.)]\s+/m.test(trimmed)) return trimmed;
      // Don't split a paragraph that's already a "Label:" lead-in (kept compact)
      if (/^[A-Z][A-Za-z ]{1,40}:\s+/.test(trimmed)) return trimmed;

      // Split into sentences and regroup every 2 sentences. Protect decimals
      // ("1.2 cm") and title abbreviations ("Dr. Qualey") so a period inside
      // them never starts a new sentence.
      const PROTECT = '․'; // one-dot leader stands in for a protected "."
      const shielded = trimmed
        .replace(/(\d)\.(\d)/g, `$1${PROTECT}$2`)
        .replace(/\b(Dr|Mr|Mrs|Ms|Prof|St|vs|etc|approx|Fig|No)\.(?=\s)/g, `$1${PROTECT}`);
      const sentences = shielded.match(/[^.!?]+[.!?]+["')\]]*(?:\s+|$)/g);
      if (!sentences || sentences.length < 4) return trimmed;
      const chunks: string[] = [];
      for (let i = 0; i < sentences.length; i += 2) {
        chunks.push(
          sentences.slice(i, i + 2).join('').trim().replaceAll(PROTECT, '.'),
        );
      }
      return chunks.join('\n\n');
    })
    .join('\n\n');

  return text;
}

/**
 * Render a clinical free-text block with structure preserved:
 *  - Inline "1. ... 2. ..." → ordered list with line breaks per item
 *  - Inline "Label:" markers → new paragraphs with bold lead-in
 *  - Lines starting with `-`, `•`, `*` → bullet lists
 *  - **label:** prefixes → bold lead-in
 * Keeps copy/paste from EHR/dictation tools intact.
 */
const RichClinicalText = ({ text }: { text: string }) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return <p className="text-sm text-gray-500 italic">{NOT_DOCUMENTED}</p>;

  const normalized = preprocessClinicalText(trimmed);
  const paragraphs = normalized.split(/\n\s*\n+/).filter((p) => p.trim());

  return (
    <div className="space-y-4 md:space-y-5 text-[15px] leading-[1.65] text-gray-900">
      {paragraphs.map((para, pi) => {
        const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
        const isBulletList = lines.length > 1 && lines.every((l) => /^[-•*]\s+/.test(l));
        const isOrderedList =
          lines.length > 1 && lines.every((l) => /^\(?\d+[.)]\s+/.test(l));

        if (isBulletList) {
          return (
            <ul key={pi} className="list-disc pl-5 space-y-2.5 marker:text-gray-400">
              {lines.map((l, li) => (
                <li key={li} className="pl-1 leading-[1.65]">
                  {renderInline(l.replace(/^[-•*]\s+/, ''))}
                </li>
              ))}
            </ul>
          );
        }
        if (isOrderedList) {
          // Render numbered items with their own numbers preserved.
          return (
            <ul key={pi} className="list-none pl-0 space-y-2.5">
              {lines.map((l, li) => {
                const numMatch = /^\(?(\d+)[.)]\s+/.exec(l);
                const num = numMatch ? numMatch[1] : String(li + 1);
                return (
                  <li key={li} className="flex gap-2.5 leading-[1.65]">
                    <span className="font-semibold text-gray-900 flex-shrink-0 select-none">
                      {num}.
                    </span>
                    <span className="flex-1 min-w-0">
                      {renderInline(l.replace(/^\(?\d+[.)]\s+/, ''))}
                    </span>
                  </li>
                );
              })}
            </ul>
          );
        }

        // Paragraph: detect a leading "Label:" and bold it
        const labelMatch = para.match(/^([A-Z][A-Za-z ]{1,40}):\s+(.+)$/s);
        if (labelMatch) {
          const [, label, body] = labelMatch;
          return (
            <p key={pi} className="whitespace-pre-line">
              <strong className="font-semibold text-gray-900">{label}:</strong>{' '}
              {renderInline(body)}
            </p>
          );
        }

        return (
          <p key={pi} className="whitespace-pre-line">
            {renderInline(para)}
          </p>
        );
      })}
    </div>
  );
};

/** Inline transformations: **bold** lead-ins, light emphasis. */
function renderInline(text: string): React.ReactNode {
  // Match **anything**: but be greedy-safe
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-gray-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

interface NoteFieldProps {
  label: string;
  value?: string;
  editable: boolean;
  onChange: (val: string) => void;
  isNew?: boolean;
}
const NoteField = ({ label, value, editable, onChange, isNew }: NoteFieldProps) => {
  return (
    <div
      className={`relative ${
        isNew ? 'pl-3 border-l-4 border-green-400 bg-green-50/30 -ml-3 rounded-r' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">{label}</h4>
        {isNew && (
          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800 rounded">
            NEW
          </span>
        )}
      </div>
      {editable ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.max(2, Math.min(10, (value || '').split('\n').length + 1))}
          className="w-full text-sm text-gray-900 leading-relaxed bg-white border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-sans"
        />
      ) : (
        <RichClinicalText text={value || ''} />
      )}
    </div>
  );
};

export default function ResultsPanel({
  transcript,
  note,
  cds,
  outputFormat,
  previousNote,
  toxicities,
  enableCTCAE,
  coding,
  enableCoding,
  loading,
  loadingStage,
  error,
  onClose,
  onRetryNote,
  onMatchTrials,
  trialsLoading,
  trialsRequested,
  savedEncounterId,
  backendCoding,
  backendCodingLoading,
  backendCodingError,
  backendCodingStale,
  totalTimeMinutes,
  onTotalTimeMinutesChange,
  placeOfService,
  onPlaceOfServiceChange,
  onRecalculateCoding,
  codingDecisions,
  onCodingDecisionsChange,
}: ResultsPanelProps) {
  const [editing, setEditing] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [editedProblems, setEditedProblems] = useState<Record<string, ProblemBlock>>({});
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Reset edits when a new note arrives or format changes
  useEffect(() => {
    setEditing(false);
    setEditedSections({});
    setEditedProblems({});
    setCopyState('idle');
  }, [note?.note_id, outputFormat]);

  const baseSections = useMemo(
    () => (note ? buildSections(note, outputFormat) : []),
    [note, outputFormat]
  );
  const baseProblems = useMemo(
    () => (note ? buildProblemBlocks(note) : []),
    [note]
  );

  // Apply user edits over the base values
  const sections: Section[] = baseSections.map((s) => ({
    ...s,
    value: editedSections[s.label] ?? s.value,
  }));
  const problems: ProblemBlock[] = baseProblems.map((b, i) => {
    const key = `${i}-${b.title}`;
    return editedProblems[key] || b;
  });

  if (!loading && !note && !error && !transcript) return null;

  const title = FORMAT_TITLE[outputFormat];
  const isFollowUp = outputFormat === 'Follow Up Note' && !!previousNote.trim();

  const handleCopy = async () => {
    if (!note) return;
    const text = serializeNote(note, outputFormat, sections, problems, coding?.visit_type, enableCTCAE ? toxicities : [], previousNote);
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  const handlePrint = () => {
    // Browser print → user can pick "Save as PDF" from the print dialog.
    // The print stylesheet in globals.css preserves spacing and breaks pages
    // between problem blocks via @media print rules.
    window.print();
  };

  const handleDownload = () => {
    if (!note) return;
    const text = serializeNote(note, outputFormat, sections, problems, coding?.visit_type, enableCTCAE ? toxicities : [], previousNote);
    const safeFmt = outputFormat.replace(/\s+/g, '-');
    const filename = `${note.note_id || 'oncology-note'}-${safeFmt}.txt`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="results-panel-card w-full bg-surface border border-rule rounded-card shadow-card overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {note && (
            <p className="text-xs text-gray-500 font-mono mt-0.5">
              {note.note_id} · {new Date(note.created_at).toLocaleString()}
              {isFollowUp && (
                <span className="ml-2 px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-800 rounded">
                  reconciled with previous
                </span>
              )}
            </p>
          )}
        </div>
        {note && !loading && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              aria-label="Copy note"
            >
              {copyState === 'copied' ? '✓ Copied' : '📋 Copy'}
            </button>
            {/* The Follow Up template renders no editable fields (buildSections
                returns [] for it and the template has no NoteField), so the
                Edit toggle would be an inert no-op there — hide it rather than
                let a physician believe an inline edit took (feedback 2026-07-10).
                Edit stays available for H&P / Consultation / A&P-Only. */}
            {outputFormat !== 'Follow Up Note' && (
              <button
                onClick={() => setEditing((e) => !e)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  editing
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                aria-label={editing ? 'Done editing' : 'Edit note'}
              >
                {editing ? '✓ Done' : '✎ Edit'}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors print-hide"
              aria-label="Download note as TXT"
            >
              ⬇ Download TXT
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors print-hide"
              aria-label="Print or save as PDF"
            >
              🖨 Print / PDF
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium ml-1"
              aria-label="Close results"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Transcript */}
        {transcript && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Transcript
            </h3>
            <p className="text-base text-gray-900 bg-gray-50 border border-gray-200 rounded-lg p-4 leading-relaxed">
              {transcript}
            </p>
          </section>
        )}

        {/* Loading */}
        {loading && (
          <section className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-base text-gray-700">{loadingStage || 'Processing...'}</p>
          </section>
        )}

        {/* Error */}
        {error && (
          <section className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-1">Error</h3>
            <p className="text-sm text-red-700">{error}</p>
            {/* Backend-reachability hint only fits network-level failures —
                5xx details from the API are already self-explanatory. */}
            {/failed to fetch|network/i.test(error) && (
              <p className="text-xs text-red-600 mt-2">
                Verify the FastAPI backend is running at{' '}
                <code className="bg-red-100 px-1 py-0.5 rounded">
                  {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}
                </code>
              </p>
            )}
            {onRetryNote && !loading && transcript.trim() && (
              <button
                type="button"
                onClick={onRetryNote}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-white text-red-800 border border-red-300 rounded-button hover:bg-red-100 transition-colors duration-150"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Retry note generation
              </button>
            )}
          </section>
        )}

        {/* Note */}
        {note && !loading && (
          <>
            {(note.cancer_type || note.tnm_stage || note.ecog_status) && (
              <div className="flex flex-wrap gap-2">
                {note.cancer_type && (
                  <span className="px-3 py-1 text-sm font-medium bg-blue-100 text-blue-800 rounded-full border border-blue-200">
                    {note.cancer_type}
                  </span>
                )}
                {note.tnm_stage && (
                  <span className="px-3 py-1 text-sm font-medium bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
                    {note.tnm_stage}
                  </span>
                )}
                {note.ecog_status && (
                  <span className="px-3 py-1 text-sm font-medium bg-teal-100 text-teal-800 rounded-full border border-teal-200">
                    {note.ecog_status}
                  </span>
                )}
              </div>
            )}

            <section>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {title.toUpperCase()}
              </h3>
              {outputFormat === 'Follow Up Note' ? (
                <div className="ds-card p-5 md:p-6 space-y-3">
                  <FollowUpNoteTemplate
                    note={note}
                    codingRationale={coding?.coding_rationale}
                    codingVisitType={coding?.visit_type}
                    toxicities={enableCTCAE ? toxicities : []}
                    previousNote={previousNote}
                  />
                </div>
              ) : outputFormat === 'Assessment and Plan Only' ? (
                problems.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">{NOT_DOCUMENTED}</p>
                ) : (
                  <div className="space-y-6 md:space-y-8 print:space-y-6">
                    {problems.map((b, i) => {
                      const key = `${i}-${b.title}`;
                      return (
                        <article
                          key={key}
                          className="problem-block break-inside-avoid bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow p-5 md:p-6 mb-6 last:mb-0 print:mb-6 print:break-inside-avoid print:shadow-none"
                        >
                          <header className="flex items-baseline gap-3 pb-3 mb-4 border-b border-gray-100">
                            <span className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold">
                              {i + 1}
                            </span>
                            <h4 className="text-base md:text-lg font-semibold text-gray-900 leading-snug">
                              {b.title}
                            </h4>
                          </header>
                          <div className="space-y-5">
                            <NoteField
                              label="Assessment"
                              value={b.assessment}
                              editable={editing}
                              onChange={(v) =>
                                setEditedProblems((prev) => ({
                                  ...prev,
                                  [key]: { ...b, assessment: v },
                                }))
                              }
                            />
                            <NoteField
                              label="Plan"
                              value={b.plan}
                              editable={editing}
                              onChange={(v) =>
                                setEditedProblems((prev) => ({
                                  ...prev,
                                  [key]: { ...b, plan: v },
                                }))
                              }
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="border border-gray-200 rounded-xl p-5 md:p-6 bg-white space-y-5 md:space-y-6 print:border-0 print:p-0">
                  {sections.map((s) => (
                    <div
                      key={s.label}
                      className="break-inside-avoid pb-4 last:pb-0 border-b border-gray-100 last:border-b-0"
                    >
                      <NoteField
                        label={s.label}
                        value={s.value}
                        editable={editing}
                        onChange={(v) =>
                          setEditedSections((prev) => ({ ...prev, [s.label]: v }))
                        }
                        isNew={
                          isFollowUp &&
                          !!s.trackChanges &&
                          isContentNew(s.value, previousNote)
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* CTCAE toxicity panel — hidden for Follow Up notes whenever the
                same findings already render inside the note's "Chemotherapy /
                Treatment Toxicities" section (which now also shows with
                findings while off treatment). */}
            {enableCTCAE && toxicities.length > 0 &&
              !(outputFormat === 'Follow Up Note' && note) && (
              <ToxicityPanel
                findings={toxicities}
                title={
                  outputFormat === 'Follow Up Note'
                    ? 'Treatment Toxicities / CTCAE'
                    : outputFormat === 'Assessment and Plan Only'
                    ? 'Toxicity Summary (CTCAE)'
                    : 'Treatment Toxicities / CTCAE'
                }
              />
            )}

            {/* Coding intelligence — instant client-side preview */}
            {enableCoding && coding && <CodingPanel result={coding} />}

            {/* Coding intelligence — authoritative backend deterministic engine */}
            {enableCoding && note?.coding_facts && (
              <BackendCodingPanel
                report={backendCoding}
                loading={backendCodingLoading}
                error={backendCodingError}
                totalTimeMinutes={totalTimeMinutes}
                onTotalTimeMinutesChange={onTotalTimeMinutesChange}
                placeOfService={placeOfService}
                onPlaceOfServiceChange={onPlaceOfServiceChange}
                onRecalculate={onRecalculateCoding}
                stale={backendCodingStale}
                decisions={codingDecisions}
                onDecisionsChange={onCodingDecisionsChange}
              />
            )}
          </>
        )}

        {/* CDS — same as before */}
        {cds && !loading && (
          <>
            {cds.recommendations.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Treatment Recommendations
                </h3>
                <ul className="space-y-3">
                  {cds.recommendations.map((rec, i) => (
                    <li
                      key={i}
                      className="border-l-4 border-blue-600 bg-blue-50/40 pl-4 py-3 pr-3 rounded-r-lg"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-semibold text-gray-900">{rec.title}</p>
                        {rec.strength && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded whitespace-nowrap">
                            {rec.strength}
                          </span>
                        )}
                      </div>
                      {rec.detail && (
                        <p className="text-sm text-gray-700 mt-1 leading-relaxed">{rec.detail}</p>
                      )}
                      {rec.evidence && (
                        <p className="text-xs text-gray-500 mt-1 italic">Evidence: {rec.evidence}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {cds.citations.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Guideline Citations (NCCN / ESMO / ASCO)
                </h3>
                <ul className="space-y-2">
                  {cds.citations.map((cite, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span
                        className={`px-2 py-0.5 text-xs font-semibold rounded border ${sourceBadgeColor(
                          cite.source
                        )} whitespace-nowrap`}
                      >
                        {cite.source}
                      </span>
                      <div className="flex-1 min-w-0">
                        {cite.url ? (
                          <a
                            href={cite.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-700 hover:underline"
                          >
                            {cite.title}
                          </a>
                        ) : (
                          <p className="text-sm font-medium text-gray-900">{cite.title}</p>
                        )}
                        {(cite.section || cite.year) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {[cite.section, cite.year].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Clinical Trials — on-demand. User clicks to fetch. */}
            <section className="border-t border-gray-200 pt-5 print-hide">
              <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                    Clinical Trial Matching
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {trialsRequested
                      ? cds.clinical_trials.length > 0
                        ? `${cds.clinical_trials.length} matching trial${
                            cds.clinical_trials.length === 1 ? '' : 's'
                          } from ClinicalTrials.gov`
                        : trialsLoading
                        ? 'Searching ClinicalTrials.gov…'
                        : 'No matching trials returned.'
                      : 'Optional — search ClinicalTrials.gov for studies matching this diagnosis.'}
                  </p>
                </div>
                {!trialsRequested && (
                  <button
                    onClick={onMatchTrials}
                    disabled={trialsLoading}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {trialsLoading ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                        Searching…
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        Match Clinical Trials
                      </>
                    )}
                  </button>
                )}
                {trialsRequested && (
                  <button
                    onClick={onMatchTrials}
                    disabled={trialsLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {trialsLoading ? 'Searching…' : '↻ Refresh'}
                  </button>
                )}
              </div>
              {trialsLoading && cds.clinical_trials.length === 0 && (
                <div className="flex items-center gap-3 py-3">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-gray-700">
                    Querying ClinicalTrials.gov…
                  </p>
                </div>
              )}
            </section>

            {cds.clinical_trials.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Matching Clinical Trials
                </h3>
                <ul className="space-y-3">
                  {cds.clinical_trials.map((trial, i) => (
                    <li
                      key={i}
                      className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          {trial.url ? (
                            <a
                              href={trial.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-blue-700 hover:underline"
                            >
                              {trial.title}
                            </a>
                          ) : (
                            <p className="text-sm font-semibold text-gray-900">{trial.title}</p>
                          )}
                          <p className="text-xs text-gray-500 font-mono mt-0.5">{trial.nct_id}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                          {trial.phase && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded border border-purple-200">
                              {trial.phase}
                            </span>
                          )}
                          {trial.status && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded border border-green-200">
                              {trial.status}
                            </span>
                          )}
                        </div>
                      </div>
                      {trial.brief_summary && (
                        <p className="text-sm text-gray-700 leading-relaxed mt-2">
                          {trial.brief_summary}
                        </p>
                      )}
                      {trial.conditions && trial.conditions.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {trial.conditions.map((c, j) => (
                            <span
                              key={j}
                              className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* Thumbs feedback — appears once a note is rendered and not loading. */}
        {note && !loading && !error && (
          <div className="mt-6 pt-4 border-t border-rule">
            <ThumbsFeedback
              key={note.note_id}
              encounterId={savedEncounterId ?? null}
              outputFormat={outputFormat}
            />
          </div>
        )}
      </div>
    </div>
  );
}
