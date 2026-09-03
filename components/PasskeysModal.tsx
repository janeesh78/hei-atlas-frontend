'use client';

import { useEffect, useState } from 'react';
import {
  browserSupportsWebAuthn,
  deletePasskey,
  listPasskeys,
  registerPasskey,
  type PasskeyListItem,
} from '@/lib/webauthn';

interface PasskeysModalProps {
  onClose: () => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export default function PasskeysModal({ onClose }: PasskeysModalProps) {
  const [passkeys, setPasskeys] = useState<PasskeyListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  const load = async () => {
    try {
      setPasskeys(await listPasskeys());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load your passkeys.');
    }
  };

  useEffect(() => {
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async () => {
    setAdding(true);
    setAddError(null);
    try {
      await registerPasskey(label.trim() || undefined);
      setLabel('');
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add this passkey.');
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await deletePasskey(id);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not remove this passkey.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="passkeys-title"
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center px-4"
    >
      <div className="w-full max-w-md bg-surface rounded-card shadow-card p-5 space-y-4 max-h-[85vh] overflow-y-auto ds-scroll">
        <div className="flex items-center justify-between">
          <h2 id="passkeys-title" className="text-[16px] font-semibold text-ink">Passkeys</h2>
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

        <p className="text-[13px] text-muted">
          Sign in with Touch ID, Face ID, Windows Hello, or a security key — no email code needed. Your
          email sign-in always keeps working alongside this.
        </p>

        {loadError && (
          <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-button px-3 py-2">
            {loadError}
          </p>
        )}

        {passkeys === null && !loadError ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : passkeys && passkeys.length > 0 ? (
          <ul className="space-y-2">
            {passkeys.map((pk) => (
              <li key={pk.id} className="ds-card p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink truncate">
                    {pk.device_label || 'Unnamed passkey'}
                  </p>
                  <p className="text-[12px] text-muted">
                    Added {formatDate(pk.created_at)}
                    {pk.last_used_at ? ` · last used ${formatDate(pk.last_used_at)}` : ' · never used'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { void handleRemove(pk.id); }}
                  disabled={removingId === pk.id}
                  className="text-[12px] text-muted hover:text-rose-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {removingId === pk.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          passkeys && (
            <p className="text-[13px] text-muted">No passkeys yet.</p>
          )
        )}

        <div className="pt-2 border-t border-rule space-y-2">
          {!supported ? (
            <p className="text-[13px] text-muted">Passkeys aren&apos;t supported in this browser.</p>
          ) : (
            <>
              <label className="ds-label" htmlFor="passkey-label">Add a passkey (optional label)</label>
              <div className="flex gap-2">
                <input
                  id="passkey-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., MacBook Touch ID"
                  className="ds-input flex-1"
                  disabled={adding}
                />
                <button
                  type="button"
                  onClick={() => { void handleAdd(); }}
                  disabled={adding}
                  className="btn-primary text-[13px] px-3 whitespace-nowrap disabled:opacity-60"
                >
                  {adding ? 'Adding…' : 'Add passkey'}
                </button>
              </div>
              {addError && (
                <p className="text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-button px-3 py-2">
                  {addError}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
