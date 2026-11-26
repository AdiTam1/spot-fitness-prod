'use client';

import React, { useState } from 'react';
import { Modal } from '@mantine/core';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  History,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  User,
} from 'lucide-react';
import type {
  AiFailedDraftSnapshot,
  LoggedMealEntry,
  MealHistoryEntry,
  PhotoAngleKind,
} from '@/types/nutrition';

interface MealHistoryPanelProps {
  meal?: LoggedMealEntry;
  highlightedEventId?: string | null;
  onRetryFailed?: (draft?: AiFailedDraftSnapshot, event?: MealHistoryEntry) => void;
  onRestoreCoachDeletedItem?: (params: {
    noticeId?: string;
    historyEventId?: string;
    itemId?: string;
  }) => Promise<void>;
  onRollbackToEntry?: (historyEntryId: string) => Promise<void>;
}

const KIND_LABELS: Record<MealHistoryEntry['kind'], string> = {
  ai_analyze: 'שליחה ל-AI',
  ai_adjust: 'תיקון AI',
  ai_clarify: 'הבהרת תווית AI',
  ai_failed: 'שגיאה בשליחת AI',
  manual_add: 'הוספה ידנית / מאגר',
  manual_edit: 'עריכה ידנית',
  manual_remove: 'הסרה ידנית',
  coach_edit: 'עריכת מאמן',
  coach_ai: 'עדכון AI ע"י מאמן',
  coach_feedback: 'משוב מאמן',
  restore_deleted: 'שחזור פריט',
  rollback_snapshot: 'חזרה למצב קודם (Rollback)',
};

const ANGLE_BADGE: Record<PhotoAngleKind, string> = {
  unset: 'זווית רגילה',
  label: 'טבלת ערכים',
  'top-down': '90° מלמעלה',
  'side-45': '~45° מהצד',
  other: 'זווית נוספת',
};

