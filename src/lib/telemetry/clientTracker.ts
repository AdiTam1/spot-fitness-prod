'use client';

import { isNativeAndroidApp, getNativeInstalledAppVersion } from '@/lib/capacitorSteps';
import { CLIENT_WEB_BUILD_ID } from '@/lib/webVersionGuard';
import type {
  ClientTelemetryEventType,
  ClientTelemetryPayloadEvent,
  TelemetryPlatform,
} from './types';

const QUEUE_FLUSH_INTERVAL_MS = 120_000; // 2 minutes max periodic flush to protect Vercel Free invocations
const BATCH_THRESHOLD = 15;
const MAX_QUEUE_LEN = 25;
const ERROR_STORAGE_KEY = 'spot_pending_client_errors_v1';

let sessionIdCache = '';
let cachedAppCode: number | undefined;
let queue: ClientTelemetryPayloadEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let errorDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;
let lastErrorKey = '';
let lastErrorAt = 0;
let errorCountMinute = 0;
let errorWindowStart = 0;

function getSessionId(): string {
  if (sessionIdCache) return sessionIdCache;
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.sessionStorage.getItem('spot_telemetry_sid_v1');
    if (existing) {
      sessionIdCache = existing;
      return existing;
    }
    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `sid-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    window.sessionStorage.setItem('spot_telemetry_sid_v1', created);
    sessionIdCache = created;
    return created;
  } catch {
    sessionIdCache = `sid-${Date.now()}`;
    return sessionIdCache;
  }
}

export function detectClientPlatform(): TelemetryPlatform {
  if (typeof window === 'undefined') return 'unknown';
  if (isNativeAndroidApp()) return 'android-apk';
  const ua = window.navigator.userAgent || '';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  const isIos =
    /iPad|iPhone|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  if (isStandalone) {
    return isIos ? 'pwa-ios' : 'pwa-android';
  }
  return 'web';
}

function loadOfflineErrors(): ClientTelemetryPayloadEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ERROR_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 10) : [];
  } catch {
    return [];
  }
}

function saveOfflineErrors(errors: ClientTelemetryPayloadEvent[]): void {
  if (typeof window === 'undefined') return;
  try {
    if (errors.length === 0) {
      window.localStorage.removeItem(ERROR_STORAGE_KEY);
    } else {
      window.localStorage.setItem(
        ERROR_STORAGE_KEY,
        JSON.stringify(errors.slice(-10))
      );
    }
  } catch {
    // ignore quota issues
  }
}

export function flushClientTelemetry(useBeacon = false): void {
  if (typeof window === 'undefined' || !window.navigator.onLine) return;

  const offlineErrors = loadOfflineErrors();
  const batch = [...offlineErrors, ...queue].slice(0, 20);
  if (batch.length === 0) return;

  queue = queue.slice(Math.max(0, batch.length - offlineErrors.length));
  if (offlineErrors.length > 0) saveOfflineErrors([]);

  const payload = JSON.stringify({
    sessionId: getSessionId(),
    platform: detectClientPlatform(),
    appVersionCode: cachedAppCode,
    webBuildId: CLIENT_WEB_BUILD_ID,
    events: batch,
  });

  // Never recurse telemetry on telemetry delivery failures!
  if (useBeacon && typeof window.navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([payload], { type: 'application/json' });
      const queued = window.navigator.sendBeacon('/api/telemetry/events', blob);
      if (queued) return;
    } catch {
      // fall through to fetch keepalive
    }
  }

  void fetch('/api/telemetry/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) {
        const errorsOnly = batch.filter((e) => e.eventType === 'client_error');
        if (errorsOnly.length > 0) saveOfflineErrors(errorsOnly);
      }
    })
    .catch(() => {
      const errorsOnly = batch.filter((e) => e.eventType === 'client_error');
      if (errorsOnly.length > 0) saveOfflineErrors(errorsOnly);
    });
}

export function trackClientEvent(
  eventType: ClientTelemetryEventType,
  eventName: string,
  opts?: { screen?: string; details?: Record<string, unknown> }
): void {
  if (typeof window === 'undefined') return;

  if (eventType === 'client_error') {
    const now = Date.now();
    if (now - errorWindowStart > 60_000) {
      errorWindowStart = now;
      errorCountMinute = 0;
    }
    if (errorCountMinute >= 5) return;
    const dedupeKey = `${eventName}:${String(opts?.details?.message || '').slice(0, 80)}`;
    if (dedupeKey === lastErrorKey && now - lastErrorAt < 8000) return;
    lastErrorKey = dedupeKey;
    lastErrorAt = now;
    errorCountMinute += 1;
  }

  queue.push({
    eventType,
    eventName: eventName.slice(0, 80),
    screen: opts?.screen?.slice(0, 80),
    details: opts?.details,
    clientTs: Date.now(),
  });

  if (queue.length > MAX_QUEUE_LEN) {
    queue = queue.slice(-MAX_QUEUE_LEN);
  }

  if (eventType === 'client_error') {
    if (errorDebounceTimer) clearTimeout(errorDebounceTimer);
    errorDebounceTimer = setTimeout(() => {
      flushClientTelemetry(false);
    }, 1800);
    return;
  }

  if (queue.length >= BATCH_THRESHOLD) {
    flushClientTelemetry(false);
  }
}

export function initClientTelemetry(): () => void {
  if (typeof window === 'undefined' || listenersBound) {
    return () => {};
  }
  listenersBound = true;

  if (isNativeAndroidApp()) {
    void getNativeInstalledAppVersion()
      .then((info) => {
        if (info?.versionCode) cachedAppCode = info.versionCode;
      })
      .catch(() => {});
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      flushClientTelemetry(true);
    }
  };
  const onPageHide = () => {
    flushClientTelemetry(true);
  };
  const onOnline = () => {
    if (loadOfflineErrors().length > 0) {
      flushClientTelemetry(false);
    }
  };
  const onError = (ev: ErrorEvent) => {
    const msg = String(ev.message || ev.error?.message || 'Script error').slice(0, 220);
    if (msg.includes('/api/telemetry/events')) return;
    trackClientEvent('client_error', 'window_error', {
      details: {
        message: msg,
        source: ev.filename ? String(ev.filename).split('/').pop() : undefined,
        line: ev.lineno,
      },
    });
  };
  const onUnhandled = (ev: PromiseRejectionEvent) => {
    const reason =
      ev.reason instanceof Error
        ? `${ev.reason.name}: ${ev.reason.message}`
        : String(ev.reason || 'Unhandled rejection');
    if (reason.includes('/api/telemetry/events')) return;
    trackClientEvent('client_error', 'unhandled_rejection', {
      details: { message: reason.slice(0, 220) },
    });
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('online', onOnline);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandled);

  flushTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && queue.length >= 5) {
      flushClientTelemetry(false);
    }
  }, QUEUE_FLUSH_INTERVAL_MS);

  return () => {
    listenersBound = false;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandled);
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    if (errorDebounceTimer) {
      clearTimeout(errorDebounceTimer);
      errorDebounceTimer = null;
    }
  };
}
