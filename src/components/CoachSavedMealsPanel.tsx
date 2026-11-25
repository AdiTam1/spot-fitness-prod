'use client';

import React, { useMemo, useState } from 'react';
import { Modal, Select, Textarea } from '@mantine/core';
import {
  Bookmark,
  Check,
  Loader2,
  MessageCircle,
  Ruler,
  Send,
  Star,
  Utensils,
} from 'lucide-react';
import {
  TraineeCustomUnit,
  TraineeProfile,
  TraineeServingTool,
  UserRole,
} from '@/types/nutrition';
import { ServingToolsManagerModal } from './ServingToolsManagerModal';
import { CustomFoodsLibraryPanel } from './CustomFoodsLibraryPanel';
import type { CustomFoodsMutationResult } from './CustomFoodModal';

interface CoachSavedMealsPanelProps {
  trainee: TraineeProfile;
  actorRole?: UserRole;
  onReplySavedMeal?: (
    traineeId: string,
    payload: { presetId: string; reply: string; promoteToSlotId?: string }
  ) => Promise<{ error?: string }>;
  onManageToolsAndUnits?: (
    traineeId: string,
    payload: {
      customServingTools?: TraineeServingTool[];
      customFoodUnits?: TraineeCustomUnit[];
    }
  ) => Promise<{ error?: string }>;
  onCustomFoodsUpdated?: (res: CustomFoodsMutationResult) => void;
}

