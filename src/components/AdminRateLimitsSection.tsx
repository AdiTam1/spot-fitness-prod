'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Database,
  FilterX,
  Gauge,
  ShieldAlert,
  Users,
} from 'lucide-react';
import type {
  RateLimitAnalyticsPayload,
  RateLimitWindowKey,
} from '@/lib/rateLimitAnalytics';

interface AdminRateLimitsSectionProps {
  data: RateLimitAnalyticsPayload | null;
  countersPending: boolean;
  windowLabel: string;
  actorFilter: string;
  onSelectActor: (actorId: string) => void;
  resolveActorName: (id?: string | null) => string;
  formatTimeHe: (iso: string) => string;
}

const ROLE_LABELS_HE: Record<string, string> = {
  trainee: 'מתאמן',
  coach: 'מאמן',
  admin: 'מנהל',
  unknown: 'לא ידוע',
};

const WINDOW_LABELS_HE: Record<RateLimitWindowKey, string> = {
  minute: 'דקה',
  hour: 'שעה',
  day: 'יום',
  role: 'הרשאת תפקיד',
  unknown: 'לא מסווג',
};

function getUsageBarColor(pct: number): string {
  if (pct >= 90) return '#ef4444';
  if (pct >= 70) return '#f59e0b';
  return 'var(--accent)';
}

function UsageProgressCell({
  used,
  limit,
  pct,
}: {
  used: number;
  limit: number;
  pct: number;
}) {
  if (limit <= 0) {
    return <span style={{ color: 'var(--text-2)', fontSize: 12 }}>—</span>;
  }
  const color = getUsageBarColor(pct);
  const clampedWidth = Math.min(100, Math.max(pct > 0 ? 6 : 0, pct));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 115 }}>
      <div
        className="num-mono"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        <span>
          {used} / {limit}
        </span>
        <span style={{ color }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: 'var(--surface-3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clampedWidth}%`,
            height: '100%',
            background: color,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  );
}

