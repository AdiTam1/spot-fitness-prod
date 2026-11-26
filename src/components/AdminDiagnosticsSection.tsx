'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Search,
  ShieldAlert,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import type { UserDiagnosticsPayload } from '@/lib/telemetry/diagnosticsSummary';

interface AdminDiagnosticsSectionProps {
  data: UserDiagnosticsPayload | null;
  resolveActorName: (id?: string | null) => string;
  formatTimeHe: (iso: string) => string;
  onSelectActor: (actorId: string) => void;
}

export function AdminDiagnosticsSection({
  data,
  resolveActorName,
  formatTimeHe,
  onSelectActor,
}: AdminDiagnosticsSectionProps) {
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'disconnects' | 'startup' | 'search'>('all');

  if (!data) {
    return (
      <div className="pro-card" style={{ padding: 24, borderRadius: 20, textAlign: 'center', color: 'var(--text-2)' }}>
        טוען נתוני אבחון...
      </div>
    );
  }

  const th = data.traineeHealth;
  const ver = th?.clientVersionInfo;

  const filteredTimeline = data.timeline.filter((item) => {
    if (sourceFilter === 'all') return true;
    if (sourceFilter === 'disconnects') {
      return (
        item.severity === 'error' &&
        (item.title.includes('ניתוק') ||
          item.title.includes('נזרק') ||
          item.title.includes('401') ||
          item.title.includes('403') ||
          item.title.includes('session') ||
          item.title.includes('heartbeat'))
      );
    }
    if (sourceFilter === 'startup') {
      return (
        item.title.includes('עליית') ||
        item.title.includes('/api/data') ||
        item.title.includes('סנכרון נתונים') ||
        item.title.includes('/api/auth/session')
      );
    }
    return item.title.includes('חיפוש') || item.title.includes('/api/food/search');
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ממצאים אוטומטיים */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.autoFindings.map((finding, idx) => {
          const isHigh = finding.severity === 'high';
          const isMed = finding.severity === 'medium';
          return (
            <div
              key={`${finding.title}-${idx}`}
              className="pro-card"
              style={{
                padding: '12px 14px',
                borderRadius: 18,
                border: isHigh
                  ? '1px solid rgba(239, 68, 68, 0.45)'
                  : isMed
                  ? '1px solid rgba(245, 158, 11, 0.45)'
                  : '1px solid var(--line)',
                background: isHigh
                  ? 'rgba(239, 68, 68, 0.08)'
                  : isMed
                  ? 'rgba(245, 158, 11, 0.08)'
                  : 'var(--card)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
              }}
            >
              {isHigh || isMed ? (
                <AlertTriangle
                  size={17}
                  color={isHigh ? 'var(--danger-text)' : 'var(--warn-text)'}
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
              ) : (
                <CheckCircle2
                  size={17}
                  color="var(--accent)"
                  style={{ flexShrink: 0, marginTop: 2 }}
                />
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 800,
                    color: isHigh
                      ? 'var(--danger-text)'
                      : isMed
                      ? 'var(--warn-text)'
                      : 'var(--text)',
                  }}
                >
                  {finding.title}
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
                  {finding.description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* כרטיס מצב פרופיל וגרסת מכשיר של המשתמש הנבחר */}
      {th && (
        <div
          className="pro-card"
          style={{
            padding: 14,
            borderRadius: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Smartphone size={16} color="var(--accent)" />
              <strong style={{ fontSize: 14.5 }}>
                פרופיל נבדק: {th.name} ({th.status})
              </strong>
            </div>
            <span className="num-mono" dir="ltr" style={{ fontSize: 12, color: 'var(--text-2)' }}>
              sessionVersion={th.sessionVersion} · נראה: {th.lastSeenAt ? formatTimeHe(th.lastSeenAt) : 'לא ידוע'}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 8,
            }}
          >
            <div style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>משקל JSON ב-/api/data</div>
              <div
                className="num-mono"
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: th.profileSizeKB >= 900 ? 'var(--danger-text)' : th.profileSizeKB >= 350 ? 'var(--warn-text)' : 'var(--text)',
                }}
              >
                {th.profileSizeKB} KB
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {th.logsDaysCount} ימים · {th.totalMealsCount} ארוחות
              </div>
            </div>

            <div style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>תמונות והיסטוריה בפרופיל</div>
              <div className="num-mono" style={{ fontSize: 18, fontWeight: 800 }}>
                {th.approxPhotosCount} תמונות
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                {th.totalHistoryEvents} רשומות היסטוריה
              </div>
            </div>

            <div style={{ padding: '8px 10px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>סביבה וגרסת מכשיר</div>
              <div className="num-mono" dir="ltr" style={{ fontSize: 14, fontWeight: 800 }}>
                {ver?.platform || 'לא דווח עדיין'}
                {ver?.appVersionCode ? ` (v${ver.appVersionCode})` : ''}
              </div>
              <div className="num-mono" dir="ltr" style={{ fontSize: 11, color: 'var(--text-2)' }}>
                webBuild: {ver?.webBuildId || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3 מדדי ליבה לבעיות אנדרואיד */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
          gap: 10,
        }}
      >
        <div className="pro-card" style={{ padding: 14, borderRadius: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
            <WifiOff size={14} color="var(--danger-text)" />
            <span>ניתוקים ואובדן סשן</span>
          </div>
          <div
            className="num-mono"
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: data.disconnects.total > 0 ? 'var(--danger-text)' : 'var(--text)',
            }}
          >
            {data.disconnects.total} אירועים
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>
            אבדה עוגייה בעלייה: {data.disconnects.startupCookieLost} · נזרק באמצע: {data.disconnects.midUseKicked}
            <br />
            דחיות שרת: {data.disconnects.serverRejected} · שגיאות DB: {data.disconnects.dbUnavailable}
          </div>
        </div>

        <div className="pro-card" style={{ padding: 14, borderRadius: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
            <Clock size={14} color="var(--accent)" />
            <span>זמני עלייה וסנכרון (/api/data)</span>
          </div>
          <div className="num-mono" style={{ fontSize: 22, fontWeight: 800 }}>
            {data.startup.avgTotalMs || data.startup.avgDataMs}ms
            {data.startup.maxTotalMs > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginInlineStart: 6 }}>
                (שיא {data.startup.maxTotalMs}ms)
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>
            session ממוצע: {data.startup.avgSessionMs}ms · data ממוצע: {data.startup.avgDataMs}ms
            <br />
            נפח /api/data מרבי: {data.startup.maxDataKB} KB
          </div>
        </div>

        <div className="pro-card" style={{ padding: 14, borderRadius: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
            <Search size={14} color="#38bdf8" />
            <span>זמני חיפוש מוצרים</span>
          </div>
          <div
            className="num-mono"
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: data.search.errorOrTimeoutCount > 0 ? 'var(--danger-text)' : 'var(--text)',
            }}
          >
            {data.search.avgClientMs || data.search.avgSqlMs}ms
            {data.search.maxClientMs > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginInlineStart: 6 }}>
                (שיא {data.search.maxClientMs}ms)
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 4 }}>
            SQL: {data.search.avgSqlMs}ms · Embed: {data.search.avgEmbedMs}ms · Live: {data.search.avgLiveMs}ms
            <br />
            חיפושים איטיים: {data.search.slowCount} · כשלים/טיימאוט: {data.search.errorOrTimeoutCount}
          </div>
        </div>
      </div>

      {/* ציר זמן מאוחד */}
      <div className="pro-card" style={{ padding: 14, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800, fontSize: 14 }}>
            <Activity size={15} color="var(--accent)" />
            <span>ציר זמן אבחון מאוחד (לקוח + שרת + אימות)</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(
              [
                { id: 'all', label: `הכל (${data.timeline.length})` },
                { id: 'disconnects', label: 'ניתוקים' },
                { id: 'startup', label: 'עלייה ונתונים' },
                { id: 'search', label: 'חיפושים' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSourceFilter(f.id)}
                className="glass"
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderColor: sourceFilter === f.id ? 'var(--accent)' : undefined,
                  color: sourceFilter === f.id ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filteredTimeline.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
            אין אירועים תואמים לסינון זה עדיין.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredTimeline.map((item) => {
              const isOpen = expandedTimelineId === item.id;
              const borderCol =
                item.severity === 'error'
                  ? 'rgba(239, 68, 68, 0.42)'
                  : item.severity === 'warn'
                  ? 'rgba(245, 158, 11, 0.42)'
                  : 'var(--line)';
              return (
                <div
                  key={item.id}
                  style={{
                    background: 'var(--surface-2)',
                    border: `1px solid ${borderCol}`,
                    borderRadius: 14,
                    padding: '9px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedTimelineId(isOpen ? null : item.id)}
                    style={{
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      textAlign: 'start',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background:
                              item.source === 'client'
                                ? 'rgba(56, 189, 248, 0.14)'
                                : item.source === 'auth_audit'
                                ? 'rgba(245, 158, 11, 0.14)'
                                : 'rgba(34, 197, 94, 0.12)',
                            color: 'var(--text)',
                          }}
                        >
                          {item.source === 'client'
                            ? 'מכשיר'
                            : item.source === 'auth_audit'
                            ? 'אימות'
                            : 'שרת API'}
                        </span>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color:
                              item.severity === 'error'
                                ? 'var(--danger-text)'
                                : item.severity === 'warn'
                                ? 'var(--warn-text)'
                                : 'var(--text)',
                          }}
                        >
                          {item.title}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-2)' }}>
                        {item.actorId && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              if (item.actorId) onSelectActor(item.actorId);
                            }}
                            style={{ fontWeight: 700, textDecoration: 'underline', cursor: 'pointer' }}
                          >
                            {resolveActorName(item.actorId)}
                          </span>
                        )}
                        {item.platform && (
                          <span dir="ltr">
                            {item.platform}
                            {item.appVersionCode ? ` v${item.appVersionCode}` : ''}
                          </span>
                        )}
                        <span className="num-mono" dir="ltr">
                          {formatTimeHe(item.createdAt)}
                        </span>
                      </div>
                    </div>
                    {item.subtitle && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {item.subtitle}
                      </div>
                    )}
                  </button>
                  {isOpen && (
                    <pre
                      dir="ltr"
                      style={{
                        margin: '4px 0 0',
                        padding: 8,
                        borderRadius: 10,
                        background: 'var(--card)',
                        fontSize: 11.5,
                        overflowX: 'auto',
                        color: 'var(--text-2)',
                      }}
                    >
                      {JSON.stringify(
                        {
                          requestId: item.requestId,
                          durationMs: item.durationMs,
                          details: item.details,
                        },
                        null,
                        2
                      )}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
