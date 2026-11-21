import { NextRequest, NextResponse } from 'next/server';
import {
  attachSessionCookie,
  checkRateLimit,
  clearSessionCookie,
  generateSecureId,
  getSessionFromRequest,
  hashPassword,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
  verifyPassword,
} from '@/lib/serverAuth';
import {
  getServerDbState,
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import {
  AccountStatus,
  AuthSessionUser,
  TraineeProfile,
} from '@/types/nutrition';
import { DEFAULT_TEMPLATES } from '@/data/israeliFoodCatalog';

export async function GET(request: NextRequest) {
  const user = getSessionFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { user: null },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // אימות חי מול מסד הנתונים: אם המאמן השהה או מחק את המתאמן, הסשן מבוטל מיד!
  if (user.role === 'trainee') {
    const liveTrainee = await getSingleTraineeFromServer(user.id);
    if (!liveTrainee || liveTrainee.status !== 'active') {
      const res = NextResponse.json(
        { user: null, suspended: true },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
      return clearSessionCookie(res);
    }
  }

  return NextResponse.json(
    { user },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function POST(request: NextRequest) {
  try {
    // 1. הגנת CSRF (בדיקת Origin / Host)
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה ממקור לא מורשה (CSRF Blocked)' },
        { status: 403 }
      );
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'local-ip';

    // 2. הגנת Brute-Force: עד 10 ניסיונות בדקה מאותו IP
    const rl = checkRateLimit(`auth-${ip}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'יותר מדי ניסיונות התחברות. אנא המתן דקה ונסה שוב.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { action } = body as { action: 'login' | 'register' };
    const dbState = await getServerDbState();

    // =========================================================================
    // מסלול א': הרשמת מתאמן חדש בצד השרת בלבד (ללא חשיפת קוד המאמן לדפדפן!)
    // =========================================================================
    if (action === 'register') {
      const name = sanitizeText(body.name, 80);
      const email = sanitizeText(body.email, 120).toLowerCase();
      const rawPassword = typeof body.password === 'string' ? body.password.trim() : '';
      const phone = sanitizeText(body.phone, 30);
      const goal = sanitizeText(body.goal, 120) || 'חיטוב ותזונה מותאמת';
      const currentWeight = sanitizeNumber(body.currentWeight, 35, 250, 75);
      const inviteCode = sanitizeText(body.inviteCode, 40);

      if (!name || !email || !email.includes('@') || rawPassword.length < 4) {
        return NextResponse.json(
          { error: 'נא להזין שם מלא, אימייל תקין וסיסמה (לפחות 4 תווים)' },
          { status: 400 }
        );
      }

      const emailExists =
        email === dbState.coachEmail.toLowerCase() ||
        dbState.trainees.some((t) => (t.email || '').toLowerCase() === email);

      if (emailExists) {
        return NextResponse.json(
          { error: 'כתובת האימייל הזו כבר רשומה במערכת' },
          { status: 409 }
        );
      }

      // בדיקת קוד המאמן בצד השרת בלבד!
      const isInviteValid =
        Boolean(inviteCode) &&
        inviteCode.toUpperCase() === dbState.coachInviteCode.toUpperCase();

      const initialStatus: AccountStatus = isInviteValid ? 'active' : 'pending';
      const defaultTpl = dbState.templates[0] || DEFAULT_TEMPLATES[0];

      const newTrainee: TraineeProfile = {
        id: generateSecureId('trainee'), // UUIDv4 בלתי ניתן לניחוש
        email,
        password: hashPassword(rawPassword), // נשמר מגובב ב-HMAC-SHA256 בלבד
        status: initialStatus,
        name,
        avatar: name.charAt(0) || 'מ',
        phone,
        goal,
        currentWeight,
        targetWeight: Math.max(45, currentWeight - 4),
        tolerancePercent: 10,
        workoutTemplate: JSON.parse(JSON.stringify(defaultTpl)),
        restTemplate: JSON.parse(JSON.stringify(defaultTpl)),
        favoriteFoodIds: [
          'cottage-tnuva-5',
          'chicken-breast-grilled',
          'krembo-strauss',
        ],
        weightHistory: [{ date: 'התחלה', weight: currentWeight }],
        logs: {},
      };

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: [...prev.trainees, newTrainee],
      }));

      const sessionUser: AuthSessionUser = {
        id: newTrainee.id,
        email: newTrainee.email,
        name: newTrainee.name,
        role: 'trainee', // מקובע בשרת כמתאמן בלבד!
        status: initialStatus,
      };

      const res = NextResponse.json({
        user: sessionUser,
        isPending: initialStatus === 'pending',
      });

      if (initialStatus === 'active') {
        return attachSessionCookie(res, sessionUser);
      }
      return res;
    }

    // =========================================================================
    // מסלול ב': התחברות משתמש קיים (מאמן או מתאמן) בצד השרת בלבד
    // =========================================================================
    const cleanEmail = sanitizeText(body.email, 120).toLowerCase();
    const cleanPass = typeof body.password === 'string' ? body.password.trim() : '';

    if (!cleanEmail || !cleanPass) {
      return NextResponse.json(
        { error: 'נא להזין אימייל וסיסמה' },
        { status: 400 }
      );
    }

    // 1. בדיקת התחברות מאמן מול הגיבוב שבשרת
    if (
      cleanEmail === dbState.coachEmail.toLowerCase() &&
      verifyPassword(cleanPass, dbState.coachPasswordHash)
    ) {
      const coachUser: AuthSessionUser = {
        id: 'coach-admin',
        email: dbState.coachEmail,
        name: 'מאמן ראשי',
        role: 'coach',
        status: 'active',
      };
      const res = NextResponse.json({ user: coachUser });
      return attachSessionCookie(res, coachUser);
    }

    // 2. בדיקת התחברות מתאמן מול מסד הנתונים בשרת
    const matched = dbState.trainees.find(
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
      role: 'trainee',
      status: 'active',
    };

    const res = NextResponse.json({ user: traineeUser });
    return attachSessionCookie(res, traineeUser);
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת באימות' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF Blocked' }, { status: 403 });
  }
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
