import { NextRequest, NextResponse } from 'next/server';
import {
  checkRateLimit,
  getSessionFromRequest,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  extractRequestClientMeta,
  sanitizeTelemetryMetadata,
} from '@/lib/telemetry/redact';
import type { ClientTelemetryEventType } from '@/lib/telemetry/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const ALLOWED_EVENT_TYPES = new Set<ClientTelemetryEventType>([
  'screen_view',
  'ui_action',
  'client_error',
  'performance',
]);

const MAX_BODY_CHARS = 28_000;
const MAX_EVENTS_PER_BATCH = 20;

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const reqMeta = extractRequestClientMeta(request);
    const session = getSessionFromRequest(request);
    const rateKey = session?.id
      ? `tel-user-${session.id}`
      : `tel-ip-${reqMeta.ipHash || 'local'}`;
    const rl = checkRateLimit(rateKey, 30, 60);
    if (!rl.allowed) {
      return NextResponse.json({ ok: false, rateLimited: true }, { status: 429 });
    }

    const rawText = await request.text();
    if (!rawText || rawText.length > MAX_BODY_CHARS) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    let parsed: {
      sessionId?: unknown;
      platform?: unknown;
      appVersionCode?: unknown;
      webBuildId?: unknown;
      events?: unknown;
    };
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const sessionId = sanitizeText(parsed.sessionId, 64);
    const rawEvents = Array.isArray(parsed.events)
      ? parsed.events.slice(0, MAX_EVENTS_PER_BATCH)
      : [];

    if (!sessionId || rawEvents.length === 0) {
      return NextResponse.json({ ok: true, accepted: 0 });
    }

    if (
      !isSupabaseConfigured ||
      !supabase ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    ) {
      return NextResponse.json({ ok: true, accepted: 0, stored: false });
    }

    const clientPlatform =
      typeof parsed.platform === 'string' && parsed.platform.length <= 24
        ? sanitizeText(parsed.platform, 24)
        : reqMeta.platform;
    const clientAppCode =
      typeof parsed.appVersionCode === 'number' &&
      Number.isFinite(parsed.appVersionCode) &&
      parsed.appVersionCode > 0
        ? Math.round(parsed.appVersionCode)
        : reqMeta.appVersionCode ?? null;
    const clientWebBuildId =
      typeof parsed.webBuildId === 'string' && parsed.webBuildId
        ? sanitizeText(parsed.webBuildId, 40)
        : reqMeta.webBuildId || null;

    const rows = rawEvents
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const rec = item as Record<string, unknown>;
        const eventType = String(rec.eventType || '') as ClientTelemetryEventType;
        if (!ALLOWED_EVENT_TYPES.has(eventType)) return null;
        const eventName = sanitizeText(rec.eventName, 80);
        if (!eventName) return null;
        const screen = rec.screen ? sanitizeText(rec.screen, 80) : null;
        const details =
          rec.details && typeof rec.details === 'object'
            ? sanitizeTelemetryMetadata(
                rec.details as Record<string, unknown>,
                1400
              )
            : {};

        return {
          session_id: sessionId,
          user_id: session?.id || null,
          role: session?.role || null,
          platform: clientPlatform,
          app_version_code: clientAppCode,
          web_build_id: clientWebBuildId,
          event_type: eventType,
          event_name: eventName,
          screen,
          details,
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, accepted: 0 });
    }

    await supabase.from('client_telemetry_events').insert(rows);

    return NextResponse.json({ ok: true, accepted: rows.length });
  } catch {
    return NextResponse.json({ ok: true, accepted: 0 });
  }
}
