'use client';

import { useState } from 'react';
import type {
  CodingResult,
  ComplexityItem,
  ComplexityLevel,
  MdmLevel,
} from '@/lib/coding';

interface CodingPanelProps {
  result: CodingResult;
}

const mdmColor = (lvl: MdmLevel): string => {
  switch (lvl) {
    case 'High':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Moderate':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Low':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const complexityColor = (lvl: ComplexityLevel): string => {
  switch (lvl) {
    case 'High':
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 'Moderate':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'Low':
      return 'bg-blue-50 text-blue-800 border-blue-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

const gapSeverityColor = (sev: 'minor' | 'moderate' | 'critical'): string => {
  switch (sev) {
    case 'critical':
      return 'border-rose-200 bg-rose-50';
    case 'moderate':
      return 'border-amber-200 bg-amber-50';
    case 'minor':
      return 'border-slate-200 bg-slate-50';
  }
};

const flagColor = (sev: 'info' | 'warning' | 'error'): string => {
  switch (sev) {
    case 'error':
      return 'border-rose-200 bg-rose-50 text-rose-800';
    case 'warning':
      return 'border-amber-200 bg-amber-50 text-amber-800';
    case 'info':
      return 'border-blue-200 bg-blue-50 text-blue-800';
  }
};

const ComplexityList = ({ items, label }: { items: ComplexityItem[]; label: string }) => {
  if (items.length === 0) {
    return (
      <div>
        <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
          {label}
        </h4>
        <p className="text-xs text-gray-500 italic">Minimal — no qualifying findings.</p>
      </div>
    );
  }
  return (
    <div>
      <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
        {label}
      </h4>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={i} className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-medium text-gray-900">{it.description}</p>
              <span
                className={`px-2 py-0.5 text-[11px] font-semibold rounded border ${complexityColor(
                  it.level
                )} whitespace-nowrap`}
              >
                {it.level}
              </span>
            </div>
            {it.evidence && (
              <p className="text-xs text-gray-600 italic mt-1 leading-snug">
                Evidence: <span className="text-gray-700">&ldquo;{it.evidence}&rdquo;</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default function CodingPanel({ result }: CodingPanelProps) {
  const [showJson, setShowJson] = useState(false);

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Copy JSON failed:', err);
    }
  };

  return (
    <section className="space-y-5 break-inside-avoid">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Coding Intelligence
        </h3>
        <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-100 text-gray-600 rounded border border-gray-200">
          v{result.engine_version}
        </span>
        <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-100 text-gray-600 rounded border border-gray-200">
          confidence {Math.round(result.confidence_score * 100)}%
        </span>
      </div>

      {/* Top-line E/M card */}
      <div className="border border-gray-200 rounded-xl p-4 md:p-5 bg-gradient-to-br from-white to-gray-50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1">
              Visit type
            </p>
            <p className="text-sm font-semibold text-gray-900">{result.visit_type}</p>
          </div>
          <div className="md:text-right">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-1">
              Recommended E/M
            </p>
            <div className="flex md:justify-end items-center gap-2">
              <span className="text-2xl font-bold font-mono text-gray-900">
                {result.recommended_em_code}
              </span>
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded border ${mdmColor(
                  result.mdm_level
                )}`}
              >
                {result.mdm_level} MDM
              </span>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed mt-3 pt-3 border-t border-gray-100">
          {result.coding_rationale}
        </p>
      </div>

      {/* MDM breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ComplexityList items={result.problem_complexity} label="Problems Addressed" />
        <ComplexityList items={result.data_complexity} label="Data Complexity" />
        <ComplexityList items={result.risk_complexity} label="Risk of Management" />
      </div>

      {/* ICD-10 */}
      {result.icd10_codes.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
            ICD-10 Diagnoses
          </h4>
          <ul className="space-y-2">
            {result.icd10_codes.map((c, i) => (
              <li
                key={i}
                className="border border-gray-200 rounded-lg p-3 bg-white flex items-start gap-3"
              >
                <span className="px-2 py-1 text-xs font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded whitespace-nowrap">
                  {c.code}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{c.description}</p>
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      {c.primary && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 rounded">
                          PRIMARY
                        </span>
                      )}
                      <span className="text-[10px] text-gray-500 font-mono">
                        {Math.round(c.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                  {c.evidence && (
                    <p className="text-xs text-gray-600 italic mt-1 leading-snug">
                      Evidence: <span className="text-gray-700">&ldquo;{c.evidence}&rdquo;</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CPT */}
      {result.cpt_codes.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
            CPT Recommendations
          </h4>
          <ul className="space-y-2">
            {result.cpt_codes.map((c, i) => (
              <li
                key={i}
                className="border border-gray-200 rounded-lg p-3 bg-white flex items-start gap-3"
              >
                <span className="px-2 py-1 text-xs font-mono font-bold bg-purple-50 text-purple-800 border border-purple-200 rounded whitespace-nowrap">
                  {c.code}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">{c.description}</p>
                    {c.addOn && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 rounded whitespace-nowrap">
                        ADD-ON
                      </span>
                    )}
                  </div>
                  {c.rationale && (
                    <p className="text-xs text-gray-600 mt-1 leading-snug">{c.rationale}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Documentation gaps */}
      {result.documentation_gaps.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
            Documentation Improvements
          </h4>
          <ul className="space-y-2">
            {result.documentation_gaps.map((g, i) => (
              <li
                key={i}
                className={`border rounded-lg p-3 ${gapSeverityColor(g.severity)}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-semibold text-gray-900">{g.area}</p>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-white text-gray-700 border border-gray-200 rounded uppercase">
                    {g.severity}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">{g.description}</p>
                <p className="text-xs text-gray-800 leading-relaxed mt-1">
                  <span className="font-semibold">Suggestion:</span> {g.suggestion}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Compliance flags */}
      {result.compliance_flags.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-[0.08em] mb-2">
            Compliance Flags
          </h4>
          <ul className="space-y-2">
            {result.compliance_flags.map((f, i) => (
              <li key={i} className={`border rounded-lg p-3 text-xs leading-snug ${flagColor(f.severity)}`}>
                <span className="font-semibold uppercase mr-2">{f.type}</span>
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* JSON view (collapsed) */}
      <div className="print-hide">
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline"
        >
          {showJson ? 'Hide' : 'Show'} structured JSON
        </button>
        {showJson && (
          <div className="mt-2 relative">
            <button
              type="button"
              onClick={handleCopyJson}
              className="absolute top-2 right-2 text-[10px] font-medium text-gray-600 bg-white border border-gray-300 rounded px-2 py-1 hover:bg-gray-50"
            >
              Copy JSON
            </button>
            <pre className="text-[11px] leading-snug bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}
