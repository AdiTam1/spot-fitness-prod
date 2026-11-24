'use client';

import React, { useState } from 'react';
import { Select, TextInput } from '@mantine/core';
import { Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { QuickChipCategory, QuickContextChip } from '@/types/nutrition';

interface QuickChipsAdminPanelProps {
  title: string;
  subtitle: string;
  scope: 'group' | 'global';
  groupId?: string;
  chips: QuickContextChip[];
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

const CHIP_CAT_OPTIONS: { value: QuickChipCategory; label: string }[] = [
  { value: 'sauce', label: 'רוטב / שמן' },
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
    <div
      style={{
        background: 'var(--bg-surface-2)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--info-text)',
          }}
        >
          <Sparkles size={14} color="currentColor" />
          <span>{title}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
          {subtitle}
        </div>
      </div>

      {errMsg && (
        <div style={{ fontSize: 12, color: 'var(--danger-text)', fontWeight: 600 }}>{errMsg}</div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 0.9fr auto',
          gap: 8,
          alignItems: 'end',
        }}
      >
        <TextInput
          size="xs"
          label="טקסט הצ׳יפ המהיר"
          placeholder="למשל: בלי רוטב / פסטה מבושלת / טחינה כף"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
        />
        <Select
          size="xs"
          label="קטגוריה"
          value={category}
          onChange={(v) => setCategory((v as QuickChipCategory) || 'prep')}
          data={CHIP_CAT_OPTIONS}
        />
        <button
          type="button"
          disabled={busy || !label.trim()}
          onClick={handleAdd}
          className="btn-volt"
          style={{
            padding: '7px 12px',
            fontSize: 12,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            cursor: 'pointer',
          }}
        >
          {busy ? <Loader2 size={13} className="spot-spinner" /> : <Plus size={13} />}
          <span>הוסף צ׳יפ</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            טרם הוגדרו צ׳יפים ברמה זו.
          </span>
        ) : (
          chips.map((c) => (
            <span
              key={c.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                background: 'var(--bg-surface-1)',
                border: '1px solid var(--border-subtle)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <span>{c.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({c.category})</span>
              <button
                type="button"
                title="הסר צ׳יפ"
                disabled={busy}
                onClick={() => handleDelete(c.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={11} color="var(--danger-text)" />
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
