import crypto from 'crypto';
import { TraineeProfile } from '@/types/nutrition';

interface ServiceAccountConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

interface CachedAccessToken {
  accessToken: string;
  expiresAtMs: number;
  projectId: string;
}

let cachedToken: CachedAccessToken | null = null;

function tryParseJsonRelaxed(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return tryParseJsonRelaxed(parsed);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // תיקון ירידות שורה חיות בתוך מחרוזות JSON בעקבות העתק-הדבק
    let inString = false;
    let escaped = false;
    let fixed = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        fixed += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        fixed += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        fixed += ch;
        continue;
      }
      if (inString && (ch === '\n' || ch === '\r')) {
        if (ch === '\n') fixed += '\\n';
        continue;
      }
      fixed += ch;
    }
    try {
      const reparsed = JSON.parse(fixed);
      if (reparsed && typeof reparsed === 'object') {
        return reparsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeServiceAccountRaw(raw: string): Record<string, unknown> | null {
  let candidate = raw.trim().replace(/^\uFEFF/, '');
  if (!candidate) return null;

  if (
    (candidate.startsWith("'") && candidate.endsWith("'")) ||
    (candidate.startsWith('"') && candidate.endsWith('"'))
  ) {
    const asJsonStr = tryParseJsonRelaxed(candidate);
    if (asJsonStr) return asJsonStr;
    candidate = candidate.slice(1, -1).trim();
  }

  if (!candidate.startsWith('{')) {
    try {
      const decoded = Buffer.from(candidate, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) {
        candidate = decoded;
      }
    } catch {
      // ignore non-base64
    }
  }

  return tryParseJsonRelaxed(candidate);
}

function loadServiceAccountWithReason(): {
  config: ServiceAccountConfig | null;
  reason: 'ready' | 'missing' | 'invalid-format';
} {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawJson) {
    const parsed = normalizeServiceAccountRaw(rawJson);
    const projectId =
      typeof parsed?.project_id === 'string' ? parsed.project_id.trim() : '';
    const clientEmail =
      typeof parsed?.client_email === 'string'
        ? parsed.client_email.trim()
        : '';
    const privateKeyRaw =
      typeof parsed?.private_key === 'string' ? parsed.private_key : '';

    if (projectId && clientEmail && privateKeyRaw) {
      return {
        config: {
          projectId,
          clientEmail,
          privateKey: privateKeyRaw.replace(/\\n/g, '\n').trim(),
        },
        reason: 'ready',
      };
    }
    console.error(
      'FIREBASE_SERVICE_ACCOUNT_JSON present but invalid or missing project_id/client_email/private_key'
    );
    return { config: null, reason: 'invalid-format' };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (projectId && clientEmail && privateKey) {
    return {
      config: { projectId, clientEmail, privateKey },
      reason: 'ready',
    };
  }
  return { config: null, reason: 'missing' };
}

function loadServiceAccountConfig(): ServiceAccountConfig | null {
  return loadServiceAccountWithReason().config;
}

export function isFcmConfigured(): boolean {
  return loadServiceAccountWithReason().config !== null;
}

export function getFcmConfigErrorMessage(): string | null {
  const { reason } = loadServiceAccountWithReason();
  if (reason === 'ready') return null;
  if (reason === 'invalid-format') {
    return 'המשתנה FIREBASE_SERVICE_ACCOUNT_JSON קיים בשרת אך הפורמט שלו אינו תקין — יש להדביק את כל תוכן קובץ ה-JSON של Service Account מ-Firebase (כולל project_id, client_email, private_key).';
  }
  return 'המשתנה FIREBASE_SERVICE_ACCOUNT_JSON לא נטען בגרסת השרת הפעילה כרגע — אם הוספת אותו עכשיו ב-Vercel (Production), יש לבצע Redeploy כדי שהשינוי ייכנס לתוקף.';
}

async function getFcmAccessToken(
  cfg: ServiceAccountConfig
): Promise<string | null> {
  const nowMs = Date.now();
  if (
    cachedToken &&
    cachedToken.projectId === cfg.projectId &&
    cachedToken.expiresAtMs - 5 * 60 * 1000 > nowMs
  ) {
    return cachedToken.accessToken;
  }

  const nowSec = Math.floor(nowMs / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: cfg.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString('base64url');

  const unsignedJwt = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  const signature = signer.sign(cfg.privateKey, 'base64url');
  const jwt = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '');
    console.error('FCM OAuth token exchange failed:', tokenRes.status, errText);
    return null;
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!tokenData.access_token) return null;

  cachedToken = {
    accessToken: tokenData.access_token,
    expiresAtMs: nowMs + (Number(tokenData.expires_in) || 3600) * 1000,
    projectId: cfg.projectId,
  };
  return tokenData.access_token;
}

export interface FcmSendPayload {
  title: string;
  body: string;
  channelId: 'spot_ai_meals' | 'spot_coach_alerts';
  data?: Record<string, string | number | boolean | undefined>;
}

export interface FcmBatchSendResult {
  configured: boolean;
  sentCount: number;
  invalidTokens: string[];
  errors: string[];
}

function sanitizeDataMap(
  raw?: Record<string, string | number | boolean | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    const key = k.trim();
    if (
      !key ||
      key === 'from' ||
      key.startsWith('google.') ||
      key.startsWith('gcm.')
    ) {
      continue;
    }
    out[key] = String(v).slice(0, 500);
  }
  return out;
}

