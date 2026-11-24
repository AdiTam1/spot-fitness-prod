'use client';

import React, { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X, AlertTriangle, ExternalLink } from 'lucide-react';
import { PendingAiMealJob } from '@/types/nutrition';

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
    }, 3000);
    return () => clearInterval(timer);
  }, [active]);

  const elapsedSec =
    active && startedAtIso
      ? Math.max(0, Math.floor((Date.now() - new Date(startedAtIso).getTime()) / 1000))
      : tick * 3;
  const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const secs = String(elapsedSec % 60).padStart(2, '0');
  const stageIdx = tick % AI_PROGRESS_STAGES.length;

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
  onAcknowledgeJob: (jobId: string) => void;
  onOpenJobMeal?: (job: PendingAiMealJob) => void;
}

export function BackgroundAiSyncBanner({
  jobs,
  onAcknowledgeJob,
  onOpenJobMeal,
}: BackgroundAiSyncBannerProps) {
  const activeProcessing = jobs.find((j) => j.status === 'processing');
  const finishedJobs = jobs.filter((j) => j.status !== 'processing' && !j.acknowledged);
  const ticker = useAiProgressMessage(Boolean(activeProcessing), activeProcessing?.startedAt);

  if (!activeProcessing && finishedJobs.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 64,
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
      {activeProcessing && (
        <div
          style={{
            pointerEvents: 'auto',
            background: 'rgba(13, 16, 22, 0.96)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(214, 125, 9, 0.48)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
            borderRadius: 16,
            padding: '11px 14px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <Loader2
            size={18}
            color="var(--accent-volt)"
            className="spot-spinner"
            style={{ marginTop: 2, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-volt)' }}>
                AI מנתח ברקע ({activeProcessing.mealSlotName})
              </span>
              <span
                className="num-mono"
                style={{
                  fontSize: 10,
                  padding: '2px 7px',
                  borderRadius: 999,
                  background: 'rgba(214, 125, 9, 0.14)',
                  color: 'var(--accent-volt)',
                  fontWeight: 800,
                }}
              >
                {ticker.formattedElapsed}
              </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>
              {ticker.currentStepText}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
              אפשר להמשיך באפליקציה או לסגור בינתיים — הפריטים יסתנכרנו אוטומטית ליומן שלך.
            </div>
          </div>
        </div>
      )}

      {finishedJobs.slice(0, 2).map((job) => {
        const isOk = job.status === 'completed';
        return (
          <div
            key={job.id}
            role={isOk && onOpenJobMeal ? 'button' : undefined}
            tabIndex={isOk && onOpenJobMeal ? 0 : undefined}
            onClick={() => {
              if (isOk && onOpenJobMeal) {
                onOpenJobMeal(job);
                onAcknowledgeJob(job.id);
              }
            }}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && isOk && onOpenJobMeal) {
                e.preventDefault();
                onOpenJobMeal(job);
                onAcknowledgeJob(job.id);
              }
            }}
            style={{
              pointerEvents: 'auto',
              background: isOk
                ? 'rgba(28, 16, 10, 0.97)'
                : 'rgba(48, 14, 14, 0.97)',
              backdropFilter: 'blur(14px)',
              border: isOk
                ? '1px solid rgba(214, 125, 9, 0.55)'
                : '1px solid rgba(239, 68, 68, 0.5)',
              boxShadow: '0 10px 30px rgba(0, 0, 0, 0.55)',
              borderRadius: 16,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              cursor: isOk && onOpenJobMeal ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
              {isOk && job.photoDataUrls?.[0] ? (
                <img
                  src={job.photoDataUrls[0]}
                  alt={job.mealSlotName}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    objectFit: 'cover',
                    border: '1px solid rgba(214, 125, 9, 0.45)',
                    flexShrink: 0,
                  }}
                />
              ) : isOk ? (
                <Sparkles size={16} color="var(--accent-volt)" style={{ flexShrink: 0 }} />
              ) : (
                <AlertTriangle size={16} color="#f87171" style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: isOk ? 'var(--accent-orange-bright)' : '#fca5a5',
                  }}
                >
                  {isOk
                    ? `הושלם וסונכרן ל${job.mealSlotName}! (${job.itemsCount || 1} מרכיבים)`
                    : `פענוח ה-AI ל${job.mealSlotName} נכשל`}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {isOk
                    ? job.mode === 'photo'
                      ? 'לחץ לפתיחת הפענוח והתמונה'
                      : 'לחץ לפתיחת הפענוח ביומן'
                    : job.errorMsg || 'נסה שוב או הוסף ידנית מהמאגר'}
                </div>
              </div>
            </div>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              {isOk && onOpenJobMeal && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenJobMeal(job);
                    onAcknowledgeJob(job.id);
                  }}
                  className="btn-volt"
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <ExternalLink size={11} />
                  <span>צפה</span>
                </button>
              )}
              <button
                type="button"
                title="אשר וסגור"
                onClick={() => onAcknowledgeJob(job.id)}
                className="btn-surface"
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {isOk ? <Check size={13} color="var(--accent-volt)" /> : <X size={13} color="#fca5a5" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
