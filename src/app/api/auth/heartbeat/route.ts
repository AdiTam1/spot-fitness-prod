import { NextRequest, NextResponse } from 'next/server';
import {
  getServerWebBuildId,
  resolveAppVersionInfo,
} from '@/lib/appVersionServer';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { clearSessionCookie } from '@/lib/serverAuth';
import { recordUserClientVersionOnServer } from '@/lib/serverStore';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const GET = withTelemetryHandler('/api/auth/heartbeat', async (request: NextRequest, ctx) => {
  const webBuildId = getServerWebBuildId();
  const androidHeader =
    request.headers.get('x-spot-android-version-code') ||
    request.nextUrl.searchParams.get('androidCode');
  const androidNameHeader =
    request.headers.get('x-spot-android-version-name') ||
    request.nextUrl.searchParams.get('androidName') ||
    null;
  const rawPlatform = request.headers.get('x-spot-client-platform');
  const clientWebBuildHeader =
    request.headers.get('x-spot-web-build-id') || null;
  const parsedAndroidCode =
    androidHeader && Number.isFinite(Number(androidHeader)) && Number(androidHeader) > 0
      ? Math.round(Number(androidHeader))
      : null;
  const includeAndroidPolicy = Boolean(androidHeader);

  const [authRes, androidPolicy] = await Promise.all([
    authenticateActiveSession(request, { touchLastSeen: true }),
    includeAndroidPolicy
      ? resolveAppVersionInfo(request.url, { includeGitHubRelease: false })
      : Promise.resolve(undefined),
  ]);

  if (!authRes.ok) {
    if (authRes.diagUid) {
      ctx.setActor({ id: authRes.diagUid, role: authRes.diagRole || 'trainee' });
    }
    ctx.setErrorCode(authRes.diagCode, authRes.message);
    if (authRes.diagCode === 'UNAUTHENTICATED_NO_COOKIE') {
      ctx.setActionName('heartbeat_anon');
      return NextResponse.json(
        {
          authenticated: false,
          webBuildId,
          ...(androidPolicy ? { androidPolicy } : {}),
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    ctx.setActionName('heartbeat_rejected');
    ctx.recordAudit({
      category: 'auth',
      action: 'heartbeat_rejected',
      status: authRes.status === 503 ? 'failed' : 'denied',
      actorId: authRes.diagUid || 'anonymous',
      actorRole: authRes.diagRole || 'anonymous',
      metadata: {
        diagCode: authRes.diagCode,
        httpStatus: authRes.status,
        ...(authRes.diagDetails || {}),
      },
    });

    const res = NextResponse.json(
      {
        authenticated: false,
        code: authRes.code,
        diagCode: authRes.diagCode,
        error: authRes.message,
        transient: authRes.status === 503,
        webBuildId,
        ...(androidPolicy ? { androidPolicy } : {}),
      },
      {
        status: authRes.status,
        headers: { 'Cache-Control': 'no-store, max-age=0' },
      }
    );
    return authRes.status === 503 ? res : clearSessionCookie(res);
  }

  ctx.setActionName('heartbeat_ok');
  ctx.setActor(authRes.session);

  try {
    await recordUserClientVersionOnServer(
      authRes.session.role,
      authRes.session.id,
      {
        platform:
          rawPlatform || (parsedAndroidCode ? 'android-apk' : 'web'),
        appVersionCode: parsedAndroidCode,
        appVersionName: androidNameHeader,
        webBuildId: clientWebBuildHeader || webBuildId,
      }
    );
  } catch {
    // שקט: לא מכשיל heartbeat אם מעקב גרסה נתקל בשגיאה רגעית
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
});