export async function sendFcmNotificationToTokens(
  tokens: string[],
  payload: FcmSendPayload
): Promise<FcmBatchSendResult> {
  const cfg = loadServiceAccountConfig();
  if (!cfg) {
    return {
      configured: false,
      sentCount: 0,
      invalidTokens: [],
      errors: ['FIREBASE_SERVICE_ACCOUNT_JSON is not configured'],
    };
  }

  const uniqueTokens = Array.from(
    new Set(tokens.map((t) => t.trim()).filter(Boolean))
  );
  if (uniqueTokens.length === 0) {
    return { configured: true, sentCount: 0, invalidTokens: [], errors: [] };
  }

  const accessToken = await getFcmAccessToken(cfg);
  if (!accessToken) {
    return {
      configured: true,
      sentCount: 0,
      invalidTokens: [],
      errors: ['Failed to obtain Google OAuth2 access token'],
    };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`;
  const dataMap = sanitizeDataMap(payload.data);

  let sentCount = 0;
  const invalidTokens: string[] = [];
  const errors: string[] = [];

  for (const token of uniqueTokens) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title: payload.title.slice(0, 120),
              body: payload.body.slice(0, 500),
            },
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: payload.channelId,
                icon: 'ic_stat_spot',
                color: '#d2ff28',
                click_action: 'FCM_PLUGIN_ACTIVITY',
                sound: 'default',
              },
            },
            data: dataMap,
          },
        }),
      });

      if (res.ok) {
        sentCount += 1;
        continue;
      }

      const errJson = (await res.json().catch(() => null)) as {
        error?: {
          status?: string;
          message?: string;
          details?: Array<{ errorCode?: string }>;
        };
      } | null;

      const fcmErrorCode = errJson?.error?.details?.find(
        (d) => typeof d?.errorCode === 'string'
      )?.errorCode;
      const status = errJson?.error?.status;

      if (
        res.status === 404 ||
        fcmErrorCode === 'UNREGISTERED' ||
        fcmErrorCode === 'SENDER_ID_MISMATCH' ||
        status === 'NOT_FOUND'
      ) {
        invalidTokens.push(token);
      } else {
        errors.push(
          errJson?.error?.message || fcmErrorCode || `HTTP ${res.status}`
        );
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Network error');
    }
  }

  return {
    configured: true,
    sentCount,
    invalidTokens,
    errors,
  };
}

/**
 * מחזיר true אך ורק אם המתאמן רשום לפושים, לא כיבה פוש AI,
 * וכרגע אינו צופה באופן פעיל בתוך האפליקציה (יצא / סגר / Heartbeat פג תוקף).
 */
export function shouldNotifyAiBackgroundCompletion(
  trainee: TraineeProfile
): boolean {
  if (!trainee.fcmTokens || trainee.fcmTokens.length === 0) return false;
  if (trainee.pushPreferences?.aiMealReady === false) return false;

  const fg = trainee.lastForegroundState;
  if (!fg) return true;
  if (!fg.isInForeground) return true;

  const updatedMs = Date.parse(fg.updatedAt || '');
  if (!Number.isFinite(updatedMs)) return true;

  // אם עברו מעל 40 שניות מאז הדיווח האחרון שהאפליקציה פתוחה -> סימן שהמשתמש יצא או האפליקציה הושעתה
  return Date.now() - updatedMs > 40_000;
}
