'use client';

import React, { useMemo, useState } from 'react';
import { Collapse, TextInput } from '@mantine/core';
import { SegmentedPill } from './ui/SegmentedPill';
import { Check, ChevronDown, ChevronUp, Plus, Ruler, SlidersHorizontal } from 'lucide-react';
import {
  AiContextParams,
  QuickChipCategory,
  QuickContextChip,
  TraineeCustomUnit,
  TraineeServingTool,
} from '@/types/nutrition';

interface AiQuickContextPanelProps {
  traineeId?: string;
  customServingTools: TraineeServingTool[];
  customFoodUnits: TraineeCustomUnit[];
  recentContextChips: QuickContextChip[];
  groupQuickChips: QuickContextChip[];
  globalQuickChips: QuickContextChip[];
  contextParams: AiContextParams;
  onChangeContextParams: (next: AiContextParams) => void;
  onOpenToolsModal: () => void;
  onManageQuickChips?: (payload: {
    scope: 'user' | 'group' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
}

const BUILTIN_DEFAULT_CHIPS: Omit<QuickContextChip, 'id' | 'scope'>[] = [
  { label: 'ללא שמן/רוטב נוסף', category: 'sauce' },
  { label: 'כף שמן זית (~10g)', category: 'sauce' },
  { label: 'מבושל', category: 'prep' },
  { label: 'צלוי / בתנור', category: 'prep' },
  { label: 'ללא שתייה', category: 'drink' },
  { label: 'הכנה ביתית', category: 'source' },
  { label: 'מסעדה', category: 'source' },
];

export function AiQuickContextPanel({
  traineeId,
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
  const [addingChipOpen, setAddingChipOpen] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipCat, setNewChipCat] = useState<QuickChipCategory>('prep');
  const [savingChip, setSavingChip] = useState(false);

  // מיזוג היררכי לפי סדר קדימויות: 1) משתמש לפי MRU, 2) קבוצה, 3) גלובלי ממנהל, 4) ברירת מחדל
  const mergedChips = useMemo(() => {
    const seenLabels = new Set<string>();
    const out: (QuickContextChip & { originBadge?: string })[] = [];

    const sortedUser = [...recentContextChips].sort((a, b) =>
      (b.lastUsedAt || '').localeCompare(a.lastUsedAt || '')
    );
    for (const c of sortedUser) {
      if (!seenLabels.has(c.label)) {
        seenLabels.add(c.label);
        out.push({ ...c, originBadge: 'שלי' });
      }
    }
    for (const c of groupQuickChips) {
      if (!seenLabels.has(c.label)) {
        seenLabels.add(c.label);
        out.push({ ...c, originBadge: 'קבוצה' });
      }
    }
    for (const c of globalQuickChips) {
      if (!seenLabels.has(c.label)) {
        seenLabels.add(c.label);
        out.push({ ...c, originBadge: 'מערכת' });
      }
    }
    BUILTIN_DEFAULT_CHIPS.forEach((b, idx) => {
      if (!seenLabels.has(b.label)) {
        seenLabels.add(b.label);
        out.push({
          id: `builtin-${idx}`,
          label: b.label,
          category: b.category,
          scope: 'global',
        });
      }
    });
    return out;
  }, [recentContextChips, groupQuickChips, globalQuickChips]);

  const activeChipLabels = contextParams.activeChipLabels || [];

  const toggleChip = (chip: QuickContextChip) => {
    const exists = activeChipLabels.includes(chip.label);
    const nextLabels = exists
      ? activeChipLabels.filter((l) => l !== chip.label)
      : [...activeChipLabels, chip.label];

    const updated: AiContextParams = {
      ...contextParams,
      activeChipLabels: nextLabels,
      customUnits: customFoodUnits,
    };

    if (!exists) {
      if (chip.category === 'sauce') {
        updated.saucesAndOils = chip.label.includes('ללא')
          ? 'ללא'
          : updated.saucesAndOils
          ? `${updated.saucesAndOils}, ${chip.label}`
          : chip.label;
      } else if (chip.category === 'prep') {
        updated.prepState = updated.prepState
          ? `${updated.prepState}, ${chip.label}`
          : chip.label;
      } else if (chip.category === 'portion') {
        updated.portionOrGrams = updated.portionOrGrams
          ? `${updated.portionOrGrams}, ${chip.label}`
          : chip.label;
      } else if (chip.category === 'drink') {
        updated.drinksAndSides = chip.label.includes('ללא')
          ? 'ללא'
          : updated.drinksAndSides
          ? `${updated.drinksAndSides}, ${chip.label}`
          : chip.label;
      } else if (chip.category === 'source') {
        if (chip.label.includes('מסעדה')) updated.mealSource = 'restaurant';
        else if (chip.label.includes('בית')) updated.mealSource = 'home';
        else if (chip.label.includes('ארוז')) updated.mealSource = 'packaged';
      }
    }

    onChangeContextParams(updated);
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

  const handleSaveNewPersonalChip = async () => {
    const label = newChipLabel.trim();
    if (!label || !onManageQuickChips || !traineeId) return;
    setSavingChip(true);
    try {
      const chipPayload: Partial<QuickContextChip> = {
        label,
        category: newChipCat,
      };
      await onManageQuickChips({
        scope: 'user',
        op: 'upsert',
        traineeId,
        chip: chipPayload,
      });
      toggleChip({
        id: `local-${Date.now()}`,
        label,
        category: newChipCat,
        scope: 'user',
      });
      setNewChipLabel('');
      setAddingChipOpen(false);
    } finally {
      setSavingChip(false);
    }
  };

  const CAT_ORDER: { id: QuickChipCategory; label: string }[] = [
    { id: 'sauce', label: 'רוטב / שמן' },
    { id: 'prep', label: 'הכנה / בישול' },
    { id: 'portion', label: 'כמות / גודל מנה' },
    { id: 'drink', label: 'שתייה / צד' },
    { id: 'source', label: 'מקור המנה' },
    { id: 'tool-hint', label: 'כלי הגשה' },
  ];
  const visibleChips = mergedChips.slice(0, 28);

  const chipStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 36,
    padding: '0 14px',
    borderRadius: 999,
    fontFamily: 'inherit',
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    border: `1px solid ${active ? 'var(--sel-border)' : 'var(--line-2)'}`,
    background: active ? 'var(--sel-bg)' : 'transparent',
    color: active ? 'var(--sel-text)' : 'var(--text)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header (design: AiQuickContext) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 700 }}>
            <SlidersHorizontal size={16} />
            דיוק מהיר
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>הכל ברירת מחדל: ללא</span>
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onOpenToolsModal}
            className="glass"
            style={{ height: 44, padding: '0 14px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <Ruler size={15} />
            <span>
              הכלים והיחידות שלי (<bdi className="ltr-num">{customServingTools.length}</bdi>)
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDetailsOpen((p) => !p)}
            aria-expanded={detailsOpen}
            className="glass"
            style={{ height: 44, padding: '0 14px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            <span>שדות נוספים</span>
            {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Saved serving tools */}
      {customServingTools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>כלי הגשה</span>
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

      {/* Quick chips grouped by category */}
      {CAT_ORDER.map((cat) => {
        const inCat = visibleChips.filter((c) => c.category === cat.id);
        if (inCat.length === 0) return null;
        return (
          <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{cat.label}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {inCat.map((chip) => {
                const active = activeChipLabels.includes(chip.label);
                return (
                  <button key={chip.id} type="button" onClick={() => toggleChip(chip)} aria-pressed={active} style={chipStyle(active)}>
                    {active && <Check size={14} strokeWidth={2.8} />}
                    {chip.label}
                    {chip.originBadge && chip.originBadge !== 'שלי' && (
                      <span style={{ fontSize: 12, opacity: 0.75 }}>· {chip.originBadge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Personal chip */}
      {onManageQuickChips && traineeId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!addingChipOpen ? (
            <button
              type="button"
              onClick={() => setAddingChipOpen(true)}
              style={{ ...chipStyle(false), border: '1px dashed var(--line-2)', alignSelf: 'flex-start' }}
            >
              <Plus size={14} />
              <span>צ׳יפ אישי</span>
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  aria-label="צ׳יפ אישי"
                  autoFocus
                  placeholder="צ׳יפ אישי (למשל: חמאת בוטנים 10g)"
                  value={newChipLabel}
                  onChange={(e) => setNewChipLabel(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleSaveNewPersonalChip();
                    }
                  }}
                  style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--text)', fontFamily: 'inherit', fontSize: 16, padding: '0 16px', outline: 'none' }}
                />
                <button
                  type="button"
                  disabled={savingChip || !newChipLabel.trim()}
                  onClick={handleSaveNewPersonalChip}
                  className="glass"
                  style={{ height: 48, padding: '0 18px', borderRadius: 999, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
                >
                  הוסף
                </button>
              </div>
              <SegmentedPill
                ariaLabel="קטגוריית הצ׳יפ"
                size="sm"
                value={newChipCat}
                onChange={(v) => setNewChipCat((v as QuickChipCategory) || 'prep')}
                options={[
                  { value: 'sauce', label: 'רוטב' },
                  { value: 'prep', label: 'הכנה' },
                  { value: 'portion', label: 'כמות' },
                  { value: 'drink', label: 'שתייה' },
                  { value: 'source', label: 'מקור' },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {/* Extended details */}
      <Collapse in={detailsOpen}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, paddingTop: 4 }}>
          <TextInput
            label="שומן נסתר / רטבים (ברירת מחדל: ללא)"
            placeholder="ללא (או למשל: כף שמן זית)"
            value={contextParams.saucesAndOils || ''}
            onChange={(e) => onChangeContextParams({ ...contextParams, saucesAndOils: e.currentTarget.value })}
          />
          <TextInput
            label="כמויות / משקל אמיתי"
            placeholder="למשל: 180 גרם אורז מבושל"
            value={contextParams.portionOrGrams || ''}
            onChange={(e) => onChangeContextParams({ ...contextParams, portionOrGrams: e.currentTarget.value })}
          />
          <TextInput
            label="מצב בישול / חיתוך"
            placeholder="למשל: מבושל / חזה עוף / פרגית"
            value={contextParams.prepState || ''}
            onChange={(e) => onChangeContextParams({ ...contextParams, prepState: e.currentTarget.value })}
          />
          <TextInput
            label="שתייה ותוספות בצד (ברירת מחדל: ללא)"
            placeholder="ללא (או קפה הפוך / קולה זירו)"
            value={contextParams.drinksAndSides || ''}
            onChange={(e) => onChangeContextParams({ ...contextParams, drinksAndSides: e.currentTarget.value })}
          />
        </div>
      </Collapse>
    </div>
  );
}
