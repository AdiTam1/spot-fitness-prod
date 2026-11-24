'use client';

import React, { useMemo, useState } from 'react';
import { Collapse, Select, TextInput } from '@mantine/core';
import { ChevronDown, ChevronUp, Plus, Ruler, SlidersHorizontal, Utensils } from 'lucide-react';
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

  return (
    <div
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 14,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* שורה עליונה: כלי הגשה + כפתור ניהול כלים */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800 }}>
          <SlidersHorizontal size={12} color="var(--accent-volt)" />
          <span>דיוק מהיר (הכל ברירת מחדל: ללא)</span>
        </div>

        <div style={{ display: 'flex', gap: 5 }}>
          <button
            type="button"
            onClick={onOpenToolsModal}
            className="btn-surface"
            style={{
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
              borderColor: 'rgba(214, 125, 9, 0.3)',
            }}
          >
            <Ruler size={11} color="var(--accent-volt)" />
            <span>הכלים והיחידות שלי ({customServingTools.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setDetailsOpen((p) => !p)}
            className="btn-surface"
            style={{
              padding: '4px 8px',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              cursor: 'pointer',
            }}
          >
            <span>שדות נוספים</span>
            {detailsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* צ׳יפים של כלי ההגשה השמורים של המשתמש */}
      {customServingTools.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>
            <Utensils size={10} style={{ marginLeft: 3, verticalAlign: 'middle' }} />
            כלי:
          </span>
          {customServingTools.map((tool) => {
            const active = contextParams.servingToolId === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => selectServingTool(tool)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: active ? '1px solid var(--sel-bg)'
                    : '1px solid rgba(56, 189, 248, 0.3)',
                  background: active ? 'var(--sel-bg)'
                    : 'rgba(56, 189, 248, 0.08)',
                  color: active ? 'var(--sel-text)' : '#7dd3fc',
                }}
              >
                {tool.name}
                {tool.diameterCm ? ` (${tool.diameterCm} ס״מ)` : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* צ׳יפים מהירים לבחירה בקליק (MRU פר-משתמש + קבוצה + מערכת) */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        {mergedChips.slice(0, 14).map((chip) => {
          const active = activeChipLabels.includes(chip.label);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => toggleChip(chip)}
              style={{
                padding: '4px 8px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                cursor: 'pointer',
                border: active ? '1px solid var(--sel-bg)'
                  : '1px solid var(--border-subtle)',
                background: active ? 'var(--sel-bg)'
                  : 'var(--bg-surface-1)',
                color: active ? 'var(--sel-text)' : 'var(--text-secondary)',
              }}
            >
              {active ? '✓ ' : ''}
              {chip.label}
              {chip.originBadge && chip.originBadge !== 'שלי' && (
                <span style={{ fontSize: 9, opacity: 0.65, marginRight: 4 }}>
                  ({chip.originBadge})
                </span>
              )}
            </button>
          );
        })}

        {onManageQuickChips && traineeId && (
          <button
            type="button"
            onClick={() => setAddingChipOpen((p) => !p)}
            style={{
              padding: '4px 8px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px dashed rgba(214, 125, 9, 0.4)',
              background: 'transparent',
              color: 'var(--accent-volt)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Plus size={10} />
            <span>צ׳יפ אישי</span>
          </button>
        )}
      </div>

      {addingChipOpen && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.3fr 0.8fr auto',
            gap: 6,
            alignItems: 'end',
          }}
        >
          <TextInput
            size="xs"
            placeholder="למשל: בלי גלוטן / חמאת בוטנים 10g"
            value={newChipLabel}
            onChange={(e) => setNewChipLabel(e.currentTarget.value)}
          />
          <Select
            size="xs"
            value={newChipCat}
            onChange={(v) => setNewChipCat((v as QuickChipCategory) || 'prep')}
            data={[
              { value: 'sauce', label: 'רוטב / שמן' },
              { value: 'prep', label: 'הכנה / מצב' },
              { value: 'portion', label: 'כמות / משקל' },
              { value: 'drink', label: 'שתייה / צד' },
              { value: 'source', label: 'מקור המנה' },
            ]}
          />
          <button
            type="button"
            disabled={savingChip || !newChipLabel.trim()}
            onClick={handleSaveNewPersonalChip}
            className="btn-volt"
            style={{ padding: '6px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
          >
            שמור
          </button>
        </div>
      )}

      {/* שדות פירוט מורחב (מתקפל כדי לשמור על UI נקי) */}
      <Collapse in={detailsOpen}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            paddingTop: 6,
            borderTop: '1px solid var(--line)',
          }}
        >
          <TextInput
            size="xs"
            label="שומן נסתר / רטבים (ברירת מחדל: ללא)"
            placeholder="ללא (או למשל: כף שמן זית)"
            value={contextParams.saucesAndOils || ''}
            onChange={(e) =>
              onChangeContextParams({
                ...contextParams,
                saucesAndOils: e.currentTarget.value,
              })
            }
          />
          <TextInput
            size="xs"
            label="כמויות / משקל אמיתי"
            placeholder="למשל: 180 גרם אורז מבושל"
            value={contextParams.portionOrGrams || ''}
            onChange={(e) =>
              onChangeContextParams({
                ...contextParams,
                portionOrGrams: e.currentTarget.value,
              })
            }
          />
          <TextInput
            size="xs"
            label="מצב בישול / חיתוך"
            placeholder="למשל: מבושל / חזה עוף / פרגית"
            value={contextParams.prepState || ''}
            onChange={(e) =>
              onChangeContextParams({
                ...contextParams,
                prepState: e.currentTarget.value,
              })
            }
          />
          <TextInput
            size="xs"
            label="שתייה ותוספות בצד (ברירת מחדל: ללא)"
            placeholder="ללא (או קפה הפוך / קולה זירו)"
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
