'use client';

import type { NearbyTrial } from '@/lib/trials';

interface NearbyTrialsPanelProps {
  trials: NearbyTrial[];
  loading: boolean;
  error: string | null;
  query: string;
  /** True when no trials matched the initial radius and the search expanded. */
  expandedRadius?: boolean;
  /** Subtitle shown in the header — e.g., "Clinical Trials Near You". */
  title?: string;
  onClose: () => void;
}

const statusColor = (status: string): string => {
  if (status === 'Recruiting') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'Active, not recruiting') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (status === 'Enrolling by invitation') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
};

export default function NearbyTrialsPanel({
  trials,
  loading,
  error,
  query,
  expandedRadius = false,
  title = 'Nearby Clinical Trials',
  onClose,
}: NearbyTrialsPanelProps) {
  if (!loading && !error && trials.length === 0) return null;

  return (
    <div className="w-full bg-surface border border-rule rounded-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {query && (
            <p className="text-xs text-gray-500 mt-0.5">
              Matching: <span className="font-medium text-gray-700">{query}</span>
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium"
          aria-label="Close nearby trials"
        >
          ✕ Close
        </button>
      </div>

      <div className="px-6 py-6">
        {expandedRadius && !loading && trials.length > 0 && (
          <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
            No nearby trials found. Expanding search radius to broader US results.
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-base text-gray-700">Searching nearby clinical trials...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {!loading && !error && trials.length === 0 && (
          <div className="text-sm text-gray-600 py-2">
            No nearby trials found. Expanding search radius.
          </div>
        )}

        {!loading && !error && trials.length > 0 && (
          <ul className="space-y-3">
            {trials.map((t, i) => (
              <li
                key={`${t.nct}-${i}`}
                className="border border-gray-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition-all bg-white"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 leading-snug">
                      {t.title}
                    </h3>
                    <p className="text-xs text-gray-500 font-mono mt-1">{t.nct}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                    {t.phase && (
                      <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-800 rounded border border-purple-200">
                        {t.phase}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded border ${statusColor(
                        t.status
                      )}`}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-sm">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">
                      Institution
                    </p>
                    <p className="text-gray-900">{t.institution}</p>
                    <p className="text-xs text-gray-500">
                      {t.city}, {t.state}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-0.5">
                      Distance
                    </p>
                    <p className="text-gray-900 font-semibold">
                      {t.distance_miles} miles away
                    </p>
                  </div>
                  <div className="flex md:justify-end items-end">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      View Trial
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
                          d="M14 3h7v7m0-7L10 14m-7 7h7"
                        />
                      </svg>
                    </a>
                  </div>
                </div>

                {t.conditions && t.conditions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
                    {t.conditions.map((c, j) => (
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
        )}
      </div>
    </div>
  );
}
