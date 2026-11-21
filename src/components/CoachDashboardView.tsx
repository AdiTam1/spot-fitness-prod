'use client';

import React, { useState } from 'react';
import {
  Modal,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  PasswordInput,
  Checkbox,
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
  Share2,
  FolderPlus,
  Crown,
  Layers,
  Brain,
} from 'lucide-react';
import {
  AccountStatus,
  AuthSessionUser,
  CoachDirectoryItem,
  CoachProfile,
  DayType,
  MealTemplateSlot,
  NutritionTemplate,
  TraineeActivityTargets,
  TraineeGroup,
  TraineeProfile,
} from '@/types/nutrition';
import {
  DEFAULT_TEMPLATES,
  getTodayIso,
  sumMacros,
} from '@/data/israeliFoodCatalog';

interface CoachDashboardViewProps {
  currentUser: AuthSessionUser;
  trainees: TraineeProfile[];
  templates: NutritionTemplate[];
  groups: TraineeGroup[];
  coaches: CoachProfile[];
  coachDirectory: CoachDirectoryItem[];
  coachInviteCode: string;
  onUpdateCoachInviteCode: (newCode: string) => void;
  onSaveTemplate: (template: NutritionTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
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
    primaryCoachId?: string;
    groupId?: string;
  }) => void;
  onUpdateTraineeStatus: (
    traineeId: string,
    status: AccountStatus,
    primaryCoachId?: string
  ) => void;
  onUpdateTraineeCredentials: (
    traineeId: string,
    email: string,
    password: string
  ) => void;
  onUpdateTraineeSharing: (
    traineeId: string,
    primaryCoachId: string,
    sharedCoachIds: string[]
  ) => void;
  onUpdateTraineeGroup: (traineeId: string, groupId?: string) => void;
  onCreateGroup: (name: string, color: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onBulkGroupAssignTemplate: (
    groupId: string,
    templateId: string,
    dayType: DayType
  ) => void;
  onBulkGroupShareCoach: (groupId: string, targetCoachId: string) => void;
  onManageObservationDays: (
    traineeId: string,
    payload: {
      toggleDate?: string;
      addFutureDays?: number;
      clearAll?: boolean;
      countObservationInStats?: boolean;
    }
  ) => void;
  onUpdateActivityTargets: (
    traineeId: string,
    activityTargets: TraineeActivityTargets
  ) => void;
  onUpdateAiNotesAndSplit?: (
    traineeId: string,
    payload: {
      enableWorkoutRestSplit?: boolean;
      coachAiNotes?: string;
      aiLearnedPreferences?: string[];
    }
  ) => void;
  onOpenCoachOnboarding?: () => void;
  onDeleteTrainee: (traineeId: string) => void;
  onCreateCoach: (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    inviteCode: string;
  }) => Promise<{ error?: string }>;
  onUpdateCoachStatus: (coachId: string, status: 'active' | 'paused') => void;
  onUpdateCoachCredentials: (
    coachId: string,
    email: string,
    password: string,
    inviteCode: string
  ) => void;
  onDeleteCoach: (coachId: string) => void;
  onPreviewTraineeMobile: (traineeId: string) => void;
}

const GROUP_COLOR_SWATCHES = [
  { label: 'וולט אתלטי', value: '#d2ff28' },
  { label: 'כחול שמיים', value: '#38bdf8' },
  { label: 'קורל חלבון', value: '#ff5e7e' },
  { label: 'אמבר אנרגיה', value: '#ffb800' },
  { label: 'ירוק אמרלד', value: '#22c55e' },
  { label: 'סגול פרימיום', value: '#a855f7' },
];

const WORKOUT_TYPE_PRESETS = [
  'אימון כוח A',
  'אימון כוח B',
  'אימון כוח C',
  'Full Body',
  'פלג גוף עליון',
  'פלג גוף תחתון',
  'Push (דחיפה)',
  'Pull (משיכה)',
  'Legs (רגליים)',
  'פילאטיס / ליבה',
];

