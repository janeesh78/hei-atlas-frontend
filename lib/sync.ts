/**
 * Cross-device encounter-state sync client.
 *
 * Connects to /sync/ws via WebSocket. Receives an initial snapshot on
 * connect. Listens for `state` push frames. Publishes local state changes
 * via POST /sync/state (debounced) — the backend mirrors them to all other
 * connected devices on the same session.
 *
 * Echo-loop suppression: each device has a stable random deviceId stored in
 * localStorage. State frames include `device_id`; incoming frames whose
 * device_id matches our own are ignored.
 *
 * No auth (yet) — single shared session per browser, override via
 * `?session=XYZ` query string to pair two devices manually.
 */

import { apiFetch, getAbsoluteApiBase } from './apiBase';

function pickHttpToWs(http: string): string {
  return http.replace(/^http(s?)/, 'ws$1');
}

// Resolved at connect time, not module load: the reachable base may only be
// known after the first successful apiFetch. WebSockets can't traverse the
// /backend rewrite, so this is always an absolute host — on networks where
// no absolute base is reachable the WS stays down and flush() falls back to
// POST /sync/state through the proxy.
function wsBase(): string {
  return pickHttpToWs(getAbsoluteApiBase());
}

const DEVICE_ID_KEY = 'oncology.deviceId';
const SESSION_KEY = 'oncology.sessionId';

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      'd-' +
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).slice(2, 14));
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getSessionId(): string {
  if (typeof window === 'undefined') return 'default';
  // URL override wins so two devices can be paired: ?session=ABC123
  try {
    const qs = new URLSearchParams(window.location.search);
    const fromUrl = qs.get('session');
    if (fromUrl) {
      localStorage.setItem(SESSION_KEY, fromUrl);
      return fromUrl;
    }
  } catch {}
  return localStorage.getItem(SESSION_KEY) || 'default';
}

export type SyncStatus = 'connecting' | 'live' | 'offline';

export interface SyncFrame<T = unknown> {
  type: 'state' | 'snapshot' | 'pong';
  device_id?: string;
  state?: T;
  updated_at?: number;
}

export interface SyncClientOptions<T> {
  sessionId: string;
  deviceId: string;
  /** Called with remote state on initial snapshot + on every push from a peer. */
  onRemoteState: (state: T, meta: { deviceId?: string; updatedAt?: number }) => void;
  /** Called on connect/disconnect transitions. */
  onStatus?: (status: SyncStatus) => void;
}

export class SyncClient<T> {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private retries = 0;

  constructor(private opts: SyncClientOptions<T>) {}

  connect(): void {
    if (this.closed) return;
    this.opts.onStatus?.('connecting');

    try {
      const url = `${wsBase()}/sync/ws?session_id=${encodeURIComponent(
        this.opts.sessionId
      )}`;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.retries = 0;
        this.opts.onStatus?.('live');
        // Heartbeat every 25s
        this.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {}
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as SyncFrame<T>;
          if (msg.type === 'pong') return;
          if ((msg.type === 'state' || msg.type === 'snapshot') && msg.state !== undefined) {
            // Echo suppression
            if (msg.device_id && msg.device_id === this.opts.deviceId) return;
            this.opts.onRemoteState(msg.state as T, {
              deviceId: msg.device_id,
              updatedAt: msg.updated_at,
            });
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => this.scheduleReconnect();
      ws.onerror = () => {
        try {
          ws.close();
        } catch {}
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.closed) return;
    this.opts.onStatus?.('offline');
    // Backoff: 1s, 2s, 4s, capped at 15s
    this.retries++;
    const delay = Math.min(15000, 1000 * 2 ** Math.min(this.retries - 1, 4));
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /** Debounced state push. Multiple rapid calls coalesce into one network write. */
  pushState(state: T, debounceMs = 300): void {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.flush(state), debounceMs);
  }

  private async flush(state: T): Promise<void> {
    // Prefer the WS so we don't double-up. If WS is dead, fall back to POST.
    const payload = {
      type: 'state',
      device_id: this.opts.deviceId,
      session_id: this.opts.sessionId,
      state,
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(payload));
        return;
      } catch {
        /* fall through to POST */
      }
    }
    try {
      await apiFetch(`/sync/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: this.opts.sessionId,
          device_id: this.opts.deviceId,
          state,
        }),
        keepalive: true,
      });
    } catch {
      /* swallow — caller will publish again on the next state change */
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pushTimer) clearTimeout(this.pushTimer);
    try {
      this.ws?.close();
    } catch {}
  }
}
