'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Checkbox, Modal, Switch, TextInput } from '@mantine/core';
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  Droplets,
  Dumbbell,
  Globe,
  Loader2,
  PlusSquare,
  Scale,
  Search,
  Send,
  Share,
  Smartphone,
  Users,
  Utensils,
} from 'lucide-react';
import {
  CoachAlertEventsConfig,
  CoachPushSubscriptionSettings,
  TraineeGroup,
  TraineeProfile,
} from '@/types/nutrition';
import {
  WebPushEnvironmentStatus,
  ensurePushServiceWorkerRegistered,
  getWebPushEnvironmentStatus,
  requestAndSubscribeWebPush,
} from '@/lib/webPushClient';

interface CoachAlertSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  coachId: string;
  trainees: TraineeProfile[];
  groups: TraineeGroup[];
  settings: CoachPushSubscriptionSettings | null;
  onSettingsUpdated: (next: CoachPushSubscriptionSettings) => void;
  onRefreshData?: () => Promise<void> | void;
}

const DEFAULT_EVENTS: CoachAlertEventsConfig = {
  meals: true,
  weight: true,
  workouts: true,
  water: false,
};

export function CoachAlertSettingsModal({
  opened,
  onClose,
  coachId,
  trainees,
  groups,
  settings,
  onSettingsUpdated,
  onRefreshData,
}: CoachAlertSettingsModalProps) {
  const [enabled, setEnabled] = useState(true);
  const [selectedTraineeIds, setSelectedTraineeIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [events, setEvents] = useState<CoachAlertEventsConfig>(DEFAULT_EVENTS);
  const [searchQuery, setSearchQuery] = useState('');

  const [webStatus, setWebStatus] = useState<WebPushEnvironmentStatus | null>(
    null
  );
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const wasOpenRef = useRef(false);

  const refreshDeviceStatus = async () => {
    const st = await getWebPushEnvironmentStatus();
    setWebStatus(st);
  };

  useEffect(() => {
    if (opened && !wasOpenRef.current) {
      setEnabled(settings ? settings.enabled !== false : true);
      setSelectedTraineeIds(settings?.traineeIds || []);
      setSelectedGroupIds(settings?.groupIds || []);
      setEvents(settings?.events || DEFAULT_EVENTS);
      setFeedback(null);
      void ensurePushServiceWorkerRegistered().then(() => refreshDeviceStatus());
    }
    wasOpenRef.current = opened;
  }, [opened, coachId, settings]);

  const groupMap = useMemo(() => {
    const m = new Map<string, TraineeGroup>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const traineeGroupSet = useMemo(() => new Set(selectedGroupIds), [selectedGroupIds]);
  const traineeIdSet = useMemo(
    () => new Set(selectedTraineeIds),
    [selectedTraineeIds]
  );

  const filteredTrainees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return trainees;
    return trainees.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q) ||
        (t.groupId && groupMap.get(t.groupId)?.name.toLowerCase().includes(q))
    );
  }, [trainees, searchQuery, groupMap]);

  const totalCoveredTrainees = useMemo(() => {
    return trainees.filter(
      (t) =>
        traineeIdSet.has(t.id) || (t.groupId && traineeGroupSet.has(t.groupId))
    ).length;
  }, [trainees, traineeIdSet, traineeGroupSet]);

  const savedDeviceCount =
    (settings?.webPushSubscriptions?.length || 0) +
    (settings?.fcmTokens?.length || 0);
  const isDeviceReady = Boolean(
    webStatus?.webPushSupported &&
      webStatus.permissionState === 'granted' &&
      webStatus.isSubscribed &&
      savedDeviceCount > 0
  );

  const handleEnablePushOnCoachDevice = async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    setFeedback(null);
    try {
      // קריאה ישירה בתוך מחוות לחיצה כדי לשמור על הרשאת User Activation באייפון ובספארי
      const res = await requestAndSubscribeWebPush({
        apiPath: '/api/push/coach-alerts',
      });
      await refreshDeviceStatus();
      if (res.ok) {
        await onRefreshData?.();
        setFeedback({
          ok: true,
          text: 'המכשיר אושר בהצלחה לקבלת התראות בזמן אמת ✓',
        });
      } else if (res.reason === 'needs-ios-a2hs') {
        setFeedback({
          ok: false,
          text: 'באייפון יש להוסיף קודם את האתר למסך הבית (שתף > הוסף למסך הבית) ואז לאשר מהאייקון.',
        });
      } else if (res.reason === 'vapid-missing') {
        setFeedback({
          ok: false,
          text: 'מפתחות השרת (VAPID) טרם הוגדרו ב-Vercel.',
        });
      } else if (res.reason === 'denied') {
        setFeedback({
          ok: false,
          text: 'הרשאת ההתראות חסומה במכשיר/דפדפן זה — יש לאשר בהגדרות ולנסות שוב.',
        });
      } else {
        setFeedback({
          ok: false,
          text: 'לא ניתן היה לחבר את המכשיר להתראות כרגע.',
        });
      }
    } finally {
      setDeviceBusy(false);
    }
  };

  const handleTestCoachPush = async () => {
    if (deviceBusy) return;
    setDeviceBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/push/coach-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'test-self' }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setFeedback({
          ok: false,
          text: json?.error || 'שליחת התראת הבדיקה נכשלה',
        });
      } else {
        setFeedback({
          ok: true,
          text: 'נשלחה התראת בדיקה למכשיר שלך!',
        });
      }
    } catch {
      setFeedback({ ok: false, text: 'שגיאת תקשורת מול השרת' });
    } finally {
      setDeviceBusy(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/push/coach-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'save-preferences',
          enabled,
          traineeIds: selectedTraineeIds,
          groupIds: selectedGroupIds,
          events,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        coachPushSettings?: CoachPushSubscriptionSettings;
      } | null;

      if (!res.ok || !json?.coachPushSettings) {
        setFeedback({
          ok: false,
          text: json?.error || 'שמירת הגדרות ההתראה נכשלה',
        });
        return;
      }

      onSettingsUpdated(json.coachPushSettings);
      setFeedback({
        ok: true,
        text: `הגדרות ההתראה נשמרו (${totalCoveredTrainees} מתאמנים במעקב) ✓`,
      });
    } catch {
      setFeedback({ ok: false, text: 'שגיאת תקשורת בשמירת ההגדרות' });
    } finally {
      setSaving(false);
    }
  };

  const toggleTrainee = (id: string) => {
    setSelectedTraineeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const eventCards: Array<{
    key: keyof CoachAlertEventsConfig;
    label: string;
    desc: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'meals',
      label: 'ארוחות',
      desc: 'תיעוד ידני או בסיום פענוח AI',
      icon: <Utensils size={14} color="var(--accent-volt)" />,
    },
    {
      key: 'weight',
      label: 'משקלים',
      desc: 'עדכון משקל גוף חדש',
      icon: <Scale size={14} color="var(--accent-orange-bright)" />,
    },
    {
      key: 'workouts',
      label: 'אימונים ואירובי',
      desc: 'סימון ביצוע אימון או אירובי',
      icon: <Dumbbell size={14} color="var(--accent-volt)" />,
    },
    {
      key: 'water',
      label: 'שתייה',
      desc: 'עדכון כוסות מים יומיות',
      icon: <Droplets size={14} color="#38bdf8" />,
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={() => !saving && onClose()}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BellRing size={18} color="var(--accent-volt)" />
          <span style={{ fontWeight: 900, fontSize: 16 }}>
            התראות מאמן בזמן אמת (על הזנות מתאמנים)
          </span>
        </div>
      }
      centered
      radius="lg"
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* 1. חיבור המכשיר של המאמן */}
        <div
          style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Globe size={14} color="var(--accent-volt)" />
              <span>
                המכשיר שלך לקבלת ההתראות (
                {webStatus?.deviceLabel || 'דפדפן'}):
              </span>
            </span>

            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                padding: '3px 9px',
                borderRadius: 999,
                background: isDeviceReady
                  ? 'rgba(34, 197, 94, 0.16)'
                  : 'rgba(245, 158, 11, 0.16)',
                color: isDeviceReady ? '#4ade80' : '#fcd34d',
              }}
            >
              {isDeviceReady
                ? `מוכן (${savedDeviceCount} מכשירים רשומים) ✓`
                : 'ממתין להרשאה במכשיר זה'}
            </span>
          </div>

          {webStatus?.needsIosAddToHomeScreen ? (
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Smartphone size={13} color="var(--accent-volt)" />
                <span>
                  באייפון יש להוסיף למסך הבית כדי שמאמן יקבל התראות פוש:
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Share size={12} color="var(--accent-volt)" />
                <span>1. לחץ על שתף בספארי &larr;</span>
                <PlusSquare size={12} color="var(--accent-volt)" />
                <span>2. הוסף למסך הבית &larr; פתח מהאייקון ואשר כאן.</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(!webStatus?.isSubscribed ||
                webStatus.permissionState !== 'granted' ||
                savedDeviceCount === 0) && (
                <button
                  type="button"
                  disabled={deviceBusy || !webStatus?.webPushSupported}
                  onClick={handleEnablePushOnCoachDevice}
                  className="btn-volt"
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Bell size={14} />
                  <span>
                    {deviceBusy
                      ? 'מחבר...'
                      : 'אשר וקבל התראות למכשיר זה'}
                  </span>
                </button>
              )}

              {savedDeviceCount > 0 && (
                <button
                  type="button"
                  disabled={deviceBusy}
                  onClick={handleTestCoachPush}
                  className="btn-surface"
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Send size={13} color="var(--accent-volt)" />
                  <span>שלח התראת בדיקה אליי</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* 2. מתג הפעלה כללי + סוגי הזנות */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 12,
            padding: '10px 12px',
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              הפעל קבלת התראות אוטומטיות
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              מתקבל פוש מיידי ברגע שמתאמן/ת שנבחרו מזינים נתונים חדשים
            </div>
          </div>
          <Switch
            checked={enabled}
            color="orange"
            onChange={(e) => setEnabled(e.currentTarget.checked)}
          />
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 7,
              color: 'var(--text-secondary)',
            }}
          >
            באילו הזנות לשלוח התראה?
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {eventCards.map((ev) => {
              const active = events[ev.key];
              return (
                <button
                  key={ev.key}
                  type="button"
                  onClick={() =>
                    setEvents((prev) => ({
                      ...prev,
                      [ev.key]: !prev[ev.key],
                    }))
                  }
                  style={{
                    textAlign: 'right',
                    background: active ? 'var(--surface-3)'
                      : 'var(--bg-surface-2)',
                    border: active ? '1px solid var(--text-3)'
                      : '1px solid var(--border-subtle)',
                    borderRadius: 12,
                    padding: '9px 11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: 'var(--text-primary)',
                      }}
                    >
                      {ev.icon}
                      <span>{ev.label}</span>
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: 'var(--text-secondary)',
                        marginTop: 2,
                      }}
                    >
                      {ev.desc}
                    </div>
                  </div>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 6,
                      background: active ? 'var(--sel-bg)' : 'transparent',
                      border: active
                        ? 'none'
                        : '1px solid var(--border-strong)',
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {active && <Check size={12} color="#ffffff" strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. בחירת קבוצות במעקב */}
        {groups.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'var(--text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <Users size={13} color="var(--accent-volt)" />
                <span>קבוצות במעקב (כולל אוטומטית כל מתאמן חדש בקבוצה):</span>
              </span>
              <button
                type="button"
                onClick={() =>
                  setSelectedGroupIds(
                    selectedGroupIds.length === groups.length
                      ? []
                      : groups.map((g) => g.id)
                  )
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-volt)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {selectedGroupIds.length === groups.length
                  ? 'בטל הכל'
                  : 'סמן כל הקבוצות'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {groups.map((grp) => {
                const isSelected = traineeGroupSet.has(grp.id);
                const memberCount = trainees.filter(
                  (t) => t.groupId === grp.id
                ).length;
                return (
                  <button
                    key={grp.id}
                    type="button"
                    onClick={() => toggleGroup(grp.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 11px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      fontSize: 11.5,
                      fontWeight: 700,
                      border: isSelected
                        ? `1px solid ${grp.color || 'var(--accent-volt)'}`
                        : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--sel-bg)'
                        : 'var(--bg-surface-2)',
                      color: isSelected
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: grp.color || '#d67d09',
                      }}
                    />
                    <span>
                      {grp.name} ({memberCount})
                    </span>
                    {isSelected && <Check size={12} color="var(--accent-volt)" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. בחירת מתאמנים ספציפיים */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--text-secondary)',
              }}
            >
              בחירת מתאמנים ספציפיים (סה״כ במעקב: {totalCoveredTrainees} מתוך{' '}
              {trainees.length}):
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() =>
                  setSelectedTraineeIds(trainees.map((t) => t.id))
                }
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--accent-volt)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                סמן הכל
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedTraineeIds([]);
                  setSelectedGroupIds([]);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                נקה הכל
              </button>
            </div>
          </div>

          <TextInput
            placeholder="חפש מתאמן לפי שם, מייל או קבוצה..."
            leftSection={<Search size={14} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            mb={8}
          />

          <div
            style={{
              maxHeight: 200,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              paddingLeft: 2,
            }}
          >
            {filteredTrainees.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  padding: '14px 0',
                }}
              >
                לא נמצאו מתאמנים תואמים
              </div>
            ) : (
              filteredTrainees.map((t) => {
                const direct = traineeIdSet.has(t.id);
                const viaGroup = Boolean(
                  t.groupId && traineeGroupSet.has(t.groupId)
                );
                const grpName = t.groupId ? groupMap.get(t.groupId)?.name : '';
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTrainee(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 10,
                      cursor: 'pointer',
                      background:
                        direct || viaGroup
                          ? 'rgba(214, 125, 9, 0.06)'
                          : 'var(--bg-surface-2)',
                      border: direct
                        ? '1px solid rgba(214, 125, 9, 0.35)'
                        : '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Checkbox
                        checked={direct}
                        onChange={() => {}}
                        color="orange"
                        size="xs"
                      />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                          {t.name}
                        </div>
                        {grpName && (
                          <div
                            style={{
                              fontSize: 10.5,
                              color: viaGroup
                                ? 'var(--accent-volt)'
                                : 'var(--text-secondary)',
                            }}
                          >
                            {viaGroup
                              ? `נכלל גם דרך קבוצה: ${grpName}`
                              : `קבוצה: ${grpName}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
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
            {feedback.ok ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertTriangle size={14} />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="btn-volt"
          style={{
            padding: '11px',
            fontSize: 13,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          {saving ? (
            <Loader2 size={15} className="spot-spinner" />
          ) : (
            <Check size={15} />
          )}
          <span>{saving ? 'שומר הגדרות...' : 'שמור הגדרות התראות'}</span>
        </button>
      </div>
    </Modal>
  );
}
