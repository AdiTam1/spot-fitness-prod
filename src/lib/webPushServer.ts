import { sendNotification } from 'web-push';
import { TraineeWebPushSubscriptionEntry } from '@/types/nutrition';

interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

function normalizeOrigin(rawOrigin?: string): string {
  const raw = (
    rawOrigin ||
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    ''
  ).trim();
  if (!raw) return 'https://spot-fitness-prod.vercel.app';
  const withProto = raw.startsWith('http://') || raw.startsWith('https://')
    ? raw
    : `https://${raw}`;
  return withProto.replace(/\/+$/, '');
}

function getVapidConfig(): VapidConfig | null {
  const publicKey = (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    ''
  ).trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (
    process.env.VAPID_SUBJECT || 'mailto:support@spotfitness.app'
  ).trim();

  if (!publicKey || !privateKey) {
    return null;
  }

  return { subject, publicKey, privateKey };
}

export function isWebPushConfigured(): boolean {
  return getVapidConfig() !== null;
}

export function getWebPushConfigErrorMessage(): string | null {
  const pub = (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
    process.env.VAPID_PUBLIC_KEY ||
    ''
  ).trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim();
  if (pub && priv) return null;
  if (!pub && !priv) {
    return 'משתני VAPID להתראות אייפון ודפדפנים (NEXT_PUBLIC_VAPID_PUBLIC_KEY ו-VAPID_PRIVATE_KEY) טרם הוגדרו ב-Vercel.';
  }
  return !pub
    ? 'חסר המפתח הציבורי NEXT_PUBLIC_VAPID_PUBLIC_KEY ב-Vercel.'
    : 'חסר המפתח הפרטי VAPID_PRIVATE_KEY ב-Vercel.';
}

export interface WebPushSendPayload {
  pushId: string;
  title: string;
  body: string;
  kind: 'ai-meal' | 'coach' | 'test';
  screen: 'meal' | 'journal' | 'metrics' | 'profile';
  mealSlotId?: string;
  date?: string;
  origin?: string;
}

export interface WebPushBatchResult {
  configured: boolean;
  sentCount: number;
  expiredEndpoints: string[];
  errors: string[];
}

function buildAbsoluteDeepLinkUrl(payload: WebPushSendPayload): {
  baseOrigin: string;
  navigateUrl: string;
} {
  const baseOrigin = normalizeOrigin(payload.origin);
  const url = new URL('/', baseOrigin);
  url.searchParams.set('spotPushId', payload.pushId);
  url.searchParams.set('spotKind', payload.kind);
  url.searchParams.set('spotScreen', payload.screen);
  if (payload.mealSlotId) url.searchParams.set('spotMealSlotId', payload.mealSlotId);
  if (payload.date) url.searchParams.set('spotDate', payload.date);
  return { baseOrigin, navigateUrl: url.toString() };
}

export async function sendWebPushToSubscriptions(
  subscriptions: TraineeWebPushSubscriptionEntry[],
  payload: WebPushSendPayload
): Promise<WebPushBatchResult> {
  const vapid = getVapidConfig();
  if (!vapid) {
    return {
      configured: false,
      sentCount: 0,
      expiredEndpoints: [],
      errors: ['VAPID keys are not configured'],
    };
  }

  const uniqueSubs = new Map<string, TraineeWebPushSubscriptionEntry>();
  for (const sub of subscriptions) {
    if (sub?.endpoint && sub?.keys?.p256dh && sub?.keys?.auth) {
      uniqueSubs.set(sub.endpoint, sub);
    }
  }
  if (uniqueSubs.size === 0) {
    return { configured: true, sentCount: 0, expiredEndpoints: [], errors: [] };
  }

  const { baseOrigin, navigateUrl } = buildAbsoluteDeepLinkUrl(payload);

  // תואם הן ל-Declarative Web Push ב-iOS 18.4+ (web_push: 8030) והן ל-Service Worker Fallback בדפדפנים ו-iOS 16.4-18.3
  const wirePayload = JSON.stringify({
    web_push: 8030,
    notification: {
      title: payload.title.slice(0, 120),
      body: payload.body.slice(0, 420),
      navigate: navigateUrl,
      icon: `${baseOrigin}/apple-touch-icon.png`,
      tag: payload.pushId,
      app_badge: 1,
    },
    spotData: {
      spotPushId: payload.pushId,
      spotKind: payload.kind,
      spotScreen: payload.screen,
      spotMealSlotId: payload.mealSlotId,
      spotDate: payload.date,
      url: navigateUrl,
    },
  });

  let sentCount = 0;
  const expiredEndpoints: string[] = [];
  const errors: string[] = [];

  await Promise.all(
    Array.from(uniqueSubs.values()).map(async (sub) => {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth,
            },
          },
          wirePayload,
          {
            TTL: 60 * 60 * 12,
            urgency: 'high',
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
          }
        );
        sentCount += 1;
      } catch (err) {
        const statusCode =
          typeof err === 'object' && err !== null && 'statusCode' in err
            ? Number((err as { statusCode?: number }).statusCode)
            : 0;
        const message =
          err instanceof Error ? err.message : 'Web Push delivery error';

        if (statusCode === 410 || statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          errors.push(
            statusCode ? `HTTP ${statusCode}: ${message}` : message
          );
        }
      }
    })
  );

  return {
    configured: true,
    sentCount,
    expiredEndpoints,
    errors,
  };
}
