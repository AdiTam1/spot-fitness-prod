import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  getSessionFromRequest,
  sanitizeNumber,
  signStepsSyncToken,
  verifyCsrfOrigin,
  verifyStepsSyncToken,
} from '@/lib/serverAuth';
import { authenticateActiveSession } from '@/lib/liveAuth';
import {
  getTraineeAuthStateFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import { DailyLog, StepsSyncSource } from '@/types/nutrition';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

const VALID_SOURCES = new Set<StepsSyncSource>([
  'health-connect',
  'play-services-local',
  'device-sensor',
  'manual',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface IncomingStepEntry {
  date?: unknown;
  steps?: unknown;
  source?: unknown;
  syncedAt?: unknown;
}

export const GET = withTelemetryHandler('/api/steps/sync', async (request, ctx) => {
  const auth = await authenticateActiveSession(request, { touchLastSeen: true });
  if (!auth.ok) {
    ctx.setErrorCode(auth.code, auth.message);
    return auth.response;
  }
  ctx.setActor(auth.session);
  if (auth.session.role !== 'trainee') {
    return NextResponse.json(
      { error: 'נדרשת התחברות כמתאמן' },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      traineeId: auth.session.id,
      syncToken: signStepsSyncToken(auth.session.id, auth.sessionVersion),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
});

export const POST = withTelemetryHandler('/api/steps/sync', async (request, ctx) => {
  try {
    if (!verifyCsrfOrigin(request)) {
      ctx.setErrorCode('CSRF_BLOCKED', 'בקשה אינה מורשית');
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    let authorizedTraineeId: string | null = null;
    let syncOrigin: 'foreground_cookie' | 'background_worker' = 'foreground_cookie';
    const cookieSession = getSessionFromRequest(request);
    if (cookieSession?.role === 'trainee') {
      const auth = await authenticateActiveSession(request, {
        touchLastSeen: true,
      });
      if (!auth.ok) {
        ctx.setErrorCode(auth.code, auth.message);
        return auth.response;
      }
      authorizedTraineeId = auth.session.id;
    } else {
      const authHeader = request.headers.get('authorization') || '';
      const bearer = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
      const parsedToken = verifyStepsSyncToken(bearer);
      if (parsedToken) {
        syncOrigin = 'background_worker';
        const liveTrainee = await getTraineeAuthStateFromServer(
          parsedToken.traineeId
        );
        if (!liveTrainee || liveTrainee.status !== 'active') {
          ctx.setErrorCode('ACCOUNT_BLOCKED', 'החשבון אינו פעיל');
          return NextResponse.json(
            { error: 'החשבון אינו פעיל', code: 'ACCOUNT_BLOCKED' },
            { status: 403 }
          );
        }
        if ((liveTrainee.sessionVersion ?? 1) !== parsedToken.sv) {
          ctx.setErrorCode('SESSION_REVOKED', 'הסשן פג תוקף מרחוק');
          return NextResponse.json(
            { error: 'הסשן פג תוקף מרחוק', code: 'SESSION_REVOKED' },
            { status: 401 }
          );
        }
        authorizedTraineeId = parsedToken.traineeId;
      }
    }

    if (!authorizedTraineeId) {
      ctx.setErrorCode('UNAUTHENTICATED', 'נדרש אימות מתאמן תקף לסנכרון צעדים');
      return NextResponse.json(
        { error: 'נדרש אימות מתאמן תקף לסנכרון צעדים' },
        { status: 401 }
      );
    }
    ctx.setActor({ id: authorizedTraineeId, role: 'trainee' });
    ctx.setActionName(syncOrigin);

    const body = (await request.json()) as { entries?: unknown };
    const rawEntries = Array.isArray(body?.entries)
      ? (body.entries as IncomingStepEntry[]).slice(0, 14)
      : [];

    if (rawEntries.length === 0) {
      return NextResponse.json({ ok: true, synced: {} });
    }

    const nowIso = new Date().toISOString();
    const cleanedEntries = rawEntries
      .map((item) => {
        const date = typeof item?.date === 'string' ? item.date.trim() : '';
        const source = item?.source as StepsSyncSource;
        if (!ISO_DATE_RE.test(date) || !VALID_SOURCES.has(source)) {
          return null;
        }
        const steps = Math.round(sanitizeNumber(item.steps, 0, 150000, 0));
        const syncedAt =
          typeof item.syncedAt === 'string' && item.syncedAt
            ? item.syncedAt.slice(0, 40)
            : nowIso;
        return { date, steps, source, syncedAt };
      })
      .filter((e): e is NonNullable<typeof e> => Boolean(e));

    if (cleanedEntries.length === 0) {
      return NextResponse.json({ ok: true, synced: {} });
    }

    const syncedResult: Record<
      string,
      { steps: number; stepsSource: StepsSyncSource; stepsSyncedAt: string }
    > = {};

    await updateServerDbState((prev) => ({
      ...prev,
      trainees: prev.trainees.map((existing) => {
        if (existing.id !== authorizedTraineeId) return existing;

        const nextLogs: Record<string, DailyLog> = { ...existing.logs };
        let changed = false;

        for (const entry of cleanedEntries) {
          const dayLog: DailyLog = nextLogs[entry.date] || {
            date: entry.date,
            dayType: 'workout',
            waterCups: 0,
            waterGoal: 12,
            weightKg: existing.currentWeight,
            meals: {},
          };

          const existingSteps = dayLog.steps ?? 0;

          if (entry.source !== 'manual') {
            // שמירה מפני דריסת הזנה ידנית גבוהה יותר או רגרסיה בעת נפילה ממקור שעון למקור טלפון בלבד
            if (dayLog.stepsSource === 'manual' && entry.steps <= existingSteps) {
              syncedResult[entry.date] = {
                steps: existingSteps,
                stepsSource: 'manual',
                stepsSyncedAt: dayLog.stepsSyncedAt || nowIso,
              };
              continue;
            }
            if (entry.steps < existingSteps) {
              syncedResult[entry.date] = {
                steps: existingSteps,
                stepsSource: dayLog.stepsSource || entry.source,
                stepsSyncedAt: dayLog.stepsSyncedAt || nowIso,
              };
              continue;
            }
          }

          if (
            dayLog.steps === entry.steps &&
            dayLog.stepsSource === entry.source &&
            dayLog.stepsSyncedAt
          ) {
            syncedResult[entry.date] = {
              steps: entry.steps,
              stepsSource: entry.source,
              stepsSyncedAt: dayLog.stepsSyncedAt,
            };
            continue;
          }

          nextLogs[entry.date] = {
            ...dayLog,
            steps: entry.steps,
            stepsSource: entry.source,
            stepsSyncedAt: entry.syncedAt,
          };
          syncedResult[entry.date] = {
            steps: entry.steps,
            stepsSource: entry.source,
            stepsSyncedAt: entry.syncedAt,
          };
          changed = true;
        }

        if (!changed) return existing;
        return { ...existing, logs: nextLogs };
      }),
    }));

    const latestSynced = cleanedEntries[cleanedEntries.length - 1];
    ctx.recordAudit({
      category: 'steps',
      action:
        syncOrigin === 'background_worker'
          ? 'steps_synced_bg_worker'
          : 'steps_synced_fg',
      targetTraineeId: authorizedTraineeId,
      metadata: {
        daysCount: cleanedEntries.length,
        latestDate: latestSynced?.date,
        latestSteps: latestSynced?.steps,
        source: latestSynced?.source,
      },
    });

    return NextResponse.json(
      { ok: true, synced: syncedResult },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Steps sync API error:', error);
    ctx.setErrorCode('STEPS_SYNC_ERROR', error instanceof Error ? error.message : '');
    return NextResponse.json(
      { error: 'שגיאה בסנכרון הצעדים לשרת' },
      { status: 500 }
    );
  }
});
