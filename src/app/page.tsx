'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Crown,
  LogOut,
  ShieldCheck,
  User,
  Loader2,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Download,
  Bell,
  Share,
  Smartphone,
} from 'lucide-react';
import {
  AccountStatus,
  AiContextParams,
  AppReleasePolicy,
  AuthRejectionCode,
  AuthSessionUser,
  BodyMeasurementEntry,
  CoachDirectoryItem,
  CoachProfile,
  CoachOnboardingData,
  CoachPushSubscriptionSettings,
  DailyCardioLog,
  DailyWorkoutLog,
  DayType,
  LoggedFoodItem,
  MealCardShortcutId,
  NutritionTemplate,
  PendingAiMealJob,
  QuickContextChip,
  SavedMealPreset,
  StepsSyncSource,
  TraineeActiveDateRange,
  TraineeActivityTargets,
  TraineeCustomUnit,
  TraineeGroup,
  TraineeOnboardingData,
  TraineeProfile,
  TraineePushPreferences,
  TraineeServingTool,
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import { TraineeMobileView } from '@/components/TraineeMobileView';
import { PendingApprovalView } from '@/components/PendingApprovalView';
import { CoachDashboardView } from '@/components/CoachDashboardView';
import { AuthGateView } from '@/components/AuthGateView';
import { CoachOnboardingWizard } from '@/components/CoachOnboardingWizard';
import { BackgroundAiSyncBanner } from '@/components/BackgroundAiSyncBanner';
import {
  AI_JOB_STALE_TIMEOUT_MS,
  isAiJobActivelyProcessing,
  normalizePendingAiJobs,
} from '@/lib/aiJobs';
import { AndroidForceUpdateGate } from '@/components/AndroidForceUpdateGate';
import {
  AppUpdateInfo,
  RemoteAndroidPolicyPayload,
  buildAppUpdateInfoFromRemote,
  checkNativeAppUpdate,
  configureBackgroundStepsSync,
  downloadAndInstallAndroidApk,
  getLocalDateOffsetIso,
  getNativeInstalledAppVersion,
  isNativeAndroidApp,
  readNativeDailySteps,
  subscribeAndroidAppResume,
} from '@/lib/capacitorSteps';
import {
  cleanRefreshQueryParamOnMount,
  CLIENT_WEB_BUILD_ID,
  isSpotEditingBusy,
  isWebVersionMismatch,
  performHardRefresh,
  subscribeAuthKicked,
  subscribeSpotEditingBusy,
} from '@/lib/webVersionGuard';
import {
  detectClientPlatform,
  initClientTelemetry,
  trackClientEvent,
} from '@/lib/telemetry/clientTracker';
import {
  PushDeepLinkTarget,
  getAndroidPushStatus,
  hasPromptedAndroidPushBefore,
  markAndroidPushPrompted,
  requestAndRegisterAndroidPush,
  sendPushForegroundHeartbeat,
  subscribeAndroidPushLifecycle,
  unregisterAndroidPushOnLogout,
} from '@/lib/capacitorPush';
import {
  dismissIosAddToHomeBanner,
  ensurePushServiceWorkerRegistered,
  getWebPushEnvironmentStatus,
  requestAndSubscribeWebPush,
  shouldShowIosAddToHomeBanner,
  subscribeWebPushLifecycle,
  syncExistingWebPushIfGranted,
  unregisterWebPushOnLogout,
} from '@/lib/webPushClient';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [coachPreviewTraineeId, setCoachPreviewTraineeId] = useState<
    string | null
  >(null);

  const [templates, setTemplates] = useState<NutritionTemplate[]>([]);
  const [trainees, setTrainees] = useState<TraineeProfile[]>([]);
  const [groups, setGroups] = useState<TraineeGroup[]>([]);
  const [globalQuickChips, setGlobalQuickChips] = useState<QuickContextChip[]>([]);
  const [traineeGroupQuickChips, setTraineeGroupQuickChips] = useState<
    QuickContextChip[]
  >([]);
  const [coaches, setCoaches] = useState<CoachProfile[]>([]);
  const [myCoachProfile, setMyCoachProfile] = useState<CoachProfile | null>(
    null
  );
  const [editingCoachOnboarding, setEditingCoachOnboarding] = useState(false);
  const [skippedCoachOnboarding, setSkippedCoachOnboarding] = useState(false);
  const [coachDirectory, setCoachDirectory] = useState<CoachDirectoryItem[]>(
    []
  );
  const [coachInviteCode, setCoachInviteCode] = useState<string>('SPOT2026');
  const [hydrated, setHydrated] = useState(false);

  const [syncingCount, setSyncingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [androidUpdateInfo, setAndroidUpdateInfo] = useState<AppUpdateInfo | null>(
    null
  );
  const [appReleasePolicy, setAppReleasePolicy] = useState<AppReleasePolicy>({
    androidBlockedUpToVersionCode: 0,
  });
  const [pendingWebUpdateBuildId, setPendingWebUpdateBuildId] = useState<
    string | null
  >(null);
  const [sessionNotice, setSessionNotice] = useState<{
    code: AuthRejectionCode;
    message: string;
  } | null>(null);
  const [optionalApkDownloading, setOptionalApkDownloading] = useState(false);
  const [dismissedUpdateBanner, setDismissedUpdateBanner] = useState(false);
  const [localBgJobs, setLocalBgJobs] = useState<PendingAiMealJob[]>([]);
  const [liveBgJobIds, setLiveBgJobIds] = useState<string[]>([]);
  const bgJobAbortControllersRef = useRef<Map<string, AbortController>>(
    new Map()
  );
  const [externalOpenMealRequest, setExternalOpenMealRequest] = useState<{
    traineeId: string;
    date: string;
    mealSlotId: string;
    initialTab?: string;
    nonce: number;
  } | null>(null);
  const [coachPushSettings, setCoachPushSettings] =
    useState<CoachPushSubscriptionSettings | null>(null);
  const [externalInspectTraineeRequest, setExternalInspectTraineeRequest] =
    useState<{
      traineeId: string;
      nonce: number;
    } | null>(null);
  const [externalOpenCoachAlertsNonce, setExternalOpenCoachAlertsNonce] =
    useState(0);
  const [externalSectionRequest, setExternalSectionRequest] = useState<{
    traineeId: string;
    section: 'journal' | 'metrics' | 'profile';
    date?: string;
    nonce: number;
  } | null>(null);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [webPushPromptOpen, setWebPushPromptOpen] = useState(false);
  const [showIosA2hsBanner, setShowIosA2hsBanner] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);

  const currentUserRef = useRef<AuthSessionUser | null>(null);
  const traineesRef = useRef<TraineeProfile[]>([]);
  const syncingCountRef = useRef<number>(0);
  const mutationEpochRef = useRef<number>(0);
  const lastFetchAtRef = useRef<number>(0);
  const lastHeartbeatAtRef = useRef<number>(0);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);
  useEffect(() => {
    traineesRef.current = trainees;
  }, [trainees]);

  const clearAllClientSessionState = useCallback(
    (notice?: { code: AuthRejectionCode; message: string }) => {
      const hadUser = Boolean(currentUserRef.current);
      currentUserRef.current = null;
      setCurrentUser(null);
      setTrainees([]);
      traineesRef.current = [];
      setTemplates([]);
      setGroups([]);
      setGlobalQuickChips([]);
      setTraineeGroupQuickChips([]);
      setCoaches([]);
      setMyCoachProfile(null);
      setCoachDirectory([]);
      setCoachPreviewTraineeId(null);
      setCoachPushSettings(null);
      bgJobAbortControllersRef.current.forEach((ctrl) => ctrl.abort());
      bgJobAbortControllersRef.current.clear();
      setLiveBgJobIds([]);
      setLocalBgJobs([]);
      setExternalOpenMealRequest(null);
      setExternalSectionRequest(null);
      setPushPromptOpen(false);
      setWebPushPromptOpen(false);
      setShowIosA2hsBanner(false);
      if (notice) {
        setSessionNotice(notice);
        if (hadUser) {
          notifications.show({
            color: notice.code === 'ACCOUNT_BLOCKED' ? 'red' : 'orange',
            title:
              notice.code === 'ACCOUNT_BLOCKED'
                ? 'החשבון נחסם / הושהה'
                : 'נותקת מהמערכת',
            message: notice.message,
          });
        }
      }
      if (isNativeAndroidApp()) {
        void configureBackgroundStepsSync({
          baseUrl: '',
          syncToken: '',
          enabled: false,
        }).catch(() => {});
      }
    },
    []
  );

  useEffect(() => {
    cleanRefreshQueryParamOnMount();
    const stopClientTelemetry = initClientTelemetry();
    const unsubKick = subscribeAuthKicked((detail) => {
      clearAllClientSessionState(detail);
    });

    const handleChunkFailure = (rawReason: unknown) => {
      const text =
        rawReason instanceof Error
          ? `${rawReason.name} ${rawReason.message}`
          : String(rawReason || '');
      if (
        !/ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(
          text
        )
      ) {
        return;
      }
      trackClientEvent('performance', 'chunk_load_recovery', {
        details: { message: text.slice(0, 180) },
      });
      void fetch(`/api/app-version?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { webBuildId?: string } | null) => {
          if (data?.webBuildId) {
            void performHardRefresh(data.webBuildId);
          }
        })
        .catch(() => {});
    };

    const onWinErr = (ev: ErrorEvent) => handleChunkFailure(ev.error || ev.message);
    const onUnhandled = (ev: PromiseRejectionEvent) =>
      handleChunkFailure(ev.reason);

    window.addEventListener('error', onWinErr);
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => {
      stopClientTelemetry();
      unsubKick();
      window.removeEventListener('error', onWinErr);
      window.removeEventListener('unhandledrejection', onUnhandled);
    };
  }, [clearAllClientSessionState]);

  useEffect(() => {
    if (!hydrated) return;
    const screenKey = !currentUser
      ? 'auth_gate'
      : currentUser.status === 'pending'
      ? 'pending_approval'
      : currentUser.role === 'trainee'
      ? 'trainee_app'
      : coachPreviewTraineeId
      ? 'coach_preview_trainee'
      : 'coach_dashboard';
    trackClientEvent('screen_view', `view_${screenKey}`, {
      screen: screenKey,
      details: { role: currentUser?.role || 'guest' },
    });
  }, [hydrated, currentUser, coachPreviewTraineeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOffline(!window.navigator.onLine);
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const fetchAuthorizedData = useCallback(async (opts?: { force?: boolean }) => {
    if (!opts?.force && syncingCountRef.current > 0) {
      return;
    }
    const startEpoch = mutationEpochRef.current;
    lastFetchAtRef.current = Date.now();
    try {
      const dataRes = await fetch(`/api/data?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (dataRes.status === 401 || dataRes.status === 403) {
        const errBody = (await dataRes.json().catch(() => null)) as {
          code?: AuthRejectionCode;
          error?: string;
        } | null;
        clearAllClientSessionState(
          errBody?.code && errBody.code !== 'UNAUTHENTICATED' && errBody.error
            ? { code: errBody.code, message: errBody.error }
            : undefined
        );
        return;
      }
      if (dataRes.ok) {
        const remoteData = await dataRes.json();
        // אם בוצעה בינתיים שמירה מקומית חדשה בזמן שהמשיכה הייתה באוויר — אל תדרוס state טרי
        if (
          !opts?.force &&
          (syncingCountRef.current > 0 || mutationEpochRef.current !== startEpoch)
        ) {
          return;
        }
        if (Array.isArray(remoteData.trainees)) {
          setTrainees(remoteData.trainees);
        }
        if (Array.isArray(remoteData.templates)) {
          setTemplates(remoteData.templates);
        }
        if (Array.isArray(remoteData.groups)) {
          setGroups(remoteData.groups);
        }
        if (Array.isArray(remoteData.globalQuickChips)) {
          setGlobalQuickChips(remoteData.globalQuickChips);
        }
        if (Array.isArray(remoteData.groupQuickChips)) {
          setTraineeGroupQuickChips(remoteData.groupQuickChips);
        }
        if (Array.isArray(remoteData.coaches)) {
          setCoaches(remoteData.coaches);
        }
        if (remoteData.myCoachProfile) {
          setMyCoachProfile(remoteData.myCoachProfile);
        }
        if (Array.isArray(remoteData.coachDirectory)) {
          setCoachDirectory(remoteData.coachDirectory);
        }
        if (remoteData.coachInviteCode) {
          setCoachInviteCode(remoteData.coachInviteCode);
        }
        if (remoteData.coachPushSettings) {
          setCoachPushSettings(remoteData.coachPushSettings);
        }
        if (remoteData.appReleasePolicy) {
          setAppReleasePolicy(remoteData.appReleasePolicy as AppReleasePolicy);
        }
        if (remoteData.dbError) {
          setSyncError(remoteData.dbError);
        }
      }
    } catch {
      // ignore network error
    }
  }, [clearAllClientSessionState]);

  const runHeartbeatAndVersionCheck = useCallback(async () => {
    if (typeof window === 'undefined' || !window.navigator.onLine) return;
    lastHeartbeatAtRef.current = Date.now();
    try {
      const localAndroid = isNativeAndroidApp()
        ? await getNativeInstalledAppVersion()
        : null;
      const hbHeaders: Record<string, string> = {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'x-spot-client-platform': detectClientPlatform(),
        'x-spot-web-build-id': CLIENT_WEB_BUILD_ID,
      };
      if (localAndroid) {
        hbHeaders['x-spot-android-version-code'] = String(
          localAndroid.versionCode
        );
      }

      const res = await fetch(`/api/auth/heartbeat?t=${Date.now()}`, {
        cache: 'no-store',
        headers: hbHeaders,
      });

      const data = (await res.json().catch(() => null)) as {
        authenticated?: boolean;
        code?: AuthRejectionCode;
        error?: string;
        webBuildId?: string;
        androidPolicy?: RemoteAndroidPolicyPayload;
      } | null;

      if (localAndroid && data?.androidPolicy) {
        const nextUpdateInfo = buildAppUpdateInfoFromRemote(
          localAndroid,
          data.androidPolicy
        );
        setAndroidUpdateInfo((prev) => ({
          ...nextUpdateInfo,
          // שמור releaseNotes / latestVersionName מ-GitHub אם שרת ה-heartbeat לא כלל אותם
          latestVersionName:
            nextUpdateInfo.latestVersionName !== '1.0.0' || !prev
              ? nextUpdateInfo.latestVersionName
              : prev.latestVersionName,
          latestVersionCode: Math.max(
            nextUpdateInfo.latestVersionCode,
            prev?.latestVersionCode || 1
          ),
        }));
      }

      if (
        (res.status === 401 || res.status === 403 || data?.authenticated === false) &&
        currentUserRef.current &&
        data?.code &&
        data.code !== 'UNAUTHENTICATED'
      ) {
        clearAllClientSessionState({
          code: data.code,
          message:
            data.error ||
            'החיבור למערכת הופסק מרחוק. אנא התחבר מחדש.',
        });
        return;
      }

      if (res.status === 401 && currentUserRef.current) {
        clearAllClientSessionState({
          code: 'SESSION_REVOKED',
          message: 'פג תוקף החיבור או שנותקת מהמערכת. אנא התחבר מחדש.',
        });
        return;
      }

      if (data?.webBuildId && isWebVersionMismatch(data.webBuildId)) {
        if (isSpotEditingBusy() || syncingCountRef.current > 0) {
          setPendingWebUpdateBuildId(data.webBuildId);
        } else {
          void performHardRefresh(data.webBuildId);
        }
      }
    } catch {
      // Fail-open ברשת זמנית: לא חוסמים או מנתקים על שגיאת אינטרנט רגעית
    }
  }, [clearAllClientSessionState]);

  useEffect(() => {
    if (!pendingWebUpdateBuildId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryFlushRefresh = () => {
      if (isSpotEditingBusy() || syncingCountRef.current > 0) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!isSpotEditingBusy() && syncingCountRef.current === 0) {
          void performHardRefresh(pendingWebUpdateBuildId);
        }
      }, 250);
    };
    tryFlushRefresh();
    const unsub = subscribeSpotEditingBusy(tryFlushRefresh);
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [pendingWebUpdateBuildId, syncingCount]);

  useEffect(() => {
    async function initSecureSession() {
      try {
        const [sessionRes] = await Promise.all([
          fetch(`/api/auth/session?t=${Date.now()}`, { cache: 'no-store' }),
          runHeartbeatAndVersionCheck(),
        ]);
        if (sessionRes.ok) {
          const sessionData = (await sessionRes.json()) as {
            user?: AuthSessionUser | null;
            code?: AuthRejectionCode;
            error?: string;
          };
          if (sessionData.user) {
            setCurrentUser(sessionData.user);
            await fetchAuthorizedData();
          } else if (
            sessionData.code &&
            sessionData.code !== 'UNAUTHENTICATED' &&
            sessionData.error
          ) {
            setSessionNotice({
              code: sessionData.code,
              message: sessionData.error,
            });
          }
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    }
    initSecureSession();
  }, [fetchAuthorizedData, runHeartbeatAndVersionCheck]);

  // דופק אבטחה וגרסאות כל 5 שניות כשהמשתמש מחובר וצופה במסך + סנכרון מלא כל 25 שניות + חזרה מרקע
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onReturnToForeground = () => {
      if (document.visibilityState === 'hidden') return;
      if (!window.navigator.onLine) return;
      if (Date.now() - lastHeartbeatAtRef.current >= 1500) {
        void runHeartbeatAndVersionCheck();
      }
      if (
        currentUserRef.current &&
        Date.now() - lastFetchAtRef.current >= 3500
      ) {
        void fetchAuthorizedData();
      }
    };

    window.addEventListener('focus', onReturnToForeground);
    document.addEventListener('visibilitychange', onReturnToForeground);

    // ריווח חכם של בדיקת הסשן והנוכחות (35s למשתמש מחובר, 60s למסך כניסה) כדי לשמור על מכסת Vercel/Supabase
    const hbIntervalMs = currentUser ? 35000 : 60000;
    const hbInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && window.navigator.onLine) {
        void runHeartbeatAndVersionCheck();
      }
    }, hbIntervalMs);

    const dataInterval = currentUser
      ? setInterval(() => {
          if (document.visibilityState === 'visible' && window.navigator.onLine) {
            void fetchAuthorizedData();
          }
        }, 25000)
      : null;

    return () => {
      window.removeEventListener('focus', onReturnToForeground);
      document.removeEventListener('visibilitychange', onReturnToForeground);
      clearInterval(hbInterval);
      if (dataInterval) clearInterval(dataInterval);
    };
  }, [currentUser, fetchAuthorizedData, runHeartbeatAndVersionCheck]);

  // סנכרון צעדים אוטומטי מאפליקציית האנדרואיד (Health Connect + Google Play Services Local Recording + WorkManager)
  const syncNativeAndroidSteps = useCallback(async () => {
    if (!isNativeAndroidApp() || !currentUser || currentUser.role !== 'trainee') {
      return;
    }
    try {
      const datesToSync = [getLocalDateOffsetIso(1), getLocalDateOffsetIso(0)];
      const [tokenRes, readings] = await Promise.all([
        fetch('/api/steps/sync', { cache: 'no-store' }).catch(() => null),
        readNativeDailySteps(datesToSync),
      ]);

      if (tokenRes && tokenRes.ok && typeof window !== 'undefined') {
        const tokenJson = (await tokenRes.json().catch(() => null)) as {
          syncToken?: string;
        } | null;
        if (tokenJson?.syncToken) {
          await configureBackgroundStepsSync({
            baseUrl: window.location.origin,
            syncToken: tokenJson.syncToken,
            enabled: true,
          });
        }
      }

      if (readings.length === 0) return;

      const syncRes = await fetch('/api/steps/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: readings.map((r) => ({
            date: r.date,
            steps: r.steps,
            source: r.source,
            syncedAt: new Date().toISOString(),
          })),
        }),
      });

      if (syncRes.ok) {
        const result = (await syncRes.json()) as {
          synced?: Record<
            string,
            { steps: number; stepsSource: StepsSyncSource; stepsSyncedAt: string }
          >;
        };
        const syncedMap = result.synced || {};
        if (Object.keys(syncedMap).length > 0) {
          const applyStepsUpdate = (list: TraineeProfile[]) =>
            list.map((t) => {
              if (t.id !== currentUser.id) return t;
              const nextLogs = { ...t.logs };
              for (const [dKey, sInfo] of Object.entries(syncedMap)) {
                const prevDay = nextLogs[dKey] || {
                  date: dKey,
                  dayType: 'workout',
                  waterCups: 0,
                  waterGoal: 12,
                  weightKg: t.currentWeight,
                  meals: {},
                };
                nextLogs[dKey] = {
                  ...prevDay,
                  steps: sInfo.steps,
                  stepsSource: sInfo.stepsSource,
                  stepsSyncedAt: sInfo.stepsSyncedAt,
                };
              }
              return { ...t, logs: nextLogs };
            });
          traineesRef.current = applyStepsUpdate(traineesRef.current);
          setTrainees((prev) => applyStepsUpdate(prev));
        }
      }
    } catch {
      // שקט: לא חוסם את האפליקציה
    }
  }, [currentUser]);

  const refreshAndroidVersionGate = useCallback(async () => {
    if (!isNativeAndroidApp()) return null;
    const info = await checkNativeAppUpdate();
    if (info) {
      setAndroidUpdateInfo(info);
    }
    return info;
  }, []);

  useEffect(() => {
    if (!isNativeAndroidApp()) return;
    let active = true;
    checkNativeAppUpdate().then((info) => {
      if (active && info) {
        setAndroidUpdateInfo(info);
      }
    });
    const unsubResume = subscribeAndroidAppResume(() => {
      void refreshAndroidVersionGate();
    });
    return () => {
      active = false;
      unsubResume();
    };
  }, [refreshAndroidVersionGate]);

  useEffect(() => {
    if (!isNativeAndroidApp() || !currentUser || currentUser.role !== 'trainee') {
      return;
    }
    void syncNativeAndroidSteps();
    const unsub = subscribeAndroidAppResume(() => {
      void syncNativeAndroidSteps();
    });
    return unsub;
  }, [currentUser, syncNativeAndroidSteps]);

  const activeAndroidTraineeId =
    isNativeAndroidApp() && currentUser?.role === 'trainee'
      ? currentUser.id
      : '';
  const activeWebTraineeId =
    !isNativeAndroidApp() && currentUser?.role === 'trainee'
      ? currentUser.id
      : '';
  const activeCoachWebId =
    !isNativeAndroidApp() &&
    (currentUser?.role === 'coach' || currentUser?.role === 'admin')
      ? currentUser.id
      : '';

  const applyPushDeepLinkTarget = useCallback(
    (target: PushDeepLinkTarget, traineeId: string) => {
      if (!traineeId) return;
      void fetchAuthorizedData({ force: true });
      const targetDate = target.date || getLocalDateOffsetIso(0);
      if (target.screen === 'meal' && target.mealSlotId) {
        setExternalOpenMealRequest({
          traineeId,
          date: targetDate,
          mealSlotId: target.mealSlotId,
          initialTab: target.kind === 'ai-meal' ? 'meal-items' : undefined,
          nonce: Date.now(),
        });
      } else {
        setExternalSectionRequest({
          traineeId,
          section:
            target.screen === 'meal' || target.screen === 'inspector'
              ? 'journal'
              : target.screen,
          date: target.date,
          nonce: Date.now(),
        });
      }
    },
    [fetchAuthorizedData]
  );

  const handleConsumeExternalMealRequest = useCallback((nonce: number) => {
    setExternalOpenMealRequest((prev) =>
      prev && prev.nonce === nonce ? null : prev
    );
  }, []);

  const handleConsumeExternalSectionRequest = useCallback((nonce: number) => {
    setExternalSectionRequest((prev) =>
      prev && prev.nonce === nonce ? null : prev
    );
  }, []);

  useEffect(() => {
    if (!activeAndroidTraineeId) {
      return;
    }

    let cancelled = false;

    void getAndroidPushStatus().then((status) => {
      if (cancelled || !status.firebaseConfigured) return;
      if (
        status.permissionState === 'granted' &&
        status.systemNotificationsEnabled
      ) {
        void requestAndRegisterAndroidPush();
      } else if (
        status.permissionState === 'prompt' &&
        !hasPromptedAndroidPushBefore()
      ) {
        setPushPromptOpen(true);
      }
    });

    sendPushForegroundHeartbeat(!document.hidden);
    const heartbeatTimer = window.setInterval(() => {
      if (!document.hidden) {
        sendPushForegroundHeartbeat(true);
      }
    }, 25000);
    const onVisibilityChange = () => {
      sendPushForegroundHeartbeat(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const unsubPush = subscribeAndroidPushLifecycle({
      onDeepLinkTarget: (target) => {
        if (!cancelled) applyPushDeepLinkTarget(target, activeAndroidTraineeId);
      },
      onForegroundCoachPush: (notif) => {
        if (cancelled) return;
        void fetchAuthorizedData({ force: true });
        notifications.show({
          title: notif.title || 'הודעה אישית מהמאמן',
          message: notif.body || 'המאמן שלך שלח לך עדכון חדש',
          color: 'orange',
          autoClose: 6000,
        });
      },
    });

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      unsubPush();
    };
  }, [activeAndroidTraineeId, applyPushDeepLinkTarget, fetchAuthorizedData]);

  useEffect(() => {
    if (!activeWebTraineeId) {
      return;
    }

    let cancelled = false;

    void ensurePushServiceWorkerRegistered().then(async () => {
      if (cancelled) return;
      await syncExistingWebPushIfGranted();
      if (cancelled) return;

      if (shouldShowIosAddToHomeBanner()) {
        setShowIosA2hsBanner(true);
      }

      const webSt = await getWebPushEnvironmentStatus();
      if (cancelled) return;
      let alreadyPrompted = true;
      try {
        alreadyPrompted =
          localStorage.getItem('spot_web_push_prompted_v1') === '1';
      } catch {
        alreadyPrompted = false;
      }

      if (
        webSt.webPushSupported &&
        webSt.vapidConfigured &&
        webSt.permissionState === 'default' &&
        !alreadyPrompted
      ) {
        setWebPushPromptOpen(true);
      }
    });

    const unsubWebPush = subscribeWebPushLifecycle({
      onDeepLinkTarget: (target) => {
        if (!cancelled) applyPushDeepLinkTarget(target, activeWebTraineeId);
      },
    });

    return () => {
      cancelled = true;
      unsubWebPush();
    };
  }, [activeWebTraineeId, applyPushDeepLinkTarget]);

  useEffect(() => {
    if (!activeCoachWebId) return;
    let cancelled = false;

    void ensurePushServiceWorkerRegistered().then(async () => {
      if (cancelled) return;
      await syncExistingWebPushIfGranted({
        apiPath: '/api/push/coach-alerts',
      });
      if (cancelled) return;
      if (shouldShowIosAddToHomeBanner()) {
        setShowIosA2hsBanner(true);
      }
    });

    const unsubCoachPush = subscribeWebPushLifecycle({
      onDeepLinkTarget: (target) => {
        if (cancelled) return;
        void fetchAuthorizedData({ force: true });
        if (target.traineeId) {
          setCoachPreviewTraineeId(null);
          setExternalInspectTraineeRequest({
            traineeId: target.traineeId,
            nonce: Date.now(),
          });
        }
      },
    });

    return () => {
      cancelled = true;
      unsubCoachPush();
    };
  }, [activeCoachWebId, fetchAuthorizedData]);

  const handleRenameTraineeProfile = useCallback(
    async (newName: string): Promise<{ error?: string }> => {
      if (!currentUser || currentUser.role !== 'trainee') {
        return { error: 'שינוי שם זמין רק במצב מתאמן' };
      }
      try {
        const res = await fetch('/api/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        const data = (await res.json()) as {
          error?: string;
          name?: string;
          avatar?: string;
          user?: AuthSessionUser;
        };
        if (!res.ok) {
          return { error: data.error || 'שגיאה בעדכון שם המשתמש' };
        }
        const cleanName = data.name || newName.trim();
        const nextAvatar = data.avatar || cleanName.charAt(0) || 'מ';
        if (data.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser((prev) => (prev ? { ...prev, name: cleanName } : prev));
        }
        const updateList = (list: TraineeProfile[]) =>
          list.map((t) =>
            t.id === currentUser.id
              ? { ...t, name: cleanName, avatar: nextAvatar }
              : t
          );
        traineesRef.current = updateList(traineesRef.current);
        setTrainees((prev) => updateList(prev));
        return {};
      } catch {
        return { error: 'שגיאת תקשורת בעדכון השם' };
      }
    },
    [currentUser]
  );

  const handlePushPreferencesUpdated = useCallback(
    (prefs: TraineePushPreferences) => {
      if (!currentUser || currentUser.role !== 'trainee') return;
      const updateList = (list: TraineeProfile[]) =>
        list.map((t) =>
          t.id === currentUser.id ? { ...t, pushPreferences: prefs } : t
        );
      traineesRef.current = updateList(traineesRef.current);
      setTrainees((prev) => updateList(prev));
    },
    [currentUser]
  );

  const postDataAction = async (payload: Record<string, unknown>) => {
    syncingCountRef.current += 1;
    mutationEpochRef.current += 1;
    setSyncingCount((c) => c + 1);
    setSyncError(null);
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 401 || res.status === 403) {
        const cloned = await res
          .clone()
          .json()
          .catch(() => null) as {
          code?: AuthRejectionCode;
          error?: string;
        } | null;
        if (
          res.status === 401 ||
          cloned?.code === 'SESSION_REVOKED' ||
          cloned?.code === 'ACCOUNT_BLOCKED'
        ) {
          clearAllClientSessionState({
            code: cloned?.code || 'SESSION_REVOKED',
            message:
              cloned?.error ||
              'נותקת מהמערכת או שחשבונך הושהה. אנא התחבר מחדש.',
          });
        }
      }
      return res;
    } catch {
      setSyncError('אין תקשורת עם השרת – השינויים האחרונים לא נשמרו');
      return null;
    } finally {
      syncingCountRef.current = Math.max(0, syncingCountRef.current - 1);
      setSyncingCount((c) => Math.max(0, c - 1));
    }
  };

  const extractApiError = async (
    res: Response | null,
    fallbackMsg: string
  ): Promise<string> => {
    if (!res) return 'שגיאת רשת – בדוק את החיבור לאינטרנט ונסה שוב';
    try {
      const json = await res.json();
      if (json && typeof json.error === 'string' && json.error) {
        return json.error;
      }
    } catch {
      // ignore
    }
    return fallbackMsg;
  };

  const syncTraineeLogUpdate = async (updatedProfile: TraineeProfile) => {
    const action =
      currentUser?.role === 'trainee'
        ? 'trainee-self-update'
        : 'coach-update-trainee-log';
    const res = await postDataAction({
      action,
      trainee: updatedProfile,
    });
    if (!res || !res.ok) {
      const msg = await extractApiError(res, 'שגיאה בשמירת הנתונים בשרת');
      setSyncError(msg);
      await fetchAuthorizedData();
      throw new Error(msg);
    }
  };

  const commitTraineeMutation = async (
    traineeId: string,
    mutate: (t: TraineeProfile) => TraineeProfile
  ) => {
    const target = traineesRef.current.find((t) => t.id === traineeId);
    if (!target) return;
    const updatedTrainee = mutate(target);
    const nextList = traineesRef.current.map((t) =>
      t.id === traineeId ? updatedTrainee : t
    );
    traineesRef.current = nextList;
    setTrainees(nextList);
    await syncTraineeLogUpdate(updatedTrainee);
  };

  const handleLoginSuccess = async (user: AuthSessionUser) => {
    setSessionNotice(null);
    setCurrentUser(user);
    setCoachPreviewTraineeId(null);
    setSkippedCoachOnboarding(false);
    setSyncError(null);
    await fetchAuthorizedData();
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await Promise.all([
        configureBackgroundStepsSync({
          baseUrl: '',
          syncToken: '',
          enabled: false,
        }).catch(() => {}),
        unregisterAndroidPushOnLogout().catch(() => {}),
        unregisterWebPushOnLogout({
          apiPath:
            currentUser?.role === 'trainee'
              ? '/api/push/register'
              : '/api/push/coach-alerts',
        }).catch(() => {}),
      ]);
      setPushPromptOpen(false);
      setWebPushPromptOpen(false);
      setShowIosA2hsBanner(false);
      setCoachPushSettings(null);
      await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
      setCurrentUser(null);
      setTrainees([]);
      traineesRef.current = [];
      setTemplates([]);
      setGroups([]);
      setGlobalQuickChips([]);
      setTraineeGroupQuickChips([]);
      setCoaches([]);
      setMyCoachProfile(null);
      setCoachDirectory([]);
      setCoachPreviewTraineeId(null);
      setLocalBgJobs([]);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleCompleteTraineeOnboarding = async (
    traineeId: string,
    data: {
      name: string;
      currentWeight: number;
      targetWeight: number;
      onboarding: TraineeOnboardingData;
      measurement?: BodyMeasurementEntry;
    }
  ) => {
    await commitTraineeMutation(traineeId, (t) => {
      const nextMeas = data.measurement
        ? [...(t.measurementsHistory || []), data.measurement]
        : t.measurementsHistory || [];
      return {
        ...t,
        name: data.name || t.name,
        currentWeight: data.currentWeight,
        targetWeight: data.targetWeight,
        onboarding: data.onboarding,
        measurementsHistory: nextMeas,
        weightHistory:
          t.weightHistory.length === 0 ||
          (!t.onboarding?.completed &&
            t.weightHistory.length === 1 &&
            t.weightHistory[0]?.date === 'התחלה')
            ? [{ date: 'התחלה', weight: data.currentWeight }]
            : [
                ...t.weightHistory,
                {
                  date: data.onboarding.completedAt || 'היום',
                  weight: data.currentWeight,
                },
              ],
      };
    });
  };

  const handleSaveBodyMeasurement = async (
    traineeId: string,
    measurement: BodyMeasurementEntry
  ) => {
    await commitTraineeMutation(traineeId, (t) => ({
      ...t,
      measurementsHistory: [...(t.measurementsHistory || []), measurement],
      onboarding: t.onboarding
        ? { ...t.onboarding, measurementsCompleted: true }
        : {
            completed: true,
            measurementsCompleted: true,
            dietaryPreferences: [],
            favoriteMustHaveFoods: [],
            dislikedOrAllergies: [],
            eatingChallenges: [],
          },
    }));
  };

  const handleCompleteCoachOnboarding = async (data: {
    name: string;
    phone: string;
    newPassword?: string;
    onboarding: CoachOnboardingData;
    starterTemplates: NutritionTemplate[];
    starterGroupNames: string[];
  }) => {
    const res = await postDataAction({
      action: 'coach-complete-onboarding',
      ...data,
    });
    if (res && res.ok) {
      setEditingCoachOnboarding(false);
      await fetchAuthorizedData();
    } else {
      const msg = await extractApiError(res, 'שגיאה בשמירת הגדרות המאמן');
      setSyncError(msg);
    }
  };

  const handleUpdateDailyActivity = async (
    traineeId: string,
    date: string,
    payload: {
      sleepHours?: number;
      steps?: number;
      stepsSource?: StepsSyncSource;
      stepsSyncedAt?: string;
      workoutLog?: DailyWorkoutLog;
      cardioLog?: DailyCardioLog;
    }
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    await commitTraineeMutation(traineeId, (t) => {
      const currentLog = t.logs[date] || {
        date,
        dayType: 'workout',
        waterCups: 0,
        waterGoal: 12,
        weightKg: t.currentWeight,
        meals: {},
      };
      return {
        ...t,
        logs: {
          ...t.logs,
          [date]: {
            ...currentLog,
            ...(payload.sleepHours !== undefined
              ? { sleepHours: payload.sleepHours }
              : {}),
            ...(payload.steps !== undefined
              ? { steps: payload.steps }
              : {}),
            ...(payload.stepsSource !== undefined
              ? { stepsSource: payload.stepsSource }
              : {}),
            ...(payload.stepsSyncedAt !== undefined
              ? { stepsSyncedAt: payload.stepsSyncedAt }
              : {}),
            ...(payload.workoutLog !== undefined
              ? { workoutLog: payload.workoutLog }
              : {}),
            ...(payload.cardioLog !== undefined
              ? { cardioLog: payload.cardioLog }
              : {}),
          },
        },
      };
    });
  };

  const handleUpdateActivityTargets = async (
    traineeId: string,
    activityTargets: TraineeActivityTargets
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId ? { ...t, activityTargets } : t
      )
    );
    const res = await postDataAction({
      action: 'coach-update-activity-targets',
      traineeId,
      activityTargets,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בעדכון יעדי פעילות') };
    }
    return {};
  };

  const handleUpdateAiNotesAndSplit = async (
    traineeId: string,
    payload: {
      enableWorkoutRestSplit?: boolean;
      coachAiNotes?: string;
      aiLearnedPreferences?: string[];
    }
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId
          ? {
              ...t,
              ...(payload.enableWorkoutRestSplit !== undefined
                ? { enableWorkoutRestSplit: payload.enableWorkoutRestSplit }
                : {}),
              ...(payload.coachAiNotes !== undefined
                ? { coachAiNotes: payload.coachAiNotes }
                : {}),
              ...(payload.aiLearnedPreferences !== undefined
                ? { aiLearnedPreferences: payload.aiLearnedPreferences }
                : {}),
            }
          : t
      )
    );
    const res = await postDataAction({
      action: 'coach-update-ai-notes-and-split',
      traineeId,
      ...payload,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בשמירת הנחיות AI') };
    }
    return {};
  };

  const handleSaveWeeklyCheckIn = async (
    traineeId: string,
    checkIn: WeeklyCheckInEntry
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    await commitTraineeMutation(traineeId, (t) => ({
      ...t,
      weeklyCheckIns: [...(t.weeklyCheckIns || []), checkIn],
    }));
  };

  const handlePreferenceLearned = (traineeId: string, prefs: string[]) => {
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId ? { ...t, aiLearnedPreferences: prefs } : t
      )
    );
  };

  const handleManageObservationDays = async (
    traineeId: string,
    payload: {
      toggleDate?: string;
      addFutureDays?: number;
      clearAll?: boolean;
      toggleBlockedDate?: string;
      addBlockedFutureDays?: number;
      clearBlockedAll?: boolean;
      restrictToObservationDaysWhenTodayIsObservation?: boolean;
      countObservationInStats?: boolean;
      activeDateRange?: TraineeActiveDateRange;
    }
  ): Promise<{ error?: string }> => {
    const res = await postDataAction({
      action: 'coach-manage-observation-days',
      traineeId,
      ...payload,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בעדכון הגדרות ימים') };
    }
    const json = await res.json();
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId
          ? {
              ...t,
              observationDates:
                json.observationDates ?? t.observationDates,
              blockedDates: json.blockedDates ?? t.blockedDates,
              restrictToObservationDaysWhenTodayIsObservation:
                json.restrictToObservationDaysWhenTodayIsObservation ??
                t.restrictToObservationDaysWhenTodayIsObservation,
              countObservationInStats:
                json.countObservationInStats ?? t.countObservationInStats,
              activeDateRange:
                json.activeDateRange !== undefined
                  ? json.activeDateRange
                  : t.activeDateRange,
            }
          : t
      )
    );
    return {};
  };

  const handleUpdateMealShortcuts = async (
    traineeId: string,
    shortcuts: MealCardShortcutId[]
  ): Promise<void> => {
    await commitTraineeMutation(traineeId, (t) => ({
      ...t,
      mealCardShortcuts: shortcuts.slice(0, 2),
    }));
  };

  const handleSavedMealAction = async (
    traineeId: string,
    payload: {
      op:
        | 'upsert'
        | 'toggle-pin'
        | 'toggle-favorite'
        | 'increment-use'
        | 'ask-question'
        | 'delete';
      preset?: Partial<SavedMealPreset>;
      presetId?: string;
      question?: string;
    }
  ): Promise<{ error?: string }> => {
    const res = await postDataAction({
      action: 'trainee-manage-saved-meals',
      traineeId,
      ...payload,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בשמירת הארוחה בספרייה') };
    }
    const json = await res.json();
    if (Array.isArray(json.savedMeals)) {
      setTrainees((prev) =>
        prev.map((t) =>
          t.id === traineeId ? { ...t, savedMeals: json.savedMeals } : t
        )
      );
    }
    return {};
  };

  const handleManageToolsAndUnits = async (
    traineeId: string,
    payload: {
      customServingTools?: TraineeServingTool[];
      customFoodUnits?: TraineeCustomUnit[];
    }
  ): Promise<{ error?: string }> => {
    const res = await postDataAction({
      action: 'manage-custom-tools-and-units',
      traineeId,
      ...payload,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בשמירת הכלים והיחידות') };
    }
    const json = await res.json();
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId
          ? {
              ...t,
              customServingTools:
                json.customServingTools ?? t.customServingTools,
              customFoodUnits: json.customFoodUnits ?? t.customFoodUnits,
            }
          : t
      )
    );
    return {};
  };

  const handleManageQuickChips = async (payload: {
    scope: 'user' | 'group' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }): Promise<{ error?: string }> => {
    const res = await postDataAction({
      action: 'manage-quick-chips',
      ...payload,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בעדכון תגיות הקשר מהיר') };
    }
    const json = await res.json();
    if (payload.scope === 'global' && Array.isArray(json.globalQuickChips)) {
      setGlobalQuickChips(json.globalQuickChips);
    } else if (
      payload.scope === 'group' &&
      json.groupId &&
      Array.isArray(json.customQuickChips)
    ) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === json.groupId
            ? { ...g, customQuickChips: json.customQuickChips }
            : g
        )
      );
    } else if (
      payload.scope === 'user' &&
      payload.traineeId &&
      Array.isArray(json.recentContextChips)
    ) {
      setTrainees((prev) =>
        prev.map((t) =>
          t.id === payload.traineeId
            ? { ...t, recentContextChips: json.recentContextChips }
            : t
        )
      );
    }
    return {};
  };

  const handleReplySavedMeal = async (
    traineeId: string,
    payload: {
      presetId: string;
      reply: string;
      promoteToSlotId?: string;
    }
  ): Promise<{ error?: string }> => {
    const res = await postDataAction({
      action: 'coach-reply-saved-meal',
      traineeId,
      ...payload,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בשליחת תשובה למתאמן') };
    }
    await fetchAuthorizedData();
    return {};
  };

  // סנכרון משימות AI פתוחות ב-localStorage וניקוי אוטומטי כשמשימות הסתיימו בשרת
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const storageKey = `spot_bg_jobs_${currentUser.id}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as PendingAiMealJob[];
        if (Array.isArray(parsed)) {
          setLocalBgJobs(parsed.slice(0, 8));
        }
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser) return;
    const storageKey = `spot_bg_jobs_${currentUser.id}`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(localBgJobs.slice(0, 8)));
    } catch {
      // ignore
    }
  }, [localBgJobs, currentUser]);

  // פולינג עדין כל 6 שניות כל עוד יש משימת AI פעילה שטרם פג תוקפה (מונע פולינג אינסופי על משימות יתומות)
  useEffect(() => {
    if (!currentUser) return;
    const hasServerProcessing = trainees.some((t) =>
      (t.pendingAiJobs || []).some((j) => isAiJobActivelyProcessing(j))
    );
    const hasLocalProcessing = localBgJobs.some((j) =>
      isAiJobActivelyProcessing(j)
    );
    if (!hasServerProcessing && !hasLocalProcessing) return;

    const timer = setInterval(() => {
      setLocalBgJobs((prev) => {
        const res = normalizePendingAiJobs(prev);
        return res.changed ? res.jobs : prev;
      });
      setTrainees((prev) => {
        let anyChanged = false;
        const next = prev.map((t) => {
          const res = normalizePendingAiJobs(t.pendingAiJobs);
          if (!res.changed) return t;
          anyChanged = true;
          return { ...t, pendingAiJobs: res.jobs };
        });
        return anyChanged ? next : prev;
      });
      void fetchAuthorizedData();
    }, 6000);
    return () => clearInterval(timer);
  }, [currentUser, trainees, localBgJobs, fetchAuthorizedData]);

  // סנכרון אוטומטי של localBgJobs כשהשרת כבר סיים ועדכן pendingAiJobs ב-DB או פג תוקף
  useEffect(() => {
    if (localBgJobs.length === 0) return;
    const nowMs = Date.now();
    setLocalBgJobs((prev) =>
      prev.filter((lj) => {
        const owner = trainees.find((t) => t.id === lj.targetTraineeId);
        const serverJob = owner?.pendingAiJobs?.find((sj) => sj.id === lj.id);
        if (serverJob && serverJob.status !== 'processing') return false;
        if (
          lj.status === 'processing' &&
          nowMs - Date.parse(lj.startedAt) > AI_JOB_STALE_TIMEOUT_MS
        ) {
          return false;
        }
        return true;
      })
    );
  }, [trainees, localBgJobs.length]);

  const mergeTraineeBgJobs = (profile: TraineeProfile): PendingAiMealJob[] => {
    const serverJobs = profile.pendingAiJobs || [];
    const merged = [...serverJobs];
    for (const lj of localBgJobs) {
      if (lj.targetTraineeId === profile.id && !merged.some((sj) => sj.id === lj.id)) {
        merged.unshift(lj);
      }
    }
    return normalizePendingAiJobs(merged).jobs;
  };

  const handleStartBackgroundAiAnalysis = async (payload: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    mealSlotName: string;
    mode: 'photo' | 'text';
    imageDataUrl?: string;
    imageDataUrls?: string[];
    textPrompt?: string;
    contextParams?: AiContextParams;
  }): Promise<{ jobId: string }> => {
    const jobId = `aijob-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const startedJob: PendingAiMealJob = {
      id: jobId,
      targetTraineeId: payload.traineeId,
      date: payload.date,
      mealSlotId: payload.mealSlotId,
      mealSlotName: payload.mealSlotName,
      mode: payload.mode,
      summaryHint: payload.textPrompt?.slice(0, 70),
      status: 'processing',
      startedAt: nowIso,
      lastHeartbeatAt: nowIso,
      stageText:
        payload.mode === 'photo'
          ? 'מעלה תמונות ומפעיל פענוח בשרת...'
          : 'שולח תיאור ארוחה למודל ה-AI...',
      acknowledged: false,
    };

    const abortController = new AbortController();
    bgJobAbortControllersRef.current.set(jobId, abortController);
    setLiveBgJobIds((prev) => [jobId, ...prev.filter((id) => id !== jobId)]);
    setLocalBgJobs((prev) => [startedJob, ...prev.slice(0, 5)]);

    void (async () => {
      try {
        const res = await fetch('/api/ai/analyze-meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify({
            mode: 'analyze',
            imageDataUrl: payload.imageDataUrl,
            imageDataUrls: payload.imageDataUrls,
            textPrompt: payload.textPrompt,
            contextParams: payload.contextParams,
            backgroundJob: {
              jobId,
              traineeId: payload.traineeId,
              date: payload.date,
              mealSlotId: payload.mealSlotId,
              mealSlotName: payload.mealSlotName,
              mode: payload.mode,
              summaryHint: payload.textPrompt?.slice(0, 70),
            },
          }),
        });
        if (abortController.signal.aborted) return;
        const data = await res.json().catch(() => ({}));
        if (data?.cancelled) {
          setLocalBgJobs((prev) => prev.filter((j) => j.id !== jobId));
          return;
        }
        if (res.ok && Array.isArray(data.items) && data.items.length > 0) {
          setLocalBgJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    lastHeartbeatAt: new Date().toISOString(),
                    stageText: 'הושלם וסונכרן ליומן',
                    itemsCount: data.items.length,
                    engine: data.engine,
                    isAiFallback: Boolean(data.isAiFallback),
                    fallbackReason: data.fallbackReason,
                    autoSyncedToLog: true,
                  }
                : j
            )
          );
          await fetchAuthorizedData({ force: true });
        } else {
          setLocalBgJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    lastHeartbeatAt: new Date().toISOString(),
                    stageText: 'הפענוח נכשל',
                    errorMsg: data.error || 'פענוח ה-AI נכשל — ניתן לנסות שוב',
                  }
                : j
            )
          );
          await fetchAuthorizedData();
        }
      } catch {
        if (abortController.signal.aborted) {
          setLocalBgJobs((prev) => prev.filter((j) => j.id !== jobId));
          return;
        }
        setLocalBgJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  stageText: 'החיבור מהדפדפן נקטע — ממתין לתשובת השרת (אפשר לבטל)',
                  summaryHint: 'מחכה לסנכרון חוזר מהשרת...',
                }
              : j
          )
        );
      } finally {
        bgJobAbortControllersRef.current.delete(jobId);
        setLiveBgJobIds((prev) => prev.filter((id) => id !== jobId));
      }
    })();

    return { jobId };
  };

  const handleAcknowledgeAiJob = async (jobId: string, traineeId?: string) => {
    setLocalBgJobs((prev) => prev.filter((j) => j.id !== jobId));
    const targetId =
      traineeId ||
      traineesRef.current.find((t) =>
        (t.pendingAiJobs || []).some((j) => j.id === jobId)
      )?.id ||
      currentUserRef.current?.id;
    if (!targetId) return;

    setTrainees((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? {
              ...t,
              pendingAiJobs: (t.pendingAiJobs || []).filter((j) => j.id !== jobId),
            }
          : t
      )
    );
    await postDataAction({
      action: 'ack-ai-jobs',
      traineeId: targetId,
      jobId,
    });
  };

  const handleCancelAiJob = async (jobId: string, traineeId?: string) => {
    const controller = bgJobAbortControllersRef.current.get(jobId);
    if (controller) {
      controller.abort();
      bgJobAbortControllersRef.current.delete(jobId);
    }
    setLiveBgJobIds((prev) => prev.filter((id) => id !== jobId));
    setLocalBgJobs((prev) => prev.filter((j) => j.id !== jobId));

    const targetId =
      traineeId ||
      traineesRef.current.find((t) =>
        (t.pendingAiJobs || []).some((j) => j.id === jobId)
      )?.id ||
      currentUserRef.current?.id;
    if (!targetId) return;

    setTrainees((prev) =>
      prev.map((t) =>
        t.id === targetId
          ? {
              ...t,
              pendingAiJobs: (t.pendingAiJobs || []).filter((j) => j.id !== jobId),
            }
          : t
      )
    );
    await postDataAction({
      action: 'ack-ai-jobs',
      traineeId: targetId,
      jobId,
      cancelProcessing: true,
    });
  };

  const handleSaveMeal = async (
    traineeId: string,
    date: string,
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string,
    photoDataUrls?: string[],
    mealTime?: string
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) {
      return;
    }

    const nowTime = new Date().toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const cleanMealTime =
      mealTime !== undefined && /^\d{1,2}:\d{2}$/.test(mealTime.trim())
        ? mealTime.trim()
        : undefined;

    await commitTraineeMutation(traineeId, (t) => {
      const currentLog = t.logs[date] || {
        date,
        dayType: 'workout',
        waterCups: 0,
        waterGoal: 12,
        weightKg: t.currentWeight,
        meals: {},
      };
      const existingMeal = currentLog.meals[mealSlotId];
      const nextPhotos =
        photoDataUrls && photoDataUrls.length > 0
          ? photoDataUrls.slice(0, 3)
          : photoDataUrl
          ? [photoDataUrl]
          : undefined;
      return {
        ...t,
        logs: {
          ...t.logs,
          [date]: {
            ...currentLog,
            meals: {
              ...currentLog.meals,
              [mealSlotId]: {
                mealSlotId,
                items,
                mealTime: cleanMealTime ?? existingMeal?.mealTime,
                photoDataUrl: nextPhotos?.[0] ?? photoDataUrl,
                photoDataUrls: nextPhotos,
                photoNote,
                coachFeedback: existingMeal?.coachFeedback,
                coachFeedbackAuthor: existingMeal?.coachFeedbackAuthor,
                coachFeedbackAt: existingMeal?.coachFeedbackAt,
                updatedAt: nowTime,
              },
            },
          },
        },
      };
    });
  };

  const handleUpdateMealTime = async (
    traineeId: string,
    date: string,
    mealSlotId: string,
    mealTime: string
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) {
      return;
    }
    const clean = mealTime.trim();
    if (!/^\d{1,2}:\d{2}$/.test(clean)) return;

    await commitTraineeMutation(traineeId, (t) => {
      const currentLog = t.logs[date] || {
        date,
        dayType: 'workout',
        waterCups: 0,
        waterGoal: 12,
        weightKg: t.currentWeight,
        meals: {},
      };
      const existingMeal = currentLog.meals[mealSlotId] || {
        mealSlotId,
        items: [],
        updatedAt: clean,
      };
      return {
        ...t,
        logs: {
          ...t.logs,
          [date]: {
            ...currentLog,
            meals: {
              ...currentLog.meals,
              [mealSlotId]: {
                ...existingMeal,
                mealTime: clean,
              },
            },
          },
        },
      };
    });
  };

  const handleUpdateDayType = async (
    traineeId: string,
    date: string,
    dayType: DayType
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    await commitTraineeMutation(traineeId, (t) => {
      const currentLog = t.logs[date] || {
        date,
        dayType,
        waterCups: 0,
        waterGoal: 12,
        weightKg: t.currentWeight,
        meals: {},
      };
      return {
        ...t,
        logs: {
          ...t.logs,
          [date]: {
            ...currentLog,
            dayType,
          },
        },
      };
    });
  };

  const handleUpdateWater = async (
    traineeId: string,
    date: string,
    cups: number
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    await commitTraineeMutation(traineeId, (t) => {
      const currentLog = t.logs[date] || {
        date,
        dayType: 'workout',
        waterCups: 0,
        waterGoal: 12,
        weightKg: t.currentWeight,
        meals: {},
      };
      return {
        ...t,
        logs: {
          ...t.logs,
          [date]: {
            ...currentLog,
            waterCups: cups,
          },
        },
      };
    });
  };

  const handleUpdateWeight = async (
    traineeId: string,
    date: string,
    weightKg: number
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    await commitTraineeMutation(traineeId, (t) => ({
      ...t,
      currentWeight: weightKg,
      weightHistory: [...t.weightHistory, { date, weight: weightKg }],
    }));
  };

  const handleToggleFavorite = async (traineeId: string, foodId: string) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    await commitTraineeMutation(traineeId, (t) => {
      const exists = t.favoriteFoodIds.includes(foodId);
      return {
        ...t,
        favoriteFoodIds: exists
          ? t.favoriteFoodIds.filter((id) => id !== foodId)
          : [...t.favoriteFoodIds, foodId],
      };
    });
  };

  const handleSaveTemplate = async (
    updatedTemplate: NutritionTemplate
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'save-template',
      template: updatedTemplate,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בשמירת הטמפלייט') };
    }
    const data = await res.json();
    const saved = (data.template as NutritionTemplate) || updatedTemplate;
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === saved.id);
      return exists
        ? prev.map((t) => (t.id === saved.id ? saved : t))
        : [...prev, saved];
    });
    return {};
  };

  const handleDeleteTemplate = async (
    templateId: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'delete-template',
      templateId,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה במחיקת הטמפלייט') };
    }
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    return {};
  };

  const handleAssignTemplateToTrainee = async (
    traineeId: string,
    dayType: DayType,
    template: NutritionTemplate
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const target = trainees.find((t) => t.id === traineeId);
    if (!target) return { error: 'מתאמן לא נמצא' };
    const cloned: NutritionTemplate = JSON.parse(JSON.stringify(template));
    return await handleUpdateTraineePlan(
      traineeId,
      dayType,
      cloned,
      target.tolerancePercent
    );
  };

  const handleUpdateTraineePlan = async (
    traineeId: string,
    dayType: DayType,
    updatedTemplate: NutritionTemplate,
    tolerancePercent: number
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        return {
          ...t,
          tolerancePercent,
          ...(dayType === 'workout'
            ? { workoutTemplate: updatedTemplate }
            : { restTemplate: updatedTemplate }),
        };
      })
    );
    const res = await postDataAction({
      action: 'update-trainee-plan',
      traineeId,
      dayType,
      updatedTemplate,
      tolerancePercent,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בעדכון תוכנית המתאמן') };
    }
    return {};
  };

  const handleAddCoachFeedback = async (
    traineeId: string,
    date: string,
    mealSlotId: string,
    feedback: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const nowTime = new Date().toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          meals: {},
        };
        const existingMeal = currentLog.meals[mealSlotId] || {
          mealSlotId,
          items: [],
          updatedAt: nowTime,
        };
        return {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              meals: {
                ...currentLog.meals,
                [mealSlotId]: {
                  ...existingMeal,
                  coachFeedback: feedback,
                  coachFeedbackAuthor: currentUser.name,
                  coachFeedbackAt: nowTime,
                },
              },
            },
          },
        };
      })
    );

    const res = await postDataAction({
      action: 'add-coach-feedback',
      traineeId,
      date,
      mealSlotId,
      feedback,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בשליחת פידבק המאמן') };
    }
    return {};
  };

  const handleAddTraineeByCoach = async (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    goal: string;
    templateId: string;
    primaryCoachId?: string;
    groupId?: string;
  }): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'coach-create-trainee',
      ...data,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בפתיחת חשבון המתאמן') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleUpdateTraineeStatus = async (
    traineeId: string,
    status: AccountStatus,
    primaryCoachId?: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId
          ? {
              ...t,
              status,
              ...(primaryCoachId ? { primaryCoachId } : {}),
            }
          : t
      )
    );
    const res = await postDataAction({
      action: 'update-trainee-status',
      traineeId,
      status,
      primaryCoachId,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בעדכון סטטוס המתאמן') };
    }
    return {};
  };

  const handleUpdateTraineeCredentials = async (
    traineeId: string,
    email: string,
    password: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, email } : t))
    );
    const res = await postDataAction({
      action: 'coach-update-credentials',
      traineeId,
      email,
      password,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בעדכון פרטי הגישה') };
    }
    return {};
  };

  const handleUpdateTraineeSharing = async (
    traineeId: string,
    primaryCoachId: string,
    sharedCoachIds: string[]
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'update-trainee-sharing',
      traineeId,
      primaryCoachId,
      sharedCoachIds,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בשמירת הגדרות השיתוף') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleUpdateTraineeGroup = async (
    traineeId: string,
    groupId?: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, groupId } : t))
    );
    const res = await postDataAction({
      action: 'update-trainee-group',
      traineeId,
      groupId,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בשיוך הקבוצה') };
    }
    return {};
  };

  const handleCreateGroup = async (
    name: string,
    color: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'create-group',
      name,
      color,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה ביצירת הקבוצה') };
    }
    const data = await res.json();
    if (data.group) {
      setGroups((prev) => [...prev, data.group as TraineeGroup]);
    }
    return {};
  };

  const handleDeleteGroup = async (
    groupId: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setTrainees((prev) =>
      prev.map((t) =>
        t.groupId === groupId ? { ...t, groupId: undefined } : t
      )
    );
    const res = await postDataAction({
      action: 'delete-group',
      groupId,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה במחיקת הקבוצה') };
    }
    return {};
  };

  const handleBulkGroupAssignTemplate = async (
    groupId: string,
    templateId: string,
    dayType: DayType
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'bulk-group-assign-template',
      groupId,
      templateId,
      dayType,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בהחלת הטמפלייט לקבוצה') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleBulkGroupShareCoach = async (
    groupId: string,
    targetCoachId: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'bulk-group-share-coach',
      groupId,
      targetCoachId,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בשיתוף הקבוצה') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleDeleteTrainee = async (
    traineeId: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    setTrainees((prev) => prev.filter((t) => t.id !== traineeId));
    const res = await postDataAction({
      action: 'coach-delete-trainee',
      deleteTraineeId: traineeId,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה במחיקת המתאמן') };
    }
    return {};
  };

  const handleCreateCoach = async (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    inviteCode: string;
  }): Promise<{ error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { error: 'פעולה זו מותרת למנהל הראשי בלבד' };
    }
    const res = await postDataAction({
      action: 'admin-create-coach',
      ...data,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה ביצירת מאמן') };
    }
    const json = await res.json();
    if (json.coach) {
      setCoaches((prev) => [...prev, json.coach as CoachProfile]);
    }
    if (Array.isArray(json.coachDirectory)) {
      setCoachDirectory(json.coachDirectory);
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleUpdateCoachStatus = async (
    coachId: string,
    status: 'active' | 'paused'
  ): Promise<{ error?: string }> => {
    if (currentUser?.role !== 'admin') return {};
    setCoaches((prev) =>
      prev.map((c) => (c.id === coachId ? { ...c, status } : c))
    );
    const res = await postDataAction({
      action: 'admin-update-coach-status',
      coachId,
      status,
    });
    if (!res || !res.ok) {
      await fetchAuthorizedData();
      return { error: await extractApiError(res, 'שגיאה בעדכון סטטוס המאמן') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleUpdateCoachCredentials = async (
    coachId: string,
    email: string,
    password: string,
    inviteCode: string
  ): Promise<{ error?: string }> => {
    if (currentUser?.role !== 'admin') return {};
    const res = await postDataAction({
      action: 'admin-update-coach-credentials',
      coachId,
      email,
      password,
      inviteCode,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בעדכון פרטי המאמן') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleDeleteCoach = async (
    coachId: string
  ): Promise<{ error?: string }> => {
    if (currentUser?.role !== 'admin') return {};
    const res = await postDataAction({
      action: 'admin-delete-coach',
      coachId,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה במחיקת המאמן') };
    }
    await fetchAuthorizedData();
    return {};
  };

  const handleForceLogoutTrainee = async (
    traineeId: string
  ): Promise<{ error?: string }> => {
    if (!currentUser || currentUser.role === 'trainee') return {};
    const res = await postDataAction({
      action: 'force-logout-trainee',
      traineeId,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בניתוק המתאמן מרחוק') };
    }
    return {};
  };

  const handleForceLogoutCoach = async (
    coachId: string
  ): Promise<{ error?: string }> => {
    if (currentUser?.role !== 'admin') return {};
    const res = await postDataAction({
      action: 'admin-force-logout-coach',
      coachId,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בניתוק המאמן מרחוק') };
    }
    return {};
  };

  const handleUpdateAppPolicy = async (
    policy: AppReleasePolicy
  ): Promise<{ error?: string }> => {
    if (currentUser?.role !== 'admin') {
      return { error: 'מותר למנהל הראשי בלבד' };
    }
    const res = await postDataAction({
      action: 'admin-update-app-policy',
      ...policy,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בשמירת מדיניות הגרסאות') };
    }
    const data = (await res.json().catch(() => null)) as {
      appReleasePolicy?: AppReleasePolicy;
    } | null;
    if (data?.appReleasePolicy) {
      setAppReleasePolicy(data.appReleasePolicy);
    } else {
      setAppReleasePolicy(policy);
    }
    return {};
  };

  // שער נעילה הרמטי לאנדרואיד — נבדק ראשון לפני הכל (גם במסך התחברות וגם כשמחוברים)
  if (androidUpdateInfo?.isForceUpdateBlocked) {
    return (
      <AndroidForceUpdateGate
        info={androidUpdateInfo}
        onRecheckVersion={refreshAndroidVersionGate}
      />
    );
  }

  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 20,
        }}
      >
        <img
          src="/app-logo.png"
          alt="SPOT Fitness"
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            objectFit: 'cover',
            boxShadow: 'none',
          }}
        />
        <Loader2 size={22} className="spot-spinner" color="var(--accent-volt)" />
      </div>
    );
  }

  if (!currentUser) {
    return (
      <>
        {pendingWebUpdateBuildId && (
          <div
            style={{
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--line-2)',
              color: 'var(--accent-volt)',
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <span>עדכון גרסה חדש של SPOT מוכן</span>
            <button
              type="button"
              onClick={() =>
                void performHardRefresh(pendingWebUpdateBuildId, { force: true })
              }
              className="btn-volt"
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 900,
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              רענן עכשיו
            </button>
          </div>
        )}
        <AuthGateView
          onLoginSuccess={handleLoginSuccess}
          sessionNotice={sessionNotice}
          onClearSessionNotice={() => setSessionNotice(null)}
        />
      </>
    );
  }

  const loggedInTraineeProfile =
    currentUser.role === 'trainee'
      ? trainees.find((t) => t.id === currentUser.id)
      : coachPreviewTraineeId
      ? trainees.find((t) => t.id === coachPreviewTraineeId)
      : null;

  if (
    currentUser.role === 'trainee' &&
    (!loggedInTraineeProfile || loggedInTraineeProfile.status !== 'active')
  ) {
    return (
      <PendingApprovalView
        name={currentUser.name}
        paused={loggedInTraineeProfile?.status === 'paused'}
        loggingOut={loggingOut}
        onRecheck={() => fetchAuthorizedData({ force: true })}
        onLogout={handleLogout}
      />
    );
  }

  const shouldShowCoachOnboarding =
    editingCoachOnboarding ||
    (currentUser.role === 'coach' &&
      myCoachProfile &&
      !myCoachProfile.onboarding?.completed &&
      !skippedCoachOnboarding);

  return (
    <div style={{ minHeight: '100dvh' }}>
      {pendingWebUpdateBuildId && (
        <div
          style={{
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line-2)',
            color: 'var(--accent-volt)',
            padding: '8px 14px',
            fontSize: 12,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
            zIndex: 130,
            position: 'relative',
          }}
        >
          <RefreshCw size={14} />
          <span>
            גרסה חדשה של SPOT זמינה — תתרענן אוטומטית בסגירת החלונית
          </span>
          <button
            type="button"
            onClick={() =>
              void performHardRefresh(pendingWebUpdateBuildId, { force: true })
            }
            style={{
              background: 'var(--btn-primary)',
              color: '#ffffff',
              border: 'none',
              padding: '3px 12px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            רענן עכשיו
          </button>
        </div>
      )}

      {isOffline && (
        <div
          role="alert"
          style={{
            background: '#991b1b',
            color: 'var(--text)',
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            zIndex: 120,
            position: 'relative',
          }}
        >
          <WifiOff size={15} />
          <span>אין חיבור לאינטרנט – שינויים חדשים לא יישמרו עד לחזרת החיבור</span>
        </div>
      )}

      {!isOffline && syncError && (
        <div
          role="alert"
          style={{
            background: 'rgba(239, 68, 68, 0.16)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--danger-text)',
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={15} />
          <span>{syncError}</span>
          <button
            type="button"
            onClick={() => setSyncError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--danger-text)',
              cursor: 'pointer',
              fontWeight: 800,
              marginRight: 8,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <header className="spot-sticky-header">
        <div className="spot-header-row">
          <div className="spot-header-brand">
            <span className="spot-header-brand-badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/app-logo.png" alt="SPOT" width={38} height={38} />
            </span>
            <span className="num-mono spot-header-wordmark">SPOT</span>
          </div>

          <div className="spot-header-actions">
            {syncingCount > 0 && (
              <span className="spot-header-saving" role="status">
                <Loader2 size={13} className="spot-spinner" />
                <span>שומר</span>
              </span>
            )}

            <span className="glass spot-header-user" title={currentUser.name}>
              {currentUser.role === 'admin' ? (
                <Crown size={14} style={{ flexShrink: 0 }} />
              ) : currentUser.role === 'coach' ? (
                <ShieldCheck size={14} style={{ flexShrink: 0 }} />
              ) : (
                <User size={14} style={{ flexShrink: 0 }} />
              )}
              <span className="spot-header-user-name">
                {currentUser.name}
                {currentUser.role === 'admin' ? ' (מנהל)' : currentUser.role === 'coach' ? ' (מאמן)' : ''}
              </span>
            </span>

            {(currentUser.role === 'coach' || currentUser.role === 'admin') && coachPreviewTraineeId && (
              <button
                type="button"
                className="glass spot-header-btn spot-header-btn-wide"
                onClick={() => setCoachPreviewTraineeId(null)}
                aria-label="חזרה לדאשבורד מאמן"
              >
                <ArrowRight size={16} />
                <span>חזרה</span>
              </button>
            )}

            <button
              type="button"
              className="glass spot-header-btn"
              aria-label="סנכרן נתונים עדכניים מהשרת"
              disabled={manualSyncing || isOffline}
              onClick={async () => {
                setManualSyncing(true);
                try {
                  await fetchAuthorizedData({ force: true });
                } finally {
                  setManualSyncing(false);
                }
              }}
            >
              <RefreshCw size={18} className={manualSyncing ? 'spot-spinner' : undefined} />
            </button>

            <button
              type="button"
              className="glass spot-header-btn"
              aria-label={loggingOut ? 'מתנתק' : 'התנתק מהחשבון'}
              disabled={loggingOut}
              onClick={handleLogout}
            >
              {loggingOut ? <Loader2 size={18} className="spot-spinner" /> : <LogOut size={18} />}
            </button>
          </div>
        </div>
      </header>

      {androidUpdateInfo?.updateAvailable &&
        !androidUpdateInfo.isForceUpdateBlocked &&
        !dismissedUpdateBanner && (
          <div
            style={{
              background: 'var(--surface-2)',
              borderBottom: '1px solid var(--line-2)',
              color: 'var(--accent-volt)',
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <Download size={15} />
            <span>
              גרסה חדשה לאפליקציית האנדרואיד זמינה (v
              {androidUpdateInfo.latestVersionName})
            </span>
            <button
              type="button"
              disabled={optionalApkDownloading}
              onClick={async () => {
                setOptionalApkDownloading(true);
                try {
                  const res = await downloadAndInstallAndroidApk(
                    androidUpdateInfo.apkDownloadUrl
                  );
                  if (res.needsInstallPermission) {
                    notifications.show({
                      color: 'orange',
                      title: 'נדרשת הרשאת התקנה',
                      message:
                        'אשר בהגדרות שפתחנו "הרשה ממקור זה" וחזור לאפליקציה להשלמת העדכון.',
                    });
                  } else if (!res.started && res.error) {
                    window.open(androidUpdateInfo.apkDownloadUrl, '_blank');
                  }
                } finally {
                  setOptionalApkDownloading(false);
                }
              }}
              style={{
                background: 'var(--btn-primary)',
                color: '#ffffff',
                border: 'none',
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 900,
                cursor: optionalApkDownloading ? 'wait' : 'pointer',
              }}
            >
              {optionalApkDownloading ? 'מוריד ומפעיל התקנה...' : 'עדכן והתקן'}
            </button>
            <button
              type="button"
              onClick={() => setDismissedUpdateBanner(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              ✕
            </button>
          </div>
        )}

      {showIosA2hsBanner && (
        <div
          style={{
            background: 'var(--surface-2)',
            borderBottom: '1px solid var(--line-2)',
            color: 'var(--text)',
            padding: '9px 14px',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <Smartphone size={15} color="var(--text-2)" />
          <span>
            לקבלת התראות באייפון: לחץ על{' '}
            <Share
              size={13}
              style={{ display: 'inline', verticalAlign: 'middle' }}
            />{' '}
            <strong>שתף</strong> &larr; <strong>הוסף למסך הבית</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              dismissIosAddToHomeBanner();
              setShowIosA2hsBanner(false);
              if (currentUser.role === 'trainee') {
                setExternalSectionRequest({
                  traineeId: currentUser.id,
                  section: 'profile',
                  nonce: Date.now(),
                });
              } else {
                setCoachPreviewTraineeId(null);
                setExternalOpenCoachAlertsNonce((n) => n + 1);
              }
            }}
            style={{
              background: 'var(--btn-primary)',
              color: '#ffffff',
              border: 'none',
              padding: '3px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {currentUser.role === 'trainee' ? 'מדריך מלא בפרופיל' : 'פתח הגדרות התראות'}
          </button>
          <button
            type="button"
            onClick={() => {
              dismissIosAddToHomeBanner();
              setShowIosA2hsBanner(false);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            ✕
          </button>
        </div>
      )}

      <main className="spot-main-content">
        {shouldShowCoachOnboarding ? (
          <CoachOnboardingWizard
            coachName={myCoachProfile?.name || currentUser.name}
            coachPhone={myCoachProfile?.phone || ''}
            existingOnboarding={myCoachProfile?.onboarding}
            onCompleteCoachOnboarding={handleCompleteCoachOnboarding}
            onSkip={() => {
              setSkippedCoachOnboarding(true);
              setEditingCoachOnboarding(false);
            }}
          />
        ) : currentUser.role === 'trainee' && loggedInTraineeProfile ? (
          <TraineeMobileView
            trainee={loggedInTraineeProfile}
            isCoachPreview={false}
            onUpdateDayType={handleUpdateDayType}
            onSaveMeal={handleSaveMeal}
            onUpdateMealTime={handleUpdateMealTime}
            onUpdateWater={handleUpdateWater}
            onUpdateWeight={handleUpdateWeight}
            onToggleFavorite={handleToggleFavorite}
            onCompleteOnboarding={handleCompleteTraineeOnboarding}
            onSaveBodyMeasurement={handleSaveBodyMeasurement}
            onUpdateDailyActivity={handleUpdateDailyActivity}
            onSaveWeeklyCheckIn={handleSaveWeeklyCheckIn}
            onPreferenceLearned={handlePreferenceLearned}
            globalQuickChips={globalQuickChips}
            groupQuickChips={traineeGroupQuickChips}
            onSavedMealAction={handleSavedMealAction}
            onManageToolsAndUnits={handleManageToolsAndUnits}
            onManageQuickChips={handleManageQuickChips}
            backgroundAiJobs={mergeTraineeBgJobs(loggedInTraineeProfile)}
            onStartBackgroundAiAnalysis={handleStartBackgroundAiAnalysis}
            externalOpenMealRequest={externalOpenMealRequest}
            externalSectionRequest={externalSectionRequest}
            onConsumeExternalOpenMealRequest={handleConsumeExternalMealRequest}
            onConsumeExternalSectionRequest={handleConsumeExternalSectionRequest}
            onRenameProfile={handleRenameTraineeProfile}
            onPushPreferencesUpdated={handlePushPreferencesUpdated}
            onUpdateMealShortcuts={handleUpdateMealShortcuts}
            onSyncNativeStepsNow={syncNativeAndroidSteps}
          />
        ) : (currentUser.role === 'admin' || currentUser.role === 'coach') &&
          coachPreviewTraineeId &&
          loggedInTraineeProfile ? (
          <TraineeMobileView
            trainee={loggedInTraineeProfile}
            isCoachPreview={true}
            onExitCoachPreview={() => setCoachPreviewTraineeId(null)}
            onUpdateDayType={handleUpdateDayType}
            onSaveMeal={handleSaveMeal}
            onUpdateMealTime={handleUpdateMealTime}
            onUpdateWater={handleUpdateWater}
            onUpdateWeight={handleUpdateWeight}
            onToggleFavorite={handleToggleFavorite}
            onCompleteOnboarding={handleCompleteTraineeOnboarding}
            onSaveBodyMeasurement={handleSaveBodyMeasurement}
            onUpdateDailyActivity={handleUpdateDailyActivity}
            onSaveWeeklyCheckIn={handleSaveWeeklyCheckIn}
            onPreferenceLearned={handlePreferenceLearned}
            globalQuickChips={globalQuickChips}
            groupQuickChips={
              groups.find((g) => g.id === loggedInTraineeProfile.groupId)
                ?.customQuickChips || []
            }
            onSavedMealAction={handleSavedMealAction}
            onManageToolsAndUnits={handleManageToolsAndUnits}
            onManageQuickChips={handleManageQuickChips}
            backgroundAiJobs={mergeTraineeBgJobs(loggedInTraineeProfile)}
            onStartBackgroundAiAnalysis={handleStartBackgroundAiAnalysis}
            externalOpenMealRequest={externalOpenMealRequest}
            externalSectionRequest={externalSectionRequest}
            onConsumeExternalOpenMealRequest={handleConsumeExternalMealRequest}
            onConsumeExternalSectionRequest={handleConsumeExternalSectionRequest}
            onUpdateMealShortcuts={handleUpdateMealShortcuts}
            onSyncNativeStepsNow={syncNativeAndroidSteps}
          />
        ) : (
          <CoachDashboardView
            currentUser={currentUser}
            trainees={trainees}
            templates={templates}
            groups={groups}
            coaches={coaches}
            coachDirectory={coachDirectory}
            coachInviteCode={coachInviteCode}
            globalQuickChips={globalQuickChips}
            onManageToolsAndUnits={handleManageToolsAndUnits}
            onManageQuickChips={handleManageQuickChips}
            onReplySavedMeal={handleReplySavedMeal}
            onRefreshData={() => fetchAuthorizedData({ force: true })}
            coachPushSettings={coachPushSettings}
            onCoachPushSettingsUpdated={setCoachPushSettings}
            externalInspectTraineeRequest={externalInspectTraineeRequest}
            externalOpenCoachAlertsNonce={externalOpenCoachAlertsNonce}
            onUpdateCoachInviteCode={async (code) => {
              const prev = coachInviteCode;
              setCoachInviteCode(code);
              const res = await postDataAction({
                action: 'coach-update-invite-code',
                inviteCode: code,
              });
              if (!res || !res.ok) {
                setCoachInviteCode(prev);
                return { error: await extractApiError(res, 'שגיאה בעדכון קוד ההזמנה') };
              }
              return {};
            }}
            onSaveTemplate={handleSaveTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onAssignTemplateToTrainee={handleAssignTemplateToTrainee}
            onUpdateTraineePlan={handleUpdateTraineePlan}
            onAddCoachFeedback={handleAddCoachFeedback}
            onAddTrainee={handleAddTraineeByCoach}
            onUpdateTraineeStatus={handleUpdateTraineeStatus}
            onUpdateTraineeCredentials={handleUpdateTraineeCredentials}
            onUpdateTraineeSharing={handleUpdateTraineeSharing}
            onUpdateTraineeGroup={handleUpdateTraineeGroup}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
            onBulkGroupAssignTemplate={handleBulkGroupAssignTemplate}
            onBulkGroupShareCoach={handleBulkGroupShareCoach}
            onManageObservationDays={handleManageObservationDays}
            onUpdateActivityTargets={handleUpdateActivityTargets}
            onUpdateAiNotesAndSplit={handleUpdateAiNotesAndSplit}
            onOpenCoachOnboarding={() => setEditingCoachOnboarding(true)}
            onDeleteTrainee={handleDeleteTrainee}
            onForceLogoutTrainee={handleForceLogoutTrainee}
            onCreateCoach={handleCreateCoach}
            onUpdateCoachStatus={handleUpdateCoachStatus}
            onForceLogoutCoach={handleForceLogoutCoach}
            onUpdateCoachCredentials={handleUpdateCoachCredentials}
            onDeleteCoach={handleDeleteCoach}
            appReleasePolicy={appReleasePolicy}
            onUpdateAppPolicy={handleUpdateAppPolicy}
            onApkReleasePublished={(policy) => setAppReleasePolicy(policy)}
            onPreviewTraineeMobile={(id) => setCoachPreviewTraineeId(id)}
          />
        )}
      </main>

      {loggedInTraineeProfile && (
        <BackgroundAiSyncBanner
          jobs={mergeTraineeBgJobs(loggedInTraineeProfile)}
          liveJobIds={liveBgJobIds}
          onAcknowledgeJob={(jobId) =>
            void handleAcknowledgeAiJob(jobId, loggedInTraineeProfile.id)
          }
          onCancelJob={(jobId) =>
            void handleCancelAiJob(jobId, loggedInTraineeProfile.id)
          }
          onOpenJobMeal={(job) => {
            void fetchAuthorizedData({ force: true });
            setExternalOpenMealRequest({
              traineeId: job.targetTraineeId,
              date: job.date,
              mealSlotId: job.mealSlotId,
              initialTab:
                job.status === 'completed'
                  ? 'meal-items'
                  : job.mode === 'photo'
                  ? 'ai-photo'
                  : 'ai-text',
              nonce: Date.now(),
            });
          }}
        />
      )}

      {isNativeAndroidApp() && currentUser.role === 'trainee' && (
        <Modal
          opened={pushPromptOpen}
          onClose={() => {
            markAndroidPushPrompted();
            setPushPromptOpen(false);
          }}
          centered
          radius="lg"
          title={
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              <Bell size={18} color="currentColor" />
              <span>הפעלת התראות חכמות באנדרואיד</span>
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              רוצה לקבל עדכון כשסריקת הארוחה של ה-AI מסתיימת ברקע, וגם תזכורות
              אישיות מהמאמן שלך?
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              אפשר לשנות או לאשר מחדש בכל רגע מתוך <strong>פרופיל &gt; הגדרות פושים</strong>.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                disabled={pushPromptBusy}
                onClick={async () => {
                  setPushPromptBusy(true);
                  try {
                    const res = await requestAndRegisterAndroidPush();
                    setPushPromptOpen(false);
                    if (res.ok) {
                      notifications.show({
                        title: 'התראות הופעלו בהצלחה',
                        message:
                          'תקבל/י התראה בסיום זיהוי AI ברקע והודעות מהמאמן',
                        color: 'orange',
                      });
                    } else if (res.reason === 'denied') {
                      notifications.show({
                        title: 'ההרשאה לא אושרה כעת',
                        message:
                          'ניתן לאשר בכל עת ממסך הפרופיל > הגדרות התראות',
                        color: 'yellow',
                      });
                    }
                  } finally {
                    setPushPromptBusy(false);
                  }
                }}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {pushPromptBusy && <Loader2 size={14} className="spot-spinner" />}
                <span>כן, הפעל התראות</span>
              </button>
              <button
                type="button"
                disabled={pushPromptBusy}
                onClick={() => {
                  markAndroidPushPrompted();
                  setPushPromptOpen(false);
                }}
                className="btn-surface"
                style={{
                  padding: '11px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                לא עכשיו
              </button>
            </div>
          </div>
        </Modal>
      )}

      {!isNativeAndroidApp() && currentUser.role === 'trainee' && (
        <Modal
          opened={webPushPromptOpen}
          onClose={() => {
            try {
              localStorage.setItem('spot_web_push_prompted_v1', '1');
            } catch {
              // ignore
            }
            setWebPushPromptOpen(false);
          }}
          centered
          radius="lg"
          title={
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              <Bell size={18} color="currentColor" />
              <span>הפעלת התראות SPOT במכשיר זה</span>
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              אשר/י קבלת התראות כדי להתעדכן אוטומטית כשה-AI מסיים לפענח ארוחה
              אחרי שיצאת מהאפליקציה, ולקבל הודעות אישיות מהמאמן שלך.
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12,
                padding: '10px 12px',
              }}
            >
              ניתן לכבות או לשנות הגדרות התראה בכל עת מתוך{' '}
              <strong>פרופיל &gt; הגדרות פושים</strong>.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                disabled={pushPromptBusy}
                onClick={async () => {
                  try {
                    localStorage.setItem('spot_web_push_prompted_v1', '1');
                  } catch {
                    // ignore
                  }
                  setPushPromptBusy(true);
                  try {
                    const res = await requestAndSubscribeWebPush();
                    setWebPushPromptOpen(false);
                    if (res.ok) {
                      notifications.show({
                        title: 'התראות הופעלו בהצלחה',
                        message:
                          'תקבל/י התראות ממאמן האישי ובסיום פענוח AI ברקע',
                        color: 'orange',
                      });
                    } else if (res.reason === 'denied') {
                      notifications.show({
                        title: 'הרשאת ההתראות לא אושרה',
                        message: 'ניתן לאשר בכל עת ממסך הפרופיל / הגדרות המכשיר',
                        color: 'yellow',
                      });
                    }
                  } finally {
                    setPushPromptBusy(false);
                  }
                }}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {pushPromptBusy && <Loader2 size={14} className="spot-spinner" />}
                <span>כן, הפעל התראות</span>
              </button>
              <button
                type="button"
                disabled={pushPromptBusy}
                onClick={() => {
                  try {
                    localStorage.setItem('spot_web_push_prompted_v1', '1');
                  } catch {
                    // ignore
                  }
                  setWebPushPromptOpen(false);
                }}
                className="btn-surface"
                style={{
                  padding: '11px 14px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                לא עכשיו
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
