'use client';

import React, { useState } from 'react';
import { Modal, NumberInput, Select, TextInput, Textarea } from '@mantine/core';
import {
  Camera,
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import {
  ReferenceObjectKind,
  ServingToolKind,
  TraineeCustomUnit,
  TraineeServingTool,
} from '@/types/nutrition';
import { compressMealImage } from '@/utils/imageCompression';

interface ServingToolsManagerModalProps {
  opened: boolean;
  onClose: () => void;
  tools: TraineeServingTool[];
  customUnits: TraineeCustomUnit[];
  geminiApiKey?: string;
  onSave: (payload: {
    customServingTools?: TraineeServingTool[];
    customFoodUnits?: TraineeCustomUnit[];
  }) => Promise<{ error?: string }>;
}

const TOOL_KIND_OPTIONS: { value: ServingToolKind; label: string }[] = [
  { value: 'plate', label: 'צלחת' },
  { value: 'bowl', label: 'קערה / מרקייה' },
  { value: 'box', label: 'קופסת אוכל / משלוח' },
  { value: 'cup', label: 'כוס / ספל' },
  { value: 'spoon', label: 'כף / מצקת' },
  { value: 'custom', label: 'כלי אחר' },
];

const REFERENCE_OBJECT_OPTIONS: { value: ReferenceObjectKind; label: string }[] = [
  {
    value: 'credit-card',
    label: '⭐ רב-קו / כרטיס מועדון / אשראי הפוך (8.56×5.4 ס"מ — המדויק ביותר)',
  },
  { value: 'coin-10', label: 'מטבע 10 ש"ח (קוטר 23 מ"מ)' },
  { value: 'coin-5', label: 'מטבע 5 ש"ח (קוטר 24 מ"מ)' },
  { value: 'cutlery', label: 'סכו"ם רגיל ליד הכלי (~19 ס"מ, הערכה כללית)' },
  { value: 'none', label: 'ללא אובייקט ייחוס (הערכה לפי פרופורציות)' },
];

export function ServingToolsManagerModal({
  opened,
  onClose,
  tools,
  customUnits,
  geminiApiKey,
  onSave,
}: ServingToolsManagerModalProps) {
  const [section, setSection] = useState<'tools' | 'units'>('tools');
  const [measureMode, setMeasureMode] = useState<'manual' | 'ai'>('ai');

  // שדות הוספת / מדידת כלי
  const [toolName, setToolName] = useState('');
  const [toolKind, setToolKind] = useState<ServingToolKind>('plate');
  const [diameterCm, setDiameterCm] = useState<number | string>(26);
  const [depthCm, setDepthCm] = useState<number | string>(3);
  const [volumeMl, setVolumeMl] = useState<number | string>(750);
  const [defaultFoodGrams, setDefaultFoodGrams] = useState<number | string>(220);
  const [toolNotes, setToolNotes] = useState('');

  // מצב מדידה עם AI
  const [refObject, setRefObject] = useState<ReferenceObjectKind>('credit-card');
  const [toolImages, setToolImages] = useState<
    { dataUrl: string; angle: 'top-down' | 'side-45'; sizeKB: number }[]
  >([]);
  const [measuringAi, setMeasuringAi] = useState(false);
  const [aiResultNote, setAiResultNote] = useState<{
    msg: string;
    isError?: boolean;
    engine?: string;
    isFallback?: boolean;
  } | null>(null);
  const [measuredByAiFlag, setMeasuredByAiFlag] = useState(false);

  // שדות הוספת יחידת מידה אישית בגרם
  const [unitName, setUnitName] = useState('');
  const [unitKeyword, setUnitKeyword] = useState('');
  const [unitGrams, setUnitGrams] = useState<number | string>(180);
  const [saving, setSaving] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const handleUploadToolImages = async (
    e: React.ChangeEvent<HTMLInputElement>,
    defaultAngle: 'top-down' | 'side-45'
  ) => {
    const files = Array.from(e.target.files || []).slice(0, 3 - toolImages.length);
    if (files.length === 0) return;
    setAiResultNote(null);
    try {
      const next: { dataUrl: string; angle: 'top-down' | 'side-45'; sizeKB: number }[] = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressMealImage(files[i], 900, 0.78);
        next.push({
          dataUrl: compressed.dataUrl,
          angle: toolImages.length + i === 0 ? defaultAngle : 'side-45',
          sizeKB: compressed.sizeKB,
        });
      }
      setToolImages((prev) => [...prev, ...next].slice(0, 3));
    } catch {
      setAiResultNote({ msg: 'לא ניתן לטעון את התמונה', isError: true });
    } finally {
      e.target.value = '';
    }
  };

  const runAiMeasureTool = async () => {
    if (toolImages.length === 0) {
      setAiResultNote({
        msg: 'העלה לפחות תמונה אחת של הכלי ליד אובייקט הייחוס (רצוי 2: מלמעלה + מהצד).',
        isError: true,
      });
      return;
    }
    setMeasuringAi(true);
    setAiResultNote(null);
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'measure-tool',
          imageDataUrls: toolImages.map((im) => im.dataUrl),
          contextParams: {
            imageAngles: toolImages.map((im) => im.angle),
          },
          referenceObject: refObject,
          toolKind,
          toolName: toolName.trim() || undefined,
          customApiKey: geminiApiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiResultNote({
          msg: data.error || 'מדידת הכלי נכשלה — אפשר להזין ידנית',
          isError: true,
          isFallback: Boolean(data.isAiFallback),
        });
        return;
      }
      if (data.recommendedName && !toolName.trim()) {
        setToolName(String(data.recommendedName));
      }
      if (data.diameterCm) setDiameterCm(Number(data.diameterCm));
      if (data.depthCm) setDepthCm(Number(data.depthCm));
      if (data.volumeMl) setVolumeMl(Number(data.volumeMl));
      if (data.defaultFoodGrams) setDefaultFoodGrams(Number(data.defaultFoodGrams));
      setMeasuredByAiFlag(true);
      setAiResultNote({
        msg: data.confidenceNote || 'המידות חושבו בהצלחה — אפשר לדייק ידנית ולשמור.',
        engine: data.engine,
        isFallback: Boolean(data.isAiFallback),
      });
    } catch {
      setAiResultNote({
        msg: 'תקלת תקשורת במדידת הכלי עם AI',
        isError: true,
      });
    } finally {
      setMeasuringAi(false);
    }
  };

  const handleAddTool = async () => {
    const cleanName = toolName.trim();
    if (!cleanName) {
      setErrorBanner('יש להזין שם לכלי (למשל: צלחת לבנה גדולה)');
      return;
    }
    setSaving(true);
    setErrorBanner(null);
    try {
      const newTool: TraineeServingTool = {
        id: `tool-${Date.now()}`,
        name: cleanName,
        kind: toolKind,
        diameterCm: Number(diameterCm) || undefined,
        depthCm: Number(depthCm) || undefined,
        volumeMl: Number(volumeMl) || undefined,
        defaultFoodGrams: Number(defaultFoodGrams) || undefined,
        notes: toolNotes.trim() || undefined,
        measuredByAi: measuredByAiFlag,
        referenceObject: measuredByAiFlag ? refObject : undefined,
        confidenceNote: aiResultNote && !aiResultNote.isError ? aiResultNote.msg : undefined,
        updatedAt: new Date().toISOString(),
      };
      const nextTools = [newTool, ...tools];
      const res = await onSave({ customServingTools: nextTools });
      if (res.error) {
        setErrorBanner(res.error);
        return;
      }
      setToolName('');
      setToolNotes('');
      setToolImages([]);
      setMeasuredByAiFlag(false);
      setAiResultNote(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    setSaving(true);
    setErrorBanner(null);
    try {
      const res = await onSave({
        customServingTools: tools.filter((t) => t.id !== toolId),
      });
      if (res.error) setErrorBanner(res.error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddUnit = async () => {
    const cleanName = unitName.trim();
    const gramsNum = Math.max(1, Number(unitGrams) || 100);
    if (!cleanName) {
      setErrorBanner('נא להזין שם יחידה (למשל: קערת האורז שלי)');
      return;
    }
    setSaving(true);
    setErrorBanner(null);
    try {
      const nextUnit: TraineeCustomUnit = {
        id: `unit-${Date.now()}`,
        unitName: cleanName,
        foodNameKeyword: unitKeyword.trim() || undefined,
        grams: gramsNum,
        updatedAt: new Date().toISOString(),
      };
      const res = await onSave({ customFoodUnits: [nextUnit, ...customUnits] });
      if (res.error) {
        setErrorBanner(res.error);
        return;
      }
      setUnitName('');
      setUnitKeyword('');
      setUnitGrams(180);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    setSaving(true);
    setErrorBanner(null);
    try {
      const res = await onSave({
        customFoodUnits: customUnits.filter((u) => u.id !== unitId),
      });
      if (res.error) setErrorBanner(res.error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ruler size={16} color="var(--accent-volt)" />
          <span style={{ fontWeight: 800, fontSize: 15 }}>
            ניהול כלים ויחידות מידה אישיות
          </span>
        </div>
      }
      centered
      radius="lg"
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* לשוניות משנה */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            background: 'var(--bg-surface-2)',
            padding: 4,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={() => setSection('tools')}
            style={{
              padding: '8px',
              borderRadius: 8,
              border: 'none',
              background: section === 'tools' ? 'var(--accent-volt)' : 'transparent',
              color: section === 'tools' ? '#ffffff' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Utensils size={14} />
            <span>צלחות וכלים ({tools.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('units')}
            style={{
              padding: '8px',
              borderRadius: 8,
              border: 'none',
              background: section === 'units' ? 'var(--accent-volt)' : 'transparent',
              color: section === 'units' ? '#ffffff' : 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Plus size={14} />
            <span>יחידות מידה בגרם ({customUnits.length})</span>
          </button>
        </div>

        {errorBanner && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {errorBanner}
          </div>
        )}

        {section === 'tools' ? (
          <>
            {/* בחירת מצב: מדידה בעזרת AI מול הזנה ידנית */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setMeasureMode('ai')}
                className={measureMode === 'ai' ? 'btn-volt' : 'btn-surface'}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Sparkles size={13} />
                <span>מדידה חכמה עם AI + ייחוס</span>
              </button>
              <button
                type="button"
                onClick={() => setMeasureMode('manual')}
                className={measureMode === 'manual' ? 'btn-volt' : 'btn-surface'}
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                הזנה ידנית של המידות
              </button>
            </div>

            {measureMode === 'ai' && (
              <div
                style={{
                  background: 'var(--bg-surface-2)',
                  border: '1px solid rgba(234, 88, 12, 0.28)',
                  borderRadius: 14,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* מדריך צילום מדעי לדיוק מירבי */}
                <div
                  style={{
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: 'var(--text-secondary)',
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: 10,
                    padding: '8px 10px',
                  }}
                >
                  <b style={{ color: '#7dd3fc' }}>
                    כללי צילום לדיוק הגבוה ביותר (מבוסס מחקר Vision AI):
                  </b>
                  <br />
                  1. הנח <b>רב-קו / כרטיס מועדון / אשראי הפוך</b> שטוח על השולחן צמוד לכלי (שכל 4 הפינות גלויות, עדיף ללא סכו״ם כי סכו״ם משתנה ב-25%).
                  <br />
                  2. צלם בעדשת <b>1× רגילה</b> (~40 ס״מ מרחק, ללא פלאש וללא השתקפות).
                  <br />
                  3. מומלץ להעלות <b>2 תמונות</b>: אחת <b>90° ישר מלמעלה</b> (לקוטר) + אחת <b>בזווית ~35°-45° מהצד</b> (לעומק ונפח).
                </div>

                <Select
                  size="xs"
                  label="בחר אובייקט ייחוס שהוצב ליד הכלי"
                  value={refObject}
                  onChange={(v) => setRefObject((v as ReferenceObjectKind) || 'credit-card')}
                  data={REFERENCE_OBJECT_OPTIONS}
                />

                {toolImages.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {toolImages.map((im, idx) => (
                      <div
                        key={idx}
                        style={{
                          position: 'relative',
                          width: 84,
                          height: 84,
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <img
                          src={im.dataUrl}
                          alt={`תמונת כלי ${idx + 1}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setToolImages((prev) => prev.filter((_, i) => i !== idx))
                          }
                          style={{
                            position: 'absolute',
                            top: 3,
                            right: 3,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={11} />
                        </button>
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 2,
                            left: 2,
                            right: 2,
                            fontSize: 9,
                            textAlign: 'center',
                            background: 'rgba(0,0,0,0.72)',
                            color: 'var(--accent-volt)',
                            borderRadius: 4,
                            padding: '1px 2px',
                          }}
                        >
                          {im.angle === 'top-down' ? '90° מלמעלה' : 'צד ~45°'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <label
                    className="btn-surface"
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: '7px 10px',
                      fontSize: 11,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <ImageIcon size={13} color="#38bdf8" />
                    <span>בחר מהגלריה (עד 3)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => handleUploadToolImages(e, 'top-down')}
                    />
                  </label>
                  <label
                    className="btn-surface"
                    style={{
                      flex: 1,
                      minWidth: 120,
                      padding: '7px 10px',
                      fontSize: 11,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <Camera size={13} color="var(--accent-volt)" />
                    <span>צלם עכשיו</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) =>
                        handleUploadToolImages(
                          e,
                          toolImages.length === 0 ? 'top-down' : 'side-45'
                        )
                      }
                    />
                  </label>
                </div>

                <button
                  type="button"
                  disabled={measuringAi || toolImages.length === 0}
                  onClick={runAiMeasureTool}
                  className="btn-volt"
                  style={{
                    padding: '9px',
                    fontSize: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  {measuringAi ? (
                    <Loader2 size={14} className="spot-spinner" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  <span>
                    {measuringAi ? 'מודד כלי ביחס לייחוס...' : 'מדוד מידות הכלי עם AI'}
                  </span>
                </button>

                {aiResultNote && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                      background: aiResultNote.isError
                        ? 'rgba(239, 68, 68, 0.14)'
                        : 'rgba(234, 88, 12, 0.1)',
                      border: aiResultNote.isError
                        ? '1px solid rgba(239, 68, 68, 0.35)'
                        : '1px solid rgba(234, 88, 12, 0.3)',
                      color: aiResultNote.isError ? '#fca5a5' : 'var(--accent-volt)',
                    }}
                  >
                    {aiResultNote.msg}
                    {aiResultNote.engine && (
                      <div style={{ fontSize: 10, opacity: 0.85, marginTop: 3 }}>
                        {aiResultNote.isFallback
                          ? `לא AI · Fallback (${aiResultNote.engine})`
                          : `✨ AI · ${aiResultNote.engine}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* שדות מידות הכלי (זמין תמיד לעריכה ידנית או אחרי מדידת AI) */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 8 }}>
              <TextInput
                size="xs"
                label="שם הכלי"
                placeholder="למשל: קערת פסטה כחולה"
                value={toolName}
                onChange={(e) => setToolName(e.currentTarget.value)}
              />
              <Select
                size="xs"
                label="סוג כלי"
                value={toolKind}
                onChange={(v) => setToolKind((v as ServingToolKind) || 'plate')}
                data={TOOL_KIND_OPTIONS}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
              }}
            >
              <NumberInput
                size="xs"
                label='קוטר (ס"מ)'
                value={diameterCm}
                onChange={setDiameterCm}
                min={2}
                max={55}
              />
              <NumberInput
                size="xs"
                label='עומק (ס"מ)'
                value={depthCm}
                onChange={setDepthCm}
                min={0.5}
                max={35}
                step={0.5}
              />
              <NumberInput
                size="xs"
                label='נפח (מ"ל)'
                value={volumeMl}
                onChange={setVolumeMl}
                min={10}
                max={4000}
                step={25}
              />
              <NumberInput
                size="xs"
                label="גרם במנה"
                value={defaultFoodGrams}
                onChange={setDefaultFoodGrams}
                min={10}
                max={2000}
                step={10}
              />
            </div>

            <Textarea
              size="xs"
              placeholder="הערה אופציונלית (למשל: ממלאים עד הפס הפנימי)"
              value={toolNotes}
              onChange={(e) => setToolNotes(e.currentTarget.value)}
              minRows={1}
            />

            <button
              type="button"
              disabled={saving || !toolName.trim()}
              onClick={handleAddTool}
              className="btn-volt"
              style={{
                padding: '9px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {saving ? (
                <Loader2 size={14} className="spot-spinner" />
              ) : (
                <Check size={14} />
              )}
              <span>שמור כלי לספרייה</span>
            </button>

            {/* רשימת הכלים השמורים */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {tools.map((tool) => (
                <div
                  key={tool.id}
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{tool.name}</span>
                      {tool.measuredByAi && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: 'rgba(234, 88, 12, 0.14)',
                            color: 'var(--accent-volt)',
                          }}
                        >
                          נמדד ב-AI
                        </span>
                      )}
                    </div>
                    <div className="num-mono" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                      {[
                        tool.diameterCm ? `קוטר ${tool.diameterCm} ס״מ` : '',
                        tool.depthCm ? `עומק ${tool.depthCm} ס״מ` : '',
                        tool.volumeMl ? `${tool.volumeMl} מ״ל` : '',
                        tool.defaultFoodGrams ? `מנה ממוצעת ${tool.defaultFoodGrams}g` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteTool(tool.id)}
                    disabled={saving}
                    className="btn-surface"
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} color="#f87171" />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              יחידות המידה שתגדיר כאן יופיעו אוטומטית בבחירת היחידות של מאגר המזון ובפענוח ה-AI.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.7fr', gap: 8 }}>
              <TextInput
                size="xs"
                label="שם היחידה"
                placeholder="למשל: מצקת אורז שלי"
                value={unitName}
                onChange={(e) => setUnitName(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                label="למזון (אופציונלי)"
                placeholder="למשל: פסטה / אורז"
                value={unitKeyword}
                onChange={(e) => setUnitKeyword(e.currentTarget.value)}
              />
              <NumberInput
                size="xs"
                label="משקל בגרם"
                value={unitGrams}
                onChange={setUnitGrams}
                min={1}
                max={3000}
                step={5}
              />
            </div>

            <button
              type="button"
              disabled={saving || !unitName.trim()}
              onClick={handleAddUnit}
              className="btn-volt"
              style={{
                padding: '9px',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              {saving ? (
                <Loader2 size={14} className="spot-spinner" />
              ) : (
                <Plus size={14} />
              )}
              <span>הוסף יחידת מידה</span>
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
              {customUnits.map((u) => (
                <div
                  key={u.id}
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    padding: '8px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {u.unitName}{' '}
                      <span className="num-mono" style={{ color: 'var(--accent-volt)' }}>
                        ({u.grams}g)
                      </span>
                    </div>
                    {u.foodNameKeyword && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        מותאם ל: {u.foodNameKeyword}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteUnit(u.id)}
                    disabled={saving}
                    className="btn-surface"
                    style={{
                      width: 28,
                      height: 28,
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} color="#f87171" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
