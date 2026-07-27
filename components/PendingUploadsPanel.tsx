'use client';

import { useEffect } from 'react';
import type { PendingRecording, RecordingQueue } from '@/lib/recordingQueue';

interface PendingUploadsPanelProps {
  open: boolean;
  online: boolean;
  items: PendingRecording[];
  queue: RecordingQueue | null;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAge(ts: number): string {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

export default function PendingUploadsPanel({
  open,
  online,
  items,
  queue,
  onClose,
}: PendingUploadsPanelProps) {
  // Trap Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const total = items.length;
  const totalBytes = items.reduce((sum, i) => sum + i.sizeBytes, 0);
  // 401s ("Missing bearer token" / "Session expired") mean the upload is
  // blocked on auth, not on the network — surface the actual fix: sign in.
  const authBlocked = items.some((i) => i.lastError && /\b401\b/.test(i.lastError));

  return (
    <>
      <button
        type="button"
        aria-label="Close pending uploads"
        className="mobile-backdrop"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-surface border-l border-rule shadow-2xl flex flex-col safe-top safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-label="Pending uploads"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-rule flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-ink">Pending uploads</h2>
            <p className="text-[13px] text-muted mt-0.5">
              {total === 0
                ? 'All recordings have been uploaded.'
                : `${total} recording${total === 1 ? '' : 's'} · ${formatSize(totalBytes)} total`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-target text-muted hover:text-ink"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status banner */}
        {total > 0 && authBlocked && (
          <div className="mx-6 mt-4 px-3 py-2.5 rounded-button text-[13px] border bg-rose-50 text-rose-800 border-rose-200 flex items-center justify-between gap-3">
            <span>
              Session expired — recordings stay saved on this device and upload
              automatically after you sign in again.
            </span>
            <a
              href="/login"
              className="btn-primary text-[12px] py-1.5 px-3 whitespace-nowrap"
            >
              Sign in
            </a>
          </div>
        )}
        {total > 0 && !authBlocked && (
          <div
            className={`mx-6 mt-4 px-3 py-2 rounded-button text-[13px] border ${
              online
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {online
              ? 'Network is live — uploads will retry automatically.'
              : 'No network. Recordings are saved on this device and will upload automatically when the connection returns.'}
          </div>
        )}

        {/* Bulk actions */}
        {total > 0 && (
          <div className="px-6 py-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => queue?.drain(true)}
              disabled={!online}
              className="btn-primary text-[13px] py-2 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry all
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!queue) return;
                for (const item of items) await queue.discard(item.id);
              }}
              className="btn-secondary text-[13px] py-2"
            >
              Clear all
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto ds-scroll px-6 pb-6">
          {total === 0 ? (
            <div className="mt-10 text-center text-muted text-[14px]">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-medium text-ink">Queue empty</p>
              <p className="mt-1 text-[13px]">New recordings will appear here while they upload.</p>
            </div>
          ) : (
            <ul className="space-y-3 mt-2">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="ds-card p-4 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-ink">
                        Recording · {Math.round(item.durationSec)}s
                      </p>
                      <p className="text-[12px] text-muted mt-0.5 font-mono">
                        {item.id.slice(0, 10)} · {formatSize(item.sizeBytes)} · {formatAge(item.recordedAt)}
                      </p>
                    </div>
                    {item.attempts > 0 && (
                      <span
                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-full border whitespace-nowrap ${
                          item.lastError
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {item.attempts} attempt{item.attempts === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {item.lastError && (
                    <p className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-button px-2 py-1.5">
                      Last error: {item.lastError}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => queue?.drain(true)}
                      disabled={!online}
                      className="btn-secondary text-[12px] py-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Retry now
                    </button>
                    <button
                      type="button"
                      onClick={() => queue?.discard(item.id)}
                      className="text-[12px] text-muted hover:text-rose-700 ml-auto"
                    >
                      Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
