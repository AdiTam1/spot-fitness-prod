import type {
  TraineeFcmTokenEntry,
  TraineeProfile,
  TraineeWebPushSubscriptionEntry,
} from '../types/nutrition';
import { normalizePendingAiJobs } from './aiJobs';

export function redactFcmTokens(
  tokens?: TraineeFcmTokenEntry[]
): TraineeFcmTokenEntry[] {
  return (tokens || []).map((entry) => ({
    ...entry,
    token: entry.token ? `fcm_${entry.token.slice(-6)}` : '',
  }));
}

export function redactWebPushSubscriptions(
  subs?: TraineeWebPushSubscriptionEntry[]
): TraineeWebPushSubscriptionEntry[] {
  return (subs || []).map((sub, idx) => ({
    ...sub,
    endpoint: `webpush_${idx}_${sub.endpoint ? sub.endpoint.slice(-8) : ''}`,
    keys: { p256dh: '', auth: '' },
  }));
}

export function sanitizeTraineeForClient(
  trainee: TraineeProfile
): TraineeProfile {
  return {
    ...trainee,
    password: '',
    pendingAiJobs: normalizePendingAiJobs(trainee.pendingAiJobs).jobs,
    fcmTokens: redactFcmTokens(trainee.fcmTokens),
    webPushSubscriptions: redactWebPushSubscriptions(
      trainee.webPushSubscriptions
    ),
  };
}

/**
 * גרסה קלת-משקל לדאשבורד מאמן/מנהל: שומרת את כל מדדי התזונה, הפריטים, התפריטים והפעילות,
 * ומשמיטה Base64 כבדים (photoStore, photoDataUrls, history, retryPayload) שאינם בשימוש בטבלת הרוסטר.
 * כשמאמן נכנס ל-Preview על מתאמן מסוים נטען המתאמן המלא ישירות עם ?traineeId=...
 */
export function sanitizeTraineeForRosterList(
  trainee: TraineeProfile
): TraineeProfile {
  const base = sanitizeTraineeForClient(trainee);
  const rawLogs = base.logs || {};
  const slimLogs: TraineeProfile['logs'] = {};

  for (const [dateKey, dayLog] of Object.entries(rawLogs)) {
    if (!dayLog || typeof dayLog !== 'object') continue;
    const rawMeals = dayLog.meals || {};
    const slimMeals: typeof rawMeals = {};
    for (const [slotId, meal] of Object.entries(rawMeals)) {
      if (!meal || typeof meal !== 'object') continue;
      const {
        photoDataUrl: _photoDataUrl,
        photoDataUrls: _photoDataUrls,
        photoMetas: _photoMetas,
        photoStore: _photoStore,
        history: _history,
        ...restMeal
      } = meal;
      slimMeals[slotId] = restMeal;
    }
    slimLogs[dateKey] = {
      ...dayLog,
      meals: slimMeals,
    };
  }

  const slimSavedMeals = Array.isArray(base.savedMeals)
    ? base.savedMeals.map((preset) => {
        if (!preset || typeof preset !== 'object') return preset;
        const { photoDataUrls, ...restPreset } = preset;
        const singleThumb = restPreset.photoDataUrl || photoDataUrls?.[0];
        return singleThumb
          ? { ...restPreset, photoDataUrl: singleThumb }
          : restPreset;
      })
    : base.savedMeals;

  const slimPendingJobs = Array.isArray(base.pendingAiJobs)
    ? base.pendingAiJobs.map((job) => {
        if (!job || typeof job !== 'object') return job;
        const {
          photoDataUrls: _jobPhotos,
          retryPayload: _retryPayload,
          ...restJob
        } = job;
        return restJob;
      })
    : base.pendingAiJobs;

  return {
    ...base,
    logs: slimLogs,
    savedMeals: slimSavedMeals,
    pendingAiJobs: slimPendingJobs,
  };
}

/**
 * סידרה דטרמיניסטית של מזהים וחותמות זמן לבדיקת ?since= ללא סריקת תוכן.
 * מחזירה null אם קיימת שורה חסרת id או updated_at כדי להבטיח טעינה מלאה בטוחה.
 */
export function serializeSyncTimestampRows(rows: unknown): string | null {
  if (!Array.isArray(rows)) return null;
  const items: string[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as { id?: unknown; updated_at?: unknown };
    const id = String(rec.id || '').trim();
    const upd =
      typeof rec.updated_at === 'string' ? rec.updated_at.trim() : '';
    if (!id || !upd) return null;
    items.push(`${id}:${upd}`);
  }
  items.sort();
  return items.join(',');
}
