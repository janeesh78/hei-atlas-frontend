'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js and forwards `drain-queue` messages from the worker
 * (fired on Background Sync 'recording-upload' events) into a global
 * `CustomEvent('sw:drain-queue')` that the recording-queue picks up.
 *
 * Also self-heals open tabs after a deploy: the SW skipWaiting()s on
 * install, so an updated worker takes control immediately and fires
 * `controllerchange` — we reload the page then, so long-lived tabs never
 * keep running a pre-deploy bundle (which e.g. left the recording queue
 * uploading without auth headers after the 2026-07-07 auth rollout).
 * The reload is deferred while a recording is active — MediaRecorder holds
 * audio in memory until stop, so a reload mid-recording would lose it. The
 * ambient page marks that via `document.documentElement.dataset.recording`.
 *
 * Failures are non-fatal — the app works without the service worker, just
 * without the offline shell + background sync features.
 */
export default function ServiceWorkerLoader() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Skip in dev: `next dev` chunks aren't content-hashed, so the SW's
    // cache-first static handler serves stale JS after every edit. Also
    // unregister any SW left over from a previous session on this origin.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }
    // Only register over secure contexts (https or localhost)
    if (
      window.location.protocol !== 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    ) {
      return;
    }

    // True when this page load was already controlled by a SW — i.e. a later
    // controllerchange means "new version deployed", not "first install".
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    let pendingReload = false;

    const recordingActive = () =>
      document.documentElement.dataset.recording === '1';

    const tryReload = () => {
      if (reloaded) return;
      if (recordingActive()) {
        pendingReload = true;
        return;
      }
      reloaded = true;
      window.location.reload();
    };

    const onControllerChange = () => {
      if (hadController) tryReload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // If the reload was deferred for an active recording, retry once the
    // recording ends: cheap poll + when the tab regains visibility. A reload
    // is safe mid-upload — the queue persists to IndexedDB before uploading
    // and re-drains on boot.
    const pendingTimer = setInterval(() => {
      if (pendingReload) tryReload();
    }, 30_000);
    const onVisibility = () => {
      if (pendingReload && document.visibilityState === 'visible') tryReload();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onMessage = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'drain-queue') {
        window.dispatchEvent(new CustomEvent('sw:drain-queue'));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Activate any new SW immediately. The worker skipWaiting()s itself
        // on install; these cover a worker already parked in `waiting` and
        // any future sw.js that drops the self-skip.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              next.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[sw] register failed', err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      navigator.serviceWorker.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(pendingTimer);
    };
  }, []);

  return null;
}
