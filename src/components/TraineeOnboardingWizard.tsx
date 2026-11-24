'use client';

import React, { useState, useEffect } from 'react';
import { TextInput, NumberInput, Textarea } from '@mantine/core';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Footprints,
  Dumbbell,
  Loader2,
} from 'lucide-react';
import {
  BodyMeasurementEntry,
  TraineeOnboardingData,
  TraineeProfile,
} from '@/types/nutrition';
import { getTodayIso } from '@/data/israeliFoodCatalog';
import { computeAgeFromBirthDate } from '@/lib/dateUtils';
import { BodyMeasurementGuide } from './BodyMeasurementGuide';
import { useSpotUnsavedEditing } from '@/lib/webVersionGuard';

interface TraineeOnboardingWizardProps {
  trainee: TraineeProfile;
  onCancel?: () => void;
  onCompleteOnboarding: (data: {
    name: string;
    currentWeight: number;
    targetWeight: number;
    onboarding: TraineeOnboardingData;
    measurement?: BodyMeasurementEntry;
  }) => void | Promise<void>;
}

const NEAT_OPTIONS = [
  'יושבני / עבודה משרדית',
  'תנועתי חלקית (עמידה וסידורים)',
  'עבודה פיזית פעילה',
  'תנועה מרובה מאוד כל היום',
];

const STRENGTH_OPTIONS = [
  'ללא אימוני כוח כרגע',
  '1–2 אימוני כוח בשבוע',
  '3–4 אימוני כוח בשבוע',
  '5+ אימוני כוח בשבוע',
];

const WALKING_OPTIONS = [
  'ללא הליכות קבועות',
  '1–2 פעמים הליכה בשבוע',
  '3–4 פעמים הליכה בשבוע',
  '5+ פעמים / הליכה יומית',
  'מקפיד על 8,000+ צעדים ביום',
];

const SLEEP_OPTIONS = [
  'פחות מ-6 שעות בלילה',
  '6–7 שעות בלילה',
  '7–8 שעות בלילה',
  '8+ שעות בלילה',
];

const DIET_STYLE_OPTIONS = [
  'אוכל הכל (ללא הגבלה)',
  'שומר כשרות',
  'צמחוני',
  'טבעוני',
  'ללא גלוטן',
  'ללא לקטוז / ממעט במוצרי חלב',
];

const MUST_HAVE_FOODS_OPTIONS = [
  'קפה הפוך בבוקר',
  'מתוק קטן / שוקולד בערב',
  'ארוחת שישי משפחתית',
  'לחם / טוסט ביום',
  'אורז / פחמימה חמה בצהריים',
  'ארוחה במסעדה פעם בשבוע',
];

const DISLIKED_FOODS_OPTIONS = [
  'אין אלרגיות – אוכל הכל',
  'לא אוכל דגים / טונה',
  'לא אוכל קוטג׳ / גבינות לבנות',
  'לא אוכל ביצים',
  'לא אוכל טחינה / אבוקדו',
  'רגישות לבוטנים / אגוזים',
];

const CHALLENGES_OPTIONS = [
  'רעב ונשנושים בשעות הערב/לילה',
  'חוסר זמן להכין אוכל בצהריים',
  'קושי להגיע לכמות החלבון היומית',
  'יציאה משגרה בסופי שבוע',
  'אכילה מתוך סטרס / עייפות',
  'שוכח לשתות מספיק מים',
];

function calculateEstimatedBmrAndTdee(params: {
  gender: 'male' | 'female';
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: string;
  strengthWorkouts: string;
  walkingSessions: string;
}): { bmr: number; tdee: number } {
  // נוסחת Mifflin-St Jeor המדויקת
  const base =
    10 * params.weightKg + 6.25 * params.heightCm - 5 * params.age;
  const bmr = Math.round(params.gender === 'male' ? base + 5 : base - 161);

  let multiplier = 1.25;
  if (params.activityLevel.includes('תנועתי חלקית')) multiplier = 1.35;
  if (params.activityLevel.includes('פיזית')) multiplier = 1.48;
  if (params.activityLevel.includes('מרובה')) multiplier = 1.58;

  if (params.strengthWorkouts.includes('1–2')) multiplier += 0.06;
  if (params.strengthWorkouts.includes('3–4')) multiplier += 0.12;
  if (params.strengthWorkouts.includes('5+')) multiplier += 0.18;

  if (params.walkingSessions.includes('1–2')) multiplier += 0.04;
  if (params.walkingSessions.includes('3–4')) multiplier += 0.08;
  if (
    params.walkingSessions.includes('5+') ||
    params.walkingSessions.includes('8,000')
  ) {
    multiplier += 0.13;
  }

  return {
    bmr,
    tdee: Math.round(bmr * multiplier),
  };
}

