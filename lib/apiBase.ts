/**
 * Resilient API transport.
 *
 * Clinical networks routinely DNS-filter one of our hostnames while leaving
 * the others reachable:
 *   - 2026-07-07: a hospital guest network (Cisco Umbrella) blocked
 *     hei-atlas-api.fly.dev — returned a block-page IP — while heiatlas.ai
 *     resolved fine. Every API call died with "Failed to fetch".
 *   - Newly-registered-domain filters do the opposite: they block heiatlas.ai
 *     (registered 2026) but let fly.dev through.
 *
 * So every API call walks an ordered list of bases and pins the first one
 * that answers WITH A REAL API RESPONSE. `/backend` is a same-origin rewrite
 * (see next.config.js) relayed to the FastAPI app by Vercel's edge — it works
 * whenever the page itself loaded, regardless of what the local DNS filter
 * thinks of our API hostnames. WebSockets cannot traverse the rewrite, so
 * sync derives its ws:// URL from getAbsoluteApiBase() and degrades to
 * POST-only publishing on networks where no absolute base is reachable.
 */

// Strip trailing slashes from absolute bases so a NEXT_PUBLIC_API_URL set with
// a trailing slash ("https://…fly.dev/") can't (a) defeat the FLY_DIRECT
// dedupe or (b) produce double-slash URLs ("…fly.dev//auth/me") that 404 —
// which previously got pinned and turned a cosmetic typo into a total outage.
const stripSlash = (b: string) => b.replace(/\/+$/, '');

const PRIMARY = stripSlash(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
const FLY_DIRECT = 'https://hei-atlas-api.fly.dev';
const PROXY = '/backend';
// sessionStorage (not localStorage): a base pinned on a filtered clinic
// network shouldn't outlive the tab — at home the primary is reachable
// again and we want the direct path, not the Vercel relay, for uploads.
const PINNED_KEY = 'oncology.apiBase';

let memPinned: string | null = null;

function readPinned(): string | null {
  if (memPinned) return memPinned;
  try {
    return typeof window !== 'undefined' ? window.sessionStorage.getItem(PINNED_KEY) : null;
  } catch {
    return null; // storage unavailable (private mode etc.)
  }
}

function pin(base: string): void {
  memPinned = base;
  try {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(PINNED_KEY, base);
  } catch {
    /* memory pin still applies */
  }
}

function candidateBases(): string[] {
  const bases = [PRIMARY];
  // Fallbacks only exist in production browser builds — in dev a dead
  // localhost backend must fail loudly, not silently hit production.
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    if (!bases.includes(FLY_DIRECT)) bases.push(FLY_DIRECT);
    bases.push(PROXY);
  }
  const pinned = readPinned();
  if (pinned && bases.includes(pinned) && pinned !== bases[0]) {
    return [pinned, ...bases.filter((b) => b !== pinned)];
  }
  return bases;
}

/** Current effective base (for display/debug). */
export function getApiBase(): string {
  return readPinned() || candidateBases()[0];
}

/** Absolute (non-proxy) base for WebSocket URLs — the rewrite can't upgrade. */
export function getAbsoluteApiBase(): string {
  const pinned = readPinned();
  // Only honor a pin that is still a current candidate (a stale pin from an
  // older deploy must not become a bogus WS host).
  if (pinned && pinned !== PROXY && candidateBases().includes(pinned)) return pinned;
  return PRIMARY;
}

/**
 * Our API always answers with JSON. A `text/html` body means we reached
 * something that is NOT our backend — a DNS-filter block page (often served
 * 200/403 over a corporate-trusted MITM cert, so fetch resolves instead of
 * throwing) or a same-origin SPA/404 fallback. Treat those as a soft failure
 * so the walk continues to the next base and the `/backend` relay actually
 * gets tried — rather than pinning the block page for the whole tab session
 * and feeding HTML into JSON.parse.
 */
function looksLikeNonApi(res: Response): boolean {
  const ct = res.headers.get('content-type') || '';
  return ct.includes('text/html');
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'idk-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * fetch() that fails over across API bases on network-level errors (DNS block,
 * TLS interception, offline) AND on non-API (HTML) responses. Real HTTP errors
 * — 4xx/5xx with a JSON body — mean the server was reached and are returned to
 * the caller unchanged. AbortError is the caller's cancellation and is
 * rethrown immediately.
 *
 * For non-idempotent methods a single Idempotency-Key is generated per call
 * and reused across every base attempt, so a request that was received but
 * whose response was lost (connection reset after the server committed it)
 * can be de-duplicated server-side instead of creating a duplicate row.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const mutating = method !== 'GET' && method !== 'HEAD';
  let effInit = init;
  if (mutating) {
    const headers = new Headers(init.headers);
    if (!headers.has('Idempotency-Key')) headers.set('Idempotency-Key', randomId());
    effInit = { ...init, headers };
  }

  let lastErr: unknown = null;
  let htmlRes: Response | null = null;
  for (const base of candidateBases()) {
    try {
      const res = await fetch(`${base}${path}`, effInit);
      if (looksLikeNonApi(res)) {
        // Not our backend — remember it but keep walking.
        htmlRes = res;
        continue;
      }
      pin(base);
      return res;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      lastErr = err;
    }
  }
  // Every base failed or returned a non-API page. Prefer a network error
  // (actionable "couldn't reach the server") over returning HTML that the
  // caller would choke on in JSON.parse.
  if (lastErr) throw lastErr instanceof Error ? lastErr : new Error('Failed to fetch');
  throw new Error(
    htmlRes
      ? 'Reached a network block page instead of the API — check the network/DNS filter.'
      : 'Failed to fetch',
  );
}
