import { TraineeProfile } from '@/types/nutrition';
import {
  getFcmConfigErrorMessage,
  isFcmConfigured,
  sendFcmNotificationToTokens,
} from '@/lib/fcmServer';
import {
  getWebPushConfigErrorMessage,
  isWebPushConfigured,
  sendWebPushToSubscriptions,
} from '@/lib/webPushServer';

export interface UnifiedPushMessage {
  pushId: string;
  title: string;
  body: string;
  kind: 'ai-meal' | 'coach' | 'test';
  screen: 'meal' | 'journal' | 'metrics' | 'profile';
  mealSlotId?: string;
  date?: string;
  origin?: string;
}

export interface UnifiedPushResult {
  sentCount: number;
  androidSentCount: number;
  webSentCount: number;
  invalidFcmTokens: string[];
  expiredWebEndpoints: string[];
  errors: string[];
  configError?: string;
}

export function hasAnyRegisteredPushTarget(trainee: TraineeProfile): boolean {
  return (
    (trainee.fcmTokens?.length || 0) > 0 ||
    (trainee.webPushSubscriptions?.length || 0) > 0
  );
}

/**
 * מאשר שליחת פוש AI אוטומטי רק אם המתאמן רשום באנדרואיד או ב-Web/iOS,
 * לא כיבה פוש AI בהגדרות, ואינו פעיל כעת בחזית האפליקציה.
 */
export function shouldNotifyUnifiedAiCompletion(
  trainee: TraineeProfile
): boolean {
  if (!hasAnyRegisteredPushTarget(trainee)) return false;
  if (trainee.pushPreferences?.aiMealReady === false) return false;

  const fg = trainee.lastForegroundState;
  if (!fg) return true;
  if (!fg.isInForeground) return true;

  const updatedMs = Date.parse(fg.updatedAt || '');
  if (!Number.isFinite(updatedMs)) return true;

  return Date.now() - updatedMs > 40_000;
}

export async function sendUnifiedPushToTrainee(
  trainee: TraineeProfile,
  message: UnifiedPushMessage
): Promise<UnifiedPushResult> {
  const fcmTokens = (trainee.fcmTokens || []).map((t) => t.token).filter(Boolean);
  const webSubs = trainee.webPushSubscriptions || [];

  const fcmReady = isFcmConfigured();
  const webReady = isWebPushConfigured();

  const channelId =
    message.kind === 'ai-meal' ? 'spot_ai_meals' : 'spot_coach_alerts';

  const [fcmRes, webRes] = await Promise.all([
    fcmTokens.length > 0 && fcmReady
      ? sendFcmNotificationToTokens(fcmTokens, {
          title: message.title,
          body: message.body,
          channelId,
          data: {
            spotPushId: message.pushId,
            spotKind: message.kind,
            spotScreen: message.screen,
            spotMealSlotId: message.mealSlotId,
            spotDate: message.date,
          },
        })
      : Promise.resolve(null),
    webSubs.length > 0 && webReady
      ? sendWebPushToSubscriptions(webSubs, {
          pushId: message.pushId,
          title: message.title,
          body: message.body,
          kind: message.kind,
          screen: message.screen,
          mealSlotId: message.mealSlotId,
          date: message.date,
          origin: message.origin,
        })
      : Promise.resolve(null),
  ]);

  const androidSentCount = fcmRes?.sentCount || 0;
  const webSentCount = webRes?.sentCount || 0;
  const sentCount = androidSentCount + webSentCount;

  const missingMessages: string[] = [];
  if (fcmTokens.length > 0 && !fcmReady) {
    const err = getFcmConfigErrorMessage();
    if (err) missingMessages.push(err);
  }
  if (webSubs.length > 0 && !webReady) {
    const err = getWebPushConfigErrorMessage();
    if (err) missingMessages.push(err);
  }

  return {
    sentCount,
    androidSentCount,
    webSentCount,
    invalidFcmTokens: fcmRes?.invalidTokens || [],
    expiredWebEndpoints: webRes?.expiredEndpoints || [],
    errors: [...(fcmRes?.errors || []), ...(webRes?.errors || [])],
    configError:
      sentCount === 0 && missingMessages.length > 0
        ? missingMessages.join(' ')
        : undefined,
  };
}

export function stripDeadPushTargetsFromTrainee(
  trainee: TraineeProfile,
  deadFcmTokens: string[],
  deadWebEndpoints: string[]
): TraineeProfile {
  if (deadFcmTokens.length === 0 && deadWebEndpoints.length === 0) {
    return trainee;
  }
  const deadFcmSet = new Set(deadFcmTokens);
  const deadWebSet = new Set(deadWebEndpoints);

  return {
    ...trainee,
    fcmTokens: (trainee.fcmTokens || []).filter((x) => !deadFcmSet.has(x.token)),
    webPushSubscriptions: (trainee.webPushSubscriptions || []).filter(
      (x) => !deadWebSet.has(x.endpoint)
    ),
  };
}
