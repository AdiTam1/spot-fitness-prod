'use client';

import { useEffect } from 'react';
import { AuthRejectionCode } from '@/types/nutrition';

export const CLIENT_WEB_BUILD_ID = (
  process.env.NEXT_PUBLIC_WEB_BUILD_ID || ''
).trim();

const REFRESH_GUARD_STORAGE_KEY = 'spot_web_refresh_guard_v1';
const REFRESH_LOOP_COOLDOWN_MS = 90_000;

const activeEditingKeys = new Set<string>();
const editingListeners = new Set<() => void>();
let hardRefreshStarted = false;

function notifyEditingListeners() {
  for (const listener of Array.from(editingListeners)) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

export function setSpotEditingBusy(key: string, busy: boolean): void {
  const had = activeEditingKeys.has(key);
  if (busy && !had) {
    activeEditingKeys.add(key);
    notifyEditingListeners();
  } else if (!busy && had) {
    activeEditingKeys.delete(key);
    notifyEditingListeners();
  }
}

export function isSpotEditingBusy(): boolean {
  if (activeEditingKeys.size > 0) return true;
  if (typeof document !== 'undefined') {
    const el = document.activeElement;
    if (
      el &&
      (el.tagName === 'TEXTAREA' ||
        (el.tagName === 'INPUT' &&
          !['button', 'submit', 'checkbox', 'radio'].includes(
            (el as HTMLInputElement).type
          )))
    ) {
      return true;
    }
  }
  return false;
}

export function subscribeSpotEditingBusy(cb: () => void): () => void {
  editingListeners.add(cb);
  return () => {
    editingListeners.delete(cb);
  };
}

export function useSpotUnsavedEditing(key: string, active: boolean): void {
  useEffect(() => {
    setSpotEditingBusy(key, active);
    return () => {
      setSpotEditingBusy(key, false);
    };
  }, [key, active]);
}

export function isWebVersionMismatch(serverBuildId?: string | null): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  if (!CLIENT_WEB_BUILD_ID || !serverBuildId) return false;
  const cleanServer = serverBuildId.trim();
  if (!cleanServer || cleanServer === 'dev') return false;
  return cleanServer !== CLIENT_WEB_BUILD_ID;
}

export function canAutoHardRefresh(serverBuildId: string): boolean {
  if (!isWebVersionMismatch(serverBuildId)) return false;
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.sessionStorage.getItem(REFRESH_GUARD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { buildId?: string; at?: number };
      if (
        parsed.buildId === serverBuildId &&
        typeof parsed.at === 'number' &&
        Date.now() - parsed.at < REFRESH_LOOP_COOLDOWN_MS
      ) {
        return false;
      }
    }
  } catch {
    // ignore storage access issues
  }
  return true;
}

export async function performHardRefresh(
  serverBuildId: string,
  options?: { force?: boolean }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (hardRefreshStarted) return false;
  if (!options?.force && !canAutoHardRefresh(serverBuildId)) {
    return false;
  }

  hardRefreshStarted = true;
  try {
    window.sessionStorage.setItem(
      REFRESH_GUARD_STORAGE_KEY,
      JSON.stringify({ buildId: serverBuildId, at: Date.now() })
    );
  } catch {
    // ignore
  }

  // עדכון Service Worker וניקוי מטמוני Cache Storage לפני טעינה קשיחה
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
  } catch {
    // ignore
  }

  try {
    if ('caches' in window && typeof caches.keys === 'function') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    // ignore
  }

  try {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('_sv', (serverBuildId || `${Date.now()}`).slice(0, 12));
    window.location.replace(nextUrl.toString());
  } catch {
    window.location.reload();
  }
  return true;
}

export function cleanRefreshQueryParamOnMount(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('_sv')) return;
    url.searchParams.delete('_sv');
    window.history.replaceState(
      {},
      '',
      `${url.pathname}${url.search}${url.hash}`
    );
  } catch {
    // ignore
  }
}

export interface AuthKickedEventDetail {
  code: AuthRejectionCode;
  message: string;
}

const AUTH_KICKED_EVENT = 'spot-auth-kicked';

export function dispatchAuthKicked(detail: AuthKickedEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AuthKickedEventDetail>(AUTH_KICKED_EVENT, { detail }));
}

export function subscribeAuthKicked(
  handler: (detail: AuthKickedEventDetail) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (ev: Event) => {
    const ce = ev as CustomEvent<AuthKickedEventDetail>;
    if (ce.detail) handler(ce.detail);
  };
  window.addEventListener(AUTH_KICKED_EVENT, listener);
  return () => {
    window.removeEventListener(AUTH_KICKED_EVENT, listener);
  };
}

export async function handlePossibleAuthRejection(
  res: Response
): Promise<boolean> {
  if (res.status !== 401 && res.status !== 403) return false;
  try {
    const cloned = (await res.clone().json()) as {
      code?: AuthRejectionCode;
      error?: string;
    };
    if (
      cloned?.code === 'SESSION_REVOKED' ||
      cloned?.code === 'ACCOUNT_BLOCKED'
    ) {
      dispatchAuthKicked({
        code: cloned.code,
        message:
          cloned.error || 'נותקת מהמערכת או שחשבונך הושהה. אנא התחבר מחדש.',
      });
      return true;
    }
  } catch {
    // ignore non-JSON
  }
  return false;
}
