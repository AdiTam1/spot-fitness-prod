import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const maxDuration = 60;

/**
 * GET /api/cron/telemetry
 * משימת Cron יומית (Vercel Hobby): דוחסת את אתמול ל-telemetry_daily_rollups ומוחקת רשומות ישנות ישירות בתוך PostgreSQL (0 Egress).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const authHeader = request.headers.get('authorization') || '';
    const expected = `Bearer ${secret}`;
    let valid = authHeader.length === expected.length;
    if (valid) {
      try {
        valid = crypto.timingSafeEqual(
          Buffer.from(authHeader),
          Buffer.from(expected)
        );
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (
    !isSupabaseConfigured ||
    !supabase ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'SUPABASE_SERVICE_ROLE_KEY not configured',
    });
  }

  const { data, error } = await supabase.rpc('rollup_and_prune_telemetry');
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, result: data });
}
