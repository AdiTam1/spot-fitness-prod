'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TextInput, Textarea } from '@mantine/core';
import {
  BellRing,
  CheckCircle2,
  Clock,
  Globe,
  HelpCircle,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Smartphone,
  Users,
} from 'lucide-react';
import {
  AppReleasePolicy,
  AppUpdatePushAudience,
  AppUpdatePushHistoryEntry,
  UserRole,
} from '@/types/nutrition';

type UserVersionStatus =
  | 'up_to_date'
  | 'update_available'
  | 'blocked'
  | 'unknown';

interface AdminUserVersionRow {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
  accountStatus: string;
  platform: string;
  appVersionCode: number | null;
  appVersionName: string | null;
  webBuildId: string | null;
  versionStatus: UserVersionStatus;
  lastSeenAt: string | null;
  versionUpdatedAt: string | null;
  androidTokenCount: number;
  webSubCount: number;
  hasAnyPushTarget: boolean;
  source: 'heartbeat' | 'telemetry' | 'none';
}

interface AdminUserVersionsSummary {
  totalUsers: number;
  reportedUsers: number;
  upToDateCount: number;
  outdatedCount: number;
  blockedCount: number;
  unknownCount: number;
  androidUsersCount: number;
  webUsersCount: number;
  pushReachableCount: number;
  pushReachableOutdatedCount: number;
}

interface AdminUserVersionsReport {
  serverWebBuildId: string;
  versionInfo: {
    latestVersionCode: number;
    latestVersionName: string;
    androidBlockedUpToVersionCode: number;
    releaseNotes?: string;
  };
  summary: AdminUserVersionsSummary;
  users: AdminUserVersionRow[];
  pushHistory: AppUpdatePushHistoryEntry[];
}

interface BroadcastPushResultPayload {
  ok: boolean;
  error?: string;
  targetedUsers: number;
  sentUsers: number;
  sentDevices: number;
  androidSentCount: number;
  webSentCount: number;
  failedDevices: number;
  skippedNoDevice: number;
  configError?: string;
  pushHistory?: AppUpdatePushHistoryEntry[];
}

interface AdminAppVersionsAndPushPanelProps {
  appReleasePolicy?: AppReleasePolicy;
  refreshNonce?: number;
  onNotify: (msg: string, isError?: boolean) => void;
}

type FilterTab =
  | 'all'
  | 'outdated'
  | 'up_to_date'
  | 'android'
  | 'web'
  | 'unknown';

const ROLE_LABELS: Record<UserRole, string> = {
  trainee: 'מתאמן',
  coach: 'מאמן',
  admin: 'מנהל',
};

function formatPlatformLabel(platform: string): string {
  switch (platform) {
    case 'android-apk':
      return 'Android APK';
    case 'pwa-ios':
      return 'iPhone (מסך הבית)';
    case 'pwa-android':
      return 'Android PWA';
    case 'web':
      return 'דפדפן Web';
    default:
      return 'לא זוהה';
  }
}

function formatAudienceLabel(audience: AppUpdatePushAudience): string {
  switch (audience) {
    case 'all':
      return 'כל המשתמשים';
    case 'trainees':
      return 'רק מתאמנים';
    case 'coaches':
      return 'מאמנים ומנהל';
    case 'android-outdated':
      return 'Android שלא עדכנו';
    case 'web-outdated':
      return 'Web שלא עדכנו';
    case 'single-user':
      return 'תזכורת אישית';
    default:
      return audience;
  }
}

function formatDateTimeHe(iso: string | null): string {
  if (!iso) return 'טרם התחבר';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  try {
    return new Intl.DateTimeFormat('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

function renderStatusBadge(status: UserVersionStatus) {
  if (status === 'up_to_date') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          background: 'rgba(16, 185, 129, 0.14)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.35)',
        }}
      >
        <CheckCircle2 size={12} />
        <span>מעודכן</span>
      </span>
    );
  }
  if (status === 'blocked') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          background: 'rgba(239, 68, 68, 0.14)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.35)',
        }}
      >
        <ShieldAlert size={12} />
        <span>חסום לעדכון</span>
      </span>
    );
  }
  if (status === 'update_available') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 800,
          background: 'rgba(245, 158, 11, 0.14)',
          color: '#f59e0b',
          border: '1px solid rgba(245, 158, 11, 0.35)',
        }}
      >
        <Clock size={12} />
        <span>טרם עדכן</span>
      </span>
    );
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: 'var(--surface-3)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <HelpCircle size={12} />
      <span>טרם דווח</span>
    </span>
  );
}

