import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
import {
  attachSessionCookie,
  checkRateLimit,
  clearSessionCookie,
  generateSecureId,
  hashPassword,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
  verifyPassword,
} from '@/lib/serverAuth';
import { authenticateActiveSession } from '@/lib/liveAuth';
import {
  checkTraineeEmailExistsOnServer,
  createSingleTraineeOnServer,
  findTraineeLoginCandidateOnServer,
  getServerMetaAndCoachesState,
} from '@/lib/serverStore';
import {
  AccountStatus,
  AuthSessionUser,
  TraineeProfile,
} from '@/types/nutrition';
import { DEFAULT_TEMPLATES, getTodayIso } from '@/data/israeliFoodCatalog';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const GET = withTelemetryHandler('/api/auth/session', async (request: NextRequest, ctx) => {
  const auth = await authenticateActiveSession(request, { touchLastSeen: true });
  if (!auth.ok) {
    const isAnonNoCookie = auth.diagCode === 'UNAUTHENTICATED_NO_COOKIE';
    ctx.setActionName(isAnonNoCookie ? 'session_anon' : 'session_rejected');
    if (auth.diagUid) {
      ctx.setActor({ id: auth.diagUid, role: auth.diagRole || 'trainee' });
    }
    ctx.setErrorCode(auth.diagCode, auth.message);
    if (!isAnonNoCookie) {
      ctx.recordAudit({
        category: 'auth',
        action: 'session_rejected',
        status: auth.status === 503 ? 'failed' : 'denied',
        actorId: auth.diagUid || 'anonymous',
        actorRole: auth.diagRole || 'anonymous',
        metadata: {
          diagCode: auth.diagCode,
          httpStatus: auth.status,
          ...(auth.diagDetails || {}),
        },
      });
    }
    if (auth.status === 503) {
      return auth.response;
    }
    const res = NextResponse.json(
      {
        user: null,
        diagCode: auth.diagCode,
        ...(auth.code !== 'UNAUTHENTICATED'
          ? {
              code: auth.code,
              error: auth.message,
              suspended: auth.code === 'ACCOUNT_BLOCKED',
              revoked: auth.code === 'SESSION_REVOKED',
            }
          : {}),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
    return auth.code === 'UNAUTHENTICATED' && isAnonNoCookie
      ? res
      : clearSessionCookie(res);
  }

  ctx.setActionName('session_restore');
  ctx.setActor(auth.session);
  return NextResponse.json(
    { user: { ...auth.session, name: auth.liveName } },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
});

export const POST = withTelemetryHandler('/api/auth/session', async (request, ctx) => {
  try {
    if (!verifyCsrfOrigin(request)) {
      ctx.setErrorCode('CSRF_BLOCKED', 'בקשה אינה מורשית');
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
      ctx.setErrorCode('RATE_LIMITED', 'יותר מדי ניסיונות התחברות');
      ctx.recordAudit({
        category: 'auth',
        action: 'login_rate_limited',
        status: 'denied',
      });
      return NextResponse.json(
        { error: 'יותר מדי ניסיונות התחברות. אנא המתן דקה ונסה שוב.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { action } = body as { action: 'login' | 'register' };
    ctx.setActionName(action || 'login');
    const dbState = await getServerMetaAndCoachesState();

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

      // בדיקת ייחודיות אימייל גלובלית (מנהל ראשי + מאמנים + בדיקת מתאמן ממוקדת ללא סריקת logs)
      const adminOrCoachExists =
        email === dbState.coachEmail.toLowerCase() ||
        dbState.coaches.some((c) => c.email.toLowerCase() === email);
      let traineeEmailExists = false;
      if (!adminOrCoachExists) {
        const lookup = await checkTraineeEmailExistsOnServer(email);
        if (lookup.dbUnavailable) {
          ctx.setErrorCode('DB_UNAVAILABLE', lookup.dbError || 'DB error');
          return NextResponse.json(
            {
              error: 'תקלה זמנית בחיבור למסד הנתונים — נסה שוב בעוד רגע',
              transient: true,
            },
            { status: 503 }
          );
        }
        traineeEmailExists = lookup.exists;
      }

      if (adminOrCoachExists || traineeEmailExists) {
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
      let defaultActivePastDays = 1;
      let defaultActiveFutureDays = 0;
      let defaultRestrictNonObsOnObsDays = false;
      let defaultFavoriteFoodIds: string[] = [];

      if (inviteCode) {
        if (inviteCode === dbState.coachInviteCode.toUpperCase()) {
          assignedPrimaryCoachId = 'coach-admin';
          initialStatus = 'active';
          const adminCoach = dbState.coaches.find((c) => c.id === 'coach-admin');
          if (adminCoach?.onboarding) {
            defaultObsDays = adminCoach.onboarding.defaultObservationDays ?? 0;
            defaultCountObs =
              adminCoach.onboarding.defaultCountObservationInStats ?? false;
            defaultTolerance = adminCoach.onboarding.defaultTolerancePercent ?? 10;
            defaultActivePastDays =
              adminCoach.onboarding.defaultActivePastDays ?? 1;
            defaultActiveFutureDays =
              adminCoach.onboarding.defaultActiveFutureDays ?? 0;
            defaultRestrictNonObsOnObsDays =
              adminCoach.onboarding.defaultRestrictNonObsOnObsDays ?? false;
            defaultFavoriteFoodIds = Array.isArray(
              adminCoach.onboarding.defaultFavoriteFoodIds
            )
              ? adminCoach.onboarding.defaultFavoriteFoodIds.slice(0, 50)
              : [];
          }
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
            defaultActivePastDays =
              matchedCoach.onboarding?.defaultActivePastDays ?? 1;
            defaultActiveFutureDays =
              matchedCoach.onboarding?.defaultActiveFutureDays ?? 0;
            defaultRestrictNonObsOnObsDays =
              matchedCoach.onboarding?.defaultRestrictNonObsOnObsDays ?? false;
            defaultFavoriteFoodIds = Array.isArray(
              matchedCoach.onboarding?.defaultFavoriteFoodIds
            )
              ? matchedCoach.onboarding.defaultFavoriteFoodIds.slice(0, 50)
              : [];
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
        blockedDates: [],
        restrictToObservationDaysWhenTodayIsObservation:
          defaultRestrictNonObsOnObsDays,
        countObservationInStats: defaultCountObs,
        activeDateRange: {
          pastDays: Math.max(0, Math.min(365, Math.round(Number(defaultActivePastDays) || 0))),
          futureDays: Math.max(0, Math.min(180, Math.round(Number(defaultActiveFutureDays) || 0))),
        },
        workoutTemplate: JSON.parse(JSON.stringify(defaultTpl)),
        restTemplate: JSON.parse(JSON.stringify(defaultTpl)),
        favoriteFoodIds: defaultFavoriteFoodIds,
        weightHistory: hasExplicitWeight
          ? [{ date: 'התחלה', weight: currentWeight }]
          : [],
        logs: {},
        sessionVersion: 1,
      };

      await createSingleTraineeOnServer(newTrainee);

      const sessionUser: AuthSessionUser = {
        id: newTrainee.id,
        email: newTrainee.email,
        name: newTrainee.name,
        role: 'trainee',
        status: initialStatus,
        sv: 1,
      };

      const res = NextResponse.json({
        user: sessionUser,
        isPending: initialStatus === 'pending',
      });

      ctx.setActor(sessionUser);
      ctx.recordAudit({
        category: 'auth',
        action: 'register_submitted',
        status: 'success',
        metadata: { initialStatus, coachId: assignedPrimaryCoachId },
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
      ctx.setActor(adminUser);
      ctx.recordAudit({ category: 'auth', action: 'login_success', status: 'success' });
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
      ctx.setActor({ id: matchedCoach.id, role: 'coach' });
      if (matchedCoach.status === 'paused') {
        ctx.setErrorCode('ACCOUNT_BLOCKED', 'חשבון המאמן מושהה');
        ctx.recordAudit({ category: 'auth', action: 'login_blocked', status: 'denied' });
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
        sv: Math.max(1, Number(matchedCoach.sessionVersion) || 1),
      };
      ctx.recordAudit({ category: 'auth', action: 'login_success', status: 'success' });
      const res = NextResponse.json({ user: coachUser });
      return attachSessionCookie(res, coachUser);
    }

    // 3. בדיקת התחברות מתאמן (Trainee) - שליפה מהירה לפי אימייל ללא logs JSONB
    const traineeLookup = await findTraineeLoginCandidateOnServer(cleanEmail);
    if (traineeLookup.dbUnavailable) {
      ctx.setErrorCode('DB_UNAVAILABLE', traineeLookup.dbError || 'DB error');
      ctx.recordAudit({
        category: 'auth',
        action: 'login_db_unavailable',
        status: 'failed',
      });
      return NextResponse.json(
        {
          error: 'תקלה זמנית בחיבור למסד הנתונים — נסה שוב בעוד רגע',
          transient: true,
        },
        { status: 503 }
      );
    }

    const candidateTrainee = traineeLookup.candidate;
    const matchedTrainee =
      candidateTrainee && verifyPassword(cleanPass, candidateTrainee.password || '')
        ? candidateTrainee
        : null;

    if (!matchedTrainee) {
      ctx.setErrorCode('INVALID_CREDENTIALS', 'אימייל או סיסמה שגויים');
      ctx.recordAudit({ category: 'auth', action: 'login_failed', status: 'failed' });
      return NextResponse.json(
        { error: 'אימייל או סיסמה שגויים' },
        { status: 401 }
      );
    }

    ctx.setActor({ id: matchedTrainee.id, role: 'trainee' });
    if (matchedTrainee.status === 'pending') {
      ctx.setErrorCode('ACCOUNT_PENDING', 'חשבון ממתין לאישור מאמן');
      ctx.recordAudit({ category: 'auth', action: 'login_pending', status: 'denied' });
      return NextResponse.json(
        {
          error: `שלום ${matchedTrainee.name}, החשבון שלך ממתין לאישור מאמן.`,
          isPending: true,
        },
        { status: 403 }
      );
    }

    if (matchedTrainee.status === 'paused') {
      ctx.setErrorCode('ACCOUNT_BLOCKED', 'חשבון מושהה');
      ctx.recordAudit({ category: 'auth', action: 'login_blocked', status: 'denied' });
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
      sv: Math.max(1, Number(matchedTrainee.sessionVersion) || 1),
    };

    ctx.recordAudit({ category: 'auth', action: 'login_success', status: 'success' });
    const res = NextResponse.json({ user: traineeUser });
    return attachSessionCookie(res, traineeUser);
  } catch (err) {
    ctx.setErrorCode('AUTH_EXCEPTION', err instanceof Error ? err.message : '');
    return NextResponse.json({ error: 'שגיאת שרת באימות' }, { status: 500 });
  }
});

export const DELETE = withTelemetryHandler('/api/auth/session', async (request, ctx) => {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF Blocked' }, { status: 403 });
  }
  const auth = await authenticateActiveSession(request, { touchLastSeen: false });
  if (auth.ok) {
    ctx.setActor(auth.session);
    ctx.recordAudit({ category: 'auth', action: 'logout', status: 'success' });
  }
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
});
