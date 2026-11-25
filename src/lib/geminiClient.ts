import { GenerationConfig, GoogleGenerativeAI } from '@google/generative-ai';

/**
 * מודלים פעילים ב-Free Tier של Google AI Studio (נובמבר 2026) מדור 3.x עם רשת ביטחון יציבה של דור 2.5:
 * - gemini-3.8-flash: דגם ה-Vision המדויק ביותר לזיהוי תמונות ומדידות (עם thinkingLevel: 'low' למהירות גבוהה)
 * - gemini-3.6-flash: דגם Flash רב-תכליתי בחינם
 * - gemini-3.5-flash-lite / gemini-3.1-flash-lite: דגמי Lite מהירים עם מכסת Free Tier גבוהה
 * - gemini-2.5-flash / gemini-2.5-flash-lite: אשכול יציב ונפרד בעומסים כבדים ב-3.x (503/429)
 */
export const GEMINI_VISION_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
] as const;

export const GEMINI_TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
] as const;

export type GeminiContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

export function cleanGeminiKey(raw?: string): string {
  return (raw || '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/[\r\n]+/g, '')
    .trim();
}

export function safeParseGeminiJson(rawText: string): Record<string, unknown> {
  const cleaned = rawText
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice) as Record<string, unknown>;
}

export interface GeminiAttemptMeta {
  isRetry?: boolean;
  reasonLabel?: string;
}

export interface CallGeminiOptions {
  perAttemptTimeoutMs?: number;
  fallbackAttemptTimeoutMs?: number;
  totalBudgetMs?: number;
  onAttemptModel?: (
    modelName: string,
    attemptIdx: number,
    meta?: GeminiAttemptMeta
  ) => Promise<void> | void;
  shouldCancel?: () => Promise<boolean> | boolean;
}

type GeminiErrorKind =
  | 'auth'
  | 'not_found'
  | 'config_arg'
  | 'daily_quota'
  | 'rate_limit'
  | 'overload_503'
  | 'timeout'
  | 'json_parse'
  | 'other';

interface ModelCooldownEntry {
  until: number;
  reason: string;
}

const globalForGeminiHealth = globalThis as typeof globalThis & {
  __spotGeminiCooldowns?: Map<string, ModelCooldownEntry>;
};

function getModelCooldownMap(): Map<string, ModelCooldownEntry> {
  if (!globalForGeminiHealth.__spotGeminiCooldowns) {
    globalForGeminiHealth.__spotGeminiCooldowns = new Map();
  }
  return globalForGeminiHealth.__spotGeminiCooldowns;
}

function classifyGeminiError(
  rawMsg: string,
  wasAborted: boolean,
  isSyntaxError: boolean
): GeminiErrorKind {
  if (wasAborted) return 'timeout';
  if (isSyntaxError) return 'json_parse';
  const low = rawMsg.toLowerCase();

  if (
    low.includes('401') ||
    low.includes('403') ||
    low.includes('api_key_invalid') ||
    low.includes('api key not valid') ||
    low.includes('permission_denied')
  ) {
    return 'auth';
  }
  if (
    low.includes('404') ||
    (low.includes('not found') && low.includes('model')) ||
    low.includes('is not supported for generatecontent')
  ) {
    return 'not_found';
  }
  if (
    low.includes('400') &&
    (low.includes('responsemimetype') ||
      low.includes('thinkingconfig') ||
      low.includes('generationconfig') ||
      low.includes('invalid_argument'))
  ) {
    return 'config_arg';
  }
  if (
    (low.includes('429') || low.includes('resource_exhausted') || low.includes('quota')) &&
    (low.includes('perday') ||
      low.includes('per_day') ||
      low.includes('daily') ||
      low.includes('requestsperday'))
  ) {
    return 'daily_quota';
  }
  if (
    low.includes('429') ||
    low.includes('resource_exhausted') ||
    low.includes('rate limit') ||
    low.includes('too many requests') ||
    low.includes('quota')
  ) {
    return 'rate_limit';
  }
  if (
    low.includes('503') ||
    low.includes('service unavailable') ||
    low.includes('high demand') ||
    low.includes('overloaded') ||
    low.includes('unavailable') ||
    low.includes('500') ||
    low.includes('502') ||
    low.includes('504') ||
    low.includes('fetch failed') ||
    low.includes('econnreset') ||
    low.includes('etimedout') ||
    low.includes('network')
  ) {
    return 'overload_503';
  }
  return 'other';
}

