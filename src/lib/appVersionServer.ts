import fs from 'fs';
import path from 'path';
import { getAppReleasePolicyFromServer } from '@/lib/serverStore';
import hostedApkMeta from '@/lib/hostedApkMeta.json';

const DEFAULT_RELEASES_PAGE =
  'https://github.com/AdiTam1/spot-fitness-prod/releases/latest';
const DEFAULT_HOSTED_APK_PATH = hostedApkMeta?.path || '/downloads/spot-fitness-release.apk';
const DEFAULT_DIRECT_APK_URL = DEFAULT_HOSTED_APK_PATH;

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

export function getServerWebBuildId(): string {
  return (
    process.env.NEXT_PUBLIC_WEB_BUILD_ID ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    'dev'
  );
}

function findLocalHostedApkPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'public', 'downloads', 'spot-fitness-release.apk'),
    path.join(process.cwd(), 'public', 'downloads', 'spot-fitness.apk'),
    path.join(process.cwd(), 'public', 'spot-fitness-release.apk'),
  ];
  for (const absPath of candidates) {
    try {
      const stat = fs.statSync(absPath);
      if (stat.isFile() && stat.size > 100_000) {
        const rel = absPath
          .slice(path.join(process.cwd(), 'public').length)
          .replace(/\\/g, '/');
        return rel.startsWith('/') ? rel : `/${rel}`;
      }
    } catch {
      // file not present
    }
  }
  return null;
}

function resolveAbsoluteUrl(rawUrl: string, originUrl?: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return DEFAULT_DIRECT_APK_URL;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (originUrl) {
    try {
      return new URL(trimmed, originUrl).toString();
    } catch {
      // ignore
    }
  }
  return trimmed;
}

export interface ResolvedAppVersionPayload {
  platform: 'android';
  packageId: string;
  webBuildId: string;
  latestVersionCode: number;
  latestVersionName: string;
  androidBlockedUpToVersionCode: number;
  minSupportedVersionCode: number;
  apkDownloadUrl: string;
  apkSizeBytes: number | null;
  releasesPageUrl: string;
  releaseNotes: string;
  localApkDetected: boolean;
}

export async function resolveAppVersionInfo(
  originUrl?: string,
  opts?: { includeGitHubRelease?: boolean }
): Promise<ResolvedAppVersionPayload> {
  const webBuildId = getServerWebBuildId();
  const policy = await getAppReleasePolicyFromServer();

  const envBlockedUpTo =
    Number(process.env.ANDROID_BLOCKED_UP_TO_VERSION_CODE || 0) || 0;
  const androidBlockedUpToVersionCode = Math.max(
    0,
    policy.androidBlockedUpToVersionCode || envBlockedUpTo || 0
  );

  const metaCode = Number(hostedApkMeta?.versionCode || 0) || 0;
  const envVersionCode = Number(process.env.ANDROID_APK_VERSION_CODE || 0) || 0;
  let latestVersionCode = Math.max(1, envVersionCode, metaCode);
  let latestVersionName =
    process.env.ANDROID_APK_VERSION_NAME ||
    hostedApkMeta?.versionName ||
    '1.0.0';
  const localHostedRel = findLocalHostedApkPath() || (hostedApkMeta?.path || null);
  let apkDownloadUrl =
    process.env.ANDROID_APK_DOWNLOAD_URL ||
    localHostedRel ||
    DEFAULT_DIRECT_APK_URL;
  let releasesPageUrl = DEFAULT_RELEASES_PAGE;
  let releaseNotes =
    'עדכון אבטחה, סנכרון צעדים משופר וביצועים מהירים יותר באפליקציית SPOT.';

  if (opts?.includeGitHubRelease !== false) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2200);
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
        if (!localHostedRel && apkAsset?.browser_download_url) {
          apkDownloadUrl = apkAsset.browser_download_url;
        }
      }
    } catch {
      // שקט: נופל לברירת המחדל אם אין אינטרנט/Rate limit
    }
  }

  // הגדרות מנהל ראשי מתוך המסד גוברות על ברירות המחדל
  if (
    policy.androidLatestVersionCode &&
    policy.androidLatestVersionCode > 0
  ) {
    latestVersionCode = Math.max(
      latestVersionCode,
      policy.androidLatestVersionCode
    );
  }
  if (androidBlockedUpToVersionCode >= latestVersionCode) {
    latestVersionCode = androidBlockedUpToVersionCode + 1;
  }
  if (policy.androidLatestVersionName?.trim()) {
    latestVersionName = policy.androidLatestVersionName.trim();
  }
  if (policy.androidApkDownloadUrl?.trim()) {
    apkDownloadUrl = policy.androidApkDownloadUrl.trim();
  }
  if (policy.androidReleaseNotes?.trim()) {
    releaseNotes = policy.androidReleaseNotes.trim().slice(0, 400);
  }

  return {
    platform: 'android',
    packageId: 'app.spotfitness.mobile',
    webBuildId,
    latestVersionCode,
    latestVersionName,
    androidBlockedUpToVersionCode,
    minSupportedVersionCode: androidBlockedUpToVersionCode + 1,
    apkDownloadUrl: resolveAbsoluteUrl(apkDownloadUrl, originUrl),
    apkSizeBytes: Number(hostedApkMeta?.sizeBytes || 0) || null,
    releasesPageUrl,
    releaseNotes,
    localApkDetected: Boolean(localHostedRel),
  };
}
