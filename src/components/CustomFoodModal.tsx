'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput } from '@mantine/core';
import { Camera, Check, Image as ImageIcon, Loader2, Sparkles, X } from 'lucide-react';
import {
  CustomFoodItem,
  CustomFoodScope,
  MacroTargets,
  UserRole,
} from '@/types/nutrition';
import { computePer100gFromServing } from '@/lib/customFoods';
import { sanitizeDecimalInput } from '@/lib/numericInput';
import { compressProductImage } from '@/utils/imageCompression';
import { SegmentedPill } from './ui/SegmentedPill';

export interface CustomFoodsMutationResult {
  item?: CustomFoodItem;
  traineeId?: string;
  traineeCustomFoods?: CustomFoodItem[];
  myCoachCustomFoods?: CustomFoodItem[];
  globalCustomFoods?: CustomFoodItem[];
}

interface CustomFoodModalProps {
  opened: boolean;
  onClose: () => void;
  actorRole: UserRole;
  traineeId?: string;
  traineeName?: string;
  initialFood?: CustomFoodItem | null;
  initialName?: string;
  initialBarcode?: string;
  defaultScope?: CustomFoodScope;
  zIndex?: number;
  onSaved: (res: CustomFoodsMutationResult) => void;
}

const FOOD_CATEGORIES = [
  'מוצרים אישיים',
  'פחמימות ודגנים',
  'בשר, עוף ודגים',
  'מוצרי חלב וביצים',
  'ירקות, פירות וקטניות',
  'שומנים ואגוזים',
  'חטיפים ומתוקים',
  'משקאות ותוספים',
];

