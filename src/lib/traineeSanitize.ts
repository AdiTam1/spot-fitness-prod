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
        const { photoDataUrl, photoDataUrls, ...restPreset } = preset;
        // השמטת תמונות Base64 כבדות מרשימת הרוסטר (נשלפות לפי דרישה בכניסה למתאמן) תוך שמירת קישורי HTTPS קצרים
        const singleRemoteUrl = [photoDataUrl, ...(photoDataUrls || [])].find(
          (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())
        );
        return singleRemoteUrl
          ? { ...restPreset, photoDataUrl: singleRemoteUrl }
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
 * משמר תמונות savedMeals שכבר נטענו נקודתית עבור מתאמן בודד כאשר פולינג רקע מחזיר רשימת רוסטר רזה,
 * רק כל עוד אותו פריט (id + updatedAt) לא השתנה בשרת.
 */
export interface TraineeUpdateDeltaPayload {
  id: string;
  name?: string;
  goal?: string;
  currentWeight?: number;
  targetWeight?: number;
  logs?: TraineeProfile['logs'];
  weightHistory?: TraineeProfile['weightHistory'];
  measurementsHistory?: TraineeProfile['measurementsHistory'];
  weeklyCheckIns?: TraineeProfile['weeklyCheckIns'];
  onboarding?: TraineeProfile['onboarding'];
  favoriteFoodIds?: TraineeProfile['favoriteFoodIds'];
  mealCardShortcuts?: TraineeProfile['mealCardShortcuts'];
  savedMeals?: TraineeProfile['savedMeals'];
  customServingTools?: TraineeProfile['customServingTools'];
  customFoodUnits?: TraineeProfile['customFoodUnits'];
  recentContextChips?: TraineeProfile['recentContextChips'];
  recentLabelProducts?: TraineeProfile['recentLabelProducts'];
}

/**
 * בונה Payload רזה לשמירת עדכון מתאמן (שולח רק ימי logs שהשתנו ושדות שהשתנו בפועל)
 * כדי למנוע חריגת מגבלת 4.5MB ב-Vercel (HTTP 413) כשליומן היסטוריה ארוכה או תמונות ישנות.
 */
export function buildTraineeUpdateDeltaPayload(
  prev: TraineeProfile | undefined,
  next: TraineeProfile
): TraineeUpdateDeltaPayload {
  if (!prev) {
    return next;
  }

  const delta: TraineeUpdateDeltaPayload = {
    id: next.id,
    name: next.name,
    goal: next.goal,
    currentWeight: next.currentWeight,
    targetWeight: next.targetWeight,
  };

  const prevLogs = prev.logs || {};
  const nextLogs = next.logs || {};
  const changedLogs: TraineeProfile['logs'] = {};
  let hasChangedLogs = false;
  for (const [dateKey, dayVal] of Object.entries(nextLogs)) {
    if (prevLogs[dateKey] !== dayVal) {
      changedLogs[dateKey] = dayVal;
      hasChangedLogs = true;
    }
  }
  if (hasChangedLogs) {
    delta.logs = changedLogs;
  }

  if (next.weightHistory !== prev.weightHistory) delta.weightHistory = next.weightHistory;
  if (next.measurementsHistory !== prev.measurementsHistory) {
    delta.measurementsHistory = next.measurementsHistory;
  }
  if (next.weeklyCheckIns !== prev.weeklyCheckIns) delta.weeklyCheckIns = next.weeklyCheckIns;
  if (next.onboarding !== prev.onboarding) delta.onboarding = next.onboarding;
  if (next.favoriteFoodIds !== prev.favoriteFoodIds) delta.favoriteFoodIds = next.favoriteFoodIds;
  if (next.mealCardShortcuts !== prev.mealCardShortcuts) {
    delta.mealCardShortcuts = next.mealCardShortcuts;
  }
  if (next.savedMeals !== prev.savedMeals) delta.savedMeals = next.savedMeals;
  if (next.customServingTools !== prev.customServingTools) {
    delta.customServingTools = next.customServingTools;
  }
  if (next.customFoodUnits !== prev.customFoodUnits) delta.customFoodUnits = next.customFoodUnits;
  if (next.recentContextChips !== prev.recentContextChips) {
    delta.recentContextChips = next.recentContextChips;
  }
  if (next.recentLabelProducts !== prev.recentLabelProducts) {
    delta.recentLabelProducts = next.recentLabelProducts;
  }

  return delta;
}

export function mergeHydratedTraineeFieldsForRoster(
  rosterTrainees: TraineeProfile[],
  prevTrainees: TraineeProfile[]
): TraineeProfile[] {
  if (!Array.isArray(prevTrainees) || prevTrainees.length === 0) {
    return rosterTrainees;
  }
  const prevById = new Map(prevTrainees.map((t) => [t.id, t]));
  return rosterTrainees.map((incoming) => {
    const prev = prevById.get(incoming.id);
    if (!prev || !Array.isArray(incoming.savedMeals) || !Array.isArray(prev.savedMeals)) {
      return incoming;
    }
    const prevMealById = new Map(prev.savedMeals.map((m) => [m.id, m]));
    let anyRestored = false;
    const mergedSavedMeals = incoming.savedMeals.map((meal) => {
      if (meal.photoDataUrl || (meal.photoDataUrls && meal.photoDataUrls.length > 0)) {
        return meal;
      }
      const prevMeal = prevMealById.get(meal.id);
      if (
        prevMeal &&
        prevMeal.updatedAt === meal.updatedAt &&
        (prevMeal.photoDataUrl || (prevMeal.photoDataUrls && prevMeal.photoDataUrls.length > 0))
      ) {
        anyRestored = true;
        return {
          ...meal,
          ...(prevMeal.photoDataUrl ? { photoDataUrl: prevMeal.photoDataUrl } : {}),
          ...(prevMeal.photoDataUrls ? { photoDataUrls: prevMeal.photoDataUrls } : {}),
        };
      }
      return meal;
    });
    return anyRestored ? { ...incoming, savedMeals: mergedSavedMeals } : incoming;
  });
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

export interface OlderLogsInfo {
  hasOlderLogs: boolean;
  olderLogsCount: number;
  cutoffDateIso: string;
}

/**
 * חותך יומני מתאמן לטווח ימים אחרונים בלבד לפתיחה מהירה, תוך שמירה של ימים מוגנים (היום/משימות AI פתוחות/תאריך נבחר)
 * וללא מוטציה על אובייקט המקור.
 */
export function trimTraineeLogsToWindow(
  trainee: TraineeProfile,
  cutoffDateIso: string,
  preserveDates: string[] = []
): { trainee: TraineeProfile; olderLogsInfo: OlderLogsInfo } {
  const rawLogs = trainee.logs || {};
  const preserveSet = new Set(preserveDates.filter(Boolean));
  const windowedLogs: TraineeProfile['logs'] = {};
  let olderLogsCount = 0;

  for (const [dateKey, dayLog] of Object.entries(rawLogs)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      windowedLogs[dateKey] = dayLog;
      continue;
    }
    if (dateKey >= cutoffDateIso || preserveSet.has(dateKey)) {
      windowedLogs[dateKey] = dayLog;
    } else {
      olderLogsCount += 1;
    }
  }

  return {
    trainee:
      olderLogsCount > 0
        ? { ...trainee, logs: windowedLogs }
        : trainee,
    olderLogsInfo: {
      hasOlderLogs: olderLogsCount > 0,
      olderLogsCount,
      cutoffDateIso,
    },
  };
}
