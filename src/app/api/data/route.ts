import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, hashPassword } from '@/lib/serverAuth';
import {
  deleteTraineeFromSupabase,
  isSupabaseConfigured,
  loadSingleTraineeFromSupabase,
  loadStateFromSupabase,
  saveTemplatesToSupabase,
  saveTraineesToSupabase,
} from '@/lib/supabase';
import { NutritionTemplate, TraineeProfile } from '@/types/nutrition';

/**
 * שער נתונים מאובטח בצד השרת (Role-Based Data Gateway)
 * מוודא שמתאמן מקבל ומעדכן אך ורק את הפרופיל של עצמו (ללא חשיפת מתאמנים אחרים ברשת או בדפדפן)
 */
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      mode: 'local',
      role: session.role,
    });
  }

  // אם המשתמש המחובר הוא מתאמן -> מחזיר אך ורק את הרשומה האישית שלו וללא שדה סיסמה!
  if (session.role === 'trainee') {
    const myProfile = await loadSingleTraineeFromSupabase(session.id);
    if (!myProfile) {
      return NextResponse.json({ trainees: [], templates: [] });
    }
    const sanitized: TraineeProfile = {
      ...myProfile,
      password: '', // לעולם לא מחזיר סיסמה לדפדפן של המתאמן
    };
    return NextResponse.json({
      trainees: [sanitized],
      templates: [],
      role: 'trainee',
    });
  }

  // אם המשתמש המחובר הוא המאמן (חתום ב-HMAC בשרת) -> מחזיר את כל המתאמנים והטמפלייטים
  const remote = await loadStateFromSupabase();
  return NextResponse.json({
    trainees: remote.trainees || [],
    templates: remote.templates || [],
    role: 'coach',
  });
}

export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, trainee, trainees, templates, deleteTraineeId } = body as {
      action:
        | 'trainee-self-update'
        | 'coach-sync'
        | 'coach-delete-trainee';
      trainee?: TraineeProfile;
      trainees?: TraineeProfile[];
      templates?: NutritionTemplate[];
      deleteTraineeId?: string;
    };

    // 1. מתאמן יכול לעדכן אך ורק את היומן, המשקל והמועדפים של עצמו!
    if (session.role === 'trainee') {
      if (action !== 'trainee-self-update' || !trainee || trainee.id !== session.id) {
        return NextResponse.json(
          { error: 'אין הרשאה לבצע פעולה זו' },
          { status: 403 }
        );
      }

      if (isSupabaseConfigured) {
        const existing = await loadSingleTraineeFromSupabase(session.id);
        if (existing) {
          // שומר על יעדי המאמן (workoutTemplate, restTemplate, tolerancePercent, status) נעולים מהשרת!
          const lockedTrainee: TraineeProfile = {
            ...existing,
            logs: trainee.logs,
            currentWeight: trainee.currentWeight,
            weightHistory: trainee.weightHistory,
            favoriteFoodIds: trainee.favoriteFoodIds,
          };
          await saveTraineesToSupabase([lockedTrainee]);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // 2. פעולות מאמן בלבד (נבדק שהחתימה הקריפטוגרפית היא role === 'coach')
    if (session.role === 'coach') {
      if (action === 'coach-delete-trainee' && deleteTraineeId) {
        if (isSupabaseConfigured) {
          await deleteTraineeFromSupabase(deleteTraineeId);
        }
        return NextResponse.json({ ok: true });
      }

      if (action === 'coach-sync') {
        if (isSupabaseConfigured) {
          if (templates && templates.length > 0) {
            await saveTemplatesToSupabase(templates);
          }
          if (trainees && trainees.length > 0) {
            // גיבוב סיסמאות חדשות לפני שמירה אם נדרש
            const prepared = trainees.map((t) => ({
              ...t,
              password: t.password || hashPassword('123456'),
            }));
            await saveTraineesToSupabase(prepared);
          }
        }
        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת בשמירת נתונים' }, { status: 500 });
  }
}
