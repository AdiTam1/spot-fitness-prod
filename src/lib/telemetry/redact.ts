import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import type { TelemetryPlatform } from './types';

const SENSITIVE_KEY_RE =
  /(password|pass|secret|token|cookie|authorization|apikey|api_key|vapid|photoDataUrl|photoDataUrls|base64|jwt|privateKey|credential)/i;

const DATA_IMAGE_RE = /data:image\/[a-z0-9+.-]+;base64,[a-z0-9+/=]+/gi;

function sanitizeStringValue(val: string, maxLen = 240): string {
  const cleaned = val
    .replace(DATA_IMAGE_RE, '[IMAGE_DATA_REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/[<>]/g, '')
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}…` : cleaned;
}

function redactRecursive(
  val: unknown,
  depth: number
): unknown {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') return sanitizeStringValue(val);
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return val;
  if (depth >= 4) return '[MAX_DEPTH]';

  if (Array.isArray(val)) {
    return val.slice(0, 20).map((item) => redactRecursive(item, depth + 1));
  }

  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    let keys = 0;
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (keys >= 30) break;
      if (SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        const sanitized = redactRecursive(v, depth + 1);
        if (sanitized !== undefined) {
          out[k] = sanitized;
        }
      }
      keys += 1;
    }
    return out;
  }

  return String(val).slice(0, 120);
}

/**
 * מנקה אובייקט מטא-דאטה מפרטי אימות, סודות ותמונות Base64 ומגביל נפח לשמירה רזה ב-DB.
 */
export function sanitizeTelemetryMetadata(
  raw?: Record<string, unknown>,
  maxJsonChars = 1500
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned = (redactRecursive(raw, 0) as Record<string, unknown>) || {};
  try {
    const serialized = JSON.stringify(cleaned);
    if (serialized.length <= maxJsonChars) {
      return cleaned;
    }
    return {
      _truncated: true,
      summaryKeys: Object.keys(cleaned).slice(0, 10),
    };
  } catch {
    return {};
  }
}

export function sanitizeErrorSummary(err: unknown, maxLen = 300): string {
  const raw =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === 'string'
      ? err
      : '';
  return sanitizeStringValue(raw, maxLen);
}

export function hashClientIp(request: NextRequest): string | undefined {
  const rawIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    '';
  if (!rawIp || rawIp === '::1' || rawIp === '127.0.0.1') {
    return 'local';
  }
  const salt =
    process.env.TELEMETRY_IP_SALT ||
    process.env.AUTH_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'spot-telemetry-ip-salt-2026';
  return crypto
    .createHmac('sha256', salt)
    .update(rawIp)
    .digest('hex')
    .slice(0, 16);
}

const VALID_PLATFORMS = new Set<TelemetryPlatform>([
  'web',
  'pwa-ios',
  'pwa-android',
  'android-apk',
  'cron',
  'unknown',
]);

export function extractRequestClientMeta(request: NextRequest): {
  requestId: string;
  platform: TelemetryPlatform;
  appVersionCode?: number;
  webBuildId?: string;
  ipHash?: string;
} {
  const headerReqId = request.headers.get('x-spot-request-id')?.trim();
  const requestId =
    headerReqId && /^[a-zA-Z0-9_-]{8,64}$/.test(headerReqId)
      ? headerReqId
      : crypto.randomUUID();

  const rawPlatform = (
    request.headers.get('x-spot-client-platform') || ''
  ).trim() as TelemetryPlatform;

  const rawAndroidCode = Number(
    request.headers.get('x-spot-android-version-code') ||
      request.nextUrl.searchParams.get('androidCode') ||
      0
  );
  const appVersionCode =
    Number.isFinite(rawAndroidCode) && rawAndroidCode > 0
      ? Math.round(rawAndroidCode)
      : undefined;

  let platform: TelemetryPlatform = VALID_PLATFORMS.has(rawPlatform)
    ? rawPlatform
    : 'unknown';

  if (platform === 'unknown') {
    if (appVersionCode) {
      platform = 'android-apk';
    } else {
      const ua = (request.headers.get('user-agent') || '').toLowerCase();
      if (ua.includes('dalvik') || ua.includes('okhttp') || ua.includes('; wv)')) {
        platform = 'android-apk';
      } else if (ua.includes('iphone') || ua.includes('ipad')) {
        platform = 'web';
      } else if (ua) {
        platform = 'web';
      }
    }
  }

  const webBuildId = request.headers.get('x-spot-web-build-id')?.trim().slice(0, 40);

  return {
    requestId,
    platform,
    appVersionCode,
    webBuildId: webBuildId || undefined,
    ipHash: hashClientIp(request),
  };
}
