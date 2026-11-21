'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Plus,
  Sparkles,
  Droplets,
  Scale,
  Check,
  Dumbbell,
  Moon,
  Copy,
  ChevronDown,
  Barcode,
  TrendingDown,
  Calendar,
  Activity,
  Utensils,
  MessageSquare,
} from 'lucide-react';
import {
  DayType,
  LoggedFoodItem,
  MealTemplateSlot,
  TraineeProfile,
} from '@/types/nutrition';
import { getTodayIso, sumMacros } from '@/data/israeliFoodCatalog';
import { AddMealDrawer } from './AddMealDrawer';

interface TraineeMobileViewProps {
  trainees: TraineeProfile[];
  selectedTraineeId: string;
  onSelectTrainee: (id: string) => void;
  onUpdateDayType: (traineeId: string, date: string, dayType: DayType) => void;
  onSaveMeal: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string
  ) => void;
  onUpdateWater: (traineeId: string, date: string, cups: number) => void;
  onUpdateWeight: (traineeId: string, date: string, weightKg: number) => void;
  onToggleFavorite: (traineeId: string, foodId: string) => void;
  geminiApiKey?: string;
}

const HEBREW_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function getWeekDays(baseIso: string) {
  const today = new Date(baseIso + 'T12:00:00');
  const dayOfWeek = today.getDay(); // 0..6
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - dayOfWeek + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
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
  trainees,
  selectedTraineeId,
  onSelectTrainee,
  onUpdateDayType,
  onSaveMeal,
  onUpdateWater,
  onUpdateWeight,
  onToggleFavorite,
  geminiApiKey,
}: TraineeMobileViewProps) {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [mobileSection, setMobileSection] = useState<'journal' | 'metrics'>('journal');
  const [traineeMenuOpen, setTraineeMenuOpen] = useState(false);

  const trainee =
    trainees.find((t) => t.id === selectedTraineeId) || trainees[0];

  const [activeMealSlot, setActiveMealSlot] = useState<MealTemplateSlot | null>(
    null
  );
  const [drawerTab, setDrawerTab] = useState<string>('catalog');
  const [weightInput, setWeightInput] = useState<string>(
    String(trainee.currentWeight)
  );

  const weekDays = getWeekDays(todayIso);

  const dailyLog = trainee.logs[selectedDate] || {
    date: selectedDate,
    dayType: 'workout',
    waterCups: 0,
    waterGoal: 12,
    weightKg: trainee.currentWeight,
    meals: {},
  };

  const activeTemplate =
    dailyLog.dayType === 'workout'
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
    dailyConsumed.calories >
    dailyTarget.calories * (1 + trainee.tolerancePercent / 100);

  // קשת SVG מותאמת אישית (240 מעלות)
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.72; // 260 degrees
  const filledArc = Math.min(arcLength, arcLength * Math.min(1, calRatio));

  const openMealDrawer = (slot: MealTemplateSlot, tab = 'catalog') => {
    setActiveMealSlot(slot);
    setDrawerTab(tab);
  };

  const duplicateSampleBreakfast = (slot: MealTemplateSlot) => {
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
    onSaveMeal(trainee.id, selectedDate, slot.id, sampleItems);
  };

  return (
    <div
      style={{
        maxWidth: 460,
        margin: '0 auto',
        paddingBottom: 96,
      }}
    >
      {/* כותרת אפליקציית המובייל + בורר מתאמן + מתג יום אימון/מנוחה */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          position: 'relative',
        }}
      >
        {/* פרופיל מתאמן עם תפריט החלפה נקי */}
        <button
          onClick={() => setTraineeMenuOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-surface-1)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 999,
            padding: '6px 14px 6px 8px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
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
          <ChevronDown size={14} color="var(--text-secondary)" />
        </button>

        {traineeMenuOpen && (
          <div
            className="pro-card"
            style={{
              position: 'absolute',
              top: 48,
              right: 0,
              zIndex: 50,
              width: 210,
              padding: 6,
              background: '#141720',
              borderColor: 'var(--border-strong)',
            }}
          >
            {trainees.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onSelectTrainee(t.id);
                  setWeightInput(String(t.currentWeight));
                  setTraineeMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background:
                    t.id === trainee.id ? 'rgba(210, 255, 40, 0.1)' : 'transparent',
                  border: 'none',
                  borderRadius: 10,
                  color:
                    t.id === trainee.id ? 'var(--accent-volt)' : 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'right',
                }}
              >
                <span>{t.name}</span>
                {t.id === trainee.id && <Check size={14} />}
              </button>
            ))}
          </div>
        )}

        {/* מתג קפסולה: יום אימון / יום מנוחה */}
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
                dailyLog.dayType === 'workout' ? 'var(--accent-volt)' : 'transparent',
              color:
                dailyLog.dayType === 'workout' ? '#08090c' : 'var(--text-secondary)',
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
                dailyLog.dayType === 'rest' ? '#08090c' : 'var(--text-secondary)',
              transition: 'all 0.18s ease',
            }}
          >
            <Moon size={13} />
            <span>מנוחה</span>
          </button>
        </div>
      </div>

      {/* סרגל תאריכים שבועי (7-Day Strip) */}
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
                gap: 4,
                padding: '8px 2px',
                borderRadius: 14,
                border: isSelected
                  ? '1px solid rgba(210, 255, 40, 0.45)'
                  : '1px solid transparent',
                background: isSelected
                  ? 'rgba(210, 255, 40, 0.1)'
                  : 'transparent',
                color: isSelected ? 'var(--accent-volt)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600 }}>{d.dayLetter}</span>
              <span
                className="num-mono"
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: isSelected ? 'var(--accent-volt)' : 'var(--text-primary)',
                }}
              >
                {d.dayNumber}
              </span>
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
            {/* קוקפיט קלוריות ומאקרו יומי (MacroFactor / Whoop Style) */}
            <div
              className="pro-card-elevated"
              style={{
                padding: '22px 20px 20px',
                marginBottom: 20,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* הילה עדינה ברקע */}
              <div
                style={{
                  position: 'absolute',
                  top: -70,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 240,
                  height: 140,
                  background:
                    'radial-gradient(circle, rgba(210, 255, 40, 0.13) 0%, transparent 70%)',
                  pointerEvents: 'none',
                }}
              />

              {/* שורת מדדים עליונה + שעון הקשת המרכזי */}
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
                    נצרך היום
                  </div>
                  <div
                    className="num-mono"
                    style={{ fontSize: 22, fontWeight: 800, color: '#ffffff' }}
                  >
                    {dailyConsumed.calories.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    קק״ל
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
                    {/* מסילה אחורית */}
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
                    {/* קשת מילוי */}
                    <circle
                      cx="90"
                      cy="90"
                      r={radius}
                      fill="none"
                      stroke={isOverLimit ? '#f59e0b' : '#d2ff28'}
                      strokeWidth="12"
                      strokeDasharray={`${filledArc} ${circumference}`}
                      strokeLinecap="round"
                      style={{
                        transition: 'stroke-dasharray 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                        filter: isOverLimit
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
                        color: isOverLimit ? '#f59e0b' : 'var(--accent-volt)',
                        marginTop: 4,
                      }}
                    >
                      {remainingCalories >= 0 ? 'קק״ל נותרו' : 'קק״ל מעל היעד'}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}
                    >
                      סטייה: {calDiffPct}% (מותר ±{trainee.tolerancePercent}%)
                    </div>
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
                    יעד יומי
                  </div>
                  <div
                    className="num-mono"
                    style={{
                      fontSize: 22,
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {dailyTarget.calories.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {activeTemplate.meals.length} ארוחות
                  </div>
                </div>
              </div>

              {/* שלוש עמודות הטלמטריה של אבות המזון (חלבון, פחמימה, שומן) */}
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
                    bg: 'var(--macro-protein-soft)',
                  },
                  {
                    label: 'פחמימות',
                    consumed: dailyConsumed.carbs,
                    target: dailyTarget.carbs,
                    color: 'var(--macro-carbs)',
                    bg: 'var(--macro-carbs-soft)',
                  },
                  {
                    label: 'שומנים',
                    consumed: dailyConsumed.fat,
                    target: dailyTarget.fat,
                    color: 'var(--macro-fat)',
                    bg: 'var(--macro-fat-soft)',
                  },
                ].map((m) => {
                  const pct = Math.min(
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
                          נותר {left}g
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
                        {m.consumed}
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
                      </div>

                      {/* פס התקדמות דק ומדויק */}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                padding: '0 4px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    color: 'var(--text-secondary)',
                  }}
                >
                  {activeTemplate.name}
                </span>
              </div>
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
                        ? 'rgba(210, 255, 40, 0.22)'
                        : 'var(--border-subtle)',
                    }}
                  >
                    {/* שורת כותרת הארוחה */}
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
                        {/* מיני טבעת התקדמות לארוחה */}
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
                              stroke={hasItems ? 'var(--accent-volt)' : 'transparent'}
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
                                ? 'var(--accent-volt)'
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
                              ח׳ {mealMacros.protein}/{slot.targets.protein}g
                            </span>
                            <span style={{ color: 'var(--macro-carbs)' }}>
                              פ׳ {mealMacros.carbs}/{slot.targets.carbs}g
                            </span>
                            <span style={{ color: 'var(--macro-fat)' }}>
                              ש׳ {mealMacros.fat}/{slot.targets.fat}g
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* קפסולת קלוריות הארוחה */}
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

                    {/* רשימת המאכלים שהוזנו לארוחה */}
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

                    {/* הערת מאמן במידה וקיימת */}
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
                            הערת מאמן:
                          </span>
                          <span style={{ color: 'var(--text-primary)' }}>
                            {entry.coachFeedback}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* שורת כפתורי הזנה נקייה ומודרנית */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <button
                        onClick={() => openMealDrawer(slot, 'catalog')}
                        className={hasItems ? 'btn-surface' : 'btn-volt'}
                        style={{
                          flex: 1,
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
                          onClick={() => duplicateSampleBreakfast(slot)}
                          className="btn-surface"
                          style={{
                            padding: '9px 11px',
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <Copy size={14} color="var(--text-secondary)" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* טאב מדדים, מים ומשקל גוף */
          <motion.div
            key="metrics"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
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

              {/* מטריצת כוסות מים ללחיצה */}
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
                      onClick={() => onUpdateWater(trainee.id, selectedDate, i + 1)}
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

              {/* היסטוריית שקילות ויזואלית */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(
                    5,
                    trainee.weightHistory.length
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

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="number"
                  step="0.1"
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
                  className="btn-volt"
                  style={{ padding: '10px 18px', cursor: 'pointer' }}
                  onClick={() => {
                    const num = parseFloat(weightInput);
                    if (!isNaN(num) && num > 30) {
                      onUpdateWeight(trainee.id, selectedDate, num);
                    }
                  }}
                >
                  תיעוד שקילה
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* סרגל ניווט תחתון צף (Floating Glass Dock) */}
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

          {/* כפתור מרכזי בולט לצילום/הזנת AI מהירה */}
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
            <span>מים ומשקל</span>
          </button>
        </div>
      </div>

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
      />
    </div>
  );
}