function compactModelErrorTag(kind: GeminiErrorKind, rawMsg: string): string {
  switch (kind) {
    case 'auth':
      return '401/403 Auth';
    case 'not_found':
      return '404 NotFound';
    case 'daily_quota':
      return '429 DailyQuota';
    case 'rate_limit':
      return '429 RateLimit';
    case 'overload_503':
      return /high demand|503|unavailable|overloaded/i.test(rawMsg)
        ? '503 HighDemand'
        : '5xx/Net';
    case 'timeout':
      return rawMsg;
    case 'json_parse':
      return 'BadJSON';
    case 'config_arg':
      return '400 Config';
    default:
      return rawMsg.slice(0, 60);
  }
}

function orderModelsByHealth(models: readonly string[]): string[] {
  const map = getModelCooldownMap();
  const now = Date.now();
  const healthy: string[] = [];
  const cooled: Array<{ model: string; until: number; idx: number }> = [];

  models.forEach((m, idx) => {
    const entry = map.get(m);
    if (!entry || entry.until <= now) {
      if (entry) map.delete(m);
      healthy.push(m);
    } else {
      cooled.push({ model: m, until: entry.until, idx });
    }
  });

  cooled.sort((a, b) => a.until - b.until || a.idx - b.idx);
  return [...healthy, ...cooled.map((c) => c.model)];
}

function recordModelCooldown(modelName: string, kind: GeminiErrorKind): void {
  const map = getModelCooldownMap();
  const now = Date.now();
  if (kind === 'not_found') {
    map.set(modelName, { until: now + 10 * 60_000, reason: kind });
  } else if (kind === 'daily_quota') {
    map.set(modelName, { until: now + 4 * 60_000, reason: kind });
  } else if (kind === 'rate_limit') {
    map.set(modelName, { until: now + 30_000, reason: kind });
  } else if (kind === 'overload_503' || kind === 'timeout') {
    map.set(modelName, { until: now + 45_000, reason: kind });
  }
}

async function cancelAwareSleep(
  ms: number,
  shouldCancel?: () => Promise<boolean> | boolean
): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (shouldCancel && (await shouldCancel())) return true;
    const chunk = Math.min(250, Math.max(0, end - Date.now()));
    if (chunk > 0) {
      await new Promise((r) => setTimeout(r, chunk));
    }
  }
  return Boolean(shouldCancel && (await shouldCancel()));
}

/**
 * קריאה חסינה למודלי Gemini ב-Free Tier:
 * 1. מיון דינמי לפי בריאות (מדלג מיידית על מודל שסובל כרגע מ-503/429 לתחילת התור, אך שומר אותו לגיבוי אחרון).
 * 2. ניסיון חוזר מהיר עם Jitter על אותו מודל בשגיאות עומס רגעיות של Google (כגון 503 High Demand) אם ענה מהר.
 * 3. מעבר מדורג לכל שאר המודלים — כולל גיבוי לדור 2.5 יציב — עם Timeout קצוב שמספיק לכל השרשרת.
 */
