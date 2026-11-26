'use client';

import React, { useState } from 'react';
import { Modal, TextInput } from '@mantine/core';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Image as ImageIcon,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';
import { SegmentedPill } from './ui/SegmentedPill';
import type {
  AiConversationTraceRecord,
  LoggedFoodItem,
  PhotoAngleKind,
} from '@/types/nutrition';

export interface AiTraceQueueBucket {
  setupRequired?: boolean;
  traces: AiConversationTraceRecord[];
  totalCount: number;
  savedCount: number;
  cap: number;
}

interface AdminAiTracesInspectorProps {
  historyBucket: AiTraceQueueBucket;
  crashedBucket: AiTraceQueueBucket;
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
  formatTimeHe: (iso: string) => string;
}

const CRASH_STAGE_HE: Record<string, string> = {
  client: 'קליינט / רשת',
  validation: 'ולידציה / מפתח',
  vision_api: 'מודל ראייה (Gemini)',
  parser: 'עיבוד תשובה / Parser',
  db_save: 'שמירה למסד הנתונים',
};

const ANGLE_HE: Record<PhotoAngleKind, string> = {
  unset: 'כללי',
  label: 'טבלת ערכים',
  'top-down': '90° מלמעלה',
  'side-45': '~45° מהצד',
  other: 'זווית נוספת',
};

