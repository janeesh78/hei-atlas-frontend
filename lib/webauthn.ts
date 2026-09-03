/**
 * Passkey (WebAuthn) client — additive alternative to email OTP, never a
 * replacement (see backend/routers/passkeys.py). Registration always
 * requires an existing signed-in session (OTP got the physician there
 * first); login is anonymous and usernameless — no email typed, the
 * browser/OS picks the right passkey.
 *
 * Mirrors lib/auth.ts's shape (a small private fetch wrapper + one-liner
 * exports per endpoint) rather than importing it — that file's own
 * `authedFetch` isn't exported, and every lib/*.ts client in this codebase
 * (lib/admin.ts included) keeps its own small copy rather than sharing one.
 */
import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { apiFetch } from './apiBase';
import { getToken, setToken, setCachedUser, type CurrentUser } from './auth';

export { browserSupportsWebAuthn };

export interface PasskeyListItem {
  id: string;
  device_label: string | null;
  device_type: string;
  transports: string[] | null;
  created_at: string | null;
  last_used_at: string | null;
}

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const t = getToken();
  if (t) headers.set('Authorization', `Bearer ${t}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const res = await apiFetch(path, { ...init, headers });
  const text = await res.text();
  let data: { detail?: unknown } = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      const err = new Error(res.statusText || `HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
  }
  if (!res.ok) {
    const err = new Error(
      typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

/** Browser prompts (cancel, timeout, no matching passkey) all surface as a
 *  DOM NotAllowedError — the library deliberately passes these through
 *  rather than trying to distinguish them (platforms overload this error
 *  beyond the spec). One friendly, honest message covers the category. */
function friendlyCeremonyError(e: unknown): Error {
  if (e instanceof Error && e.name === 'NotAllowedError') {
    return new Error('Passkey sign-in was cancelled or timed out. Try again, or use your email code instead.');
  }
  return e instanceof Error ? e : new Error('Passkey sign-in failed. Try again, or use your email code instead.');
}

// ─── Registration (requires an existing session) ────────────────────────────

async function getRegisterOptions(): Promise<PublicKeyCredentialCreationOptionsJSON & { challenge_id: string }> {
  return jsonFetch('/auth/passkeys/register/options', { method: 'POST' });
}

async function verifyRegister(
  challengeId: string,
  credential: RegistrationResponseJSON,
  deviceLabel?: string,
): Promise<{ ok: boolean; id: string }> {
  return jsonFetch('/auth/passkeys/register/verify', {
    method: 'POST',
    body: JSON.stringify({ challenge_id: challengeId, credential, device_label: deviceLabel || undefined }),
  });
}

/** Full registration ceremony: fetch options, prompt the browser, verify. */
export async function registerPasskey(deviceLabel?: string): Promise<{ ok: boolean; id: string }> {
  const { challenge_id, ...optionsJSON } = await getRegisterOptions();
  let credential: RegistrationResponseJSON;
  try {
    credential = await startRegistration({ optionsJSON: optionsJSON as PublicKeyCredentialCreationOptionsJSON });
  } catch (e) {
    throw friendlyCeremonyError(e);
  }
  return verifyRegister(challenge_id, credential, deviceLabel);
}

export async function listPasskeys(): Promise<PasskeyListItem[]> {
  return jsonFetch('/auth/passkeys');
}

export async function deletePasskey(id: string): Promise<void> {
  await jsonFetch(`/auth/passkeys/${id}`, { method: 'DELETE' });
}

// ─── Login (anonymous, usernameless) ────────────────────────────────────────

async function getLoginOptions(): Promise<PublicKeyCredentialRequestOptionsJSON & { challenge_id: string }> {
  return jsonFetch('/auth/passkeys/login/options', { method: 'POST' });
}

async function verifyLoginAssertion(
  challengeId: string,
  credential: AuthenticationResponseJSON,
): Promise<{ token: string; expires_at: string; user: CurrentUser }> {
  const res = await jsonFetch<{ token: string; expires_at: string; user: CurrentUser }>(
    '/auth/passkeys/login/verify',
    { method: 'POST', body: JSON.stringify({ challenge_id: challengeId, credential }) },
  );
  // Same side effects as lib/auth.ts's verify() — this is a third way into
  // the same signed-in state, not a parallel one.
  setToken(res.token);
  setCachedUser(res.user);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('hei:signed-in'));
  return res;
}

/** Full login ceremony: fetch options, prompt the browser, verify, sign in. */
export async function loginWithPasskey(): Promise<{ token: string; expires_at: string; user: CurrentUser }> {
  const { challenge_id, ...optionsJSON } = await getLoginOptions();
  let credential: AuthenticationResponseJSON;
  try {
    credential = await startAuthentication({ optionsJSON: optionsJSON as PublicKeyCredentialRequestOptionsJSON });
  } catch (e) {
    throw friendlyCeremonyError(e);
  }
  return verifyLoginAssertion(challenge_id, credential);
}