export function CustomFoodModal({
  opened,
  onClose,
  actorRole,
  traineeId,
  traineeName,
  initialFood,
  initialName,
  initialBarcode,
  defaultScope,
  zIndex = 280,
  onSaved,
}: CustomFoodModalProps) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('מוצרים אישיים');
  const [barcode, setBarcode] = useState('');

  const [inputMode, setInputMode] = useState<'per100g' | 'serving'>('per100g');
  const [servingLabel, setServingLabel] = useState('מנה / כוס');
  const [servingGrams, setServingGrams] = useState<string>('160');

  const [caloriesInput, setCaloriesInput] = useState<string>('');
  const [proteinInput, setProteinInput] = useState<string>('');
  const [carbsInput, setCarbsInput] = useState<string>('');
  const [fatInput, setFatInput] = useState<string>('');

  // יחידת הגשה אופציונלית כשמזינים לפי 100 גרם
  const [optUnitLabel, setOptUnitLabel] = useState('');
  const [optUnitGrams, setOptUnitGrams] = useState('');

  const [scope, setScope] = useState<CustomFoodScope>('trainee');
  const [imageDataUrl, setImageDataUrl] = useState<string | undefined>(undefined);
  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setError(null);
    if (initialFood) {
      setName(initialFood.name);
      setBrand(initialFood.brand || '');
      setCategory(initialFood.category || 'מוצרים אישיים');
      setBarcode(initialFood.barcode || '');
      setImageDataUrl(initialFood.imageDataUrl);
      setScope(initialFood.scope);

      const mode = initialFood.inputMode === 'serving' ? 'serving' : 'per100g';
      setInputMode(mode);
      if (mode === 'serving' && initialFood.defaultServingGrams && initialFood.defaultServingGrams > 0) {
        const g = initialFood.defaultServingGrams;
        const factor = g / 100;
        setServingLabel(initialFood.defaultServingLabel || 'מנה');
        setServingGrams(String(Math.round(g)));
        setCaloriesInput(String(Math.round(initialFood.per100g.calories * factor)));
        setProteinInput(String(Math.round(initialFood.per100g.protein * factor * 10) / 10));
        setCarbsInput(String(Math.round(initialFood.per100g.carbs * factor * 10) / 10));
        setFatInput(String(Math.round(initialFood.per100g.fat * factor * 10) / 10));
        setOptUnitLabel('');
        setOptUnitGrams('');
      } else {
        setServingLabel('מנה / כוס');
        setServingGrams('160');
        setCaloriesInput(String(initialFood.per100g.calories));
        setProteinInput(String(initialFood.per100g.protein));
        setCarbsInput(String(initialFood.per100g.carbs));
        setFatInput(String(initialFood.per100g.fat));
        setOptUnitLabel(initialFood.defaultServingLabel || '');
        setOptUnitGrams(
          initialFood.defaultServingGrams ? String(initialFood.defaultServingGrams) : ''
        );
      }
      return;
    }

    setName((initialName || '').trim());
    setBrand('');
    setCategory('מוצרים אישיים');
    setBarcode((initialBarcode || '').trim());
    setImageDataUrl(undefined);
    setInputMode('per100g');
    setServingLabel('כוס מבושלת / מנה');
    setServingGrams('160');
    setCaloriesInput('');
    setProteinInput('');
    setCarbsInput('');
    setFatInput('');
    setOptUnitLabel('');
    setOptUnitGrams('');
    if (defaultScope) {
      setScope(defaultScope);
    } else if (actorRole === 'trainee') {
      setScope('trainee');
    } else if (traineeId) {
      setScope('trainee');
    } else {
      setScope('coach-trainees');
    }
  }, [opened, initialFood, initialName, initialBarcode, defaultScope, actorRole, traineeId]);

  const parseDecimal = (raw: string) => {
    const clean = raw.replace(',', '.').trim();
    const num = Number(clean);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  };

  const parsedMacros: MacroTargets = useMemo(
    () => ({
      calories: parseDecimal(caloriesInput),
      protein: parseDecimal(proteinInput),
      carbs: parseDecimal(carbsInput),
      fat: parseDecimal(fatInput),
    }),
    [caloriesInput, proteinInput, carbsInput, fatInput]
  );

  const previewPer100g: MacroTargets = useMemo(() => {
    if (inputMode === 'serving') {
      const g = Math.max(1, parseDecimal(servingGrams) || 100);
      return computePer100gFromServing(parsedMacros, g);
    }
    return {
      calories: Math.round(parsedMacros.calories),
      protein: Math.round(parsedMacros.protein * 100) / 100,
      carbs: Math.round(parsedMacros.carbs * 100) / 100,
      fat: Math.round(parsedMacros.fat * 100) / 100,
    };
  }, [inputMode, parsedMacros, servingGrams]);

  const atwaterEstimate = Math.round(
    parsedMacros.protein * 4 + parsedMacros.carbs * 4 + parsedMacros.fat * 9
  );
  const showAtwaterHint =
    parsedMacros.calories > 0 &&
    atwaterEstimate > 0 &&
    Math.abs(parsedMacros.calories - atwaterEstimate) > Math.max(35, parsedMacros.calories * 0.25);

  const scopeOptions = useMemo(() => {
    if (actorRole === 'trainee') return [];
    const opts: { value: CustomFoodScope; label: string }[] = [];
    if (traineeId) {
      opts.push({
        value: 'trainee',
        label: `רק למתאמן ${traineeName || ''}`.trim(),
      });
    }
    opts.push({
      value: 'coach-trainees',
      label: 'משותף לכל המתאמנים שלי',
    });
    opts.push({
      value: 'coach-private',
      label: 'פרטי למאמן בלבד',
    });
    if (actorRole === 'admin') {
      opts.push({
        value: 'global',
        label: 'גלובלי לכולם באפליקציה (מנהל ראשי)',
      });
    }
    return opts;
  }, [actorRole, traineeId, traineeName]);

  const handleProductImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('נא לבחור קובץ תמונה תקין (JPG, PNG, WebP)');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('קובץ התמונה גדול מדי (מקסימום 20MB)');
      return;
    }
    setImageUploading(true);
    setError(null);
    try {
      const compressed = await compressProductImage(file);
      setImageDataUrl(compressed.dataUrl);
    } catch {
      setError('שגיאה בעיבוד התמונה — נסה תמונה אחרת');
    } finally {
      setImageUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (cleanName.length < 2) {
      setError('יש להזין שם מוצר (לפחות 2 תווים)');
      return;
    }
    if (caloriesInput.trim() === '') {
      setError('יש להזין קלוריות למוצר');
      return;
    }
    if (inputMode === 'serving') {
      const sG = parseDecimal(servingGrams);
      if (!Number.isFinite(sG) || sG <= 0 || sG > 5000) {
        setError('יש להזין משקל מנה תקין בגרמים (1 עד 5000)');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const resolvedServingLabel =
        inputMode === 'serving' ? servingLabel.trim() || 'מנה' : optUnitLabel.trim();
      const resolvedServingGrams =
        inputMode === 'serving'
          ? Math.round(parseDecimal(servingGrams) || 100)
          : Math.round(parseDecimal(optUnitGrams) || 0);

      const res = await fetch('/api/food/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'upsert',
          id: initialFood?.id,
          name: cleanName,
          brand: brand.trim() || undefined,
          category,
          barcode: barcode.trim() || undefined,
          imageDataUrl: imageDataUrl || null,
          inputMode,
          macros: parsedMacros,
          defaultServingLabel: resolvedServingLabel || undefined,
          defaultServingGrams: resolvedServingGrams > 0 ? resolvedServingGrams : undefined,
          scope: actorRole === 'trainee' ? 'trainee' : scope,
          traineeId: (actorRole === 'trainee' ? undefined : traineeId) || initialFood?.traineeId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.item) {
        setError(data?.error || 'שגיאה בשמירת המוצר האישי');
        return;
      }
      onSaved(data as CustomFoodsMutationResult);
      onClose();
    } catch {
      setError('שגיאת תקשורת מול השרת — נסה שוב');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => !saving && onClose()}
      title={initialFood ? 'עריכת מוצר אישי' : 'יצירת מוצר אישי חדש'}
      centered
      size="md"
      zIndex={zIndex}
      styles={{
        content: { borderRadius: 24, maxWidth: 'calc(100vw - 24px)' },
      }}
    >
      <form noValidate onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextInput
          label="שם המוצר"
          placeholder="למשל: אורז לבן יסמין מבושל"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>
            תמונת מוצר (אופציונלי)
          </span>
          {imageDataUrl ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: 8,
                borderRadius: 16,
                background: 'var(--surface-2, var(--card))',
                border: '1px solid var(--line)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageDataUrl}
                alt={name || 'תמונת מוצר'}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 12,
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: '1px solid var(--line)',
                }}
              />
              <div style={{ display: 'flex', flex: 1, flexWrap: 'wrap', gap: 6 }}>
                <label
                  className="btn-surface"
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: imageUploading ? 'wait' : 'pointer',
                  }}
                >
                  <Camera size={13} />
                  <span>צלם</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    disabled={imageUploading}
                    onChange={(e) => void handleProductImageUpload(e)}
                  />
                </label>
                <label
                  className="btn-surface"
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: imageUploading ? 'wait' : 'pointer',
                  }}
                >
                  <ImageIcon size={13} />
                  <span>{imageUploading ? 'מעבד...' : 'החלף'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={imageUploading}
                    onChange={(e) => void handleProductImageUpload(e)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setImageDataUrl(undefined)}
                  className="btn-surface"
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#ef4444',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                  <span>הסר</span>
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <label
                className="btn-surface"
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 12,
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: imageUploading ? 'wait' : 'pointer',
                }}
              >
                <Camera size={14} />
                <span>{imageUploading ? 'מעבד...' : 'צלם מוצר'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  disabled={imageUploading}
                  onChange={(e) => void handleProductImageUpload(e)}
                />
              </label>
              <label
                className="btn-surface"
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 12,
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: imageUploading ? 'wait' : 'pointer',
                }}
              >
                <ImageIcon size={14} />
                <span>{imageUploading ? 'מעבד...' : 'העלה מגלריה'}</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  disabled={imageUploading}
                  onChange={(e) => void handleProductImageUpload(e)}
                />
              </label>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>
            איך להזין את הערכים הקלוריים?
          </span>
          <SegmentedPill
            ariaLabel="שיטת הזנת ערכים"
            value={inputMode}
            onChange={(v) => setInputMode(v as 'per100g' | 'serving')}
            options={[
              { value: 'per100g', label: 'לפי 100 גרם' },
              { value: 'serving', label: 'לפי מנה / יחידה' },
            ]}
          />
        </div>

        {inputMode === 'serving' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.3fr 1fr',
              gap: 8,
              padding: 10,
              borderRadius: 16,
              background: 'var(--surface-2, var(--card))',
              border: '1px solid var(--line)',
            }}
          >
            <TextInput
              label="תיאור המנה"
              placeholder="למשל: כוס מבושלת"
              value={servingLabel}
              onChange={(e) => setServingLabel(e.currentTarget.value)}
            />
            <TextInput
              label="משקל המנה (גרם)"
              type="text"
              inputMode="decimal"
              dir="ltr"
              placeholder="למשל: 160"
              required
              value={servingGrams}
              onChange={(e) => setServingGrams(sanitizeDecimalInput(e.currentTarget.value))}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <TextInput
            label={inputMode === 'serving' ? 'קלוריות במנה (קק״ל)' : 'קלוריות ל-100 גרם'}
            type="text"
            inputMode="decimal"
            dir="ltr"
            required
            placeholder="למשל: 130"
            value={caloriesInput}
            onChange={(e) => setCaloriesInput(sanitizeDecimalInput(e.currentTarget.value))}
          />
          <TextInput
            label={inputMode === 'serving' ? 'חלבון במנה (ג׳)' : 'חלבון ל-100 גרם'}
            type="text"
            inputMode="decimal"
            dir="ltr"
            placeholder="0"
            value={proteinInput}
            onChange={(e) => setProteinInput(sanitizeDecimalInput(e.currentTarget.value))}
          />
          <TextInput
            label={inputMode === 'serving' ? 'פחמימות במנה (ג׳)' : 'פחמימות ל-100 גרם'}
            type="text"
            inputMode="decimal"
            dir="ltr"
            placeholder="0"
            value={carbsInput}
            onChange={(e) => setCarbsInput(sanitizeDecimalInput(e.currentTarget.value))}
          />
          <TextInput
            label={inputMode === 'serving' ? 'שומן במנה (ג׳)' : 'שומן ל-100 גרם'}
            type="text"
            inputMode="decimal"
            dir="ltr"
            placeholder="0"
            value={fatInput}
            onChange={(e) => setFatInput(sanitizeDecimalInput(e.currentTarget.value))}
          />
        </div>

        {inputMode === 'serving' && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 14,
              background: 'rgba(16, 185, 129, 0.09)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <span>יחס מחושב אוטומטית ל-100 גרם:</span>
            <bdi dir="ltr" className="num-mono ltr-num">
              {previewPer100g.calories} קק״ל · P:{previewPer100g.protein} · C:{previewPer100g.carbs} · F:{previewPer100g.fat}
            </bdi>
          </div>
        )}

        {showAtwaterHint && (
          <div
            style={{
              padding: '7px 11px',
              borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              fontSize: 11.5,
              color: 'var(--text-2)',
            }}
          >
            שימו לב: לפי חלבון/פחמימה/שומן (4/4/9), סך הקלוריות המשוער הוא כ-{atwaterEstimate} קק״ל (במשקאות אלכוהוליים מתווספים ~7 קק״ל לכל גרם אלכוהול, וזה תקין לגמרי). הערכים שהזנת יישמרו כפי שבחרת.
          </div>
        )}

        {inputMode === 'per100g' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.3fr 1fr',
              gap: 8,
            }}
          >
            <TextInput
              label="יחידת הגשה מהירה (אופציונלי)"
              placeholder="למשל: כוס מבושלת"
              value={optUnitLabel}
              onChange={(e) => setOptUnitLabel(e.currentTarget.value)}
            />
            <TextInput
              label="משקל היחידה (גרם)"
              type="text"
              inputMode="decimal"
              dir="ltr"
              placeholder="160"
              value={optUnitGrams}
              onChange={(e) => setOptUnitGrams(sanitizeDecimalInput(e.currentTarget.value))}
            />
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>קטגוריה</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.currentTarget.value)}
              style={{
                height: 36,
                borderRadius: 8,
                padding: '0 10px',
                border: '1px solid var(--line-2)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: 13,
              }}
            >
              {FOOD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <TextInput
            label="ברקוד / מותג (אופציונלי)"
            placeholder="מספר ברקוד או שם יצרן"
            value={barcode || brand}
            onChange={(e) => {
              const val = e.currentTarget.value;
              if (/^\d{4,}$/.test(val.trim())) {
                setBarcode(val.trim());
                setBrand('');
              } else {
                setBrand(val);
                if (!val.trim()) setBarcode('');
              }
            }}
          />
        </div>

        {scopeOptions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>
              מי יראה מוצר זה בחיפוש וב-AI?
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {scopeOptions.map((opt) => {
                const active = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScope(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 12,
                      border: active
                        ? '1.5px solid var(--accent-solid, #10b981)'
                        : '1px solid var(--line)',
                      background: active ? 'rgba(16, 185, 129, 0.08)' : 'var(--card)',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      textAlign: 'right',
                    }}
                  >
                    <span>{opt.label}</span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '8px 11px',
              borderRadius: 12,
              background: 'var(--bg-surface-2, var(--surface-2))',
              border: '1px solid var(--line)',
              fontSize: 11.5,
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sparkles size={13} />
            <span>יישמר בחשבון האישי שלך ויהיה זמין בחיפוש ובפענוח ה-AI.</span>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-volt"
          disabled={saving}
          style={{
            height: 48,
            fontSize: 15,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>שומר מוצר...</span>
            </>
          ) : (
            <>
              <Check size={16} />
              <span>{initialFood ? 'שמור שינויים' : 'שמור מוצר אישי'}</span>
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
