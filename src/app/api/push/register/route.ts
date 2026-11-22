import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  clearSessionCookie,
  generateSecureId,
  getSessionFromRequest,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import {
  getFcmConfigErrorMessage,
  sendFcmNotificationToTokens,
} from '@/lib/fcmServer';
import { getTodayIso } from '@/data/israeliFoodCatalog';

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'trainee') {
      return NextResponse.json(
        { error: 'נדרשת התחברות כמתאמן' },
        { status: 401 }
      );
    }

    const liveTrainee = await getSingleTraineeFromServer(session.id);
    if (!liveTrainee || liveTrainee.status !== 'active') {
      const res = NextResponse.json({ error: 'החשבון אינו פעיל' }, { status: 403 });
      return clearSessionCookie(res);
    }

    const body = (await request.json()) as {
      op?: string;
      token?: string;
      deviceLabel?: string;
      isInForeground?: boolean;
      aiMealReady?: boolean;
      coachMessages?: boolean;
    };

    const op = body?.op || '';
    const nowIso = new Date().toISOString();

    if (op === 'register-token') {
      const token =
        typeof body.token === 'string' ? body.token.trim().slice(0, 500) : '';
      if (!token || token.length < 20) {
        return NextResponse.json(
          { error: 'טוקן FCM אינו תקין' },
          { status: 400 }
        );
      }
      const deviceLabel =
        sanitizeText(body.deviceLabel || 'Android APK', 60) || 'Android APK';

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== session.id) return t;
          const remaining = (t.fcmTokens || []).filter((x) => x.token !== token);
          const nextTokens = [
            {
              token,
              platform: 'android' as const,
              updatedAt: nowIso,
              deviceLabel,
            },
            ...remaining,
          ].slice(0, 5);
          return {
            ...t,
            fcmTokens: nextTokens,
          };
        }),
      }));

      return NextResponse.json({ ok: true });
    }

    if (op === 'unregister-token') {
      const token =
        typeof body.token === 'string' ? body.token.trim().slice(0, 500) : '';
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== session.id) return t;
          return {
            ...t,
            fcmTokens: token
              ? (t.fcmTokens || []).filter((x) => x.token !== token)
              : [],
            lastForegroundState: {
              isInForeground: false,
              updatedAt: nowIso,
            },
          };
        }),
      }));
      return NextResponse.json({ ok: true });
    }

    if (op === 'heartbeat') {
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== session.id) return t;
          return {
            ...t,
            lastForegroundState: {
              isInForeground: Boolean(body.isInForeground),
              updatedAt: nowIso,
            },
          };
        }),
      }));
      return NextResponse.json({ ok: true });
    }

    if (op === 'update-preferences') {
      const nextPrefs = {
        aiMealReady:
          typeof body.aiMealReady === 'boolean'
            ? body.aiMealReady
            : liveTrainee.pushPreferences?.aiMealReady !== false,
        coachMessages:
          typeof body.coachMessages === 'boolean'
            ? body.coachMessages
            : liveTrainee.pushPreferences?.coachMessages !== false,
      };
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) =>
          t.id === session.id ? { ...t, pushPreferences: nextPrefs } : t
        ),
      }));
      return NextResponse.json({ ok: true, pushPreferences: nextPrefs });
    }

    if (op === 'test-self') {
      const configError = getFcmConfigErrorMessage();
      if (configError) {
        return NextResponse.json({ error: configError }, { status: 422 });
      }
      const tokens = (liveTrainee.fcmTokens || []).map((t) => t.token);
      if (tokens.length === 0) {
        return NextResponse.json(
          {
            error:
              'המכשיר טרם נרשם לקבלת התראות. ודא שהאפליקציה הורשאה להתראות ושקובץ google-services.json חובר.',
          },
          { status: 400 }
        );
      }

      const sendRes = await sendFcmNotificationToTokens(tokens, {
        title: 'בדיקת התראות SPOT 💪',
        body: `${liveTrainee.name}, התראות הדחיפה מוגדרות ועובדות במכשיר שלך!`,
        channelId: 'spot_coach_alerts',
        data: {
          spotPushId: generateSecureId('push'),
          spotKind: 'test',
          spotScreen: 'profile',
          spotDate: getTodayIso(),
        },
      });

      if (sendRes.invalidTokens.length > 0) {
        const deadSet = new Set(sendRes.invalidTokens);
        await updateServerDbState((prev) => ({
          ...prev,
          trainees: prev.trainees.map((t) =>
            t.id === session.id
              ? {
                  ...t,
                  fcmTokens: (t.fcmTokens || []).filter(
                    (x) => !deadSet.has(x.token)
                  ),
                }
              : t
          ),
        }));
      }

      if (sendRes.sentCount === 0) {
        return NextResponse.json(
          {
            error: `שליחת התראת הבדיקה נכשלה (${sendRes.errors[0] || 'שגיאת FCM'})`,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, sentCount: sendRes.sentCount });
    }

    return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
  } catch (error) {
    console.error('Push register error:', error);
    return NextResponse.json(
      { error: 'שגיאה בעדכון הגדרות ההתראות' },
      { status: 500 }
    );
  }
}
