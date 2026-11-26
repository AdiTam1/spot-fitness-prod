import {
  MealCardShortcutId,
  TraineeActiveDateRange,
  TraineeMetricSchedule,
  TraineeMetricScheduleMode,
  TraineeMetricsScheduleConfig,
  TraineeProfile,
} from '@/types/nutrition';

export const HEBREW_WEEKDAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const HEBREW_MONTH_NAMES = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

export const DEFAULT_MEAL_CARD_SHORTCUTS: MealCardShortcutId[] = [
  'ai-recommend',
  'saved-meals',
];

export const ALL_MEAL_SHORTCUT_OPTIONS: Array<{
  id: MealCardShortcutId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'ai-recommend',
    label: 'מה לאכול?',
    shortLabel: 'מה לאכול?',
    description: 'המלצת AI חכמה להשלמת מאקרו + אופציות המאמן',
  },
  {
    id: 'saved-meals',
    label: 'ארוחות שמורות',
    shortLabel: 'שמורות',
    description: 'פתיחה מהירה של הארוחות השמורות והיסטוריית הארוחות',
  },
  {
    id: 'ai-photo',
    label: 'צילום AI',
    shortLabel: 'צילום AI',
    description: 'צילום ישיר של הצלחת או טבלת הערכים התזונתיים',
  },
  {
    id: 'ai-text',
    label: 'תיאור חופשי / קול ל-AI',
    shortLabel: 'טקסט / קול',
    description: 'הכתבה קולית או תיאור מילולי של הארוחה',
  },
  {
    id: 'barcode',
    label: 'סריקת ברקוד',
    shortLabel: 'ברקוד',
    description: 'פתיחה מהירה של סורק הברקוד למוצרים ארוזים',
  },
  {
    id: 'favorites',
    label: 'מועדפים והיסטוריה',
    shortLabel: 'מועדפים',
    description: 'פתיחה מהירה של מאגר המוצרים על לשונית המועדפים וההיסטוריה',
  },
];

/**
 * חישוב גיל אוטומטי ועדכני מתאריך לידה (YYYY-MM-DD), עם גיבוי לגיל מספרי היסטורי.
 */
export function computeAgeFromBirthDate(
  birthDate?: string,
  fallbackAge?: number
): number {
  if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate.trim())) {
    const [y, m, d] = birthDate.trim().split('-').map(Number);
    const now = new Date();
    let age = now.getFullYear() - y;
    const monthDiff = now.getMonth() + 1 - m;
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) {
      age -= 1;
    }
    if (Number.isFinite(age) && age >= 10 && age <= 110) {
      return age;
    }
  }
  if (typeof fallbackAge === 'number' && Number.isFinite(fallbackAge) && fallbackAge >= 10) {
    return Math.round(fallbackAge);
  }
  return 28;
}

export function formatLocalIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function addDaysIso(baseIso: string, deltaDays: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return formatLocalIso(d);
}

export function diffDaysIso(targetIso: string, baseIso: string): number {
  const t = Date.parse(`${targetIso}T12:00:00`);
  const b = Date.parse(`${baseIso}T12:00:00`);
  if (!Number.isFinite(t) || !Number.isFinite(b)) return 0;
  return Math.round((t - b) / 86400000);
}

/**
 * מחזיר 7 ימי שבוע (א'-ש') סביב התאריך הנתון.
 */
export function getWeekDaysAroundDate(anchorIso: string, todayIso: string) {
  const anchor = new Date(`${anchorIso}T12:00:00`);
  const dayOfWeek = anchor.getDay();
  const result: Array<{
    iso: string;
    dayLetter: string;
    dayNumber: number;
    isToday: boolean;
  }> = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() - dayOfWeek + i);
    const iso = formatLocalIso(d);
    result.push({
      iso,
      dayLetter: HEBREW_WEEKDAY_LETTERS[i],
      dayNumber: d.getDate(),
      isToday: iso === todayIso,
    });
  }
  return result;
}

export function getResolvedTraineeDateRange(
  trainee: Pick<TraineeProfile, 'activeDateRange'>,
  todayIso: string
): { minIso: string; maxIso: string; pastDays: number; futureDays: number } {
  const range: TraineeActiveDateRange = trainee.activeDateRange || {};
  const pastDays = Math.max(
    0,
    Math.min(365, Math.round(Number(range.pastDays ?? 1) || 0))
  );
  const futureDays = Math.max(
    0,
    Math.min(180, Math.round(Number(range.futureDays ?? 0) || 0))
  );
  const minIso =
    range.startDate && /^\d{4}-\d{2}-\d{2}$/.test(range.startDate)
      ? range.startDate
      : addDaysIso(todayIso, -pastDays);
  const maxIso =
    range.endDate && /^\d{4}-\d{2}-\d{2}$/.test(range.endDate)
      ? range.endDate
      : addDaysIso(todayIso, futureDays);

  return {
    minIso: minIso <= todayIso ? minIso : todayIso,
    maxIso: maxIso >= todayIso ? maxIso : todayIso,
    pastDays,
    futureDays,
  };
}

