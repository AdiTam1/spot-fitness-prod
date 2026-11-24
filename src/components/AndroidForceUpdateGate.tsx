'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  AppUpdateInfo,
  blockAndroidBackButtonWhileLocked,
  downloadAndInstallAndroidApk,
  subscribeAndroidAppResume,
} from '@/lib/capacitorSteps';

interface AndroidForceUpdateGateProps {
  info: AppUpdateInfo;
  onRecheckVersion: () => Promise<AppUpdateInfo | null>;
}

export function AndroidForceUpdateGate({
  info,
  onRecheckVersion,
}: AndroidForceUpdateGateProps) {
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState<number | null>(null);
  const [needsUnknownPerm, setNeedsUnknownPerm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const waitingPermissionRef = useRef(false);
  const installTriggeredRef = useRef(false);

  const handleDownloadAndInstall = useCallback(async () => {
    if (downloading) return;
    setErrorMsg(null);
    setNeedsUnknownPerm(false);
    setDownloadPercent(0);
    setDownloading(true);

    try {
      const res = await downloadAndInstallAndroidApk(
        info.apkDownloadUrl,
        (ev) => {
          setDownloadPercent(ev.percent >= 0 ? ev.percent : null);
        }
      );

      if (res.needsInstallPermission) {
        waitingPermissionRef.current = true;
        setNeedsUnknownPerm(true);
        setDownloadPercent(null);
        return;
      }

      if (!res.started) {
        setErrorMsg(
          res.error || 'לא הצלחנו להפעיל התקנה ישירה — אפשר להוריד דרך הדפדפן למטה.'
        );
        return;
      }

      installTriggeredRef.current = true;
    } finally {
      setDownloading(false);
    }
  }, [downloading, info.apkDownloadUrl]);

  // מניעת כפתור Back של אנדרואיד בזמן שער חסימה
  useEffect(() => {
    return blockAndroidBackButtonWhileLocked(true);
  }, []);

  // כשחוזרים מהגדרות הרשאת "מקורות לא מוכרים" או מחלון התקנת APK — ממשיך/בודק אוטומטית
  useEffect(() => {
    return subscribeAndroidAppResume(() => {
      if (waitingPermissionRef.current) {
        waitingPermissionRef.current = false;
        setNeedsUnknownPerm(false);
        void handleDownloadAndInstall();
        return;
      }
      if (installTriggeredRef.current) {
        void onRecheckVersion();
      }
    });
  }, [handleDownloadAndInstall, onRecheckVersion]);

  const handleManualRecheck = async () => {
    setChecking(true);
    try {
      await onRecheckVersion();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'center',
        padding: 'calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          margin: '0 auto',
          minHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          textAlign: 'start',
          gap: 18,
          paddingTop: 56,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            background: 'var(--card)',
            border: '1px solid var(--line-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent)',
          }}
        >
          <Download size={34} strokeWidth={2.2} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
            נדרש עדכון חובה לאפליקציה
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              color: 'var(--text-2)',
              lineHeight: 1.5,
            }}
          >
            הגרסה המותקנת במכשירך אינה נתמכת עוד. כדי להמשיך להשתמש ב-SPOT
            יש להתקין את הגרסה החדשה מעל הגרסה הקיימת.
          </p>
        </div>

        <div
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <div style={{ padding: 14, borderRadius: 18, background: 'var(--card)', border: '1px solid var(--line)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              גרסה מותקנת כעת
            </div>
            <div
              className="num-mono"
              style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginTop: 2 }}
              dir="ltr"
            >
              v{info.localVersionName} (#{info.localVersionCode})
            </div>
          </div>
          <div style={{ padding: 14, borderRadius: 18, background: 'var(--card)', border: '1px solid var(--accent)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              גרסה חדשה להתקנה
            </div>
            <div
              className="num-mono"
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--text)',
                marginTop: 2,
              }}
              dir="ltr"
            >
              v{info.latestVersionName} (#{info.latestVersionCode})
            </div>
          </div>
        </div>

        {info.releaseNotes && (
          <div
            style={{
              width: '100%',
              background: 'var(--card)',
              borderRadius: 18,
              padding: '14px 16px',
              fontSize: 13,
              color: 'var(--text-2)',
              textAlign: 'start',
              lineHeight: 1.5,
              border: '1px solid var(--line)',
            }}
          >
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>
              מה חדש בגרסה:
            </strong>
            {info.releaseNotes}
          </div>
        )}

        {downloading && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--accent-volt)',
              }}
            >
              <span>מוריד קובץ התקנה...</span>
              <span className="num-mono">
                {downloadPercent !== null ? `${downloadPercent}%` : '...'}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 8,
                borderRadius: 999,
                background: 'var(--bg-surface-3)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${downloadPercent !== null ? Math.max(8, downloadPercent) : 45}%`,
                  height: '100%',
                  background: 'var(--accent-volt)',
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        )}

        {needsUnknownPerm && (
          <div
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.14)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: 'var(--warn-text)',
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.5,
            }}
          >
            אשר בהגדרות אנדרואיד שפתחנו עבורך את המתג &quot;הרשה ממקור זה&quot;
            וחזור אחורה — ההורדה וההתקנה ימשיכו אוטומטית!
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.14)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: 'var(--danger-text)',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textAlign: 'right',
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          disabled={downloading}
          onClick={() => void handleDownloadAndInstall()}
          className="btn-volt"
          style={{
            width: '100%',
            height: 56,
            fontSize: 16,
            fontWeight: 700,
            cursor: downloading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: 'none',
          }}
        >
          {downloading ? (
            <Loader2 size={18} className="spot-spinner" />
          ) : (
            <Download size={18} />
          )}
          <span>
            {downloading
              ? 'מוריד ופותח מתקין...'
              : 'הורד והתקן גרסה חדשה עכשיו'}
          </span>
        </button>

        <div
          style={{
            fontSize: 11.5,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          בסיום ההתקנה במסך המערכת לחץ על <strong>&quot;פתח&quot;</strong> או על
          ההתראה שתקפוץ כדי להיכנס מיד לגרסה המעודכנת.
        </div>

        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            paddingTop: 4,
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            disabled={checking || downloading}
            onClick={() => void handleManualRecheck()}
            className="glass"
            style={{
              flex: 1,
              height: 50,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
          >
            {checking ? (
              <Loader2 size={13} className="spot-spinner" />
            ) : (
              <RefreshCw size={13} />
            )}
            <span>בדוק שוב</span>
          </button>

          <a
            href={info.apkDownloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="glass"
            style={{
              flex: 1,
              height: 50,
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              color: 'var(--text)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <ExternalLink size={13} />
            <span>הורדה בדפדפן</span>
          </a>
        </div>
      </div>
    </div>
  );
}
