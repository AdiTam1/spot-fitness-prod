import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AuthSessionUser } from '@/types/nutrition';

const SESSION_COOKIE_NAME = 'spot_session_token';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 ימים למאמנים ומנהלים
const TRAINEE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 ימים למתאמנים (רציפות בחיבור PWA באייפון ובאפליקציה)

function getSessionTtlSeconds(role: AuthSessionUser['role']): number {
  return role === 'trainee' ? TRAINEE_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS;
}

function getServerSecret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.GEMINI_API_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'spot-fitness-server-hmac-secret-key-2026-secure'
  );
}

/**
 * גיבוב סיסמה בצד השרת (SHA-256 עם Salt קבוע של המערכת)
 */
export function hashPassword(plainPassword: string): string {
  const salt = 'spot-nutrition-os-salt-v1';
  return crypto
    .createHmac('sha256', salt)
    .update(plainPassword.trim())
    .digest('hex');
}

export function verifyPassword(plainInput: string, storedPasswordOrHash: string): boolean {
  const cleanInput = plainInput.trim();
  const hashedInput = hashPassword(cleanInput);
  // תמיכה גם בסיסמה שכבר גובבה וגם בסיסמת התחלה לפני גיבוב
  if (storedPasswordOrHash.length === 64 && /^[0-9a-f]+$/.test(storedPasswordOrHash)) {
    const a = Buffer.from(hashedInput);
    const b = Buffer.from(storedPasswordOrHash);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  return cleanInput === storedPasswordOrHash;
}

interface SignedPayload {
  user: AuthSessionUser;
  exp: number;
}

/**
 * יצירת טוקן חתום קריפטוגרפית (HMAC-SHA256) בצד השרת בלבד.
 * אם תוקף ינסה לשנות תו אחד בעוגייה (למשל לשנות role מ-trainee ל-coach),
 * החתימה הקריפטוגרפית תישבר והשרת ידחה את הבקשה מיד!
 */
export function signSessionToken(user: AuthSessionUser): string {
  const payload: SignedPayload = {
    user,
    exp: Math.floor(Date.now() / 1000) + getSessionTtlSeconds(user.role),
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getServerSecret())
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token: string | undefined): AuthSessionUser | null {
  if (!token || !token.includes('.')) return null;
  try {
    const [payloadBase64, providedSig] = token.split('.');
    if (!payloadBase64 || !providedSig) return null;

    const expectedSig = crypto
      .createHmac('sha256', getServerSecret())
      .update(payloadBase64)
      .digest('base64url');

    const sigBufferA = Buffer.from(providedSig);
    const sigBufferB = Buffer.from(expectedSig);

    // השוואה בטוחה מפני התקפות תזמון (Timing Attack)
    if (
      sigBufferA.length !== sigBufferB.length ||
      !crypto.timingSafeEqual(sigBufferA, sigBufferB)
    ) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf-8')
    ) as SignedPayload;

    if (!decoded.exp || decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded.user;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request: NextRequest): AuthSessionUser | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

interface ScopedStepsPayload {
  scope: 'steps-sync';
  traineeId: string;
  sv?: number;
  exp: number;
}

const STEPS_SYNC_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 ימים לסנכרון רקע אמין מה-APK

/**
 * יצירת טוקן ייעודי המוגבל אך ורק לסנכרון צעדים של מתאמן ספציפי (ללא גישה לארוחות או הגדרות מאמן).
 * מאפשר ל-WorkManager ברקע לסנכרן גם כשהאפליקציה נהרגה מהזיכרון והעוגייה של WebView טרם נטענה.
 */
export function signStepsSyncToken(
  traineeId: string,
  sessionVersion = 1
): string {
  const payload: ScopedStepsPayload = {
    scope: 'steps-sync',
    traineeId,
    sv: Math.max(1, Number(sessionVersion) || 1),
    exp: Math.floor(Date.now() / 1000) + STEPS_SYNC_TOKEN_TTL_SECONDS,
  };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getServerSecret())
    .update(payloadBase64)
    .digest('base64url');
  return `${payloadBase64}.${signature}`;
}

export function verifyStepsSyncToken(
  token: string | undefined | null
): { traineeId: string; sv: number } | null {
  if (!token || !token.includes('.')) return null;
  try {
    const [payloadBase64, providedSig] = token.split('.');
    if (!payloadBase64 || !providedSig) return null;

    const expectedSig = crypto
      .createHmac('sha256', getServerSecret())
      .update(payloadBase64)
      .digest('base64url');

    const sigA = Buffer.from(providedSig);
    const sigB = Buffer.from(expectedSig);
    if (sigA.length !== sigB.length || !crypto.timingSafeEqual(sigA, sigB)) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payloadBase64, 'base64url').toString('utf-8')
    ) as Partial<ScopedStepsPayload>;

    if (
      decoded.scope !== 'steps-sync' ||
      typeof decoded.traineeId !== 'string' ||
      !decoded.traineeId ||
      !decoded.exp ||
      decoded.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      traineeId: decoded.traineeId,
      sv: Math.max(1, Number(decoded.sv) || 1),
    };
  } catch {
    return null;
  }
}

export function attachSessionCookie(
  response: NextResponse,
  user: AuthSessionUser
): NextResponse {
  const token = signSessionToken(user);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true, // חוסם גישה של JavaScript / XSS לעוגייה!
    sameSite: 'lax', // מגן מפני התקפות CSRF
    secure: process.env.NODE_ENV === 'production', // HTTPS בלבד בפרודקשן
    path: '/',
    maxAge: getSessionTtlSeconds(user.role),
  });
  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}

// הגנת Rate-Limiting בזיכרון השרת נגד ניסיונות פריצה (Brute Force) וניצול מכסת AI
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  record.count += 1;
  return { allowed: true, remaining: maxRequests - record.count };
}

/**
 * אימות כותרת Origin / Host להגנה מפני CSRF בבקשות POST / DELETE
 */
export function verifyCsrfOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return true; // בקשות מאותו מקור ללא כותרת חיצונית
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}

/**
 * סינון וניקוי טקסט מתגיות HTML/Script זדוניות והגבלת אורך
 */
export function sanitizeText(input: unknown, maxLength = 250): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * ולידציה של מספרים למניעת ערכים שליליים, NaN או Infinity
 */
export function sanitizeNumber(
  input: unknown,
  min = 0,
  max = 100000,
  fallback = 0
): number {
  const num = Number(input);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/**
 * יצירת מזהה UUIDv4 קריפטוגרפי בלתי ניתן לניחוש (מונע ID Enumeration)
 */
export function generateSecureId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

