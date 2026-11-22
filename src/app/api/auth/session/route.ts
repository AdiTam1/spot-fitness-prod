import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
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
  getSingleCoachFromServer,
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import {
  AccountStatus,
  AuthSessionUser,
  TraineeProfile,
} from '@/types/nutrition';
import { DEFAULT_TEMPLATES, getTodayIso } from '@/data/israeliFoodCatalog';

export async function GET(request: NextRequest) {
  const user = getSessionFromRequest(request);
  if (!user) {
    return NextResponse.json(
      { user: null },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // אימות חי למתאמן: אם הושהה או נמחק – הסשן מבוטל מיד
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

  // אימות חי למאמן: אם המנהל הראשי השהה או מחק את המאמן – הסשן מבוטל מיד
  if (user.role === 'coach') {
    const liveCoach = await getSingleCoachFromServer(user.id);
    if (!liveCoach || liveCoach.status !== 'active') {
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
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'local-ip';

    const rl = checkRateLimit(`auth-${ip}`, 12, 60);
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
    // מסלול א': הרשמת מתאמן חדש עם ניתוב חכם לפי קוד הזמנה אישי של מאמן
    // =========================================================================
    if (action === 'register') {
      const name = sanitizeText(body.name, 80);
      const email = sanitizeText(body.email, 120).toLowerCase();
      const rawPassword =
        typeof body.password === 'string' ? body.password.trim() : '';
      const phone = sanitizeText(body.phone, 30);
      const goal = sanitizeText(body.goal, 120) || 'חיטוב ותזונה מותאמת';
      const currentWeight = sanitizeNumber(body.currentWeight, 35, 250, 75);
      const inviteCode = sanitizeText(body.inviteCode, 40).toUpperCase();

      if (!name || !email || !email.includes('@') || rawPassword.length < 4) {
        return NextResponse.json(
          { error: 'נא להזין שם מלא, אימייל תקין וסיסמה (לפחות 4 תווים)' },
          { status: 400 }
        );
      }

      // בדיקת ייחודיות אימייל גלובלית (מנהל ראשי + מאמנים + מתאמנים)
      const emailExists =
        email === dbState.coachEmail.toLowerCase() ||
        dbState.coaches.some((c) => c.email.toLowerCase() === email) ||
        dbState.trainees.some((t) => (t.email || '').toLowerCase() === email);

      if (emailExists) {
        return NextResponse.json(
          { error: 'כתובת האימייל הזו כבר רשומה במערכת' },
          { status: 409 }
        );
      }

      // ניתוב לפי קוד מאמן אישי
      let assignedPrimaryCoachId = 'coach-admin';
      let initialStatus: AccountStatus = 'pending';
      let defaultObsDays = 0;
      let defaultCountObs = false;
      let defaultTolerance = 10;

      if (inviteCode) {
        if (inviteCode === dbState.coachInviteCode.toUpperCase()) {
          assignedPrimaryCoachId = 'coach-admin';
          initialStatus = 'active';
        } else {
          const matchedCoach = dbState.coaches.find(
            (c) =>
              c.status === 'active' &&
              c.inviteCode.toUpperCase() === inviteCode
          );
          if (matchedCoach) {
            assignedPrimaryCoachId = matchedCoach.id;
            initialStatus = 'active';
            defaultObsDays =
              matchedCoach.onboarding?.defaultObservationDays ?? 0;
            defaultCountObs =
              matchedCoach.onboarding?.defaultCountObservationInStats ?? false;
            defaultTolerance =
              matchedCoach.onboarding?.defaultTolerancePercent ?? 10;
          }
        }
      }

      const initialObservationDates: string[] = [];
      const clampedObsDays = Math.max(
        0,
        Math.min(90, Math.round(Number(defaultObsDays) || 0))
      );
      for (let i = 0; i < clampedObsDays; i++) {
        initialObservationDates.push(getTodayIso(i));
      }

      const defaultTpl = dbState.templates[0] || DEFAULT_TEMPLATES[0];
      const hasExplicitWeight =
        typeof body.currentWeight === 'number' &&
        Number.isFinite(body.currentWeight);

      const newTrainee: TraineeProfile = {
        id: generateSecureId('trainee'),
        email,
        password: hashPassword(rawPassword),
        status: initialStatus,
        name,
        avatar: name.charAt(0) || 'מ',
        phone,
        goal,
        currentWeight,
        targetWeight: Math.max(45, currentWeight - 4),
        tolerancePercent: defaultTolerance,
        primaryCoachId: assignedPrimaryCoachId,
        sharedCoachIds: [],
        observationDates: initialObservationDates,
        countObservationInStats: defaultCountObs,
        workoutTemplate: JSON.parse(JSON.stringify(defaultTpl)),
        restTemplate: JSON.parse(JSON.stringify(defaultTpl)),
        favoriteFoodIds: [
          'cottage-tnuva-5',
          'chicken-breast-grilled',
          'krembo-strauss',
        ],
        weightHistory: hasExplicitWeight
          ? [{ date: 'התחלה', weight: currentWeight }]
          : [],
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
        role: 'trainee',
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
    // מסלול ב': התחברות (מנהל ראשי / מאמן / מתאמן)
    // =========================================================================
    const cleanEmail = sanitizeText(body.email, 120).toLowerCase();
    const cleanPass =
      typeof body.password === 'string' ? body.password.trim() : '';

    if (!cleanEmail || !cleanPass) {
      return NextResponse.json(
        { error: 'נא להזין אימייל וסיסמה' },
        { status: 400 }
      );
    }

    // 1. בדיקת התחברות מנהל ראשי (Super Admin)
    if (
      cleanEmail === dbState.coachEmail.toLowerCase() &&
      verifyPassword(cleanPass, dbState.coachPasswordHash)
    ) {
      const adminUser: AuthSessionUser = {
        id: 'coach-admin',
        email: dbState.coachEmail,
        name: 'מנהל ראשי',
        role: 'admin',
        status: 'active',
      };
      const res = NextResponse.json({ user: adminUser });
      return attachSessionCookie(res, adminUser);
    }

    // 2. בדיקת התחברות מאמן (Coach)
    const matchedCoach = dbState.coaches.find(
      (c) =>
        c.email.toLowerCase() === cleanEmail &&
        verifyPassword(cleanPass, c.password || '')
    );

    if (matchedCoach) {
      if (matchedCoach.status === 'paused') {
        return NextResponse.json(
          { error: 'חשבון המאמן שלך מושהה כרגע. אנא פנה למנהל הראשי.' },
          { status: 403 }
        );
      }
      const coachUser: AuthSessionUser = {
        id: matchedCoach.id,
        email: matchedCoach.email,
        name: matchedCoach.name,
        role: 'coach',
        status: 'active',
      };
      const res = NextResponse.json({ user: coachUser });
      return attachSessionCookie(res, coachUser);
    }

    // 3. בדיקת התחברות מתאמן (Trainee)
    const matchedTrainee = dbState.trainees.find(
      (t) =>
        (t.email || '').toLowerCase() === cleanEmail &&
        verifyPassword(cleanPass, t.password || '')
    );

    if (!matchedTrainee) {
      return NextResponse.json(
        { error: 'אימייל או סיסמה שגויים' },
        { status: 401 }
      );
    }

    if (matchedTrainee.status === 'pending') {
      return NextResponse.json(
        {
          error: `שלום ${matchedTrainee.name}, החשבון שלך ממתין לאישור מאמן.`,
          isPending: true,
        },
        { status: 403 }
      );
    }

    if (matchedTrainee.status === 'paused') {
      return NextResponse.json(
        { error: 'החשבון שלך מושהה כרגע. אנא פנה למאמן שלך.' },
        { status: 403 }
      );
    }

    const traineeUser: AuthSessionUser = {
      id: matchedTrainee.id,
      email: matchedTrainee.email,
      name: matchedTrainee.name,
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
