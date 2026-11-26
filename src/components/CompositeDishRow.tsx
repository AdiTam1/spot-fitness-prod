'use client';

import React, { useState } from 'react';
import { Collapse, NumberInput, TextInput } from '@mantine/core';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { ItemTimePill } from './ui/ItemTimePill';
import { LoggedFoodItem } from '@/types/nutrition';
import {
  clampGrams,
  hasCompositeComponents,
  recalculateParentDish,
  resolveConfidenceLabelHe,
  scaleCompositeDishByFactor,
  scaleLoggedItemToGrams,
  scaleSimpleFoodItemGrams,
  stripNestedComponents,
} from '@/lib/compositeDishes';
import { parseOptionalDecimal } from '@/lib/numericInput';

export interface ItemFieldDraft {
  grams?: string | number;
  calories?: string | number;
  protein?: string | number;
  carbs?: string | number;
  fat?: string | number;
}

interface CompositeDishRowProps {
  item: LoggedFoodItem;
  mealTimeFallback: string;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleSelectTop: (item: LoggedFoodItem) => void;
  onToggleSelectComponent: (parent: LoggedFoodItem, component: LoggedFoodItem) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdateItem: (nextItem: LoggedFoodItem) => void;
  onRemoveItem: (itemId: string) => void;
  onRequestAddIngredient?: (dishId: string) => void;
  canSyncBackPreset?: boolean;
  onSyncBackPreset?: (dish: LoggedFoodItem) => void;
  itemDraft?: ItemFieldDraft;
  onDraftChange?: (id: string, draft: ItemFieldDraft | null) => void;
}

function CheckboxPill({
  checked,
  indeterminate,
  ariaLabel,
  onClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  ariaLabel: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      onClick={onClick}
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        border: `1.5px solid ${checked || indeterminate ? 'var(--accent)' : 'var(--line-2)'}`,
        background: checked || indeterminate ? 'var(--accent)' : 'transparent',
        color: 'var(--on-accent)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
      }}
    >
      {indeterminate ? (
        <Minus size={14} strokeWidth={2.8} />
      ) : checked ? (
        <Check size={14} strokeWidth={2.8} />
      ) : null}
    </button>
  );
}

