'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  Bell,
  BellOff,
  Check,
  Search,
  Utensils,
  TrendingUp,
  Footprints,
  Droplets,
  Flame,
  Smartphone,
  Settings,
  Send,
  Loader2,
  AlertTriangle,
  Share,
  PlusSquare,
  Globe,
  Sliders,
} from 'lucide-react';
import { Switch } from '@mantine/core';
import { Pencil, Palette } from 'lucide-react';
import { Chip } from './ui/Chip';
import { GlassButton } from './ui/GlassButton';
import { ThemeToggle } from './ui/ThemeToggle';
import {
  MealCardShortcutId,
  TraineeProfile,
  TraineePushPreferences,
} from '@/types/nutrition';
import { sumMacros } from '@/data/israeliFoodCatalog';
import {
  ALL_MEAL_SHORTCUT_OPTIONS,
  DEFAULT_MEAL_CARD_SHORTCUTS,
} from '@/lib/dateUtils';
import {
  AndroidPushStatus,
  getAndroidPushStatus,
  openAndroidNotificationSettings,
  requestAndRegisterAndroidPush,
} from '@/lib/capacitorPush';
import {
  WebPushEnvironmentStatus,
  ensurePushServiceWorkerRegistered,
  getWebPushEnvironmentStatus,
  requestAndSubscribeWebPush,
} from '@/lib/webPushClient';

interface TraineeProfileViewProps {
  trainee: TraineeProfile;
  todayIso: string;
  isCoachPreview?: boolean;
  onRenameProfile: (name: string) => Promise<{ error?: string }>;
  onOpenMealFromHistory: (date: string, mealSlotId: string) => void;
  onPushPreferencesUpdated?: (prefs: TraineePushPreferences) => void;
  onUpdateMealShortcuts?: (
    traineeId: string,
    shortcuts: MealCardShortcutId[]
  ) => void | Promise<void>;
}

