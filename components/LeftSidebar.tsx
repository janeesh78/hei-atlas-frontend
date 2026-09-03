'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Left sidebar — primary navigation, favorites, recent visits, profile.
 * Fixed width on desktop, slides under the workspace on tablet. Scrolls
 * independently of the rest of the page.
 */

// Spreadsheet-style label for the Nth visit of the day: 0→A … 25→Z, 26→AA …
function patientLetter(rank: number): string {
  let s = '';
  let n = rank;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

interface UserChip {
  name: string;
  credentials: string;
  email: string;
}
interface EncounterListItem {
  id: string;
  patient_ref: string | null;
  output_format: string;
  created_at: string;
}
interface LeftSidebarProps {
  user?: UserChip | null;
  onLogout?: () => void;
  encounters?: EncounterListItem[];
  onSelectEncounter?: (id: string) => void;
  /** Clears the workspace for a new patient — distinct from the "New pt"
   *  billing toggle in the encounter panel (established vs. new-patient E/M
   *  coding). This button never touches that toggle. */
  onNewPatient?: () => void;
  /** Opens the passkey management modal (see PasskeysModal). */
  onOpenPasskeys?: () => void;
}

// Compact initials for the profile avatar tile.
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function LeftSidebar({
  user,
  onLogout,
  encounters,
  onSelectEncounter,
  onNewPatient,
  onOpenPasskeys,
}: LeftSidebarProps = {}) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <aside className="h-full w-full bg-surface border-r border-rule flex flex-col">
      {/* Brand + user chip at top-left */}
      <div className="px-5 py-4 border-b border-rule space-y-3">
        <Link
          href={user ? '/app' : '/'}
          className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          aria-label="Hei Atlas home"
        >
          <div className="w-8 h-8 rounded-lg bg-accent text-white flex items-center justify-center font-bold text-[14px]">
            HA
          </div>
          <span className="font-semibold text-[17px] text-accent tracking-tight">
            Hei Atlas
          </span>
        </Link>
        {user && (
          <div className="pt-2 border-t border-rule/60">
            <button
              type="button"
              onClick={() => setShowUserMenu((v) => !v)}
              className="w-full flex items-center gap-2.5 px-1 py-1 rounded-button hover:bg-canvas transition-colors duration-150"
              aria-label="User menu"
            >
              <div className="w-8 h-8 rounded-full bg-accent-subtle text-accent flex items-center justify-center font-semibold text-[12px]">
                {initials(user.name)}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-[13px] font-semibold text-ink truncate">{user.name}</div>
                <div className="text-[11px] text-muted truncate">{user.credentials}</div>
              </div>
              <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showUserMenu && (
              <div className="mt-1 ds-card p-1">
                <div className="px-2 py-1.5 text-[12px] text-muted truncate">{user.email}</div>
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onOpenPasskeys?.(); }}
                  className="w-full text-left px-2 py-1.5 text-[13px] text-ink hover:bg-canvas rounded-button"
                >
                  Passkeys
                </button>
                <button
                  type="button"
                  onClick={() => { setShowUserMenu(false); onLogout?.(); }}
                  className="w-full text-left px-2 py-1.5 text-[13px] text-ink hover:bg-canvas rounded-button"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable nav body */}
      <div className="flex-1 overflow-y-auto ds-scroll px-3 py-4 space-y-6">
        {/* Primary nav — Encounters is the only workspace today; it's
            always the current view, not a real navigation target. */}
        <nav>
          <ul className="space-y-0.5">
            <li>
              <div className="nav-item nav-item-active w-full">
                <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <span className="flex-1 text-left">Encounters</span>
              </div>
            </li>
          </ul>
        </nav>

        {onNewPatient && (
          <button
            type="button"
            onClick={onNewPatient}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-button border border-rule text-[13px] font-medium text-ink hover:bg-canvas hover:border-accent/40 transition-colors duration-150"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m-7-7h14" />
            </svg>
            New patient
          </button>
        )}

        <div>
          <div className="px-3 mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-[0.06em]">
              Recent visits
            </span>
            {encounters && encounters.length > 0 && (
              <span className="text-[11px] text-muted font-mono">{encounters.length}/30</span>
            )}
          </div>
          {encounters && encounters.length > 0 ? (
            <ul className="space-y-0.5 max-h-[280px] overflow-y-auto ds-scroll">
              {encounters.map((e, idx) => {
                // List arrives newest-first; "Patient A" is the first visit of
                // the day, so rank chronologically from the end of the list.
                const rank = encounters.length - 1 - idx;
                const t = new Date(e.created_at);
                const date = t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                const time = t.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => onSelectEncounter?.(e.id)}
                      className="w-full text-left px-3 py-2 rounded-button hover:bg-canvas transition-colors duration-150"
                    >
                      <div className="text-[14px] font-medium text-ink truncate">
                        {e.patient_ref?.trim() || `Patient ${patientLetter(rank)}`}
                      </div>
                      <div className="text-[12px] text-muted truncate">
                        {date} · {time}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 text-[12px] text-muted">No visits yet today.</p>
          )}
        </div>
      </div>
    </aside>
  );
}
