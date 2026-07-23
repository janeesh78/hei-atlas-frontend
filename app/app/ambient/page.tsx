'use client';

import { useState, useRef, useEffect } from 'react';
import LeftSidebar from '@/components/LeftSidebar';
import AIPanel from '@/components/AIPanel';
import ResultsPanel from '@/components/ResultsPanel';
import NearbyTrialsPanel from '@/components/NearbyTrialsPanel';
import {
  transcribeAudio,
  transcribeAudioSafe,
  generateNote,
  analyzeCoding,
  getTrials,
  pingBackend,
  type OncologyNote,
  type CdsResponse,
  type OutputFormat,
  type CodingReport,
} from '@/lib/api';
import { RecordingQueue, saveStandbyPart, takeStandbyDraft, clearStandbyDraft, type PendingRecording } from '@/lib/recordingQueue';
import PendingUploadsPanel from '@/components/PendingUploadsPanel';
import { matchCitations } from '@/lib/citations';
import { fetchNearbyTrials, type NearbyTrial } from '@/lib/trials';
import { classifyQuery, type Intent } from '@/lib/intent';
import { extractAndGradeToxicities, type ToxicityFinding } from '@/lib/ctcae';
import { analyzeNoteForCoding, type CodingResult } from '@/lib/coding';
import { useSession } from '@/lib/session';
import { useRouter } from 'next/navigation';
import { getPreferences, updatePreferences, saveEncounter, deleteEncounter, listTodayEncounters, getEncounter, pingActivity, saveLocation, normalizePersistedCoding, type SavedEncounter, type CodingDecision, type PersistedCoding } from '@/lib/auth';
import { decodeHtmlEntities } from '@/lib/clinicalText';

