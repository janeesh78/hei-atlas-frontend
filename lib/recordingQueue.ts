/**
 * Offline-tolerant audio recording queue.
 *
 * - Audio blobs are persisted in IndexedDB the moment recording stops, so
 *   they survive page reloads, tab crashes, and network outages.
 * - Uploads are attempted immediately, then retried with exponential backoff
 *   on failure, then re-driven by `online` events and a periodic watcher.
 * - The UI never blocks on the network: the queue tells the page when an
 *   upload completes (success → run the pipeline) or permanently fails.
 *
 * This module is intentionally framework-free; a thin React hook wraps it
 * in `useRecordingQueue` for use inside `app/page.tsx`.
 */

import { getToken } from './auth';

const DB_NAME = 'oncology-recordings';
const STORE = 'pending';
// v2 adds the 'draft' store — standby insurance for in-flight recordings.
const DRAFT_STORE = 'draft';
const DB_VERSION = 2;

export interface PendingRecording {
  id: string;
  /** Original blob. */
  blob: Blob;
  /** Source session — so a paired device on the same encounter can also see it. */
  sessionId?: string;
  /** Recording metadata so the UI can display a meaningful queue item. */
  recordedAt: number;
  sizeBytes: number;
  durationSec: number;
  /** Retry bookkeeping. */
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
  /** Set when the upload failed with a non-retryable (4xx) error. Parked
   *  items are not re-attempted by the watcher/focus drains — only by an
   *  explicit user "Retry now" (force). Prevents a terminal no-speech 422
   *  from re-uploading multi-MB audio every ~2 minutes forever. */
  terminal?: boolean;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('recordedAt', 'recordedAt');
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

async function dbPut(rec: PendingRecording): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('put failed'));
  });
}

async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('delete failed'));
  });
}

async function dbListAll(): Promise<PendingRecording[]> {
  try {
    const db = await openDb();
    return await new Promise<PendingRecording[]>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res((req.result as PendingRecording[]) || []);
      req.onerror = () => rej(req.error || new Error('getAll failed'));
    });
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Standby draft — an APPEND-ONLY snapshot of an in-flight recording, written
// periodically so that if the OS kills the tab in standby, the next launch
// finds the draft and feeds it into the normal upload queue.
//
// Append-only (2026-07-13): the old design re-serialized the ENTIRE recording
// to a single slot every 30 s, so write volume grew quadratically with length
// — an hour-long visit wrote gigabytes, and once the browser hit its quota the
// (swallowed) failure silently stopped the crash insurance on exactly the long
// recordings that need it. Now each tick persists only the NEW delta chunk as
// its own part record; recovery concatenates the parts in order. A per-part
// quota failure loses only that delta, not the whole draft.
// ---------------------------------------------------------------------------

interface StandbyPart {
  key: string;         // 'standby:000001'
  order: number;
  blob: Blob;
  recordedAt: number;
  durationSec: number;
}

export interface StandbyDraft {
  blob: Blob;
  recordedAt: number;
  durationSec: number;
}

/** Persist ONE delta chunk as the next part of the in-flight draft. Throws on
 *  quota so the caller can react (rather than silently losing insurance). */
export async function saveStandbyPart(
  blob: Blob,
  order: number,
  durationSec: number,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(DRAFT_STORE, 'readwrite');
    tx.objectStore(DRAFT_STORE).put({
      key: `standby:${String(order).padStart(6, '0')}`,
      order,
      blob,
      recordedAt: Date.now(),
      durationSec,
    } satisfies StandbyPart);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error || new Error('draft part put failed'));
  });
}

function isStandbyRecord(r: unknown): r is StandbyPart | { key: string; blob: Blob; recordedAt?: number; durationSec?: number } {
  return !!r && typeof (r as { key?: unknown }).key === 'string' &&
    ((r as { key: string }).key === 'standby' || (r as { key: string }).key.startsWith('standby:'));
}

/** Read AND delete all draft parts in one transaction, concatenated in order
 *  into a single blob. Null when no draft exists. Tolerates a legacy single
 *  'standby' record from before the append-only change. */
export async function takeStandbyDraft(): Promise<StandbyDraft | null> {
  try {
    const db = await openDb();
    return await new Promise<StandbyDraft | null>((res, rej) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE);
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const recs = (getAll.result as StandbyPart[]).filter(isStandbyRecord);
        if (recs.length === 0) {
          tx.oncomplete = () => res(null);
          return;
        }
        recs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.recordedAt - b.recordedAt);
        const combined = new Blob(recs.map((r) => r.blob), {
          type: recs[0].blob.type || 'audio/webm',
        });
        const durationSec = recs.reduce((m, r) => Math.max(m, r.durationSec || 0), 0);
        const recordedAt = recs[0].recordedAt || Date.now();
        for (const r of recs) store.delete(r.key);
        tx.oncomplete = () => res({ blob: combined, recordedAt, durationSec });
      };
      getAll.onerror = () => rej(getAll.error || new Error('draft getAll failed'));
    });
  } catch {
    return null;
  }
}