export function MealHistoryPanel({
  meal,
  highlightedEventId,
  onRetryFailed,
  onRestoreCoachDeletedItem,
  onRollbackToEntry,
}: MealHistoryPanelProps) {
  const history = meal?.history || [];
  const photoStore = meal?.photoStore || {};
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{
    images: { url: string; caption: string }[];
    index: number;
  } | null>(null);

  if (history.length === 0) {
    return (
      <div
        style={{
          padding: 28,
          textAlign: 'center',
          color: 'var(--text-2)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <History size={28} strokeWidth={1.6} />
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          עוד אין היסטוריית שינויים לארוחה זו
        </span>
        <span style={{ fontSize: 12.5 }}>
          כל שליחה ל-AI, עריכה, הוספה, הסרה או שינוי מצד המאמן יופיעו כאן.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {history.map((ev) => {
        const isCoach =
          ev.kind === 'coach_edit' ||
          ev.kind === 'coach_ai' ||
          ev.kind === 'coach_feedback';
        const isFailed = ev.kind === 'ai_failed';
        const isHighlighted = highlightedEventId === ev.id;
        const photos = (ev.aiDetail?.photos || [])
          .map((meta, idx) => {
            const url =
              photoStore[meta.hash] ||
              ev.aiDetail?.retryDraftPayload?.photos?.[idx]?.dataUrl ||
              meal?.photoDataUrls?.[idx];
            if (!url) return null;
            return {
              url,
              caption: meta.labelProductName
                ? `${ANGLE_BADGE[meta.angle]} · מוצר: ${meta.labelProductName}`
                : ANGLE_BADGE[meta.angle],
              meta,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));

        return (
          <div
            key={ev.id}
            style={{
              borderRadius: 18,
              padding: 12,
              background: isHighlighted
                ? 'rgba(245, 158, 11, 0.12)'
                : isFailed
                ? 'rgba(239, 68, 68, 0.08)'
                : isCoach
                ? 'var(--sel-bg)'
                : 'var(--surface-2)',
              border: isHighlighted
                ? '1.5px solid var(--accent)'
                : isFailed
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : isCoach
                ? '1px solid var(--sel-border)'
                : '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            {/* כותרת האירוע + דלתא קלורית */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {isFailed ? (
                  <AlertTriangle size={14} color="var(--danger-text)" />
                ) : ev.aiDetail ? (
                  <Sparkles size={14} color="var(--accent)" />
                ) : (
                  <User size={14} color="var(--text-2)" />
                )}
                <span style={{ fontSize: 13.5, fontWeight: 800 }}>
                  {isCoach ? `המאמן ${ev.actorName}` : ev.actorName}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                  }}
                >
                  {KIND_LABELS[ev.kind] || ev.kind}
                </span>
                {typeof ev.deltaCalories === 'number' && ev.deltaCalories !== 0 && (
                  <span
                    className="num-mono"
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      color:
                        ev.deltaCalories > 0 ? 'var(--ok-text)' : 'var(--warn-text)',
                    }}
                    dir="ltr"
                  >
                    {ev.deltaCalories > 0 ? `+${ev.deltaCalories}` : ev.deltaCalories} קק״ל
                  </span>
                )}
              </div>

              <span
                className="num-mono"
                style={{
                  fontSize: 11.5,
                  color: 'var(--text-2)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Clock size={11} />
                <span>{ev.timeLabel}</span>
              </span>
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {ev.summary}
            </div>

            {/* פירוט מה שנשלח ל-AI */}
            {ev.aiDetail?.prompt && (
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-2)',
                  background: 'var(--card)',
                  padding: '6px 10px',
                  borderRadius: 10,
                }}
              >
                <strong>נשלח:</strong> &quot;{ev.aiDetail.prompt}&quot;
              </div>
            )}
            {ev.aiDetail?.adjustmentPrompt && (
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-2)',
                  background: 'var(--card)',
                  padding: '6px 10px',
                  borderRadius: 10,
                }}
              >
                <strong>בקשת תיקון:</strong> &quot;{ev.aiDetail.adjustmentPrompt}&quot;
              </div>
            )}
            {ev.aiDetail?.chips && ev.aiDetail.chips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {ev.aiDetail.chips.map((c) => (
                  <span
                    key={c}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--card)',
                      border: '1px solid var(--line)',
                      color: 'var(--text-2)',
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            {/* שאלות הבהרה ובחירת המשתמש */}
            {ev.aiDetail?.clarificationAnswers &&
              ev.aiDetail.clarificationAnswers.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--ok-text)' }}>
                  <Check size={12} style={{ display: 'inline', marginLeft: 4 }} />
                  <strong>בחירתך בשאלת תווית:</strong>{' '}
                  {ev.aiDetail.clarificationAnswers
                    .map(
                      (a) =>
                        `${a.customProductName || a.selectedOption}${
                          a.gramsOrPortionText ? ` (${a.gramsOrPortionText})` : ''
                        }`
                    )
                    .join(', ')}
                </div>
              )}

            {/* גלריית תמונות לחיצה למסך מלא */}
            {photos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {photos.map((p, idx) => (
                  <button
                    key={`${p.meta.hash}-${idx}`}
                    type="button"
                    onClick={() =>
                      setLightboxState({
                        images: photos.map((x) => ({ url: x.url, caption: x.caption })),
                        index: idx,
                      })
                    }
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: 4,
                      background: 'var(--card)',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url}
                      alt={p.caption}
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10.5,
                        color: 'var(--text-2)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <ImageIcon size={10} />
                      {p.caption}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* פירוט שינויים + כפתור שחזור לפריטים שנמחקו ע"י מאמן */}
            {ev.itemChanges && ev.itemChanges.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {ev.itemChanges.map((ch, idx) => (
                  <div
                    key={`${ch.itemId}-${idx}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      padding: '4px 8px',
                      borderRadius: 10,
                      background: 'var(--card)',
                    }}
                  >
                    <span>
                      <strong>
                        {ch.changeKind === 'added'
                          ? '+'
                          : ch.changeKind === 'removed'
                          ? '−'
                          : '~'}{' '}
                        {ch.name}
                      </strong>{' '}
                      · <span style={{ color: 'var(--text-2)' }}>{ch.summary}</span>
                      {ch.prevSummary && ch.changeKind === 'updated' && (
                        <span style={{ color: 'var(--text-3)' }}>
                          {' '}
                          (קודם: {ch.prevSummary})
                        </span>
                      )}
                    </span>

                    {ch.changeKind === 'removed' &&
                      ch.removedItem &&
                      onRestoreCoachDeletedItem && (
                        <button
                          type="button"
                          disabled={busyId === `${ev.id}-${ch.itemId}`}
                          onClick={async () => {
                            setBusyId(`${ev.id}-${ch.itemId}`);
                            try {
                              await onRestoreCoachDeletedItem({
                                historyEventId: ev.id,
                                itemId: ch.itemId,
                              });
                            } finally {
                              setBusyId(null);
                            }
                          }}
                          className="btn-volt"
                          style={{
                            height: 28,
                            padding: '0 10px',
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          שחזר
                        </button>
                      )}
                  </div>
                ))}
              </div>
            )}

            {/* פעולות תחתונות: שלח שוב בשגיאה / Rollback לנקודה בזמן */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isFailed && onRetryFailed && (
                <button
                  type="button"
                  onClick={() => onRetryFailed(ev.aiDetail?.retryDraftPayload, ev)}
                  className="btn-volt"
                  style={{
                    height: 34,
                    padding: '0 12px',
                    fontSize: 12.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={13} />
                  <span>שלח שוב</span>
                </button>
              )}

              {Array.isArray(ev.itemsSnapshot) && !isFailed && onRollbackToEntry && (
                <button
                  type="button"
                  disabled={busyId === ev.id}
                  onClick={async () => {
                    setBusyId(ev.id);
                    try {
                      await onRollbackToEntry(ev.id);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="btn-surface"
                  style={{
                    height: 32,
                    padding: '0 11px',
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={12} />
                  <span>{busyId === ev.id ? 'משחזר...' : 'החזר למצב זה'}</span>
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* צפייה במסך מלא בתמונות מההיסטוריה */}
      <Modal
        opened={Boolean(lightboxState)}
        onClose={() => setLightboxState(null)}
        fullScreen
        withCloseButton
        title={
          lightboxState
            ? lightboxState.images[lightboxState.index]?.caption || 'תמונה במסך מלא'
            : ''
        }
        zIndex={340}
      >
        {lightboxState && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              minHeight: '78vh',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxState.images[lightboxState.index]?.url}
              alt="תצוגת ארוחה במסך מלא"
              style={{
                maxWidth: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                borderRadius: 16,
              }}
            />
            {lightboxState.images.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <button
                  type="button"
                  className="btn-surface"
                  onClick={() =>
                    setLightboxState((prev) =>
                      prev
                        ? {
                            ...prev,
                            index:
                              (prev.index - 1 + prev.images.length) %
                              prev.images.length,
                          }
                        : null
                    )
                  }
                  style={{ height: 38, padding: '0 14px', cursor: 'pointer' }}
                >
                  <ChevronRight size={16} />
                </button>
                <span className="num-mono" style={{ fontSize: 13 }}>
                  {lightboxState.index + 1} / {lightboxState.images.length}
                </span>
                <button
                  type="button"
                  className="btn-surface"
                  onClick={() =>
                    setLightboxState((prev) =>
                      prev
                        ? {
                            ...prev,
                            index: (prev.index + 1) % prev.images.length,
                          }
                        : null
                    )
                  }
                  style={{ height: 38, padding: '0 14px', cursor: 'pointer' }}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
