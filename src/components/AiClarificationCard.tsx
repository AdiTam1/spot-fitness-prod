'use client';

import React, { useState } from 'react';
import { HelpCircle, Loader2, Sparkles, Check } from 'lucide-react';
import {
  AiClarificationAnswer,
  AiClarificationQuestion,
  PendingAiMealJob,
} from '@/types/nutrition';

interface AiClarificationCardProps {
  job: PendingAiMealJob;
  mealPhotoStore?: Record<string, string>;
  onResolved: (summary?: string) => void;
  onSkipOrDismiss?: () => void;
}

export function AiClarificationCard({
  job,
  mealPhotoStore,
  onResolved,
}: AiClarificationCardProps) {
  const questions: AiClarificationQuestion[] = job.clarificationQuestions || [];
  const [selectedByQ, setSelectedByQ] = useState<Record<string, string>>({});
  const [customOtherByQ, setCustomOtherByQ] = useState<Record<string, string>>({});
  const [portionByQ, setPortionByQ] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (questions.length === 0) return null;

  const findPhotoForQuestion = (q: AiClarificationQuestion): string | undefined => {
    if (q.photoHash && mealPhotoStore?.[q.photoHash]) {
      return mealPhotoStore[q.photoHash];
    }
    if (job.photoDataUrls?.[q.photoIndex]) {
      return job.photoDataUrls[q.photoIndex];
    }
    return job.photoDataUrls?.[0];
  };

  const canSubmit = questions.every((q) => {
    const sel = selectedByQ[q.id];
    if (!sel) return false;
    if (sel === '__other__') {
      return Boolean((customOtherByQ[q.id] || '').trim());
    }
    return true;
  });

  const handleSubmit = async (skipAll = false) => {
    setSubmitting(true);
    setErrorMsg(null);
    const nowIso = new Date().toISOString();
    const answers: AiClarificationAnswer[] = questions.map((q) => {
      if (skipAll) {
        return {
          questionId: q.id,
          selectedOption: '__skip__',
          answeredAt: nowIso,
        };
      }
      const sel = selectedByQ[q.id] || q.suggestedOptions[0] || '__skip__';
      const isOther = sel === '__other__';
      return {
        questionId: q.id,
        selectedOption: isOther ? 'אחר' : sel,
        isCustomOther: isOther,
        customProductName: isOther ? (customOtherByQ[q.id] || '').trim() : undefined,
        gramsOrPortionText: (portionByQ[q.id] || '').trim() || undefined,
        answeredAt: nowIso,
      };
    });

    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'clarify-meal',
          traineeId: job.targetTraineeId,
          date: job.date,
          mealSlotId: job.mealSlotId,
          clarificationJobId: job.id,
          clarificationQuestions: questions,
          clarificationAnswers: answers,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data?.error || 'שגיאה בהשלמת הבהרת התווית — נסה שוב');
        return;
      }
      onResolved(data?.summary);
    } catch {
      setErrorMsg('שגיאת רשת בהבהרת התווית — נסה שוב');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        borderRadius: 22,
        padding: 14,
        background: 'rgba(245, 158, 11, 0.1)',
        border: '1.5px solid rgba(245, 158, 11, 0.45)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HelpCircle size={18} color="var(--accent)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            ה־AI זיהה תווית ערכים — מאיזה מוצר היא?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
            בחר מהאופציות או כתוב בעצמך תחת &quot;אחר&quot; כדי שנחשב את הערכים המדויקים
          </div>
        </div>
      </div>

      {questions.map((q) => {
        const imgUrl = findPhotoForQuestion(q);
        const sel = selectedByQ[q.id];
        return (
          <div
            key={q.id}
            style={{
              background: 'var(--card)',
              borderRadius: 16,
              padding: 12,
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {imgUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgUrl}
                  alt="תווית ערכים להבהרה"
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: 'cover',
                    borderRadius: 12,
                    border: '1px solid var(--line)',
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{q.questionText}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                  נתונים מהטבלה: {q.extractedTableSummary}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {q.suggestedOptions.map((opt) => {
                const active = sel === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() =>
                      setSelectedByQ((prev) => ({ ...prev, [q.id]: opt }))
                    }
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: active
                        ? '1.5px solid var(--sel-border)'
                        : '1px solid var(--line-2)',
                      background: active ? 'var(--sel-bg)' : 'var(--surface-2)',
                      color: active ? 'var(--sel-text)' : 'var(--text)',
                      fontSize: 13,
                      fontWeight: active ? 700 : 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    {active && <Check size={13} />}
                    <span>{opt}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setSelectedByQ((prev) => ({ ...prev, [q.id]: '__other__' }))
                }
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border:
                    sel === '__other__'
                      ? '1.5px solid var(--sel-border)'
                      : '1px solid var(--line-2)',
                  background:
                    sel === '__other__' ? 'var(--sel-bg)' : 'var(--surface-2)',
                  color: sel === '__other__' ? 'var(--sel-text)' : 'var(--text)',
                  fontSize: 13,
                  fontWeight: sel === '__other__' ? 700 : 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                אחר (הקלד שם מוצר)
              </button>
            </div>

            {sel === '__other__' && (
              <input
                type="text"
                placeholder="כתוב של איזה מוצר הטבלה (למשל: חטיף חלבון All In)"
                value={customOtherByQ[q.id] || ''}
                onChange={(e) =>
                  setCustomOtherByQ((prev) => ({
                    ...prev,
                    [q.id]: e.currentTarget.value,
                  }))
                }
                style={{
                  font: 'inherit',
                  fontSize: 15,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid var(--line-2)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
            )}

            <input
              type="text"
              placeholder="כמה אכלת מהמוצר? (אופציונלי — למשל: 40 גרם / כף אחת)"
              value={portionByQ[q.id] || ''}
              onChange={(e) =>
                setPortionByQ((prev) => ({
                  ...prev,
                  [q.id]: e.currentTarget.value,
                }))
              }
              style={{
                font: 'inherit',
                fontSize: 13.5,
                padding: '8px 12px',
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>
        );
      })}

      {errorMsg && (
        <div style={{ fontSize: 12.5, color: 'var(--danger-text)', fontWeight: 700 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={!canSubmit || submitting}
          onClick={() => void handleSubmit(false)}
          className="btn-volt"
          style={{
            flex: 1,
            height: 44,
            fontSize: 14,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: canSubmit && !submitting ? 'pointer' : 'not-allowed',
            opacity: canSubmit && !submitting ? 1 : 0.6,
          }}
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          <span>{submitting ? 'מחשב ושומר...' : 'אשר וחשב ערכים'}</span>
        </button>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit(true)}
          className="btn-surface"
          style={{
            height: 44,
            padding: '0 14px',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          דלג ושמור לפי הערכה
        </button>
      </div>
    </div>
  );
}
