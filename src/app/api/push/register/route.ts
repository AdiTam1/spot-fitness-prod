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
  hasAnyRegisteredPushTarget,
  sendUnifiedPushToTrainee,
  stripDeadPushTargetsFromTrainee,
} from '@/lib/pushDispatcher';
import { getTodayIso } from '@/data/israeliFoodCatalog';
import { TraineeWebPushSubscriptionEntry } from '@/types/nutrition';

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
      platform?: string;
      isDeclarativeCapable?: boolean;
      endpoint?: string;
      subscription?: {
        endpoint?: string;
        keys?: {
          p256dh?: string;
          auth?: string;
        };
      };
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

    if (op === 'register-web-push') {
      const subEndpoint =
        typeof body.subscription?.endpoint === 'string'
          ? body.subscription.endpoint.trim().slice(0, 1000)
          : '';
      const p256dh =
        typeof body.subscription?.keys?.p256dh === 'string'
          ? body.subscription.keys.p256dh.trim().slice(0, 300)
          : '';
      const auth =
        typeof body.subscription?.keys?.auth === 'string'
          ? body.subscription.keys.auth.trim().slice(0, 200)
          : '';

      if (
        !subEndpoint.startsWith('https://') ||
        subEndpoint.length < 24 ||
        !p256dh ||
        !auth
      ) {
        return NextResponse.json(
          { error: 'מנוי Web Push אינו תקין' },
          { status: 400 }
        );
      }

      const platform: TraineeWebPushSubscriptionEntry['platform'] =
        body.platform === 'ios-pwa' ? 'ios-pwa' : 'web';
      const deviceLabel =
        sanitizeText(
          body.deviceLabel ||
            (platform === 'ios-pwa' ? 'iPhone (מסך הבית)' : 'דפדפן Web'),
          60
        ) || (platform === 'ios-pwa' ? 'iPhone (מסך הבית)' : 'דפדפן Web');

      const newEntry: TraineeWebPushSubscriptionEntry = {
        endpoint: subEndpoint,
        keys: { p256dh, auth },
        platform,
        updatedAt: nowIso,
        deviceLabel,
        isDeclarativeCapable: Boolean(body.isDeclarativeCapable),
      };

      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== session.id) return t;
          const remaining = (t.webPushSubscriptions || []).filter(
            (x) => x.endpoint !== subEndpoint
          );
          return {
            ...t,
            webPushSubscriptions: [newEntry, ...remaining].slice(0, 8),
          };
        }),
      }));

      return NextResponse.json({ ok: true });
    }

    if (op === 'unregister-web-push') {
      const targetEndpoint =
        typeof body.endpoint === 'string'
          ? body.endpoint.trim().slice(0, 1000)
          : '';
      await updateServerDbState((prev) => ({
        ...prev,
        trainees: prev.trainees.map((t) => {
          if (t.id !== session.id) return t;
          return {
            ...t,
            webPushSubscriptions: targetEndpoint
              ? (t.webPushSubscriptions || []).filter(
                  (x) => x.endpoint !== targetEndpoint
                )
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
      if (!hasAnyRegisteredPushTarget(liveTrainee)) {
        return NextResponse.json(
          {
            error:
              'המכשיר טרם נרשם לקבלת התראות. יש לאשר התראות קודם במסך הפרופיל.',
          },
          { status: 400 }
        );
      }

      const sendRes = await sendUnifiedPushToTrainee(liveTrainee, {
        pushId: generateSecureId('push'),
        title: 'בדיקת התראות SPOT 💪',
        body: `${liveTrainee.name}, התראות הדחיפה מוגדרות ועובדות במכשיר שלך!`,
        kind: 'test',
        screen: 'profile',
        date: getTodayIso(),
        origin: request.nextUrl.origin,
      });

      if (
        sendRes.invalidFcmTokens.length > 0 ||
        sendRes.expiredWebEndpoints.length > 0
      ) {
        await updateServerDbState((prev) => ({
          ...prev,
          trainees: prev.trainees.map((t) =>
            t.id === session.id
              ? stripDeadPushTargetsFromTrainee(
                  t,
                  sendRes.invalidFcmTokens,
                  sendRes.expiredWebEndpoints
                )
              : t
          ),
        }));
      }

      if (sendRes.sentCount === 0 && sendRes.configError) {
        return NextResponse.json(
          { error: sendRes.configError },
          { status: 422 }
        );
      }

      if (sendRes.sentCount === 0) {
        return NextResponse.json(
          {
            error: `שליחת התראת הבדיקה נכשלה (${sendRes.errors[0] || 'שגיאת שליחה'})`,
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
