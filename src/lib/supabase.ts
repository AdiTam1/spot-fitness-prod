import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AccountStatus,
  AppReleasePolicy,
  AppUpdatePushHistoryEntry,
  BodyMeasurementEntry,
  CoachOnboardingData,
  CoachProfile,
  CoachPushSubscriptionSettings,
  CustomFoodItem,
  FoodCatalogItem,
  FoodCatalogSourceId,
  FoodUnit,
  NutritionTemplate,
  PendingAiMealJob,
  QuickContextChip,
  SavedMealPreset,
  ScraperSuiteReport,
  SqlFoodCatalogStats,
  TraineeActivityTargets,
  TraineeCustomUnit,
  TraineeGroup,
  TraineeOnboardingData,
  TraineeProfile,
  TraineeServingTool,
  UserClientVersionInfo,
  UserFoodHistoryItem,
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import {
  escapeSqlLikePattern,
  isValidMacroSet,
  normalizeFoodKey,
  normalizeFoodSearchQuery,
  roundMacros,
} from '@/lib/scrapers/helpers';

const cleanEnv = (v?: string) =>
  (v || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]+/g, '')
    .trim();

function normalizeSupabaseBaseUrl(raw?: string): string {
  const cleaned = cleanEnv(raw);
  if (!cleaned) return '';
  const withProto = /^https?:\/\//i.test(cleaned)
    ? cleaned
    : `https://${cleaned}`;
  try {
    const parsed = new URL(withProto);
    if (
      parsed.hostname.endsWith('.supabase.co') ||
      parsed.hostname.endsWith('.supabase.in')
    ) {
      return parsed.origin;
    }
    const strippedPath = parsed.pathname
      .replace(/\/(rest|auth|storage|realtime)\/v1.*$/i, '')
      .replace(/\/+$/, '');
    return `${parsed.origin}${strippedPath}`;
  } catch {
    return cleaned
      .replace(/\/(rest|auth|storage|realtime)\/v1.*$/i, '')
      .replace(/\/+$/, '');
  }
}

const supabaseUrl = normalizeSupabaseBaseUrl(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
);
const supabaseKey = cleanEnv(
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      // חיוני ב-Next.js 14: מונע משכבת ה-Data Cache לשמור תשובות GET ישנות מ-Supabase
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, {
            ...init,
            cache: 'no-store',
          }),
      },
    })
  : null;

function mapRowToCoach(row: Record<string, unknown>): CoachProfile {
  const name = String(row.name || 'מאמן');
  const onboarding =
    row.onboarding &&
    typeof row.onboarding === 'object' &&
    Object.keys(row.onboarding as object).length > 0
      ? (row.onboarding as CoachOnboardingData)
      : undefined;

  return {
    id: String(row.id),
    email: String(row.email || ''),
    password: String(row.password || ''),
    name,
    avatar: String(row.avatar || name.charAt(0) || 'מ'),
    phone: String(row.phone || ''),
    inviteCode: String(row.invite_code || ''),
    status: row.status === 'paused' ? 'paused' : 'active',
    sessionVersion:
      typeof row.session_version === 'number' && Number.isFinite(row.session_version)
        ? row.session_version
        : undefined,
    lastSeenAt: typeof row.last_seen_at === 'string' ? row.last_seen_at : undefined,
    onboarding,
  };
}

function mapRowToGroup(row: Record<string, unknown>): TraineeGroup {
  return {
    id: String(row.id),
    name: String(row.name || 'קבוצה'),
    color: String(row.color || '#d67d09'),
    ownerCoachId: String(row.owner_coach_id || 'coach-admin'),
    customQuickChips: Array.isArray(row.custom_quick_chips)
      ? (row.custom_quick_chips as QuickContextChip[])
      : undefined,
  };
}

interface EmbeddedTraineeMeta {
  onboarding?: TraineeOnboardingData;
  activityTargets?: TraineeActivityTargets;
  enableWorkoutRestSplit?: boolean;
  coachAiNotes?: string;
  aiLearnedPreferences?: string[];
  weeklyCheckIns?: WeeklyCheckInEntry[];
  measurementsHistory?: BodyMeasurementEntry[];
  observationDates?: string[];
  blockedDates?: string[];
  restrictToObservationDaysWhenTodayIsObservation?: boolean;
  countObservationInStats?: boolean;
  activeDateRange?: TraineeProfile['activeDateRange'];
  metricsSchedule?: TraineeProfile['metricsSchedule'];
  mealCardShortcuts?: TraineeProfile['mealCardShortcuts'];
  savedMeals?: SavedMealPreset[];
  customServingTools?: TraineeServingTool[];
  customFoodUnits?: TraineeCustomUnit[];
  customFoods?: CustomFoodItem[];
  recentContextChips?: QuickContextChip[];
  pendingAiJobs?: PendingAiMealJob[];
  fcmTokens?: TraineeProfile['fcmTokens'];
  webPushSubscriptions?: TraineeProfile['webPushSubscriptions'];
  pushPreferences?: TraineeProfile['pushPreferences'];
  lastForegroundState?: TraineeProfile['lastForegroundState'];
  pushHistory?: TraineeProfile['pushHistory'];
  primaryCoachId?: string;
  sharedCoachIds?: string[];
  groupId?: string | null;
  sessionVersion?: number;
  lastSeenAt?: string;
}

function mapRowToTrainee(row: Record<string, unknown>): TraineeProfile {
  const name = String(row.name || 'מתאמן');
  const rawLogs =
    row.logs && typeof row.logs === 'object'
      ? { ...(row.logs as Record<string, unknown>) }
      : {};

  const embeddedMeta = (rawLogs.__profile_meta || {}) as EmbeddedTraineeMeta;
  delete rawLogs.__profile_meta;

  const onboarding =
    row.onboarding &&
    typeof row.onboarding === 'object' &&
    Object.keys(row.onboarding as object).length > 0
      ? (row.onboarding as TraineeOnboardingData)
      : embeddedMeta.onboarding;

  const measurementsHistory = Array.isArray(embeddedMeta.measurementsHistory)
    ? embeddedMeta.measurementsHistory
    : Array.isArray(row.measurements_history)
    ? (row.measurements_history as BodyMeasurementEntry[])
    : [];

  const observationDates = Array.isArray(embeddedMeta.observationDates)
    ? embeddedMeta.observationDates
    : Array.isArray(row.observation_dates)
    ? (row.observation_dates as string[])
    : [];

  const blockedDates = Array.isArray(embeddedMeta.blockedDates)
    ? embeddedMeta.blockedDates
    : Array.isArray(row.blocked_dates)
    ? (row.blocked_dates as string[])
    : [];

  const restrictToObservationDaysWhenTodayIsObservation =
    'restrictToObservationDaysWhenTodayIsObservation' in embeddedMeta
      ? Boolean(embeddedMeta.restrictToObservationDaysWhenTodayIsObservation)
      : Boolean(row.restrict_to_obs_on_obs_days);

  const countObservationInStats =
    'countObservationInStats' in embeddedMeta
      ? Boolean(embeddedMeta.countObservationInStats)
      : Boolean(row.count_observation_in_stats);

  const rowActivityTargets =
    row.activity_targets &&
    typeof row.activity_targets === 'object' &&
    Object.keys(row.activity_targets as object).length > 0
      ? (row.activity_targets as TraineeActivityTargets)
      : undefined;

  const defaultActivityTargets: TraineeActivityTargets = {
    weeklyWorkoutsTarget: 4,
    workoutTypes: ['אימון כוח A', 'אימון כוח B', 'Full Body'],
    weeklyCardioTarget: 3,
    cardioMode: 'both',
    cardioTargetMinutes: 35,
    dailySleepTargetHours: 7.5,
    dailyStepsTarget: 8000,
  };

  const activityTargets: TraineeActivityTargets = {
    ...defaultActivityTargets,
    ...(embeddedMeta.activityTargets || rowActivityTargets || {}),
    dailyStepsTarget:
      embeddedMeta.activityTargets?.dailyStepsTarget ??
      rowActivityTargets?.dailyStepsTarget ??
      8000,
  };

  return {
    id: String(row.id),
    email: String(row.email || ''),
    password: String(row.password || ''),
    status: (row.status as AccountStatus) || 'active',
    name,
    avatar: String(row.avatar || name.charAt(0) || 'מ'),
    phone: String(row.phone || ''),
    goal: String(row.goal || ''),
    currentWeight: Number(row.current_weight) || 75,
    targetWeight: Number(row.target_weight) || 70,
    tolerancePercent: Number(row.tolerance_percent) || 10,
    primaryCoachId: String(
      embeddedMeta.primaryCoachId || row.primary_coach_id || 'coach-admin'
    ),
    sharedCoachIds: Array.isArray(embeddedMeta.sharedCoachIds)
      ? embeddedMeta.sharedCoachIds
      : Array.isArray(row.shared_coach_ids)
      ? (row.shared_coach_ids as string[])
      : [],
    groupId:
      'groupId' in embeddedMeta
        ? embeddedMeta.groupId || undefined
        : row.group_id
        ? String(row.group_id)
        : undefined,
    workoutTemplate: row.workout_template as NutritionTemplate,
    restTemplate: row.rest_template as NutritionTemplate,
    favoriteFoodIds: Array.isArray(row.favorite_food_ids)
      ? (row.favorite_food_ids as string[])
      : [],
    weightHistory: Array.isArray(row.weight_history)
      ? (row.weight_history as { date: string; weight: number }[])
      : [],
    measurementsHistory,
    onboarding,
    activityTargets,
    enableWorkoutRestSplit:
      'enableWorkoutRestSplit' in embeddedMeta
        ? Boolean(embeddedMeta.enableWorkoutRestSplit)
        : Boolean(row.enable_workout_rest_split),
    coachAiNotes:
      'coachAiNotes' in embeddedMeta
        ? embeddedMeta.coachAiNotes || ''
        : String(row.coach_ai_notes || ''),
    aiLearnedPreferences: Array.isArray(embeddedMeta.aiLearnedPreferences)
      ? embeddedMeta.aiLearnedPreferences
      : Array.isArray(row.ai_learned_preferences)
      ? (row.ai_learned_preferences as string[])
      : [],
    weeklyCheckIns: Array.isArray(embeddedMeta.weeklyCheckIns)
      ? embeddedMeta.weeklyCheckIns
      : Array.isArray(row.weekly_check_ins)
      ? (row.weekly_check_ins as WeeklyCheckInEntry[])
      : [],
    observationDates,
    blockedDates,
    restrictToObservationDaysWhenTodayIsObservation,
    countObservationInStats,
    activeDateRange: embeddedMeta.activeDateRange,
    metricsSchedule: embeddedMeta.metricsSchedule,
    mealCardShortcuts: Array.isArray(embeddedMeta.mealCardShortcuts)
      ? embeddedMeta.mealCardShortcuts
      : undefined,
    savedMeals: Array.isArray(embeddedMeta.savedMeals)
      ? embeddedMeta.savedMeals
      : Array.isArray(row.saved_meals)
      ? (row.saved_meals as SavedMealPreset[])
      : [],
    customServingTools: Array.isArray(embeddedMeta.customServingTools)
      ? embeddedMeta.customServingTools
      : Array.isArray(row.custom_serving_tools)
      ? (row.custom_serving_tools as TraineeServingTool[])
      : [],
    customFoodUnits: Array.isArray(embeddedMeta.customFoodUnits)
      ? embeddedMeta.customFoodUnits
      : Array.isArray(row.custom_food_units)
      ? (row.custom_food_units as TraineeCustomUnit[])
      : [],
    customFoods: Array.isArray(embeddedMeta.customFoods)
      ? (embeddedMeta.customFoods as CustomFoodItem[])
      : [],
    recentContextChips: Array.isArray(embeddedMeta.recentContextChips)
      ? embeddedMeta.recentContextChips
      : Array.isArray(row.recent_context_chips)
      ? (row.recent_context_chips as QuickContextChip[])
      : [],
    pendingAiJobs: Array.isArray(embeddedMeta.pendingAiJobs)
      ? embeddedMeta.pendingAiJobs
      : Array.isArray(row.pending_ai_jobs)
      ? (row.pending_ai_jobs as PendingAiMealJob[])
      : [],
    fcmTokens: Array.isArray(embeddedMeta.fcmTokens)
      ? embeddedMeta.fcmTokens
      : [],
    webPushSubscriptions: Array.isArray(embeddedMeta.webPushSubscriptions)
      ? embeddedMeta.webPushSubscriptions
      : [],
    pushPreferences: embeddedMeta.pushPreferences || {
      aiMealReady: true,
      coachMessages: true,
    },
    lastForegroundState: embeddedMeta.lastForegroundState,
    pushHistory: Array.isArray(embeddedMeta.pushHistory)
      ? embeddedMeta.pushHistory
      : [],
    logs: rawLogs as TraineeProfile['logs'],
    sessionVersion: Math.max(
      1,
      Number(row.session_version) || 1,
      Number(embeddedMeta.sessionVersion) || 1
    ),
    lastSeenAt:
      typeof row.last_seen_at === 'string' &&
      (!embeddedMeta.lastSeenAt ||
        Date.parse(row.last_seen_at) >= Date.parse(embeddedMeta.lastSeenAt))
        ? row.last_seen_at
        : embeddedMeta.lastSeenAt,
  };
}