export default function Home() {
  const router = useRouter();
  const { user, isBooting, logout: sessionLogout, getIdleMs, idleWarning, dismissIdleWarning } = useSession();

  // Route guard — redirect anonymous users to /login.
  useEffect(() => {
    if (!isBooting && !user) router.replace('/');
  }, [isBooting, user, router]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Results / pipeline state
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState<OncologyNote | null>(null);
  const [cds, setCds] = useState<CdsResponse | null>(null);
  const [trialsLoading, setTrialsLoading] = useState(false);
  const [trialsRequested, setTrialsRequested] = useState(false);

  // Mobile shell — drawer (left nav) and bottom sheet (Ask Atlas) state
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileAIOpen, setMobileAIOpen] = useState(false);

  // Offline-tolerant recording queue + connectivity status
  const queueRef = useRef<RecordingQueue | null>(null);
  // Latest-value refs so the mount-only queue effect doesn't run the pipeline
  // with first-render state (previousNote='', format locked to Consultation,
  // stale CTCAE). pipelineRef always points at the current pipeline fn;
  // genCtxRef holds the current patient context to snapshot at capture time;
  // pendingCtxByIdRef binds that snapshot to a specific queued recording.
  const pipelineRef = useRef<
    (text: string, ctx?: { previousNote: string; outputFormat: OutputFormat }) => Promise<void>
  >(async () => {});
  const genCtxRef = useRef<{ previousNote: string; outputFormat: OutputFormat }>({
    previousNote: '',
    outputFormat: 'Consultation',
  });
  const pendingCtxByIdRef = useRef<Map<string, { previousNote: string; outputFormat: OutputFormat }>>(
    new Map(),
  );
  const [pendingUploads, setPendingUploads] = useState<PendingRecording[]>([]);
  // Must default to `true` unconditionally (not `navigator.onLine`) so the
  // SSR-rendered HTML matches the initial client render. The real value is
  // synced in a useEffect on mount below — a one-frame delay is fine and
  // avoids the React hydration mismatch when the user is actually offline.
  const [networkOnline, setNetworkOnline] = useState(true);
  const [uploadsPanelOpen, setUploadsPanelOpen] = useState(false);
  const [todaysEncounters, setTodaysEncounters] = useState<SavedEncounter[]>([]);
  const [lastSavedEncounterId, setLastSavedEncounterId] = useState<string | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [dailyCapReached, setDailyCapReached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Output format + previous-note reconciliation
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('Consultation');
  const [previousNote, setPreviousNote] = useState('');
  const [showPreviousNote, setShowPreviousNote] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  // Most recent previous-note text already folded into the current generated
  // note (by either generation path). Blocks the auto-reorganize effect from
  // re-firing on content it has merged — including right after the merge
  // itself updates `note`.
  const lastMergedPreviousRef = useRef('');

  // CTCAE toxicity grading
  const [enableCTCAE, setEnableCTCAE] = useState(true);
  const [toxicities, setToxicities] = useState<ToxicityFinding[]>([]);

  // Coding intelligence
  const [enableCoding, setEnableCoding] = useState(true);
  // Physician-controlled new/established patient status. Auto-detection was
  // unreliable across encounter types — this toggle lets the physician state
  // it explicitly so the E/M code series matches billing intent every time.
  // Defaults to `false` (established), which is the audit-safer choice.
  const [newPatientVisit, setNewPatientVisit] = useState(false);
  const [coding, setCoding] = useState<CodingResult | null>(null);

  // Backend Coding Intelligence (POST /coding/analyze) — authoritative,
  // evidence-grounded, separate from the instant client-side `coding`
  // heuristic above. Only runs when the generated note carries coding_facts
  // (i.e. Coding was enabled at generation time).
  const [totalTimeMinutes, setTotalTimeMinutes] = useState<number | null>(null);
  const [placeOfService, setPlaceOfService] = useState('');
  const [backendCoding, setBackendCoding] = useState<CodingReport | null>(null);
  const [backendCodingLoading, setBackendCodingLoading] = useState(false);
  const [backendCodingError, setBackendCodingError] = useState<string | null>(null);
  const [backendCodingStale, setBackendCodingStale] = useState(false);
  // Per-item accept/dismiss review state, keyed the same way
  // BackendCodingPanel keys its list items. Lifted here (not local to the
  // panel) so it survives autosave/restore.
  const [codingDecisions, setCodingDecisions] = useState<Record<string, CodingDecision>>({});
  // Visit-input signature the current backendCoding report was computed
  // from — lets the staleness effect detect edits without re-firing the
  // network call on every keystroke (only "Recalculate" does that).
  const backendCodingSigRef = useRef<string>('');
  // Mirrors skipAutosaveForIdRef: restoring a visit hydrates backendCoding
  // directly from the saved encounter, and this guard stops the auto-trigger
  // effect from immediately overwriting it with a fresh network fetch (which
  // would also wipe the just-restored codingDecisions).
  const skipBackendCodingForIdRef = useRef<string | null>(null);

  // Location + nearby-trials state
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<
    'idle' | 'requesting' | 'detected' | 'denied'
  >('idle');
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [nearbyTrials, setNearbyTrials] = useState<NearbyTrial[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyQueryUsed, setNearbyQueryUsed] = useState('');
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [currentIntent, setCurrentIntent] = useState<Intent | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // MediaRecorder refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  // Set when a draft snapshot is wanted: the next flushed chunk triggers an
  // IndexedDB draft write of everything captured so far (crash insurance —
  // recording keeps going).
  const standbyFlushRef = useRef(false);
  // Append-only draft bookkeeping: draftOrderRef is the next part index;
  // draftPersistedCountRef is how many audioChunksRef entries are already
  // persisted, so each flush writes only the new delta (not the whole
  // recording — see saveStandbyPart).
  const draftOrderRef = useRef(0);
  const draftPersistedCountRef = useRef(0);
  // Set while restoring a saved visit so the note-change autosave effect
  // doesn't re-save it as a brand-new encounter (Patient E dup of Patient A).
  // Restore guard, keyed by the restored note's id rather than a one-shot
  // boolean. A boolean could get stuck true if the effect never fired (e.g.
  // re-selecting the already-open visit — note_id unchanged), which then
  // silently swallowed the NEXT patient's save.
  const skipAutosaveForIdRef = useRef<string | null>(null);
  // Signature of what is currently persisted for the on-screen note — so a
  // coding/format change on an already-saved visit re-persists (was frozen at
  // generation time), while unchanged re-renders don't re-save.
  const lastSavedSigRef = useRef<string>('');
  // Last auto-saved encounter + the transcript it covered — lets a regenerated
  // note for the same visit replace its saved row instead of appending one.
  const lastAutoSaveRef = useRef<{ id: string; transcript: string } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Keeps the screen awake while ATLAS listens (mobile screens auto-locking
  // is the main way the OS kills a live mic).
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  // Silent audio graph — holding an active audio session is what lets iOS
  // Safari keep capturing while the app is backgrounded.
  const keepAliveCtxRef = useRef<AudioContext | null>(null);
  const recordingStartRef = useRef<number>(0);
  // Total active-recording ms accumulated across pause/resume segments —
  // feeds draft durations and logs.
  const recordingElapsedRef = useRef<number>(0);
  // Recording length is unbounded: ATLAS listens until the physician presses
  // stop (the old 10-minute auto-stop cap dated from the 1 GB local-whisper
  // machine and cut off real consults — removed 2026-07-09; the backend now
  // chunks audio past OpenAI's 25 MB per-request limit). While recording we
  // ping /activity/ping every 4 min: the authed call slides the server-side
  // 15-min session TTL so the upload at stop-time never hits a 401.
  const sessionKeepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset everything for a new query
  const resetResults = () => {
    setTranscript('');
    setNote(null);
    setCds(null);
    setError(null);
    setLoadingStage('');
    setCurrentIntent(null);
    setToxicities([]);
    setCoding(null);
    setBackendCoding(null);
    setBackendCodingError(null);
    setBackendCodingStale(false);
    setCodingDecisions({});
    setTotalTimeMinutes(null);
    setPlaceOfService('');
    backendCodingSigRef.current = '';
    skipBackendCodingForIdRef.current = null;
    setLastSavedEncounterId(null);
    setTrialsRequested(false);
    setTrialsLoading(false);
    setNearbyTrials([]);
    setNearbyError(null);
    setNearbyExpanded(false);
    setNearbyQueryUsed('');
  };

  // Restore a saved visit from the "Recent visits" list into the workspace.
  const handleSelectEncounter = async (id: string) => {
    setLoading(true);
    setLoadingStage('Loading saved visit…');
    setError(null);
    try {
      const full = await getEncounter(id);
      resetResults();
      // A pasted previous note belongs to the in-progress patient — never
      // carry it into a restored visit, and never let it auto-reorganize one.
      setPreviousNote('');
      lastMergedPreviousRef.current = '';
      // Already persisted — don't re-save this restore. Keyed by the restored
      // note's id so the guard is consumed correctly even if the effect never
      // re-fires (same id). Bind the supersede target too, so a later edit
      // (format/coding toggle) UPDATES this visit instead of duplicating it.
      const restoredNote = full.note as unknown as OncologyNote;
      skipAutosaveForIdRef.current = restoredNote?.note_id ?? null;
      lastAutoSaveRef.current = { id: full.id, transcript: full.transcript || '' };
      if (full.output_format) setOutputFormat(full.output_format as OutputFormat);
      setTranscript(full.transcript || '');
      setNote(restoredNote);
      // Backward-compatible: pre-2026-07-15 rows have the bare CodingResult
      // as `coding` itself; newer rows nest {client, backend, decisions, ...}.
      const persisted = normalizePersistedCoding(full.coding);
      if (persisted.client) setCoding(persisted.client);
      setCodingDecisions(persisted.decisions);
      setTotalTimeMinutes(persisted.totalTimeMinutes);
      setPlaceOfService(persisted.placeOfService);
      if (persisted.backend) {
        // Skip the auto-trigger effect once for this note — we're restoring
        // an already-computed report, not generating a fresh one.
        skipBackendCodingForIdRef.current = restoredNote?.note_id ?? null;
        setBackendCoding(persisted.backend);
        backendCodingSigRef.current = `${newPatientVisit}|${persisted.totalTimeMinutes ?? ''}|${persisted.placeOfService}`;
        setBackendCodingStale(false);
        setBackendCodingError(null);
      }
      if (full.toxicities) setToxicities(full.toxicities as unknown as ToxicityFinding[]);
      setLastSavedEncounterId(full.id);
      setMobileNavOpen(false); // close the drawer on phones
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load the saved visit.');
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  };

  // Trial-search-only pipeline (no note generation, no guideline citations)
  const runTrialSearchPipeline = async (text: string, disease: string) => {
    setLoadingStage('Searching clinical trials...');
    setNearbyQueryUsed(disease || text);
    try {
      const result = await fetchNearbyTrials({
        query: text,
        disease,
        latitude: location?.lat,
        longitude: location?.lng,
        maxResults: 8,
      });
      setNearbyTrials(result.trials);
      setNearbyExpanded(result.expandedRadius);
      setNearbyError(result.trials.length === 0 ? 'No trials found.' : null);
      console.log(
        '[trials] count=',
        result.trials.length,
        'expandedRadius=',
        result.expandedRadius,
        'disease=',
        result.diseaseUsed,
        'location=',
        location
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trial search failed';
      setNearbyError(msg);
      console.error('Trial search error:', err);
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  };

  // Note + CDS pipeline (used for note_generation / guideline / general intents).
  // `ctx` carries the PATIENT-specific inputs (pasted prior note + output
  // format) bound to this transcript. The typed path passes none and reads
  // live state; the queue path passes the context captured when the recording
  // STOPPED — so a prior note pasted later for a different patient can never
  // be merged into an earlier, time-shifted recording (cross-patient safety).
  const runNotePipeline = async (
    text: string,
    ctx?: { previousNote: string; outputFormat: OutputFormat },
  ) => {
    const fmt = ctx ? ctx.outputFormat : outputFormat;
    const prev = ctx ? ctx.previousNote : previousNote;
    // Estimate latency from transcript size so the user knows what to expect.
    // Empirically the backend's note generator runs at ~5 KB/sec.
    const sizeKB = Math.round(text.length / 1024);
    const expectedSec = Math.max(8, Math.round(text.length / 200));
    const noteStart = Date.now();
    setLoadingStage(
      sizeKB > 5
        ? `Generating oncology note (${sizeKB} KB transcript, ~${expectedSec}s)…`
        : 'Generating oncology note…'
    );
    // Heartbeat: update the loading message every 5s so the UI doesn't look frozen
    const heartbeat = setInterval(() => {
      const elapsed = Math.round((Date.now() - noteStart) / 1000);
      setLoadingStage(
        `Generating oncology note… (${elapsed}s elapsed, transcript ${sizeKB} KB)`
      );
    }, 5000);

    try {
      pingBackend('pipeline:note-start', { chars: text.length, format: fmt });
      const { note: generatedNote } = await generateNote({
        transcript: text,
        outputFormat: fmt,
        previousNote: prev.trim() || undefined,
        codingEnabled: enableCoding,
      });
      clearInterval(heartbeat);
      pingBackend('pipeline:note-done', { noteId: generatedNote.note_id });
      setNote(generatedNote);
      lastMergedPreviousRef.current = prev.trim();
      console.log(
        `Note: generated in ${Math.round((Date.now() - noteStart) / 1000)}s`,
        generatedNote
      );

      // CTCAE toxicity extraction — current encounter only.
      //
      // When a previous note is loaded the backend pulls forward prior content
      // into HPI / Assessment / Plan of the generated note. Naive extraction
      // would then resurface yesterday's toxicities as if they were new. To
      // avoid that, we extract from both the previous note and the current
      // corpus, then subtract — only toxicities NEW to today survive.
      let findings: ToxicityFinding[] = [];
      if (enableCTCAE) {
        const currentCorpus = [
          generatedNote.history_present_illness,
          generatedNote.physical_examination,
          generatedNote.lab_imaging_review,
          generatedNote.assessment,
          generatedNote.plan,
          text,
        ]
          .filter(Boolean)
          .join('\n\n');

        const currentFindings = extractAndGradeToxicities(currentCorpus);

        if (prev.trim()) {
          const priorFindings = extractAndGradeToxicities(prev);
          const priorNames = new Set(
            priorFindings.map((f) => f.toxicity.toLowerCase())
          );
          // Subtract prior-note toxicities ONLY if they weren't discussed in
          // today's own transcript — an ongoing rash the physician spent the
          // visit on is current, not a carry-forward echo (feedback
          // 2026-07-10: a suspected irAE vanished from the toxicity section
          // because it also existed at the prior visit).
          const spokenToday = new Set(
            extractAndGradeToxicities(text).map((f) => f.toxicity.toLowerCase())
          );
          findings = currentFindings.filter(
            (f) =>
              spokenToday.has(f.toxicity.toLowerCase()) ||
              !priorNames.has(f.toxicity.toLowerCase())
          );
          console.log(
            '[ctcae] prior=', priorFindings.map((f) => f.toxicity),
            'current=', currentFindings.map((f) => f.toxicity),
            'new=', findings.map((f) => f.toxicity),
          );
        } else {
          findings = currentFindings;
          console.log('[ctcae] toxicities=', findings.map((f) => f.toxicity));
        }
        setToxicities(findings);
      } else {
        setToxicities([]);
      }

      // Coding intelligence — runs against the structured note + transcript + toxicities
      if (enableCoding) {
        const codingResult = analyzeNoteForCoding({
          note: generatedNote,
          transcript: text,
          toxicities: findings,
          outputFormat: fmt,
          newPatientVisit,
        });
        setCoding(codingResult);
        console.log(
          '[coding] mdm=',
          codingResult.mdm_level,
          'em=',
          codingResult.recommended_em_code,
          'icds=',
          codingResult.icd10_codes.map((c) => c.code),
          'gaps=',
          codingResult.documentation_gaps.length,
          'flags=',
          codingResult.compliance_flags.length
        );
      } else {
        setCoding(null);
      }

      // Match guideline citations (instant, client-side, no API call).
      // Clinical trial matching is now opt-in — see handleMatchTrials below.
      const citations = matchCitations(
        generatedNote.cancer_type,
        generatedNote.assessment,
        text
      );
      const cdsResult: CdsResponse = {
        recommendations: [],
        citations,
        clinical_trials: [], // populated only when the user clicks "Match Clinical Trials"
        cancer_type: generatedNote.cancer_type || undefined,
        stage: generatedNote.tnm_stage || undefined,
      };
      setCds(cdsResult);
      console.log('CDS:', cdsResult, '(trials deferred — awaiting user request)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      console.error('Pipeline error:', err);
    } finally {
      clearInterval(heartbeat);
      setLoading(false);
      setLoadingStage('');
    }
  };

  // Top-level pipeline: classify intent → route to the right surface.
  // `ctx` (queue path) binds the capture-time prior note + format to this
  // transcript; when present we also sync the format state so the results
  // panel renders in the format the note was generated for.
  const runPipelineFromTranscript = async (
    text: string,
    ctx?: { previousNote: string; outputFormat: OutputFormat },
  ) => {
    if (!text.trim()) {
      setError('Empty transcript. Try again.');
      setLoading(false);
      return;
    }
    if (ctx && ctx.outputFormat !== outputFormat) setOutputFormat(ctx.outputFormat);

    const classification = classifyQuery(text);
    setCurrentIntent(classification.intent);
    console.log('[intent]', classification.intent, '[disease]', classification.disease);

    if (classification.intent === 'clinical_trial_search') {
      // Skip note + CDS — go straight to trials
      setNearbyLoading(true);
      await runTrialSearchPipeline(text, classification.disease);
      setNearbyLoading(false);
    } else {
      await runNotePipeline(text, ctx);
    }
  };

  // Keep the latest-value refs current every render so the mount-only queue
  // effect always runs the pipeline with live settings and the correct
  // patient context (see the refs' declaration).
  pipelineRef.current = runPipelineFromTranscript;
  genCtxRef.current = { previousNote: previousNote.trim(), outputFormat };

  const runFromText = async (query: string) => {
    resetResults();
    setTranscript(query);
    setLoading(true);
    await runPipelineFromTranscript(query);
  };

  const runFromAudio = async (audioBlob: Blob) => {
    resetResults();
    setLoading(true);
    setLoadingStage('Transcribing audio...');
    pingBackend('pipeline:audio-start', { sizeBytes: audioBlob.size });
    try {
      const { transcript: text } = await transcribeAudio(audioBlob);
      setTranscript(text);
      console.log('Transcript:', text);
      pingBackend('pipeline:transcribe-done', { chars: text.length });
      await runPipelineFromTranscript(text);
      pingBackend('pipeline:run-done', { chars: text.length });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
      console.error('Pipeline error:', err);
      pingBackend('pipeline:error', { msg: msg.slice(0, 80) });
      setLoading(false);
      setLoadingStage('');
    }
  };

  // Persist only the audio chunks captured since the last draft write, as the
  // next append-only part. Contiguity-safe: if the write fails (quota), the
  // counters roll back so the same tail is retried next tick and no later part
  // is written past a gap — and the failure is surfaced, not swallowed.
  const persistDraftDelta = () => {
    const mr = mediaRecorderRef.current;
    const start = draftPersistedCountRef.current;
    const newChunks = audioChunksRef.current.slice(start);
    if (newChunks.length === 0) return;
    const part = new Blob(newChunks, { type: mr?.mimeType || 'audio/webm' });
    if (part.size === 0) return;
    const liveMs =
      recordingElapsedRef.current +
      (mr?.state === 'recording' ? Date.now() - recordingStartRef.current : 0);
    const durationSec = Math.round(liveMs / 1000);
    const order = draftOrderRef.current;
    draftPersistedCountRef.current = audioChunksRef.current.length;
    draftOrderRef.current = order + 1;
    saveStandbyPart(part, order, durationSec).catch((err) => {
      draftPersistedCountRef.current = start; // retry this tail next flush
      draftOrderRef.current = order;           // reuse this order (no gap)
      console.warn('[standby] draft part write failed (quota?):', err);
      pingBackend('standby:draft-write-failed', {});
    });
  };

  // Start audio recording via MediaRecorder
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick the best supported mime type per platform.
      // iOS Safari does NOT support webm; it requires audio/mp4 (AAC).
      // Chrome/Android prefer webm/opus. We try iOS-specific first when on
      // iOS so the platform-native codec is used.
      const isIOS =
        typeof navigator !== 'undefined' &&
        (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.userAgent.includes('Mac') &&
            'ontouchend' in document));
      const candidates = isIOS
        ? ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm']
        : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = candidates.find((t) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
      ) || '';

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      draftOrderRef.current = 0;
      draftPersistedCountRef.current = 0;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
        // Draft snapshot: persist only the NEW delta chunk(s) since the last
        // write so the captured audio survives an OS tab-kill without
        // re-serializing the whole recording each tick. Recording continues.
        if (standbyFlushRef.current) {
          standbyFlushRef.current = false;
          persistDraftDelta();
        }
      };

      mediaRecorder.onstop = async () => {
        // Recording is over — allow ServiceWorkerLoader's deferred
        // post-deploy reload again (audio is persisted to IndexedDB below).
        delete document.documentElement.dataset.recording;
        const blob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType || 'audio/webm',
        });
        // Stop all tracks to free the mic
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        // Tear down the keep-alives
        keepAliveCtxRef.current?.close().catch(() => {});
        keepAliveCtxRef.current = null;
        wakeLockRef.current?.release().catch(() => {});
        wakeLockRef.current = null;
        // Stop the session keep-alive — normal idle rules resume now
        if (sessionKeepAliveRef.current) {
          clearInterval(sessionKeepAliveRef.current);
          sessionKeepAliveRef.current = null;
        }
        // Free the chunk array (the blob holds its own copy now) and drop
        // any standby draft — the full recording supersedes it.
        audioChunksRef.current = [];
        standbyFlushRef.current = false;
        draftOrderRef.current = 0;
        draftPersistedCountRef.current = 0;
        clearStandbyDraft();
        const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        const durSec = Math.round((Date.now() - recordingStartRef.current) / 1000);
        console.log(`Recording stopped: ${durSec}s, ${sizeMB} MB`);
        pingBackend('queue:audio-captured', {
          sizeBytes: blob.size,
          durationSec: durSec,
          online: networkOnline,
        });

        // Always persist the blob to the offline queue first. The queue
        // attempts an immediate upload; if the network is down (or the
        // upload fails), the recording is safely on disk and the queue
        // will retry on reconnect.
        const queue = queueRef.current;
        if (queue) {
          try {
            const rec = await queue.enqueue(blob, { durationSec: durSec });
            // Bind the patient context AS OF THIS STOP to the queued recording,
            // so when it drains (possibly minutes later, after the physician
            // has moved on) it reconciles against THIS patient's prior note and
            // format — never a note pasted later for someone else.
            pendingCtxByIdRef.current.set(rec.id, { ...genCtxRef.current });
            // Show "transcribing..." loading state right away — the queue's
            // onSuccess callback drives the rest of the pipeline.
            resetResults();
            setLoading(true);
            setLoadingStage(
              networkOnline
                ? 'Transcribing audio…'
                : 'Saved offline — will transcribe when network returns.'
            );
            return;
          } catch (err) {
            console.warn('[queue] persist failed, falling back to direct upload:', err);
          }
        }
        // Fallback if IndexedDB isn't available (private browsing, old Safari)
        runFromAudio(blob);
      };

      // If the recorder or its mic track dies abnormally (permission revoked,
      // device unplugged, OS kills capture), onstop may never fire — which
      // would leave dataset.recording='1' forever and defeat the HIPAA idle
      // auto-logoff (the idle sweep treats the flag as "user present"). Clear
      // the recording state on error so the timeout can resume.
      const failRecording = (reason: string) => {
        console.warn(`[recording] abnormal end: ${reason}`);
        delete document.documentElement.dataset.recording;
        if (sessionKeepAliveRef.current) {
          clearInterval(sessionKeepAliveRef.current);
          sessionKeepAliveRef.current = null;
        }
        try { keepAliveCtxRef.current?.close(); } catch { /* ignore */ }
        keepAliveCtxRef.current = null;
        wakeLockRef.current?.release().catch(() => {});
        wakeLockRef.current = null;
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        setIsListening(false);
        setIsPaused(false);
      };
      mediaRecorder.onerror = (e: Event) =>
        failRecording((e as unknown as { error?: { name?: string } })?.error?.name || 'recorder error');
      // A mic track ending on its own (unplug / revoke) doesn't fire onstop.
      stream.getTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          if (mediaRecorderRef.current?.state !== 'inactive') {
            try { mediaRecorderRef.current?.stop(); } catch { /* ignore */ }
          }
          failRecording('mic track ended');
        });
      });

      mediaRecorder.start();
      // Blocks ServiceWorkerLoader's post-deploy auto-reload while audio is
      // held in recorder memory (covers paused recordings too — cleared in
      // onstop, which also fires via the unmount cleanup's stop()).
      document.documentElement.dataset.recording = '1';
      recordingStartRef.current = Date.now();
      recordingElapsedRef.current = 0;
      setIsListening(true);
      setIsPaused(false);
      console.log('Microphone activated - Recording started');

      // ── Background-listening keep-alives ────────────────────────────
      // 1. Silent audio graph: routing the mic through a zero-gain node to
      //    the output keeps an active audio session, which is what lets
      //    iOS Safari continue capturing while the app is backgrounded.
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const src = ctx.createMediaStreamSource(stream);
          const gain = ctx.createGain();
          gain.gain.value = 0; // silent — no monitoring/feedback
          src.connect(gain);
          gain.connect(ctx.destination);
          keepAliveCtxRef.current = ctx;
        }
      } catch { /* non-fatal — capture still works in the foreground */ }
      // 2. Screen wake lock: stops mobile screens from auto-locking mid-
      //    encounter (auto-lock is the main way the OS mutes a live mic).
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        nav.wakeLock?.request('screen').then((lock) => { wakeLockRef.current = lock; }).catch(() => {});
      } catch { /* unsupported — fine */ }

      // Slide the server session TTL for as long as the visit runs — an
      // ambient recording generates no clicks or API calls, and a consult
      // longer than 15 min would otherwise outlive its session token.
      sessionKeepAliveRef.current = setInterval(() => {
        void pingActivity();
      }, 4 * 60 * 1000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(`Microphone error: ${msg}`);
      console.error('getUserMedia error:', err);
      setIsListening(false);
    }
  };

  // Stop audio recording (triggers onstop → pipeline)
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      console.log('Microphone deactivated - Recording stopped, processing...');
    }
    setIsListening(false);
    setIsPaused(false);
  };

  // Pause / resume in-flight recording. MediaRecorder natively supports both
  // pause() and resume(); mic tracks stay live but chunks stop arriving so
  // the eventual blob only contains active-recording audio (silence during
  // pause is not captured). The session keep-alive stays running while
  // paused — a paused visit is still mid-consult.
  const pauseRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state !== 'recording') return;
    try {
      // Flush the buffered segment into audioChunksRef before pausing —
      // without a timeslice, MediaRecorder holds everything in memory until
      // stop/requestData, so a paused recording would otherwise have zero
      // bytes on disk if the device sleeps.
      try { mr.requestData(); } catch { /* not supported everywhere */ }
      mr.pause();
      // Accumulate active time for drafts + logs
      recordingElapsedRef.current += Date.now() - recordingStartRef.current;
      setIsPaused(true);
      console.log(`ATLAS paused after ${Math.round(recordingElapsedRef.current / 1000)}s`);
      pingBackend('recording:pause', {
        elapsedMs: recordingElapsedRef.current,
      });
    } catch (err) {
      console.warn('pause() failed:', err);
    }
  };

  const resumeRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state !== 'paused') return;
    try {
      mr.resume();
      // Reset the start reference for the new active segment
      recordingStartRef.current = Date.now();
      setIsPaused(false);
      console.log('ATLAS resumed');
      pingBackend('recording:resume', {});
    } catch (err) {
      console.warn('resume() failed:', err);
    }
  };

  // Single ATLAS button drives a start → pause ↔ resume cycle.
  // A separate "Stop" button ends recording and processes the audio.
  const handleMicrophoneClick = () => {
    if (!isListening) {
      startRecording();
      return;
    }
    if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      const q = searchQuery.trim();
      console.log('Search query:', q);
      runFromText(q);
      setSearchQuery('');
    }
  };

  // Re-run generation, blending in the previous note for reconciliation
  const handleReconcileWithPrevious = async () => {
    if (!previousNote.trim() || !transcript.trim()) return;
    // Mark as merged up front (not on success) so a failed attempt doesn't
    // auto-retry in a loop — the manual button is the retry path.
    lastMergedPreviousRef.current = previousNote.trim();
    setReconciling(true);
    setLoading(true);
    setLoadingStage('Reconciling with previous encounter...');
    setError(null);
    try {
      const { note: reconciled } = await generateNote({
        transcript,
        outputFormat,
        previousNote: previousNote.trim(),
        codingEnabled: enableCoding,
      });
      setNote(reconciled);
      console.log('Reconciled note:', reconciled);

      // Re-run CTCAE extraction with previous-note subtraction so reconciled
      // notes don't resurface yesterday's toxicities.
      if (enableCTCAE) {
        const currentCorpus = [
          reconciled.history_present_illness,
          reconciled.physical_examination,
          reconciled.lab_imaging_review,
          reconciled.assessment,
          reconciled.plan,
          transcript,
        ]
          .filter(Boolean)
          .join('\n\n');
        const currentFindings = extractAndGradeToxicities(currentCorpus);
        const priorFindings = extractAndGradeToxicities(previousNote);
        const priorNames = new Set(
          priorFindings.map((f) => f.toxicity.toLowerCase())
        );
        // Same spoken-today exemption as the main pipeline — toxicities
        // discussed in this visit's transcript stay even if the prior note
        // also had them.
        const spokenToday = new Set(
          extractAndGradeToxicities(transcript).map((f) => f.toxicity.toLowerCase())
        );
        const newFindings = currentFindings.filter(
          (f) =>
            spokenToday.has(f.toxicity.toLowerCase()) ||
            !priorNames.has(f.toxicity.toLowerCase())
        );
        setToxicities(newFindings);
        console.log(
          '[ctcae:reconcile] prior=', priorFindings.map((f) => f.toxicity),
          'current=', currentFindings.map((f) => f.toxicity),
          'new=', newFindings.map((f) => f.toxicity),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reconciliation failed';
      setError(msg);
      console.error('Reconcile error:', err);
    } finally {
      setReconciling(false);
      setLoading(false);
      setLoadingStage('');
    }
  };

  // Provider hiccups (credit exhaustion, overload) shouldn't force a
  // re-record: re-run generation on the transcript already in the workspace.
  // Keeps transcript, previous note, and output format exactly as they are.
  const handleRetryNote = async () => {
    if (!transcript.trim() || loading) return;
    setError(null);
    setLoading(true);
    await runNotePipeline(transcript);
  };

  // Auto-reorganize: pasting a prior note once a note already exists kicks off
  // reconciliation without the extra button click. Debounced so mid-edit
  // keystrokes don't spam generation; the lastMergedPreviousRef guard stops
  // re-fires on content that's already merged (and stops failure loops — after
  // an error the manual "Reorganize" button is the retry path). If the paste
  // happens before/during recording, this stays quiet: the main pipeline
  // includes the previous note at generation time.
  useEffect(() => {
    const prev = previousNote.trim();
    if (prev.length < 40) return; // real notes are long; ignore typed fragments
    if (!note || !transcript.trim()) return;
    if (loading || reconciling || isListening) return;
    if (prev === lastMergedPreviousRef.current) return;
    const timer = setTimeout(() => {
      void handleReconcileWithPrevious();
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousNote, note, transcript, loading, reconciling, isListening]);

  // On-demand clinical trial matching — runs only when the user clicks
  // the "Match Clinical Trials" button under the generated note.
  const handleMatchTrials = async () => {
    if (!note) return;
    setTrialsRequested(true);
    setTrialsLoading(true);
    pingBackend('pipeline:trials-start', {
      cancer_type: (note.cancer_type || '').slice(0, 60),
    });
    try {
      const trials = await getTrials(transcript, note.cancer_type, 6);
      setCds((prev) =>
        prev
          ? { ...prev, clinical_trials: trials }
          : {
              recommendations: [],
              citations: [],
              clinical_trials: trials,
              cancer_type: note.cancer_type || undefined,
              stage: note.tnm_stage || undefined,
            }
      );
      pingBackend('pipeline:trials-done', { count: trials.length });
      console.log('[trials] matched', trials.length, 'trials');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Trial match failed';
      console.error('Trial match error:', err);
      pingBackend('pipeline:trials-error', { msg: msg.slice(0, 80) });
    } finally {
      setTrialsLoading(false);
    }
  };

  // Request browser geolocation
  const handleUseMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('denied');
      setLocationMessage('Geolocation is not supported by this browser.');
      return;
    }
    setLocationStatus('requesting');
    setLocationMessage('Requesting location permission...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(coords);
        setLocationStatus('detected');
        setLocationMessage('Location detected');
        console.log('Location:', coords);
      },
      (err) => {
        setLocation(null);
        setLocationStatus('denied');
        setLocationMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Unable to access location: permission denied.'
            : 'Unable to access location.'
        );
        console.warn('Geolocation error:', err);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Find nearby trials using current location + active query
  const handleFindNearbyTrials = async () => {
    if (!location) return;
    const q = (searchQuery.trim() || transcript || '').trim();
    const cls = classifyQuery(q);
    setNearbyQueryUsed(cls.disease || q);
    setNearbyLoading(true);
    setNearbyError(null);
    setNearbyTrials([]);
    setNearbyExpanded(false);
    try {
      const result = await fetchNearbyTrials({
        query: q,
        disease: cls.disease,
        latitude: location.lat,
        longitude: location.lng,
      });
      setNearbyTrials(result.trials);
      setNearbyExpanded(result.expandedRadius);
      console.log(
        '[trials] count=',
        result.trials.length,
        'expandedRadius=',
        result.expandedRadius,
        'disease=',
        result.diseaseUsed
      );
      if (result.trials.length === 0) {
        setNearbyError('No nearby trials found. Expanding search radius.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch trials';
      setNearbyError(msg);
      console.error('Nearby trials error:', err);
    } finally {
      setNearbyLoading(false);
    }
  };

  const closeNearbyTrials = () => {
    setNearbyTrials([]);
    setNearbyError(null);
    setNearbyQueryUsed('');
    setNearbyExpanded(false);
  };

  const handleDropdownToggle = () => setDropdownOpen(!dropdownOpen);

  const handleDropdownItemClick = (item: string) => {
    console.log(`${item} clicked`);
    setDropdownOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

  // ── Offline-tolerant recording queue boot ─────────────────────────────
  // The queue persists captured audio in IndexedDB and keeps retrying the
  // transcription upload until it succeeds. The UI can stay responsive even
  // when the network is gone.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new RecordingQueue((blob) => transcribeAudioSafe(blob));
    queueRef.current = q;
    const offChange = q.onChange((items) => setPendingUploads(items));
    const offSuccess = q.onSuccess((item, transcript) => {
      // A queued recording finally uploaded — run the rest of the pipeline
      // (note generation, CTCAE, coding, citations) as if it had just landed.
      console.log(
        `[queue] uploaded id=${item.id}  size=${item.sizeBytes}  attempts=${item.attempts}  chars=${transcript.length}`
      );
      pingBackend('queue:upload-done', {
        id: item.id,
        attempts: item.attempts,
        chars: transcript.length,
      });
      // Use the context captured when THIS recording stopped — not whatever is
      // on screen now (which may belong to a different patient). If the
      // recording predates this page mount (standby draft, cross-session), no
      // context exists → generate with NO prior note so nothing is merged.
      const ctx =
        pendingCtxByIdRef.current.get(item.id) ??
        { previousNote: '', outputFormat: genCtxRef.current.outputFormat };
      pendingCtxByIdRef.current.delete(item.id);
      resetResults();
      setPreviousNote('');
      lastMergedPreviousRef.current = ctx.previousNote.trim();
      setTranscript(transcript);
      setLoading(true);
      // pipelineRef is always the current pipeline fn (live settings).
      pipelineRef.current(transcript, ctx);
    });
    q.init();
    // Standby recovery: if a previous session saved a draft (device slept and
    // the OS killed the tab mid-recording), feed it into the normal upload
    // queue so the captured audio still becomes a transcript.
    takeStandbyDraft().then((draft) => {
      if (!draft || draft.blob.size < 4096) return;
      console.log(`[standby] recovering draft: ${draft.blob.size} bytes, ~${draft.durationSec}s`);
      pingBackend('standby:draft-recovered', {
        sizeBytes: draft.blob.size,
        durationSec: draft.durationSec,
      });
      q.enqueue(draft.blob, { durationSec: draft.durationSec }).catch(() => {});
    });
    return () => {
      offChange();
      offSuccess();
      q.destroy();
      queueRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Background-listening guard ─────────────────────────────────────────
  // ATLAS keeps recording when the browser goes to the background — the
  // physician may switch to the EHR mid-encounter. Backgrounding only
  // triggers a draft snapshot (crash insurance), never a pause. When the
  // tab returns, the screen wake lock is re-acquired (the OS releases it
  // on hide) and the paused-by-iOS audio session is nudged back to life.
  useEffect(() => {
    const flushDraft = () => {
      const mr = mediaRecorderRef.current;
      if (!mr) return;
      if (mr.state === 'recording') {
        standbyFlushRef.current = true;      // next flushed chunk writes the draft
        try { mr.requestData(); } catch { /* flush unsupported — draft skipped */ }
      } else if (mr.state === 'paused' && audioChunksRef.current.length > 0) {
        // Paused: chunks are already flushed (pauseRecording called
        // requestData), so persist whatever delta isn't yet written.
        persistDraftDelta();
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        flushDraft();
      } else {
        // Back in the foreground: re-arm the keep-alives.
        keepAliveCtxRef.current?.resume().catch(() => {});
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive' && !wakeLockRef.current) {
          try {
            const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
            nav.wakeLock?.request('screen').then((lock) => { wakeLockRef.current = lock; }).catch(() => {});
          } catch { /* unsupported */ }
        }
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flushDraft);
    document.addEventListener('freeze', flushDraft);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', flushDraft);
      document.removeEventListener('freeze', flushDraft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rolling draft: while actively recording, refresh the IndexedDB snapshot
  // every 30 s so at most half a minute of audio is at risk if the OS kills
  // the tab without firing any lifecycle event.
  useEffect(() => {
    if (!isListening || isPaused) return;
    const iv = setInterval(() => {
      const mr = mediaRecorderRef.current;
      if (mr?.state === 'recording') {
        standbyFlushRef.current = true;
        try { mr.requestData(); } catch { /* unsupported */ }
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [isListening, isPaused]);

  // ── Cross-device encounter sync ────────────────────────────────────────
  // Encounters are stored server-side; refresh the list every 30 s while
  // visible and immediately on tab focus, so a visit saved on the phone
  // shows up on the desktop (and vice versa) without a reload.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      listTodayEncounters()
        .then((encs) => { if (alive) setTodaysEncounters(encs); })
        .catch(() => { /* transient — next tick retries */ });
    };
    const iv = setInterval(refresh, 30_000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // ── Beta telemetry: activity heartbeat + one-time location capture ─────
  // Runs only while a user is signed in and the tab is visible. All calls
  // are fail-open — telemetry never blocks the UI or throws to the user.
  useEffect(() => {
    if (!user) return;
    let alive = true;

    // Only ping if the tab is visible AND the physician has interacted in
    // the last minute. This keeps the sliding session TTL honest — a walked-
    // away tab never keeps the session alive.
    const ping = () => {
      if (document.visibilityState !== 'visible') return;
      if (getIdleMs() > 60_000) return;
      pingActivity();
    };
    ping();
    const iv = setInterval(ping, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') ping(); };
    document.addEventListener('visibilitychange', onVis);

    // One-shot geolocation. Fails silently if the user hasn't granted the
    // permission — we're not going to nag; the trials feature will re-prompt
    // when it needs coordinates.
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!alive) return;
          saveLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_meters: pos.coords.accuracy,
            source: 'browser',
          });
        },
        () => { /* permission denied or unavailable — silent */ },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60 * 60 * 1000 },
      );
    }

    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user]);

  // Load user preferences + today's encounters on session establishment
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [prefs, encs] = await Promise.all([
          getPreferences().catch(() => null),
          listTodayEncounters().catch(() => []),
        ]);
        if (cancelled) return;
        if (prefs && prefs.settings) {
          const s = prefs.settings as Record<string, unknown>;
          if (typeof s.preferred_output_format === 'string') {
            setOutputFormat(s.preferred_output_format as OutputFormat);
          }
          if (typeof s.enableCTCAE === 'boolean') setEnableCTCAE(s.enableCTCAE);
          if (typeof s.enableCoding === 'boolean') setEnableCoding(s.enableCoding);
          if (typeof s.newPatientVisit === 'boolean') setNewPatientVisit(s.newPatientVisit);
        }
        setTodaysEncounters(encs);
        setPreferencesLoaded(true);
      } catch (e) {
        console.warn('[prefs/encounters] init load failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Persist preference changes (settings + usage counts) — but only after
  // the initial load has completed so we don't overwrite server defaults.
  useEffect(() => {
    if (!user || !preferencesLoaded) return;
    updatePreferences({
      settings: {
        preferred_output_format: outputFormat,
        enableCTCAE,
        enableCoding,
        newPatientVisit,
      },
      usage_delta: { [`output_format.${outputFormat}`]: 1 },
    }).catch(() => { /* best-effort */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputFormat, enableCTCAE, enableCoding, newPatientVisit]);

  // Auto-save an encounter whenever a note lands with content.
  //
  // Regenerations of the SAME visit (reconcile-with-previous, format switch)
  // produce a fresh note_id for an unchanged transcript. Saving each one
  // appended near-duplicate encounters — two cap slots and two "Recent
  // visits" rows per reconcile. Instead: save the new version first, then
  // delete the encounter it supersedes (never delete-first — a failed save
  // must not lose the visit).
  useEffect(() => {
    if (!user || !note) return;
    if (dailyCapReached) return;
    // Signature of the persistable state. Re-persist when it changes (new
    // note, OR a coding/format/toxicity change on an already-saved visit),
    // skip when it hasn't (unrelated re-renders).
    const codingSig = coding
      ? `${coding.recommended_em_code}|${coding.mdm_level}|${(coding.icd10_codes || []).map((c) => c.code).join(',')}`
      : '';
    const toxSig = (toxicities || []).map((t) => `${t.toxicity}:${t.grade}`).join(',');
    const backendCodingSig = backendCoding
      ? `${backendCoding.status}|${backendCoding.em?.recommended_code || ''}|${backendCoding.icd10.map((c) => c.code).join(',')}|${backendCoding.cpt.map((c) => c.code).join(',')}`
      : '';
    const decisionsSig = Object.entries(codingDecisions)
      .map(([k, v]) => `${k}:${v}`)
      .sort()
      .join(',');
    const visitMetaSig = `${totalTimeMinutes ?? ''}|${placeOfService}`;
    const sig = `${note.note_id}|${outputFormat}|${codingSig}|${toxSig}|${backendCodingSig}|${decisionsSig}|${visitMetaSig}`;

    // A restored visit is already saved — record its signature and skip.
    if (skipAutosaveForIdRef.current === note.note_id) {
      skipAutosaveForIdRef.current = null;
      lastSavedSigRef.current = sig;
      return;
    }
    if (sig === lastSavedSigRef.current) return;

    // Short debounce so the note→toxicities→coding burst on generation
    // collapses into ONE save (and rapid toggles don't churn rows), while
    // staying brief enough that navigating away right after generation still
    // persists. The cleanup cancels a pending save if state changes first.
    const timer = setTimeout(() => {
      const supersededId =
        transcript && lastAutoSaveRef.current?.transcript === transcript
          ? lastAutoSaveRef.current.id
          : null;
      const hasCodingData = !!(coding || backendCoding || Object.keys(codingDecisions).length > 0);
      const codingPayload: PersistedCoding | undefined = hasCodingData
        ? {
            client: coding || undefined,
            backend: backendCoding || undefined,
            decisions: Object.keys(codingDecisions).length ? codingDecisions : undefined,
            total_time_minutes: totalTimeMinutes ?? undefined,
            place_of_service: placeOfService || undefined,
          }
        : undefined;
      saveEncounter({
        output_format: outputFormat,
        note: note as unknown as Record<string, unknown>,
        transcript: transcript || undefined,
        coding: (codingPayload as unknown as Record<string, unknown>) || undefined,
        toxicities: (toxicities as unknown as Record<string, unknown>[]) || undefined,
      })
        .then((saved) => {
          lastAutoSaveRef.current = { id: saved.id, transcript: transcript || '' };
          lastSavedSigRef.current = sig;
          setTodaysEncounters((prev) => {
            const rest = supersededId ? prev.filter((e) => e.id !== supersededId) : prev;
            return [saved, ...rest].slice(0, 30);
          });
          setLastSavedEncounterId(saved.id);
          console.log('[encounters] saved', saved.id, supersededId ? `(supersedes ${supersededId})` : '');
          if (supersededId && supersededId !== saved.id) {
            // Best-effort: an orphaned superseded row self-deletes via the
            // 24h TTL anyway, so a failed delete is cosmetic, not fatal.
            deleteEncounter(supersededId).catch(() => undefined);
          }
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : 'save failed';
          if (msg.includes('Daily encounter cap')) {
            setDailyCapReached(true);
            setError(msg);
          } else {
            console.warn('[encounters] save failed:', msg);
          }
        });
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.note_id, outputFormat, coding, toxicities, user, dailyCapReached, backendCoding, codingDecisions, totalTimeMinutes, placeOfService]);

  // Track online/offline so the UI can show a status pill
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Sync the real value once we're on the client — the initial useState
    // seed is unconditionally `true` so SSR + hydration match.
    setNetworkOnline(navigator.onLine);
    const onOnline = () => {
      setNetworkOnline(true);
      queueRef.current?.drain();
    };
    const onOffline = () => setNetworkOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Re-run coding intelligence whenever an input the engine consumes changes.
  // Without this the coding result is frozen at note-generation time — so
  // toggling "New pt" or "Coding" or switching output format after the fact
  // wouldn't reflect the change until the physician re-recorded.
  useEffect(() => {
    if (!note) return;
    if (!enableCoding) {
      setCoding(null);
      return;
    }
    const codingResult = analyzeNoteForCoding({
      note,
      transcript,
      toxicities,
      outputFormat,
      newPatientVisit,
    });
    setCoding(codingResult);
    console.log(
      '[coding:recompute] em=',
      codingResult.recommended_em_code,
      'mdm=',
      codingResult.mdm_level,
      'newPt=',
      newPatientVisit,
      'format=',
      outputFormat
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, enableCoding, outputFormat, newPatientVisit, toxicities]);

  // Backend Coding Intelligence — POST /coding/analyze against the note's
  // grounded coding_facts. Only ever sees TODAY's facts + transcript, never
  // prior notes or claims. Not re-fired on every keystroke of total time /
  // place of service (those go through the manual Recalculate button below,
  // via handleRecalculateCoding) — network calls are debounced to explicit
  // triggers: a new note, or toggling Coding / New-patient.
  const runBackendCoding = async (n: OncologyNote, txn: string) => {
    if (!n.coding_facts) return;
    setBackendCodingLoading(true);
    setBackendCodingError(null);
    const sig = `${newPatientVisit}|${totalTimeMinutes ?? ''}|${placeOfService}`;
    try {
      const report = await analyzeCoding({
        codingFacts: n.coding_facts,
        transcript: txn,
        visitMeta: {
          new_patient: newPatientVisit,
          total_time_minutes: totalTimeMinutes,
          place_of_service: placeOfService || undefined,
        },
      });
      setBackendCoding(report);
      backendCodingSigRef.current = sig;
      setBackendCodingStale(false);
      // A freshly-fetched report supersedes any prior review — codes may
      // have changed. (Restore does NOT go through this function, so
      // restored decisions are never clobbered by this reset.)
      setCodingDecisions({});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Coding analysis failed.';
      setBackendCodingError(msg);
      console.warn('[coding:backend] failed:', msg);
    } finally {
      setBackendCodingLoading(false);
    }
  };

  const handleRecalculateCoding = () => {
    if (note) runBackendCoding(note, transcript);
  };

  useEffect(() => {
    // Restoring a saved visit already hydrated backendCoding + codingDecisions
    // directly — skip this firing so it doesn't immediately overwrite them
    // with a fresh (and possibly different) network result. Checked first and
    // unconditionally so it applies regardless of the enableCoding branch below.
    if (note && skipBackendCodingForIdRef.current === note.note_id) {
      skipBackendCodingForIdRef.current = null;
      return;
    }
    if (!note || !enableCoding || !note.coding_facts) {
      setBackendCoding(null);
      setBackendCodingError(null);
      setBackendCodingStale(false);
      return;
    }
    runBackendCoding(note, transcript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.note_id, enableCoding, newPatientVisit]);

  // Surface a "stale" hint (without auto-refetching) when the physician
  // edits total time / place of service after the last successful analysis.
  useEffect(() => {
    if (!backendCoding) {
      setBackendCodingStale(false);
      return;
    }
    const sig = `${newPatientVisit}|${totalTimeMinutes ?? ''}|${placeOfService}`;
    setBackendCodingStale(sig !== backendCodingSigRef.current);
  }, [newPatientVisit, totalTimeMinutes, placeOfService, backendCoding]);

  // Cleanup on unmount: stop any active stream/recorder + clear timers
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      delete document.documentElement.dataset.recording;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (sessionKeepAliveRef.current) {
        clearInterval(sessionKeepAliveRef.current);
        sessionKeepAliveRef.current = null;
      }
      audioChunksRef.current = [];
    };
  }, []);

  const isTrialIntent = currentIntent === 'clinical_trial_search';
  const hasOutput = !isTrialIntent && !!(transcript || note || loading || error);

  // Lock body scroll while a mobile overlay is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const overlayOpen = mobileNavOpen || mobileAIOpen;
    document.body.style.overflow = overlayOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen, mobileAIOpen]);

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row bg-canvas lg:overflow-hidden">
      {/* ── Mobile top bar (hidden on lg+) ─────────────────────────────── */}
      <header className="mobile-topbar safe-x">
        <div className="flex items-center justify-between px-4 h-14">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="tap-target -ml-2 text-ink"
            aria-label="Open navigation"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <a href={user ? '/app' : '/'} className="flex items-center gap-2" aria-label="Hei Atlas home">
            <div className="w-7 h-7 rounded-md bg-accent text-white flex items-center justify-center font-bold text-[12px]">
              HA
            </div>
            <span className="font-semibold text-[16px] text-accent tracking-tight">
              Hei Atlas
            </span>
          </a>
          <button
            type="button"
            onClick={() => setMobileAIOpen(true)}
            className="tap-target -mr-2 text-accent"
            aria-label="Open Ask Atlas"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L23 12l-6.857 2.143L14 21l-2.143-6.857L5 12l6.857-2.143L14 3z" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Left sidebar (desktop fixed / mobile drawer) ───────────────── */}
      <div className="hidden lg:block w-[260px] flex-shrink-0">
        <LeftSidebar user={user ? { name: user.name, credentials: user.credentials, email: user.email } : null} onLogout={sessionLogout} encounters={todaysEncounters} onSelectEncounter={handleSelectEncounter} />
      </div>
      {/* Mobile drawer */}
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="mobile-backdrop lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <div
        className={`mobile-drawer lg:hidden ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!mobileNavOpen}
      >
        <LeftSidebar user={user ? { name: user.name, credentials: user.credentials, email: user.email } : null} onLogout={sessionLogout} encounters={todaysEncounters} onSelectEncounter={handleSelectEncounter} />
      </div>

      {/* ── Center workspace ──────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 overflow-y-auto ds-scroll safe-x">
        <div className="max-w-[920px] mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-10 space-y-6">
          {/* Page header */}
          <div className="flex items-start sm:items-end justify-between gap-4 sm:gap-6 flex-wrap">
            <div>
              <h1 className="text-[22px] sm:text-[28px] font-bold text-ink leading-tight">
                New Encounter
              </h1>
              <p className="text-[14px] sm:text-[15px] text-muted mt-1 sm:mt-1.5">
                Capture, transcribe, and document — built by oncologists for oncologists.
              </p>
            </div>
            <div className="flex items-center gap-3 sm:gap-2 flex-wrap">
              <NetworkPill
                online={networkOnline}
                pendingCount={pendingUploads.length}
                onClick={() => setUploadsPanelOpen(true)}
              />
              <Toggle
                label="New pt"
                checked={newPatientVisit}
                onChange={() => setNewPatientVisit((v) => !v)}
              />
              <Toggle
                label="CTCAE"
                checked={enableCTCAE}
                onChange={() => setEnableCTCAE((v) => !v)}
              />
              <Toggle
                label="Coding"
                checked={enableCoding}
                onChange={() => setEnableCoding((v) => !v)}
              />
            </div>
          </div>

          {/* Output format tabs — horizontally scrollable on mobile so the
              tab labels don't wrap or truncate inside the 4-up grid. */}
          <div className="ds-card overflow-hidden">
            <div className="flex border-b border-rule overflow-x-auto ds-scroll snap-x snap-mandatory">
              {(
                [
                  'History and Physical',
                  'Consultation',
                  'Follow Up Note',
                  'Assessment and Plan Only',
                ] as OutputFormat[]
              ).map((fmt) => {
                const isActive = outputFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setOutputFormat(fmt)}
                    disabled={loading}
                    aria-pressed={isActive}
                    className={`flex-1 min-w-[140px] snap-start px-3 sm:px-4 py-3.5 text-[13px] sm:text-[14px] font-medium transition-colors duration-200 relative whitespace-nowrap
                      ${isActive ? 'text-accent' : 'text-muted hover:text-ink'}
                      ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {fmt}
                    {isActive && (
                      <span className="absolute inset-x-4 -bottom-px h-[2px] bg-accent rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* ATLAS recording area */}
            <div className="px-4 sm:px-10 py-8 sm:py-12 flex flex-col items-center gap-5 sm:gap-6">
              <div className="relative flex items-center justify-center">
                {/* Pulse rings only when actively recording (not paused). */}
                {isListening && !isPaused && (
                  <>
                    <div className="absolute w-40 h-40 bg-red-500 rounded-full opacity-0 animate-pulse-ring"></div>
                    <div
                      className="absolute w-40 h-40 bg-red-500 rounded-full opacity-0 animate-pulse-ring"
                      style={{ animationDelay: '0.5s' }}
                    ></div>
                  </>
                )}
                <button
                  onClick={handleMicrophoneClick}
                  disabled={loading}
                  className={`microphone-button ${isListening ? 'active' : ''} ${
                    isPaused ? '!bg-amber-500 hover:!bg-amber-600' : ''
                  } ${
                    !isListening ? '!bg-white hover:!bg-canvas ring-1 ring-rule' : ''
                  } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  aria-label={
                    !isListening
                      ? 'Start ATLAS ambient listening'
                      : isPaused
                      ? 'Resume ATLAS listening'
                      : 'Pause ATLAS listening'
                  }
                  title={
                    !isListening
                      ? 'ATLAS — click to start'
                      : isPaused
                      ? 'ATLAS paused — click to resume'
                      : 'ATLAS listening — click to pause'
                  }
                >
                  {!isListening ? (
                    // Idle: the brand mesh globe (same artwork as the homepage)
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/globe.png"
                      alt=""
                      className="w-24 h-24 object-contain select-none pointer-events-none"
                      draggable={false}
                      aria-hidden="true"
                    />
                  ) : isPaused ? (
                    // Paused: play triangle
                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    // Recording: pause bars
                    <svg className="w-16 h-16 animate-pulse" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="text-center max-w-md">
                <p className="text-[19px] font-semibold text-ink mb-1.5">
                  {!isListening
                    ? 'ATLAS'
                    : isPaused
                    ? 'ATLAS paused — click to resume'
                    : 'ATLAS is listening — click to pause'}
                </p>
                <p className="text-[14px] text-muted leading-relaxed">
                  {!isListening
                    ? 'Ambient listening — powered by NCCN, ESMO, ASCO, clinical trials, and AI reasoning'
                    : isPaused
                    ? 'Recording paused — no audio is being captured. Click to resume.'
                    : 'Ambient listening for oncology decision support'}
                </p>
              </div>

              {/* Explicit stop button — visible only while a recording is in
                  progress (recording or paused). Ends the encounter and
                  processes the audio through the transcription pipeline. */}
              {isListening && (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={loading}
                  className="mt-1 inline-flex items-center gap-2 px-5 py-2.5 text-[14px] font-medium bg-white text-ink border border-rule rounded-full hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Stop ATLAS and process encounter"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  Stop &amp; transcribe
                </button>
              )}

              {/* Previous note loader */}
              <div className="w-full max-w-xl">
                <button
                  type="button"
                  onClick={() => setShowPreviousNote((s) => !s)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink hover:bg-canvas rounded-button transition-colors duration-150"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {showPreviousNote ? 'Hide previous note' : 'Load previous note'}
                  {previousNote.trim() && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-accent-subtle text-accent rounded">
                      loaded
                    </span>
                  )}
                </button>

                {showPreviousNote && (
                  <div className="mt-3 ds-card p-4">
                    <div className="ds-label mb-2">Previous encounter note</div>
                    <textarea
                      value={previousNote}
                      // Decode entities on PASTE only. Doing it on every
                      // keystroke re-transformed the whole buffer (the decode
                      // isn't idempotent for "&amp;amp;…" chains), so React
                      // rewrote the value mid-word and the caret jumped to the
                      // end. onChange now stores the raw value verbatim.
                      onChange={(e) => setPreviousNote(e.target.value)}
                      onPaste={(e) => {
                        const text = e.clipboardData?.getData('text');
                        if (text && /&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/.test(text)) {
                          e.preventDefault();
                          const el = e.currentTarget;
                          const start = el.selectionStart ?? previousNote.length;
                          const end = el.selectionEnd ?? previousNote.length;
                          const decoded = decodeHtmlEntities(text);
                          setPreviousNote(previousNote.slice(0, start) + decoded + previousNote.slice(end));
                        }
                      }}
                      rows={6}
                      placeholder="Paste prior note — it reorganizes into today's note automatically."
                      className="ds-input resize-y leading-relaxed"
                    />
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => setPreviousNote('')}
                        disabled={!previousNote}
                        className="btn-ghost text-[13px] disabled:opacity-40"
                      >
                        Clear
                      </button>
                      {note && previousNote.trim() && (
                        <button
                          type="button"
                          onClick={handleReconcileWithPrevious}
                          disabled={reconciling || loading}
                          className="btn-primary ml-auto text-[13px] py-2"
                        >
                          {reconciling ? 'Reorganizing…' : 'Reorganize with previous note'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results panel */}
          {hasOutput && (
            <ResultsPanel
              transcript={transcript}
              note={note}
              cds={cds}
              outputFormat={outputFormat}
              previousNote={previousNote}
              toxicities={toxicities}
              enableCTCAE={enableCTCAE}
              coding={coding}
              enableCoding={enableCoding}
              loading={loading}
              loadingStage={loadingStage}
              error={error}
              onClose={resetResults}
              onRetryNote={handleRetryNote}
              onMatchTrials={handleMatchTrials}
              trialsLoading={trialsLoading}
              trialsRequested={trialsRequested}
              savedEncounterId={lastSavedEncounterId}
              backendCoding={backendCoding}
              backendCodingLoading={backendCodingLoading}
              backendCodingError={backendCodingError}
              backendCodingStale={backendCodingStale}
              totalTimeMinutes={totalTimeMinutes}
              onTotalTimeMinutesChange={setTotalTimeMinutes}
              placeOfService={placeOfService}
              onPlaceOfServiceChange={setPlaceOfService}
              onRecalculateCoding={handleRecalculateCoding}
              codingDecisions={codingDecisions}
              onCodingDecisionsChange={setCodingDecisions}
            />
          )}

          {/* Nearby trials panel (driven by AI panel typed query w/ trial intent) */}
          <NearbyTrialsPanel
            trials={nearbyTrials}
            loading={nearbyLoading || (isTrialIntent && loading)}
            error={nearbyError}
            query={nearbyQueryUsed}
            expandedRadius={nearbyExpanded}
            title={isTrialIntent ? 'Clinical Trials Near You' : 'Nearby Clinical Trials'}
            onClose={closeNearbyTrials}
          />
        </div>
      </main>

      {/* Right AI sidebar — Ask Atlas (Molecular Diagnostics & AI Workspace) */}
      {/* Single instance, mounted in either the desktop sidebar or the mobile sheet. */}
      {(() => {
        const askAtlas = (
          <AIPanel
            value={searchQuery}
            disabled={loading}
            onChange={setSearchQuery}
            onSubmit={() => {
              if (searchQuery.trim()) {
                const q = searchQuery.trim();
                runFromText(q);
                setSearchQuery('');
                setMobileAIOpen(false);
              }
            }}
            onSelectPrompt={(p) => {
              setSearchQuery(p);
              runFromText(p);
              setSearchQuery('');
              setMobileAIOpen(false);
            }}
            onMicrophoneClick={handleMicrophoneClick}
            isListening={isListening}
            note={note}
            coding={coding}
            toxicities={toxicities}
            transcript={transcript}
            extraWidgets={
              <div className="space-y-3">
                <div className="ds-card p-4">
                  <div className="ds-label mb-2">Trial Location</div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleUseMyLocation}
                      disabled={locationStatus === 'requesting'}
                      className={`btn-secondary text-[13px] py-2 ${
                        locationStatus === 'detected'
                          ? '!border-accent/30 !text-accent !bg-accent-subtle'
                          : ''
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {locationStatus === 'detected' ? 'Location detected' : 'Use my location'}
                    </button>
                    {locationMessage && (
                      <p
                        className={`text-[12px] ${
                          locationStatus === 'detected'
                            ? 'text-accent'
                            : locationStatus === 'denied'
                            ? 'text-red-600'
                            : 'text-muted'
                        }`}
                      >
                        {locationMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            }
          />
        );
        return (
          <>
            {/* Desktop sidebar */}
            <div className="hidden xl:block w-[460px] 2xl:w-[520px] flex-shrink-0">
              {askAtlas}
            </div>
            {/* Mobile bottom sheet */}
            {mobileAIOpen && (
              <button
                type="button"
                aria-label="Close Ask Atlas"
                className="mobile-backdrop xl:hidden"
                onClick={() => setMobileAIOpen(false)}
              />
            )}
            <div
              className={`mobile-sheet xl:hidden ${
                mobileAIOpen ? 'translate-y-0' : 'translate-y-full'
              }`}
              aria-hidden={!mobileAIOpen}
            >
              {/* Grab handle + close affordance */}
              <div className="relative pt-2 pb-1">
                <div className="mx-auto w-10 h-1 rounded-full bg-rule" />
                <button
                  type="button"
                  onClick={() => setMobileAIOpen(false)}
                  className="absolute top-1 right-3 tap-target text-muted"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="h-[calc(88dvh-2rem)]">{askAtlas}</div>
            </div>
          </>
        );
      })()}

      {/* Pending uploads queue panel — opens via the NetworkPill */}
      <PendingUploadsPanel
        open={uploadsPanelOpen}
        online={networkOnline}
        items={pendingUploads}
        queue={queueRef.current}
        onClose={() => setUploadsPanelOpen(false)}
      />
    </div>
  );
}

// Inline toggle component used in the workspace header
// Network + queue status pill — shown in the workspace header. Reflects:
//   ● green "Online"           — live, queue empty
//   ● amber "Online · N saved"  — live, N recordings still uploading
//   ● gray  "Offline · N saved" — no network, recordings safely persisted
//   ● gray  "Offline"           — no network, no queued work
function NetworkPill({
  online,
  pendingCount,
  onClick,
}: {
  online: boolean;
  pendingCount: number;
  onClick?: () => void;
}) {
  const cls = !online
    ? 'bg-slate-100 text-slate-700 border-slate-200'
    : pendingCount > 0
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  const dot = !online
    ? 'bg-slate-500'
    : pendingCount > 0
    ? 'bg-amber-500 animate-pulse'
    : 'bg-emerald-500';
  const label = !online
    ? pendingCount > 0
      ? `Offline · ${pendingCount} saved`
      : 'Offline'
    : pendingCount > 0
    ? `Uploading · ${pendingCount} queued`
    : 'Online';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-full border ${cls} ${
        onClick ? 'hover:brightness-95 cursor-pointer' : ''
      }`}
      title={
        online
          ? pendingCount > 0
            ? 'Recordings are uploading in the background — tap to view queue.'
            : 'Live connection to the backend.'
          : pendingCount > 0
          ? 'No connection — tap to view saved recordings.'
          : 'No connection. Recording still works; transcripts will appear when the network returns.'
      }
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </Tag>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
          checked ? 'bg-accent' : 'bg-rule'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}
