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

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  '';

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

export async function loadStateFromSupabase(): Promise<{
  coaches: CoachProfile[];
  groups: TraineeGroup[];
  templates: NutritionTemplate[];
  trainees: TraineeProfile[];
}> {
  if (!supabase) {
    return { coaches: [], groups: [], templates: [], trainees: [] };
  }

  const [coachesRes, groupsRes, tplRes, trRes] = await Promise.all([
    supabase.from('coaches').select('*'),
    supabase.from('trainee_groups').select('*'),
    supabase.from('nutrition_templates').select('*'),
    supabase.from('trainees').select('*'),
  ]);

  const rawTemplates = Array.isArray(tplRes.data) ? tplRes.data : [];
  const systemMetaRow = rawTemplates.find(
    (r) => r.id === SYSTEM_META_TEMPLATE_ID
  );
  let fallbackCoaches: CoachProfile[] = [];
  let fallbackGroups: TraineeGroup[] = [];

  if (systemMetaRow && systemMetaRow.meals && typeof systemMetaRow.meals === 'object') {
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

  return { coaches, groups, templates, trainees };
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

async function saveSystemMetaBackup(
  partial: { coaches?: CoachProfile[]; groups?: TraineeGroup[] }
): Promise<boolean> {
  if (!supabase) return false;
  const { data: existing } = await supabase
    .from('nutrition_templates')
    .select('*')
    .eq('id', SYSTEM_META_TEMPLATE_ID)
    .maybeSingle();

  const currentMeta =
    existing && existing.meals && typeof existing.meals === 'object'
      ? (existing.meals as { coaches?: CoachProfile[]; groups?: TraineeGroup[] })
      : {};

  const mergedMeta = {
    coaches: partial.coaches !== undefined ? partial.coaches : currentMeta.coaches || [],
    groups: partial.groups !== undefined ? partial.groups : currentMeta.groups || [],
  };

  const { error } = await supabase.from('nutrition_templates').upsert(
    [
      {
        id: SYSTEM_META_TEMPLATE_ID,
        name: '__SYSTEM_META__',
        description: 'System backup for coaches and groups',
        day_type: 'workout',
        tolerance_percent: 10,
        meals: mergedMeta,
        updated_at: new Date().toISOString(),
      },
    ],
    { onConflict: 'id' }
  );
  return !error;
}

export async function saveCoachesToSupabase(coaches: CoachProfile[]) {
  if (!supabase) return;
  const backupOk = await saveSystemMetaBackup({ coaches });

  if (coaches.length === 0) return;
  const rows = coaches.map((c) => ({
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
  const { error } = await supabase
    .from('coaches')
    .upsert(rows, { onConflict: 'id' });
  if (error) {
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
    const legacyRes = await supabase
      .from('coaches')
      .upsert(legacyRows, { onConflict: 'id' });
    if (legacyRes.error && !backupOk) {
      throw new Error(`Supabase coaches upsert failed: ${legacyRes.error.message}`);
    }
  }
}

export async function deleteCoachFromSupabase(coachId: string) {
  if (!supabase) return;
  await supabase.from('coaches').delete().eq('id', coachId);
  const fullState = await loadStateFromSupabase();
  const remaining = fullState.coaches.filter((c) => c.id !== coachId);
  await saveSystemMetaBackup({ coaches: remaining });
}

export async function saveGroupsToSupabase(groups: TraineeGroup[]) {
  if (!supabase) return;
  await saveSystemMetaBackup({ groups });
  if (groups.length === 0) return;
  const rows = groups.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    owner_coach_id: g.ownerCoachId,
    updated_at: new Date().toISOString(),
  }));
  await supabase.from('trainee_groups').upsert(rows, { onConflict: 'id' });
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
    await supabase
      .from('nutrition_templates')
      .upsert(legacyRows, { onConflict: 'id' });
  }
}

export async function deleteTemplateFromSupabase(templateId: string) {
  if (!supabase) return;
  await supabase.from('nutrition_templates').delete().eq('id', templateId);
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
    await supabase.from('trainees').upsert(legacyRows, { onConflict: 'id' });
  }
}

export async function deleteTraineeFromSupabase(traineeId: string) {
  if (!supabase) return;
  await supabase.from('trainees').delete().eq('id', traineeId);
}
