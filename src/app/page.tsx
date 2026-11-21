'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, TextInput } from '@mantine/core';
import {
  KeyRound,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';
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

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [coachPreviewTraineeId, setCoachPreviewTraineeId] = useState<
    string | null
  >(null);

  // הנתונים נטענים אך ורק מהשרת (/api/data) לאחר אימות HttpOnly Cookie (אפס מידע רגיש ב-localStorage!)
  const [templates, setTemplates] = useState<NutritionTemplate[]>([]);
  const [trainees, setTrainees] = useState<TraineeProfile[]>([]);
  const [coachInviteCode, setCoachInviteCode] = useState<string>('SPOT2026');
  const [hydrated, setHydrated] = useState(false);

  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');

  const fetchAuthorizedData = useCallback(async () => {
    try {
      const dataRes = await fetch('/api/data', { cache: 'no-store' });
      if (dataRes.status === 401 || dataRes.status === 403) {
        setCurrentUser(null);
        setTrainees([]);
        setTemplates([]);
        return;
      }
      if (dataRes.ok) {
        const remoteData = await dataRes.json();
        if (Array.isArray(remoteData.trainees)) {
          setTrainees(remoteData.trainees);
        }
        if (Array.isArray(remoteData.templates)) {
          setTemplates(remoteData.templates);
        }
        if (remoteData.coachInviteCode) {
          setCoachInviteCode(remoteData.coachInviteCode);
        }
      }
    } catch {
      // ignore network error
    }
  }, []);

  useEffect(() => {
    async function initSecureSession() {
      try {
        // ניקוי שאריות ישנות מ-localStorage אם היו מגרסאות קודמות
        localStorage.removeItem('spot_fitness_trainees_v1');
        localStorage.removeItem('spot_fitness_trainees_v2');
        localStorage.removeItem('spot_fitness_auth_session_v1');

        const sessionRes = await fetch('/api/auth/session', {
          cache: 'no-store',
        });
        if (sessionRes.ok) {
          const sessionData = await sessionRes.json();
          if (sessionData.user) {
            setCurrentUser(sessionData.user);
            await fetchAuthorizedData();
          }
        }
      } catch {
        // ignore
      } finally {
        setHydrated(true);
      }
    }
    initSecureSession();
  }, [fetchAuthorizedData]);

  const syncTraineeSelfToServer = async (updatedProfile: TraineeProfile) => {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'trainee-self-update',
        trainee: updatedProfile,
      }),
    });
    if (res.status === 401 || res.status === 403) {
      setCurrentUser(null);
      setTrainees([]);
    }
  };

  const syncCoachDataToServer = async (
    nextTrainees: TraineeProfile[],
    nextTemplates: NutritionTemplate[]
  ) => {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'coach-sync',
        trainees: nextTrainees,
        templates: nextTemplates,
      }),
    });
  };

  const handleLoginSuccess = async (user: AuthSessionUser) => {
    setCurrentUser(user);
    setCoachPreviewTraineeId(null);
    await fetchAuthorizedData();
  };

  const handleLogout = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    setCurrentUser(null);
    setTrainees([]);
    setTemplates([]);
    setCoachPreviewTraineeId(null);
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

    setTrainees((prev) => {
      const next = prev.map((t) => {
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
        const updatedTrainee: TraineeProfile = {
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
        if (currentUser?.role === 'trainee') {
          syncTraineeSelfToServer(updatedTrainee);
        }
        return updatedTrainee;
      });

      if (currentUser?.role === 'coach') {
        syncCoachDataToServer(next, templates);
      }
      return next;
    });
  };

  const handleUpdateDayType = (
    traineeId: string,
    date: string,
    dayType: DayType
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) => {
      const next = prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType,
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const updatedTrainee: TraineeProfile = {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              dayType,
            },
          },
        };
        if (currentUser?.role === 'trainee') {
          syncTraineeSelfToServer(updatedTrainee);
        }
        return updatedTrainee;
      });
      if (currentUser?.role === 'coach') {
        syncCoachDataToServer(next, templates);
      }
      return next;
    });
  };

  const handleUpdateWater = (traineeId: string, date: string, cups: number) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) => {
      const next = prev.map((t) => {
        if (t.id !== traineeId) return t;
        const currentLog = t.logs[date] || {
          date,
          dayType: 'workout',
          waterCups: 0,
          waterGoal: 12,
          weightKg: t.currentWeight,
          meals: {},
        };
        const updatedTrainee: TraineeProfile = {
          ...t,
          logs: {
            ...t.logs,
            [date]: {
              ...currentLog,
              waterCups: cups,
            },
          },
        };
        if (currentUser?.role === 'trainee') {
          syncTraineeSelfToServer(updatedTrainee);
        }
        return updatedTrainee;
      });
      if (currentUser?.role === 'coach') {
        syncCoachDataToServer(next, templates);
      }
      return next;
    });
  };

  const handleUpdateWeight = (
    traineeId: string,
    date: string,
    weightKg: number
  ) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) => {
      const next = prev.map((t) => {
        if (t.id !== traineeId) return t;
        const updatedTrainee: TraineeProfile = {
          ...t,
          currentWeight: weightKg,
          weightHistory: [...t.weightHistory, { date, weight: weightKg }],
        };
        if (currentUser?.role === 'trainee') {
          syncTraineeSelfToServer(updatedTrainee);
        }
        return updatedTrainee;
      });
      if (currentUser?.role === 'coach') {
        syncCoachDataToServer(next, templates);
      }
      return next;
    });
  };

  const handleToggleFavorite = (traineeId: string, foodId: string) => {
    if (currentUser?.role === 'trainee' && currentUser.id !== traineeId) return;
    setTrainees((prev) => {
      const next = prev.map((t) => {
        if (t.id !== traineeId) return t;
        const exists = t.favoriteFoodIds.includes(foodId);
        const updatedTrainee: TraineeProfile = {
          ...t,
          favoriteFoodIds: exists
            ? t.favoriteFoodIds.filter((id) => id !== foodId)
            : [...t.favoriteFoodIds, foodId],
        };
        if (currentUser?.role === 'trainee') {
          syncTraineeSelfToServer(updatedTrainee);
        }
        return updatedTrainee;
      });
      if (currentUser?.role === 'coach') {
        syncCoachDataToServer(next, templates);
      }
      return next;
    });
  };

  const handleSaveTemplate = (updatedTemplate: NutritionTemplate) => {
    if (currentUser?.role !== 'coach') return;
    setTemplates((prev) => {
      const exists = prev.some((t) => t.id === updatedTemplate.id);
      const next = exists
        ? prev.map((t) =>
            t.id === updatedTemplate.id ? updatedTemplate : t
          )
        : [...prev, updatedTemplate];
      syncCoachDataToServer(trainees, next);
      return next;
    });
  };

  const handleAssignTemplateToTrainee = (
    traineeId: string,
    dayType: DayType,
    template: NutritionTemplate
  ) => {
    if (currentUser?.role !== 'coach') return;
    const cloned: NutritionTemplate = JSON.parse(JSON.stringify(template));
    setTrainees((prev) => {
      const next = prev.map((t) => {
        if (t.id !== traineeId) return t;
        return dayType === 'workout'
          ? { ...t, workoutTemplate: cloned }
          : { ...t, restTemplate: cloned };
      });
      syncCoachDataToServer(next, templates);
      return next;
    });
  };

  const handleUpdateTraineePlan = (
    traineeId: string,
    dayType: DayType,
    updatedTemplate: NutritionTemplate,
    tolerancePercent: number
  ) => {
    if (currentUser?.role !== 'coach') return;
    setTrainees((prev) => {
      const next = prev.map((t) => {
        if (t.id !== traineeId) return t;
        return {
          ...t,
          tolerancePercent,
          ...(dayType === 'workout'
            ? { workoutTemplate: updatedTemplate }
            : { restTemplate: updatedTemplate }),
        };
      });
      syncCoachDataToServer(next, templates);
      return next;
    });
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
    setTrainees((prev) => {
      const next = prev.map((t) => {
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
      });
      syncCoachDataToServer(next, templates);
      return next;
    });
  };

  const handleAddTraineeByCoach = async (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    goal: string;
    templateId: string;
  }) => {
    if (currentUser?.role !== 'coach') return;
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'coach-create-trainee',
        ...data,
      }),
    });
    if (res.ok) {
      const result = await res.json();
      if (Array.isArray(result.trainees)) {
        setTrainees(result.trainees);
      }
    }
  };

  const handleUpdateTraineeStatus = (
    traineeId: string,
    status: AccountStatus
  ) => {
    if (currentUser?.role !== 'coach') return;
    setTrainees((prev) => {
      const next = prev.map((t) =>
        t.id === traineeId ? { ...t, status } : t
      );
      syncCoachDataToServer(next, templates);
      return next;
    });
  };

  const handleUpdateTraineeCredentials = async (
    traineeId: string,
    email: string,
    password: string
  ) => {
    if (currentUser?.role !== 'coach') return;
    setTrainees((prev) =>
      prev.map((t) => (t.id === traineeId ? { ...t, email } : t))
    );
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'coach-update-credentials',
        traineeId,
        email,
        password,
      }),
    });
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
    return <AuthGateView onLoginSuccess={handleLoginSuccess} />;
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
            onUpdateCoachInviteCode={async (code) => {
              setCoachInviteCode(code);
              await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'coach-update-invite-code',
                  inviteCode: code,
                }),
              });
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
