'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * Left sidebar — primary navigation, favorites, recent visits, profile.
 * Fixed width on desktop, slides under the workspace on tablet. Scrolls
 * independently of the rest of the page.
 */

interface NavItem {
  label: string;
  icon: React.ReactNode;
  badge?: string;
}

const PRIMARY_NAV: NavItem[] = [
  {
    label: 'Encounters',
    icon: (
      <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    label: 'Patients',
    icon: (
      <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    label: 'Trials',
    icon: (
      <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    label: 'Guidelines',
    icon: (
      <svg className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
];

const FAVORITES: NavItem[] = [
  {
    label: 'NSCLC Stage III',
    icon: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ),
  },
  { label: 'PACIFIC Regimen', icon: <Star /> },
  { label: 'EGFR Workup', icon: <Star /> },
];

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

function Star() {
  return (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
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
}: LeftSidebarProps = {}) {
  const [active, setActive] = useState('Encounters');
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
        {/* Primary nav */}
        <nav>
          <ul className="space-y-0.5">
            {PRIMARY_NAV.map((item) => {
              const isActive = active === item.label;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => setActive(item.label)}
                    className={`nav-item w-full ${isActive ? 'nav-item-active' : ''}`}
                  >
                    {item.icon}
                    <span className="flex-1 text-left">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <Section title="Favorites">
          <ul className="space-y-0.5">
            {FAVORITES.map((f) => (
              <li key={f.label}>
                <button type="button" className="nav-item w-full text-[14px]">
                  {f.icon}
                  <span className="flex-1 text-left truncate">{f.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </Section>

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
                        Patient {patientLetter(rank)}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 mb-2 text-[11px] font-semibold text-muted uppercase tracking-[0.06em]">
        {title}
      </div>
      {children}
    </div>
  );
}