export function AdminAiTracesInspector({
  historyBucket,
  crashedBucket,
  onRefresh,
  onNotify,
  formatTimeHe,
}: AdminAiTracesInspectorProps) {
  const [queueTab, setQueueTab] = useState<'history' | 'crashed'>('history');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailsById, setDetailsById] = useState<
    Record<
      string,
      {
        trace?: AiConversationTraceRecord;
        thumbnails: {
          hash: string;
          angle: PhotoAngleKind;
          labelProductName?: string;
          dataUrl: string;
        }[];
      }
    >
  >({});
  const [busyFlagId, setBusyFlagId] = useState<string | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [replayResults, setReplayResults] = useState<
    Record<
      string,
      {
        ok: boolean;
        summary?: string;
        engine?: string;
        items?: LoggedFoodItem[];
        error?: string;
      }
    >
  >({});
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const activeBucket = queueTab === 'crashed' ? crashedBucket : historyBucket;

  const filteredTraces = activeBucket.traces.filter((t) => {
    if (!search.trim()) return true;
    const ql = search.trim().toLowerCase();
    return (
      t.userName.toLowerCase().includes(ql) ||
      (t.mealSlotName || '').toLowerCase().includes(ql) ||
      (t.promptText || '').toLowerCase().includes(ql) ||
      (t.errorMessage || '').toLowerCase().includes(ql)
    );
  });

  const handleToggleExpand = async (trace: AiConversationTraceRecord) => {
    if (expandedId === trace.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(trace.id);
    if (!detailsById[trace.id]) {
      setDetailLoadingId(trace.id);
      try {
        const res = await fetch(
          `/api/admin/monitoring?traceDetail=1&traceId=${encodeURIComponent(
            trace.id
          )}`,
          { cache: 'no-store' }
        );
        const data = await res.json();
        if (res.ok) {
          setDetailsById((prev) => ({
            ...prev,
            [trace.id]: {
              trace: data.trace,
              thumbnails: Array.isArray(data.thumbnails) ? data.thumbnails : [],
            },
          }));
        }
      } catch {
        // ignore lazy detail fetch fail
      } finally {
        setDetailLoadingId(null);
      }
    }
  };

  const handleToggleSaved = async (trace: AiConversationTraceRecord) => {
    setBusyFlagId(trace.id);
    try {
      const res = await fetch('/api/admin/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle-trace-saved',
          traceId: trace.id,
          isSaved: !trace.isSaved,
        }),
      });
      if (!res.ok) {
        onNotify('שגיאה בעדכון מצב שמירה', true);
        return;
      }
      onNotify(
        !trace.isSaved
          ? 'השיחה סומנה כשמורה קבוע (נספרת במכסה ואינה נמחקת ב-FIFO)'
          : 'סימון השמירה הוסר'
      );
      onRefresh();
    } catch {
      onNotify('שגיאת רשת בעדכון שמירה', true);
    } finally {
      setBusyFlagId(null);
    }
  };

  const handleToggleCrashResolved = async (trace: AiConversationTraceRecord) => {
    setBusyFlagId(trace.id);
    const nextStatus = trace.reviewStatus === 'resolved' ? 'new' : 'resolved';
    try {
      const res = await fetch('/api/admin/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update-trace-review',
          traceId: trace.id,
          reviewStatus: nextStatus,
        }),
      });
      if (res.ok) {
        onNotify(
          nextStatus === 'resolved' ? 'סומן כטופל בתור הקריסות' : 'הוחזר לסטטוס חדש'
        );
        onRefresh();
      }
    } catch {
      onNotify('שגיאה בעדכון סטטוס קריסה', true);
    } finally {
      setBusyFlagId(null);
    }
  };

  const handleSandboxReplay = async (trace: AiConversationTraceRecord) => {
    const detail = detailsById[trace.id];
    const thumbs = detail?.thumbnails || [];
    setReplayingId(trace.id);
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          mode: trace.mode === 'adjust-meal' ? 'adjust-meal' : 'analyze',
          textPrompt: trace.promptText || '',
          imageDataUrls: thumbs.map((th) => th.dataUrl).filter(Boolean),
          contextParams: {
            activeChipLabels: trace.activeChips,
            imageAngles: thumbs.map((th) => th.angle),
            imageLabelProducts: thumbs.map((th) => th.labelProductName),
          },
          traineeId: trace.userId,
          date: trace.mealDate,
          mealSlotId: trace.mealSlotId,
        }),
      });
      const data = await res.json();
      setReplayResults((prev) => ({
        ...prev,
        [trace.id]: res.ok
          ? {
              ok: true,
              summary: data.summary,
              engine: data.engine,
              items: Array.isArray(data.items) ? data.items : [],
            }
          : {
              ok: false,
              error: data?.error || 'השחזור נכשל במודל הנוכחי',
            },
      }));
    } catch {
      setReplayResults((prev) => ({
        ...prev,
        [trace.id]: { ok: false, error: 'שגיאת רשת בהרצת בדיקת שחזור' },
      }));
    } finally {
      setReplayingId(null);
    }
  };

  return (
    <section
      className="pro-card"
      style={{
        padding: 16,
        borderRadius: 22,
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
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 15,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Sparkles size={16} color="var(--accent)" />
            <span>אינספקטור שיחות AI ותור קריסות נפרד</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            מכסת FIFO אוטומטית ({historyBucket.cap} שיחות / {crashedBucket.cap}{' '}
            קריסות). שיחות עם סימון &quot;שמור&quot; אינן נמחקות לעולם ונספרות במכסת התור.
          </span>
        </div>

        <TextInput
          size="xs"
          placeholder="חפש משתמש, ארוחה, טקסט או שגיאה..."
          leftSection={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ minWidth: 230 }}
        />
      </div>

      {activeBucket.setupRequired && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 14,
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            fontSize: 12.5,
            color: 'var(--warn-text)',
          }}
        >
          כדי לשמור ולצפות בכל התכתבויות ה־AI ב־Supabase (כולל תור קריסות ומיניאטורות),
          יש להריץ ב־SQL Editor את{' '}
          <bdi dir="ltr">supabase/migrations/20261126_ai_conversation_traces.sql</bdi>.
        </div>
      )}

      <SegmentedPill
        value={queueTab}
        onChange={(v) => setQueueTab(v as 'history' | 'crashed')}
        options={[
          {
            value: 'history',
            label: `שיחות AI (${historyBucket.totalCount}/${historyBucket.cap} · שמורות: ${historyBucket.savedCount})`,
          },
          {
            value: 'crashed',
            label: `תור קריסות (${crashedBucket.totalCount}/${crashedBucket.cap} · שמורות: ${crashedBucket.savedCount})`,
          },
        ]}
      />

      {filteredTraces.length === 0 ? (
        <div
          style={{
            padding: 24,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--text-2)',
          }}
        >
          {queueTab === 'crashed'
            ? 'אין כרגע צ׳אטים בתור הקריסות.'
            : 'טרם תועדו שיחות AI מלאות בתור זה.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTraces.map((trace) => {
            const isExpanded = expandedId === trace.id;
            const detail = detailsById[trace.id];
            const thumbs = detail?.thumbnails || [];
            const fullTrace = detail?.trace || trace;
            const replay = replayResults[trace.id];
            const isCrashed = trace.queueType === 'crashed';

            return (
              <div
                key={trace.id}
                style={{
                  borderRadius: 16,
                  background: 'var(--surface-2)',
                  border: isCrashed
                    ? '1px solid rgba(239, 68, 68, 0.38)'
                    : '1px solid var(--line)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => void handleToggleExpand(trace)}
                    style={{
                      flex: 1,
                      minWidth: 200,
                      textAlign: 'start',
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <span style={{ fontSize: 13.5, fontWeight: 800 }}>
                      {trace.userName}
                    </span>
                    {trace.mealSlotName && (
                      <span
                        style={{
                          fontSize: 11.5,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--card)',
                          border: '1px solid var(--line)',
                        }}
                      >
                        {trace.mealSlotName}
                      </span>
                    )}
                    {isCrashed && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background:
                            trace.reviewStatus === 'resolved'
                              ? 'rgba(34, 197, 94, 0.14)'
                              : 'rgba(239, 68, 68, 0.14)',
                          color:
                            trace.reviewStatus === 'resolved'
                              ? 'var(--ok-text)'
                              : 'var(--danger-text)',
                        }}
                      >
                        {trace.reviewStatus === 'resolved'
                          ? 'טופל'
                          : `קרס ב: ${
                              CRASH_STAGE_HE[trace.crashStage || ''] ||
                              trace.crashStage ||
                              'כללי'
                            }`}
                      </span>
                    )}
                    {trace.isSaved && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--sel-bg)',
                          color: 'var(--sel-text)',
                          border: '1px solid var(--sel-border)',
                        }}
                      >
                        שמור קבוע
                      </span>
                    )}
                    {trace.imageCount ? (
                      <span
                        style={{
                          fontSize: 11.5,
                          color: 'var(--text-2)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <ImageIcon size={12} /> {trace.imageCount}
                      </span>
                    ) : null}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      className="num-mono"
                      style={{ fontSize: 11.5, color: 'var(--text-2)' }}
                      dir="ltr"
                    >
                      {formatTimeHe(trace.createdAt)}
                    </span>
                    <button
                      type="button"
                      disabled={busyFlagId === trace.id}
                      onClick={() => void handleToggleSaved(trace)}
                      className="btn-surface"
                      style={{
                        height: 30,
                        padding: '0 10px',
                        fontSize: 11.5,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        color: trace.isSaved ? 'var(--accent-orange-bright)' : 'var(--text-2)',
                      }}
                    >
                      <Bookmark size={13} />
                      <span>{trace.isSaved ? 'שמור ✓' : 'שמור'}</span>
                    </button>
                  </div>
                </div>

                {trace.promptText && (
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                    קלט: &quot;{trace.promptText}&quot;
                  </div>
                )}
                {trace.errorMessage && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--danger-text)',
                      fontWeight: 600,
                    }}
                  >
                    שגיאה: {trace.errorMessage}
                  </div>
                )}

                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid var(--line)',
                      paddingTop: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {detailLoadingId === trace.id && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        טוען תמונות ושלבים On-Demand...
                      </div>
                    )}

                    {/* תמונות ממוזערות הנטענות רק בפתיחה */}
                    {thumbs.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {thumbs.map((th, i) => (
                          <button
                            key={`${th.hash}-${i}`}
                            type="button"
                            onClick={() => setLightboxUrl(th.dataUrl)}
                            style={{
                              border: '1px solid var(--line)',
                              borderRadius: 12,
                              background: 'var(--card)',
                              padding: 4,
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={th.dataUrl}
                              alt={`תמונה ${i + 1}`}
                              style={{
                                width: 72,
                                height: 72,
                                objectFit: 'cover',
                                borderRadius: 8,
                              }}
                            />
                            <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>
                              {th.labelProductName
                                ? `${ANGLE_HE[th.angle]}: ${th.labelProductName}`
                                : ANGLE_HE[th.angle]}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ציר שלבי ה-AI */}
                    {fullTrace.stepsTimeline.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          background: 'var(--card)',
                          borderRadius: 12,
                          padding: 10,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Clock size={13} />
                          <span>שלבי עיבוד AI ({fullTrace.stepsTimeline.length})</span>
                        </div>
                        {fullTrace.stepsTimeline.map((st, idx) => (
                          <div
                            key={`${st.stage}-${idx}`}
                            style={{
                              fontSize: 12,
                              display: 'flex',
                              justifyContent: 'space-between',
                              gap: 8,
                              color:
                                st.status === 'error'
                                  ? 'var(--danger-text)'
                                  : st.status === 'warn'
                                  ? 'var(--warn-text)'
                                  : 'var(--text-2)',
                            }}
                          >
                            <span>
                              {idx + 1}. [{st.stage}] {st.summary}
                            </span>
                            <span className="num-mono" dir="ltr">
                              {formatTimeHe(st.timestamp)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* הבהרות ומשוב שה-AI הבין */}
                    {fullTrace.clarificationQuestions &&
                      fullTrace.clarificationQuestions.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          <strong>שאלות הבהרה שנשלחו:</strong>{' '}
                          {fullTrace.clarificationQuestions
                            .map((q) => `${q.questionText} (${q.extractedTableSummary})`)
                            .join(' | ')}
                        </div>
                      )}
                    {fullTrace.clarificationAnswers &&
                      fullTrace.clarificationAnswers.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--ok-text)' }}>
                          <strong>תשובת משתמש:</strong>{' '}
                          {fullTrace.clarificationAnswers
                            .map((a) => a.customProductName || a.selectedOption)
                            .join(', ')}
                        </div>
                      )}

                    {fullTrace.parsedItems && fullTrace.parsedItems.length > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        <strong>מה ה-AI הבין ({fullTrace.parsedItems.length}):</strong>{' '}
                        {fullTrace.parsedItems
                          .map(
                            (it) =>
                              `${it.name} (${Math.round(it.grams)}g · ${Math.round(
                                it.macros?.calories || 0
                              )} קק"ל)`
                          )
                          .join(' · ')}
                      </div>
                    )}

                    {/* כפתורי ניהול + Sandbox Replay */}
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <button
                        type="button"
                        disabled={replayingId === trace.id}
                        onClick={() => void handleSandboxReplay(trace)}
                        className="btn-surface"
                        style={{
                          height: 34,
                          padding: '0 12px',
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                      >
                        <Play size={13} />
                        <span>
                          {replayingId === trace.id
                            ? 'מריץ בדיקת שחזור...'
                            : 'בדיקת שחזור (Sandbox Replay)'}
                        </span>
                      </button>

                      {isCrashed && (
                        <button
                          type="button"
                          disabled={busyFlagId === trace.id}
                          onClick={() => void handleToggleCrashResolved(trace)}
                          className="btn-surface"
                          style={{
                            height: 34,
                            padding: '0 12px',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            cursor: 'pointer',
                          }}
                        >
                          {trace.reviewStatus === 'resolved' ? (
                            <AlertTriangle size={13} />
                          ) : (
                            <CheckCircle2 size={13} />
                          )}
                          <span>
                            {trace.reviewStatus === 'resolved'
                              ? 'החזר לסטטוס חדש'
                              : 'סמן כטופל'}
                          </span>
                        </button>
                      )}
                    </div>

                    {replay && (
                      <div
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          background: replay.ok
                            ? 'rgba(34, 197, 94, 0.1)'
                            : 'rgba(239, 68, 68, 0.12)',
                          border: replay.ok
                            ? '1px solid rgba(34, 197, 94, 0.35)'
                            : '1px solid rgba(239, 68, 68, 0.35)',
                          fontSize: 12,
                        }}
                      >
                        {replay.ok ? (
                          <div>
                            <strong>תוצאת Sandbox Replay ({replay.engine}):</strong>{' '}
                            {replay.summary} —{' '}
                            {(replay.items || [])
                              .map(
                                (it) =>
                                  `${it.name} (${Math.round(it.grams)}g, ${Math.round(
                                    it.macros?.calories || 0
                                  )} קק"ל)`
                              )
                              .join(' · ')}
                          </div>
                        ) : (
                          <div style={{ color: 'var(--danger-text)' }}>
                            <strong>Replay נכשל:</strong> {replay.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        opened={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        title="תצוגת תמונה מוגדלת"
        centered
        size="lg"
        zIndex={340}
      >
        {lightboxUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={lightboxUrl}
            alt="תמונת משתמש מוגדלת"
            style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: 14 }}
          />
        )}
      </Modal>
    </section>
  );
}
