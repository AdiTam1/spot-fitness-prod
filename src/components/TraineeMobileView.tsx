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
  Copy,
  Activity,
  Utensils,
  MessageSquare,
  Ruler,
  Eye,
  ClipboardCheck,
  Lightbulb,
  Share2,
  Check,
  Loader2,
  Bookmark,
} from 'lucide-react';
import {
  AiContextParams,
  BodyMeasurementEntry,
  DailyCardioLog,
  DailyWorkoutLog,
  DayType,
  LoggedFoodItem,
  MealTemplateSlot,
  PendingAiMealJob,
  QuickContextChip,
  SavedMealPreset,
  StepsSyncSource,
  TraineeCustomUnit,
  TraineeOnboardingData,
  TraineeProfile,
  TraineeServingTool,
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import { getTodayIso, sumMacros } from '@/data/israeliFoodCatalog';
import { AddMealDrawer } from './AddMealDrawer';
import { TraineeOnboardingWizard } from './TraineeOnboardingWizard';
import { BodyMeasurementGuide } from './BodyMeasurementGuide';
import { DailyStepsCard } from './DailyStepsCard';

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
    photoNote?: string
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
    nonce: number;
  } | null;
  geminiApiKey?: string;
  onSyncNativeStepsNow?: () => Promise<void>;
}

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function getWeekDays(baseIso: string) {
  const today = new Date(baseIso + 'T12:00:00');
  const dayOfWeek = today.getDay();
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(d.getDate()).padStart(2, '0')}`;
    result.push({
      iso,
      dayLetter: HEBREW_DAYS[i],
      dayNumber: d.getDate(),
      isToday: iso === baseIso,
    });
  }
  return result;
}

export function TraineeMobileView({
  trainee,
  isCoachPreview = false,
  onExitCoachPreview,
  onUpdateDayType,
  onSaveMeal,
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
  geminiApiKey,
  onSyncNativeStepsNow,
}: TraineeMobileViewProps) {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [mobileSection, setMobileSection] = useState<'journal' | 'metrics'>(
    'journal'
  );
  const [editingOnboarding, setEditingOnboarding] = useState(false);
  const [measurementModalOpen, setMeasurementModalOpen] = useState(false);

  const [activeMealSlot, setActiveMealSlot] = useState<MealTemplateSlot | null>(
    null
  );
  const [drawerTab, setDrawerTab] = useState<string>('catalog');
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
  const [duplicatingBreakfast, setDuplicatingBreakfast] = useState(false);
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
    const allSlots = [
      ...(trainee.workoutTemplate?.meals || []),
      ...(trainee.restTemplate?.meals || []),
    ];
    const targetSlot = allSlots.find(
      (s) => s.id === externalOpenMealRequest.mealSlotId
    );
    if (targetSlot) {
      setActiveMealSlot(targetSlot);
      setDrawerTab('catalog');
    }
  }, [externalOpenMealRequest, trainee.id, trainee.workoutTemplate, trainee.restTemplate]);

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

  const weekDays = getWeekDays(todayIso);

  const dailyLog = trainee.logs[selectedDate] || {
    date: selectedDate,
    dayType: 'workout',
    waterCups: 0,
    waterGoal: 12,
    weightKg: trainee.currentWeight,
    meals: {},
  };

  // בדיקה האם היום הנבחר מוגדר כ"יום תשקיף" (Observation Day)
  const isObservationDay =
    (trainee.observationDates || []).includes(selectedDate) ||
    Boolean(dailyLog.isObservationDay);

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

  const calDiffPct = Math.round(
    (Math.abs(dailyConsumed.calories - dailyTarget.calories) /
      Math.max(1, dailyTarget.calories)) *
      100
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

  const openMealDrawer = (slot: MealTemplateSlot, tab = 'catalog') => {
    setActiveMealSlot(slot);
    setDrawerTab(tab);
  };

  const duplicateSampleBreakfast = async (slot: MealTemplateSlot) => {
    if (duplicatingBreakfast) return;
    setDuplicatingBreakfast(true);
    try {
      const sampleItems: LoggedFoodItem[] = [
        {
          id: `dup-${Date.now()}-1`,
          name: "קוטג' 5% תנובה",
          unitLabel: 'חצי גביע (125 גרם)',
          quantity: 1,
          grams: 125,
          macros: { calories: 116, protein: 13.8, carbs: 1.9, fat: 6.3 },
          source: 'catalog',
        },
        {
          id: `dup-${Date.now()}-2`,
          name: 'ביצים מקושקשות',
          unitLabel: '2 ביצים L (120 גרם)',
          quantity: 1,
          grams: 120,
          macros: { calories: 172, protein: 15.1, carbs: 0.8, fat: 11.4 },
          source: 'catalog',
        },
        {
          id: `dup-${Date.now()}-3`,
          name: 'לחם כוסמין מלא פרוס',
          unitLabel: '2 פרוסות (64 גרם)',
          quantity: 1,
          grams: 64,
          macros: { calories: 150, protein: 6.7, carbs: 25.6, fat: 1.8 },
          source: 'catalog',
        },
      ];
      await onSaveMeal(trainee.id, selectedDate, slot.id, sampleItems);
    } finally {
      setDuplicatingBreakfast(false);
    }
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
            background: 'rgba(210, 255, 40, 0.12)',
            border: '1px solid rgba(210, 255, 40, 0.35)',
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
              color: '#08090c',
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
              onClick={() => onUpdateDayType(trainee.id, selectedDate, 'workout')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background:
                  dailyLog.dayType === 'workout'
                    ? 'var(--accent-volt)'
                    : 'transparent',
                color:
                  dailyLog.dayType === 'workout'
                    ? '#08090c'
                    : 'var(--text-secondary)',
                transition: 'all 0.18s ease',
              }}
            >
              <Dumbbell size={13} />
              <span>אימון</span>
            </button>
            <button
              onClick={() => onUpdateDayType(trainee.id, selectedDate, 'rest')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                background:
                  dailyLog.dayType === 'rest' ? '#ffffff' : 'transparent',
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

      {/* סרגל תאריכים שבועי (7-Day Strip) עם חיווי ימי תשקיף */}
      <div
        className="pro-card"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 4,
          padding: '10px 8px',
          marginBottom: 16,
        }}
      >
        {weekDays.map((d) => {
          const isSelected = d.iso === selectedDate;
          const isObs =
            (trainee.observationDates || []).includes(d.iso) ||
            Boolean(trainee.logs[d.iso]?.isObservationDay);
          const hasLog =
            trainee.logs[d.iso] &&
            Object.keys(trainee.logs[d.iso].meals || {}).length > 0;
          return (
            <button
              key={d.iso}
              onClick={() => setSelectedDate(d.iso)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '8px 2px',
                borderRadius: 14,
                border: isSelected
                  ? isObs
                    ? '1px solid rgba(56, 189, 248, 0.55)'
                    : '1px solid rgba(210, 255, 40, 0.45)'
                  : '1px solid transparent',
                background: isSelected
                  ? isObs
                    ? 'rgba(56, 189, 248, 0.14)'
                    : 'rgba(210, 255, 40, 0.1)'
                  : 'transparent',
                color: isSelected
                  ? isObs
                    ? '#38bdf8'
                    : 'var(--accent-volt)'
                  : 'var(--text-secondary)',
                cursor: 'pointer',
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
                    ? isObs
                      ? '#38bdf8'
                      : 'var(--accent-volt)'
                    : 'var(--text-primary)',
                }}
              >
                {d.dayNumber}
              </span>
              {isObs ? (
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
                      ? 'rgba(255,255,255,0.25)'
                      : 'transparent',
                  }}
                />
              )}
            </button>
          );
        })}
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
                    : 'radial-gradient(circle, rgba(210, 255, 40, 0.13) 0%, transparent 70%)',
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
                    style={{ fontSize: 22, fontWeight: 800, color: '#ffffff' }}
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
                      stroke="rgba(255, 255, 255, 0.07)"
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
                          : '#d2ff28'
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
                          : 'drop-shadow(0 0 10px rgba(210, 255, 40, 0.35))',
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
                            color: '#ffffff',
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
                            color: isOverLimit ? '#f59e0b' : '#ffffff',
                          }}
                        >
                          {Math.abs(remainingCalories).toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: isOverLimit
                              ? '#f59e0b'
                              : 'var(--accent-volt)',
                            marginTop: 4,
                          }}
                        >
                          {remainingCalories >= 0
                            ? 'קק״ל נותרו'
                            : 'קק״ל מעל היעד'}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                          }}
                        >
                          סטייה: {calDiffPct}% (מותר ±
                          {trainee.tolerancePercent}%)
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
                        background: 'rgba(255, 255, 255, 0.025)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: 14,
                        padding: '10px 12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: m.color,
                          }}
                        >
                          {m.label}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                          }}
                        >
                          {isObservationDay ? 'נספר' : `נותר ${left}g`}
                        </span>
                      </div>

                      <div
                        className="num-mono"
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          marginBottom: 7,
                        }}
                      >
                        {m.consumed}g
                        {!isObservationDay && (
                          <span
                            style={{
                              fontSize: 12,
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
                          background: 'rgba(255,255,255,0.07)',
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
                      אימונים, צעדים, הליכה/ריצה ושינה ({selectedDate})
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      הזנה והסתנכרנות מול יעדי המאמן
                    </span>
                  </div>

                  {/* 0. מד צעדים יומי חכם (Health Connect + Google Play Services + ידני) */}
                  <DailyStepsCard
                    selectedDate={selectedDate}
                    todayIso={todayIso}
                    steps={dailyLog.steps ?? 0}
                    stepsSource={dailyLog.stepsSource}
                    stepsSyncedAt={dailyLog.stepsSyncedAt}
                    dailyStepsTarget={dailyStepsTarget}
                    isCoachPreview={isCoachPreview}
                    onSaveManualSteps={async (steps) => {
                      await onUpdateDailyActivity(trainee.id, selectedDate, {
                        steps,
                        stepsSource: 'manual',
                        stepsSyncedAt: new Date().toISOString(),
                      });
                    }}
                    onSyncNativeStepsNow={onSyncNativeStepsNow}
                  />

                  {/* 1. אימון יומי + סוג אימון */}
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      padding: '10px 12px',
                      borderRadius: 12,
                      border: todayWorkout?.completed
                        ? '1px solid rgba(210, 255, 40, 0.35)'
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
                            onClick={() => {
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
                              border: isSelected
                                ? '1px solid var(--accent-volt)'
                                : '1px solid var(--border-subtle)',
                              background: isSelected
                                ? 'rgba(210, 255, 40, 0.16)'
                                : 'var(--bg-surface-1)',
                              color: isSelected
                                ? 'var(--accent-volt)'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
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
                        ? '1px solid rgba(56, 189, 248, 0.4)'
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
                        <Activity size={14} color="#38bdf8" />
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
                              ? '#38bdf8'
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
                            onClick={() =>
                              onUpdateDailyActivity(trainee.id, selectedDate, {
                                cardioLog: isSelected
                                  ? { completed: false }
                                  : {
                                      completed: true,
                                      mode: cOpt.mode,
                                      label: cOpt.label,
                                      durationMinutes: cOpt.mins,
                                    },
                              })
                            }
                            style={{
                              padding: '5px 10px',
                              borderRadius: 999,
                              border: isSelected
                                ? '1px solid #38bdf8'
                                : '1px solid var(--border-subtle)',
                              background: isSelected
                                ? 'rgba(56, 189, 248, 0.16)'
                                : 'var(--bg-surface-1)',
                              color: isSelected
                                ? '#38bdf8'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
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
                        ? '1px solid rgba(168, 85, 247, 0.4)'
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
                        <Moon size={14} color="#a855f7" />
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
                              ? '#a855f7'
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
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        gap: 5,
                      }}
                    >
                      {[5, 6, 6.5, 7, 7.5, 8, 8.5].map((hrs) => {
                        const isSelected = todaySleep === hrs;
                        return (
                          <button
                            key={hrs}
                            type="button"
                            onClick={() =>
                              onUpdateDailyActivity(trainee.id, selectedDate, {
                                sleepHours: hrs,
                              })
                            }
                            className="num-mono"
                            style={{
                              padding: '6px 2px',
                              borderRadius: 8,
                              border: isSelected
                                ? '1px solid #a855f7'
                                : '1px solid var(--border-subtle)',
                              background: isSelected
                                ? 'rgba(168, 85, 247, 0.18)'
                                : 'var(--bg-surface-1)',
                              color: isSelected
                                ? '#c084fc'
                                : 'var(--text-secondary)',
                              fontSize: 11,
                              fontWeight: 800,
                              cursor: 'pointer',
                            }}
                          >
                            {hrs}h
                          </button>
                        );
                      })}
                    </div>
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
                          ? 'rgba(210, 255, 40, 0.45)'
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
                          background: 'rgba(210, 255, 40, 0.14)',
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
                          : 'rgba(210, 255, 40, 0.22)'
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
                              stroke="rgba(255,255,255,0.08)"
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
                            {slot.timeHint && (
                              <span
                                className="num-mono"
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {slot.timeHint}
                              </span>
                            )}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                              display: 'flex',
                              gap: 10,
                              marginTop: 2,
                            }}
                          >
                            <span style={{ color: 'var(--macro-protein)' }}>
                              ח׳ {mealMacros.protein}
                              {!isObservationDay && `/${slot.targets.protein}`}g
                            </span>
                            <span style={{ color: 'var(--macro-carbs)' }}>
                              פ׳ {mealMacros.carbs}
                              {!isObservationDay && `/${slot.targets.carbs}`}g
                            </span>
                            <span style={{ color: 'var(--macro-fat)' }}>
                              ש׳ {mealMacros.fat}
                              {!isObservationDay && `/${slot.targets.fat}`}g
                            </span>
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'left' }}>
                        <div
                          className="num-mono"
                          style={{
                            fontSize: 16,
                            fontWeight: 800,
                            color: hasItems
                              ? 'var(--text-primary)'
                              : 'var(--text-muted)',
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
                          border: '1px solid rgba(255, 255, 255, 0.04)',
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
                              borderBottom: '1px solid rgba(255,255,255,0.06)',
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
                            onClick={() => openMealDrawer(slot, 'catalog')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '7px 0',
                              cursor: 'pointer',
                              borderBottom:
                                i < loggedItems.length - 1
                                  ? '1px solid rgba(255, 255, 255, 0.04)'
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
                          background: 'rgba(210, 255, 40, 0.07)',
                          border: '1px solid rgba(210, 255, 40, 0.22)',
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
                        flexWrap: 'wrap',
                        gap: 8,
                      }}
                    >
                      <button
                        onClick={() => openMealDrawer(slot, 'catalog')}
                        className={hasItems ? 'btn-surface' : 'btn-volt'}
                        style={{
                          flex: '1 1 130px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '9px 14px',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={15} />
                        <span>{hasItems ? 'הוסף / ערוך פריטים' : 'הזן ארוחה'}</span>
                      </button>

                      <button
                        title="💡 מה לאכול? (המלצת AI חכמה + אופציות המאמן)"
                        onClick={() => openMealDrawer(slot, 'ai-recommend')}
                        className="btn-surface"
                        style={{
                          padding: '9px 11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          color: 'var(--accent-volt)',
                          borderColor: 'rgba(210, 255, 40, 0.35)',
                        }}
                      >
                        <Lightbulb size={14} color="var(--accent-volt)" />
                        <span>מה לאכול?</span>
                      </button>

                      <button
                        title="צילום ארוחה לפענוח AI"
                        onClick={() => openMealDrawer(slot, 'ai-photo')}
                        className="btn-surface"
                        style={{
                          padding: '9px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <Camera size={15} color="var(--accent-volt)" />
                        <span>AI</span>
                      </button>

                      <button
                        title="ספריית הארוחות השמורות והיסטוריה"
                        onClick={() => openMealDrawer(slot, 'saved-meals')}
                        className="btn-surface"
                        style={{
                          padding: '9px 11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <Bookmark size={14} color="#38bdf8" />
                        <span>שמורות</span>
                      </button>

                      <button
                        title="הקלדה חופשית ל-AI"
                        onClick={() => openMealDrawer(slot, 'ai-text')}
                        className="btn-surface"
                        style={{
                          padding: '9px 11px',
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Sparkles size={15} color="#38bdf8" />
                      </button>

                      {!hasItems && idx === 0 && (
                        <button
                          title="שכפל ארוחת בוקר קבועה"
                          disabled={duplicatingBreakfast}
                          onClick={() => duplicateSampleBreakfast(slot)}
                          className="btn-surface"
                          style={{
                            padding: '9px 11px',
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          {duplicatingBreakfast ? (
                            <Loader2 size={14} className="spot-spinner" color="var(--accent-volt)" />
                          ) : (
                            <Copy size={14} color="var(--text-secondary)" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
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
                      background: 'rgba(210, 255, 40, 0.12)',
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
                  onClick={() => setMeasurementModalOpen(true)}
                  className="btn-volt"
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
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
                      onClick={() =>
                        onUpdateWater(trainee.id, selectedDate, i + 1)
                      }
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
                        cursor: 'pointer',
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
                      background: 'rgba(210, 255, 40, 0.12)',
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
                  if (weightLockRef.current) return;
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
                  disabled={savingWeight}
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
                  }}
                />
                <button
                  type="submit"
                  disabled={savingWeight}
                  className="btn-volt"
                  style={{
                    padding: '10px 18px',
                    cursor: 'pointer',
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
                      `• ממוצע צעדים יומי: ${avgSteps} (יעד: ${stepsGoal.toLocaleString()})`,
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
                    borderColor: 'rgba(210, 255, 40, 0.35)',
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
                    background: 'rgba(210, 255, 40, 0.12)',
                    border: '1px solid rgba(210, 255, 40, 0.35)',
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
                              row.val === num
                                ? '1px solid var(--accent-volt)'
                                : '1px solid var(--border-subtle)',
                            background:
                              row.val === num
                                ? 'rgba(210, 255, 40, 0.18)'
                                : 'var(--bg-surface-1)',
                            color:
                              row.val === num
                                ? 'var(--accent-volt)'
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
        )}
      </AnimatePresence>

      {/* סרגל ניווט תחתון צף */}
      <div className="mobile-bottom-dock">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <button
            onClick={() => setMobileSection('journal')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 14px',
              borderRadius: 999,
              border: 'none',
              background:
                mobileSection === 'journal'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'transparent',
              color:
                mobileSection === 'journal'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Utensils size={15} />
            <span>יומן ארוחות</span>
          </button>

          <button
            onClick={() => {
              const firstUnlogged =
                activeTemplate.meals.find(
                  (m) => !(dailyLog.meals[m.id]?.items?.length > 0)
                ) || activeTemplate.meals[0];
              if (firstUnlogged) openMealDrawer(firstUnlogged, 'ai-photo');
            }}
            className="btn-volt"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 18px',
              borderRadius: 999,
              fontSize: 13,
              cursor: 'pointer',
              boxShadow: '0 4px 18px rgba(210, 255, 40, 0.35)',
            }}
          >
            <Camera size={16} />
            <span>סריקת AI</span>
          </button>

          <button
            onClick={() => setMobileSection('metrics')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '10px 14px',
              borderRadius: 999,
              border: 'none',
              background:
                mobileSection === 'metrics'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'transparent',
              color:
                mobileSection === 'metrics'
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Activity size={15} />
            <span>משקל והיקפים</span>
          </button>
        </div>
      </div>

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
        onSaveMeal={(slotId, items, photoDataUrl, photoNote) =>
          onSaveMeal(
            trainee.id,
            selectedDate,
            slotId,
            items,
            photoDataUrl,
            photoNote
          )
        }
        geminiApiKey={geminiApiKey}
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
    </div>
  );
}