const SYSTEM_META_TEMPLATE_ID = '__spot_system_coaches_and_groups__';
const SCRAPER_META_TEMPLATE_ID = '__spot_system_food_scrapers_meta__';
const SCRAPER_CATALOG_TEMPLATE_ID = '__spot_system_food_scrapers_catalog__';

type SbErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null;

function formatSupabaseError(table: string, error: SbErrorLike): string {
  if (!error) return '';
  const code = error.code ? `[${error.code}] ` : '';
  const hint = error.hint ? ` (${error.hint})` : '';
  return `${table}: ${code}${error.message || 'Unknown error'}${hint}`;
}

export function diagnoseSupabaseError(rawMessage: string): string {
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('pgrst125') ||
    lower.includes('invalid path specified')
  ) {
    return `כתובת ה-SUPABASE_URL בשרת אינה תקינה (כוללת נתיב עודף כמו /rest/v1 — יש להגדיר רק https://<project-ref>.supabase.co). (${rawMessage})`;
  }
  if (lower.includes('row-level security') || lower.includes('42501')) {
    return `חסימת הרשאות במסד הנתונים (RLS): יש להריץ את פקודות ה-POLICY מתוך supabase/schema.sql ב-SQL Editor של Supabase, או להגדיר SUPABASE_SERVICE_ROLE_KEY בהגדרות Vercel. (${rawMessage})`;
  }
  if (
    lower.includes('invalid api key') ||
    lower.includes('jwt') ||
    lower.includes('permission denied')
  ) {
    return `מפתח ה-Supabase שמוגדר בשרת אינו תקין או חסר הרשאות כתיבה — בדוק את SUPABASE_URL ו-SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ב-Vercel. (${rawMessage})`;
  }
  if (
    lower.includes('column') ||
    lower.includes('pgrst204') ||
    lower.includes('42703') ||
    lower.includes('schema cache')
  ) {
    return `מבנה הטבלאות ב-Supabase אינו מעודכן — יש להריץ את supabase/schema.sql המלא ב-SQL Editor. (${rawMessage})`;
  }
  if (lower.includes('duplicate key') || lower.includes('23505')) {
    return `ערך כפול במאגר (אימייל או קוד הזמנה כבר קיימים במסד הנתונים). (${rawMessage})`;
  }
  if (lower.includes('fetch failed') || lower.includes('enotfound')) {
    return `כשל בחיבור הרשת ל-Supabase — בדוק את SUPABASE_URL בהגדרות השרת. (${rawMessage})`;
  }
  return `שגיאה בשמירת נתונים מול Supabase: ${rawMessage}`;
}

let metaWriteQueue: Promise<unknown> = Promise.resolve();

export async function loadStateFromSupabase(): Promise<{
  coaches: CoachProfile[];
  groups: TraineeGroup[];
  templates: NutritionTemplate[];
  trainees: TraineeProfile[];
  globalQuickChips: QuickContextChip[];
  globalCustomFoods: CustomFoodItem[];
  coachCustomFoods: Record<string, CustomFoodItem[]>;
  coachPushSettings: Record<string, CoachPushSubscriptionSettings>;
  appReleasePolicy?: AppReleasePolicy;
  userClientVersions?: Record<string, UserClientVersionInfo>;
  appUpdatePushHistory?: AppUpdatePushHistoryEntry[];
  readErrors: string[];
}> {
  if (!supabase) {
    return {
      coaches: [],
      groups: [],
      templates: [],
      trainees: [],
      globalQuickChips: [],
      globalCustomFoods: [],
      coachCustomFoods: {},
      coachPushSettings: {},
      appReleasePolicy: undefined,
      userClientVersions: {},
      appUpdatePushHistory: [],
      readErrors: [],
    };
  }

  const [coachesRes, groupsRes, tplRes, trRes] = await Promise.all([
    supabase.from('coaches').select('*'),
    supabase.from('trainee_groups').select('*'),
    supabase
      .from('nutrition_templates')
      .select('*')
      .not('id', 'like', '__spot_system_food_%'),
    supabase.from('trainees').select('*'),
  ]);

  const readErrors: string[] = [];
  if (coachesRes.error) {
    readErrors.push(formatSupabaseError('coaches', coachesRes.error));
  }
  if (groupsRes.error) {
    readErrors.push(formatSupabaseError('trainee_groups', groupsRes.error));
  }
  if (tplRes.error) {
    readErrors.push(formatSupabaseError('nutrition_templates', tplRes.error));
  }
  if (trRes.error) {
    readErrors.push(formatSupabaseError('trainees', trRes.error));
  }

  const rawTemplates = Array.isArray(tplRes.data) ? tplRes.data : [];
  const systemMetaRow = rawTemplates.find(
    (r) => r.id === SYSTEM_META_TEMPLATE_ID
  );
  let fallbackCoaches: CoachProfile[] = [];
  let fallbackGroups: TraineeGroup[] = [];
  let globalQuickChips: QuickContextChip[] = [];
  let globalCustomFoods: CustomFoodItem[] = [];
  let coachCustomFoods: Record<string, CustomFoodItem[]> = {};
  let coachPushSettings: Record<string, CoachPushSubscriptionSettings> = {};
  let appReleasePolicy: AppReleasePolicy | undefined;
  let userClientVersions: Record<string, UserClientVersionInfo> = {};
  let appUpdatePushHistory: AppUpdatePushHistoryEntry[] = [];

  if (
    systemMetaRow &&
    systemMetaRow.meals &&
    typeof systemMetaRow.meals === 'object'
  ) {
    const metaObj = systemMetaRow.meals as {
      coaches?: CoachProfile[];
      groups?: TraineeGroup[];
      globalQuickChips?: QuickContextChip[];
      globalCustomFoods?: CustomFoodItem[];
      coachCustomFoods?: Record<string, CustomFoodItem[]>;
      coachPushSettings?: Record<string, CoachPushSubscriptionSettings>;
      appReleasePolicy?: AppReleasePolicy;
      userClientVersions?: Record<string, UserClientVersionInfo>;
      appUpdatePushHistory?: AppUpdatePushHistoryEntry[];
    };
    if (Array.isArray(metaObj.coaches)) {
      fallbackCoaches = metaObj.coaches;
    }
    if (Array.isArray(metaObj.groups)) {
      fallbackGroups = metaObj.groups;
    }
    if (Array.isArray(metaObj.globalQuickChips)) {
      globalQuickChips = metaObj.globalQuickChips;
    }
    if (Array.isArray(metaObj.globalCustomFoods)) {
      globalCustomFoods = metaObj.globalCustomFoods;
    }
    if (
      metaObj.coachCustomFoods &&
      typeof metaObj.coachCustomFoods === 'object'
    ) {
      coachCustomFoods = metaObj.coachCustomFoods;
    }
    if (
      metaObj.coachPushSettings &&
      typeof metaObj.coachPushSettings === 'object'
    ) {
      coachPushSettings = metaObj.coachPushSettings;
    }
    if (
      metaObj.appReleasePolicy &&
      typeof metaObj.appReleasePolicy === 'object'
    ) {
      appReleasePolicy = metaObj.appReleasePolicy;
    }
    if (
      metaObj.userClientVersions &&
      typeof metaObj.userClientVersions === 'object'
    ) {
      userClientVersions = metaObj.userClientVersions;
    }
    if (Array.isArray(metaObj.appUpdatePushHistory)) {
      appUpdatePushHistory = metaObj.appUpdatePushHistory;
    }
  }

  const tableCoaches: CoachProfile[] = Array.isArray(coachesRes.data)
    ? coachesRes.data.map((r) => mapRowToCoach(r))
    : [];

  // מיזוג חכם: אם טבלת coaches החזירה שורות נשתמש בהן + נשלים מאמנים שנשמרו בגיבוי
  const coachMap = new Map<string, CoachProfile>();
  for (const fc of fallbackCoaches) {
    coachMap.set(fc.id, {
      ...fc,
      sessionVersion: fc.sessionVersion ?? 1,
    });
  }
  for (const tc of tableCoaches) {
    const existingFallback = coachMap.get(tc.id);
    const mergedSv = Math.max(
      1,
      tc.sessionVersion ?? 1,
      existingFallback?.sessionVersion ?? 1
    );
    const mergedLastSeen =
      tc.lastSeenAt &&
      (!existingFallback?.lastSeenAt ||
        Date.parse(tc.lastSeenAt) >= Date.parse(existingFallback.lastSeenAt))
        ? tc.lastSeenAt
        : existingFallback?.lastSeenAt;
    coachMap.set(tc.id, {
      ...tc,
      sessionVersion: mergedSv,
      lastSeenAt: mergedLastSeen,
      onboarding: tc.onboarding || existingFallback?.onboarding,
    });
  }
  const coaches = Array.from(coachMap.values());

  const tableGroups: TraineeGroup[] = Array.isArray(groupsRes.data)
    ? groupsRes.data.map((r) => mapRowToGroup(r))
    : [];
  const groupMap = new Map<string, TraineeGroup>();
  for (const fg of fallbackGroups) {
    groupMap.set(fg.id, fg);
  }
  for (const tg of tableGroups) {
    const existingFallback = groupMap.get(tg.id);
    groupMap.set(tg.id, {
      ...tg,
      customQuickChips:
        tg.customQuickChips !== undefined
          ? tg.customQuickChips
          : existingFallback?.customQuickChips,
    });
  }
  const groups = Array.from(groupMap.values());

  const templates: NutritionTemplate[] = rawTemplates
    .filter((row) => !String(row.id || '').startsWith('__spot_system_'))
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      dayType: row.day_type || 'workout',
      tolerancePercent: Number(row.tolerance_percent) || 10,
      ownerCoachId: String(row.owner_coach_id || 'coach-admin'),
      meals: Array.isArray(row.meals) ? row.meals : [],
    }));

  const trainees: TraineeProfile[] = Array.isArray(trRes.data)
    ? trRes.data.map((row) => mapRowToTrainee(row))
    : [];

  return {
    coaches,
    groups,
    templates,
    trainees,
    globalQuickChips,
    globalCustomFoods,
    coachCustomFoods,
    coachPushSettings,
    appReleasePolicy,
    userClientVersions,
    appUpdatePushHistory,
    readErrors,
  };
}