export function TraineeProfileView({
  trainee,
  todayIso,
  isCoachPreview = false,
  onRenameProfile,
  onOpenMealFromHistory,
  onPushPreferencesUpdated,
  onUpdateMealShortcuts,
}: TraineeProfileViewProps) {
  const [nameInput, setNameInput] = useState(trainee.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const [mealSearch, setMealSearch] = useState('');

  const [pushStatus, setPushStatus] = useState<AndroidPushStatus | null>(null);
  const [webStatus, setWebStatus] = useState<WebPushEnvironmentStatus | null>(
    null
  );
  const [prefs, setPrefs] = useState<TraineePushPreferences>({
    aiMealReady: trainee.pushPreferences?.aiMealReady !== false,
    coachMessages: trainee.pushPreferences?.coachMessages !== false,
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  useEffect(() => {
    setNameInput(trainee.name);
  }, [trainee.name]);

  useEffect(() => {
    setPrefs({
      aiMealReady: trainee.pushPreferences?.aiMealReady !== false,
      coachMessages: trainee.pushPreferences?.coachMessages !== false,
    });
  }, [trainee.pushPreferences]);

  const refreshPushStatus = async () => {
    const [androidSt, webSt] = await Promise.all([
      getAndroidPushStatus(),
      getWebPushEnvironmentStatus(),
    ]);
    setPushStatus(androidSt);
    setWebStatus(webSt);
  };

  useEffect(() => {
    void ensurePushServiceWorkerRegistered().then(() => refreshPushStatus());
  }, []);

  // מיני-דשבורד סטטיסטיקות (7 ימים אחרונים + מגמת משקל)
  const stats = useMemo(() => {
    const recentDates: string[] = [];
    const base = new Date(`${todayIso}T12:00:00`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      recentDates.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`
      );
    }

    let calDays = 0;
    let totalCal = 0;
    let totalProtein = 0;
    let waterDays = 0;
    let totalWater = 0;
    let stepDays = 0;
    let totalSteps = 0;
    let mealsLoggedCount = 0;

    for (const dIso of recentDates) {
      const log = trainee.logs?.[dIso];
      if (!log) continue;
      const dayItems = Object.values(log.meals || {}).flatMap(
        (m) => m?.items || []
      );
      if (dayItems.length > 0) {
        const dayMac = sumMacros(dayItems.map((item) => item.macros));
        totalCal += dayMac.calories;
        totalProtein += dayMac.protein;
        calDays += 1;
        mealsLoggedCount += Object.values(log.meals || {}).filter(
          (m) => (m?.items?.length || 0) > 0
        ).length;
      }
      if ((log.waterCups || 0) > 0) {
        totalWater += log.waterCups;
        waterDays += 1;
      }
      if ((log.steps || 0) > 0) {
        totalSteps += log.steps || 0;
        stepDays += 1;
      }
    }

    const firstWeight = trainee.weightHistory?.[0]?.weight;
    const weightDelta =
      typeof firstWeight === 'number'
        ? Number((trainee.currentWeight - firstWeight).toFixed(1))
        : null;

    return {
      avgCalories: calDays > 0 ? Math.round(totalCal / calDays) : 0,
      avgProtein: calDays > 0 ? Math.round(totalProtein / calDays) : 0,
      avgWater: waterDays > 0 ? (totalWater / waterDays).toFixed(1) : '0',
      avgSteps: stepDays > 0 ? Math.round(totalSteps / stepDays) : 0,
      mealsLoggedCount,
      activeDays: calDays,
      weightDelta,
    };
  }, [trainee, todayIso]);

  // רשימת ארוחות המתאמן מדף הפרופיל (חיפוש + צפייה היסטורית)
  const loggedMealsList = useMemo(() => {
    const slotNames = new Map<string, string>();
    for (const s of trainee.workoutTemplate?.meals || []) {
      slotNames.set(s.id, s.name);
    }
    for (const s of trainee.restTemplate?.meals || []) {
      if (!slotNames.has(s.id)) slotNames.set(s.id, s.name);
    }

    const rows: Array<{
      id: string;
      date: string;
      mealSlotId: string;
      mealSlotName: string;
      updatedAt?: string;
      mealTime?: string;
      calories: number;
      protein: number;
      itemsSummary: string;
      itemsCount: number;
    }> = [];

    const sortedDates = Object.keys(trainee.logs || {})
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 30);

    for (const date of sortedDates) {
      const dayLog = trainee.logs[date];
      if (!dayLog?.meals) continue;
      for (const [slotId, entry] of Object.entries(dayLog.meals)) {
        if (!entry || !entry.items || entry.items.length === 0) continue;
        const m = sumMacros(entry.items.map((item) => item.macros));
        const slotName = slotNames.get(slotId) || slotId;
        const summary = entry.items.map((i) => i.name).join(', ');
        rows.push({
          id: `${date}-${slotId}`,
          date,
          mealSlotId: slotId,
          mealSlotName: slotName,
          updatedAt: entry.updatedAt,
          mealTime: entry.mealTime,
          calories: Math.round(m.calories),
          protein: Math.round(m.protein),
          itemsSummary: summary,
          itemsCount: entry.items.length,
        });
      }
    }

    const q = mealSearch.trim().toLowerCase();
    if (!q) return rows.slice(0, 40);
    return rows
      .filter(
        (r) =>
          r.itemsSummary.toLowerCase().includes(q) ||
          r.mealSlotName.toLowerCase().includes(q) ||
          r.date.includes(q)
      )
      .slice(0, 40);
  }, [trainee, mealSearch]);

  const handleSaveName = async () => {
    const clean = nameInput.trim();
    if (clean.length < 2) {
      setNameMessage({ ok: false, text: 'יש להזין לפחות 2 תווים' });
      return;
    }
    setSavingName(true);
    setNameMessage(null);
    try {
      const res = await onRenameProfile(clean);
      if (res?.error) {
        setNameMessage({ ok: false, text: res.error });
      } else {
        setNameMessage({ ok: true, text: 'שם המשתמש עודכן בהצלחה ✓' });
      }
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdatePushPrefs = async (next: TraineePushPreferences) => {
    setPrefs(next);
    if (isCoachPreview) return;
    try {
      const res = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'update-preferences',
          ...next,
        }),
      });
      if (res.ok && onPushPreferencesUpdated) {
        onPushPreferencesUpdated(next);
      }
    } catch {
      // ignore
    }
  };

  const handleEnablePushFromProfile = async () => {
    if (pushBusy || isCoachPreview) return;
    setPushBusy(true);
    setPushFeedback(null);
    try {
      const res = await requestAndRegisterAndroidPush();
      await refreshPushStatus();
      if (res.ok) {
        setPushFeedback({
          ok: true,
          text: 'התראות הופעלו והמכשיר נרשם בהצלחה ✓',
        });
      } else if (res.reason === 'firebase-not-configured') {
        setPushFeedback({
          ok: false,
          text: 'שרת ההתראות (google-services.json) עדיין בתהליך חיבור ל־APK.',
        });
      } else if (res.reason === 'denied') {
        setPushFeedback({
          ok: false,
          text: 'המערכת חוסמת התראות כרגע — לחץ על "פתח הגדרות התראות במכשיר" כדי לאשר.',
        });
      } else {
        setPushFeedback({
          ok: false,
          text: 'לא ניתן להשלים רישום התראות כרגע. נסה שוב בעוד רגע.',
        });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleTestPush = async () => {
    if (pushBusy || isCoachPreview) return;
    setPushBusy(true);
    setPushFeedback(null);
    try {
      const res = await fetch('/api/push/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'test-self' }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setPushFeedback({
          ok: false,
          text: json?.error || 'שגיאה בשליחת התראת בדיקה',
        });
      } else {
        setPushFeedback({
          ok: true,
          text: 'נשלחה התראת בדיקה למכשיר שלך!',
        });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleEnableWebPushFromProfile = async () => {
    if (pushBusy || isCoachPreview) return;
    setPushBusy(true);
    setPushFeedback(null);
    try {
      // חשוב: לא להוסיף כאן await מיותר לפני הקריאה כדי לשמור על Transient User Activation באייפון
      const res = await requestAndSubscribeWebPush();
      await refreshPushStatus();
      if (res.ok) {
        setPushFeedback({
          ok: true,
          text: 'התראות הדפדפן/אייפון הופעלו בהצלחה ✓',
        });
      } else if (res.reason === 'needs-ios-a2hs') {
        setPushFeedback({
          ok: false,
          text: 'באייפון יש להוסיף קודם למסך הבית (כפתור שתף > הוסף למסך הבית) ולפתוח מהאייקון.',
        });
      } else if (res.reason === 'vapid-missing') {
        setPushFeedback({
          ok: false,
          text: 'מפתחות השרת (VAPID) להתראות Web/iPhone טרם הוגדרו ב-Vercel.',
        });
      } else if (res.reason === 'denied') {
        setPushFeedback({
          ok: false,
          text: 'הרשאת ההתראות נחסמה — יש לאפשר התראות בהגדרות האייפון / הדפדפן ולנסות שוב.',
        });
      } else {
        setPushFeedback({
          ok: false,
          text: 'לא ניתן היה להפעיל התראות כרגע. נסה שוב.',
        });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const isAndroidGranted = Boolean(
    pushStatus?.isNativeAndroid &&
      pushStatus.permissionState === 'granted' &&
      pushStatus.systemNotificationsEnabled
  );
  const isWebGranted = Boolean(
    !pushStatus?.isNativeAndroid &&
      webStatus?.webPushSupported &&
      webStatus.permissionState === 'granted' &&
      webStatus.isSubscribed
  );
  const isCurrentPlatformPushActive = isAndroidGranted || isWebGranted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Identity header (rename behind the pencil button) */}
      <section aria-label="פרטי משתמש" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 0 2px' }}>
          <div
            aria-hidden
            style={{
              width: 64,
              height: 64,
              borderRadius: 999,
              background: 'var(--surface-3)',
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 700,
              flex: 'none',
            }}
          >
            {trainee.avatar ||
              trainee.name
                .trim()
                .split(/\s+/)
                .map((w) => Array.from(w)[0] || '')
                .join('')
                .slice(0, 2) ||
              'מ'}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: 24,
                fontWeight: 700,
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {trainee.name}
            </span>
            <span
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {trainee.email || 'מתאמן SPOT'} · {trainee.goal || 'מעקב תזונה'}
            </span>
          </div>
          {!isCoachPreview && (
            <GlassButton
              label="שינוי שם משתמש"
              aria-expanded={renameOpen}
              onClick={() => setRenameOpen((v) => !v)}
            >
              <Pencil size={18} />
            </GlassButton>
          )}
        </div>

        {renameOpen && (
          <div className="pro-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              שם תצוגה באפליקציה ובהתראות
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={nameInput}
                maxLength={60}
                disabled={isCoachPreview || savingName}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="הקלד שם חדש..."
                aria-label="שם משתמש"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 44,
                  background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 14,
                  padding: '0 14px',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                disabled={isCoachPreview || savingName}
                onClick={handleSaveName}
                className="btn-volt"
                style={{
                  height: 44,
                  padding: '0 16px',
                  fontSize: 14,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {savingName ? <Loader2 size={15} className="spot-spinner" /> : <Check size={15} />}
                <span>שמור</span>
              </button>
            </div>
          </div>
        )}
        {nameMessage && (
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: nameMessage.ok ? 'var(--status-ok)' : 'var(--status-danger)',
            }}
          >
            {nameMessage.text}
          </div>
        )}
      </section>

      {/* Appearance: system / dark / light */}
      <section className="pro-card" aria-label="מראה" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Palette size={18} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>מראה</span>
        </div>
        <ThemeToggle />
      </section>

      {/* 2. מיני-דשבורד סטטיסטיקות (7 ימים אחרונים) */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 700 }}>
            סטטיסטיקות שבוע אחרון
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {stats.activeDays} ימים מתועדים • {stats.mealsLoggedCount} ארוחות
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}
        >
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--card-shadow)',
              padding: '14px 16px',
              borderRadius: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
                color: 'var(--text-2)',
                marginBottom: 6,
              }}
            >
              <Flame size={13} color="currentColor" />
              <span>ממוצע קלורי וחלבון</span>
            </div>
            <div className="num-mono" style={{ fontSize: 24, fontWeight: 700 }}>
              {stats.avgCalories.toLocaleString()} קק״ל
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
              ממוצע {stats.avgProtein}g חלבון ליום
            </div>
          </div>

          {Object.values(trainee.logs || {}).some(
            (l) => l?.stepsSource && l.stepsSource !== 'manual' && (l.steps ?? 0) > 0
          ) && (
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--card-shadow)',
                padding: '14px 16px',
                borderRadius: 24,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                  color: 'var(--text-2)',
                  marginBottom: 4,
                }}
              >
                <Footprints size={13} color="var(--ok-text)" />
                <span>ממוצע צעדים יומי</span>
              </div>
              <div className="num-mono" style={{ fontSize: 24, fontWeight: 700 }}>
                {stats.avgSteps.toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                יעד:{' '}
                {(trainee.activityTargets?.dailyStepsTarget ?? 8000).toLocaleString()}
              </div>
            </div>
          )}

          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--card-shadow)',
              padding: '14px 16px',
              borderRadius: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
                color: 'var(--text-2)',
                marginBottom: 6,
              }}
            >
              <Droplets size={13} color="var(--text-2)" />
              <span>ממוצע מים יומי</span>
            </div>
            <div className="num-mono" style={{ fontSize: 24, fontWeight: 700 }}>
              {stats.avgWater} כוסות
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              יעד יומי: ~12 כוסות
            </div>
          </div>

          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--line)',
              boxShadow: 'var(--card-shadow)',
              padding: '14px 16px',
              borderRadius: 24,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
                color: 'var(--text-2)',
                marginBottom: 6,
              }}
            >
              <TrendingUp size={13} color="var(--accent-orange-bright)" />
              <span>שינוי משקל כולל</span>
            </div>
            <div className="num-mono" style={{ fontSize: 24, fontWeight: 700 }}>
              {trainee.currentWeight} ק״ג
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {stats.weightDelta === null
                ? `יעד: ${trainee.targetWeight} ק״ג`
                : (
                    <>
                      {/* Signed value stays LTR so the sign never jumps to the other side. */}
                      <bdi dir="ltr" className="ltr-num">
                        {`${stats.weightDelta > 0 ? '+' : ''}${stats.weightDelta}`}
                      </bdi>{' '}
                      ק״ג מתחילת המעקב
                    </>
                  )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. הגדרות פושים והתראות */}
      <div className="pro-card" style={{ padding: 18, borderRadius: 28 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {isCurrentPlatformPushActive ? (
              <Bell size={16} color="currentColor" />
            ) : (
              <BellOff size={16} color="var(--text-secondary)" />
            )}
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              הגדרות פושים והתראות
            </span>
          </div>

          {(pushStatus?.isNativeAndroid || webStatus?.webPushSupported) && (
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                padding: '3px 8px',
                borderRadius: 999,
                background: isCurrentPlatformPushActive
                  ? 'var(--surface-2)'
                  : 'var(--surface-2)',
                color: isCurrentPlatformPushActive ? 'var(--ok-text)' : 'var(--warn-text)',
              }}
            >
              {isCurrentPlatformPushActive
                ? 'מאושר במכשיר ✓'
                : 'כבוי / ממתין לאישור'}
            </span>
          )}
        </div>

        {pushStatus?.isNativeAndroid && !isCoachPreview ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {!pushStatus.firebaseConfigured && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 20,
                  padding: '8px 10px',
                  fontSize: 14,
                  color: 'var(--warn-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>
                  חבילת Firebase (`google-services.json`) טרם שולבה ב־APK הזה —
                  ניתן כבר לאשר הרשאת מערכת, והרישום יפעל אוטומטית בגרסה הבאה.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(pushStatus.permissionState !== 'granted' ||
                !pushStatus.systemNotificationsEnabled ||
                !pushStatus.hasSavedToken) && (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={handleEnablePushFromProfile}
                  className="btn-volt"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '9px 12px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <Bell size={14} />
                  <span>
                    {pushBusy ? 'בודק הרשאות...' : 'אשר / חבר קבלת התראות'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void openAndroidNotificationSettings()}
                className="btn-surface"
                style={{
                  padding: '9px 12px',
                  fontSize: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <Settings size={13} />
                <span>הגדרות התראות במכשיר</span>
              </button>

              {pushStatus.permissionState === 'granted' &&
                pushStatus.systemNotificationsEnabled &&
                pushStatus.firebaseConfigured && (
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={handleTestPush}
                    className="btn-surface"
                    style={{
                      padding: '9px 12px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <Send size={13} color="currentColor" />
                    <span>שלח התראת בדיקה</span>
                  </button>
                )}
            </div>

            {pushFeedback && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: pushFeedback.ok ? 'var(--ok-text)' : 'var(--danger-text)',
                }}
              >
                {pushFeedback.text}
              </div>
            )}
          </div>
        ) : webStatus?.needsIosAddToHomeScreen && !isCoachPreview ? (
          <div
            style={{
              background: 'var(--bg-surface-2)',
              border: '1px solid var(--line-2)',
              borderRadius: 20,
              padding: 12,
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--text)',
              }}
            >
              <Smartphone size={15} />
              <span>הפעלת התראות באייפון (באמצעות מסך הבית)</span>
            </div>
            {webStatus.isIosInAppBrowser && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--warn-text)',
                  background: 'var(--surface-2)',
                  padding: '6px 9px',
                  borderRadius: 8,
                }}
              >
                פתחת מתוך דפדפן פנימי (וואטסאפ/אינסטגרם). יש לפתוח קודם את העמוד בדפדפן <strong>Safari</strong>.
              </div>
            )}
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Share size={13} color="currentColor" style={{ flexShrink: 0 }} />
                <span>
                  1. לחץ/י על כפתור <strong>השיתוף (Share)</strong> בסרגל Safari.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <PlusSquare size={13} color="currentColor" style={{ flexShrink: 0 }} />
                <span>
                  2. גלול/י ובחר/י <strong>הוסף למסך הבית (Add to Home Screen)</strong>.
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bell size={13} color="currentColor" style={{ flexShrink: 0 }} />
                <span>
                  3. פתח/י את אייקון <strong>SPOT</strong> ממסך הבית וחזור/י לכאן לאישור התראות.
                </span>
              </div>
            </div>
          </div>
        ) : webStatus?.webPushSupported && !isCoachPreview ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Globe size={13} color="currentColor" />
              <span>סביבה מזוהה: {webStatus.deviceLabel}</span>
            </div>

            {!webStatus.vapidConfigured && (
              <div
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 20,
                  padding: '8px 10px',
                  fontSize: 14,
                  color: 'var(--warn-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>
                  מפתחות השרת להתראות Web/iPhone (NEXT_PUBLIC_VAPID_PUBLIC_KEY) טרם הוגדרו ב-Vercel.
                </span>
              </div>
            )}

            {webStatus.permissionState === 'denied' && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 20,
                  padding: '8px 10px',
                  fontSize: 14,
                  color: 'var(--danger-text)',
                }}
              >
                {webStatus.isIos
                  ? 'ההתראות חסומות באייפון: פתח את הגדרות האייפון > התראות > Spot Fitness > הפעל "אפשר התראות".'
                  : 'ההתראות חסומות בדפדפן: לחץ על סמל ההגדרות/מנעול בשורת הכתובת והפעל התראות.'}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(webStatus.permissionState !== 'granted' ||
                !webStatus.isSubscribed) && (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={handleEnableWebPushFromProfile}
                  className="btn-volt"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    padding: '9px 12px',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <Bell size={14} />
                  <span>
                    {pushBusy
                      ? 'מפעיל התראות...'
                      : 'אשר קבלת התראות במכשיר זה'}
                  </span>
                </button>
              )}

              {webStatus.permissionState === 'granted' &&
                webStatus.isSubscribed &&
                webStatus.vapidConfigured && (
                  <button
                    type="button"
                    disabled={pushBusy}
                    onClick={handleTestPush}
                    className="btn-surface"
                    style={{
                      padding: '9px 12px',
                      fontSize: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <Send size={13} color="currentColor" />
                    <span>שלח התראת בדיקה</span>
                  </button>
                )}
            </div>

            {pushFeedback && (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: pushFeedback.ok ? 'var(--ok-text)' : 'var(--danger-text)',
                }}
              >
                {pushFeedback.text}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              background: 'var(--bg-surface-2)',
              borderRadius: 20,
              padding: '9px 12px',
              marginBottom: 12,
              fontSize: 12,
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Smartphone size={14} color="currentColor" />
              <span>
                {isCoachPreview
                  ? 'תצוגת מתאמן: הגדרת התראות זמינה במכשיר האישי של המתאמן.'
                  : 'הדפדפן הנוכחי אינו תומך בהתראות Web Push (ניתן להשתמש בספארי אייפון ממסך הבית או בדפדפן עדכני).'}
              </span>
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              background: 'var(--bg-surface-2)',
              padding: '10px 12px',
              borderRadius: 20,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                סיום זיהוי ארוחה ב־AI ברקע
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                שולח התראה עם שם המנה והקלוריות רק אם יצאת מהאפליקציה בזמן הטעינה
              </div>
            </div>
            <Switch
              checked={prefs.aiMealReady}
              disabled={isCoachPreview}
              color="orange"
              onChange={(e) =>
                void handleUpdatePushPrefs({
                  ...prefs,
                  aiMealReady: e.currentTarget.checked,
                })
              }
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              background: 'var(--bg-surface-2)',
              padding: '10px 12px',
              borderRadius: 20,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                הודעות ותזכורות מהמאמן
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                קבלת תזכורות אישיות ומעבר ישיר לארוחה שהמאמן ביקש
              </div>
            </div>
            <Switch
              checked={prefs.coachMessages}
              disabled={isCoachPreview}
              color="orange"
              onChange={(e) =>
                void handleUpdatePushPrefs({
                  ...prefs,
                  coachMessages: e.currentTarget.checked,
                })
              }
            />
          </div>
        </div>
      </div>

      {/* 3.5 התאמת קיצורי דרך בכרטיסי הארוחה (עד 2 לבחירה) */}
      {onUpdateMealShortcuts && (
        <div className="pro-card" style={{ padding: 18, borderRadius: 28 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Sliders size={15} color="currentColor" />
              <span>קיצורי דרך בכרטיס הארוחה</span>
            </span>
            <span
              className="num-mono"
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: 'var(--accent-orange-bright)',
              }}
            >
              {(trainee.mealCardShortcuts ?? DEFAULT_MEAL_CARD_SHORTCUTS).length}/2 פעילים
            </span>
          </div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--text-2)',
              marginBottom: 10,
            }}
          >
            הכפתור <strong>&quot;+ הוסף / ערוך&quot;</strong> מופיע תמיד בשורה הראשונה. בחר עד 2 קיצורי דרך נוספים שיופיעו לצדו:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ALL_MEAL_SHORTCUT_OPTIONS.map((opt) => {
              const current = trainee.mealCardShortcuts ?? DEFAULT_MEAL_CARD_SHORTCUTS;
              const active = current.includes(opt.id);
              return (
                <Chip
                  key={opt.id}
                  selected={active}
                  title={opt.description}
                  onClick={() => {
                    // When two are already active, picking a third replaces the oldest one.
                    const next = active
                      ? current.filter((x) => x !== opt.id)
                      : current.length >= 2
                      ? [current[current.length - 1], opt.id]
                      : [...current, opt.id];
                    void onUpdateMealShortcuts(trainee.id, next);
                  }}
                >
                  {opt.label}
                </Chip>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. הארוחות שלי — היסטוריה מלאה וחיפוש */}
      <section aria-label="הארוחות שלי" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Utensils size={17} />
            <span>
              הארוחות שלי (<bdi className="ltr-num">{loggedMealsList.length}</bdi>)
            </span>
          </h2>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>לחץ לפתיחה ביומן</span>
        </div>

        <div style={{ position: 'relative' }}>
          <Search
            size={18}
            color="var(--text-3)"
            style={{ position: 'absolute', insetInlineStart: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="search"
            aria-label="חיפוש בארוחות שלי"
            value={mealSearch}
            onChange={(e) => setMealSearch(e.target.value)}
            placeholder="חפש מאכל, שם ארוחה או תאריך"
            style={{
              width: '100%',
              height: 52,
              boxSizing: 'border-box',
              background: 'var(--card)',
              border: '1px solid var(--line-2)',
              borderRadius: 999,
              paddingInline: '46px 16px',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 16,
              outline: 'none',
            }}
          />
        </div>

        {loggedMealsList.length === 0 ? (
          <div
            style={{
              padding: '22px 16px',
              textAlign: 'center',
              fontSize: 14,
              color: 'var(--text-2)',
              border: '1.5px dashed var(--line-2)',
              borderRadius: 22,
            }}
          >
            לא נמצאו ארוחות מתועדות התואמות לחיפוש
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loggedMealsList.map((row) => {
              const [yy, mo, dd] = row.date.split('-');
              const time =
                row.mealTime ||
                (row.updatedAt
                  ? new Date(row.updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })
                  : '');
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onOpenMealFromHistory(row.date, row.mealSlotId)}
                  style={{
                    textAlign: 'start',
                    width: '100%',
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 22,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    boxShadow: 'var(--card-shadow)',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{row.mealSlotName}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      <bdi dir="ltr" className="ltr-num">
                        {dd}.{mo}.{yy}
                      </bdi>
                      {time ? (
                        <>
                          {' · '}
                          <bdi dir="ltr" className="ltr-num">{time}</bdi>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.itemsSummary}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>
                    <bdi dir="ltr" className="num-mono ltr-num">{row.calories}</bdi> קק״ל
                    <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>
                      {' · '}ח׳ <bdi dir="ltr" className="ltr-num">{row.protein}</bdi>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
