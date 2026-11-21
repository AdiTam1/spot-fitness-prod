'use client';

import React, { useState } from 'react';
import {
  Modal,
  TextInput,
  NumberInput,
  Select,
} from '@mantine/core';
import {
  Users,
  LayoutTemplate,
  MessageSquare,
  Plus,
  Trash2,
  Check,
  Send,
  Sliders,
  UserPlus,
  ArrowUpLeft,
  Clock,
} from 'lucide-react';
import {
  DayType,
  MealTemplateSlot,
  NutritionTemplate,
  TraineeProfile,
} from '@/types/nutrition';
import { getTodayIso, sumMacros } from '@/data/israeliFoodCatalog';

interface CoachDashboardViewProps {
  trainees: TraineeProfile[];
  templates: NutritionTemplate[];
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
  onAddTrainee: (name: string, phone: string, goal: string, templateId: string) => void;
  onPreviewTraineeMobile: (traineeId: string) => void;
}

export function CoachDashboardView({
  trainees,
  templates,
  onSaveTemplate,
  onAssignTemplateToTrainee,
  onUpdateTraineePlan,
  onAddCoachFeedback,
  onAddTrainee,
  onPreviewTraineeMobile,
}: CoachDashboardViewProps) {
  const today = getTodayIso();
  const [activeSection, setActiveSection] = useState<
    'roster' | 'templates' | 'inspector'
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

  // מודאל הוספת מתאמן
  const [newTraineeModal, setNewTraineeModal] = useState(false);
  const [newTraineeName, setNewTraineeName] = useState('');
  const [newTraineePhone, setNewTraineePhone] = useState('');
  const [newTraineeGoal, setNewTraineeGoal] = useState(
    'חיטוב וירידה באחוזי שומן'
  );
  const [newTraineeTplId, setNewTraineeTplId] = useState(
    templates[0]?.id || ''
  );

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {[
            {
              id: 'roster',
              label: `מצבת מתאמנים (${trainees.length})`,
              icon: Users,
            },
            {
              id: 'inspector',
              label: `ניהול מתאמן ויומן (${selectedTrainee.name})`,
              icon: Sliders,
            },
            {
              id: 'templates',
              label: `ספריית טמפלייטים (${templates.length})`,
              icon: LayoutTemplate,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() =>
                  setActiveSection(
                    tab.id as 'roster' | 'templates' | 'inspector'
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
          <span>מתאמן חדש</span>
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
                לחץ על מתאמן לעריכת מספר הארוחות, יעדי המאקרו ומתן פידבק על צילומי הארוחות
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
                  <th style={{ padding: '14px 22px' }}>מתאמן</th>
                  <th style={{ padding: '14px 16px' }}>סטטוס יומי</th>
                  <th style={{ padding: '14px 16px' }}>ארוחות שהוזנו</th>
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
                        transition: 'background 0.15s ease',
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
                              style={{
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {t.goal} · משקל {t.currentWeight} ק״ג
                            </div>
                          </div>
                        </div>
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
                          <span
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: '50%',
                              background: st.statusColor,
                            }}
                          />
                          {st.label}
                        </span>
                      </td>

                      <td style={{ padding: '16px' }}>
                        <span
                          className="num-mono"
                          style={{ fontSize: 13, fontWeight: 700 }}
                        >
                          {st.loggedMealsCount} / {st.totalMeals}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            marginRight: 6,
                          }}
                        >
                          ארוחות
                        </span>
                      </td>

                      <td style={{ padding: '16px', minWidth: 180 }}>
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
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: 8,
                          }}
                        >
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
                            ניהול ארוחות ויומן
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
                            <span>מובייל</span>
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
      {activeSection === 'inspector' && (
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
                  כל שינוי במספר הארוחות או בערכים מתעדכן מיד באפליקציה של המתאמן
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
              {activeTraineePlan.meals.map((meal: MealTemplateSlot, idx: number) => (
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

            {/* הקצאת הטמפלייט למתאמן */}
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

      {/* מודאל מתאמן חדש */}
      <Modal
        opened={newTraineeModal}
        onClose={() => setNewTraineeModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            הקמת פרופיל מתאמן חדש
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInput
            label="שם מלא"
            placeholder="למשל: דניאל אברהם"
            value={newTraineeName}
            onChange={(e) => setNewTraineeName(e.currentTarget.value)}
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
            disabled={!newTraineeName.trim()}
            onClick={() => {
              onAddTrainee(
                newTraineeName.trim(),
                newTraineePhone.trim(),
                newTraineeGoal.trim(),
                newTraineeTplId
              );
              setNewTraineeName('');
              setNewTraineePhone('');
              setNewTraineeModal(false);
              showToast('המתאמן נוסף והוקצה לו תפריט ארוחות');
            }}
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '11px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            צור מתאמן
          </button>
        </div>
      </Modal>
    </div>
  );
}
