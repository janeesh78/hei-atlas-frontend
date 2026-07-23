'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchMe, getCachedUser, getToken, setCachedUser, setToken, TOKEN_KEY, type CurrentUser } from './auth';
import { apiFetch } from './apiBase';

// HIPAA §164.312(a)(2)(iii) inactivity timeout. Match the server-side
// SESSION_TTL exactly so the client + server agree on when to sign out.
const IDLE_MS = 30 * 60 * 1000;
const WARN_MS = 28 * 60 * 1000;

// Cross-tab activity broadcast: every tab writes its own activity here so an
// idle-but-open tab doesn't clock out a session another tab is actively
// using — all tabs of a browser share one token and are one logical session.
const ACTIVITY_KEY = 'oncology.lastActivity';

function broadcastActivity(now: number): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(now));
  } catch {
    /* storage unavailable (private mode etc.) — this tab's own clock still works */
  }
}

function readBroadcastActivity(): number {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

interface SessionValue {
  user: CurrentUser | null;
  isBooting: boolean;
  idleWarning: boolean;
  setUser: (u: CurrentUser | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  dismissIdleWarning: () => void;
  /** Milliseconds since the last real user action (mouse/keyboard/touch). */
  getIdleMs: () => number;
}

const SessionCtx = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession() outside SessionProvider');
  return v;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [idleWarning, setIdleWarning] = useState(false);
  const lastActivity = useRef<number>(Date.now());
  const getIdleMs = useCallback(() => Date.now() - lastActivity.current, []);

  const setUser = useCallback((u: CurrentUser | null) => {
    setUserState(u);
    setCachedUser(u);
  }, []);

  const dismissIdleWarning = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleWarning(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUserState(null);
      setIsBooting(false);
      return;
    }
    try {
      const u = await fetchMe();
      setUserState(u);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401 || status === 403) {
        // The server explicitly rejected the session — sign out for real.
        setToken(null);
        setCachedUser(null);
        setUserState(null);
      }
      // Anything else (network blip, backend deploy/restart, 5xx) is
      // transient: keep the token and cached user. Clearing here signed the
      // physician out MID-RECORDING during a backend restart (2026-07-09) —
      // the finished recording then uploaded with no bearer token and
      // stalled at 401 until re-login.
    } finally {
      setIsBooting(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // Capture the token BEFORE clearing local state — the server needs it to
    // invalidate this device's session row. Only this device's session dies;
    // the same physician's other devices stay signed in.
    const token = getToken();
    setToken(null);
    setCachedUser(null);
    setUserState(null);
    try {
      await apiFetch('/auth/logout', {
        method: 'POST',
        keepalive: true,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch {
      /* swallow */
    }
  }, []);

  useEffect(() => {
    const cached = getCachedUser();
    if (cached) setUserState(cached);
    refresh();
  }, [refresh]);

  // ── Cross-tab session sync ───────────────────────────────────────────
  // Sign-in or sign-out in one tab must apply to every tab of the same
  // browser — they share one localStorage token and are one logical
  // session. `storage` only fires in OTHER tabs, never the one that made
  // the change, which is exactly what we want here. Re-run the same
  // refresh() used at boot so a token appearing/disappearing elsewhere is
  // handled by the one code path that already knows how to validate it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) void refresh();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  // ── Inactivity timeout ────────────────────────────────────────────────
  // Reset the timer on any real user action, in THIS tab or any other tab
  // of the same browser (activity broadcasts via localStorage + `storage`
  // events — see ACTIVITY_KEY). Without this, an idle-but-open tab runs its
  // own independent clock and logs out the shared token from under a tab
  // the physician is actively using. When >30 min elapses with no activity
  // ANYWHERE, force a logout. Show a warning at 28 min so the user can
  // dismiss it and stay signed in.
  useEffect(() => {
    if (!user) return;
    const mark = () => {
      const now = Date.now();
      lastActivity.current = now;
      broadcastActivity(now);
      if (idleWarning) setIdleWarning(false);
    };
    const events: (keyof DocumentEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => document.addEventListener(e, mark, { passive: true }));

    // Another tab's activity (including its recording-in-progress bump
    // below) resets our idle clock too, without waiting for the next poll.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== ACTIVITY_KEY || !e.newValue) return;
      const t = Number(e.newValue);
      if (t > lastActivity.current) {
        lastActivity.current = t;
        if (idleWarning) setIdleWarning(false);
      }
    };
    window.addEventListener('storage', onStorage);

    const iv = setInterval(() => {
      // An active ATLAS recording is presence, not idleness: ambient capture
      // is hands-off by design, and auto-logoff here killed recordings
      // mid-consult (field report 2026-07-09). The flag is set by the
      // ambient page while MediaRecorder is live or paused. Bumping (and
      // broadcasting) the clock also makes the 30-min window restart from
      // recording END, and keeps a recording in one tab from being logged
      // out from under it by an idle sibling tab.
      if (document.documentElement.dataset.recording === '1') {
        const now = Date.now();
        lastActivity.current = now;
        broadcastActivity(now);
        if (idleWarning) setIdleWarning(false);
        return;
      }
      const shared = readBroadcastActivity();
      if (shared > lastActivity.current) lastActivity.current = shared;
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) logout();
      else if (idle >= WARN_MS) setIdleWarning(true);
    }, 15_000);
    return () => {
      events.forEach((e) => document.removeEventListener(e, mark));
      window.removeEventListener('storage', onStorage);
      clearInterval(iv);
    };
  }, [user, idleWarning, logout]);

  return (
    <SessionCtx.Provider value={{ user, isBooting, idleWarning, setUser, refresh, logout, dismissIdleWarning, getIdleMs }}>
      {children}
      {idleWarning && user && (
        <IdleWarningModal onStay={dismissIdleWarning} onSignOut={logout} />
      )}
    </SessionCtx.Provider>
  );
}

function IdleWarningModal({ onStay, onSignOut }: { onStay: () => void; onSignOut: () => Promise<void> }) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="idle-warn-title"
      className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center px-4"
    >
      <div className="w-full max-w-sm bg-surface rounded-card shadow-card p-5 space-y-3">
        <h2 id="idle-warn-title" className="text-[16px] font-semibold text-ink">Still there?</h2>
        <p className="text-[13px] text-muted">
          You&apos;ll be signed out in about 2 minutes due to inactivity. Click
          &quot;Stay signed in&quot; to keep working.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => { void onSignOut(); }}
            className="btn-ghost text-[13px] px-3 py-1.5"
          >
            Sign out now
          </button>
          <button
            type="button"
            onClick={onStay}
            className="btn-primary text-[13px] px-3 py-1.5"
            autoFocus
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
