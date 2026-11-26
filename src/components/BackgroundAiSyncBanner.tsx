'use client';

import React, { useEffect, useState } from 'react';
import {
  Check,
  Sparkles,
  X,
  AlertTriangle,
  Minimize2,
  RotateCcw,
  HelpCircle,
} from 'lucide-react';
import { PendingAiMealJob } from '@/types/nutrition';
import { isAiJobActivelyProcessing } from '@/lib/aiJobs';

export const AI_PROGRESS_STAGES: string[] = [
  'מעבד ומחדד את התמונה...',
  'מנתח זוויות, כלי הגשה ופרופורציות נפח...',
  'שולח באופן מאובטח למודל ה-AI...',
  'מזהה מרכיבים ותוספות בצלחת...',
  'מחפש קלוריות נסתרות (שמן בישול, רטבים ותיבול)...',
  'מחשב כמויות ומשקלים מדויקים בגרמים...',
  'מחשב קלוריות, חלבון, פחמימות ושומן...',
  'מצליב נתונים מול מאגר המזון הישראלי...',
  'מאמת חישובים ומסנכרן ברקע ליומן שלך...',
];

export function useAiProgressMessage(active: boolean, startedAtIso?: string) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      setTick(0);
      return;
    }
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [active]);

  const elapsedSec =
    active && startedAtIso
      ? Math.max(0, Math.floor((Date.now() - new Date(startedAtIso).getTime()) / 1000))
      : tick;
  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');
  const stageIdx = Math.floor(tick / 4) % AI_PROGRESS_STAGES.length;

  return {
    currentStepText: AI_PROGRESS_STAGES[stageIdx],
    stepIndex: stageIdx,
    totalSteps: AI_PROGRESS_STAGES.length,
    elapsedSec,
    formattedElapsed: `${mins}:${secs}`,
  };
}

interface BackgroundAiSyncBannerProps {
  jobs: PendingAiMealJob[];
  liveJobIds?: string[];
  onAcknowledgeJob: (jobId: string) => void;
  onCancelJob?: (jobId: string) => void;
  onOpenJobMeal?: (job: PendingAiMealJob) => void;
  onRetryFailedJob?: (job: PendingAiMealJob) => void;
}

