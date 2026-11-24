'use client';

import React, { useEffect, useState } from 'react';
import {
  Footprints,
  RefreshCw,
  Settings,
  Watch,
  Check,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { StepsSyncSource } from '@/types/nutrition';
import {
  getNativeStepsStatus,
  installOrOpenHealthConnect,
  isNativeAndroidApp,
  NativeStepEngineStatus,
  openAndroidAppSettings,
  requestNativeStepPermissions,
} from '@/lib/capacitorSteps';

interface DailyStepsCardProps {
  selectedDate: string;
  todayIso: string;
  steps?: number;
  stepsSource?: StepsSyncSource;
  stepsSyncedAt?: string;
  dailyStepsTarget: number;
  isCoachPreview?: boolean;
  isBlockedDay?: boolean;
  onSaveManualSteps: (steps: number) => Promise<void> | void;
  onSyncNativeStepsNow?: () => Promise<void>;
}

function formatSyncTime(iso?: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function getSourceBadge(source?: StepsSyncSource): {
  label: string;
  color: string;
  bg: string;
} {
  switch (source) {
    case 'health-connect':
      return {
        label: 'שעון / Health Connect',
        color: 'var(--ok-text)',
        bg: 'rgba(34, 197, 94, 0.14)',
      };
    case 'play-services-local':
      return {
        label: 'מד צעדים (רקע מערכת)',
        color: 'var(--info-text)',
        bg: 'var(--surface-2)',
      };
    case 'device-sensor':
      return {
        label: 'חיישן מכשיר',
        color: 'var(--text-2)',
        bg: 'var(--surface-2)',
      };
    case 'manual':
      return {
        label: 'הזנה ידנית',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.14)',
      };
    default:
      return {
        label: 'טרם סונכרן',
        color: 'var(--text-muted)',
        bg: 'var(--fill-1)',
      };
  }
}

export function DailyStepsCard({
  selectedDate,
  todayIso,
  steps = 0,
  stepsSource,
  stepsSyncedAt,
  dailyStepsTarget,
  isCoachPreview = false,
  isBlockedDay = false,
  onSaveManualSteps,
  onSyncNativeStepsNow,
}: DailyStepsCardProps) {
  const [nativeApp, setNativeApp] = useState(false);
  const [nativeStatus, setNativeStatus] =
    useState<NativeStepEngineStatus | null>(null);
  const [restrictedHint, setRestrictedHint] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInput, setManualInput] = useState(String(steps || 0));

  useEffect(() => {
    setManualInput(String(steps || 0));
  }, [steps, selectedDate]);

  useEffect(() => {
    const isAndroid = isNativeAndroidApp();
    setNativeApp(isAndroid);
    if (!isAndroid || isCoachPreview) return;
    getNativeStepsStatus().then((st) => {
      if (st) setNativeStatus(st);
    });
  }, [isCoachPreview]);

  const pct = Math.min(
    100,
    Math.round((Math.max(0, steps) / Math.max(1000, dailyStepsTarget)) * 100)
  );
  const badge = getSourceBadge(stepsSource);
  const syncTimeLabel = formatSyncTime(stepsSyncedAt);

  const canAutoSyncDate =
    nativeApp &&
    !isCoachPreview &&
    (() => {
      const diffMs =
        Date.parse(`${todayIso}T12:00:00`) -
        Date.parse(`${selectedDate}T12:00:00`);
      const diffDays = Math.round(diffMs / 86400000);
      return diffDays >= 0 && diffDays <= 6;
    })();

  const needsPermissions =
    nativeApp &&
    !isCoachPreview &&
    nativeStatus !== null &&
    !nativeStatus.activityRecognitionGranted &&
    !nativeStatus.healthConnectStepsGranted;

  const handleConnectOrSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const st = await requestNativeStepPermissions();
      if (st) {
        setNativeStatus(st);
        setRestrictedHint(
          Boolean(st.restrictedSettingsHint) || st.healthConnectCancelCount >= 2
        );
      }
      if (onSyncNativeStepsNow) {
        await onSyncNativeStepsNow();
      }
      const refreshed = await getNativeStepsStatus();
      if (refreshed) setNativeStatus(refreshed);
    } finally {
      setSyncing(false);
    }
  };

  const handleManualSave = async () => {
    const clean = Math.max(0, Math.min(150000, Math.round(Number(manualInput) || 0)));
    setSyncing(true);
    try {
      await onSaveManualSteps(clean);
      setManualOpen(false);
    } finally {
      setSyncing(false);
    }
  };

  const reached = steps >= dailyStepsTarget;
  const showHcHint =
    nativeStatus &&
    (nativeStatus.healthConnectStatus === 'not-installed' ||
      nativeStatus.healthConnectStatus === 'update-required');
  const glassBtn: React.CSSProperties = {
    height: 48,
    padding: '0 18px',
    borderRadius: 999,
    fontFamily: 'inherit',
    fontSize: 15,
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: isBlockedDay ? 'not-allowed' : 'pointer',
    opacity: isBlockedDay ? 0.45 : 1,
  };

  return (
    <section
      aria-label="מד צעדים יומי"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 28,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Title + source chip */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 700 }}>
          <Footprints size={18} />
          מד צעדים יומי
        </span>
        <span
          style={{
            height: 28,
            padding: '0 12px',
            borderRadius: 999,
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
            fontSize: 13,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {badge.label}
        </span>
      </div>

      {/* Big number + target + progress */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            יעד{' '}
            <bdi dir="ltr" className="num-mono ltr-num">{dailyStepsTarget.toLocaleString()}</bdi> · <bdi dir="ltr" className="ltr-num">{pct}%</bdi>
          </span>
          <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>
            {steps.toLocaleString()}
          </bdi>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={dailyStepsTarget}
          aria-valuenow={Math.min(steps, dailyStepsTarget)}
          aria-label="התקדמות צעדים"
          style={{ height: 8, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'var(--accent)',
              borderRadius: 999,
              transition: 'width 0.35s ease',
            }}
          />
        </div>
        {syncTimeLabel && (
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            סנכרון אחרון: <bdi dir="ltr" className="ltr-num">{syncTimeLabel}</bdi>
            {reached ? ' · היעד הושג' : ''}
          </span>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {nativeApp && !isCoachPreview && canAutoSyncDate && (
          <button
            type="button"
            disabled={syncing || isBlockedDay}
            onClick={handleConnectOrSync}
            className="btn-volt"
            style={{ flex: '1 1 180px', height: 52, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: isBlockedDay ? 'not-allowed' : syncing ? 'wait' : 'pointer', opacity: isBlockedDay ? 0.45 : 1 }}
          >
            <RefreshCw size={17} className={syncing ? 'spot-spinner' : undefined} />
            <span>{needsPermissions ? 'חבר מד צעדים (טלפון / שעון)' : syncing ? 'מסנכרן צעדים…' : 'סנכרן צעדים עכשיו'}</span>
          </button>
        )}
        <button
          type="button"
          className="glass"
          disabled={isBlockedDay}
          aria-expanded={manualOpen}
          onClick={() => !isBlockedDay && setManualOpen((v) => !v)}
          style={{ ...glassBtn, flex: nativeApp && !isCoachPreview && canAutoSyncDate ? 'none' : '1 1 180px', height: 52 }}
        >
          <Edit3 size={16} />
          <span>{nativeApp && !isCoachPreview ? 'ערוך ידנית' : steps > 0 ? 'עדכן צעדים ידנית' : 'הזן צעדים ידנית'}</span>
        </button>
      </div>

      {manualOpen && !isBlockedDay && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={150000}
            aria-label="מספר צעדים"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="מספר צעדים"
            dir="ltr"
            className="num-mono"
            style={{
              flex: 1,
              minWidth: 0,
              height: 52,
              borderRadius: 999,
              border: '1px solid var(--line-2)',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 18,
              fontWeight: 600,
              padding: '0 18px',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            disabled={syncing}
            onClick={handleManualSave}
            className="btn-volt"
            style={{ height: 52, padding: '0 22px', fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 'none' }}
          >
            <Check size={16} />
            <span>שמור</span>
          </button>
        </div>
      )}

      {/* Help: smartwatch / permissions (design: "משתמש בשעון חכם?") */}
      {nativeApp && !isCoachPreview && (showHcHint || (restrictedHint && !nativeStatus?.healthConnectStepsGranted)) && (
        <div
          style={{
            background: 'var(--surface-2)',
            borderRadius: 22,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600 }}>
            {restrictedHint && !nativeStatus?.healthConnectStepsGranted ? <AlertTriangle size={16} /> : <Watch size={16} />}
            {restrictedHint && !nativeStatus?.healthConnectStepsGranted ? 'Android חסם אישור הרשאת שעון' : 'משתמש בשעון חכם?'}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
            {restrictedHint && !nativeStatus?.healthConnectStepsGranted
              ? 'הטלפון ממשיך לספור דרך חיישן המערכת. לשעון חכם: הגדרות האפליקציה ← ⋮ למעלה ← "אפשר הגדרות מוגבלות".'
              : 'התקן או עדכן את Health Connect כדי לחבר את השעון באופן מלא.'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {restrictedHint && !nativeStatus?.healthConnectStepsGranted && (
              <button type="button" className="glass" onClick={() => void openAndroidAppSettings()} style={{ ...glassBtn, height: 44, opacity: 1, cursor: 'pointer' }}>
                <Settings size={15} />
                הגדרות אפליקציה
              </button>
            )}
            <button type="button" className="btn-volt" onClick={() => void installOrOpenHealthConnect()} style={{ height: 44, padding: '0 18px', fontSize: 15, cursor: 'pointer' }}>
              פתח <bdi dir="ltr">Health Connect</bdi>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
