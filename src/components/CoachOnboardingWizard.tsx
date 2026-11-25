'use client';

import React, { useState, useEffect } from 'react';
import {
  TextInput,
  PasswordInput,
  NumberInput,
  Textarea,
  Checkbox,
  Switch,
} from '@mantine/core';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Loader2,
  Search,
  CalendarRange,
} from 'lucide-react';
import {
  CoachOnboardingData,
  MealTemplateSlot,
  NutritionTemplate,
} from '@/types/nutrition';
import { getTodayIso, ISRAELI_FOOD_CATALOG } from '@/data/israeliFoodCatalog';
import { resolveNumericValue } from '@/lib/numericInput';
import { useSpotUnsavedEditing } from '@/lib/webVersionGuard';

interface CoachOnboardingWizardProps {
  coachName: string;
  coachPhone?: string;
  existingOnboarding?: CoachOnboardingData;
  onCompleteCoachOnboarding: (data: {
    name: string;
    phone: string;
    newPassword?: string;
    onboarding: CoachOnboardingData;
    starterTemplates: NutritionTemplate[];
    starterGroupNames: string[];
  }) => void | Promise<void>;
  onSkip?: () => void;
}

const SPECIALTY_OPTIONS = [
  'חיטוב וירידה באחוזי שומן',
  'עלייה במסת שריר (היפרטרופיה)',
  'תזונת ספורטאים וביצועים',
  'תזונת נשים וחיטוב',
  'שינוי הרגלים ואורח חיים',
  'הכנה לתחרויות / פיתוח גוף',
];

const STARTER_GROUP_OPTIONS = [
  'חיטוב ומיצוק',
  'עלייה במסת שריר',
  'ליווי VIP',
  'נבחרת בוקר',
  'מעקב אונליין',
];

const STARTER_TEMPLATE_PRESETS: {
  key: string;
  name: string;
  description: string;
  dayType: 'workout' | 'rest';
  meals: MealTemplateSlot[];
}[] = [
  {
    key: 'cut-1450',
    name: 'חיטוב נשים – 1,450 קל׳',
    description: '4 ארוחות מאוזנות בדגש על שובע ו-125g חלבון',
    dayType: 'workout',
    meals: [
      {
        id: 'm1',
        name: 'ארוחת בוקר',
        timeHint: '08:00',
        targets: { calories: 350, protein: 30, carbs: 32, fat: 11 },
      },
      {
        id: 'm2',
        name: 'ארוחת צהריים',
        timeHint: '13:30',
        targets: { calories: 480, protein: 42, carbs: 48, fat: 13 },
      },
      {
        id: 'm3',
        name: 'נשנוש אחר הצהריים',
        timeHint: '17:00',
        targets: { calories: 220, protein: 22, carbs: 24, fat: 4 },
      },
      {
        id: 'm4',
        name: 'ארוחת ערב',
        timeHint: '20:30',
        targets: { calories: 400, protein: 32, carbs: 30, fat: 17 },
      },
    ],
  },
  {
    key: 'cut-1850',
    name: 'חיטוב קלאסי – 1,850 קל׳',
    description: 'חלבון גבוה (160g) ופחמימה סביב האימון',
    dayType: 'workout',
    meals: [
      {
        id: 'm1',
        name: 'ארוחת בוקר',
        timeHint: '08:00',
        targets: { calories: 420, protein: 35, carbs: 40, fat: 13 },
      },
      {
        id: 'm2',
        name: 'ארוחת צהריים',
        timeHint: '13:00',
        targets: { calories: 580, protein: 50, carbs: 65, fat: 13 },
      },
      {
        id: 'm3',
        name: 'אחרי אימון',
        timeHint: '17:00',
        targets: { calories: 300, protein: 30, carbs: 35, fat: 4 },
      },
      {
        id: 'm4',
        name: 'ארוחת ערב',
        timeHint: '20:30',
        targets: { calories: 550, protein: 45, carbs: 40, fat: 22 },
      },
    ],
  },
  {
    key: 'bulk-2600',
    name: 'עלייה נקייה במסה – 2,600 קל׳',
    description: '5 ארוחות לעלייה במסת השריר עם 195g חלבון',
    dayType: 'workout',
    meals: [
      {
        id: 'm1',
        name: 'ארוחת בוקר',
        timeHint: '07:30',
        targets: { calories: 550, protein: 38, carbs: 65, fat: 15 },
      },
      {
        id: 'm2',
        name: 'ארוחת ביניים',
        timeHint: '10:30',
        targets: { calories: 380, protein: 30, carbs: 42, fat: 10 },
      },
      {
        id: 'm3',
        name: 'ארוחת צהריים',
        timeHint: '13:30',
        targets: { calories: 720, protein: 55, carbs: 85, fat: 18 },
      },
      {
        id: 'm4',
        name: 'אחרי אימון',
        timeHint: '17:30',
        targets: { calories: 380, protein: 32, carbs: 50, fat: 5 },
      },
      {
        id: 'm5',
        name: 'ארוחת ערב',
        timeHint: '21:00',
        targets: { calories: 570, protein: 40, carbs: 52, fat: 22 },
      },
    ],
  },
];

