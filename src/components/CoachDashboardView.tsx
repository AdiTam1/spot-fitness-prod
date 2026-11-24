'use client';

import React, { useState, useEffect } from 'react';
import { GlassDock } from './ui/GlassDock';
import { SegmentedPill } from './ui/SegmentedPill';
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
  Loader2,
  AlertTriangle,
  Search,
  MessageCircle,
  Bell,
  BellRing,
  Globe,
  LayoutGrid,
  Table2,
  CalendarRange,
  Ban,
  Lock,
  LogOut,
  Smartphone,
} from 'lucide-react';
import {
  AccountStatus,
  AppReleasePolicy,
  AuthSessionUser,
  CoachDirectoryItem,
  CoachProfile,
  CoachPushSubscriptionSettings,
  DayType,
  MealTemplateSlot,
  NutritionTemplate,
  QuickContextChip,
  ScraperSuiteReport,
  TraineeActiveDateRange,
  TraineeActivityTargets,
  TraineeCustomUnit,
  TraineeGroup,
  TraineeProfile,
  TraineeServingTool,
} from '@/types/nutrition';
import { computeAgeFromBirthDate } from '@/lib/dateUtils';
import { QuickChipsAdminPanel } from './QuickChipsAdminPanel';
import { CoachSavedMealsPanel } from './CoachSavedMealsPanel';
import { CLIENT_WEB_BUILD_ID } from '@/lib/webVersionGuard';
import { CoachPushModal } from './CoachPushModal';
import { CoachAlertSettingsModal } from './CoachAlertSettingsModal';
import { AdminScrapersPanel } from './AdminScrapersPanel';
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
  onUpdateCoachInviteCode: (newCode: string) => Promise<{ error?: string }> | void;
  onSaveTemplate: (template: NutritionTemplate) => Promise<{ error?: string }> | void;
  onDeleteTemplate: (templateId: string) => Promise<{ error?: string }> | void;
  onAssignTemplateToTrainee: (
    traineeId: string,
    dayType: DayType,
    template: NutritionTemplate
  ) => Promise<{ error?: string }> | void;
  onUpdateTraineePlan: (
    traineeId: string,
    dayType: DayType,
    updatedTemplate: NutritionTemplate,
    tolerancePercent: number
  ) => Promise<{ error?: string }> | void;
  onAddCoachFeedback: (
    traineeId: string,
    date: string,
    mealSlotId: string,
    feedback: string
  ) => Promise<{ error?: string }> | void;
  onAddTrainee: (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    goal: string;
    templateId: string;
    primaryCoachId?: string;
    groupId?: string;
  }) => Promise<{ error?: string }> | void;
  onUpdateTraineeStatus: (
    traineeId: string,
    status: AccountStatus,
    primaryCoachId?: string
  ) => Promise<{ error?: string }> | void;
  onUpdateTraineeCredentials: (
    traineeId: string,
    email: string,
    password: string
  ) => Promise<{ error?: string }> | void;
  onUpdateTraineeSharing: (
    traineeId: string,
    primaryCoachId: string,
    sharedCoachIds: string[]
  ) => Promise<{ error?: string }> | void;
  onUpdateTraineeGroup: (traineeId: string, groupId?: string) => Promise<{ error?: string }> | void;
  onCreateGroup: (name: string, color: string) => Promise<{ error?: string }> | void;
  onDeleteGroup: (groupId: string) => Promise<{ error?: string }> | void;
  onBulkGroupAssignTemplate: (
    groupId: string,
    templateId: string,
    dayType: DayType
  ) => Promise<{ error?: string }> | void;
  onBulkGroupShareCoach: (groupId: string, targetCoachId: string) => Promise<{ error?: string }> | void;
  onManageObservationDays: (
    traineeId: string,
    payload: {
      toggleDate?: string;
      addFutureDays?: number;
      clearAll?: boolean;
      toggleBlockedDate?: string;
      addBlockedFutureDays?: number;
      clearBlockedAll?: boolean;
      restrictToObservationDaysWhenTodayIsObservation?: boolean;
      countObservationInStats?: boolean;
      activeDateRange?: TraineeActiveDateRange;
    }
  ) => Promise<{ error?: string }> | void;
  onUpdateActivityTargets: (
    traineeId: string,
    activityTargets: TraineeActivityTargets
  ) => Promise<{ error?: string }> | void;
  onUpdateAiNotesAndSplit?: (
    traineeId: string,
    payload: {
      enableWorkoutRestSplit?: boolean;
      coachAiNotes?: string;
      aiLearnedPreferences?: string[];
    }
  ) => Promise<{ error?: string }> | void;
  onOpenCoachOnboarding?: () => void;
  onDeleteTrainee: (traineeId: string) => Promise<{ error?: string }> | void;
  onForceLogoutTrainee?: (traineeId: string) => Promise<{ error?: string }> | void;
  onCreateCoach: (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    inviteCode: string;
  }) => Promise<{ error?: string }>;
  onUpdateCoachStatus: (coachId: string, status: 'active' | 'paused') => Promise<{ error?: string }> | void;
  onForceLogoutCoach?: (coachId: string) => Promise<{ error?: string }> | void;
  onUpdateCoachCredentials: (
    coachId: string,
    email: string,
    password: string,
    inviteCode: string
  ) => Promise<{ error?: string }> | void;
  onDeleteCoach: (coachId: string) => Promise<{ error?: string }> | void;
  appReleasePolicy?: AppReleasePolicy;
  onUpdateAppPolicy?: (policy: AppReleasePolicy) => Promise<{ error?: string }> | void;
  onPreviewTraineeMobile: (traineeId: string) => void;
  globalQuickChips?: QuickContextChip[];
  onManageToolsAndUnits?: (
    traineeId: string,
    payload: {
      customServingTools?: TraineeServingTool[];
      customFoodUnits?: TraineeCustomUnit[];
    }
  ) => Promise<{ error?: string }>;
  onManageQuickChips?: (payload: {
    scope: 'user' | 'group' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
  onReplySavedMeal?: (
    traineeId: string,
    payload: { presetId: string; reply: string; promoteToSlotId?: string }
  ) => Promise<{ error?: string }>;
  onRefreshData?: () => Promise<void> | void;
  coachPushSettings?: CoachPushSubscriptionSettings | null;
  onCoachPushSettingsUpdated?: (next: CoachPushSubscriptionSettings) => void;
  externalInspectTraineeRequest?: {
    traineeId: string;
    nonce: number;
  } | null;
  externalOpenCoachAlertsNonce?: number;
}

const GROUP_COLOR_SWATCHES = [
  { label: 'ספוט כתום', value: '#d67d09' },
  { label: 'כחול חלבון', value: '#38bdf8' },
  { label: 'ורוד פחמימה', value: '#ff5e7e' },
  { label: 'כתום שומן', value: '#ff8c1a' },
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
  onForceLogoutTrainee,
  onCreateCoach,
  onUpdateCoachStatus,
  onForceLogoutCoach,
  onUpdateCoachCredentials,
  onDeleteCoach,
  appReleasePolicy,
  onUpdateAppPolicy,
  onPreviewTraineeMobile,
  globalQuickChips = [],
  onManageToolsAndUnits,
  onManageQuickChips,
  onReplySavedMeal,
  onRefreshData,
  coachPushSettings = null,
  onCoachPushSettingsUpdated,
  externalInspectTraineeRequest,
  externalOpenCoachAlertsNonce = 0,
}: CoachDashboardViewProps) {
  const today = getTodayIso();
  const isSuperAdmin = currentUser.role === 'admin';
  const totalPendingMealQuestions = trainees.reduce(
    (sum, tr) =>
      sum +
      (tr.savedMeals || []).filter((m) => m.coachQuestion?.status === 'pending')
        .length,
    0
  );

  const [activeSection, setActiveSection] = useState<
    'roster' | 'templates' | 'inspector' | 'users' | 'coaches' | 'scrapers'
  >('roster');

  const [scraperReport, setScraperReport] = useState<ScraperSuiteReport | null>(
    null
  );
  const [scraperLoading, setScraperLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    let cancelled = false;
    setScraperLoading(true);
    fetch('/api/admin/scrapers?autoCheck=1', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.report) return;
        setScraperReport(data.report as ScraperSuiteReport);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setScraperLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [selectedCoachFilter, setSelectedCoachFilter] = useState<string>('all');
  const [rosterSearchQuery, setRosterSearchQuery] = useState<string>('');

  const [selectedTraineeId, setSelectedTraineeId] = useState<string>(
    trainees[0]?.id || ''
  );
  const [coachAlertsModalOpen, setCoachAlertsModalOpen] = useState(false);

  const [policyBlockedUpTo, setPolicyBlockedUpTo] = useState<number>(
    appReleasePolicy?.androidBlockedUpToVersionCode ?? 0
  );
  const [policyLatestCode, setPolicyLatestCode] = useState<string>(
    appReleasePolicy?.androidLatestVersionCode
      ? String(appReleasePolicy.androidLatestVersionCode)
      : ''
  );
  const [policyLatestName, setPolicyLatestName] = useState<string>(
    appReleasePolicy?.androidLatestVersionName || ''
  );
  const [policyApkUrl, setPolicyApkUrl] = useState<string>(
    appReleasePolicy?.androidApkDownloadUrl || ''
  );
  const [policyReleaseNotes, setPolicyReleaseNotes] = useState<string>(
    appReleasePolicy?.androidReleaseNotes || ''
  );

  useEffect(() => {
    if (!appReleasePolicy) return;
    setPolicyBlockedUpTo(appReleasePolicy.androidBlockedUpToVersionCode ?? 0);
    setPolicyLatestCode(
      appReleasePolicy.androidLatestVersionCode
        ? String(appReleasePolicy.androidLatestVersionCode)
        : ''
    );
    setPolicyLatestName(appReleasePolicy.androidLatestVersionName || '');
    setPolicyApkUrl(appReleasePolicy.androidApkDownloadUrl || '');
    setPolicyReleaseNotes(appReleasePolicy.androidReleaseNotes || '');
  }, [appReleasePolicy]);

  const formatLiveActivityBadge = (lastSeenAt?: string) => {
    if (!lastSeenAt) return null;
    const ts = Date.parse(lastSeenAt);
    if (!Number.isFinite(ts)) return null;
    const diffMs = Date.now() - ts;
    if (diffMs < 75_000) {
      return { label: 'מחובר כעת', isOnline: true };
    }
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 60) return { label: `נראה לפני ${mins} דק׳`, isOnline: false };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { label: `נראה לפני ${hrs} שע׳`, isOnline: false };
    const days = Math.floor(hrs / 24);
    return { label: `נראה לפני ${days} ימים`, isOnline: false };
  };

  useEffect(() => {
    if (!externalInspectTraineeRequest?.traineeId) return;
    setSelectedTraineeId(externalInspectTraineeRequest.traineeId);
    setActiveSection('inspector');
  }, [externalInspectTraineeRequest]);

  useEffect(() => {
    if (externalOpenCoachAlertsNonce > 0) {
      setCoachAlertsModalOpen(true);
    }
  }, [externalOpenCoachAlertsNonce]);

  const followedTraineesCount = coachPushSettings
    ? trainees.filter(
        (t) =>
          (coachPushSettings.traineeIds || []).includes(t.id) ||
          Boolean(
            t.groupId && (coachPushSettings.groupIds || []).includes(t.groupId)
          )
      ).length
    : 0;
  const coachAlertsDeviceReady = Boolean(
    coachPushSettings?.enabled !== false &&
      ((coachPushSettings?.webPushSubscriptions?.length || 0) +
        (coachPushSettings?.fcmTokens?.length || 0) >
        0) &&
      followedTraineesCount > 0
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
  // מודאל שליחת התראת פוש אישית למתאמן (נשמר לפי ID כדי להסתנכרן עם רענון הנתונים)
  const [pushModalTraineeId, setPushModalTraineeId] = useState<string | null>(
    null
  );
  const pushModalTrainee = pushModalTraineeId
    ? trainees.find((tr) => tr.id === pushModalTraineeId) || null
    : null;
  const openPushModalForTrainee = (traineeId: string) => {
    setPushModalTraineeId(traineeId);
    void onRefreshData?.();
  };
  const [sharingPrimaryId, setSharingPrimaryId] =
    useState<string>('coach-admin');
  const [sharingCollaboratorIds, setSharingCollaboratorIds] = useState<
    string[]
  >([]);

  // מודאל יצירת קבוצה חדשה
  const [newGroupModal, setNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState('#d67d09');

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
  const [customObsDays, setCustomObsDays] = useState<number>(5);
  const [customBlockDateInput, setCustomBlockDateInput] = useState<string>(() =>
    getTodayIso()
  );
  const [rosterViewMode, setRosterViewMode] = useState<'cards' | 'table'>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'cards' : 'table'
  );
  const [rosterViewPinned, setRosterViewPinned] = useState(false);
  const [tplScope, setTplScope] = useState<'all' | 'system' | 'mine'>('all');

  useEffect(() => {
    if (typeof window === 'undefined' || rosterViewPinned) return;
    const syncViewport = () => {
      setRosterViewMode(window.innerWidth < 768 ? 'cards' : 'table');
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, [rosterViewPinned]);

  const [activePastDraft, setActivePastDraft] = useState<number>(
    selectedTrainee?.activeDateRange?.pastDays ?? 1
  );
  const [activeFutureDraft, setActiveFutureDraft] = useState<number>(
    selectedTrainee?.activeDateRange?.futureDays ?? 0
  );

  useEffect(() => {
    setActivePastDraft(selectedTrainee?.activeDateRange?.pastDays ?? 1);
    setActiveFutureDraft(selectedTrainee?.activeDateRange?.futureDays ?? 0);
  }, [
    selectedTrainee?.id,
    selectedTrainee?.activeDateRange?.pastDays,
    selectedTrainee?.activeDateRange?.futureDays,
  ]);

  // אישור מתאמן Pending עם בחירת מאמן משויך
  const [pendingAssignCoachMap, setPendingAssignCoachMap] = useState<
    Record<string, string>
  >({});

  const [inviteCodeDraft, setInviteCodeDraft] = useState(coachInviteCode);
  const [customWorkoutTypeInput, setCustomWorkoutTypeInput] = useState('');

  // סנכרון אוטומטי אם נתוני השרת (קוד הזמנה, טמפלייטים, מתאמנים) משתנים או נמחקים
  useEffect(() => {
    setInviteCodeDraft(coachInviteCode);
  }, [coachInviteCode]);

  useEffect(() => {
    const found = templates.find((t) => t.id === selectedTemplateId);
    if (!found && templates.length > 0) {
      setSelectedTemplateId(templates[0].id);
      setEditableTemplate(JSON.parse(JSON.stringify(templates[0])));
    }
  }, [templates, selectedTemplateId]);

  useEffect(() => {
    if (
      trainees.length > 0 &&
      !trainees.some((t) => t.id === assignTraineeId)
    ) {
      setAssignTraineeId(trainees[0].id);
    }
  }, [trainees, assignTraineeId]);

  const pendingTrainees = trainees.filter((t) => t.status === 'pending');

  const [toastIsError, setToastIsError] = useState(false);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, isError = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastIsError(isError);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 3500);
  };

  // מנגנון מניעת לחיצה כפולה + מצב טעינה לכל פעולה אסינכרונית (מזוהה לפי מפתח)
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busyRef = React.useRef<string | null>(null);
  const isBusy = (key: string) => busyKey === key;

  const runBusy = async (
    key: string,
    action: () => unknown,
    successMsg?: string
  ): Promise<boolean> => {
    if (busyRef.current) return false; // נעילה סינכרונית – חוסם לחיצה כפולה מיידית
    busyRef.current = key;
    setBusyKey(key);
    try {
      const result = (await action()) as { error?: string } | undefined;
      if (result && typeof result === 'object' && result.error) {
        showToast(result.error, true);
        return false;
      }
      if (successMsg) showToast(successMsg);
      return true;
    } catch {
      showToast('הפעולה נכשלה – בדוק את החיבור לאינטרנט ונסה שוב', true);
      return false;
    } finally {
      busyRef.current = null;
      setBusyKey(null);
    }
  };

  const confirmDanger = (message: string) =>
    typeof window === 'undefined' ? false : window.confirm(message);

  const BusyIcon = ({ size = 14 }: { size?: number }) => (
    <Loader2 size={size} className="spot-spinner" />
  );

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
    runBusy(
      'create-tpl',
      async () => {
        const res = await onSaveTemplate(newTpl);
        if (res && typeof res === 'object' && res.error) return res;
        setSelectedTemplateId(newTpl.id);
        setEditableTemplate(JSON.parse(JSON.stringify(newTpl)));
        return undefined;
      },
      'נוצר טמפלייט חדש בבעלותך'
    );
  };

  const handleDuplicateTemplateToPersonal = () => {
    const cloned: NutritionTemplate = {
      ...JSON.parse(JSON.stringify(editableTemplate)),
      id: `tpl-${Date.now()}`,
      name: `${editableTemplate.name} (עותק של ${currentUser.name})`,
      ownerCoachId: currentUser.id,
    };
    runBusy(
      'dup-tpl',
      async () => {
        const res = await onSaveTemplate(cloned);
        if (res && typeof res === 'object' && res.error) return res;
        setSelectedTemplateId(cloned.id);
        setEditableTemplate(cloned);
        return undefined;
      },
      'הטמפלייט שוכפל לספרייה האישית שלך וכעת ניתן לעריכה מלאה'
    );
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

    if (rosterSearchQuery.trim()) {
      const q = rosterSearchQuery.trim().toLowerCase();
      const hit =
        t.name.toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q);
      if (!hit) return false;
    }

    return true;
  });

  const activeGroupObj = groups.find((g) => g.id === selectedGroupFilter);

  return (
    <div className="coach-dashboard-root" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* תור אישור מתאמנים שנרשמו ללא קוד מאמן (גלוי למנהל הראשי בלבד) — design: AdminApprovals */}
      {pendingTrainees.length > 0 && (
        <section aria-label="ממתינים לאישור" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>ממתינים לאישור</h2>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              נרשמו ללא קוד מאמן · <bdi className="ltr-num">{pendingTrainees.length}</bdi>
            </span>
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
            בחר לאיזה מאמן לשייך כל מתאמן ולחץ על אישור כדי לפתוח לו גישה.
          </span>
          {pendingTrainees.map((p) => {
            const targetCoach = pendingAssignCoachMap[p.id] || p.primaryCoachId || 'coach-admin';
            const initials = p.name
              .trim()
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .slice(0, 2);
            return (
              <article
                key={p.id}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 24,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 999,
                      background: 'var(--surface-3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      flex: 'none',
                    }}
                  >
                    {initials}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{p.name}</span>
                    <bdi dir="ltr" style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'start', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.email}
                    </bdi>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                  {isSuperAdmin && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Select
                        aria-label="שיוך למאמן"
                        value={targetCoach}
                        onChange={(val) =>
                          val && setPendingAssignCoachMap((prev) => ({ ...prev, [p.id]: val }))
                        }
                        data={coachDirectory.map((c) => ({ value: c.id, label: `מאמן: ${c.name}` }))}
                        allowDeselect={false}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={isBusy(`approve-${p.id}`)}
                    onClick={() =>
                      runBusy(
                        `approve-${p.id}`,
                        () => onUpdateTraineeStatus(p.id, 'active', targetCoach),
                        `${p.name} אושר ושויך למאמן ${getCoachNameById(targetCoach)}!`
                      )
                    }
                    className="btn-volt"
                    style={{
                      height: 52,
                      padding: '0 18px',
                      fontSize: 14,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      flex: isSuperAdmin ? 'none' : 1,
                    }}
                  >
                    {isBusy(`approve-${p.id}`) ? <BusyIcon size={15} /> : <Check size={15} />}
                    <span>{isBusy(`approve-${p.id}`) ? 'מאשר...' : 'אשר ושייך'}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* סרגל ניווט ראשי של הדשבורד */}
      <div
        className="pro-card coach-nav-card"
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
          className="coach-nav-tabs"
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
              label: `תוכנית ויומן (${selectedTrainee?.name || 'ללא מתאמן'})${
                totalPendingMealQuestions > 0
                  ? ` · 💬 ${totalPendingMealQuestions}`
                  : ''
              }`,
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
            {
              id: 'scrapers',
              label: scraperReport
                ? scraperReport.totalBroken > 0
                  ? `סקרייפרים (⚠️ ${scraperReport.totalBroken} שבור)`
                  : `סקרייפרים ומאגר (${scraperReport.totalHealthy}/${scraperReport.results.length} תקין)`
                : scraperLoading
                  ? 'בודק סקרייפרים...'
                  : 'סקרייפרים ורשתות שיווק',
              icon: Globe,
              show: isSuperAdmin, // בדיקה אוטומטית אצל מנהל המערכת!
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
                        | 'scrapers'
                    )
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 15px',
                    borderRadius: 12,
                    border: active ? '1px solid var(--sel-bg)'
                      : '1px solid transparent',
                    background: active ? 'var(--sel-bg)'
                      : 'transparent',
                    color: active ? 'var(--sel-text)'
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

        <div className="coach-nav-tabs" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setCoachAlertsModalOpen(true)}
            className="btn-surface"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '9px 14px',
              fontSize: 12,
              cursor: 'pointer',
              borderColor: coachAlertsDeviceReady
                ? 'var(--surface-2)'
                : undefined,
            }}
          >
            <BellRing
              size={14}
              color={
                coachAlertsDeviceReady
                  ? 'var(--accent-volt)'
                  : 'var(--text-secondary)'
              }
            />
            <span>
              התראות בזמן אמת
              {followedTraineesCount > 0 ? ` (${followedTraineesCount})` : ''}
            </span>
          </button>

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
              <Sliders size={14} />
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
            <FolderPlus size={15} color="currentColor" />
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

      {/* Mobile-only floating coach dock (desktop keeps the top navigation) */}
      <div className="only-mobile">
        <GlassDock
          ariaLabel="ניווט מאמן"
          tabs={[
            { id: 'roster', label: 'מתאמנים', icon: <Users size={22} strokeWidth={1.8} /> },
            { id: 'templates', label: 'טמפלייטים', icon: <LayoutTemplate size={22} strokeWidth={1.8} /> },
            { id: 'users', label: 'חשבונות', icon: <ShieldCheck size={22} strokeWidth={1.8} /> },
          ]}
          active={activeSection}
          onChange={(id) => setActiveSection(id as 'roster' | 'templates' | 'users')}
          action={{
            label: 'מתאמן חדש',
            icon: <UserPlus size={26} strokeWidth={2.2} />,
            onClick: () => setNewTraineeModal(true),
          }}
        />
      </div>

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 400,
            maxWidth: 'calc(100% - 32px)',
            padding: '12px 18px',
            borderRadius: 14,
            background: 'var(--card)',
            border: toastIsError
              ? '1px solid rgba(239, 68, 68, 0.55)'
              : '1px solid var(--line-2)',
            color: toastIsError ? 'var(--status-danger)' : 'var(--text)',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--glass-shadow)',
          }}
        >
          {toastIsError ? <AlertTriangle size={16} /> : <Check size={16} />}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* תצוגה 1: מצבת מתאמנים, סינון לפי קבוצות ופעולות קבוצתיות              */}
      {/* ===================================================================== */}
      {activeSection === 'roster' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* סרגל סינון קבוצות מתאמנים + סינון לפי מאמן (למנהל ראשי) */}
          <header style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
              שלום, {currentUser.name.trim().split(/\s+/)[0]}
            </span>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>המתאמנים שלי</h1>
          </header>
          <div
            className="pro-card coach-filter-card"
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
              className="coach-filter-groups"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="only-desktop"
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
                    selectedGroupFilter === 'all' ? '1px solid var(--sel-bg)'
                      : '1px solid var(--line-2)',
                  background:
                    selectedGroupFilter === 'all' ? 'var(--sel-bg)'
                      : 'transparent',
                  color:
                    selectedGroupFilter === 'all' ? 'var(--sel-text)'
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
                        : '1px solid var(--line-2)',
                      background: active
                        ? 'var(--line)'
                        : 'transparent',
                      color: active ? 'var(--text)' : 'var(--text-secondary)',
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
                    selectedGroupFilter === 'unassigned' ? '1px solid var(--sel-bg)'
                      : '1px solid var(--line-2)',
                  background:
                    selectedGroupFilter === 'unassigned' ? 'var(--sel-bg)'
                      : 'transparent',
                  color:
                    selectedGroupFilter === 'unassigned' ? 'var(--sel-text)'
                      : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ללא קבוצה ({trainees.filter((t) => !t.groupId).length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextInput
                size="xs"
                w={195}
                placeholder="חיפוש לפי שם / אימייל / טלפון..."
                leftSection={<Search size={13} />}
                value={rosterSearchQuery}
                onChange={(e) => setRosterSearchQuery(e.currentTarget.value)}
              />

              {isSuperAdmin && coachDirectory.length > 1 && (
                <Select
                  size="xs"
                  w={185}
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
          </div>

          {/* סרגל פעולות קבוצתיות (מופיע כשנבחרה קבוצה ספציפית) */}
          {activeGroupObj && (
            <div
              className="pro-card"
              style={{
                padding: '14px 18px',
                borderColor: activeGroupObj.color,
                background: 'var(--fill-1)',
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
                    style={{ fontSize: 12, color: 'var(--text-secondary)' }}
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
                  disabled={isBusy('bulk-assign')}
                  onClick={() =>
                    runBusy(
                      'bulk-assign',
                      () =>
                        onBulkGroupAssignTemplate(
                          activeGroupObj.id,
                          bulkTplId,
                          bulkDayType
                        ),
                      `הטמפלייט הוחל בהצלחה על כל מתאמני קבוצת "${activeGroupObj.name}"!`
                    )
                  }
                  className="btn-volt"
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isBusy('bulk-assign') && <BusyIcon size={13} />}
                  <span>
                    {isBusy('bulk-assign') ? 'מחיל...' : 'החל טמפלייט לקבוצה'}
                  </span>
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
                      disabled={!bulkShareCoachId || isBusy('bulk-share')}
                      onClick={() => {
                        if (!bulkShareCoachId) return;
                        runBusy(
                          'bulk-share',
                          () =>
                            onBulkGroupShareCoach(
                              activeGroupObj.id,
                              bulkShareCoachId
                            ),
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
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isBusy('bulk-share') && <BusyIcon size={13} />}
                      <span>
                        {isBusy('bulk-share') ? 'משתף...' : 'שתף קבוצה'}
                      </span>
                    </button>
                  </>
                )}

                {(isSuperAdmin ||
                  activeGroupObj.ownerCoachId === currentUser.id) && (
                  <button
                    title="מחק קבוצה (המתאמנים לא יימחקו)"
                    disabled={isBusy(`del-group-${activeGroupObj.id}`)}
                    onClick={async () => {
                      if (
                        !confirmDanger(
                          `למחוק את הקבוצה "${activeGroupObj.name}"? המתאמנים שבקבוצה יישארו במערכת.`
                        )
                      ) {
                        return;
                      }
                      const ok = await runBusy(
                        `del-group-${activeGroupObj.id}`,
                        () => onDeleteGroup(activeGroupObj.id),
                        `הקבוצה "${activeGroupObj.name}" הוסרה`
                      );
                      if (ok) setSelectedGroupFilter('all');
                    }}
                    className="btn-surface"
                    style={{
                      padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {isBusy(`del-group-${activeGroupObj.id}`) ? (
                      <BusyIcon size={14} />
                    ) : (
                      <Trash2 size={14} color="#ef4444" />
                    )}
                  </button>
                )}
              </div>

              <div style={{ width: '100%', marginTop: 10 }}>
                <QuickChipsAdminPanel
                  scope="group"
                  groupId={activeGroupObj.id}
                  title={`צ׳יפים מהירים לקבוצת "${activeGroupObj.name}"`}
                  subtitle="הוסף צ׳יפים קבוצתיים (רטבים/כמויות/הרגלי בישול) שיוצגו בקליק אחד לכל מתאמני הקבוצה במסך זיהוי ה-AI."
                  chips={activeGroupObj.customQuickChips || []}
                  onManageQuickChips={onManageQuickChips}
                />
              </div>
            </div>
          )}

          {/* סרגל החלפת תצוגה כרטיסיות / טבלה (ברירת מחדל כרטיסיות במובייל) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              gap: 8,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
              {filteredTrainees.length} מתאמנים מוצגים
            </span>
            <div
              style={{
                display: 'inline-flex',
                background: 'var(--bg-surface-2)',
                border: '1px solid var(--line-2)',
                borderRadius: 10,
                padding: 3,
                gap: 2,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setRosterViewMode('cards');
                  setRosterViewPinned(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 9px',
                  borderRadius: 7,
                  border: 'none',
                  background:
                    rosterViewMode === 'cards' ? 'var(--sel-bg)' : 'transparent',
                  color:
                    rosterViewMode === 'cards' ? 'var(--sel-text)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <LayoutGrid size={12} />
                <span>כרטיסיות</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRosterViewMode('table');
                  setRosterViewPinned(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '5px 9px',
                  borderRadius: 7,
                  border: 'none',
                  background:
                    rosterViewMode === 'table' ? 'var(--sel-bg)' : 'transparent',
                  color:
                    rosterViewMode === 'table' ? 'var(--sel-text)' : 'var(--text-secondary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <Table2 size={12} />
                <span>טבלה</span>
              </button>
            </div>
          </div>

          {rosterViewMode === 'cards' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                gap: 12,
              }}
            >
              {filteredTrainees.length === 0 ? (
                <div
                  className="pro-card"
                  style={{
                    padding: 28,
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}
                >
                  אין מתאמנים בקטגוריה זו כרגע. לחץ על &ldquo;+ מתאמן חדש&rdquo; למעלה כדי להוסיף.
                </div>
              ) : (
                filteredTrainees.map((t) => {
                  const st = getTraineeStatus(t);
                  const calPct = Math.min(
                    100,
                    Math.round(
                      (st.consumed.calories / Math.max(1, st.target.calories)) * 100
                    )
                  );
                  const isOwner = isOwnerOfTrainee(t);
                  const groupObj = groups.find((g) => g.id === t.groupId);
                  const pendingQ = (t.savedMeals || []).filter(
                    (m) => m.coachQuestion?.status === 'pending'
                  ).length;

                  const iconBtn: React.CSSProperties = {
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flex: 'none',
                  };
                  const pushReady =
                    (t.fcmTokens?.length || 0) + (t.webPushSubscriptions?.length || 0) > 0;
                  return (
                    <article
                      key={t.id}
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        borderRadius: 28,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        boxShadow: 'var(--card-shadow)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span
                          aria-hidden
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 999,
                            background: 'var(--surface-3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 15,
                            flex: 'none',
                          }}
                        >
                          {t.avatar}
                        </span>
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {t.name}
                          </span>
                          <span style={{ fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {groupObj ? groupObj.name : 'ללא קבוצה'}
                            {groupObj ? ` · ראשי: ${getCoachNameById(t.primaryCoachId)}` : ''}
                          </span>
                        </span>
                        {pendingQ > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTraineeId(t.id);
                              setActiveSection('inspector');
                            }}
                            aria-label={`${pendingQ} שאלות ממתינות`}
                            style={{
                              height: 28,
                              padding: '0 10px',
                              borderRadius: 999,
                              background: 'var(--accent)',
                              color: 'var(--on-accent)',
                              border: 'none',
                              fontFamily: 'inherit',
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              cursor: 'pointer',
                              flex: 'none',
                            }}
                          >
                            <MessageCircle size={12} />
                            <bdi className="ltr-num">{pendingQ}</bdi> שאלות
                          </button>
                        ) : (
                          <span
                            style={{
                              height: 26,
                              padding: '0 10px',
                              borderRadius: 999,
                              background: 'var(--surface-2)',
                              color: st.statusColor,
                              fontSize: 12,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              whiteSpace: 'nowrap',
                              flex: 'none',
                            }}
                          >
                            {st.label} (<bdi className="ltr-num">{st.loggedMealsCount}/{st.totalMeals}</bdi>)
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, color: 'var(--text-2)' }}>
                          <span>ביצוע היום</span>
                          <span>
                            <bdi dir="ltr" className="num-mono ltr-num" style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {st.consumed.calories}
                            </bdi>{' '}
                            /{' '}
                            <bdi dir="ltr" className="num-mono ltr-num">{st.target.calories}</bdi> קק״ל ·{' '}
                            <span style={{ color: 'var(--macro-protein)' }}>
                              ח׳ <bdi dir="ltr" className="num-mono ltr-num">{st.consumed.protein}</bdi>
                            </span>
                          </span>
                        </div>
                        <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${calPct}%`, background: 'var(--accent)', borderRadius: 999 }} />
                        </div>
                      </div>

                      <Select
                        aria-label="קבוצה"
                        placeholder="ללא קבוצה"
                        value={t.groupId || ''}
                        allowDeselect={false}
                        onChange={(val) => onUpdateTraineeGroup(t.id, val ? val : undefined)}
                        data={[{ value: '', label: 'ללא קבוצה' }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
                      />

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {isOwner && (
                          <button
                            type="button"
                            className="glass"
                            aria-label="שתף מתאמן עם מאמנים נוספים"
                            onClick={() => {
                              setSharingModalTrainee(t);
                              setSharingPrimaryId(t.primaryCoachId || 'coach-admin');
                              setSharingCollaboratorIds(t.sharedCoachIds || []);
                            }}
                            style={iconBtn}
                          >
                            <Share2 size={18} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="glass"
                          aria-label="תצוגת מובייל של המתאמן"
                          onClick={() => onPreviewTraineeMobile(t.id)}
                          style={iconBtn}
                        >
                          <ArrowUpLeft size={18} />
                        </button>
                        <button
                          type="button"
                          className="glass"
                          aria-label="שלח פוש אישי למתאמן"
                          onClick={() => openPushModalForTrainee(t.id)}
                          style={{ ...iconBtn, color: pushReady ? 'var(--text)' : 'var(--text-2)' }}
                        >
                          <Bell size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTraineeId(t.id);
                            setActiveSection('inspector');
                          }}
                          className="btn-volt"
                          style={{ flex: 1, height: 44, fontSize: 15, cursor: 'pointer' }}
                        >
                          תפריט ויומן
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          ) : (
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
                      fontSize: 12,
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
                                    fontSize: 12,
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {t.email}
                                </div>
                                {(() => {
                                  const pendingQ = (t.savedMeals || []).filter(
                                    (m) => m.coachQuestion?.status === 'pending'
                                  ).length;
                                  if (pendingQ === 0) return null;
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedTraineeId(t.id);
                                        setActiveSection('inspector');
                                      }}
                                      style={{
                                        marginTop: 4,
                                        padding: '2px 7px',
                                        borderRadius: 999,
                                        background: 'rgba(56, 189, 248, 0.16)',
                                        border: '1px solid rgba(56, 189, 248, 0.35)',
                                        color: 'var(--info-text)',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <MessageCircle size={10} />
                                      <span>{pendingQ} שאלות ארוחה</span>
                                    </button>
                                  );
                                })()}
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
                                      fontSize: 12,
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
                                    fontSize: 12,
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
                                  fontSize: 12,
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
                                  disabled={isBusy(`obs-toggle-${t.id}`)}
                                  onClick={() =>
                                    runBusy(
                                      `obs-toggle-${t.id}`,
                                      () =>
                                        onManageObservationDays(t.id, {
                                          toggleDate: today,
                                        }),
                                      st.isTodayObs
                                        ? `יום תשקיף בוטל להיום עבור ${t.name}`
                                        : `היום הוגדר כיום תשקיף עבור ${t.name}`
                                    )
                                  }
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
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isBusy(`obs-toggle-${t.id}`)
                                    ? 'מעדכן...'
                                    : st.isTodayObs
                                    ? '✓ תשקיף היום'
                                    : '+ תשקיף היום'}
                                </button>

                                {((t.observationDates || []).length > 0 ||
                                  st.isTodayObs) && (
                                  <button
                                    title="בחר בקליק זריז אם ימי תשקיף נחשבים בספירת היעדים או לא"
                                    disabled={isBusy(`obs-count-${t.id}`)}
                                    onClick={() => {
                                      const nextVal =
                                        !t.countObservationInStats;
                                      runBusy(
                                        `obs-count-${t.id}`,
                                        () =>
                                          onManageObservationDays(t.id, {
                                            countObservationInStats: nextVal,
                                          }),
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
                                        ? 'var(--surface-2)'
                                        : 'var(--bg-surface-2)',
                                      color: t.countObservationInStats
                                        ? 'var(--accent-volt)'
                                        : 'var(--text-secondary)',
                                      fontSize: 12,
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
                                background: 'var(--line)',
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

                              <button
                                title="שלח פוש אישי למתאמן"
                                onClick={() => openPushModalForTrainee(t.id)}
                                className="btn-surface"
                                style={{
                                  padding: '6px 10px',
                                  fontSize: 12,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  color:
                                    (t.fcmTokens?.length || 0) +
                                      (t.webPushSubscriptions?.length || 0) >
                                    0
                                      ? 'var(--accent-volt)'
                                      : 'var(--text-secondary)',
                                }}
                              >
                                <Bell size={13} />
                                <span>פוש</span>
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
                                    color="currentColor"
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
          )}
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
                      } · גיל: ${computeAgeFromBirthDate(
                        selectedTrainee.onboarding.birthDate,
                        selectedTrainee.onboarding.age
                      )} · גובה: ${
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
                      style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                    >
                      BMR / TDEE משוער
                    </div>
                    <div
                      className="num-mono"
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: 'var(--text)',
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
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>
                        ממוצע ימי תשקיף ({obsAvg.loggedCount} מתוך {obsAvg.count}{' '}
                        ימים)
                      </div>
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: 'var(--text)',
                        }}
                      >
                        {obsAvg.loggedCount > 0
                          ? `${obsAvg.calories} קק״ל · חלבון ${obsAvg.protein}g`
                          : 'טרם הוזנו ארוחות בתשקיף'}
                      </div>
                    </div>
                  );
                })()}

                <button
                  type="button"
                  onClick={() => openPushModalForTrainee(selectedTrainee.id)}
                  className="btn-surface"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 12,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--text)',
                    borderColor: 'var(--line-2)',
                    alignSelf: 'center',
                  }}
                >
                  <Bell size={14} />
                  <span>שלח פוש אישי</span>
                </button>
              </div>
            </div>

            {/* שורת שליטה מהירה בימי תשקיף למאמן */}
            {(() => {
              const act = {
                weeklyWorkoutsTarget: 4,
                workoutTypes: ['אימון כוח A', 'אימון כוח B', 'Full Body'],
                weeklyCardioTarget: 3,
                cardioMode: 'both' as const,
                cardioTargetMinutes: 35,
                dailySleepTargetHours: 7.5,
                dailyStepsTarget: 8000,
                ...(selectedTrainee.activityTargets || {}),
              };

              const loggedWorkoutsCount = Object.values(
                selectedTrainee.logs || {}
              ).filter((l) => l.workoutLog?.completed).length;
              const loggedCardioCount = Object.values(
                selectedTrainee.logs || {}
              ).filter((l) => l.cardioLog?.completed).length;
              const todaySleep = selectedTrainee.logs[today]?.sleepHours;
              const todaySteps = selectedTrainee.logs[today]?.steps;
              const todayStepsSource = selectedTrainee.logs[today]?.stepsSource;

              return (
                <div
                  style={{
                    background: 'var(--bg-surface-2)',
                    padding: 14,
                    borderRadius: 20,
                    border: '1px solid var(--line-2)',
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
                          color: 'var(--text)',
                        }}
                      >
                        הגדרת יעדי אימונים, סוגי אימון, הליכות/ריצות ושעות שינה
                        ל-{selectedTrainee.name}
                      </div>
                      <div
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                      >
                        יעדים אלו מוצגים למתאמן להזנה יומית ביומן שלו
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                      <span
                        className="num-mono"
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          color: 'var(--text)',
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
                          color: 'var(--text)',
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
                          background: 'var(--surface-2)',
                          color: 'var(--text)',
                          fontWeight: 800,
                        }}
                      >
                        שינה היום: {todaySleep ?? '—'} /{' '}
                        {act.dailySleepTargetHours}h
                      </span>
                      <span
                        className="num-mono"
                        style={{
                          padding: '3px 9px',
                          borderRadius: 999,
                          background: 'rgba(34, 197, 94, 0.15)',
                          color: 'var(--ok-text)',
                          fontWeight: 800,
                        }}
                      >
                        צעדים היום: {(todaySteps ?? 0).toLocaleString()} /{' '}
                        {(act.dailyStepsTarget ?? 8000).toLocaleString()}
                        {todayStepsSource && todayStepsSource !== 'manual'
                          ? ' (אוטומטי)'
                          : ''}
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
                    <NumberInput
                      size="xs"
                      label="יעד צעדים יומי"
                      value={act.dailyStepsTarget ?? 8000}
                      min={1000}
                      max={50000}
                      step={500}
                      onChange={(val) =>
                        onUpdateActivityTargets(selectedTrainee.id, {
                          ...act,
                          dailyStepsTarget: Number(val) || 8000,
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
                              border: active ? '1px solid var(--sel-bg)'
                                : '1px solid var(--border-subtle)',
                              background: active ? 'var(--sel-bg)'
                                : 'var(--bg-surface-1)',
                              color: active ? 'var(--sel-text)'
                                : 'var(--text-muted)',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {active ? `✓ ${wType}` : `+ ${wType}`}
                          </button>
                        );
                      })}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const clean = customWorkoutTypeInput.trim();
                        if (!clean) return;
                        const nextTypes = Array.from(
                          new Set([...(act.workoutTypes || []), clean])
                        );
                        runBusy(
                          'add-wtype',
                          () =>
                            onUpdateActivityTargets(selectedTrainee.id, {
                              ...act,
                              workoutTypes: nextTypes,
                            }),
                          `סוג האימון "${clean}" נוסף למתאמן`
                        );
                        setCustomWorkoutTypeInput('');
                      }}
                      style={{ display: 'flex', gap: 8 }}
                    >
                      <TextInput
                        size="xs"
                        style={{ flex: 1 }}
                        placeholder="הוסף סוג אימון מותאם אישית (למשל: אימון רגליים וישבן, קרוספיט, שחייה)..."
                        value={customWorkoutTypeInput}
                        disabled={isBusy('add-wtype')}
                        onChange={(e) =>
                          setCustomWorkoutTypeInput(e.currentTarget.value)
                        }
                      />
                      <button
                        type="submit"
                        disabled={!customWorkoutTypeInput.trim() || isBusy('add-wtype')}
                        className="btn-surface"
                        style={{
                          padding: '6px 12px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        {isBusy('add-wtype') ? 'מוסיף...' : '+ הוסף סוג אימון'}
                      </button>
                    </form>
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
                borderRadius: 20,
                marginBottom: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
                  ניהול ימי תשקיף ({selectedTrainee.observationDates?.length || 0}{' '}
                  ימים מוגדרים)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  הגדר ימי תשקיף מראש או בדיעבד, ובחר בקליק אם הקלוריות שלהם
                  נחשבות בספירת היעדים
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  disabled={isBusy('obs-ins-today')}
                  onClick={() =>
                    runBusy(
                      'obs-ins-today',
                      () =>
                        onManageObservationDays(selectedTrainee.id, {
                          toggleDate: today,
                        }),
                      'סטטוס יום תשקיף להיום עודכן'
                    )
                  }
                  className="btn-surface"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    borderColor: (
                      selectedTrainee.observationDates || []
                    ).includes(today)
                      ? 'var(--text)'
                      : undefined,
                  }}
                >
                  {isBusy('obs-ins-today')
                    ? 'מעדכן...'
                    : (selectedTrainee.observationDates || []).includes(today)
                    ? '✓ היום מוגדר כיום תשקיף (לחץ לביטול)'
                    : 'הגדר את היום כיום תשקיף'}
                </button>

                <button
                  disabled={isBusy('obs-ins-3')}
                  onClick={() =>
                    runBusy(
                      'obs-ins-3',
                      () =>
                        onManageObservationDays(selectedTrainee.id, {
                          addFutureDays: 3,
                        }),
                      'נוספו 3 ימי תשקיף מהיום והלאה'
                    )
                  }
                  className="btn-surface"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isBusy('obs-ins-3') ? 'מוסיף...' : '+ 3 ימי תשקיף מראש'}
                </button>

                <button
                  disabled={isBusy('obs-ins-7')}
                  onClick={() =>
                    runBusy(
                      'obs-ins-7',
                      () =>
                        onManageObservationDays(selectedTrainee.id, {
                          addFutureDays: 7,
                        }),
                      'נוספו 7 ימי תשקיף מראש'
                    )
                  }
                  className="btn-surface"
                  style={{
                    padding: '7px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isBusy('obs-ins-7') ? 'מוסיף...' : '+ 7 ימי תשקיף מראש'}
                </button>

                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'var(--bg-surface-1)',
                    padding: '3px 6px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <NumberInput
                    size="xs"
                    min={1}
                    max={90}
                    step={1}
                    allowDecimal={false}
                    value={customObsDays}
                    onChange={(v) =>
                      setCustomObsDays(
                        Math.max(1, Math.min(90, Math.round(Number(v) || 1)))
                      )
                    }
                    style={{ width: 64 }}
                  />
                  <button
                    type="button"
                    disabled={isBusy('obs-ins-custom')}
                    onClick={() =>
                      runBusy(
                        'obs-ins-custom',
                        () =>
                          onManageObservationDays(selectedTrainee.id, {
                            addFutureDays: customObsDays,
                          }),
                        `נוספו ${customObsDays} ימי תשקיף מראש`
                      )
                    }
                    className="btn-surface"
                    style={{
                      padding: '5px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {isBusy('obs-ins-custom')
                      ? 'מוסיף...'
                      : `+ ${customObsDays} ימים`}
                  </button>
                </div>

                {/* מתג קליק זריז למאמן: האם ימי תשקיף נחשבים בספירה או לא */}
                <button
                  disabled={isBusy('obs-ins-count')}
                  onClick={() => {
                    const nextVal = !selectedTrainee.countObservationInStats;
                    runBusy(
                      'obs-ins-count',
                      () =>
                        onManageObservationDays(selectedTrainee.id, {
                          countObservationInStats: nextVal,
                        }),
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
                  {isBusy('obs-ins-count')
                    ? 'מעדכן...'
                    : selectedTrainee.countObservationInStats
                    ? '✓ ימי תשקיף נחשבים בספירה'
                    : 'ימי תשקיף לא נחשבים ביעד (לחץ להכללה)'}
                </button>

                <button
                  disabled={isBusy('obs-ins-restrict')}
                  onClick={() => {
                    const nextVal =
                      !selectedTrainee.restrictToObservationDaysWhenTodayIsObservation;
                    runBusy(
                      'obs-ins-restrict',
                      () =>
                        onManageObservationDays(selectedTrainee.id, {
                          restrictToObservationDaysWhenTodayIsObservation: nextVal,
                        }),
                      nextVal
                        ? 'כאשר היום בארץ הוא יום תשקיף, המתאמן יוכל לעבור רק בין ימי תשקיף'
                        : 'בוטלה נעילת הניווט בימי תשקיף'
                    );
                  }}
                  className={
                    selectedTrainee.restrictToObservationDaysWhenTodayIsObservation
                      ? 'btn-volt'
                      : 'btn-surface'
                  }
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Lock size={13} />
                  {isBusy('obs-ins-restrict')
                    ? 'מעדכן...'
                    : selectedTrainee.restrictToObservationDaysWhenTodayIsObservation
                    ? '✓ נעול לימי תשקיף בלבד ביום תשקיף (בארץ)'
                    : 'הגבלת מעבר בימי תשקיף: כבוי (לחץ להפעלה)'}
                </button>

                {(selectedTrainee.observationDates || []).length > 0 && (
                  <button
                    disabled={isBusy('obs-ins-clear')}
                    onClick={() => {
                      if (
                        !confirmDanger(
                          `לנקות את כל ימי התשקיף של ${selectedTrainee.name}?`
                        )
                      ) {
                        return;
                      }
                      runBusy(
                        'obs-ins-clear',
                        () =>
                          onManageObservationDays(selectedTrainee.id, {
                            clearAll: true,
                          }),
                        'כל ימי התשקיף נוקו'
                      );
                    }}
                    className="btn-surface"
                    style={{
                      padding: '7px 10px',
                      fontSize: 12,
                      color: '#ef4444',
                      cursor: 'pointer',
                    }}
                  >
                    {isBusy('obs-ins-clear') ? 'מנקה...' : 'נקה ימי תשקיף'}
                  </button>
                )}
              </div>

              {/* ניהול טווח תאריכים פעילים לניווט המתאמן (שבועי וחודשי) */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12.5,
                      fontWeight: 800,
                      color: 'var(--text)',
                    }}
                  >
                    <CalendarRange size={14} />
                    <span>חלון תאריכים פעילים לניווט המתאמן</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    קובע לאילו תאריכים המתאמן יכול לנווט בסרגל השבועי ובלוח השנה החודשי (ימי תשקיף וימים מתועדים זמינים תמיד).
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                  <NumberInput
                    size="xs"
                    label="ימים אחורה"
                    value={activePastDraft}
                    min={0}
                    max={365}
                    allowDecimal={false}
                    onChange={(val) =>
                      setActivePastDraft(
                        val === '' ? 0 : Math.max(0, Math.min(365, Math.round(Number(val) || 0)))
                      )
                    }
                    style={{ width: 92 }}
                  />
                  <NumberInput
                    size="xs"
                    label="ימים קדימה"
                    value={activeFutureDraft}
                    min={0}
                    max={180}
                    allowDecimal={false}
                    onChange={(val) =>
                      setActiveFutureDraft(
                        val === '' ? 0 : Math.max(0, Math.min(180, Math.round(Number(val) || 0)))
                      )
                    }
                    style={{ width: 92 }}
                  />
                  <button
                    type="button"
                    disabled={isBusy('active-range-save')}
                    onClick={() =>
                      runBusy(
                        'active-range-save',
                        () =>
                          onManageObservationDays(selectedTrainee.id, {
                            activeDateRange: {
                              pastDays: activePastDraft,
                              futureDays: activeFutureDraft,
                            },
                          }),
                        'טווח התאריכים הפעילים למתאמן עודכן'
                      )
                    }
                    className="btn-volt"
                    style={{
                      padding: '6px 12px',
                      fontSize: 12.5,
                      cursor: 'pointer',
                    }}
                  >
                    {isBusy('active-range-save') ? 'שומר...' : 'עדכן טווח תאריכים'}
                  </button>
                </div>
              </div>

              {/* ניהול ימים חסומים להזנה (כשיום חסום, לא ניתן להזין בו כלום) */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: 'var(--danger-text)',
                      }}
                    >
                      <Ban size={14} />
                      <span>
                        ניהול ימים חסומים ({selectedTrainee.blockedDates?.length || 0} ימים חסומים)
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      ביום חסום המתאמן לא יוכל להזין ארוחות, מדדים, מים, משקל או פעילות.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={isBusy('block-today')}
                      onClick={() =>
                        runBusy(
                          'block-today',
                          () =>
                            onManageObservationDays(selectedTrainee.id, {
                              toggleBlockedDate: today,
                            }),
                          (selectedTrainee.blockedDates || []).includes(today)
                            ? 'בוטלה חסימת היום להזנה'
                            : 'היום נחסם להזנה'
                        )
                      }
                      className="btn-surface"
                      style={{
                        padding: '6px 11px',
                        fontSize: 12.5,
                        cursor: 'pointer',
                        borderColor: (selectedTrainee.blockedDates || []).includes(today)
                          ? '#ef4444'
                          : undefined,
                        color: (selectedTrainee.blockedDates || []).includes(today)
                          ? 'var(--danger-text)'
                          : undefined,
                      }}
                    >
                      {isBusy('block-today')
                        ? 'מעדכן...'
                        : (selectedTrainee.blockedDates || []).includes(today)
                        ? '✓ היום חסום (לחץ לביטול)'
                        : 'חסום את היום להזנה'}
                    </button>

                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--bg-surface-1)',
                        padding: '3px 6px',
                        borderRadius: 10,
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <input
                        type="date"
                        value={customBlockDateInput}
                        onChange={(e) => setCustomBlockDateInput(e.target.value)}
                        style={{
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          border: 'none',
                          fontSize: 12.5,
                          outline: 'none',
                          colorScheme: 'dark',
                        }}
                      />
                      <button
                        type="button"
                        disabled={!customBlockDateInput || isBusy('block-date-pick')}
                        onClick={() =>
                          runBusy(
                            'block-date-pick',
                            () =>
                              onManageObservationDays(selectedTrainee.id, {
                                toggleBlockedDate: customBlockDateInput,
                              }),
                            (selectedTrainee.blockedDates || []).includes(
                              customBlockDateInput
                            )
                              ? `בוטלה חסימת ${customBlockDateInput}`
                              : `התאריך ${customBlockDateInput} נחסם להזנה`
                          )
                        }
                        className="btn-surface"
                        style={{
                          padding: '4px 9px',
                          fontSize: 12,
                          cursor: customBlockDateInput ? 'pointer' : 'not-allowed',
                        }}
                      >
                        {(selectedTrainee.blockedDates || []).includes(
                          customBlockDateInput
                        )
                          ? 'בטל חסימה'
                          : 'חסום תאריך'}
                      </button>
                    </div>

                    {(selectedTrainee.blockedDates || []).length > 0 && (
                      <button
                        type="button"
                        disabled={isBusy('block-clear')}
                        onClick={() => {
                          if (
                            !confirmDanger(
                              `לבטל את כל הימים החסומים של ${selectedTrainee.name}?`
                            )
                          ) {
                            return;
                          }
                          runBusy(
                            'block-clear',
                            () =>
                              onManageObservationDays(selectedTrainee.id, {
                                clearBlockedAll: true,
                              }),
                            'כל הימים החסומים נוקו'
                          );
                        }}
                        className="btn-surface"
                        style={{
                          padding: '6px 10px',
                          fontSize: 12,
                          color: '#ef4444',
                          cursor: 'pointer',
                        }}
                      >
                        {isBusy('block-clear') ? 'מנקה...' : 'נקה חסומים'}
                      </button>
                    )}
                  </div>
                </div>

                {(selectedTrainee.blockedDates || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(selectedTrainee.blockedDates || []).map((iso) => (
                      <button
                        key={iso}
                        type="button"
                        disabled={isBusy(`block-chip-${iso}`)}
                        onClick={() =>
                          runBusy(
                            `block-chip-${iso}`,
                            () =>
                              onManageObservationDays(selectedTrainee.id, {
                                toggleBlockedDate: iso,
                              }),
                            `בוטלה חסימת ${iso}`
                          )
                        }
                        title="לחץ להסרת חסימה מתאריך זה"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '3px 9px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          background: 'rgba(239, 68, 68, 0.14)',
                          border: '1px solid rgba(239, 68, 68, 0.38)',
                          color: 'var(--danger-text)',
                          cursor: 'pointer',
                        }}
                      >
                        <span>{iso}</span>
                        <span style={{ opacity: 0.85 }}>✕</span>
                      </button>
                    ))}
                  </div>
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
                    color: 'var(--text)',
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
                    color: 'var(--text)',
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
                    color: 'var(--warn-text)',
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
                  borderRadius: 20,
                  border: '1px solid var(--line-2)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 800,
                    color: 'var(--text)',
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
                    fontSize: 12,
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
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      marginBottom: 6,
                    }}
                  >
                    כללים שהמערכת למדה מתגובות המתאמן להצעות AI (
                    {(selectedTrainee.aiLearnedPreferences || []).length}):
                  </div>
                  {(selectedTrainee.aiLearnedPreferences || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
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
                              background: 'var(--fill-1)',
                              border: '1px solid var(--line-2)',
                              fontSize: 12,
                              color: 'var(--text)',
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

              {/* פאנל ספריית ארוחות שמורות, שאלות מתאמן וניהול כלים מוגדרים */}
              <CoachSavedMealsPanel
                trainee={selectedTrainee}
                onReplySavedMeal={onReplySavedMeal}
                onManageToolsAndUnits={onManageToolsAndUnits}
              />

              {/* כרטיס צ'ק-אין שבועי אחרון של המתאמן + העתקת דו"ח לוואטסאפ */}
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  padding: 14,
                  borderRadius: 20,
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
                        color: 'var(--text)',
                      }}
                    >
                      📋 צ׳ק-אין שבועי אחרון ודו״ח סיכום
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
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
                          dailyStepsTarget: 8000,
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
                        const todayStepsReport =
                          selectedTrainee.logs?.[today]?.steps;
                        const stepsGoalReport = act.dailyStepsTarget ?? 8000;
                        const report = [
                          `📊 *דו"ח מתאמן SPOT - ${selectedTrainee.name}* (${today})`,
                          `• משקל נוכחי: ${selectedTrainee.currentWeight} ק"ג (יעד: ${selectedTrainee.targetWeight} ק"ג)`,
                          `• אימונים שתועדו: ${workoutsDone} (יעד שבועי: ${act.weeklyWorkoutsTarget})`,
                          `• צעדים היום: ${(todayStepsReport ?? 0).toLocaleString()} (יעד: ${stepsGoalReport.toLocaleString()})`,
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
                        try {
                          if (
                            typeof navigator !== 'undefined' &&
                            navigator.clipboard?.writeText
                          ) {
                            await navigator.clipboard.writeText(report);
                          } else if (typeof document !== 'undefined') {
                            const ta = document.createElement('textarea');
                            ta.value = report;
                            ta.style.position = 'fixed';
                            ta.style.opacity = '0';
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                          }
                          showToast('דו״ח הסיכום הועתק ללוח (מוכן לוואטסאפ)');
                        } catch {
                          showToast('לא ניתן להעתיק ללוח בדפדפן זה', true);
                        }
                      }}
                      className="btn-surface"
                      style={{
                        padding: '5px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        color: 'var(--text)',
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
                              background: 'var(--fill-1)',
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
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
                    borderRadius: 20,
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
                  color: 'var(--text)',
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
                      borderRadius: 20,
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
                      <div style={{ fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{slot.name}</span>
                        {(entry?.mealTime || slot.timeHint) && (
                          <span
                            dir="ltr"
                            className="num-mono"
                            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}
                          >
                            {entry?.mealTime || slot.timeHint}
                          </span>
                        )}
                      </div>
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color:
                            items.length > 0
                              ? 'var(--text)'
                              : 'var(--text-muted)',
                        }}
                      >
                        <span dir="ltr">{mealTotals.calories} / {slot.targets.calories}</span> קק״ל · ח׳{' '}
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
                          background: 'var(--surface-2)',
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

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        runBusy(
                          `fb-${selectedTrainee.id}-${slot.id}`,
                          () =>
                            onAddCoachFeedback(
                              selectedTrainee.id,
                              today,
                              slot.id,
                              draftVal
                            ),
                          `הפידבק נשמר תחת השם "${currentUser.name}"`
                        );
                      }}
                      style={{ display: 'flex', gap: 8 }}
                    >
                      <input
                        placeholder={`כתוב פידבק בשם ${currentUser.name}...`}
                        value={draftVal}
                        disabled={isBusy(`fb-${selectedTrainee.id}-${slot.id}`)}
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
                        type="submit"
                        disabled={isBusy(`fb-${selectedTrainee.id}-${slot.id}`)}
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
                        {isBusy(`fb-${selectedTrainee.id}-${slot.id}`) ? (
                          <BusyIcon size={12} />
                        ) : (
                          <Send size={12} />
                        )}
                        <span>
                          {isBusy(`fb-${selectedTrainee.id}-${slot.id}`)
                            ? 'שולח...'
                            : 'שלח'}
                        </span>
                      </button>
                    </form>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Library list (design: CoachTemplates) — picking a card selects it for editing below */}
          <header style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>תפריטים</span>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>ספריית טמפלייטים</h1>
          </header>
          <SegmentedPill
            ariaLabel="סוג טמפלייט"
            value={tplScope}
            onChange={(v) => setTplScope(v as 'all' | 'system' | 'mine')}
            options={[
              { value: 'all', label: 'הכל' },
              { value: 'system', label: 'מערכת' },
              { value: 'mine', label: 'האישיים שלי' },
            ]}
          />
          {templates
            .filter((t) => {
              const isGlobal = !t.ownerCoachId || t.ownerCoachId === 'coach-admin';
              return tplScope === 'all' || (tplScope === 'system' ? isGlobal : !isGlobal);
            })
            .map((t) => {
              const isGlobal = !t.ownerCoachId || t.ownerCoachId === 'coach-admin';
              const on = t.id === selectedTemplateId;
              return (
                <article
                  key={t.id}
                  style={{
                    background: 'var(--card)',
                    border: `1px solid ${on ? 'var(--line-2)' : 'var(--line)'}`,
                    borderRadius: 28,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: 'var(--card-shadow)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>{t.name}</span>
                      {t.description && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t.description}</span>}
                    </span>
                    <span
                      style={{
                        height: 26,
                        padding: '0 10px',
                        borderRadius: 999,
                        background: 'var(--surface-2)',
                        color: 'var(--text-2)',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        flex: 'none',
                      }}
                    >
                      {isGlobal ? 'מערכת' : 'אישי'}
                    </span>
                  </div>
                  <div data-h-scroll style={{ display: 'flex', gap: 6 }}>
                    {t.meals.map((m) => (
                      <span
                        key={m.id}
                        style={{
                          flex: 'none',
                          height: 30,
                          padding: '0 12px',
                          borderRadius: 999,
                          border: '1px solid var(--line-2)',
                          fontSize: 13,
                          display: 'inline-flex',
                          alignItems: 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.name}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectTemplate(t.id)}
                    aria-pressed={on}
                    className={on ? 'btn-volt' : 'glass'}
                    style={{
                      height: 48,
                      borderRadius: 999,
                      fontFamily: 'inherit',
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {on ? 'נבחר לעריכה ✓' : 'בחר לעריכה ושיוך'}
                  </button>
                </article>
              );
            })}
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
              <button
                disabled={isBusy('create-tpl')}
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
                {isBusy('create-tpl') ? (
                  <BusyIcon size={14} />
                ) : (
                  <Plus size={14} />
                )}
                <span>
                  {isBusy('create-tpl') ? 'יוצר טמפלייט...' : '+ טמפלייט חדש'}
                </span>
              </button>

              {!canEditCurrentTemplate && (
                <button
                  disabled={isBusy('dup-tpl')}
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
                  {isBusy('dup-tpl') ? (
                    <BusyIcon size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>
                    {isBusy('dup-tpl')
                      ? 'משכפל...'
                      : 'שכפל לטמפלייטים האישיים שלי לעריכה'}
                  </span>
                </button>
              )}
            </div>

            {trainees.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
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
                  disabled={isBusy('assign-tpl')}
                  onClick={() => {
                    const tName =
                      trainees.find((t) => t.id === assignTraineeId)?.name ||
                      '';
                    runBusy(
                      'assign-tpl',
                      () =>
                        onAssignTemplateToTrainee(
                          assignTraineeId,
                          assignDayType,
                          editableTemplate
                        ),
                      `הטמפלייט "${editableTemplate.name}" שויך למתאמן ${tName}`
                    );
                  }}
                  className="btn-volt"
                  style={{
                    padding: '7px 14px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isBusy('assign-tpl') && <BusyIcon size={13} />}
                  <span>
                    {isBusy('assign-tpl') ? 'משייך...' : 'שייך למתאמן'}
                  </span>
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
                    gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))',
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
                      disabled={isBusy('del-tpl')}
                      onClick={() => {
                        if (
                          !confirmDanger(
                            `למחוק לצמיתות את הטמפלייט "${editableTemplate.name}"?`
                          )
                        ) {
                          return;
                        }
                        runBusy(
                          'del-tpl',
                          () => onDeleteTemplate(editableTemplate.id),
                          'הטמפלייט נמחק'
                        );
                      }}
                      className="btn-surface"
                      style={{
                        padding: '10px 14px',
                        fontSize: 12,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {isBusy('del-tpl') && <BusyIcon size={13} />}
                      <span>{isBusy('del-tpl') ? 'מוחק...' : 'מחק טמפלייט'}</span>
                    </button>
                  )}
                  <button
                    disabled={isBusy('save-tpl')}
                    onClick={() =>
                      runBusy(
                        'save-tpl',
                        () => onSaveTemplate(editableTemplate),
                        `הטמפלייט "${editableTemplate.name}" נשמר`
                      )
                    }
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
                    {isBusy('save-tpl') ? (
                      <BusyIcon size={16} />
                    ) : (
                      <Check size={16} />
                    )}
                    <span>
                      {isBusy('save-tpl') ? 'שומר טמפלייט...' : 'שמור טמפלייט'}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* תצוגה 4: ניהול חשבונות מתאמנים ושיתוף בין מאמנים                      */}
      {/* ===================================================================== */}
      {activeSection === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <header style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>ניהול</span>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>חשבונות מתאמנים</h1>
          </header>
          <div className="pro-card" style={{ padding: 20, borderRadius: 28 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>קוד ההזמנה האישי שלך</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1 }}>
                    {coachInviteCode}
                  </bdi>
                  <button
                    type="button"
                    className="glass"
                    onClick={() => {
                      void navigator.clipboard?.writeText(coachInviteCode).catch(() => {});
                    }}
                    style={{ height: 44, padding: '0 16px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <Copy size={16} />
                    העתק
                  </button>
                </div>
                <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                  מתאמן שנרשם באפליקציה ומזין את הקוד משויך אליך אוטומטית ומופעל מיד
                </span>
              </div>

              {isSuperAdmin && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    runBusy(
                      'save-invite',
                      () =>
                        onUpdateCoachInviteCode(
                          inviteCodeDraft.trim().toUpperCase() || 'SPOT2026'
                        ),
                      'קוד ההזמנה עודכן'
                    );
                  }}
                  style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
                >
                  <TextInput
                    dir="ltr"
                    label="קוד מנהל ראשי"
                    value={inviteCodeDraft}
                    disabled={isBusy('save-invite')}
                    onChange={(e) => setInviteCodeDraft(e.currentTarget.value)}
                  />
                  <button
                    type="submit"
                    disabled={isBusy('save-invite')}
                    className="btn-volt"
                    style={{
                      padding: '9px 16px',
                      fontSize: 12,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {isBusy('save-invite') && <BusyIcon size={12} />}
                    <span>{isBusy('save-invite') ? 'שומר...' : 'שמור קוד'}</span>
                  </button>
                </form>
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
                      fontSize: 12,
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
                    const liveBadge = formatLiveActivityBadge(t.lastSeenAt);
                    return (
                      <tr
                        key={t.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <td style={{ padding: '14px 20px', fontWeight: 800 }}>
                          <div>{t.name}</div>
                          {liveBadge && (
                            <div
                              style={{
                                marginTop: 4,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 12.5,
                                fontWeight: 700,
                                color: liveBadge.isOnline
                                  ? '#22c55e'
                                  : 'var(--text-muted)',
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  background: liveBadge.isOnline
                                    ? '#22c55e'
                                    : 'var(--text-muted)',
                                }}
                              />
                              <span>{liveBadge.label}</span>
                            </div>
                          )}
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
                                fontSize: 12,
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
                                color: 'var(--warn-text)',
                                fontSize: 12,
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
                                fontSize: 12,
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
                                  fontSize: 12,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  cursor: 'pointer',
                                }}
                              >
                                <Share2
                                  size={13}
                                  color="currentColor"
                                />
                                <span>שתף מאמנים</span>
                              </button>

                              {t.status !== 'active' ? (
                                <button
                                  disabled={isBusy(`st-tr-${t.id}`)}
                                  onClick={() =>
                                    runBusy(
                                      `st-tr-${t.id}`,
                                      () => onUpdateTraineeStatus(t.id, 'active'),
                                      `הגישה של ${t.name} הופעלה והחסימה הוסרה`
                                    )
                                  }
                                  className="btn-volt"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {isBusy(`st-tr-${t.id}`) ? (
                                    <BusyIcon size={13} />
                                  ) : (
                                    <PlayCircle size={13} />
                                  )}
                                  <span>
                                    {isBusy(`st-tr-${t.id}`)
                                      ? 'מפעיל...'
                                      : t.status === 'paused'
                                      ? 'בטל חסימה'
                                      : 'הפעל'}
                                  </span>
                                </button>
                              ) : (
                                <>
                                  {onForceLogoutTrainee && (
                                    <button
                                      title="נתק את המתאמן מכל המכשירים המחוברים בלייב (ללא חסימה)"
                                      disabled={isBusy(`fl-tr-${t.id}`)}
                                      onClick={() =>
                                        runBusy(
                                          `fl-tr-${t.id}`,
                                          () => onForceLogoutTrainee(t.id),
                                          `${t.name} נותק מכל המכשירים מרחוק`
                                        )
                                      }
                                      className="btn-surface"
                                      style={{
                                        padding: '6px 10px',
                                        fontSize: 12,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        cursor: 'pointer',
                                        color: 'var(--warn-text)',
                                        borderColor: 'rgba(245, 158, 11, 0.3)',
                                      }}
                                    >
                                      {isBusy(`fl-tr-${t.id}`) ? (
                                        <BusyIcon size={13} />
                                      ) : (
                                        <LogOut size={13} />
                                      )}
                                      <span>
                                        {isBusy(`fl-tr-${t.id}`) ? 'מנתק...' : 'נתק'}
                                      </span>
                                    </button>
                                  )}
                                  <button
                                    title="חסום גישה ונתק מיד מהאפליקציה"
                                    disabled={isBusy(`st-tr-${t.id}`)}
                                    onClick={() =>
                                      runBusy(
                                        `st-tr-${t.id}`,
                                        () => onUpdateTraineeStatus(t.id, 'paused'),
                                        `החשבון של ${t.name} נחסם ונותק מהמכשירים`
                                      )
                                    }
                                    className="btn-surface"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: 12,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      cursor: 'pointer',
                                      color: 'var(--danger-text)',
                                      borderColor: 'rgba(239, 68, 68, 0.3)',
                                    }}
                                  >
                                    {isBusy(`st-tr-${t.id}`) ? (
                                      <BusyIcon size={13} />
                                    ) : (
                                      <PauseCircle size={13} />
                                    )}
                                    <span>
                                      {isBusy(`st-tr-${t.id}`) ? 'חוסם...' : 'חסום'}
                                    </span>
                                  </button>
                                </>
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
                                  fontSize: 12,
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
                                title="מחק מתאמן לצמיתות"
                                disabled={isBusy(`del-tr-${t.id}`)}
                                onClick={() => {
                                  if (
                                    !confirmDanger(
                                      `למחוק לצמיתות את המתאמן "${t.name}" וכל נתוניו? פעולה זו אינה הפיכה.`
                                    )
                                  ) {
                                    return;
                                  }
                                  runBusy(
                                    `del-tr-${t.id}`,
                                    () => onDeleteTrainee(t.id),
                                    `המתאמן ${t.name} הוסר`
                                  );
                                }}
                                className="btn-surface"
                                style={{
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                }}
                              >
                                {isBusy(`del-tr-${t.id}`) ? (
                                  <BusyIcon size={13} />
                                ) : (
                                  <Trash2 size={13} color="#ef4444" />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span
                              style={{
                                fontSize: 12,
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
                ניהול מאמנים
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
                      fontSize: 12,
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
                            <div>{c.name}</div>
                            {(() => {
                              const liveBadge = formatLiveActivityBadge(c.lastSeenAt);
                              if (!liveBadge) return null;
                              return (
                                <div
                                  style={{
                                    marginTop: 4,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    color: liveBadge.isOnline
                                      ? '#22c55e'
                                      : 'var(--text-muted)',
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: '50%',
                                      background: liveBadge.isOnline
                                        ? '#22c55e'
                                        : 'var(--text-muted)',
                                    }}
                                  />
                                  <span>{liveBadge.label}</span>
                                </div>
                              );
                            })()}
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
                                background: 'var(--surface-2)',
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
                                  fontSize: 12,
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
                                  fontSize: 12,
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
                                <>
                                  {onForceLogoutCoach && (
                                    <button
                                      title="נתק את המאמן מכל המכשירים המחוברים בלייב (ללא חסימה)"
                                      disabled={isBusy(`fl-co-${c.id}`)}
                                      onClick={() =>
                                        runBusy(
                                          `fl-co-${c.id}`,
                                          () => onForceLogoutCoach(c.id),
                                          `המאמן ${c.name} נותק מכל המכשירים מרחוק`
                                        )
                                      }
                                      className="btn-surface"
                                      style={{
                                        padding: '6px 10px',
                                        fontSize: 12,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        color: 'var(--warn-text)',
                                        borderColor: 'rgba(245, 158, 11, 0.3)',
                                      }}
                                    >
                                      {isBusy(`fl-co-${c.id}`) ? (
                                        <BusyIcon size={12} />
                                      ) : (
                                        <LogOut size={12} />
                                      )}
                                      <span>
                                        {isBusy(`fl-co-${c.id}`)
                                          ? 'מנתק...'
                                          : 'נתק מאמן'}
                                      </span>
                                    </button>
                                  )}
                                  <button
                                    title="חסום מאמן ונתק אותו מיידית מהאפליקציה"
                                    disabled={isBusy(`st-co-${c.id}`)}
                                    onClick={() =>
                                      runBusy(
                                        `st-co-${c.id}`,
                                        () => onUpdateCoachStatus(c.id, 'paused'),
                                        `חשבון המאמן ${c.name} נחסם ונותק מרחוק`
                                      )
                                    }
                                    className="btn-surface"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: 12,
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      color: 'var(--danger-text)',
                                      borderColor: 'rgba(239, 68, 68, 0.3)',
                                    }}
                                  >
                                    {isBusy(`st-co-${c.id}`) && <BusyIcon size={12} />}
                                    <span>
                                      {isBusy(`st-co-${c.id}`)
                                        ? 'חוסם...'
                                        : 'חסום מאמן'}
                                    </span>
                                  </button>
                                </>
                              ) : (
                                <button
                                  disabled={isBusy(`st-co-${c.id}`)}
                                  onClick={() =>
                                    runBusy(
                                      `st-co-${c.id}`,
                                      () => onUpdateCoachStatus(c.id, 'active'),
                                      `חשבון המאמן ${c.name} הופעל`
                                    )
                                  }
                                  className="btn-volt"
                                  style={{
                                    padding: '6px 10px',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  {isBusy(`st-co-${c.id}`) && <BusyIcon size={12} />}
                                  <span>
                                    {isBusy(`st-co-${c.id}`)
                                      ? 'מפעיל...'
                                      : 'הפעל מאמן'}
                                  </span>
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
                                  fontSize: 12,
                                  cursor: 'pointer',
                                }}
                              >
                                סיסמה וקוד
                              </button>

                              <button
                                title="מחק מאמן והעבר את מתאמניו למנהל הראשי"
                                disabled={isBusy(`del-co-${c.id}`)}
                                onClick={() => {
                                  if (
                                    !confirmDanger(
                                      `למחוק את המאמן "${c.name}"? כל מתאמניו יעברו אוטומטית לבעלותך.`
                                    )
                                  ) {
                                    return;
                                  }
                                  runBusy(
                                    `del-co-${c.id}`,
                                    () => onDeleteCoach(c.id),
                                    `המאמן ${c.name} הוסר וכל מתאמניו הועברו לבעלותך`
                                  );
                                }}
                                className="btn-surface"
                                style={{
                                  padding: '6px 8px',
                                  cursor: 'pointer',
                                }}
                              >
                                {isBusy(`del-co-${c.id}`) ? (
                                  <BusyIcon size={13} />
                                ) : (
                                  <Trash2 size={13} color="#ef4444" />
                                )}
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

          {onUpdateAppPolicy && (
            <div className="pro-card" style={{ padding: 20 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  flexWrap: 'wrap',
                  marginBottom: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Smartphone size={18} color="currentColor" />
                    <span>בקרת גרסאות, Web Hard Refresh ועדכוני APK לאנדרואיד</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      marginTop: 4,
                    }}
                  >
                    בווב/PWA מתבצע Hard Refresh אוטומטי בעליית גרסה. באנדרואיד, כל
                    גרסה ש־<span dir="ltr">versionCode &lt;=</span> לסף החסימה תינעל
                    הרמטית עד להתקנת ה-APK החדש.
                  </div>
                </div>
                <div
                  className="num-mono"
                  style={{
                    fontSize: 12,
                    padding: '5px 10px',
                    borderRadius: 999,
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                  }}
                  dir="ltr"
                >
                  Web Build: {CLIENT_WEB_BUILD_ID || 'dev'}
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsedLatestCode = policyLatestCode.trim()
                    ? Math.max(0, Math.round(Number(policyLatestCode) || 0))
                    : undefined;
                  runBusy(
                    'save-app-policy',
                    () =>
                      onUpdateAppPolicy({
                        androidBlockedUpToVersionCode: Math.max(
                          0,
                          Math.round(Number(policyBlockedUpTo) || 0)
                        ),
                        androidLatestVersionCode: parsedLatestCode,
                        androidLatestVersionName:
                          policyLatestName.trim() || undefined,
                        androidApkDownloadUrl: policyApkUrl.trim() || undefined,
                        androidReleaseNotes:
                          policyReleaseNotes.trim() || undefined,
                      }),
                    'מדיניות הגרסאות והחסימה באנדרואיד עודכנה'
                  );
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: 12,
                  }}
                >
                  <NumberInput
                    label="חסום אפליקציית אנדרואיד עד וכולל (versionCode <=)"
                    description="0 = ללא חסימה. למשל 10002 יחסום גרסאות 10002 ומטה"
                    min={0}
                    max={99999999}
                    value={policyBlockedUpTo}
                    onChange={(val) =>
                      setPolicyBlockedUpTo(Math.max(0, Number(val) || 0))
                    }
                  />
                  <TextInput
                    dir="ltr"
                    label="גרסת APK אחרונה להצגה (אופציונלי)"
                    placeholder="למשל 1.0.3 (ברירת מחדל: אוטומטי)"
                    value={policyLatestName}
                    onChange={(e) => setPolicyLatestName(e.currentTarget.value)}
                  />
                  <TextInput
                    dir="ltr"
                    label="versionCode אחרון (אופציונלי)"
                    placeholder="למשל 10003"
                    value={policyLatestCode}
                    onChange={(e) =>
                      setPolicyLatestCode(
                        e.currentTarget.value.replace(/[^0-9]/g, '')
                      )
                    }
                  />
                </div>

                <div>
                  <TextInput
                    dir="ltr"
                    label="כתובת הורדת קובץ ה-APK (שמור אצלכם בשרת או Storage)"
                    description="ניתן להשאיר ריק לזיהוי אוטומטי מקובץ public/downloads/spot-fitness-release.apk או מ-GitHub Releases"
                    placeholder="/downloads/spot-fitness-release.apk או https://..."
                    value={policyApkUrl}
                    onChange={(e) => setPolicyApkUrl(e.currentTarget.value)}
                  />
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                      marginTop: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setPolicyApkUrl('/downloads/spot-fitness-release.apk')
                      }
                      className="btn-surface"
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      הגדר נתיב שרת מקומי (/downloads/spot-fitness-release.apk)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPolicyApkUrl('')}
                      className="btn-surface"
                      style={{
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      זיהוי אוטומטי / GitHub Releases
                    </button>
                  </div>
                </div>

                <Textarea
                  label="הערות גרסה שיוצגו במסך העדכון באנדרואיד (אופציונלי)"
                  placeholder="מה חדש בעדכון זה..."
                  minRows={2}
                  value={policyReleaseNotes}
                  onChange={(e) => setPolicyReleaseNotes(e.currentTarget.value)}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={isBusy('save-app-policy')}
                    className="btn-volt"
                    style={{
                      padding: '10px 18px',
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {isBusy('save-app-policy') ? (
                      <BusyIcon size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    <span>
                      {isBusy('save-app-policy')
                        ? 'שומר מדיניות...'
                        : 'שמור מדיניות גרסאות וחסימה'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          <QuickChipsAdminPanel
            scope="global"
            title="צ׳יפים מהירים גלובליים לכלל המשתמשים (Super Admin)"
            subtitle="צ׳יפים שתוסיף כאן יהיו זמינים לבחירה בקליק אחד לכל המתאמנים והמאמנים באפליקציה במסך ניתוח ה-AI."
            chips={globalQuickChips}
            onManageQuickChips={onManageQuickChips}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* לשונית סקרייפרים וניטור מאגר המזון (SUPER ADMIN בלבד)                */}
      {/* ===================================================================== */}
      {activeSection === 'scrapers' && isSuperAdmin && (
        <AdminScrapersPanel
          report={scraperReport}
          loading={scraperLoading}
          onReportUpdate={(next) => setScraperReport(next)}
          onNotify={(msg, isErr) => showToast(msg, isErr)}
        />
      )}

      {/* ===================================================================== */}
      {/* מודאלים: מתאמן חדש, קבוצה חדשה, שיתוף מאמנים, ומאמן חדש              */}
      {/* ===================================================================== */}

      {/* מודאל פתיחת מתאמן חדש */}
      <Modal
        opened={newTraineeModal}
        onClose={() => !isBusy('create-trainee') && setNewTraineeModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            פתיחת משתמש חדש למתאמן
          </span>
        }
        centered
        radius="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newTraineeName.trim() || !newTraineeEmail.trim()) return;
            const ok = await runBusy('create-trainee', () =>
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
              })
            );
            if (!ok) return;
            setNewTraineeName('');
            setNewTraineeEmail('');
            setNewTraineePassword('123456');
            setNewTraineePhone('');
            setNewTraineeModal(false);
            showToast('חשבון המתאמן נוצר והופעל!');
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <TextInput
            label="שם מלא של המתאמן"
            placeholder="למשל: דניאל אברהם"
            value={newTraineeName}
            onChange={(e) => setNewTraineeName(e.currentTarget.value)}
            required
          />
          <TextInput
            type="email"
            dir="ltr"
            label="אימייל כניסה של המתאמן"
            placeholder="daniel@gmail.com"
            value={newTraineeEmail}
            onChange={(e) => setNewTraineeEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            dir="ltr"
            label="סיסמה ראשונית למתאמן"
            value={newTraineePassword}
            onChange={(e) => setNewTraineePassword(e.currentTarget.value)}
            required
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            <TextInput
              type="tel"
              dir="ltr"
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
            type="submit"
            disabled={
              isBusy('create-trainee') ||
              !newTraineeName.trim() ||
              !newTraineeEmail.trim()
            }
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '11px',
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isBusy('create-trainee') && <BusyIcon size={16} />}
            <span>
              {isBusy('create-trainee')
                ? 'יוצר חשבון מתאמן...'
                : 'צור והפעל חשבון מתאמן'}
            </span>
          </button>
        </form>
      </Modal>

      {/* מודאל שיתוף מתאמן בין מאמנים */}
      <Modal
        opened={Boolean(sharingModalTrainee)}
        onClose={() => !isBusy('save-sharing') && setSharingModalTrainee(null)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            ניהול מאמנים והרשאות שיתוף — {sharingModalTrainee?.name}
          </span>
        }
        centered
        radius="lg"
      >
        {sharingModalTrainee && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await runBusy(
                'save-sharing',
                () =>
                  onUpdateTraineeSharing(
                    sharingModalTrainee.id,
                    sharingPrimaryId,
                    sharingCollaboratorIds
                  ),
                'הרשאות השיתוף של המתאמן עודכנו!'
              );
              if (ok) setSharingModalTrainee(null);
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
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
                  fontSize: 12,
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
              type="submit"
              disabled={isBusy('save-sharing')}
              className="btn-volt"
              style={{
                padding: '10px',
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isBusy('save-sharing') && <BusyIcon />}
              <span>
                {isBusy('save-sharing') ? 'שומר הרשאות...' : 'שמור הגדרות שיתוף'}
              </span>
            </button>
          </form>
        )}
      </Modal>

      {/* מודאל יצירת קבוצה חדשה */}
      <Modal
        opened={newGroupModal}
        onClose={() => !isBusy('create-group') && setNewGroupModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            יצירת קבוצת מתאמנים חדשה
          </span>
        }
        centered
        radius="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newGroupName.trim()) return;
            const ok = await runBusy(
              'create-group',
              () => onCreateGroup(newGroupName.trim(), newGroupColor),
              'הקבוצה נוצרה בהצלחה'
            );
            if (!ok) return;
            setNewGroupName('');
            setNewGroupModal(false);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
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
                  aria-label={`בחר צבע ${sw.label ?? sw.value}`}
                  onClick={() => setNewGroupColor(sw.value)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: sw.value,
                    border:
                      newGroupColor === sw.value
                        ? '3px solid #ffffff'
                        : '1px solid var(--line-2)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={isBusy('create-group') || !newGroupName.trim()}
            className="btn-volt"
            style={{
              padding: '10px',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isBusy('create-group') && <BusyIcon />}
            <span>{isBusy('create-group') ? 'יוצר קבוצה...' : 'צור קבוצה'}</span>
          </button>
        </form>
      </Modal>

      {/* מודאל הוספת מאמן חדש (Super Admin בלבד) */}
      <Modal
        opened={newCoachModal}
        onClose={() => !isBusy('create-coach') && setNewCoachModal(false)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            הוספת מאמן חדש
          </span>
        }
        centered
        radius="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (
              !newCoachName.trim() ||
              !newCoachEmail.trim() ||
              !newCoachInviteCode.trim()
            ) {
              return;
            }
            setCoachModalError(null);
            let errorMsg: string | undefined;
            const ok = await runBusy('create-coach', async () => {
              const res = await onCreateCoach({
                name: newCoachName.trim(),
                email: newCoachEmail.trim().toLowerCase(),
                password: newCoachPassword.trim() || '123456',
                phone: newCoachPhone.trim(),
                inviteCode: newCoachInviteCode.trim().toUpperCase(),
              });
              errorMsg = res.error;
              return undefined;
            });
            if (!ok) return;
            if (errorMsg) {
              setCoachModalError(errorMsg);
              return;
            }
            setNewCoachName('');
            setNewCoachEmail('');
            setNewCoachPassword('123456');
            setNewCoachPhone('');
            setNewCoachInviteCode('');
            setNewCoachModal(false);
            showToast('חשבון המאמן נוצר ונשמר בהצלחה!');
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          {coachModalError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.14)',
                color: 'var(--danger-text)',
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
            type="email"
            dir="ltr"
            label="אימייל כניסה למאמן"
            placeholder="dani@spot.co.il"
            value={newCoachEmail}
            onChange={(e) => setNewCoachEmail(e.currentTarget.value)}
            required
          />
          <PasswordInput
            dir="ltr"
            label="סיסמה ראשונית למאמן"
            value={newCoachPassword}
            onChange={(e) => setNewCoachPassword(e.currentTarget.value)}
            required
          />
          <TextInput
            type="tel"
            dir="ltr"
            label="טלפון"
            placeholder="052-0000000"
            value={newCoachPhone}
            onChange={(e) => setNewCoachPhone(e.currentTarget.value)}
          />
          <TextInput
            dir="ltr"
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
            type="submit"
            disabled={
              isBusy('create-coach') ||
              !newCoachName.trim() ||
              !newCoachEmail.trim() ||
              !newCoachInviteCode.trim()
            }
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '11px',
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isBusy('create-coach') && <BusyIcon size={16} />}
            <span>
              {isBusy('create-coach')
                ? 'יוצר מאמן ושומר במסד הנתונים...'
                : 'צור מאמן חדש'}
            </span>
          </button>
        </form>
      </Modal>

      {/* מודאל עדכון אימייל וסיסמה למתאמן */}
      <Modal
        opened={Boolean(credModalTrainee)}
        onClose={() => !isBusy('trainee-cred') && setCredModalTrainee(null)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            עריכת פרטי גישה — {credModalTrainee?.name}
          </span>
        }
        centered
        radius="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!credModalTrainee || !editEmail.trim()) return;
            const ok = await runBusy(
              'trainee-cred',
              () =>
                onUpdateTraineeCredentials(
                  credModalTrainee.id,
                  editEmail.trim().toLowerCase(),
                  editPassword.trim()
                ),
              'פרטי ההתחברות של המתאמן עודכנו'
            );
            if (ok) setCredModalTrainee(null);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <TextInput
            type="email"
            dir="ltr"
            label="אימייל כניסה"
            value={editEmail}
            onChange={(e) => setEditEmail(e.currentTarget.value)}
            required
          />
          <TextInput
            dir="ltr"
            label="סיסמה חדשה (הזן סיסמה חדשה לאיפוס)"
            placeholder="הקלד סיסמה חדשה עבור המתאמן"
            value={editPassword}
            onChange={(e) => setEditPassword(e.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={isBusy('trainee-cred') || !editEmail.trim()}
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '10px',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isBusy('trainee-cred') && <BusyIcon />}
            <span>
              {isBusy('trainee-cred') ? 'שומר...' : 'שמור סיסמה ואימייל'}
            </span>
          </button>
        </form>
      </Modal>

      {/* מודאל עדכון סיסמה וקוד הזמנה למאמן (Super Admin בלבד) */}
      <Modal
        opened={Boolean(credModalCoach)}
        onClose={() => !isBusy('coach-cred') && setCredModalCoach(null)}
        title={
          <span style={{ fontWeight: 800, fontSize: 16 }}>
            עריכת פרטי מאמן — {credModalCoach?.name}
          </span>
        }
        centered
        radius="lg"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!credModalCoach || !editCoachEmail.trim() || !editCoachInvite.trim()) {
              return;
            }
            const ok = await runBusy(
              'coach-cred',
              () =>
                onUpdateCoachCredentials(
                  credModalCoach.id,
                  editCoachEmail.trim().toLowerCase(),
                  editCoachPassword.trim(),
                  editCoachInvite.trim().toUpperCase()
                ),
              'פרטי המאמן עודכנו'
            );
            if (ok) setCredModalCoach(null);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <TextInput
            type="email"
            dir="ltr"
            label="אימייל כניסה של המאמן"
            value={editCoachEmail}
            onChange={(e) => setEditCoachEmail(e.currentTarget.value)}
            required
          />
          <TextInput
            dir="ltr"
            label="קוד הזמנה אישי למתאמנים"
            value={editCoachInvite}
            onChange={(e) =>
              setEditCoachInvite(e.currentTarget.value.toUpperCase())
            }
            required
          />
          <TextInput
            dir="ltr"
            label="סיסמה חדשה למאמן (אופציונלי)"
            placeholder="השאר ריק לשמירת הסיסמה הקיימת"
            value={editCoachPassword}
            onChange={(e) => setEditCoachPassword(e.currentTarget.value)}
          />
          <button
            type="submit"
            disabled={
              isBusy('coach-cred') ||
              !editCoachEmail.trim() ||
              !editCoachInvite.trim()
            }
            className="btn-volt"
            style={{
              marginTop: 8,
              padding: '10px',
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {isBusy('coach-cred') && <BusyIcon />}
            <span>{isBusy('coach-cred') ? 'שומר...' : 'שמור שינויים'}</span>
          </button>
        </form>
      </Modal>

      <CoachPushModal
        opened={Boolean(pushModalTrainee)}
        onClose={() => setPushModalTraineeId(null)}
        trainee={pushModalTrainee}
        todayIso={today}
        onPushSent={onRefreshData}
      />

      <CoachAlertSettingsModal
        opened={coachAlertsModalOpen}
        onClose={() => setCoachAlertsModalOpen(false)}
        coachId={currentUser.id}
        trainees={trainees}
        groups={groups}
        settings={coachPushSettings}
        onSettingsUpdated={(next) => onCoachPushSettingsUpdated?.(next)}
        onRefreshData={onRefreshData}
      />
    </div>
  );
}
