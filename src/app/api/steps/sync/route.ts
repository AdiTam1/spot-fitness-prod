import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  clearSessionCookie,
  getSessionFromRequest,
  sanitizeNumber,
  signStepsSyncToken,
  verifyCsrfOrigin,
  verifyStepsSyncToken,
} from '@/lib/serverAuth';
import {
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import { DailyLog, StepsSyncSource } from '@/types/nutrition';

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

export async function GET(request: NextRequest) {
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

  return NextResponse.json(
    {
      ok: true,
      traineeId: session.id,
      syncToken: signStepsSyncToken(session.id),
    },
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

    let authorizedTraineeId: string | null = null;
    const cookieSession = getSessionFromRequest(request);
    if (cookieSession?.role === 'trainee') {
      authorizedTraineeId = cookieSession.id;
    } else {
      const authHeader = request.headers.get('authorization') || '';
      const bearer = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
      authorizedTraineeId = verifyStepsSyncToken(bearer);
    }

    if (!authorizedTraineeId) {
      return NextResponse.json(
        { error: 'נדרש אימות מתאמן תקף לסנכרון צעדים' },
        { status: 401 }
      );
    }

    const liveTrainee = await getSingleTraineeFromServer(authorizedTraineeId);
    if (!liveTrainee || liveTrainee.status !== 'active') {
      return NextResponse.json({ error: 'החשבון אינו פעיל' }, { status: 403 });
    }

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

    return NextResponse.json(
      { ok: true, synced: syncedResult },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Steps sync API error:', error);
    return NextResponse.json(
      { error: 'שגיאה בסנכרון הצעדים לשרת' },
      { status: 500 }
    );
  }
}
