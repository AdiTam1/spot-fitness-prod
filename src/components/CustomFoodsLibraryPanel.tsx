'use client';

import React, { useMemo, useState } from 'react';
import { TextInput } from '@mantine/core';
import {
  Edit3,
  Globe,
  Loader2,
  Plus,
  Search,
  Share2,
  Trash2,
  Utensils,
} from 'lucide-react';
import { notifications } from '@mantine/notifications';
import { CustomFoodItem, UserRole } from '@/types/nutrition';
import { getCustomFoodScopeLabel } from '@/lib/customFoods';
import {
  CustomFoodModal,
  CustomFoodsMutationResult,
} from './CustomFoodModal';

interface CustomFoodsLibraryPanelProps {
  mode: 'trainee-self' | 'trainee-inspector' | 'coach-library';
  actorRole: UserRole;
  traineeId?: string;
  traineeName?: string;
  foods: CustomFoodItem[];
  onMutated: (res: CustomFoodsMutationResult) => void;
  title?: string;
  subtitle?: string;
}

export function CustomFoodsLibraryPanel({
  mode,
  actorRole,
  traineeId,
  traineeName,
  foods,
  onMutated,
  title,
  subtitle,
}: CustomFoodsLibraryPanelProps) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<CustomFoodItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return foods;
    return foods.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.brand || '').toLowerCase().includes(q) ||
        (f.category || '').toLowerCase().includes(q)
    );
  }, [foods, query]);

  const canModifyItem = (item: CustomFoodItem) => {
    if (actorRole === 'admin') return true;
    if (actorRole === 'trainee') return item.scope === 'trainee';
    // מאמן רגיל לא עורך או מוחק מוצר מערכתי גלובלי
    return item.scope !== 'global';
  };

  const handleDelete = async (item: CustomFoodItem) => {
    setBusyId(`del-${item.id}`);
    try {
      const res = await fetch('/api/food/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'delete',
          id: item.id,
          scope: item.scope,
          traineeId: item.traineeId || traineeId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        notifications.show({
          color: 'red',
          message: data?.error || 'שגיאה במחיקת המוצר',
        });
        return;
      }
      onMutated(data as CustomFoodsMutationResult);
      notifications.show({
        color: 'gray',
        message: `המוצר "${item.name}" הוסר`,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleShare = async (
    item: CustomFoodItem,
    op: 'share-to-trainees' | 'share-global'
  ) => {
    setBusyId(`${op}-${item.id}`);
    try {
      const res = await fetch('/api/food/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op,
          sourceItemId: item.id,
          sourceTraineeId: item.traineeId || (item.scope === 'trainee' ? traineeId : undefined),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        notifications.show({
          color: 'red',
          message: data?.error || 'שגיאה בשיתוף המוצר',
        });
        return;
      }
      onMutated(data as CustomFoodsMutationResult);
      notifications.show({
        color: 'teal',
        message:
          op === 'share-global'
            ? `"${item.name}" שותף לכל המשתמשים באפליקציה!`
            : `"${item.name}" שותף לכל המתאמנים שלך!`,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 24,
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            <Utensils size={16} />
            <span>{title || `מוצרים אישיים (${foods.length})`}</span>
          </div>
          {subtitle && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn-volt"
          onClick={() => {
            setEditingFood(null);
            setModalOpen(true);
          }}
          style={{
            height: 40,
            padding: '0 14px',
            fontSize: 13.5,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          <span>מוצר חדש</span>
        </button>
      </div>

      {foods.length > 3 && (
        <TextInput
          placeholder="חפש במוצרים האישיים..."
          leftSection={<Search size={14} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      )}

      {filtered.length === 0 ? (
        <div
          style={{
            padding: 16,
            textAlign: 'center',
            borderRadius: 16,
            background: 'var(--surface-2, var(--bg-surface-2))',
            color: 'var(--text-muted)',
            fontSize: 13,
          }}
        >
          {foods.length === 0
            ? 'עדיין לא הוגדרו מוצרים אישיים. לחץ על "+ מוצר חדש" להוספת מוצר עם ערכים מותאמים אישית.'
            : 'לא נמצאו מוצרים התואמים לחיפוש.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((item) => {
            const canEdit = canModifyItem(item);
            const shareTraineeBusy = busyId === `share-to-trainees-${item.id}`;
            const shareGlobalBusy = busyId === `share-global-${item.id}`;
            const delBusy = busyId === `del-${item.id}`;

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 16,
                  background: 'var(--surface-2, var(--bg-surface-2))',
                  border: '1px solid var(--line)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)' }}>
                      {item.name}
                    </div>
                    <div
                      dir="ltr"
                      className="num-mono ltr-num"
                      style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}
                    >
                      100g: {item.per100g.calories} קק״ל · ח:{item.per100g.protein} · פ:{item.per100g.carbs} · ש:{item.per100g.fat}
                    </div>
                    {item.defaultServingLabel && item.defaultServingGrams && (
                      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                        יחידה מוגדרת: {item.defaultServingLabel} ({item.defaultServingGrams} גרם)
                      </div>
                    )}
                  </div>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background:
                        item.scope === 'global'
                          ? 'rgba(56, 189, 248, 0.14)'
                          : item.scope === 'coach-trainees'
                          ? 'rgba(16, 185, 129, 0.14)'
                          : 'var(--line)',
                      color:
                        item.scope === 'global'
                          ? '#0ea5e9'
                          : item.scope === 'coach-trainees'
                          ? '#10b981'
                          : 'var(--text-2)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getCustomFoodScopeLabel(item.scope)}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {(actorRole === 'coach' || actorRole === 'admin') &&
                    item.scope !== 'coach-trainees' &&
                    item.scope !== 'global' && (
                      <button
                        type="button"
                        disabled={shareTraineeBusy}
                        onClick={() => void handleShare(item, 'share-to-trainees')}
                        className="btn-surface"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11.5,
                          fontWeight: 700,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          cursor: 'pointer',
                        }}
                      >
                        {shareTraineeBusy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Share2 size={12} />
                        )}
                        <span>שתף לכל המתאמנים שלי</span>
                      </button>
                    )}

                  {actorRole === 'admin' && item.scope !== 'global' && (
                    <button
                      type="button"
                      disabled={shareGlobalBusy}
                      onClick={() => void handleShare(item, 'share-global')}
                      className="btn-surface"
                      style={{
                        padding: '5px 10px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        cursor: 'pointer',
                        color: '#0ea5e9',
                      }}
                    >
                      {shareGlobalBusy ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Globe size={12} />
                      )}
                      <span>שתף לכולם באפליקציה</span>
                    </button>
                  )}

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFood(item);
                          setModalOpen(true);
                        }}
                        className="btn-surface"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11.5,
                          fontWeight: 700,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={12} />
                        <span>ערוך</span>
                      </button>
                      <button
                        type="button"
                        disabled={delBusy}
                        onClick={() => void handleDelete(item)}
                        className="btn-surface"
                        style={{
                          padding: '5px 10px',
                          fontSize: 11.5,
                          fontWeight: 700,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                          color: '#ef4444',
                        }}
                      >
                        {delBusy ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                        <span>מחק</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CustomFoodModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        actorRole={actorRole}
        traineeId={mode === 'trainee-inspector' ? traineeId : undefined}
        traineeName={traineeName}
        initialFood={editingFood}
        defaultScope={
          mode === 'trainee-self' || mode === 'trainee-inspector'
            ? 'trainee'
            : 'coach-trainees'
        }
        zIndex={285}
        onSaved={onMutated}
      />
    </div>
  );
}
