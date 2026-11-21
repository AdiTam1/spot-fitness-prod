import { NextRequest, NextResponse } from 'next/server';
import {
  attachSessionCookie,
  checkRateLimit,
  clearSessionCookie,
  getSessionFromRequest,
  verifyPassword,
} from '@/lib/serverAuth';
import { AuthSessionUser, TraineeProfile } from '@/types/nutrition';
import { isSupabaseConfigured, loadStateFromSupabase } from '@/lib/supabase';

const COACH_EMAIL = (process.env.COACH_EMAIL || 'coach@spot.co.il').toLowerCase();
const COACH_PASSWORD = process.env.COACH_PASSWORD || '123456';

export async function GET(request: NextRequest) {
  const user = getSessionFromRequest(request);
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'local-ip';

    // הגנת Brute-Force: עד 12 ניסיונות בדקה מאותו IP
    const rl = checkRateLimit(`auth-${ip}`, 12, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'יותר מדי ניסיונות התחברות. אנא המתן דקה ונסה שוב.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { action, email, password, clientTrainees, registeredUser } = body as {
      action: 'login' | 'register-session';
      email?: string;
      password?: string;
      clientTrainees?: TraineeProfile[];
      registeredUser?: AuthSessionUser;
    };

    // אחרי הרשמה חדשה שנוצרה כמתאמן בלבד (לעולם לא מאפשר הרשמה עצמית כ-coach!)
    if (action === 'register-session' && registeredUser) {
      const safeTraineeSession: AuthSessionUser = {
        id: registeredUser.id,
        email: registeredUser.email,
        name: registeredUser.name,
        role: 'trainee', // נאכף קשיח בשרת! מתאמן לעולם לא יכול להירשם כ-coach
        status: registeredUser.status === 'active' ? 'active' : 'pending',
      };
      const res = NextResponse.json({ user: safeTraineeSession });
      return attachSessionCookie(res, safeTraineeSession);
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    if (!cleanEmail || !cleanPass) {
      return NextResponse.json(
        { error: 'נא להזין אימייל וסיסמה' },
        { status: 400 }
      );
    }

    // 1. אימות מאמן בצד השרת בלבד
    if (cleanEmail === COACH_EMAIL && verifyPassword(cleanPass, COACH_PASSWORD)) {
      const coachUser: AuthSessionUser = {
        id: 'coach-admin',
        email: COACH_EMAIL,
        name: 'מאמן ראשי',
        role: 'coach',
        status: 'active',
      };
      const res = NextResponse.json({ user: coachUser });
      return attachSessionCookie(res, coachUser);
    }

    // 2. אימות מתאמן מול Supabase (או רשימת המתאמנים המקומית אם עובדים אופליין)
    let pool: TraineeProfile[] = clientTrainees || [];
    if (isSupabaseConfigured) {
      const remote = await loadStateFromSupabase();
      if (remote.trainees && remote.trainees.length > 0) {
        pool = remote.trainees;
      }
    }

    const matched = pool.find(
      (t) =>
        (t.email || '').toLowerCase() === cleanEmail &&
        verifyPassword(cleanPass, t.password || '123456')
    );

    if (!matched) {
      return NextResponse.json(
        { error: 'אימייל או סיסמה שגויים' },
        { status: 401 }
      );
    }

    if (matched.status === 'pending') {
      return NextResponse.json(
        {
          error: `שלום ${matched.name}, החשבון שלך ממתין לאישור המאמן. ברגע שהמאמן יאשר אותך תוכל להיכנס.`,
          isPending: true,
        },
        { status: 403 }
      );
    }

    if (matched.status === 'paused') {
      return NextResponse.json(
        {
          error: 'המנוי שלך מושהה כרגע במערכת. אנא פנה למאמן שלך.',
        },
        { status: 403 }
      );
    }

    const traineeUser: AuthSessionUser = {
      id: matched.id,
      email: matched.email,
      name: matched.name,
      role: 'trainee', // חתום קריפטוגרפית בשרת כ-trainee בלבד
      status: 'active',
    };

    const res = NextResponse.json({ user: traineeUser });
    return attachSessionCookie(res, traineeUser);
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת באימות' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
