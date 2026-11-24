'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@mantine/core';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Plus,
  Sparkles,
  Droplets,
  Scale,
  Dumbbell,
  Moon,
  Activity,
  Utensils,
  User,
  MessageSquare,
  Ruler,
  Eye,
  ClipboardCheck,
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
  Mic,
  NotebookText,
  Barcode,
  Heart,
  Footprints,
  Clock,
  Ban,
  Lock,
} from 'lucide-react';
import {
  AiContextParams,
  BodyMeasurementEntry,
  DailyCardioLog,
  DailyWorkoutLog,
  DayType,
  LoggedFoodItem,
  MealCardShortcutId,
  MealTemplateSlot,
  PendingAiMealJob,
  QuickContextChip,
  SavedMealPreset,
  StepsSyncSource,
  TraineeCustomUnit,
  TraineeOnboardingData,
  TraineeProfile,
  TraineePushPreferences,
  TraineeServingTool,
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import { getTodayIso, sumMacros } from '@/data/israeliFoodCatalog';
import {
  ALL_MEAL_SHORTCUT_OPTIONS,
  DEFAULT_MEAL_CARD_SHORTCUTS,
  HEBREW_MONTH_NAMES,
  HEBREW_WEEKDAY_LETTERS,
  addDaysIso,
  diffDaysIso,
  getWeekDaysAroundDate,
  isDateActiveForTrainee,
  isDayBlockedForTrainee,
  isObservationDateForTrainee,
  isTodayObservationRestricted,
} from '@/lib/dateUtils';
import { isNativeAndroidApp } from '@/lib/capacitorSteps';
import { AddMealDrawer } from './AddMealDrawer';
import { TraineeOnboardingWizard } from './TraineeOnboardingWizard';
import { BodyMeasurementGuide } from './BodyMeasurementGuide';
import { DailyStepsCard } from './DailyStepsCard';
import { TraineeProfileView } from './TraineeProfileView';
import { CalendarSheet } from './journal/CalendarSheet';
import { GlassButton } from './ui/GlassButton';
import { GlassDock } from './ui/GlassDock';
import { TimeWheel } from './ui/TimeWheel';
import { ProgressRing } from './ui/ProgressRing';
import { SegmentedPill } from './ui/SegmentedPill';
import { SectionHeader } from './ui/Card';

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
    mealTime?: string
  ) => void | Promise<void>;
  onUpdateMealTime?: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    mealTime: string
  ) => void | Promise<void>;
  onUpdateWater: (traineeId: string, date: string, cups: number) => void | Promise<void>;
  onUpdateWeight: (traineeId: string, date: string, weightKg: number) => void | Promise<void>;
  onToggleFavorite: (traineeId: string, foodId: string) => void;
  onCompleteOnboarding: (
    traineeId: string,
    data: {
      name: string;
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
    scope: 'user' | 'group' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
  backgroundAiJobs?: PendingAiMealJob[];
  onStartBackgroundAiAnalysis?: (payload: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    mealSlotName: string;
    mode: 'photo' | 'text';
    imageDataUrl?: string;
    imageDataUrls?: string[];
    textPrompt?: string;
    contextParams?: AiContextParams;
  }) => Promise<{ jobId: string }>;
  externalOpenMealRequest?: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    initialTab?: string;
    nonce: number;
  } | null;
  externalSectionRequest?: {
    traineeId: string;
    section: 'journal' | 'metrics' | 'profile';
    date?: string;
    nonce: number;
  } | null;
  onRenameProfile?: (name: string) => Promise<{ error?: string }>;
  onPushPreferencesUpdated?: (prefs: TraineePushPreferences) => void;
  onUpdateMealShortcuts?: (
    traineeId: string,
    shortcuts: MealCardShortcutId[]
  ) => void | Promise<void>;
  onSyncNativeStepsNow?: () => Promise<void>;
}

