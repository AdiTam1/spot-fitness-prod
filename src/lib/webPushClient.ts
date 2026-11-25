'use client';

import { isNativeAndroidApp } from '@/lib/capacitorSteps';
import type { PushDeepLinkTarget } from '@/lib/capacitorPush';

export interface WebPushEnvironmentStatus {
  isNativeAndroid: boolean;
  isIos: boolean;
  isIosStandalone: boolean;
  needsIosAddToHomeScreen: boolean;
  isIosInAppBrowser: boolean;
  webPushSupported: boolean;
  vapidConfigured: boolean;
  permissionState: 'granted' | 'denied' | 'default' | 'unsupported';
  isSubscribed: boolean;
  deviceLabel: string;
}

const IOS_INSTALL_DISMISSED_KEY = 'spot_ios_a2hs_dismissed_at';
const handledWebPushIds = new Set<string>();

function getPublicVapidKey(): string {
  return (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim();
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return true;
  return navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(
    nav.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)')?.matches
  );
}

export function isIosInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|LinkedInApp/i.test(
    ua
  );
}

function isIosDeclarativeCapable(): boolean {
  if (typeof navigator === 'undefined' || !isIosDevice()) return false;
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)/i);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 18 || (major === 18 && minor >= 4);
}

function getFriendlyWebDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'דפדפן';
  const ua = navigator.userAgent || '';
  if (isIosDevice()) {
    return /ipad/i.test(ua) || navigator.platform === 'MacIntel'
      ? 'iPad (מסך הבית)'
      : 'iPhone (מסך הבית)';
  }
  if (/android/i.test(ua)) return 'Android Browser';
  if (/macintosh|mac os x/i.test(ua)) return 'Mac Browser';
  if (/windows/i.test(ua)) return 'Windows Browser';
  return 'Desktop Browser';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isWebPushEnvironmentSupported(): boolean {
  if (typeof window === 'undefined' || isNativeAndroidApp()) return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function clearWebPushAppBadge() {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    clearAppBadge?: () => Promise<void>;
  };
  if (typeof nav.clearAppBadge === 'function') {
    void nav.clearAppBadge().catch(() => {});
  }
}

export async function ensurePushServiceWorkerRegistered(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || isNativeAndroidApp()) return null;
  if (!('serviceWorker' in navigator)) return null;
  try {
    const existing = await navigator.serviceWorker.getRegistration('/');
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export async function getWebPushEnvironmentStatus(): Promise<WebPushEnvironmentStatus> {
  const nativeAndroid = isNativeAndroidApp();
  const ios = !nativeAndroid && isIosDevice();
  const iosStandalone = ios && isStandalonePwa();
  const webPushSupported = isWebPushEnvironmentSupported();
  const vapidConfigured = Boolean(getPublicVapidKey());

  let permissionState: WebPushEnvironmentStatus['permissionState'] =
    'unsupported';
  let isSubscribed = false;

  if (webPushSupported) {
    permissionState = Notification.permission;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        isSubscribed = Boolean(sub?.endpoint);
      }
    } catch {
      // ignore
    }
  }

  return {
    isNativeAndroid: nativeAndroid,
    isIos: ios,
    isIosStandalone: iosStandalone,
    needsIosAddToHomeScreen: ios && !iosStandalone,
    isIosInAppBrowser: ios && isIosInAppBrowser(),
    webPushSupported,
    vapidConfigured,
    permissionState,
    isSubscribed,
    deviceLabel: getFriendlyWebDeviceLabel(),
  };
}

export type WebPushApiPath = '/api/push/register' | '/api/push/coach-alerts';

async function uploadWebPushSubscription(
  sub: PushSubscription,
  apiPath: WebPushApiPath = '/api/push/register'
) {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid PushSubscription');
  }
  const res = await fetch(apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'register-web-push',
      platform: isIosDevice() ? 'ios-pwa' : 'web',
      deviceLabel: getFriendlyWebDeviceLabel(),
      isDeclarativeCapable: isIosDeclarativeCapable(),
      subscription: {
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error('Failed to persist web push subscription');
  }
}

/**
 * חובה לקרוא לפונקציה זו ישירות מתוך onClick של המשתמש (Transient User Activation),
 * ללא שום קריאת fetch לפניה כדי ש-iOS Safari לא ידחה את pushManager.subscribe().
 */
export async function requestAndSubscribeWebPush(options?: {
  apiPath?: WebPushApiPath;
}): Promise<{
  ok: boolean;
  reason?:
    | 'not-supported'
    | 'needs-ios-a2hs'
    | 'vapid-missing'
    | 'denied'
    | 'error';
}> {
  if (typeof window === 'undefined' || isNativeAndroidApp()) {
    return { ok: false, reason: 'not-supported' };
  }

  if (isIosDevice() && !isStandalonePwa()) {
    return { ok: false, reason: 'needs-ios-a2hs' };
  }

  if (!isWebPushEnvironmentSupported()) {
    return { ok: false, reason: 'not-supported' };
  }

  const publicKey = getPublicVapidKey();
  if (!publicKey) {
    return { ok: false, reason: 'vapid-missing' };
  }

  try {
    let permission = Notification.permission;
    if (permission === 'default') {
      permission = await Notification.requestPermission();
    }
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied' };
    }

    let reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    const readyReg = await navigator.serviceWorker.ready;
    const activeReg = readyReg || reg;

    let sub = await activeReg.pushManager.getSubscription();
    if (!sub) {
      sub = await activeReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await uploadWebPushSubscription(sub, options?.apiPath || '/api/push/register');
    clearWebPushAppBadge();
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function syncExistingWebPushIfGranted(options?: {
  apiPath?: WebPushApiPath;
}): Promise<boolean> {
  if (!isWebPushEnvironmentSupported()) return false;
  const publicKey = getPublicVapidKey();
  if (!publicKey || Notification.permission !== 'granted') return false;

  try {
    const reg = await ensurePushServiceWorkerRegistered();
    if (!reg) return false;
    const readyReg = await navigator.serviceWorker.ready;
    let sub = await readyReg.pushManager.getSubscription();
    if (!sub) {
      sub = await readyReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    await uploadWebPushSubscription(sub, options?.apiPath || '/api/push/register');
    return true;
  } catch {
    return false;
  }
}

export async function unregisterWebPushOnLogout(options?: {
  apiPath?: WebPushApiPath;
}) {
  if (!isWebPushEnvironmentSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    const endpoint = sub?.endpoint || '';
    await fetch(options?.apiPath || '/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        op: 'unregister-web-push',
        endpoint,
      }),
    }).catch(() => {});
    if (sub) {
      await sub.unsubscribe().catch(() => {});
    }
    clearWebPushAppBadge();
  } catch {
    // ignore
  }
}

