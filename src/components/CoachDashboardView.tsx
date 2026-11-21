'use client';

import React, { useState } from 'react';
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
  PasswordInput,
} from '@mantine/core';
import {
  Users,
  LayoutTemplate,
  Plus,
  Trash2,
  Check,
  Send,
  Sliders,
  UserPlus,
  ArrowUpLeft,
  ShieldCheck,
  UserCheck,
  PauseCircle,
  PlayCircle,
  KeyRound,
  Copy,
} from 'lucide-react';
import {
  AccountStatus,
  DayType,
  MealTemplateSlot,
  NutritionTemplate,
  TraineeProfile,
} from '@/types/nutrition';
import { getTodayIso, sumMacros } from '@/data/israeliFoodCatalog';

interface CoachDashboardViewProps {
  trainees: TraineeProfile[];
  templates: NutritionTemplate[];
  coachInviteCode: string;
  onUpdateCoachInviteCode: (newCode: string) => void;
  onSaveTemplate: (template: NutritionTemplate) => void;
  onAssignTemplateToTrainee: (
    traineeId: string,
    dayType: DayType,
    template: NutritionTemplate
  ) => void;
  onUpdateTraineePlan: (
    traineeId: string,
    dayType: DayType,
    updatedTemplate: NutritionTemplate,
    tolerancePercent: number
  ) => void;
  onAddCoachFeedback: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    feedback: string
  ) => void;
  onAddTrainee: (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    goal: string;
    templateId: string;
  }) => void;
  onUpdateTraineeStatus: (traineeId: string, status: AccountStatus) => void;
  onUpdateTraineeCredentials: (
    traineeId: string,
    email: string,
    password: string
  ) => void;
  onDeleteTrainee: (traineeId: string) => void;
  onPreviewTraineeMobile: (traineeId: string) => void;
}

