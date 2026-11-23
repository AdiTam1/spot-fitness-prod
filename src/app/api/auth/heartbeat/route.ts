import { NextRequest, NextResponse } from 'next/server';
import {
  getServerWebBuildId,
  resolveAppVersionInfo,
} from '@/lib/appVersionServer';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { clearSessionCookie } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(request: NextRequest) {
  const webBuildId = getServerWebBuildId();
  const androidHeader =
    request.headers.get('x-spot-android-version-code') ||
    request.nextUrl.searchParams.get('androidCode');
  const includeAndroidPolicy = Boolean(androidHeader);

  const [authRes, androidPolicy] = await Promise.all([
    authenticateActiveSession(request, { touchLastSeen: true }),
    includeAndroidPolicy
      ? resolveAppVersionInfo(request.url, { includeGitHubRelease: false })
      : Promise.resolve(undefined),
  ]);

  if (!authRes.ok) {
    const hasCookie = Boolean(
      request.cookies.get('spot_session_token')?.value
    );
    if (authRes.code === 'UNAUTHENTICATED' && !hasCookie) {
      return NextResponse.json(
        {
          authenticated: false,
          webBuildId,
          ...(androidPolicy ? { androidPolicy } : {}),
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const res = NextResponse.json(
      {
        authenticated: false,
        code: authRes.code,
        error: authRes.message,
        webBuildId,
        ...(androidPolicy ? { androidPolicy } : {}),
      },
      {
        status: authRes.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
    return clearSessionCookie(res);
  }

  return NextResponse.json(
    {
      authenticated: true,
      role: authRes.session.role,
      userId: authRes.session.id,
      name: authRes.liveName,
      webBuildId,
      ...(androidPolicy ? { androidPolicy } : {}),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
