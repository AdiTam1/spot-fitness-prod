'use client';

import React, { useMemo, useState } from 'react';
import { Collapse, TextInput } from '@mantine/core';
import { SegmentedPill } from './ui/SegmentedPill';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Plus,
  Ruler,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AiChipQuantityEntry,
  AiContextParams,
  QuickChipCategory,
  QuickChipDropdownKind,
  QuickContextChip,
  TraineeCustomUnit,
  TraineeServingTool,
  UserRole,
} from '@/types/nutrition';
import { parseOptionalDecimal, sanitizeDecimalInput } from '@/lib/numericInput';

interface AiQuickContextPanelProps {
  traineeId?: string;
  actorRole?: UserRole;
  customServingTools: TraineeServingTool[];
  customFoodUnits: TraineeCustomUnit[];
  recentContextChips: QuickContextChip[];
  groupQuickChips: QuickContextChip[];
  globalQuickChips: QuickContextChip[];
  contextParams: AiContextParams;
  onChangeContextParams: (next: AiContextParams) => void;
  onOpenToolsModal: () => void;
  onManageQuickChips?: (payload: {
    scope: 'user' | 'group' | 'coach-trainees' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
}

/**
 * תגיות ברירת מחדל מאוחדות ומסודרות לפי השפעה קלורית יורדת
 * (שמן/טיגון -> אפייה/גריל -> רטבים עשירים -> תיבול יבש -> מקור -> הכנה -> שתייה).
 */
const BUILTIN_PRIORITY_CHIPS: Array<{
  label: string;
  category: QuickChipCategory;
  priorityOrder: number;
  dropdownKind?: QuickChipDropdownKind;
}> = [
  { label: 'ללא שמן בכלל', category: 'oil', priorityOrder: 10 },
  { label: 'מטוגן', category: 'oil', priorityOrder: 20 },
  { label: 'עם שמן', category: 'oil', priorityOrder: 30, dropdownKind: 'oil' },
  { label: 'אפוי / גריל', category: 'prep', priorityOrder: 40 },
  { label: 'עם רוטב', category: 'sauce', priorityOrder: 50, dropdownKind: 'sauce' },
  { label: 'רוטב מתבלינים בלבד', category: 'sauce', priorityOrder: 60 },
  { label: 'מסעדה', category: 'source', priorityOrder: 70 },
  { label: 'הכנה ביתית', category: 'source', priorityOrder: 80 },
  { label: 'מבושל', category: 'prep', priorityOrder: 90 },
  { label: 'ללא שתייה', category: 'drink', priorityOrder: 100 },
];

const BUILTIN_PRIORITY_BY_LABEL = new Map(
  BUILTIN_PRIORITY_CHIPS.map((b) => [b.label, b])
);

const QUICK_DROPDOWN_PRESETS: Array<{ amount: number; unit: 'tbsp' | 'g'; label: string }> = [
  { amount: 0.5, unit: 'tbsp', label: '0.5 כף' },
  { amount: 1, unit: 'tbsp', label: 'כף (1)' },
  { amount: 1.5, unit: 'tbsp', label: '1.5 כפות' },
  { amount: 2, unit: 'tbsp', label: '2 כפות' },
  { amount: 5, unit: 'g', label: '5 ג׳' },
  { amount: 15, unit: 'g', label: '15 ג׳' },
];

function inferDropdownKind(chip: QuickContextChip): QuickChipDropdownKind | undefined {
  if (chip.dropdownKind) return chip.dropdownKind;
  if (BUILTIN_PRIORITY_BY_LABEL.get(chip.label)?.dropdownKind) {
    return BUILTIN_PRIORITY_BY_LABEL.get(chip.label)!.dropdownKind;
  }
  if (/עם שמן|תוספת שמן|רוטב/i.test(chip.label) && !/ללא|בלי|מתבלינים/.test(chip.label)) {
    return chip.category === 'sauce' ? 'sauce' : 'oil';
  }
  return undefined;
}

function formatQtyBadge(qty?: AiChipQuantityEntry): string | null {
  if (!qty || !Number.isFinite(qty.amount) || qty.amount <= 0) return null;
  const unitLabel =
    qty.unit === 'tbsp'
      ? qty.amount === 1
        ? 'כף'
        : 'כפות'
      : qty.unit === 'tsp'
      ? qty.amount === 1
        ? 'כפית'
        : 'כפיות'
      : qty.unit === 'ml'
      ? 'מ״ל'
      : 'ג׳';
  return `${qty.amount} ${unitLabel}`;
}

function rebuildContextFields(
  base: AiContextParams,
  nextLabels: string[],
  nextQuantities: Record<string, AiChipQuantityEntry>,
  chipLookup: Map<string, QuickContextChip>
): AiContextParams {
  const prepParts: string[] = [];
  const sauceParts: string[] = [];
  const portionParts: string[] = [];
  const drinkParts: string[] = [];
  let mealSource: AiContextParams['mealSource'] = '';

  for (const label of nextLabels) {
    const chip = chipLookup.get(label);
    const cat = chip?.category || BUILTIN_PRIORITY_BY_LABEL.get(label)?.category || 'prep';
    const qtyText = formatQtyBadge(nextQuantities[label]);
    const labelWithQty = qtyText ? `${label} (${qtyText})` : label;

    if (cat === 'sauce') {
      sauceParts.push(labelWithQty);
    } else if (cat === 'prep' || cat === 'oil') {
      prepParts.push(labelWithQty);
    } else if (cat === 'portion') {
      portionParts.push(labelWithQty);
    } else if (cat === 'drink') {
      drinkParts.push(labelWithQty);
    } else if (cat === 'source') {
      if (label.includes('מסעדה')) mealSource = 'restaurant';
      else if (label.includes('בית')) mealSource = 'home';
      else if (label.includes('ארוז')) mealSource = 'packaged';
    }
  }

  return {
    ...base,
    activeChipLabels: nextLabels,
    chipQuantities: nextQuantities,
    saucesAndOils: sauceParts.length > 0 ? sauceParts.join(', ') : undefined,
    prepState: prepParts.length > 0 ? prepParts.join(', ') : undefined,
    drinksAndSides: drinkParts.length > 0 ? drinkParts.join(', ') : undefined,
    ...(portionParts.length > 0 ? { portionOrGrams: portionParts.join(', ') } : {}),
    mealSource,
  };
}

export function AiQuickContextPanel({
  traineeId,
  actorRole = 'trainee',
  customServingTools,
  customFoodUnits,
  recentContextChips,
  groupQuickChips,
  globalQuickChips,
  contextParams,
  onChangeContextParams,
  onOpenToolsModal,
  onManageQuickChips,
}: AiQuickContextPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [openDropdownLabel, setOpenDropdownLabel] = useState<string | null>(null);
  const [customQtyInput, setCustomQtyInput] = useState<string>('');
  const [customQtyUnit, setCustomQtyUnit] = useState<'tbsp' | 'g'>('tbsp');

  const [addingChipOpen, setAddingChipOpen] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipCat, setNewChipCat] = useState<QuickChipCategory>('oil');
  const [newChipHasDropdown, setNewChipHasDropdown] = useState(false);
  const [newChipShareScope, setNewChipShareScope] = useState<
    'user' | 'coach-trainees' | 'global'
  >('user');
  const [savingChip, setSavingChip] = useState(false);

  const mergedChips = useMemo(() => {
    const seenLabels = new Set<string>();
    const combined: (QuickContextChip & { originBadge?: string; sortOrder: number })[] = [];

    const pushIfNew = (
      c: QuickContextChip,
      originBadge: string | undefined,
      fallbackOrder: number
    ) => {
      if (seenLabels.has(c.label)) return;
      seenLabels.add(c.label);
      const builtin = BUILTIN_PRIORITY_BY_LABEL.get(c.label);
      const catWeight =
        c.category === 'oil'
          ? 25
          : c.category === 'sauce'
          ? 55
          : c.category === 'prep'
          ? 45
          : c.category === 'source'
          ? 75
          : 95;
      combined.push({
        ...c,
        originBadge,
        dropdownKind: c.dropdownKind || builtin?.dropdownKind,
        sortOrder: c.priorityOrder ?? builtin?.priorityOrder ?? catWeight + fallbackOrder * 0.01,
      });
    };

    // עדיפות לתגים מובנים בסדר הקלורי, ותגים אישיים/קבוצה/מאמן מצטרפים מיד לפי קטגוריה
    BUILTIN_PRIORITY_CHIPS.forEach((b, idx) => {
      pushIfNew(
        {
          id: `builtin-${idx}`,
          label: b.label,
          category: b.category,
          scope: 'global',
          priorityOrder: b.priorityOrder,
          dropdownKind: b.dropdownKind,
        },
        undefined,
        b.priorityOrder
      );
    });

    const sortedUser = [...recentContextChips].sort((a, b) =>
      (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '')
    );
    sortedUser.forEach((c, idx) => {
      const badge = c.scope === 'coach' ? 'מאמן' : 'שלי';
      pushIfNew(c, badge, idx + 1);
    });
    groupQuickChips.forEach((c, idx) => pushIfNew(c, 'קבוצה', idx + 10));
    globalQuickChips.forEach((c, idx) => pushIfNew(c, 'מערכת', idx + 20));

    return combined.sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 24);
  }, [recentContextChips, groupQuickChips, globalQuickChips]);