export function AdminRateLimitsSection({
  data,
  countersPending,
  windowLabel,
  actorFilter,
  onSelectActor,
  resolveActorName,
  formatTimeHe,
}: AdminRateLimitsSectionProps) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const byUser = data?.byUser || [];
  const liveUsage = data?.liveUsage || [];
  const recentEvents = data?.recentEvents || [];
  const byWindow = data?.byWindow || {
    minute: 0,
    hour: 0,
    day: 0,
    role: 0,
    unknown: 0,
  };
  const byScope = data?.byScope || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {countersPending && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 16,
            background: 'var(--surface-2)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            color: 'var(--warn-text)',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <Database size={14} />
          <span>
            כדי להציג מוני ניצולת חיה של שעה ויום בזמן אמת מתוך Supabase, הרץ ב-SQL Editor את{' '}
            <bdi dir="ltr">supabase/migrations/20261126_role_rate_limits.sql</bdi>. היסטוריית חסימות 429 כבר מוצגת מלוגי השרת.
          </span>
        </div>
      )}

      {/* סיכום לפי חלון זמן ונתיב */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        <section
          className="pro-card"
          style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <ShieldAlert size={16} color="#f59e0b" />
            <span>חסימות לפי חלון זמן ({windowLabel})</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(['minute', 'hour', 'day', 'role'] as RateLimitWindowKey[]).map((win) => (
              <div
                key={win}
                style={{
                  background: 'var(--surface-2)',
                  borderRadius: 14,
                  padding: '8px 10px',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
                  חלון {WINDOW_LABELS_HE[win]}
                </div>
                <div className="num-mono" style={{ fontSize: 20, fontWeight: 800 }}>
                  {byWindow[win] ?? 0}
                </div>
              </div>
            ))}
          </div>
          {byWindow.unknown > 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              חסימות קודמות / לא מסווגות: <strong className="num-mono">{byWindow.unknown}</strong>
            </div>
          )}
        </section>

        <section
          className="pro-card"
          style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Gauge size={16} color="var(--accent)" />
            <span>חריגות לפי פיצ׳ר / נתיב</span>
          </div>
          {byScope.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-2)', padding: '12px 0' }}>
              לא נרשמו חסימות או חריגות בטווח הזמן הנבחר.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {byScope.map((sc) => (
                <div
                  key={sc.scope}
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: '6px 10px',
                    fontSize: 12.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>{sc.labelHe}</span>
                  {sc.blockedCount > 0 && (
                    <span
                      className="num-mono"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 800,
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: 'rgba(239, 68, 68, 0.16)',
                        color: 'var(--danger-text)',
                      }}
                    >
                      429 × {sc.blockedCount}
                    </span>
                  )}
                  {sc.degradedCount > 0 && (
                    <span
                      className="num-mono"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 800,
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: 'rgba(245, 158, 11, 0.16)',
                        color: 'var(--warn-text)',
                      }}
                    >
                      נסיגה × {sc.degradedCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* טבלת סיכום: מי עבר את המכסות, בכמה ומתי */}
      <section className="pro-card" style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Users size={16} color="#ef4444" />
              <span>משתמשים שעברו את ה-Rate Limit ({byUser.length})</span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
              כולל חסימות 429 (דקה / שעה / יום / תפקיד) ונסיגות חיפוש סמנטי. לחץ על שורה לסינון לפי המשתמש.
            </span>
          </div>
          {actorFilter && (
            <button
              type="button"
              onClick={() => onSelectActor('')}
              className="btn-surface"
              style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
            >
              <FilterX size={13} />
              <span>הצג את כל המשתמשים</span>
            </button>
          )}
        </div>

        {byUser.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
            אף משתמש לא עבר את מגבלות ה-Rate Limit בטווח הזמן הנבחר.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--text-2)', textAlign: 'start' }}>
                  <th style={{ padding: '8px 6px' }}>משתמש (תפקיד)</th>
                  <th style={{ padding: '8px 6px' }}>חסימות 429</th>
                  <th style={{ padding: '8px 6px' }}>חלונות שנחצו</th>
                  <th style={{ padding: '8px 6px' }}>פיצ׳רים</th>
                  <th style={{ padding: '8px 6px' }}>מתי (ראשונה / אחרונה)</th>
                  <th style={{ padding: '8px 6px' }}>מכסה / הודעה אחרונה</th>
                </tr>
              </thead>
              <tbody>
                {byUser.map((u) => {
                  const isSelected = actorFilter === u.actorId;
                  const activeWinEntries = (
                    Object.entries(u.byWindow) as [RateLimitWindowKey, number][]
                  ).filter(([, cnt]) => cnt > 0);
                  return (
                    <tr
                      key={u.actorId}
                      onClick={() => onSelectActor(isSelected ? '' : u.actorId)}
                      style={{
                        borderBottom: '1px solid var(--line)',
                        background: isSelected ? 'var(--surface-3)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '8px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {resolveActorName(u.actorId)}
                        <span style={{ fontSize: 11.5, color: 'var(--text-2)', marginInlineStart: 6 }}>
                          ({ROLE_LABELS_HE[u.actorRole] || u.actorRole})
                        </span>
                      </td>
                      <td className="num-mono" style={{ padding: '8px 6px', fontWeight: 800 }}>
                        <span style={{ color: u.blockedCount > 0 ? 'var(--danger-text)' : 'var(--text-2)' }}>
                          {u.blockedCount}
                        </span>
                        {u.degradedCount > 0 && (
                          <span style={{ fontSize: 11, color: 'var(--warn-text)', marginInlineStart: 6 }}>
                            (+{u.degradedCount} נסיגה)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {activeWinEntries.map(([w, cnt]) => (
                            <span
                              key={w}
                              className="num-mono"
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 999,
                                background: 'var(--surface-2)',
                                border: '1px solid var(--line)',
                              }}
                            >
                              {WINDOW_LABELS_HE[w]}: {cnt}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {u.byScope.slice(0, 3).map((sc) => (
                            <span
                              key={sc.scope}
                              style={{
                                fontSize: 11.5,
                                padding: '2px 7px',
                                borderRadius: 999,
                                background: 'var(--surface-2)',
                              }}
                            >
                              {sc.labelHe} ({sc.count})
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="num-mono" style={{ padding: '8px 6px', fontSize: 11.5, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                        <div style={{ color: 'var(--text)', fontWeight: 600 }} dir="ltr">
                          {formatTimeHe(u.lastHitAt)}
                        </div>
                        {u.firstHitAt !== u.lastHitAt && (
                          <div dir="ltr" style={{ opacity: 0.78 }}>
                            ראשונה: {formatTimeHe(u.firstHitAt)}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '8px 6px',
                          fontSize: 12,
                          color: 'var(--danger-text)',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={u.lastMessage}
                      >
                        {u.lastMessage}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* טבלת ניצולת חיה של מוני השעה והיום מ-api_rate_limit_counters */}
      <section className="pro-card" style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Clock size={16} color="var(--accent)" />
            <span>ניצולת מכסות חיה בזמן אמת (שעה נוכחית / היום בישראל)</span>
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            מציג משתמשים שביצעו קריאות מתוקצבות בשעה הנוכחית או מהחצות האחרון לפי שעון ישראל (מוני דקה נבדקים בזיכרון ומופיעים בטבלה למעלה אם נחסמו).
          </span>
        </div>

        {liveUsage.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
            {countersPending
              ? 'ממתין להרצת מיגרציית מוני השעה/יום ב-Supabase.'
              : 'אין כרגע צריכת מכסה פעילה בשעה הנוכחית או מאז חצות.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--text-2)', textAlign: 'start' }}>
                  <th style={{ padding: '8px 6px' }}>משתמש (תפקיד)</th>
                  <th style={{ padding: '8px 6px' }}>פיצ׳ר</th>
                  <th style={{ padding: '8px 6px' }}>שעה נוכחית</th>
                  <th style={{ padding: '8px 6px' }}>היום (חצות ישראל)</th>
                </tr>
              </thead>
              <tbody>
                {liveUsage.map((row) => (
                  <tr
                    key={`${row.actorId}-${row.scope}`}
                    onClick={() => onSelectActor(actorFilter === row.actorId ? '' : row.actorId)}
                    style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {resolveActorName(row.actorId)}
                      <span style={{ fontSize: 11.5, color: 'var(--text-2)', marginInlineStart: 6 }}>
                        ({ROLE_LABELS_HE[row.role] || row.role})
                      </span>
                    </td>
                    <td style={{ padding: '8px 6px' }}>{row.scopeLabelHe}</td>
                    <td style={{ padding: '8px 6px' }}>
                      <UsageProgressCell
                        used={row.hourUsed}
                        limit={row.hourLimit}
                        pct={row.hourPct}
                      />
                    </td>
                    <td style={{ padding: '8px 6px' }}>
                      <UsageProgressCell
                        used={row.dayUsed}
                        limit={row.dayLimit}
                        pct={row.dayPct}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* יומן כרונולוגי של חסימות וחריגות אחרונות */}
      <section className="pro-card" style={{ padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <AlertTriangle size={15} color="#f59e0b" />
          <span>יומן חסימות אחרונות ({recentEvents.length})</span>
        </div>
        {recentEvents.length === 0 ? (
          <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
            אין אירועי חסימה בטווח והסינון שנבחרו.
          </div>
        ) : (
          recentEvents.map((ev) => {
            const isExpanded = expandedEventId === ev.id;
            const isDegraded = ev.source === 'degraded';
            return (
              <button
                key={ev.id}
                type="button"
                onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                style={{
                  textAlign: 'start',
                  background: 'var(--surface-2)',
                  border: isDegraded
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: 14,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: 'var(--text)',
                  fontFamily: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      className="num-mono"
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11.5,
                        fontWeight: 800,
                        background: isDegraded
                          ? 'rgba(245, 158, 11, 0.16)'
                          : 'rgba(239, 68, 68, 0.16)',
                        color: isDegraded ? 'var(--warn-text)' : 'var(--danger-text)',
                      }}
                    >
                      {isDegraded ? 'נסיגת Embedding' : `429 · ${ev.windowLabelHe}`}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {resolveActorName(ev.actorId)}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                      {ev.scopeLabelHe}
                    </span>
                  </div>
                  <span className="num-mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }} dir="ltr">
                    {formatTimeHe(ev.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: isDegraded ? 'var(--warn-text)' : 'var(--danger-text)' }}>
                  {ev.message}
                </div>
                {isExpanded && (
                  <pre
                    dir="ltr"
                    style={{
                      margin: '6px 0 0',
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
                        requestId: ev.requestId,
                        routePattern: ev.routePattern,
                        statusCode: ev.statusCode,
                        actorRole: ev.actorRole,
                        scope: ev.scope,
                        window: ev.window,
                        platform: ev.platform,
                        appVersionCode: ev.appVersionCode,
                      },
                      null,
                      2
                    )}
                  </pre>
                )}
              </button>
            );
          })
        )}
      </section>
    </div>
  );
}