export async function callGeminiJson(
  apiKey: string,
  contents: string | GeminiContentPart[],
  models: readonly string[] = GEMINI_VISION_MODELS,
  options?: CallGeminiOptions
): Promise<{
  parsed: Record<string, unknown> | null;
  modelName?: string;
  errorMsg?: string;
  cancelled?: boolean;
}> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const errors: string[] = [];
  const primaryTimeoutMs = options?.perAttemptTimeoutMs ?? 18_000;
  const fallbackTimeoutMs = options?.fallbackAttemptTimeoutMs ?? 13_500;
  const totalBudgetMs = options?.totalBudgetMs ?? 90_000;
  const startedAt = Date.now();
  const orderedModels = orderModelsByHealth(models);
  const cooldownMap = getModelCooldownMap();

  for (let mIdx = 0; mIdx < orderedModels.length; mIdx++) {
    const modelName = orderedModels[mIdx];
    if (options?.shouldCancel && (await options.shouldCancel())) {
      return {
        parsed: null,
        cancelled: true,
        errorMsg: 'הפענוח בוטל ע"י המשתמש',
      };
    }
    const elapsedTotal = Date.now() - startedAt;
    if (elapsedTotal >= totalBudgetMs) {
      errors.push('BudgetExceeded');
      break;
    }

    const baseTimeout = mIdx === 0 ? primaryTimeoutMs : fallbackTimeoutMs;
    const isModelCooled = Boolean(cooldownMap.get(modelName));

    // עבור דגמי 3.8 נגדיר thinkingLevel: 'low' כברירת מחדל (מקצר זמני תגובה מדקות לשניות)
    const configAttempts: (Record<string, unknown> | undefined)[] = modelName.includes('3.8')
      ? [
          {
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingLevel: 'low' },
          },
          { responseMimeType: 'application/json' },
          undefined,
        ]
      : [{ responseMimeType: 'application/json' }, undefined];

    let transientRetriesUsed = 0;
    const maxTransientRetries =
      !isModelCooled && totalBudgetMs - (Date.now() - startedAt) >= 16_000 ? 1 : 0;

    let attemptIdx = 0;
    let totalTriesForModel = 0;
    let lastTransientNotified = 0;
    let lastModelErrTag = '';

    while (attemptIdx < configAttempts.length) {
      if (Date.now() - startedAt >= totalBudgetMs) {
        errors.push(`${modelName}: BudgetExceeded`);
        break;
      }

      if (
        (attemptIdx === 0 && totalTriesForModel === 0) ||
        (transientRetriesUsed > 0 && lastTransientNotified < transientRetriesUsed)
      ) {
        if (transientRetriesUsed > 0) {
          lastTransientNotified = transientRetriesUsed;
        }
        if (options?.onAttemptModel) {
          const meta: GeminiAttemptMeta | undefined =
            transientRetriesUsed > 0
              ? { isRetry: true, reasonLabel: lastModelErrTag }
              : undefined;
          await Promise.resolve(
            options.onAttemptModel(modelName, attemptIdx, meta)
          ).catch(() => {});
        }
      }

      const cfg = configAttempts[attemptIdx];
      const remainingBudget = Math.max(4_000, totalBudgetMs - (Date.now() - startedAt));
      const attemptTimeout = Math.min(baseTimeout, remainingBudget);
      const controller = new AbortController();
      const callStarted = Date.now();
      const timeoutHandle = setTimeout(() => {
        controller.abort(new Error(`Gemini timeout (${attemptTimeout}ms)`));
      }, attemptTimeout);

      try {
        totalTriesForModel += 1;
        const model = genAI.getGenerativeModel({
          model: modelName,
          ...(cfg ? { generationConfig: cfg as unknown as GenerationConfig } : {}),
        });
        const result = await model.generateContent(contents, {
          timeout: attemptTimeout,
          signal: controller.signal,
        });
        clearTimeout(timeoutHandle);
        const parsed = safeParseGeminiJson(result.response.text());
        cooldownMap.delete(modelName);
        return { parsed, modelName };
      } catch (err) {
        clearTimeout(timeoutHandle);
        const callDuration = Date.now() - callStarted;
        const rawMsg = err instanceof Error ? err.message : 'Gemini call failed';
        const isSyntaxError = err instanceof SyntaxError;
        const normalizedMsg = controller.signal.aborted
          ? `Timeout(${Math.round(attemptTimeout / 1000)}s)`
          : rawMsg;
        const kind = classifyGeminiError(
          normalizedMsg,
          controller.signal.aborted,
          isSyntaxError
        );
        lastModelErrTag = compactModelErrorTag(kind, normalizedMsg);

        if (kind === 'auth') {
          errors.push(`${modelName}: ${lastModelErrTag}`);
          console.warn(`Gemini auth error (${modelName}):`, normalizedMsg);
          return {
            parsed: null,
            errorMsg: errors.join(' | '),
          };
        }

        // אם תצורת thinkingConfig/responseMimeType אינה נתמכת בדגם -> נסה תצורה פשוטה יותר מיד
        if (
          (kind === 'config_arg' || kind === 'json_parse') &&
          attemptIdx < configAttempts.length - 1
        ) {
          attemptIdx += 1;
          continue;
        }

        // בעומס רגעי (503 High Demand / רשת / הגבלת דקה קצרה) כשהתשובה נכשלה מהר -> חכה רגע ונסה שוב את אותו מודל!
        const isFastTransient =
          (kind === 'overload_503' || kind === 'rate_limit') &&
          callDuration < 10_000 &&
          transientRetriesUsed < maxTransientRetries &&
          totalBudgetMs - (Date.now() - startedAt) >= 14_000;

        if (isFastTransient) {
          transientRetriesUsed += 1;
          const backoffMs =
            kind === 'rate_limit'
              ? 1300 + Math.floor(Math.random() * 600)
              : 900 + Math.floor(Math.random() * 600);
          console.warn(
            `Gemini transient ${lastModelErrTag} on ${modelName} (${callDuration}ms) — retrying same model in ${backoffMs}ms`
          );
          const cancelledDuringSleep = await cancelAwareSleep(
            backoffMs,
            options?.shouldCancel
          );
          if (cancelledDuringSleep) {
            return {
              parsed: null,
              cancelled: true,
              errorMsg: 'הפענוח בוטל ע"י המשתמש',
            };
          }
          continue;
        }

        recordModelCooldown(modelName, kind);
        const triesLabel = totalTriesForModel > 1 ? `(x${totalTriesForModel})` : '';
        errors.push(`${modelName}${triesLabel}: ${lastModelErrTag}`);
        console.warn(`Gemini API error (${modelName}${triesLabel}):`, normalizedMsg);
        break;
      }
    }
  }

  return {
    parsed: null,
    errorMsg:
      errors.length > 0 ? errors.join(' | ') : 'מודל Gemini לא החזיר תוצאה',
  };
}