export function BackgroundAiSyncBanner({
  jobs,
  liveJobIds = [],
  onAcknowledgeJob,
  onCancelJob,
  onOpenJobMeal,
  onRetryFailedJob,
}: BackgroundAiSyncBannerProps) {
  const activeProcessing = jobs.find((j) => isAiJobActivelyProcessing(j));
  const [collapsed, setCollapsed] = useState(false);
  const activeId = activeProcessing?.id;
  useEffect(() => {
    setCollapsed(false);
  }, [activeId]);
  const finishedJobs = jobs.filter((j) => j.status !== 'processing' && !j.acknowledged);
  const ticker = useAiProgressMessage(Boolean(activeProcessing), activeProcessing?.startedAt);
  const isLiveOnDevice = Boolean(
    activeProcessing && liveJobIds.includes(activeProcessing.id)
  );
  const lastHbAgeSec =
    activeProcessing?.lastHeartbeatAt &&
    Number.isFinite(Date.parse(activeProcessing.lastHeartbeatAt))
      ? Math.max(
          0,
          Math.floor((Date.now() - Date.parse(activeProcessing.lastHeartbeatAt)) / 1000)
        )
      : null;

  if (!activeProcessing && finishedJobs.length === 0) return null;

  // Heuristic progress (the server reports stages, not a percentage): eases towards 95%.
  const pct = Math.min(95, Math.round(100 * (1 - Math.exp(-ticker.elapsedSec / 25))));
  const slow = !isLiveOnDevice && ticker.elapsedSec >= 90;

  return (
    <>
      {/* Finished jobs: glass card at the top (design: AiSync) */}
      {finishedJobs.length > 0 && (
        <div
          style={{
            position: 'fixed',
            top: 'calc(var(--sa-top, 0px) + 12px)',
            left: 14,
            right: 14,
            maxWidth: 520,
            margin: '0 auto',
            zIndex: 150,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {finishedJobs.slice(0, 2).map((job) => {
            const isOk = job.status === 'completed';
            const isClarify = job.status === 'awaiting_clarification';
            const open = () => {
              if (onOpenJobMeal) {
                onOpenJobMeal(job);
                if (isOk) {
                  onAcknowledgeJob(job.id);
                }
              }
            };
            const retry = () => {
              if (onRetryFailedJob) {
                onRetryFailedJob(job);
              } else if (onOpenJobMeal) {
                onOpenJobMeal(job);
              }
            };
            return (
              <div
                key={job.id}
                className="glass"
                role="status"
                style={{
                  pointerEvents: 'auto',
                  borderRadius: 26,
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderColor: isClarify
                    ? 'var(--accent)'
                    : isOk
                    ? undefined
                    : 'var(--danger-text)',
                }}
              >
                <button
                  type="button"
                  aria-label="אשר וסגור"
                  onClick={() => onAcknowledgeJob(job.id)}
                  className="hit-44"
                  style={{
                    width: 40,
                    height: 40,
                    flex: 'none',
                    borderRadius: 999,
                    border: 0,
                    background: 'transparent',
                    color: isClarify
                      ? 'var(--accent)'
                      : isOk
                      ? 'var(--text)'
                      : 'var(--danger-text)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {isClarify ? (
                    <HelpCircle size={20} />
                  ) : isOk ? (
                    <Check size={20} strokeWidth={2.2} />
                  ) : (
                    <AlertTriangle size={20} />
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: isClarify
                        ? 'var(--text)'
                        : isOk
                        ? 'var(--text)'
                        : 'var(--danger-text)',
                    }}
                  >
                    {isClarify
                      ? `נדרשת הבהרה קצרה · ${job.mealSlotName}`
                      : isOk
                      ? job.mode === 'adjust' || job.replaceMealItems
                        ? `התיקון הושלם וסונכרן ל${job.mealSlotName}`
                        : `הושלם וסונכרן ל${job.mealSlotName}`
                      : job.mode === 'adjust'
                      ? `תיקון ה-AI ל${job.mealSlotName} נכשל`
                      : `פענוח ה-AI ל${job.mealSlotName} נכשל`}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {isClarify
                      ? job.clarificationQuestions?.[0]?.questionText ||
                        'זוהתה תווית ערכים תזונתיים — לחץ להבהרת המוצר'
                      : isOk
                      ? `${job.itemsCount || 1} מרכיבים${
                          job.isAiFallback ? ' · זיהוי גיבוי מקומי (בדוק כמויות)' : ''
                        }`
                      : job.errorMsg || 'הפרטים נשמרו — לחץ שלח שוב'}
                  </div>
                </div>
                {isClarify && onOpenJobMeal && (
                  <button
                    type="button"
                    onClick={open}
                    className="btn-volt"
                    style={{
                      height: 38,
                      padding: '0 14px',
                      flex: 'none',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    הבהר כעת
                  </button>
                )}
                {isOk && onOpenJobMeal && (
                  <button
                    type="button"
                    onClick={open}
                    className="btn-surface"
                    style={{ height: 40, padding: '0 16px', flex: 'none', cursor: 'pointer' }}
                  >
                    צפה
                  </button>
                )}
                {!isOk && !isClarify && (
                  <button
                    type="button"
                    onClick={retry}
                    className="btn-surface"
                    style={{
                      height: 38,
                      padding: '0 12px',
                      flex: 'none',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 13,
                      fontWeight: 700,
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: 'var(--text)',
                    }}
                  >
                    <RotateCcw size={14} />
                    <span>שלח שוב</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="סגור"
                  onClick={() => onAcknowledgeJob(job.id)}
                  className="hit-44"
                  style={{
                    width: 36,
                    height: 36,
                    flex: 'none',
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
                  <X size={18} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* In-progress job: glass card above the dock (design: AiSync) */}
      {activeProcessing && collapsed && (
        <button
          type="button"
          aria-label={`פענוח AI ברקע ${pct}%. לחץ להרחבה`}
          onClick={() => setCollapsed(false)}
          className="glass"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--sa-bottom, 0px) + 100px)',
            left: 14,
            zIndex: 150,
            width: 56,
            height: 56,
            padding: 0,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r="26" fill="none" stroke="var(--surface-3)" strokeWidth="3" />
            <circle
              cx="28"
              cy="28"
              r="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 163.4} 163.4`}
              style={{ transition: 'stroke-dasharray .8s ease' }}
            />
          </svg>
          <Sparkles size={22} color="currentColor" />
        </button>
      )}
      {activeProcessing && !collapsed && (
        <div
          className="glass"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--sa-bottom, 0px) + 100px)',
            left: 14,
            right: 14,
            maxWidth: 520,
            margin: '0 auto',
            zIndex: 150,
            borderRadius: 26,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 700 }}>
              <Sparkles size={15} color="var(--accent)" />
              {activeProcessing.mode === 'adjust' ? 'מתקן ברקע' : 'מנתח ברקע'} · {activeProcessing.mealSlotName}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {onCancelJob && (
                <button
                  type="button"
                  aria-label="בטל פענוח"
                  onClick={() => onCancelJob(activeProcessing.id)}
                  className="hit-44"
                  style={{
                    minHeight: 32,
                    padding: '0 4px',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--text-2)',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  בטל
                </button>
              )}
              <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                {pct}%
              </bdi>
              <button
                type="button"
                aria-label="מזער"
                onClick={() => setCollapsed(true)}
                className="hit-44"
                style={{
                  width: 32,
                  height: 32,
                  border: 0,
                  borderRadius: 999,
                  background: 'transparent',
                  color: 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Minimize2 size={16} />
              </button>
            </span>
          </div>
          <div style={{ height: 4, borderRadius: 9, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--accent)',
                borderRadius: 9,
                transition: 'width .8s ease',
                marginInlineStart: 'auto',
              }}
            />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {activeProcessing.stageText ||
              (isLiveOnDevice ? ticker.currentStepText : 'הפענוח ממשיך ברקע בשרת, ממתין לעדכון…')}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            {slow
              ? 'לוקח זמן מהרגיל או שהחיבור התנתק. אפשר להמתין עוד רגע או ללחוץ בטל ולנסות שוב.'
              : 'אפשר להמשיך באפליקציה או לסגור. הפריטים יסתנכרנו אוטומטית ליומן.'}
          </div>
        </div>
      )}
    </>
  );
}
