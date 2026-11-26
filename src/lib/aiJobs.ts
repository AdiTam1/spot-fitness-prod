import { PendingAiMealJob } from '@/types/nutrition';

/** משך הזמן המקסימלי שמשימת AI ברקע יכולה להישאר בסטטוס processing בשרת (מעבר לזמן זה השרת ב-Vercel ממילא נחתך) */
export const AI_JOB_STALE_TIMEOUT_MS = 5 * 60 * 1000 + 30 * 1000; // 5.5 דקות

/** משימת processing יתומה שמתה לפני מעל 60 דקות מוסרת לחלוטין כדי לא להעלות שגיאות ישנות בדיעבד */
export const AI_JOB_AUTO_ARCHIVE_MS = 60 * 60 * 1000; // שעה אחת

export function getAiJobAgeMs(job: PendingAiMealJob, nowMs = Date.now()): number {
  const startedMs = Date.parse(job.startedAt);
  if (!Number.isFinite(startedMs)) return AI_JOB_AUTO_ARCHIVE_MS + 1;
  return Math.max(0, nowMs - startedMs);
}

export function normalizePendingAiJobs(
  jobs?: PendingAiMealJob[],
  nowMs = Date.now()
): { jobs: PendingAiMealJob[]; changed: boolean } {
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return { jobs: [], changed: false };
  }

  let changed = false;
  const normalized: PendingAiMealJob[] = [];

  for (const job of jobs) {
    if (!job || typeof job !== 'object') {
      changed = true;
      continue;
    }

    if (job.status === 'awaiting_clarification') {
      const ageMs = getAiJobAgeMs(job, nowMs);
      if (ageMs > 24 * 60 * 60 * 1000) {
        changed = true;
        continue;
      }
      normalized.push(job);
      continue;
    }

    if (job.status === 'processing') {
      const ageMs = getAiJobAgeMs(job, nowMs);
      if (ageMs > AI_JOB_AUTO_ARCHIVE_MS) {
        changed = true;
        continue;
      }
      if (ageMs > AI_JOB_STALE_TIMEOUT_MS) {
        changed = true;
        const startedMs = Date.parse(job.startedAt);
        const timeoutAtIso = Number.isFinite(startedMs)
          ? new Date(startedMs + AI_JOB_STALE_TIMEOUT_MS).toISOString()
          : new Date(nowMs).toISOString();
        normalized.push({
          ...job,
          status: 'failed',
          completedAt: job.completedAt || timeoutAtIso,
          stageText: 'הפענוח הופסק (חרג מזמן השרת)',
          errorMsg:
            job.errorMsg ||
            'הפענוח חרג מזמן ההמתנה המרבי של השרת (5 דק׳) או שהחיבור נקטע — ניתן לסגור ולנסות שוב.',
        });
        continue;
      }
    }

    normalized.push(job);
  }

  return { jobs: normalized, changed };
}

export function isAiJobActivelyProcessing(
  job: PendingAiMealJob,
  nowMs = Date.now()
): boolean {
  if (job.status !== 'processing') return false;
  return getAiJobAgeMs(job, nowMs) <= AI_JOB_STALE_TIMEOUT_MS;
}

export function isAiJobAwaitingClarification(job: PendingAiMealJob): boolean {
  return job.status === 'awaiting_clarification' && !job.acknowledged;
}
