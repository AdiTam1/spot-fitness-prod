import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AccountStatus,
  CoachProfile,
  NutritionTemplate,
  TraineeGroup,
  TraineeProfile,
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
  return {
    id: String(row.id),
    email: String(row.email || ''),
    password: String(row.password || ''),
    name,
    avatar: String(row.avatar || name.charAt(0) || 'מ'),
    phone: String(row.phone || ''),
    inviteCode: String(row.invite_code || ''),
    status: row.status === 'paused' ? 'paused' : 'active',
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

function mapRowToTrainee(row: Record<string, unknown>): TraineeProfile {
  const name = String(row.name || 'מתאמן');
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
    primaryCoachId: String(row.primary_coach_id || 'coach-admin'),
    sharedCoachIds: Array.isArray(row.shared_coach_ids)
      ? (row.shared_coach_ids as string[])
      : [],
    groupId: row.group_id ? String(row.group_id) : undefined,
    workoutTemplate: row.workout_template as NutritionTemplate,
    restTemplate: row.rest_template as NutritionTemplate,
    favoriteFoodIds: Array.isArray(row.favorite_food_ids)
      ? (row.favorite_food_ids as string[])
      : [],
    weightHistory: Array.isArray(row.weight_history)
      ? (row.weight_history as { date: string; weight: number }[])
      : [],
    logs:
      row.logs && typeof row.logs === 'object'
        ? (row.logs as TraineeProfile['logs'])
        : {},
  };
}

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

  const coaches: CoachProfile[] = Array.isArray(coachesRes.data)
    ? coachesRes.data.map((r) => mapRowToCoach(r))
    : [];

  const groups: TraineeGroup[] = Array.isArray(groupsRes.data)
    ? groupsRes.data.map((r) => mapRowToGroup(r))
    : [];

  const templates: NutritionTemplate[] = Array.isArray(tplRes.data)
    ? tplRes.data.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        dayType: row.day_type || 'workout',
        tolerancePercent: Number(row.tolerance_percent) || 10,
        ownerCoachId: String(row.owner_coach_id || 'coach-admin'),
        meals: row.meals || [],
      }))
    : [];

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
  if (error || !data) return null;
  return mapRowToCoach(data);
}

export async function saveCoachesToSupabase(coaches: CoachProfile[]) {
  if (!supabase || coaches.length === 0) return;
  const rows = coaches.map((c) => ({
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
  await supabase.from('coaches').upsert(rows, { onConflict: 'id' });
}

export async function deleteCoachFromSupabase(coachId: string) {
  if (!supabase) return;
  await supabase.from('coaches').delete().eq('id', coachId);
}

export async function saveGroupsToSupabase(groups: TraineeGroup[]) {
  if (!supabase || groups.length === 0) return;
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
    // Fallback if owner_coach_id column wasn't migrated yet
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
    logs: t.logs,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('trainees')
    .upsert(rows, { onConflict: 'id' });
  if (error) {
    // Fallback if primary_coach_id/shared_coach_ids/group_id columns weren't migrated yet
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
      logs: t.logs,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('trainees').upsert(legacyRows, { onConflict: 'id' });
  }
}

export async function deleteTraineeFromSupabase(traineeId: string) {
  if (!supabase) return;
  await supabase.from('trainees').delete().eq('id', traineeId);
}
