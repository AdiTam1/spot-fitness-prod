import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionFromRequest,
  sanitizeNumber,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  getAppReleasePolicyFromServer,
  updateServerDbState,
} from '@/lib/serverStore';
import { resolveAppVersionInfo } from '@/lib/appVersionServer';
import { AppReleasePolicy } from '@/types/nutrition';
import { withTelemetryHandler } from '@/lib/telemetry/withApiTelemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const APK_BUCKET = 'app-releases';
const MIN_APK_BYTES = 100_000;
const MAX_APK_BYTES = 52_428_800; // 50 MB (Supabase Free Tier Storage limit)
const SAFE_OBJECT_PATH_RE =
  /^releases\/[a-zA-Z0-9._-]{1,64}\/spot-fitness-release\.apk$/;

function getHasServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

async function inspectApkBucketStatus(): Promise<{
  supabaseConfigured: boolean;
  hasServiceRoleKey: boolean;
  bucketName: string;
  bucketReady: boolean;
  canAutoCreateBucket: boolean;
  bucketMessage?: string;
}> {
  const hasServiceRoleKey = getHasServiceRoleKey();
  if (!isSupabaseConfigured || !supabase) {
    return {
      supabaseConfigured: false,
      hasServiceRoleKey,
      bucketName: APK_BUCKET,
      bucketReady: false,
      canAutoCreateBucket: false,
      bucketMessage:
        'חיבור Supabase אינו מוגדר בשרת (נדרשים SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY).',
    };
  }

  if (hasServiceRoleKey) {
    const { data, error } = await supabase.storage.getBucket(APK_BUCKET);
    if (!error && data) {
      return {
        supabaseConfigured: true,
        hasServiceRoleKey: true,
        bucketName: APK_BUCKET,
        bucketReady: Boolean(data.public),
        canAutoCreateBucket: true,
        bucketMessage: data.public
          ? undefined
          : `ה-Bucket "${APK_BUCKET}" קיים אך אינו מוגדר כ-Public — יעודכן אוטומטית בהעלאה.`,
      };
    }
    return {
      supabaseConfigured: true,
      hasServiceRoleKey: true,
      bucketName: APK_BUCKET,
      bucketReady: false,
      canAutoCreateBucket: true,
      bucketMessage: `ה-Bucket "${APK_BUCKET}" ייווצר אוטומטית בהעלאה הראשונה.`,
    };
  }

  // Without Service Role Key, probe list() to check whether manual bucket + policies exist
  const { error: listErr } = await supabase.storage
    .from(APK_BUCKET)
    .list('releases', { limit: 1 });
  return {
    supabaseConfigured: true,
    hasServiceRoleKey: false,
    bucketName: APK_BUCKET,
    bucketReady: !listErr,
    canAutoCreateBucket: false,
    bucketMessage: listErr
      ? `חסר SUPABASE_SERVICE_ROLE_KEY ב-Vercel (או Bucket ציבורי ידני בשם "${APK_BUCKET}").`
      : `Bucket ידני "${APK_BUCKET}" זוהה (מומלץ להוסיף גם SUPABASE_SERVICE_ROLE_KEY ב-Vercel).`,
  };
}

async function ensurePublicApkBucketIfPossible(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      error:
        'חיבור Supabase אינו מוגדר בשרת. הגדר SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY בהגדרות Vercel.',
    };
  }

  if (!getHasServiceRoleKey()) {
    return { ok: true };
  }

  const { data: existingBucket, error: getErr } =
    await supabase.storage.getBucket(APK_BUCKET);

  if (!getErr && existingBucket) {
    if (!existingBucket.public) {
      const { error: updErr } = await supabase.storage.updateBucket(APK_BUCKET, {
        public: true,
        fileSizeLimit: MAX_APK_BYTES,
      });
      if (updErr) {
        return {
          ok: false,
          error: `לא ניתן להפוך את ה-Bucket "${APK_BUCKET}" לציבורי: ${updErr.message}`,
        };
      }
    }
    return { ok: true };
  }

  const { error: createErr } = await supabase.storage.createBucket(APK_BUCKET, {
    public: true,
    fileSizeLimit: MAX_APK_BYTES,
  });

  if (createErr && !/already exists/i.test(createErr.message || '')) {
    return {
      ok: false,
      error: `שגיאה ביצירת Bucket "${APK_BUCKET}" ב-Supabase Storage: ${createErr.message}`,
    };
  }

  return { ok: true };
}

