'use client';

import { Capacitor, PluginListenerHandle, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { setBackLocked } from '@/lib/backGuard';
import { StepsSyncSource } from '@/types/nutrition';

export type HealthConnectAvailabilityStatus =
  | 'installed'
  | 'update-required'
  | 'not-installed'
  | 'not-supported';

export interface NativeStepEngineStatus {
  available: boolean;
  platform: 'android' | 'web';
  healthConnectStatus: HealthConnectAvailabilityStatus;
  activityRecognitionGranted: boolean;
  healthConnectStepsGranted: boolean;
  healthConnectBackgroundGranted: boolean;
  hasGooglePlayServices: boolean;
  hasStepSensor: boolean;
  healthConnectCancelCount: number;
  deviceManufacturer: string;
  androidSdkInt: number;
  versionCode: number;
  versionName: string;
}

export interface NativeDailyStepsReading {
  date: string;
  steps: number;
  source: Exclude<StepsSyncSource, 'manual'>;
}

export interface NativeNotificationSystemStatus {
  firebaseConfigured: boolean;
  areNotificationsEnabled: boolean;
  androidSdkInt: number;
}

export interface NativePendingPushTarget {
  hasTarget: boolean;
  pushId?: string;
  screen?: string;
  mealSlotId?: string;
  date?: string;
  kind?: string;
}

export interface ApkDownloadProgressEvent {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface SpotHealthStepsPlugin {
  getStatus(): Promise<NativeStepEngineStatus>;
  requestStepPermissions(): Promise<
    NativeStepEngineStatus & { restrictedSettingsHint?: boolean }
  >;
  installOrOpenHealthConnect(): Promise<{ opened: boolean }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  getSteps(options: { dates: string[] }): Promise<{
    readings: NativeDailyStepsReading[];
  }>;
  setSyncConfig(options: {
    baseUrl: string;
    syncToken: string;
    enabled: boolean;
  }): Promise<{ ok: boolean }>;
  getAppVersion(): Promise<{ versionCode: number; versionName: string }>;
  canRequestPackageInstalls(): Promise<{ granted: boolean }>;
  openUnknownSourcesSettings(): Promise<{ opened: boolean }>;
  downloadAndInstallApk(options: { url: string }): Promise<{
    started: boolean;
    needsInstallPermission?: boolean;
    settingsOpened?: boolean;
    bytes?: number;
  }>;
  addListener(
    eventName: 'apkDownloadProgress',
    listenerFunc: (event: ApkDownloadProgressEvent) => void
  ): Promise<PluginListenerHandle>;
  getNotificationSystemStatus(): Promise<NativeNotificationSystemStatus>;
  openNotificationSettings(): Promise<{ opened: boolean }>;
  consumePendingPushTarget(): Promise<NativePendingPushTarget>;
}

const SpotHealthSteps =
  typeof window !== 'undefined'
    ? registerPlugin<SpotHealthStepsPlugin>('SpotHealthSteps')
    : null;

export function getSpotNativePlugin(): SpotHealthStepsPlugin | null {
  return SpotHealthSteps;
}

export function isNativeAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    );
  } catch {
    return false;
  }
}

export async function getNativeStepsStatus(): Promise<NativeStepEngineStatus | null> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return null;
  try {
    return await SpotHealthSteps.getStatus();
  } catch {
    return null;
  }
}

export async function requestNativeStepPermissions(): Promise<
  (NativeStepEngineStatus & { restrictedSettingsHint?: boolean }) | null
> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return null;
  try {
    return await SpotHealthSteps.requestStepPermissions();
  } catch {
    return null;
  }
}

export async function installOrOpenHealthConnect(): Promise<boolean> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return false;
  try {
    const res = await SpotHealthSteps.installOrOpenHealthConnect();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

export async function openAndroidAppSettings(): Promise<boolean> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return false;
  try {
    const res = await SpotHealthSteps.openAppSettings();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

export async function readNativeDailySteps(
  dates: string[]
): Promise<NativeDailyStepsReading[]> {
  if (!isNativeAndroidApp() || !SpotHealthSteps || dates.length === 0) {
    return [];
  }
  try {
    const res = await SpotHealthSteps.getSteps({ dates });
    return Array.isArray(res?.readings) ? res.readings : [];
  } catch {
    return [];
  }
}

export async function configureBackgroundStepsSync(options: {
  baseUrl: string;
  syncToken: string;
  enabled: boolean;
}): Promise<boolean> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return false;
  try {
    const res = await SpotHealthSteps.setSyncConfig(options);
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

export function subscribeAndroidAppResume(onResume: () => void): () => void {
  if (!isNativeAndroidApp()) return () => {};
  let removed = false;
  const handlePromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (!removed && isActive) {
      onResume();
    }
  });
  return () => {
    removed = true;
    void handlePromise.then((h) => h.remove()).catch(() => {});
  };
}

export interface AppUpdateInfo {
  updateAvailable: boolean;
  isForceUpdateBlocked: boolean;
  localVersionCode: number;
  localVersionName: string;
  latestVersionCode: number;
  latestVersionName: string;
  blockedUpToVersionCode: number;
  apkDownloadUrl: string;
  releaseNotes?: string;
}

export interface RemoteAndroidPolicyPayload {
  latestVersionCode?: number;
  latestVersionName?: string;
  androidBlockedUpToVersionCode?: number;
  apkDownloadUrl?: string;
  releaseNotes?: string;
}

let cachedNativeAppVersion: { versionCode: number; versionName: string } | null = null;

export async function getNativeInstalledAppVersion(): Promise<{
  versionCode: number;
  versionName: string;
} | null> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return null;
  if (cachedNativeAppVersion) return cachedNativeAppVersion;
  try {
    const info = await SpotHealthSteps.getAppVersion();
    cachedNativeAppVersion = {
      versionCode: Math.max(1, Number(info?.versionCode || 1)),
      versionName: String(info?.versionName || '1.0.0'),
    };
    return cachedNativeAppVersion;
  } catch {
    return null;
  }
}

