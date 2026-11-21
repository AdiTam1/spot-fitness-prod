'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, TextInput } from '@mantine/core';
import {
  Crown,
  KeyRound,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  AccountStatus,
  AuthSessionUser,
  BodyMeasurementEntry,
  CoachDirectoryItem,
  CoachOnboardingData,
  CoachProfile,
  DailyCardioLog,
  DailyWorkoutLog,
  DayType,
  LoggedFoodItem,
  NutritionTemplate,
  TraineeActivityTargets,
  TraineeGroup,
  TraineeOnboardingData,
  TraineeProfile,
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import { TraineeMobileView } from '@/components/TraineeMobileView';
import { CoachDashboardView } from '@/components/CoachDashboardView';
import { AuthGateView } from '@/components/AuthGateView';
import { CoachOnboardingWizard } from '@/components/CoachOnboardingWizard';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [coachPreviewTraineeId, setCoachPreviewTraineeId] = useState<
    string | null
  >(null);

  const [templates, setTemplates] = useState<NutritionTemplate[]>([]);
  const [trainees, setTrainees] = useState<TraineeProfile[]>([]);
  const [groups, setGroups] = useState<TraineeGroup[]>([]);
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

  const fetchAuthorizedData = useCallback(async () => {
    try {
      const dataRes = await fetch('/api/data', { cache: 'no-store' });
      if (dataRes.status === 401 || dataRes.status === 403) {
        setCurrentUser(null);
        setTrainees([]);
        setTemplates([]);
        setGroups([]);
        setCoaches([]);
        setMyCoachProfile(null);
        setCoachDirectory([]);
        return;
      }
      if (dataRes.ok) {
        const remoteData = await dataRes.json();
        if (Array.isArray(remoteData.trainees)) {
          setTrainees(remoteData.trainees);
        }
        if (Array.isArray(remoteData.templates)) {
          setTemplates(remoteData.templates);
        }
        if (Array.isArray(remoteData.groups)) {
          setGroups(remoteData.groups);
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

  const postDataAction = async (payload: Record<string, unknown>) => {
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
  };

  const syncTraineeLogUpdate = async (updatedProfile: TraineeProfile) => {
    const action =
      currentUser?.role === 'trainee'
        ? 'trainee-self-update'
        : 'coach-update-trainee-log';
    await postDataAction({
      action,
      trainee: updatedProfile,
    });
  };

  const handleLoginSuccess = async (user: AuthSessionUser) => {
    setCurrentUser(user);
    setCoachPreviewTraineeId(null);
    setSkippedCoachOnboarding(false);
    await fetchAuthorizedData();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    setCurrentUser(null);
    setTrainees([]);
    setTemplates([]);
    setGroups([]);
    setCoaches([]);
    setMyCoachProfile(null);
    setCoachDirectory([]);
    setCoachPreviewTraineeId(null);
  };

  const handleCompleteTraineeOnboarding = (
    traineeId: string,
    data: {
      name: string;
      currentWeight: number;
      targetWeight: number;
      onboarding: TraineeOnboardingData;
      measurement?: BodyMeasurementEntry;
    }
  ) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const nextMeas = data.measurement
          ? [...(t.measurementsHistory || []), data.measurement]
          : t.measurementsHistory || [];
        const updatedTrainee: TraineeProfile = {
          ...t,
          name: data.name || t.name,
          currentWeight: data.currentWeight,
          targetWeight: data.targetWeight,
          onboarding: data.onboarding,
          measurementsHistory: nextMeas,
          weightHistory: [
            ...t.weightHistory,
            { date: data.onboarding.completedAt || 'היום', weight: data.currentWeight },
          ],
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleSaveBodyMeasurement = (
    traineeId: string,
    measurement: BodyMeasurementEntry
  ) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const updatedTrainee: TraineeProfile = {
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
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
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
    if (res.ok) {
      setEditingCoachOnboarding(false);
      await fetchAuthorizedData();
    }
  };

  const handleUpdateDailyActivity = (
    traineeId: string,
    date: string,
    payload: {
      sleepHours?: number;
      workoutLog?: DailyWorkoutLog;
      cardioLog?: DailyCardioLog;
    }
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const updatedTrainee: TraineeProfile = {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              ...(payload.sleepHours !== undefined
                ? { sleepHours: payload.sleepHours }
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
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleUpdateActivityTargets = async (
    traineeId: string,
    activityTargets: TraineeActivityTargets
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    setTrainees((prev) =>
      prev.map((t) =>
        t.id === traineeId ? { ...t, activityTargets } : t
      )
    );
    await postDataAction({
      action: 'coach-update-activity-targets',
      traineeId,
      activityTargets,
    });
  };

  const handleUpdateAiNotesAndSplit = async (
    traineeId: string,
    payload: {
      enableWorkoutRestSplit?: boolean;
      coachAiNotes?: string;
      aiLearnedPreferences?: string[];
    }
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
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
    await postDataAction({
      action: 'coach-update-ai-notes-and-split',
      traineeId,
      ...payload,
    });
  };

  const handleSaveWeeklyCheckIn = (
    traineeId: string,
    checkIn: WeeklyCheckInEntry
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const updatedTrainee: TraineeProfile = {
          ...t,
          weeklyCheckIns: [...(t.weeklyCheckIns || []), checkIn],
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
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
  ) => {
    const res = await postDataAction({
      action: 'coach-manage-observation-days',
      traineeId,
      ...payload,
    });
    if (res.ok) {
      const json = await res.json();
      setTrainees((prev) =>
        prev.map((t) =>
          t.id === traineeId
            ? {
                ...t,
                observationDates:
                  json.observationDates ?? t.observationDates,
                countObservationInStats:
                  json.countObservationInStats ??
                  t.countObservationInStats,
              }
            : t
        )
      );
    }
  };

  const handleSaveMeal = (
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

    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const existingMeal = currentLog.meals[mealSlotId];
        const updatedTrainee: TraineeProfile = {
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
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleUpdateDayType = (
    traineeId: string,
    date: string,
    dayType: DayType
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType,
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const updatedTrainee: TraineeProfile = {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              dayType,
            },
          },
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleUpdateWater = (traineeId: string, date: string, cups: number) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const updatedTrainee: TraineeProfile = {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              waterCups: cups,
            },
          },
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleUpdateWeight = (
    traineeId: string,
    date: string,
    weightKg: number
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const updatedTrainee: TraineeProfile = {
          ...t,
          currentWeight: weightKg,
          weightHistory: [...t.weightHistory, { date, weight: weightKg }],
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleToggleFavorite = (traineeId: string, foodId: string) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const exists = t.favoriteFoodIds.includes(foodId);
        const updatedTrainee: TraineeProfile = {
          ...t,
          favoriteFoodIds: exists
            ? t.favoriteFoodIds.filter((id) => id !== foodId)
            : [...t.favoriteFoodIds, foodId],
        };
        syncTraineeLogUpdate(updatedTrainee);
        return updatedTrainee;
      })
    );
  };

  const handleSaveTemplate = async (updatedTemplate: NutritionTemplate) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'save-template',
      template: updatedTemplate,
    });
    if (res.ok) {
      const data = await res.json();
      const saved = (data.template as NutritionTemplate) || updatedTemplate;
      setTemplates((prev) => {
        const exists = prev.some((t) => t.id === saved.id);
        return exists
          ? prev.map((t) => (t.id === saved.id ? saved : t))
          : [...prev, saved];
      });
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'delete-template',
      templateId,
    });
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    }
  };

  const handleAssignTemplateToTrainee = async (
    traineeId: string,
    dayType: DayType,
    template: NutritionTemplate
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const target = trainees.find((t) => t.id === traineeId);
    if (!target) return;
    const cloned: NutritionTemplate = JSON.parse(JSON.stringify(template));
    await handleUpdateTraineePlan(
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
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
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
    await postDataAction({
      action: 'update-trainee-plan',
      traineeId,
      dayType,
      updatedTemplate,
      tolerancePercent,
    });
  };

  const handleAddCoachFeedback = async (
    traineeId: string,
    date: string,
    mealSlotId: string,
    feedback: string
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
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

    await postDataAction({
      action: 'add-coach-feedback',
      traineeId,
      date,
      mealSlotId,
      feedback,
    });
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
  }) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'coach-create-trainee',
      ...data,
    });
    if (res.ok) {
      await fetchAuthorizedData();
    }
  };

  const handleUpdateTraineeStatus = async (
    traineeId: string,
    status: AccountStatus,
    primaryCoachId?: string
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
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
    await postDataAction({
      action: 'update-trainee-status',
      traineeId,
      status,
      primaryCoachId,
    });
  };

  const handleUpdateTraineeCredentials = async (
    traineeId: string,
    email: string,
    password: string
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, email } : t))
    );
    await postDataAction({
      action: 'coach-update-credentials',
      traineeId,
      email,
      password,
    });
  };

  const handleUpdateTraineeSharing = async (
    traineeId: string,
    primaryCoachId: string,
    sharedCoachIds: string[]
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'update-trainee-sharing',
      traineeId,
      primaryCoachId,
      sharedCoachIds,
    });
    if (res.ok) {
      await fetchAuthorizedData();
    }
  };

  const handleUpdateTraineeGroup = async (
    traineeId: string,
    groupId?: string
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, groupId } : t))
    );
    await postDataAction({
      action: 'update-trainee-group',
      traineeId,
      groupId,
    });
  };

  const handleCreateGroup = async (name: string, color: string) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'create-group',
      name,
      color,
    });
    if (res.ok) {
      const data = await res.json();
      if (data.group) {
        setGroups((prev) => [...prev, data.group as TraineeGroup]);
      }
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setTrainees((prev) =>
      prev.map((t) =>
        t.groupId === groupId ? { ...t, groupId: undefined } : t
      )
    );
    await postDataAction({
      action: 'delete-group',
      groupId,
    });
  };

  const handleBulkGroupAssignTemplate = async (
    groupId: string,
    templateId: string,
    dayType: DayType
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'bulk-group-assign-template',
      groupId,
      templateId,
      dayType,
    });
    if (res.ok) {
      await fetchAuthorizedData();
    }
  };

  const handleBulkGroupShareCoach = async (
    groupId: string,
    targetCoachId: string
  ) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    const res = await postDataAction({
      action: 'bulk-group-share-coach',
      groupId,
      targetCoachId,
    });
    if (res.ok) {
      await fetchAuthorizedData();
    }
  };

  const handleDeleteTrainee = async (traineeId: string) => {
    if (!currentUser || currentUser.role === 'trainee') return;
    setTrainees((prev) => prev.filter((t) => t.id !== traineeId));
    await postDataAction({
      action: 'coach-delete-trainee',
      deleteTraineeId: traineeId,
    });
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
    const json = await res.json();
    if (!res.ok) {
      return { error: json.error || 'שגיאה ביצירת מאמן' };
    }
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
  ) => {
    if (currentUser?.role !== 'admin') return;
    setCoaches((prev) =>
      prev.map((c) => (c.id === coachId ? { ...c, status } : c))
    );
    await postDataAction({
      action: 'admin-update-coach-status',
      coachId,
      status,
    });
    await fetchAuthorizedData();
  };

  const handleUpdateCoachCredentials = async (
    coachId: string,
    email: string,
    password: string,
    inviteCode: string
  ) => {
    if (currentUser?.role !== 'admin') return;
    await postDataAction({
      action: 'admin-update-coach-credentials',
      coachId,
      email,
      password,
      inviteCode,
    });
    await fetchAuthorizedData();
  };

  const handleDeleteCoach = async (coachId: string) => {
    if (currentUser?.role !== 'admin') return;
    await postDataAction({
      action: 'admin-delete-coach',
      coachId,
    });
    await fetchAuthorizedData();
  };

  if (!hydrated) {
    return null;
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
            onClick={handleLogout}
            className="btn-volt"
            style={{ padding: '9px 20px', fontSize: 13, cursor: 'pointer' }}
          >
            התנתק
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
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 80,
          background: 'rgba(8, 9, 12, 0.85)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '10px 18px',
        }}
      >
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
              <LogOut size={13} color="var(--text-secondary)" />
              <span>התנתק</span>
            </button>
          </div>
        </div>
      </header>

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
            geminiApiKey={geminiApiKey}
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
            geminiApiKey={geminiApiKey}
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
            onUpdateCoachInviteCode={async (code) => {
              setCoachInviteCode(code);
              await postDataAction({
                action: 'coach-update-invite-code',
                inviteCode: code,
              });
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

      {currentUser.role === 'admin' && (
        <Modal
          opened={aiSettingsOpen}
          onClose={() => setAiSettingsOpen(false)}
          title={
            <span style={{ fontWeight: 800, fontSize: 15 }}>
              הגדרות מנוע AI (Gemini 2.5 Flash)
            </span>
          }
          centered
          radius="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              תמונות חופשי עם Gemini 2.5 Flash ניתן להדביק מפתח חינמי מ-Google
              AI Studio:
            </div>
            <TextInput
              label="מפתח Gemini API"
              placeholder="AIzaSy..."
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.currentTarget.value)}
            />
            <button
              className="btn-volt"
              style={{ padding: '10px', fontSize: 13, cursor: 'pointer' }}
              onClick={() => {
                setAiSettingsOpen(false);
              }}
            >
              שמור הגדרות
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
