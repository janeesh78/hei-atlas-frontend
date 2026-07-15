'use client';

import type { ToxicityFinding, CtcaeGrade } from '@/lib/ctcae';

interface ToxicityPanelProps {
  findings: ToxicityFinding[];
  /** Optional override label — defaults to "Treatment Toxicities / CTCAE". */
  title?: string;
  /** Compact mode: smaller padding for embedding under A&P problems. */
  compact?: boolean;
}

const gradeBadge = (grade: CtcaeGrade): string => {
  // Subtle medical-tech palette — no bright alarm colors
  switch (grade) {
    case 1:
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 2:
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 3:
      return 'bg-orange-50 text-orange-800 border-orange-200';
    case 4:
      return 'bg-rose-50 text-rose-800 border-rose-200';
    case 5:
      return 'bg-gray-200 text-gray-800 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
};

export default function ToxicityPanel({
  findings,
  title = 'Treatment Toxicities / CTCAE',
  compact = false,
}: ToxicityPanelProps) {
  if (findings.length === 0) return null;

  const ver = findings[0]?.ctcaeVersion;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h3
          className={`${
            compact ? 'text-xs' : 'text-sm'
          } font-semibold text-gray-500 uppercase tracking-wide`}
        >
          {title}
        </h3>
        {ver && (
          <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-gray-100 text-gray-600 rounded border border-gray-200">
            CTCAE {ver}
          </span>
        )}
      </div>

      <ul className={`space-y-${compact ? '2' : '3'}`}>
        {findings.map((f, i) => (
          <li
            key={`${f.toxicity}-${i}`}
            className={`border border-gray-200 rounded-lg ${
              compact ? 'p-3' : 'p-4'
            } bg-white`}
          >
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="font-semibold text-gray-900 text-sm">{f.toxicity}</p>
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                  f.expected ? 'bg-sky-50 text-sky-800 border-sky-200' : gradeBadge(f.grade)
                } whitespace-nowrap`}
              >
                {f.expected ? 'Expected' : `Grade ${f.grade}`}
              </span>
            </div>

            {f.management.length > 0 && (
              <div className="mt-2">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                  Management Suggestions
                </p>
                <ul className="space-y-0.5">
                  {f.management.map((m, j) => (
                    <li
                      key={j}
                      className="text-xs text-gray-700 leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-gray-400"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
