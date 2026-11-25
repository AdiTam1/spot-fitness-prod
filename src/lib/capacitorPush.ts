'use client';

import {
  PushNotifications,
  PushNotificationSchema,
  ActionPerformed,
} from '@capacitor/push-notifications';
import type { PluginListenerHandle } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import {
  getNativeStepsStatus,
  getSpotNativePlugin,
  isNativeAndroidApp,
} from '@/lib/capacitorSteps';

export type AndroidPushPermissionState = 'prompt' | 'granted' | 'denied';

export interface AndroidPushStatus {
  isNativeAndroid: boolean;
  firebaseConfigured: boolean;
  systemNotificationsEnabled: boolean;
  permissionState: AndroidPushPermissionState;
  androidSdkInt: number;
  hasSavedToken: boolean;
}

export interface PushDeepLinkTarget {
  pushId: string;
  screen: 'meal' | 'journal' | 'metrics' | 'profile' | 'inspector' | 'app-update';
  mealSlotId?: string;
  traineeId?: string;
  date?: string;
  kind?: string;
}

const TOKEN_STORAGE_KEY = 'spot_android_fcm_token';
const ASKED_STORAGE_KEY = 'spot_android_push_prompted_v1';
const handledPushIds = new Set<string>();

function getStoredToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function setStoredToken(token: string) {
  if (typeof window === 'undefined') return;
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasPromptedAndroidPushBefore(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(ASKED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAndroidPushPrompted() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ASKED_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export async function getAndroidPushStatus(): Promise<AndroidPushStatus> {
  if (!isNativeAndroidApp()) {
    return {
      isNativeAndroid: false,
      firebaseConfigured: false,
      systemNotificationsEnabled: false,
      permissionState: 'denied',
      androidSdkInt: 0,
      hasSavedToken: false,
    };
  }

  const plugin = getSpotNativePlugin();
  const sysStatus = plugin
    ? await plugin.getNotificationSystemStatus().catch(() => null)
    : null;

  let permState: AndroidPushPermissionState = 'prompt';
  try {
    const check = await PushNotifications.checkPermissions();
    if (check.receive === 'granted') permState = 'granted';
    else if (check.receive === 'denied') permState = 'denied';
    else permState = 'prompt';
  } catch {
    permState = 'prompt';
  }

  const sysEnabled = sysStatus?.areNotificationsEnabled ?? false;
  if (!sysEnabled && permState === 'granted') {
    permState = 'denied';
  }

  return {
    isNativeAndroid: true,
    firebaseConfigured: Boolean(sysStatus?.firebaseConfigured),
    systemNotificationsEnabled: sysEnabled,
    permissionState: permState,
    androidSdkInt: sysStatus?.androidSdkInt || 0,
    hasSavedToken: Boolean(getStoredToken()),
  };
}

export async function openAndroidNotificationSettings(): Promise<boolean> {
  const plugin = getSpotNativePlugin();
  if (!isNativeAndroidApp() || !plugin) return false;
  try {
    const res = await plugin.openNotificationSettings();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

async function uploadFcmTokenToServer(token: string) {
  if (!token) return;
  setStoredToken(token);
  const stepsInfo = await getNativeStepsStatus().catch(() => null);
  const deviceLabel = stepsInfo?.deviceManufacturer
    ? `${stepsInfo.deviceManufacturer} Android ${stepsInfo.androidSdkInt || ''}`.trim()
    : 'Android APK';

  await fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      op: 'register-token',
      token,
      deviceLabel,
    }),
  }).catch(() => {});
}

export async function requestAndRegisterAndroidPush(): Promise<{
  ok: boolean;
  reason?: 'not-android' | 'firebase-not-configured' | 'denied' | 'error';
  token?: string;
}> {
  if (!isNativeAndroidApp()) {
    return { ok: false, reason: 'not-android' };
  }

  markAndroidPushPrompted();
  const status = await getAndroidPushStatus();
  if (!status.firebaseConfigured) {
    return { ok: false, reason: 'firebase-not-configured' };
  }

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== 'granted') {
      perm = await PushNotifications.requestPermissions();
    }

    const postSys = await getAndroidPushStatus();
    if (perm.receive !== 'granted' || !postSys.systemNotificationsEnabled) {
      return { ok: false, reason: 'denied' };
    }

    // וידוא ערוצי התראה בעדיפות גבוהה
    await Promise.all([
      PushNotifications.createChannel({
        id: 'spot_ai_meals',
        name: 'זיהוי ארוחות AI',
        description: 'התראות בסיום פענוח ארוחה ברקע',
        importance: 5,
        visibility: 1,
        vibration: true,
      }).catch(() => {}),
      PushNotifications.createChannel({
        id: 'spot_coach_alerts',
        name: 'הודעות מאמן אישיות',
        description: 'פושים אישיים מהמאמן המלווה',
        importance: 5,
        visibility: 1,
        vibration: true,
      }).catch(() => {}),
    ]);

    const tokenPromise = new Promise<string | null>((resolve) => {
      let settled = false;
      let regHandle: PluginListenerHandle | null = null;
      let errHandle: PluginListenerHandle | null = null;
      const cleanup = () => {
        void regHandle?.remove().catch(() => {});
        void errHandle?.remove().catch(() => {});
      };
      const finish = (val: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(val);
      };

      const timer = setTimeout(() => {
        finish(getStoredToken() || null);
      }, 6000);

      void PushNotifications.addListener('registration', (t) => {
        finish(t.value);
      }).then((h) => {
        if (settled) void h.remove().catch(() => {});
        else regHandle = h;
      });

      void PushNotifications.addListener('registrationError', () => {
        finish(null);
      }).then((h) => {
        if (settled) void h.remove().catch(() => {});
        else errHandle = h;
      });
    });

    await PushNotifications.register();
    const token = await tokenPromise;
    if (!token) {
      return { ok: false, reason: 'error' };
    }

    await uploadFcmTokenToServer(token);
    return { ok: true, token };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function unregisterAndroidPushOnLogout() {
  if (!isNativeAndroidApp()) return;
  const saved = getStoredToken();
  setStoredToken('');
  try {
    await fetch('/api/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        op: 'unregister-token',
        token: saved,
      }),
    });
    const status = await getAndroidPushStatus();
    if (status.firebaseConfigured) {
      await PushNotifications.unregister().catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function sendPushForegroundHeartbeat(isInForeground: boolean) {
  if (!isNativeAndroidApp() || typeof window === 'undefined') return;
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

function normalizeTargetFromData(
  data: Record<string, unknown> | undefined,
  fallbackId?: string
): PushDeepLinkTarget | null {
  if (!data) return null;
  const rawScreen = String(data.spotScreen || '').trim();
  const screen: PushDeepLinkTarget['screen'] =
    rawScreen === 'meal' ||
    rawScreen === 'journal' ||
    rawScreen === 'metrics' ||
    rawScreen === 'profile' ||
    rawScreen === 'app-update'
      ? rawScreen
      : 'journal';
  const pushId = String(
    data.spotPushId || fallbackId || `${screen}-${Date.now()}`
  );
  return {
    pushId,
    screen,
    mealSlotId: data.spotMealSlotId ? String(data.spotMealSlotId) : undefined,
    date: data.spotDate ? String(data.spotDate) : undefined,
    kind: data.spotKind ? String(data.spotKind) : undefined,
  };
}

export function subscribeAndroidPushLifecycle(options: {
  onDeepLinkTarget: (target: PushDeepLinkTarget) => void;
  onForegroundCoachPush?: (notification: {
    title?: string;
    body?: string;
    target?: PushDeepLinkTarget | null;
  }) => void;
}): () => void {
  if (!isNativeAndroidApp()) return () => {};
  let disposed = false;

  const dispatchTarget = (target: PushDeepLinkTarget | null) => {
    if (!target || disposed) return;
    if (handledPushIds.has(target.pushId)) return;
    handledPushIds.add(target.pushId);
    options.onDeepLinkTarget(target);
  };

  const checkNativePendingTarget = async () => {
    const plugin = getSpotNativePlugin();
    if (!plugin) return;
    try {
      const pending = await plugin.consumePendingPushTarget();
      if (pending?.hasTarget) {
        dispatchTarget({
          pushId: pending.pushId || `cold-${Date.now()}`,
          screen:
            pending.screen === 'meal' ||
            pending.screen === 'journal' ||
            pending.screen === 'metrics' ||
            pending.screen === 'profile' ||
            pending.screen === 'app-update'
              ? pending.screen
              : 'journal',
          mealSlotId: pending.mealSlotId || undefined,
          date: pending.date || undefined,
          kind: pending.kind || undefined,
        });
      }
    } catch {
      // ignore
    }
  };

  void checkNativePendingTarget();

  const handles: Array<{ remove: () => Promise<void> }> = [];

  void PushNotifications.addListener('registration', (tok) => {
    if (!disposed && tok?.value) {
      void uploadFcmTokenToServer(tok.value);
    }
  }).then((h) => handles.push(h));

  void PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action: ActionPerformed) => {
      const data = action.notification?.data as Record<string, unknown> | undefined;
      dispatchTarget(normalizeTargetFromData(data, action.notification?.id));
    }
  ).then((h) => handles.push(h));

  void PushNotifications.addListener(
    'pushNotificationReceived',
    (notif: PushNotificationSchema) => {
      if (disposed) return;
      const data = notif.data as Record<string, unknown> | undefined;
      const target = normalizeTargetFromData(data, notif.id);
      // אם הגיעה הודעה אישית מהמאמן או עדכון אפליקציה בזמן שהמשתמש בתוך האפליקציה -> נציג באנר נקי בתוך המסך
      if (
        (target?.kind === 'coach' || target?.kind === 'app-update') &&
        options.onForegroundCoachPush
      ) {
        options.onForegroundCoachPush({
          title: notif.title,
          body: notif.body,
          target,
        });
      }
    }
  ).then((h) => handles.push(h));

  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (disposed) return;
    sendPushForegroundHeartbeat(isActive);
    if (isActive) {
      void checkNativePendingTarget();
    }
  }).then((h) => handles.push(h));

  return () => {
    disposed = true;
    for (const h of handles) {
      void h.remove().catch(() => {});
    }
  };
}
