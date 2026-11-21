'use client';

import React, { useState, useEffect } from 'react';
import { TextInput, NumberInput, Textarea } from '@mantine/core';
import {
  User,
  Ruler,
  Utensils,
  Check,
  ChevronLeft,
  ChevronRight,
  SkipForward,
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
import { BodyMeasurementGuide } from './BodyMeasurementGuide';

interface TraineeOnboardingWizardProps {
  trainee: TraineeProfile;
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
  onCompleteOnboarding,
}: TraineeOnboardingWizardProps) {
  const existing = trainee.onboarding;
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
  const [age, setAge] = useState<number>(existing?.age || 28);
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
        age,
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
        age,
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
    <div style={{ maxWidth: 540, margin: '0 auto', paddingBottom: 40 }}>
      <div className="pro-card-elevated" style={{ padding: '24px 20px' }}>
        {/* כותרת וסרגל התקדמות של 3 השלבים */}
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--accent-volt)',
                  textTransform: 'uppercase',
                }}
              >
                הגדרת פרופיל מתאמן אישי · שלב {step} מתוך 3
              </span>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>
                {step === 1 && 'נתוני גוף, אימונים והליכה שבועית'}
                {step === 2 && 'מדידת היקפים מודרכת (עם הנפשה)'}
                {step === 3 && 'הרגלי תזונה ובקשות מיוחדות למאמן'}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {[
              { s: 1, label: '1. נתונים והליכה', icon: User },
              { s: 2, label: '2. בדיקת היקפים', icon: Ruler },
              { s: 3, label: '3. העדפות תזונה', icon: Utensils },
            ].map((item) => {
              const active = step === item.s;
              const done = step > item.s;
              return (
                <button
                  key={item.s}
                  type="button"
                  onClick={() => setStep(item.s as 1 | 2 | 3)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: active
                      ? '1px solid var(--accent-volt)'
                      : '1px solid var(--border-subtle)',
                    background: done
                      ? 'rgba(210, 255, 40, 0.14)'
                      : active
                      ? 'rgba(210, 255, 40, 0.08)'
                      : 'var(--bg-surface-2)',
                    color:
                      active || done
                        ? 'var(--accent-volt)'
                        : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ================================================================= */}
        {/* שלב 1: נתוני גוף, אימוני כוח והליכה שבועית                        */}
        {/* ================================================================= */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                gap: 10,
              }}
            >
              <TextInput
                label="שם מלא"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
              />
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}
                >
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
                    border: '1px solid var(--border-subtle)',
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
                        padding: '6px',
                        borderRadius: 8,
                        border: 'none',
                        background:
                          gender === g.id
                            ? 'var(--accent-volt)'
                            : 'transparent',
                        color:
                          gender === g.id
                            ? '#08090c'
                            : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))',
                gap: 8,
              }}
            >
              <NumberInput
                label="גיל"
                value={age}
                min={14}
                max={95}
                onChange={(v) => setAge(Number(v) || 28)}
              />
              <NumberInput
                label="גובה (ס״מ)"
                value={heightCm}
                min={120}
                max={230}
                onChange={(v) => setHeightCm(Number(v) || 174)}
              />
              <NumberInput
                label="משקל (ק״ג)"
                value={currentWeight}
                min={35}
                max={250}
                step={0.5}
                decimalScale={1}
                onChange={(v) => setCurrentWeight(Number(v) || 75)}
              />
              <NumberInput
                label="משקל יעד"
                value={targetWeight}
                min={35}
                max={250}
                step={0.5}
                decimalScale={1}
                onChange={(v) => setTargetWeight(Number(v) || 70)}
              />
            </div>

            {/* שאלה א': רמת פעילות יומיומית */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid var(--accent-volt)'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(210, 255, 40, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected
                          ? 'var(--accent-volt)'
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
                placeholder="פירוט חופשי נוסף (למשל: עומד 4 שעות ביום, שליח וכו')..."
                value={activityLevelNote}
                onChange={(e) => setActivityLevelNote(e.currentTarget.value)}
              />
            </div>

            {/* שאלה ב': כמה אימוני כוח בשבוע */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Dumbbell size={15} color="var(--accent-volt)" />
                <span>כמה אימוני כוח / חדר כושר בשבוע?</span>
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid var(--accent-volt)'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(210, 255, 40, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected
                          ? 'var(--accent-volt)'
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
                placeholder="פירוט חופשי על האימונים שלך (AB, פילאטיס, קרוספיט וכו')..."
                value={strengthWorkoutsNote}
                onChange={(e) =>
                  setStrengthWorkoutsNote(e.currentTarget.value)
                }
              />
            </div>

            {/* שאלה ג' (נפרדת): כמה פעמים הליכה בשבוע */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Footprints size={15} color="#38bdf8" />
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid #38bdf8'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(56, 189, 248, 0.15)'
                          : 'var(--bg-surface-1)',
                        color: selected ? '#38bdf8' : 'var(--text-secondary)',
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
                placeholder="פירוט חופשי (למשל: 40 דקות הליכה בערב, ממוצע צעדים יומי וכו')..."
                value={walkingSessionsNote}
                onChange={(e) =>
                  setWalkingSessionsNote(e.currentTarget.value)
                }
              />
            </div>

            {/* שאלה ד': שעות שינה */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid var(--accent-volt)'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(210, 255, 40, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected
                          ? 'var(--accent-volt)'
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
                placeholder="הערה חופשית על שעות שינה / משמרות..."
                value={sleepHoursNote}
                onChange={(e) => setSleepHoursNote(e.currentTarget.value)}
              />
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-volt"
              style={{
                padding: '12px',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <span>המשך לשלב 2: בדיקת היקפים מודרכת</span>
              <ChevronLeft size={16} />
            </button>
          </div>
        )}

        {/* ================================================================= */}
        {/* שלב 2: מדידת היקפים עם הנפשות SVG ואפשרות דילוג                    */}
        {/* ================================================================= */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              לחץ על כל אזור גוף כדי לראות את ההנפשה והוראות המדידה המדויקות. אם
              אין לידך סרט מדידה כרגע, תוכל לדלג ולהשלים מאוחר יותר.
            </div>

            <BodyMeasurementGuide
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
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-surface"
                style={{
                  padding: '10px 14px',
                  fontSize: 12,
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
                onClick={() => {
                  setSkippedMeasurements(true);
                  setStep(3);
                }}
                className="btn-surface"
                style={{
                  padding: '10px 14px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <SkipForward size={14} />
                <span>דלג ואשלים אחר כך</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSkippedMeasurements(false);
                  setStep(3);
                }}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <span>שמור והמשך לשלב 3</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* שלב 3: הרגלי תזונה, אוכל שלא מוותרים עליו ובקשות למאמן             */}
        {/* ================================================================= */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* סגנון תזונה */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                סגנון תזונה (ניתן לבחור מספר אפשרויות):
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid var(--accent-volt)'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(210, 255, 40, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected
                          ? 'var(--accent-volt)'
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
                placeholder="הערה או פירוט חופשי על סגנון התזונה שלך..."
                value={dietaryPreferencesNote}
                onChange={(e) =>
                  setDietaryPreferencesNote(e.currentTarget.value)
                }
              />
            </div>

            {/* אוכל שלא מוכן לוותר עליו */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                מאכלים או פינוקים שחשוב לך לא לוותר עליהם בתפריט:
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid var(--accent-volt)'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(210, 255, 40, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected
                          ? 'var(--accent-volt)'
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
                placeholder="כתוב בחופשיות כל מאכל שאתה אוהב ולא רוצה לוותר עליו..."
                value={favoriteMustHaveFoodsNote}
                onChange={(e) =>
                  setFavoriteMustHaveFoodsNote(e.currentTarget.value)
                }
              />
            </div>

            {/* אלרגיות או מאכלים שלא אוכל */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                רגישויות, אלרגיות או מאכלים שאתה לא מסוגל לאכול:
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid #ff5e7e'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(255, 94, 126, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected ? '#ff5e7e' : 'var(--text-secondary)',
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
                placeholder="פירוט אלרגיות או מאכלים נוספים שלא ייכנסו לתפריט..."
                value={dislikedOrAllergiesNote}
                onChange={(e) =>
                  setDislikedOrAllergiesNote(e.currentTarget.value)
                }
              />
            </div>

            {/* אתגרים ובקשות מיוחדות למאמן */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                האתגרים העיקריים שלך בתזונה ובקשות מיוחדות למאמן:
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
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: selected
                          ? '1px solid #ffb800'
                          : '1px solid var(--border-subtle)',
                        background: selected
                          ? 'rgba(255, 184, 0, 0.14)'
                          : 'var(--bg-surface-1)',
                        color: selected ? '#ffb800' : 'var(--text-secondary)',
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
              <Textarea
                size="xs"
                minRows={2}
                placeholder="סדר היום שלך (מתי קם, מתי מתאמן), כמה ארוחות נוח לך לאכול, וכל דבר נוסף שחשוב שהמאמן יידע..."
                value={scheduleAndNotes}
                onChange={(e) => setScheduleAndNotes(e.currentTarget.value)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                marginTop: 6,
              }}
            >
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-surface"
                style={{
                  padding: '11px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: 'pointer',
                }}
              >
                <ChevronRight size={15} />
                <span>חזרה להיקפים</span>
              </button>

              <button
                type="button"
                disabled={isFinishing}
                onClick={handleFinish}
                className="btn-volt"
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  cursor: 'pointer',
                }}
              >
                {isFinishing ? (
                  <Loader2 size={17} className="spot-spinner" />
                ) : (
                  <Check size={17} />
                )}
                <span>
                  {isFinishing ? 'שומר פרופיל...' : 'שמור פרופיל וכנס לאפליקציה'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