export function TraineeOnboardingWizard({
  trainee,
  onCancel,
  onCompleteOnboarding,
}: TraineeOnboardingWizardProps) {
  const existing = trainee.onboarding;
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // שלב 1: פרטים אישיים, אורח חיים, אימונים והליכה
  const [name, setName] = useState(trainee.name || '');
  const [gender, setGender] = useState<'male' | 'female'>(
    existing?.gender || 'male'
  );
  const [birthDate, setBirthDate] = useState<string>(() => {
    if (existing?.birthDate) return existing.birthDate;
    const approxAge = existing?.age || 28;
    const y = Math.max(1930, new Date().getFullYear() - approxAge);
    return `${y}-01-01`;
  });
  const computedAge = computeAgeFromBirthDate(birthDate, existing?.age || 28);
  const [heightCm, setHeightCm] = useState<number>(existing?.heightCm || 174);
  const [currentWeight, setCurrentWeight] = useState<number>(
    trainee.currentWeight || 75
  );
  const [targetWeight, setTargetWeight] = useState<number>(
    trainee.targetWeight || 70
  );

  const [activityLevel, setActivityLevel] = useState(
    existing?.activityLevel || NEAT_OPTIONS[0]
  );
  const [activityLevelNote, setActivityLevelNote] = useState(
    existing?.activityLevelNote || ''
  );

  const [strengthWorkouts, setStrengthWorkouts] = useState(
    existing?.strengthWorkoutsPerWeek || STRENGTH_OPTIONS[2]
  );
  const [strengthWorkoutsNote, setStrengthWorkoutsNote] = useState(
    existing?.strengthWorkoutsNote || ''
  );

  const [walkingSessions, setWalkingSessions] = useState(
    existing?.walkingSessionsPerWeek || WALKING_OPTIONS[2]
  );
  const [walkingSessionsNote, setWalkingSessionsNote] = useState(
    existing?.walkingSessionsNote || ''
  );

  const [sleepHours, setSleepHours] = useState(
    existing?.sleepHours || SLEEP_OPTIONS[1]
  );
  const [sleepHoursNote, setSleepHoursNote] = useState(
    existing?.sleepHoursNote || ''
  );

  // שלב 2: היקפים
  const lastMeas =
    trainee.measurementsHistory?.[trainee.measurementsHistory.length - 1];
  const [measurements, setMeasurements] = useState<{
    chestCm?: number;
    waistNavelCm?: number;
    armCm?: number;
    thighCm?: number;
  }>({
    chestCm: lastMeas?.chestCm,
    waistNavelCm: lastMeas?.waistNavelCm,
    armCm: lastMeas?.armCm,
    thighCm: lastMeas?.thighCm,
  });
  const [skippedMeasurements, setSkippedMeasurements] = useState(false);

  // שלב 3: הרגלי תזונה, אוכל שלא מוותרים עליו ובקשות למאמן
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>(
    existing?.dietaryPreferences || [DIET_STYLE_OPTIONS[0]]
  );
  const [dietaryPreferencesNote, setDietaryPreferencesNote] = useState(
    existing?.dietaryPreferencesNote || ''
  );

  const [favoriteMustHaveFoods, setFavoriteMustHaveFoods] = useState<string[]>(
    existing?.favoriteMustHaveFoods || [MUST_HAVE_FOODS_OPTIONS[0]]
  );
  const [favoriteMustHaveFoodsNote, setFavoriteMustHaveFoodsNote] = useState(
    existing?.favoriteMustHaveFoodsNote || ''
  );

  const [dislikedOrAllergies, setDislikedOrAllergies] = useState<string[]>(
    existing?.dislikedOrAllergies || [DISLIKED_FOODS_OPTIONS[0]]
  );
  const [dislikedOrAllergiesNote, setDislikedOrAllergiesNote] = useState(
    existing?.dislikedOrAllergiesNote || ''
  );

  const [eatingChallenges, setEatingChallenges] = useState<string[]>(
    existing?.eatingChallenges || []
  );
  const [scheduleAndNotes, setScheduleAndNotes] = useState(
    existing?.scheduleAndNotes || ''
  );
  const [isFinishing, setIsFinishing] = useState(false);
  useSpotUnsavedEditing('trainee-onboarding-wizard', true);

  const toggleMultiOption = (
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>,
    item: string
  ) => {
    setList((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]
    );
  };

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      const { bmr, tdee } = calculateEstimatedBmrAndTdee({
        gender,
        age: computedAge,
        heightCm,
        weightKg: currentWeight,
        activityLevel,
        strengthWorkouts,
        walkingSessions,
      });

      const hasAnyMeasurement =
        !skippedMeasurements &&
        Boolean(
          measurements.chestCm ||
            measurements.waistNavelCm ||
            measurements.armCm ||
            measurements.thighCm
        );

      const onboardingData: TraineeOnboardingData = {
        completed: true,
        measurementsCompleted: hasAnyMeasurement,
        age: computedAge,
        birthDate,
        gender,
        heightCm,
        activityLevel,
        activityLevelNote: activityLevelNote.trim(),
        strengthWorkoutsPerWeek: strengthWorkouts,
        strengthWorkoutsNote: strengthWorkoutsNote.trim(),
        walkingSessionsPerWeek: walkingSessions,
        walkingSessionsNote: walkingSessionsNote.trim(),
        sleepHours,
        sleepHoursNote: sleepHoursNote.trim(),
        dietaryPreferences,
        dietaryPreferencesNote: dietaryPreferencesNote.trim(),
        favoriteMustHaveFoods,
        favoriteMustHaveFoodsNote: favoriteMustHaveFoodsNote.trim(),
        dislikedOrAllergies,
        dislikedOrAllergiesNote: dislikedOrAllergiesNote.trim(),
        eatingChallenges,
        scheduleAndNotes: scheduleAndNotes.trim(),
        estimatedBmr: bmr,
        estimatedTdee: tdee,
        completedAt: getTodayIso(),
      };

      const measurementEntry: BodyMeasurementEntry | undefined =
        hasAnyMeasurement
          ? {
              date: getTodayIso(),
              ...measurements,
              weightKg: currentWeight,
            }
          : undefined;

      await onCompleteOnboarding({
        name: name.trim() || trainee.name,
        currentWeight,
        targetWeight,
        onboarding: onboardingData,
        measurement: measurementEntry,
      });
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 490,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-start',
        padding: '6px 0 calc(28px + var(--sa-bottom))',
      }}
    >
      <div style={{ width: '100%', padding: '14px 4px 0' }}>
        {/* כותרת ופס התקדמות קומפקטי */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 8,
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text-2)',
                }}
              >
                התאמת הפרופיל האישי · שלב <bdi className="ltr-num">{step}</bdi> מתוך <bdi className="ltr-num">6</bdi>
              </span>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8, lineHeight: 1.2 }}>
                {step === 1 && 'פרטים אישיים ויעד משקל'}
                {step === 2 && 'שגרה יומית ושעות שינה'}
                {step === 3 && 'אימוני כוח והליכות'}
                {step === 4 && 'מדידת היקפים'}
                {step === 5 && 'סגנון תזונה ומאכלים אהובים'}
                {step === 6 && 'רגישויות ודגשים למאמן'}
              </div>
            </div>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="glass"
                style={{
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  flexShrink: 0,
                  fontFamily: 'inherit',
                }}
              >
                <ChevronRight size={16} />
                <span>חזרה לפרופיל</span>
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 5,
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((s) => {
              const active = step === s;
              const done = step > s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-label={`שלב ${s}`}
                  onClick={() => setStep(s as 1 | 2 | 3 | 4 | 5 | 6)}
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

        {/* ================================================================= */}
        {/* שלב 1: פרטים אישיים ומשקל                                         */}
        {/* ================================================================= */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextInput
              label="שם מלא"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                מין
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 6,
                  background: 'var(--bg-surface-2)',
                  padding: 4,
                  borderRadius: 12,
                  border: '1px solid var(--line-2)',
                }}
              >
                {[
                  { id: 'male', label: 'זכר' },
                  { id: 'female', label: 'נקבה' },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGender(g.id as 'male' | 'female')}
                    style={{
                      padding: '7px',
                      borderRadius: 8,
                      border: 'none',
                      background:
                        gender === g.id ? 'var(--sel-bg)' : 'transparent',
                      color:
                        gender === g.id ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gap: 10,
              }}
            >
              <div
                style={{
                  gridColumn: '1 / -1',
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                >
                  <span>תאריך לידה</span>
                  <span
                    style={{
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: 'var(--accent-orange-bright)',
                    }}
                  >
                    גיל {computedAge}
                  </span>
                </div>
                <input
                  type="date"
                  value={birthDate}
                  max={getTodayIso()}
                  min="1930-01-01"
                  onChange={(e) => {
                    if (e.target.value) setBirthDate(e.target.value);
                  }}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    height: 52,
                    minHeight: 52,
                    padding: '0 14px',
                    borderRadius: 16,
                    border: '1px solid var(--line-2)',
                    backgroundColor: 'var(--surface-2)',
                    color: 'var(--text)',
                    fontSize: 16,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                  }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', minWidth: 0 }}>
                <NumberInput
                  label="גובה (ס״מ)"
                  value={heightCm}
                  min={120}
                  max={230}
                  onChange={(v) => setHeightCm(Number(v) || 174)}
                />
              </div>
              <NumberInput
                label="משקל נוכחי (ק״ג)"
                value={currentWeight}
                min={35}
                max={250}
                step={0.5}
                decimalScale={1}
                onChange={(v) => setCurrentWeight(Number(v) || 75)}
              />
              <NumberInput
                label="משקל יעד (ק״ג)"
                value={targetWeight}
                min={35}
                max={250}
                step={0.5}
                decimalScale={1}
                onChange={(v) => setTargetWeight(Number(v) || 70)}
              />
            </div>

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

        {/* ================================================================= */}
        {/* שלב 2: אורח חיים יומי ושעות שינה                                  */}
        {/* ================================================================= */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                אורח חיים יומי (מחוץ לאימונים):
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {NEAT_OPTIONS.map((opt) => {
                  const selected = activityLevel === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setActivityLevel(opt)}
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'transparent',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="הערה נוספת (למשל: עומד 4 שעות ביום)..."
                value={activityLevelNote}
                onChange={(e) => setActivityLevelNote(e.currentTarget.value)}
              />
            </div>

            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                ממוצע שעות שינה בלילה:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {SLEEP_OPTIONS.map((opt) => {
                  const selected = sleepHours === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setSleepHours(opt)}
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'transparent',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="הערה על שעות שינה / משמרות..."
                value={sleepHoursNote}
                onChange={(e) => setSleepHoursNote(e.currentTarget.value)}
              />
            </div>

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

        {/* ================================================================= */}
        {/* שלב 3: אימוני כוח והליכות                                         */}
        {/* ================================================================= */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{ padding: 0 }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Dumbbell size={14} color="currentColor" />
                <span>כמה אימוני כוח בשבוע?</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {STRENGTH_OPTIONS.map((opt) => {
                  const selected = strengthWorkouts === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setStrengthWorkouts(opt)}
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'transparent',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="פירוט על האימונים (AB, פילאטיס וכו')..."
                value={strengthWorkoutsNote}
                onChange={(e) =>
                  setStrengthWorkoutsNote(e.currentTarget.value)
                }
              />
            </div>

            <div
              style={{ padding: 0 }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  marginBottom: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Footprints size={16} color="var(--text-2)" />
                <span>כמה פעמים הליכה / אירובי בשבוע?</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {WALKING_OPTIONS.map((opt) => {
                  const selected = walkingSessions === opt;
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWalkingSessions(opt)}
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)' : 'transparent',
                        color: selected ? 'var(--sel-text)' : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="פירוט (למשל: 40 דקות בערב, צעדים וכו')..."
                value={walkingSessionsNote}
                onChange={(e) =>
                  setWalkingSessionsNote(e.currentTarget.value)
                }
              />
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
                <span>המשך למדידת היקפים</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* שלב 4: מדידת היקפים (קומפקטי ללא גלילה)                          */}
        {/* ================================================================= */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              בחר אזור לראות כיצד למדוד. אם אין לידך סרט מדידה כרגע, תוכל להמשיך ללא מילוי.
            </div>

            <BodyMeasurementGuide
              compact
              initialValues={measurements}
              onChange={(vals) => {
                setMeasurements(vals);
                setSkippedMeasurements(false);
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginTop: 2,
              }}
            >
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-surface"
                style={{
                  padding: '10px 12px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={14} />
                <span>חזרה</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const hasAnyFilled = Boolean(
                    measurements.chestCm ||
                      measurements.waistNavelCm ||
                      measurements.armCm ||
                      measurements.thighCm
                  );
                  setSkippedMeasurements(!hasAnyFilled);
                  setStep(5);
                }}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <span>המשך</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* שלב 5: סגנון תזונה ומאכלים אהובים                                 */}
        {/* ================================================================= */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                סגנון תזונה (ניתן לבחור כמה):
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {DIET_STYLE_OPTIONS.map((opt) => {
                  const selected = dietaryPreferences.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        toggleMultiOption(
                          dietaryPreferences,
                          setDietaryPreferences,
                          opt
                        )
                      }
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'transparent',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="הערה על סגנון התזונה..."
                value={dietaryPreferencesNote}
                onChange={(e) =>
                  setDietaryPreferencesNote(e.currentTarget.value)
                }
              />
            </div>

            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                מאכלים או פינוקים שחשוב לך לשלב בתפריט:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {MUST_HAVE_FOODS_OPTIONS.map((opt) => {
                  const selected = favoriteMustHaveFoods.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        toggleMultiOption(
                          favoriteMustHaveFoods,
                          setFavoriteMustHaveFoods,
                          opt
                        )
                      }
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)'
                          : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)'
                          : 'transparent',
                        color: selected ? 'var(--sel-text)'
                          : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="מאכל אהוב נוסף שלא רוצה לוותר עליו..."
                value={favoriteMustHaveFoodsNote}
                onChange={(e) =>
                  setFavoriteMustHaveFoodsNote(e.currentTarget.value)
                }
              />
            </div>

            <div className="wizard-nav">
              <button
                type="button"
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
                onClick={() => setStep(6)}
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

        {/* ================================================================= */}
        {/* שלב 6: רגישויות, אתגרים והערות למאמן                             */}
        {/* ================================================================= */}
        {step === 6 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                רגישויות, אלרגיות או מאכלים שלא אוכל:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {DISLIKED_FOODS_OPTIONS.map((opt) => {
                  const selected = dislikedOrAllergies.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        toggleMultiOption(
                          dislikedOrAllergies,
                          setDislikedOrAllergies,
                          opt
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
                        color: selected ? 'var(--sel-text)' : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
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
                placeholder="פירוט אלרגיות או מאכלים להוציא מהתפריט..."
                value={dislikedOrAllergiesNote}
                onChange={(e) =>
                  setDislikedOrAllergiesNote(e.currentTarget.value)
                }
              />
            </div>

            <div
              style={{ padding: 0 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                אתגרים והערות למאמן:
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {CHALLENGES_OPTIONS.map((opt) => {
                  const selected = eatingChallenges.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() =>
                        toggleMultiOption(
                          eatingChallenges,
                          setEatingChallenges,
                          opt
                        )
                      }
                      style={{
                        minHeight: 40,
                        padding: '0 14px',
                        borderRadius: 999,
                        border: selected ? '1px solid var(--sel-border)' : '1px solid var(--line-2)',
                        background: selected ? 'var(--sel-bg)' : 'transparent',
                        color: selected ? 'var(--sel-text)' : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              <Textarea
                size="xs"
                minRows={2}
                placeholder="שעות ערות/אימונים וכל הערה חשובה..."
                value={scheduleAndNotes}
                onChange={(e) => setScheduleAndNotes(e.currentTarget.value)}
              />
            </div>

            <div className="wizard-nav">
              <button
                type="button"
                disabled={isFinishing}
                onClick={() => setStep(5)}
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
                <span>{isFinishing ? 'שומר פרופיל...' : 'שמור וסיים'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