  const chipLookup = useMemo(() => {
    const m = new Map<string, QuickContextChip>();
    for (const c of mergedChips) m.set(c.label, c);
    return m;
  }, [mergedChips]);

  const activeChipLabels = contextParams.activeChipLabels || [];
  const chipQuantities = contextParams.chipQuantities || {};

  // חשוב: ללא ביטול אוטומטי בין תגים סותרים! שתי תגיות יכולות להיות מסומנות יחד (והשרת מחמיר קלורית)
  const toggleChip = (chip: QuickContextChip) => {
    const exists = activeChipLabels.includes(chip.label);
    const nextLabels = exists
      ? activeChipLabels.filter((l) => l !== chip.label)
      : [...activeChipLabels, chip.label];

    const nextQuantities = { ...chipQuantities };
    if (exists) {
      delete nextQuantities[chip.label];
      if (openDropdownLabel === chip.label) setOpenDropdownLabel(null);
    }

    onChangeContextParams(
      rebuildContextFields(
        { ...contextParams, customUnits: customFoodUnits },
        nextLabels,
        nextQuantities,
        chipLookup
      )
    );
  };

  const applyChipQuantity = (chipLabel: string, amount: number, unit: 'tbsp' | 'g') => {
    const nextLabels = activeChipLabels.includes(chipLabel)
      ? activeChipLabels
      : [...activeChipLabels, chipLabel];
    const nextQuantities = {
      ...chipQuantities,
      [chipLabel]: { amount, unit },
    };
    onChangeContextParams(
      rebuildContextFields(
        { ...contextParams, customUnits: customFoodUnits },
        nextLabels,
        nextQuantities,
        chipLookup
      )
    );
    setOpenDropdownLabel(null);
    setCustomQtyInput('');
  };