export interface LiveAuthRecord {
  id: string;
  role: 'trainee' | 'coach';
  name: string;
  status: AccountStatus;
  sessionVersion: number;
  lastSeenAt?: string;
}

export async function loadTraineeLiveAuthState(
  traineeId: string
): Promise<LiveAuthRecord | null> {
  if (!supabase) return null;
  const fastRes = await supabase
    .from('trainees')
    .select('id, status, name, session_version, last_seen_at')
    .eq('id', traineeId)
    .maybeSingle();

  if (!fastRes.error && fastRes.data) {
    return {
      id: String(fastRes.data.id),
      role: 'trainee',
      name: String(fastRes.data.name || 'מתאמן'),
      status: (fastRes.data.status as AccountStatus) || 'active',
      sessionVersion: Math.max(1, Number(fastRes.data.session_version) || 1),
      lastSeenAt:
        typeof fastRes.data.last_seen_at === 'string'
          ? fastRes.data.last_seen_at
          : undefined,
    };
  }

  // Fallback אם עמודת session_version טרם הורצה ב-SQL Editor
  const full = await loadSingleTraineeFromSupabase(traineeId);
  if (!full) return null;
  return {
    id: full.id,
    role: 'trainee',
    name: full.name,
    status: full.status || 'active',
    sessionVersion: Math.max(1, Number(full.sessionVersion) || 1),
    lastSeenAt: full.lastSeenAt,
  };
}

export async function loadCoachLiveAuthState(
  coachId: string
): Promise<LiveAuthRecord | null> {
  if (!supabase) return null;
  const fastRes = await supabase
    .from('coaches')
    .select('id, status, name, session_version, last_seen_at')
    .eq('id', coachId)
    .maybeSingle();

  if (!fastRes.error && fastRes.data) {
    return {
      id: String(fastRes.data.id),
      role: 'coach',
      name: String(fastRes.data.name || 'מאמן'),
      status: fastRes.data.status === 'paused' ? 'paused' : 'active',
      sessionVersion: Math.max(1, Number(fastRes.data.session_version) || 1),
      lastSeenAt:
        typeof fastRes.data.last_seen_at === 'string'
          ? fastRes.data.last_seen_at
          : undefined,
    };
  }

  const full = await loadSingleCoachFromSupabase(coachId);
  if (!full) return null;
  return {
    id: full.id,
    role: 'coach',
    name: full.name,
    status: full.status || 'active',
    sessionVersion: Math.max(1, Number(full.sessionVersion) || 1),
    lastSeenAt: full.lastSeenAt,
  };
}

export async function touchUserLastSeenInSupabase(
  role: 'trainee' | 'coach',
  userId: string,
  nowIso: string
): Promise<void> {
  if (!supabase) return;
  const table = role === 'trainee' ? 'trainees' : 'coaches';
  try {
    await supabase
      .from(table)
      .update({ last_seen_at: nowIso })
      .eq('id', userId);
  } catch {
    // שקט: לא חוסם פעילות אם טרם רצה סכמה מעודכנת
  }
}

export async function loadAppReleasePolicyFromSupabase(): Promise<AppReleasePolicy> {
  const defaultPolicy: AppReleasePolicy = {
    androidBlockedUpToVersionCode: 0,
  };
  if (!supabase) return defaultPolicy;
  try {
    const { data, error } = await supabase
      .from('nutrition_templates')
      .select('meals')
      .eq('id', SYSTEM_META_TEMPLATE_ID)
      .maybeSingle();
    if (error || !data?.meals || typeof data.meals !== 'object') {
      return defaultPolicy;
    }
    const raw = (data.meals as { appReleasePolicy?: AppReleasePolicy })
      .appReleasePolicy;
    if (!raw || typeof raw !== 'object') return defaultPolicy;
    return {
      ...defaultPolicy,
      ...raw,
      androidBlockedUpToVersionCode: Math.max(
        0,
        Math.round(Number(raw.androidBlockedUpToVersionCode) || 0)
      ),
    };
  } catch {
    return defaultPolicy;
  }
}

export async function loadSingleTraineeFromSupabase(
  traineeId: string
): Promise<TraineeProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('trainees')
    .select('*')
    .eq('id', traineeId)
    .single();
  if (error || !data) return null;
  return mapRowToTrainee(data);
}

export async function loadSingleCoachFromSupabase(
  coachId: string
): Promise<CoachProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('coaches')
    .select('*')
    .eq('id', coachId)
    .single();
  if (!error && data) {
    return mapRowToCoach(data);
  }
  // גיבוי מרשומת המערכת אם טבלת coaches חסומה ע"י RLS או חסרת עמודה
  const fullState = await loadStateFromSupabase();
  return fullState.coaches.find((c) => c.id === coachId) || null;
}