function CompactMiniRing({
  current,
  target,
  color,
  size = 44,
}: {
  current: number;
  target: number;
  color: string;
  size?: number;
}) {
  const r = (size - 6) / 2;
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
        strokeWidth={4.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4.5}
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
  backgroundAiJobs = [],
  onStartBackgroundAiAnalysis,
  externalOpenMealRequest,
  externalSectionRequest,
  onRenameProfile,
  onPushPreferencesUpdated,
  onUpdateMealShortcuts,
  onSyncNativeStepsNow,
}: TraineeMobileViewProps) {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
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

  const [activeMealSlot, setActiveMealSlot] = useState<MealTemplateSlot | null>(
    null
  );
  const [drawerTab, setDrawerTab] = useState<string>('hub');
  const [timeEditSlot, setTimeEditSlot] = useState<MealTemplateSlot | null>(null);
  const [draftMealTime, setDraftMealTime] = useState<string>('12:00');
  const [savingMealTime, setSavingMealTime] = useState(false);
  const [customSleepOpen, setCustomSleepOpen] = useState(false);
  const [customSleepDraft, setCustomSleepDraft] = useState('');
  const [weightInput, setWeightInput] = useState<string>(
    String(trainee.currentWeight)
  );

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

  // סנכרון משקל ומדדים כאשר עוברים מתאמן (בתצוגת מאמן) או כשהנתונים מתעדכנים מהשרת
  useEffect(() => {
    setWeightInput(String(trainee.currentWeight));
    setWeightFeedback(null);
  }, [trainee.id, trainee.currentWeight]);

  useEffect(() => {
    const chk = trainee.weeklyCheckIns?.[trainee.weeklyCheckIns.length - 1];
    setEnergyLevel(chk?.energyLevel || 4);
    setHungerLevel(chk?.hungerLevel || 3);
    setSleepQuality(chk?.sleepQuality || 4);
  }, [trainee.id, trainee.weeklyCheckIns]);

  useEffect(() => {
    if (!externalOpenMealRequest || externalOpenMealRequest.traineeId !== trainee.id) {
      return;
    }
    setMobileSection('journal');
    setSelectedDate(externalOpenMealRequest.date);
    const targetSlot = findTraineeMealSlotById(
      trainee,
      externalOpenMealRequest.mealSlotId
    );
    if (targetSlot) {
      setActiveMealSlot(targetSlot);
      setDrawerTab(externalOpenMealRequest.initialTab || 'hub');
    }
  }, [externalOpenMealRequest, trainee]);

  useEffect(() => {
    if (
      !externalSectionRequest ||
      externalSectionRequest.traineeId !== trainee.id
    ) {
      return;
    }
    setMobileSection(externalSectionRequest.section);
    if (externalSectionRequest.date) {
      setSelectedDate(externalSectionRequest.date);
    }
  }, [externalSectionRequest, trainee.id]);

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

  // אם המתאמן מתחבר בפעם הראשונה וטרם השלים Onboarding -> מציג את אשף ה-Onboarding
  if (
    (!trainee.onboarding?.completed && !isCoachPreview) ||
    editingOnboarding
  ) {
    return (
      <TraineeOnboardingWizard
        trainee={trainee}
        onCompleteOnboarding={(data) => {
          onCompleteOnboarding(trainee.id, data);
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
    ? arcLength * Math.min(1, dailyConsumed.calories / 2200)
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
    setActiveMealSlot(slot);
    setDrawerTab(tab);
  };

  const latestMeasurement =
    trainee.measurementsHistory?.[trainee.measurementsHistory.length - 1];

  return (
    <div
      style={{
        maxWidth: 460,
        margin: '0 auto',
        paddingBottom: 130,
      }}
    >
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

      {/* תזכורת להשלמת מדידת היקפים אם המתאמן דילג עליה ב-Onboarding */}
      {!trainee.onboarding?.measurementsCompleted && !latestMeasurement && (
        <button
          type="button"
          onClick={() => setMeasurementModalOpen(true)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 24,
            background: 'var(--card)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--card-shadow)',
            marginBottom: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            color: 'var(--text)',
            textAlign: 'start',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: 16,
              background: 'var(--surface-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
            }}
          >
            <Ruler size={20} />
          </span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>מדידת היקפים ראשונית</span>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>טרם הושלמה · הדרכה מונפשת</span>
          </span>
          <span
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 999,
              background: 'var(--btn-primary)',
              color: 'var(--btn-primary-text)',
              fontSize: 14,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              flex: 'none',
            }}
          >
            השלם
          </span>
        </button>
      )}

      {/* Journal & metrics share the date header + week strip; profile has its own header */}
      {mobileSection !== 'profile' && (
        <>
      {/* Header: avatar, date + greeting, questionnaire shortcut */}
      {(() => {
        const now = new Date();
        const hour = now.getHours();
        const greeting =
          hour < 5 ? 'לילה טוב' : hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : hour < 21 ? 'ערב טוב' : 'לילה טוב';
        const [sy, sm, sd] = selectedDate.split('-').map(Number);
        const dateObj = new Date(sy, (sm || 1) - 1, sd || 1);
        const weekdayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const dateLabel = `יום ${weekdayNames[dateObj.getDay()]}, ${sd} ב${HEBREW_MONTH_NAMES[(sm || 1) - 1]}`;
        const firstName = (trainee.name || '').trim().split(/\s+/)[0] || trainee.name;
        if (mobileSection === 'metrics') {
          return (
            <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{dateLabel}</span>
                <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.15 }}>מדדים</h1>
              </div>
              <GlassButton label="מדידת היקפים מודרכת" onClick={() => setMeasurementModalOpen(true)}>
                <Ruler size={20} />
              </GlassButton>
            </header>
          );
        }
        return (
          <header
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                aria-hidden
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: 'var(--surface-3)',
                  color: 'var(--text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 15,
                  flex: 'none',
                }}
              >
                {trainee.avatar}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{dateLabel}</span>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {greeting}, {firstName}
                </span>
              </div>
            </div>
            <GlassButton label="עדכון שאלון פרופיל והעדפות" onClick={() => setEditingOnboarding(true)}>
              <ClipboardCheck size={20} />
            </GlassButton>
          </header>
        );
      })()}

      {/* Workout / rest day switch (only when the coach enabled the split) */}
      {Boolean(trainee.enableWorkoutRestSplit) && (
        <SegmentedPill
          ariaLabel="סוג יום"
          value={dailyLog.dayType === 'rest' ? 'rest' : 'workout'}
          onChange={(v) => !isBlockedDay && onUpdateDayType(trainee.id, selectedDate, v as DayType)}
          options={[
            { value: 'workout', label: 'יום אימון', icon: <Dumbbell size={15} />, disabled: isBlockedDay },
            { value: 'rest', label: 'יום מנוחה', icon: <Moon size={15} />, disabled: isBlockedDay },
          ]}
          style={{ marginBottom: 14 }}
        />
      )}

      {/* Week strip: month pill (opens calendar), week navigation, 7 day tiles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <button
            type="button"
            className="glass"
            aria-label="בחירת תאריך מלוח שנה"
            onClick={() => {
              const [y, m] = selectedDate.split('-').map(Number);
              if (y && m) setCalendarCursor({ year: y, month: m - 1 });
              setCalendarModalOpen(true);
            }}
            style={{
              height: 44,
              padding: '0 12px 0 14px',
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <CalendarDays size={17} />
            <span>
              {(() => {
                const [y, m] = selectedDate.split('-').map(Number);
                return `${HEBREW_MONTH_NAMES[(m || 1) - 1]} ${y}`;
              })()}
            </span>
            <ChevronDown size={14} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {selectedDate !== todayIso && (
              <button
                type="button"
                className="glass"
                onClick={() => setSelectedDate(todayIso)}
                style={{
                  height: 44,
                  padding: '0 14px',
                  borderRadius: 999,
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                חזור להיום
              </button>
            )}
            <GlassButton
              label="שבוע קודם"
              size={44}
              disabled={!canPrevWeek}
              onClick={() => {
                const candidates = getWeekDaysAroundDate(prevWeekAnchor, todayIso).filter((d) =>
                  isDateActiveForTrainee(d.iso, trainee, todayIso)
                );
                if (candidates.length > 0) {
                  setSelectedDate(candidates[candidates.length - 1].iso);
                }
              }}
            >
              <ChevronRight size={18} />
            </GlassButton>
            <GlassButton
              label="שבוע הבא"
              size={44}
              disabled={!canNextWeek}
              onClick={() => {
                const candidates = getWeekDaysAroundDate(nextWeekAnchor, todayIso).filter((d) =>
                  isDateActiveForTrainee(d.iso, trainee, todayIso)
                );
                if (candidates.length > 0) {
                  setSelectedDate(candidates[0].iso);
                }
              }}
            >
              <ChevronLeft size={18} />
            </GlassButton>
          </div>
        </div>

        <nav
          aria-label="ימי השבוע"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}
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
            const bg = isSelected
              ? isBlockedCell
                ? 'var(--status-danger)'
                : 'var(--accent)'
              : 'var(--card)';
            const fg = isSelected
              ? 'var(--on-accent)'
              : isBlockedCell
              ? 'var(--status-danger)'
              : isActive
              ? 'var(--text)'
              : 'var(--text-3)';
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
                  height: 64,
                  borderRadius: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  padding: 0,
                  fontFamily: 'inherit',
                  background: bg,
                  color: fg,
                  border: `1.5px ${isObs && !isSelected ? 'dashed' : 'solid'} ${
                    isSelected
                      ? 'transparent'
                      : d.isToday
                      ? 'var(--text)'
                      : isObs
                      ? 'var(--macro-protein)'
                      : 'var(--line)'
                  }`,
                  opacity: isActive ? 1 : 0.45,
                  cursor: isActive ? 'pointer' : 'not-allowed',
                  transition: 'background-color .15s ease',
                }}
              >
                <span style={{ fontSize: 12, opacity: 0.75 }}>{d.dayLetter}</span>
                <span
                  className="num-mono"
                  style={{
                    fontSize: 17,
                    fontWeight: 600,
                    textDecoration: isBlockedCell ? 'line-through' : 'none',
                  }}
                >
                  {d.dayNumber}
                </span>
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 9,
                    background: hasLog
                      ? isSelected
                        ? 'var(--on-accent)'
                        : 'var(--accent)'
                      : 'transparent',
                  }}
                />
              </button>
            );
          })}
        </nav>
      </div>

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

            {/* Calorie ring + macros */}
            <section
              aria-label="סיכום יומי"
              style={{
                background: 'var(--card)',
                border: `1px solid ${isObservationDay ? 'var(--surface-2)' : 'var(--line)'}`,
                borderRadius: 28,
                padding: 20,
                marginBottom: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
                boxShadow: 'var(--card-shadow)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <ProgressRing
                  value={isObservationDay ? 1 : dailyConsumed.calories}
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
                      fontSize: 13,
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
                    { label: 'ארוחות', value: String(activeTemplate.meals.length) },
                  ].map((row, idx) => (
                    <React.Fragment key={row.label}>
                      {idx > 0 && <div style={{ height: 1, background: 'var(--line)' }} />}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{row.label}</span>
                        <span className="num-mono" style={{ fontSize: 18, fontWeight: 600 }}>
                          {row.value}
                        </span>
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
                    ? Math.min(100, Math.round((m.consumed / 150) * 100))
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
                      <span className="num-mono" style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {Math.round(m.consumed)}
                        {!isObservationDay && (
                          <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> / {Math.round(m.target)} ג׳</span>
                        )}
                        {isObservationDay && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> ג׳</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Quick add: the four fastest ways to log a meal */}
            {!isBlockedDay && activeTemplate.meals.length > 0 && (() => {
              const quickSlot = pickDefaultMealSlot();
              if (!quickSlot) return null;
              const items: { id: string; label: string; icon: React.ReactNode; tab: string }[] = [
                { id: 'photo', label: 'צילום AI', icon: <Camera size={26} strokeWidth={1.8} />, tab: 'ai-photo' },
                { id: 'text', label: 'טקסט / קול', icon: <Mic size={26} strokeWidth={1.8} />, tab: 'ai-text' },
                { id: 'barcode', label: 'ברקוד', icon: <Barcode size={26} strokeWidth={1.8} />, tab: 'barcode' },
                { id: 'saved', label: 'שמורות', icon: <Bookmark size={26} strokeWidth={1.8} />, tab: 'saved-meals' },
              ];
              return (
                <section aria-label="הוספה מהירה" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  <SectionHeader
                    title="הוספה מהירה"
                    meta={`${quickSlot.name}${selectedDate === todayIso ? ' · עכשיו' : ''}`}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                    {items.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => openMealDrawer(quickSlot, it.tab)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 8,
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
                            width: 64,
                            height: 64,
                            borderRadius: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {it.icon}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{it.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Daily activity (design: JournalActivity) */}
            {(() => {
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
                ...(hasSyncedSteps
                  ? [{ key: 's', label: 'צעדים', value: `${Math.min(99, Math.round((currentSteps / Math.max(1, dailyStepsTarget)) * 100))}%`, current: currentSteps, target: dailyStepsTarget }]
                  : []),
                { key: 'z', label: 'שינה', value: `${sleepDaysMet}/7`, current: sleepDaysMet, target: 7 },
              ];

              const section: React.CSSProperties = {
                background: 'var(--card)',
                border: '1px solid var(--line)',
                borderRadius: 24,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                boxShadow: 'var(--card-shadow)',
              };
              const head: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
              const optStyle = (on: boolean, radius: number): React.CSSProperties => ({
                minHeight: 44,
                padding: '0 14px',
                borderRadius: radius,
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: on ? 700 : 500,
                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                opacity: isBlockedDay ? 0.45 : 1,
                border: `1px solid ${on ? 'var(--sel-border)' : 'var(--line-2)'}`,
                background: on ? 'var(--sel-bg)' : 'transparent',
                color: on ? 'var(--sel-text)' : 'var(--text)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              });
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
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
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
                          padding: '12px 4px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: 'var(--card-shadow)',
                        }}
                      >
                        <div style={{ position: 'relative', width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
                          <CompactMiniRing current={r.current} target={r.target} color="var(--text)" />
                          <bdi dir="ltr" className="num-mono ltr-num" style={{ position: 'absolute', fontSize: 12, fontWeight: 700 }}>
                            {r.value}
                          </bdi>
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>{r.label}</span>
                      </div>
                    ))}
                  </section>

                  {hasSyncedSteps && (
                    <DailyStepsCard
                      selectedDate={selectedDate}
                      todayIso={todayIso}
                      steps={dailyLog.steps ?? 0}
                      stepsSource={dailyLog.stepsSource}
                      stepsSyncedAt={dailyLog.stepsSyncedAt}
                      dailyStepsTarget={dailyStepsTarget}
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
                  )}

                  <section aria-label="אימון היום" style={section}>
                    <div style={head}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>אימון היום</span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        השבוע: <bdi dir="ltr" className="num-mono ltr-num" style={{ color: 'var(--text)', fontWeight: 600 }}>{workoutsThisWeek}</bdi> אימונים
                      </span>
                    </div>
                    <div role="radiogroup" aria-label="סוג אימון" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {workoutTypes.map((wType) => {
                        const isSelected = Boolean(todayWorkout?.completed && todayWorkout.workoutType === wType);
                        return (
                          <button
                            key={wType}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={isBlockedDay}
                            style={optStyle(isSelected, 999)}
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
                            {isSelected && <Check size={15} strokeWidth={2.8} />}
                            {wType}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section aria-label="הליכה או ריצה" style={section}>
                    <div style={head}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>הליכה / ריצה</span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        יעד: <bdi dir="ltr" className="num-mono ltr-num" style={{ color: 'var(--text)', fontWeight: 600 }}>{actTargets.cardioTargetMinutes}</bdi> דק׳ · השבוע{' '}
                        <bdi dir="ltr" className="ltr-num">{cardioThisWeek}/{actTargets.weeklyCardioTarget}</bdi>
                      </span>
                    </div>
                    <div role="radiogroup" aria-label="סוג פעילות אירובית" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      {cardioOptions.map((cOpt) => {
                        const isSelected = Boolean(todayCardio?.completed && todayCardio.label === cOpt.label);
                        return (
                          <button
                            key={cOpt.label}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            disabled={isBlockedDay}
                            style={optStyle(isSelected, 14)}
                            onClick={() => {
                              if (isBlockedDay) return;
                              onUpdateDailyActivity(trainee.id, selectedDate, {
                                cardioLog: isSelected
                                  ? { completed: false }
                                  : { completed: true, mode: cOpt.mode, label: cOpt.label, durationMinutes: cOpt.mins },
                              });
                            }}
                          >
                            {isSelected && <Check size={15} strokeWidth={2.8} />}
                            {cOpt.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section
                    aria-label="שינה"
                    style={{ ...section, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>שינה</span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        כמה שעות ישנת הלילה? (יעד <bdi dir="ltr" className="ltr-num">{actTargets.dailySleepTargetHours}</bdi>)
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
                        style={{ width: 44, height: 44, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: isBlockedDay ? 0.45 : 1 }}
                      >
                        <Minus size={18} strokeWidth={2.2} />
                      </button>
                      <bdi dir="ltr" className="num-mono ltr-num" style={{ minWidth: 54, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>
                        {todaySleep ?? '—'}
                      </bdi>
                      <button
                        type="button"
                        aria-label="יותר שעות שינה"
                        disabled={isBlockedDay}
                        onClick={() => stepSleep(0.5)}
                        style={{ width: 44, height: 44, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: isBlockedDay ? 0.45 : 1 }}
                      >
                        <Plus size={18} strokeWidth={2.2} />
                      </button>
                    </span>
                  </section>
                </div>
              );
            })()}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                padding: '0 4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 800 }}>
                  ציר זמן ארוחות
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--surface-2)',
                    color: isObservationDay
                      ? '#38bdf8'
                      : 'var(--text-secondary)',
                  }}
                >
                  {isObservationDay
                    ? 'יום תשקיף (תיעוד חופשי)'
                    : activeTemplate.name}
                </span>
              </div>

              {activeTemplate.meals.length > 0 && (() => {
                const answeredCount = (trainee.savedMeals || []).filter(
                  (m) => m.coachQuestion?.status === 'answered'
                ).length;
                return (
                  <button
                    type="button"
                    onClick={() => openMealDrawer(activeTemplate.meals[0], 'saved-meals')}
                    className="btn-surface"
                    style={{
                      minHeight: 40, padding: '0 14px',
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      borderColor:
                        answeredCount > 0
                          ? 'var(--surface-2)'
                          : 'var(--line)',
                      color:
                        answeredCount > 0
                          ? 'var(--accent-volt)'
                          : 'var(--text-primary)',
                    }}
                  >
                    <Bookmark size={12} color="currentColor" />
                    <span>הארוחות והכלים שלי</span>
                    {(trainee.savedMeals?.length || 0) > 0 && (
                      <span
                        className="num-mono"
                        style={{
                          fontSize: 13,
                          padding: '1px 5px',
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          color: 'var(--accent-volt)',
                        }}
                      >
                        {trainee.savedMeals?.length}
                      </span>
                    )}
                  </button>
                );
              })()}
            </div>

            {/* רשימת כרטיסי הארוחות */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeTemplate.meals.map((slot, idx) => {
                const entry = dailyLog.meals[slot.id];
                const loggedItems = entry?.items || [];
                const mealMacros = sumMacros(loggedItems.map((i) => i.macros));
                const hasItems = loggedItems.length > 0;

                const mealPct = Math.min(
                  100,
                  Math.round(
                    (mealMacros.calories / Math.max(1, slot.targets.calories)) *
                      100
                  )
                );

                return (
                  <div
                    key={slot.id}
                    className="pro-card"
                    style={{
                      padding: 16,
                      borderRadius: 24,
                      borderColor:
                        hasItems && isObservationDay
                          ? 'var(--surface-2)'
                          : 'var(--line)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 12,
                      }}
                    >
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            width: 38,
                            height: 38,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg
                            width="38"
                            height="38"
                            viewBox="0 0 38 38"
                            style={{ transform: 'rotate(-90deg)' }}
                          >
                            <circle
                              cx="19"
                              cy="19"
                              r="15"
                              fill="none"
                              stroke="var(--surface-3)"
                              strokeWidth="3.2"
                            />
                            <circle
                              cx="19"
                              cy="19"
                              r="15"
                              fill="none"
                              stroke={
                                hasItems
                                  ? isObservationDay
                                    ? '#38bdf8'
                                    : 'var(--accent-volt)'
                                  : 'transparent'
                              }
                              strokeWidth="3.2"
                              strokeDasharray={`${(mealPct / 100) * 94.2} 94.2`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span
                            className="num-mono"
                            style={{
                              position: 'absolute',
                              fontSize: 13,
                              fontWeight: 800,
                              color: hasItems
                                ? isObservationDay
                                  ? '#38bdf8'
                                  : 'var(--accent-volt)'
                                : 'var(--text-muted)',
                            }}
                          >
                            0{idx + 1}
                          </span>
                        </div>

                        <div>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <span style={{ fontSize: 16, fontWeight: 800 }}>
                              {slot.name}
                            </span>
                            {(entry?.mealTime || slot.timeHint || onUpdateMealTime) && (
                              <button
                                type="button"
                                disabled={isBlockedDay || !onUpdateMealTime}
                                title={
                                  isBlockedDay
                                    ? 'יום חסום להזנה'
                                    : 'שינוי שעת הארוחה'
                                }
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isBlockedDay || !onUpdateMealTime) return;
                                  const baseTime =
                                    entry?.mealTime || slot.timeHint || '12:00';
                                  const timeMatch = baseTime.match(
                                    /^(\d{1,2}):(\d{2})$/
                                  );
                                  setDraftMealTime(
                                    timeMatch
                                      ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`
                                      : '12:00'
                                  );
                                  setTimeEditSlot(slot);
                                }}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 999,
                                  border: '1px solid var(--line)',
                                  background: 'var(--surface-2)',
                                  color: entry?.mealTime
                                    ? 'var(--text)'
                                    : 'var(--text-secondary)',
                                  minHeight: 26,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  opacity: isBlockedDay ? 0.5 : 1,
                                  cursor:
                                    isBlockedDay || !onUpdateMealTime
                                      ? 'default'
                                      : 'pointer',
                                }}
                              >
                                <Clock size={10} />
                                <span dir="ltr" className="num-mono">
                                  {entry?.mealTime || slot.timeHint || 'שעה'}
                                </span>
                              </button>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: 'var(--text-2)',
                              display: 'flex',
                              gap: 10,
                              marginTop: 3,
                            }}
                          >
                            <span style={{ color: 'var(--macro-protein)' }}>
                              ח׳{' '}
                              <span dir="ltr" className="num-mono">
                                {mealMacros.protein}
                                {!isObservationDay && `/${slot.targets.protein}`}g
                              </span>
                            </span>
                            <span style={{ color: 'var(--macro-carbs)' }}>
                              פ׳{' '}
                              <span dir="ltr" className="num-mono">
                                {mealMacros.carbs}
                                {!isObservationDay && `/${slot.targets.carbs}`}g
                              </span>
                            </span>
                            <span style={{ color: 'var(--macro-fat)' }}>
                              ש׳{' '}
                              <span dir="ltr" className="num-mono">
                                {mealMacros.fat}
                                {!isObservationDay && `/${slot.targets.fat}`}g
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <div
                          className="num-mono"
                          dir="ltr"
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: hasItems
                              ? 'var(--text-primary)'
                              : 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {mealMacros.calories}
                          {!isObservationDay && (
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: 'var(--text-2)',
                              }}
                            >
                              {' '}
                              / {slot.targets.calories}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: 'var(--text-3)',
                          }}
                        >
                          קק״ל
                        </div>
                      </div>
                    </div>

                    {hasItems && (
                      <div
                        style={{
                          background: 'var(--surface-2)',
                          borderRadius: 16,
                          minHeight: 40, padding: '0 14px',
                          marginBottom: 12,
                          border: '1px solid var(--fill-1)',
                        }}
                      >
                        {entry?.photoDataUrl && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              paddingBottom: 8,
                              marginBottom: 8,
                              borderBottom: '1px solid var(--line)',
                            }}
                          >
                            <img
                              src={entry.photoDataUrl}
                              alt={slot.name}
                              style={{
                                width: 46,
                                height: 46,
                                borderRadius: 10,
                                objectFit: 'cover',
                              }}
                            />
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: 'var(--accent-volt)',
                                }}
                              >
                                פוענח מצילום AI
                              </div>
                              {entry.photoNote && (
                                <div
                                  style={{
                                    fontSize: 13,
                                    color: 'var(--text-2)',
                                  }}
                                >
                                  {entry.photoNote}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {loggedItems.map((item, i) => (
                          <div
                            key={item.id}
                            onClick={() => {
                              if (!isBlockedDay) openMealDrawer(slot, 'catalog');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 0',
                              cursor: isBlockedDay ? 'default' : 'pointer',
                              borderBottom:
                                i < loggedItems.length - 1
                                  ? '1px solid var(--fill-1)'
                                  : 'none',
                            }}
                          >
                            <div style={{ minWidth: 0, paddingLeft: 8 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {item.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 13,
                                  color: 'var(--text-3)',
                                }}
                              >
                                {item.unitLabel} · ח׳ {item.macros.protein}g · פ׳{' '}
                                {item.macros.carbs}g · ש׳ {item.macros.fat}g
                              </div>
                            </div>

                            <div
                              className="num-mono"
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {item.macros.calories}{' '}
                              <span
                                style={{
                                  fontSize: 13,
                                  color: 'var(--text-3)',
                                  fontWeight: 500,
                                }}
                              >
                                קק״ל
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {entry?.coachFeedback && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 10,
                          padding: '10px 12px',
                          borderRadius: 12,
                          background: 'var(--fill-1)',
                          border: '1px solid var(--line-2)',
                          marginBottom: 12,
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

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                        gap: 6,
                      }}
                    >
                      {(trainee.mealCardShortcuts ?? DEFAULT_MEAL_CARD_SHORTCUTS)
                        .slice(0, 2)
                        .map((scId) => {
                          const meta = ALL_MEAL_SHORTCUT_OPTIONS.find(
                            (o) => o.id === scId
                          );
                          if (!meta) return null;
                          const renderIcon = () => {
                            switch (scId) {
                              case 'ai-recommend':
                                return (
                                  <Lightbulb
                                    size={13}
                                    color="var(--accent-orange-bright)"
                                  />
                                );
                              case 'saved-meals':
                                return (
                                  <Bookmark
                                    size={13}
                                    color="var(--text-secondary)"
                                  />
                                );
                              case 'ai-photo':
                                return (
                                  <Camera
                                    size={13}
                                    color="var(--accent-orange-bright)"
                                  />
                                );
                              case 'ai-text':
                                return (
                                  <Sparkles
                                    size={13}
                                    color="var(--accent-orange-bright)"
                                  />
                                );
                              case 'barcode':
                                return (
                                  <Barcode
                                    size={13}
                                    color="var(--text-secondary)"
                                  />
                                );
                              case 'favorites':
                                return (
                                  <Heart
                                    size={13}
                                    color="var(--text-secondary)"
                                  />
                                );
                            }
                          };
                          return (
                            <button
                              key={scId}
                              type="button"
                              disabled={isBlockedDay}
                              title={isBlockedDay ? 'יום חסום להזנה' : meta.description}
                              onClick={() => openMealDrawer(slot, scId)}
                              className="btn-surface"
                              style={{
                                padding: '9px 10px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: 13,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                opacity: isBlockedDay ? 0.45 : 1,
                                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {renderIcon()}
                              <span>{meta.shortLabel}</span>
                            </button>
                          );
                        })}

                      <button
                        type="button"
                        disabled={isBlockedDay}
                        onClick={() => openMealDrawer(slot, 'hub')}
                        className={hasItems ? 'btn-surface' : 'btn-volt'}
                        style={{
                          flex: '1 1 auto',
                          minWidth: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 5,
                          padding: '9px 10px',
                          fontSize: 13,
                          whiteSpace: 'nowrap',
                          opacity: isBlockedDay ? 0.45 : 1,
                          cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Plus size={14} style={{ flexShrink: 0 }} />
                        <span>{hasItems ? 'הוסף / ערוך' : 'הזן ארוחה'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : mobileSection === 'metrics' ? (
          /* טאב מדדים, מים, משקל גוף והיקפים */
          <motion.div
            key="metrics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            {/* כרטיס היקפי גוף ומדריך מדידה מונפש */}
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

            {/* כרטיס הידרציה / שתיית מים */}
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
                    <Droplets size={18} color="var(--text)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      מאזן נוזלים יומי
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      כל כוס = 250 מ״ל ({dailyLog.waterCups * 0.25} ליטר היום)
                    </div>
                  </div>
                </div>
                <div
                  className="num-mono"
                  style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}
                >
                  {dailyLog.waterCups} / {dailyLog.waterGoal}
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {Array.from({ length: dailyLog.waterGoal }).map((_, i) => {
                  const filled = i < dailyLog.waterCups;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={isBlockedDay}
                      onClick={() => {
                        if (!isBlockedDay) {
                          onUpdateWater(trainee.id, selectedDate, i + 1);
                        }
                      }}
                      style={{
                        height: 44,
                        borderRadius: 18,
                        border: filled ? '1px solid var(--accent)' : '1px solid var(--line)',
                        background: filled ? 'var(--accent)' : 'var(--surface-2)',
                        color: filled ? 'var(--on-accent)' : 'var(--text-muted)',
                        fontFamily: 'var(--font-num)',
                        fontWeight: 700,
                        fontSize: 13,
                        opacity: isBlockedDay ? 0.45 : 1,
                        cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* כרטיס מעקב משקל גוף ומגמה */}
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
                    <Scale size={18} color="currentColor" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      מגמת משקל גוף
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      יעד מאמן: {trainee.targetWeight} ק״ג
                    </div>
                  </div>
                </div>
                <div
                  className="num-mono"
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: 'var(--accent-volt)',
                  }}
                >
                  {trainee.currentWeight} ק״ג
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.max(
                    1,
                    Math.min(5, trainee.weightHistory.length)
                  )}, 1fr)`,
                  gap: 8,
                  marginBottom: 14,
                }}
              >
                {trainee.weightHistory.slice(-5).map((w, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--surface-2)',
                      padding: '8px 6px',
                      borderRadius: 18,
                      textAlign: 'center',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div
                      className="num-mono"
                      style={{ fontSize: 17, fontWeight: 700 }}
                    >
                      {w.weight}
                    </div>
                    <bdi dir="ltr" className="ltr-num" style={{ fontSize: 13, color: 'var(--text-3)' }}>
                      {w.date.slice(8, 10)}.{w.date.slice(5, 7)}
                    </bdi>
                  </div>
                ))}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (isBlockedDay || weightLockRef.current) return;
                  const num = parseFloat(weightInput);
                  if (isNaN(num) || num < 30 || num > 250) {
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
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  dir="ltr"
                  aria-label="שקילת היום בק״ג"
                  placeholder="שקילת היום (ק״ג)"
                  disabled={savingWeight || isBlockedDay}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
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

            {/* צ'ק-אין שבועי + דו"ח סיכום (design: CheckIn) */}
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
                  disabled={savingCheckIn}
                  onClick={async () => {
                    if (!onSaveWeeklyCheckIn || checkInLockRef.current) return;
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
          </motion.div>
        ) : (
          /* טאב פרופיל: הארוחות שלי, סטטיסטיקות, הגדרות פושים ושינוי שם */
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
              onOpenMealFromHistory={(date, mealSlotId) => {
                setMobileSection('journal');
                setSelectedDate(date);
                const targetSlot = findTraineeMealSlotById(trainee, mealSlotId);
                if (targetSlot) {
                  setActiveMealSlot(targetSlot);
                  setDrawerTab('hub');
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
      />

      {/* מודאל מדידת היקפים מונפש */}
      <Modal
        opened={measurementModalOpen}
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

      <AddMealDrawer
        opened={Boolean(activeMealSlot)}
        onClose={() => setActiveMealSlot(null)}
        mealSlot={activeMealSlot}
        mealSlotOptions={activeTemplate.meals}
        onChangeMealSlot={(slot) => setActiveMealSlot(slot)}
        existingEntry={
          activeMealSlot ? dailyLog.meals[activeMealSlot.id] : undefined
        }
        favoriteIds={trainee.favoriteFoodIds}
        onToggleFavorite={(foodId) => onToggleFavorite(trainee.id, foodId)}
        onSaveMeal={(slotId, items, photoDataUrl, photoNote, photoDataUrls, mealTime) =>
          onSaveMeal(
            trainee.id,
            selectedDate,
            slotId,
            items,
            photoDataUrl,
            photoNote,
            photoDataUrls,
            mealTime
          )
        }
        initialTab={drawerTab}
        traineeId={trainee.id}
        traineeName={trainee.name}
        learnedPreferences={trainee.aiLearnedPreferences || []}
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
        selectedDate={selectedDate}
        backgroundAiJobs={backgroundAiJobs}
        onStartBackgroundAiAnalysis={onStartBackgroundAiAnalysis}
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
