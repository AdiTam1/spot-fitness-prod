import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  generateSecureId,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import { authenticateActiveSession } from '@/lib/liveAuth';
import {
  canCoachAccessTrainee,
  canCoachManageGroup,
  createDefaultCoachPushSettings,
  getServerDbState,
  getServerMetaAndCoachesState,
  sanitizeCoachPushSettingsForClient,
  updateServerMetaState,
} from '@/lib/serverStore';
import { dispatchPushToTargets } from '@/lib/pushDispatcher';
import {
  CoachPushSubscriptionSettings,
  TraineeWebPushSubscriptionEntry,
} from '@/types/nutrition';
import { getTodayIso } from '@/data/israeliFoodCatalog';

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    const auth = await authenticateActiveSession(request, { touchLastSeen: true });
    if (!auth.ok) {
      return auth.response;
    }
    const session = auth.session;
    if (session.role !== 'coach' && session.role !== 'admin') {
      return NextResponse.json(
        { error: 'רק מאמן או מנהל ראשי יכולים לנהל התראות בזמן אמת' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      op?: string;
      enabled?: boolean;
      traineeIds?: string[];
      groupIds?: string[];
      events?: {
        meals?: boolean;
        weight?: boolean;
        workouts?: boolean;
        water?: boolean;
      };
      platform?: string;
      deviceLabel?: string;
      isDeclarativeCapable?: boolean;
      endpoint?: string;
      subscription?: {
        endpoint?: string;
        keys?: {
          p256dh?: string;
          auth?: string;
        };
      };
    };

    const op = body?.op || '';
    const nowIso = new Date().toISOString();
    const metaState = await getServerMetaAndCoachesState();

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
            (platform === 'ios-pwa' ? 'iPhone (מסך הבית)' : 'דפדפן מאמן'),
          60
        ) || (platform === 'ios-pwa' ? 'iPhone (מסך הבית)' : 'דפדפן מאמן');

      const newEntry: TraineeWebPushSubscriptionEntry = {
        endpoint: subEndpoint,
        keys: { p256dh, auth },
        platform,
        updatedAt: nowIso,
        deviceLabel,
        isDeclarativeCapable: Boolean(body.isDeclarativeCapable),
      };

      const updatedState = await updateServerMetaState((prev) => {
        const currentSettings =
          prev.coachPushSettings?.[session.id] ||
          createDefaultCoachPushSettings(session.id);
        const remaining = (currentSettings.webPushSubscriptions || []).filter(
          (x) => x.endpoint !== subEndpoint
        );
        const nextEntry: CoachPushSubscriptionSettings = {
          ...currentSettings,
          coachId: session.id,
          webPushSubscriptions: [newEntry, ...remaining].slice(0, 8),
          updatedAt: nowIso,
        };
        return {
          ...prev,
          coachPushSettings: {
            ...(prev.coachPushSettings || {}),
            [session.id]: nextEntry,
          },
        };
      });

      return NextResponse.json({
        ok: true,
        coachPushSettings: sanitizeCoachPushSettingsForClient(
          updatedState.coachPushSettings?.[session.id],
          session.id
        ),
      });
    }

    if (op === 'unregister-web-push') {
      const targetEndpoint =
        typeof body.endpoint === 'string'
          ? body.endpoint.trim().slice(0, 1000)
          : '';
      await updateServerMetaState((prev) => {
        const currentSettings = prev.coachPushSettings?.[session.id];
        if (!currentSettings) return prev;
        return {
          ...prev,
          coachPushSettings: {
            ...(prev.coachPushSettings || {}),
            [session.id]: {
              ...currentSettings,
              webPushSubscriptions: targetEndpoint
                ? (currentSettings.webPushSubscriptions || []).filter(
                    (x) => x.endpoint !== targetEndpoint
                  )
                : [],
              updatedAt: nowIso,
            },
          },
        };
      });
      return NextResponse.json({ ok: true });
    }

    if (op === 'save-preferences') {
      const state = await getServerDbState();
      const allowedTraineeIds = new Set(
        state.trainees
          .filter((t) => canCoachAccessTrainee(session, t))
          .map((t) => t.id)
      );
      const allowedGroupIds = new Set(
        metaState.groups
          .filter((g) => canCoachManageGroup(session, g))
          .map((g) => g.id)
      );

      const safeTraineeIds = Array.isArray(body.traineeIds)
        ? Array.from(
            new Set(
              body.traineeIds
                .map((id) => sanitizeText(id, 80))
                .filter((id) => allowedTraineeIds.has(id))
            )
          ).slice(0, 500)
        : undefined;

      const safeGroupIds = Array.isArray(body.groupIds)
        ? Array.from(
            new Set(
              body.groupIds
                .map((id) => sanitizeText(id, 80))
                .filter((id) => allowedGroupIds.has(id))
            )
          ).slice(0, 100)
        : undefined;

      const updatedState = await updateServerMetaState((prev) => {
        const current =
          prev.coachPushSettings?.[session.id] ||
          createDefaultCoachPushSettings(session.id);

        const nextSettings: CoachPushSubscriptionSettings = {
          ...current,
          coachId: session.id,
          enabled:
            typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
          traineeIds:
            safeTraineeIds !== undefined ? safeTraineeIds : current.traineeIds,
          groupIds:
            safeGroupIds !== undefined ? safeGroupIds : current.groupIds,
          events: {
            meals:
              typeof body.events?.meals === 'boolean'
                ? body.events.meals
                : current.events.meals,
            weight:
              typeof body.events?.weight === 'boolean'
                ? body.events.weight
                : current.events.weight,
            workouts:
              typeof body.events?.workouts === 'boolean'
                ? body.events.workouts
                : current.events.workouts,
            water:
              typeof body.events?.water === 'boolean'
                ? body.events.water
                : current.events.water,
          },
          updatedAt: nowIso,
        };

        return {
          ...prev,
          coachPushSettings: {
            ...(prev.coachPushSettings || {}),
            [session.id]: nextSettings,
          },
        };
      });

      return NextResponse.json({
        ok: true,
        coachPushSettings: sanitizeCoachPushSettingsForClient(
          updatedState.coachPushSettings?.[session.id],
          session.id
        ),
      });
    }

    if (op === 'test-self') {
      const cfg =
        metaState.coachPushSettings?.[session.id] ||
        createDefaultCoachPushSettings(session.id);
      if (
        (cfg.webPushSubscriptions?.length || 0) +
          (cfg.fcmTokens?.length || 0) ===
        0
      ) {
        return NextResponse.json(
          {
            error:
              'מכשיר זה טרם נרשם לקבלת התראות. יש ללחוץ על "הפעל התראות במכשיר זה" קודם.',
          },
          { status: 400 }
        );
      }

      const sendRes = await dispatchPushToTargets({
        fcmTokens: cfg.fcmTokens,
        webPushSubscriptions: cfg.webPushSubscriptions,
        message: {
          pushId: generateSecureId('ctest'),
          title: `בדיקת התראות מאמן SPOT 🎯`,
          body: `${session.name}, תקבל/י כאן התראות מיידיות כשהמתאמנים שלך יזינו פעילות!`,
          kind: 'test',
          screen: 'journal',
          date: getTodayIso(),
          origin: request.nextUrl.origin,
        },
      });

      if (
        sendRes.invalidFcmTokens.length > 0 ||
        sendRes.expiredWebEndpoints.length > 0
      ) {
        const deadFcm = new Set(sendRes.invalidFcmTokens);
        const deadWeb = new Set(sendRes.expiredWebEndpoints);
        await updateServerMetaState((prev) => {
          const cur = prev.coachPushSettings?.[session.id];
          if (!cur) return prev;
          return {
            ...prev,
            coachPushSettings: {
              ...(prev.coachPushSettings || {}),
              [session.id]: {
                ...cur,
                fcmTokens: (cur.fcmTokens || []).filter(
                  (x) => !deadFcm.has(x.token)
                ),
                webPushSubscriptions: (cur.webPushSubscriptions || []).filter(
                  (x) => !deadWeb.has(x.endpoint)
                ),
              },
            },
          };
        });
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
            error: `שליחת התראת הבדיקה נכשלה (${
              sendRes.errors[0] || 'המנוי פג תוקף במכשיר'
            })`,
          },
          { status: 502 }
        );
      }

      return NextResponse.json({ ok: true, sentCount: sendRes.sentCount });
    }

    return NextResponse.json({ error: 'פעולה לא חוקית' }, { status: 400 });
  } catch (error) {
    console.error('Coach alerts API error:', error);
    return NextResponse.json(
      { error: 'שגיאה בעדכון התראות המאמן' },
      { status: 500 }
    );
  }
}