/** Delete every draft part (called when a recording is safely enqueued). */
export async function clearStandbyDraft(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(DRAFT_STORE, 'readwrite');
      const store = tx.objectStore(DRAFT_STORE);
      const getKeys = store.getAllKeys();
      getKeys.onsuccess = () => {
        for (const k of getKeys.result as IDBValidKey[]) {
          if (typeof k === 'string' && (k === 'standby' || k.startsWith('standby:'))) {
            store.delete(k);
          }
        }
        tx.oncomplete = () => res();
      };
      getKeys.onerror = () => rej(getKeys.error || new Error('draft clear failed'));
    });
  } catch {
    /* best-effort */
  }
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

type Listener = (items: PendingRecording[]) => void;
type SuccessListener = (item: PendingRecording, transcript: string) => void;

export interface UploadOk {
  ok: true;
  transcript: string;
}
export interface UploadErr {
  ok: false;
  /** True when the error is transient (network) → keep retrying. */
  retryable: boolean;
  message: string;
}
export type UploadResult = UploadOk | UploadErr;

export type Uploader = (blob: Blob) => Promise<UploadResult>;

export class RecordingQueue {
  private items: PendingRecording[] = [];
  private listeners = new Set<Listener>();
  private successListeners = new Set<SuccessListener>();
  private uploader: Uploader;
  private inFlight = new Set<string>();
  private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private watcher: ReturnType<typeof setInterval> | null = null;
  private booted = false;
  private destroyed = false;
  // Bound drain listeners kept so destroy() can remove them — anonymous
  // closures could not be unregistered, leaving a zombie queue subscribed to
  // focus/online after the page unmounted (double uploads + dropped
  // transcripts when the zombie's success path fires with cleared listeners).
  private onOnline = () => this.drain();
  private onSwDrain = () => this.drain();
  private onFocus = () => this.drain();
  private onVisibility = () => {
    if (document.visibilityState === 'visible') this.drain();
  };
  private onSignedIn = () => this.drain(true);

  constructor(uploader: Uploader) {
    this.uploader = uploader;
  }

  async init(): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    this.items = await dbListAll();
    // A destroy() that raced this await (React StrictMode double-mount, fast
    // navigation) must not leave a live instance wired up.
    if (this.destroyed) return;
    this.notify();