/**
 * בודק האם תאריך פעיל לניווט עבור המתאמן: בתוך הטווח שהמאמן הגדיר, היום עצמו, יום תשקיף מוגדר או תאריך עם רישום קיים.
 */
export function isDayBlockedForTrainee(
  iso: string,
  trainee: Pick<TraineeProfile, 'blockedDates'>
): boolean {
  if (!iso) return false;
  return (trainee.blockedDates || []).includes(iso);
}

export function isObservationDateForTrainee(
  iso: string,
  trainee: Pick<TraineeProfile, 'observationDates' | 'logs'>
): boolean {
  if (!iso) return false;
  if ((trainee.observationDates || []).includes(iso)) return true;
  return Boolean(trainee.logs?.[iso]?.isObservationDay);
}

export function isTodayObservationRestricted(
  trainee: Pick<
    TraineeProfile,
    'restrictToObservationDaysWhenTodayIsObservation' | 'observationDates' | 'logs'
  >,
  todayIso: string
): boolean {
  return Boolean(
    trainee.restrictToObservationDaysWhenTodayIsObservation &&
      isObservationDateForTrainee(todayIso, trainee)
  );
}

export function isDateActiveForTrainee(
  iso: string,
  trainee: Pick<
    TraineeProfile,
    | 'activeDateRange'
    | 'observationDates'
    | 'logs'
    | 'restrictToObservationDaysWhenTodayIsObservation'
  >,
  todayIso: string
): boolean {
  if (!iso) return false;
  if (isTodayObservationRestricted(trainee, todayIso)) {
    return isObservationDateForTrainee(iso, trainee);
  }
  if (iso === todayIso) return true;
  if ((trainee.observationDates || []).includes(iso)) return true;
  const dayLog = trainee.logs?.[iso];
  if (
    dayLog &&
    (Object.keys(dayLog.meals || {}).length > 0 ||
      Boolean(dayLog.isObservationDay))
  ) {
    return true;
  }
  const { minIso, maxIso } = getResolvedTraineeDateRange(trainee, todayIso);
  return iso >= minIso && iso <= maxIso;
}

export type TraineeMetricScheduleKey = 'weeklyCheckIn' | 'weight' | 'measurements';

export const DEFAULT_METRICS_SCHEDULE: Record<TraineeMetricScheduleKey, TraineeMetricSchedule> = {
  weeklyCheckIn: { mode: 'hidden' },
  weight: { mode: 'interval', everyDays: 1 },
  measurements: { mode: 'interval', everyDays: 1 },
};

export function sanitizeMetricSchedule(
  raw: unknown,
  fallback: TraineeMetricSchedule
): TraineeMetricSchedule {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const obj = raw as Partial<TraineeMetricSchedule>;
  const mode: TraineeMetricScheduleMode =
    obj.mode === 'hidden' || obj.mode === 'interval' || obj.mode === 'weekdays'
      ? obj.mode
      : fallback.mode;

  if (mode === 'hidden') {
    return { mode: 'hidden' };
  }

  if (mode === 'weekdays') {
    const cleanDays = Array.isArray(obj.weekdays)
      ? Array.from(
          new Set(
            obj.weekdays
              .map((d) => Math.round(Number(d)))
              .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          )
        ).sort((a, b) => a - b)
      : [...(fallback.weekdays || [5])];
    return {
      mode: 'weekdays',
      weekdays: cleanDays,
    };
  }

  const everyDays = Math.max(
    1,
    Math.min(90, Math.round(Number(obj.everyDays ?? fallback.everyDays ?? 1) || 1))
  );
  const startDate =
    typeof obj.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.startDate.trim())
      ? obj.startDate.trim()
      : undefined;
  return {
    mode: 'interval',
    everyDays,
    ...(startDate ? { startDate } : {}),
  };
}

export function sanitizeMetricsScheduleConfig(
  raw: unknown,
  base?: TraineeMetricsScheduleConfig
): TraineeMetricsScheduleConfig | undefined {
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Partial<TraineeMetricsScheduleConfig>;
  return {
    weeklyCheckIn:
      obj.weeklyCheckIn !== undefined
        ? sanitizeMetricSchedule(obj.weeklyCheckIn, DEFAULT_METRICS_SCHEDULE.weeklyCheckIn)
        : base?.weeklyCheckIn
        ? sanitizeMetricSchedule(base.weeklyCheckIn, DEFAULT_METRICS_SCHEDULE.weeklyCheckIn)
        : DEFAULT_METRICS_SCHEDULE.weeklyCheckIn,
    weight:
      obj.weight !== undefined
        ? sanitizeMetricSchedule(obj.weight, DEFAULT_METRICS_SCHEDULE.weight)
        : base?.weight
        ? sanitizeMetricSchedule(base.weight, DEFAULT_METRICS_SCHEDULE.weight)
        : DEFAULT_METRICS_SCHEDULE.weight,
    measurements:
      obj.measurements !== undefined
        ? sanitizeMetricSchedule(obj.measurements, DEFAULT_METRICS_SCHEDULE.measurements)
        : base?.measurements
        ? sanitizeMetricSchedule(base.measurements, DEFAULT_METRICS_SCHEDULE.measurements)
        : DEFAULT_METRICS_SCHEDULE.measurements,
  };
}