  const selectServingTool = (tool: TraineeServingTool) => {
    const isSame = contextParams.servingToolId === tool.id;
    if (isSame) {
      onChangeContextParams({
        ...contextParams,
        servingToolId: undefined,
        servingToolLabel: undefined,
        servingToolDiameterCm: undefined,
        servingToolDepthCm: undefined,
        servingToolVolumeMl: undefined,
      });
      return;
    }
    onChangeContextParams({
      ...contextParams,
      servingToolId: tool.id,
      servingToolLabel: tool.name,
      servingToolDiameterCm: tool.diameterCm,
      servingToolDepthCm: tool.depthCm,
      servingToolVolumeMl: tool.volumeMl,
      portionOrGrams:
        !contextParams.portionOrGrams && tool.defaultFoodGrams
          ? `כ-${tool.defaultFoodGrams} גרם (${tool.name})`
          : contextParams.portionOrGrams,
      customUnits: customFoodUnits,
    });
  };

  const handleSaveNewChip = async () => {
    const label = newChipLabel.trim();
    if (!label || !onManageQuickChips) return;
    if (newChipShareScope === 'user' && !traineeId) return;
    setSavingChip(true);
    try {
      const dropdownKind: QuickChipDropdownKind | undefined = newChipHasDropdown
        ? newChipCat === 'sauce'
          ? 'sauce'
          : 'oil'
        : undefined;
      const chipPayload: Partial<QuickContextChip> = {
        label,
        category: newChipCat,
        ...(dropdownKind ? { dropdownKind } : {}),
      };
      await onManageQuickChips({
        scope: newChipShareScope,
        op: 'upsert',
        ...(newChipShareScope === 'user' ? { traineeId } : {}),
        chip: chipPayload,
      });
      if (!activeChipLabels.includes(label)) {
        const nextLabels = [...activeChipLabels, label];
        onChangeContextParams(
          rebuildContextFields(
            { ...contextParams, customUnits: customFoodUnits },
            nextLabels,
            chipQuantities,
            chipLookup
          )
        );
      }
      setNewChipLabel('');
      setNewChipHasDropdown(false);
      setAddingChipOpen(false);
    } finally {
      setSavingChip(false);
    }
  };

