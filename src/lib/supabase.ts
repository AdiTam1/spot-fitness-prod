import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NutritionTemplate, TraineeProfile } from '@/types/nutrition';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function loadStateFromSupabase(): Promise<{
  templates: NutritionTemplate[] | null;
  trainees: TraineeProfile[] | null;
}> {
  if (!supabase) return { templates: null, trainees: null };

  try {
    const [tplRes, trRes] = await Promise.all([
      supabase.from('nutrition_templates').select('*'),
      supabase.from('trainees').select('*'),
    ]);

    const templates: NutritionTemplate[] | null =
      tplRes.data && tplRes.data.length > 0
        ? tplRes.data.map((row) => ({
            id: row.id,
            name: row.name,
            description: row.description || '',
            dayType: row.day_type || 'workout',
            tolerancePercent: Number(row.tolerance_percent) || 10,
            meals: row.meals || [],
          }))
        : null;

    const trainees: TraineeProfile[] | null =
      trRes.data && trRes.data.length > 0
        ? trRes.data.map((row) => ({
            id: row.id,
            name: row.name,
            avatar: row.avatar || row.name?.charAt(0) || 'מ',
            phone: row.phone || '',
            goal: row.goal || '',
            currentWeight: Number(row.current_weight) || 75,
            targetWeight: Number(row.target_weight) || 70,
            tolerancePercent: Number(row.tolerance_percent) || 10,
            workoutTemplate: row.workout_template,
            restTemplate: row.rest_template,
            favoriteFoodIds: row.favorite_food_ids || [],
            weightHistory: row.weight_history || [],
            logs: row.logs || {},
          }))
        : null;

    return { templates, trainees };
  } catch (err) {
    console.warn('Supabase load warning:', err);
    return { templates: null, trainees: null };
  }
}

export async function saveTemplatesToSupabase(templates: NutritionTemplate[]) {
  if (!supabase || templates.length === 0) return;
  try {
    const rows = templates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      day_type: t.dayType,
      tolerance_percent: t.tolerancePercent,
      meals: t.meals,
      updated_at: new Date().toISOString(),
    }));
    await supabase.from('nutrition_templates').upsert(rows, { onConflict: 'id' });
  } catch (err) {
    console.warn('Supabase save templates warning:', err);
  }
}

export async function saveTraineesToSupabase(trainees: TraineeProfile[]) {
  if (!supabase || trainees.length === 0) return;
  try {
    const rows = trainees.map((t) => ({
      id: t.id,
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
    await supabase.from('trainees').upsert(rows, { onConflict: 'id' });
  } catch (err) {
    console.warn('Supabase save trainees warning:', err);
  }
}
