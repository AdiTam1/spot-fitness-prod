import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AccountStatus,
  BodyMeasurementEntry,
  CoachOnboardingData,
  CoachProfile,
  NutritionTemplate,
  TraineeActivityTargets,
  TraineeGroup,
  TraineeOnboardingData,
  TraineeProfile,
  WeeklyCheckInEntry,
} from '@/types/nutrition';

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
    color: String(row.color || '#d2ff28'),
    ownerCoachId: String(row.owner_coach_id || 'coach-admin'),
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
  primaryCoachId?: string;
  sharedCoachIds?: string[];
  groupId?: string;
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

  const measurementsHistory =
    Array.isArray(row.measurements_history) &&
    row.measurements_history.length > 0
      ? (row.measurements_history as BodyMeasurementEntry[])
      : embeddedMeta.measurementsHistory || [];

  const observationDates =
    Array.isArray(row.observation_dates) && row.observation_dates.length > 0
      ? (row.observation_dates as string[])
      : embeddedMeta.observationDates || [];

  const countObservationInStats =
    typeof row.count_observation_in_stats === 'boolean'
      ? row.count_observation_in_stats
      : Boolean(embeddedMeta.countObservationInStats);

  const activityTargets: TraineeActivityTargets =
    embeddedMeta.activityTargets || {
      weeklyWorkoutsTarget: 4,
      workoutTypes: ['אימון כוח A', 'אימון כוח B', 'Full Body'],
      weeklyCardioTarget: 3,
      cardioMode: 'both',
      cardioTargetMinutes: 35,
      dailySleepTargetHours: 7.5,
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
      row.primary_coach_id || embeddedMeta.primaryCoachId || 'coach-admin'
    ),
    sharedCoachIds: Array.isArray(row.shared_coach_ids)
      ? (row.shared_coach_ids as string[])
      : embeddedMeta.sharedCoachIds || [],
    groupId: row.group_id
      ? String(row.group_id)
      : embeddedMeta.groupId || undefined,
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
    enableWorkoutRestSplit: Boolean(embeddedMeta.enableWorkoutRestSplit),
    coachAiNotes: embeddedMeta.coachAiNotes || '',
    aiLearnedPreferences: Array.isArray(embeddedMeta.aiLearnedPreferences)
      ? embeddedMeta.aiLearnedPreferences
      : [],
    weeklyCheckIns: Array.isArray(embeddedMeta.weeklyCheckIns)
      ? embeddedMeta.weeklyCheckIns
      : [],
    observationDates,
    countObservationInStats,
    logs: rawLogs as TraineeProfile['logs'],
  };
}

const SYSTEM_META_TEMPLATE_ID = '__spot_system_coaches_and_groups__';

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
  readErrors: string[];
}> {
  if (!supabase) {
    return {
      coaches: [],
      groups: [],
      templates: [],
      trainees: [],
      readErrors: [],
    };
  }

  const [coachesRes, groupsRes, tplRes, trRes] = await Promise.all([
    supabase.from('coaches').select('*'),
    supabase.from('trainee_groups').select('*'),
    supabase.from('nutrition_templates').select('*'),
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

  if (
    systemMetaRow &&
    systemMetaRow.meals &&
    typeof systemMetaRow.meals === 'object'
  ) {
    const metaObj = systemMetaRow.meals as {
      coaches?: CoachProfile[];
      groups?: TraineeGroup[];
    };
    if (Array.isArray(metaObj.coaches)) {
      fallbackCoaches = metaObj.coaches;
    }
    if (Array.isArray(metaObj.groups)) {
      fallbackGroups = metaObj.groups;
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
    groupMap.set(tg.id, tg);
  }
  const groups = Array.from(groupMap.values());

  const templates: NutritionTemplate[] = rawTemplates
    .filter((row) => row.id !== SYSTEM_META_TEMPLATE_ID)
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

  return { coaches, groups, templates, trainees, readErrors };
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

export async function saveSystemMetaBackup(partial: {
  coaches?: CoachProfile[];
  groups?: TraineeGroup[];
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
    updated_at: new Date().toISOString(),
  }));
  const first = await supabase
    .from('trainee_groups')
    .upsert(rows, { onConflict: 'id' });
  if (!first.error) return;

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
      primaryCoachId: t.primaryCoachId || 'coach-admin',
      sharedCoachIds: t.sharedCoachIds || [],
      groupId: t.groupId,
    },
  });

  const rows = trainees.map((t) => ({
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

  const { error } = await supabase
    .from('trainees')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    // גיבוי אוטומטי אם חלק מהעמודות החדשות טרם הורצו ב-SQL Editor: הכל נשמר בתוך logs.__profile_meta!
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
}

export async function deleteTraineeFromSupabase(traineeId: string) {
  if (!supabase) return;
  await supabase.from('trainees').delete().eq('id', traineeId);
}
