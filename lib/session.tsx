'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { fetchMe, getCachedUser, getToken, setCachedUser, setToken, type CurrentUser } from './auth';
import { apiFetch } from './apiBase';

// HIPAA §164.312(a)(2)(iii) inactivity timeout. Match the server-side
// SESSION_TTL exactly so the client + server agree on when to sign out.
const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = 13 * 60 * 1000;

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

  // ── Inactivity timeout ────────────────────────────────────────────────
  // Reset the timer on any real user action. When >15 min elapses without
  // one, force a logout. Show a warning at 13 min so the user can dismiss
  // it and stay signed in.
  useEffect(() => {
    if (!user) return;
    const mark = () => {
      lastActivity.current = Date.now();
      if (idleWarning) setIdleWarning(false);
    };
    const events: (keyof DocumentEventMap)[] = ['mousedown', 'keydown', 'touchstart', 'wheel'];
    events.forEach((e) => document.addEventListener(e, mark, { passive: true }));
    const iv = setInterval(() => {
      // An active ATLAS recording is presence, not idleness: ambient capture
      // is hands-off by design, and auto-logoff here killed recordings
      // mid-consult (field report 2026-07-09). The flag is set by the
      // ambient page while MediaRecorder is live or paused. Bumping the
      // clock also makes the 15-min window restart from recording END.
      if (document.documentElement.dataset.recording === '1') {
        lastActivity.current = Date.now();
        if (idleWarning) setIdleWarning(false);
        return;
      }
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_MS) logout();
      else if (idle >= WARN_MS) setIdleWarning(true);
    }, 15_000);
    return () => {
      events.forEach((e) => document.removeEventListener(e, mark));
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
