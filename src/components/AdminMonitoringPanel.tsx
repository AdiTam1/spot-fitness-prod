'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Select, Switch, TextInput } from '@mantine/core';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  Database,
  FilterX,
  RefreshCw,
  Search,
  ServerCrash,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { SegmentedPill } from './ui/SegmentedPill';
import { AdminRateLimitsSection } from './AdminRateLimitsSection';
import { AdminDiagnosticsSection } from './AdminDiagnosticsSection';
import {
  AdminAiTracesInspector,
  type AiTraceQueueBucket,
} from './AdminAiTracesInspector';
import type { RateLimitAnalyticsPayload } from '@/lib/rateLimitAnalytics';
import type { UserDiagnosticsPayload } from '@/lib/telemetry/diagnosticsSummary';
import type { CoachProfile, TraineeProfile } from '@/types/nutrition';

interface AdminMonitoringPanelProps {
  trainees: TraineeProfile[];
  coaches: CoachProfile[];
  onNotify: (msg: string, isError?: boolean) => void;
}

interface MonitoringSummary {
  windowHours?: number;
  activeUsers?: {
    totalUniqueActors?: number;
    totalAuditEvents?: number;
    byPlatform?: Record<string, number>;
  };
  api?: {
    totalLoggedRequests?: number;
    errorRequests?: number;
    serverErrors?: number;
    rateLimited?: number;
    slowRequests?: number;
    p50LatencyMs?: number;
    p95LatencyMs?: number;
  };
  ai?: {
    totalAiCalls?: number;
    failedAiCalls?: number;
    avgAiMs?: number;
    p95AiMs?: number;
  };
  apkVersions7d?: { versionCode: number; users: number }[];
  clientErrors?: number;
}

interface AiUserStat {
  actorId: string;
  actorRole: string;
  totalCalls: number;
  succeededCalls: number;
  fallbackCalls: number;
  failedCalls: number;
  avgMs: number;
  lastCallAt: string;
  topFailureReason?: string | null;
}

interface AiFailureReasonStat {
  outcome: string;
  reasonCode: string;
  reasonText: string;
  count: number;
}

interface AiModelStat {
  model: string;
  calls: number;
  succeeded: number;
  fallback: number;
  failed: number;
  avgMs: number;
}

interface AiModeStat {
  mode: string;
  calls: number;
  succeeded: number;
  fallback: number;
  failed: number;
  avgMs: number;
}

interface AiStatsPayload {
  windowHours?: number;
  totals?: {
    totalCalls?: number;
    succeededCount?: number;
    fallbackCount?: number;
    failedCount?: number;
    cancelledCount?: number;
    avgMs?: number;
    p95Ms?: number;
    totalImages?: number;
    totalImageKB?: number;
  };
  byUser?: AiUserStat[];
  byFailureReason?: AiFailureReasonStat[];
  byModel?: AiModelStat[];
  byMode?: AiModeStat[];
}

interface AuditRow {
  id: string;
  created_at: string;
  request_id?: string | null;
  actor_id: string;
  actor_role: string;
  target_trainee_id?: string | null;
  category: string;
  action: string;
  status: string;
  platform?: string | null;
  app_version_code?: number | null;
  metadata?: Record<string, unknown> | null;
}

interface ApiLogRow {
  id: number;
  created_at: string;
  request_id: string;
  method: string;
  route_pattern: string;
  action_name?: string | null;
  status_code: number;
  duration_ms: number;
  actor_id?: string | null;
  actor_role?: string | null;
  platform?: string | null;
  app_version_code?: number | null;
  error_code?: string | null;
  error_message?: string | null;
  ai_usage?: Record<string, unknown> | null;
}

interface ClientEventRow {
  id: number;
  created_at: string;
  session_id: string;
  user_id?: string | null;
  role?: string | null;
  platform?: string | null;
  app_version_code?: number | null;
  web_build_id?: string | null;
  event_type: string;
  event_name: string;
  screen?: string | null;
  details?: Record<string, unknown> | null;
}

const AI_MODE_LABELS: Record<string, string> = {
  analyze: 'ניתוח תמונה / טקסט',
  'adjust-meal': 'התאמת ארוחה שמורה',
  'measure-tool': 'מדידת כלי הגשה',
  'transcribe-audio': 'תמלול הקלטה קולית',
  recommend: 'המלצת ארוחה (AI)',
  'learn-preference': 'למידת העדפת מתאמן',
};

const OUTCOME_BADGE: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  succeeded: {
    label: 'הצליח ב-AI',
    bg: 'rgba(34, 197, 94, 0.16)',
    color: 'var(--ok-text)',
  },
  fallback: {
    label: 'גיבוי דטרמיניסטי',
    bg: 'rgba(245, 158, 11, 0.16)',
    color: 'var(--warn-text)',
  },
  failed: {
    label: 'נכשל',
    bg: 'rgba(239, 68, 68, 0.16)',
    color: 'var(--danger-text)',
  },
  cancelled: {
    label: 'בוטל ע"י משתמש',
    bg: 'var(--surface-3)',
    color: 'var(--text-2)',
  },
};

