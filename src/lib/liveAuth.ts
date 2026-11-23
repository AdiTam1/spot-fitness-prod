import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  getSessionFromRequest,
} from '@/lib/serverAuth';
import {
  getCoachAuthStateFromServer,
  getTraineeAuthStateFromServer,
  touchUserLastSeenOnServer,
} from '@/lib/serverStore';
import { AuthRejectionCode, AuthSessionUser } from '@/types/nutrition';

export type LiveSessionCheckResult =
  | {
      ok: true;
      session: AuthSessionUser;
      liveName: string;
      sessionVersion: number;
    }
  | {
      ok: false;
      code: AuthRejectionCode;
      status: 401 | 403;
      message: string;
      response: NextResponse;
    };

function buildRejectionResponse(
  code: AuthRejectionCode,
  status: 401 | 403,
  message: string,
  clearCookie = true
): NextResponse {
  const res = NextResponse.json(
    {
      error: message,
      code,
      suspended: code === 'ACCOUNT_BLOCKED',
      revoked: code === 'SESSION_REVOKED',
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    }
  );
  return clearCookie ? clearSessionCookie(res) : res;
}

/**
 * אימות חי מלא מול ה-DB:
 * 1. חתימה קריפטוגרפית ותוקף העוגייה
 * 2. סטטוס חשבון פעיל (אם הושהה / נחסם / נמחק -> 403 ACCOUNT_BLOCKED)
 * 3. גרסת סשן תואמת (אם המאמן/מנהל ניתק מרחוק -> 401 SESSION_REVOKED)
 */
export async function authenticateActiveSession(
  request: NextRequest,
  options?: { touchLastSeen?: boolean }
): Promise<LiveSessionCheckResult> {
  const session = getSessionFromRequest(request);
  if (!session) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      status: 401,
      message: 'נדרשת התחברות למערכת',
      response: buildRejectionResponse(
        'UNAUTHENTICATED',
        401,
        'נדרשת התחברות למערכת',
        false
      ),
    };
  }

  if (session.role === 'admin') {
    return {
      ok: true,
      session,
      liveName: session.name,
      sessionVersion: Math.max(1, Number(session.sv) || 1),
    };
  }

  const live =
    session.role === 'trainee'
      ? await getTraineeAuthStateFromServer(session.id)
      : await getCoachAuthStateFromServer(session.id);

  if (!live || live.status !== 'active') {
    const msg =
      session.role === 'coach'
        ? 'חשבון המאמן שלך נחסם או הושהה. אנא פנה למנהל הראשי.'
        : 'החשבון שלך נחסם או הושהה. אנא פנה למאמן שלך.';
    return {
      ok: false,
      code: 'ACCOUNT_BLOCKED',
      status: 403,
      message: msg,
      response: buildRejectionResponse('ACCOUNT_BLOCKED', 403, msg, true),
    };
  }

  const tokenSv = Math.max(1, Number(session.sv) || 1);
  const liveSv = Math.max(1, Number(live.sessionVersion) || 1);
  if (tokenSv !== liveSv) {
    const msg =
      session.role === 'coach'
        ? 'נותקת מרחוק על ידי מנהל המערכת. אנא התחבר מחדש.'
        : 'נותקת מרחוק על ידי המאמן / מנהל המערכת. אנא התחבר מחדש.';
    return {
      ok: false,
      code: 'SESSION_REVOKED',
      status: 401,
      message: msg,
      response: buildRejectionResponse('SESSION_REVOKED', 401, msg, true),
    };
  }

  if (options?.touchLastSeen !== false) {
    // עדכון שקט של זמן חיבור אחרון (מסונן בצד השרת אחת ל-45 שניות למניעת עומס כתיבות)
    void touchUserLastSeenOnServer(session.role, session.id, live.lastSeenAt).catch(
      () => {}
    );
  }

  return {
    ok: true,
    session: {
      ...session,
      name: live.name || session.name,
      sv: liveSv,
    },
    liveName: live.name || session.name,
    sessionVersion: liveSv,
  };
}