export async function loadQuickChipsContextForTraineeFromSupabase(
  groupId?: string
): Promise<{
  globalQuickChips: QuickContextChip[];
  groupQuickChips: QuickContextChip[];
}> {
  if (!supabase) return { globalQuickChips: [], groupQuickChips: [] };

  const [metaRes, grpRes] = await Promise.all([
    supabase
      .from('nutrition_templates')
      .select('meals')
      .eq('id', SYSTEM_META_TEMPLATE_ID)
      .maybeSingle(),
    groupId
      ? supabase
          .from('trainee_groups')
          .select('custom_quick_chips')
          .eq('id', groupId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  let globalQuickChips: QuickContextChip[] = [];
  let fallbackGroups: TraineeGroup[] = [];
  const metaMeals = metaRes.data?.meals as
    | { globalQuickChips?: QuickContextChip[]; groups?: TraineeGroup[] }
    | undefined;
  if (metaMeals && typeof metaMeals === 'object') {
    if (Array.isArray(metaMeals.globalQuickChips)) {
      globalQuickChips = metaMeals.globalQuickChips;
    }
    if (Array.isArray(metaMeals.groups)) {
      fallbackGroups = metaMeals.groups;
    }
  }

  let groupQuickChips: QuickContextChip[] = [];
  if (groupId) {
    const rowChips = (grpRes.data as { custom_quick_chips?: QuickContextChip[] } | null)
      ?.custom_quick_chips;
    if (Array.isArray(rowChips)) {
      groupQuickChips = rowChips;
    } else {
      const fb = fallbackGroups.find((g) => g.id === groupId);
      if (Array.isArray(fb?.customQuickChips)) {
        groupQuickChips = fb.customQuickChips;
      }
    }
  }

  return { globalQuickChips, groupQuickChips };
}

export async function loadCustomFoodsContextFromSupabase(
  coachIds?: string[]
): Promise<{
  globalCustomFoods: CustomFoodItem[];
  coachCustomFoods: Record<string, CustomFoodItem[]>;
}> {
  if (!supabase) return { globalCustomFoods: [], coachCustomFoods: {} };
  try {
    const { data } = await supabase
      .from('nutrition_templates')
      .select('meals')
      .eq('id', SYSTEM_META_TEMPLATE_ID)
      .maybeSingle();

    const metaMeals = data?.meals as
      | {
          globalCustomFoods?: CustomFoodItem[];
          coachCustomFoods?: Record<string, CustomFoodItem[]>;
        }
      | undefined;

    const globalCustomFoods = Array.isArray(metaMeals?.globalCustomFoods)
      ? metaMeals.globalCustomFoods
      : [];
    const rawCoachFoods =
      metaMeals?.coachCustomFoods && typeof metaMeals.coachCustomFoods === 'object'
        ? metaMeals.coachCustomFoods
        : {};

    if (!Array.isArray(coachIds)) {
      return { globalCustomFoods, coachCustomFoods: rawCoachFoods };
    }
    const filtered: Record<string, CustomFoodItem[]> = {};
    for (const cId of coachIds) {
      if (Array.isArray(rawCoachFoods[cId])) {
        filtered[cId] = rawCoachFoods[cId];
      }
    }
    return { globalCustomFoods, coachCustomFoods: filtered };
  } catch {
    return { globalCustomFoods: [], coachCustomFoods: {} };
  }
}

export interface SystemMetaShape {
  coaches?: CoachProfile[];
  groups?: TraineeGroup[];
  globalQuickChips?: QuickContextChip[];
  globalCustomFoods?: CustomFoodItem[];
  coachCustomFoods?: Record<string, CustomFoodItem[]>;
  coachPushSettings?: Record<string, CoachPushSubscriptionSettings>;
  appReleasePolicy?: AppReleasePolicy;
  userClientVersions?: Record<string, UserClientVersionInfo>;
  appUpdatePushHistory?: AppUpdatePushHistoryEntry[];
}

async function mutateSystemMetaBackup(
  buildPartial: (currentMeta: SystemMetaShape) => SystemMetaShape | null
): Promise<{ ok: boolean; error?: string; meta?: SystemMetaShape }> {
  const run = async (): Promise<{
    ok: boolean;
    error?: string;
    meta?: SystemMetaShape;
  }> => {
    if (!supabase) return { ok: false, error: 'Supabase client not configured' };

    const { data: existing, error: readErr } = await supabase
      .from('nutrition_templates')
      .select('*')
      .eq('id', SYSTEM_META_TEMPLATE_ID)
      .maybeSingle();

    const currentMeta: SystemMetaShape =
      existing && existing.meals && typeof existing.meals === 'object'
        ? (existing.meals as SystemMetaShape)
        : {};

    const partial = buildPartial(currentMeta);
    if (!partial) {
      return { ok: true, meta: currentMeta };
    }

    const mergedMeta: SystemMetaShape = {
      coaches:
        partial.coaches !== undefined
          ? partial.coaches
          : currentMeta.coaches || [],
      groups:
        partial.groups !== undefined
          ? partial.groups
          : currentMeta.groups || [],
      globalQuickChips:
        partial.globalQuickChips !== undefined
          ? partial.globalQuickChips
          : currentMeta.globalQuickChips || [],
      globalCustomFoods:
        partial.globalCustomFoods !== undefined
          ? partial.globalCustomFoods
          : currentMeta.globalCustomFoods || [],
      coachCustomFoods:
        partial.coachCustomFoods !== undefined
          ? partial.coachCustomFoods
          : currentMeta.coachCustomFoods || {},
      coachPushSettings:
        partial.coachPushSettings !== undefined
          ? partial.coachPushSettings
          : currentMeta.coachPushSettings || {},
      appReleasePolicy:
        partial.appReleasePolicy !== undefined
          ? partial.appReleasePolicy
          : currentMeta.appReleasePolicy,
      userClientVersions:
        partial.userClientVersions !== undefined
          ? partial.userClientVersions
          : currentMeta.userClientVersions || {},
      appUpdatePushHistory:
        partial.appUpdatePushHistory !== undefined
          ? partial.appUpdatePushHistory
          : currentMeta.appUpdatePushHistory || [],
    };

    const attempts: Record<string, unknown>[] = [
      {
        id: SYSTEM_META_TEMPLATE_ID,
        name: '__SYSTEM_META__',
        description: 'System backup for coaches and groups',
        day_type: 'workout',
        tolerance_percent: 10,
        owner_coach_id: 'coach-admin',
        meals: mergedMeta,
        updated_at: new Date().toISOString(),
      },
      {
        id: SYSTEM_META_TEMPLATE_ID,
        name: '__SYSTEM_META__',
        description: 'System backup for coaches and groups',
        day_type: 'workout',
        tolerance_percent: 10,
        meals: mergedMeta,
        updated_at: new Date().toISOString(),
      },
      {
        id: SYSTEM_META_TEMPLATE_ID,
        name: '__SYSTEM_META__',
        day_type: 'workout',
        tolerance_percent: 10,
        meals: mergedMeta,
      },
    ];

    let lastErr: SbErrorLike = readErr;
    for (const row of attempts) {
      const { error } = await supabase
        .from('nutrition_templates')
        .upsert([row], { onConflict: 'id' });
      if (!error) {
        return { ok: true, meta: mergedMeta };
      }
      lastErr = error;
    }

    return {
      ok: false,
      error: formatSupabaseError('nutrition_templates(meta)', lastErr),
    };
  };

  const queued = metaWriteQueue.then(run, run);
  metaWriteQueue = queued.then(
    () => undefined,
    () => undefined
  );
  return queued;
}

export async function saveSystemMetaBackup(
  partial: SystemMetaShape
): Promise<{ ok: boolean; error?: string }> {
  const res = await mutateSystemMetaBackup(() => partial);
  return { ok: res.ok, error: res.error };
}

export async function recordUserClientVersionInSupabase(
  key: string,
  info: UserClientVersionInfo
): Promise<void> {
  if (!supabase) return;
  await mutateSystemMetaBackup((current) => {
    const existingMap = current.userClientVersions || {};
    const prev = existingMap[key];
    if (prev) {
      const prevTs = Date.parse(prev.updatedAt || '');
      const sameVersion =
        prev.platform === info.platform &&
        (prev.appVersionCode ?? null) === (info.appVersionCode ?? null) &&
        (prev.appVersionName ?? null) === (info.appVersionName ?? null) &&
        (prev.webBuildId ?? null) === (info.webBuildId ?? null);
      if (sameVersion && Number.isFinite(prevTs) && Date.now() - prevTs < 5 * 60_000) {
        return null;
      }
    }
    return {
      userClientVersions: {
        ...existingMap,
        [key]: info,
      },
    };
  });
}

export async function appendAppUpdatePushHistoryInSupabase(
  entry: AppUpdatePushHistoryEntry
): Promise<AppUpdatePushHistoryEntry[]> {
  const res = await mutateSystemMetaBackup((current) => {
    const prevList = Array.isArray(current.appUpdatePushHistory)
      ? current.appUpdatePushHistory
      : [];
    return {
      appUpdatePushHistory: [entry, ...prevList].slice(0, 25),
    };
  });
  return res.meta?.appUpdatePushHistory || [entry];
}

export async function saveGlobalQuickChipsToSupabase(
  globalQuickChips: QuickContextChip[]
) {
  const res = await saveSystemMetaBackup({ globalQuickChips });
  if (!res.ok) {
    throw new Error(res.error || 'Supabase global quick chips save failed');
  }
}

export async function saveGlobalCustomFoodsToSupabase(
  globalCustomFoods: CustomFoodItem[]
) {
  const res = await saveSystemMetaBackup({ globalCustomFoods });
  if (!res.ok) {
    throw new Error(res.error || 'Supabase global custom foods save failed');
  }
}

export async function saveCoachCustomFoodsToSupabase(
  coachCustomFoods: Record<string, CustomFoodItem[]>
) {
  const res = await saveSystemMetaBackup({ coachCustomFoods });
  if (!res.ok) {
    throw new Error(res.error || 'Supabase coach custom foods save failed');
  }
}

export async function saveCoachPushSettingsToSupabase(
  coachPushSettings: Record<string, CoachPushSubscriptionSettings>
) {
  const res = await saveSystemMetaBackup({ coachPushSettings });
  if (!res.ok) {
    throw new Error(res.error || 'Supabase coach push settings save failed');
  }
}

export async function saveAppReleasePolicyToSupabase(
  appReleasePolicy: AppReleasePolicy
) {
  const res = await saveSystemMetaBackup({ appReleasePolicy });
  if (!res.ok) {
    throw new Error(res.error || 'Supabase app release policy save failed');
  }
}

export async function saveCoachesToSupabase(
  coaches: CoachProfile[],
  options?: { skipMetaBackup?: boolean }
) {
  if (!supabase) return;

  const backupRes = options?.skipMetaBackup
    ? { ok: false, error: undefined }
    : await saveSystemMetaBackup({ coaches });

  if (coaches.length === 0) return;

  const sessionAwareRows = coaches.map((c) => ({
    id: c.id,
    email: c.email,
    password: c.password || '',
    name: c.name,
    avatar: c.avatar,
    phone: c.phone,
    invite_code: c.inviteCode,
    status: c.status,
    session_version: Math.max(1, Number(c.sessionVersion) || 1),
    ...(c.lastSeenAt ? { last_seen_at: c.lastSeenAt } : {}),
    onboarding: c.onboarding || {},
    updated_at: new Date().toISOString(),
  }));

  const withSv = await supabase
    .from('coaches')
    .upsert(sessionAwareRows, { onConflict: 'id' });
  if (!withSv.error) return;

  const fullRows = coaches.map((c) => ({
    id: c.id,
    email: c.email,
    password: c.password || '',
    name: c.name,
    avatar: c.avatar,
    phone: c.phone,
    invite_code: c.inviteCode,
    status: c.status,
    onboarding: c.onboarding || {},
    updated_at: new Date().toISOString(),
  }));

  const first = await supabase
    .from('coaches')
    .upsert(fullRows, { onConflict: 'id' });
  if (!first.error) return;

  const legacyRows = coaches.map((c) => ({
    id: c.id,
    email: c.email,
    password: c.password || '',
    name: c.name,
    avatar: c.avatar,
    phone: c.phone,
    invite_code: c.inviteCode,
    status: c.status,
    updated_at: new Date().toISOString(),
  }));

  const second = await supabase
    .from('coaches')
    .upsert(legacyRows, { onConflict: 'id' });
  if (!second.error) return;

  const minimalRows = coaches.map((c) => ({
    id: c.id,
    email: c.email,
    password: c.password || '',
    name: c.name,
    invite_code: c.inviteCode,
    status: c.status,
  }));

  const third = await supabase
    .from('coaches')
    .upsert(minimalRows, { onConflict: 'id' });
  if (!third.error) return;

  const finalBackup = options?.skipMetaBackup
    ? await saveSystemMetaBackup({ coaches })
    : backupRes;

  if (!finalBackup.ok) {
    const details = [
      formatSupabaseError('coaches', third.error),
      finalBackup.error,
    ]
      .filter(Boolean)
      .join(' | ');
    throw new Error(details || 'Supabase coaches upsert failed');
  }
}

export async function deleteCoachFromSupabase(coachId: string) {
  if (!supabase) return;
  await supabase.from('coaches').delete().eq('id', coachId);
  const fullState = await loadStateFromSupabase();
  const remaining = fullState.coaches.filter((c) => c.id !== coachId);
  await saveSystemMetaBackup({ coaches: remaining });
}

export async function saveGroupsToSupabase(
  groups: TraineeGroup[],
  options?: { skipMetaBackup?: boolean }
) {
  if (!supabase) return;
  const backupRes = options?.skipMetaBackup
    ? { ok: false, error: undefined }
    : await saveSystemMetaBackup({ groups });
  if (groups.length === 0) return;

  const rows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    owner_coach_id: g.ownerCoachId,
    custom_quick_chips: g.customQuickChips || [],
    updated_at: new Date().toISOString(),
  }));
  const first = await supabase
    .from('trainee_groups')
    .upsert(rows, { onConflict: 'id' });
  if (!first.error) return;

  const midRows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    owner_coach_id: g.ownerCoachId,
    updated_at: new Date().toISOString(),
  }));
  const mid = await supabase
    .from('trainee_groups')
    .upsert(midRows, { onConflict: 'id' });
  if (!mid.error) return;

  const legacyRows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    updated_at: new Date().toISOString(),
  }));
  const second = await supabase
    .from('trainee_groups')
    .upsert(legacyRows, { onConflict: 'id' });
  if (!second.error) return;

  const finalBackup = options?.skipMetaBackup
    ? await saveSystemMetaBackup({ groups })
    : backupRes;

  if (!finalBackup.ok) {
    const details = [
      formatSupabaseError('trainee_groups', second.error),
      finalBackup.error,
    ]
      .filter(Boolean)
      .join(' | ');
    throw new Error(details || 'Supabase groups upsert failed');
  }
}