export function CoachDashboardView({
  trainees,
  templates,
  coachInviteCode,
  onUpdateCoachInviteCode,
  onSaveTemplate,
  onAssignTemplateToTrainee,
  onUpdateTraineePlan,
  onAddCoachFeedback,
  onAddTrainee,
  onUpdateTraineeStatus,
  onUpdateTraineeCredentials,
  onDeleteTrainee,
  onPreviewTraineeMobile,
}: CoachDashboardViewProps) {
  const today = getTodayIso();
  const [activeSection, setActiveSection] = useState<
    'roster' | 'templates' | 'inspector' | 'users'
  >('roster');
  const [selectedTraineeId, setSelectedTraineeId] = useState<string>(
    trainees[0]?.id || ''
  );

  // ניהול טמפלייטים
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || ''
  );
  const currentTemplate =
    templates.find((t) => t.id === selectedTemplateId) || templates[0];
  const [editableTemplate, setEditableTemplate] = useState<NutritionTemplate>(
    () => JSON.parse(JSON.stringify(currentTemplate))
  );
  const [assignTraineeId, setAssignTraineeId] = useState<string>(
    trainees[0]?.id || ''
  );
  const [assignDayType, setAssignDayType] = useState<DayType>('workout');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedTrainee =
    trainees.find((t) => t.id === selectedTraineeId) || trainees[0];
  const [editingDayType, setEditingDayType] = useState<DayType>('workout');
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {}
  );

  // מודאל הוספת מתאמן חדש (כולל אימייל וסיסמה)
  const [newTraineeModal, setNewTraineeModal] = useState(false);
  const [newTraineeName, setNewTraineeName] = useState('');
  const [newTraineeEmail, setNewTraineeEmail] = useState('');
  const [newTraineePassword, setNewTraineePassword] = useState('123456');
  const [newTraineePhone, setNewTraineePhone] = useState('');
  const [newTraineeGoal, setNewTraineeGoal] = useState(
    'חיטוב וירידה באחוזי שומן'
  );
  const [newTraineeTplId, setNewTraineeTplId] = useState(
    templates[0]?.id || ''
  );

  // מודאל עריכת פרטי התחברות למתאמן קיים
  const [credModalTrainee, setCredModalTrainee] =
    useState<TraineeProfile | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // עריכת קוד מאמן
  const [inviteCodeDraft, setInviteCodeDraft] = useState(coachInviteCode);

  const pendingTrainees = trainees.filter((t) => t.status === 'pending');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSelectTemplate = (tplId: string) => {
    setSelectedTemplateId(tplId);
    const found = templates.find((t) => t.id === tplId);
    if (found) {
      setEditableTemplate(JSON.parse(JSON.stringify(found)));
    }
  };

  const handleCreateNewTemplate = () => {
    const newTpl: NutritionTemplate = {
      id: `tpl-${Date.now()}`,
      name: `טמפלייט תזונה #${templates.length + 1}`,
      description: 'הגדרת ארוחות ויעדי מאקרו יומיים',
      dayType: 'workout',
      tolerancePercent: 10,
      meals: [
        {
          id: `meal-${Date.now()}-1`,
          name: 'ארוחת בוקר',
          timeHint: '08:00',
          targets: { calories: 450, protein: 35, carbs: 45, fat: 14 },
        },
        {
          id: `meal-${Date.now()}-2`,
          name: 'ארוחת צהריים',
          timeHint: '13:30',
          targets: { calories: 650, protein: 50, carbs: 70, fat: 18 },
        },
        {
          id: `meal-${Date.now()}-3`,
          name: 'ארוחת ערב',
          timeHint: '20:00',
          targets: { calories: 500, protein: 40, carbs: 40, fat: 20 },
        },
      ],
    };
    onSaveTemplate(newTpl);
    setSelectedTemplateId(newTpl.id);
    setEditableTemplate(JSON.parse(JSON.stringify(newTpl)));
  };

  const updateTemplateMealField = (
    mealId: string,
    field: 'name' | 'timeHint' | 'calories' | 'protein' | 'carbs' | 'fat',
    value: string | number
  ) => {
    setEditableTemplate((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => {
        if (m.id !== mealId) return m;
        if (field === 'name' || field === 'timeHint') {
          return { ...m, [field]: String(value) };
        }
        return {
          ...m,
          targets: {
            ...m.targets,
            [field]: Math.max(0, Number(value) || 0),
          },
        };
      }),
    }));
  };

  const addMealSlotToTemplate = () => {
    setEditableTemplate((prev) => ({
      ...prev,
      meals: [
        ...prev.meals,
        {
          id: `meal-${Date.now()}`,
          name: `ארוחה ${prev.meals.length + 1}`,
          timeHint: '17:00',
          targets: { calories: 350, protein: 30, carbs: 35, fat: 10 },
        },
      ],
    }));
  };

  const removeMealSlotFromTemplate = (mealId: string) => {
    if (editableTemplate.meals.length <= 1) return;
    setEditableTemplate((prev) => ({
      ...prev,
      meals: prev.meals.filter((m) => m.id !== mealId),
    }));
  };

  const getTraineeStatus = (t: TraineeProfile) => {
    const log = t.logs[today];
    const tpl = log?.dayType === 'rest' ? t.restTemplate : t.workoutTemplate;
    const target = sumMacros(tpl.meals.map((m) => m.targets));
    const loggedMealsCount = log ? Object.keys(log.meals).length : 0;

    if (!log || loggedMealsCount === 0) {
      return {
        statusColor: 'var(--status-danger)',
        statusBg: 'rgba(239, 68, 68, 0.12)',
        label: 'טרם הוזן היום',
        consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        target,
        loggedMealsCount: 0,
        totalMeals: tpl.meals.length,
      };
    }

    const allItems = tpl.meals.flatMap((m) => log.meals[m.id]?.items || []);
    const consumed = sumMacros(allItems.map((i) => i.macros));
    const maxAllowed = target.calories * (1 + t.tolerancePercent / 100);

    if (consumed.calories > maxAllowed) {
      return {
        statusColor: 'var(--status-warn)',
        statusBg: 'rgba(245, 158, 11, 0.12)',
        label: 'חריגה מהיעד',
        consumed,
        target,
        loggedMealsCount,
        totalMeals: tpl.meals.length,
      };
    }

    return {
      statusColor: 'var(--status-ok)',
      statusBg: 'rgba(34, 197, 94, 0.12)',
      label: 'עומד ביעדים',
      consumed,
      target,
      loggedMealsCount,
      totalMeals: tpl.meals.length,
    };
  };

  const templateTotals = sumMacros(editableTemplate.meals.map((m) => m.targets));
  const activeTraineePlan =
    editingDayType === 'workout'
      ? selectedTrainee.workoutTemplate
      : selectedTrainee.restTemplate;

  const updateTraineeDirectMeal = (
    mealId: string,
    field: 'name' | 'calories' | 'protein' | 'carbs' | 'fat',
    value: string | number
  ) => {
    const updatedTpl: NutritionTemplate = {
      ...activeTraineePlan,
      meals: activeTraineePlan.meals.map((m) => {
        if (m.id !== mealId) return m;
        if (field === 'name') return { ...m, name: String(value) };
        return {
          ...m,
          targets: {
            ...m.targets,
            [field]: Math.max(0, Number(value) || 0),
          },
        };
      }),
    };
    onUpdateTraineePlan(
      selectedTrainee.id,
      editingDayType,
      updatedTpl,
      selectedTrainee.tolerancePercent
    );
  };

  const addMealToTraineePlan = () => {
    const updatedTpl: NutritionTemplate = {
      ...activeTraineePlan,
      meals: [
        ...activeTraineePlan.meals,
        {
          id: `meal-${Date.now()}`,
          name: `ארוחה ${activeTraineePlan.meals.length + 1}`,
          timeHint: '16:30',
          targets: { calories: 300, protein: 25, carbs: 30, fat: 8 },
        },
      ],
    };
    onUpdateTraineePlan(
      selectedTrainee.id,
      editingDayType,
      updatedTpl,
      selectedTrainee.tolerancePercent
    );
  };

  const removeMealFromTraineePlan = (mealId: string) => {
    if (activeTraineePlan.meals.length <= 1) return;
    const updatedTpl: NutritionTemplate = {
      ...activeTraineePlan,
      meals: activeTraineePlan.meals.filter((m) => m.id !== mealId),
    };
    onUpdateTraineePlan(
      selectedTrainee.id,
      editingDayType,
      updatedTpl,
      selectedTrainee.tolerancePercent
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* התראה בולטת אם יש מתאמנים שנרשמו לבד וממתינים לאישור מאמן */}
      {pendingTrainees.length > 0 && (
        <div
          style={{
            padding: '14px 20px',
            borderRadius: 16,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCheck size={18} color="#fbbf24" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>
                ממתינים לאישור הרשמה ({pendingTrainees.length}):{' '}
                {pendingTrainees.map((p) => p.name).join(', ')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                מתאמנים אלו נרשמו ללא קוד מאמן ואינם יכולים להיכנס לאפליקציה עד שתאשר אותם
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {pendingTrainees.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onUpdateTraineeStatus(p.id, 'active');
                  showToast(`המתאמן ${p.name} אושר ויכול כעת להתחבר למערכת!`);
                }}
                className="btn-volt"
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Check size={14} />
                <span>אשר את {p.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* סרגל ניווט פנים-מערכת למאמן */}
      <div
        className="pro-card"
        style={{
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {[
            {
              id: 'roster',
              label: `בקרת מתאמנים (${trainees.length})`,
              icon: Users,
            },
            {
              id: 'inspector',
              label: `תוכנית ויומן (${selectedTrainee?.name || ''})`,
              icon: Sliders,
            },
            {
              id: 'templates',
              label: `טמפלייטים (${templates.length})`,
              icon: LayoutTemplate,
            },
            {
              id: 'users',
              label: `ניהול משתמשים והרשאות`,
              icon: ShieldCheck,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() =>
                  setActiveSection(
                    tab.id as 'roster' | 'templates' | 'inspector' | 'users'
                  )
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '9px 16px',
                  borderRadius: 12,
                  border: active
                    ? '1px solid rgba(210, 255, 40, 0.4)'
                    : '1px solid transparent',
                  background: active
                    ? 'rgba(210, 255, 40, 0.1)'
                    : 'transparent',
                  color: active ? 'var(--accent-volt)' : 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setNewTraineeModal(true)}
          className="btn-volt"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 18px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <UserPlus size={15} />
          <span>פתיחת משתמש למתאמן חדש</span>
        </button>
      </div>

      {toastMessage && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: 14,
            background: 'rgba(210, 255, 40, 0.12)',
            border: '1px solid rgba(210, 255, 40, 0.35)',
            color: 'var(--accent-volt)',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Check size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* תצוגה 1: טבלת בקרת מתאמנים מקצועית */}
      {activeSection === 'roster' && (
        <div className="pro-card" style={{ overflow: 'hidden' }}>
          <div
            style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                בקרת עמידה ביעדים בזמן אמת
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                כל מתאמן שמתחבר רואה אך ורק את הפרופיל שלו. כאן תוכל לנהל את כולם
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'right',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '14px 22px' }}>מתאמן וחשבון</th>
                  <th style={{ padding: '14px 16px' }}>סטטוס גישה</th>
                  <th style={{ padding: '14px 16px' }}>ביצוע יומי</th>
                  <th style={{ padding: '14px 16px' }}>קלוריות (ביצוע / יעד)</th>
                  <th style={{ padding: '14px 16px' }}>מאקרו יומי (ח׳ / פ׳ / ש׳)</th>
                  <th style={{ padding: '14px 22px', textAlign: 'left' }}>
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody>
                {trainees.map((t) => {
                  const st = getTraineeStatus(t);
                  const calPct = Math.min(
                    100,
                    Math.round(
                      (st.consumed.calories / Math.max(1, st.target.calories)) *
                        100
                    )
                  );
                  return (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <td style={{ padding: '16px 22px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: '50%',
                              background: 'var(--bg-surface-3)',
                              border: '1px solid var(--border-strong)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: 14,
                              color: 'var(--accent-volt)',
                            }}
                          >
                            {t.avatar}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800 }}>
                              {t.name}
                            </div>
                            <div
                              className="num-mono"
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {t.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '16px' }}>
                        {t.status === 'active' ? (
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'rgba(34, 197, 94, 0.12)',
                              color: '#22c55e',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            פעיל
                          </span>
                        ) : t.status === 'pending' ? (
                          <button
                            onClick={() => {
                              onUpdateTraineeStatus(t.id, 'active');
                              showToast(`${t.name} אושר!`);
                            }}
                            className="btn-volt"
                            style={{
                              padding: '4px 10px',
                              fontSize: 11,
                              cursor: 'pointer',
                            }}
                          >
                            ממתין – לחץ לאישור
                          </button>
                        ) : (
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: 999,
                              background: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            מושהה
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '16px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '4px 10px',
                            borderRadius: 999,
                            background: st.statusBg,
                            color: st.statusColor,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {st.label} ({st.loggedMealsCount}/{st.totalMeals})
                        </span>
                      </td>

                      <td style={{ padding: '16px', minWidth: 170 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            marginBottom: 5,
                          }}
                        >
                          <span className="num-mono" style={{ fontWeight: 800 }}>
                            {st.consumed.calories.toLocaleString()}
                          </span>
                          <span
                            className="num-mono"
                            style={{ color: 'var(--text-secondary)' }}
                          >
                            / {st.target.calories.toLocaleString()} קק״ל
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${calPct}%`,
                              background: st.statusColor,
                              borderRadius: 999,
                            }}
                          />
                        </div>
                      </td>

                      <td style={{ padding: '16px' }}>
                        <div
                          className="num-mono"
                          style={{
                            display: 'flex',
                            gap: 10,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          <span style={{ color: 'var(--macro-protein)' }}>
                            ח׳ {st.consumed.protein}/{st.target.protein}g
                          </span>
                          <span style={{ color: 'var(--macro-carbs)' }}>
                            פ׳ {st.consumed.carbs}/{st.target.carbs}g
                          </span>
                          <span style={{ color: 'var(--macro-fat)' }}>
                            ש׳ {st.consumed.fat}/{st.target.fat}g
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: '16px 22px', textAlign: 'left' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <button
                            onClick={() => {
                              setSelectedTraineeId(t.id);
                              setActiveSection('inspector');
                            }}
                            className="btn-surface"
                            style={{
                              padding: '7px 14px',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            ערוך ארוחות ויומן
                          </button>
                          <button
                            onClick={() => onPreviewTraineeMobile(t.id)}
                            className="btn-surface"
                            style={{
                              padding: '7px 10px',
                              fontSize: 12,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <span>צפה כמתאמן</span>
                            <ArrowUpLeft size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* תצוגה 2: מסך מפוצל לניהול מתאמן (התאמת ארוחות + צפייה ופידבק ביומן) */}
      {activeSection === 'inspector' && selectedTrainee && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 20,
          }}
        >
          {/* צד ימין: הגדרת מספר הארוחות, השמות והמאקרו למתאמן */}
          <div className="pro-card" style={{ padding: 22 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  הגדרת ארוחות ומאקרו — {selectedTrainee.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  המתאמן אינו יכול לערוך את היעדים האלו (קריאה בלבד עבורו)
                </div>
              </div>

              <Select
                size="xs"
                w={160}
                value={selectedTrainee.id}
                onChange={(val) => val && setSelectedTraineeId(val)}
                data={trainees.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                marginBottom: 16,
                alignItems: 'flex-end',
              }}
            >
              <Select
                label="תפריט יום"
                size="xs"
                style={{ flex: 1 }}
                value={editingDayType}
                onChange={(val) => val && setEditingDayType(val as DayType)}
                data={[
                  { value: 'workout', label: 'יום אימון' },
                  { value: 'rest', label: 'יום מנוחה' },
                ]}
              />
              <NumberInput
                label="טווח גמישות (%)"
                size="xs"
                w={120}
                value={selectedTrainee.tolerancePercent}
                min={1}
                max={25}
                suffix="%"
                onChange={(val) =>
                  onUpdateTraineePlan(
                    selectedTrainee.id,
                    editingDayType,
                    activeTraineePlan,
                    Number(val) || 10
                  )
                }
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeTraineePlan.meals.map((meal: MealTemplateSlot) => (
                <div
                  key={meal.id}
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 14,
                    padding: 12,
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
                    <input
                      value={meal.name}
                      onChange={(e) =>
                        updateTraineeDirectMeal(meal.id, 'name', e.target.value)
                      }
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontWeight: 800,
                        fontSize: 14,
                        outline: 'none',
                        width: '75%',
                      }}
                    />
                    <button
                      disabled={activeTraineePlan.meals.length <= 1}
                      onClick={() => removeMealFromTraineePlan(meal.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                    }}
                  >
                    <NumberInput
                      size="xs"
                      label="קלוריות"
                      value={meal.targets.calories}
                      min={0}
                      step={25}
                      onChange={(val) =>
                        updateTraineeDirectMeal(meal.id, 'calories', val)
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="חלבון (g)"
                      value={meal.targets.protein}
                      min={0}
                      onChange={(val) =>
                        updateTraineeDirectMeal(meal.id, 'protein', val)
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="פחמימה (g)"
                      value={meal.targets.carbs}
                      min={0}
                      onChange={(val) =>
                        updateTraineeDirectMeal(meal.id, 'carbs', val)
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="שומן (g)"
                      value={meal.targets.fat}
                      min={0}
                      onChange={(val) =>
                        updateTraineeDirectMeal(meal.id, 'fat', val)
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 16,
              }}
            >
              <button
                onClick={addMealToTraineePlan}
                className="btn-surface"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                <span>הוסף ארוחה ({activeTraineePlan.meals.length + 1})</span>
              </button>

              <div
                className="num-mono"
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: 'var(--accent-volt)',
                }}
              >
                סה״כ יומי:{' '}
                {
                  sumMacros(activeTraineePlan.meals.map((m) => m.targets))
                    .calories
                }{' '}
                קק״ל
              </div>
            </div>
          </div>

          {/* צד שמאל: יומן האכילה החי של המתאמן + תגובות מאמן */}
          <div className="pro-card" style={{ padding: 22 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 18,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  יומן אכילה ופידבק — {selectedTrainee.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  צפייה במה שהמתאמן הזין היום ומתן הערות בזמן אמת
                </div>
              </div>
              <span
                className="num-mono"
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 999,
                  background: 'var(--bg-surface-2)',
                  color: 'var(--text-secondary)',
                }}
              >
                {today}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {selectedTrainee.workoutTemplate.meals.map((slot) => {
                const entry = selectedTrainee.logs[today]?.meals[slot.id];
                const items = entry?.items || [];
                const mealTotals = sumMacros(items.map((i) => i.macros));
                const draftKey = `${selectedTrainee.id}-${slot.id}`;
                const draftVal =
                  feedbackDrafts[draftKey] ?? entry?.coachFeedback ?? '';

                return (
                  <div
                    key={slot.id}
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 14,
                      padding: 14,
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
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {slot.name}
                      </div>
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color:
                            items.length > 0
                              ? 'var(--accent-volt)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {mealTotals.calories} / {slot.targets.calories} קק״ל · ח׳{' '}
                        {mealTotals.protein}g
                      </div>
                    </div>

                    {items.length === 0 ? (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          marginBottom: 10,
                        }}
                      >
                        טרם הוזנו פריטים לארוחה זו.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          marginBottom: 10,
                          padding: '8px 10px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: 10,
                        }}
                      >
                        {items.map((it) => (
                          <div
                            key={it.id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              fontSize: 12,
                            }}
                          >
                            <span>
                              {it.name}{' '}
                              <span style={{ color: 'var(--text-muted)' }}>
                                ({it.unitLabel})
                              </span>
                            </span>
                            <span className="num-mono" style={{ fontWeight: 700 }}>
                              {it.macros.calories} קק״ל
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        placeholder={`הוסף הערה ל-${selectedTrainee.name} על ${slot.name}...`}
                        value={draftVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFeedbackDrafts((prev) => ({
                            ...prev,
                            [draftKey]: val,
                          }));
                        }}
                        style={{
                          flex: 1,
                          background: 'var(--bg-surface-1)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 10,
                          padding: '7px 12px',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                        }}
                      />
                      <button
                        onClick={() => {
                          onAddCoachFeedback(
                            selectedTrainee.id,
                            today,
                            slot.id,
                            draftVal
                          );
                          showToast(
                            `הפידבק נשמר ומוצג כעת אצל ${selectedTrainee.name}`
                          );
                        }}
                        className="btn-volt"
                        style={{
                          padding: '7px 14px',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          cursor: 'pointer',
                        }}
                      >
                        <Send size={12} />
                        <span>שלח</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* תצוגה 3: ספריית טמפלייטים קבועים */}
      {activeSection === 'templates' && (
        <div className="pro-card" style={{ padding: 22 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              flexWrap: 'wrap',
              gap: 16,
              paddingBottom: 18,
              marginBottom: 18,
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <Select
                label="בחר טמפלייט תזונה קבוע"
                w={300}
                value={selectedTemplateId}
                onChange={(val) => val && handleSelectTemplate(val)}
                data={templates.map((t) => ({
                  value: t.id,
                  label: `${t.name} (${t.meals.length} ארוחות)`,
                }))}
              />
              <button
                onClick={handleCreateNewTemplate}
                className="btn-surface"
                style={{
                  padding: '9px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Plus size={15} />
                <span>טמפלייט חדש</span>
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-end',
                background: 'var(--bg-surface-2)',
                padding: '10px 14px',
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Select
                size="xs"
                label="הקצה טמפלייט זה למתאמן"
                value={assignTraineeId}
                onChange={(val) => val && setAssignTraineeId(val)}
                data={trainees.map((t) => ({ value: t.id, label: t.name }))}
              />
              <Select
                size="xs"
                label="סוג יום"
                w={120}
                value={assignDayType}
                onChange={(val) => val && setAssignDayType(val as DayType)}
                data={[
                  { value: 'workout', label: 'יום אימון' },
                  { value: 'rest', label: 'יום מנוחה' },
                ]}
              />
              <button
                onClick={() => {
                  onAssignTemplateToTrainee(
                    assignTraineeId,
                    assignDayType,
                    editableTemplate
                  );
                  const tName =
                    trainees.find((t) => t.id === assignTraineeId)?.name || '';
                  showToast(
                    `הטמפלייט "${editableTemplate.name}" שויך למתאמן ${tName}`
                  );
                }}
                className="btn-volt"
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                שייך למתאמן
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 14,
              marginBottom: 18,
            }}
          >
            <TextInput
              label="שם הטמפלייט"
              value={editableTemplate.name}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditableTemplate((prev) => ({ ...prev, name: val }));
              }}
            />
            <TextInput
              label="תיאור ודגשים"
              value={editableTemplate.description}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditableTemplate((prev) => ({ ...prev, description: val }));
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {editableTemplate.meals.map((meal, index) => (
              <div
                key={meal.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto',
                  gap: 10,
                  alignItems: 'flex-end',
                  background: 'var(--bg-surface-2)',
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <TextInput
                  label={`שם ארוחה #${index + 1}`}
                  value={meal.name}
                  onChange={(e) =>
                    updateTemplateMealField(
                      meal.id,
                      'name',
                      e.currentTarget.value
                    )
                  }
                />
                <TextInput
                  label="שעה"
                  value={meal.timeHint || ''}
                  onChange={(e) =>
                    updateTemplateMealField(
                      meal.id,
                      'timeHint',
                      e.currentTarget.value
                    )
                  }
                />
                <NumberInput
                  label="קלוריות"
                  value={meal.targets.calories}
                  min={0}
                  step={25}
                  onChange={(val) =>
                    updateTemplateMealField(meal.id, 'calories', val)
                  }
                />
                <NumberInput
                  label="חלבון (g)"
                  value={meal.targets.protein}
                  min={0}
                  onChange={(val) =>
                    updateTemplateMealField(meal.id, 'protein', val)
                  }
                />
                <NumberInput
                  label="פחמימות (g)"
                  value={meal.targets.carbs}
                  min={0}
                  onChange={(val) =>
                    updateTemplateMealField(meal.id, 'carbs', val)
                  }
                />
                <NumberInput
                  label="שומנים (g)"
                  value={meal.targets.fat}
                  min={0}
                  onChange={(val) =>
                    updateTemplateMealField(meal.id, 'fat', val)
                  }
                />
                <button
                  disabled={editableTemplate.meals.length <= 1}
                  onClick={() => removeMealSlotFromTemplate(meal.id)}
                  className="btn-surface"
                  style={{
                    height: 36,
                    width: 36,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Trash2 size={15} color="#ef4444" />
                </button>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 18,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <button
              onClick={addMealSlotToTemplate}
              className="btn-surface"
              style={{
                padding: '9px 16px',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <Plus size={15} />
              <span>הוסף ארוחה לטמפלייט</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                className="num-mono"
                style={{ fontSize: 14, fontWeight: 700 }}
              >
                סה״כ בטמפלייט:{' '}
                <span style={{ color: 'var(--accent-volt)' }}>
                  {templateTotals.calories} קק״ל
                </span>{' '}
                · ח׳ {templateTotals.protein}g · פ׳ {templateTotals.carbs}g · ש׳{' '}
                {templateTotals.fat}g
              </div>

              <button
                onClick={() => {
                  onSaveTemplate(editableTemplate);
                  showToast(`הטמפלייט "${editableTemplate.name}" נשמר`);
                }}
                className="btn-volt"
                style={{
                  padding: '10px 20px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Check size={16} />
                <span>שמור טמפלייט</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* תצוגה 4: ניהול משתמשים, הרשאות וקוד מאמן */}
      {activeSection === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* כרטיס הגדרת קוד מאמן להרשמה עצמית */}
          <div className="pro-card" style={{ padding: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  קוד מאמן להרשמה מהירה (Invite Code)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  מתאמן שנרשם עם הקוד הזה מופעל אוטומטית. מתאמן שנרשם בלי קוד נכנס לסטטוס &ldquo;ממתין לאישור&rdquo;
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <TextInput
                  label="קוד המאמן שלך"
                  value={inviteCodeDraft}
                  onChange={(e) => setInviteCodeDraft(e.currentTarget.value)}
                />
                <button
                  onClick={() => {
                    onUpdateCoachInviteCode(inviteCodeDraft.trim() || 'SPOT2026');
                    showToast('קוד המאמן עודכן בהצלחה');
                  }}
                  className="btn-volt"
                  style={{
                    padding: '9px 16px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  שמור קוד
                </button>
              </div>
            </div>
          </div>

          {/* טבלת ניהול חשבונות מתאמנים */}
          <div className="pro-card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  ניהול חשבונות מתאמנים והרשאות כניסה
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  אישור נרשמים חדשים, השהיית מנויים, איפוס סיסמאות והעתקת פרטי גישה לוואטסאפ
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'right',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    <th style={{ padding: '14px 22px' }}>שם מתאמן</th>
                    <th style={{ padding: '14px 16px' }}>אימייל התחברות</th>
                    <th style={{ padding: '14px 16px' }}>סיסמה</th>
                    <th style={{ padding: '14px 16px' }}>סטטוס חשבון</th>
                    <th style={{ padding: '14px 22px', textAlign: 'left' }}>
                      ניהול הרשאה וחשבון
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trainees.map((t) => (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid var(--border-subtle)',
                      }}
                    >
                      <td style={{ padding: '14px 22px', fontWeight: 800 }}>
                        {t.name}
                      </td>
                      <td
                        className="num-mono"
                        style={{ padding: '14px 16px', fontSize: 13 }}
                      >
                        {t.email}
                      </td>
                      <td
                        className="num-mono"
                        style={{
                          padding: '14px 16px',
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {t.password || '123456'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {t.status === 'active' && (
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: 'rgba(34, 197, 94, 0.14)',
                              color: '#22c55e',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            פעיל (מורשה)
                          </span>
                        )}
                        {t.status === 'pending' && (
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: 'rgba(245, 158, 11, 0.14)',
                              color: '#fbbf24',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            ממתין לאישור מאמן
                          </span>
                        )}
                        {t.status === 'paused' && (
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: 'rgba(239, 68, 68, 0.14)',
                              color: '#ef4444',
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            מושהה (חסום לכניסה)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 22px', textAlign: 'left' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: 8,
                            alignItems: 'center',
                          }}
                        >
                          {t.status !== 'active' ? (
                            <button
                              onClick={() => {
                                onUpdateTraineeStatus(t.id, 'active');
                                showToast(`הגישה של ${t.name} הופעלה!`);
                              }}
                              className="btn-volt"
                              style={{
                                padding: '6px 12px',
                                fontSize: 11,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <PlayCircle size={13} />
                              <span>אשר / הפעל</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                onUpdateTraineeStatus(t.id, 'paused');
                                showToast(`החשבון של ${t.name} הושהה`);
                              }}
                              className="btn-surface"
                              style={{
                                padding: '6px 12px',
                                fontSize: 11,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                cursor: 'pointer',
                              }}
                            >
                              <PauseCircle size={13} />
                              <span>השהה גישה</span>
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setCredModalTrainee(t);
                              setEditEmail(t.email);
                              setEditPassword(t.password || '123456');
                            }}
                            className="btn-surface"
                            style={{
                              padding: '6px 10px',
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                            }}
                          >
                            <KeyRound size={13} />
                            <span>סיסמה</span>
                          </button>

                          <button
                            title="העתק הודעת פרטי התחברות לוואטסאפ"
                            onClick={() => {
                              const text = `היי ${t.name}! הנה פרטי הכניסה האישיים שלך לאפליקציית התזונה SPOT:\nאימייל: ${t.email}\nסיסמה: ${t.password || '123456'}`;
                              navigator.clipboard?.writeText(text);
                              showToast(
                                `פרטי ההתחברות של ${t.name} הועתקו לשליחה בוואטסאפ!`
                              );
                            }}
                            className="btn-surface"
                            style={{
                              padding: '6px 10px',
                              fontSize: 11,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                            }}
                          >
                            <Copy size={13} />
                            <span>העתק פרטי כניסה</span>
                          </button>

                          <button
                            onClick={() => {
                              onDeleteTrainee(t.id);
                              showToast(`המתאמן ${t.name} הוסר`);
                            }}
                            className="btn-surface"
                            style={{
                              padding: '6px 8px',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} color="#ef4444" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* מודאל פתיחת משתמש למתאמן חדש ע"י המאמן */}
      <Modal
        opened={newTraineeModal}
        onClose={() => setNewTraineeModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            פתיחת משתמש חדש למתאמן והקצאת תפריט
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInput
            label="שם מלא של המתאמן"
            placeholder="למשל: דניאל אברהם"
            value={newTraineeName}
            onChange={(e) => setNewTraineeName(e.currentTarget.value)}
            required
          />
          <TextInput
            label="אימייל כניסה של המתאמן"
            placeholder="daniel@gmail.com"
            value={newTraineeEmail}
            onChange={(e) => setNewTraineeEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="סיסמה ראשונית למתאמן"
            value={newTraineePassword}
            onChange={(e) => setNewTraineePassword(e.currentTarget.value)}
            required
          />
          <TextInput
            label="טלפון"
            placeholder="054-0000000"
            value={newTraineePhone}
            onChange={(e) => setNewTraineePhone(e.currentTarget.value)}
          />
          <TextInput
            label="מטרה תזונתית"
            value={newTraineeGoal}
            onChange={(e) => setNewTraineeGoal(e.currentTarget.value)}
          />
          <Select
            label="שיוך טמפלייט ארוחות התחלתי"
            value={newTraineeTplId}
            onChange={(val) => val && setNewTraineeTplId(val)}
            data={templates.map((t) => ({ value: t.id, label: t.name }))}
          />
          <button
            disabled={!newTraineeName.trim() || !newTraineeEmail.trim()}
            onClick={() => {
              onAddTrainee({
                name: newTraineeName.trim(),
                email: newTraineeEmail.trim().toLowerCase(),
                password: newTraineePassword.trim() || '123456',
                phone: newTraineePhone.trim(),
                goal: newTraineeGoal.trim(),
                templateId: newTraineeTplId,
              });
              setNewTraineeName('');
              setNewTraineeEmail('');
              setNewTraineePassword('123456');
              setNewTraineePhone('');
              setNewTraineeModal(false);
              showToast('חשבון המתאמן נוצר והופעל בהצלחה!');
            }}
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '11px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            צור והפעל חשבון מתאמן
          </button>
        </div>
      </Modal>

      {/* מודאל עדכון אימייל וסיסמה למתאמן */}
      <Modal
        opened={Boolean(credModalTrainee)}
        onClose={() => setCredModalTrainee(null)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            עריכת פרטי גישה — {credModalTrainee?.name}
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInput
            label="אימייל כניסה"
            value={editEmail}
            onChange={(e) => setEditEmail(e.currentTarget.value)}
          />
          <TextInput
            label="סיסמה חדשה"
            value={editPassword}
            onChange={(e) => setEditPassword(e.currentTarget.value)}
          />
          <button
            onClick={() => {
              if (credModalTrainee && editEmail.trim() && editPassword.trim()) {
                onUpdateTraineeCredentials(
                  credModalTrainee.id,
                  editEmail.trim().toLowerCase(),
                  editPassword.trim()
                );
                setCredModalTrainee(null);
                showToast('פרטי ההתחברות של המתאמן עודכנו');
              }
            }}
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '10px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            שמור סיסמה ואימייל
          </button>
        </div>
      </Modal>
    </div>
  );
}
