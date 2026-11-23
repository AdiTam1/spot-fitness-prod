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
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import {
  hasAnyRegisteredPushTarget,
  sendUnifiedPushToTrainee,
  stripDeadPushTargetsFromTrainee,
} from '@/lib/pushDispatcher';
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

    const auth = await authenticateActiveSession(request, { touchLastSeen: true });
    if (!auth.ok) {
      return auth.response;
    }
    const session = auth.session;
    if (session.role !== 'coach' && session.role !== 'admin') {
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

    if (!hasAnyRegisteredPushTarget(targetTrainee)) {
      return NextResponse.json(
        {
          error:
            'למתאמן זה אין עדיין מכשיר רשום להתראות (יש לאשר התראות באפליקציית האנדרואיד או בהוספה למסך הבית באייפון / דפדפן).',
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

    const sendRes = await sendUnifiedPushToTrainee(targetTrainee, {
      pushId,
      title: messageTitle,
      body: messageBody,
      kind: 'coach',
      screen: targetScreen,
      mealSlotId: targetMealSlotId,
      date: targetDate,
      origin: request.nextUrl.origin,
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

    await updateServerDbState((prev) => ({
      ...prev,
      trainees: prev.trainees.map((t) => {
        if (t.id !== traineeId) return t;
        const cleaned = stripDeadPushTargetsFromTrainee(
          t,
          sendRes.invalidFcmTokens,
          sendRes.expiredWebEndpoints
        );
        return {
          ...cleaned,
          pushHistory:
            sendRes.sentCount > 0
              ? [historyEntry, ...(cleaned.pushHistory || [])].slice(0, 20)
              : cleaned.pushHistory || [],
        };
      }),
    }));

    if (sendRes.sentCount === 0 && sendRes.configError) {
      return NextResponse.json(
        { error: sendRes.configError },
        { status: 422 }
      );
    }

    if (sendRes.sentCount === 0) {
      return NextResponse.json(
        {
          error: `שליחת ההודעה נכשלה (${sendRes.errors[0] || 'המנוי פג תוקף במכשיר'})`,
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
