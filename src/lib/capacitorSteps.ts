'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
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
  latestVersionCode: number;
  latestVersionName: string;
  apkDownloadUrl: string;
  releaseNotes?: string;
}

export async function checkNativeAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!isNativeAndroidApp() || !SpotHealthSteps) return null;
  try {
    const [localInfo, remoteRes] = await Promise.all([
      SpotHealthSteps.getAppVersion(),
      fetch('/api/app-version', { cache: 'no-store' }),
    ]);
    if (!remoteRes.ok) return null;
    const remote = (await remoteRes.json()) as {
      latestVersionCode?: number;
      latestVersionName?: string;
      apkDownloadUrl?: string;
      releaseNotes?: string;
    };
    const latestCode = Number(remote.latestVersionCode || 1);
    const localCode = Number(localInfo?.versionCode || 1);
    return {
      updateAvailable: latestCode > localCode,
      latestVersionCode: latestCode,
      latestVersionName: String(remote.latestVersionName || '1.0.0'),
      apkDownloadUrl: String(remote.apkDownloadUrl || '/download'),
      releaseNotes: remote.releaseNotes,
    };
  } catch {
    return null;
  }
}

export function getLocalDateOffsetIso(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
