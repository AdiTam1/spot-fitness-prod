import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookie,
  generateSecureId,
  getSessionFromRequest,
  hashPassword,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  deleteTraineeOnServer,
  getServerDbState,
  getSingleTraineeFromServer,
  sanitizeTraineeForClient,
  updateServerDbState,
} from '@/lib/serverStore';
import { DEFAULT_TEMPLATES } from '@/data/israeliFoodCatalog';
import { NutritionTemplate, TraineeProfile } from '@/types/nutrition';

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: 'לא מחובר' },
      { status: 401, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // 1. מתאמן מחובר: מקבל אך ורק את הרשומה הבודדת של עצמו (ללא גיבוב סיסמה וללא מתאמנים אחרים!)
  if (session.role === 'trainee') {
    const myProfile = await getSingleTraineeFromServer(session.id);
    if (!myProfile || myProfile.status !== 'active') {
      const res = NextResponse.json(
        { error: 'החשבון אינו פעיל' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
      return clearSessionCookie(res);
    }

    return NextResponse.json(
      {
        trainees: [sanitizeTraineeForClient(myProfile)],
        templates: [],
        role: 'trainee',
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  // 2. מאמן מחובר: מקבל את מצבת המתאמנים (ללא חשיפת Hash הסיסמה), הטמפלייטים וקוד ההזמנה
  const state = await getServerDbState();
  return NextResponse.json(
    {
      trainees: state.trainees.map((t) => sanitizeTraineeForClient(t)),
      templates: state.templates,
      coachInviteCode: state.coachInviteCode,
      role: 'coach',
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function POST(request: NextRequest) {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'CSRF Blocked' }, { status: 403 });
  }

  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body as {
      action:
        | 'trainee-self-update'
        | 'coach-sync'
        | 'coach-create-trainee'
        | 'coach-update-credentials'
        | 'coach-update-invite-code'
        | 'coach-delete-trainee';
    };

    // =========================================================================
    // הרשאות מתאמן: עדכון יומן הארוחות, המים והמשקל של עצמו בלבד (נעילת יעדים!)
    // =========================================================================
    if (session.role === 'trainee') {
      const traineeInput = body.trainee as TraineeProfile | undefined;
      if (
        action !== 'trainee-self-update' ||
        !traineeInput ||
        traineeInput.id !== session.id
      ) {
        return NextResponse.json(
          { error: 'אין הרשאה לבצע פעולה זו (IDOR / BFLA Blocked)' },
          { status: 403 }
        );
      }

      const liveTrainee = await getSingleTraineeFromServer(session.id);
      if (!liveTrainee || liveTrainee.status !== 'active') {
        const res = NextResponse.json(
          { error: 'החשבון אינו פעיל' },
          { status: 403 }
        );
        return clearSessionCookie(res);
      }

      const safeWeight = sanitizeNumber(
        traineeInput.currentWeight,
        30,
        300,
        liveTrainee.currentWeight
      );

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((existing) => {
          if (existing.id !== session.id) return existing;
          // שומר את כל הגדרות המאמן והסיסמה נעולים מהשרת!
          return {
            ...existing,
            currentWeight: safeWeight,
            weightHistory: Array.isArray(traineeInput.weightHistory)
              ? traineeInput.weightHistory.slice(-60)
              : existing.weightHistory,
            favoriteFoodIds: Array.isArray(traineeInput.favoriteFoodIds)
              ? traineeInput.favoriteFoodIds.slice(0, 50)
              : existing.favoriteFoodIds,
            logs: traineeInput.logs || existing.logs,
          };
        }),
      }));

      return NextResponse.json({ ok: true });
    }

    // =========================================================================
    // הרשאות מאמן בלבד (מאומת ע"י חתימת HMAC של role === 'coach')
    // =========================================================================
    if (session.role === 'coach') {
      if (action === 'coach-delete-trainee' && body.deleteTraineeId) {
        await deleteTraineeOnServer(String(body.deleteTraineeId));
        return NextResponse.json({ ok: true });
      }

      if (action === 'coach-update-invite-code') {
        const cleanCode = sanitizeText(body.inviteCode, 40) || 'SPOT2026';
        await updateServerDbState((prev) => ({
          ...prev,
          coachInviteCode: cleanCode,
        }));
        return NextResponse.json({ ok: true, coachInviteCode: cleanCode });
      }

      if (action === 'coach-create-trainee') {
        const name = sanitizeText(body.name, 80);
        const email = sanitizeText(body.email, 120).toLowerCase();
        const rawPassword =
          typeof body.password === 'string' && body.password.trim()
            ? body.password.trim()
            : '123456';
        const phone = sanitizeText(body.phone, 30);
        const goal = sanitizeText(body.goal, 120) || 'חיטוב ותזונה מותאמת';
        const templateId = String(body.templateId || '');

        const state = await getServerDbState();
        const tpl =
          state.templates.find((t) => t.id === templateId) ||
          state.templates[0] ||
          DEFAULT_TEMPLATES[0];

        const newTrainee: TraineeProfile = {
          id: generateSecureId('trainee'),
          email,
          password: hashPassword(rawPassword),
          status: 'active',
          name,
          avatar: name.charAt(0) || 'מ',
          phone,
          goal,
          currentWeight: 75,
          targetWeight: 70,
          tolerancePercent: 10,
          workoutTemplate: JSON.parse(JSON.stringify(tpl)),
          restTemplate: JSON.parse(JSON.stringify(tpl)),
          favoriteFoodIds: [
            'cottage-tnuva-5',
            'chicken-breast-grilled',
            'krembo-strauss',
          ],
          weightHistory: [{ date: 'התחלה', weight: 75 }],
          logs: {},
        };

        const updated = await updateServerDbState((prev) => ({
          ...prev,
          trainees: [...prev.trainees, newTrainee],
        }));

        return NextResponse.json({
          ok: true,
          trainees: updated.trainees.map((t) => sanitizeTraineeForClient(t)),
        });
      }

      if (action === 'coach-update-credentials') {
        const traineeId = String(body.traineeId || '');
        const newEmail = sanitizeText(body.email, 120).toLowerCase();
        const rawPassword =
          typeof body.password === 'string' ? body.password.trim() : '';

        await updateServerDbState((prev) => ({
          ...prev,
          trainees: prev.trainees.map((t) => {
            if (t.id !== traineeId) return t;
            return {
              ...t,
              email: newEmail || t.email,
              password: rawPassword ? hashPassword(rawPassword) : t.password,
            };
          }),
        }));

        return NextResponse.json({ ok: true });
      }

      if (action === 'coach-sync') {
        const incomingTrainees = body.trainees as TraineeProfile[] | undefined;
        const incomingTemplates = body.templates as
          | NutritionTemplate[]
          | undefined;

        await updateServerDbState((prev) => {
          const mergedTrainees = Array.isArray(incomingTrainees)
            ? incomingTrainees.map((inc) => {
                const existing = prev.trainees.find((e) => e.id === inc.id);
                return {
                  ...inc,
                  // שומר על גיבוב הסיסמה הקיים בשרת גם כשהלקוח שולח password ריק!
                  password:
                    inc.password && inc.password.trim()
                      ? hashPassword(inc.password)
                      : existing?.password || hashPassword('123456'),
                };
              })
            : prev.trainees;

          return {
            ...prev,
            templates:
              Array.isArray(incomingTemplates) && incomingTemplates.length > 0
                ? incomingTemplates
                : prev.templates,
            trainees: mergedTrainees,
          };
        });

        return NextResponse.json({ ok: true });
      }
    }

    return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: 'שגיאת שרת בשמירת נתונים' },
      { status: 500 }
    );
  }
}
