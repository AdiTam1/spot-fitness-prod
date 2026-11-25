/**
 * Shared helpers for user-friendly numeric text & NumberInput editing.
 *
 * Ensures backspacing/clearing any weight, circumference, food grams, or target
 * input never snaps back to 0 or a default mid-typing, while allowing both
 * '.' and ',' as decimal separators on mobile keyboards.
 */

export function sanitizeDecimalInput(raw: string): string {
  const normalized = String(raw || '')
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '');
  const firstDot = normalized.indexOf('.');
  if (firstDot === -1) return normalized;
  return (
    normalized.slice(0, firstDot + 1) +
    normalized.slice(firstDot + 1).replace(/\./g, '')
  );
}

export function sanitizeIntegerInput(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export function parseOptionalDecimal(
  val: number | string | null | undefined
): number | undefined {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : undefined;
  }
  if (typeof val !== 'string') return undefined;
  const clean = val.trim().replace(/,/g, '.');
  if (clean === '' || clean === '.') return undefined;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function isEmptyOrPartialNumericInput(
  val: number | string | null | undefined
): boolean {
  if (val === null || val === undefined || val === '') return true;
  if (typeof val !== 'string') return false;
  const trimmed = val.trim().replace(/,/g, '.');
  return trimmed === '' || trimmed === '.' || trimmed.endsWith('.');
}

export function resolveNumericValue(
  val: number | string | null | undefined,
  fallback: number,
  options?: { min?: number; max?: number; integer?: boolean }
): number {
  const parsed = parseOptionalDecimal(val);
  const raw = parsed !== undefined ? parsed : fallback;
  let next = options?.integer ? Math.round(raw) : raw;
  if (options?.min !== undefined) next = Math.max(options.min, next);
  if (options?.max !== undefined) next = Math.min(options.max, next);
  return next;
}