/**
 * GET /api/admin/apk-release
 * מחזיר סטטוס מוכנות של Supabase Storage ופרטי הגרסה הפעילה (למנהל ראשי בלבד).
 */
export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'גישה מותרת למנהל מערכת ראשי בלבד' },
      { status: 403 }
    );
  }

  const [storageStatus, versionInfo] = await Promise.all([
    inspectApkBucketStatus(),
    resolveAppVersionInfo(request.url, { includeGitHubRelease: false }),
  ]);

  return NextResponse.json({
    storage: storageStatus,
    versionInfo,
  });
}

/**
 * POST /api/admin/apk-release
 * 1) prepare_upload: יוצר Signed Upload URL ישיר מול Supabase Storage (עוקף מגבלת 4.5MB של Vercel)
 * 2) publish_release: מאמת את הקובץ שהועלה ומפרסם את appReleasePolicy לכל המשתמשים מיד
 */
export const POST = withTelemetryHandler('/api/admin/apk-release', async (request, ctx) => {
  if (!verifyCsrfOrigin(request)) {
    return NextResponse.json({ error: 'בקשה אינה מורשית' }, { status: 403 });
  }

  const session = getSessionFromRequest(request);
  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      { error: 'גישה מותרת למנהל מערכת ראשי בלבד' },
      { status: 403 }
    );
  }
  ctx.setActor(session);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 });
  }

  const action = String(body.action || '');
  ctx.setActionName(action);

  if (action === 'prepare_upload') {
    const rawName = sanitizeText(body.fileName, 120);
    const fileSize = Math.round(
      sanitizeNumber(body.fileSize, 0, MAX_APK_BYTES + 1, 0)
    );

    if (!/\.apk$/i.test(rawName)) {
      return NextResponse.json(
        { error: 'ניתן להעלות קובץ בסיומת .apk בלבד' },
        { status: 400 }
      );
    }
    if (fileSize < MIN_APK_BYTES) {
      return NextResponse.json(
        { error: 'קובץ ה-APK קטן מדי ואינו נראה תקין' },
        { status: 400 }
      );
    }
    if (fileSize > MAX_APK_BYTES) {
      return NextResponse.json(
        { error: 'גודל הקובץ חורג מהמגבלה (עד 50 MB)' },
        { status: 400 }
      );
    }

    const bucketCheck = await ensurePublicApkBucketIfPossible();
    if (!bucketCheck.ok || !supabase) {
      return NextResponse.json(
        { error: bucketCheck.error || 'Supabase Storage אינו זמין' },
        { status: 400 }
      );
    }

    const versionSlug =
      sanitizeText(body.versionName, 24)
        .replace(/[^a-zA-Z0-9._-]/g, '-')
        .replace(/^-+|-+$/g, '') || 'release';
    const objectPath = `releases/${versionSlug}-${Date.now()}/spot-fitness-release.apk`;

    const { data: signedData, error: signErr } = await supabase.storage
      .from(APK_BUCKET)
      .createSignedUploadUrl(objectPath, { upsert: true });

    if (signErr || !signedData?.signedUrl) {
      const msg = signErr?.message || 'שגיאה ביצירת כתובת העלאה חתומה';
      const hint = !getHasServiceRoleKey()
        ? ' — ודא ש-SUPABASE_SERVICE_ROLE_KEY הוגדר ב-Vercel או שקיים Bucket ציבורי בשם app-releases עם הרשאת העלאה.'
        : '';
      return NextResponse.json({ error: `${msg}${hint}` }, { status: 400 });
    }

    const { data: pubData } = supabase.storage
      .from(APK_BUCKET)
      .getPublicUrl(objectPath, { download: 'spot-fitness-release.apk' });

    return NextResponse.json({
      ok: true,
      bucketName: APK_BUCKET,
      objectPath,
      signedUrl: signedData.signedUrl,
      token: signedData.token,
      publicDownloadUrl: pubData.publicUrl,
    });
  }

  if (action === 'publish_release') {
    if (!isSupabaseConfigured || !supabase) {
      return NextResponse.json(
        { error: 'Supabase אינו מוגדר בשרת' },
        { status: 400 }
      );
    }

    const objectPath = String(body.objectPath || '').trim();
    if (!SAFE_OBJECT_PATH_RE.test(objectPath)) {
      return NextResponse.json(
        { error: 'נתיב קובץ ה-APK ב-Storage אינו תקין' },
        { status: 400 }
      );
    }

    const slashIdx = objectPath.lastIndexOf('/');
    const folder = objectPath.slice(0, slashIdx);
    const fileName = objectPath.slice(slashIdx + 1);

    const { data: listed, error: listErr } = await supabase.storage
      .from(APK_BUCKET)
      .list(folder, { search: fileName, limit: 5 });

    const uploadedEntry = listed?.find((item) => item.name === fileName);
    if (listErr || !uploadedEntry) {
      return NextResponse.json(
        {
          error:
            listErr?.message ||
            'קובץ ה-APK טרם נמצא ב-Supabase Storage. ודא שה-Bucket מוגדר כ-Public וההעלאה הושלמה.',
        },
        { status: 400 }
      );
    }

    const reportedMetaSize = Number(
      (uploadedEntry.metadata as { size?: number } | null)?.size || 0
    );
    const clientFileSize = Math.round(
      sanitizeNumber(body.fileSize, MIN_APK_BYTES, MAX_APK_BYTES, 0)
    );
    const apkSizeBytes =
      reportedMetaSize > MIN_APK_BYTES
        ? reportedMetaSize
        : clientFileSize > 0
        ? clientFileSize
        : undefined;

    const { data: pubData } = supabase.storage
      .from(APK_BUCKET)
      .getPublicUrl(objectPath, { download: 'spot-fitness-release.apk' });

    const currentPolicy = await getAppReleasePolicyFromServer();

    const latestCodeRaw =
      body.latestVersionCode !== undefined &&
      body.latestVersionCode !== null &&
      body.latestVersionCode !== ''
        ? Math.round(sanitizeNumber(body.latestVersionCode, 1, 99999999, 0))
        : undefined;
    const latestNameRaw = sanitizeText(body.latestVersionName, 40);
    const releaseNotesRaw = sanitizeText(body.releaseNotes, 400);

    const blockedUpTo =
      body.blockedUpToVersionCode !== undefined &&
      body.blockedUpToVersionCode !== null &&
      body.blockedUpToVersionCode !== ''
        ? Math.round(sanitizeNumber(body.blockedUpToVersionCode, 0, 99999999, 0))
        : Math.max(0, currentPolicy.androidBlockedUpToVersionCode || 0);

    const nextPolicy: AppReleasePolicy = {
      androidBlockedUpToVersionCode: blockedUpTo,
      androidLatestVersionCode:
        latestCodeRaw && latestCodeRaw > 0
          ? latestCodeRaw
          : currentPolicy.androidLatestVersionCode,
      androidLatestVersionName:
        latestNameRaw || currentPolicy.androidLatestVersionName,
      androidApkDownloadUrl: pubData.publicUrl,
      androidApkSizeBytes: apkSizeBytes,
      androidReleaseNotes:
        releaseNotesRaw || currentPolicy.androidReleaseNotes,
      updatedAt: new Date().toISOString(),
    };

    await updateServerDbState((prev) => ({
      ...prev,
      appReleasePolicy: nextPolicy,
    }));

    ctx.recordAudit({
      category: 'apk',
      action: 'apk_release_published',
      metadata: {
        versionCode: nextPolicy.androidLatestVersionCode,
        versionName: nextPolicy.androidLatestVersionName,
        sizeBytes: apkSizeBytes,
        blockedUpTo: nextPolicy.androidBlockedUpToVersionCode,
      },
    });

    return NextResponse.json({
      ok: true,
      appReleasePolicy: nextPolicy,
    });
  }

  return NextResponse.json({ error: 'פעולה לא מזוהה' }, { status: 400 });
});