export function buildAppUpdateInfoFromRemote(
  localInfo: { versionCode: number; versionName: string },
  remote: RemoteAndroidPolicyPayload
): AppUpdateInfo {
  const localCode = Math.max(1, Number(localInfo.versionCode || 1));
  const latestCode = Math.max(1, Number(remote.latestVersionCode || 1));
  const blockedUpTo = Math.max(
    0,
    Math.round(Number(remote.androidBlockedUpToVersionCode || 0))
  );
  const isForceUpdateBlocked = blockedUpTo > 0 && localCode <= blockedUpTo;

  return {
    updateAvailable: isForceUpdateBlocked || latestCode > localCode,
    isForceUpdateBlocked,
    localVersionCode: localCode,
    localVersionName: String(localInfo.versionName || '1.0.0'),
    latestVersionCode: latestCode,
    latestVersionName: String(remote.latestVersionName || '1.0.0'),
    blockedUpToVersionCode: blockedUpTo,
    apkDownloadUrl: String(
      remote.apkDownloadUrl ||
        (typeof window !== 'undefined' && window.location?.origin
          ? `${window.location.origin}/downloads/spot-fitness-release.apk`
          : 'https://spot-fitness-prod.vercel.app/downloads/spot-fitness-release.apk')
    ),
    releaseNotes: remote.releaseNotes,
  };
}

export async function checkNativeAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return null;
  try {
    const [localInfo, remoteRes] = await Promise.all([
      getNativeInstalledAppVersion(),
      fetch(`/api/app-version?t=${Date.now()}`, { cache: 'no-store' }),
    ]);
    if (!localInfo || !remoteRes.ok) return null;
    const remote = (await remoteRes.json()) as RemoteAndroidPolicyPayload;
    return buildAppUpdateInfoFromRemote(localInfo, remote);
  } catch {
    return null;
  }
}

export async function canInstallApkPackages(): Promise<boolean> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return false;
  try {
    const res = await SpotHealthSteps.canRequestPackageInstalls();
    return Boolean(res?.granted);
  } catch {
    return false;
  }
}

export async function openAndroidUnknownSourcesSettings(): Promise<boolean> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return false;
  try {
    const res = await SpotHealthSteps.openUnknownSourcesSettings();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

export async function downloadAndInstallAndroidApk(
  url: string,
  onProgress?: (event: ApkDownloadProgressEvent) => void
): Promise<{
  started: boolean;
  needsInstallPermission?: boolean;
  error?: string;
}> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) {
    return { started: false, error: 'זמין רק באפליקציית האנדרואיד' };
  }
  let handle: PluginListenerHandle | null = null;
  try {
    if (onProgress && typeof SpotHealthSteps.addListener === 'function') {
      handle = await SpotHealthSteps.addListener('apkDownloadProgress', onProgress);
    }
    const res = await SpotHealthSteps.downloadAndInstallApk({ url });
    return {
      started: Boolean(res?.started),
      needsInstallPermission: Boolean(res?.needsInstallPermission),
    };
  } catch (err) {
    return {
      started: false,
      error: err instanceof Error ? err.message : 'שגיאה בהורדת קובץ ההתקנה',
    };
  } finally {
    if (handle) {
      void handle.remove().catch(() => {});
    }
  }
}

export function blockAndroidBackButtonWhileLocked(locked: boolean): () => void {
  if (!isNativeAndroidApp() || !locked) return () => {};
  setBackLocked(true);
  const handlePromise = CapacitorApp.addListener('backButton', () => {
    // חסום לחלוטין בזמן ששער העדכון המחייב פעיל — לא מאפשר חזרה אחורה לתוך האפליקציה
  });
  return () => {
    setBackLocked(false);
    void handlePromise.then((h) => h.remove()).catch(() => {});
  };
}

export function getLocalDateOffsetIso(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
