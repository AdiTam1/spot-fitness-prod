'use client';

import React, { useState } from 'react';
import { Select, TextInput } from '@mantine/core';
import { Loader2, Plus, Sparkles, X } from 'lucide-react';
import { QuickChipCategory, QuickContextChip } from '@/types/nutrition';

interface QuickChipsAdminPanelProps {
  title: string;
  subtitle: string;
  scope: 'group' | 'global';
  groupId?: string;
  chips: QuickContextChip[];
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

const CHIP_CAT_OPTIONS: { value: QuickChipCategory; label: string }[] = [
  { value: 'oil', label: 'שמן / טיגון' },
  { value: 'sauce', label: 'רוטב' },
  { value: 'prep', label: 'הכנה / בישול' },
  { value: 'portion', label: 'כמות / גודל מנה' },
  { value: 'drink', label: 'שתייה / צד' },
  { value: 'source', label: 'מקור המנה' },
  { value: 'tool-hint', label: 'כלי הגשה' },
];

export function QuickChipsAdminPanel({
  title,
  subtitle,
  scope,
  groupId,
  chips,
  onManageQuickChips,
}: QuickChipsAdminPanelProps) {
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<QuickChipCategory>('prep');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  if (!onManageQuickChips) return null;

  const handleAdd = async () => {
    const clean = label.trim();
    if (!clean) return;
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await onManageQuickChips({
        scope,
        op: 'upsert',
        groupId,
        chip: { label: clean, category },
      });
      if (res.error) {
        setErrMsg(res.error);
        return;
      }
      setLabel('');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (chipId: string) => {
    setBusy(true);
    setErrMsg(null);
    try {
      const res = await onManageQuickChips({
        scope,
        op: 'delete',
        groupId,
        chipId,
      });
      if (res.error) setErrMsg(res.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} color="var(--text-2)" />
          {title}
        </h2>
        <span style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{subtitle}</span>
      </div>

      {errMsg && (
        <div role="alert" style={{ fontSize: 13, color: 'var(--danger-text)', fontWeight: 600 }}>
          {errMsg}
        </div>
      )}

      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--line)',
          borderRadius: 24,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <TextInput
          label="טקסט הצ׳יפ"
          placeholder="למשל: בלי רוטב / טחינה כף"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <Select
          label="קטגוריה"
          value={category}
          allowDeselect={false}
          onChange={(v) => setCategory((v as QuickChipCategory) || 'prep')}
          data={CHIP_CAT_OPTIONS}
        />
        <button
          type="button"
          disabled={busy || !label.trim()}
          onClick={handleAdd}
          className="btn-volt"
          style={{ height: 48, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
        >
          {busy ? <Loader2 size={15} className="spot-spinner" /> : <Plus size={15} />}
          <span>הוסף צ׳יפ</span>
        </button>
      </div>

      {chips.length === 0 ? (
        <span style={{ fontSize: 13, color: 'var(--text-3)' }}>טרם הוגדרו צ׳יפים ברמה זו.</span>
      ) : (
        CHIP_CAT_OPTIONS.map((cat) => {
          const inCat = chips.filter((c) => c.category === cat.value);
          if (inCat.length === 0) return null;
          return (
            <div key={cat.value} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{cat.label}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {inCat.map((c) => (
                  <span
                    key={c.id}
                    style={{
                      height: 36,
                      padding: '0 4px 0 14px',
                      borderRadius: 999,
                      border: '1px solid var(--line-2)',
                      fontSize: 14,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {c.label}
                    <button
                      type="button"
                      aria-label={`הסר צ׳יפ ${c.label}`}
                      disabled={busy}
                      onClick={() => handleDelete(c.id)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-2)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
