'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Smartphone,
  Footprints,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';

interface AppVersionPayload {
  latestVersionCode: number;
  latestVersionName: string;
  apkDownloadUrl: string;
  releasesPageUrl: string;
  releaseNotes: string;
}

export default function AndroidDownloadPage() {
  const [info, setInfo] = useState<AppVersionPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/app-version', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: AppVersionPayload) => {
        if (active) setInfo(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const apkUrl =
    info?.apkDownloadUrl ||
    'https://github.com/AdiTam1/spot-fitness-prod/releases/latest/download/spot-fitness-release.apk';

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        padding:
          'calc(24px + env(safe-area-inset-top, 0px)) 16px calc(36px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 18,
          }}
        >
          <ArrowRight size={15} />
          <span>חזרה לאפליקציית SPOT</span>
        </Link>

        <div className="pro-card-elevated" style={{ padding: 24, marginBottom: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: 'var(--accent-volt)',
                color: '#08090c',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                fontSize: 22,
                flexShrink: 0,
              }}
            >
              S
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900 }}>
                SPOT Fitness לאנדרואיד (APK)
              </h1>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Loader2 size={12} className="spot-spinner" /> בודק גרסה אחרונה...
                  </span>
                ) : (
                  <span className="num-mono">
                    גרסה v{info?.latestVersionName || '1.0.0'} (Build #
                    {info?.latestVersionCode || 1})
                  </span>
                )}
              </div>
            </div>
          </div>

          <p
            style={{
              fontSize: 13.5,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              marginTop: 0,
              marginBottom: 16,
            }}
          >
            {info?.releaseNotes ||
              'גרסת האנדרואיד מחברת את היומן התזונתי של SPOT ישירות למד הצעדים של הטלפון והשעון החכם, כולל סנכרון אוטומטי ברקע ושמירת התחברות.'}
          </p>

          <a
            href={apkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-volt"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '13px 16px',
              textDecoration: 'none',
              fontSize: 15,
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            <Download size={18} />
            <span>הורד קובץ התקנה (APK)</span>
          </a>

          <div style={{ textAlign: 'center' }}>
            <a
              href={
                info?.releasesPageUrl ||
                'https://github.com/AdiTam1/spot-fitness-prod/releases/latest'
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 12,
                color: 'var(--text-secondary)',
                textDecoration: 'underline',
              }}
            >
              <span>עמוד הגרסאות המלא ב-GitHub</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <div className="pro-card" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800 }}>
            מדריך התקנה וחיבור מד צעדים (3 שלבים מהירים)
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div
              style={{
                display: 'flex',
                gap: 10,
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 12,
              }}
            >
              <Smartphone size={18} color="var(--accent-volt)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b>1. אישור התקנת קובץ APK:</b> לאחר ההורדה לחץ על הקובץ. אם הדפדפן
                שואל, אשר <b>&quot;התקנה ממקור זה&quot;</b> (נדרש חד־פעמית כי האפליקציה טרם
                הועלתה ל-Google Play).
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 12,
              }}
            >
              <Footprints size={18} color="#38bdf8" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b>2. חיבור מד הצעדים:</b> היכנס עם המשתמש שלך באפליקציה ולחץ על{' '}
                <b>&quot;חבר מד צעדים&quot;</b> בכרטיס הפעילות. המערכת מושכת אוטומטית מהשעון
                החכם ב־<b>Health Connect</b> או מחיישן המערכת של Google.
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                background: 'var(--bg-surface-2)',
                padding: 12,
                borderRadius: 12,
              }}
            >
              <ShieldCheck size={18} color="#22c55e" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <b>3. אם Android 13–16 חוסם הרשאת Health Connect (&quot;הגדרה מוגבלת&quot;):</b>{' '}
                לחץ על כפתור <b>&quot;פתח הגדרות אפליקציה&quot;</b> מתוך האפליקציה, לחץ על <b>3 הנקודות (⋮)</b> למעלה &larr;{' '}
                <b>אפשר הגדרות מוגבלות (Allow restricted settings)</b>. גם אם לא תאשר שעון,
                מד הצעדים המובנה של הטלפון יעבוד מיד!
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#4ade80',
                fontWeight: 700,
                paddingTop: 4,
              }}
            >
              <CheckCircle2 size={15} />
              <span>עובד עם Samsung, Xiaomi, Pixel, Galaxy Watch, Garmin, Fitbit ועוד.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