export function CompositeDishRow({
  item,
  mealTimeFallback,
  selectionMode,
  selectedIds,
  onToggleSelectTop,
  onToggleSelectComponent,
  isExpanded,
  onToggleExpand,
  onUpdateItem,
  onRemoveItem,
  onRequestAddIngredient,
  canSyncBackPreset,
  onSyncBackPreset,
  itemDraft,
  onDraftChange,
}: CompositeDishRowProps) {
  const isComposite = hasCompositeComponents(item);
  const [compEditingId, setCompEditingId] = useState<string | null>(null);
  const [compDrafts, setCompDrafts] = useState<Record<string, ItemFieldDraft>>({});

  const stepForGrams = (g: number) => (g <= 15 ? 1 : 10);

  const applySimpleMacroChange = (
    target: LoggedFoodItem,
    field: 'calories' | 'protein' | 'carbs' | 'fat',
    val: string | number,
    isChildComponent: boolean
  ) => {
    const updater = isChildComponent
      ? (nextDraft: ItemFieldDraft) =>
          setCompDrafts((prev) => ({
            ...prev,
            [target.id]: { ...(prev[target.id] || {}), ...nextDraft },
          }))
      : (nextDraft: ItemFieldDraft) =>
          onDraftChange?.(target.id, { ...(itemDraft || {}), ...nextDraft });

    updater({ [field]: val });
    const parsed = parseOptionalDecimal(val);
    if (parsed === undefined || parsed < 0) return;

    const normalized =
      field === 'calories' ? Math.round(parsed) : Math.round(parsed * 10) / 10;
    if (normalized === target.macros[field]) return;
    const nextMacros = { ...target.macros, [field]: normalized };
    const nextTarget: LoggedFoodItem = {
      ...target,
      macros: nextMacros,
      inputConfidence: 'reported',
    };

    if (isChildComponent && isComposite) {
      const nextComps = item.components!.map((c) =>
        c.id === target.id ? nextTarget : c
      );
      onUpdateItem(recalculateParentDish({ ...item, components: nextComps }));
    } else {
      onUpdateItem(nextTarget);
    }
  };

  const applyComponentGramsChange = (
    comp: LoggedFoodItem,
    val: string | number
  ) => {
    setCompDrafts((prev) => ({
      ...prev,
      [comp.id]: { ...(prev[comp.id] || {}), grams: val },
    }));
    const parsed = parseOptionalDecimal(val);
    if (parsed === undefined || parsed <= 0) return;

    const clamped = clampGrams(parsed, comp.grams);
    if (Math.round(clamped * 10) === Math.round(comp.grams * 10)) return;

    const scaled = scaleSimpleFoodItemGrams(
      { ...comp, inputConfidence: 'reported' },
      clamped
    );
    const nextComps = item.components!.map((c) =>
      c.id === comp.id ? stripNestedComponents(scaled) : c
    );
    onUpdateItem(recalculateParentDish({ ...item, components: nextComps }));
  };

  // חישוב מצב Checkbox להורה + מרכיבים
  const isParentDirectSelected = selectedIds.has(item.id);
  const selectedChildrenCount = isComposite
    ? item.components!.filter((c) => isParentDirectSelected || selectedIds.has(c.id))
        .length
    : 0;
  const isParentFullySelected = isComposite
    ? isParentDirectSelected ||
      (item.components!.length > 0 &&
        selectedChildrenCount === item.components!.length)
    : isParentDirectSelected;
  const isParentIndeterminate =
    isComposite && !isParentFullySelected && selectedChildrenCount > 0;

  const confidenceBadge = resolveConfidenceLabelHe(item.inputConfidence);
  const topStep = stepForGrams(item.grams);

  const applyTopItemScale = (factor: number) => {
    onDraftChange?.(item.id, null);
    onUpdateItem(scaleCompositeDishByFactor(item, factor));
  };

  const renderScaleControls = (label: string, extraRight?: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
        {label}
      </span>
      {[
        { label: '0.5×', f: 0.5 },
        { label: '1.5×', f: 1.5 },
        { label: '2×', f: 2 },
      ].map((sc) => (
        <button
          key={sc.label}
          type="button"
          onClick={() => applyTopItemScale(sc.f)}
          className="glass"
          style={{
            height: 28,
            padding: '0 9px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {sc.label}
        </button>
      ))}
      <CustomDishScaleInput onApply={applyTopItemScale} />
      {extraRight}
    </div>
  );

  return (
    <div
      style={{
        borderBottom: '1px solid var(--line)',
        padding: '10px 2px',
      }}
    >
      {/* שורה ראשית: כותרת מנה/פריט + סכום מאקרו + פס ג׳ */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {selectionMode && (
          <CheckboxPill
            checked={isParentFullySelected}
            indeterminate={isParentIndeterminate}
            ariaLabel={`בחר ${item.name}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelectTop(item);
            }}
          />
        )}

        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button
            type="button"
            aria-label={isExpanded ? `סגור ${item.name}` : `פתח ${item.name}`}
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
            style={{
              minWidth: 0,
              background: 'transparent',
              border: 0,
              padding: 0,
              textAlign: 'start',
              color: 'inherit',
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700 }}>{item.name}</span>
            {isComposite && (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--text-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Layers size={11} />
                <span>{item.components!.length} מרכיבים</span>
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </span>
            )}
            {item.recipeYieldGrams && item.recipeYieldGrams > 0 && (
              <span
                className="num-mono"
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'rgba(56, 189, 248, 0.14)',
                  color: 'var(--info-text)',
                }}
              >
                סיר {Math.round(item.recipeYieldGrams)}g
              </span>
            )}
            {item.coachBadge && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background:
                    item.coachBadge === 'new'
                      ? 'rgba(34, 197, 94, 0.16)'
                      : 'var(--sel-bg)',
                  color:
                    item.coachBadge === 'new'
                      ? 'var(--ok-text)'
                      : 'var(--sel-text)',
                  border:
                    item.coachBadge === 'new'
                      ? '1px solid rgba(34, 197, 94, 0.38)'
                      : '1px solid var(--sel-border)',
                }}
              >
                {item.coachBadge === 'new' ? 'חדש מהמאמן' : 'נערך ע״י המאמן'}
              </span>
            )}
            {!isComposite && confidenceBadge === 'הערכת AI' && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: 999,
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: 'var(--warn-text)',
                }}
              >
                הערכת AI
              </span>
            )}
          </button>

          <div
            onClick={onToggleExpand}
            style={{
              fontSize: 12.5,
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            <span>
              <bdi dir="ltr" className="num-mono ltr-num" style={{ fontWeight: 700, color: 'var(--text)' }}>
                {item.macros.calories}
              </bdi>{' '}
              קק״ל
            </span>
            <span>· ח׳ {item.macros.protein}g · פ׳ {item.macros.carbs}g · ש׳ {item.macros.fat}g</span>
            {item.isAiFallback ? ' · לא AI' : item.aiEngine && !isComposite ? ' · AI' : ''}
            {item.itemTime ? ` · ${item.itemTime}` : ''}
            {item.coachBadge === 'edited' && item.coachPrevSummary
              ? ` · קודם: ${item.coachPrevSummary}`
              : ''}
          </div>
        </div>

        {/* סטפר מהיר (- / +) שעובד גם על מנה שלמה בפרופורציה! */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            padding: 3,
            borderRadius: 999,
            background: 'var(--surface-2)',
            flex: 'none',
          }}
        >
          <button
            type="button"
            aria-label={`הפחת כמות ${item.name}`}
            onClick={() => {
              onDraftChange?.(item.id, null);
              onUpdateItem(
                scaleLoggedItemToGrams(
                  item,
                  clampGrams(item.grams - topStep, 0.5)
                )
              );
            }}
            style={{
              width: 38,
              height: 36,
              borderRadius: 999,
              border: 0,
              background: 'transparent',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Minus size={15} strokeWidth={2.2} />
          </button>
          <bdi
            dir="ltr"
            className="num-mono ltr-num"
            style={{ minWidth: 52, textAlign: 'center', fontSize: 13.5, fontWeight: 600 }}
          >
            {item.grams % 1 === 0 ? Math.round(item.grams) : item.grams} ג׳
          </bdi>
          <button
            type="button"
            aria-label={`הוסף כמות ${item.name}`}
            onClick={() => {
              onDraftChange?.(item.id, null);
              onUpdateItem(
                scaleLoggedItemToGrams(
                  item,
                  clampGrams(item.grams + topStep, item.grams)
                )
              );
            }}
            style={{
              width: 38,
              height: 36,
              borderRadius: 999,
              border: 0,
              background: 'transparent',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Plus size={15} strokeWidth={2.2} />
          </button>
        </span>
      </div>

      {/* תצוגת עריכה מורחבת: מנה מורכבת או פריט רגיל */}
      <Collapse in={isExpanded}>
        {isComposite ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              borderRadius: 16,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* כותרת ניהול המנה: שינוי שם, שעה, Scale מהיר למנה כולה */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 8,
                alignItems: 'end',
              }}
            >
              <TextInput
                size="xs"
                label="שם המנה"
                value={item.name}
                onChange={(e) => {
                  const nextName = e.currentTarget.value;
                  if (nextName === item.name) return;
                  onUpdateItem({ ...item, name: nextName });
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                  שעה למנה
                </span>
                <ItemTimePill
                  value={item.itemTime}
                  fallbackTime={mealTimeFallback}
                  placeholderLabel={mealTimeFallback}
                  ariaLabel={`שעה עבור ${item.name}`}
                  clearAriaLabel={`אפס שעה עבור ${item.name}`}
                  height={52}
                  onChange={(val) => {
                    const clean =
                      !item.itemTime && val === mealTimeFallback ? undefined : val || undefined;
                    if ((clean || '') === (item.itemTime || '')) return;
                    onUpdateItem({ ...item, itemTime: clean });
                  }}
                />
              </div>
            </div>

            {/* סקיילינג לכל המנה בלחיצה + עדכון Preset אם שונתה */}
            {renderScaleControls(
              'הכפל / הקטן מנה:',
              canSyncBackPreset && onSyncBackPreset ? (
                <button
                  type="button"
                  onClick={() => onSyncBackPreset(item)}
                  className="glass"
                  style={{
                    height: 28,
                    padding: '0 10px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={11} />
                  <span>עדכן &quot;{item.name}&quot; בספרייה</span>
                </button>
              ) : undefined
            )}

            {/* רשימת מרכיבי המנה (רמה 3) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {item.components!.map((comp) => {
                const isCompSelected =
                  isParentDirectSelected || selectedIds.has(comp.id);
                const isCompEditing = compEditingId === comp.id;
                const cDraft = compDrafts[comp.id];
                const cConf = resolveConfidenceLabelHe(comp.inputConfidence);
                const cStep = stepForGrams(comp.grams);

                return (
                  <div
                    key={comp.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 12,
                      background: 'var(--card)',
                      border: '1px solid var(--line)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {selectionMode && (
                        <CheckboxPill
                          checked={isCompSelected}
                          ariaLabel={`בחר מרכיב ${comp.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelectComponent(item, comp);
                          }}
                        />
                      )}

                      <div
                        onClick={() =>
                          setCompEditingId(isCompEditing ? null : comp.id)
                        }
                        style={{ minWidth: 0, flex: 1, cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700 }}>
                            {comp.name}
                          </span>
                          {comp.componentRole === 'cooking-oil' && (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 999,
                                background: 'rgba(245, 158, 11, 0.16)',
                                color: 'var(--warn-text)',
                              }}
                            >
                              שמן
                            </span>
                          )}
                          {comp.componentRole === 'spice-group' && (
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: 999,
                                background: 'var(--surface-2)',
                                color: 'var(--text-2)',
                              }}
                            >
                              תבלינים מאוחדים
                            </span>
                          )}
                          {cConf === 'הערכת AI' && comp.componentRole !== 'cooking-oil' && (
                            <span
                              style={{
                                fontSize: 10.5,
                                padding: '1px 6px',
                                borderRadius: 999,
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: 'var(--warn-text)',
                              }}
                            >
                              הערכת AI
                            </span>
                          )}
                        </div>
                        {comp.spiceDetails && comp.spiceDetails.length > 0 && (
                          <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                            זוהו: {comp.spiceDetails.join(', ')}
                          </div>
                        )}
                        <div className="num-mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {comp.macros.calories} קק״ל · ח׳ {comp.macros.protein}g · פ׳{' '}
                          {comp.macros.carbs}g · ש׳ {comp.macros.fat}g
                        </div>
                      </div>

                      {/* סטפר למרכיב */}
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 1,
                          padding: 2,
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          flexShrink: 0,
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`הפחת ${comp.name}`}
                          onClick={() => {
                            const nextG = clampGrams(comp.grams - cStep, 0.5);
                            const scaled = scaleSimpleFoodItemGrams(
                              { ...comp, inputConfidence: 'reported' },
                              nextG
                            );
                            onUpdateItem(
                              recalculateParentDish({
                                ...item,
                                components: item.components!.map((c) =>
                                  c.id === comp.id ? stripNestedComponents(scaled) : c
                                ),
                              })
                            );
                          }}
                          style={{
                            width: 30,
                            height: 28,
                            borderRadius: 999,
                            border: 0,
                            background: 'transparent',
                            color: 'var(--text-2)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Minus size={13} />
                        </button>
                        <bdi
                          dir="ltr"
                          className="num-mono ltr-num"
                          style={{ minWidth: 42, textAlign: 'center', fontSize: 12.5, fontWeight: 700 }}
                        >
                          {comp.grams % 1 === 0 ? Math.round(comp.grams) : comp.grams}g
                        </bdi>
                        <button
                          type="button"
                          aria-label={`הוסף ${comp.name}`}
                          onClick={() => {
                            const nextG = clampGrams(comp.grams + cStep, comp.grams);
                            const scaled = scaleSimpleFoodItemGrams(
                              { ...comp, inputConfidence: 'reported' },
                              nextG
                            );
                            onUpdateItem(
                              recalculateParentDish({
                                ...item,
                                components: item.components!.map((c) =>
                                  c.id === comp.id ? stripNestedComponents(scaled) : c
                                ),
                              })
                            );
                          }}
                          style={{
                            width: 30,
                            height: 28,
                            borderRadius: 999,
                            border: 0,
                            background: 'transparent',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Plus size={13} />
                        </button>
                      </span>
                    </div>

                    <Collapse in={isCompEditing}>
                      <div
                        style={{
                          paddingTop: 6,
                          borderTop: '1px solid var(--line)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <TextInput
                          size="xs"
                          label="שם המרכיב"
                          value={comp.name}
                          onChange={(e) => {
                            const name = e.currentTarget.value;
                            onUpdateItem(
                              recalculateParentDish({
                                ...item,
                                components: item.components!.map((c) =>
                                  c.id === comp.id ? { ...c, name } : c
                                ),
                              })
                            );
                          }}
                        />
                        <div className="spot-macro-5-grid">
                          <NumberInput
                            size="xs"
                            label="גרם"
                            value={cDraft?.grams !== undefined ? cDraft.grams : comp.grams}
                            min={0.1}
                            max={10000}
                            decimalScale={1}
                            step={0.5}
                            clampBehavior="none"
                            onChange={(val) => applyComponentGramsChange(comp, val)}
                          />
                          <NumberInput
                            size="xs"
                            label="קק״ל"
                            value={cDraft?.calories !== undefined ? cDraft.calories : comp.macros.calories}
                            min={0}
                            clampBehavior="none"
                            onChange={(val) => applySimpleMacroChange(comp, 'calories', val, true)}
                          />
                          <NumberInput
                            size="xs"
                            label="חלבון"
                            value={cDraft?.protein !== undefined ? cDraft.protein : comp.macros.protein}
                            min={0}
                            decimalScale={1}
                            clampBehavior="none"
                            onChange={(val) => applySimpleMacroChange(comp, 'protein', val, true)}
                          />
                          <NumberInput
                            size="xs"
                            label="פחמימה"
                            value={cDraft?.carbs !== undefined ? cDraft.carbs : comp.macros.carbs}
                            min={0}
                            decimalScale={1}
                            clampBehavior="none"
                            onChange={(val) => applySimpleMacroChange(comp, 'carbs', val, true)}
                          />
                          <NumberInput
                            size="xs"
                            label="שומן"
                            value={cDraft?.fat !== undefined ? cDraft.fat : comp.macros.fat}
                            min={0}
                            decimalScale={1}
                            clampBehavior="none"
                            onChange={(val) => applySimpleMacroChange(comp, 'fat', val, true)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const remaining = item.components!.filter((c) => c.id !== comp.id);
                            if (remaining.length === 0) {
                              onRemoveItem(item.id);
                            } else {
                              onUpdateItem(
                                recalculateParentDish({ ...item, components: remaining })
                              );
                            }
                          }}
                          style={{
                            alignSelf: 'flex-start',
                            background: 'transparent',
                            border: 0,
                            padding: '4px 0',
                            color: 'var(--danger-text)',
                            fontSize: 12.5,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={13} />
                          <span>הסר מרכיב מהמנה</span>
                        </button>
                      </div>
                    </Collapse>
                  </div>
                );
              })}
            </div>

            {/* כפתורי פעולה תחתונים בתוך המנה */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {onRequestAddIngredient && (
                <button
                  type="button"
                  onClick={() => onRequestAddIngredient(item.id)}
                  className="btn-surface"
                  style={{
                    height: 34,
                    padding: '0 12px',
                    borderRadius: 999,
                    fontSize: 12.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={13} />
                  <span>הוסף מרכיב למנה</span>
                </button>
              )}
              <button
                type="button"
                aria-label={`הסר ${item.name}`}
                onClick={() => onRemoveItem(item.id)}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: '4px 0',
                  color: 'var(--danger-text)',
                  fontFamily: 'inherit',
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={14} />
                <span>הסר מנה שלמה</span>
              </button>
            </div>
          </div>
        ) : (
          /* פריט רגיל (שטוח) */
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 8,
                alignItems: 'end',
              }}
            >
              <TextInput
                size="xs"
                label="שם המרכיב"
                value={item.name}
                onChange={(e) => onUpdateItem({ ...item, name: e.currentTarget.value })}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                  שעה למנה
                </span>
                <ItemTimePill
                  value={item.itemTime}
                  fallbackTime={mealTimeFallback}
                  placeholderLabel={mealTimeFallback}
                  ariaLabel={`שעה עבור ${item.name}`}
                  clearAriaLabel={`אפס שעה עבור ${item.name}`}
                  height={52}
                  onChange={(val) => {
                    const clean =
                      !item.itemTime && val === mealTimeFallback ? undefined : val || undefined;
                    if ((clean || '') === (item.itemTime || '')) return;
                    onUpdateItem({ ...item, itemTime: clean });
                  }}
                />
              </div>
            </div>
            {renderScaleControls('הכפל / הקטן פריט:')}
            <div className="spot-macro-5-grid">
              <NumberInput
                size="xs"
                label="גרם"
                placeholder="100"
                value={itemDraft?.grams !== undefined ? itemDraft.grams : item.grams}
                min={0.1}
                max={10000}
                decimalScale={1}
                step={0.5}
                clampBehavior="none"
                onChange={(val) => {
                  onDraftChange?.(item.id, { ...(itemDraft || {}), grams: val });
                  const parsed = parseOptionalDecimal(val);
                  if (parsed !== undefined && parsed > 0) {
                    const clamped = clampGrams(parsed, item.grams);
                    if (Math.round(clamped * 10) === Math.round(item.grams * 10)) {
                      return;
                    }
                    const scaled = scaleSimpleFoodItemGrams(
                      { ...item, inputConfidence: 'reported' },
                      clamped
                    );
                    onUpdateItem(scaled);
                  }
                }}
              />
              <NumberInput
                size="xs"
                label="קק״ל"
                placeholder="0"
                value={itemDraft?.calories !== undefined ? itemDraft.calories : item.macros.calories}
                min={0}
                clampBehavior="none"
                onChange={(val) => applySimpleMacroChange(item, 'calories', val, false)}
              />
              <NumberInput
                size="xs"
                label="חלבון"
                placeholder="0"
                value={itemDraft?.protein !== undefined ? itemDraft.protein : item.macros.protein}
                min={0}
                decimalScale={1}
                clampBehavior="none"
                onChange={(val) => applySimpleMacroChange(item, 'protein', val, false)}
              />
              <NumberInput
                size="xs"
                label="פחמימה"
                placeholder="0"
                value={itemDraft?.carbs !== undefined ? itemDraft.carbs : item.macros.carbs}
                min={0}
                decimalScale={1}
                clampBehavior="none"
                onChange={(val) => applySimpleMacroChange(item, 'carbs', val, false)}
              />
              <NumberInput
                size="xs"
                label="שומן"
                placeholder="0"
                value={itemDraft?.fat !== undefined ? itemDraft.fat : item.macros.fat}
                min={0}
                decimalScale={1}
                clampBehavior="none"
                onChange={(val) => applySimpleMacroChange(item, 'fat', val, false)}
              />
            </div>
            <button
              type="button"
              aria-label={`הסר ${item.name}`}
              onClick={() => onRemoveItem(item.id)}
              style={{
                alignSelf: 'flex-start',
                minHeight: 36,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'transparent',
                border: 0,
                padding: 0,
                color: 'var(--danger-text)',
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={14} />
              הסר מרכיב
            </button>
          </div>
        )}
      </Collapse>
    </div>
  );
}

function CustomDishScaleInput({
  onApply,
}: {
  onApply: (factor: number) => void;
}) {
  const [draft, setDraft] = useState('');
  const normalized = draft.trim().replace(',', '.');
  const parsed = normalized ? Number(normalized) : NaN;
  const isValid =
    Number.isFinite(parsed) &&
    parsed >= 0.05 &&
    parsed <= 20 &&
    Math.abs(parsed - 1) > 1e-6;

  const commit = () => {
    if (!isValid) return;
    onApply(Math.round(parsed * 1000) / 1000);
    setDraft('');
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <input
        type="text"
        dir="ltr"
        inputMode="decimal"
        value={draft}
        aria-label="מקדם הכפלה מותאם אישית"
        placeholder="×0.7"
        onChange={(e) => {
          const val = e.target.value.replace(/[^0-9.,]/g, '');
          setDraft(val);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        className="num-mono ltr-num"
        style={{
          width: 58,
          height: 28,
          borderRadius: 999,
          border: '1px solid var(--line)',
          background: 'var(--surface-2)',
          color: 'var(--text)',
          fontSize: 12,
          fontWeight: 700,
          textAlign: 'center',
          padding: '0 7px',
          outline: 'none',
        }}
      />
      <button
        type="button"
        disabled={!isValid}
        onClick={commit}
        className="glass"
        style={{
          height: 28,
          padding: '0 9px',
          borderRadius: 999,
          fontSize: 11.5,
          fontWeight: 700,
          cursor: isValid ? 'pointer' : 'default',
          opacity: isValid ? 1 : 0.45,
        }}
      >
        החל
      </button>
    </span>
  );
}
