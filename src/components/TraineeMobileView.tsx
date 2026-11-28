'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@mantine/core';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Plus,
  Sparkles,
  Activity,
  User,
  MessageSquare,
  Ruler,
  Eye,
  Lightbulb,
  Share2,
  Check,
  Minus,
  Loader2,
  Bookmark,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Layers,
  Mic,
  NotebookText,
  Barcode,
  Heart,
  Footprints,
  Clock,
  Ban,
  Lock,
  AlertTriangle,
  X,
} from 'lucide-react';
import {
  AiContextParams,
  BodyMeasurementEntry,
  CustomFoodItem,
  DailyCardioLog,
  DailyWorkoutLog,
  DayType,
  LoggedFoodItem,
  MealCardShortcutId,
  MealTemplateSlot,
  PendingAiMealJob,
  PhotoAngleKind,
  QuickContextChip,
  SavedMealPreset,
  StepsSyncSource,
  TraineeCustomUnit,
  TraineeOnboardingData,
  TraineeProfile,
  TraineePushPreferences,
  TraineeServingTool,
  UserRole,
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import type { CustomFoodsMutationResult } from '@/components/CustomFoodModal';
import { getTodayIso, sumMacros } from '@/data/israeliFoodCatalog';
import { hasCompositeComponents } from '@/lib/compositeDishes';
import { resolveMealPhotos } from '@/lib/mealHistory';
import {
  ALL_MEAL_SHORTCUT_OPTIONS,
  DEFAULT_MEAL_CARD_SHORTCUTS,
  HEBREW_MONTH_NAMES,
  HEBREW_WEEKDAY_LETTERS,
  addDaysIso,
  diffDaysIso,
  formatMetricScheduleSummary,
  getResolvedMetricSchedule,
  getWeekDaysAroundDate,
  isDateActiveForTrainee,
  isDayBlockedForTrainee,
  isMetricScheduledForDate,
  isObservationDateForTrainee,
  isTodayObservationRestricted,
} from '@/lib/dateUtils';
import { isNativeAndroidApp } from '@/lib/capacitorSteps';
import { parseOptionalDecimal, sanitizeDecimalInput, normalizeHhMmTime } from '@/lib/numericInput';
import { AddMealDrawer } from './AddMealDrawer';
import { ItemTimePill } from './ui/ItemTimePill';
import { TraineeOnboardingWizard } from './TraineeOnboardingWizard';
import { BodyMeasurementGuide } from './BodyMeasurementGuide';
import { DailyStepsCard } from './DailyStepsCard';
import { TraineeProfileView } from './TraineeProfileView';
import { CalendarSheet } from './journal/CalendarSheet';
import { GlassButton } from './ui/GlassButton';
import { GlassDock } from './ui/GlassDock';
import { TimeWheel } from './ui/TimeWheel';
import { ProgressRing } from './ui/ProgressRing';

function findTraineeMealSlotById(trainee: TraineeProfile, mealSlotId: string) {
  const allSlots = [
    ...(trainee.workoutTemplate?.meals || []),
    ...(trainee.restTemplate?.meals || []),
  ];
  return allSlots.find((s) => s.id === mealSlotId);
}

interface TraineeMobileViewProps {
  trainee: TraineeProfile;
  isCoachPreview?: boolean;
  onExitCoachPreview?: () => void;
  onUpdateDayType: (traineeId: string, date: string, dayType: DayType) => void;
  onSaveMeal: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string,
    photoDataUrls?: string[],
    mealTime?: string,
    aiSuggestedExtras?: LoggedFoodItem[]
  ) => void | Promise<void>;
  onUpdateMealTime?: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    mealTime: string
  ) => void | Promise<void>;
  onUpdateItemTime?: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    itemId: string,
    itemTime: string
  ) => void | Promise<void>;
  onUpdateWater: (traineeId: string, date: string, cups: number) => void | Promise<void>;
  onUpdateWeight: (traineeId: string, date: string, weightKg: number) => void | Promise<void>;
  onToggleFavorite: (traineeId: string, foodId: string) => void;
  onCompleteOnboarding: (
    traineeId: string,
    data: {
      name: string;
      goal?: string;
      currentWeight: number;
      targetWeight: number;
      onboarding: TraineeOnboardingData;
      measurement?: BodyMeasurementEntry;
    }
  ) => void | Promise<void>;
  onSaveBodyMeasurement: (
    traineeId: string,
    measurement: BodyMeasurementEntry
  ) => void | Promise<void>;
  onUpdateDailyActivity: (
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
  ) => void | Promise<void>;
  onSaveWeeklyCheckIn?: (
    traineeId: string,
    checkIn: WeeklyCheckInEntry
  ) => void | Promise<void>;
  onPreferenceLearned?: (traineeId: string, prefs: string[]) => void;
  globalQuickChips?: QuickContextChip[];
  groupQuickChips?: QuickContextChip[];
  onSavedMealAction?: (
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
  ) => Promise<{ error?: string }>;
  onManageToolsAndUnits?: (
    traineeId: string,
    payload: {
      customServingTools?: TraineeServingTool[];
      customFoodUnits?: TraineeCustomUnit[];
    }
  ) => Promise<{ error?: string }>;
  onManageQuickChips?: (payload: {
    scope: 'user' | 'group' | 'coach-trainees' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
  actorRole?: UserRole;
  customFoods?: CustomFoodItem[];
  onCustomFoodsUpdated?: (res: CustomFoodsMutationResult) => void;
  backgroundAiJobs?: PendingAiMealJob[];
  onStartBackgroundAiAnalysis?: (payload: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    mealSlotName: string;
    mode: 'photo' | 'text' | 'adjust';
    imageDataUrl?: string;
    imageDataUrls?: string[];
    imageMetas?: { angle: PhotoAngleKind; labelProductName?: string }[];
    textPrompt?: string;
    baseItems?: LoggedFoodItem[];
    selectedTargetIds?: string[];
    correctionHistory?: { beforeNames?: string[]; prompt: string; at?: string }[];
    adjustmentPrompt?: string;
    contextParams?: AiContextParams;
  }) => Promise<{ jobId: string }>;
  onAcknowledgeAiJob?: (jobId: string, traineeId?: string) => void | Promise<void>;
  onCancelAiJob?: (jobId: string, traineeId?: string) => void | Promise<void>;
  onMarkCoachMealEditsRead?: (params: {
    mode: 'alert-visit' | 'banner' | 'badges';
    alertId?: string;
    date?: string;
    mealSlotId?: string;
  }) => Promise<void>;
  onRestoreCoachDeletedItem?: (params: {
    date: string;
    mealSlotId: string;
    noticeId?: string;
    historyEventId?: string;
    itemId?: string;
  }) => Promise<void>;
  onRollbackMealHistory?: (params: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    historyEntryId: string;
  }) => Promise<void>;
  onRefreshDataFromServer?: () => void;
  externalOpenMealRequest?: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    initialTab?: string;
    openAdjustWithDraft?: boolean;
    openClarificationJobId?: string;
    nonce: number;
  } | null;
  externalSectionRequest?: {
    traineeId: string;
    section: 'journal' | 'metrics' | 'profile';
    date?: string;
    nonce: number;
  } | null;
  onConsumeExternalOpenMealRequest?: (nonce: number) => void;
  onConsumeExternalSectionRequest?: (nonce: number) => void;
  onRenameProfile?: (name: string) => Promise<{ error?: string }>;
  onPushPreferencesUpdated?: (prefs: TraineePushPreferences) => void;
  onUpdateMealShortcuts?: (
    traineeId: string,
    shortcuts: MealCardShortcutId[]
  ) => void | Promise<void>;
  onSyncNativeStepsNow?: () => Promise<void>;
  showScraperSources?: boolean;
  semanticSearchEnabled?: boolean;
  olderLogsInfo?: {
    hasOlderLogs: boolean;
    olderLogsCount: number;
    cutoffDateIso: string;
  } | null;
  loadingOlderLogs?: boolean;
  onLoadOlderLogs?: () => Promise<void> | void;
}

