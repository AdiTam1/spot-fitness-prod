import { NextRequest, NextResponse } from 'next/server';
import { resolveAppVersionInfo } from '@/lib/appVersionServer';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const payload = await resolveAppVersionInfo(request.url, {
    includeGitHubRelease: true,
  });
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}
