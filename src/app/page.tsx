'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Crown,
  KeyRound,
  LogOut,
  ShieldCheck,
  User,
  Loader2,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  Download,
  Bell,
} from 'lucide-react';
import {
  AccountStatus,
  AiContextParams,
  AuthSessionUser,
  BodyMeasurementEntry,
  CoachDirectoryItem,
  CoachProfile,
  CoachOnboardingData,
  DailyCardioLog,
  DailyWorkoutLog,
  DayType,
  LoggedFoodItem,
  NutritionTemplate,
  PendingAiMealJob,
  QuickContextChip,
  SavedMealPreset,
  StepsSyncSource,
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
import { CoachDashboardView } from '@/components/CoachDashboardView';
import { AuthGateView } from '@/components/AuthGateView';
import { CoachOnboardingWizard } from '@/components/CoachOnboardingWizard';
import { BackgroundAiSyncBanner } from '@/components/BackgroundAiSyncBanner';
import {
  AppUpdateInfo,
  checkNativeAppUpdate,
  configureBackgroundStepsSync,
  getLocalDateOffsetIso,
  isNativeAndroidApp,
  readNativeDailySteps,
  subscribeAndroidAppResume,
} from '@/lib/capacitorSteps';
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

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [syncingCount, setSyncingCount] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [manualSyncing, setManualSyncing] = useState(false);
  const [androidUpdateInfo, setAndroidUpdateInfo] = useState<AppUpdateInfo | null>(
    null
  );
  const [dismissedUpdateBanner, setDismissedUpdateBanner] = useState(false);
  const [localBgJobs, setLocalBgJobs] = useState<PendingAiMealJob[]>([]);
  const [externalOpenMealRequest, setExternalOpenMealRequest] = useState<{
    traineeId: string;
    date: string;
    mealSlotId: string;
    nonce: number;
  } | null>(null);
  const [externalSectionRequest, setExternalSectionRequest] = useState<{
    traineeId: string;
    section: 'journal' | 'metrics' | 'profile';
    date?: string;
    nonce: number;
  } | null>(null);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);

  const traineesRef = useRef<TraineeProfile[]>([]);
  const syncingCountRef = useRef<number>(0);
  const mutationEpochRef = useRef<number>(0);
  const lastFetchAtRef = useRef<number>(0);
  useEffect(() => {
    traineesRef.current = trainees;
  }, [trainees]);

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
        setCurrentUser(null);
        setTrainees([]);
        setTemplates([]);
        setGroups([]);
        setGlobalQuickChips([]);
        setTraineeGroupQuickChips([]);
        setCoaches([]);
        setMyCoachProfile(null);
        setCoachDirectory([]);
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
        if (remoteData.dbError) {
          setSyncError(remoteData.dbError);
        }
      }
    } catch {
      // ignore network error
    }
  }, []);

  useEffect(() => {
    async function initSecureSession() {
      try {
        const sessionRes = await fetch('/api/auth/session', {
          cache: 'no-store',
        });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData.user) {
            setCurrentUser(sessionData.user);
            await fetchAuthorizedData();
          }
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    }
    initSecureSession();
  }, [fetchAuthorizedData]);

  // סנכרון שקט אוטומטי בחזרה למסך (Mobile app switch / tab focus) וכל 25 שניות כשהמסך גלוי
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') return;

    const syncIfFresh = () => {
      if (document.visibilityState === 'hidden') return;
      if (!window.navigator.onLine) return;
      if (Date.now() - lastFetchAtRef.current < 3500) return;
      void fetchAuthorizedData();
    };

    window.addEventListener('focus', syncIfFresh);
    document.addEventListener('visibilitychange', syncIfFresh);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && window.navigator.onLine) {
        void fetchAuthorizedData();
      }
    }, 25000);

    return () => {
      window.removeEventListener('focus', syncIfFresh);
      document.removeEventListener('visibilitychange', syncIfFresh);
      clearInterval(interval);
    };
  }, [currentUser, fetchAuthorizedData]);

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

  useEffect(() => {
    if (!isNativeAndroidApp()) return;
    let active = true;
    checkNativeAppUpdate().then((info) => {
      if (active && info?.updateAvailable) {
        setAndroidUpdateInfo(info);
      }
    });
    return () => {
      active = false;
    };
  }, []);

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

  useEffect(() => {
    if (!activeAndroidTraineeId) {
      return;
    }

    let cancelled = false;
    const applyDeepLinkTarget = (target: PushDeepLinkTarget) => {
      if (cancelled) return;
      void fetchAuthorizedData({ force: true });
      const targetDate = target.date || getLocalDateOffsetIso(0);
      if (target.screen === 'meal' && target.mealSlotId) {
        setExternalOpenMealRequest({
          traineeId: activeAndroidTraineeId,
          date: targetDate,
          mealSlotId: target.mealSlotId,
          nonce: Date.now(),
        });
      } else {
        setExternalSectionRequest({
          traineeId: activeAndroidTraineeId,
          section: target.screen === 'meal' ? 'journal' : target.screen,
          date: target.date,
          nonce: Date.now(),
        });
      }
    };

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
      onDeepLinkTarget: applyDeepLinkTarget,
      onForegroundCoachPush: (notif) => {
        if (cancelled) return;
        void fetchAuthorizedData({ force: true });
        notifications.show({
          title: notif.title || 'הודעה אישית מהמאמן',
          message: notif.body || 'המאמן שלך שלח לך עדכון חדש',
          color: 'lime',
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
  }, [activeAndroidTraineeId, fetchAuthorizedData]);

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
      if (res.status === 401) {
        setCurrentUser(null);
        setTrainees([]);
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
      ]);
      setPushPromptOpen(false);
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
      countObservationInStats?: boolean;
    }
  ): Promise<{ error?: string }> => {
    const res = await postDataAction({
      action: 'coach-manage-observation-days',
      traineeId,
      ...payload,
    });
    if (!res || !res.ok) {
      return { error: await extractApiError(res, 'שגיאה בעדכון ימי תשקיף') };
    }
    const json = await res.json();
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId
          ? {
              ...t,
              observationDates:
                json.observationDates ?? t.observationDates,
              countObservationInStats:
                json.countObservationInStats ?? t.countObservationInStats,
            }
          : t
      )
    );
    return {};
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

  // פולינג עדין כל 6 שניות כל עוד יש משימת AI שמוגדרת כ-processing ב-DB או ברקע המקומי
  useEffect(() => {
    if (!currentUser) return;
    const hasServerProcessing = trainees.some((t) =>
      (t.pendingAiJobs || []).some((j) => j.status === 'processing')
    );
    const hasLocalProcessing = localBgJobs.some((j) => j.status === 'processing');
    if (!hasServerProcessing && !hasLocalProcessing) return;

    const timer = setInterval(() => {
      void fetchAuthorizedData();
    }, 6000);
    return () => clearInterval(timer);
  }, [currentUser, trainees, localBgJobs, fetchAuthorizedData]);

  // סנכרון אוטומטי של localBgJobs כשהשרת כבר סיים ועדכן pendingAiJobs ב-DB
  useEffect(() => {
    if (localBgJobs.length === 0) return;
    setLocalBgJobs((prev) =>
      prev.filter((lj) => {
        const owner = trainees.find((t) => t.id === lj.targetTraineeId);
        const serverJob = owner?.pendingAiJobs?.find((sj) => sj.id === lj.id);
        if (serverJob && serverJob.status !== 'processing') return false;
        if (
          lj.status === 'processing' &&
          Date.now() - new Date(lj.startedAt).getTime() > 6 * 60 * 1000
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
    return merged;
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
    const startedJob: PendingAiMealJob = {
      id: jobId,
      targetTraineeId: payload.traineeId,
      date: payload.date,
      mealSlotId: payload.mealSlotId,
      mealSlotName: payload.mealSlotName,
      mode: payload.mode,
      summaryHint: payload.textPrompt?.slice(0, 70),
      status: 'processing',
      startedAt: new Date().toISOString(),
      acknowledged: false,
    };

    setLocalBgJobs((prev) => [startedJob, ...prev.slice(0, 5)]);

    void (async () => {
      try {
        const res = await fetch('/api/ai/analyze-meal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'analyze',
            imageDataUrl: payload.imageDataUrl,
            imageDataUrls: payload.imageDataUrls,
            textPrompt: payload.textPrompt,
            contextParams: payload.contextParams,
            customApiKey: geminiApiKey,
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
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.items) && data.items.length > 0) {
          setLocalBgJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    itemsCount: data.items.length,
                    engine: data.engine,
                    isAiFallback: Boolean(data.isAiFallback),
                    fallbackReason: data.fallbackReason,
                    autoSyncedToLog: true,
                  }
                : j
            )
          );
          await fetchAuthorizedData();
        } else {
          setLocalBgJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: 'failed',
                    completedAt: new Date().toISOString(),
                    errorMsg: data.error || 'פענוח ה-AI נכשל — ניתן לנסות שוב',
                  }
                : j
            )
          );
          await fetchAuthorizedData();
        }
      } catch {
        setLocalBgJobs((prev) =>
          prev.map((j) =>
            j.id === jobId
              ? {
                  ...j,
                  summaryHint: 'מחכה לסנכרון חוזר מהשרת...',
                }
              : j
          )
        );
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
      )?.id;
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

  const handleSaveMeal = async (
    traineeId: string,
    date: string,
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) {
      return;
    }

    const nowTime = new Date().toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });

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
                photoDataUrl,
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

  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: 20,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'var(--accent-volt)',
            color: '#08090c',
            fontWeight: 900,
            fontSize: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          S
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Loader2 size={16} className="spot-spinner" color="var(--accent-volt)" />
          <span>טוען נתוני SPOT מהשרת...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthGateView onLoginSuccess={handleLoginSuccess} />;
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
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          className="pro-card"
          style={{ maxWidth: 400, padding: 24, textAlign: 'center' }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
            החשבון ממתין לאישור או הושהה
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}
          >
            אנא פנה למאמן שלך להפעלת החשבון במערכת.
          </div>
          <button
            disabled={loggingOut}
            onClick={handleLogout}
            className="btn-volt"
            style={{
              padding: '9px 20px',
              fontSize: 13,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {loggingOut && <Loader2 size={14} className="spot-spinner" />}
            <span>{loggingOut ? 'מתנתק...' : 'התנתק'}</span>
          </button>
        </div>
      </div>
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
      {isOffline && (
        <div
          role="alert"
          style={{
            background: '#991b1b',
            color: '#ffffff',
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
            color: '#fca5a5',
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
              color: '#fca5a5',
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
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--accent-volt)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#08090c',
                fontWeight: 900,
                fontSize: 15,
              }}
            >
              S
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span
                className="num-mono"
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  letterSpacing: '-0.04em',
                }}
              >
                SPOT
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {currentUser.role === 'admin'
                  ? 'SUPER ADMIN OS'
                  : currentUser.role === 'coach'
                  ? 'COACH WORKSPACE'
                  : 'PERSONAL NUTRITION'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {syncingCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'rgba(210, 255, 40, 0.12)',
                  border: '1px solid rgba(210, 255, 40, 0.35)',
                  color: 'var(--accent-volt)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <Loader2 size={12} className="spot-spinner" />
                <span>שומר...</span>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'var(--bg-surface-1)',
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {currentUser.role === 'admin' ? (
                <Crown size={14} color="var(--accent-volt)" />
              ) : currentUser.role === 'coach' ? (
                <ShieldCheck size={14} color="#38bdf8" />
              ) : (
                <User size={14} color="var(--accent-volt)" />
              )}
              <span>
                {currentUser.name}
                {currentUser.role === 'admin'
                  ? ' (מנהל ראשי)'
                  : currentUser.role === 'coach'
                  ? ' (מאמן)'
                  : ''}
              </span>
            </div>

            <button
              title="סנכרן נתונים עדכניים מהשרת"
              disabled={manualSyncing || isOffline}
              onClick={async () => {
                setManualSyncing(true);
                try {
                  await fetchAuthorizedData({ force: true });
                } finally {
                  setManualSyncing(false);
                }
              }}
              className="btn-surface"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: manualSyncing ? 'wait' : 'pointer',
                padding: 0,
              }}
            >
              <RefreshCw
                size={14}
                className={manualSyncing ? 'spot-spinner' : undefined}
                color={manualSyncing ? 'var(--accent-volt)' : 'var(--text-secondary)'}
              />
            </button>

            {currentUser.role === 'admin' && (
              <button
                title="הגדרות מפתח Gemini API"
                onClick={() => setAiSettingsOpen(true)}
                className="btn-surface"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <KeyRound
                  size={14}
                  color={
                    geminiApiKey
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)'
                  }
                />
              </button>
            )}

            <button
              title="התנתק מהחשבון"
              disabled={loggingOut}
              onClick={handleLogout}
              className="btn-surface"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {loggingOut ? (
                <Loader2 size={13} className="spot-spinner" />
              ) : (
                <LogOut size={13} color="var(--text-secondary)" />
              )}
              <span>{loggingOut ? 'מתנתק...' : 'התנתק'}</span>
            </button>
          </div>
        </div>
      </header>

      {androidUpdateInfo?.updateAvailable && !dismissedUpdateBanner && (
        <div
          style={{
            background: 'rgba(210, 255, 40, 0.14)',
            borderBottom: '1px solid rgba(210, 255, 40, 0.35)',
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
          <a
            href={androidUpdateInfo.apkDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--accent-volt)',
              color: '#08090c',
              padding: '3px 10px',
              borderRadius: 999,
              textDecoration: 'none',
              fontSize: 11,
              fontWeight: 900,
            }}
          >
            הורד עדכון
          </a>
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

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '20px 16px',
        }}
      >
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
            onRenameProfile={handleRenameTraineeProfile}
            onPushPreferencesUpdated={handlePushPreferencesUpdated}
            geminiApiKey={geminiApiKey}
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
            geminiApiKey={geminiApiKey}
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
            onCreateCoach={handleCreateCoach}
            onUpdateCoachStatus={handleUpdateCoachStatus}
            onUpdateCoachCredentials={handleUpdateCoachCredentials}
            onDeleteCoach={handleDeleteCoach}
            onPreviewTraineeMobile={(id) => setCoachPreviewTraineeId(id)}
          />
        )}
      </main>

      {loggedInTraineeProfile && (
        <BackgroundAiSyncBanner
          jobs={mergeTraineeBgJobs(loggedInTraineeProfile)}
          onAcknowledgeJob={(jobId) =>
            void handleAcknowledgeAiJob(jobId, loggedInTraineeProfile.id)
          }
          onOpenJobMeal={(job) => {
            setExternalOpenMealRequest({
              traineeId: job.targetTraineeId,
              date: job.date,
              mealSlotId: job.mealSlotId,
              nonce: Date.now(),
            });
          }}
        />
      )}

      {currentUser.role === 'admin' && (
        <Modal
          opened={aiSettingsOpen}
          onClose={() => setAiSettingsOpen(false)}
          title={
            <span style={{ fontWeight: 800, fontSize: 15 }}>
              הגדרות מנוע AI (Gemini 3.8 Flash / 3.5 Flash-Lite)
            </span>
          }
          centered
          radius="lg"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setAiSettingsOpen(false);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
              }}
            >
              המערכת כוללת מנוע זיהוי עברי מובנה שעובד מיד ללא מפתח. לפענוח
              תמונות חופשי עם Gemini 3.8 Flash (ומודל הגיבוי החינמי 3.5 Flash-Lite) ניתן להדביק מפתח חינמי מ-Google
              AI Studio:
            </div>
            <TextInput
              dir="ltr"
              label="מפתח Gemini API"
              placeholder="AIzaSy..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.currentTarget.value)}
            />
            <button
              type="submit"
              className="btn-volt"
              style={{ padding: '10px', fontSize: 13, cursor: 'pointer' }}
            >
              שמור הגדרות
            </button>
          </form>
        </Modal>
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
              <Bell size={18} color="var(--accent-volt)" />
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
                        color: 'lime',
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
    </div>
  );
}
