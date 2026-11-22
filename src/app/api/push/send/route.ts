import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  generateSecureId,
  getSessionFromRequest,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  canCoachAccessTrainee,
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import {
  isFcmConfigured,
  sendFcmNotificationToTokens,
} from '@/lib/fcmServer';
import { getTodayIso } from '@/data/israeliFoodCatalog';
import { TraineePushHistoryEntry } from '@/types/nutrition';

const ALLOWED_SCREENS = new Set(['meal', 'journal', 'metrics', 'profile']);

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    const session = getSessionFromRequest(request);
    if (!session || (session.role !== 'coach' && session.role !== 'admin')) {
      return NextResponse.json(
        { error: 'רק מאמן או מנהל ראשי יכולים לשלוח הודעות פוש למתאמנים' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as {
      traineeId?: string;
      title?: string;
      body?: string;
      targetScreen?: string;
      targetMealSlotId?: string;
      targetDate?: string;
    };

    const traineeId = String(body.traineeId || '').trim();
    if (!traineeId) {
      return NextResponse.json({ error: 'חסר מזהה מתאמן' }, { status: 400 });
    }

    const targetTrainee = await getSingleTraineeFromServer(traineeId);
    if (!targetTrainee || !canCoachAccessTrainee(session, targetTrainee)) {
      return NextResponse.json(
        { error: 'אין הרשאה לשלוח הודעה למתאמן זה' },
        { status: 403 }
      );
    }

    const messageBody = sanitizeText(body.body, 280);
    if (!messageBody) {
      return NextResponse.json(
        { error: 'נא להזין תוכן להודעת הפוש' },
        { status: 400 }
      );
    }

    const messageTitle =
      sanitizeText(body.title, 90) || `הודעה מהמאמן (${session.name})`;

    if (targetTrainee.pushPreferences?.coachMessages === false) {
      return NextResponse.json(
        { error: 'המתאמן כיבה התראות מאמן בהגדרות הפרופיל שלו' },
        { status: 422 }
      );
    }

    if (!isFcmConfigured()) {
      return NextResponse.json(
        {
          error:
            'שירות ההתראות (FIREBASE_SERVICE_ACCOUNT_JSON) טרם הוגדר בהגדרות השרת (Vercel).',
        },
        { status: 422 }
      );
    }

    const tokens = (targetTrainee.fcmTokens || []).map((t) => t.token);
    if (tokens.length === 0) {
      return NextResponse.json(
        {
          error:
            'למתאמן זה אין עדיין מכשיר אנדרואיד רשום להתראות (צריך לפתוח את ה-APK ולאשר התראות).',
        },
        { status: 400 }
      );
    }

    const targetScreen = (ALLOWED_SCREENS.has(String(body.targetScreen || ''))
      ? body.targetScreen
      : 'journal') as 'meal' | 'journal' | 'metrics' | 'profile';
    const targetMealSlotId = sanitizeText(body.targetMealSlotId, 60) || undefined;
    const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.targetDate || ''))
      ? String(body.targetDate)
      : getTodayIso();

    const pushId = generateSecureId('push');
    const sentAt = new Date().toISOString();

    const sendRes = await sendFcmNotificationToTokens(tokens, {
      title: messageTitle,
      body: messageBody,
      channelId: 'spot_coach_alerts',
      data: {
        spotPushId: pushId,
        spotKind: 'coach',
        spotScreen: targetScreen,
        spotMealSlotId: targetMealSlotId || '',
        spotDate: targetDate,
      },
    });

    const historyEntry: TraineePushHistoryEntry = {
      id: pushId,
      title: messageTitle,
      body: messageBody,
      sentAt,
      sentByCoachName: session.name,
      targetScreen,
      targetMealSlotId,
    };

    const deadSet = new Set(sendRes.invalidTokens);
    await updateServerDbState((prev) => ({
      ...prev,
      trainees: prev.trainees.map((t) => {
        if (t.id !== traineeId) return t;
        const cleanedTokens =
          deadSet.size > 0
            ? (t.fcmTokens || []).filter((x) => !deadSet.has(x.token))
            : t.fcmTokens || [];
        return {
          ...t,
          fcmTokens: cleanedTokens,
          pushHistory:
            sendRes.sentCount > 0
              ? [historyEntry, ...(t.pushHistory || [])].slice(0, 20)
              : t.pushHistory || [],
        };
      }),
    }));

    if (sendRes.sentCount === 0) {
      return NextResponse.json(
        {
          error: `שליחת ההודעה נכשלה (${sendRes.errors[0] || 'הטוקן אינו תקף במכשיר'})`,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sentCount: sendRes.sentCount,
      historyEntry,
    });
  } catch (error) {
    console.error('Coach push send error:', error);
    return NextResponse.json(
      { error: 'שגיאה בשליחת הודעת הפוש' },
      { status: 500 }
    );
  }
}
