'use client';

import React, { useState } from 'react';
import { TextInput, PasswordInput, Textarea, Checkbox } from '@mantine/core';
import {
  ShieldCheck,
  Sliders,
  LayoutTemplate,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  CoachOnboardingData,
  MealTemplateSlot,
  NutritionTemplate,
} from '@/types/nutrition';
import { getTodayIso } from '@/data/israeliFoodCatalog';

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
  }) => void;
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
  const [step, setStep] = useState<1 | 2 | 3>(1);

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
  const [defaultObservationDays, setDefaultObservationDays] = useState<number>(
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

  const handleFinish = () => {
    const onboarding: CoachOnboardingData = {
      completed: true,
      title: title.trim(),
      specialties,
      specialtiesNote: specialtiesNote.trim(),
      welcomeMessage: welcomeMessage.trim(),
      defaultObservationDays,
      defaultCountObservationInStats,
      defaultTolerancePercent,
      defaultWaterGoal,
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

    onCompleteCoachOnboarding({
      name: name.trim() || coachName,
      phone: phone.trim(),
      newPassword: newPassword.trim() || undefined,
      onboarding,
      starterTemplates,
      starterGroupNames: Array.from(new Set(finalGroups)),
    });
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', paddingBottom: 40 }}>
      <div className="pro-card-elevated" style={{ padding: '26px 22px' }}>
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
                }}
              >
                הגדרת סביבת מאמן (Coach Onboarding) · שלב {step} מתוך 3
              </span>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2 }}>
                {step === 1 && 'פרופיל מקצועי והתמחויות'}
                {step === 2 && 'ימי תשקיף וברירות מחדל למתאמנים'}
                {step === 3 && 'הקמת טמפלייטים וקבוצות התחלתיות'}
              </div>
            </div>
            {onSkip && (
              <button
                type="button"
                onClick={onSkip}
                className="btn-surface"
                style={{
                  padding: '6px 12px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                דלג לדשבורד
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
            }}
          >
            {[
              { s: 1, label: '1. פרופיל מאמן', icon: ShieldCheck },
              { s: 2, label: '2. ימי תשקיף ויעדים', icon: Sliders },
              { s: 3, label: '3. טמפלייטים וקבוצות', icon: LayoutTemplate },
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
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
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
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <TextInput
                label="טלפון / וואטסאפ"
                placeholder="052-0000000"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
              <PasswordInput
                label="החלפת סיסמה אישית (אופציונלי)"
                placeholder="השאר ריק לשמירת הקיימת"
                value={newPassword}
                onChange={(e) => setNewPassword(e.currentTarget.value)}
              />
            </div>

            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
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
                placeholder="התמחות נוספת בטקסט חופשי..."
                value={specialtiesNote}
                onChange={(e) => setSpecialtiesNote(e.currentTarget.value)}
              />
            </div>

            <Textarea
              label="משפט פתיחה אישי שיוצג למתאמנים שלך"
              minRows={2}
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.currentTarget.value)}
            />

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
              <span>המשך לשלב 2: הגדרת ימי תשקיף ויעדים</span>
              <ChevronLeft size={16} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 14,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>
                כמה &ldquo;ימי תשקיף&rdquo; יוגדרו אוטומטית למתאמן חדש שלך?
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginBottom: 10,
                }}
              >
                בימי תשקיף המתאמן מזין ארוחות ללא מטרת קלוריות כדי שתוכל לראות את
                הרגלי האכילה הטבעיים שלו (תמיד ניתן להוסיף או לבטל ימי תשקיף בכל
                רגע).
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {[
                  { days: 0, label: 'ללא (0 ימים)' },
                  { days: 3, label: '3 ימי תשקיף' },
                  { days: 5, label: '5 ימי תשקיף' },
                  { days: 7, label: '7 ימי תשקיף' },
                ].map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setDefaultObservationDays(opt.days)}
                    style={{
                      padding: '10px 6px',
                      borderRadius: 10,
                      border:
                        defaultObservationDays === opt.days
                          ? '1px solid var(--accent-volt)'
                          : '1px solid var(--border-subtle)',
                      background:
                        defaultObservationDays === opt.days
                          ? 'rgba(210, 255, 40, 0.14)'
                          : 'var(--bg-surface-1)',
                      color:
                        defaultObservationDays === opt.days
                          ? 'var(--accent-volt)'
                          : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 14,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                האם ימי תשקיף נחשבים בספירת העמידה ביעדים כברירת מחדל? (ניתן
                להחלפה בקליק בכל מתאמן)
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => setDefaultCountObservationInStats(false)}
                  style={{
                    padding: '10px',
                    borderRadius: 10,
                    border: !defaultCountObservationInStats
                      ? '1px solid var(--accent-volt)'
                      : '1px solid var(--border-subtle)',
                    background: !defaultCountObservationInStats
                      ? 'rgba(210, 255, 40, 0.14)'
                      : 'var(--bg-surface-1)',
                    color: !defaultCountObservationInStats
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  החרג מחישוב חריגות (ספור קלוריות בתשקיף נפרד)
                </button>
                <button
                  type="button"
                  onClick={() => setDefaultCountObservationInStats(true)}
                  style={{
                    padding: '10px',
                    borderRadius: 10,
                    border: defaultCountObservationInStats
                      ? '1px solid var(--accent-volt)'
                      : '1px solid var(--border-subtle)',
                    background: defaultCountObservationInStats
                      ? 'rgba(210, 255, 40, 0.14)'
                      : 'var(--bg-surface-1)',
                    color: defaultCountObservationInStats
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)',
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
                gap: 10,
              }}
            >
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                  טווח גמישות קלורית (Tolerance):
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[5, 10, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDefaultTolerancePercent(pct)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        borderRadius: 8,
                        border:
                          defaultTolerancePercent === pct
                            ? '1px solid var(--accent-volt)'
                            : '1px solid var(--border-subtle)',
                        background:
                          defaultTolerancePercent === pct
                            ? 'rgba(210, 255, 40, 0.14)'
                            : 'var(--bg-surface-1)',
                        color:
                          defaultTolerancePercent === pct
                            ? 'var(--accent-volt)'
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
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                  יעד שתיית מים יומי (כוסות):
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[10, 12, 14].map((cups) => (
                    <button
                      key={cups}
                      type="button"
                      onClick={() => setDefaultWaterGoal(cups)}
                      style={{
                        flex: 1,
                        padding: '8px 4px',
                        borderRadius: 8,
                        border:
                          defaultWaterGoal === cups
                            ? '1px solid #38bdf8'
                            : '1px solid var(--border-subtle)',
                        background:
                          defaultWaterGoal === cups
                            ? 'rgba(56, 189, 248, 0.15)'
                            : 'var(--bg-surface-1)',
                        color:
                          defaultWaterGoal === cups
                            ? '#38bdf8'
                            : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      {cups} כוסות
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
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
                <span>המשך לשלב 3: טמפלייטים וקבוצות</span>
                <ChevronLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 14,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                סמן טמפלייטים שיתווספו לספרייה האישית שלך (ניתנים לעריכה מלאה):
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
                        border: checked
                          ? '1px solid rgba(210, 255, 40, 0.35)'
                          : '1px solid var(--border-subtle)',
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
                                fontSize: 11,
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

            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: 14,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>
                קבוצות מתאמנים ראשונות לפתיחה בדשבורד שלך:
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
                      {grp}
                    </button>
                  );
                })}
              </div>
              <TextInput
                size="xs"
                placeholder="הוסף קבוצה נוספת משלך (למשל: חיטוב קיץ 2026)..."
                value={customGroupName}
                onChange={(e) => setCustomGroupName(e.currentTarget.value)}
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
                <Check size={17} />
                <span>סיום והפעלת סביבת המאמן</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
