import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DEFAULT_RELEASES_PAGE =
  'https://github.com/AdiTam1/spot-fitness-prod/releases/latest';
const DEFAULT_DIRECT_APK_URL =
  'https://github.com/AdiTam1/spot-fitness-prod/releases/latest/download/spot-fitness-release.apk';

interface GithubReleaseAsset {
  name?: string;
  browser_download_url?: string;
}

interface GithubLatestRelease {
  tag_name?: string;
  html_url?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

export async function GET() {
  let latestVersionCode = Number(process.env.ANDROID_APK_VERSION_CODE || 1) || 1;
  let latestVersionName = process.env.ANDROID_APK_VERSION_NAME || '1.0.0';
  let apkDownloadUrl =
    process.env.ANDROID_APK_DOWNLOAD_URL || DEFAULT_DIRECT_APK_URL;
  let releasesPageUrl = DEFAULT_RELEASES_PAGE;
  let releaseNotes =
    'אפליקציית אנדרואיד רשמית של SPOT עם סנכרון צעדים חכם (Health Connect + חיישן מערכת) וסריקת ארוחות.';

  // נסה לשלוף גרסה אחרונה מ-GitHub Releases (רלוונטי להפצת APK ישירה)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const ghRes = await fetch(
      'https://api.github.com/repos/AdiTam1/spot-fitness-prod/releases/latest',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'spot-fitness-app-updater',
        },
        cache: 'no-store',
        signal: controller.signal,
      }
    );
    clearTimeout(timer);

    if (ghRes.ok) {
      const release = (await ghRes.json()) as GithubLatestRelease;
      if (release.tag_name) {
        const cleanTag = release.tag_name.replace(/^v/i, '');
        const codeMatch = cleanTag.match(/(\d+)\.(\d+)\.(\d+)/);
        if (codeMatch) {
          latestVersionName = `${codeMatch[1]}.${codeMatch[2]}.${codeMatch[3]}`;
          const computedCode =
            Number(codeMatch[1]) * 10000 +
            Number(codeMatch[2]) * 100 +
            Number(codeMatch[3]);
          if (computedCode >= latestVersionCode) {
            latestVersionCode = computedCode;
          }
        } else {
          latestVersionName = cleanTag;
        }
      }
      if (release.html_url) releasesPageUrl = release.html_url;
      if (release.body?.trim()) releaseNotes = release.body.trim().slice(0, 400);
      const apkAsset = release.assets?.find((a) =>
        String(a.name || '')
          .toLowerCase()
          .endsWith('.apk')
      );
      if (apkAsset?.browser_download_url) {
        apkDownloadUrl = apkAsset.browser_download_url;
      }
    }
  } catch {
    // שקט: נופל אל ברירת המחדל במקרה שאין עדיין Release ב-GitHub
  }

  return NextResponse.json(
    {
      platform: 'android',
      packageId: 'app.spotfitness.mobile',
      latestVersionCode,
      latestVersionName,
      minSupportedVersionCode: 1,
      apkDownloadUrl,
      releasesPageUrl,
      releaseNotes,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
