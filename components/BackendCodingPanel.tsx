'use client';

import { useEffect, useState } from 'react';
import type { CodingReport, CptSuggestion, IcdSuggestion } from '@/lib/api';
import type { CodingDecision } from '@/lib/auth';

interface BackendCodingPanelProps {
  report: CodingReport | null;
  loading: boolean;
  error: string | null;
  totalTimeMinutes: number | null;
  onTotalTimeMinutesChange: (v: number | null) => void;
  placeOfService: string;
  onPlaceOfServiceChange: (v: string) => void;
  onRecalculate: () => void;
  /** True once the physician has changed an input the report hasn't reflected
   *  yet (new patient / time / place of service) — surfaces a "stale" hint
   *  next to the Recalculate button instead of silently showing old codes. */
  stale: boolean;
  /** Per-item accept/dismiss review state. Lifted to the parent (rather than
   *  local state) so it persists across autosave/restore — the panel is a
   *  controlled component for review decisions. Cleared by the parent
   *  whenever a genuinely new report is fetched (recalculate / new note),
   *  never by this component, to avoid a restore-then-immediately-cleared race. */
  decisions: Record<string, CodingDecision>;
  onDecisionsChange: (decisions: Record<string, CodingDecision>) => void;
}

const POS_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: '11', label: '11 — Office' },
  { value: '19', label: '19 — Off-campus outpatient hospital' },
  { value: '22', label: '22 — On-campus outpatient hospital' },
  { value: '02', label: '02 — Telehealth (patient not at home)' },
  { value: '10', label: '10 — Telehealth (patient at home)' },
];

function decisionKey(kind: 'cpt' | 'icd10', code: string, index: number): string {
  return `${kind}:${index}:${code || 'unmapped'}`;
}

const decisionStyle = (d: CodingDecision): string => {
  switch (d) {
    case 'accepted':
      return 'border-emerald-200 bg-emerald-50';
    case 'dismissed':
      return 'border-gray-200 bg-gray-50 opacity-60';
    default:
      return 'border-gray-200 bg-white';
  }
};

function EvidenceQuote({ quote }: { quote: string | undefined | null }) {
  if (!quote) return null;
  return (
    <p className="text-xs text-gray-600 italic mt-1 leading-snug">
      Evidence: <span className="text-gray-700">&ldquo;{quote}&rdquo;</span>
    </p>
  );
}