export function getResolvedMetricSchedule(
  trainee: Pick<TraineeProfile, 'metricsSchedule'>,
  key: TraineeMetricScheduleKey
): TraineeMetricSchedule {
  return sanitizeMetricSchedule(
    trainee.metricsSchedule?.[key],
    DEFAULT_METRICS_SCHEDULE[key]
  );
}

export function isMetricScheduledForDate(
  trainee: Pick<TraineeProfile, 'metricsSchedule'>,
  key: TraineeMetricScheduleKey,
  targetIso: string
): boolean {
  if (!targetIso || !/^\d{4}-\d{2}-\d{2}$/.test(targetIso)) return false;
  const sched = getResolvedMetricSchedule(trainee, key);
  if (sched.mode === 'hidden') return false;
  if (sched.mode === 'weekdays') {
    const [y, m, d] = targetIso.split('-').map(Number);
    const dow = new Date(y, m - 1, d, 12, 0, 0).getDay();
    return Boolean(sched.weekdays?.length && sched.weekdays.includes(dow));
  }
  const every = Math.max(1, Math.min(90, Math.round(Number(sched.everyDays) || 1)));
  if (sched.startDate && /^\d{4}-\d{2}-\d{2}$/.test(sched.startDate)) {
    const diff = diffDaysIso(targetIso, sched.startDate);
    if (diff < 0) return false;
    return diff % every === 0;
  }
  if (every === 1) return true;
  const diff = diffDaysIso(targetIso, '2026-01-01');
  return ((diff % every) + every) % every === 0;
}

export function formatMetricScheduleSummary(
  sched: TraineeMetricSchedule,
  todayIso?: string
): string {
  if (sched.mode === 'hidden') return 'מוסתר מהמתאמן';
  if (sched.mode === 'weekdays') {
    const days = sched.weekdays || [];
    if (days.length === 0) return 'מוסתר (לא נבחרו ימים)';
    if (days.length === 7) return 'פתוח כל יום';
    return `בימי ${days.map((d) => HEBREW_WEEKDAY_LETTERS[d] || '').join(', ')}`;
  }
  const every = Math.max(1, Math.round(Number(sched.everyDays) || 1));
  if (every === 1) {
    if (sched.startDate && todayIso && sched.startDate > todayIso) {
      return `כל יום החל מ-${sched.startDate}`;
    }
    return 'כל יום';
  }
  return `כל ${every} ימים${sched.startDate ? ` (מ-${sched.startDate})` : ''}`;
}

/**
 * יצירת תמונת Thumbnail קלה בפורמט WebP עד ~120KB בצד הלקוח לצורך הצגה עקבית בארוחה ובבאנר ה-AI.
 */
export function compressDataUrlToThumbnail(
  dataUrl: string,
  maxEdge = 640,
  maxChars = 155000
): Promise<string> {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    !dataUrl.startsWith('data:image/')
  ) {
    return Promise.resolve(dataUrl);
  }
  if (dataUrl.length <= maxChars) {
    return Promise.resolve(dataUrl);
  }
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(120, Math.round(img.width * ratio));
        const h = Math.max(120, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        // Safari/iOS WebView falls back to uncompressed PNG when image/webp is unsupported,
        // so detect actual encoded mime and progressively step down quality and dimensions if over maxChars.
        const testWebp = canvas.toDataURL('image/webp', 0.72);
        const targetMime = testWebp.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
        let curW = w;
        let curH = h;
        let bestOut = testWebp;
        for (const scale of [1, 0.78, 0.6, 0.45]) {
          if (scale < 1) {
            curW = Math.max(96, Math.round(w * scale));
            curH = Math.max(96, Math.round(h * scale));
            canvas.width = curW;
            canvas.height = curH;
            ctx.drawImage(img, 0, 0, curW, curH);
          }
          for (const q of [0.72, 0.58, 0.44, 0.34]) {
            const out = scale === 1 && targetMime === 'image/webp' && q === 0.72
              ? testWebp
              : canvas.toDataURL(targetMime, q);
            if (out) {
              bestOut = out;
              if (out.length <= maxChars) {
                resolve(out);
                return;
              }
            }
          }
        }
        resolve(bestOut);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
