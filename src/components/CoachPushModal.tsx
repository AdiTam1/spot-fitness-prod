'use client';

import React, { useEffect, useState } from 'react';
import { Modal, Select, TextInput, Textarea } from '@mantine/core';
import {
  Bell,
  Send,
  Smartphone,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { TraineeProfile } from '@/types/nutrition';

interface CoachPushModalProps {
  opened: boolean;
  onClose: () => void;
  trainee: TraineeProfile | null;
  todayIso: string;
  onPushSent?: () => void;
}

export function CoachPushModal({
  opened,
  onClose,
  trainee,
  todayIso,
  onPushSent,
}: CoachPushModalProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetScreen, setTargetScreen] = useState<
    'meal' | 'journal' | 'metrics' | 'profile'
  >('meal');
  const [targetMealSlotId, setTargetMealSlotId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const mealSlots = trainee?.workoutTemplate?.meals || [];
  const firstSlotId = mealSlots[0]?.id || 'breakfast';
  const lunchSlotId =
    mealSlots.find((m) => m.name.includes('צהר'))?.id ||
    mealSlots[1]?.id ||
    firstSlotId;

  useEffect(() => {
    if (!trainee || !opened) return;
    setTitle(`תזכורת עבור ${trainee.name}`);
    setBody(`${trainee.name}, עדיין לא הזנת ארוחת בוקר — היכנסי עכשיו`);
    setTargetScreen('meal');
    setTargetMealSlotId(firstSlotId);
    setFeedback(null);
  }, [trainee, opened, firstSlotId]);

  if (!trainee) return null;

  const hasDevice = (trainee.fcmTokens?.length || 0) > 0;
  const coachAlertsEnabled = trainee.pushPreferences?.coachMessages !== false;

  const presets = [
    {
      label: 'ארוחת בוקר חסרה',
      title: `בוקר טוב ${trainee.name}!`,
      body: `${trainee.name}, עדיין לא הזנת ארוחת בוקר — היכנסי עכשיו`,
      screen: 'meal' as const,
      slotId: firstSlotId,
    },
    {
      label: 'תיעוד צהריים',
      title: `תזכורת צהריים — ${trainee.name}`,
      body: `${trainee.name}, אל תשכחי לתעד את ארוחת הצהריים ביומן`,
      screen: 'meal' as const,
      slotId: lunchSlotId,
    },
    {
      label: 'מים וצעדים להיום',
      title: `בדיקת אמצע יום 💪`,
      body: `${trainee.name}, בואי נשלים יעד מים וצעדים להיום!`,
      screen: 'journal' as const,
      slotId: '',
    },
    {
      label: 'עדכון משקל והיקפים',
      title: `עדכון מדדים שבועי`,
      body: `${trainee.name}, מחכה לעדכון המשקל והצ׳ק-אין שלך באפליקציה`,
      screen: 'metrics' as const,
      slotId: '',
    },
  ];

  const handleSend = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traineeId: trainee.id,
          title: title.trim(),
          body: body.trim(),
          targetScreen,
          targetMealSlotId: targetScreen === 'meal' ? targetMealSlotId : undefined,
          targetDate: todayIso,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        sentCount?: number;
      } | null;

      if (!res.ok) {
        setFeedback({
          ok: false,
          text: json?.error || 'שליחת הודעת הפוש נכשלה',
        });
      } else {
        setFeedback({
          ok: true,
          text: `הודעת הפוש נשלחה למכשיר של ${trainee.name}! ✓`,
        });
        onPushSent?.();
      }
    } catch {
      setFeedback({ ok: false, text: 'שגיאת תקשורת מול השרת' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => !sending && onClose()}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={17} color="var(--accent-volt)" />
          <span style={{ fontWeight: 900, fontSize: 15 }}>
            שליחת פוש אישי אל {trainee.name}
          </span>
        </div>
      }
      centered
      radius="lg"
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 700,
            background:
              hasDevice && coachAlertsEnabled
                ? 'rgba(34, 197, 94, 0.12)'
                : 'rgba(245, 158, 11, 0.12)',
            border:
              hasDevice && coachAlertsEnabled
                ? '1px solid rgba(34, 197, 94, 0.35)'
                : '1px solid rgba(245, 158, 11, 0.35)',
            color: hasDevice && coachAlertsEnabled ? '#4ade80' : '#fcd34d',
          }}
        >
          {hasDevice && coachAlertsEnabled ? (
            <>
              <Smartphone size={14} />
              <span>
                למתאמן יש מכשיר אנדרואיד רשום ({trainee.fcmTokens?.length}) ומוכן לקבלת פוש
              </span>
            </>
          ) : (
            <>
              <AlertTriangle size={14} />
              <span>
                {!coachAlertsEnabled
                  ? 'המתאמן כיבה התראות מאמן בהגדרות הפרופיל'
                  : 'למתאמן אין עדיין מכשיר אנדרואיד רשום להתראות (צריך להתחבר ב-APK ולאשר התראות)'}
              </span>
            </>
          )}
        </div>

        {/* תבניות מהירות */}
        <div>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: 'var(--text-secondary)',
              marginBottom: 6,
            }}
          >
            תבניות מהירות למאמן (ממלא אוטומטית שם + דף יעד):
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setTitle(p.title);
                  setBody(p.body);
                  setTargetScreen(p.screen);
                  if (p.slotId) setTargetMealSlotId(p.slotId);
                }}
                className="btn-surface"
                style={{
                  padding: '5px 9px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <TextInput
          label="כותרת ההתראה"
          value={title}
          maxLength={90}
          onChange={(e) => setTitle(e.target.value)}
        />

        <Textarea
          label="תוכן ההודעה"
          minRows={2}
          maxLength={280}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: targetScreen === 'meal' ? '1fr 1fr' : '1fr',
            gap: 8,
          }}
        >
          <Select
            label="לאיזה מסך לעבור בלחיצה?"
            value={targetScreen}
            onChange={(val) =>
              setTargetScreen(
                (val as 'meal' | 'journal' | 'metrics' | 'profile') || 'journal'
              )
            }
            data={[
              { value: 'meal', label: 'פתיחת ארוחה ספציפית היום' },
              { value: 'journal', label: 'יומן היום (ראשי)' },
              { value: 'metrics', label: 'משקל והיקפים' },
              { value: 'profile', label: 'דף הפרופיל והסטטיסטיקות' },
            ]}
          />

          {targetScreen === 'meal' && (
            <Select
              label="איזו ארוחה לפתוח?"
              value={targetMealSlotId}
              onChange={(val) => setTargetMealSlotId(val || firstSlotId)}
              data={mealSlots.map((m) => ({
                value: m.id,
                label: m.name,
              }))}
            />
          )}
        </div>

        {feedback && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: feedback.ok ? '#4ade80' : '#fca5a5',
            }}
          >
            {feedback.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>{feedback.text}</span>
          </div>
        )}

        <button
          type="button"
          disabled={sending || !body.trim()}
          onClick={handleSend}
          className="btn-volt"
          style={{
            padding: '11px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          {sending ? (
            <Loader2 size={15} className="spot-spinner" />
          ) : (
            <Send size={15} />
          )}
          <span>{sending ? 'שולח פוש...' : 'שלח פוש אישי עכשיו'}</span>
        </button>

        {(trainee.pushHistory?.length || 0) > 0 && (
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: 6,
              }}
            >
              הודעות פוש אחרונות שנשלחו:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {(trainee.pushHistory || []).slice(0, 4).map((h) => (
                <div
                  key={h.id}
                  style={{
                    fontSize: 11,
                    background: 'var(--bg-surface-2)',
                    padding: '6px 9px',
                    borderRadius: 8,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <b style={{ color: 'var(--text-primary)' }}>{h.body}</b> •{' '}
                  {new Date(h.sentAt).toLocaleString('he-IL', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
