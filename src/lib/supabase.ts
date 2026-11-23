import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AccountStatus,
  BodyMeasurementEntry,
  CoachOnboardingData,
  CoachProfile,
  CoachPushSubscriptionSettings,
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
  WeeklyCheckInEntry,
} from '@/types/nutrition';
import {
  isValidMacroSet,
  normalizeFoodKey,
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
    onboarding,
  };
}

function mapRowToGroup(row: Record<string, unknown>): TraineeGroup {
  return {
    id: String(row.id),
    name: String(row.name || 'קבוצה'),
    color: String(row.color || '#ea580c'),
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
  countObservationInStats?: boolean;
  activeDateRange?: TraineeProfile['activeDateRange'];
  mealCardShortcuts?: TraineeProfile['mealCardShortcuts'];
  savedMeals?: SavedMealPreset[];
  customServingTools?: TraineeServingTool[];
  customFoodUnits?: TraineeCustomUnit[];
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
    countObservationInStats,
    activeDateRange: embeddedMeta.activeDateRange,
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
  coachPushSettings: Record<string, CoachPushSubscriptionSettings>;
  readErrors: string[];
}> {
  if (!supabase) {
    return {
      coaches: [],
      groups: [],
      templates: [],
      trainees: [],
      globalQuickChips: [],
      coachPushSettings: {},
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
  let coachPushSettings: Record<string, CoachPushSubscriptionSettings> = {};

  if (
    systemMetaRow &&
    systemMetaRow.meals &&
    typeof systemMetaRow.meals === 'object'
  ) {
    const metaObj = systemMetaRow.meals as {
      coaches?: CoachProfile[];
      groups?: TraineeGroup[];
      globalQuickChips?: QuickContextChip[];
      coachPushSettings?: Record<string, CoachPushSubscriptionSettings>;
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
    if (
      metaObj.coachPushSettings &&
      typeof metaObj.coachPushSettings === 'object'
    ) {
      coachPushSettings = metaObj.coachPushSettings;
    }
  }

  const tableCoaches: CoachProfile[] = Array.isArray(coachesRes.data)
    ? coachesRes.data.map((r) => mapRowToCoach(r))
    : [];

  // מיזוג חכם: אם טבלת coaches החזירה שורות נשתמש בהן + נשלים מאמנים שנשמרו בגיבוי
  const coachMap = new Map<string, CoachProfile>();
  for (const fc of fallbackCoaches) {
    coachMap.set(fc.id, fc);
  }
  for (const tc of tableCoaches) {
    const existingFallback = coachMap.get(tc.id);
    coachMap.set(tc.id, {
      ...tc,
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
    coachPushSettings,
    readErrors,
  };
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

export async function saveSystemMetaBackup(partial: {
  coaches?: CoachProfile[];
  groups?: TraineeGroup[];
  globalQuickChips?: QuickContextChip[];
  coachPushSettings?: Record<string, CoachPushSubscriptionSettings>;
}): Promise<{ ok: boolean; error?: string }> {
  const run = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!supabase) return { ok: false, error: 'Supabase client not configured' };

    const { data: existing, error: readErr } = await supabase
      .from('nutrition_templates')
      .select('*')
      .eq('id', SYSTEM_META_TEMPLATE_ID)
      .maybeSingle();

    const currentMeta =
      existing && existing.meals && typeof existing.meals === 'object'
        ? (existing.meals as {
            coaches?: CoachProfile[];
            groups?: TraineeGroup[];
            globalQuickChips?: QuickContextChip[];
            coachPushSettings?: Record<string, CoachPushSubscriptionSettings>;
          })
        : {};

    const mergedMeta = {
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
      coachPushSettings:
        partial.coachPushSettings !== undefined
          ? partial.coachPushSettings
          : currentMeta.coachPushSettings || {},
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
        return { ok: true };
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

export async function saveGlobalQuickChipsToSupabase(
  globalQuickChips: QuickContextChip[]
) {
  const res = await saveSystemMetaBackup({ globalQuickChips });
  if (!res.ok) {
    throw new Error(res.error || 'Supabase global quick chips save failed');
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

export async function saveCoachesToSupabase(
  coaches: CoachProfile[],
  options?: { skipMetaBackup?: boolean }
) {
  if (!supabase) return;

  const backupRes = options?.skipMetaBackup
    ? { ok: false, error: undefined }
    : await saveSystemMetaBackup({ coaches });

  if (coaches.length === 0) return;

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
      countObservationInStats: Boolean(t.countObservationInStats),
      activeDateRange: t.activeDateRange,
      mealCardShortcuts: t.mealCardShortcuts,
      savedMeals: t.savedMeals || [],
      customServingTools: t.customServingTools || [],
      customFoodUnits: t.customFoodUnits || [],
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
    },
  });

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

/**
 * חיפוש מהיר ישירות מול PostgreSQL (GIN trigram index) — אינו טוען שורות מיותרות ל-RAM.
 */
export async function searchFoodCatalogSql(opts: {
  query?: string;
  sourceSiteId?: string;
  limit?: number;
}): Promise<{ items: FoodCatalogItem[]; tableReady: boolean }> {
  if (!supabase) return { items: [], tableReady: false };
  const limit = Math.min(120, Math.max(1, opts.limit || 60));

  const runFilteredQuery = async (mode: 'exact_site' | 'retail_only' | 'moh_only', rowLimit: number) => {
    let req = supabase!
      .from('food_catalog_items')
      .select(FOOD_CATALOG_SELECT_COLS);

    if (mode === 'exact_site' && opts.sourceSiteId) {
      req = req.eq('source_site_id', opts.sourceSiteId);
    } else if (mode === 'retail_only') {
      req = req.neq('source_site_id', 'moh_gov');
    } else if (mode === 'moh_only') {
      req = req.eq('source_site_id', 'moh_gov');
    }

    const qNorm = opts.query ? normalizeFoodKey(opts.query) : '';
    if (qNorm) {
      const tokens = qNorm.split(/\s+/).filter((t) => t.length >= 1).slice(0, 4);
      for (const tok of tokens) {
        req = req.ilike('name_norm', `%${tok}%`);
      }
    }

    return req.order('updated_at', { ascending: false }).limit(rowLimit);
  };

  try {
    const specificSite = opts.sourceSiteId && opts.sourceSiteId !== 'all' && opts.sourceSiteId !== 'local';
    if (specificSite) {
      const { data, error } = await runFilteredQuery('exact_site', limit);
      if (error) {
        return { items: [], tableReady: !isMissingFoodTableError(error) };
      }
      const items = (data || [])
        .map((r) => mapSqlRowToFoodCatalogItem(r as Record<string, unknown>))
        .filter((x): x is FoodCatalogItem => Boolean(x));
      return { items, tableReady: true };
    }

    // בחיפוש "הכל": מונע מ-4,610 רשומות משרד הבריאות להסתיר מוצרי סופרים ורשתות שיווק מהתוצאות
    const [retailRes, mohRes] = await Promise.all([
      runFilteredQuery('retail_only', Math.min(90, limit)),
      runFilteredQuery('moh_only', Math.min(35, Math.ceil(limit / 2))),
    ]);

    if (retailRes.error && isMissingFoodTableError(retailRes.error)) {
      return { items: [], tableReady: false };
    }

    const combinedRows = [...(retailRes.data || []), ...(mohRes.data || [])];
    const items = combinedRows
      .map((r) => mapSqlRowToFoodCatalogItem(r as Record<string, unknown>))
      .filter((x): x is FoodCatalogItem => Boolean(x));

    return { items, tableReady: true };
  } catch {
    return { items: [], tableReady: false };
  }
}

export async function findFoodByBarcodeSql(
  barcode: string
): Promise<{ item: FoodCatalogItem | null; tableReady: boolean }> {
  if (!supabase || !barcode) return { item: null, tableReady: false };
  try {
    const { data, error } = await supabase
      .from('food_catalog_items')
      .select(FOOD_CATALOG_SELECT_COLS)
      .eq('barcode', barcode)
      .limit(1)
      .maybeSingle();

    if (error) {
      return { item: null, tableReady: !isMissingFoodTableError(error) };
    }
    if (!data) return { item: null, tableReady: true };
    return {
      item: mapSqlRowToFoodCatalogItem(data as Record<string, unknown>),
      tableReady: true,
    };
  } catch {
    return { item: null, tableReady: false };
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
