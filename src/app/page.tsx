'use client';

import React, { useState, useEffect } from 'react';
import { Modal, TextInput } from '@mantine/core';
import {
  KeyRound,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  DEFAULT_TEMPLATES,
  createInitialTrainees,
} from '@/data/israeliFoodCatalog';
import {
  AccountStatus,
  AuthSessionUser,
  DayType,
  LoggedFoodItem,
  NutritionTemplate,
  TraineeProfile,
} from '@/types/nutrition';
import { TraineeMobileView } from '@/components/TraineeMobileView';
import { CoachDashboardView } from '@/components/CoachDashboardView';
import { AuthGateView } from '@/components/AuthGateView';

const STORAGE_KEY_TRAINEES = 'spot_fitness_trainees_v2';
const STORAGE_KEY_TEMPLATES = 'spot_fitness_templates_v2';
const STORAGE_KEY_GEMINI = 'spot_fitness_gemini_key_v1';
const STORAGE_KEY_INVITE_CODE = 'spot_fitness_invite_code_v1';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [coachPreviewTraineeId, setCoachPreviewTraineeId] = useState<
    string | null
  >(null);

  const [templates, setTemplates] =
    useState<NutritionTemplate[]>(DEFAULT_TEMPLATES);
  const [trainees, setTrainees] = useState<TraineeProfile[]>(() =>
    createInitialTrainees()
  );
  const [coachInviteCode, setCoachInviteCode] = useState<string>('SPOT2026');
  const [hydrated, setHydrated] = useState(false);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    async function initSessionAndData() {
      try {
        const savedTemplates = localStorage.getItem(STORAGE_KEY_TEMPLATES);
        const savedTrainees = localStorage.getItem(STORAGE_KEY_TRAINEES);
        const savedGemini = localStorage.getItem(STORAGE_KEY_GEMINI);
        const savedInvite = localStorage.getItem(STORAGE_KEY_INVITE_CODE);

        if (savedTemplates) setTemplates(JSON.parse(savedTemplates));
        if (savedTrainees) setTrainees(JSON.parse(savedTrainees));
        if (savedGemini) setGeminiApiKey(savedGemini);
        if (savedInvite) setCoachInviteCode(savedInvite);

        // 1. אימות העוגייה החתומה קריפטוגרפית בשרת (HttpOnly Cookie)
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData.user) {
            setCurrentUser(sessionData.user);

            // 2. טעינת נתונים מאובטחת לפי ההרשאה מהשרת (/api/data)
            const dataRes = await fetch('/api/data');
            if (dataRes.ok) {
              const remoteData = await dataRes.json();
              if (
                Array.isArray(remoteData.trainees) &&
                remoteData.trainees.length > 0
              ) {
                setTrainees(remoteData.trainees);
              }
              if (
                Array.isArray(remoteData.templates) &&
                remoteData.templates.length > 0
              ) {
                setTemplates(remoteData.templates);
              }
            }
          }
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    }
    initSessionAndData();
  }, []);

  // סנכרון מאובטח מול שער הנתונים בשרת (/api/data)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATES, JSON.stringify(templates));
      localStorage.setItem(STORAGE_KEY_TRAINEES, JSON.stringify(trainees));
    } catch {
      // ignore
    }

    if (!currentUser) return;

    if (currentUser.role === 'trainee') {
      const myProfile = trainees.find((t) => t.id === currentUser.id);
      if (myProfile) {
        fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'trainee-self-update',
            trainee: myProfile,
          }),
        }).catch(() => {});
      }
    } else if (currentUser.role === 'coach') {
      fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'coach-sync',
          trainees,
          templates,
        }),
      }).catch(() => {});
    }
  }, [templates, trainees, hydrated, currentUser]);

  const handleLoginSuccess = async (user: AuthSessionUser) => {
    setCurrentUser(user);
    setCoachPreviewTraineeId(null);

    try {
      const dataRes = await fetch('/api/data');
      if (dataRes.ok) {
        const remoteData = await dataRes.json();
        if (
          Array.isArray(remoteData.trainees) &&
          remoteData.trainees.length > 0
        ) {
          setTrainees(remoteData.trainees);
        }
        if (
          Array.isArray(remoteData.templates) &&
          remoteData.templates.length > 0
        ) {
          setTemplates(remoteData.templates);
        }
      }
    } catch {
      // fallback to local
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    setCurrentUser(null);
    setCoachPreviewTraineeId(null);
  };

  const handleRegisterTrainee = async (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    goal: string;
    currentWeight: number;
    inviteCode?: string;
  }): Promise<
    { user: AuthSessionUser; isPending: boolean } | { error: string }
  > => {
    const emailExists =
      data.email.toLowerCase() === 'coach@spot.co.il' ||
      trainees.some((t) => (t.email || '').toLowerCase() === data.email);

    if (emailExists) {
      return { error: 'כתובת האימייל הזו כבר רשומה במערכת' };
    }

    const hasValidInvite =
      Boolean(data.inviteCode) &&
      data.inviteCode?.toUpperCase() === coachInviteCode.toUpperCase();

    const initialStatus: AccountStatus = hasValidInvite ? 'active' : 'pending';
    const defaultTpl = templates[0] || DEFAULT_TEMPLATES[0];

    const newTrainee: TraineeProfile = {
      id: `trainee-${Date.now()}`,
      email: data.email,
      password: data.password,
      status: initialStatus,
      name: data.name,
      avatar: data.name.charAt(0) || 'מ',
      phone: data.phone || '',
      goal: data.goal || 'חיטוב ותזונה מותאמת',
      currentWeight: data.currentWeight || 75,
      targetWeight: Math.max(45, (data.currentWeight || 75) - 4),
      tolerancePercent: 10,
      workoutTemplate: JSON.parse(JSON.stringify(defaultTpl)),
      restTemplate: JSON.parse(JSON.stringify(defaultTpl)),
      favoriteFoodIds: [
        'cottage-tnuva-5',
        'chicken-breast-grilled',
        'krembo-strauss',
      ],
      weightHistory: [{ date: 'התחלה', weight: data.currentWeight || 75 }],
      logs: {},
    };

    setTrainees((prev) => [...prev, newTrainee]);

    const sessionUser: AuthSessionUser = {
      id: newTrainee.id,
      email: newTrainee.email,
      name: newTrainee.name,
      role: 'trainee',
      status: initialStatus,
    };

    if (initialStatus === 'active') {
      await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register-session',
          registeredUser: sessionUser,
        }),
      });
    }

    return {
      user: sessionUser,
      isPending: initialStatus === 'pending',
    };
  };

  const handleSaveMeal = (
    traineeId: string,
    date: string,
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) {
      return;
    }

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
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
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
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
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
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
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
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
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
    if (currentUser?.role !== 'coach') return;
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
    if (currentUser?.role !== 'coach') return;
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
    if (currentUser?.role !== 'coach') return;
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
    if (currentUser?.role !== 'coach') return;
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

  const handleAddTraineeByCoach = (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    goal: string;
    templateId: string;
  }) => {
    if (currentUser?.role !== 'coach') return;
    const tpl =
      templates.find((t) => t.id === data.templateId) || DEFAULT_TEMPLATES[0];
    const newTrainee: TraineeProfile = {
      id: `trainee-${Date.now()}`,
      email: data.email,
      password: data.password || '123456',
      status: 'active',
      name: data.name,
      avatar: data.name.trim().charAt(0) || 'מ',
      phone: data.phone || '050-0000000',
      goal: data.goal || 'חיטוב ותזונה מותאמת',
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
  };

  const handleUpdateTraineeStatus = (
    traineeId: string,
    status: AccountStatus
  ) => {
    if (currentUser?.role !== 'coach') return;
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, status } : t))
    );
  };

  const handleUpdateTraineeCredentials = (
    traineeId: string,
    email: string,
    password: string
  ) => {
    if (currentUser?.role !== 'coach') return;
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, email, password } : t))
    );
  };

  const handleDeleteTrainee = (traineeId: string) => {
    if (currentUser?.role !== 'coach') return;
    setTrainees((prev) => prev.filter((t) => t.id !== traineeId));
    fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'coach-delete-trainee',
        deleteTraineeId: traineeId,
      }),
    }).catch(() => {});
  };

  if (!hydrated) {
    return null;
  }

  if (!currentUser) {
    return (
      <AuthGateView
        trainees={trainees}
        coachInviteCode={coachInviteCode}
        onLoginSuccess={handleLoginSuccess}
        onRegisterTrainee={handleRegisterTrainee}
      />
    );
  }

  const loggedInTraineeProfile =
    currentUser.role === 'trainee'
      ? trainees.find((t) => t.id === currentUser.id)
      : coachPreviewTraineeId
      ? trainees.find((t) => t.id === coachPreviewTraineeId)
      : null;

  if (
    currentUser.role === 'trainee' &&
    (!loggedInTraineeProfile || loggedInTraineeProfile.status !== 'active')
  ) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <div
          className="pro-card"
          style={{ maxWidth: 400, padding: 24, textAlign: 'center' }}
        >
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>
            החשבון ממתין לאישור או הושהה
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 16,
            }}
          >
            אנא פנה למאמן שלך להפעלת החשבון במערכת.
          </div>
          <button
            onClick={handleLogout}
            className="btn-volt"
            style={{ padding: '9px 20px', fontSize: 13, cursor: 'pointer' }}
          >
            התנתק
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 80,
          background: 'rgba(8, 9, 12, 0.85)',
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
                {currentUser.role === 'coach'
                  ? 'COACH ADMIN'
                  : 'PERSONAL NUTRITION'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'var(--bg-surface-1)',
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {currentUser.role === 'coach' ? (
                <ShieldCheck size={14} color="var(--accent-volt)" />
              ) : (
                <User size={14} color="var(--accent-volt)" />
              )}
              <span>{currentUser.name}</span>
            </div>

            {currentUser.role === 'coach' && (
              <button
                title="הגדרות מפתח Gemini API"
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
                  color={
                    geminiApiKey
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)'
                  }
                />
              </button>
            )}

            <button
              title="התנתק מהחשבון"
              onClick={handleLogout}
              className="btn-surface"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 12px',
                borderRadius: 999,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <LogOut size={13} color="var(--text-secondary)" />
              <span>התנתק</span>
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
        {currentUser.role === 'trainee' && loggedInTraineeProfile ? (
          <TraineeMobileView
            trainee={loggedInTraineeProfile}
            isCoachPreview={false}
            onUpdateDayType={handleUpdateDayType}
            onSaveMeal={handleSaveMeal}
            onUpdateWater={handleUpdateWater}
            onUpdateWeight={handleUpdateWeight}
            onToggleFavorite={handleToggleFavorite}
            geminiApiKey={geminiApiKey}
          />
        ) : currentUser.role === 'coach' &&
          coachPreviewTraineeId &&
          loggedInTraineeProfile ? (
          <TraineeMobileView
            trainee={loggedInTraineeProfile}
            isCoachPreview={true}
            onExitCoachPreview={() => setCoachPreviewTraineeId(null)}
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
            coachInviteCode={coachInviteCode}
            onUpdateCoachInviteCode={(code) => {
              setCoachInviteCode(code);
              localStorage.setItem(STORAGE_KEY_INVITE_CODE, code);
            }}
            onSaveTemplate={handleSaveTemplate}
            onAssignTemplateToTrainee={handleAssignTemplateToTrainee}
            onUpdateTraineePlan={handleUpdateTraineePlan}
            onAddCoachFeedback={handleAddCoachFeedback}
            onAddTrainee={handleAddTraineeByCoach}
            onUpdateTraineeStatus={handleUpdateTraineeStatus}
            onUpdateTraineeCredentials={handleUpdateTraineeCredentials}
            onDeleteTrainee={handleDeleteTrainee}
            onPreviewTraineeMobile={(id) => setCoachPreviewTraineeId(id)}
          />
        )}
      </main>

      {currentUser.role === 'coach' && (
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
              המערכת כוללת מנוע זיהוי עברי מובנה שעובד מיד ללא מפתח. לפענוח
              תמונות חופשי עם Gemini 2.5 Flash ניתן להדביק מפתח חינמי מ-Google
              AI Studio:
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
      )}
    </div>
  );
}