  const hasConflictNotice =
    activeChipLabels.some((l) => /ללא שמן בכלל|רוטב מתבלינים בלבד/i.test(l)) &&
    activeChipLabels.some((l) => /עם שמן|מטוגן|בטיגון/i.test(l));

  const chipStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 36,
    padding: '0 12px',
    borderRadius: 999,
    fontFamily: 'inherit',
    fontSize: 13.5,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    border: `1px solid ${active ? 'var(--sel-border)' : 'var(--line-2)'}`,
    background: active ? 'var(--sel-bg)' : 'transparent',
    color: active ? 'var(--sel-text)' : 'var(--text)',
  });

  const shareScopeOptions = useMemo(() => {
    const opts: Array<{ value: 'user' | 'coach-trainees' | 'global'; label: string }> = [
      { value: 'user', label: 'אישי למתאמן זה' },
    ];
    if (actorRole === 'coach' || actorRole === 'admin') {
      opts.push({ value: 'coach-trainees', label: 'שתף לכל המתאמנים שלי' });
    }
    if (actorRole === 'admin') {
      opts.push({ value: 'global', label: 'גלובלית לכולם' });
    }
    return opts;
  }, [actorRole]);

  const activeDropdownChip = openDropdownLabel
    ? mergedChips.find((c) => c.label === openDropdownLabel)
    : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 700 }}>
            <SlidersHorizontal size={16} />
            בחר תגים לדיוק ה-AI
          </span>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            מסודר לפי השפעה קלורית · ללא תגים = זיהוי חזותי שקוף לשמן
          </span>
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onOpenToolsModal}
            className="glass"
            style={{ height: 40, padding: '0 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
          >
            <Ruler size={14} />
            <span>
              כלי הגשה (<bdi className="ltr-num">{customServingTools.length}</bdi>)
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen((p) => !p)}
            aria-expanded={detailsOpen}
            className="glass"
            style={{ height: 40, padding: '0 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
          >
            <span>משקל נטו / הערה</span>
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* כלי הגשה שמורים */}
      {customServingTools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>כלי הגשה</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {customServingTools.map((tool) => {
              const active = contextParams.servingToolId === tool.id;
              return (
                <button key={tool.id} type="button" onClick={() => selectServingTool(tool)} aria-pressed={active} style={chipStyle(active)}>
                  {active && <Check size={14} strokeWidth={2.8} />}
                  {tool.name}
                  {tool.diameterCm ? ` · ${tool.diameterCm} ס״מ` : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* רשימת תגים מאוחדת לפי סדר חשיבות */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {mergedChips.map((chip) => {
          const active = activeChipLabels.includes(chip.label);
          const dropdownKind = inferDropdownKind(chip);
          const qtyBadge = formatQtyBadge(chipQuantities[chip.label]);
          const isDropdownOpen = openDropdownLabel === chip.label;

          if (dropdownKind) {
            return (
              <div
                key={chip.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: 999,
                  border: `1px solid ${active ? 'var(--sel-border)' : 'var(--line-2)'}`,
                  background: active ? 'var(--sel-bg)' : 'transparent',
                  color: active ? 'var(--sel-text)' : 'var(--text)',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleChip(chip)}
                  aria-pressed={active}
                  style={{
                    minHeight: 36,
                    padding: '0 10px',
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    fontSize: 13.5,
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  {active && <Check size={14} strokeWidth={2.8} />}
                  <span>{chip.label}</span>
                  {qtyBadge && (
                    <span className="num-mono" style={{ fontSize: 12, opacity: 0.9 }}>
                      · {qtyBadge}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`בחר כמות עבור ${chip.label}`}
                  aria-expanded={isDropdownOpen}
                  onClick={() => {
                    if (isDropdownOpen) {
                      setOpenDropdownLabel(null);
                      return;
                    }
                    const existing = chipQuantities[chip.label];
                    setCustomQtyInput(existing ? String(existing.amount) : '');
                    setCustomQtyUnit(existing?.unit === 'g' ? 'g' : 'tbsp');
                    setOpenDropdownLabel(chip.label);
                  }}
                  style={{
                    minHeight: 36,
                    padding: '0 8px 0 10px',
                    border: 0,
                    borderInlineStart: `1px solid ${active ? 'var(--sel-border)' : 'var(--line)'}`,
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  {isDropdownOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
            );
          }

          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => toggleChip(chip)}
              aria-pressed={active}
              style={chipStyle(active)}
            >
              {active && <Check size={14} strokeWidth={2.8} />}
              <span>{chip.label}</span>
              {chip.originBadge &&
                chip.originBadge !== 'שלי' &&
                !BUILTIN_PRIORITY_BY_LABEL.has(chip.label) && (
                  <span style={{ fontSize: 11.5, opacity: 0.72 }}>· {chip.originBadge}</span>
                )}
            </button>
          );
        })}

        {onManageQuickChips && (traineeId || actorRole !== 'trainee') && !addingChipOpen && (
          <button
            type="button"
            onClick={() => setAddingChipOpen(true)}
            style={{ ...chipStyle(false), border: '1px dashed var(--line-2)' }}
          >
            <Plus size={14} />
            <span>הוסף תג</span>
          </button>
        )}
      </div>

      {/* הודעה שקטה בעת סימון תגיות סותרות */}
      {hasConflictNotice && (
        <div style={{ fontSize: 12, color: 'var(--warn-text)' }}>
          סומנו יחד תגיות סותרות לשמן — ה-AI ינקוט גישת החמרה קלורית (לפי &quot;עם שמן&quot;).
        </div>
      )}

      {/* דרופדאון עשרוני לבחירת כמות מדויקת לתגית נבחרת */}
      {activeDropdownChip && (
        <div
          style={{
            padding: 12,
            borderRadius: 18,
            background: 'var(--surface-2)',
            border: '1px solid var(--line-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              כמות עבור &quot;{activeDropdownChip.label}&quot;
            </span>
            <button
              type="button"
              onClick={() => setOpenDropdownLabel(null)}
              style={{
                border: 0,
                background: 'transparent',
                color: 'var(--text-2)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              סגור
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {QUICK_DROPDOWN_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyChipQuantity(activeDropdownChip.label, p.amount, p.unit)}
                className="glass"
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="decimal"
              dir="ltr"
              aria-label="כמות מותאמת"
              placeholder="למשל 0.5 או 7.5"
              value={customQtyInput}
              onChange={(e) => setCustomQtyInput(sanitizeDecimalInput(e.currentTarget.value))}
              style={{
                width: 110,
                height: 36,
                borderRadius: 12,
                border: '1px solid var(--line-2)',
                background: 'var(--card)',
                color: 'var(--text)',
                padding: '0 10px',
                fontSize: 14,
              }}
            />
            <SegmentedPill
              ariaLabel="יחידת מידה"
              size="sm"
              value={customQtyUnit}
              onChange={(v) => setCustomQtyUnit((v as 'tbsp' | 'g') || 'tbsp')}
              options={[
                { value: 'tbsp', label: 'כפות' },
                { value: 'g', label: 'גרם' },
              ]}
            />
            <button
              type="button"
              onClick={() => {
                const parsed = parseOptionalDecimal(customQtyInput);
                if (parsed !== undefined && parsed > 0) {
                  applyChipQuantity(activeDropdownChip.label, parsed, customQtyUnit);
                }
              }}
              className="btn-volt"
              style={{ height: 36, padding: '0 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              החל
            </button>
          </div>
        </div>
      )}

      {/* יצירת תג חדש (למשתמש / לכל מתאמני המאמן / לכל המשתמשים למנהל) */}
      {addingChipOpen && (
        <div
          style={{
            padding: 12,
            borderRadius: 18,
            background: 'var(--surface-2)',
            border: '1px solid var(--line-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              aria-label="שם תג חדש"
              autoFocus
              placeholder="למשל: חמאה / שמן קוקוס / רוטב סויה"
              value={newChipLabel}
              onChange={(e) => setNewChipLabel(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSaveNewChip();
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                height: 42,
                borderRadius: 999,
                border: '1px solid var(--line-2)',
                background: 'var(--card)',
                color: 'var(--text)',
                fontFamily: 'inherit',
                fontSize: 14.5,
                padding: '0 14px',
                outline: 'none',
              }}
            />
            <button
              type="button"
              disabled={savingChip || !newChipLabel.trim()}
              onClick={() => void handleSaveNewChip()}
              className="btn-volt"
              style={{ height: 42, padding: '0 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              שמור תג
            </button>
            <button
              type="button"
              onClick={() => setAddingChipOpen(false)}
              className="glass"
              style={{ height: 42, padding: '0 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer' }}
            >
              ביטול
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <SegmentedPill
              ariaLabel="סוג התג"
              size="sm"
              value={newChipCat}
              onChange={(v) => setNewChipCat((v as QuickChipCategory) || 'oil')}
              options={[
                { value: 'oil', label: 'שמן/טיגון' },
                { value: 'sauce', label: 'רוטב' },
                { value: 'prep', label: 'הכנה' },
                { value: 'source', label: 'מקור' },
                { value: 'drink', label: 'שתייה' },
              ]}
            />
            {(newChipCat === 'oil' || newChipCat === 'sauce') && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newChipHasDropdown}
                  onChange={(e) => setNewChipHasDropdown(e.currentTarget.checked)}
                />
                <span>עם בחירת כפות/גרם</span>
              </label>
            )}
          </div>
          {shareScopeOptions.length > 1 && (
            <SegmentedPill
              ariaLabel="שיתוף תג"
              size="sm"
              value={newChipShareScope}
              onChange={(v) =>
                setNewChipShareScope((v as 'user' | 'coach-trainees' | 'global') || 'user')
              }
              options={shareScopeOptions}
            />
          )}
        </div>
      )}

      {/* שדות נוספים מצומצמים (רק מה שלא קיים בתגים) */}
      <Collapse in={detailsOpen}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, paddingTop: 2 }}>
          <TextInput
            label="משקל נטו כולל של המנה / הוראת כמות"
            placeholder="למשל: 250 גרם סה״כ בצלחת (אופציונלי)"
            value={contextParams.portionOrGrams || ''}
            onChange={(e) =>
              onChangeContextParams({
                ...contextParams,
                portionOrGrams: e.currentTarget.value,
              })
            }
          />
          <TextInput
            label="הערת שתייה / תוספת חופשית בצד"
            placeholder="למשל: קולה זירו / פחית ספרייט"
            value={contextParams.drinksAndSides || ''}
            onChange={(e) =>
              onChangeContextParams({
                ...contextParams,
                drinksAndSides: e.currentTarget.value,
              })
            }
          />
        </div>
      </Collapse>
    </div>
  );
}
