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
        color: '#4ade80',
        bg: 'rgba(34, 197, 94, 0.14)',
      };
    case 'play-services-local':
      return {
        label: 'מד צעדים (רקע מערכת)',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.14)',
      };
    case 'device-sensor':
      return {
        label: 'חיישן מכשיר',
        color: '#d67d09',
        bg: 'rgba(214, 125, 9, 0.14)',
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
        bg: 'rgba(255, 255, 255, 0.05)',
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

  return (
    <div
      style={{
        background: 'var(--bg-surface-2)',
        padding: '10px 12px',
        borderRadius: 12,
        border:
          steps >= dailyStepsTarget
            ? '1px solid rgba(34, 197, 94, 0.4)'
            : '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          <Footprints size={14} color="#22c55e" />
          <span>מד צעדים יומי</span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 999,
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
        </div>

        <span
          className="num-mono"
          style={{
            fontSize: 11,
            fontWeight: 800,
            color:
              steps >= dailyStepsTarget ? '#4ade80' : 'var(--text-secondary)',
          }}
        >
          {steps.toLocaleString()} / {dailyStepsTarget.toLocaleString()} ({pct}%)
        </span>
      </div>

      {/* פס התקדמות */}
      <div
        style={{
          height: 7,
          borderRadius: 999,
          background: 'var(--bg-surface-1)',
          overflow: 'hidden',
          marginBottom: 9,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background:
              steps >= dailyStepsTarget
                ? 'linear-gradient(90deg, #22c55e, #d67d09)'
                : 'linear-gradient(90deg, #38bdf8, #22c55e)',
            borderRadius: 999,
            transition: 'width 0.35s ease',
          }}
        />
      </div>

      {syncTimeLabel && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginBottom: 8,
          }}
        >
          סנכרון אחרון: {syncTimeLabel}
        </div>
      )}

      {/* כפתורי פעולה חכמים לפי סביבת הריצה (APK באנדרואיד vs דפדפן) */}
      {nativeApp && !isCoachPreview ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {canAutoSyncDate && (
              <button
                type="button"
                disabled={syncing || isBlockedDay}
                onClick={handleConnectOrSync}
                className={needsPermissions ? 'btn-volt' : 'btn-surface'}
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: '8px 10px',
                  fontSize: 11,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: isBlockedDay ? 'not-allowed' : syncing ? 'wait' : 'pointer',
                  opacity: isBlockedDay ? 0.45 : 1,
                }}
              >
                <RefreshCw
                  size={13}
                  className={syncing ? 'spot-spinner' : undefined}
                />
                <span>
                  {needsPermissions
                    ? 'חבר מד צעדים (טלפון / שעון)'
                    : syncing
                    ? 'מסנכרן צעדים...'
                    : 'סנכרן צעדים עכשיו'}
                </span>
              </button>
            )}

            <button
              type="button"
              disabled={isBlockedDay}
              onClick={() => !isBlockedDay && setManualOpen((v) => !v)}
              className="btn-surface"
              style={{
                padding: '8px 10px',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                opacity: isBlockedDay ? 0.45 : 1,
              }}
            >
              <Edit3 size={12} />
              <span>ערוך ידנית</span>
            </button>
          </div>

          {nativeStatus &&
            (nativeStatus.healthConnectStatus === 'not-installed' ||
              nativeStatus.healthConnectStatus === 'update-required') && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 9,
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  fontSize: 10.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Watch size={13} color="#38bdf8" />
                  משתמש בשעון חכם? התקן/עדכן Health Connect לחיבור מלא
                </span>
                <button
                  type="button"
                  onClick={() => void installOrOpenHealthConnect()}
                  style={{
                    background: '#38bdf8',
                    color: '#08090c',
                    border: 'none',
                    borderRadius: 7,
                    padding: '4px 8px',
                    fontSize: 10.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  פתח
                </button>
              </div>
            )}

          {restrictedHint && !nativeStatus?.healthConnectStepsGranted && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: 9,
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontSize: 10.5,
                color: '#fcd34d',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <AlertTriangle size={13} />
                <span>
                  Android חסם אישור הרשאת שעון בהתקנת APK?
                </span>
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                הטלפון ממשיך לספור דרך חיישן המערכת; לשעון חכם פתח הגדרות &larr; 3
                נקודות (⋮) למעלה &larr; &quot;אפשר הגדרות מוגבלות&quot;.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void openAndroidAppSettings()}
                  style={{
                    background: '#f59e0b',
                    color: '#08090c',
                    border: 'none',
                    borderRadius: 7,
                    padding: '5px 9px',
                    fontSize: 10.5,
                    fontWeight: 800,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <Settings size={12} /> פתח הגדרות אפליקציה
                </button>
                <button
                  type="button"
                  onClick={() => void installOrOpenHealthConnect()}
                  className="btn-surface"
                  style={{
                    padding: '5px 9px',
                    fontSize: 10.5,
                    cursor: 'pointer',
                  }}
                >
                  פתח Health Connect
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              type="button"
              disabled={isBlockedDay}
              onClick={() => !isBlockedDay && setManualOpen((v) => !v)}
              className="btn-surface"
              style={{
                padding: '6px 10px',
                fontSize: 11,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: isBlockedDay ? 'not-allowed' : 'pointer',
                opacity: isBlockedDay ? 0.45 : 1,
              }}
            >
              <Edit3 size={12} />
              <span>{steps > 0 ? 'עדכן צעדים ידנית' : 'הזן צעדים ידנית'}</span>
            </button>
          </div>
        </div>
      )}

      {manualOpen && !isBlockedDay && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={150000}
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="מספר צעדים..."
            style={{
              flex: 1,
              background: 'var(--bg-surface-1)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '7px 10px',
              color: 'var(--text-primary)',
              fontSize: 12,
            }}
          />
          <button
            type="button"
            disabled={syncing}
            onClick={handleManualSave}
            className="btn-volt"
            style={{
              padding: '7px 12px',
              fontSize: 11.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              cursor: 'pointer',
            }}
          >
            <Check size={13} />
            <span>שמור</span>
          </button>
        </div>
      )}
    </div>
  );
}