export function CoachSavedMealsPanel({
  trainee,
  actorRole = 'coach',
  onReplySavedMeal,
  onManageToolsAndUnits,
  onCustomFoodsUpdated,
}: CoachSavedMealsPanelProps) {
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [promoteSlots, setPromoteSlots] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [customFoodsOpen, setCustomFoodsOpen] = useState(false);
  const [banner, setBanner] = useState<{ msg: string; isError?: boolean } | null>(null);

  const sortedMeals = useMemo(() => {
    return [...(trainee.savedMeals || [])].sort((a, b) => {
      const aPending = a.coachQuestion?.status === 'pending' ? 1 : 0;
      const bPending = b.coachQuestion?.status === 'pending' ? 1 : 0;
      if (bPending !== aPending) return bPending - aPending;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
  }, [trainee.savedMeals]);

  const slotOptions = useMemo(() => {
    return [
      { value: '', label: 'ללא הוספה לאופציות מומלצות' },
      ...(trainee.workoutTemplate?.meals || []).map((s) => ({
        value: s.id,
        label: `קדם כאופציה ב: ${s.name}`,
      })),
    ];
  }, [trainee.workoutTemplate]);

  const handleSendReply = async (presetId: string) => {
    if (!onReplySavedMeal) return;
    const reply = (replyDrafts[presetId] || '').trim();
    if (!reply) return;
    setSendingId(presetId);
    setBanner(null);
    try {
      const promoteToSlotId = promoteSlots[presetId] || undefined;
      const res = await onReplySavedMeal(trainee.id, {
        presetId,
        reply,
        promoteToSlotId,
      });
      if (res.error) {
        setBanner({ msg: res.error, isError: true });
        return;
      }
      setReplyDrafts((prev) => ({ ...prev, [presetId]: '' }));
      setBanner({ msg: 'תשובת המאמן נשמרה ונשלחה למתאמן!' });
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div
      style={{
        background: 'var(--card)',
        padding: 16,
        borderRadius: 26,
        border: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            <Bookmark size={16} />
            <span>
              ספריית ארוחות, שאלות מתאמן וכלים מוגדרים ({sortedMeals.length})
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            הגדר למתאמן צלחות/יחידות מידה אישיות וענה לשאלות שלו על ארוחות שמורות.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {onCustomFoodsUpdated && (
            <button
              type="button"
              onClick={() => setCustomFoodsOpen(true)}
              className="btn-surface"
              style={{
                padding: '7px 12px',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                borderColor: 'var(--line-2)',
              }}
            >
              <Utensils size={13} color="currentColor" />
              <span>
                מוצרים אישיים של המתאמן ({(trainee.customFoods || []).length})
              </span>
            </button>
          )}
          {onManageToolsAndUnits && (
            <button
              type="button"
              onClick={() => setToolsModalOpen(true)}
              className="btn-surface"
              style={{
                padding: '7px 12px',
                fontSize: 13,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                borderColor: 'var(--line-2)',
              }}
            >
              <Ruler size={13} color="currentColor" />
              <span>
                ניהול כלים ויחידות למתאמן ({(trainee.customServingTools || []).length} כלים ·{' '}
                {(trainee.customFoodUnits || []).length} יחידות)
              </span>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          style={{
            padding: '7px 10px',
            borderRadius: 16,
            fontSize: 13,
            fontWeight: 700,
            background: banner.isError
              ? 'rgba(239, 68, 68, 0.14)'
              : 'var(--fill-1)',
            color: banner.isError ? 'var(--danger-text)' : 'var(--text)',
          }}
        >
          {banner.msg}
        </div>
      )}

      {sortedMeals.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          למתאמן זה עדיין אין ארוחות שמורות או שאלות פתוחות בספריית הארוחות.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sortedMeals.slice(0, 12).map((m) => {
            const q = m.coachQuestion;
            const isPending = q?.status === 'pending';

            return (
              <div
                key={m.id}
                style={{
                  background: 'var(--surface-2)',
                  border: isPending ? '1px solid var(--text-3)' : '1px solid var(--line)',
                  borderRadius: 22,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {m.photoDataUrl && (
                    <img
                      src={m.photoDataUrl}
                      alt={m.title}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 16,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{m.title}</span>
                      {m.useCount > 0 && (
                        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          נבחר {m.useCount}×
                        </span>
                      )}
                      {(m.isAiFallback !== undefined || m.aiEngine) && (
                        <span
                          style={{
                            fontSize: 13,
                            padding: '1px 6px',
                            borderRadius: 999,
                            fontWeight: 800,
                            background: m.isAiFallback
                              ? 'rgba(245, 158, 11, 0.16)'
                              : 'var(--surface-2)',
                            color: m.isAiFallback ? 'var(--warn-text)' : 'var(--text-2)',
                          }}
                        >
                          {m.isAiFallback
                            ? `לא AI · ${m.aiEngine || 'Fallback'}`
                            : `AI · ${m.aiEngine}`}
                        </span>
                      )}
                      {isPending && (
                        <span
                          style={{
                            fontSize: 13,
                            padding: '1px 7px',
                            borderRadius: 999,
                            background: 'var(--surface-3)',
                            color: 'var(--text)',
                            fontWeight: 800,
                          }}
                        >
                          ממתין למענה מאמן
                        </span>
                      )}
                    </div>
                    <div className="num-mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <b>{Math.round(m.totalCalories)} קק״ל</b> · ח׳ {m.totalProtein}g · פ׳{' '}
                      {m.totalCarbs}g · ש׳ {m.totalFat}g
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {m.items
                    .map(
                      (it) =>
                        `${it.itemTime ? `${it.itemTime} · ` : ''}${it.name} (${it.unitLabel})`
                    )
                    .join(' · ')}
                </div>

                {q && (
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: 16,
                      background: 'var(--card)',
                      border: '1px solid var(--line)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700 }}>
                      <MessageCircle size={14} />
                      <span>שאלת המתאמן: {q.question}</span>
                    </div>
                    {q.reply && (
                      <div style={{ marginTop: 4, color: 'var(--text-2)' }}>
                        <Check size={11} style={{ marginLeft: 4 }} />
                        <b>תשובה שנשלחה ({q.repliedBy || 'מאמן'}):</b> {q.reply}
                        {q.recommendedPromoted && (
                          <span style={{ marginRight: 6, color: 'var(--warn-text)' }}>
                            <Star size={10} style={{ marginLeft: 2 }} />
                            קודם להמלצת תפריט
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {onReplySavedMeal && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Textarea
                      size="xs"
                      minRows={1}
                      placeholder={
                        q
                          ? 'כתוב תשובה / חידוד כמויות למתאמן...'
                          : 'הוסף הערת מאמן על ארוחה שמורה זו...'
                      }
                      value={replyDrafts[m.id] ?? ''}
                      onChange={(e) => {
                        const val = e.currentTarget.value;
                        setReplyDrafts((prev) => ({ ...prev, [m.id]: val }));
                      }}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Select
                        size="xs"
                        style={{ flex: '1 1 180px' }}
                        value={promoteSlots[m.id] || ''}
                        onChange={(v) =>
                          setPromoteSlots((prev) => ({ ...prev, [m.id]: v || '' }))
                        }
                        data={slotOptions}
                      />
                      <button
                        type="button"
                        disabled={sendingId === m.id || !(replyDrafts[m.id] || '').trim()}
                        onClick={() => handleSendReply(m.id)}
                        className="btn-volt"
                        style={{
                          height: 48,
                          padding: '0 20px',
                          fontSize: 15,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          flex: 'none',
                        }}
                      >
                        {sendingId === m.id ? (
                          <Loader2 size={15} className="spot-spinner" />
                        ) : (
                          <Send size={15} />
                        )}
                        <span>שלח מענה</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {onManageToolsAndUnits && (
        <ServingToolsManagerModal
          opened={toolsModalOpen}
          onClose={() => setToolsModalOpen(false)}
          tools={trainee.customServingTools || []}
          customUnits={trainee.customFoodUnits || []}
          onSave={(payload) => onManageToolsAndUnits(trainee.id, payload)}
        />
      )}

      {onCustomFoodsUpdated && (
        <Modal
          opened={customFoodsOpen}
          onClose={() => setCustomFoodsOpen(false)}
          title={`מוצרים אישיים — ${trainee.name}`}
          centered
          size="md"
          zIndex={265}
          styles={{
            content: { borderRadius: 24, maxWidth: 'calc(100vw - 24px)' },
          }}
        >
          <CustomFoodsLibraryPanel
            mode="trainee-inspector"
            actorRole={actorRole}
            traineeId={trainee.id}
            traineeName={trainee.name}
            foods={trainee.customFoods || []}
            onMutated={(res) => onCustomFoodsUpdated(res)}
            title={`מוצרים אישיים של ${trainee.name}`}
            subtitle="תוכל להוסיף מוצר במיוחד למתאמן זה, או לשתף מוצר קיים שלו לשאר המתאמנים שלך."
          />
        </Modal>
      )}
    </div>
  );
}
