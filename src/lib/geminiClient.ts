import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * מודלים פעילים ב-Free Tier של Google AI Studio (נובמבר 2026):
 * - gemini-3.8-flash: דגם ה-Vision המדויק ביותר לזיהוי תמונות ומדידות (מכסה יומית מצומצמת ~20 RPD ב-Free Tier)
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

/**
 * קריאה מאוחדת למודלי Gemini עם מעבר גיבוי אוטומטי בין מודלים פעילים ב-Free Tier
 * וניסיון חוזר ללא responseMimeType אם דגם ספציפי דורש JSON חופשי.
 */
export async function callGeminiJson(
  apiKey: string,
  contents: string | GeminiContentPart[],
  models: readonly string[] = GEMINI_VISION_MODELS
): Promise<{
  parsed: Record<string, unknown> | null;
  modelName?: string;
  errorMsg?: string;
}> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const errors: string[] = [];

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent(contents);
      const parsed = safeParseGeminiJson(result.response.text());
      return { parsed, modelName };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini call failed';

      // גיבוי אם מודל מחזיר 400 INVALID_ARGUMENT על responseMimeType ב-v1beta
      const isMimeArgError =
        msg.includes('400') &&
        (msg.toLowerCase().includes('responsemimetype') ||
          msg.toLowerCase().includes('generationconfig') ||
          msg.toLowerCase().includes('invalid_argument'));

      if (isMimeArgError) {
        try {
          const fallbackModel = genAI.getGenerativeModel({ model: modelName });
          const fallbackRes = await fallbackModel.generateContent(contents);
          const parsed = safeParseGeminiJson(fallbackRes.response.text());
          return { parsed, modelName };
        } catch (retryErr) {
          const retryMsg =
            retryErr instanceof Error ? retryErr.message : 'Retry failed';
          errors.push(`${modelName}: ${retryMsg}`);
          console.warn(`Gemini retry error (${modelName}):`, retryMsg);
          continue;
        }
      }

      errors.push(`${modelName}: ${msg}`);
      console.warn(`Gemini API error (${modelName}):`, msg);
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
