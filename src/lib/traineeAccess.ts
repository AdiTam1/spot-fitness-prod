import type { AccountStatus, AuthSessionUser } from '@/types/nutrition';

export interface TraineeAccessTarget {
  id?: string;
  status?: AccountStatus;
  primaryCoachId: string;
  sharedCoachIds?: string[];
}

export interface TraineeAccessLookupResult {
  found: boolean;
  target?: TraineeAccessTarget;
  dbUnavailable?: boolean;
  dbError?: string;
}

export type AiTargetAuthorizationResult =
  | { ok: true; skippedDbCheck?: boolean }
  | {
      ok: false;
      status: 403 | 503;
      error: string;
      reasonCode: 'AUTH_OR_PERMISSION' | 'AUTH_DB_UNAVAILABLE';
      dbError?: string;
    };

export function canCoachAccessTraineeTarget(
  session: AuthSessionUser,
  trainee: TraineeAccessTarget
): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'coach') {
    // מתאמנים בסטטוס pending שנרשמו ללא קוד מאמן שייכים ל-coach-admin וגלויים רק למנהל הראשי!
    if (
      trainee.status === 'pending' &&
      trainee.primaryCoachId === 'coach-admin'
    ) {
      return false;
    }
    return (
      trainee.primaryCoachId === session.id ||
      (trainee.sharedCoachIds || []).includes(session.id)
    );
  }
  return false;
}

export function evaluateTraineeAiTargetAuthorization(
  sessionUser: AuthSessionUser,
  targetTraineeId: string,
  lookup?: TraineeAccessLookupResult
): AiTargetAuthorizationResult {
  if (sessionUser.role === 'trainee') {
    if (targetTraineeId === sessionUser.id) {
      return { ok: true, skippedDbCheck: true };
    }
    return {
      ok: false,
      status: 403,
      error: 'אין הרשאה לסנכרן משימת AI למתאמן זה',
      reasonCode: 'AUTH_OR_PERMISSION',
    };
  }

  if (!lookup) {
    return {
      ok: false,
      status: 503,
      error: 'שגיאת חיבור זמנית למסד הנתונים (Supabase) — לא ניתן לאמת הרשאה כרגע',
      reasonCode: 'AUTH_DB_UNAVAILABLE',
    };
  }

  if (lookup.dbUnavailable) {
    return {
      ok: false,
      status: 503,
      error: lookup.dbError
        ? `שגיאת חיבור או עומס זמני במסד הנתונים (Supabase): ${lookup.dbError}`
        : 'שגיאת חיבור או עומס זמני במסד הנתונים (Supabase) — לא ניתן לאמת הרשאה כרגע',
      reasonCode: 'AUTH_DB_UNAVAILABLE',
      dbError: lookup.dbError,
    };
  }

  if (!lookup.found || !lookup.target) {
    return {
      ok: false,
      status: 403,
      error: 'אין הרשאה לסנכרן משימת AI למתאמן זה',
      reasonCode: 'AUTH_OR_PERMISSION',
    };
  }

  if (!canCoachAccessTraineeTarget(sessionUser, lookup.target)) {
    return {
      ok: false,
      status: 403,
      error: 'אין הרשאה לסנכרן משימת AI למתאמן זה',
      reasonCode: 'AUTH_OR_PERMISSION',
    };
  }

  return { ok: true };
}