export function AdminAppVersionsAndPushPanel({
  appReleasePolicy,
  refreshNonce = 0,
  onNotify,
}: AdminAppVersionsAndPushPanelProps) {
  const [report, setReport] = useState<AdminUserVersionsReport | null>(null);
  const [loading, setLoading] = useState(false);

  const [audience, setAudience] = useState<AppUpdatePushAudience>('all');
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [customEdited, setCustomEdited] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [sendingUserId, setSendingUserId] = useState<string | null>(null);
  const [lastResult, setLastResult] =
    useState<BroadcastPushResultPayload | null>(null);

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/apk-release?includeUsers=1&t=${Date.now()}`,
        { cache: 'no-store' }
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        userVersionsReport?: AdminUserVersionsReport;
      };
      if (data.userVersionsReport) {
        setReport(data.userVersionsReport);
      }
    } catch {
      // ignore transient network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport, refreshNonce, appReleasePolicy?.updatedAt]);

  const activeLatestName =
    appReleasePolicy?.androidLatestVersionName ||
    report?.versionInfo.latestVersionName ||
    '';
  const activeLatestCode =
    appReleasePolicy?.androidLatestVersionCode ||
    report?.versionInfo.latestVersionCode ||
    0;
  const activeReleaseNotes =
    appReleasePolicy?.androidReleaseNotes ||
    report?.versionInfo.releaseNotes ||
    '';

  useEffect(() => {
    if (customEdited) return;
    const verLabel = activeLatestName
      ? `v${activeLatestName}`
      : activeLatestCode > 0
      ? `גרסה ${activeLatestCode}`
      : 'גרסה חדשה';
    setPushTitle(`עדכון חדש זמין באפליקציית SPOT (${verLabel})`);
    setPushBody(
      activeReleaseNotes
        ? `${activeReleaseNotes} • לחץ כאן לעדכון`
        : 'שחררנו גרסה חדשה עם שיפורים ותיקונים חשובים. לחץ כאן כדי לעדכן עכשיו.'
    );
  }, [activeLatestCode, activeLatestName, activeReleaseNotes, customEdited]);

  const audienceStats = useMemo(() => {
    const users = report?.users || [];
    const activeUsers = users.filter((u) => u.accountStatus !== 'paused');
    return {
      all: activeUsers.filter((u) => u.hasAnyPushTarget).length,
      trainees: activeUsers.filter(
        (u) => u.role === 'trainee' && u.hasAnyPushTarget
      ).length,
      coaches: users.filter(
        (u) =>
          (u.role === 'coach' || u.role === 'admin') && u.hasAnyPushTarget
      ).length,
      androidOutdated: users.filter((u) => {
        if (u.androidTokenCount <= 0) return false;
        if (
          u.versionStatus === 'blocked' ||
          u.versionStatus === 'update_available'
        ) {
          return true;
        }
        return (
          activeLatestCode > 0 &&
          (!u.appVersionCode || u.appVersionCode < activeLatestCode)
        );
      }).length,
    };
  }, [activeLatestCode, report]);

  const sendUpdatePush = async (opts: {
    targetAudience: AppUpdatePushAudience;
    targetUserId?: string;
    targetUserName?: string;
  }) => {
    if (!pushTitle.trim() || !pushBody.trim()) {
      onNotify('יש להזין כותרת ותוכן להתראת העדכון', true);
      return;
    }

    if (opts.targetAudience === 'single-user' && opts.targetUserId) {
      setSendingUserId(opts.targetUserId);
    } else {
      setSendingBroadcast(true);
    }

    try {
      const res = await fetch('/api/admin/apk-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_update_push',
          audience: opts.targetAudience,
          targetUserId: opts.targetUserId,
          title: pushTitle.trim(),
          body: pushBody.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        pushResult?: BroadcastPushResultPayload;
      };

      if (!res.ok || !data.pushResult) {
        if (data.pushResult) {
          setLastResult(data.pushResult);
        }
        onNotify(data.error || 'שליחת הפוש נכשלה', true);
        return;
      }

      setLastResult(data.pushResult);
      if (data.pushResult.pushHistory && report) {
        setReport({
          ...report,
          pushHistory: data.pushResult.pushHistory,
        });
      }

      if (data.pushResult.sentDevices > 0) {
        onNotify(
          opts.targetAudience === 'single-user'
            ? `נשלחה תזכורת עדכון אל ${opts.targetUserName || 'המשתמש'} (${data.pushResult.sentDevices} מכשירים)`
            : `התראת העדכון נשלחה ל-${data.pushResult.sentUsers} משתמשים (${data.pushResult.sentDevices} מכשירים)!`
        );
      } else {
        onNotify(
          data.pushResult.error || 'לא נמצאו מכשירים זמינים לשליחת פוש.',
          true
        );
      }
    } catch {
      onNotify('שגיאת רשת בשליחת התראת העדכון', true);
    } finally {
      setSendingBroadcast(false);
      setSendingUserId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const users = report?.users || [];
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (filterTab === 'outdated') {
        if (
          u.versionStatus !== 'update_available' &&
          u.versionStatus !== 'blocked'
        ) {
          return false;
        }
      } else if (filterTab === 'up_to_date') {
        if (u.versionStatus !== 'up_to_date') return false;
      } else if (filterTab === 'android') {
        if (u.platform !== 'android-apk' && !u.appVersionCode) return false;
      } else if (filterTab === 'web') {
        if (
          u.platform === 'unknown' ||
          u.platform === 'android-apk'
        ) {
          return false;
        }
      } else if (filterTab === 'unknown') {
        if (u.versionStatus !== 'unknown') return false;
      }

      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.appVersionName || '').toLowerCase().includes(q) ||
        (u.appVersionCode ? String(u.appVersionCode).includes(q) : false)
      );
    });
  }, [filterTab, report, searchQuery]);

  const summary = report?.summary;
  const pushHistory = report?.pushHistory || [];

  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 16,
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {/* 1. שידור התראת פוש לכלל המשתמשים */}
      <div
        style={{
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 18,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BellRing size={18} color="var(--accent)" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 900, fontSize: 14 }}>
                שליחת פוש עדכון אפליקציה למשתמשים
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                שולח התראת Push (אנדרואיד + iPhone PWA / דפדפן). לחיצה על ההתראה פותחת ובודקת את העדכון באפליקציה.
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading}
            style={{
              background: 'var(--surface-3)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: 11.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? (
              <Loader2 size={13} className="spot-spinner" />
            ) : (
              <RefreshCw size={13} />
            )}
            <span>רענן נתונים</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(
            [
              {
                id: 'all' as AppUpdatePushAudience,
                label: `כל המשתמשים (${audienceStats.all})`,
              },
              {
                id: 'android-outdated' as AppUpdatePushAudience,
                label: `Android שטרם עדכנו (${audienceStats.androidOutdated})`,
              },
              {
                id: 'trainees' as AppUpdatePushAudience,
                label: `רק מתאמנים (${audienceStats.trainees})`,
              },
              {
                id: 'coaches' as AppUpdatePushAudience,
                label: `מאמנים ומנהל (${audienceStats.coaches})`,
              },
            ] as const
          ).map((opt) => {
            const active = audience === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAudience(opt.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: active ? 800 : 600,
                  border: active
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border-subtle)',
                  background: active
                    ? 'var(--accent-soft, rgba(245, 158, 11, 0.14))'
                    : 'var(--card)',
                  color: active ? 'var(--accent)' : 'var(--text-primary)',
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          <TextInput
            label="כותרת התראת הפוש"
            value={pushTitle}
            maxLength={120}
            disabled={sendingBroadcast}
            onChange={(e) => {
              setCustomEdited(true);
              setPushTitle(e.currentTarget.value);
            }}
          />
          <Textarea
            label="תוכן ההודעה למשתמשים"
            minRows={1}
            autosize
            maxRows={3}
            maxLength={360}
            disabled={sendingBroadcast}
            value={pushBody}
            onChange={(e) => {
              setCustomEdited(true);
              setPushBody(e.currentTarget.value);
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {customEdited ? (
            <button
              type="button"
              onClick={() => setCustomEdited(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: 11.5,
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              אפס לטקסט ברירת מחדל לפי הגרסה הפעילה
            </button>
          ) : (
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              מתעדכן אוטומטית לפי הגרסה והערות השחרור הפעילות
            </span>
          )}

          <button
            type="button"
            disabled={sendingBroadcast}
            onClick={() => void sendUpdatePush({ targetAudience: audience })}
            className="btn-volt"
            style={{
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: sendingBroadcast ? 'wait' : 'pointer',
            }}
          >
            {sendingBroadcast ? (
              <Loader2 size={14} className="spot-spinner" />
            ) : (
              <Send size={14} />
            )}
            <span>
              {sendingBroadcast ? 'שולח פוש...' : 'שלח התראת עדכון עכשיו'}
            </span>
          </button>
        </div>

        {lastResult && (
          <div
            style={{
              borderRadius: 12,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 700,
              background:
                lastResult.sentDevices > 0
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
              border:
                lastResult.sentDevices > 0
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : '1px solid rgba(239, 68, 68, 0.35)',
              color:
                lastResult.sentDevices > 0
                  ? '#10b981'
                  : 'var(--danger-text, #ef4444)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <span>
              נשלח ל-{lastResult.sentUsers} משתמשים ({lastResult.sentDevices}{' '}
              מכשירים: {lastResult.androidSentCount} אנדרואיד ·{' '}
              {lastResult.webSentCount} Web/iOS)
            </span>
            {lastResult.skippedNoDevice > 0 && (
              <span style={{ opacity: 0.85 }}>
                · {lastResult.skippedNoDevice} ללא הרשאת פוש
              </span>
            )}
            {lastResult.failedDevices > 0 && (
              <span style={{ opacity: 0.85 }}>
                · {lastResult.failedDevices} מכשירים נכשלו/נוקו
              </span>
            )}
          </div>
        )}

        {pushHistory.length > 0 && (
          <div
            style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: 'var(--text-secondary)',
              }}
            >
              שליחות פוש עדכון אחרונות ({pushHistory.length})
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {pushHistory.slice(0, 4).map((h) => (
                <div
                  key={h.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                    fontSize: 11.5,
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 10,
                    padding: '6px 10px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 800 }}>{h.title}</span>
                    <span
                      style={{
                        fontSize: 10.5,
                        padding: '1px 7px',
                        borderRadius: 999,
                        background: 'var(--surface-3)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {formatAudienceLabel(h.audience)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>
                      {h.sentUsers} משתמשים · {h.sentDevices} מכשירים
                    </span>
                    <span className="num-mono">
                      {formatDateTimeHe(h.sentAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. מעקב גרסאות פר-משתמש: מי עדכן ומי על איזו גרסה */}
      <div
        style={{
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 18,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="var(--accent)" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 900, fontSize: 14 }}>
                סטטוס גרסאות משתמשים — מי עדכן ומי על איזה גרסה
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                גרסה אחרונה באנדרואיד:{' '}
                <bdi dir="ltr" className="num-mono">
                  {activeLatestName ? `v${activeLatestName}` : '—'} (#
                  {activeLatestCode || '—'})
                </bdi>
                {report?.serverWebBuildId && (
                  <>
                    {' '}
                    · Web build:{' '}
                    <bdi dir="ltr" className="num-mono">
                      {report.serverWebBuildId}
                    </bdi>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        {summary && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
              gap: 8,
            }}
          >
            {[
              {
                label: 'מעודכנים',
                value: summary.upToDateCount,
                color: '#10b981',
              },
              {
                label: 'טרם עדכנו',
                value: summary.outdatedCount,
                color: '#f59e0b',
              },
              {
                label: 'גרסה חסומה',
                value: summary.blockedCount,
                color: '#ef4444',
              },
              {
                label: 'Android APK',
                value: summary.androidUsersCount,
                color: 'var(--accent)',
              },
              {
                label: 'Web / iPhone',
                value: summary.webUsersCount,
                color: '#38bdf8',
              },
              {
                label: 'טרם דווח',
                value: summary.unknownCount,
                color: 'var(--text-secondary)',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    fontWeight: 700,
                  }}
                >
                  {kpi.label}
                </span>
                <span
                  className="num-mono"
                  style={{ fontSize: 19, fontWeight: 900, color: kpi.color }}
                >
                  {kpi.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* סינון + חיפוש */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(
              [
                {
                  id: 'all' as FilterTab,
                  label: `הכל (${summary?.totalUsers ?? 0})`,
                },
                {
                  id: 'outdated' as FilterTab,
                  label: `טרם עדכנו (${
                    (summary?.outdatedCount ?? 0) + (summary?.blockedCount ?? 0)
                  })`,
                },
                {
                  id: 'up_to_date' as FilterTab,
                  label: `מעודכנים (${summary?.upToDateCount ?? 0})`,
                },
                {
                  id: 'android' as FilterTab,
                  label: `Android (${summary?.androidUsersCount ?? 0})`,
                },
                {
                  id: 'web' as FilterTab,
                  label: `Web / iOS (${summary?.webUsersCount ?? 0})`,
                },
                {
                  id: 'unknown' as FilterTab,
                  label: `טרם דווח (${summary?.unknownCount ?? 0})`,
                },
              ] as const
            ).map((tab) => {
              const active = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: active ? 800 : 600,
                    border: active
                      ? '1px solid var(--accent)'
                      : '1px solid var(--border-subtle)',
                    background: active ? 'var(--accent-soft, rgba(245, 158, 11, 0.14))' : 'var(--card)',
                    color: active ? 'var(--accent)' : 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <TextInput
            size="xs"
            placeholder="חפש שם, אימייל או גרסה..."
            leftSection={<Search size={13} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            style={{ minWidth: 210, flex: '0 1 240px' }}
          />
        </div>

        {/* רשימת משתמשים רספונסיבית */}
        {loading && !report ? (
          <div
            style={{
              padding: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}
          >
            <Loader2 size={16} className="spot-spinner" />
            <span>טוען נתוני גרסאות משתמשים...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 12.5,
              background: 'var(--card)',
              borderRadius: 12,
              border: '1px solid var(--line)',
            }}
          >
            לא נמצאו משתמשים התואמים לסינון הנוכחי.
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              maxHeight: 420,
              overflowY: 'auto',
              paddingInlineEnd: 2,
            }}
          >
            {filteredUsers.map((u) => {
              const isAndroid =
                u.platform === 'android-apk' ||
                (u.appVersionCode !== null && u.appVersionCode > 0);
              const showReminderBtn =
                u.hasAnyPushTarget &&
                (u.versionStatus === 'update_available' ||
                  u.versionStatus === 'blocked');

              return (
                <div
                  key={`${u.role}-${u.userId}`}
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      minWidth: 180,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: 13 }}>
                        {u.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: 'var(--surface-3)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {ROLE_LABELS[u.role]}
                      </span>
                      {renderStatusBadge(u.versionStatus)}
                    </div>
                    <span
                      style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                    >
                      <bdi dir="ltr">{u.email}</bdi>
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 2,
                        fontSize: 11.5,
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontWeight: 700,
                        }}
                      >
                        {isAndroid ? (
                          <Smartphone size={13} color="var(--accent)" />
                        ) : u.platform !== 'unknown' ? (
                          <Globe size={13} color="#38bdf8" />
                        ) : null}
                        <span>{formatPlatformLabel(u.platform)}</span>
                        {isAndroid && u.appVersionCode ? (
                          <bdi
                            dir="ltr"
                            className="num-mono"
                            style={{ color: 'var(--accent)', fontWeight: 800 }}
                          >
                            {u.appVersionName ? `v${u.appVersionName} ` : ''}#
                            {u.appVersionCode}
                          </bdi>
                        ) : !isAndroid && u.webBuildId ? (
                          <bdi
                            dir="ltr"
                            className="num-mono"
                            style={{
                              fontSize: 10.5,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {u.webBuildId}
                          </bdi>
                        ) : null}
                      </span>

                      <span
                        style={{
                          fontSize: 10.5,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        נראה:{' '}
                        <span className="num-mono">
                          {formatDateTimeHe(u.lastSeenAt)}
                        </span>
                        {' · '}
                        {u.hasAnyPushTarget
                          ? `פוש זמין (${
                              u.androidTokenCount > 0 ? 'FCM' : ''
                            }${
                              u.androidTokenCount > 0 && u.webSubCount > 0
                                ? '+'
                                : ''
                            }${u.webSubCount > 0 ? 'Web' : ''})`
                          : 'ללא פוש'}
                      </span>
                    </div>

                    {showReminderBtn && (
                      <button
                        type="button"
                        disabled={sendingUserId === u.userId}
                        onClick={() =>
                          void sendUpdatePush({
                            targetAudience: 'single-user',
                            targetUserId: u.userId,
                            targetUserName: u.name,
                          })
                        }
                        style={{
                          background: 'var(--surface-3)',
                          color: 'var(--accent)',
                          border: '1px solid var(--accent)',
                          borderRadius: 999,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor:
                            sendingUserId === u.userId ? 'wait' : 'pointer',
                        }}
                      >
                        {sendingUserId === u.userId ? (
                          <Loader2 size={12} className="spot-spinner" />
                        ) : (
                          <BellRing size={12} />
                        )}
                        <span>שלח תזכורת</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
