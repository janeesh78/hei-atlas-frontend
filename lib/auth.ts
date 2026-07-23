/**
 * Auth + session client.
 *
 * - Token is stored in localStorage under TOKEN_KEY and sent as
 *   `Authorization: Bearer <token>` on protected calls. localStorage (not
 *   sessionStorage) is deliberate: a sign-in in one tab should sign in every
 *   tab of the same browser — see session.tsx's `storage` listener.
 * - On boot the frontend calls `/auth/me` to hydrate the session. If the
 *   token is missing/expired the app redirects to /login.
 * - No refresh endpoint yet — the session itself slides forward on every
 *   authed request (HIPAA §164.312(a)(2)(iii) inactivity timeout; see
 *   SESSION_TTL server-side and IDLE_MS in session.tsx, which must match).
 *   When the token expires the user re-verifies via OTP.
 */
import { apiFetch } from './apiBase';
import type { CodingReport } from './api';
import type { CodingResult } from './coding';

// Exported so session.tsx can watch this key via the `storage` event and
// pick up sign-in/sign-out that happened in another tab.
export const TOKEN_KEY = 'oncology.authToken';
const USER_KEY = 'oncology.currentUser';

export interface CurrentUser {
  id: string;
  email: string;
  npi: string;
  name: string;
  credentials: string;
  phone?: string | null;
  npi_verified: boolean;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getCachedUser(): CurrentUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

export function setCachedUser(user: CurrentUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

/** Attach the bearer token to fetch init when we have one. */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** Wraps fetch with auth header + JSON parsing + typed error. */
async function authedFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await apiFetch(path, { ...init, headers });
  const text = await res.text();
  // Parse defensively: a proxy/gateway can return a plain-text or HTML error
  // body (502/504) that JSON.parse would throw a status-less SyntaxError on,
  // which callers (and SessionProvider.refresh's 401/403 check) then
  // misclassify. Keep the typed .status-bearing error path instead.
  let data: { detail?: unknown; message?: unknown } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!res.ok) {
        const err = new Error(res.statusText || `HTTP ${res.status}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      // A 2xx with a non-JSON body shouldn't happen for our API; surface it.
      const err = new Error('Unexpected non-JSON response from the server.') as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
  }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || res.statusText;
    // Carry the HTTP status so callers can tell a real auth rejection (401)
    // from a transient failure — the session must NOT be cleared for the
    // latter (see SessionProvider.refresh).
    const err = new Error(
      typeof detail === 'string' ? detail : JSON.stringify(detail),
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

// ────────────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────────────

export interface SignupInput {
  email: string;
  npi: string;
  name: string;
  credentials: string;
  phone?: string;
}
export interface VerifyInput {
  email: string;
  code: string;
  purpose: 'signup' | 'login';
}

export interface OtpDispatch {
  ok: boolean;
  message: string;
  /** When the backend runs with DEV_MODE=1 the OTP is included here so the
   *  frontend can display it directly. Never populated in production. */
  dev_code?: string;
}
export async function signup(input: SignupInput): Promise<OtpDispatch> {
  return authedFetch('/auth/signup', { method: 'POST', body: JSON.stringify(input) });
}
export async function login(email: string): Promise<OtpDispatch> {
  return authedFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email }) });
}
export async function verify(
  input: VerifyInput,
): Promise<{ token: string; expires_at: string; user: CurrentUser }> {
  const res = await authedFetch<{ token: string; expires_at: string; user: CurrentUser }>(
    '/auth/verify',
    { method: 'POST', body: JSON.stringify(input) },
  );
  setToken(res.token);
  setCachedUser(res.user);
  // Wake anything blocked on auth — the recording queue drains items that
  // 401'd while signed out the moment a fresh token exists.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('hei:signed-in'));
  }
  return res;
}
export async function fetchMe(): Promise<CurrentUser> {
  const u = await authedFetch<CurrentUser>('/auth/me');
  setCachedUser(u);
  return u;
}
export async function logout(): Promise<void> {
  try {
    await authedFetch<{ ok: true }>('/auth/logout', { method: 'POST' });
  } catch {
    /* clear local state even if the server call fails */
  }
  setToken(null);
  setCachedUser(null);
}

// Preferences
export interface Preferences {
  settings: Record<string, unknown>;
  usage_counts: Record<string, number>;
}
export async function getPreferences(): Promise<Preferences> {
  return authedFetch<Preferences>('/preferences');
}
export async function updatePreferences(
  patch: Partial<{ settings: Record<string, unknown>; usage_delta: Record<string, number> }>,
): Promise<Preferences> {
  return authedFetch<Preferences>('/preferences', {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

// Encounters
export interface SavedEncounter {
  id: string;
  patient_ref: string | null;
  output_format: string;
  created_at: string;
  expires_at: string;
}
export interface SavedEncounterFull extends SavedEncounter {
  note: Record<string, unknown>;
  transcript: string | null;
  coding: Record<string, unknown> | null;
  toxicities: Record<string, unknown>[] | null;
}
export async function saveEncounter(payload: {
  patient_ref?: string;
  output_format: string;
  note: Record<string, unknown>;
  transcript?: string;
  coding?: Record<string, unknown>;
  toxicities?: Record<string, unknown>[];
}): Promise<SavedEncounter> {
  return authedFetch<SavedEncounter>('/encounters', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Coding persistence shape ────────────────────────────────────────────────
//
// `SavedEncounter.coding` is an opaque JSON column on the backend (Dict[str,
// Any] / Column(JSON) — no fixed schema, no migration needed to change what
// we put in it). Rows saved before 2026-07-15 have the bare client-heuristic
// CodingResult as `coding` itself; normalizePersistedCoding() reads both
// shapes so old visits still restore correctly.

export type CodingDecision = 'pending' | 'accepted' | 'dismissed';

export interface PersistedCoding {
  client?: CodingResult | null;
  backend?: CodingReport | null;
  decisions?: Record<string, CodingDecision>;
  total_time_minutes?: number | null;
  place_of_service?: string;
}

export function normalizePersistedCoding(raw: unknown): {
  client: CodingResult | null;
  backend: CodingReport | null;
  decisions: Record<string, CodingDecision>;
  totalTimeMinutes: number | null;
  placeOfService: string;
} {
  const empty = {
    client: null as CodingResult | null,
    backend: null as CodingReport | null,
    decisions: {} as Record<string, CodingDecision>,
    totalTimeMinutes: null as number | null,
    placeOfService: '',
  };
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  const isWrapped = 'client' in r || 'backend' in r || 'decisions' in r;
  if (!isWrapped) {
    // Legacy row: `coding` IS the bare client CodingResult — but only treat
    // it as one if it actually looks like one. An empty/garbage object
    // (neither wrapped nor a recognizable CodingResult) has nothing to
    // restore; returning it as `client` would hand the panel a broken object.
    const looksLikeCodingResult = 'recommended_em_code' in r || 'mdm_level' in r;
    return looksLikeCodingResult ? { ...empty, client: r as unknown as CodingResult } : empty;
  }
  return {
    client: (r.client as unknown as CodingResult) ?? null,
    backend: (r.backend as unknown as CodingReport) ?? null,
    decisions: (r.decisions as Record<string, CodingDecision>) ?? {},
    totalTimeMinutes: typeof r.total_time_minutes === 'number' ? r.total_time_minutes : null,
    placeOfService: typeof r.place_of_service === 'string' ? r.place_of_service : '',
  };
}
export async function listTodayEncounters(): Promise<SavedEncounter[]> {
  return authedFetch<SavedEncounter[]>('/encounters');
}
export async function getEncounter(id: string): Promise<SavedEncounterFull> {
  return authedFetch<SavedEncounterFull>(`/encounters/${id}`);
}
export async function deleteEncounter(id: string): Promise<void> {
  await authedFetch<{ ok: boolean }>(`/encounters/${id}`, { method: 'DELETE' });
}

// ─── Telemetry: activity / location / feedback ──────────────────────────────

export async function pingActivity(): Promise<void> {
  try {
    await authedFetch<{ ok: boolean }>('/activity/ping', { method: 'POST' });
  } catch {
    /* fail-open: telemetry never blocks the UI */
  }
}

export async function saveLocation(payload: {
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  source?: 'browser' | 'ip' | 'unknown';
}): Promise<void> {
  try {
    await authedFetch<{ ok: boolean }>('/location', {
      method: 'POST',
      body: JSON.stringify({ source: 'browser', ...payload }),
    });
  } catch {
    /* fail-open */
  }
}

export async function sendNoteFeedback(payload: {
  rating: 'up' | 'down';
  encounter_id?: string | null;
  output_format?: string;
  feedback_text?: string;
}): Promise<void> {
  await authedFetch<{ ok: boolean; id: string }>('/feedback/note', {
    method: 'POST',
    body: JSON.stringify({
      rating: payload.rating,
      encounter_id: payload.encounter_id || undefined,
      output_format: payload.output_format,
      feedback_text: payload.feedback_text,
    }),
  });
}

// OncBridge SSO handoff — mints a short-lived RS256 token asserting the
// current user's identity for app.heiatlas.ai to verify and exchange for
// its own session (see routers/sso.py + OncBridge's sso.py). Shared by
// every ATLAS module hosted on app.heiatlas.ai (Consensus, CRI, ...) --
// the token itself doesn't encode which module the user is headed to,
// only their identity; the destination is the `dest` param on the /sso
// redirect URL. Requires the caller to already be authenticated here
// (authedFetch attaches the bearer token); the returned token is meant to
// be used immediately.
export async function mintOncBridgeSsoToken(): Promise<{ token: string }> {
  return authedFetch<{ token: string }>('/auth/sso/consensus-token', { method: 'POST' });
}