export async function deleteGroupFromSupabase(groupId: string) {
  if (!supabase) return;
  await supabase.from('trainee_groups').delete().eq('id', groupId);
  const fullState = await loadStateFromSupabase();
  const remaining = fullState.groups.filter((g) => g.id !== groupId);
  await saveSystemMetaBackup({ groups: remaining });
}

export async function saveTemplatesToSupabase(templates: NutritionTemplate[]) {
  if (!supabase || templates.length === 0) return;
  const rows = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    day_type: t.dayType,
    tolerance_percent: t.tolerancePercent,
    owner_coach_id: t.ownerCoachId || 'coach-admin',
    meals: t.meals,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('nutrition_templates')
    .upsert(rows, { onConflict: 'id' });
  if (error) {
    const legacyRows = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      day_type: t.dayType,
      tolerance_percent: t.tolerancePercent,
      meals: t.meals,
      updated_at: new Date().toISOString(),
    }));
    const legacy = await supabase
      .from('nutrition_templates')
      .upsert(legacyRows, { onConflict: 'id' });
    if (legacy.error) {
      throw new Error(formatSupabaseError('nutrition_templates', legacy.error));
    }
  }
}

export async function deleteTemplateFromSupabase(templateId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from('nutrition_templates')
    .delete()
    .eq('id', templateId);
  if (error) {
    throw new Error(formatSupabaseError('nutrition_templates', error));
  }
}

export async function saveTraineesToSupabase(trainees: TraineeProfile[]) {
  if (!supabase || trainees.length === 0) return;

  const packLogsWithMeta = (t: TraineeProfile) => ({
    ...t.logs,
    __profile_meta: {
      onboarding: t.onboarding,
      activityTargets: t.activityTargets,
      enableWorkoutRestSplit: Boolean(t.enableWorkoutRestSplit),
      coachAiNotes: t.coachAiNotes || '',
      aiLearnedPreferences: t.aiLearnedPreferences || [],
      weeklyCheckIns: t.weeklyCheckIns || [],
      measurementsHistory: t.measurementsHistory || [],
      observationDates: t.observationDates || [],
      blockedDates: t.blockedDates || [],
      restrictToObservationDaysWhenTodayIsObservation: Boolean(
        t.restrictToObservationDaysWhenTodayIsObservation
      ),
      countObservationInStats: Boolean(t.countObservationInStats),
      activeDateRange: t.activeDateRange,
      metricsSchedule: t.metricsSchedule,
      mealCardShortcuts: t.mealCardShortcuts,
      savedMeals: t.savedMeals || [],
      customServingTools: t.customServingTools || [],
      customFoodUnits: t.customFoodUnits || [],
      customFoods: t.customFoods || [],
      recentContextChips: t.recentContextChips || [],
      pendingAiJobs: t.pendingAiJobs || [],
      fcmTokens: t.fcmTokens || [],
      webPushSubscriptions: t.webPushSubscriptions || [],
      pushPreferences: t.pushPreferences || {
        aiMealReady: true,
        coachMessages: true,
      },
      lastForegroundState: t.lastForegroundState,
      pushHistory: t.pushHistory || [],
      primaryCoachId: t.primaryCoachId || 'coach-admin',
      sharedCoachIds: t.sharedCoachIds || [],
      groupId: t.groupId || null,
      sessionVersion: Math.max(1, Number(t.sessionVersion) || 1),
      lastSeenAt: t.lastSeenAt,
    },
  });

  const sessionAwareRows = trainees.map((t) => ({
    id: t.id,
    email: t.email,
    password: t.password,
    status: t.status || 'active',
    name: t.name,
    avatar: t.avatar,
    phone: t.phone,
    goal: t.goal,
    current_weight: t.currentWeight,
    target_weight: t.targetWeight,
    tolerance_percent: t.tolerancePercent,
    primary_coach_id: t.primaryCoachId || 'coach-admin',
    shared_coach_ids: t.sharedCoachIds || [],
    group_id: t.groupId || null,
    workout_template: t.workoutTemplate,
    rest_template: t.restTemplate,
    favorite_food_ids: t.favoriteFoodIds,
    weight_history: t.weightHistory,
    measurements_history: t.measurementsHistory || [],
    onboarding: t.onboarding || {},
    observation_dates: t.observationDates || [],
    count_observation_in_stats: Boolean(t.countObservationInStats),
    activity_targets: t.activityTargets || {},
    enable_workout_rest_split: Boolean(t.enableWorkoutRestSplit),
    coach_ai_notes: t.coachAiNotes || '',
    ai_learned_preferences: t.aiLearnedPreferences || [],
    weekly_check_ins: t.weeklyCheckIns || [],
    saved_meals: t.savedMeals || [],
    custom_serving_tools: t.customServingTools || [],
    custom_food_units: t.customFoodUnits || [],
    recent_context_chips: t.recentContextChips || [],
    pending_ai_jobs: t.pendingAiJobs || [],
    logs: packLogsWithMeta(t),
    session_version: Math.max(1, Number(t.sessionVersion) || 1),
    last_seen_at: t.lastSeenAt || null,
    updated_at: new Date().toISOString(),
  }));

  const withSv = await supabase
    .from('trainees')
    .upsert(sessionAwareRows, { onConflict: 'id' });
  if (!withSv.error) return;

  const fullRows = trainees.map((t) => ({
    id: t.id,
    email: t.email,
    password: t.password,
    status: t.status || 'active',
    name: t.name,
    avatar: t.avatar,
    phone: t.phone,
    goal: t.goal,
    current_weight: t.currentWeight,
    target_weight: t.targetWeight,
    tolerance_percent: t.tolerancePercent,
    primary_coach_id: t.primaryCoachId || 'coach-admin',
    shared_coach_ids: t.sharedCoachIds || [],
    group_id: t.groupId || null,
    workout_template: t.workoutTemplate,
    rest_template: t.restTemplate,
    favorite_food_ids: t.favoriteFoodIds,
    weight_history: t.weightHistory,
    measurements_history: t.measurementsHistory || [],
    onboarding: t.onboarding || {},
    observation_dates: t.observationDates || [],
    count_observation_in_stats: Boolean(t.countObservationInStats),
    activity_targets: t.activityTargets || {},
    enable_workout_rest_split: Boolean(t.enableWorkoutRestSplit),
    coach_ai_notes: t.coachAiNotes || '',
    ai_learned_preferences: t.aiLearnedPreferences || [],
    weekly_check_ins: t.weeklyCheckIns || [],
    saved_meals: t.savedMeals || [],
    custom_serving_tools: t.customServingTools || [],
    custom_food_units: t.customFoodUnits || [],
    recent_context_chips: t.recentContextChips || [],
    pending_ai_jobs: t.pendingAiJobs || [],
    logs: packLogsWithMeta(t),
    updated_at: new Date().toISOString(),
  }));

  const first = await supabase
    .from('trainees')
    .upsert(fullRows, { onConflict: 'id' });
  if (!first.error) return;

  const schemaV2Rows = trainees.map((t) => ({
    id: t.id,
    email: t.email,
    password: t.password,
    status: t.status || 'active',
    name: t.name,
    avatar: t.avatar,
    phone: t.phone,
    goal: t.goal,
    current_weight: t.currentWeight,
    target_weight: t.targetWeight,
    tolerance_percent: t.tolerancePercent,
    primary_coach_id: t.primaryCoachId || 'coach-admin',
    shared_coach_ids: t.sharedCoachIds || [],
    group_id: t.groupId || null,
    workout_template: t.workoutTemplate,
    rest_template: t.restTemplate,
    favorite_food_ids: t.favoriteFoodIds,
    weight_history: t.weightHistory,
    measurements_history: t.measurementsHistory || [],
    onboarding: t.onboarding || {},
    observation_dates: t.observationDates || [],
    count_observation_in_stats: Boolean(t.countObservationInStats),
    logs: packLogsWithMeta(t),
    updated_at: new Date().toISOString(),
  }));

  const v2 = await supabase
    .from('trainees')
    .upsert(schemaV2Rows, { onConflict: 'id' });
  if (!v2.error) return;

  // ניסיון ביניים: כולל primary_coach_id ו-shared_coach_ids ללא עמודות ההרחבה החדשות
  const midRows = trainees.map((t) => ({
    id: t.id,
    email: t.email,
    password: t.password,
    status: t.status || 'active',
    name: t.name,
    avatar: t.avatar,
    phone: t.phone,
    goal: t.goal,
    current_weight: t.currentWeight,
    target_weight: t.targetWeight,
    tolerance_percent: t.tolerancePercent,
    primary_coach_id: t.primaryCoachId || 'coach-admin',
    shared_coach_ids: t.sharedCoachIds || [],
    workout_template: t.workoutTemplate,
    rest_template: t.restTemplate,
    favorite_food_ids: t.favoriteFoodIds,
    weight_history: t.weightHistory,
    logs: packLogsWithMeta(t),
    updated_at: new Date().toISOString(),
  }));
  const mid = await supabase
    .from('trainees')
    .upsert(midRows, { onConflict: 'id' });
  if (!mid.error) return;

  // גיבוי אוטומטי אם גם עמודות השיוך טרם הורצו ב-SQL Editor: הכל נשמר בתוך logs.__profile_meta!
  const legacyRows = trainees.map((t) => ({
    id: t.id,
    email: t.email,
    password: t.password,
    status: t.status || 'active',
    name: t.name,
    avatar: t.avatar,
    phone: t.phone,
    goal: t.goal,
    current_weight: t.currentWeight,
    target_weight: t.targetWeight,
    tolerance_percent: t.tolerancePercent,
    workout_template: t.workoutTemplate,
    rest_template: t.restTemplate,
    favorite_food_ids: t.favoriteFoodIds,
    weight_history: t.weightHistory,
    logs: packLogsWithMeta(t),
    updated_at: new Date().toISOString(),
  }));
  const legacy = await supabase
    .from('trainees')
    .upsert(legacyRows, { onConflict: 'id' });
  if (legacy.error) {
    throw new Error(formatSupabaseError('trainees', legacy.error));
  }
}

