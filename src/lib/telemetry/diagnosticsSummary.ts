import type { TraineeProfile, UserClientVersionInfo } from '@/types/nutrition';

export interface DiagApiLogRow {
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

export interface DiagClientEventRow {
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

export interface DiagAuditRow {
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

export interface TraineeRuntimeHealthSnapshot {
  userId: string;
  name: string;
  status: string;
  sessionVersion: number;
  lastSeenAt?: string;
  profileSizeKB: number;
  logsDaysCount: number;
  totalMealsCount: number;
  approxPhotosCount: number;
  totalHistoryEvents: number;
  clientVersionInfo?: UserClientVersionInfo | null;
}

export interface DiagnosticFinding {
  severity: 'high' | 'medium' | 'info';
  title: string;
  description: string;
}

export interface DiagnosticTimelineItem {
  id: string;
  createdAt: string;
  source: 'client' | 'server_api' | 'auth_audit';
  severity: 'error' | 'warn' | 'info';
  actorId?: string | null;
  platform?: string | null;
  appVersionCode?: number | null;
  requestId?: string | null;
  durationMs?: number | null;
  title: string;
  subtitle: string;
  details?: Record<string, unknown> | null;
}

export interface UserDiagnosticsPayload {
  actorFilter: string;
  traineeHealth: TraineeRuntimeHealthSnapshot | null;
  disconnects: {
    total: number;
    startupCookieLost: number;
    midUseKicked: number;
    serverRejected: number;
    dbUnavailable: number;
  };
  startup: {
    samples: number;
    avgTotalMs: number;
    maxTotalMs: number;
    avgSessionMs: number;
    avgDataMs: number;
    maxDataKB: number;
  };
  search: {
    samples: number;
    slowCount: number;
    errorOrTimeoutCount: number;
    avgClientMs: number;
    maxClientMs: number;
    avgServerMs: number;
    avgSqlMs: number;
    avgEmbedMs: number;
    avgLiveMs: number;
  };
  autoFindings: DiagnosticFinding[];
  timeline: DiagnosticTimelineItem[];
}

export function measureTraineeHealthSnapshot(
  profile: TraineeProfile,
  clientVersionInfo?: UserClientVersionInfo | null
): TraineeRuntimeHealthSnapshot {
  const serialized = JSON.stringify(profile);
  const profileSizeKB = Math.round(Buffer.byteLength(serialized, 'utf8') / 1024);
  const logs = Object.values(profile.logs || {});
  let totalMealsCount = 0;
  let approxPhotosCount = 0;
  let totalHistoryEvents = 0;

  for (const dayLog of logs) {
    const meals = Object.values(dayLog?.meals || {});
    totalMealsCount += meals.length;
    for (const meal of meals) {
      const directPhotos = Array.isArray(meal?.photoDataUrls)
        ? meal.photoDataUrls.length
        : meal?.photoDataUrl
        ? 1
        : 0;
      const storePhotos = meal?.photoStore
        ? Object.keys(meal.photoStore).length
        : 0;
      approxPhotosCount += Math.max(directPhotos, storePhotos);
      totalHistoryEvents += Array.isArray(meal?.history) ? meal.history.length : 0;
    }
  }

  return {
    userId: profile.id,
    name: profile.name,
    status: profile.status || 'active',
    sessionVersion: Math.max(1, Number(profile.sessionVersion) || 1),
    lastSeenAt: profile.lastSeenAt,
    profileSizeKB,
    logsDaysCount: logs.length,
    totalMealsCount,
    approxPhotosCount,
    totalHistoryEvents,
    clientVersionInfo: clientVersionInfo || null,
  };
}

function asNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avgRounded(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

export function buildUserDiagnosticsSummary(params: {
  actorFilter: string;
  traineeHealth: TraineeRuntimeHealthSnapshot | null;
  apiRows: DiagApiLogRow[];
  clientRows: DiagClientEventRow[];
  auditRows: DiagAuditRow[];
}): UserDiagnosticsPayload {
  const { actorFilter, traineeHealth, apiRows, clientRows, auditRows } = params;

  let startupCookieLost = 0;
  let midUseKicked = 0;
  let serverRejected = 0;
  let dbUnavailable = 0;

  const startupTotals: number[] = [];
  const startupSessions: number[] = [];
  const startupDatas: number[] = [];
  let maxDataKB = 0;

  const searchClientMs: number[] = [];
  const searchServerMs: number[] = [];
  const searchSqlMs: number[] = [];
  const searchEmbedMs: number[] = [];
  const searchLiveMs: number[] = [];
  let searchSlowCount = 0;
  let searchErrorOrTimeoutCount = 0;
  let saveFailureCount = 0;

  const timeline: DiagnosticTimelineItem[] = [];

  for (const ev of clientRows) {
    const d = (ev.details || {}) as Record<string, unknown>;
    const actor =
      ev.user_id ||
      (typeof d.lastKnownUserId === 'string' ? d.lastKnownUserId : null) ||
      (typeof d.priorUserId === 'string' ? d.priorUserId : null);

    if (ev.event_name === 'session_lost_on_startup') {
      startupCookieLost += 1;
      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: 'error',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        title: `ניתוק בעלייה (${String(d.diagCode || 'COOKIE_MISSING')})`,
        subtitle: `עברו ${d.priorAgeMin ?? '?'} דק׳ מהחיבור הקודם · status=${d.sessionStatus ?? '?'} · רשת ${d.netType || d.online || '?'}`,
        details: d,
      });
    } else if (ev.event_name === 'session_kicked_mid_use') {
      midUseKicked += 1;
      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: 'error',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        title: `נזרק מהאפליקציה (${String(d.source || 'unknown')})`,
        subtitle: `${String(d.code || '')} · ${String(d.message || '')}`,
        details: d,
      });
    } else if (ev.event_name === 'app_startup_profile') {
      const totalMs = asNum(d.totalReadyMs);
      const sessMs = asNum(d.sessionMs);
      const dataMs = asNum(d.dataMs);
      const dataKB = asNum(d.dataPayloadKB);
      if (totalMs > 0) startupTotals.push(totalMs);
      if (sessMs > 0) startupSessions.push(sessMs);
      if (dataMs > 0) startupDatas.push(dataMs);
      if (dataKB > maxDataKB) maxDataKB = dataKB;

      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: totalMs >= 3500 || ev.event_type === 'client_error' ? 'warn' : 'info',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        durationMs: totalMs,
        title: `עליית אפליקציה (${totalMs}ms)`,
        subtitle: `session=${sessMs}ms · data=${dataMs}ms (${dataKB} KB) · hb=${asNum(d.hbMs)}ms · רשת=${String(d.netType || '?')}`,
        details: d,
      });
    } else if (ev.event_name === 'api_data_profile') {
      const dur = asNum(d.durationMs);
      const kb = asNum(d.payloadKB);
      if (dur > 0) startupDatas.push(dur);
      if (kb > maxDataKB) maxDataKB = kb;
      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: dur >= 2500 || kb >= 400 ? 'warn' : 'info',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        durationMs: dur,
        title: `סנכרון נתונים איטי/כבד (${dur}ms · ${kb} KB)`,
        subtitle: `רשת=${String(d.netType || '?')} · forced=${String(Boolean(d.forced))}`,
        details: d,
      });
    } else if (ev.event_name === 'food_search_trace') {
      const cMs = asNum(d.clientMs);
      const sMs = asNum(d.serverMs);
      const isErr = ev.event_type === 'client_error' || Boolean(d.timedOut);
      if (cMs > 0) searchClientMs.push(cMs);
      if (sMs > 0) searchServerMs.push(sMs);
      if (cMs >= 1200) searchSlowCount += 1;
      if (isErr) searchErrorOrTimeoutCount += 1;
      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: isErr ? 'error' : 'warn',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        durationMs: cMs,
        title: isErr
          ? `כשל/טיימאוט בחיפוש (${String(d.mode || 'db')})`
          : `חיפוש איטי (${String(d.mode || 'db')} · ${cMs}ms)`,
        subtitle: `client=${cMs}ms · server=${sMs || '?'}ms · status=${String(d.status ?? '?')} · timedOut=${String(Boolean(d.timedOut))}`,
        details: d,
      });
    } else if (
      ev.event_name === 'trainee_save_failed' ||
      ev.event_name === 'saved_meal_upsert_failed'
    ) {
      saveFailureCount += 1;
      const opLabel = String(d.operationLabel || d.operation || 'שמירה');
      const statusLabel = d.httpStatus !== undefined ? `HTTP ${String(d.httpStatus)}` : 'network';
      const kbLabel = d.payloadKB !== undefined ? `${String(d.payloadKB)} KB` : '';
      const slotPart = d.mealSlotName || d.mealSlotId ? `ארוחה: ${String(d.mealSlotName || d.mealSlotId)}` : '';
      const datePart = d.date ? `תאריך: ${String(d.date)}` : '';
      const itemsPart = d.itemsCount !== undefined ? `${String(d.itemsCount)} פריטים` : '';
      const subParts = [
        statusLabel,
        kbLabel,
        datePart,
        slotPart,
        itemsPart,
        d.itemNamesPreview ? `(${String(d.itemNamesPreview)})` : '',
        d.message ? String(d.message) : '',
      ].filter(Boolean);
      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: 'error',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        durationMs: asNum(d.durationMs) || undefined,
        title:
          ev.event_name === 'saved_meal_upsert_failed'
            ? `כשל בשמירה לספריית ארוחות (${opLabel})`
            : `כשל בשמירת נתונים (${opLabel})`,
        subtitle: subParts.join(' · '),
        details: d,
      });
    } else if (ev.event_type === 'client_error') {
      timeline.push({
        id: `cli-${ev.id}`,
        createdAt: ev.created_at,
        source: 'client',
        severity: 'error',
        actorId: actor,
        platform: ev.platform,
        appVersionCode: ev.app_version_code,
        title: `שגיאת לקוח: ${ev.event_name}`,
        subtitle: String(d.message || ev.screen || ''),
        details: d,
      });
    }
  }

  for (const row of apiRows) {
    const diag = ((row.ai_usage as { diag?: Record<string, unknown> } | null)?.diag || {}) as Record<string, unknown>;
    const isAuthRoute = row.route_pattern.startsWith('/api/auth/');
    const isDataRoute = row.route_pattern === '/api/data';
    const isSearchRoute = row.route_pattern === '/api/food/search';

    if (row.error_code === 'AUTH_DB_UNAVAILABLE' || row.status_code === 503) {
      dbUnavailable += 1;
    } else if ((row.status_code === 401 || row.status_code === 403 || row.action_name === 'session_rejected') && (isAuthRoute || isDataRoute || isSearchRoute)) {
      serverRejected += 1;
    }

    if (isDataRoute && row.method === 'GET' && row.status_code === 200) {
      const kb = asNum(diag.payloadKB);
      if (kb > maxDataKB) maxDataKB = kb;
      startupDatas.push(asNum(row.duration_ms));
    }

    if (isSearchRoute) {
      if (asNum(diag.sqlMs) > 0) searchSqlMs.push(asNum(diag.sqlMs));
      if (asNum(diag.embedMs) > 0) searchEmbedMs.push(asNum(diag.embedMs));
      if (asNum(diag.liveMs) > 0) searchLiveMs.push(asNum(diag.liveMs));
      if (row.status_code >= 400) searchErrorOrTimeoutCount += 1;
    }

    if (
      row.status_code >= 400 ||
      row.action_name === 'session_rejected' ||
      row.duration_ms >= 900 ||
      isDataRoute ||
      isSearchRoute
    ) {
      const severity: 'error' | 'warn' | 'info' =
        row.status_code >= 400 || row.action_name === 'session_rejected'
          ? 'error'
          : row.duration_ms >= 1500
          ? 'warn'
          : 'info';
      const detailParts: string[] = [];
      if (diag.payloadKB) detailParts.push(`payload=${diag.payloadKB}KB`);
      if (diag.authMs !== undefined) detailParts.push(`auth=${diag.authMs}ms`);
      if (diag.profileMs !== undefined) detailParts.push(`profile=${diag.profileMs}ms`);
      if (diag.sqlMs !== undefined) detailParts.push(`sql=${diag.sqlMs}ms`);
      if (diag.embedMs) detailParts.push(`embed=${diag.embedMs}ms`);
      if (diag.liveMs) detailParts.push(`live=${diag.liveMs}ms`);
      if (row.error_code) detailParts.push(`err=${row.error_code}`);

      timeline.push({
        id: `api-${row.id}`,
        createdAt: row.created_at,
        source: 'server_api',
        severity,
        actorId: row.actor_id,
        platform: row.platform,
        appVersionCode: row.app_version_code,
        requestId: row.request_id,
        durationMs: row.duration_ms,
        title: `${row.method} ${row.route_pattern} -> ${row.status_code} (${row.duration_ms}ms)`,
        subtitle: detailParts.join(' · ') || row.error_message || row.action_name || '',
        details: {
          actionName: row.action_name,
          errorCode: row.error_code,
          errorMessage: row.error_message,
          diag,
        },
      });
    }
  }

  for (const au of auditRows) {
    if (au.category !== 'auth' && au.status === 'success') continue;
    timeline.push({
      id: `aud-${au.id}`,
      createdAt: au.created_at,
      source: 'auth_audit',
      severity: au.status === 'success' ? 'info' : 'error',
      actorId: au.actor_id,
      platform: au.platform,
      appVersionCode: au.app_version_code,
      requestId: au.request_id,
      title: `Audit [${au.category}]: ${au.action} (${au.status})`,
      subtitle: JSON.stringify(au.metadata || {}).slice(0, 140),
      details: au.metadata,
    });
  }

  timeline.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const autoFindings: DiagnosticFinding[] = [];
  if (traineeHealth && traineeHealth.profileSizeKB >= 350) {
    autoFindings.push({
      severity: traineeHealth.profileSizeKB >= 900 ? 'high' : 'medium',
      title: `פרופיל נתונים כבד (${traineeHealth.profileSizeKB} KB · ${traineeHealth.approxPhotosCount} תמונות)`,
      description:
        'בכל כניסה ורענון (/api/data) יורדים כל הימים והתמונות של המתאמנת. משקל גבוה מאט את עליית האפליקציה בסלולר ועלול לגרום ל-Timeout.',
    });
  }
  if (startupCookieLost > 0) {
    autoFindings.push({
      severity: 'high',
      title: `עוגיית ההתחברות נעלמה בין כניסות (${startupCookieLost} פעמים)`,
      description:
        'המכשיר זכר שהייתה התחברות קודמת אך ב-GET /api/auth/session לא הגיעה עוגייה תקינה (נפוץ כשאנדרואיד הורג WebView לפני שמירת עוגייה או שמנקה Cache).',
    });
  }
  if (midUseKicked > 0 || serverRejected > 0) {
    autoFindings.push({
      severity: 'high',
      title: `ניתוקים אקטיביים או דחיות שרת (${midUseKicked} בלקוח · ${serverRejected} בשרת)`,
      description:
        'המשתמש נזרק במהלך שימוש — בדוק בציר הזמן אם הסיבה היא SESSION_REVOKED, ACCOUNT_BLOCKED, או תוקף עוגייה.',
    });
  }
  if (dbUnavailable > 0) {
    autoFindings.push({
      severity: 'medium',
      title: `תקלות חיבור זמניות ל-Supabase (${dbUnavailable})`,
      description:
        'נרשמו נפילות רגעיות מול מסד הנתונים (כעת האפליקציה לא תמחק על כך את עוגיית ההתחברות ותחזיר 503 זמני).',
    });
  }
  if (searchErrorOrTimeoutCount > 0 || searchSlowCount > 0) {
    autoFindings.push({
      severity: searchErrorOrTimeoutCount > 0 ? 'high' : 'medium',
      title: `עיכובים / שגיאות בחיפוש מזון (${searchSlowCount} איטיים · ${searchErrorOrTimeoutCount} שגיאות/טיימאוט)`,
      description: `ממוצע לקוח ${avgRounded(searchClientMs)}ms · SQL ${avgRounded(searchSqlMs)}ms · Live ${avgRounded(searchLiveMs)}ms.`,
    });
  }
  if (saveFailureCount > 0) {
    autoFindings.push({
      severity: 'high',
      title: `כשלים בשמירת נתונים / ארוחות מהמכשיר (${saveFailureCount})`,
      description:
        'בדוק בציר הזמן את סטטוס ה-HTTP (למשל 413 חריגת גודל / timeout / חוסר רשת), נפח הבקשה והפריטים שהמשתמש ניסה לשמור.',
    });
  }
  if (autoFindings.length === 0) {
    autoFindings.push({
      severity: 'info',
      title: 'ממתין לאירועי אבחון מהמכשיר',
      description:
        actorFilter
          ? 'בקש מהמשתמשת לסגור ולפתוח מחדש את האפליקציה ולבצע חיפוש אחד — הנתונים יופיעו כאן אוטומטית.'
          : 'בחר מתאמן ספציפי למעלה והפעל "רענון חי" כדי לעקוב אחרי כל פתיחה, סנכרון וחיפוש בזמן אמת.',
    });
  }

  return {
    actorFilter,
    traineeHealth,
    disconnects: {
      total: startupCookieLost + midUseKicked + serverRejected,
      startupCookieLost,
      midUseKicked,
      serverRejected,
      dbUnavailable,
    },
    startup: {
      samples: startupTotals.length || startupDatas.length,
      avgTotalMs: avgRounded(startupTotals),
      maxTotalMs: startupTotals.length > 0 ? Math.max(...startupTotals) : 0,
      avgSessionMs: avgRounded(startupSessions),
      avgDataMs: avgRounded(startupDatas),
      maxDataKB,
    },
    search: {
      samples: Math.max(searchClientMs.length, searchSqlMs.length),
      slowCount: searchSlowCount,
      errorOrTimeoutCount: searchErrorOrTimeoutCount,
      avgClientMs: avgRounded(searchClientMs),
      maxClientMs: searchClientMs.length > 0 ? Math.max(...searchClientMs) : 0,
      avgServerMs: avgRounded(searchServerMs),
      avgSqlMs: avgRounded(searchSqlMs),
      avgEmbedMs: avgRounded(searchEmbedMs),
      avgLiveMs: avgRounded(searchLiveMs),
    },
    autoFindings,
    timeline: timeline.slice(0, 90),
  };
}
