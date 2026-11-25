'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Smartphone, ExternalLink } from 'lucide-react';
import { isNativeAndroidApp } from '@/lib/capacitorSteps';
import hostedApkMeta from '@/lib/hostedApkMeta.json';

interface AndroidApkDownloadCardProps {
  variant?: 'compact' | 'card';
}

export function AndroidApkDownloadCard({
  variant = 'compact',
}: AndroidApkDownloadCardProps) {
  const [visible, setVisible] = useState(false);
  const [apkUrl, setApkUrl] = useState<string>(
    hostedApkMeta?.path || '/downloads/spot-fitness-release.apk'
  );
  const [versionName, setVersionName] = useState<string>(
    hostedApkMeta?.versionName || '1.0.9'
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isNativeAndroidApp()) {
      setVisible(false);
      return;
    }
    // iPhones cannot install APK packages; show the prompt to Android and desktop browsers.
    const ua = window.navigator.userAgent || '';
    const isIos =
      /iPad|iPhone|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
    if (isIos) {
      setVisible(false);
      return;
    }
    setVisible(true);

    let cancelled = false;
    fetch(`/api/app-version?t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { apkDownloadUrl?: string; latestVersionName?: string } | null) => {
        if (cancelled || !data) return;
        if (data.apkDownloadUrl) setApkUrl(data.apkDownloadUrl);
        if (data.latestVersionName) setVersionName(data.latestVersionName);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  if (variant === 'compact') {
    return (
      <div
        className="pro-card"
        style={{
          marginTop: 18,
          padding: '12px 14px',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
              flexShrink: 0,
            }}
          >
            <Smartphone size={17} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
              אפליקציית SPOT לאנדרואיד
            </span>
            <Link
              href="/download"
              style={{
                fontSize: 12,
                color: 'var(--text-2)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>
                גרסה <bdi dir="ltr">v{versionName}</bdi> · הוראות התקנה
              </span>
              <ExternalLink size={11} />
            </Link>
          </div>
        </div>

        <a
          href={apkUrl}
          download="spot-fitness-release.apk"
          style={{
            height: 38,
            padding: '0 14px',
            borderRadius: 999,
            background: 'var(--contrast-btn-bg)',
            color: 'var(--contrast-btn-text)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          <Download size={14} />
          <span>הורד APK</span>
        </a>
      </div>
    );
  }

  return (
    <section
      className="pro-card"
      aria-label="אפליקציית SPOT לאנדרואיד"
      style={{
        padding: 16,
        borderRadius: 28,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Smartphone size={18} />
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            אפליקציית SPOT לאנדרואיד
          </span>
        </div>
        <span
          className="num-mono"
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-2)',
          }}
        >
          <bdi dir="ltr">v{versionName}</bdi>
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>
        התקן את אפליקציית האנדרואיד הרשמית לסנכרון צעדים אוטומטי, התראות מהמאמן וגישה מהירה מהמכשיר.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={apkUrl}
          download="spot-fitness-release.apk"
          className="btn-volt"
          style={{
            height: 44,
            padding: '0 18px',
            borderRadius: 999,
            textDecoration: 'none',
            fontSize: 13.5,
            fontWeight: 800,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Download size={15} />
          <span>הורד APK לאנדרואיד</span>
        </a>
        <Link
          href="/download"
          className="btn-surface"
          style={{
            height: 44,
            padding: '0 14px',
            borderRadius: 999,
            textDecoration: 'none',
            color: 'var(--text)',
            fontSize: 13,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ExternalLink size={14} />
          <span>מדריך התקנה</span>
        </Link>
      </div>
    </section>
  );
}