export async function deleteTraineeFromSupabase(traineeId: string) {
  if (!supabase) return;
  const { error } = await supabase.from('trainees').delete().eq('id', traineeId);
  if (error) {
    throw new Error(formatSupabaseError('trainees', error));
  }
}

async function upsertHiddenTemplatePayload(
  id: string,
  description: string,
  payload: unknown
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase not configured' };
  const now = new Date().toISOString();
  const attempts: Record<string, unknown>[] = [
    {
      id,
      name: '__SYSTEM_SCRAPER__',
      description,
      day_type: 'workout',
      tolerance_percent: 10,
      owner_coach_id: 'coach-admin',
      meals: payload,
      updated_at: now,
    },
    {
      id,
      name: '__SYSTEM_SCRAPER__',
      day_type: 'workout',
      tolerance_percent: 10,
      meals: payload,
    },
  ];
  let lastErr: SbErrorLike = null;
  for (const row of attempts) {
    const { error } = await supabase
      .from('nutrition_templates')
      .upsert([row], { onConflict: 'id' });
    if (!error) return { ok: true };
    lastErr = error;
  }
  return {
    ok: false,
    error: formatSupabaseError(`nutrition_templates(${id})`, lastErr),
  };
}

/**
 * טוען את דוח תקינות הסקרייפרים ואת מאגר המזון המסונכרן מ-Supabase מבלי להכביד על /api/data.
 */
export async function loadScraperSuiteFromSupabase(): Promise<{
  report: ScraperSuiteReport | null;
  catalog: FoodCatalogItem[];
}> {
  if (!supabase) return { report: null, catalog: [] };
  try {
    const { data, error } = await supabase
      .from('nutrition_templates')
      .select('id, meals')
      .in('id', [SCRAPER_META_TEMPLATE_ID, SCRAPER_CATALOG_TEMPLATE_ID]);
    if (error || !Array.isArray(data)) return { report: null, catalog: [] };

    const metaRow = data.find((r) => r.id === SCRAPER_META_TEMPLATE_ID);
    const catalogRow = data.find((r) => r.id === SCRAPER_CATALOG_TEMPLATE_ID);

    const report =
      metaRow?.meals && typeof metaRow.meals === 'object'
        ? (metaRow.meals as ScraperSuiteReport)
        : null;

    const rawCatalogObj =
      catalogRow?.meals && typeof catalogRow.meals === 'object'
        ? (catalogRow.meals as { items?: FoodCatalogItem[] } | FoodCatalogItem[])
        : null;

    const catalog = Array.isArray(rawCatalogObj)
      ? rawCatalogObj
      : Array.isArray(rawCatalogObj?.items)
        ? rawCatalogObj.items
        : [];

    return { report, catalog };
  } catch {
    return { report: null, catalog: [] };
  }
}

export async function saveScraperSuiteMetaToSupabase(
  report: ScraperSuiteReport
): Promise<{ ok: boolean; error?: string }> {
  return upsertHiddenTemplatePayload(
    SCRAPER_META_TEMPLATE_ID,
    'Israeli food scraper health check report',
    report
  );
}

export async function saveScraperSuiteCatalogToSupabase(
  items: FoodCatalogItem[]
): Promise<{ ok: boolean; error?: string }> {
  return upsertHiddenTemplatePayload(
    SCRAPER_CATALOG_TEMPLATE_ID,
    'Synced Israeli food catalog from web scrapers',
    { updatedAt: new Date().toISOString(), count: items.length, items }
  );
}

// =====================================================================
// טבלת קטלוג המזון המנורמלת והמאונדקסת: public.food_catalog_items
// =====================================================================

const FOOD_CATALOG_SELECT_COLS =
  'id, name, brand, category, barcode, calories, protein, carbs, fat, units, source, source_site_id, source_site_name, source_url, updated_at';

function isMissingFoodTableError(err: SbErrorLike): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table')
  );
}