function DecisionButtons({
  decision,
  onSet,
}: {
  decision: CodingDecision;
  onSet: (d: CodingDecision) => void;
}) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <button
        type="button"
        aria-pressed={decision === 'accepted'}
        onClick={() => onSet(decision === 'accepted' ? 'pending' : 'accepted')}
        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
          decision === 'accepted'
            ? 'bg-emerald-600 text-white border-emerald-600'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Accept
      </button>
      <button
        type="button"
        aria-pressed={decision === 'dismissed'}
        onClick={() => onSet(decision === 'dismissed' ? 'pending' : 'dismissed')}
        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${
          decision === 'dismissed'
            ? 'bg-gray-600 text-white border-gray-600'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
        }`}
      >
        Dismiss
      </button>
    </div>
  );
}

export default function BackendCodingPanel({
  report,
  loading,
  error,
  totalTimeMinutes,
  onTotalTimeMinutesChange,
  placeOfService,
  onPlaceOfServiceChange,
  onRecalculate,
  stale,
  decisions,
  onDecisionsChange,
}: BackendCodingPanelProps) {
  const [attested, setAttested] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  // Attestation is deliberately NOT lifted/persisted — re-opening a saved
  // visit (or getting a fresh report) should always require a fresh
  // attestation before codes can be copied for billing, never a stale
  // pre-checked box. Accept/dismiss `decisions`, by contrast, are lifted to
  // the parent and persisted — see the prop doc comment above.
  useEffect(() => {
    setAttested(false);
    setCopyState('idle');
  }, [report]);

  const setDecision = (key: string, d: CodingDecision) =>
    onDecisionsChange({ ...decisions, [key]: d });

  const handleCopyAccepted = async () => {
    if (!report?.em) return;
    const lines: string[] = [`E/M: ${report.em.recommended_code}`];
    report.cpt.forEach((c, i) => {
      const key = decisionKey('cpt', c.code, i);
      if (decisions[key] === 'dismissed') return;
      const mods = c.modifiers.length ? `-${c.modifiers.join('-')}` : '';
      lines.push(`CPT: ${c.code}${mods} — ${c.description}`);
    });
    report.icd10.forEach((c, i) => {
      const key = decisionKey('icd10', c.code, i);
      if (decisions[key] === 'dismissed') return;
      lines.push(`ICD-10 (${c.rank}): ${c.code} — ${c.description}`);
    });
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.error('Copy codes failed:', err);
    }
  };

  return (
    <section className="space-y-5 break-inside-avoid">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Coding Intelligence — Backend Review
        </h3>
        {report && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-100 text-gray-600 rounded border border-gray-200">
            {report.engine_version}
          </span>
        )}
      </div>

      {/* Visit inputs — feed the deterministic engine, not auto-recomputed on
          every keystroke (a network call per keystroke would be wasteful);
          the physician confirms via Recalculate. */}
      <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1">
            Total time (minutes)
          </label>
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={totalTimeMinutes ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              onTotalTimeMinutesChange(v === '' ? null : Math.max(0, Number(v)));
            }}
            placeholder="e.g. 32"
            className="w-28 text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1">
            Place of service
          </label>
          <select
            value={placeOfService}
            onChange={(e) => onPlaceOfServiceChange(e.target.value)}
            className="text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            {POS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {stale && !loading && (
            <span className="text-[11px] text-amber-700">Inputs changed — recalculate to update</span>
          )}
          <button
            type="button"
            onClick={onRecalculate}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Analyzing…' : 'Recalculate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
          {error} The note itself is unaffected — coding is a separate, optional step.
        </div>
      )}

      {report?.status === 'coding_failed' && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 text-sm text-amber-800">
          {report.error || 'Coding analysis failed. The note itself is unaffected.'}
        </div>
      )}

      {report?.status === 'ok' && report.em && (
        <>
          {/* Top-line E/M card */}
          <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-gradient-to-br from-white to-gray-50">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1">
                  MDM level
                </p>
                <p className="text-sm font-semibold text-gray-900">{report.em.mdm_level}</p>
              </div>
              <div className="md:text-right">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1">
                  Recommended E/M
                </p>
                <div className="flex md:justify-end items-center gap-2">
                  <span className="text-2xl font-bold font-mono text-gray-900">
                    {report.em.recommended_code}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-blue-50 text-blue-800 border-blue-200">
                    {report.em.basis === 'time' ? 'Time-based' : 'MDM-based'}
                  </span>
                </div>
              </div>
            </div>
            {report.em.time_path.documented_minutes != null && (
              <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-100">
                Documented time: {report.em.time_path.documented_minutes} min
                {report.em.time_path.supported_code
                  ? ` — supports ${report.em.time_path.supported_code}`
                  : ' — below the lowest time threshold'}
              </p>
            )}
          </div>

          {/* MDM grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                ['problems', 'Problems Addressed'],
                ['data', 'Data Complexity'],
                ['risk', 'Risk of Management'],
              ] as const
            ).map(([key, label]) => {
              const el = report.em!.mdm_grid[key];
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em]">
                      {label}
                    </h4>
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded border bg-slate-100 text-slate-700 border-slate-200">
                      {el.level}
                    </span>
                  </div>
                  {el.items.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">No qualifying findings.</p>
                  ) : (
                    <ul className="space-y-2">
                      {el.items.map((item, i) => (
                        <li key={i} className="border border-gray-200 rounded-lg p-3 bg-white">
                          <p className="text-sm font-medium text-gray-900">{item}</p>
                          <EvidenceQuote quote={el.evidence_spans[i]?.quote} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* ICD-10 */}
          {report.icd10.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
                ICD-10 Diagnoses
              </h4>
              <ul className="space-y-2">
                {report.icd10.map((c: IcdSuggestion, i) => {
                  const key = decisionKey('icd10', c.code, i);
                  const decision = decisions[key] || 'pending';
                  return (
                    <li
                      key={key}
                      className={`border rounded-lg p-3 flex items-start gap-3 ${decisionStyle(decision)}`}
                    >
                      <span className="px-2 py-1 text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded whitespace-nowrap">
                        {c.code || '—'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{c.description}</p>
                          <div className="flex items-center gap-2">
                            {c.rank === 'primary' && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 rounded whitespace-nowrap">
                                PRIMARY
                              </span>
                            )}
                            <DecisionButtons decision={decision} onSet={(d) => setDecision(key, d)} />
                          </div>
                        </div>
                        {c.sequencing_rationale && (
                          <p className="text-xs text-gray-600 mt-1 leading-snug">{c.sequencing_rationale}</p>
                        )}
                        {c.specificity_flags.length > 0 && (
                          <p className="text-xs text-amber-700 mt-1 leading-snug">
                            {c.specificity_flags.includes('unmapped_manual_review')
                              ? 'No reference match — verify code manually.'
                              : 'More specific code may be available (site/laterality).'}
                          </p>
                        )}
                        <EvidenceQuote quote={c.evidence_span?.quote} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* CPT */}
          {report.cpt.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
                CPT Suggestions
              </h4>
              <ul className="space-y-2">
                {report.cpt.map((c: CptSuggestion, i) => {
                  const key = decisionKey('cpt', c.code, i);
                  const decision = decisions[key] || 'pending';
                  return (
                    <li
                      key={key}
                      className={`border rounded-lg p-3 flex items-start gap-3 ${decisionStyle(decision)}`}
                    >
                      <span className="px-2 py-1 text-xs font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200 rounded whitespace-nowrap">
                        {c.code || '—'}
                        {c.modifiers.map((m) => `-${m}`).join('')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{c.description}</p>
                          <DecisionButtons decision={decision} onSet={(d) => setDecision(key, d)} />
                        </div>
                        <EvidenceQuote quote={c.evidence_spans[0]?.quote} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Documentation gaps — neutral, informational phrasing (never
              phrased as an error or a compliance accusation). */}
          {report.em.documentation_gaps.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
                Documentation Notes
              </h4>
              <ul className="space-y-2">
                {report.em.documentation_gaps.map((g, i) => (
                  <li key={i} className="border border-slate-200 bg-slate-50 rounded-lg p-3 text-xs text-slate-700 leading-relaxed">
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Attestation gate — must attest before exporting codes for billing use. */}
          <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={attested}
                onChange={(e) => setAttested(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I have reviewed these draft coding suggestions against the encounter and take
                responsibility for final code selection.
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCopyAccepted}
                disabled={!attested}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {copyState === 'copied' ? 'Copied' : 'Copy codes for billing'}
              </button>
              <p className="text-[11px] text-gray-500">{report.disclaimer}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
