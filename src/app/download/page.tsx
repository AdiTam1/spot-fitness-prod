import React from 'react';
import Link from 'next/link';
import { Download, Smartphone, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';
import { resolveAppVersionInfo } from '@/lib/appVersionServer';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '6.5 MB';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default async function DownloadAndroidPage() {
  const info = await resolveAppVersionInfo(undefined, {
    includeGitHubRelease: false,
  });

  const downloadUrl =
    info.apkDownloadUrl || '/downloads/spot-fitness-release.apk';
  const sizeLabel = formatFileSize(info.apkSizeBytes);

  return (
    <main
      dir="rtl"
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: 'calc(24px + var(--sa-top)) 20px calc(36px + var(--sa-bottom))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 460,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/app-logo.png"
              alt="SPOT"
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                objectFit: 'cover',
                border: '1px solid var(--line-2)',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.03em' }}>
                SPOT
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                אפליקציית אנדרואיד רשמית
              </span>
            </div>
          </div>

          <Link
            href="/"
            className="btn-surface"
            style={{
              height: 38,
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
            <ArrowRight size={14} />
            <span>כניסה לאתר</span>
          </Link>
        </div>

        <section
          className="pro-card"
          style={{
            padding: 22,
            borderRadius: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              aria-hidden
              style={{
                width: 56,
                height: 56,
                borderRadius: 18,
                background: 'var(--surface-2)',
                border: '1px solid var(--line-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <Smartphone size={26} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, lineHeight: 1.2 }}>
                הורדת SPOT לאנדרואיד
              </h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: 13,
                  color: 'var(--text-2)',
                }}
              >
                <span
                  className="num-mono"
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    color: 'var(--text)',
                    fontWeight: 700,
                  }}
                >
                  <bdi dir="ltr">v{info.latestVersionName}</bdi>
                </span>
                <span className="num-mono">
                  <bdi dir="ltr">{sizeLabel}</bdi>
                </span>
                <span>· קובץ APK להתקנה ישירה</span>
              </div>
            </div>
          </div>

          {info.releaseNotes && (
            <div
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                padding: '10px 14px',
                fontSize: 13,
                color: 'var(--text-2)',
                lineHeight: 1.5,
              }}
            >
              {info.releaseNotes}
            </div>
          )}

          <a
            href={downloadUrl}
            download="spot-fitness-release.apk"
            className="btn-volt"
            style={{
              height: 56,
              borderRadius: 999,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              fontSize: 16,
              fontWeight: 800,
            }}
          >
            <Download size={19} strokeWidth={2.3} />
            <span>הורד אפליקציה (APK)</span>
          </a>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--text-2)',
              justifyContent: 'center',
            }}
          >
            <ShieldCheck size={14} color="var(--ok-text)" />
            <span>חבילת התקנה רשמית · {info.packageId}</span>
          </div>
        </section>

        <section
          className="pro-card"
          aria-label="שלבי התקנה באנדרואיד"
          style={{
            padding: 18,
            borderRadius: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            איך מתקינים ב־30 שניות?
          </h2>
          <ol
            style={{
              margin: 0,
              paddingInlineStart: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 13.5,
              color: 'var(--text-2)',
              lineHeight: 1.5,
            }}
          >
            <li>
              לחץ על <strong style={{ color: 'var(--text)' }}>הורד אפליקציה (APK)</strong> והמתן לסיום ההורדה.
            </li>
            <li>
              פתח את הקובץ <bdi dir="ltr">spot-fitness-release.apk</bdi> מההתראות או מתיקיית ההורדות. אם המכשיר מבקש אישור, הפעל{' '}
              <strong style={{ color: 'var(--text)' }}>התקנת אפליקציות לא ידועות</strong> עבור הדפדפן.
            </li>
            <li>
              לחץ <strong style={{ color: 'var(--text)' }}>התקן</strong>, פתח את{' '}
              <strong style={{ color: 'var(--text)' }}>SPOT Fitness</strong> והתחבר עם החשבון שלך.
            </li>
          </ol>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 14,
              background: 'var(--surface-2)',
              fontSize: 12.5,
              color: 'var(--text-2)',
            }}
          >
            <CheckCircle2 size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span>
              משתמשי אייפון? פתחו את{' '}
              <Link href="/" style={{ color: 'var(--text)', fontWeight: 700 }}>
                האתר ב־Safari
              </Link>{' '}
              ולחצו שיתוף ← הוסף למסך הבית.
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