export function CoachOnboardingWizard({
  coachName,
  coachPhone = '',
  existingOnboarding,
  onCompleteCoachOnboarding,
  onSkip,
}: CoachOnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  const [name, setName] = useState(coachName);
  const [phone, setPhone] = useState(coachPhone);
  const [title, setTitle] = useState(
    existingOnboarding?.title || 'מאמן כושר ותזונת ספורט'
  );
  const [newPassword, setNewPassword] = useState('');
  const [specialties, setSpecialties] = useState<string[]>(
    existingOnboarding?.specialties || [
      SPECIALTY_OPTIONS[0],
      SPECIALTY_OPTIONS[1],
    ]
  );
  const [specialtiesNote, setSpecialtiesNote] = useState(
    existingOnboarding?.specialtiesNote || ''
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    existingOnboarding?.welcomeMessage ||
      'ברוך הבא לתהליך! כאן נתעד את הארוחות, נעקוב אחרי המדדים ונדייק את הדרך למטרה שלך.'
  );

  // שלב 2: ברירות מחדל למתאמנים וימי תשקיף
  const [defaultObservationDays, setDefaultObservationDays] = useState<number | string>(
    existingOnboarding?.defaultObservationDays ?? 3
  );
  const [defaultCountObservationInStats, setDefaultCountObservationInStats] =
    useState<boolean>(
      existingOnboarding?.defaultCountObservationInStats ?? false
    );
  const [defaultTolerancePercent, setDefaultTolerancePercent] =
    useState<number>(existingOnboarding?.defaultTolerancePercent ?? 10);
  const [defaultWaterGoal, setDefaultWaterGoal] = useState<number>(
    existingOnboarding?.defaultWaterGoal ?? 12
  );
  const [defaultActivePastDays, setDefaultActivePastDays] = useState<number | string>(
    existingOnboarding?.defaultActivePastDays ?? 1
  );
  const [defaultActiveFutureDays, setDefaultActiveFutureDays] =
    useState<number | string>(existingOnboarding?.defaultActiveFutureDays ?? 0);
  const [defaultRestrictNonObsOnObsDays, setDefaultRestrictNonObsOnObsDays] =
    useState<boolean>(
      existingOnboarding?.defaultRestrictNonObsOnObsDays ?? false
    );
  const [defaultFavoriteFoodIds, setDefaultFavoriteFoodIds] = useState<string[]>(
    existingOnboarding?.defaultFavoriteFoodIds ?? []
  );
  const [favSearchQuery, setFavSearchQuery] = useState('');

  // שלב 3: טמפלייטים וקבוצות התחלתיות
  const [selectedTemplateKeys, setSelectedTemplateKeys] = useState<string[]>([
    'cut-1450',
    'cut-1850',
    'bulk-2600',
  ]);
  const [selectedGroupNames, setSelectedGroupNames] = useState<string[]>([
    'חיטוב ומיצוק',
    'עלייה במסת שריר',
  ]);
  const [customGroupName, setCustomGroupName] = useState('');
  const [isFinishing, setIsFinishing] = useState(false);
  useSpotUnsavedEditing('coach-onboarding-wizard', true);

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    const safeObsDays = resolveNumericValue(defaultObservationDays, 0, {
      min: 0,
      max: 90,
      integer: true,
    });
    const safePastDays = resolveNumericValue(defaultActivePastDays, 0, {
      min: 0,
      max: 365,
      integer: true,
    });
    const safeFutureDays = resolveNumericValue(defaultActiveFutureDays, 0, {
      min: 0,
      max: 180,
      integer: true,
    });

    const onboarding: CoachOnboardingData = {
      completed: true,
      title: title.trim(),
      specialties,
      specialtiesNote: specialtiesNote.trim(),
      welcomeMessage: welcomeMessage.trim(),
      defaultObservationDays: safeObsDays,
      defaultCountObservationInStats,
      defaultTolerancePercent,
      defaultWaterGoal,
      defaultActivePastDays: safePastDays,
      defaultActiveFutureDays: safeFutureDays,
      defaultRestrictNonObsOnObsDays,
      defaultFavoriteFoodIds,
      completedAt: getTodayIso(),
    };

    const starterTemplates: NutritionTemplate[] = STARTER_TEMPLATE_PRESETS.filter(
      (p) => selectedTemplateKeys.includes(p.key)
    ).map((p, idx) => ({
      id: `tpl-coach-${Date.now()}-${idx}`,
      name: p.name,
      description: p.description,
      dayType: p.dayType,
      tolerancePercent: defaultTolerancePercent,
      meals: JSON.parse(JSON.stringify(p.meals)),
    }));

    const finalGroups = [
      ...selectedGroupNames,
      ...(customGroupName.trim() ? [customGroupName.trim()] : []),
    ];

    try {
      await onCompleteCoachOnboarding({
        name: name.trim() || coachName,
        phone: phone.trim(),
        newPassword: newPassword.trim() || undefined,
        onboarding,
        starterTemplates,
        starterGroupNames: Array.from(new Set(finalGroups)),
      });
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 500,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        padding: '6px 0 calc(28px + var(--sa-bottom))',
      }}
    >
      <div style={{ width: '100%', padding: '14px 4px 0' }}>
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-2)',
                }}
              >
                הגדרת פרופיל מאמן · שלב <bdi className="ltr-num">{step}</bdi> מתוך <bdi className="ltr-num">5</bdi>
              </span>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, lineHeight: 1.2 }}>
                {step === 1 && 'פרטים אישיים'}
                {step === 2 && 'התמחויות ומסר פתיחה'}
                {step === 3 && 'ימי תשקיף והגדרות ברירת מחדל'}
                {step === 4 && 'טמפלייטים התחלתיים'}
                {step === 5 && 'קבוצות מתאמנים וסיום'}
              </div>
            </div>
            {onSkip && (
              <button
                type="button"
                disabled={isFinishing}
                onClick={onSkip}
                className="glass"
                style={{
                  height: 44,
                  borderRadius: 999,
                  padding: '0 16px',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                דלג
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 5,
            }}
          >
            {[1, 2, 3, 4, 5].map((s) => {
              const active = step === s;
              const done = step > s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`שלב ${s}`}
                  onClick={() => setStep(s as 1 | 2 | 3 | 4 | 5)}
                  style={{
                    height: 4,
                    borderRadius: 999,
                    border: 'none',
                    background: active ? 'var(--accent)'
                      : done
                      ? 'var(--surface-2)'
                      : 'var(--bg-surface-3)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* שלב 1: פרטים אישיים */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <TextInput
              label="שם תצוגה למתאמנים"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            <TextInput
              label="טייטל מקצועי"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
            />
            <TextInput
              dir="ltr"
              type="tel"
              inputMode="tel"
              label="טלפון / וואטסאפ"
              placeholder="052-0000000"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
            />
            <PasswordInput
              dir="ltr"
              autoComplete="new-password"
              label="החלפת סיסמה אישית (אופציונלי)"
              placeholder="השאר ריק לשמירת הקיימת"
              value={newPassword}
              onChange={(e) => setNewPassword(e.currentTarget.value)}
            />

            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-volt"
              style={{
                marginTop: 4,
                padding: '11px',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <span>המשך</span>
              <ChevronLeft size={16} />
            </button>
          </div>
        )}

        {/* שלב 2: תחומי התמחות ומשפט פתיחה */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                תחומי ההתמחות שלך:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {SPECIALTY_OPTIONS.map((opt) => {
                  const selected = specialties.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        setSpecialties((prev) =>
                          prev.includes(opt)
                            ? prev.filter((x) => x !== opt)
                            : [...prev, opt]
                        )
                      }
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'var(--bg-surface-1)',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <TextInput
                size="xs"
                placeholder="התמחות נוספת..."
                value={specialtiesNote}
                onChange={(e) => setSpecialtiesNote(e.currentTarget.value)}
              />
            </div>

            <Textarea
              label="משפט פתיחה שיוצג למתאמנים שלך"
              minRows={2}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.currentTarget.value)}
            />

            <div className="wizard-nav">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="glass"
                style={{
                  height: 52,
                  borderRadius: 999,
                  padding: '0 18px',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={15} />
                <span>חזרה</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '11px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span>המשך</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* שלב 3: ימי תשקיף וברירות מחדל (כולל הזנת כל מספר מותאם אישית) */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4 }}>
                ימי תשקיף אוטומטיים למתאמן חדש
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                תצפית בהרגלי האכילה לפני יעדים קבועים (בחר קיצור או הזן כל מספר).
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {[
                  { days: 0, label: '0' },
                  { days: 3, label: '3 ימים' },
                  { days: 5, label: '5 ימים' },
                  { days: 7, label: '7 ימים' },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setDefaultObservationDays(opt.days)}
                    style={{
                      minHeight: 44,
                      padding: '0 4px',
                      borderRadius: 14,
                      border:
                        defaultObservationDays === opt.days ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                      background:
                        defaultObservationDays === opt.days ? 'var(--sel-bg)'
                          : 'transparent',
                      color:
                        defaultObservationDays === opt.days ? 'var(--sel-text)'
                          : 'var(--text)',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <NumberInput
                size="xs"
                label="מספר ימים מדויק"
                placeholder="0"
                value={defaultObservationDays}
                min={0}
                max={90}
                step={1}
                allowDecimal={false}
                clampBehavior="none"
                onChange={setDefaultObservationDays}
              />
            </div>

            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                ספירת ימי תשקיף ביעדים כברירת מחדל:
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                }}
              >
                <button
                  type="button"
                  onClick={() => setDefaultCountObservationInStats(false)}
                  style={{
                    minHeight: 44,
                    padding: '0 6px',
                    borderRadius: 14,
                    border: !defaultCountObservationInStats
                      ? '1px solid var(--sel-border)'
                      : '1px solid var(--line-2)',
                    background: !defaultCountObservationInStats
                      ? 'var(--sel-bg)'
                      : 'transparent',
                    color: !defaultCountObservationInStats
                      ? 'var(--sel-text)'
                      : 'var(--text)',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  החרג מחישוב חריגות
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultCountObservationInStats(true)}
                  style={{
                    minHeight: 44,
                    padding: '0 6px',
                    borderRadius: 14,
                    border: defaultCountObservationInStats
                      ? '1px solid var(--sel-border)'
                      : '1px solid var(--line-2)',
                    background: defaultCountObservationInStats
                      ? 'var(--sel-bg)'
                      : 'transparent',
                    color: defaultCountObservationInStats
                      ? 'var(--sel-text)'
                      : 'var(--text)',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  כלול בספירה הכללית
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--line-2)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  גמישות קלורית:
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[5, 10, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDefaultTolerancePercent(pct)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        padding: '0 2px',
                        borderRadius: 14,
                        border:
                          defaultTolerancePercent === pct ? '1px solid var(--sel-border)'
                            : '1px solid var(--line-2)',
                        background:
                          defaultTolerancePercent === pct ? 'var(--sel-bg)'
                            : 'var(--bg-surface-1)',
                        color:
                          defaultTolerancePercent === pct ? 'var(--sel-text)'
                            : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      ±{pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid var(--line-2)',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  יעד מים (כוסות):
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[10, 12, 14].map((cups) => (
                    <button
                      key={cups}
                      type="button"
                      onClick={() => setDefaultWaterGoal(cups)}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        padding: '0 2px',
                        borderRadius: 14,
                        border:
                          defaultWaterGoal === cups
                            ? '1px solid var(--sel-border)'
                            : '1px solid var(--line-2)',
                        background: defaultWaterGoal === cups ? 'var(--sel-bg)' : 'transparent',
                        color: defaultWaterGoal === cups ? 'var(--sel-text)' : 'var(--text)',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {cups}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ברירת מחדל: טווח תאריכים פעילים לניווט מתאמן */}
            <div
              style={{ padding: 0 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 4,
                }}
              >
                <CalendarRange size={14} color="currentColor" />
                <span>טווח תאריכים פעילים לניווט (ברירת מחדל למתאמן חדש):</span>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                קובע לכמה ימים אחורה/קדימה מהיום המתאמן יכול לנווט בסרגל השבועי ובלוח השנה החודשי.
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                }}
              >
                <NumberInput
                  size="xs"
                  label="ימים אחורה מהיום"
                  placeholder="0"
                  value={defaultActivePastDays}
                  min={0}
                  max={365}
                  allowDecimal={false}
                  clampBehavior="none"
                  onChange={setDefaultActivePastDays}
                />
                <NumberInput
                  size="xs"
                  label="ימים קדימה מהיום"
                  placeholder="0"
                  value={defaultActiveFutureDays}
                  min={0}
                  max={180}
                  allowDecimal={false}
                  clampBehavior="none"
                  onChange={setDefaultActiveFutureDays}
                />
              </div>
              <div style={{ marginTop: 10 }}>
                <Switch
                  size="xs"
                  color="orange"
                  checked={defaultRestrictNonObsOnObsDays}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDefaultRestrictNonObsOnObsDays(e.currentTarget.checked)
                  }
                  label="נעילת מעבר לימים שאינם יום תשקיף כאשר היום בארץ הוא יום תשקיף"
                />
              </div>
            </div>

            {/* ברירת מחדל: מאכלים אהובים (רק אם המאמן מסמן במפורש) */}
            <div
              style={{ padding: 0 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                  marginBottom: 6,
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
                  <Heart size={14} color="currentColor" />
                  <span>
                    אוכל אהוב כברירת מחדל ({defaultFavoriteFoodIds.length})
                  </span>
                </div>
                {defaultFavoriteFoodIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDefaultFavoriteFoodIds([])}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    נקה הכל
                  </button>
                )}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                ברירת המחדל ריקה — יתווספו מועדפים התחלתיים למתאמן חדש רק אם תסמן כאן:
              </div>
              <TextInput
                size="xs"
                leftSection={<Search size={12} />}
                placeholder="חפש מאכל לסמן כמועדף ברירת מחדל..."
                value={favSearchQuery}
                onChange={(e) => setFavSearchQuery(e.currentTarget.value)}
                mb={8}
              />
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 5,
                  maxHeight: 130,
                  overflowY: 'auto',
                }}
              >
                {ISRAELI_FOOD_CATALOG.filter((f) => {
                  const q = favSearchQuery.trim().toLowerCase();
                  if (!q) return defaultFavoriteFoodIds.includes(f.id) || ISRAELI_FOOD_CATALOG.indexOf(f) < 16;
                  return (
                    f.name.toLowerCase().includes(q) ||
                    (f.brand || '').toLowerCase().includes(q)
                  );
                })
                  .slice(0, 24)
                  .map((food) => {
                    const selected = defaultFavoriteFoodIds.includes(food.id);
                    return (
                      <button
                        key={food.id}
                        type="button"
                        onClick={() =>
                          setDefaultFavoriteFoodIds((prev) =>
                            prev.includes(food.id)
                              ? prev.filter((id) => id !== food.id)
                              : [...prev, food.id]
                          )
                        }
                        style={{
                          padding: '4px 9px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: selected ? '1px solid var(--sel-border)'
                            : '1px solid var(--line-2)',
                          background: selected ? 'var(--sel-bg)'
                            : 'var(--bg-surface-1)',
                          color: selected ? 'var(--sel-text)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        {selected ? '✓ ' : '+ '}
                        {food.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="wizard-nav">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="glass"
                style={{
                  height: 52,
                  borderRadius: 999,
                  padding: '0 18px',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={15} />
                <span>חזרה</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '11px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span>המשך</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* שלב 4: תבניות התחלתיות */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--line-2)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                סמן תבניות תפריט להוספה לספרייה שלך:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STARTER_TEMPLATE_PRESETS.map((preset) => {
                  const checked = selectedTemplateKeys.includes(preset.key);
                  return (
                    <div
                      key={preset.key}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'var(--bg-surface-1)',
                        border: checked ? '1px solid var(--text-3)'
                          : '1px solid var(--line-2)',
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(e) => {
                          const isChecked = e.currentTarget.checked;
                          setSelectedTemplateKeys((prev) =>
                            isChecked
                              ? [...prev, preset.key]
                              : prev.filter((k) => k !== preset.key)
                          );
                        }}
                        label={
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 13 }}>
                              {preset.name}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {preset.description}
                            </div>
                          </div>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="wizard-nav">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="glass"
                style={{
                  height: 52,
                  borderRadius: 999,
                  padding: '0 18px',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={15} />
                <span>חזרה</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '11px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <span>המשך</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* שלב 5: קבוצות מתאמנים וסיום */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 12,
                border: '1px solid var(--line-2)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                קבוצות מתאמנים ראשונות:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {STARTER_GROUP_OPTIONS.map((grp) => {
                  const selected = selectedGroupNames.includes(grp);
                  return (
                    <button
                      key={grp}
                      type="button"
                      onClick={() =>
                        setSelectedGroupNames((prev) =>
                          prev.includes(grp)
                            ? prev.filter((x) => x !== grp)
                            : [...prev, grp]
                        )
                      }
                      style={{
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'var(--bg-surface-1)',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {grp}
                    </button>
                  );
                })}
              </div>
              <TextInput
                size="xs"
                placeholder="הוסף קבוצה נוספת (למשל: חיטוב קיץ)..."
                value={customGroupName}
                onChange={(e) => setCustomGroupName(e.currentTarget.value)}
              />
            </div>

            <div className="wizard-nav">
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => setStep(4)}
                className="glass"
                style={{
                  height: 52,
                  borderRadius: 999,
                  padding: '0 18px',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={15} />
                <span>חזרה</span>
              </button>

              <button
                type="button"
                disabled={isFinishing}
                onClick={handleFinish}
                className="btn-volt"
                style={{
                  flex: 1,
                  height: 52,
                  fontSize: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                {isFinishing ? (
                  <Loader2 size={16} className="spot-spinner" />
                ) : (
                  <Check size={16} />
                )}
                <span>{isFinishing ? 'שומר...' : 'סיום ושמירה'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