export function CoachDashboardView({
  currentUser,
  trainees,
  templates,
  groups,
  coaches,
  coachDirectory,
  coachInviteCode,
  onUpdateCoachInviteCode,
  onSaveTemplate,
  onDeleteTemplate,
  onAssignTemplateToTrainee,
  onUpdateTraineePlan,
  onAddCoachFeedback,
  onAddTrainee,
  onUpdateTraineeStatus,
  onUpdateTraineeCredentials,
  onUpdateTraineeSharing,
  onUpdateTraineeGroup,
  onCreateGroup,
  onDeleteGroup,
  onBulkGroupAssignTemplate,
  onBulkGroupShareCoach,
  onManageObservationDays,
  onUpdateActivityTargets,
  onUpdateAiNotesAndSplit,
  onOpenCoachOnboarding,
  onDeleteTrainee,
  onCreateCoach,
  onUpdateCoachStatus,
  onUpdateCoachCredentials,
  onDeleteCoach,
  onPreviewTraineeMobile,
}: CoachDashboardViewProps) {
  const today = getTodayIso();
  const isSuperAdmin = currentUser.role === 'admin';

  const [activeSection, setActiveSection] = useState<
    'roster' | 'templates' | 'inspector' | 'users' | 'coaches'
  >('roster');

  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string>('all');

  const [selectedTraineeId, setSelectedTraineeId] = useState<string>(
    trainees[0]?.id || ''
  );

  // ניהול טמפלייטים
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates[0]?.id || DEFAULT_TEMPLATES[0].id
  );
  const currentTemplate =
    templates.find((t) => t.id === selectedTemplateId) ||
    templates[0] ||
    DEFAULT_TEMPLATES[0];
  const [editableTemplate, setEditableTemplate] = useState<NutritionTemplate>(
    () => JSON.parse(JSON.stringify(currentTemplate))
  );
  const [assignTraineeId, setAssignTraineeId] = useState<string>(
    trainees[0]?.id || ''
  );
  const [assignDayType, setAssignDayType] = useState<DayType>('workout');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedTrainee: TraineeProfile | undefined =
    trainees.find((t) => t.id === selectedTraineeId) || trainees[0];
  const [editingDayType, setEditingDayType] = useState<DayType>('workout');
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>(
    {}
  );

  // מודאל הוספת מתאמן חדש
  const [newTraineeModal, setNewTraineeModal] = useState(false);
  const [newTraineeName, setNewTraineeName] = useState('');
  const [newTraineeEmail, setNewTraineeEmail] = useState('');
  const [newTraineePassword, setNewTraineePassword] = useState('123456');
  const [newTraineePhone, setNewTraineePhone] = useState('');
  const [newTraineeGoal, setNewTraineeGoal] = useState(
    'חיטוב וירידה באחוזי שומן'
  );
  const [newTraineeTplId, setNewTraineeTplId] = useState(
    templates[0]?.id || DEFAULT_TEMPLATES[0].id
  );
  const [newTraineeCoachId, setNewTraineeCoachId] = useState('coach-admin');
  const [newTraineeGroupId, setNewTraineeGroupId] = useState<string>('');

  // מודאל שיתוף מתאמן עם מאמנים נוספים
  const [sharingModalTrainee, setSharingModalTrainee] =
    useState<TraineeProfile | null>(null);
  const [sharingPrimaryId, setSharingPrimaryId] =
    useState<string>('coach-admin');
  const [sharingCollaboratorIds, setSharingCollaboratorIds] = useState<
    string[]
  >([]);

  // מודאל יצירת קבוצה חדשה
  const [newGroupModal, setNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#d2ff28');

  // פעולות קבוצתיות (Bulk Actions)
  const [bulkTplId, setBulkTplId] = useState<string>(
    templates[0]?.id || DEFAULT_TEMPLATES[0].id
  );
  const [bulkDayType, setBulkDayType] = useState<DayType>('workout');
  const [bulkShareCoachId, setBulkShareCoachId] = useState<string>('');

  // מודאל עריכת פרטי התחברות למתאמן קיים
  const [credModalTrainee, setCredModalTrainee] =
    useState<TraineeProfile | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // ניהול מאמנים (Super Admin בלבד)
  const [newCoachModal, setNewCoachModal] = useState(false);
  const [newCoachName, setNewCoachName] = useState('');
  const [newCoachEmail, setNewCoachEmail] = useState('');
  const [newCoachPassword, setNewCoachPassword] = useState('123456');
  const [newCoachPhone, setNewCoachPhone] = useState('');
  const [newCoachInviteCode, setNewCoachInviteCode] = useState('');
  const [coachModalError, setCoachModalError] = useState<string | null>(null);

  const [credModalCoach, setCredModalCoach] = useState<CoachProfile | null>(
    null
  );
  const [editCoachEmail, setEditCoachEmail] = useState('');
  const [editCoachPassword, setEditCoachPassword] = useState('');
  const [editCoachInvite, setEditCoachInvite] = useState('');

  // אישור מתאמן Pending עם בחירת מאמן משויך
  const [pendingAssignCoachMap, setPendingAssignCoachMap] = useState<
    Record<string, string>
  >({});

  const [inviteCodeDraft, setInviteCodeDraft] = useState(coachInviteCode);
  const [customWorkoutTypeInput, setCustomWorkoutTypeInput] = useState('');

  const pendingTrainees = trainees.filter((t) => t.status === 'pending');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // בדיקה האם המשתמש הנוכחי הוא הבעלים הראשי של המתאמן (ולא רק מאמן שותף)
  const isOwnerOfTrainee = (t: TraineeProfile) => {
    return isSuperAdmin || t.primaryCoachId === currentUser.id;
  };

  const getCoachNameById = (coachId: string) => {
    if (!coachId || coachId === 'coach-admin') return 'מנהל ראשי';
    const found =
      coachDirectory.find((c) => c.id === coachId) ||
      coaches.find((c) => c.id === coachId);
    return found ? found.name : 'מאמן';
  };

  const canEditCurrentTemplate =
    isSuperAdmin || editableTemplate.ownerCoachId === currentUser.id;

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
      name: isSuperAdmin
        ? `טמפלייט מערכת #${templates.length + 1}`
        : `טמפלייט אישי (${currentUser.name}) #${templates.length + 1}`,
      description: 'הגדרת ארוחות ויעדי מאקרו יומיים',
      dayType: 'workout',
      tolerancePercent: 10,
      ownerCoachId: currentUser.id,
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
    showToast('נוצר טמפלייט חדש בבעלותך');
  };

  const handleDuplicateTemplateToPersonal = () => {
    const cloned: NutritionTemplate = {
      ...JSON.parse(JSON.stringify(editableTemplate)),
      id: `tpl-${Date.now()}`,
      name: `${editableTemplate.name} (עותק של ${currentUser.name})`,
      ownerCoachId: currentUser.id,
    };
    onSaveTemplate(cloned);
    setSelectedTemplateId(cloned.id);
    setEditableTemplate(cloned);
    showToast('הטמפלייט שוכפל לספרייה האישית שלך וכעת ניתן לעריכה מלאה');
  };

  const updateTemplateMealField = (
    mealId: string,
    field:
      | 'name'
      | 'timeHint'
      | 'calories'
      | 'protein'
      | 'carbs'
      | 'fat'
      | 'recommendedOptions',
    value: string | number
  ) => {
    setEditableTemplate((prev) => ({
      ...prev,
      meals: prev.meals.map((m) => {
        if (m.id !== mealId) return m;
        if (field === 'recommendedOptions') {
          const opts = String(value)
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean);
          return { ...m, recommendedOptions: opts };
        }
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
    const isTodayObs =
      (t.observationDates || []).includes(today) ||
      Boolean(log?.isObservationDay);

    const allItems = log
      ? tpl.meals.flatMap((m) => log.meals[m.id]?.items || [])
      : [];
    const consumed = sumMacros(allItems.map((i) => i.macros));

    // אם היום הוא יום תשקיף והמאמן בחר להחריג ימי תשקיף מחישוב החריגות
    if (isTodayObs && !t.countObservationInStats) {
      return {
        statusColor: '#38bdf8',
        statusBg: 'rgba(56, 189, 248, 0.14)',
        label: 'יום תשקיף (מוחרג מיעד)',
        consumed,
        target,
        loggedMealsCount,
        totalMeals: tpl.meals.length,
        isTodayObs: true,
      };
    }

    if (!log || loggedMealsCount === 0) {
      return {
        statusColor: 'var(--status-danger)',
        statusBg: 'rgba(239, 68, 68, 0.12)',
        label: isTodayObs ? 'תשקיף (טרם הוזן)' : 'טרם הוזן היום',
        consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        target,
        loggedMealsCount: 0,
        totalMeals: tpl.meals.length,
        isTodayObs,
      };
    }

    const maxAllowed = target.calories * (1 + t.tolerancePercent / 100);

    if (consumed.calories > maxAllowed) {
      return {
        statusColor: 'var(--status-warn)',
        statusBg: 'rgba(245, 158, 11, 0.12)',
        label: isTodayObs ? 'תשקיף (נספר - חריגה)' : 'חריגה מהיעד',
        consumed,
        target,
        loggedMealsCount,
        totalMeals: tpl.meals.length,
        isTodayObs,
      };
    }

    return {
      statusColor: 'var(--status-ok)',
      statusBg: 'rgba(34, 197, 94, 0.12)',
      label: isTodayObs ? 'תשקיף (נספר - ביעד)' : 'עומד ביעדים',
      consumed,
      target,
      loggedMealsCount,
      totalMeals: tpl.meals.length,
      isTodayObs,
    };
  };

  // חישוב ממוצע קלוריות ומאקרו של ימי התשקיף עבור מתאמן
  const getObservationAverage = (t: TraineeProfile) => {
    const obsDates = t.observationDates || [];
    const loggedObsDays = obsDates.filter(
      (d) => t.logs[d] && Object.keys(t.logs[d].meals || {}).length > 0
    );
    if (loggedObsDays.length === 0) {
      return { count: obsDates.length, loggedCount: 0, calories: 0, protein: 0 };
    }
    let totalCal = 0;
    let totalProt = 0;
    for (const d of loggedObsDays) {
      const log = t.logs[d];
      const items = Object.values(log.meals || {}).flatMap(
        (m) => m.items || []
      );
      const macros = sumMacros(items.map((i) => i.macros));
      totalCal += macros.calories;
      totalProt += macros.protein;
    }
    return {
      count: obsDates.length,
      loggedCount: loggedObsDays.length,
      calories: Math.round(totalCal / loggedObsDays.length),
      protein: Math.round(totalProt / loggedObsDays.length),
    };
  };

  const templateTotals = sumMacros(
    (editableTemplate?.meals || []).map((m) => m.targets)
  );
  const activeTraineePlan = selectedTrainee
    ? !selectedTrainee.enableWorkoutRestSplit
      ? selectedTrainee.workoutTemplate
      : editingDayType === 'workout'
      ? selectedTrainee.workoutTemplate
      : selectedTrainee.restTemplate
    : currentTemplate;

  const updateTraineeDirectMeal = (
    mealId: string,
    field:
      | 'name'
      | 'calories'
      | 'protein'
      | 'carbs'
      | 'fat'
      | 'recommendedOptions',
    value: string | number
  ) => {
    if (!selectedTrainee) return;
    const effectiveDayType: DayType = selectedTrainee.enableWorkoutRestSplit
      ? editingDayType
      : 'workout';
    const updatedTpl: NutritionTemplate = {
      ...activeTraineePlan,
      meals: activeTraineePlan.meals.map((m) => {
        if (m.id !== mealId) return m;
        if (field === 'recommendedOptions') {
          const opts = String(value)
            .split('|')
            .map((s) => s.trim())
            .filter(Boolean);
          return { ...m, recommendedOptions: opts };
        }
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
      effectiveDayType,
      updatedTpl,
      selectedTrainee.tolerancePercent
    );
  };

  const addMealToTraineePlan = () => {
    if (!selectedTrainee) return;
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
    if (!selectedTrainee || activeTraineePlan.meals.length <= 1) return;
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

  // סינון מתאמנים לפי קבוצה ולפי מאמן
  const filteredTrainees = trainees.filter((t) => {
    if (selectedGroupFilter === 'unassigned' && t.groupId) return false;
    if (
      selectedGroupFilter !== 'all' &&
      selectedGroupFilter !== 'unassigned' &&
      t.groupId !== selectedGroupFilter
    ) {
      return false;
    }

    if (selectedCoachFilter !== 'all') {
      if (
        t.primaryCoachId !== selectedCoachFilter &&
        !(t.sharedCoachIds || []).includes(selectedCoachFilter)
      ) {
        return false;
      }
    }
    return true;
  });

  const activeGroupObj = groups.find((g) => g.id === selectedGroupFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* תור אישור מתאמנים שנרשמו ללא קוד מאמן (גלוי למנהל הראשי בלבד) */}
      {pendingTrainees.length > 0 && (
        <div
          style={{
            padding: '16px 20px',
            borderRadius: 16,
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <UserCheck size={18} color="#fbbf24" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fbbf24' }}>
                מתאמנים הממתינים לאישור ושיוך למאמן ({pendingTrainees.length})
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                בחר לאיזה מאמן לשייך כל מתאמן ולחץ על אישור כדי לפתוח לו גישה
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {pendingTrainees.map((p) => {
              const targetCoach =
                pendingAssignCoachMap[p.id] || p.primaryCoachId || 'coach-admin';
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: 'var(--bg-surface-1)',
                    padding: '8px 12px',
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800 }}>
                    {p.name} ({p.email})
                  </span>
                  {isSuperAdmin && (
                    <Select
                      size="xs"
                      w={150}
                      value={targetCoach}
                      onChange={(val) =>
                        val &&
                        setPendingAssignCoachMap((prev) => ({
                          ...prev,
                          [p.id]: val,
                        }))
                      }
                      data={coachDirectory.map((c) => ({
                        value: c.id,
                        label: `מאמן: ${c.name}`,
                      }))}
                    />
                  )}
                  <button
                    onClick={() => {
                      onUpdateTraineeStatus(p.id, 'active', targetCoach);
                      showToast(
                        `${p.name} אושר ושויך למאמן ${getCoachNameById(
                          targetCoach
                        )}!`
                      );
                    }}
                    className="btn-volt"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <Check size={13} />
                    <span>אשר ושייך</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* סרגל ניווט ראשי של הדשבורד */}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {[
            {
              id: 'roster',
              label: `מתאמנים וקבוצות (${trainees.length})`,
              icon: Users,
              show: true,
            },
            {
              id: 'inspector',
              label: `תוכנית ויומן (${selectedTrainee?.name || 'ללא מתאמן'})`,
              icon: Sliders,
              show: true,
            },
            {
              id: 'templates',
              label: `ספריית טמפלייטים (${templates.length})`,
              icon: LayoutTemplate,
              show: true,
            },
            {
              id: 'users',
              label: `חשבונות מתאמנים ושיתוף`,
              icon: ShieldCheck,
              show: true,
            },
            {
              id: 'coaches',
              label: `ניהול מאמנים (${coaches.length})`,
              icon: Crown,
              show: isSuperAdmin, // מוצג אך ורק למנהל הראשי!
            },
          ]
            .filter((t) => t.show)
            .map((tab) => {
              const Icon = tab.icon;
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveSection(
                      tab.id as
                        | 'roster'
                        | 'templates'
                        | 'inspector'
                        | 'users'
                        | 'coaches'
                    )
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 15px',
                    borderRadius: 12,
                    border: active
                      ? '1px solid rgba(210, 255, 40, 0.4)'
                      : '1px solid transparent',
                    background: active
                      ? 'rgba(210, 255, 40, 0.1)'
                      : 'transparent',
                    color: active
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)',
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

        <div style={{ display: 'flex', gap: 8 }}>
          {onOpenCoachOnboarding && (
            <button
              onClick={onOpenCoachOnboarding}
              className="btn-surface"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 14px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <Sliders size={14} color="#38bdf8" />
              <span>הגדרות פרופיל מאמן</span>
            </button>
          )}

          <button
            onClick={() => setNewGroupModal(true)}
            className="btn-surface"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            <FolderPlus size={15} color="var(--accent-volt)" />
            <span>+ קבוצה חדשה</span>
          </button>

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
            <span>+ מתאמן חדש</span>
          </button>
        </div>
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

      {/* ===================================================================== */}
      {/* תצוגה 1: מצבת מתאמנים, סינון לפי קבוצות ופעולות קבוצתיות              */}
      {/* ===================================================================== */}
      {activeSection === 'roster' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* סרגל סינון קבוצות מתאמנים + סינון לפי מאמן (למנהל ראשי) */}
          <div
            className="pro-card"
            style={{
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  marginLeft: 4,
                }}
              >
                קבוצות:
              </span>

              <button
                onClick={() => setSelectedGroupFilter('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border:
                    selectedGroupFilter === 'all'
                      ? '1px solid var(--accent-volt)'
                      : '1px solid var(--border-subtle)',
                  background:
                    selectedGroupFilter === 'all'
                      ? 'rgba(210, 255, 40, 0.12)'
                      : 'var(--bg-surface-2)',
                  color:
                    selectedGroupFilter === 'all'
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                הכל ({trainees.length})
              </button>

              {groups.map((grp) => {
                const count = trainees.filter(
                  (t) => t.groupId === grp.id
                ).length;
                const active = selectedGroupFilter === grp.id;
                return (
                  <button
                    key={grp.id}
                    onClick={() => setSelectedGroupFilter(grp.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 999,
                      border: active
                        ? `1px solid ${grp.color}`
                        : '1px solid var(--border-subtle)',
                      background: active
                        ? 'rgba(255, 255, 255, 0.08)'
                        : 'var(--bg-surface-2)',
                      color: active ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: grp.color,
                      }}
                    />
                    <span>
                      {grp.name} ({count})
                    </span>
                  </button>
                );
              })}

              <button
                onClick={() => setSelectedGroupFilter('unassigned')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border:
                    selectedGroupFilter === 'unassigned'
                      ? '1px solid var(--accent-volt)'
                      : '1px solid var(--border-subtle)',
                  background:
                    selectedGroupFilter === 'unassigned'
                      ? 'rgba(210, 255, 40, 0.12)'
                      : 'var(--bg-surface-2)',
                  color:
                    selectedGroupFilter === 'unassigned'
                      ? 'var(--accent-volt)'
                      : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ללא קבוצה ({trainees.filter((t) => !t.groupId).length})
              </button>
            </div>

            {isSuperAdmin && coachDirectory.length > 1 && (
              <Select
                size="xs"
                w={190}
                placeholder="סנן לפי מאמן אחראי"
                value={selectedCoachFilter}
                onChange={(val) => setSelectedCoachFilter(val || 'all')}
                data={[
                  { value: 'all', label: 'כל המאמנים במערכת' },
                  ...coachDirectory.map((c) => ({
                    value: c.id,
                    label: `מאמן: ${c.name}`,
                  })),
                ]}
              />
            )}
          </div>

          {/* סרגל פעולות קבוצתיות (מופיע כשנבחרה קבוצה ספציפית) */}
          {activeGroupObj && (
            <div
              className="pro-card"
              style={{
                padding: '14px 18px',
                borderColor: activeGroupObj.color,
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Layers size={18} color={activeGroupObj.color} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>
                    פעולות קבוצתיות על &ldquo;{activeGroupObj.name}&rdquo; (
                    {filteredTrainees.length} מתאמנים)
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                  >
                    החל טמפלייט תזונה או שתף מאמן נוסף על כל חברי הקבוצה בלחיצה
                    אחת
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <Select
                  size="xs"
                  label="בחר טמפלייט להחלה קבוצתית"
                  w={200}
                  value={bulkTplId}
                  onChange={(val) => val && setBulkTplId(val)}
                  data={templates.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                />
                <Select
                  size="xs"
                  label="עבור יום"
                  w={110}
                  value={bulkDayType}
                  onChange={(val) => val && setBulkDayType(val as DayType)}
                  data={[
                    { value: 'workout', label: 'יום אימון' },
                    { value: 'rest', label: 'יום מנוחה' },
                  ]}
                />
                <button
                  onClick={() => {
                    onBulkGroupAssignTemplate(
                      activeGroupObj.id,
                      bulkTplId,
                      bulkDayType
                    );
                    showToast(
                      `הטמפלייט הוחל בהצלחה על כל מתאמני קבוצת "${activeGroupObj.name}"!`
                    );
                  }}
                  className="btn-volt"
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  החל טמפלייט לקבוצה
                </button>

                {coachDirectory.length > 1 && (
                  <>
                    <Select
                      size="xs"
                      label="שתף קבוצה עם מאמן"
                      w={150}
                      placeholder="בחר מאמן שותף"
                      value={bulkShareCoachId}
                      onChange={(val) => setBulkShareCoachId(val || '')}
                      data={coachDirectory
                        .filter((c) => c.id !== currentUser.id)
                        .map((c) => ({
                          value: c.id,
                          label: c.name,
                        }))}
                    />
                    <button
                      disabled={!bulkShareCoachId}
                      onClick={() => {
                        if (!bulkShareCoachId) return;
                        onBulkGroupShareCoach(
                          activeGroupObj.id,
                          bulkShareCoachId
                        );
                        showToast(
                          `כל מתאמני קבוצת "${activeGroupObj.name}" שותפו עם ${getCoachNameById(
                            bulkShareCoachId
                          )}!`
                        );
                      }}
                      className="btn-surface"
                      style={{
                        padding: '7px 12px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      שתף קבוצה
                    </button>
                  </>
                )}

                {(isSuperAdmin ||
                  activeGroupObj.ownerCoachId === currentUser.id) && (
                  <button
                    title="מחק קבוצה (המתאמנים לא יימחקו)"
                    onClick={() => {
                      onDeleteGroup(activeGroupObj.id);
                      setSelectedGroupFilter('all');
                      showToast(`הקבוצה "${activeGroupObj.name}" הוסרה`);
                    }}
                    className="btn-surface"
                    style={{
                      padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={14} color="#ef4444" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* טבלת המתאמנים */}
          <div className="pro-card" style={{ overflow: 'hidden' }}>
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
                    <th style={{ padding: '14px 20px' }}>מתאמן</th>
                    <th style={{ padding: '14px 12px' }}>קבוצה</th>
                    <th style={{ padding: '14px 12px' }}>
                      מאמן ראשי ושותפים
                    </th>
                    <th style={{ padding: '14px 12px' }}>ביצוע יומי</th>
                    <th style={{ padding: '14px 12px' }}>קלוריות ומאקרו</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>
                      פעולות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrainees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: 32,
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: 13,
                        }}
                      >
                        אין מתאמנים בקטגוריה זו כרגע. לחץ על &ldquo;+ מתאמן
                        חדש&rdquo; למעלה כדי להוסיף.
                      </td>
                    </tr>
                  ) : (
                    filteredTrainees.map((t) => {
                      const st = getTraineeStatus(t);
                      const calPct = Math.min(
                        100,
                        Math.round(
                          (st.consumed.calories /
                            Math.max(1, st.target.calories)) *
                            100
                        )
                      );
                      const isOwner = isOwnerOfTrainee(t);
                      const sharedNames = (t.sharedCoachIds || []).map((id) =>
                        getCoachNameById(id)
                      );

                      return (
                        <tr
                          key={t.id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <td style={{ padding: '14px 20px' }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                              }}
                            >
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: '50%',
                                  background: 'var(--bg-surface-3)',
                                  border: '1px solid var(--border-strong)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                  fontSize: 13,
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

                          {/* שיוך מהיר לקבוצה */}
                          <td style={{ padding: '14px 12px' }}>
                            <Select
                              size="xs"
                              w={135}
                              placeholder="ללא קבוצה"
                              value={t.groupId || ''}
                              onChange={(val) =>
                                onUpdateTraineeGroup(
                                  t.id,
                                  val ? val : undefined
                                )
                              }
                              data={[
                                { value: '', label: 'ללא קבוצה' },
                                ...groups.map((g) => ({
                                  value: g.id,
                                  label: g.name,
                                })),
                              ]}
                            />
                          </td>

                          {/* מאמן ראשי + מאמנים שותפים */}
                          <td style={{ padding: '14px 12px' }}>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 3,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 5,
                                }}
                              >
                                <span>
                                  ראשי: {getCoachNameById(t.primaryCoachId)}
                                </span>
                                {!isOwner && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      padding: '1px 6px',
                                      borderRadius: 999,
                                      background: 'rgba(56, 189, 248, 0.14)',
                                      color: '#38bdf8',
                                    }}
                                  >
                                    שותף
                                  </span>
                                )}
                              </div>
                              {sharedNames.length > 0 && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  שותפים: {sharedNames.join(', ')}
                                </div>
                              )}
                            </div>
                          </td>

                          <td style={{ padding: '14px 12px' }}>
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 5,
                                alignItems: 'flex-start',
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 10px',
                                  borderRadius: 999,
                                  background: st.statusBg,
                                  color: st.statusColor,
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {st.label} ({st.loggedMealsCount}/{st.totalMeals}
                                )
                              </span>

                              {/* כפתורי קליק זריז למאמן על ימי תשקיף */}
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                  title="הפעל או בטל את היום כיום תשקיף בקליק"
                                  onClick={() => {
                                    onManageObservationDays(t.id, {
                                      toggleDate: today,
                                    });
                                    showToast(
                                      st.isTodayObs
                                        ? `יום תשקיף בוטל להיום עבור ${t.name}`
                                        : `היום הוגדר כיום תשקיף עבור ${t.name}`
                                    );
                                  }}
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: 6,
                                    border: st.isTodayObs
                                      ? '1px solid #38bdf8'
                                      : '1px solid var(--border-subtle)',
                                    background: st.isTodayObs
                                      ? 'rgba(56, 189, 248, 0.15)'
                                      : 'var(--bg-surface-2)',
                                    color: st.isTodayObs
                                      ? '#38bdf8'
                                      : 'var(--text-muted)',
                                    fontSize: 10,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {st.isTodayObs
                                    ? '✓ תשקיף היום'
                                    : '+ תשקיף היום'}
                                </button>

                                {((t.observationDates || []).length > 0 ||
                                  st.isTodayObs) && (
                                  <button
                                    title="בחר בקליק זריז אם ימי תשקיף נחשבים בספירת היעדים או לא"
                                    onClick={() => {
                                      const nextVal =
                                        !t.countObservationInStats;
                                      onManageObservationDays(t.id, {
                                        countObservationInStats: nextVal,
                                      });
                                      showToast(
                                        nextVal
                                          ? `ימי תשקיף של ${t.name} נכללים כעת בספירת היעדים`
                                          : `ימי תשקיף של ${t.name} מוחרגים מחישוב חריגות (הקלוריות נספרות בתשקיף)`
                                      );
                                    }}
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: 6,
                                      border: t.countObservationInStats
                                        ? '1px solid var(--accent-volt)'
                                        : '1px solid var(--border-subtle)',
                                      background: t.countObservationInStats
                                        ? 'rgba(210, 255, 40, 0.14)'
                                        : 'var(--bg-surface-2)',
                                      color: t.countObservationInStats
                                        ? 'var(--accent-volt)'
                                        : 'var(--text-secondary)',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {t.countObservationInStats
                                      ? 'תשקיף: נספר ביעד'
                                      : 'תשקיף: לא נחשב ביעד'}
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>

                          <td style={{ padding: '14px 12px', minWidth: 185 }}>
                            <div
                              className="num-mono"
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: 12,
                                marginBottom: 4,
                              }}
                            >
                              <span style={{ fontWeight: 800 }}>
                                {st.consumed.calories} / {st.target.calories}{' '}
                                קק״ל
                              </span>
                              <span style={{ color: 'var(--macro-protein)' }}>
                                ח׳ {st.consumed.protein}/{st.target.protein}g
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

                          <td
                            style={{ padding: '14px 20px', textAlign: 'left' }}
                          >
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                onClick={() => {
                                  setSelectedTraineeId(t.id);
                                  setActiveSection('inspector');
                                }}
                                className="btn-surface"
                                style={{
                                  padding: '6px 12px',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                תפריט ויומן
                              </button>

                              {isOwner && (
                                <button
                                  title="שתף מתאמן עם מאמנים נוספים"
                                  onClick={() => {
                                    setSharingModalTrainee(t);
                                    setSharingPrimaryId(
                                      t.primaryCoachId || 'coach-admin'
                                    );
                                    setSharingCollaboratorIds(
                                      t.sharedCoachIds || []
                                    );
                                  }}
                                  className="btn-surface"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <Share2
                                    size={13}
                                    color="var(--accent-volt)"
                                  />
                                  <span>שיתוף</span>
                                </button>
                              )}

                              <button
                                onClick={() => onPreviewTraineeMobile(t.id)}
                                className="btn-surface"
                                style={{
                                  padding: '6px 10px',
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
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* תצוגה 2: מסך מפוצל לניהול תפריט, שאלון Onboarding, היקפים ויומן מתאמן  */}
      {/* ===================================================================== */}
      {activeSection === 'inspector' && selectedTrainee && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* כרטיס עליון: נתוני Onboarding, היקפים, BMR/TDEE וניהול ימי תשקיף */}
          <div className="pro-card" style={{ padding: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 16,
                paddingBottom: 16,
                marginBottom: 16,
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  נתוני קליטה (Onboarding), היקפים וימי תשקיף —{' '}
                  {selectedTrainee.name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {selectedTrainee.onboarding?.completed
                    ? `הושלם בתאריך ${
                        selectedTrainee.onboarding.completedAt || ''
                      } · גיל: ${selectedTrainee.onboarding.age || '—'} · גובה: ${
                        selectedTrainee.onboarding.heightCm || '—'
                      } ס״מ · משקל: ${selectedTrainee.currentWeight} ק״ג`
                    : 'המתאמן טרם השלים את שאלון ה-Onboarding בכניסה הראשונה'}
                </div>
              </div>

              {/* חישוב BMR, TDEE וממוצע ימי תשקיף */}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {selectedTrainee.onboarding?.estimatedBmr && (
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      padding: '8px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{ fontSize: 10, color: 'var(--text-secondary)' }}
                    >
                      BMR / TDEE משוער
                    </div>
                    <div
                      className="num-mono"
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: 'var(--accent-volt)',
                      }}
                    >
                      BMR {selectedTrainee.onboarding.estimatedBmr} · TDEE{' '}
                      {selectedTrainee.onboarding.estimatedTdee} קק״ל
                    </div>
                  </div>
                )}

                {(() => {
                  const obsAvg = getObservationAverage(selectedTrainee);
                  return (
                    <div
                      style={{
                        background: 'rgba(56, 189, 248, 0.08)',
                        padding: '8px 14px',
                        borderRadius: 12,
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                      }}
                    >
                      <div style={{ fontSize: 10, color: '#38bdf8' }}>
                        ממוצע ימי תשקיף ({obsAvg.loggedCount} מתוך {obsAvg.count}{' '}
                        ימים)
                      </div>
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: '#ffffff',
                        }}
                      >
                        {obsAvg.loggedCount > 0
                          ? `${obsAvg.calories} קק״ל · חלבון ${obsAvg.protein}g`
                          : 'טרם הוזנו ארוחות בתשקיף'}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* שורת שליטה מהירה בימי תשקיף למאמן */}
            {(() => {
              const act = selectedTrainee.activityTargets || {
                weeklyWorkoutsTarget: 4,
                workoutTypes: ['אימון כוח A', 'אימון כוח B', 'Full Body'],
                weeklyCardioTarget: 3,
                cardioMode: 'both' as const,
                cardioTargetMinutes: 35,
                dailySleepTargetHours: 7.5,
              };

              const loggedWorkoutsCount = Object.values(
                selectedTrainee.logs || {}
              ).filter((l) => l.workoutLog?.completed).length;
              const loggedCardioCount = Object.values(
                selectedTrainee.logs || {}
              ).filter((l) => l.cardioLog?.completed).length;
              const todaySleep = selectedTrainee.logs[today]?.sleepHours;

              return (
                <div
                  style={{
                    background: 'var(--bg-surface-2)',
                    padding: 14,
                    borderRadius: 14,
                    border: '1px solid rgba(210, 255, 40, 0.25)',
                    marginBottom: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: 'var(--accent-volt)',
                        }}
                      >
                        הגדרת יעדי אימונים, סוגי אימון, הליכות/ריצות ושעות שינה
                        ל-{selectedTrainee.name}
                      </div>
                      <div
                        style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                      >
                        יעדים אלו מוצגים למתאמן להזנה יומית ביומן שלו
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
                      <span
                        className="num-mono"
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: 'rgba(210, 255, 40, 0.12)',
                          color: 'var(--accent-volt)',
                          fontWeight: 800,
                        }}
                      >
                        אימונים שתועדו: {loggedWorkoutsCount} /{' '}
                        {act.weeklyWorkoutsTarget}
                      </span>
                      <span
                        className="num-mono"
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: 'rgba(56, 189, 248, 0.14)',
                          color: '#38bdf8',
                          fontWeight: 800,
                        }}
                      >
                        הליכות/ריצות: {loggedCardioCount} /{' '}
                        {act.weeklyCardioTarget}
                      </span>
                      <span
                        className="num-mono"
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: 'rgba(168, 85, 247, 0.15)',
                          color: '#c084fc',
                          fontWeight: 800,
                        }}
                      >
                        שינה היום: {todaySleep ?? '—'} /{' '}
                        {act.dailySleepTargetHours}h
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <NumberInput
                      size="xs"
                      label="מינימום ימי אימון בשבוע"
                      value={act.weeklyWorkoutsTarget}
                      min={0}
                      max={14}
                      onChange={(val) =>
                        onUpdateActivityTargets(selectedTrainee.id, {
                          ...act,
                          weeklyWorkoutsTarget: Number(val) || 0,
                        })
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="יעד הליכות / ריצות בשבוע"
                      value={act.weeklyCardioTarget}
                      min={0}
                      max={14}
                      onChange={(val) =>
                        onUpdateActivityTargets(selectedTrainee.id, {
                          ...act,
                          weeklyCardioTarget: Number(val) || 0,
                        })
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="משך הליכה/ריצה (דקות)"
                      value={act.cardioTargetMinutes}
                      min={10}
                      max={180}
                      step={5}
                      onChange={(val) =>
                        onUpdateActivityTargets(selectedTrainee.id, {
                          ...act,
                          cardioTargetMinutes: Number(val) || 35,
                        })
                      }
                    />
                    <NumberInput
                      size="xs"
                      label="יעד שעות שינה בלילה"
                      value={act.dailySleepTargetHours}
                      min={4}
                      max={12}
                      step={0.5}
                      decimalScale={1}
                      onChange={(val) =>
                        onUpdateActivityTargets(selectedTrainee.id, {
                          ...act,
                          dailySleepTargetHours: Number(val) || 7.5,
                        })
                      }
                    />
                  </div>

                  {/* בחירת סוגי האימון שהמתאמן יכול לסמן */}
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      סוגי אימון מוגדרים למתאמן (לחץ להוספה/הסרה):
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        marginBottom: 8,
                      }}
                    >
                      {Array.from(
                        new Set([
                          ...WORKOUT_TYPE_PRESETS,
                          ...(act.workoutTypes || []),
                        ])
                      ).map((wType) => {
                        const active = (act.workoutTypes || []).includes(wType);
                        return (
                          <button
                            key={wType}
                            type="button"
                            onClick={() => {
                              const nextTypes = active
                                ? act.workoutTypes.filter((x) => x !== wType)
                                : [...act.workoutTypes, wType];
                              if (nextTypes.length === 0) return;
                              onUpdateActivityTargets(selectedTrainee.id, {
                                ...act,
                                workoutTypes: nextTypes,
                              });
                            }}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 999,
                              border: active
                                ? '1px solid var(--accent-volt)'
                                : '1px solid var(--border-subtle)',
                              background: active
                                ? 'rgba(210, 255, 40, 0.14)'
                                : 'var(--bg-surface-1)',
                              color: active
                                ? 'var(--accent-volt)'
                                : 'var(--text-muted)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {active ? `✓ ${wType}` : `+ ${wType}`}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <TextInput
                        size="xs"
                        style={{ flex: 1 }}
                        placeholder="הוסף סוג אימון מותאם אישית (למשל: אימון רגליים וישבן, קרוספיט, שחייה)..."
                        value={customWorkoutTypeInput}
                        onChange={(e) =>
                          setCustomWorkoutTypeInput(e.currentTarget.value)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const clean = customWorkoutTypeInput.trim();
                          if (!clean) return;
                          const nextTypes = Array.from(
                            new Set([...(act.workoutTypes || []), clean])
                          );
                          onUpdateActivityTargets(selectedTrainee.id, {
                            ...act,
                            workoutTypes: nextTypes,
                          });
                          setCustomWorkoutTypeInput('');
                          showToast(`סוג האימון "${clean}" נוסף למתאמן`);
                        }}
                        className="btn-surface"
                        style={{
                          padding: '6px 12px',
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >
                        + הוסף סוג אימון
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10,
                background: 'var(--bg-surface-2)',
                padding: '12px 14px',
                borderRadius: 14,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8' }}>
                  ניהול ימי תשקיף ({selectedTrainee.observationDates?.length || 0}{' '}
                  ימים מוגדרים)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  הגדר ימי תשקיף מראש או בדיעבד, ובחר בקליק אם הקלוריות שלהם
                  נחשבות בספירת היעדים
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    onManageObservationDays(selectedTrainee.id, {
                      toggleDate: today,
                    });
                    showToast('סטטוס יום תשקיף להיום עודכן');
                  }}
                  className="btn-surface"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    borderColor: (
                      selectedTrainee.observationDates || []
                    ).includes(today)
                      ? '#38bdf8'
                      : undefined,
                  }}
                >
                  {(selectedTrainee.observationDates || []).includes(today)
                    ? '✓ היום מוגדר כיום תשקיף (לחץ לביטול)'
                    : 'הגדר את היום כיום תשקיף'}
                </button>

                <button
                  onClick={() => {
                    onManageObservationDays(selectedTrainee.id, {
                      addFutureDays: 3,
                    });
                    showToast('נוספו 3 ימי תשקיף מהיום והלאה');
                  }}
                  className="btn-surface"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  + 3 ימי תשקיף מראש
                </button>

                <button
                  onClick={() => {
                    onManageObservationDays(selectedTrainee.id, {
                      addFutureDays: 7,
                    });
                    showToast('נוספו 7 ימי תשקיף מראש');
                  }}
                  className="btn-surface"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  + 7 ימי תשקיף מראש
                </button>

                {/* מתג קליק זריז למאמן: האם ימי תשקיף נחשבים בספירה או לא */}
                <button
                  onClick={() => {
                    const nextVal = !selectedTrainee.countObservationInStats;
                    onManageObservationDays(selectedTrainee.id, {
                      countObservationInStats: nextVal,
                    });
                    showToast(
                      nextVal
                        ? 'ימי תשקיף נחשבים כעת בספירת היעדים'
                        : 'ימי תשקיף מוחרגים מחישוב חריגות היעד'
                    );
                  }}
                  className={
                    selectedTrainee.countObservationInStats
                      ? 'btn-volt'
                      : 'btn-surface'
                  }
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {selectedTrainee.countObservationInStats
                    ? '✓ ימי תשקיף נחשבים בספירה'
                    : 'ימי תשקיף לא נחשבים ביעד (לחץ להכללה)'}
                </button>

                {(selectedTrainee.observationDates || []).length > 0 && (
                  <button
                    onClick={() => {
                      onManageObservationDays(selectedTrainee.id, {
                        clearAll: true,
                      });
                      showToast('כל ימי התשקיף נוקו');
                    }}
                    className="btn-surface"
                    style={{
                      padding: '7px 10px',
                      fontSize: 11,
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    נקה ימי תשקיף
                  </button>
                )}
              </div>
            </div>

            {/* פירוט תשובות ה-Onboarding וההיקפים של המתאמן */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 12,
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: 'var(--accent-volt)',
                    marginBottom: 6,
                  }}
                >
                  אימונים, הליכה ואורח חיים
                </div>
                <div>
                  <b>אורח חיים:</b>{' '}
                  {selectedTrainee.onboarding?.activityLevel || '—'}{' '}
                  {selectedTrainee.onboarding?.activityLevelNote
                    ? `(${selectedTrainee.onboarding.activityLevelNote})`
                    : ''}
                </div>
                <div>
                  <b>אימוני כוח:</b>{' '}
                  {selectedTrainee.onboarding?.strengthWorkoutsPerWeek || '—'}{' '}
                  {selectedTrainee.onboarding?.strengthWorkoutsNote
                    ? `(${selectedTrainee.onboarding.strengthWorkoutsNote})`
                    : ''}
                </div>
                <div>
                  <b>הליכה בשבוע:</b>{' '}
                  {selectedTrainee.onboarding?.walkingSessionsPerWeek || '—'}{' '}
                  {selectedTrainee.onboarding?.walkingSessionsNote
                    ? `(${selectedTrainee.onboarding.walkingSessionsNote})`
                    : ''}
                </div>
                <div>
                  <b>שעות שינה:</b>{' '}
                  {selectedTrainee.onboarding?.sleepHours || '—'}
                </div>
              </div>

              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 12,
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: '#38bdf8',
                    marginBottom: 6,
                  }}
                >
                  היקפי גוף אחרונים (ס״מ)
                </div>
                {(() => {
                  const m =
                    selectedTrainee.measurementsHistory?.[
                      selectedTrainee.measurementsHistory.length - 1
                    ];
                  if (!m) {
                    return (
                      <div style={{ color: 'var(--text-muted)' }}>
                        המתאמן טרם הזין מדידת היקפים
                      </div>
                    );
                  }
                  return (
                    <div
                      className="num-mono"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 6,
                      }}
                    >
                      <div>
                        <b>חזה:</b> {m.chestCm ?? '—'} ס״מ
                      </div>
                      <div>
                        <b>בטן (פופיק):</b> {m.waistNavelCm ?? '—'} ס״מ
                      </div>
                      <div>
                        <b>זרוע:</b> {m.armCm ?? '—'} ס״מ
                      </div>
                      <div>
                        <b>ירך:</b> {m.thighCm ?? '—'} ס״מ
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 12,
                  borderRadius: 12,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    color: '#ffb800',
                    marginBottom: 6,
                  }}
                >
                  העדפות תזונה ואוכל חשוב
                </div>
                <div>
                  <b>סגנון:</b>{' '}
                  {(
                    selectedTrainee.onboarding?.dietaryPreferences || []
                  ).join(', ') || '—'}{' '}
                  {selectedTrainee.onboarding?.dietaryPreferencesNote || ''}
                </div>
                <div>
                  <b>לא מוותר על:</b>{' '}
                  {(
                    selectedTrainee.onboarding?.favoriteMustHaveFoods || []
                  ).join(', ') || '—'}{' '}
                  {selectedTrainee.onboarding?.favoriteMustHaveFoodsNote || ''}
                </div>
                <div>
                  <b>אלרגיות / לא אוכל:</b>{' '}
                  {(
                    selectedTrainee.onboarding?.dislikedOrAllergies || []
                  ).join(', ') || '—'}{' '}
                  {selectedTrainee.onboarding?.dislikedOrAllergiesNote || ''}
                </div>
                {selectedTrainee.onboarding?.scheduleAndNotes && (
                  <div>
                    <b>הערות למאמן:</b>{' '}
                    {selectedTrainee.onboarding.scheduleAndNotes}
                  </div>
                )}
              </div>
            </div>

            {/* פאנל הנחיות מאמן ל-AI + זיכרון העדפות נלמד של המתאמן + צ'ק-אין שבועי */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 12,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid rgba(210, 255, 40, 0.28)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--accent-volt)',
                    marginBottom: 6,
                  }}
                >
                  <Brain size={15} />
                  <span>
                    הנחיות מאמן ל-AI וזיכרון העדפות נלמד ({selectedTrainee.name})
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginBottom: 8,
                  }}
                >
                  כל מה שתכתוב כאן יוזרק אוטומטית לפרומפט כשמנוע ה-AI מציע למתאמן
                  ארוחות להשלמת היתרה (למשל: &quot;ללא גלוטן, להעדיף חלבון רזה בערב&quot;).
                </div>
                <Textarea
                  size="xs"
                  minRows={2}
                  placeholder="למשל: המתאמן רגיש לגלוטן, מעדיף ארוחות בוקר קלות או חזה עוף/טונה בערב..."
                  value={selectedTrainee.coachAiNotes || ''}
                  onChange={(e) => {
                    if (onUpdateAiNotesAndSplit) {
                      onUpdateAiNotesAndSplit(selectedTrainee.id, {
                        coachAiNotes: e.currentTarget.value,
                      });
                    }
                  }}
                />

                {/* הצגת כללי ההעדפות שה-AI למד מתגובות המתאמן */}
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    כללים שהמערכת למדה מתגובות המתאמן להצעות AI (
                    {(selectedTrainee.aiLearnedPreferences || []).length}):
                  </div>
                  {(selectedTrainee.aiLearnedPreferences || []).length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      טרם נלמדו כללים מתגובות המתאמן.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(selectedTrainee.aiLearnedPreferences || []).map(
                        (rule, idx) => (
                          <span
                            key={idx}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              borderRadius: 999,
                              background: 'rgba(210, 255, 40, 0.1)',
                              border: '1px solid rgba(210, 255, 40, 0.3)',
                              fontSize: 11,
                              color: 'var(--accent-volt)',
                              fontWeight: 700,
                            }}
                          >
                            <span>{rule}</span>
                            <button
                              type="button"
                              title="הסר כלל זה"
                              onClick={() => {
                                if (onUpdateAiNotesAndSplit) {
                                  const nextRules = (
                                    selectedTrainee.aiLearnedPreferences || []
                                  ).filter((_, i) => i !== idx);
                                  onUpdateAiNotesAndSplit(selectedTrainee.id, {
                                    aiLearnedPreferences: nextRules,
                                  });
                                }
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#ef4444',
                                cursor: 'pointer',
                                fontWeight: 800,
                                padding: 0,
                              }}
                            >
                              ×
                            </button>
                          </span>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* כרטיס צ'ק-אין שבועי אחרון של המתאמן + העתקת דו"ח לוואטסאפ */}
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: '#38bdf8',
                      }}
                    >
                      📋 צ׳ק-אין שבועי אחרון ודו״ח סיכום
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const lastChk =
                          selectedTrainee.weeklyCheckIns?.[
                            selectedTrainee.weeklyCheckIns.length - 1
                          ];
                        const lastM =
                          selectedTrainee.measurementsHistory?.[
                            selectedTrainee.measurementsHistory.length - 1
                          ];
                        const act = selectedTrainee.activityTargets || {
                          weeklyWorkoutsTarget: 4,
                          weeklyCardioTarget: 3,
                          dailySleepTargetHours: 7.5,
                        };
                        const allLogs = Object.values(
                          selectedTrainee.logs || {}
                        );
                        const workoutsDone = allLogs.filter(
                          (l) => l?.workoutLog?.completed
                        ).length;
                        const cardioDone = allLogs.filter(
                          (l) => l?.cardioLog?.completed
                        ).length;
                        const report = [
                          `📊 *דו"ח מתאמן SPOT - ${selectedTrainee.name}* (${today})`,
                          `• משקל נוכחי: ${selectedTrainee.currentWeight} ק"ג (יעד: ${selectedTrainee.targetWeight} ק"ג)`,
                          `• אימונים שתועדו: ${workoutsDone} (יעד שבועי: ${act.weeklyWorkoutsTarget})`,
                          `• הליכות/ריצות שתועדו: ${cardioDone} (יעד שבועי: ${act.weeklyCardioTarget})`,
                          lastM
                            ? `• היקפים: חזה ${lastM.chestCm || '—'} | בטן ${lastM.waistNavelCm || '—'} | זרוע ${lastM.armCm || '—'} | ירך ${lastM.thighCm || '—'} ס"מ`
                            : '',
                          lastChk
                            ? `• צ'ק-אין הרגשה (${lastChk.date}): אנרגיה ${lastChk.energyLevel}/5 | שובע ${lastChk.hungerLevel}/5 | שינה ${lastChk.sleepQuality}/5 ${lastChk.note ? `| "${lastChk.note}"` : ''}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join('\n');
                        if (
                          typeof navigator !== 'undefined' &&
                          navigator.clipboard
                        ) {
                          navigator.clipboard.writeText(report);
                          showToast('דו״ח הסיכום הועתק ללוח (מוכן לוואטסאפ)');
                        }
                      }}
                      className="btn-surface"
                      style={{
                        padding: '5px 10px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'var(--accent-volt)',
                      }}
                    >
                      העתק דו״ח לוואטסאפ
                    </button>
                  </div>

                  {(() => {
                    const lastChk =
                      selectedTrainee.weeklyCheckIns?.[
                        selectedTrainee.weeklyCheckIns.length - 1
                      ];
                    if (!lastChk) {
                      return (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'var(--text-muted)',
                            marginTop: 10,
                          }}
                        >
                          המתאמן טרם שלח צ׳ק-אין שבועי מהאפליקציה שלו.
                        </div>
                      );
                    }
                    return (
                      <div
                        style={{
                          fontSize: 12,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div>
                          <b>תאריך דיווח:</b> {lastChk.date} ·{' '}
                          <b>משקל בדיווח:</b> {lastChk.weightKg} ק״ג
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <span>
                            <b>אנרגיה:</b> {lastChk.energyLevel}/5
                          </span>
                          <span>
                            <b>שובע:</b> {lastChk.hungerLevel}/5
                          </span>
                          <span>
                            <b>איכות שינה:</b> {lastChk.sleepQuality}/5
                          </span>
                        </div>
                        {lastChk.note && (
                          <div
                            style={{
                              padding: '6px 10px',
                              borderRadius: 8,
                              background: 'rgba(255,255,255,0.04)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            &ldquo;{lastChk.note}&rdquo;
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 20,
            }}
          >
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
                  מאמן ראשי: {getCoachNameById(selectedTrainee.primaryCoachId)}
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

            {/* מתג בשליטת המאמן: האם לפתוח למתאמן פיצול לתפריט יום אימון / יום מנוחה */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                marginBottom: 14,
              }}
            >
              <Checkbox
                label="הפעל למתאמן זה תפריט נפרד ליום אימון וליום מנוחה (אם כבוי – למתאמן יוצג תפריט יומי אחיד ללא מתג אימון/מנוחה)"
                checked={Boolean(selectedTrainee.enableWorkoutRestSplit)}
                onChange={(e) => {
                  const nextSplit = e.currentTarget.checked;
                  if (onUpdateAiNotesAndSplit) {
                    onUpdateAiNotesAndSplit(selectedTrainee.id, {
                      enableWorkoutRestSplit: nextSplit,
                    });
                    if (!nextSplit) {
                      setEditingDayType('workout');
                    }
                    showToast(
                      nextSplit
                        ? 'נפתח למתאמן פיצול תפריט יום אימון / יום מנוחה'
                        : 'הוגדר תפריט יומי אחיד למתאמן (ללא פיצול אימון/מנוחה)'
                    );
                  }
                }}
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
              {Boolean(selectedTrainee.enableWorkoutRestSplit) ? (
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
              ) : (
                <div
                  style={{
                    flex: 1,
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    padding: '6px 0',
                  }}
                >
                  מצב פעיל: תפריט יומי אחיד לכל ימות השבוע
                </div>
              )}
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
                    selectedTrainee.enableWorkoutRestSplit
                      ? editingDayType
                      : 'workout',
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
                  <div style={{ marginTop: 8 }}>
                    <TextInput
                      size="xs"
                      label="אופציות ארוחה מומלצות למתאמן (מופרדות ב- | )"
                      placeholder="למשל: 2 ביצים + חצי קוטג' + 2 פרוסות לחם | יוגורט חלבון + בננה + 10 שקדים"
                      value={(meal.recommendedOptions || []).join(' | ')}
                      onChange={(e) =>
                        updateTraineeDirectMeal(
                          meal.id,
                          'recommendedOptions',
                          e.currentTarget.value
                        )
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
                  הפידבק יישלח חתום על שמך ({currentUser.name})
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
                        placeholder={`כתוב פידבק בשם ${currentUser.name}...`}
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
                            `הפידבק נשמר תחת השם "${currentUser.name}"`
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
        </div>
      )}

      {/* ===================================================================== */}
      {/* תצוגה 3: ספריית טמפלייטים דו-שכבתית (מערכתיים + אישיים של המאמן)     */}
      {/* ===================================================================== */}
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
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <Select
                label="בחר טמפלייט תזונה"
                w={320}
                value={selectedTemplateId}
                onChange={(val) => val && handleSelectTemplate(val)}
                data={templates.map((t) => {
                  const isGlobal =
                    !t.ownerCoachId || t.ownerCoachId === 'coach-admin';
                  return {
                    value: t.id,
                    label: `${isGlobal ? '👑 [מערכת]' : '🏋️ [אישי]'} ${
                      t.name
                    } (${t.meals.length} ארוחות)`,
                  };
                })}
              />

              <button
                onClick={handleCreateNewTemplate}
                className="btn-surface"
                style={{
                  padding: '9px 14px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                <span>+ טמפלייט חדש</span>
              </button>

              {!canEditCurrentTemplate && (
                <button
                  onClick={handleDuplicateTemplateToPersonal}
                  className="btn-volt"
                  style={{
                    padding: '9px 14px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <Copy size={14} />
                  <span>שכפל לטמפלייטים האישיים שלי לעריכה</span>
                </button>
              )}
            </div>

            {trainees.length > 0 && (
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
                      trainees.find((t) => t.id === assignTraineeId)?.name ||
                      '';
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
            )}
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
              disabled={!canEditCurrentTemplate}
              value={editableTemplate.name}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setEditableTemplate((prev) => ({ ...prev, name: val }));
              }}
            />
            <TextInput
              label="תיאור ודגשים"
              disabled={!canEditCurrentTemplate}
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
                  background: 'var(--bg-surface-2)',
                  padding: 14,
                  borderRadius: 14,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr auto',
                    gap: 10,
                    alignItems: 'flex-end',
                  }}
                >
                  <TextInput
                    label={`שם ארוחה #${index + 1}`}
                    disabled={!canEditCurrentTemplate}
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
                    disabled={!canEditCurrentTemplate}
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
                    disabled={!canEditCurrentTemplate}
                    value={meal.targets.calories}
                    min={0}
                    step={25}
                    onChange={(val) =>
                      updateTemplateMealField(meal.id, 'calories', val)
                    }
                  />
                  <NumberInput
                    label="חלבון (g)"
                    disabled={!canEditCurrentTemplate}
                    value={meal.targets.protein}
                    min={0}
                    onChange={(val) =>
                      updateTemplateMealField(meal.id, 'protein', val)
                    }
                  />
                  <NumberInput
                    label="פחמימות (g)"
                    disabled={!canEditCurrentTemplate}
                    value={meal.targets.carbs}
                    min={0}
                    onChange={(val) =>
                      updateTemplateMealField(meal.id, 'carbs', val)
                    }
                  />
                  <NumberInput
                    label="שומנים (g)"
                    disabled={!canEditCurrentTemplate}
                    value={meal.targets.fat}
                    min={0}
                    onChange={(val) =>
                      updateTemplateMealField(meal.id, 'fat', val)
                    }
                  />
                  <button
                    disabled={
                      !canEditCurrentTemplate ||
                      editableTemplate.meals.length <= 1
                    }
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

                <TextInput
                  size="xs"
                  disabled={!canEditCurrentTemplate}
                  label="אופציות ארוחה מומלצות למתאמן (מופרדות ב- | )"
                  placeholder="למשל: 2 ביצים + חצי קוטג' + 2 פרוסות לחם | יוגורט חלבון + בננה + 10 שקדים"
                  value={(meal.recommendedOptions || []).join(' | ')}
                  onChange={(e) =>
                    updateTemplateMealField(
                      meal.id,
                      'recommendedOptions',
                      e.currentTarget.value
                    )
                  }
                />
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
            {canEditCurrentTemplate ? (
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
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                זהו טמפלייט מערכתי של המנהל הראשי (לקריאה והקצאה). לעריכה לחץ על
                &ldquo;שכפל לטמפלייטים האישיים שלי&rdquo;.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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

              {canEditCurrentTemplate && (
                <>
                  {templates.length > 1 && (
                    <button
                      onClick={() => {
                        onDeleteTemplate(editableTemplate.id);
                        showToast('הטמפלייט נמחק');
                      }}
                      className="btn-surface"
                      style={{
                        padding: '10px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      מחק טמפלייט
                    </button>
                  )}
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
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* תצוגה 4: ניהול חשבונות מתאמנים ושיתוף בין מאמנים                      */}
      {/* ===================================================================== */}
      {activeSection === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
                  קוד ההזמנה האישי שלך למתאמנים ({coachInviteCode})
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  מתאמן שנרשם באפליקציה ומזין את הקוד שלך משויך אוטומטית אליך
                  ומופעל מיד
                </div>
              </div>

              {isSuperAdmin && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <TextInput
                    label="קוד מנהל ראשי"
                    value={inviteCodeDraft}
                    onChange={(e) => setInviteCodeDraft(e.currentTarget.value)}
                  />
                  <button
                    onClick={() => {
                      onUpdateCoachInviteCode(
                        inviteCodeDraft.trim().toUpperCase() || 'SPOT2026'
                      );
                      showToast('קוד ההזמנה עודכן');
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
              )}
            </div>
          </div>

          <div className="pro-card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '18px 22px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                ניהול חשבונות מתאמנים, סיסמאות ושיתוף מאמנים
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                רק המאמן הראשי של המתאמן (או המנהל הראשי) יכול להשהות, למחוק או
                לנהל את רשימת המאמנים השותפים שלו
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
                    <th style={{ padding: '14px 20px' }}>שם מתאמן</th>
                    <th style={{ padding: '14px 12px' }}>אימייל</th>
                    <th style={{ padding: '14px 12px' }}>מאמן ראשי ושותפים</th>
                    <th style={{ padding: '14px 12px' }}>סטטוס חשבון</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left' }}>
                      ניהול הרשאות
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trainees.map((t) => {
                    const isOwner = isOwnerOfTrainee(t);
                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <td style={{ padding: '14px 20px', fontWeight: 800 }}>
                          {t.name}
                        </td>
                        <td
                          className="num-mono"
                          style={{ padding: '14px 12px', fontSize: 13 }}
                        >
                          {t.email}
                        </td>
                        <td style={{ padding: '14px 12px', fontSize: 12 }}>
                          <div>
                            <b>ראשי:</b> {getCoachNameById(t.primaryCoachId)}
                          </div>
                          {(t.sharedCoachIds || []).length > 0 && (
                            <div style={{ color: 'var(--text-secondary)' }}>
                              <b>שותפים:</b>{' '}
                              {t.sharedCoachIds
                                .map((id) => getCoachNameById(id))
                                .join(', ')}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          {t.status === 'active' ? (
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
                              פעיל
                            </span>
                          ) : t.status === 'pending' ? (
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
                              ממתין לאישור
                            </span>
                          ) : (
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
                              מושהה
                            </span>
                          )}
                        </td>
                        <td
                          style={{ padding: '14px 20px', textAlign: 'left' }}
                        >
                          {isOwner ? (
                            <div
                              style={{
                                display: 'inline-flex',
                                gap: 6,
                                alignItems: 'center',
                              }}
                            >
                              <button
                                onClick={() => {
                                  setSharingModalTrainee(t);
                                  setSharingPrimaryId(
                                    t.primaryCoachId || 'coach-admin'
                                  );
                                  setSharingCollaboratorIds(
                                    t.sharedCoachIds || []
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
                                <Share2
                                  size={13}
                                  color="var(--accent-volt)"
                                />
                                <span>שתף מאמנים</span>
                              </button>

                              {t.status !== 'active' ? (
                                <button
                                  onClick={() => {
                                    onUpdateTraineeStatus(t.id, 'active');
                                    showToast(`הגישה של ${t.name} הופעלה`);
                                  }}
                                  className="btn-volt"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 11,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <PlayCircle size={13} />
                                  <span>הפעל</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    onUpdateTraineeStatus(t.id, 'paused');
                                    showToast(`המנוי של ${t.name} הושהה`);
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
                                  <PauseCircle size={13} />
                                  <span>השהה</span>
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setCredModalTrainee(t);
                                  setEditEmail(t.email);
                                  setEditPassword('');
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
                                <span>איפוס סיסמה</span>
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
                          ) : (
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--text-muted)',
                              }}
                            >
                              שותף בצוות (ניהול חשבון ע״י המאמן הראשי)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* תצוגה 5: ניהול מאמנים (Super Admin בלבד!)                              */}
      {/* ===================================================================== */}
      {activeSection === 'coaches' && isSuperAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            className="pro-card"
            style={{
              padding: '18px 22px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>
                ניהול מאמנים במערכת (הרשאת מנהל ראשי בלבד)
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                הוסף מאמנים חדשים, הגדר להם קוד הזמנה אישי, או השהה מאמן (במחיקת
                מאמן כל המתאמנים שלו עוברים אוטומטית אליך)
              </div>
            </div>

            <button
              onClick={() => {
                setCoachModalError(null);
                setNewCoachModal(true);
              }}
              className="btn-volt"
              style={{
                padding: '9px 18px',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
              }}
            >
              <UserPlus size={15} />
              <span>+ הוסף מאמן חדש</span>
            </button>
          </div>

          <div className="pro-card" style={{ overflow: 'hidden' }}>
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
                    <th style={{ padding: '14px 22px' }}>שם המאמן</th>
                    <th style={{ padding: '14px 14px' }}>אימייל כניסה</th>
                    <th style={{ padding: '14px 14px' }}>קוד הזמנה אישי</th>
                    <th style={{ padding: '14px 14px' }}>מתאמנים משויכים</th>
                    <th style={{ padding: '14px 14px' }}>סטטוס</th>
                    <th style={{ padding: '14px 22px', textAlign: 'left' }}>
                      פעולות מנהל ראשי
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {coaches.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: 30,
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: 13,
                        }}
                      >
                        טרם הוספת מאמנים נוספים למערכת. לחץ על &ldquo;+ הוסף
                        מאמן חדש&rdquo; למעלה.
                      </td>
                    </tr>
                  ) : (
                    coaches.map((c) => {
                      const primaryCount = trainees.filter(
                        (t) => t.primaryCoachId === c.id
                      ).length;
                      const sharedCount = trainees.filter((t) =>
                        (t.sharedCoachIds || []).includes(c.id)
                      ).length;

                      return (
                        <tr
                          key={c.id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle)',
                          }}
                        >
                          <td
                            style={{ padding: '14px 22px', fontWeight: 800 }}
                          >
                            {c.name}
                          </td>
                          <td
                            className="num-mono"
                            style={{ padding: '14px 14px', fontSize: 13 }}
                          >
                            {c.email}
                          </td>
                          <td style={{ padding: '14px 14px' }}>
                            <span
                              className="num-mono"
                              style={{
                                padding: '3px 10px',
                                borderRadius: 8,
                                background: 'rgba(210, 255, 40, 0.12)',
                                color: 'var(--accent-volt)',
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              {c.inviteCode}
                            </span>
                          </td>
                          <td style={{ padding: '14px 14px', fontSize: 12 }}>
                            <b>{primaryCount}</b> ראשיים · <b>{sharedCount}</b>{' '}
                            משותפים
                          </td>
                          <td style={{ padding: '14px 14px' }}>
                            {c.status === 'active' ? (
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
                                פעיל
                              </span>
                            ) : (
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
                                מושהה
                              </span>
                            )}
                          </td>
                          <td
                            style={{ padding: '14px 22px', textAlign: 'left' }}
                          >
                            <div style={{ display: 'inline-flex', gap: 6 }}>
                              {c.status === 'active' ? (
                                <button
                                  onClick={() => {
                                    onUpdateCoachStatus(c.id, 'paused');
                                    showToast(`חשבון המאמן ${c.name} הושהה`);
                                  }}
                                  className="btn-surface"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  השהה מאמן
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    onUpdateCoachStatus(c.id, 'active');
                                    showToast(`חשבון המאמן ${c.name} הופעל`);
                                  }}
                                  className="btn-volt"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 11,
                                    cursor: 'pointer',
                                  }}
                                >
                                  הפעל מאמן
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setCredModalCoach(c);
                                  setEditCoachEmail(c.email);
                                  setEditCoachInvite(c.inviteCode);
                                  setEditCoachPassword('');
                                }}
                                className="btn-surface"
                                style={{
                                  padding: '6px 10px',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                }}
                              >
                                סיסמה וקוד
                              </button>

                              <button
                                onClick={() => {
                                  onDeleteCoach(c.id);
                                  showToast(
                                    `המאמן ${c.name} הוסר וכל מתאמניו הועברו לבעלותך`
                                  );
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
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* מודאלים: מתאמן חדש, קבוצה חדשה, שיתוף מאמנים, ומאמן חדש              */}
      {/* ===================================================================== */}

      {/* מודאל פתיחת מתאמן חדש */}
      <Modal
        opened={newTraineeModal}
        onClose={() => setNewTraineeModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            פתיחת משתמש חדש למתאמן
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}
          >
            <TextInput
              label="טלפון"
              placeholder="054-0000000"
              value={newTraineePhone}
              onChange={(e) => setNewTraineePhone(e.currentTarget.value)}
            />
            <Select
              label="שיוך לקבוצה"
              placeholder="ללא קבוצה"
              value={newTraineeGroupId}
              onChange={(val) => setNewTraineeGroupId(val || '')}
              data={[
                { value: '', label: 'ללא קבוצה' },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          </div>

          {isSuperAdmin && (
            <Select
              label="מאמן ראשי אחראי למתאמן"
              value={newTraineeCoachId}
              onChange={(val) => val && setNewTraineeCoachId(val)}
              data={coachDirectory.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />
          )}

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
                primaryCoachId: isSuperAdmin
                  ? newTraineeCoachId
                  : currentUser.id,
                groupId: newTraineeGroupId || undefined,
              });
              setNewTraineeName('');
              setNewTraineeEmail('');
              setNewTraineePassword('123456');
              setNewTraineePhone('');
              setNewTraineeModal(false);
              showToast('חשבון המתאמן נוצר והופעל!');
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

      {/* מודאל שיתוף מתאמן בין מאמנים */}
      <Modal
        opened={Boolean(sharingModalTrainee)}
        onClose={() => setSharingModalTrainee(null)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            ניהול מאמנים והרשאות שיתוף — {sharingModalTrainee?.name}
          </span>
        }
        centered
        radius="lg"
      >
        {sharingModalTrainee && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {isSuperAdmin && (
              <Select
                label="מאמן ראשי של המתאמן (Owner)"
                description="המאמן הראשי יכול לשתף מאמנים נוספים ולנהל את סטטוס החשבון"
                value={sharingPrimaryId}
                onChange={(val) => {
                  if (val) {
                    setSharingPrimaryId(val);
                    setSharingCollaboratorIds((prev) =>
                      prev.filter((id) => id !== val)
                    );
                  }
                }}
                data={coachDirectory.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
            )}

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                מאמנים שותפים (Collaborators):
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginBottom: 10,
                }}
              >
                מאמן שותף יכול לערוך למתאמן תפריט, ארוחות ומאקרו ולכתוב לו
                פידבק ביומן, אך אינו יכול למחוק/להשהות אותו.
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  background: 'var(--bg-surface-2)',
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {coachDirectory.filter((c) => c.id !== sharingPrimaryId)
                  .length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    אין מאמנים פעילים נוספים במערכת לשיתוף כרגע.
                  </div>
                ) : (
                  coachDirectory
                    .filter((c) => c.id !== sharingPrimaryId)
                    .map((c) => {
                      const checked = sharingCollaboratorIds.includes(c.id);
                      return (
                        <Checkbox
                          key={c.id}
                          label={c.name}
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.currentTarget.checked;
                            setSharingCollaboratorIds((prev) =>
                              isChecked
                                ? [...prev, c.id]
                                : prev.filter((id) => id !== c.id)
                            );
                          }}
                        />
                      );
                    })
                )}
              </div>
            </div>

            <button
              onClick={() => {
                onUpdateTraineeSharing(
                  sharingModalTrainee.id,
                  sharingPrimaryId,
                  sharingCollaboratorIds
                );
                setSharingModalTrainee(null);
                showToast('הרשאות השיתוף של המתאמן עודכנו!');
              }}
              className="btn-volt"
              style={{
                padding: '10px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              שמור הגדרות שיתוף
            </button>
          </div>
        )}
      </Modal>

      {/* מודאל יצירת קבוצה חדשה */}
      <Modal
        opened={newGroupModal}
        onClose={() => setNewGroupModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            יצירת קבוצת מתאמנים חדשה
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextInput
            label="שם הקבוצה"
            placeholder="למשל: חיטוב קיץ, נבחרת בוקר, ליווי VIP..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.currentTarget.value)}
            required
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              צבע תגית הקבוצה
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {GROUP_COLOR_SWATCHES.map((sw) => (
                <button
                  key={sw.value}
                  type="button"
                  onClick={() => setNewGroupColor(sw.value)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: sw.value,
                    border:
                      newGroupColor === sw.value
                        ? '3px solid #ffffff'
                        : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <button
            disabled={!newGroupName.trim()}
            onClick={() => {
              onCreateGroup(newGroupName.trim(), newGroupColor);
              setNewGroupName('');
              setNewGroupModal(false);
              showToast('הקבוצה נוצרה בהצלחה');
            }}
            className="btn-volt"
            style={{
              padding: '10px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            צור קבוצה
          </button>
        </div>
      </Modal>

      {/* מודאל הוספת מאמן חדש (Super Admin בלבד) */}
      <Modal
        opened={newCoachModal}
        onClose={() => setNewCoachModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            הקמת מאמן חדש במערכת (מנהל ראשי בלבד)
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {coachModalError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.14)',
                color: '#f87171',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {coachModalError}
            </div>
          )}
          <TextInput
            label="שם מלא של המאמן"
            placeholder="למשל: דני כהן"
            value={newCoachName}
            onChange={(e) => setNewCoachName(e.currentTarget.value)}
            required
          />
          <TextInput
            label="אימייל כניסה למאמן"
            placeholder="dani@spot.co.il"
            value={newCoachEmail}
            onChange={(e) => setNewCoachEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="סיסמה ראשונית למאמן"
            value={newCoachPassword}
            onChange={(e) => setNewCoachPassword(e.currentTarget.value)}
            required
          />
          <TextInput
            label="טלפון"
            placeholder="052-0000000"
            value={newCoachPhone}
            onChange={(e) => setNewCoachPhone(e.currentTarget.value)}
          />
          <TextInput
            label="קוד הזמנה אישי וייחודי למתאמנים של מאמן זה"
            description="מתאמנים שיירשמו עם הקוד הזה ישויכו אוטומטית למאמן זה"
            placeholder="למשל: DANI10"
            value={newCoachInviteCode}
            onChange={(e) =>
              setNewCoachInviteCode(e.currentTarget.value.toUpperCase())
            }
            required
          />
          <button
            disabled={
              !newCoachName.trim() ||
              !newCoachEmail.trim() ||
              !newCoachInviteCode.trim()
            }
            onClick={async () => {
              setCoachModalError(null);
              const res = await onCreateCoach({
                name: newCoachName.trim(),
                email: newCoachEmail.trim().toLowerCase(),
                password: newCoachPassword.trim() || '123456',
                phone: newCoachPhone.trim(),
                inviteCode: newCoachInviteCode.trim().toUpperCase(),
              });
              if (res.error) {
                setCoachModalError(res.error);
                return;
              }
              setNewCoachName('');
              setNewCoachEmail('');
              setNewCoachPassword('123456');
              setNewCoachPhone('');
              setNewCoachInviteCode('');
              setNewCoachModal(false);
              showToast('חשבון המאמן נוצר בהצלחה!');
            }}
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '11px',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            צור מאמן חדש
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
            label="סיסמה חדשה (הזן סיסמה חדשה לאיפוס)"
            placeholder="הקלד סיסמה חדשה עבור המתאמן"
            value={editPassword}
            onChange={(e) => setEditPassword(e.currentTarget.value)}
          />
          <button
            onClick={() => {
              if (credModalTrainee && editEmail.trim()) {
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

      {/* מודאל עדכון סיסמה וקוד הזמנה למאמן (Super Admin בלבד) */}
      <Modal
        opened={Boolean(credModalCoach)}
        onClose={() => setCredModalCoach(null)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            עריכת פרטי מאמן — {credModalCoach?.name}
          </span>
        }
        centered
        radius="lg"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextInput
            label="אימייל כניסה של המאמן"
            value={editCoachEmail}
            onChange={(e) => setEditCoachEmail(e.currentTarget.value)}
          />
          <TextInput
            label="קוד הזמנה אישי למתאמנים"
            value={editCoachInvite}
            onChange={(e) =>
              setEditCoachInvite(e.currentTarget.value.toUpperCase())
            }
          />
          <TextInput
            label="סיסמה חדשה למאמן (אופציונלי)"
            placeholder="השאר ריק לשמירת הסיסמה הקיימת"
            value={editCoachPassword}
            onChange={(e) => setEditCoachPassword(e.currentTarget.value)}
          />
          <button
            onClick={() => {
              if (credModalCoach) {
                onUpdateCoachCredentials(
                  credModalCoach.id,
                  editCoachEmail.trim().toLowerCase(),
                  editCoachPassword.trim(),
                  editCoachInvite.trim().toUpperCase()
                );
                setCredModalCoach(null);
                showToast('פרטי המאמן עודכנו');
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
            שמור שינויים
          </button>
        </div>
      </Modal>
    </div>
  );
}
