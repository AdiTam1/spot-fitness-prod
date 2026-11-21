'use client';

import React, { useState, useEffect } from 'react';
import {
  Modal,
  TextInput,
} from '@mantine/core';
import {
  Smartphone,
  SlidersHorizontal,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import {
  DEFAULT_TEMPLATES,
  createInitialTrainees,
} from '@/data/israeliFoodCatalog';
import {
  DayType,
  LoggedFoodItem,
  NutritionTemplate,
  TraineeProfile,
} from '@/types/nutrition';
import { TraineeMobileView } from '@/components/TraineeMobileView';
import { CoachDashboardView } from '@/components/CoachDashboardView';
import {
  isSupabaseConfigured,
  loadStateFromSupabase,
  saveTemplatesToSupabase,
  saveTraineesToSupabase,
} from '@/lib/supabase';

const STORAGE_KEY_TRAINEES = 'spot_fitness_trainees_v1';
const STORAGE_KEY_TEMPLATES = 'spot_fitness_templates_v1';
const STORAGE_KEY_GEMINI = 'spot_fitness_gemini_key_v1';

export default function HomePage() {
  const [roleView, setRoleView] = useState<'trainee' | 'coach'>('trainee');
  const [templates, setTemplates] =
    useState<NutritionTemplate[]>(DEFAULT_TEMPLATES);
  const [trainees, setTrainees] = useState<TraineeProfile[]>(() =>
    createInitialTrainees()
  );
  const [selectedTraineeId, setSelectedTraineeId] =
    useState<string>('trainee-1');
  const [hydrated, setHydrated] = useState(false);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    async function initData() {
      try {
        const savedTemplates = localStorage.getItem(STORAGE_KEY_TEMPLATES);
        const savedTrainees = localStorage.getItem(STORAGE_KEY_TRAINEES);
        const savedGemini = localStorage.getItem(STORAGE_KEY_GEMINI);

        if (savedTemplates) setTemplates(JSON.parse(savedTemplates));
        if (savedTrainees) setTrainees(JSON.parse(savedTrainees));
        if (savedGemini) setGeminiApiKey(savedGemini);

        if (isSupabaseConfigured) {
          const remote = await loadStateFromSupabase();
          if (remote.templates && remote.templates.length > 0) {
            setTemplates(remote.templates);
          }
          if (remote.trainees && remote.trainees.length > 0) {
            setTrainees(remote.trainees);
          }
        }
      } catch {
        // ignore storage errors
      } finally {
        setHydrated(true);
      }
    }
    initData();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
      localStorage.setItem(STORAGE_KEY_TRAINEES, JSON.stringify(trainees));
    } catch {
      // ignore quota errors
    }
    if (isSupabaseConfigured) {
      saveTemplatesToSupabase(templates);
      saveTraineesToSupabase(trainees);
    }
  }, [templates, trainees, hydrated]);

  const handleSaveMeal = (
    traineeId: string,
    date: string,
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string
  ) => {
    const nowTime = new Date().toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });

    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const existingMeal = currentLog.meals[mealSlotId];
        return {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              meals: {
                ...currentLog.meals,
                [mealSlotId]: {
                  mealSlotId,
                  items,
                  photoDataUrl,
                  photoNote,
                  coachFeedback: existingMeal?.coachFeedback,
                  coachFeedbackAt: existingMeal?.coachFeedbackAt,
                  updatedAt: nowTime,
                },
              },
            },
          },
        };
      })
    );
  };

  const handleUpdateDayType = (
    traineeId: string,
    date: string,
    dayType: DayType
  ) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType,
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        return {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              dayType,
            },
          },
        };
      })
    );
  };

  const handleUpdateWater = (traineeId: string, date: string, cups: number) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        return {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              waterCups: cups,
            },
          },
        };
      })
    );
  };

  const handleUpdateWeight = (
    traineeId: string,
    date: string,
    weightKg: number
  ) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        return {
          ...t,
          currentWeight: weightKg,
          weightHistory: [...t.weightHistory, { date, weight: weightKg }],
        };
      })
    );
  };

  const handleToggleFavorite = (traineeId: string, foodId: string) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const exists = t.favoriteFoodIds.includes(foodId);
        return {
          ...t,
          favoriteFoodIds: exists
            ? t.favoriteFoodIds.filter((id) => id !== foodId)
            : [...t.favoriteFoodIds, foodId],
        };
      })
    );
  };

  const handleSaveTemplate = (updatedTemplate: NutritionTemplate) => {
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === updatedTemplate.id);
      if (exists) {
        return prev.map((t) =>
          t.id === updatedTemplate.id ? updatedTemplate : t
        );
      }
      return [...prev, updatedTemplate];
    });
  };

  const handleAssignTemplateToTrainee = (
    traineeId: string,
    dayType: DayType,
    template: NutritionTemplate
  ) => {
    const cloned: NutritionTemplate = JSON.parse(JSON.stringify(template));
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        return dayType === 'workout'
          ? { ...t, workoutTemplate: cloned }
          : { ...t, restTemplate: cloned };
      })
    );
  };

  const handleUpdateTraineePlan = (
    traineeId: string,
    dayType: DayType,
    updatedTemplate: NutritionTemplate,
    tolerancePercent: number
  ) => {
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        return {
          ...t,
          tolerancePercent,
          ...(dayType === 'workout'
            ? { workoutTemplate: updatedTemplate }
            : { restTemplate: updatedTemplate }),
        };
      })
    );
  };

  const handleAddCoachFeedback = (
    traineeId: string,
    date: string,
    mealSlotId: string,
    feedback: string
  ) => {
    const nowTime = new Date().toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setTrainees((prev) =>
      prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          meals: {},
        };
        const existingMeal = currentLog.meals[mealSlotId] || {
          mealSlotId,
          items: [],
          updatedAt: nowTime,
        };
        return {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              meals: {
                ...currentLog.meals,
                [mealSlotId]: {
                  ...existingMeal,
                  coachFeedback: feedback,
                  coachFeedbackAt: nowTime,
                },
              },
            },
          },
        };
      })
    );
  };

  const handleAddTrainee = (
    name: string,
    phone: string,
    goal: string,
    templateId: string
  ) => {
    const tpl =
      templates.find((t) => t.id === templateId) || DEFAULT_TEMPLATES[0];
    const newTrainee: TraineeProfile = {
      id: `trainee-${Date.now()}`,
      name,
      avatar: name.trim().charAt(0) || 'מ',
      phone: phone || '050-0000000',
      goal: goal || 'חיטוב ותזונה מותאמת',
      currentWeight: 75,
      targetWeight: 70,
      tolerancePercent: 10,
      workoutTemplate: JSON.parse(JSON.stringify(tpl)),
      restTemplate: JSON.parse(JSON.stringify(tpl)),
      favoriteFoodIds: [
        'cottage-tnuva-5',
        'chicken-breast-grilled',
        'krembo-strauss',
      ],
      weightHistory: [{ date: 'התחלה', weight: 75 }],
      logs: {},
    };
    setTrainees((prev) => [...prev, newTrainee]);
    setSelectedTraineeId(newTrainee.id);
  };

  const handleResetDemoData = () => {
    const initial = createInitialTrainees();
    setTrainees(initial);
    setTemplates(DEFAULT_TEMPLATES);
    localStorage.removeItem(STORAGE_KEY_TRAINEES);
    localStorage.removeItem(STORAGE_KEY_TEMPLATES);
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* סרגל עליון מינימליסטי ומוקפד */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 80,
          background: 'rgba(8, 9, 12, 0.82)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '10px 18px',
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {/* לוגו המותג */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--accent-volt)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#08090c',
                fontWeight: 900,
                fontSize: 15,
                letterSpacing: -0.5,
              }}
            >
              S
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span
                className="num-mono"
                style={{
                  fontWeight: 800,
                  fontSize: 16,
                  letterSpacing: '-0.04em',
                }}
              >
                SPOT
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                NUTRITION OS
              </span>
            </div>
          </div>

          {/* בורר תצוגה: מתאמן (מובייל) / מאמן (ניהול) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                onClick={() => setRoleView('trainee')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    roleView === 'trainee'
                      ? 'var(--bg-surface-3)'
                      : 'transparent',
                  color:
                    roleView === 'trainee'
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <Smartphone size={13} color={roleView === 'trainee' ? 'var(--accent-volt)' : 'currentColor'} />
                <span>מתאמן</span>
              </button>

              <button
                onClick={() => setRoleView('coach')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background:
                    roleView === 'coach'
                      ? 'var(--bg-surface-3)'
                      : 'transparent',
                  color:
                    roleView === 'coach'
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <SlidersHorizontal size={13} color={roleView === 'coach' ? 'var(--accent-volt)' : 'currentColor'} />
                <span>מאמן</span>
              </button>
            </div>

            <button
              title="חיבור מפתח Gemini API"
              onClick={() => setAiSettingsOpen(true)}
              className="btn-surface"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <KeyRound
                size={14}
                color={geminiApiKey ? 'var(--accent-volt)' : 'var(--text-secondary)'}
              />
            </button>

            <button
              title="איפוס נתונים"
              onClick={handleResetDemoData}
              className="btn-surface"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <RotateCcw size={14} color="var(--text-secondary)" />
            </button>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '20px 16px',
        }}
      >
        {roleView === 'trainee' ? (
          <TraineeMobileView
            trainees={trainees}
            selectedTraineeId={selectedTraineeId}
            onSelectTrainee={setSelectedTraineeId}
            onUpdateDayType={handleUpdateDayType}
            onSaveMeal={handleSaveMeal}
            onUpdateWater={handleUpdateWater}
            onUpdateWeight={handleUpdateWeight}
            onToggleFavorite={handleToggleFavorite}
            geminiApiKey={geminiApiKey}
          />
        ) : (
          <CoachDashboardView
            trainees={trainees}
            templates={templates}
            onSaveTemplate={handleSaveTemplate}
            onAssignTemplateToTrainee={handleAssignTemplateToTrainee}
            onUpdateTraineePlan={handleUpdateTraineePlan}
            onAddCoachFeedback={handleAddCoachFeedback}
            onAddTrainee={handleAddTrainee}
            onPreviewTraineeMobile={(id) => {
              setSelectedTraineeId(id);
              setRoleView('trainee');
            }}
          />
        )}
      </main>

      <Modal
        opened={aiSettingsOpen}
        onClose={() => setAiSettingsOpen(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 15 }}>
            הגדרות מנוע AI (Gemini 2.5 Flash)
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              background: 'var(--bg-surface-2)',
              padding: 12,
              borderRadius: 12,
              border: '1px solid var(--border-subtle)',
            }}
          >
            המערכת כוללת מנוע זיהוי עברי מובנה שעובד מיד ללא מפתח. לפענוח תמונות
            חופשי עם Gemini 2.5 Flash ניתן להדביק מפתח חינמי מ-Google AI Studio:
          </div>
          <TextInput
            label="מפתח Gemini API"
            placeholder="AIzaSy..."
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.currentTarget.value)}
          />
          <button
            className="btn-volt"
            style={{ padding: '10px', fontSize: 13, cursor: 'pointer' }}
            onClick={() => {
              localStorage.setItem(STORAGE_KEY_GEMINI, geminiApiKey.trim());
              setAiSettingsOpen(false);
            }}
          >
            שמור הגדרות
          </button>
        </div>
      </Modal>
    </div>
  );
}