    // Drain triggers — all wired here so the queue self-heals.
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
      window.addEventListener('sw:drain-queue', this.onSwDrain);
      window.addEventListener('focus', this.onFocus);
      document.addEventListener('visibilitychange', this.onVisibility);
      // Fresh sign-in: auth-blocked items become uploadable the moment a
      // token exists — drain immediately (forced past the backoff window).
      window.addEventListener('hei:signed-in', this.onSignedIn);
    }
    // Periodic safety net
    this.watcher = setInterval(() => this.drain(), 20000);
    // Try once on boot
    this.drain();
  }

  private removeListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('sw:drain-queue', this.onSwDrain);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('hei:signed-in', this.onSignedIn);
  }

  /** Ask the Background Sync API to wake us when connectivity returns. */
  private async registerBackgroundSync(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      // SyncManager is Chrome/Android only; degrade silently elsewhere
      const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
      if (sync && typeof sync.register === 'function') {
        await sync.register('recording-upload');
      }
    } catch {
      /* Background Sync unavailable — periodic watcher + 'online' event still drive retries */
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.watcher) clearInterval(this.watcher);
    this.watcher = null;
    this.retryTimers.forEach((t) => clearTimeout(t));
    this.retryTimers.clear();
    this.removeListeners();
    this.listeners.clear();
    this.successListeners.clear();
    // Drop in-memory items so a stray in-flight callback can't act on them.
    this.items = [];
    this.inFlight.clear();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.items);
    return () => this.listeners.delete(fn);
  }

  onSuccess(fn: SuccessListener): () => void {
    this.successListeners.add(fn);
    return () => this.successListeners.delete(fn);
  }

  list(): PendingRecording[] {
    return [...this.items];
  }

  pendingCount(): number {
    return this.items.length;
  }

  /**
   * Enqueue a freshly stopped recording. Persists to IndexedDB synchronously
   * (well, via promise) — caller can resolve as soon as the persist completes;
   * the upload happens in the background.
   */
  async enqueue(blob: Blob, meta: { sessionId?: string; durationSec: number }): Promise<PendingRecording> {
    const id =
      'r-' +
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).slice(2, 14));
    const rec: PendingRecording = {
      id,
      blob,
      sessionId: meta.sessionId,
      recordedAt: Date.now(),
      sizeBytes: blob.size,
      durationSec: meta.durationSec,
      attempts: 0,
    };
    await dbPut(rec);
    this.items = [...this.items, rec];
    this.notify();
    // Ask the OS to wake us when the network comes back (Chrome/Android)
    this.registerBackgroundSync();
    // Kick off an upload right away
    this.tryUpload(rec);
    return rec;
  }

  /**
   * Drain pass — attempts every eligible item. `force` bypasses the backoff
   * window (manual "Retry now" button, fresh sign-in); ordinary triggers
   * (watcher tick, focus, online) respect it. Without that respect, the
   * 20-second watcher plus focus events in every open tab hammered a failing
   * item ~16×/min (195 attempts observed in the field, 2026-07-09).
   */
  drain(force = false): void {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    for (const rec of this.items) this.tryUpload(rec, force);
  }

  /** Cancel + remove a queued item (e.g. user discards a failed clip). */
  async discard(id: string): Promise<void> {
    const t = this.retryTimers.get(id);
    if (t) clearTimeout(t);
    this.retryTimers.delete(id);
    this.inFlight.delete(id);
    await dbDelete(id);
    this.items = this.items.filter((i) => i.id !== id);
    this.notify();
  }

  private notify(): void {
    const snap = this.list();
    this.listeners.forEach((fn) => fn(snap));
  }

  /** Exponential backoff for a given attempt count: 2s,4s,…,120s (capped).
   *  Single source of truth for both the retry timer and the persisted gate
   *  (nextAttemptAt) — if these drift, the timer fires before the gate opens
   *  and retries stall, or the gate opens too early and multi-trigger
   *  hammering returns. */
  private backoffMs(attempts: number): number {
    return Math.min(120_000, 2000 * 2 ** Math.min(attempts, 6));
  }

  private scheduleRetry(rec: PendingRecording): void {
    if (this.retryTimers.has(rec.id)) return;
    const delay = this.backoffMs(rec.attempts);
    const t = setTimeout(() => {
      this.retryTimers.delete(rec.id);
      const current = this.items.find((i) => i.id === rec.id);
      if (current) this.tryUpload(current);
    }, delay);
    this.retryTimers.set(rec.id, t);
  }

  /** Earliest time the next attempt for this item is allowed (persisted
   *  bookkeeping, so the window holds across tabs and reloads). */
  private nextAttemptAt(rec: PendingRecording): number {
    if (!rec.lastAttemptAt || rec.attempts === 0) return 0;
    return rec.lastAttemptAt + this.backoffMs(rec.attempts) - 500; // slack so our own timer isn't rejected
  }

  /** True while this exact recording is still queued (guards against a
   *  discard() that happened while the upload was in flight — otherwise the
   *  failure path would resurrect the deleted row and the success path would
   *  run a note pipeline for a recording the user explicitly discarded). */
  private stillQueued(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  private async tryUpload(rec: PendingRecording, force = false): Promise<void> {
    if (this.destroyed) return;
    if (this.inFlight.has(rec.id)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (!force && Date.now() < this.nextAttemptAt(rec)) return;
    // Parked terminal (non-retryable 4xx) items: only a user-initiated force
    // retries them. Stops the forever-re-upload of a no-speech recording.
    if (!force && rec.terminal) return;
    // Auth-blocked items can't succeed until the user signs in — retrying
    // without a token just burns battery and inflates the attempt counter.
    // The pending-uploads panel shows the "sign in again" banner; the
    // 'hei:signed-in' listener drains the moment a fresh token exists.
    if (/\b401\b/.test(rec.lastError || '') && !getToken()) return;
    this.inFlight.add(rec.id);
    try {
      const result = await this.uploader(rec.blob);
      // The item may have been discarded (or the queue destroyed) during the
      // await — don't act on a recording that's no longer ours.
      if (this.destroyed || !this.stillQueued(rec.id)) return;
      if (result.ok) {
        await dbDelete(rec.id);
        this.items = this.items.filter((i) => i.id !== rec.id);
        this.notify();
        this.successListeners.forEach((fn) => fn(rec, result.transcript));
        return;
      }
      // Failure. A non-retryable (4xx) result parks the item so background
      // drains stop; a retryable one schedules the backoff timer.
      const updated: PendingRecording = {
        ...rec,
        attempts: rec.attempts + 1,
        lastAttemptAt: Date.now(),
        lastError: result.message,
        terminal: !result.retryable,
      };
      await dbPut(updated);
      this.items = this.items.map((i) => (i.id === rec.id ? updated : i));
      this.notify();
      if (result.retryable) {
        this.scheduleRetry(updated);
        this.registerBackgroundSync();
      }
    } catch (err: unknown) {
      // A thrown error is a network/transport failure — always retryable.
      if (this.destroyed || !this.stillQueued(rec.id)) return;
      const message = err instanceof Error ? err.message : 'Unknown upload error';
      const updated: PendingRecording = {
        ...rec,
        attempts: rec.attempts + 1,
        lastAttemptAt: Date.now(),
        lastError: message,
      };
      await dbPut(updated);
      this.items = this.items.map((i) => (i.id === rec.id ? updated : i));
      this.notify();
      this.scheduleRetry(updated);
    } finally {
      this.inFlight.delete(rec.id);
    }
  }
}
