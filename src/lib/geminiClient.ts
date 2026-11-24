import { GenerationConfig, GoogleGenerativeAI } from '@google/generative-ai';

/**
 * מודלים פעילים ב-Free Tier של Google AI Studio (נובמבר 2026):
 * - gemini-3.8-flash: דגם ה-Vision המדויק ביותר לזיהוי תמונות ומדידות (עם thinkingLevel: 'low' למהירות גבוהה)
 * - gemini-3.6-flash: דגם Flash רב-תכליתי בחינם
 * - gemini-3.5-flash-lite / gemini-3.1-flash-lite: דגמי Lite מהירים עם מכסת Free Tier גבוהה (~500 RPD, ~15 RPM)
 */
export const GEMINI_VISION_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
] as const;

export const GEMINI_TEXT_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
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

export interface CallGeminiOptions {
  perAttemptTimeoutMs?: number;
  totalBudgetMs?: number;
  onAttemptModel?: (modelName: string, attemptIdx: number) => Promise<void> | void;
  shouldCancel?: () => Promise<boolean> | boolean;
}

/**
 * קריאה מאוחדת למודלי Gemini עם מעבר גיבוי אוטומטי בין מודלים פעילים ב-Free Tier,
 * הגדרת thinkingLevel: 'low' להאצת זמני תגובה (מונע המתנות של 3-4 דקות במודלי חשיבה),
 * Timeout קשיח פר־קריאה ותקציב זמן כולל כדי שמשימות לא ייתקעו לנצח.
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
  const perAttemptTimeoutMs = options?.perAttemptTimeoutMs ?? 32_000;
  const totalBudgetMs = options?.totalBudgetMs ?? 95_000;
  const startedAt = Date.now();

  for (const modelName of models) {
    if (options?.shouldCancel && (await options.shouldCancel())) {
      return {
        parsed: null,
        cancelled: true,
        errorMsg: 'הפענוח בוטל ע"י המשתמש',
      };
    }
    if (Date.now() - startedAt >= totalBudgetMs) {
      errors.push('חריגה מתקציב הזמן המרבי לפענוח AI');
      break;
    }

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

    for (let attemptIdx = 0; attemptIdx < configAttempts.length; attemptIdx++) {
      if (Date.now() - startedAt >= totalBudgetMs) {
        errors.push('חריגה מתקציב הזמן המרבי לפענוח AI');
        break;
      }

      if (attemptIdx === 0 && options?.onAttemptModel) {
        await Promise.resolve(options.onAttemptModel(modelName, attemptIdx)).catch(
          () => {}
        );
      }

      const cfg = configAttempts[attemptIdx];
      const remainingBudget = Math.max(4_000, totalBudgetMs - (Date.now() - startedAt));
      const attemptTimeout = Math.min(perAttemptTimeoutMs, remainingBudget);
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort(new Error(`Gemini timeout (${attemptTimeout}ms)`));
      }, attemptTimeout);

      try {
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
        return { parsed, modelName };
      } catch (err) {
        clearTimeout(timeoutHandle);
        const msg = err instanceof Error ? err.message : 'Gemini call failed';
        const isConfigArgError =
          msg.includes('400') &&
          (msg.toLowerCase().includes('responsemimetype') ||
            msg.toLowerCase().includes('thinkingconfig') ||
            msg.toLowerCase().includes('generationconfig') ||
            msg.toLowerCase().includes('invalid_argument'));

        if (isConfigArgError && attemptIdx < configAttempts.length - 1) {
          continue;
        }
        const normalizedMsg = controller.signal.aborted
          ? `Timeout (${Math.round(attemptTimeout / 1000)}s)`
          : msg;
        errors.push(`${modelName}: ${normalizedMsg}`);
        console.warn(`Gemini API error (${modelName}):`, normalizedMsg);
        break;
      }
    }
  }

  return {
    parsed: null,
    errorMsg:
      errors.length > 0
        ? errors.slice(0, 2).join(' | ')
        : 'מודל Gemini לא החזיר תוצאה',
  };
}