function mapSqlRowToFoodCatalogItem(row: Record<string, unknown>): FoodCatalogItem | null {
  const name = String(row.name || '').trim();
  if (!name) return null;
  const per100g = roundMacros({
    calories: Number(row.calories) || 0,
    protein: Number(row.protein) || 0,
    carbs: Number(row.carbs) || 0,
    fat: Number(row.fat) || 0,
  });
  if (!isValidMacroSet(per100g)) return null;

  const rawUnits = Array.isArray(row.units) ? (row.units as FoodUnit[]) : [];
  const units =
    rawUnits.length > 0 ? rawUnits : [{ label: '100 גרם', grams: 100 }];

  return {
    id: String(row.id),
    name,
    brand: row.brand ? String(row.brand) : undefined,
    category: String(row.category || 'מאגר סופרים'),
    barcode: row.barcode ? String(row.barcode) : undefined,
    per100g,
    units,
    source: (row.source as FoodCatalogItem['source']) || 'scraper',
    sourceSiteId: row.source_site_id
      ? (String(row.source_site_id) as FoodCatalogSourceId)
      : undefined,
    sourceSiteName: row.source_site_name ? String(row.source_site_name) : undefined,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    pickCount: typeof row.pick_count === 'number' ? row.pick_count : Number(row.pick_count) || 0,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/**
 * שומר אצוות מוצרי מזון מאומתים לטבלת food_catalog_items ב-Supabase (Upsert בבאצ'ים של 250).
 */
export async function upsertFoodCatalogItemsToSupabase(
  items: FoodCatalogItem[]
): Promise<{ ok: boolean; tableReady: boolean; savedCount: number; error?: string }> {
  if (!supabase || items.length === 0) {
    return { ok: Boolean(supabase), tableReady: true, savedCount: 0 };
  }

  const dedupedById = new Map<string, Record<string, unknown>>();
  const nowIso = new Date().toISOString();

  for (const item of items) {
    if (!item?.id || !item?.name) continue;
    const rounded = roundMacros(item.per100g);
    if (!isValidMacroSet(rounded)) continue;

    const cleanName = item.name.replace(/\s+/g, ' ').trim().slice(0, 180);
    const cleanBrand = (item.brand || '').replace(/\s+/g, ' ').trim().slice(0, 100);
    const nameNorm = [normalizeFoodKey(cleanName), normalizeFoodKey(cleanBrand)]
      .filter(Boolean)
      .join(' ')
      .slice(0, 280);

    dedupedById.set(item.id, {
      id: item.id.slice(0, 120),
      name: cleanName,
      name_norm: nameNorm || normalizeFoodKey(cleanName),
      brand: cleanBrand,
      category: (item.category || '').slice(0, 100),
      barcode: item.barcode ? item.barcode.replace(/[^0-9]/g, '').slice(0, 20) || null : null,
      calories: rounded.calories,
      protein: rounded.protein,
      carbs: rounded.carbs,
      fat: rounded.fat,
      units: Array.isArray(item.units) ? item.units.slice(0, 8) : [{ label: '100 גרם', grams: 100 }],
      source: item.source || 'scraper',
      source_site_id: item.sourceSiteId || null,
      source_site_name: item.sourceSiteName || null,
      source_url: item.sourceUrl || null,
      updated_at: item.updatedAt || nowIso,
    });
  }

  const rows = Array.from(dedupedById.values());
  if (rows.length === 0) {
    return { ok: true, tableReady: true, savedCount: 0 };
  }

  const chunks: Record<string, unknown>[][] = [];
  for (let i = 0; i < rows.length; i += 400) {
    chunks.push(rows.slice(i, i + 400));
  }

  let savedCount = 0;
  for (let i = 0; i < chunks.length; i += 3) {
    const wave = chunks.slice(i, i + 3);
    const waveRes = await Promise.all(
      wave.map((chunk) =>
        supabase!
          .from('food_catalog_items')
          .upsert(chunk, { onConflict: 'id' })
          .then(({ error }) => ({ error, len: chunk.length }))
      )
    );
    for (const r of waveRes) {
      if (r.error) {
        if (isMissingFoodTableError(r.error)) {
          return {
            ok: false,
            tableReady: false,
            savedCount,
            error: 'טבלת food_catalog_items טרם נוצרה ב-Supabase',
          };
        }
        return {
          ok: false,
          tableReady: true,
          savedCount,
          error: formatSupabaseError('food_catalog_items', r.error),
        };
      }
      savedCount += r.len;
    }
  }

  return { ok: true, tableReady: true, savedCount };
}

function isMissingRpcOrTableError(err: SbErrorLike): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42883' ||
    code === '42P01' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

/**
 * חיפוש היברידי מהיר ישירות מול PostgreSQL ב-Round-Trip יחיד:
 * FTS ('simple' + מוספיות עבריות) + pg_trgm לשגיאות כתיב + מונה פופולריות (pick_count),
 * עם נסיגה בטוחה לשאילתות מאובטחות אם המיגרציה טרם הורצה.
 */
export async function searchFoodCatalogSql(opts: {
  query?: string;
  sourceMode?: 'all' | 'retail' | 'moh_gov' | 'openfoodfacts';
  sourceSiteId?: string;
  limit?: number;
}): Promise<{ items: FoodCatalogItem[]; tableReady: boolean; usedHybridRpc?: boolean }> {
  if (!supabase) return { items: [], tableReady: false };
  const limit = Math.min(60, Math.max(1, opts.limit || 36));
  const qRaw = (opts.query || '').trim();
  const qNorm = normalizeFoodSearchQuery(qRaw);
  const specificSite =
    opts.sourceSiteId &&
    opts.sourceSiteId !== 'all' &&
    opts.sourceSiteId !== 'local' &&
    opts.sourceSiteId !== 'retail' &&
    opts.sourceSiteId !== 'moh_gov' &&
    opts.sourceSiteId !== 'favorites_recent'
      ? opts.sourceSiteId
      : null;

  const sourceMode =
    opts.sourceMode ||
    (opts.sourceSiteId === 'retail'
      ? 'retail'
      : opts.sourceSiteId === 'moh_gov'
      ? 'moh_gov'
      : opts.sourceSiteId === 'openfoodfacts'
      ? 'openfoodfacts'
      : 'all');

  try {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc(
      'search_food_catalog_hybrid',
      {
        q_raw: qRaw,
        q_norm: qNorm,
        source_mode: sourceMode,
        source_site: specificSite,
        max_rows: limit,
      }
    );

    if (!rpcErr && Array.isArray(rpcRows)) {
      const items = rpcRows
        .map((r) => mapSqlRowToFoodCatalogItem(r as Record<string, unknown>))
        .filter((x): x is FoodCatalogItem => Boolean(x));
      return { items, tableReady: true, usedHybridRpc: true };
    }

    if (rpcErr && !isMissingRpcOrTableError(rpcErr)) {
      return {
        items: [],
        tableReady: !isMissingFoodTableError(rpcErr),
        usedHybridRpc: false,
      };
    }

    // Fallback בטוח אם פונקציית ה-RPC טרם הורצה ב-SQL Editor
    const runFilteredQuery = async (mode: 'exact_site' | 'retail_only' | 'moh_only', rowLimit: number) => {
      let req = supabase!
        .from('food_catalog_items')
        .select(FOOD_CATALOG_SELECT_COLS);

      if (mode === 'exact_site' && specificSite) {
        req = req.eq('source_site_id', specificSite);
      } else if (mode === 'retail_only') {
        req = req.neq('source_site_id', 'moh_gov');
      } else if (mode === 'moh_only') {
        req = req.eq('source_site_id', 'moh_gov');
      }

      if (/^[0-9]{6,16}$/.test(qRaw)) {
        req = req.or(`barcode.eq.${qRaw},id.eq.shufersal-P_${qRaw}`);
      } else if (qNorm) {
        const tokens = qNorm.split(/\s+/).filter((t) => t.length >= 1).slice(0, 4);
        for (const tok of tokens) {
          const safeTok = escapeSqlLikePattern(tok);
          // טוקנים קצרים (<3) נמנעים מ-% שמאט GIN ומבצעים התאמת תחילה ממוקדת
          req = tok.length <= 2
            ? req.ilike('name_norm', `${safeTok}%`)
            : req.ilike('name_norm', `%${safeTok}%`);
        }
      }

      return req.order('updated_at', { ascending: false }).limit(rowLimit);
    };

    if (specificSite || sourceMode === 'moh_gov' || sourceMode === 'openfoodfacts') {
      const modeArg =
        specificSite
          ? 'exact_site'
          : sourceMode === 'moh_gov'
          ? 'moh_only'
          : 'retail_only';
      let req = supabase!
        .from('food_catalog_items')
        .select(FOOD_CATALOG_SELECT_COLS);
      if (specificSite) req = req.eq('source_site_id', specificSite);
      else if (modeArg === 'moh_only') req = req.eq('source_site_id', 'moh_gov');
      else req = req.eq('source_site_id', 'openfoodfacts');

      if (/^[0-9]{6,16}$/.test(qRaw)) {
        req = req.or(`barcode.eq.${qRaw},id.eq.shufersal-P_${qRaw}`);
      } else if (qNorm) {
        for (const tok of qNorm.split(/\s+/).filter(Boolean).slice(0, 4)) {
          const safeTok = escapeSqlLikePattern(tok);
          req = tok.length <= 2
            ? req.ilike('name_norm', `${safeTok}%`)
            : req.ilike('name_norm', `%${safeTok}%`);
        }
      }
      const { data, error } = await req.order('updated_at', { ascending: false }).limit(limit);
      if (error) return { items: [], tableReady: !isMissingFoodTableError(error) };
      const items = (data || [])
        .map((r) => mapSqlRowToFoodCatalogItem(r as Record<string, unknown>))
        .filter((x): x is FoodCatalogItem => Boolean(x));
      return { items, tableReady: true, usedHybridRpc: false };
    }

    if (sourceMode === 'retail') {
      const { data, error } = await runFilteredQuery('retail_only', limit);
      if (error) return { items: [], tableReady: !isMissingFoodTableError(error) };
      const items = (data || [])
        .map((r) => mapSqlRowToFoodCatalogItem(r as Record<string, unknown>))
        .filter((x): x is FoodCatalogItem => Boolean(x));
      return { items, tableReady: true, usedHybridRpc: false };
    }

    const [retailRes, mohRes] = await Promise.all([
      runFilteredQuery('retail_only', Math.min(48, Math.ceil(limit * 0.8))),
      runFilteredQuery('moh_only', Math.min(20, Math.ceil(limit * 0.4))),
    ]);

    if (retailRes.error && isMissingFoodTableError(retailRes.error)) {
      return { items: [], tableReady: false };
    }

    const combinedRows = [...(retailRes.data || []), ...(mohRes.data || [])];
    const items = combinedRows
      .map((r) => mapSqlRowToFoodCatalogItem(r as Record<string, unknown>))
      .filter((x): x is FoodCatalogItem => Boolean(x));

    return { items, tableReady: true, usedHybridRpc: false };
  } catch {
    return { items: [], tableReady: false };
  }
}

export async function fetchFoodCatalogItemByIdSql(
  itemId: string
): Promise<FoodCatalogItem | null> {
  const cleanId = String(itemId || '').trim().slice(0, 120);
  if (!supabase || !cleanId) return null;
  try {
    const { data, error } = await supabase
      .from('food_catalog_items')
      .select(FOOD_CATALOG_SELECT_COLS)
      .eq('id', cleanId)
      .maybeSingle();
    if (error || !data) return null;
    return mapSqlRowToFoodCatalogItem(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export async function incrementFoodPickCountsSql(foodIds: string[]): Promise<void> {
  if (!supabase || !foodIds || foodIds.length === 0) return;
  const cleanIds = Array.from(
    new Set(foodIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && id.length <= 120))
  ).slice(0, 20);
  if (cleanIds.length === 0) return;
  try {
    await supabase.rpc('increment_food_pick_counts', { food_ids: cleanIds });
  } catch {
    // ignore if RPC migration not applied yet
  }
}

export async function getUserFoodHistorySql(
  userId: string,
  limit = 80
): Promise<{ items: UserFoodHistoryItem[]; tableReady: boolean }> {
  const cleanUid = String(userId || '').trim();
  if (!supabase || !cleanUid) return { items: [], tableReady: false };
  try {
    const safeLimit = Math.min(120, Math.max(10, limit));
    const { data, error } = await supabase
      .from('user_food_history')
      .select(
        'user_id, food_key, catalog_id, name, brand, category, barcode, calories, protein, carbs, fat, units, last_unit_label, last_grams, source, source_site_id, source_site_name, source_url, action_kind, use_count, last_used_at'
      )
      .eq('user_id', cleanUid)
      .order('last_used_at', { ascending: false })
      .limit(safeLimit);

    if (error) {
      return { items: [], tableReady: !isMissingRpcOrTableError(error) };
    }

    const items: UserFoodHistoryItem[] = [];
    for (const row of (data || []) as Record<string, unknown>[]) {
      const per100g = roundMacros({
        calories: Number(row.calories) || 0,
        protein: Number(row.protein) || 0,
        carbs: Number(row.carbs) || 0,
        fat: Number(row.fat) || 0,
      });
      if (!isValidMacroSet(per100g)) continue;
      const rawUnits = Array.isArray(row.units) ? (row.units as FoodUnit[]) : [];
      const units = rawUnits.length > 0 ? rawUnits : [{ label: '100 גרם', grams: 100 }];
      items.push({
        id: String(row.catalog_id || row.food_key),
        foodKey: String(row.food_key),
        catalogId: row.catalog_id ? String(row.catalog_id) : undefined,
        name: String(row.name || '').trim(),
        brand: row.brand ? String(row.brand) : undefined,
        category: String(row.category || 'היסטוריה אישית'),
        barcode: row.barcode ? String(row.barcode) : undefined,
        per100g,
        units,
        lastUnitLabel: row.last_unit_label ? String(row.last_unit_label) : undefined,
        lastGrams: row.last_grams != null ? Number(row.last_grams) : undefined,
        source: (row.source as FoodCatalogItem['source']) || 'local',
        sourceSiteId: row.source_site_id
          ? (String(row.source_site_id) as FoodCatalogSourceId)
          : undefined,
        sourceSiteName: row.source_site_name ? String(row.source_site_name) : undefined,
        sourceUrl: row.source_url ? String(row.source_url) : undefined,
        actionKind:
          row.action_kind === 'barcode' || row.action_kind === 'logged'
            ? row.action_kind
            : 'picked',
        useCount: Math.max(1, Number(row.use_count) || 1),
        lastUsedAt: row.last_used_at ? String(row.last_used_at) : new Date().toISOString(),
        updatedAt: row.last_used_at ? String(row.last_used_at) : undefined,
      });
    }

    return { items, tableReady: true };
  } catch {
    return { items: [], tableReady: false };
  }
}

export async function recordUserFoodHistorySql(
  userId: string,
  entries: Array<{
    foodKey: string;
    catalogId?: string;
    name: string;
    brand?: string;
    category?: string;
    barcode?: string;
    per100g: { calories: number; protein: number; carbs: number; fat: number };
    units?: FoodUnit[];
    lastUnitLabel?: string;
    lastGrams?: number;
    source?: FoodCatalogItem['source'];
    sourceSiteId?: string;
    sourceSiteName?: string;
    sourceUrl?: string;
    actionKind: 'picked' | 'barcode' | 'logged';
  }>
): Promise<{ ok: boolean; savedCount: number }> {
  const cleanUid = String(userId || '').trim();
  if (!supabase || !cleanUid || entries.length === 0) {
    return { ok: Boolean(supabase), savedCount: 0 };
  }

  const sanitized = entries
    .slice(0, 20)
    .map((e) => {
      const rounded = roundMacros(e.per100g);
      if (!isValidMacroSet(rounded) || !e.name?.trim()) return null;
      return {
        foodKey: String(e.foodKey || e.catalogId || normalizeFoodKey(e.name)).slice(0, 140),
        catalogId: e.catalogId ? String(e.catalogId).slice(0, 120) : null,
        name: e.name.replace(/\s+/g, ' ').trim().slice(0, 180),
        brand: (e.brand || '').replace(/\s+/g, ' ').trim().slice(0, 100),
        category: (e.category || '').slice(0, 100),
        barcode: e.barcode ? e.barcode.replace(/[^0-9]/g, '').slice(0, 20) || null : null,
        calories: rounded.calories,
        protein: rounded.protein,
        carbs: rounded.carbs,
        fat: rounded.fat,
        units: Array.isArray(e.units) ? e.units.slice(0, 8) : [{ label: '100 גרם', grams: 100 }],
        lastUnitLabel: e.lastUnitLabel ? String(e.lastUnitLabel).slice(0, 80) : null,
        lastGrams: e.lastGrams && Number.isFinite(e.lastGrams) ? Math.round(e.lastGrams) : null,
        source: e.source || 'local',
        sourceSiteId: e.sourceSiteId || null,
        sourceSiteName: e.sourceSiteName || null,
        sourceUrl: e.sourceUrl || null,
        actionKind: e.actionKind,
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (sanitized.length === 0) return { ok: true, savedCount: 0 };

  try {
    const { data, error } = await supabase.rpc('record_user_food_history_batch', {
      p_user_id: cleanUid,
      p_items: sanitized,
    });
    if (!error) {
      return { ok: true, savedCount: Number(data) || sanitized.length };
    }
    return { ok: false, savedCount: 0 };
  } catch {
    return { ok: false, savedCount: 0 };
  }
}

export async function findFoodByBarcodeSql(
  barcode: string
): Promise<{ item: FoodCatalogItem | null; tableReady: boolean }> {
  const clean = String(barcode || '').replace(/[^0-9]/g, '');
  if (!supabase || !/^[0-9]{6,16}$/.test(clean)) {
    return { item: null, tableReady: Boolean(supabase) };
  }
  try {
    const { data, error } = await supabase
      .from('food_catalog_items')
      .select(FOOD_CATALOG_SELECT_COLS)
      .or(`barcode.eq.${clean},id.eq.shufersal-P_${clean},id.eq.openfoodfacts-${clean}`)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { item: null, tableReady: !isMissingFoodTableError(error) };
    }
    if (!data) return { item: null, tableReady: true };
    const mapped = mapSqlRowToFoodCatalogItem(data as Record<string, unknown>);
    if (mapped && !mapped.barcode) mapped.barcode = clean;
    return {
      item: mapped,
      tableReady: true,
    };
  } catch {
    return { item: null, tableReady: false };
  }
}

/**
 * סורק שורות קיימות ב-food_catalog_items בבאצ'ים ומשלים ברקודים (למשל משופרסל P_729...) ומידות אריזה מתוך שם המוצר.
 */
export async function backfillFoodCatalogBarcodesAndUnits(): Promise<{
  ok: boolean;
  scanned: number;
  updatedBarcodes: number;
  updatedUnits: number;
  error?: string;
}> {
  if (!supabase) {
    return { ok: false, scanned: 0, updatedBarcodes: 0, updatedUnits: 0, error: 'Supabase לא מוגדר' };
  }

  let offset = 0;
  const pageSize = 500;
  let scanned = 0;
  let updatedBarcodes = 0;
  let updatedUnits = 0;

  try {
    while (offset < 30000) {
      const { data, error } = await supabase
        .from('food_catalog_items')
        .select(FOOD_CATALOG_SELECT_COLS)
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (error) {
        return {
          ok: false,
          scanned,
          updatedBarcodes,
          updatedUnits,
          error: formatSupabaseError('food_catalog_items', error),
        };
      }

      const rows = (data || []) as Record<string, unknown>[];
      if (rows.length === 0) break;
      scanned += rows.length;

      const toUpsert: FoodCatalogItem[] = [];
      for (const row of rows) {
        const mapped = mapSqlRowToFoodCatalogItem(row);
        if (!mapped) continue;

        let changedBarcode = false;
        let nextBarcode = mapped.barcode;
        if (!nextBarcode) {
          const fromId =
            mapped.id.match(/^shufersal-P_(\d{6,16})$/i)?.[1] ||
            mapped.id.match(/^openfoodfacts-(\d{6,16})$/i)?.[1] ||
            mapped.sourceUrl?.match(/\/p\/P_(\d{6,16})/i)?.[1] ||
            mapped.sourceUrl?.match(/\/product\/(\d{6,16})/i)?.[1];
          if (fromId) {
            nextBarcode = fromId;
            changedBarcode = true;
          }
        }

        let changedUnits = false;
        let nextUnits = mapped.units || [];
        const hasPkgUnit = nextUnits.some((u) => u.grams !== 100);
        if (!hasPkgUnit) {
          const clean = mapped.name.replace(/ל[-\s]?100\s*(?:גרם|ג|מ"ל|מל)/gi, ' ');
          const kgM = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:ק"ג|ק״ג|קג|ליטר|ל'|kg)(?=$|\s|[,.)\]\-/])/i);
          const gM = clean.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג|מ"ל|מ״ל|מל|g|ml)(?=$|\s|[,.)\]\-/])/i);
          let pkgG = 0;
          if (kgM) {
            const v = Number(kgM[1].replace(',', '.'));
            if (v > 0 && v <= 5) pkgG = Math.round(v * 1000);
          } else if (gM) {
            const v = Number(gM[1].replace(',', '.'));
            if (v >= 5 && v <= 5000) pkgG = Math.round(v);
          }
          if (pkgG > 0 && pkgG !== 100) {
            nextUnits = [{ label: `חבילה / יחידה (${pkgG} גרם)`, grams: pkgG }, ...nextUnits];
            changedUnits = true;
          }
        }

        if (changedBarcode || changedUnits) {
          if (changedBarcode) updatedBarcodes += 1;
          if (changedUnits) updatedUnits += 1;
          toUpsert.push({
            ...mapped,
            ...(nextBarcode ? { barcode: nextBarcode } : {}),
            units: nextUnits,
          });
        }
      }

      if (toUpsert.length > 0) {
        await upsertFoodCatalogItemsToSupabase(toUpsert);
      }

      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    return { ok: true, scanned, updatedBarcodes, updatedUnits };
  } catch (err) {
    return {
      ok: false,
      scanned,
      updatedBarcodes,
      updatedUnits,
      error: err instanceof Error ? err.message : 'שגיאה בעדכון DB',
    };
  }
}

/**
 * מחזיר סטטיסטיקת ספירת שורות מדויקת מהטבלה ב-SQL (head-only COUNT, 0 שורות עוברות ברשת).
 */
export async function getSqlFoodCatalogStats(
  sourceIds: string[] = []
): Promise<SqlFoodCatalogStats> {
  if (!supabase) return { available: false, totalCount: 0, bySource: {} };

  try {
    const totalRes = await supabase
      .from('food_catalog_items')
      .select('id', { count: 'exact', head: true });

    if (totalRes.error) {
      return { available: false, totalCount: 0, bySource: {} };
    }

    const tracked = Array.from(new Set(['shufersal', 'openfoodfacts', ...sourceIds]));
    const countEntries = await Promise.all(
      tracked.map(async (sid) => {
        const res = await supabase!
          .from('food_catalog_items')
          .select('id', { count: 'exact', head: true })
          .eq('source_site_id', sid);
        return [sid, res.count || 0] as const;
      })
    );

    const bySource: Record<string, number> = {};
    for (const [sid, cnt] of countEntries) {
      if (cnt > 0) bySource[sid] = cnt;
    }

    return {
      available: true,
      totalCount: totalRes.count || 0,
      bySource,
    };
  } catch {
    return { available: false, totalCount: 0, bySource: {} };
  }
}
