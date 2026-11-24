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
  Loader2,
  Bookmark,
  CalendarDays,
  ChevronRight,
  ChevronLeft,
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
        paddingBottom: 96,
      }}
    >
      {isCoachPreview && onExitCoachPreview && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 14,
            background: 'rgba(214, 125, 9, 0.12)',
            border: '1px solid rgba(214, 125, 9, 0.35)',
            marginBottom: 14,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--accent-volt)',
            }}
          >
            תצוגת מאמן: צופה באפליקציה של {trainee.name}
          </span>
          <button
            onClick={onExitCoachPreview}
            className="btn-volt"
            style={{
              padding: '5px 12px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            חזרה לדשבורד מאמן
          </button>
        </div>
      )}

      {/* תזכורת להשלמת מדידת היקפים אם המתאמן דילג עליה ב-Onboarding */}
      {!trainee.onboarding?.measurementsCompleted && !latestMeasurement && (
        <div
          onClick={() => setMeasurementModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 14,
            background: 'rgba(56, 189, 248, 0.1)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            marginBottom: 12,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ruler size={16} color="#38bdf8" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
              טרם השלמת מדידת היקפים ראשונית – לחץ להדרכה מונפשת
            </span>
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: '#38bdf8',
              textDecoration: 'underline',
            }}
          >
            השלם כעת
          </span>
        </div>
      )}

      {/* כותרת אפליקציית המובייל של המתאמן המחובר + מתג יום אימון/מנוחה */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 999,
            padding: '6px 14px 6px 10px',
            color: 'var(--text-primary)',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--accent-volt)',
              color: 'var(--on-accent)',
              fontWeight: 800,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {trainee.avatar}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.1 }}>
              {trainee.name}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
              {trainee.goal}
            </div>
          </div>
          <button
            title="עדכון שאלון פרופיל והעדפות"
            onClick={() => setEditingOnboarding(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
            }}
          >
            <ClipboardCheck size={14} />
          </button>
        </div>

        {/* מתג קפסולה: יום אימון / יום מנוחה (מוצג אך ורק אם המאמן הפעיל פיצול תפריט אימון/מנוחה למתאמן זה) */}
        {Boolean(trainee.enableWorkoutRestSplit) && (
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 999,
              padding: 3,
            }}
          >
            <button
              disabled={isBlockedDay}
              onClick={() =>
                !isBlockedDay && onUpdateDayType(trainee.id, selectedDate, 'workout')
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                opacity: isBlockedDay ? 0.45 : 1,
                background:
                  dailyLog.dayType === 'workout'
                    ? 'var(--accent-volt)'
                    : 'transparent',
                color:
                  dailyLog.dayType === 'workout'
                    ? 'var(--text)'
                    : 'var(--text-secondary)',
                transition: 'all 0.18s ease',
              }}
            >
              <Dumbbell size={13} />
              <span>אימון</span>
            </button>
            <button
              disabled={isBlockedDay}
              onClick={() =>
                !isBlockedDay && onUpdateDayType(trainee.id, selectedDate, 'rest')
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                opacity: isBlockedDay ? 0.45 : 1,
                background:
                  dailyLog.dayType === 'rest' ? 'var(--text)' : 'transparent',
                color:
                  dailyLog.dayType === 'rest'
                    ? '#08090c'
                    : 'var(--text-secondary)',
                transition: 'all 0.18s ease',
              }}
            >
              <Moon size={13} />
              <span>מנוחה</span>
            </button>
          </div>
        )}
      </div>

      {/* סרגל תאריכים שבועי + ניווט שבועות ולוח חודשי פעיל */}
      <div
        className="pro-card"
        style={{
          padding: '10px 10px 10px',
          marginBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <button
              type="button"
              disabled={!canPrevWeek}
              title="שבוע קודם"
              onClick={() => {
                const candidates = getWeekDaysAroundDate(prevWeekAnchor, todayIso).filter(
                  (d) => isDateActiveForTrainee(d.iso, trainee, todayIso)
                );
                if (candidates.length > 0) {
                  setSelectedDate(candidates[candidates.length - 1].iso);
                }
              }}
              className="btn-surface"
              style={{
                width: 28,
                height: 28,
                padding: 0,
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canPrevWeek ? 'pointer' : 'not-allowed',
                opacity: canPrevWeek ? 1 : 0.35,
              }}
            >
              <ChevronRight size={14} />
            </button>

            <button
              type="button"
              onClick={() => {
                const [y, m] = selectedDate.split('-').map(Number);
                if (y && m) setCalendarCursor({ year: y, month: m - 1 });
                setCalendarModalOpen(true);
              }}
              className="btn-surface"
              style={{
                padding: '5px 10px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <CalendarDays size={13} color="var(--accent-volt)" />
              <span>
                {(() => {
                  const [y, m] = selectedDate.split('-').map(Number);
                  return `${HEBREW_MONTH_NAMES[(m || 1) - 1]} ${y}`;
                })()}
              </span>
            </button>

            <button
              type="button"
              disabled={!canNextWeek}
              title="שבוע הבא"
              onClick={() => {
                const candidates = getWeekDaysAroundDate(nextWeekAnchor, todayIso).filter(
                  (d) => isDateActiveForTrainee(d.iso, trainee, todayIso)
                );
                if (candidates.length > 0) {
                  setSelectedDate(candidates[0].iso);
                }
              }}
              className="btn-surface"
              style={{
                width: 28,
                height: 28,
                padding: 0,
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: canNextWeek ? 'pointer' : 'not-allowed',
                opacity: canNextWeek ? 1 : 0.35,
              }}
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          {selectedDate !== todayIso ? (
            <button
              type="button"
              onClick={() => setSelectedDate(todayIso)}
              style={{
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid rgba(214, 125, 9, 0.45)',
                background: 'rgba(214, 125, 9, 0.14)',
                color: 'var(--accent-orange-bright)',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              חזור להיום
            </button>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>
              היום
            </span>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4,
          }}
        >
          {weekDays.map((d) => {
            const isSelected = d.iso === selectedDate;
            const isActive = isDateActiveForTrainee(d.iso, trainee, todayIso);
            const isObs =
              (trainee.observationDates || []).includes(d.iso) ||
              Boolean(trainee.logs[d.iso]?.isObservationDay);
            const isBlockedCell = isDayBlockedForTrainee(d.iso, trainee);
            const hasLog =
              trainee.logs[d.iso] &&
              Object.keys(trainee.logs[d.iso].meals || {}).length > 0;
            return (
              <button
                key={d.iso}
                type="button"
                disabled={!isActive}
                onClick={() => {
                  if (isActive) setSelectedDate(d.iso);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  padding: '8px 2px',
                  borderRadius: 14,
                  border: isSelected
                    ? isBlockedCell
                      ? '1px solid rgba(239, 68, 68, 0.7)'
                      : isObs
                      ? '1px solid rgba(56, 189, 248, 0.55)'
                      : '1px solid rgba(214, 125, 9, 0.55)'
                    : isBlockedCell
                    ? '1px solid rgba(239, 68, 68, 0.25)'
                    : '1px solid transparent',
                  background: isSelected
                    ? isBlockedCell
                      ? 'rgba(239, 68, 68, 0.16)'
                      : isObs
                      ? 'rgba(56, 189, 248, 0.14)'
                      : 'rgba(214, 125, 9, 0.16)'
                    : isBlockedCell
                    ? 'rgba(239, 68, 68, 0.06)'
                    : 'transparent',
                  color: isSelected
                    ? isBlockedCell
                      ? '#f87171'
                      : isObs
                      ? '#38bdf8'
                      : 'var(--accent-orange-bright)'
                    : 'var(--text-secondary)',
                  opacity: isActive ? 1 : 0.3,
                  cursor: isActive ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 600 }}>
                  {d.dayLetter}
                </span>
                <span
                  className="num-mono"
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: isSelected
                      ? isBlockedCell
                        ? '#f87171'
                        : isObs
                        ? '#38bdf8'
                        : 'var(--text)'
                      : 'var(--text-primary)',
                  }}
                >
                  {d.dayNumber}
                </span>
                {isBlockedCell ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#f87171',
                      lineHeight: 1,
                    }}
                  >
                    חסום
                  </span>
                ) : isObs ? (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#38bdf8',
                      lineHeight: 1,
                    }}
                  >
                    תשקיף
                  </span>
                ) : (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: hasLog
                        ? 'var(--accent-volt)'
                        : d.isToday
                        ? 'rgba(255,255,255,0.45)'
                        : 'transparent',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

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
                <Ban size={18} color="#f87171" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 800, color: '#f87171' }}>
                    יום חסום להזנה
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
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
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Eye size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                    יום תשקיף (ללא מטרת יעד קלורי)
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    תיעוד חופשי ללא חישוב חריגה מהיעד.
                  </div>
                  {obsLockedToObservation && (
                    <div
                      style={{
                        marginTop: 3,
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#7dd3fc',
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

            {/* קוקפיט קלוריות ומאקרו יומי */}
            <div
              className="pro-card-elevated"
              style={{
                padding: '22px 20px 20px',
                marginBottom: 20,
                position: 'relative',
                overflow: 'hidden',
                borderColor: isObservationDay
                  ? 'rgba(56, 189, 248, 0.3)'
                  : undefined,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -70,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 240,
                  height: 140,
                  background: isObservationDay
                    ? 'radial-gradient(circle, rgba(56, 189, 248, 0.16) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(214, 125, 9, 0.13) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto 1fr',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {/* נצרך בפועל */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    סה״כ הוזן
                  </div>
                  <div
                    className="num-mono"
                    style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}
                  >
                    {dailyConsumed.calories.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    קק״ל נספרו
                  </div>
                </div>

                {/* מד קשת SVG מרכזי */}
                <div
                  style={{
                    position: 'relative',
                    width: 180,
                    height: 150,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    width="180"
                    height="180"
                    viewBox="0 0 180 180"
                    style={{ transform: 'rotate(140deg)' }}
                  >
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="none"
                      stroke="var(--surface-3)"
                      strokeWidth="12"
                      strokeDasharray={`${arcLength} ${circumference}`}
                      strokeLinecap="round"
                    />
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="none"
                      stroke={
                        isObservationDay
                          ? '#38bdf8'
                          : isOverLimit
                          ? '#f59e0b'
                          : '#d67d09'
                      }
                      strokeWidth="12"
                      strokeDasharray={`${filledArc} ${circumference}`}
                      strokeLinecap="round"
                      style={{
                        transition:
                          'stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                        filter: isObservationDay
                          ? 'drop-shadow(0 0 10px rgba(56, 189, 248, 0.35))'
                          : isOverLimit
                          ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.35))'
                          : 'drop-shadow(0 0 10px rgba(214, 125, 9, 0.35))',
                      }}
                    />
                  </svg>

                  <div
                    style={{
                      position: 'absolute',
                      top: '52%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      textAlign: 'center',
                    }}
                  >
                    {isObservationDay ? (
                      <>
                        <div
                          className="num-mono"
                          style={{
                            fontSize: 32,
                            fontWeight: 800,
                            lineHeight: 1,
                            color: 'var(--text)',
                          }}
                        >
                          {dailyConsumed.calories.toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#38bdf8',
                            marginTop: 4,
                          }}
                        >
                          קק״ל ביום תשקיף
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                          }}
                        >
                          ללא הגבלת יעד יומי
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="num-mono"
                          style={{
                            fontSize: 34,
                            fontWeight: 800,
                            lineHeight: 1,
                            color: isOverLimit ? '#f59e0b' : 'var(--text)',
                          }}
                        >
                          {Math.abs(remainingCalories).toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: isOverLimit
                              ? '#f59e0b'
                              : 'var(--accent-orange-bright)',
                            marginTop: 5,
                          }}
                        >
                          {remainingCalories >= 0
                            ? 'קק״ל נותרו'
                            : 'קק״ל מעל היעד'}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* יעד מאמן */}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    {isObservationDay ? 'מצב יום' : 'יעד יומי'}
                  </div>
                  <div
                    className="num-mono"
                    style={{
                      fontSize: isObservationDay ? 16 : 22,
                      fontWeight: 800,
                      color: isObservationDay
                        ? '#38bdf8'
                        : 'var(--text-primary)',
                    }}
                  >
                    {isObservationDay
                      ? 'תשקיף'
                      : dailyTarget.calories.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {activeTemplate.meals.length} ארוחות
                  </div>
                </div>
              </div>

              {/* שלוש עמודות אבות המזון */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 10,
                  marginTop: 14,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                {[
                  {
                    label: 'חלבון',
                    consumed: dailyConsumed.protein,
                    target: dailyTarget.protein,
                    color: 'var(--macro-protein)',
                  },
                  {
                    label: 'פחמימות',
                    consumed: dailyConsumed.carbs,
                    target: dailyTarget.carbs,
                    color: 'var(--macro-carbs)',
                  },
                  {
                    label: 'שומנים',
                    consumed: dailyConsumed.fat,
                    target: dailyTarget.fat,
                    color: 'var(--macro-fat)',
                  },
                ].map((m) => {
                  const pct = isObservationDay
                    ? Math.min(100, Math.round((m.consumed / 150) * 100))
                    : Math.min(
                        100,
                        Math.round((m.consumed / Math.max(1, m.target)) * 100)
                      );
                  const left = Math.max(0, Math.round(m.target - m.consumed));
                  return (
                    <div
                      key={m.label}
                      style={{
                        background: 'var(--fill-1)',
                        border: '1px solid var(--fill-1)',
                        borderRadius: 14,
                        padding: '10px 9px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minWidth: 0,
                      }}
                    >
                      <div style={{ marginBottom: 6 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: m.color,
                            whiteSpace: 'nowrap',
                            lineHeight: 1.2,
                          }}
                        >
                          {m.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            marginTop: 2,
                          }}
                        >
                          {isObservationDay ? 'נספר' : `נותר ${left}g`}
                        </div>
                      </div>

                      <div>
                        <div
                          className="num-mono"
                          dir="ltr"
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            marginBottom: 7,
                            whiteSpace: 'nowrap',
                            textAlign: 'right',
                          }}
                        >
                          {m.consumed}g
                          {!isObservationDay && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {' '}
                              / {m.target}g
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            height: 5,
                            width: '100%',
                            background: 'var(--line)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: m.color,
                              borderRadius: 999,
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* כותרת ציר זמן הארוחות */}
            {(() => {
              const actTargets = trainee.activityTargets || {
                weeklyWorkoutsTarget: 4,
                workoutTypes: ['אימון כוח A', 'אימון כוח B', 'Full Body'],
                weeklyCardioTarget: 3,
                cardioMode: 'both' as const,
                cardioTargetMinutes: 35,
                dailySleepTargetHours: 7.5,
              };

              // חישוב ביצוע שבועי מתוך 7 הימים בשבוע הנוכחי
              const workoutsThisWeek = weekDays.filter(
                (wd) => trainee.logs[wd.iso]?.workoutLog?.completed
              ).length;
              const cardioThisWeek = weekDays.filter(
                (wd) => trainee.logs[wd.iso]?.cardioLog?.completed
              ).length;
              const todayWorkout = dailyLog.workoutLog;
              const todayCardio = dailyLog.cardioLog;
              const todaySleep = dailyLog.sleepHours;
              const dailyStepsTarget = actTargets.dailyStepsTarget ?? 8000;
              const hasSyncedSteps =
                isNativeAndroidApp() ||
                Boolean(dailyLog.stepsSource && dailyLog.stepsSource !== 'manual');
              const remainingWorkouts = Math.max(
                0,
                actTargets.weeklyWorkoutsTarget - workoutsThisWeek
              );
              const remainingCardio = Math.max(
                0,
                actTargets.weeklyCardioTarget - cardioThisWeek
              );
              const currentSteps = dailyLog.steps ?? 0;
              const remainingSteps = Math.max(0, dailyStepsTarget - currentSteps);

              return (
                <div
                  className="pro-card"
                  style={{
                    padding: 16,
                    marginBottom: 18,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 800 }}>
                      {hasSyncedSteps
                        ? `אימונים, צעדים, הליכה/ריצה ושינה (${selectedDate})`
                        : `אימונים, הליכה/ריצה ושינה (${selectedDate})`}
                    </span>
                  </div>

                  {/* טבעות יעד אינטואיטיביות ("כמו הקלוריות שנותרו") */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: hasSyncedSteps
                        ? 'repeat(3, 1fr)'
                        : 'repeat(2, 1fr)',
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--bg-surface-2)',
                        borderRadius: 14,
                        padding: '10px 8px',
                        border:
                          remainingWorkouts === 0
                            ? '1px solid rgba(214, 125, 9, 0.42)'
                            : '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                        <CompactMiniRing
                          current={workoutsThisWeek}
                          target={actTargets.weeklyWorkoutsTarget}
                          color="var(--accent-volt)"
                        />
                        <Dumbbell
                          size={14}
                          color="var(--accent-orange-bright)"
                          style={{ position: 'absolute' }}
                        />
                      </div>
                      <div className="num-mono" style={{ fontSize: 13, fontWeight: 900 }}>
                        {remainingWorkouts === 0
                          ? 'יעד הושלם ✓'
                          : `נותרו ${remainingWorkouts}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                        אימונים ({workoutsThisWeek}/{actTargets.weeklyWorkoutsTarget})
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-surface-2)',
                        borderRadius: 14,
                        padding: '10px 8px',
                        border:
                          remainingCardio === 0
                            ? '1px solid rgba(214, 125, 9, 0.42)'
                            : '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                        <CompactMiniRing
                          current={cardioThisWeek}
                          target={actTargets.weeklyCardioTarget}
                          color="#eb931c"
                        />
                        <Activity
                          size={14}
                          color="var(--accent-orange-bright)"
                          style={{ position: 'absolute' }}
                        />
                      </div>
                      <div className="num-mono" style={{ fontSize: 13, fontWeight: 900 }}>
                        {remainingCardio === 0
                          ? 'יעד הושלם ✓'
                          : `נותרו ${remainingCardio}`}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                        הליכה/ריצה ({cardioThisWeek}/{actTargets.weeklyCardioTarget})
                      </div>
                    </div>

                    {hasSyncedSteps && (
                      <div
                        style={{
                          background: 'var(--bg-surface-2)',
                          borderRadius: 14,
                          padding: '10px 8px',
                          border:
                            remainingSteps === 0
                              ? '1px solid rgba(214, 125, 9, 0.42)'
                              : '1px solid var(--border-subtle)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 6,
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
                          <CompactMiniRing
                            current={currentSteps}
                            target={dailyStepsTarget}
                            color="#b36206"
                          />
                          <Footprints
                            size={14}
                            color="var(--accent-orange-bright)"
                            style={{ position: 'absolute' }}
                          />
                        </div>
                        <div className="num-mono" style={{ fontSize: 12, fontWeight: 900 }}>
                          {remainingSteps === 0
                            ? 'יעד הושלם ✓'
                            : `נותרו ${remainingSteps.toLocaleString()}`}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
                          צעדים ({currentSteps.toLocaleString()})
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 0. מד צעדים יומי מוצג אך ורק כשקיים סנכרון אמיתי (Health Connect / Play Services / חיישן מכשיר) */}
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

                  {/* 1. אימון יומי + סוג אימון */}
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: todayWorkout?.completed
                        ? '1px solid rgba(214, 125, 9, 0.35)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        <Dumbbell size={14} color="var(--accent-volt)" />
                        <span>אימון היום (בחר סוג אימון שביצעת):</span>
                      </div>
                      <span
                        className="num-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color:
                            workoutsThisWeek >= actTargets.weeklyWorkoutsTarget
                              ? 'var(--accent-volt)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        השבוע: {workoutsThisWeek} /{' '}
                        {actTargets.weeklyWorkoutsTarget} אימונים
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(actTargets.workoutTypes.length > 0
                        ? actTargets.workoutTypes
                        : ['אימון כוח A', 'אימון כוח B', 'Full Body']
                      ).map((wType) => {
                        const isSelected =
                          todayWorkout?.completed &&
                          todayWorkout.workoutType === wType;
                        return (
                          <button
                            key={wType}
                            type="button"
                            disabled={isBlockedDay}
                            onClick={() => {
                              if (isBlockedDay) return;
                              const nextCompleted = !isSelected;
                              onUpdateDailyActivity(trainee.id, selectedDate, {
                                workoutLog: isSelected
                                  ? { completed: false }
                                  : {
                                      completed: true,
                                      workoutType: wType,
                                      durationMinutes: 50,
                                    },
                              });
                              if (
                                nextCompleted &&
                                Boolean(trainee.enableWorkoutRestSplit)
                              ) {
                                onUpdateDayType(
                                  trainee.id,
                                  selectedDate,
                                  'workout'
                                );
                              }
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 999,
                              border: isSelected ? '1px solid var(--sel-bg)'
                                : '1px solid var(--border-subtle)',
                              background: isSelected ? 'var(--sel-bg)'
                                : 'var(--bg-surface-1)',
                              color: isSelected ? 'var(--sel-text)'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 700,
                              opacity: isBlockedDay ? 0.45 : 1,
                              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {isSelected ? `✓ ${wType}` : wType}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. הליכה / ריצה יומית */}
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: todayCardio?.completed
                        ? '1px solid rgba(214, 125, 9, 0.4)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        <Activity size={14} color="var(--accent-orange-bright)" />
                        <span>
                          הליכה / ריצה היום (יעד: {actTargets.cardioTargetMinutes}{' '}
                          דק׳):
                        </span>
                      </div>
                      <span
                        className="num-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color:
                            cardioThisWeek >= actTargets.weeklyCardioTarget
                              ? 'var(--accent-orange-bright)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        השבוע: {cardioThisWeek} / {actTargets.weeklyCardioTarget}{' '}
                        פעמים
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {[
                        {
                          label: `הליכה (${actTargets.cardioTargetMinutes} דק׳)`,
                          mode: 'walk' as const,
                          mins: actTargets.cardioTargetMinutes,
                        },
                        {
                          label: 'הליכה מהירה (45 דק׳)',
                          mode: 'walk' as const,
                          mins: 45,
                        },
                        {
                          label: 'ריצה (25 דק׳)',
                          mode: 'run' as const,
                          mins: 25,
                        },
                        {
                          label: 'ריצה (40 דק׳)',
                          mode: 'run' as const,
                          mins: 40,
                        },
                      ].map((cOpt) => {
                        const isSelected =
                          todayCardio?.completed &&
                          todayCardio.label === cOpt.label;
                        return (
                          <button
                            key={cOpt.label}
                            type="button"
                            disabled={isBlockedDay}
                            onClick={() => {
                              if (isBlockedDay) return;
                              onUpdateDailyActivity(trainee.id, selectedDate, {
                                cardioLog: isSelected
                                  ? { completed: false }
                                  : {
                                      completed: true,
                                      mode: cOpt.mode,
                                      label: cOpt.label,
                                      durationMinutes: cOpt.mins,
                                    },
                              });
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 999,
                              border: isSelected ? '1px solid var(--sel-bg)'
                                : '1px solid var(--border-subtle)',
                              background: isSelected ? 'var(--sel-bg)'
                                : 'var(--bg-surface-1)',
                              color: isSelected ? 'var(--sel-text)'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                              opacity: isBlockedDay ? 0.45 : 1,
                            }}
                          >
                            {isSelected ? `✓ ${cOpt.label}` : cOpt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. שעות שינה הלילה */}
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: todaySleep
                        ? '1px solid rgba(214, 125, 9, 0.4)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        <Moon size={14} color="var(--accent-orange-bright)" />
                        <span>כמה שעות ישנת הלילה?</span>
                      </div>
                      <span
                        className="num-mono"
                        style={{
                          fontSize: 11,
                          fontWeight: 800,
                          color:
                            (todaySleep || 0) >=
                            actTargets.dailySleepTargetHours
                              ? 'var(--accent-orange-bright)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {todaySleep ?? 0} / {actTargets.dailySleepTargetHours}{' '}
                        שעות (יעד)
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                      }}
                    >
                      {[5, 6, 6.5, 7, 7.5, 8, 8.5].map((hrs) => {
                        const isSelected = todaySleep === hrs;
                        return (
                          <button
                            key={hrs}
                            type="button"
                            disabled={isBlockedDay}
                            onClick={() => {
                              if (isBlockedDay) return;
                              setCustomSleepOpen(false);
                              onUpdateDailyActivity(trainee.id, selectedDate, {
                                sleepHours: hrs,
                              });
                            }}
                            className="num-mono"
                            style={{
                              padding: '6px 2px',
                              borderRadius: 8,
                              border: isSelected ? '1px solid var(--sel-bg)'
                                : '1px solid var(--border-subtle)',
                              background: isSelected ? 'var(--sel-bg)'
                                : 'var(--bg-surface-1)',
                              color: isSelected ? 'var(--sel-text)'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                              opacity: isBlockedDay ? 0.45 : 1,
                            }}
                          >
                            {hrs}h
                          </button>
                        );
                      })}
                      {(() => {
                        const isCustomValue =
                          todaySleep !== undefined &&
                          ![5, 6, 6.5, 7, 7.5, 8, 8.5].includes(todaySleep);
                        const isSelected = customSleepOpen || isCustomValue;
                        return (
                          <button
                            type="button"
                            disabled={isBlockedDay}
                            onClick={() => {
                              if (isBlockedDay) return;
                              setCustomSleepDraft(
                                todaySleep !== undefined ? String(todaySleep) : '9'
                              );
                              setCustomSleepOpen((prev) => !prev);
                            }}
                            style={{
                              padding: '6px 2px',
                              borderRadius: 8,
                              border: isSelected ? '1px solid var(--sel-bg)'
                                : '1px solid var(--border-subtle)',
                              background: isSelected ? 'var(--sel-bg)'
                                : 'var(--bg-surface-1)',
                              color: isSelected ? 'var(--sel-text)'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                              opacity: isBlockedDay ? 0.45 : 1,
                            }}
                          >
                            {isCustomValue ? `${todaySleep}h` : 'אחר'}
                          </button>
                        );
                      })()}
                    </div>

                    {customSleepOpen && !isBlockedDay && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const parsed = parseFloat(customSleepDraft);
                          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 24) {
                            return;
                          }
                          const rounded = Math.round(parsed * 10) / 10;
                          onUpdateDailyActivity(trainee.id, selectedDate, {
                            sleepHours: rounded,
                          });
                          setCustomSleepOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 8,
                        }}
                      >
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          max={24}
                          dir="ltr"
                          value={customSleepDraft}
                          onChange={(e) => setCustomSleepDraft(e.target.value)}
                          placeholder="למשל 9 או 4.5"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: 'var(--bg-surface-1)',
                            border: '1px solid rgba(214, 125, 9, 0.45)',
                            borderRadius: 8,
                            padding: '6px 10px',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            fontWeight: 700,
                            textAlign: 'center',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="submit"
                          className="btn-volt"
                          style={{
                            padding: '6px 12px',
                            fontSize: 11.5,
                            cursor: 'pointer',
                          }}
                        >
                          שמור שעות
                        </button>
                      </form>
                    )}
                  </div>
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
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--bg-surface-2)',
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
                      padding: '5px 10px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                      borderColor:
                        answeredCount > 0
                          ? 'rgba(214, 125, 9, 0.45)'
                          : 'var(--border-subtle)',
                      color:
                        answeredCount > 0
                          ? 'var(--accent-volt)'
                          : 'var(--text-primary)',
                    }}
                  >
                    <Bookmark size={12} color="var(--accent-volt)" />
                    <span>הארוחות והכלים שלי</span>
                    {(trainee.savedMeals?.length || 0) > 0 && (
                      <span
                        className="num-mono"
                        style={{
                          fontSize: 10,
                          padding: '1px 5px',
                          borderRadius: 999,
                          background: 'rgba(214, 125, 9, 0.14)',
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
                      borderColor: hasItems
                        ? isObservationDay
                          ? 'rgba(56, 189, 248, 0.3)'
                          : 'rgba(214, 125, 9, 0.22)'
                        : 'var(--border-subtle)',
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
                              fontSize: 11,
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
                                  border: entry?.mealTime
                                    ? '1px solid rgba(214, 125, 9, 0.4)'
                                    : '1px solid var(--line)',
                                  background: entry?.mealTime
                                    ? 'rgba(214, 125, 9, 0.14)'
                                    : 'var(--fill-1)',
                                  color: entry?.mealTime
                                    ? 'var(--accent-orange-bright)'
                                    : 'var(--text-secondary)',
                                  fontSize: 11,
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
                              fontSize: 12,
                              color: 'var(--text-secondary)',
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
                                fontSize: 12,
                                fontWeight: 500,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {' '}
                              / {slot.targets.calories}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                          }}
                        >
                          קק״ל
                        </div>
                      </div>
                    </div>

                    {hasItems && (
                      <div
                        style={{
                          background: 'rgba(0, 0, 0, 0.25)',
                          borderRadius: 14,
                          padding: '8px 12px',
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
                                  fontSize: 11,
                                  fontWeight: 700,
                                  color: 'var(--accent-volt)',
                                }}
                              >
                                פוענח מצילום AI
                              </div>
                              {entry.photoNote && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--text-secondary)',
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
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
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
                                  fontSize: 10,
                                  color: 'var(--text-muted)',
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
                          background: 'rgba(214, 125, 9, 0.07)',
                          border: '1px solid rgba(214, 125, 9, 0.22)',
                          marginBottom: 12,
                        }}
                      >
                        <MessageSquare
                          size={15}
                          color="var(--accent-volt)"
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
                                fontSize: 11.5,
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
                          fontSize: 12.5,
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
            <div className="pro-card" style={{ padding: 18 }}>
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
                      borderRadius: 10,
                      background: 'rgba(214, 125, 9, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ruler size={18} color="var(--accent-volt)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      מדידת היקפי גוף (חזה, בטן, זרוע, ירך)
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
                    padding: '7px 14px',
                    fontSize: 12,
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
                        background: 'var(--bg-surface-2)',
                        padding: '10px 6px',
                        borderRadius: 12,
                        textAlign: 'center',
                        border: '1px solid var(--border-subtle)',
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
                        style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                      >
                        {item.label} (ס״מ)
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
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
            <div className="pro-card" style={{ padding: 18 }}>
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
                      borderRadius: 10,
                      background: 'rgba(56, 189, 248, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Droplets size={18} color="#38bdf8" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      מאזן נוזלים יומי
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      כל כוס = 250 מ״ל ({dailyLog.waterCups * 0.25} ליטר היום)
                    </div>
                  </div>
                </div>
                <div
                  className="num-mono"
                  style={{ fontSize: 20, fontWeight: 800, color: '#38bdf8' }}
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
                        height: 38,
                        borderRadius: 10,
                        border: filled
                          ? '1px solid rgba(56, 189, 248, 0.5)'
                          : '1px solid var(--border-subtle)',
                        background: filled
                          ? 'rgba(56, 189, 248, 0.18)'
                          : 'var(--bg-surface-2)',
                        color: filled ? '#38bdf8' : 'var(--text-muted)',
                        fontWeight: 700,
                        fontSize: 12,
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
            <div className="pro-card" style={{ padding: 18 }}>
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
                      borderRadius: 10,
                      background: 'rgba(214, 125, 9, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Scale size={18} color="var(--accent-volt)" />
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>
                      מגמת משקל גוף
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
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
                      background: 'var(--bg-surface-2)',
                      padding: '8px 6px',
                      borderRadius: 10,
                      textAlign: 'center',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      className="num-mono"
                      style={{ fontSize: 14, fontWeight: 800 }}
                    >
                      {w.weight}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {w.date}
                    </div>
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
                  dir="ltr"
                  disabled={savingWeight || isBlockedDay}
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    padding: '10px 14px',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontWeight: 700,
                    opacity: isBlockedDay ? 0.5 : 1,
                  }}
                />
                <button
                  type="submit"
                  disabled={savingWeight || isBlockedDay}
                  className="btn-volt"
                  style={{
                    padding: '10px 18px',
                    cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                    opacity: isBlockedDay ? 0.45 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {savingWeight && <Loader2 size={14} className="spot-spinner" />}
                  <span>{savingWeight ? 'שומר...' : 'תיעוד שקילה'}</span>
                </button>
              </form>
              {weightFeedback && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    fontWeight: 700,
                    color: weightFeedback.isError ? '#f87171' : '#4ade80',
                  }}
                >
                  {weightFeedback.msg}
                </div>
              )}
            </div>

            {/* כרטיס צ'ק-אין שבועי וייצוא דו"ח סיכום לוואטסאפ */}
            <div className="pro-card" style={{ padding: 18 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>
                    📋 צ׳ק-אין שבועי ודו״ח סיכום למאמן
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    עדכן מדדי הרגשה שבועיים או העתק דו״ח התקדמות מלא
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const actTargets = trainee.activityTargets || {
                      weeklyWorkoutsTarget: 4,
                      weeklyCardioTarget: 3,
                      dailySleepTargetHours: 7.5,
                      dailyStepsTarget: 8000,
                    };
                    const workoutsDone = weekDays.filter(
                      (wd) => trainee.logs[wd.iso]?.workoutLog?.completed
                    ).length;
                    const cardioDone = weekDays.filter(
                      (wd) => trainee.logs[wd.iso]?.cardioLog?.completed
                    ).length;
                    const sleepDays = weekDays
                      .map((wd) => trainee.logs[wd.iso]?.sleepHours)
                      .filter((s): s is number => typeof s === 'number' && s > 0);
                    const avgSleep =
                      sleepDays.length > 0
                        ? (
                            sleepDays.reduce((a, b) => a + b, 0) /
                            sleepDays.length
                          ).toFixed(1)
                        : '—';
                    const hasAutoSyncedWeek = weekDays.some((wd) => {
                      const s = trainee.logs[wd.iso]?.stepsSource;
                      return Boolean(s && s !== 'manual');
                    });
                    const stepDays = weekDays
                      .map((wd) => trainee.logs[wd.iso]?.steps)
                      .filter((s): s is number => typeof s === 'number' && s > 0);
                    const avgSteps =
                      stepDays.length > 0
                        ? Math.round(
                            stepDays.reduce((a, b) => a + b, 0) / stepDays.length
                          ).toLocaleString()
                        : '—';
                    const stepsGoal = actTargets.dailyStepsTarget ?? 8000;

                    const reportLines = [
                      `📊 *דו"ח סיכום שבועי SPOT - ${trainee.name}* (${todayIso})`,
                      `• משקל נוכחי: ${trainee.currentWeight} ק"ג (יעד: ${trainee.targetWeight} ק"ג)`,
                      `• אימונים השבוע: ${workoutsDone}/${actTargets.weeklyWorkoutsTarget}`,
                      hasAutoSyncedWeek
                        ? `• ממוצע צעדים יומי: ${avgSteps} (יעד: ${stepsGoal.toLocaleString()})`
                        : '',
                      `• הליכות/ריצות השבוע: ${cardioDone}/${actTargets.weeklyCardioTarget}`,
                      `• ממוצע שעות שינה: ${avgSleep} שעות (יעד: ${actTargets.dailySleepTargetHours})`,
                      latestMeasurement
                        ? `• היקפים אחרונים: חזה ${latestMeasurement.chestCm || '—'} | בטן ${latestMeasurement.waistNavelCm || '—'} | זרוע ${latestMeasurement.armCm || '—'} | ירך ${latestMeasurement.thighCm || '—'} ס"מ`
                        : '',
                      `• הרגשה שבועית (1-5): אנרגיה ${energyLevel}/5 | שובע ${hungerLevel}/5 | איכות שינה ${sleepQuality}/5`,
                      checkInNote ? `• הערת מתאמן: ${checkInNote}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n');

                    setReportCopyError(false);
                    try {
                      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(reportLines);
                      } else if (typeof document !== 'undefined') {
                        const ta = document.createElement('textarea');
                        ta.value = reportLines;
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
                  className="btn-surface"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: 'var(--accent-volt)',
                    borderColor: 'rgba(214, 125, 9, 0.35)',
                  }}
                >
                  <Share2 size={13} />
                  <span>העתק דו״ח לוואטסאפ</span>
                </button>
              </div>

              {reportCopiedBanner && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'rgba(214, 125, 9, 0.12)',
                    border: '1px solid rgba(214, 125, 9, 0.35)',
                    color: 'var(--accent-volt)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  ✓ הדו״ח השבועי הועתק ללוח! ניתן להדביק ישירות בוואטסאפ למאמן.
                </div>
              )}

              {reportCopyError && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  לא ניתן להעתיק ללוח בדפדפן זה – בדוק הרשאות העתקה.
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {[
                  {
                    label: 'רמת אנרגיה באימונים וביום-יום (1-5)',
                    val: energyLevel,
                    setVal: setEnergyLevel,
                  },
                  {
                    label: 'תחושת שובע ונוחות עם התפריט (1-5)',
                    val: hungerLevel,
                    setVal: setHungerLevel,
                  },
                  {
                    label: 'איכות השינה וההתאוששות השבוע (1-5)',
                    val: sleepQuality,
                    setVal: setSleepQuality,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      background: 'var(--bg-surface-2)',
                      padding: '8px 12px',
                      borderRadius: 10,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700 }}>
                      {row.label}
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => row.setVal(num)}
                          className="num-mono"
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 7,
                            border:
                              row.val === num ? '1px solid var(--sel-bg)'
                                : '1px solid var(--border-subtle)',
                            background:
                              row.val === num ? 'var(--sel-bg)'
                                : 'var(--bg-surface-1)',
                            color:
                              row.val === num ? 'var(--sel-text)'
                                : 'var(--text-secondary)',
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                <input
                  type="text"
                  placeholder="סיכום קצר או שאלה למאמן לקראת השבוע הבא..."
                  value={checkInNote}
                  onChange={(e) => setCheckInNote(e.target.value)}
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 10,
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />

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
                  style={{
                    padding: '10px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  {savingCheckIn ? (
                    <Loader2 size={15} className="spot-spinner" />
                  ) : (
                    <Check size={15} />
                  )}
                  <span>
                    {savingCheckIn
                      ? 'שומר צ׳ק-אין למאמן...'
                      : 'שמור צ׳ק-אין שבועי למאמן'}
                  </span>
                </button>

                {checkInSavedBanner && (
                  <div
                    style={{
                      fontSize: 11,
                      color: '#4ade80',
                      fontWeight: 700,
                      textAlign: 'center',
                    }}
                  >
                    ✓ הצ׳ק-אין השבועי נשמר ונשלח למאמן!
                  </div>
                )}
              </div>
            </div>
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

      {/* סרגל ניווט תחתון צף: לשוניות בימין + כפתור מצלמה עם + בצד השמאלי ביותר */}
      <div className="mobile-bottom-dock">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 4,
              flex: 1,
            }}
          >
            <button
              onClick={() => setMobileSection('journal')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                padding: '7px 4px',
                borderRadius: 999,
                border: 'none',
                background:
                  mobileSection === 'journal'
                    ? 'var(--line)'
                    : 'transparent',
                color:
                  mobileSection === 'journal'
                    ? 'var(--text)'
                    : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Utensils size={16} />
              <span>יומן</span>
            </button>

            <button
              onClick={() => setMobileSection('metrics')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                padding: '7px 4px',
                borderRadius: 999,
                border: 'none',
                background:
                  mobileSection === 'metrics'
                    ? 'var(--line)'
                    : 'transparent',
                color:
                  mobileSection === 'metrics'
                    ? 'var(--text)'
                    : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Activity size={16} />
              <span>מדדים</span>
            </button>

            <button
              onClick={() => setMobileSection('profile')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                padding: '7px 4px',
                borderRadius: 999,
                border: 'none',
                background:
                  mobileSection === 'profile'
                    ? 'var(--line)'
                    : 'transparent',
                color:
                  mobileSection === 'profile'
                    ? 'var(--text)'
                    : 'var(--text-secondary)',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <User size={16} />
              <span>פרופיל</span>
            </button>
          </div>

          {/* כפתור הוספה מהיר בצד השמאלי ביותר — אייקון מצלמה בלבד עם פינות מעוגלות */}
          <button
            type="button"
            disabled={isBlockedDay}
            aria-label="הוספת ארוחה וסריקת AI"
            title={isBlockedDay ? 'יום חסום להזנה' : 'הוספת ארוחה / צילום'}
            onClick={() => {
              if (isBlockedDay) return;
              const firstUnlogged =
                activeTemplate.meals.find(
                  (m) => !(dailyLog.meals[m.id]?.items?.length > 0)
                ) || activeTemplate.meals[0];
              if (firstUnlogged) openMealDrawer(firstUnlogged, 'hub');
            }}
            className="btn-volt"
            style={{
              width: 44,
              height: 44,
              padding: 0,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              opacity: isBlockedDay ? 0.45 : 1,
              cursor: isBlockedDay ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 18px rgba(214, 125, 9, 0.45)',
            }}
          >
            <Camera size={20} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* מודאל לוח שנה חודשי לתאריכים הפעילים */}
      <Modal
        opened={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        centered
        radius="lg"
        size="sm"
        title={
          <span style={{ fontWeight: 800, fontSize: 15 }}>
            בחר תאריך מתוך החלון הפעיל
          </span>
        }
      >
        {(() => {
          const { year, month } = calendarCursor;
          const firstDay = new Date(year, month, 1);
          const startPad = firstDay.getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells: Array<{ iso: string; day: number } | null> = [];
          for (let i = 0; i < startPad; i++) cells.push(null);
          for (let day = 1; day <= daysInMonth; day++) {
            const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(
              day
            ).padStart(2, '0')}`;
            cells.push({ iso, day });
          }

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCalendarCursor((prev) =>
                      prev.month === 0
                        ? { year: prev.year - 1, month: 11 }
                        : { year: prev.year, month: prev.month - 1 }
                    )
                  }
                  className="btn-surface"
                  style={{ width: 32, height: 32, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                >
                  <ChevronRight size={15} />
                </button>
                <span style={{ fontSize: 14, fontWeight: 800 }}>
                  {HEBREW_MONTH_NAMES[month]} {year}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCalendarCursor((prev) =>
                      prev.month === 11
                        ? { year: prev.year + 1, month: 0 }
                        : { year: prev.year, month: prev.month + 1 }
                    )
                  }
                  className="btn-surface"
                  style={{ width: 32, height: 32, padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center' }}
                >
                  <ChevronLeft size={15} />
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: 4,
                  textAlign: 'center',
                }}
              >
                {HEBREW_WEEKDAY_LETTERS.map((l) => (
                  <div
                    key={l}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      paddingBottom: 4,
                    }}
                  >
                    {l}
                  </div>
                ))}

                {cells.map((cell, i) => {
                  if (!cell) return <div key={`pad-${i}`} />;
                  const isActive = isDateActiveForTrainee(
                    cell.iso,
                    trainee,
                    todayIso
                  );
                  const isSelected = cell.iso === selectedDate;
                  const isToday = cell.iso === todayIso;
                  const isObs =
                    (trainee.observationDates || []).includes(cell.iso) ||
                    Boolean(trainee.logs[cell.iso]?.isObservationDay);
                  const isBlockedCell = isDayBlockedForTrainee(cell.iso, trainee);
                  const hasLog =
                    trainee.logs[cell.iso] &&
                    Object.keys(trainee.logs[cell.iso].meals || {}).length > 0;

                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      disabled={!isActive}
                      onClick={() => {
                        setSelectedDate(cell.iso);
                        setCalendarModalOpen(false);
                      }}
                      style={{
                        height: 38,
                        borderRadius: 11,
                        border: isSelected ? '1px solid var(--sel-bg)'
                          : isBlockedCell
                          ? '1px solid rgba(239, 68, 68, 0.55)'
                          : isToday
                          ? '1px solid rgba(214, 125, 9, 0.5)'
                          : isObs
                          ? '1px solid rgba(56, 189, 248, 0.4)'
                          : '1px solid transparent',
                        background: isSelected
                          ? isBlockedCell
                            ? '#ef4444'
                            : 'var(--accent-volt)'
                          : isBlockedCell
                          ? 'rgba(239, 68, 68, 0.14)'
                          : isObs
                          ? 'rgba(56, 189, 248, 0.12)'
                          : 'var(--bg-surface-2)',
                        color: isSelected
                          ? '#ffffff'
                          : isActive
                          ? 'var(--text-primary)'
                          : 'var(--text-muted)',
                        opacity: isActive ? 1 : 0.28,
                        cursor: isActive ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2,
                        padding: 0,
                      }}
                    >
                      <span className="num-mono" style={{ fontSize: 12.5, fontWeight: 800 }}>
                        {cell.day}
                      </span>
                      {hasLog && (
                        <span
                          style={{
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: isSelected ? 'var(--text)' : 'var(--accent-volt)',
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: 10.5,
                  color: 'var(--text-muted)',
                  paddingTop: 4,
                }}
              >
                <span>* ימים פעילים נקבעים ע״י המאמן (ימי תשקיף ולוג זמינים תמיד)</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(todayIso);
                    setCalendarModalOpen(false);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-orange-bright)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: 11.5,
                  }}
                >
                  היום
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

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
            <Clock size={15} color="var(--accent-volt)" />
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
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            ניתן לבחור כל שעה מותאמת אישית לתיעוד הארוחה ביומן:
          </div>

          <div
            style={{
              width: '100%',
              boxSizing: 'border-box',
              overflow: 'hidden',
              borderRadius: 12,
              background: 'var(--bg-surface-2)',
              border: '1px solid rgba(214, 125, 9, 0.45)',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <input
              type="time"
              value={draftMealTime}
              onChange={(e) => setDraftMealTime(e.target.value)}
              dir="ltr"
              style={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                background: 'transparent',
                border: 'none',
                color: 'var(--text)',
                fontSize: 20,
                fontWeight: 800,
                textAlign: 'center',
                outline: 'none',
                colorScheme: 'dark',
                WebkitAppearance: 'none',
                appearance: 'none',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              disabled={savingMealTime}
              onClick={() => {
                const parts = draftMealTime.split(':').map(Number);
                const mins = ((Number.isFinite(parts[0]) ? parts[0] : 12) * 60 + (Number.isFinite(parts[1]) ? parts[1] : 0) - 15 + 1440) % 1440;
                setDraftMealTime(
                  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
                );
              }}
              className="btn-surface"
              style={{ padding: '7px 8px', fontSize: 11.5, cursor: 'pointer' }}
            >
              -15 דק׳
            </button>
            <button
              type="button"
              disabled={savingMealTime}
              onClick={() => {
                const parts = draftMealTime.split(':').map(Number);
                const mins = ((Number.isFinite(parts[0]) ? parts[0] : 12) * 60 + (Number.isFinite(parts[1]) ? parts[1] : 0) + 15) % 1440;
                setDraftMealTime(
                  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
                );
              }}
              className="btn-surface"
              style={{ padding: '7px 8px', fontSize: 11.5, cursor: 'pointer' }}
            >
              +15 דק׳
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={savingMealTime}
              onClick={() => {
                const now = new Date();
                const hh = String(now.getHours()).padStart(2, '0');
                const mm = String(now.getMinutes()).padStart(2, '0');
                setDraftMealTime(`${hh}:${mm}`);
              }}
              className="btn-surface"
              style={{ flex: 1, padding: '8px', fontSize: 11.5, cursor: 'pointer' }}
            >
              עכשיו
            </button>
            {timeEditSlot?.timeHint && (
              <button
                type="button"
                disabled={savingMealTime}
                onClick={() => {
                  const m = timeEditSlot.timeHint!.match(/^(\d{1,2}):(\d{2})$/);
                  setDraftMealTime(
                    m ? `${m[1].padStart(2, '0')}:${m[2]}` : timeEditSlot.timeHint!
                  );
                }}
                className="btn-surface"
                style={{ flex: 1, padding: '8px', fontSize: 11.5, cursor: 'pointer' }}
              >
                תבנית ({timeEditSlot.timeHint})
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
              padding: '10px 14px',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
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