function CompactMiniRing({
  current,
  target,
  color,
  size = 48,
}: {
  current: number;
  target: number;
  color: string;
  size?: number;
}) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.min(1, Math.max(0, current / Math.max(1, target)));
  const dash = c * ratio;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--surface-3)"
        strokeWidth={4}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function TraineeMobileView({
  trainee,
  isCoachPreview = false,
  onExitCoachPreview,
  onUpdateDayType,
  onSaveMeal,
  onUpdateMealTime,
  onUpdateItemTime,
  onUpdateWater,
  onUpdateWeight,
  onToggleFavorite,
  onCompleteOnboarding,
  onSaveBodyMeasurement,
  onUpdateDailyActivity,
  onSaveWeeklyCheckIn,
  onPreferenceLearned,
  globalQuickChips = [],
  groupQuickChips = [],
  onSavedMealAction,
  onManageToolsAndUnits,
  onManageQuickChips,
  actorRole = 'trainee',
  customFoods = [],
  onCustomFoodsUpdated,
  backgroundAiJobs = [],
  onStartBackgroundAiAnalysis,
  onAcknowledgeAiJob,
  onCancelAiJob,
  onMarkCoachMealEditsRead,
  onRestoreCoachDeletedItem,
  onRollbackMealHistory,
  onRefreshDataFromServer,
  externalOpenMealRequest,
  externalSectionRequest,
  onConsumeExternalOpenMealRequest,
  onConsumeExternalSectionRequest,
  onRenameProfile,
  onPushPreferencesUpdated,
  onUpdateMealShortcuts,
  onSyncNativeStepsNow,
  showScraperSources = false,
  semanticSearchEnabled = false,
  olderLogsInfo,
  loadingOlderLogs = false,
  onLoadOlderLogs,
}: TraineeMobileViewProps) {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  useEffect(() => {
    if (
      !isCoachPreview &&
      olderLogsInfo?.hasOlderLogs &&
      !loadingOlderLogs &&
      olderLogsInfo.cutoffDateIso &&
      selectedDate < olderLogsInfo.cutoffDateIso
    ) {
      void onLoadOlderLogs?.();
    }
  }, [
    isCoachPreview,
    olderLogsInfo?.hasOlderLogs,
    olderLogsInfo?.cutoffDateIso,
    loadingOlderLogs,
    selectedDate,
    onLoadOlderLogs,
  ]);
  const [dismissedCoachAlertIds, setDismissedCoachAlertIds] = useState<string[]>([]);
  const [sessionPinnedCoachAlertIds, setSessionPinnedCoachAlertIds] = useState<string[]>([]);
  const coachAlertVisitSentIdsRef = useRef<Set<string>>(new Set());
  const [externalOpenAdjustNonce, setExternalOpenAdjustNonce] = useState<number>(0);
  const [externalClarifyJobId, setExternalClarifyJobId] = useState<string | undefined>(undefined);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [calendarCursor, setCalendarCursor] = useState<{ year: number; month: number }>(() => {
    const [y, m] = todayIso.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [mobileSection, setMobileSection] = useState<
    'journal' | 'metrics' | 'profile'
  >('journal');
  const [editingOnboarding, setEditingOnboarding] = useState(false);
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);
  const [measureAlertOpen, setMeasureAlertOpen] = useState(false);
  const [weekStripOpen, setWeekStripOpen] = useState(false);
  const [journalSubTab, setJournalSubTab] = useState<'meals' | 'activity'>('meals');
  const [expandedMealIds, setExpandedMealIds] = useState<Record<string, boolean>>({});
  const [expandedDishIds, setExpandedDishIds] = useState<Record<string, boolean>>({});
  const [stepsModalOpen, setStepsModalOpen] = useState(false);
  const [showStickyCalBar, setShowStickyCalBar] = useState(false);
  const calorieCardRef = useRef<HTMLElement | null>(null);

  const [activeMealSlot, setActiveMealSlot] = useState<MealTemplateSlot | null>(
    null
  );
  const [drawerTab, setDrawerTab] = useState<string>('hub');
  const [drawerReturnTarget, setDrawerReturnTarget] = useState<{
    section: 'journal' | 'metrics' | 'profile';
    date: string;
  } | null>(null);
  const [timeEditSlot, setTimeEditSlot] = useState<MealTemplateSlot | null>(null);
  const [draftMealTime, setDraftMealTime] = useState<string>('12:00');
  const [savingMealTime, setSavingMealTime] = useState(false);
  const [customSleepOpen, setCustomSleepOpen] = useState(false);
  const [customSleepDraft, setCustomSleepDraft] = useState('');
  const [weightInput, setWeightInput] = useState<string>(
    String(trainee.currentWeight)
  );
  const isWeightFocusedRef = useRef(false);
  const prevWeightSyncRef = useRef<{ id: string; weight: number }>({
    id: trainee.id,
    weight: trainee.currentWeight,
  });

  const latestCheckIn =
    trainee.weeklyCheckIns?.[trainee.weeklyCheckIns.length - 1];
  const [energyLevel, setEnergyLevel] = useState<number>(
    latestCheckIn?.energyLevel || 4
  );
  const [hungerLevel, setHungerLevel] = useState<number>(
    latestCheckIn?.hungerLevel || 3
  );
  const [sleepQuality, setSleepQuality] = useState<number>(
    latestCheckIn?.sleepQuality || 4
  );
  const [checkInNote, setCheckInNote] = useState<string>('');
  const [checkInSavedBanner, setCheckInSavedBanner] = useState(false);
  const [reportCopiedBanner, setReportCopiedBanner] = useState(false);
  const [reportCopyError, setReportCopyError] = useState(false);
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightFeedback, setWeightFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);
  const [savingCheckIn, setSavingCheckIn] = useState(false);
  const [savingMeasurements, setSavingMeasurements] = useState(false);
  const weightLockRef = useRef(false);
  const checkInLockRef = useRef(false);
  const latestTraineeRef = useRef(trainee);
  latestTraineeRef.current = trainee;
  const lastHandledMealNonceRef = useRef<number | null>(null);
  const lastHandledSectionNonceRef = useRef<number | null>(null);

  // סנכרון משקל ומדדים כאשר עוברים מתאמן (בתצוגת מאמן) או כשהנתונים מתעדכנים מהשרת
  useEffect(() => {
    const prev = prevWeightSyncRef.current;
    const changedTrainee = prev.id !== trainee.id;
    const changedWeight = prev.weight !== trainee.currentWeight;
    prevWeightSyncRef.current = { id: trainee.id, weight: trainee.currentWeight };
    if (changedTrainee) {
      setWeightInput(String(trainee.currentWeight));
      setWeightFeedback(null);
    } else if (changedWeight && !isWeightFocusedRef.current) {
      setWeightInput(String(trainee.currentWeight));
    }
  }, [trainee.id, trainee.currentWeight]);

  useEffect(() => {
    const chk = trainee.weeklyCheckIns?.[trainee.weeklyCheckIns.length - 1];
    setEnergyLevel(chk?.energyLevel || 4);
    setHungerLevel(chk?.hungerLevel || 3);
    setSleepQuality(chk?.sleepQuality || 4);
  }, [trainee.id, trainee.weeklyCheckIns]);

  useEffect(() => {
    if (
      !externalOpenMealRequest ||
      externalOpenMealRequest.traineeId !== trainee.id ||
      lastHandledMealNonceRef.current === externalOpenMealRequest.nonce
    ) {
      return;
    }
    lastHandledMealNonceRef.current = externalOpenMealRequest.nonce;
    setDrawerReturnTarget(null);
    setMobileSection('journal');
    setSelectedDate(externalOpenMealRequest.date);
    const targetSlot = findTraineeMealSlotById(
      latestTraineeRef.current,
      externalOpenMealRequest.mealSlotId
    );
    if (targetSlot) {
      setActiveMealSlot(targetSlot);
      setDrawerTab(
        externalOpenMealRequest.initialTab === 'ai-clarify'
          ? 'meal-items'
          : externalOpenMealRequest.initialTab || 'hub'
      );
      if (externalOpenMealRequest.openAdjustWithDraft) {
        setExternalOpenAdjustNonce(externalOpenMealRequest.nonce);
      }
      if (externalOpenMealRequest.openClarificationJobId) {
        setExternalClarifyJobId(externalOpenMealRequest.openClarificationJobId);
      } else {
        setExternalClarifyJobId(undefined);
      }
    }
    onConsumeExternalOpenMealRequest?.(externalOpenMealRequest.nonce);
  }, [externalOpenMealRequest, trainee.id, onConsumeExternalOpenMealRequest]);

  // בכניסה של המתאמן עצמו ליומן: צמידים התראות חדשות לביקור זה ומעלים אוטומטית את אלו שכבר הוצגו בביקור קודם
  useEffect(() => {
    if (actorRole !== 'trainee' || isCoachPreview || mobileSection !== 'journal') return;
    const alerts = trainee.coachMealAlerts || [];
    const activeForVisit = alerts.filter(
      (a) => !a.dismissed && !a.shownOnJournalVisit
    );
    const hasAlreadyShownOld = alerts.some(
      (a) => !a.dismissed && a.shownOnJournalVisit && !sessionPinnedCoachAlertIds.includes(a.id)
    );
    if (activeForVisit.length > 0) {
      const newlyVisibleIds = activeForVisit
        .map((a) => a.id)
        .filter((id) => !coachAlertVisitSentIdsRef.current.has(id));
      if (newlyVisibleIds.length > 0) {
        newlyVisibleIds.forEach((id) => coachAlertVisitSentIdsRef.current.add(id));
        setSessionPinnedCoachAlertIds((prev) =>
          Array.from(new Set([...prev, ...newlyVisibleIds]))
        );
        void onMarkCoachMealEditsRead?.({ mode: 'alert-visit' });
      }
    } else if (hasAlreadyShownOld) {
      void onMarkCoachMealEditsRead?.({ mode: 'alert-visit' });
    }
  }, [
    actorRole,
    isCoachPreview,
    mobileSection,
    trainee.coachMealAlerts,
    sessionPinnedCoachAlertIds,
    onMarkCoachMealEditsRead,
  ]);

  useEffect(() => {
    if (
      !externalSectionRequest ||
      externalSectionRequest.traineeId !== trainee.id ||
      lastHandledSectionNonceRef.current === externalSectionRequest.nonce
    ) {
      return;
    }
    lastHandledSectionNonceRef.current = externalSectionRequest.nonce;
    setMobileSection(externalSectionRequest.section);
    if (externalSectionRequest.date) {
      setSelectedDate(externalSectionRequest.date);
    }
    onConsumeExternalSectionRequest?.(externalSectionRequest.nonce);
  }, [externalSectionRequest, trainee.id, onConsumeExternalSectionRequest]);

  // נעילה אוטומטית לימי תשקיף אם היום יום תשקיף בארץ והגדרה זו פעילה אצל המתאמן
  useEffect(() => {
    if (
      isTodayObservationRestricted(trainee, todayIso) &&
      !isObservationDateForTrainee(selectedDate, trainee)
    ) {
      setSelectedDate(todayIso);
    }
  }, [trainee, todayIso, selectedDate]);

  useEffect(() => {
    setCustomSleepOpen(false);
  }, [selectedDate, trainee.id]);

  useEffect(() => {
    if (mobileSection !== 'journal') {
      setShowStickyCalBar(false);
      return;
    }
    const el = calorieCardRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const pastTop = !entry.isIntersecting && entry.boundingClientRect.bottom < 85;
        setShowStickyCalBar(pastTop);
      },
      { root: null, rootMargin: '-72px 0px 0px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mobileSection, selectedDate, journalSubTab]);

  // אם המתאמן מתחבר בפעם הראשונה וטרם השלים Onboarding -> מציג את אשף ה-Onboarding
  if (
    (!trainee.onboarding?.completed && !isCoachPreview) ||
    editingOnboarding
  ) {
    const canReturnToProfile = Boolean(trainee.onboarding?.completed || isCoachPreview);
    return (
      <TraineeOnboardingWizard
        trainee={trainee}
        onCancel={
          canReturnToProfile
            ? () => {
                setEditingOnboarding(false);
                setMobileSection('profile');
              }
            : undefined
        }
        onCompleteOnboarding={async (data) => {
          await onCompleteOnboarding(trainee.id, data);
          setEditingOnboarding(false);
        }}
      />
    );
  }

  const weekDays = getWeekDaysAroundDate(selectedDate, todayIso);
  // Weekly summary shared by the check-in stats grid and the WhatsApp report (same numbers as before).
  const buildWeeklySummary = () => {
    const actTargets = trainee.activityTargets || {
      weeklyWorkoutsTarget: 4,
      weeklyCardioTarget: 3,
      dailySleepTargetHours: 7.5,
      dailyStepsTarget: 8000,
    };
    const workoutsDone = weekDays.filter((wd) => trainee.logs[wd.iso]?.workoutLog?.completed).length;
    const cardioDone = weekDays.filter((wd) => trainee.logs[wd.iso]?.cardioLog?.completed).length;
    const sleepDays = weekDays
      .map((wd) => trainee.logs[wd.iso]?.sleepHours)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgSleep = sleepDays.length > 0 ? (sleepDays.reduce((a, b) => a + b, 0) / sleepDays.length).toFixed(1) : '—';
    const hasAutoSyncedWeek = weekDays.some((wd) => {
      const src = trainee.logs[wd.iso]?.stepsSource;
      return Boolean(src && src !== 'manual');
    });
    const stepDays = weekDays
      .map((wd) => trainee.logs[wd.iso]?.steps)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const avgSteps =
      stepDays.length > 0
        ? Math.round(stepDays.reduce((a, b) => a + b, 0) / stepDays.length).toLocaleString()
        : '—';
    const stepsGoal = actTargets.dailyStepsTarget ?? 8000;
    return {
      stats: [
        { label: 'אימונים', value: `${workoutsDone}/${actTargets.weeklyWorkoutsTarget}` },
        { label: 'הליכות / ריצות', value: `${cardioDone}/${actTargets.weeklyCardioTarget}` },
        { label: 'שינה ממוצעת', value: avgSleep },
        { label: 'צעדים ממוצע', value: avgSteps },
        { label: 'משקל נוכחי', value: String(trainee.currentWeight) },
        { label: 'משקל יעד', value: String(trainee.targetWeight) },
      ],
      report: (note: string) =>
        [
          `📊 *דו"ח סיכום שבועי SPOT - ${trainee.name}* (${todayIso})`,
          `• משקל נוכחי: ${trainee.currentWeight} ק"ג (יעד: ${trainee.targetWeight} ק"ג)`,
          `• אימונים השבוע: ${workoutsDone}/${actTargets.weeklyWorkoutsTarget}`,
          hasAutoSyncedWeek ? `• ממוצע צעדים יומי: ${avgSteps} (יעד: ${stepsGoal.toLocaleString()})` : '',
          `• הליכות/ריצות השבוע: ${cardioDone}/${actTargets.weeklyCardioTarget}`,
          `• ממוצע שעות שינה: ${avgSleep} שעות (יעד: ${actTargets.dailySleepTargetHours})`,
          latestMeasurement
            ? `• היקפים אחרונים: חזה ${latestMeasurement.chestCm || '—'} | בטן ${latestMeasurement.waistNavelCm || '—'} | זרוע ${latestMeasurement.armCm || '—'} | ירך ${latestMeasurement.thighCm || '—'} ס"מ`
            : '',
          `• הרגשה שבועית (1-5): אנרגיה ${energyLevel}/5 | שובע ${hungerLevel}/5 | איכות שינה ${sleepQuality}/5`,
          note ? `• הערת מתאמן: ${note}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
    };
  };

  const prevWeekAnchor = addDaysIso(selectedDate, -7);
  const nextWeekAnchor = addDaysIso(selectedDate, 7);
  const canPrevWeek = getWeekDaysAroundDate(prevWeekAnchor, todayIso).some((d) =>
    isDateActiveForTrainee(d.iso, trainee, todayIso)
  );
  const canNextWeek = getWeekDaysAroundDate(nextWeekAnchor, todayIso).some((d) =>
    isDateActiveForTrainee(d.iso, trainee, todayIso)
  );

  const dailyLog = trainee.logs[selectedDate] || {
    date: selectedDate,
    dayType: 'workout',
    waterCups: 0,
    waterGoal: 12,
    weightKg: trainee.currentWeight,
    meals: {},
  };

  // בדיקה האם היום הנבחר מוגדר כ"יום תשקיף" (Observation Day) או כיום חסום להזנה
  const isObservationDay =
    (trainee.observationDates || []).includes(selectedDate) ||
    Boolean(dailyLog.isObservationDay);
  const isBlockedDay = isDayBlockedForTrainee(selectedDate, trainee);
  const obsLockedToObservation = isTodayObservationRestricted(trainee, todayIso);
  const isWeightScheduled = isMetricScheduledForDate(trainee, 'weight', selectedDate);
  const isMeasurementsScheduled = isMetricScheduledForDate(
    trainee,
    'measurements',
    selectedDate
  );
  const isWeeklyCheckInScheduled = isMetricScheduledForDate(
    trainee,
    'weeklyCheckIn',
    selectedDate
  );

  const activeTemplate = !trainee.enableWorkoutRestSplit
    ? trainee.workoutTemplate
    : dailyLog.dayType === 'workout'
    ? trainee.workoutTemplate
    : trainee.restTemplate;

  const dailyTarget = sumMacros(activeTemplate.meals.map((m) => m.targets));
  const allLoggedItems: LoggedFoodItem[] = activeTemplate.meals.flatMap(
    (slot) => dailyLog.meals[slot.id]?.items || []
  );
  const dailyConsumed = sumMacros(allLoggedItems.map((i) => i.macros));

  const remainingCalories = dailyTarget.calories - dailyConsumed.calories;
  const calRatio = Math.min(
    1.15,
    dailyConsumed.calories / Math.max(1, dailyTarget.calories)
  );

  const isOverLimit =
    !isObservationDay &&
    dailyConsumed.calories >
      dailyTarget.calories * (1 + trainee.tolerancePercent / 100);

  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.72;
  const filledArc = isObservationDay
    ? arcLength * (dailyConsumed.calories > 0 ? 0.5 : 0)
    : Math.min(arcLength, arcLength * Math.min(1, calRatio));

  // Default slot for quick-add / FAB: on today, the slot whose time hint is
  // closest to now; otherwise (or without hints) the first unlogged slot.
  const pickDefaultMealSlot = (): MealTemplateSlot | undefined => {
    const firstUnlogged =
      activeTemplate.meals.find((m) => !(dailyLog.meals[m.id]?.items?.length > 0)) ||
      activeTemplate.meals[0];
    if (selectedDate !== todayIso) return firstUnlogged;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let best: { slot: MealTemplateSlot; d: number } | null = null;
    for (const m of activeTemplate.meals) {
      const hint = dailyLog.meals[m.id]?.mealTime || m.timeHint;
      const match = hint?.match(/^(\d{1,2}):(\d{2})/);
      if (!match) continue;
      const d = Math.abs(Number(match[1]) * 60 + Number(match[2]) - nowMin);
      if (!best || d < best.d) best = { slot: m, d };
    }
    return best?.slot || firstUnlogged;
  };

  const openMealDrawer = (slot: MealTemplateSlot, tab = 'hub') => {
    if (isBlockedDay) return;
    setDrawerReturnTarget(null);
    setActiveMealSlot(slot);
    setDrawerTab(tab);
  };

  const latestMeasurement =
    trainee.measurementsHistory?.[trainee.measurementsHistory.length - 1];
  const needsInitialMeasurements =
    isMeasurementsScheduled &&
    !trainee.onboarding?.measurementsCompleted &&
    !latestMeasurement;
  const loggedMealsCount = activeTemplate.meals.filter(
    (m) => (dailyLog.meals[m.id]?.items?.length || 0) > 0
  ).length;
  const findAdjacentActiveDate = (dir: -1 | 1): string | null => {
    for (let step = 1; step <= 90; step++) {
      const cand = addDaysIso(selectedDate, dir * step);
      if (isDateActiveForTrainee(cand, trainee, todayIso)) return cand;
    }
    return null;
  };
  const prevActiveDate = findAdjacentActiveDate(-1);
  const nextActiveDate = findAdjacentActiveDate(1);
  const stickyCalPct = isObservationDay
    ? dailyConsumed.calories > 0
      ? 50
      : 0
    : Math.min(100, Math.round((dailyConsumed.calories / Math.max(1, dailyTarget.calories)) * 100));

  return (
    <div
      style={{
        maxWidth: 460,
        margin: '0 auto',
        paddingBottom: 'calc(104px + var(--sa-bottom))',
        position: 'relative',
      }}
    >
      {mobileSection === 'journal' && showStickyCalBar && (
        <div className="spot-sticky-cal-bar">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'var(--card)',
              border: '1px solid var(--line)',
              borderRadius: 20,
              padding: '12px 14px',
              boxShadow: 'var(--glass-shadow)',
            }}
          >
            <span className="num-mono" style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
              {isObservationDay
                ? dailyConsumed.calories.toLocaleString()
                : Math.abs(remainingCalories).toLocaleString()}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
              {isObservationDay
                ? 'קק״ל ביום תשקיף'
                : remainingCalories >= 0
                ? 'קק״ל נותרו'
                : 'קק״ל מעל היעד'}
            </span>
            <div style={{ flex: 1, height: 6, borderRadius: 9, background: 'var(--surface-3)', overflow: 'hidden', minWidth: 36 }}>
              <div
                style={{
                  width: `${stickyCalPct}%`,
                  height: '100%',
                  background: isObservationDay
                    ? 'var(--macro-protein)'
                    : isOverLimit
                    ? 'var(--status-warn)'
                    : 'var(--accent)',
                  borderRadius: 9,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            {!isObservationDay && (
              <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                {dailyConsumed.calories.toLocaleString()}/{dailyTarget.calories.toLocaleString()}
              </bdi>
            )}
          </div>
        </div>
      )}
      {isCoachPreview && onExitCoachPreview && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            padding: '12px 16px',
            borderRadius: 24,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--card-shadow)',
            marginBottom: 14,
          }}
        >
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>תצוגת מאמן</span>
            <span style={{ fontSize: 16, fontWeight: 700 }}>צופה באפליקציה של {trainee.name}</span>
          </span>
          <button
            type="button"
            onClick={onExitCoachPreview}
            className="btn-volt"
            style={{ height: 44, padding: '0 18px', fontSize: 15, cursor: 'pointer', flex: 'none' }}
          >
            חזרה לדשבורד
          </button>
        </div>
      )}

      {(weekStripOpen || measureAlertOpen) && (
        <div
          aria-hidden="true"
          onClick={() => {
            setWeekStripOpen(false);
            setMeasureAlertOpen(false);
          }}
          style={{ position: 'fixed', inset: 0, zIndex: 3 }}
        />
      )}

      {/* Journal & metrics share the date bar + collapsible week drawer; profile has its own header */}
      {mobileSection !== 'profile' && (
        <>
      {/* Journal & metrics header + date bar + alert popover + collapsible week drawer */}
      {(() => {
        const now = new Date();
        const hour = now.getHours();
        const greeting =
          hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';
        const [sy, sm, sd] = selectedDate.split('-').map(Number);
        const dateObj = new Date(sy, (sm || 1) - 1, sd || 1);
        const weekdayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const dateLabel = `יום ${weekdayNames[dateObj.getDay()]}, ${sd} ב${HEBREW_MONTH_NAMES[(sm || 1) - 1]} ${sy}`;
        const firstName = (trainee.name || '').trim().split(/\s+/)[0] || trainee.name;

        return (
          <>
            {mobileSection === 'metrics' && (
              <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{dateLabel}</span>
                  <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>מדדים</h1>
                </div>
                {isMeasurementsScheduled && (
                  <GlassButton label="מדידת היקפים מודרכת" onClick={() => setMeasurementModalOpen(true)}>
                    <Ruler size={20} />
                  </GlassButton>
                )}
              </header>
            )}

            {/* Date row + alert & calendar buttons + collapsible glass week strip (01 / 02) */}
            <section
              aria-label="בחירת יום"
              style={{
                position: 'relative',
                zIndex: measureAlertOpen ? 12 : 5,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: mobileSection === 'journal' ? 10 : 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 38, gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                  <button
                    type="button"
                    aria-label="יום קודם"
                    disabled={!prevActiveDate}
                    onClick={() => {
                      if (prevActiveDate) setSelectedDate(prevActiveDate);
                    }}
                    style={{
                      width: 30,
                      height: 36,
                      borderRadius: 999,
                      border: 'none',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-2)',
                      cursor: prevActiveDate ? 'pointer' : 'not-allowed',
                      opacity: prevActiveDate ? 1 : 0.35,
                      flex: 'none',
                    }}
                  >
                    <ChevronRight size={17} />
                  </button>
                  <button
                    type="button"
                    aria-expanded={weekStripOpen}
                    aria-label="הצג את ימי השבוע"
                    onClick={() => {
                      setMeasureAlertOpen(false);
                      setWeekStripOpen((v) => !v);
                    }}
                    style={{
                      height: 36,
                      padding: '0 4px',
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 14.5,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <span>{dateLabel}</span>
                    <ChevronDown
                      size={14}
                      style={{
                        color: 'var(--text-2)',
                        transform: weekStripOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.18s ease',
                        flexShrink: 0,
                      }}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="יום הבא"
                    disabled={!nextActiveDate}
                    onClick={() => {
                      if (nextActiveDate) setSelectedDate(nextActiveDate);
                    }}
                    style={{
                      width: 30,
                      height: 36,
                      borderRadius: 999,
                      border: 'none',
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-2)',
                      cursor: nextActiveDate ? 'pointer' : 'not-allowed',
                      opacity: nextActiveDate ? 1 : 0.35,
                      flex: 'none',
                    }}
                  >
                    <ChevronLeft size={17} />
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                  {mobileSection === 'journal' && needsInitialMeasurements && (
                    <GlassButton
                      label="התראה: מדידת היקפים לא הושלמה"
                      size={38}
                      dot
                      aria-expanded={measureAlertOpen}
                      onClick={() => {
                        setWeekStripOpen(false);
                        setMeasureAlertOpen((v) => !v);
                      }}
                    >
                      <AlertTriangle size={17} />
                    </GlassButton>
                  )}
                  <GlassButton
                    label="פתח לוח שנה חודשי"
                    size={mobileSection === 'journal' ? 38 : 36}
                    onClick={() => {
                      setMeasureAlertOpen(false);
                      setWeekStripOpen(false);
                      const [y, m] = selectedDate.split('-').map(Number);
                      if (y && m) setCalendarCursor({ year: y, month: m - 1 });
                      setCalendarModalOpen(true);
                    }}
                  >
                    <CalendarDays size={16} />
                  </GlassButton>
                </div>
              </div>

              {mobileSection === 'journal' && needsInitialMeasurements && measureAlertOpen && (
                <div
                  role="dialog"
                  aria-label="מדידת היקפים ראשונית"
                  className="glass"
                  style={{
                    position: 'absolute',
                    top: 46,
                    left: 0,
                    zIndex: 15,
                    width: 270,
                    maxWidth: 'calc(100vw - 32px)',
                    borderRadius: 20,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
                    <Ruler size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    מדידת היקפים ראשונית
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                    טרם השלמת את המדידה. יש הדרכה מונפשת שלוקחת כ-3 דקות.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMeasureAlertOpen(false);
                      setMeasurementModalOpen(true);
                    }}
                    style={{
                      height: 40,
                      borderRadius: 999,
                      border: 'none',
                      background: 'var(--btn-primary)',
                      color: 'var(--btn-primary-text)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    השלם עכשיו
                  </button>
                </div>
              )}

        {weekStripOpen && (
          <div
            className="glass"
            style={{
              borderRadius: 22,
              padding: '8px 6px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <nav
              aria-label="ימי השבוע"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
            >
              {weekDays.map((d) => {
                const isSelected = d.iso === selectedDate;
                const isActive = isDateActiveForTrainee(d.iso, trainee, todayIso);
                const isObs =
                  (trainee.observationDates || []).includes(d.iso) ||
                  Boolean(trainee.logs[d.iso]?.isObservationDay);
                const isBlockedCell = isDayBlockedForTrainee(d.iso, trainee);
                const hasLog =
                  trainee.logs[d.iso] && Object.keys(trainee.logs[d.iso].meals || {}).length > 0;
                const circleBg = isSelected
                  ? isBlockedCell
                    ? 'var(--status-danger)'
                    : 'var(--text)'
                  : 'transparent';
                const circleColor = isSelected
                  ? isBlockedCell
                    ? '#ffffff'
                    : 'var(--bg)'
                  : isBlockedCell
                  ? 'var(--status-danger)'
                  : isActive
                  ? 'var(--text)'
                  : 'var(--text-3)';
                const circleRing = isSelected
                  ? 'inset 0 0 0 1.5px transparent'
                  : d.isToday
                  ? 'inset 0 0 0 1.5px var(--text-2)'
                  : isObs
                  ? 'inset 0 0 0 1.5px var(--macro-protein)'
                  : 'inset 0 0 0 1.5px transparent';

                return (
                  <button
                    key={d.iso}
                    type="button"
                    disabled={!isActive}
                    aria-pressed={isSelected}
                    aria-label={`${d.dayLetter} ${d.dayNumber}${d.isToday ? ', היום' : ''}${
                      isObs ? ', יום תשקיף' : ''
                    }${isBlockedCell ? ', חסום' : ''}`}
                    onClick={() => {
                      if (isActive) setSelectedDate(d.iso);
                    }}
                    style={{
                      height: 60,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 3,
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      fontFamily: 'inherit',
                      cursor: isActive ? 'pointer' : 'not-allowed',
                      opacity: isActive ? 1 : 0.45,
                    }}
                  >
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.dayLetter}</span>
                    <span
                      className="num-mono"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: isSelected || d.isToday ? 700 : 500,
                        background: circleBg,
                        color: circleColor,
                        boxShadow: circleRing,
                        textDecoration: isBlockedCell ? 'line-through' : 'none',
                        position: 'relative',
                      }}
                    >
                      {d.dayNumber}
                      {hasLog && (
                        <span
                          aria-hidden
                          style={{
                            position: 'absolute',
                            bottom: 3,
                            width: 4,
                            height: 4,
                            borderRadius: 9,
                            background: isSelected ? 'var(--accent)' : 'var(--accent)',
                          }}
                        />
                      )}
                    </span>
                  </button>
                );
              })}
            </nav>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
              <button
                type="button"
                aria-label="שבוע קודם"
                disabled={!canPrevWeek}
                onClick={() => {
                  const candidates = getWeekDaysAroundDate(prevWeekAnchor, todayIso).filter((d) =>
                    isDateActiveForTrainee(d.iso, trainee, todayIso)
                  );
                  if (candidates.length > 0) {
                    setSelectedDate(candidates[candidates.length - 1].iso);
                  }
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-2)',
                  cursor: canPrevWeek ? 'pointer' : 'not-allowed',
                  opacity: canPrevWeek ? 1 : 0.35,
                }}
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                disabled={selectedDate === todayIso}
                onClick={() => setSelectedDate(todayIso)}
                style={{
                  height: 32,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: 'none',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: selectedDate === todayIso ? 'default' : 'pointer',
                  opacity: selectedDate === todayIso ? 0.5 : 1,
                }}
              >
                חזור להיום
              </button>
              <button
                type="button"
                aria-label="שבוע הבא"
                disabled={!canNextWeek}
                onClick={() => {
                  const candidates = getWeekDaysAroundDate(nextWeekAnchor, todayIso).filter((d) =>
                    isDateActiveForTrainee(d.iso, trainee, todayIso)
                  );
                  if (candidates.length > 0) {
                    setSelectedDate(candidates[0].iso);
                  }
                }}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: 'none',
                  background: 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-2)',
                  cursor: canNextWeek ? 'pointer' : 'not-allowed',
                  opacity: canNextWeek ? 1 : 0.35,
                }}
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}
            </section>

            {mobileSection === 'journal' && (
              <header style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {greeting}, {firstName}
                </h1>
                {(() => {
                  const visibleCoachAlerts = (trainee.coachMealAlerts || []).filter(
                    (a) =>
                      !a.dismissed &&
                      !dismissedCoachAlertIds.includes(a.id) &&
                      (sessionPinnedCoachAlertIds.includes(a.id) ||
                        !a.shownOnJournalVisit ||
                        isCoachPreview)
                  );
                  if (visibleCoachAlerts.length === 0) return null;
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {visibleCoachAlerts.slice(0, 2).map((alert) => (
                        <div
                          key={alert.id}
                          className="glass"
                          role="status"
                          style={{
                            borderRadius: 22,
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            borderColor: 'var(--accent)',
                          }}
                        >
                          <Sparkles size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                              המאמן {alert.coachName} ערך לך את {alert.mealSlotName}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                              {alert.summaryText}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setDismissedCoachAlertIds((prev) => [...prev, alert.id]);
                              if (actorRole === 'trainee' && !isCoachPreview) {
                                void onMarkCoachMealEditsRead?.({
                                  mode: 'banner',
                                  alertId: alert.id,
                                  date: alert.date,
                                  mealSlotId: alert.mealSlotId,
                                });
                              }
                              setSelectedDate(alert.date);
                              const targetSlot = findTraineeMealSlotById(
                                trainee,
                                alert.mealSlotId
                              );
                              if (targetSlot) {
                                openMealDrawer(targetSlot, 'meal-items');
                              }
                            }}
                            className="btn-surface"
                            style={{
                              height: 36,
                              padding: '0 14px',
                              fontSize: 13,
                              fontWeight: 700,
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            צפה
                          </button>
                          <button
                            type="button"
                            aria-label="סגור התראת מאמן"
                            onClick={() => {
                              setDismissedCoachAlertIds((prev) => [...prev, alert.id]);
                              if (actorRole === 'trainee' && !isCoachPreview) {
                                void onMarkCoachMealEditsRead?.({
                                  mode: 'banner',
                                  alertId: alert.id,
                                  date: alert.date,
                                  mealSlotId: alert.mealSlotId,
                                });
                              }
                            }}
                            className="hit-44"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 999,
                              border: 0,
                              background: 'transparent',
                              color: 'var(--text-2)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </header>
            )}
          </>
        );
      })()}

      {/* Workout / rest day switch (kept outside the journal tabs so it stays accessible from both Meals & Activity) */}
      {Boolean(trainee.enableWorkoutRestSplit) && (
        <div
          role="radiogroup"
          aria-label="סוג יום"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>סוג היום</span>
          <span style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'var(--surface-2)' }}>
            {(
              [
                { id: 'workout' as DayType, label: 'יום אימון' },
                { id: 'rest' as DayType, label: 'מנוחה' },
              ] as const
            ).map((opt) => {
              const on = (dailyLog.dayType === 'rest' ? 'rest' : 'workout') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={isBlockedDay}
                  onClick={() => !isBlockedDay && onUpdateDayType(trainee.id, selectedDate, opt.id)}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: 'none',
                    background: on ? 'var(--btn-primary)' : 'transparent',
                    color: on ? 'var(--btn-primary-text)' : 'var(--text-2)',
                    fontSize: 13,
                    fontWeight: on ? 700 : 500,
                    fontFamily: 'inherit',
                    cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                    opacity: isBlockedDay ? 0.45 : 1,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </span>
        </div>
      )}

        </>
      )}

      <AnimatePresence mode="wait">
        {mobileSection === 'journal' ? (
          <motion.div
            key="journal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {/* באנר הסבר אם היום הנבחר חסום להזנה */}
            {isBlockedDay && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.42)',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Ban size={18} color="var(--danger-text)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 800, color: 'var(--danger-text)' }}>
                    יום חסום להזנה
                  </div>
                  <div style={{ color: 'var(--text-2)' }}>
                    היום הנבחר מוגדר כיום חסום — לא ניתן להזין או לערוך ארוחות, פעילות, מים או מדדים.
                  </div>
                </div>
              </div>
            )}

            {/* באנר הסבר אם היום הוא יום תשקיף */}
            {isObservationDay && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 14,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-2)',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Eye size={18} color="var(--text-2)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                    יום תשקיף (ללא מטרת יעד קלורי)
                  </div>
                  <div style={{ color: 'var(--text-2)' }}>
                    תיעוד חופשי ללא חישוב חריגה מהיעד.
                  </div>
                  {obsLockedToObservation && (
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--info-text)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Lock size={11} />
                      <span>נעילת יום תשקיף פעילה — היום ניתן לעבור רק לימי תשקיף</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Calorie ring + macros (01) */}
            <section
              ref={calorieCardRef}
              aria-label="סיכום קלורי"
              style={{
                background: 'var(--card)',
                border: `1px solid ${isObservationDay ? 'var(--surface-2)' : 'var(--line)'}`,
                borderRadius: 28,
                padding: 20,
                marginBottom: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <ProgressRing
                  value={
                    isObservationDay
                      ? dailyConsumed.calories > 0
                        ? 0.5
                        : 0
                      : dailyConsumed.calories
                  }
                  max={isObservationDay ? 1 : dailyTarget.calories}
                  color={
                    isObservationDay
                      ? 'var(--macro-protein)'
                      : isOverLimit
                      ? 'var(--status-warn)'
                      : 'var(--accent)'
                  }
                  ariaLabel={
                    isObservationDay
                      ? `נאכלו ${dailyConsumed.calories} קלוריות ביום תשקיף`
                      : `נאכלו ${dailyConsumed.calories} מתוך ${dailyTarget.calories} קלוריות`
                  }
                >
                  <span className="num-mono" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>
                    {isObservationDay
                      ? dailyConsumed.calories.toLocaleString()
                      : Math.abs(remainingCalories).toLocaleString()}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      marginTop: 4,
                      color: isObservationDay
                        ? 'var(--macro-protein)'
                        : isOverLimit
                        ? 'var(--status-warn)'
                        : 'var(--text-2)',
                    }}
                  >
                    {isObservationDay
                      ? 'קק״ל ביום תשקיף'
                      : remainingCalories >= 0
                      ? 'קק״ל נותרו'
                      : 'קק״ל מעל היעד'}
                  </span>
                </ProgressRing>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                  {[
                    { label: 'נאכל', value: dailyConsumed.calories.toLocaleString() },
                    {
                      label: isObservationDay ? 'מצב יום' : 'יעד יומי',
                      value: isObservationDay ? 'תשקיף' : dailyTarget.calories.toLocaleString(),
                    },
                    { label: 'ארוחות', value: `${loggedMealsCount}/${activeTemplate.meals.length}` },
                  ].map((row, idx) => (
                    <React.Fragment key={row.label}>
                      {idx > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{row.label}</span>
                        <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 18, fontWeight: 600 }}>
                          {row.value}
                        </bdi>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                {[
                  { label: 'חלבון', consumed: dailyConsumed.protein, target: dailyTarget.protein, color: 'var(--macro-protein)' },
                  { label: 'פחמימות', consumed: dailyConsumed.carbs, target: dailyTarget.carbs, color: 'var(--macro-carbs)' },
                  { label: 'שומן', consumed: dailyConsumed.fat, target: dailyTarget.fat, color: 'var(--macro-fat)' },
                ].map((m) => {
                  const pct = isObservationDay
                    ? m.consumed > 0
                      ? 50
                      : 0
                    : Math.min(100, Math.round((m.consumed / Math.max(1, m.target)) * 100));
                  return (
                    <div key={m.label} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 9, background: m.color, flex: 'none' }} />
                        <span style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{m.label}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 9, background: 'var(--surface-3)', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: m.color,
                            borderRadius: 9,
                            transition: 'width .4s ease',
                          }}
                        />
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <bdi
                          dir="ltr"
                          className="num-mono ltr-num"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'baseline',
                            gap: 3,
                            fontSize: 14,
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <span>{Math.round(m.consumed)}</span>
                          {!isObservationDay && (
                            <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                              / {Math.round(m.target)}
                            </span>
                          )}
                          <span dir="rtl" style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                            ג׳
                          </span>
                        </bdi>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quick add: 4 compact 54x54 glass buttons (01) */}
            {!isBlockedDay && activeTemplate.meals.length > 0 && (() => {
              const quickSlot = pickDefaultMealSlot();
              if (!quickSlot) return null;
              const quickItems: { id: string; label: string; icon: React.ReactNode; tab: string }[] = [
                { id: 'photo', label: 'צילום AI', icon: <Camera size={22} strokeWidth={1.8} />, tab: 'ai-photo' },
                { id: 'text', label: 'במילים', icon: <Mic size={22} strokeWidth={1.8} />, tab: 'ai-text' },
                { id: 'barcode', label: 'ברקוד', icon: <Barcode size={22} strokeWidth={1.8} />, tab: 'barcode' },
                { id: 'saved', label: 'שמורות', icon: <Bookmark size={22} strokeWidth={1.8} />, tab: 'saved-meals' },
              ];
              return (
                <section aria-label="הוספה מהירה" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    הוספה מהירה · {quickSlot.name}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {quickItems.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => openMealDrawer(quickSlot, it.tab)}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: 'var(--text)',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span
                          className="glass"
                          style={{
                            width: 54,
                            height: 54,
                            borderRadius: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {it.icon}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{it.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Segmented switch: Meals vs Activity (01 / 03 / 04) */}
            <div
              role="tablist"
              aria-label="תצוגת יומן"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 4,
                padding: 4,
                borderRadius: 999,
                background: 'var(--surface-2)',
                marginBottom: 18,
              }}
            >
              {(
                [
                  { id: 'meals' as const, label: `ארוחות · ${activeTemplate.meals.length}` },
                  { id: 'activity' as const, label: 'פעילות' },
                ] as const
              ).map((tab) => {
                const selected = journalSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setJournalSubTab(tab.id)}
                    style={{
                      height: 40,
                      borderRadius: 999,
                      border: 'none',
                      fontFamily: 'inherit',
                      fontSize: 14,
                      fontWeight: selected ? 700 : 500,
                      background: selected ? 'var(--card)' : 'transparent',
                      color: selected ? 'var(--text)' : 'var(--text-2)',
                      boxShadow: selected ? '0 1px 4px rgba(0,0,0,.12)' : 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.16s ease, color 0.16s ease',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Activity Tab (04): weekly orange rings + unified card + Steps Modal trigger */}
            {journalSubTab === 'activity' && (() => {
              const actTargets = trainee.activityTargets || {
                weeklyWorkoutsTarget: 4,
                workoutTypes: ['אימון כוח A', 'אימון כוח B', 'Full Body'],
                weeklyCardioTarget: 3,
                cardioMode: 'both' as const,
                cardioTargetMinutes: 35,
                dailySleepTargetHours: 7.5,
              };
              const workoutsThisWeek = weekDays.filter((wd) => trainee.logs[wd.iso]?.workoutLog?.completed).length;
              const cardioThisWeek = weekDays.filter((wd) => trainee.logs[wd.iso]?.cardioLog?.completed).length;
              const sleepDaysMet = weekDays.filter(
                (wd) => (trainee.logs[wd.iso]?.sleepHours ?? 0) >= actTargets.dailySleepTargetHours
              ).length;
              const todayWorkout = dailyLog.workoutLog;
              const todayCardio = dailyLog.cardioLog;
              const todaySleep = dailyLog.sleepHours;
              const dailyStepsTarget = actTargets.dailyStepsTarget ?? 8000;
              const hasSyncedSteps =
                isNativeAndroidApp() || Boolean(dailyLog.stepsSource && dailyLog.stepsSource !== 'manual');
              const currentSteps = dailyLog.steps ?? 0;

              const rings: { key: string; label: string; value: string; current: number; target: number }[] = [
                { key: 'w', label: 'אימונים', value: `${workoutsThisWeek}/${actTargets.weeklyWorkoutsTarget}`, current: workoutsThisWeek, target: actTargets.weeklyWorkoutsTarget },
                { key: 'c', label: 'הליכה / ריצה', value: `${cardioThisWeek}/${actTargets.weeklyCardioTarget}`, current: cardioThisWeek, target: actTargets.weeklyCardioTarget },
                ...(hasSyncedSteps || currentSteps > 0
                  ? [{ key: 's', label: 'צעדים', value: `${Math.min(100, Math.round((currentSteps / Math.max(1, dailyStepsTarget)) * 100))}%`, current: currentSteps, target: dailyStepsTarget }]
                  : []),
                { key: 'z', label: 'שינה', value: `${sleepDaysMet}/7`, current: sleepDaysMet, target: 7 },
              ];

              const workoutTypes = actTargets.workoutTypes.length > 0 ? actTargets.workoutTypes : ['אימון כוח A', 'אימון כוח B', 'Full Body'];
              const cardioOptions = [
                { label: `הליכה (${actTargets.cardioTargetMinutes} דק׳)`, mode: 'walk' as const, mins: actTargets.cardioTargetMinutes },
                { label: 'הליכה מהירה (45 דק׳)', mode: 'walk' as const, mins: 45 },
                { label: 'ריצה (25 דק׳)', mode: 'run' as const, mins: 25 },
                { label: 'ריצה (40 דק׳)', mode: 'run' as const, mins: 40 },
              ];
              const stepSleep = (delta: number) => {
                if (isBlockedDay) return;
                const base = todaySleep ?? actTargets.dailySleepTargetHours;
                const next = Math.min(14, Math.max(0, Math.round((base + delta) * 2) / 2));
                onUpdateDailyActivity(trainee.id, selectedDate, { sleepHours: next });
              };
              const stepsSubtitle =
                currentSteps > 0 ? (
                  <>
                    <bdi dir="ltr" className="num-mono ltr-num">
                      {currentSteps.toLocaleString()} / {dailyStepsTarget.toLocaleString()}
                    </bdi>{' '}
                    צעדים
                  </>
                ) : hasSyncedSteps ? (
                  'סנכרון צעדים'
                ) : (
                  'חבר מד צעדים'
                );

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <section
                    aria-label="ביצוע שבועי"
                    style={{ display: 'grid', gridTemplateColumns: `repeat(${rings.length}, minmax(0, 1fr))`, gap: 8 }}
                  >
                    {rings.map((r) => (
                      <div
                        key={r.key}
                        style={{
                          background: 'var(--card)',
                          border: '1px solid var(--line)',
                          borderRadius: 20,
                          padding: '12px 6px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: 'var(--card-shadow)',
                        }}
                      >
                        <div style={{ position: 'relative', width: 48, height: 48, display: 'grid', placeItems: 'center' }}>
                          <CompactMiniRing current={r.current} target={r.target} color="var(--accent)" size={48} />
                          <bdi dir="ltr" className="num-mono ltr-num" style={{ position: 'absolute', fontSize: 13, fontWeight: 700 }}>
                            {r.value}
                          </bdi>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>{r.label}</span>
                      </div>
                    ))}
                  </section>

                  <div
                    style={{
                      background: 'var(--card)',
                      border: '1px solid var(--line)',
                      borderRadius: 24,
                      padding: '6px 16px',
                      boxShadow: 'var(--card-shadow)',
                    }}
                  >
                    {/* אימון היום */}
                    <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>אימון היום</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          השבוע: <bdi dir="ltr" className="num-mono ltr-num">{workoutsThisWeek}</bdi> אימונים
                        </span>
                      </div>
                      <div role="radiogroup" aria-label="סוג אימון" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {workoutTypes.map((wType) => {
                          const isSelected = Boolean(todayWorkout?.completed && todayWorkout.workoutType === wType);
                          return (
                            <button
                              key={wType}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              disabled={isBlockedDay}
                              style={{
                                height: 38,
                                padding: '0 12px',
                                borderRadius: 999,
                                fontFamily: 'inherit',
                                fontSize: 13,
                                fontWeight: isSelected ? 700 : 400,
                                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                                opacity: isBlockedDay ? 0.45 : 1,
                                border: isSelected ? 'none' : '1px solid var(--line-2)',
                                background: isSelected ? 'var(--btn-primary)' : 'transparent',
                                color: isSelected ? 'var(--btn-primary-text)' : 'var(--text)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                              }}
                              onClick={() => {
                                if (isBlockedDay) return;
                                const nextCompleted = !isSelected;
                                onUpdateDailyActivity(trainee.id, selectedDate, {
                                  workoutLog: isSelected
                                    ? { completed: false }
                                    : { completed: true, workoutType: wType, durationMinutes: 50 },
                                });
                                if (nextCompleted && Boolean(trainee.enableWorkoutRestSplit)) {
                                  onUpdateDayType(trainee.id, selectedDate, 'workout');
                                }
                              }}
                            >
                              {isSelected && <Check size={14} strokeWidth={2.6} />}
                              {wType}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* הליכה / ריצה */}
                    <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>הליכה / ריצה</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          יעד <bdi dir="ltr" className="num-mono ltr-num">{actTargets.cardioTargetMinutes}</bdi> דק׳ · השבוע{' '}
                          <bdi dir="ltr" className="num-mono ltr-num">{cardioThisWeek}/{actTargets.weeklyCardioTarget}</bdi>
                        </span>
                      </div>
                      <div role="radiogroup" aria-label="סוג פעילות אירובית" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                        {cardioOptions.map((cOpt) => {
                          const isSelected = Boolean(todayCardio?.completed && todayCardio.label === cOpt.label);
                          return (
                            <button
                              key={cOpt.label}
                              type="button"
                              role="radio"
                              aria-checked={isSelected}
                              disabled={isBlockedDay}
                              style={{
                                height: 40,
                                padding: '0 10px',
                                borderRadius: 14,
                                fontFamily: 'inherit',
                                fontSize: 13,
                                fontWeight: isSelected ? 700 : 400,
                                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                                opacity: isBlockedDay ? 0.45 : 1,
                                border: isSelected ? 'none' : '1px solid var(--line-2)',
                                background: isSelected ? 'var(--btn-primary)' : 'transparent',
                                color: isSelected ? 'var(--btn-primary-text)' : 'var(--text)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 5,
                              }}
                              onClick={() => {
                                if (isBlockedDay) return;
                                onUpdateDailyActivity(trainee.id, selectedDate, {
                                  cardioLog: isSelected
                                    ? { completed: false }
                                    : { completed: true, mode: cOpt.mode, label: cOpt.label, durationMinutes: cOpt.mins },
                                });
                              }}
                            >
                              {isSelected && <Check size={14} strokeWidth={2.6} />}
                              {cOpt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* שינה */}
                    <div style={{ padding: '10px 0', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>שינה</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          כמה שעות ישנת? (יעד <bdi dir="ltr" className="num-mono ltr-num">{actTargets.dailySleepTargetHours}</bdi>)
                        </span>
                      </span>
                      <span
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 3, borderRadius: 999, background: 'var(--surface-2)', flex: 'none' }}
                      >
                        <button
                          type="button"
                          aria-label="פחות שעות שינה"
                          disabled={isBlockedDay}
                          onClick={() => stepSleep(-0.5)}
                          style={{ width: 36, height: 36, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isBlockedDay ? 'not-allowed' : 'pointer', opacity: isBlockedDay ? 0.45 : 1 }}
                        >
                          <Minus size={14} strokeWidth={2.4} />
                        </button>
                        <bdi dir="ltr" className="num-mono ltr-num" style={{ minWidth: 44, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
                          {todaySleep ?? '—'}
                        </bdi>
                        <button
                          type="button"
                          aria-label="יותר שעות שינה"
                          disabled={isBlockedDay}
                          onClick={() => stepSleep(0.5)}
                          style={{ width: 36, height: 36, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isBlockedDay ? 'not-allowed' : 'pointer', opacity: isBlockedDay ? 0.45 : 1 }}
                        >
                          <Plus size={14} strokeWidth={2.4} />
                        </button>
                      </span>
                    </div>

                    {/* מד צעדים (לחיצה פותחת מודאל מלא עם Health Connect, סנכרון ועריכה ידנית) */}
                    <button
                      type="button"
                      onClick={() => setStepsModalOpen(true)}
                      style={{
                        width: '100%',
                        padding: '14px 0',
                        borderTop: '1px solid var(--line)',
                        borderBottom: 'none',
                        borderInline: 'none',
                        background: 'transparent',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600 }}>מד צעדים</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                        <span>{stepsSubtitle}</span>
                        <ChevronLeft size={14} />
                      </span>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Meals Tab (01 / 03): Timeline header + compact meal cards with expandable full item list */}
            {journalSubTab === 'meals' && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>ציר זמן ארוחות</h2>
                    {activeTemplate.meals.length > 0 && (() => {
                      const answeredCount = (trainee.savedMeals || []).filter(
                        (m) => m.coachQuestion?.status === 'answered'
                      ).length;
                      const savedCount = trainee.savedMeals?.length || 0;
                      return (
                        <button
                          type="button"
                          onClick={() => openMealDrawer(activeTemplate.meals[0], 'saved-meals')}
                          style={{
                            height: 34,
                            padding: '0 12px',
                            borderRadius: 999,
                            border: answeredCount > 0 ? '1px solid var(--accent-soft)' : 'none',
                            background: 'var(--surface-2)',
                            color: answeredCount > 0 ? 'var(--accent-volt)' : 'var(--text)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Bookmark size={14} />
                          <span>
                            הארוחות והכלים שלי{savedCount > 0 ? <> · <span className="num-mono">{savedCount}</span></> : null}
                          </span>
                        </button>
                      );
                    })()}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {isObservationDay
                      ? 'יום תשקיף (תיעוד חופשי ללא יעד קלורי)'
                      : `תפריט: ${activeTemplate.name} · ${dailyTarget.calories.toLocaleString()} קל׳`}
                  </span>
                </div>

                {/* רשימת כרטיסי הארוחות */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {activeTemplate.meals.map((slot, idx) => {
                    const entry = dailyLog.meals[slot.id];
                    const loggedItems = entry?.items || [];
                    const mealMacros = sumMacros(loggedItems.map((i) => i.macros));
                    const hasItems = loggedItems.length > 0;
                    const photoThumb = resolveMealPhotos(entry)[0];
                    const isExpanded = Boolean(expandedMealIds[slot.id]);
                    const itemSummaryText = hasItems
                      ? `${loggedItems.length} ${loggedItems.length === 1 ? 'פריט' : 'פריטים'} · ${loggedItems.map((it) => it.name).join(', ')}`
                      : 'טרם הוזנו פריטים';
                    const slotMacrosList = [
                      { k: 'ח׳', v: mealMacros.protein, t: slot.targets.protein, c: 'var(--macro-protein)' },
                      { k: 'פ׳', v: mealMacros.carbs, t: slot.targets.carbs, c: 'var(--macro-carbs)' },
                      { k: 'ש׳', v: mealMacros.fat, t: slot.targets.fat, c: 'var(--macro-fat)' },
                    ];

                    return (
                      <article
                        key={slot.id}
                        className="pro-card"
                        onClick={(e) => {
                          if (!hasItems || isBlockedDay) return;
                          if (
                            (e.target as HTMLElement).closest(
                              'button, input, a, select, label'
                            )
                          ) {
                            return;
                          }
                          openMealDrawer(slot, 'meal-items');
                        }}
                        style={{
                          padding: 14,
                          borderRadius: 24,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          cursor: hasItems && !isBlockedDay ? 'pointer' : 'default',
                          borderColor:
                            hasItems && isObservationDay
                              ? 'var(--surface-2)'
                              : 'var(--line)',
                        }}
                      >
                        {/* Row 1: Photo/Placeholder + Title & Summary + Calories */}
                        <button
                          type="button"
                          disabled={isBlockedDay}
                          onClick={(e) => {
                            e.stopPropagation();
                            openMealDrawer(slot, hasItems ? 'meal-items' : 'hub');
                          }}
                          style={{
                            width: '100%',
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            color: 'inherit',
                            fontFamily: 'inherit',
                            textAlign: 'start',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {photoThumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photoThumb}
                              alt={`תמונת ${slot.name}`}
                              style={{
                                width: 58,
                                height: 58,
                                borderRadius: 16,
                                objectFit: 'cover',
                                flex: 'none',
                                display: 'block',
                              }}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              style={{
                                width: 58,
                                height: 58,
                                borderRadius: 16,
                                background: 'var(--surface-2)',
                                border: '1px solid var(--line-2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--text-3)',
                                flex: 'none',
                              }}
                            >
                              <Camera size={22} strokeWidth={1.8} />
                            </span>
                          )}
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="num-mono" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                              <span
                                style={{
                                  fontSize: 16,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {slot.name}
                              </span>
                              {entry?.coachEditState?.unreadBadges && (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    background: 'var(--sel-bg)',
                                    color: 'var(--sel-text)',
                                    border: '1px solid var(--sel-border)',
                                    flexShrink: 0,
                                  }}
                                >
                                  נערך ע״י {entry.coachEditState.lastCoachName}
                                </span>
                              )}
                            </span>
                            <span
                              style={{
                                fontSize: 12,
                                color: 'var(--text-2)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {itemSummaryText}
                            </span>
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flex: 'none' }}>
                            <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
                              {mealMacros.calories}
                            </bdi>
                            <span className="num-mono" style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                              {!isObservationDay ? (
                                <>
                                  מתוך{' '}
                                  <bdi dir="ltr" className="num-mono ltr-num">
                                    {slot.targets.calories}
                                  </bdi>{' '}
                                  קק״ל
                                </>
                              ) : (
                                'קק״ל'
                              )}
                            </span>
                          </span>
                        </button>

                        {/* Row 2: 3-column macro progress bars */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                          {slotMacrosList.map((mc) => {
                            const barPct = isObservationDay
                              ? hasItems && mc.v > 0
                                ? 50
                                : 0
                              : Math.min(100, Math.round((mc.v / Math.max(1, mc.t)) * 100));
                            return (
                              <div key={mc.k} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-2)' }}>
                                  <span>{mc.k}</span>
                                  <span dir="ltr" className="num-mono">
                                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{mc.v}</span>
                                    {!isObservationDay ? `/${mc.t}g` : 'g'}
                                  </span>
                                </span>
                                <div style={{ height: 4, borderRadius: 9, background: 'var(--surface-3)', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${barPct}%`,
                                      height: '100%',
                                      borderRadius: 9,
                                      background: mc.c,
                                      transition: 'width 0.35s ease',
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Optional expandable full item list (User choice A2) */}
                        {hasItems && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button
                              type="button"
                              aria-expanded={isExpanded}
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedMealIds((prev) => ({
                                  ...prev,
                                  [slot.id]: !prev[slot.id],
                                }));
                              }}
                              style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                borderRadius: 12,
                                background: 'var(--surface-2)',
                                border: '1px solid var(--fill-1)',
                                color: 'var(--text-2)',
                                fontSize: 12,
                                fontWeight: 600,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                              }}
                            >
                              <span>
                                {isExpanded ? 'הסתר פירוט פריטים' : `פירוט פריטים (${loggedItems.length})`}
                              </span>
                              <ChevronDown
                                size={14}
                                style={{
                                  transform: isExpanded ? 'rotate(180deg)' : 'none',
                                  transition: 'transform 0.18s ease',
                                }}
                              />
                            </button>

                            {isExpanded && (
                              <div
                                style={{
                                  background: 'var(--surface-2)',
                                  borderRadius: 14,
                                  padding: '4px 12px',
                                  border: '1px solid var(--fill-1)',
                                }}
                              >
                                {entry?.photoNote && (
                                  <div
                                    style={{
                                      padding: '6px 0',
                                      borderBottom: '1px solid var(--line)',
                                      fontSize: 12,
                                      color: 'var(--text-2)',
                                    }}
                                  >
                                    {entry.photoNote}
                                  </div>
                                )}
                                {loggedItems.map((item, i) => {
                                  const isComposite = hasCompositeComponents(item);
                                  const isDishExpanded = Boolean(expandedDishIds[item.id]);
                                  return (
                                  <div
                                    key={item.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isBlockedDay) openMealDrawer(slot, 'meal-items');
                                    }}
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: 4,
                                      padding: '7px 0',
                                      cursor: isBlockedDay ? 'default' : 'pointer',
                                      borderBottom: i < loggedItems.length - 1 ? '1px solid var(--line)' : 'none',
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                      }}
                                    >
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            flexWrap: 'wrap',
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: 13,
                                              fontWeight: 600,
                                              color: 'var(--text)',
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                            }}
                                          >
                                            {item.name
                                              .replace(/&#x27;|&#39;|&apos;/gi, "'")
                                              .replace(/&quot;/gi, '"')
                                              .replace(/&amp;/gi, '&')}
                                          </span>
                                          {item.coachBadge && (
                                            <span
                                              style={{
                                                fontSize: 10.5,
                                                fontWeight: 800,
                                                padding: '1px 6px',
                                                borderRadius: 999,
                                                background:
                                                  item.coachBadge === 'new'
                                                    ? 'rgba(34, 197, 94, 0.16)'
                                                    : 'var(--sel-bg)',
                                                color:
                                                  item.coachBadge === 'new'
                                                    ? 'var(--ok-text)'
                                                    : 'var(--sel-text)',
                                                flexShrink: 0,
                                              }}
                                            >
                                              {item.coachBadge === 'new' ? 'חדש' : 'נערך'}
                                            </span>
                                          )}
                                          {isComposite && (
                                            <button
                                              type="button"
                                              aria-expanded={isDishExpanded}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedDishIds((prev) => ({
                                                  ...prev,
                                                  [item.id]: !prev[item.id],
                                                }));
                                              }}
                                              style={{
                                                border: '1px solid var(--line)',
                                                background: 'var(--surface-2)',
                                                color: 'var(--text-2)',
                                                borderRadius: 999,
                                                padding: '1px 7px',
                                                fontSize: 11,
                                                fontWeight: 700,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 3,
                                                cursor: 'pointer',
                                                flexShrink: 0,
                                              }}
                                            >
                                              <Layers size={10} />
                                              <span>{item.components!.length} מרכיבים</span>
                                              {isDishExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                                            </button>
                                          )}
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                                          {item.unitLabel} · ח׳ {item.macros.protein}g · פ׳ {item.macros.carbs}g · ש׳ {item.macros.fat}g
                                        </div>
                                      </div>
                                      <div
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: 6,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {!isBlockedDay && onUpdateItemTime ? (
                                          <ItemTimePill
                                            value={item.itemTime}
                                            fallbackTime={entry?.mealTime || slot.timeHint || '12:00'}
                                            placeholderLabel={entry?.mealTime || slot.timeHint || '12:00'}
                                            ariaLabel={`שינוי שעה עבור ${item.name}`}
                                            clearAriaLabel={`אפס שעה עבור ${item.name}`}
                                            height={24}
                                            onChange={(val) =>
                                              onUpdateItemTime(
                                                trainee.id,
                                                selectedDate,
                                                slot.id,
                                                item.id,
                                                normalizeHhMmTime(val) || ''
                                              )
                                            }
                                          />
                                        ) : item.itemTime ? (
                                          <span dir="ltr" className="num-mono ltr-num" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                                            {item.itemTime}
                                          </span>
                                        ) : null}
                                        <div
                                          className="num-mono"
                                          style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}
                                        >
                                          {item.macros.calories}{' '}
                                          <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>קק״ל</span>
                                        </div>
                                      </div>
                                    </div>
                                    {isComposite && isDishExpanded && (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                          paddingInlineStart: 12,
                                          borderInlineStart: '2px solid var(--line-2)',
                                          display: 'flex',
                                          flexDirection: 'column',
                                          gap: 3,
                                          marginTop: 2,
                                        }}
                                      >
                                        {item.components!.map((comp) => (
                                          <div
                                            key={comp.id}
                                            style={{
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              fontSize: 11.5,
                                              color: 'var(--text-2)',
                                              gap: 8,
                                            }}
                                          >
                                            <span>
                                              {comp.name} ({comp.grams % 1 === 0 ? Math.round(comp.grams) : comp.grams}g)
                                              {comp.spiceDetails && comp.spiceDetails.length > 0
                                                ? ` · ${comp.spiceDetails.join(', ')}`
                                                : ''}
                                            </span>
                                            <span className="num-mono" style={{ flexShrink: 0 }}>
                                              {comp.macros.calories} קק״ל
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {entry?.coachFeedback && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 10,
                              padding: '10px 12px',
                              borderRadius: 14,
                              background: 'var(--fill-1)',
                              border: '1px solid var(--line-2)',
                            }}
                          >
                            <MessageSquare
                              size={15}
                              color="currentColor"
                              style={{ marginTop: 2, flexShrink: 0 }}
                            />
                            <div style={{ fontSize: 12 }}>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: 'var(--accent-volt)',
                                  marginLeft: 6,
                                }}
                              >
                                {entry.coachFeedbackAuthor
                                  ? `${entry.coachFeedbackAuthor}:`
                                  : 'הערת מאמן:'}
                              </span>
                              <span style={{ color: 'var(--text-primary)' }}>
                                {entry.coachFeedback}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Row 3: Time pill + 2 circular glass shortcuts + הצג / הזן ארוחה */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {(entry?.mealTime || slot.timeHint || onUpdateMealTime) && (
                            <button
                              type="button"
                              disabled={isBlockedDay || !onUpdateMealTime}
                              aria-label={`שינוי שעת ${slot.name}`}
                              title={isBlockedDay ? 'יום חסום להזנה' : 'שינוי שעת הארוחה'}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isBlockedDay || !onUpdateMealTime) return;
                                const baseTime = entry?.mealTime || slot.timeHint || '12:00';
                                const timeMatch = baseTime.match(/^(\d{1,2}):(\d{2})$/);
                                setDraftMealTime(
                                  timeMatch
                                    ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
                                    : '12:00'
                                );
                                setTimeEditSlot(slot);
                              }}
                              style={{
                                height: 36,
                                padding: '0 10px',
                                borderRadius: 999,
                                border: 'none',
                                background: 'var(--surface-2)',
                                color: 'var(--text)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 12,
                                fontFamily: 'inherit',
                                opacity: isBlockedDay ? 0.5 : 1,
                                cursor: isBlockedDay || !onUpdateMealTime ? 'default' : 'pointer',
                              }}
                            >
                              <Clock size={14} />
                              <span dir="ltr" className="num-mono">
                                {entry?.mealTime || slot.timeHint || 'שעה'}
                              </span>
                            </button>
                          )}

                          <span style={{ flex: 1 }} />

                          {(trainee.mealCardShortcuts ?? DEFAULT_MEAL_CARD_SHORTCUTS)
                            .slice(0, 2)
                            .map((scId) => {
                              const meta = ALL_MEAL_SHORTCUT_OPTIONS.find((o) => o.id === scId);
                              if (!meta) return null;
                              const renderIcon = () => {
                                switch (scId) {
                                  case 'ai-recommend':
                                    return <Lightbulb size={16} />;
                                  case 'saved-meals':
                                    return <Bookmark size={16} />;
                                  case 'ai-photo':
                                    return <Camera size={16} />;
                                  case 'ai-text':
                                    return <Sparkles size={16} />;
                                  case 'barcode':
                                    return <Barcode size={16} />;
                                  case 'favorites':
                                    return <Heart size={16} />;
                                }
                              };
                              return (
                                <GlassButton
                                  key={scId}
                                  label={meta.shortLabel}
                                  title={isBlockedDay ? 'יום חסום להזנה' : meta.description}
                                  size={36}
                                  disabled={isBlockedDay}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openMealDrawer(slot, scId);
                                  }}
                                >
                                  {renderIcon()}
                                </GlassButton>
                              );
                            })}

                          <button
                            type="button"
                            disabled={isBlockedDay}
                            onClick={(e) => {
                              e.stopPropagation();
                              openMealDrawer(slot, hasItems ? 'meal-items' : 'hub');
                            }}
                            style={{
                              height: 36,
                              padding: '0 14px',
                              borderRadius: 999,
                              border: 'none',
                              background: hasItems ? 'var(--surface-2)' : 'var(--btn-primary)',
                              color: hasItems ? 'var(--text)' : 'var(--btn-primary-text)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 5,
                              fontSize: 13,
                              fontWeight: 700,
                              fontFamily: 'inherit',
                              whiteSpace: 'nowrap',
                              opacity: isBlockedDay ? 0.45 : 1,
                              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {!hasItems && <Plus size={14} strokeWidth={2.6} style={{ flexShrink: 0 }} />}
                            <span>{hasItems ? 'הצג' : 'הזן ארוחה'}</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        ) : mobileSection === 'metrics' ? (
          /* טאב מדדים: כל מדד בסקשן נפרד ונפתח אך ורק לפי התזמון שהמאמן הגדיר */
          <motion.div
            key="metrics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            {/* סקשן משקל גוף ושקילה (נפרד ונפתח רק בימים שהמאמן הגדיר) */}
            {isWeightScheduled && (
              <section aria-label="שקילה ומשקל גוף" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>שקילה ומשקל גוף</h2>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    תדירות מהמאמן: {formatMetricScheduleSummary(getResolvedMetricSchedule(trainee, 'weight'), todayIso)}
                  </span>
                </div>
            <div className="pro-card" style={{ padding: 18, borderRadius: 28 }}>
              {(() => {
                const hist = trainee.weightHistory.slice(-12);
                const first = trainee.weightHistory[0]?.weight;
                const delta = first != null ? Math.round((trainee.currentWeight - first) * 10) / 10 : 0;
                const vals = hist.map((w) => w.weight);
                const target = trainee.targetWeight;
                const all = target ? [...vals, target] : vals;
                const lo = Math.min(...all) - 0.5;
                const hi = Math.max(...all) + 0.5;
                const W = 300;
                const H = 80;
                const x = (i: number) => (vals.length <= 1 ? W / 2 : (i / (vals.length - 1)) * W);
                const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 8) - 4;
                const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
                return (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {Boolean(target) && (
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'var(--surface-3)', color: 'var(--text-2)' }}>
                            יעד מאמן: <bdi dir="ltr" className="ltr-num">{target}</bdi> ק״ג
                          </span>
                        )}
                        {trainee.weightHistory.length > 1 && (
                          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)' }}>
                            <bdi dir="ltr" className="ltr-num">{delta > 0 ? '+' : delta < 0 ? '−' : ''}{Math.abs(delta)}</bdi> ק״ג מההתחלה
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'start' }}>
                        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>משקל נוכחי</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.05 }}>
                            {trainee.currentWeight}
                          </bdi>
                          <span style={{ fontSize: 15, color: 'var(--text-2)' }}>ק״ג</span>
                        </div>
                      </div>
                    </div>
                    {vals.length > 1 && (
                      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden style={{ display: 'block', margin: '14px 0', direction: 'ltr', overflow: 'visible' }}>
                        <defs>
                          <linearGradient id="wg" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
                            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <g style={{ color: 'var(--text)' }}>
                          <polygon points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill="url(#wg)" />
                          <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                        </g>
                        {Boolean(target) && (
                          <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
                        )}
                        <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="4" fill="var(--accent)" />
                      </svg>
                    )}
                  </>
                );
              })()}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (isBlockedDay || !isWeightScheduled || weightLockRef.current) return;
                  const num = parseOptionalDecimal(weightInput);
                  if (num === undefined || num < 30 || num > 250) {
                    setWeightFeedback({
                      msg: 'נא להזין משקל תקין בין 30 ל-250 ק״ג',
                      isError: true,
                    });
                    return;
                  }
                  weightLockRef.current = true;
                  setSavingWeight(true);
                  setWeightFeedback(null);
                  try {
                    await onUpdateWeight(trainee.id, selectedDate, num);
                    setWeightFeedback({ msg: `✓ שקילה (${num} ק״ג) נשמרה בהצלחה!` });
                    setTimeout(() => setWeightFeedback(null), 3000);
                  } catch {
                    setWeightFeedback({
                      msg: 'שגיאה בשמירת השקילה – נסה שוב',
                      isError: true,
                    });
                  } finally {
                    weightLockRef.current = false;
                    setSavingWeight(false);
                  }
                }}
                style={{ display: 'flex', gap: 8 }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  aria-label="שקילת היום בק״ג"
                  placeholder="שקילת היום (ק״ג)"
                  disabled={savingWeight || isBlockedDay}
                  value={weightInput}
                  onFocus={() => {
                    isWeightFocusedRef.current = true;
                  }}
                  onBlur={() => {
                    isWeightFocusedRef.current = false;
                  }}
                  onChange={(e) => setWeightInput(sanitizeDecimalInput(e.target.value))}
                  className="num-mono"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    height: 52,
                    background: 'transparent',
                    border: '1px solid var(--line-2)',
                    borderRadius: 999,
                    padding: '0 18px',
                    color: 'var(--text)',
                    fontSize: 18,
                    fontWeight: 600,
                    outline: 'none',
                    opacity: isBlockedDay ? 0.5 : 1,
                  }}
                />
                <button
                  type="submit"
                  disabled={savingWeight || isBlockedDay}
                  className="btn-volt"
                  aria-label="תיעוד שקילה"
                  style={{
                    height: 52,
                    padding: '0 22px',
                    fontSize: 16,
                    whiteSpace: 'nowrap',
                    flex: 'none',
                    cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                    opacity: isBlockedDay ? 0.45 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {savingWeight && <Loader2 size={16} className="spot-spinner" />}
                  <span>{savingWeight ? 'שומר...' : 'תיעוד'}</span>
                </button>
              </form>
              {weightFeedback && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    color: weightFeedback.isError ? 'var(--danger-text)' : 'var(--ok-text)',
                  }}
                >
                  {weightFeedback.msg}
                </div>
              )}
            </div>
              </section>
            )}

            {/* כרטיס הידרציה / שתיית מים (design: Metrics) */}
            <div className="pro-card" style={{ padding: 18, borderRadius: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 'none' }}>
                  <button
                    type="button"
                    aria-label="הוסף כוס מים"
                    disabled={isBlockedDay}
                    onClick={() => !isBlockedDay && onUpdateWater(trainee.id, selectedDate, dailyLog.waterCups + 1)}
                    className="btn-volt hit-44"
                    style={{ width: 52, height: 52, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, opacity: isBlockedDay ? 0.45 : 1 }}
                  >
                    <Plus size={22} />
                  </button>
                  <button
                    type="button"
                    aria-label="הורד כוס מים"
                    disabled={isBlockedDay || dailyLog.waterCups <= 0}
                    onClick={() => !isBlockedDay && onUpdateWater(trainee.id, selectedDate, Math.max(0, dailyLog.waterCups - 1))}
                    className="btn-surface hit-44"
                    style={{ width: 52, height: 52, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isBlockedDay || dailyLog.waterCups <= 0 ? 0.45 : 1 }}
                  >
                    <Minus size={22} />
                  </button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>מאזן נוזלים</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
                    <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
                      {dailyLog.waterCups}
                    </bdi>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      כוסות · <bdi dir="ltr" className="ltr-num">{dailyLog.waterCups * 0.25}</bdi> ליטר
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }} aria-label={`${dailyLog.waterCups} מתוך ${dailyLog.waterGoal} כוסות`}>
                    {Array.from({ length: Math.max(dailyLog.waterGoal, dailyLog.waterCups) }).map((_, i) => (
                      <span
                        key={i}
                        style={{ flex: 1, height: 16, borderRadius: 5, background: i < dailyLog.waterCups ? 'var(--accent)' : 'var(--surface-3)' }}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
                    כל כוס = 250 מ״ל · יעד <bdi dir="ltr" className="ltr-num">{dailyLog.waterGoal}</bdi> כוסות
                  </div>
                </div>
              </div>
            </div>

            {/* סקשן היקפי גוף ומדריך מדידה מונפש (נפרד ונפתח רק בימים שהמאמן הגדיר) */}
            {isMeasurementsScheduled && (
              <section aria-label="מדידת היקפי גוף" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>היקפי גוף</h2>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    תדירות מהמאמן: {formatMetricScheduleSummary(getResolvedMetricSchedule(trainee, 'measurements'), todayIso)}
                  </span>
                </div>
            <div className="pro-card" style={{ padding: 18, borderRadius: 28 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      background: 'var(--surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ruler size={18} color="currentColor" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      מדידת היקפי גוף (חזה, בטן, זרוע, ירך)
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      כולל מדריך מדידה מונפש שלב-אחר-שלב
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isBlockedDay}
                  onClick={() => {
                    if (!isBlockedDay) setMeasurementModalOpen(true);
                  }}
                  className="btn-volt"
                  style={{
                    height: 44,
                    padding: '0 16px',
                    fontSize: 14,
                    whiteSpace: 'nowrap',
                    flex: 'none',
                    opacity: isBlockedDay ? 0.45 : 1,
                    cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                  }}
                >
                  {latestMeasurement ? 'עדכן היקפים' : 'הזן היקפים'}
                </button>
              </div>

              {latestMeasurement ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 8,
                  }}
                >
                  {[
                    { label: 'חזה', val: latestMeasurement.chestCm },
                    { label: 'בטן (פופיק)', val: latestMeasurement.waistNavelCm },
                    { label: 'זרוע', val: latestMeasurement.armCm },
                    { label: 'ירך', val: latestMeasurement.thighCm },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        background: 'var(--surface-2)',
                        padding: '10px 6px',
                        borderRadius: 18,
                        textAlign: 'center',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: 'var(--accent-volt)',
                        }}
                      >
                        {item.val ? `${item.val}` : '—'}
                      </div>
                      <div
                        style={{ fontSize: 13, color: 'var(--text-2)' }}
                      >
                        {item.label} (ס״מ)
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--text-3)',
                    textAlign: 'center',
                    padding: 10,
                  }}
                >
                  טרם הוזנו היקפים. לחץ על &ldquo;הזן היקפים&rdquo; לפתיחת
                  המדריך המונפש.
                </div>
              )}
            </div>
              </section>
            )}

            {/* צ'ק-אין שבועי + דו"ח סיכום (מוסתר לגמרי ונפתח רק בימים שהמאמן הגדיר) */}
            {isWeeklyCheckInScheduled && (
            <section aria-label="צ׳ק-אין שבועי" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>צ׳ק-אין שבועי</h2>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>סיכום השבוע · נשלח למאמן</span>
              </div>

              <div
                aria-label="סיכום השבוע"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 26,
                  padding: 16,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                  rowGap: 14,
                  columnGap: 8,
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                {buildWeeklySummary().stats.map((s) => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                    <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 20, fontWeight: 700 }}>
                      {s.value}
                    </bdi>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              <div
                aria-label="הרגשה שבועית"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 26,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                {[
                  { label: 'רמת אנרגיה באימונים וביום-יום', val: energyLevel, setVal: setEnergyLevel },
                  { label: 'תחושת שובע ונוחות עם התפריט', val: hungerLevel, setVal: setHungerLevel },
                  { label: 'איכות השינה וההתאוששות השבוע', val: sleepQuality, setVal: setSleepQuality },
                ].map((row) => (
                  <div key={row.label} role="radiogroup" aria-label={row.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{row.label}</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
                      {[1, 2, 3, 4, 5].map((num) => {
                        const on = row.val === num;
                        return (
                          <button
                            key={num}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => row.setVal(num)}
                            className="num-mono"
                            style={{
                              height: 44,
                              borderRadius: 18,
                              border: `1px solid ${on ? 'var(--sel-border)' : 'var(--line-2)'}`,
                              background: on ? 'var(--sel-bg)' : 'transparent',
                              color: on ? 'var(--sel-text)' : 'var(--text)',
                              fontSize: 16,
                              fontWeight: on ? 700 : 600,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="ci-note" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  הערה למאמן
                </label>
                <textarea
                  id="ci-note"
                  rows={2}
                  placeholder="סיכום קצר או שאלה למאמן לקראת השבוע הבא..."
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  style={{
                    font: 'inherit',
                    fontSize: 16,
                    color: 'var(--text)',
                    background: 'var(--card)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 20,
                    padding: '12px 14px',
                    resize: 'none',
                    outline: 'none',
                  }}
                />
              </div>

              {reportCopiedBanner && (
                <div
                  role="status"
                  style={{ padding: '10px 14px', borderRadius: 16, background: 'var(--surface-2)', fontSize: 13, fontWeight: 600 }}
                >
                  ✓ הדו״ח השבועי הועתק! ניתן להדביק ישירות בוואטסאפ למאמן.
                </div>
              )}
              {reportCopyError && (
                <div
                  role="alert"
                  style={{ padding: '10px 14px', borderRadius: 16, background: 'var(--surface-2)', color: 'var(--danger-text)', fontSize: 13, fontWeight: 600 }}
                >
                  לא ניתן להעתיק ללוח בדפדפן זה – בדוק הרשאות העתקה.
                </div>
              )}
              {checkInSavedBanner && (
                <div role="status" style={{ fontSize: 13, color: 'var(--ok-text)', fontWeight: 700, textAlign: 'center' }}>
                  ✓ הצ׳ק-אין השבועי נשמר ונשלח למאמן!
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  disabled={savingCheckIn || isBlockedDay || !isWeeklyCheckInScheduled}
                  onClick={async () => {
                    if (!onSaveWeeklyCheckIn || isBlockedDay || !isWeeklyCheckInScheduled || checkInLockRef.current) return;
                    checkInLockRef.current = true;
                    setSavingCheckIn(true);
                    try {
                      await onSaveWeeklyCheckIn(trainee.id, {
                        id: `chk-${Date.now()}`,
                        date: todayIso,
                        weightKg: trainee.currentWeight,
                        energyLevel,
                        hungerLevel,
                        sleepQuality,
                        note: checkInNote.trim() || undefined,
                      });
                      setCheckInNote('');
                      setCheckInSavedBanner(true);
                      setTimeout(() => setCheckInSavedBanner(false), 3000);
                    } finally {
                      checkInLockRef.current = false;
                      setSavingCheckIn(false);
                    }
                  }}
                  className="btn-volt"
                  style={{ height: 56, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
                >
                  {savingCheckIn ? <Loader2 size={18} className="spot-spinner" /> : <Check size={18} />}
                  <span>{savingCheckIn ? 'שומר צ׳ק-אין...' : 'שמור צ׳ק-אין למאמן'}</span>
                </button>
                <button
                  type="button"
                  className="glass"
                  onClick={async () => {
                    const lines = buildWeeklySummary().report(checkInNote);
                    setReportCopyError(false);
                    try {
                      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(lines);
                      } else if (typeof document !== 'undefined') {
                        const ta = document.createElement('textarea');
                        ta.value = lines;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                      } else {
                        throw new Error('Clipboard unavailable');
                      }
                      setReportCopiedBanner(true);
                      setTimeout(() => setReportCopiedBanner(false), 3500);
                    } catch {
                      setReportCopyError(true);
                      setTimeout(() => setReportCopyError(false), 4000);
                    }
                  }}
                  style={{ height: 52, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
                >
                  <Share2 size={18} />
                  <span>העתק דו״ח לוואטסאפ</span>
                </button>
              </div>
            </section>
            )}
          </motion.div>
        ) : (
          /* טאב פרופיל: היסטוריית ארוחות, סטטיסטיקות, הגדרות פושים ושינוי שם */
          <motion.div
            key="profile"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <TraineeProfileView
              trainee={trainee}
              todayIso={todayIso}
              isCoachPreview={isCoachPreview}
              onRenameProfile={
                onRenameProfile ??
                (async () => ({
                  error: 'שינוי שם זמין רק מהחשבון של המתאמן עצמו',
                }))
              }
              onPushPreferencesUpdated={onPushPreferencesUpdated}
              onUpdateMealShortcuts={onUpdateMealShortcuts}
              onOpenOnboarding={() => setEditingOnboarding(true)}
              olderLogsInfo={olderLogsInfo}
              loadingOlderLogs={loadingOlderLogs}
              onLoadOlderLogs={onLoadOlderLogs}
              onOpenMealFromHistory={(date, mealSlotId) => {
                setDrawerReturnTarget({ section: mobileSection, date: selectedDate });
                setMobileSection('journal');
                setSelectedDate(date);
                const targetSlot = findTraineeMealSlotById(trainee, mealSlotId);
                if (targetSlot) {
                  setActiveMealSlot(targetSlot);
                  setDrawerTab('meal-items');
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating glass dock: 3 tabs + separate orange add-meal button */}
      <GlassDock
        tabs={[
          { id: 'journal', label: 'יומן', icon: <NotebookText size={22} strokeWidth={1.8} /> },
          { id: 'metrics', label: 'מדדים', icon: <Activity size={22} strokeWidth={1.8} /> },
          { id: 'profile', label: 'פרופיל', icon: <User size={22} strokeWidth={1.8} /> },
        ]}
        active={mobileSection}
        onChange={(id) => setMobileSection(id)}
        action={{
          label: isBlockedDay ? 'יום חסום להזנה' : 'הוספת ארוחה',
          disabled: isBlockedDay,
          onClick: () => {
            if (isBlockedDay) return;
            const slot = pickDefaultMealSlot();
            if (slot) openMealDrawer(slot, 'hub');
          },
        }}
      />

      {/* Journal date picker (bottom sheet with month / year picker) */}
      <CalendarSheet
        opened={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        cursor={calendarCursor}
        onCursorChange={setCalendarCursor}
        selectedDate={selectedDate}
        todayIso={todayIso}
        onSelectDate={setSelectedDate}
        isDateActive={(iso) => isDateActiveForTrainee(iso, trainee, todayIso)}
        isObservation={(iso) =>
          (trainee.observationDates || []).includes(iso) || Boolean(trainee.logs[iso]?.isObservationDay)
        }
        isBlocked={(iso) => isDayBlockedForTrainee(iso, trainee)}
        hasLog={(iso) => Boolean(trainee.logs[iso] && Object.keys(trainee.logs[iso].meals || {}).length > 0)}
        monthNames={HEBREW_MONTH_NAMES}
        weekdayLetters={HEBREW_WEEKDAY_LETTERS}
        olderLogsInfo={olderLogsInfo}
        loadingOlderLogs={loadingOlderLogs}
        onLoadOlderLogs={onLoadOlderLogs}
      />

      {/* מודאל מדידת היקפים מונפש */}
      <Modal
        opened={isMeasurementsScheduled && measurementModalOpen}
        onClose={() => !savingMeasurements && setMeasurementModalOpen(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            מדידת היקפי גוף מודרכת (חזה, בטן, זרוע, ירך)
          </span>
        }
        centered
        radius="lg"
        size="lg"
      >
        <BodyMeasurementGuide
          initialValues={latestMeasurement}
          showSaveButtons
          onSkip={() => setMeasurementModalOpen(false)}
          onSave={async (vals) => {
            setSavingMeasurements(true);
            try {
              await onSaveBodyMeasurement(trainee.id, {
                date: todayIso,
                ...vals,
                weightKg: trainee.currentWeight,
              });
              setMeasurementModalOpen(false);
            } finally {
              setSavingMeasurements(false);
            }
          }}
        />
      </Modal>

      {/* מודאל מד צעדים מלא */}
      <Modal
        opened={stepsModalOpen}
        onClose={() => setStepsModalOpen(false)}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 16 }}>
            <Footprints size={18} />
            <span>מד צעדים יומי</span>
          </span>
        }
        centered
        radius="lg"
        size="md"
        overlayProps={{ backgroundOpacity: 0.72, blur: 4 }}
      >
        <DailyStepsCard
          selectedDate={selectedDate}
          todayIso={todayIso}
          steps={dailyLog.steps ?? 0}
          stepsSource={dailyLog.stepsSource}
          stepsSyncedAt={dailyLog.stepsSyncedAt}
          dailyStepsTarget={(trainee.activityTargets?.dailyStepsTarget) ?? 8000}
          isCoachPreview={isCoachPreview}
          isBlockedDay={isBlockedDay}
          onSaveManualSteps={async (steps) => {
            await onUpdateDailyActivity(trainee.id, selectedDate, {
              steps,
              stepsSource: 'manual',
              stepsSyncedAt: new Date().toISOString(),
            });
          }}
          onSyncNativeStepsNow={onSyncNativeStepsNow}
        />
      </Modal>

      <AddMealDrawer
        opened={Boolean(activeMealSlot)}
        onClose={() => {
          setActiveMealSlot(null);
          if (drawerReturnTarget) {
            setMobileSection(drawerReturnTarget.section);
            setSelectedDate(drawerReturnTarget.date);
            setDrawerReturnTarget(null);
          }
        }}
        mealSlot={activeMealSlot}
        mealSlotOptions={activeTemplate.meals}
        onChangeMealSlot={(slot) => setActiveMealSlot(slot)}
        existingEntry={
          activeMealSlot ? dailyLog.meals[activeMealSlot.id] : undefined
        }
        favoriteIds={trainee.favoriteFoodIds}
        onToggleFavorite={(foodId) => onToggleFavorite(trainee.id, foodId)}
        onSaveMeal={(slotId, items, photoDataUrl, photoNote, photoDataUrls, mealTime, aiSuggestedExtras) =>
          onSaveMeal(
            trainee.id,
            selectedDate,
            slotId,
            items,
            photoDataUrl,
            photoNote,
            photoDataUrls,
            mealTime,
            aiSuggestedExtras
          )
        }
        initialTab={drawerTab}
        isObservationDay={isObservationDay}
        traineeId={trainee.id}
        traineeName={trainee.name}
        learnedPreferences={trainee.aiLearnedPreferences || []}
        showLearnedPreferences={Boolean(trainee.showLearnedPreferencesInRecommendations)}
        onPreferenceLearned={(prefs) => {
          if (onPreferenceLearned) {
            onPreferenceLearned(trainee.id, prefs);
          }
        }}
        savedMeals={trainee.savedMeals || []}
        customServingTools={trainee.customServingTools || []}
        customFoodUnits={trainee.customFoodUnits || []}
        recentContextChips={trainee.recentContextChips || []}
        groupQuickChips={groupQuickChips}
        globalQuickChips={globalQuickChips}
        traineeLogs={trainee.logs}
        onSavedMealAction={
          onSavedMealAction
            ? (payload) => onSavedMealAction(trainee.id, payload)
            : undefined
        }
        onManageToolsAndUnits={
          onManageToolsAndUnits
            ? (payload) => onManageToolsAndUnits(trainee.id, payload)
            : undefined
        }
        onManageQuickChips={onManageQuickChips}
        actorRole={actorRole}
        isCoachPreview={isCoachPreview}
        recentLabelProducts={trainee.recentLabelProducts || []}
        externalOpenAdjustNonce={externalOpenAdjustNonce}
        externalClarificationJobId={externalClarifyJobId}
        onMarkCoachBadgesRead={(slotId) => {
          if (actorRole === 'trainee' && !isCoachPreview) {
            void onMarkCoachMealEditsRead?.({
              mode: 'badges',
              date: selectedDate,
              mealSlotId: slotId,
            });
          }
        }}
        onRestoreCoachDeletedItem={
          actorRole === 'trainee' && !isCoachPreview && onRestoreCoachDeletedItem
            ? (payload) =>
                onRestoreCoachDeletedItem({
                  date: selectedDate,
                  mealSlotId: payload.mealSlotId,
                  noticeId: payload.noticeId,
                  historyEventId: payload.historyEventId,
                  itemId: payload.itemId,
                })
            : undefined
        }
        onRollbackMealHistory={
          onRollbackMealHistory
            ? (payload) =>
                onRollbackMealHistory({
                  traineeId: trainee.id,
                  date: selectedDate,
                  mealSlotId: payload.mealSlotId,
                  historyEntryId: payload.historyEntryId,
                })
            : undefined
        }
        onRefreshDataFromServer={onRefreshDataFromServer}
        showScraperSources={actorRole === 'admin' && Boolean(showScraperSources)}
        semanticSearchEnabled={Boolean(semanticSearchEnabled)}
        customFoods={customFoods}
        onCustomFoodsUpdated={onCustomFoodsUpdated}
        selectedDate={selectedDate}
        backgroundAiJobs={backgroundAiJobs}
        onStartBackgroundAiAnalysis={onStartBackgroundAiAnalysis}
        onAcknowledgeAiJob={onAcknowledgeAiJob}
        onCancelAiJob={onCancelAiJob}
      />

      {/* מודאל עדכון שעת הזנת ארוחה */}
      <Modal
        opened={Boolean(timeEditSlot)}
        onClose={() => !savingMealTime && setTimeEditSlot(null)}
        centered
        size="sm"
        radius="lg"
        overlayProps={{ backgroundOpacity: 0.78, blur: 5 }}
        styles={{
          content: { overflow: 'hidden', maxWidth: 'calc(100vw - 24px)' },
          body: { overflow: 'hidden' },
        }}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={15} color="currentColor" />
            <span style={{ fontWeight: 800, fontSize: 14 }}>
              שעת ארוחה — {timeEditSlot?.name}
            </span>
          </div>
        }
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <TimeWheel value={draftMealTime} onChange={setDraftMealTime} />

          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={savingMealTime}
              onClick={() => {
                const now = new Date();
                setDraftMealTime(
                  `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
                );
              }}
              className="glass"
              style={{ height: 44, padding: '0 18px', borderRadius: 999, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              עכשיו
            </button>
            {timeEditSlot?.timeHint && (
              <button
                type="button"
                disabled={savingMealTime}
                onClick={() => {
                  const m = timeEditSlot.timeHint!.match(/^(\d{1,2}):(\d{2})$/);
                  setDraftMealTime(m ? `${m[1].padStart(2, '0')}:${m[2]}` : timeEditSlot.timeHint!);
                }}
                className="glass"
                style={{ height: 44, padding: '0 18px', borderRadius: 999, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
              >
                לפי התפריט · <bdi dir="ltr" className="ltr-num">{timeEditSlot.timeHint}</bdi>
              </button>
            )}
          </div>
          <button
            type="button"
            disabled={savingMealTime || !onUpdateMealTime || isBlockedDay}
            onClick={async () => {
              if (!timeEditSlot || !onUpdateMealTime || isBlockedDay) return;
              setSavingMealTime(true);
              try {
                await onUpdateMealTime(
                  trainee.id,
                  selectedDate,
                  timeEditSlot.id,
                  draftMealTime
                );
                setTimeEditSlot(null);
              } catch {
                // הודעת שגיאה מוצגת דרך התראה ובאנר השמירה
              } finally {
                setSavingMealTime(false);
              }
            }}
            className="btn-volt"
            style={{
              height: 56,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
            }}
          >
            {savingMealTime ? (
              <Loader2 size={14} className="spot-spinner" />
            ) : (
              <Check size={14} />
            )}
            <span>שמור שעה</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