function formatTimeHe(iso: string): string {
  try {
    return new Date(iso).toLocaleString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function resolveAiRowOutcome(row: ApiLogRow): string {
  const explicit = row.ai_usage?.outcome;
  if (typeof explicit === 'string' && explicit) return explicit;
  if (row.status_code >= 400) return 'failed';
  if (row.ai_usage?.fallbackUsed) return 'fallback';
  return 'succeeded';
}

export function AdminMonitoringPanel({
  trainees,
  coaches,
  onNotify,
}: AdminMonitoringPanelProps) {
  const [hours, setHours] = useState<string>('168');
  const [viewTab, setViewTab] = useState<'diagnostics' | 'ai' | 'rateLimits' | 'audit' | 'api' | 'client'>('ai');
  const [liveRefresh, setLiveRefresh] = useState<boolean>(false);
  const [userDiagnostics, setUserDiagnostics] = useState<UserDiagnosticsPayload | null>(null);
  const [actorFilter, setActorFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [aiOutcomeFilter, setAiOutcomeFilter] = useState<string>('');
  const [aiReasonFilter, setAiReasonFilter] = useState<string>('');
  const [requestIdSearch, setRequestIdSearch] = useState<string>('');
  const [errorsOnly, setErrorsOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(false);
  const [pruning, setPruning] = useState<boolean>(false);
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [missingReason, setMissingReason] = useState<string | null>(null);
  const [summary, setSummary] = useState<MonitoringSummary | null>(null);
  const [aiStats, setAiStats] = useState<AiStatsPayload | null>(null);
  const [aiStatsRpcPending, setAiStatsRpcPending] = useState<boolean>(false);
  const [rateLimitStats, setRateLimitStats] = useState<RateLimitAnalyticsPayload | null>(null);
  const [rateLimitCountersPending, setRateLimitCountersPending] = useState<boolean>(false);
  const [aiLogs, setAiLogs] = useState<ApiLogRow[]>([]);
  const [aiTraceHistory, setAiTraceHistory] = useState<AiTraceQueueBucket>({
    traces: [],
    totalCount: 0,
    savedCount: 0,
    cap: 250,
  });
  const [aiTraceCrashed, setAiTraceCrashed] = useState<AiTraceQueueBucket>({
    traces: [],
    totalCount: 0,
    savedCount: 0,
    cap: 100,
  });
  const [auditEvents, setAuditEvents] = useState<AuditRow[]>([]);
  const [apiLogs, setApiLogs] = useState<ApiLogRow[]>([]);
  const [clientEvents, setClientEvents] = useState<ClientEventRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const actorNameMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set('coach-admin', 'מנהל ראשי');
    map.set('anonymous', 'אנונימי');
    map.set('cron-secret', 'מערכת Cron');
    for (const c of coaches) map.set(c.id, `מאמן: ${c.name}`);
    for (const t of trainees) map.set(t.id, t.name);
    return map;
  }, [coaches, trainees]);

  const userSelectData = useMemo(() => {
    const opts = [{ value: '', label: 'כל המשתמשים' }];
    opts.push({ value: 'coach-admin', label: 'מנהל ראשי' });
    for (const c of coaches) {
      opts.push({ value: c.id, label: `מאמן — ${c.name}` });
    }
    for (const t of trainees) {
      opts.push({ value: t.id, label: `מתאמן — ${t.name}` });
    }
    return opts;
  }, [coaches, trainees]);

  const resolveActorName = (id?: string | null) => {
    if (!id) return 'לא מזוהה';
    return actorNameMap.get(id) || id;
  };

  const loadSnapshot = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        hours,
        page: String(page),
      });
      if (actorFilter) params.set('actorId', actorFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (aiOutcomeFilter) params.set('aiOutcome', aiOutcomeFilter);
      if (aiReasonFilter) params.set('aiReasonCode', aiReasonFilter);
      if (requestIdSearch.trim()) {
        params.set('requestId', requestIdSearch.trim());
      }
      if (errorsOnly) params.set('errorsOnly', '1');

      const res = await fetch(`/api/admin/monitoring?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data?.error || 'שגיאה בטעינת נתוני ניטור', true);
        return;
      }

      setSetupRequired(Boolean(data.setupRequired));
      setMissingReason(data.missingReason || null);
      setSummary(data.summary || null);
      setAiStats(data.aiStats || null);
      setAiStatsRpcPending(Boolean(data.aiStatsRpcPending));
      setRateLimitStats(data.rateLimitStats || null);
      setUserDiagnostics(data.userDiagnostics || null);
      setRateLimitCountersPending(Boolean(data.rateLimitCountersPending));
      setAiLogs(Array.isArray(data.aiLogs) ? data.aiLogs : []);
      if (data.aiTraceHistory) setAiTraceHistory(data.aiTraceHistory);
      if (data.aiTraceCrashed) setAiTraceCrashed(data.aiTraceCrashed);
      setAuditEvents(Array.isArray(data.auditEvents) ? data.auditEvents : []);
      setApiLogs(Array.isArray(data.apiLogs) ? data.apiLogs : []);
      setClientEvents(Array.isArray(data.clientEvents) ? data.clientEvents : []);
    } catch {
      onNotify('שגיאת תקשורת בטעינת הניטור', true);
    } finally {
      setLoading(false);
    }
  }, [
    actorFilter,
    aiOutcomeFilter,
    aiReasonFilter,
    categoryFilter,
    errorsOnly,
    hours,
    onNotify,
    page,
    requestIdSearch,
  ]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!liveRefresh) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadSnapshot();
      }
    }, 5000);
    return () => clearInterval(t);
  }, [liveRefresh, loadSnapshot]);

  const handleManualRollupAndPrune = async () => {
    setPruning(true);
    try {
      const res = await fetch('/api/admin/monitoring', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        onNotify(data?.error || 'הפעולה נכשלה', true);
        return;
      }
      onNotify('סיכום יומי וניקוי רשומות ישנות (TTL) הושלמו ב-Supabase');
      void loadSnapshot();
    } catch {
      onNotify('שגיאת תקשורת בביצוע תחזוקת DB', true);
    } finally {
      setPruning(false);
    }
  };

  const aiTotals = aiStats?.totals || {};
  const totalAiCalls = aiTotals.totalCalls ?? 0;
  const succeededAi = aiTotals.succeededCount ?? 0;
  const fallbackAi = aiTotals.fallbackCount ?? 0;
  const failedAi = aiTotals.failedCount ?? 0;
  const cancelledAi = aiTotals.cancelledCount ?? 0;
  const activeDenom = Math.max(1, succeededAi + fallbackAi + failedAi);
  const succeededPct = Math.round((succeededAi / activeDenom) * 100);
  const fallbackPct = Math.round((fallbackAi / activeDenom) * 100);
  const failedPct = Math.max(0, 100 - succeededPct - fallbackPct);

  const windowLabel =
    hours === '24' ? '24 שעות' : hours === '168' ? '7 ימים' : '30 יום';

  const rateLimitedBlockedCount =
    rateLimitStats?.totalBlocked429 ?? summary?.api?.rateLimited ?? 0;
  const rateLimitedTotalBadges =
    rateLimitedBlockedCount + (rateLimitStats?.totalDegraded ?? 0);

  const currentListLen =
    viewTab === 'ai'
      ? aiLogs.length
      : viewTab === 'rateLimits'
      ? rateLimitStats?.recentEvents.length ?? 0
      : viewTab === 'audit'
      ? auditEvents.length
      : viewTab === 'api'
      ? apiLogs.length
      : clientEvents.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
            מנהל ראשי · אגרגציה וניטור AI מורחב ב-DB
          </span>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.2,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Activity size={24} color="var(--accent)" />
            <span>ניטור מערכת, סטטיסטיקות AI ולוגים</span>
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ paddingInlineEnd: 4 }}>
            <Switch
              color="teal"
              size="sm"
              checked={liveRefresh}
              onChange={(e) => setLiveRefresh(e.currentTarget.checked)}
              label="מעקב חי (5s)"
            />
          </div>
          <button
            type="button"
            disabled={pruning || setupRequired}
            onClick={() => void handleManualRollupAndPrune()}
            className="btn-surface"
            style={{
              padding: '8px 14px',
              fontSize: 12.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: pruning ? 'wait' : 'pointer',
            }}
          >
            <Trash2 size={14} />
            <span>{pruning ? 'מנקה...' : 'אגרגציה וניקוי (TTL)'}</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadSnapshot()}
            className="btn-volt"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw
              size={14}
              className={loading ? 'spot-spinner' : undefined}
            />
            <span>{loading ? 'טוען...' : 'רענן נתונים'}</span>
          </button>
        </div>
      </header>

      {setupRequired && (
        <div
          className="pro-card"
          style={{
            padding: 18,
            borderRadius: 24,
            border: '1px solid rgba(245, 158, 11, 0.45)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--warn-text)',
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            <Database size={18} />
            <span>נדרשת הקמה חד-פעמית של טבלאות הניטור ב-Supabase</span>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-2)', lineHeight: 1.55 }}>
            {missingReason}
          </p>
        </div>
      )}

      {!setupRequired && aiStatsRpcPending && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 16,
            background: 'var(--surface-2)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
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
            כדי לחשב סטטיסטיקות AI בצד ה-DB (0 Egress), הרץ ב-Supabase את{' '}
            <bdi dir="ltr">supabase/migrations/20261125_ai_monitoring_rpc.sql</bdi>. בינתיים הנתונים מחושבים אוטומטית עד 1,000 רשומות אחרונות.
          </span>
        </div>
      )}

      {!setupRequired && summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
            gap: 10,
          }}
        >
          <div className="pro-card" style={{ padding: 14, borderRadius: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
              <Users size={14} color="var(--accent)" />
              <span>משתמשים פעילים ({windowLabel})</span>
            </div>
            <div className="num-mono" style={{ fontSize: 24, fontWeight: 800 }}>
              {summary.activeUsers?.totalUniqueActors ?? 0}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {summary.activeUsers?.totalAuditEvents ?? 0} פעולות עסקיות
            </div>
          </div>

          <div className="pro-card" style={{ padding: 14, borderRadius: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
              <Brain size={14} color="#a855f7" />
              <span>קריאות AI ({windowLabel})</span>
            </div>
            <div className="num-mono" style={{ fontSize: 24, fontWeight: 800 }}>
              {totalAiCalls}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              הצליח: {succeededAi} · גיבוי: {fallbackAi} · נכשל: {failedAi}
            </div>
          </div>

          <div className="pro-card" style={{ padding: 14, borderRadius: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
              <ServerCrash size={14} color="#ef4444" />
              <span>שגיאות API + לקוח</span>
            </div>
            <div className="num-mono" style={{ fontSize: 24, fontWeight: 800 }}>
              {(summary.api?.errorRequests ?? 0) + (summary.clientErrors ?? 0)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              שרת: {summary.api?.errorRequests ?? 0} · לקוח: {summary.clientErrors ?? 0}
            </div>
          </div>

          <div className="pro-card" style={{ padding: 14, borderRadius: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
              <Clock size={14} color="#38bdf8" />
              <span>מהירות תגובה (AI / API p95)</span>
            </div>
            <div className="num-mono" style={{ fontSize: 20, fontWeight: 800 }}>
              <bdi dir="ltr">
                {aiTotals.avgMs ?? 0}ms / {summary.api?.p95LatencyMs ?? 0}ms
              </bdi>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              תמונות AI: {aiTotals.totalImages ?? 0} ({Math.round((aiTotals.totalImageKB ?? 0) / 1024)} MB)
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setPage(0);
              setViewTab('rateLimits');
            }}
            className="pro-card"
            style={{
              padding: 14,
              borderRadius: 20,
              textAlign: 'start',
              cursor: 'pointer',
              color: 'var(--text)',
              fontFamily: 'inherit',
              border:
                viewTab === 'rateLimits'
                  ? '1px solid var(--accent)'
                  : undefined,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-2)', marginBottom: 6 }}>
              <ShieldAlert size={14} color="#f59e0b" />
              <span>חסימות Rate Limit ({windowLabel})</span>
            </div>
            <div
              className="num-mono"
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: rateLimitedBlockedCount > 0 ? 'var(--warn-text)' : 'var(--text)',
              }}
            >
              {rateLimitedBlockedCount}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {rateLimitStats
                ? `${rateLimitStats.uniqueBlockedActors} משתמשים נחסמו${
                    rateLimitStats.totalDegraded > 0
                      ? ` · ${rateLimitStats.totalDegraded} נסיגות`
                      : ''
                  }`
                : 'לחץ לפירוט מכסות וחסימות'}
            </div>
          </button>
        </div>
      )}

      {!setupRequired &&
        summary?.apkVersions7d &&
        summary.apkVersions7d.length > 0 && (
          <div
            className="pro-card"
            style={{
              padding: '10px 14px',
              borderRadius: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontSize: 12.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Smartphone size={14} color="var(--accent)" />
              <span>גרסאות APK ב־7 ימים אחרונים:</span>
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {summary.apkVersions7d.map((v) => (
                <span
                  key={v.versionCode}
                  className="num-mono"
                  style={{
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <bdi dir="ltr">vCode {v.versionCode}</bdi> · {v.users}
                </span>
              ))}
            </div>
          </div>
        )}

      {/* סרגל פילטרים מרוכז */}
      <div
        className="pro-card"
        style={{
          padding: 14,
          borderRadius: 22,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <Select
          label="טווח זמן"
          value={hours}
          onChange={(v) => {
            setPage(0);
            setHours(v || '168');
          }}
          data={[
            { value: '24', label: '24 שעות אחרונות' },
            { value: '168', label: '7 ימים אחרונים' },
            { value: '720', label: '30 ימים אחרונים' },
          ]}
        />
        <Select
          label="משתמש / מתאמן"
          searchable
          value={actorFilter}
          onChange={(v) => {
            setPage(0);
            setActorFilter(v || '');
          }}
          data={userSelectData}
        />
        {viewTab === 'audit' ? (
          <Select
            label="קטגוריה (Audit)"
            value={categoryFilter}
            onChange={(v) => {
              setPage(0);
              setCategoryFilter(v || '');
            }}
            data={[
              { value: '', label: 'כל הקטגוריות' },
              { value: 'ai', label: 'ניתוח והמלצות AI' },
              { value: 'meal', label: 'ארוחות ויומן' },
              { value: 'auth', label: 'התחברות ואבטחה' },
              { value: 'steps', label: 'סנכרון צעדים APK' },
              { value: 'push', label: 'התראות פוש' },
              { value: 'coach', label: 'פעולות מאמן' },
              { value: 'apk', label: 'גרסאות APK' },
              { value: 'admin', label: 'מנהל ראשי' },
            ]}
          />
        ) : viewTab === 'ai' ? (
          <Select
            label="תוצאת קריאת AI"
            value={aiOutcomeFilter}
            onChange={(v) => {
              setPage(0);
              setAiOutcomeFilter(v || '');
            }}
            data={[
              { value: '', label: 'כל התוצאות' },
              { value: 'succeeded', label: 'הצליח ב-AI בלבד' },
              { value: 'fallback', label: 'נפל לגיבוי (Fallback)' },
              { value: 'failed', label: 'נכשל לחלוטין (שגיאה)' },
              { value: 'cancelled', label: 'בוטל ע"י משתמש' },
            ]}
          />
        ) : null}
        <TextInput
          dir="ltr"
          label="חיפוש לפי Request ID"
          placeholder="מזהה בקשה..."
          leftSection={<Search size={14} />}
          value={requestIdSearch}
          onChange={(e) => {
            setPage(0);
            setRequestIdSearch(e.currentTarget.value);
          }}
        />
        <div style={{ paddingBottom: 6 }}>
          <Switch
            color="orange"
            checked={errorsOnly}
            onChange={(e) => {
              setPage(0);
              setErrorsOnly(e.currentTarget.checked);
            }}
            label="תקלות / גיבוי בלבד"
          />
        </div>
      </div>

      <SegmentedPill
        value={viewTab}
        onChange={(v) => {
          setPage(0);
          setViewTab(v as 'diagnostics' | 'ai' | 'rateLimits' | 'audit' | 'api' | 'client');
        }}
        options={[
          {
            value: 'diagnostics',
            label: `אבחון וניתוקים${userDiagnostics?.disconnects?.total ? ` (${userDiagnostics.disconnects.total})` : ''}`,
          },
          { value: 'ai', label: `מרכז AI (${totalAiCalls})` },
          { value: 'rateLimits', label: `חסימות ומכסות (${rateLimitedTotalBadges})` },
          { value: 'audit', label: `יומן פעילות (${auditEvents.length})` },
          { value: 'api', label: `לוגי API (${apiLogs.length})` },
          { value: 'client', label: `צד לקוח (${clientEvents.length})` },
        ]}
      />

      {viewTab === 'diagnostics' && !setupRequired && (
        <AdminDiagnosticsSection
          data={userDiagnostics}
          resolveActorName={resolveActorName}
          formatTimeHe={formatTimeHe}
          onSelectActor={(id) => {
            setPage(0);
            setActorFilter(id);
          }}
        />
      )}

      {viewTab === 'rateLimits' && !setupRequired && (
        <AdminRateLimitsSection
          data={rateLimitStats}
          countersPending={rateLimitCountersPending}
          windowLabel={windowLabel}
          actorFilter={actorFilter}
          onSelectActor={(id) => {
            setPage(0);
            setActorFilter(id);
          }}
          resolveActorName={resolveActorName}
          formatTimeHe={formatTimeHe}
        />
      )}

      {viewTab === 'ai' && !setupRequired && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 1. פילוח הצלחות / גיבוי / כשלונות + סיבות כישלון */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
              gap: 12,
            }}
          >
            <section
              className="pro-card"
              style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={16} color="var(--accent)" />
                  <span>חלוקת תוצאות AI ({windowLabel})</span>
                </span>
                <span className="num-mono" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ok-text)' }}>
                  {totalAiCalls > 0 ? `${succeededPct}% הצלחת מודל` : 'אין קריאות'}
                </span>
              </div>

              <div
                style={{
                  height: 12,
                  borderRadius: 999,
                  overflow: 'hidden',
                  display: 'flex',
                  background: 'var(--surface-3)',
                }}
              >
                {succeededAi > 0 && (
                  <div style={{ width: `${succeededPct}%`, background: '#22c55e' }} />
                )}
                {fallbackAi > 0 && (
                  <div style={{ width: `${fallbackPct}%`, background: '#f59e0b' }} />
                )}
                {failedAi > 0 && (
                  <div style={{ width: `${failedPct}%`, background: '#ef4444' }} />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: 'var(--ok-text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CheckCircle2 size={13} />
                    <span>הצליח במודל AI</span>
                  </div>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 800 }}>
                    {succeededAi}
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: 'var(--warn-text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertTriangle size={13} />
                    <span>גיבוי דטרמיניסטי</span>
                  </div>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 800 }}>
                    {fallbackAi}
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: 'var(--danger-text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <XCircle size={13} />
                    <span>נכשל (4xx / 5xx)</span>
                  </div>
                  <div className="num-mono" style={{ fontSize: 20, fontWeight: 800 }}>
                    {failedAi}
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', borderRadius: 14, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 700 }}>
                    בוטל / ממוצע זמן
                  </div>
                  <div className="num-mono" style={{ fontSize: 17, fontWeight: 800 }}>
                    {cancelledAi} · <bdi dir="ltr">{aiTotals.avgMs ?? 0}ms</bdi>
                  </div>
                </div>
              </div>

              {(aiStats?.byModel?.length || 0) > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                    פילוח לפי מנוע / מודל:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {aiStats!.byModel!.map((m) => (
                      <span
                        key={m.model}
                        className="num-mono"
                        style={{
                          padding: '4px 9px',
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          border: '1px solid var(--line)',
                          fontSize: 12,
                        }}
                      >
                        <bdi dir="ltr">{m.model}</bdi>: {m.calls} (avg {m.avgMs}ms)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* סיבות כשל וגיבוי */}
            <section
              className="pro-card"
              style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={16} color="var(--warn-text)" />
                  <span>פירוט סיבות לכישלונות וגיבוי</span>
                </span>
                {aiReasonFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setPage(0);
                      setAiReasonFilter('');
                    }}
                    className="btn-surface"
                    style={{ padding: '3px 8px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <FilterX size={12} />
                    <span>נקה סינון סיבה</span>
                  </button>
                )}
              </div>

              {!aiStats?.byFailureReason || aiStats.byFailureReason.length === 0 ? (
                <div style={{ padding: 18, textAlign: 'center', color: 'var(--ok-text)', fontSize: 13 }}>
                  אפס כשלונות או נפילות לגיבוי בטווח הזמן הנבחר!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {aiStats.byFailureReason.map((r, i) => {
                    const active = aiReasonFilter === r.reasonCode;
                    return (
                      <button
                        key={`${r.reasonCode}-${i}`}
                        type="button"
                        onClick={() => {
                          setPage(0);
                          setAiReasonFilter(active ? '' : r.reasonCode);
                        }}
                        style={{
                          textAlign: 'start',
                          background: active ? 'var(--surface-3)' : 'var(--surface-2)',
                          border: active
                            ? '1px solid var(--accent)'
                            : '1px solid var(--line)',
                          borderRadius: 12,
                          padding: '8px 10px',
                          cursor: 'pointer',
                          color: 'var(--text)',
                          fontFamily: 'inherit',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: 999,
                                background:
                                  r.outcome === 'failed'
                                    ? 'rgba(239, 68, 68, 0.16)'
                                    : 'rgba(245, 158, 11, 0.16)',
                                color:
                                  r.outcome === 'failed'
                                    ? 'var(--danger-text)'
                                    : 'var(--warn-text)',
                              }}
                            >
                              {r.outcome === 'failed' ? 'כשל' : 'גיבוי'}
                            </span>
                            <span className="num-mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }} dir="ltr">
                              {r.reasonCode}
                            </span>
                          </div>
                          <span style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.reasonText}
                          </span>
                        </div>
                        <span
                          className="num-mono"
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            padding: '2px 9px',
                            borderRadius: 999,
                            background: 'var(--card)',
                            flexShrink: 0,
                          }}
                        >
                          {r.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {(aiStats?.byMode?.length || 0) > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {aiStats!.byMode!.map((md) => (
                    <span
                      key={md.mode}
                      style={{
                        fontSize: 11.5,
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        color: 'var(--text-2)',
                      }}
                    >
                      {AI_MODE_LABELS[md.mode] || md.mode}: <strong>{md.calls}</strong>
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 2. טבלת שימוש וכמות קריאות AI פר-משתמש */}
          <section className="pro-card" style={{ padding: 16, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Users size={16} color="var(--accent)" />
                <span>קריאות AI פר משתמש ({aiStats?.byUser?.length ?? 0} משתמשים)</span>
              </span>
              {actorFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setPage(0);
                    setActorFilter('');
                  }}
                  className="btn-surface"
                  style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
                >
                  <FilterX size={13} />
                  <span>הצג את כל המשתמשים</span>
                </button>
              )}
            </div>

            {!aiStats?.byUser || aiStats.byUser.length === 0 ? (
              <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
                לא נמצאו קריאות AI בטווח הזמן הנבחר.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--text-2)', textAlign: 'start' }}>
                      <th style={{ padding: '8px 6px' }}>משתמש</th>
                      <th style={{ padding: '8px 6px' }}>סה&quot;כ</th>
                      <th style={{ padding: '8px 6px', color: 'var(--ok-text)' }}>הצליח</th>
                      <th style={{ padding: '8px 6px', color: 'var(--warn-text)' }}>גיבוי</th>
                      <th style={{ padding: '8px 6px', color: 'var(--danger-text)' }}>נכשל</th>
                      <th style={{ padding: '8px 6px' }}>ממוצע ms</th>
                      <th style={{ padding: '8px 6px' }}>קריאה אחרונה</th>
                      <th style={{ padding: '8px 6px' }}>סיבת כשל עיקרית</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiStats.byUser.map((u) => {
                      const isSelected = actorFilter === u.actorId;
                      return (
                        <tr
                          key={u.actorId}
                          onClick={() => {
                            setPage(0);
                            setActorFilter(isSelected ? '' : u.actorId);
                          }}
                          style={{
                            borderBottom: '1px solid var(--line)',
                            background: isSelected ? 'var(--surface-3)' : 'transparent',
                            cursor: 'pointer',
                          }}
                        >
                          <td style={{ padding: '8px 6px', fontWeight: 700 }}>
                            {resolveActorName(u.actorId)}
                            <span style={{ fontSize: 11, color: 'var(--text-2)', marginInlineStart: 6 }}>
                              ({u.actorRole})
                            </span>
                          </td>
                          <td className="num-mono" style={{ padding: '8px 6px', fontWeight: 800 }}>
                            {u.totalCalls}
                          </td>
                          <td className="num-mono" style={{ padding: '8px 6px', color: 'var(--ok-text)', fontWeight: 700 }}>
                            {u.succeededCalls}
                          </td>
                          <td className="num-mono" style={{ padding: '8px 6px', color: 'var(--warn-text)', fontWeight: 700 }}>
                            {u.fallbackCalls}
                          </td>
                          <td className="num-mono" style={{ padding: '8px 6px', color: 'var(--danger-text)', fontWeight: 700 }}>
                            {u.failedCalls}
                          </td>
                          <td className="num-mono" style={{ padding: '8px 6px' }} dir="ltr">
                            {u.avgMs}ms
                          </td>
                          <td className="num-mono" style={{ padding: '8px 6px', fontSize: 11.5, color: 'var(--text-2)' }} dir="ltr">
                            {formatTimeHe(u.lastCallAt)}
                          </td>
                          <td style={{ padding: '8px 6px', fontSize: 12, color: u.topFailureReason ? 'var(--danger-text)' : 'var(--text-3)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.topFailureReason || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 3. פירוט בקשות ה-AI הגולמיות */}
          <section className="pro-card" style={{ padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 14.5, fontWeight: 800 }}>
              פירוט בקשות AI אחרונות ({aiLogs.length})
            </span>
            {aiLogs.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
                אין בקשות AI התואמות לסינון הנוכחי.
              </div>
            ) : (
              aiLogs.map((row) => {
                const outcome = resolveAiRowOutcome(row);
                const badge = OUTCOME_BADGE[outcome] || OUTCOME_BADGE.succeeded;
                const isExpanded = expandedId === `ailog-${row.id}`;
                const model = String(row.ai_usage?.model || '—');
                const mode = String(row.ai_usage?.mode || row.action_name || 'analyze');
                const reasonText =
                  (typeof row.ai_usage?.failureReason === 'string' &&
                    row.ai_usage.failureReason) ||
                  row.error_message ||
                  '';
                const imgCnt = Number(row.ai_usage?.imageCount || 0) || 0;
                const imgKB = Number(row.ai_usage?.totalImageKB || 0) || 0;

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : `ailog-${row.id}`)
                    }
                    style={{
                      textAlign: 'start',
                      background: 'var(--surface-2)',
                      border:
                        outcome === 'failed'
                          ? '1px solid rgba(239, 68, 68, 0.38)'
                          : outcome === 'fallback'
                          ? '1px solid rgba(245, 158, 11, 0.38)'
                          : '1px solid var(--line)',
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
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11.5,
                            fontWeight: 800,
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {resolveActorName(row.actor_id)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                          {AI_MODE_LABELS[mode] || mode}
                        </span>
                        <span className="num-mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }} dir="ltr">
                          {model} · {row.duration_ms}ms
                          {imgCnt > 0 ? ` · ${imgCnt}img (${imgKB}KB)` : ''}
                        </span>
                      </div>
                      <span className="num-mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }} dir="ltr">
                        {formatTimeHe(row.created_at)}
                      </span>
                    </div>
                    {reasonText && (
                      <div style={{ fontSize: 12, color: outcome === 'failed' ? 'var(--danger-text)' : 'var(--warn-text)' }}>
                        סיבה: {reasonText}
                      </div>
                    )}
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
                            requestId: row.request_id,
                            statusCode: row.status_code,
                            platform: row.platform,
                            appVersionCode: row.app_version_code,
                            aiUsage: row.ai_usage,
                            errorCode: row.error_code,
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

          <AdminAiTracesInspector
            historyBucket={aiTraceHistory}
            crashedBucket={aiTraceCrashed}
            onRefresh={() => void loadSnapshot()}
            onNotify={onNotify}
            formatTimeHe={formatTimeHe}
          />
        </div>
      )}

      {viewTab === 'ai' && setupRequired && (
        <AdminAiTracesInspector
          historyBucket={aiTraceHistory}
          crashedBucket={aiTraceCrashed}
          onRefresh={() => void loadSnapshot()}
          onNotify={onNotify}
          formatTimeHe={formatTimeHe}
        />
      )}

      {viewTab === 'audit' && (
        <div className="pro-card" style={{ padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {auditEvents.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', fontSize: 13.5 }}>
              אין אירועי פעילות בטווח והסינון שנבחרו.
            </div>
          ) : (
            auditEvents.map((ev) => {
              const isExpanded = expandedId === `audit-${ev.id}`;
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : `audit-${ev.id}`)
                  }
                  style={{
                    textAlign: 'start',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--line)',
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
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 700,
                          background:
                            ev.status === 'success'
                              ? 'rgba(34, 197, 94, 0.14)'
                              : 'rgba(239, 68, 68, 0.14)',
                          color:
                            ev.status === 'success'
                              ? 'var(--ok-text)'
                              : 'var(--danger-text)',
                        }}
                      >
                        {ev.category}:{ev.action}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        {resolveActorName(ev.actor_id)}
                      </span>
                      {ev.target_trainee_id &&
                        ev.target_trainee_id !== ev.actor_id && (
                          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                            ← {resolveActorName(ev.target_trainee_id)}
                          </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-2)' }}>
                      {ev.platform && <span>{ev.platform}</span>}
                      {ev.app_version_code && <span>vCode {ev.app_version_code}</span>}
                      <span className="num-mono" dir="ltr">
                        {formatTimeHe(ev.created_at)}
                      </span>
                    </div>
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
                        { requestId: ev.request_id, metadata: ev.metadata },
                        null,
                        2
                      )}
                    </pre>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}

      {viewTab === 'api' && (
        <div className="pro-card" style={{ padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apiLogs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', fontSize: 13.5 }}>
              אין רשומות API מתועדות בטווח זה (בקשות heartbeat 200 מסוננות אוטומטית לשמירת נפח).
            </div>
          ) : (
            apiLogs.map((row) => {
              const isExpanded = expandedId === `api-${row.id}`;
              const isErr = row.status_code >= 400;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : `api-${row.id}`)
                  }
                  style={{
                    textAlign: 'start',
                    background: 'var(--surface-2)',
                    border: isErr
                      ? '1px solid rgba(239, 68, 68, 0.38)'
                      : '1px solid var(--line)',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }} dir="ltr">
                      <span
                        className="num-mono"
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 800,
                          background: isErr
                            ? 'rgba(239, 68, 68, 0.16)'
                            : 'rgba(34, 197, 94, 0.14)',
                          color: isErr ? 'var(--danger-text)' : 'var(--ok-text)',
                        }}
                      >
                        {row.status_code}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {row.method} {row.route_pattern}
                        {row.action_name ? ` (${row.action_name})` : ''}
                      </span>
                      <span className="num-mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        {row.duration_ms}ms
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                      <span>{resolveActorName(row.actor_id)}</span>
                      <span className="num-mono" dir="ltr">
                        {formatTimeHe(row.created_at)}
                      </span>
                    </div>
                  </div>
                  {(row.error_code || row.error_message) && (
                    <div style={{ fontSize: 12, color: 'var(--danger-text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={12} />
                      <span>
                        {row.error_code ? `[${row.error_code}] ` : ''}
                        {row.error_message}
                      </span>
                    </div>
                  )}
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
                          requestId: row.request_id,
                          platform: row.platform,
                          appVersionCode: row.app_version_code,
                          aiUsage: row.ai_usage,
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
        </div>
      )}

      {viewTab === 'client' && (
        <div className="pro-card" style={{ padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {clientEvents.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-2)', fontSize: 13.5 }}>
              אין אירועי לקוח מתועדים בטווח זה.
            </div>
          ) : (
            clientEvents.map((row) => (
              <div
                key={row.id}
                style={{
                  background: 'var(--surface-2)',
                  border:
                    row.event_type === 'client_error'
                      ? '1px solid rgba(239, 68, 68, 0.4)'
                      : '1px solid var(--line)',
                  borderRadius: 14,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11.5,
                        fontWeight: 700,
                        background:
                          row.event_type === 'client_error'
                            ? 'rgba(239, 68, 68, 0.16)'
                            : 'var(--card)',
                        color:
                          row.event_type === 'client_error'
                            ? 'var(--danger-text)'
                            : 'var(--text)',
                      }}
                    >
                      {row.event_type}: {row.event_name}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>
                      {resolveActorName(row.user_id)}
                    </span>
                    {row.screen && (
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                        מסך: {row.screen}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-2)' }}>
                    {row.platform && <span>{row.platform}</span>}
                    {row.app_version_code && <span>vCode {row.app_version_code}</span>}
                    <span className="num-mono" dir="ltr">
                      {formatTimeHe(row.created_at)}
                    </span>
                  </div>
                </div>
                {row.details && Object.keys(row.details).length > 0 && (
                  <pre
                    dir="ltr"
                    style={{
                      margin: '4px 0 0',
                      padding: 6,
                      borderRadius: 8,
                      background: 'var(--card)',
                      fontSize: 11.5,
                      overflowX: 'auto',
                      color: 'var(--text-2)',
                    }}
                  >
                    {JSON.stringify(row.details)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!setupRequired && viewTab !== 'rateLimits' && viewTab !== 'diagnostics' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="btn-surface"
            style={{ padding: '6px 14px', fontSize: 12.5, cursor: page === 0 ? 'not-allowed' : 'pointer', opacity: page === 0 ? 0.45 : 1 }}
          >
            העמוד הקודם
          </button>
          <span className="num-mono" style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            עמוד {page + 1}
          </span>
          <button
            type="button"
            disabled={loading || currentListLen < 50}
            onClick={() => setPage((p) => p + 1)}
            className="btn-surface"
            style={{
              padding: '6px 14px',
              fontSize: 12.5,
              cursor: loading || currentListLen < 50 ? 'not-allowed' : 'pointer',
              opacity: currentListLen < 50 ? 0.45 : 1,
            }}
          >
            העמוד הבא
          </button>
        </div>
      )}
    </div>
  );
}