export function sendWebForegroundHeartbeat(isInForeground: boolean) {
  if (typeof window === 'undefined' || isNativeAndroidApp()) return;
  try {
    void fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        op: 'heartbeat',
        isInForeground,
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

export function shouldShowIosAddToHomeBanner(): boolean {
  if (typeof window === 'undefined' || isNativeAndroidApp()) return false;
  if (!isIosDevice() || isStandalonePwa()) return false;
  try {
    const raw = localStorage.getItem(IOS_INSTALL_DISMISSED_KEY);
    if (!raw) return true;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return true;
    // הצעה עדינה מחדש רק לאחר 7 ימים אם נסגרה
    return Date.now() - dismissedAt > 7 * 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

export function dismissIosAddToHomeBanner() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(IOS_INSTALL_DISMISSED_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

function normalizeWebDeepLink(
  raw: Record<string, unknown> | null | undefined
): PushDeepLinkTarget | null {
  if (!raw) return null;
  const rawScreen = String(raw.spotScreen || '').trim();
  const screen: PushDeepLinkTarget['screen'] =
    rawScreen === 'meal' ||
    rawScreen === 'journal' ||
    rawScreen === 'metrics' ||
    rawScreen === 'profile' ||
    rawScreen === 'inspector' ||
    rawScreen === 'app-update'
      ? rawScreen
      : 'journal';
  const pushId = String(raw.spotPushId || '').trim();
  if (!pushId && !rawScreen) return null;

  return {
    pushId: pushId || `web-${Date.now()}`,
    screen,
    mealSlotId: raw.spotMealSlotId ? String(raw.spotMealSlotId) : undefined,
    traineeId: raw.spotTraineeId ? String(raw.spotTraineeId) : undefined,
    date: raw.spotDate ? String(raw.spotDate) : undefined,
    kind: raw.spotKind ? String(raw.spotKind) : undefined,
  };
}

export function subscribeWebPushLifecycle(options: {
  onDeepLinkTarget: (target: PushDeepLinkTarget) => void;
}): () => void {
  if (typeof window === 'undefined' || isNativeAndroidApp()) return () => {};
  let disposed = false;

  const dispatchOnce = (target: PushDeepLinkTarget | null) => {
    if (!target || disposed) return;
    if (handledWebPushIds.has(target.pushId)) return;
    handledWebPushIds.add(target.pushId);
    options.onDeepLinkTarget(target);
  };

  // 1. Cold Start מהודעת Push (Declarative navigate או SW openWindow)
  try {
    const params = new URLSearchParams(window.location.search);
    const coldTarget = normalizeWebDeepLink({
      spotPushId: params.get('spotPushId') || undefined,
      spotScreen: params.get('spotScreen') || undefined,
      spotMealSlotId: params.get('spotMealSlotId') || undefined,
      spotTraineeId: params.get('spotTraineeId') || undefined,
      spotDate: params.get('spotDate') || undefined,
      spotKind: params.get('spotKind') || undefined,
    });
    if (coldTarget) {
      dispatchOnce(coldTarget);
      params.delete('spotPushId');
      params.delete('spotScreen');
      params.delete('spotMealSlotId');
      params.delete('spotTraineeId');
      params.delete('spotDate');
      params.delete('spotKind');
      const remaining = params.toString();
      const nextUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash || ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    }
  } catch {
    // ignore
  }

  // 2. Warm Start דרך Service Worker postMessage כשהאפליקציה כבר פתוחה
  const onSwMessage = (event: MessageEvent) => {
    const payload = event.data as
      | { type?: string; target?: Record<string, unknown> }
      | undefined;
    if (payload?.type === 'SPOT_PUSH_DEEP_LINK') {
      dispatchOnce(normalizeWebDeepLink(payload.target));
    }
  };
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', onSwMessage);
  }

  // 3. ניקוי Badge ודיווח נוכחות (כדי ש-AI ברקע ישלח פוש רק ביציאה מהאפליקציה)
  clearWebPushAppBadge();
  sendWebForegroundHeartbeat(!document.hidden);

  const heartbeatTimer = window.setInterval(() => {
    if (!document.hidden) {
      sendWebForegroundHeartbeat(true);
    }
  }, 25000);

  const onVisibilityChange = () => {
    const visible = document.visibilityState === 'visible';
    if (visible) clearWebPushAppBadge();
    sendWebForegroundHeartbeat(visible);
  };

  const onPageHide = () => {
    sendWebForegroundHeartbeat(false);
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    disposed = true;
    window.clearInterval(heartbeatTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    }
  };
}
