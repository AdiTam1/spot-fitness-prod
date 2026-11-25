import { randomUUID } from 'crypto';
import {
  AccountStatus,
  AppReleasePolicy,
  AppUpdatePushAudience,
  AppUpdatePushHistoryEntry,
  CoachPushSubscriptionSettings,
  TraineeFcmTokenEntry,
  TraineeProfile,
  TraineePushHistoryEntry,
  TraineeWebPushSubscriptionEntry,
  UserClientVersionInfo,
  UserRole,
} from '@/types/nutrition';
import {
  getServerWebBuildId,
  resolveAppVersionInfo,
} from '@/lib/appVersionServer';

type ResolvedAppVersionInfo = Awaited<ReturnType<typeof resolveAppVersionInfo>>;
import { dispatchPushToTargets } from '@/lib/pushDispatcher';
import {
  appendAppUpdatePushHistoryOnServer,
  getServerDbState,
  ServerDatabaseState,
  updateServerDbState,
} from '@/lib/serverStore';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type UserVersionStatus =
  | 'up_to_date'
  | 'update_available'
  | 'blocked'
  | 'unknown';

export interface AdminUserVersionRow {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
  accountStatus: AccountStatus;
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

export interface AdminUserVersionsSummary {
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

export interface AdminUserVersionsReport {
  serverWebBuildId: string;
  versionInfo: ResolvedAppVersionInfo;
  summary: AdminUserVersionsSummary;
  users: AdminUserVersionRow[];
  pushHistory: AppUpdatePushHistoryEntry[];
}

interface TelemetryFallbackEntry {
  platform: string;
  appVersionCode: number | null;
  createdAt: string;
}

function isMissingSchemaError(message?: string): boolean {
  if (!message) return false;
  return /does not exist|could not find|schema cache|42P01|PGRST205|PGRST202/i.test(
    message
  );
}

function pickLaterIso(...candidates: Array<string | null | undefined>): string | null {
  let bestIso: string | null = null;
  let bestMs = 0;
  for (const raw of candidates) {
    if (!raw) continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestIso = raw;
    } else if (!bestIso) {
      bestIso = raw;
    }
  }
  return bestIso;
}

export function computeUserVersionStatus(params: {
  platform: string;
  appVersionCode: number | null;
  webBuildId: string | null;
  latestAndroidCode: number;
  blockedUpToCode: number;
  serverWebBuildId: string;
}): UserVersionStatus {
  const {
    platform,
    appVersionCode,
    webBuildId,
    latestAndroidCode,
    blockedUpToCode,
    serverWebBuildId,
  } = params;

  const isAndroid =
    platform === 'android-apk' ||
    (appVersionCode !== null && appVersionCode > 0);

  if (isAndroid) {
    if (appVersionCode === null || appVersionCode <= 0) {
      return 'unknown';
    }
    if (blockedUpToCode > 0 && appVersionCode <= blockedUpToCode) {
      return 'blocked';
    }
    if (latestAndroidCode > 0 && appVersionCode < latestAndroidCode) {
      return 'update_available';
    }
    return 'up_to_date';
  }

  if (platform && platform !== 'unknown') {
    if (webBuildId && serverWebBuildId && webBuildId !== serverWebBuildId) {
      return 'update_available';
    }
    return 'up_to_date';
  }

  return 'unknown';
}

async function loadTelemetryFallbackMap(): Promise<
  Map<string, TelemetryFallbackEntry>
> {
  const result = new Map<string, TelemetryFallbackEntry>();
  if (!isSupabaseConfigured || !supabase) return result;

  try {
    const { data, error } = await supabase
      .from('telemetry_api_logs')
      .select('actor_id, platform, app_version_code, created_at')
      .not('actor_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error || !Array.isArray(data)) {
      if (error && !isMissingSchemaError(error.message)) {
        // שקט: fallback בלבד
      }
      return result;
    }

    for (const row of data as Array<{
      actor_id?: string | null;
      platform?: string | null;
      app_version_code?: number | null;
      created_at?: string | null;
    }>) {
      const actorId = String(row.actor_id || '').trim();
      if (!actorId) continue;

      const code =
        typeof row.app_version_code === 'number' &&
        Number.isFinite(row.app_version_code) &&
        row.app_version_code > 0
          ? Math.round(row.app_version_code)
          : null;
      const platform =
        row.platform && row.platform !== 'unknown'
          ? String(row.platform)
          : code
          ? 'android-apk'
          : 'unknown';

      const prev = result.get(actorId);
      if (!prev) {
        result.set(actorId, {
          platform,
          appVersionCode: code,
          createdAt: String(row.created_at || ''),
        });
      } else if (
        prev.platform === 'unknown' &&
        (platform !== 'unknown' || code !== null)
      ) {
        result.set(actorId, {
          platform,
          appVersionCode: code ?? prev.appVersionCode,
          createdAt: String(row.created_at || prev.createdAt),
        });
      }
    }
  } catch {
    // שקט: ממשיך גם אם טבלת הטלמטריה לא קיימת
  }

  return result;
}

function buildRowForUser(params: {
  userId: string;
  role: UserRole;
  name: string;
  email: string;
  accountStatus: AccountStatus;
  lastSeenAt?: string;
  androidTokenCount: number;
  webSubCount: number;
  heartbeatInfo?: UserClientVersionInfo;
  telemetryInfo?: TelemetryFallbackEntry;
  latestAndroidCode: number;
  blockedUpToCode: number;
  serverWebBuildId: string;
}): AdminUserVersionRow {
  const { heartbeatInfo, telemetryInfo } = params;
  const hbMs = heartbeatInfo?.updatedAt ? Date.parse(heartbeatInfo.updatedAt) : 0;
  const telMs = telemetryInfo?.createdAt ? Date.parse(telemetryInfo.createdAt) : 0;

  let platform = 'unknown';
  let appVersionCode: number | null = null;
  let appVersionName: string | null = null;
  let webBuildId: string | null = null;
  let versionUpdatedAt: string | null = null;
  let source: AdminUserVersionRow['source'] = 'none';

  const hbHasUsefulData = Boolean(
    heartbeatInfo &&
      (heartbeatInfo.platform !== 'unknown' ||
        heartbeatInfo.appVersionCode ||
        heartbeatInfo.webBuildId)
  );
  const telHasUsefulData = Boolean(
    telemetryInfo &&
      (telemetryInfo.platform !== 'unknown' || telemetryInfo.appVersionCode)
  );

  if (hbHasUsefulData && (!telHasUsefulData || hbMs >= telMs - 60_000)) {
    platform = heartbeatInfo!.platform || 'unknown';
    appVersionCode = heartbeatInfo!.appVersionCode ?? null;
    appVersionName = heartbeatInfo!.appVersionName ?? null;
    webBuildId = heartbeatInfo!.webBuildId ?? null;
    versionUpdatedAt = heartbeatInfo!.updatedAt || null;
    source = 'heartbeat';
  } else if (telHasUsefulData) {
    platform = telemetryInfo!.platform || 'unknown';
    appVersionCode = telemetryInfo!.appVersionCode ?? null;
    appVersionName =
      heartbeatInfo &&
      heartbeatInfo.appVersionCode === telemetryInfo!.appVersionCode
        ? heartbeatInfo.appVersionName ?? null
        : null;
    webBuildId = heartbeatInfo?.webBuildId ?? null;
    versionUpdatedAt = telemetryInfo!.createdAt || null;
    source = 'telemetry';
  }

  const versionStatus = computeUserVersionStatus({
    platform,
    appVersionCode,
    webBuildId,
    latestAndroidCode: params.latestAndroidCode,
    blockedUpToCode: params.blockedUpToCode,
    serverWebBuildId: params.serverWebBuildId,
  });

  const lastSeenAt = pickLaterIso(
    params.lastSeenAt,
    heartbeatInfo?.updatedAt,
    telemetryInfo?.createdAt
  );

  return {
    userId: params.userId,
    role: params.role,
    name: params.name,
    email: params.email,
    accountStatus: params.accountStatus,
    platform,
    appVersionCode,
    appVersionName,
    webBuildId,
    versionStatus,
    lastSeenAt,
    versionUpdatedAt,
    androidTokenCount: params.androidTokenCount,
    webSubCount: params.webSubCount,
    hasAnyPushTarget: params.androidTokenCount + params.webSubCount > 0,
    source,
  };
}

export async function buildAdminUserVersionsReport(params: {
  originUrl: string;
  state?: ServerDatabaseState;
  versionInfo?: ResolvedAppVersionInfo;
}): Promise<AdminUserVersionsReport> {
  const [state, versionInfo, telemetryMap] = await Promise.all([
    params.state ? Promise.resolve(params.state) : getServerDbState(),
    params.versionInfo
      ? Promise.resolve(params.versionInfo)
      : resolveAppVersionInfo(params.originUrl, { includeGitHubRelease: false }),
    loadTelemetryFallbackMap(),
  ]);

  const serverWebBuildId = getServerWebBuildId();
  const latestAndroidCode = Math.max(0, versionInfo.latestVersionCode || 0);
  const blockedUpToCode = Math.max(
    0,
    versionInfo.androidBlockedUpToVersionCode || 0
  );
  const clientMap = state.userClientVersions || {};
  const coachPushMap = state.coachPushSettings || {};

  const rows: AdminUserVersionRow[] = [];

  for (const trainee of state.trainees) {
    const hb = clientMap[`trainee:${trainee.id}`];
    rows.push(
      buildRowForUser({
        userId: trainee.id,
        role: 'trainee',
        name: trainee.name,
        email: trainee.email,
        accountStatus: trainee.status || 'active',
        lastSeenAt: trainee.lastSeenAt,
        androidTokenCount: trainee.fcmTokens?.length || 0,
        webSubCount: trainee.webPushSubscriptions?.length || 0,
        heartbeatInfo: hb,
        telemetryInfo: telemetryMap.get(trainee.id),
        latestAndroidCode,
        blockedUpToCode,
        serverWebBuildId,
      })
    );
  }

  let hasAdminEntry = false;
  for (const coach of state.coaches) {
    const role: UserRole = coach.id === 'coach-admin' ? 'admin' : 'coach';
    if (role === 'admin') hasAdminEntry = true;
    const pushCfg = coachPushMap[coach.id];
    const hb = clientMap[`${role}:${coach.id}`] || clientMap[`coach:${coach.id}`];
    rows.push(
      buildRowForUser({
        userId: coach.id,
        role,
        name: coach.name,
        email: coach.email,
        accountStatus: coach.status || 'active',
        lastSeenAt: coach.lastSeenAt,
        androidTokenCount: pushCfg?.fcmTokens?.length || 0,
        webSubCount: pushCfg?.webPushSubscriptions?.length || 0,
        heartbeatInfo: hb,
        telemetryInfo: telemetryMap.get(coach.id),
        latestAndroidCode,
        blockedUpToCode,
        serverWebBuildId,
      })
    );
  }

  if (!hasAdminEntry) {
    const pushCfg = coachPushMap['coach-admin'];
    const hb = clientMap['admin:coach-admin'] || clientMap['coach:coach-admin'];
    rows.push(
      buildRowForUser({
        userId: 'coach-admin',
        role: 'admin',
        name: 'מנהל ראשי',
        email: state.coachEmail,
        accountStatus: 'active',
        androidTokenCount: pushCfg?.fcmTokens?.length || 0,
        webSubCount: pushCfg?.webPushSubscriptions?.length || 0,
        heartbeatInfo: hb,
        telemetryInfo: telemetryMap.get('coach-admin'),
        latestAndroidCode,
        blockedUpToCode,
        serverWebBuildId,
      })
    );
  }

  const statusOrder: Record<UserVersionStatus, number> = {
    blocked: 0,
    update_available: 1,
    up_to_date: 2,
    unknown: 3,
  };

  rows.sort((a, b) => {
    const diff = statusOrder[a.versionStatus] - statusOrder[b.versionStatus];
    if (diff !== 0) return diff;
    const aMs = a.lastSeenAt ? Date.parse(a.lastSeenAt) : 0;
    const bMs = b.lastSeenAt ? Date.parse(b.lastSeenAt) : 0;
    if (aMs !== bMs) return bMs - aMs;
    return a.name.localeCompare(b.name, 'he');
  });

  let reportedUsers = 0;
  let upToDateCount = 0;
  let outdatedCount = 0;
  let blockedCount = 0;
  let unknownCount = 0;
  let androidUsersCount = 0;
  let webUsersCount = 0;
  let pushReachableCount = 0;
  let pushReachableOutdatedCount = 0;

  for (const r of rows) {
    if (r.versionStatus !== 'unknown') reportedUsers += 1;
    if (r.versionStatus === 'up_to_date') upToDateCount += 1;
    else if (r.versionStatus === 'update_available') outdatedCount += 1;
    else if (r.versionStatus === 'blocked') blockedCount += 1;
    else unknownCount += 1;

    if (r.platform === 'android-apk') androidUsersCount += 1;
    else if (r.platform !== 'unknown') webUsersCount += 1;

    if (r.hasAnyPushTarget) {
      pushReachableCount += 1;
      if (r.versionStatus === 'update_available' || r.versionStatus === 'blocked') {
        pushReachableOutdatedCount += 1;
      }
    }
  }

  return {
    serverWebBuildId,
    versionInfo,
    summary: {
      totalUsers: rows.length,
      reportedUsers,
      upToDateCount,
      outdatedCount,
      blockedCount,
      unknownCount,
      androidUsersCount,
      webUsersCount,
      pushReachableCount,
      pushReachableOutdatedCount,
    },
    users: rows,
    pushHistory: Array.isArray(state.appUpdatePushHistory)
      ? state.appUpdatePushHistory
      : [],
  };
}

export async function broadcastAppUpdatePush(params: {
  origin: string;
  originUrl: string;
  adminName: string;
  title?: string;
  body?: string;
  audience: AppUpdatePushAudience;
  targetUserId?: string;
  policyOverride?: AppReleasePolicy;
}): Promise<{
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
  historyEntry?: AppUpdatePushHistoryEntry;
  pushHistory: AppUpdatePushHistoryEntry[];
}> {
  const [state, resolvedInfo] = await Promise.all([
    getServerDbState(),
    resolveAppVersionInfo(params.originUrl, { includeGitHubRelease: false }),
  ]);

  const effectiveVersionInfo: ResolvedAppVersionInfo = params.policyOverride
    ? {
        ...resolvedInfo,
        androidBlockedUpToVersionCode:
          params.policyOverride.androidBlockedUpToVersionCode ??
          resolvedInfo.androidBlockedUpToVersionCode,
        latestVersionCode:
          params.policyOverride.androidLatestVersionCode ??
          resolvedInfo.latestVersionCode,
        latestVersionName:
          params.policyOverride.androidLatestVersionName ??
          resolvedInfo.latestVersionName,
        releaseNotes:
          params.policyOverride.androidReleaseNotes ?? resolvedInfo.releaseNotes,
      }
    : resolvedInfo;

  const report = await buildAdminUserVersionsReport({
    originUrl: params.originUrl,
    state,
    versionInfo: effectiveVersionInfo,
  });

  const latestAndroidCode = Math.max(
    0,
    effectiveVersionInfo.latestVersionCode || 0
  );
  const latestVersionLabel = effectiveVersionInfo.latestVersionName
    ? `v${effectiveVersionInfo.latestVersionName}`
    : latestAndroidCode > 0
    ? `גרסה ${latestAndroidCode}`
    : 'גרסה חדשה';

  const title =
    (params.title || '').trim() || `עדכון חדש זמין באפליקציית SPOT (${latestVersionLabel})`;
  const body =
    (params.body || '').trim() ||
    (effectiveVersionInfo.releaseNotes
      ? `${effectiveVersionInfo.releaseNotes} • לחץ כאן לעדכון`
      : 'יצאה גרסה חדשה עם שיפורים ותיקונים. לחץ כאן כדי לעדכן עכשיו.');

  const audience = params.audience;

  const matchingRows = report.users.filter((row) => {
    if (audience === 'single-user') {
      return row.userId === params.targetUserId;
    }
    if (audience === 'trainees') {
      return row.role === 'trainee' && row.accountStatus !== 'paused';
    }
    if (audience === 'coaches') {
      return row.role === 'coach' || row.role === 'admin';
    }
    if (audience === 'android-outdated') {
      if (row.androidTokenCount <= 0) return false;
      if (row.versionStatus === 'blocked' || row.versionStatus === 'update_available') {
        return true;
      }
      if (latestAndroidCode > 0 && (!row.appVersionCode || row.appVersionCode < latestAndroidCode)) {
        return true;
      }
      return false;
    }
    if (audience === 'web-outdated') {
      if (row.webSubCount <= 0 || row.platform === 'android-apk') return false;
      return row.versionStatus !== 'up_to_date';
    }
    // 'all'
    return row.accountStatus !== 'paused';
  });

  const pushTargets = matchingRows.filter((row) => row.hasAnyPushTarget);
  const skippedNoDevice = matchingRows.length - pushTargets.length;

  if (pushTargets.length === 0) {
    return {
      ok: false,
      error:
        audience === 'single-user'
          ? 'למשתמש זה אין מכשיר שרשום לקבלת התראות פוש.'
          : 'לא נמצאו משתמשים עם התראות פוש פעילות התואמים לקהל היעד שנבחר.',
      targetedUsers: matchingRows.length,
      sentUsers: 0,
      sentDevices: 0,
      androidSentCount: 0,
      webSentCount: 0,
      failedDevices: 0,
      skippedNoDevice,
      pushHistory: report.pushHistory,
    };
  }

  const traineeById = new Map<string, TraineeProfile>();
  for (const t of state.trainees) {
    traineeById.set(t.id, t);
  }
  const coachPushMap = state.coachPushSettings || {};

  const nowIso = new Date().toISOString();
  const basePushId = `app-upd-${randomUUID()}`;

  const deadFcmGlobal = new Set<string>();
  const deadWebGlobal = new Set<string>();
  const deliveredTraineeIds = new Set<string>();

  let sentUsers = 0;
  let sentDevices = 0;
  let androidSentCount = 0;
  let webSentCount = 0;
  let failedDevices = 0;
  let configError: string | undefined;

  const CHUNK_SIZE = 10;
  for (let i = 0; i < pushTargets.length; i += CHUNK_SIZE) {
    const chunk = pushTargets.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (row) => {
        let fcmTokens: TraineeFcmTokenEntry[] | undefined;
        let webPushSubscriptions: TraineeWebPushSubscriptionEntry[] | undefined;

        if (row.role === 'trainee') {
          const t = traineeById.get(row.userId);
          fcmTokens = t?.fcmTokens;
          webPushSubscriptions = t?.webPushSubscriptions;
        } else {
          const cfg = coachPushMap[row.userId];
          fcmTokens = cfg?.fcmTokens;
          webPushSubscriptions = cfg?.webPushSubscriptions;
        }

        // במצב android-outdated נשלח ישירות למכשירי האנדרואיד בלבד כדי לא להציף web של אותו מתאמן שכבר עבר לאנדרואיד
        const targetFcm = fcmTokens;
        const targetWeb =
          audience === 'android-outdated' ? undefined : webPushSubscriptions;

        const attemptedDevices =
          (targetFcm?.length || 0) + (targetWeb?.length || 0);
        if (attemptedDevices === 0) {
          return { row, res: null, attemptedDevices: 0 };
        }

        const res = await dispatchPushToTargets({
          fcmTokens: targetFcm,
          webPushSubscriptions: targetWeb,
          message: {
            pushId: `${basePushId}-${row.userId}`,
            title,
            body,
            kind: 'app-update',
            screen: 'app-update',
            origin: params.origin,
          },
        });
        return { row, res, attemptedDevices };
      })
    );

    for (const item of results) {
      if (!item.res) continue;
      if (item.res.configError && !configError) {
        configError = item.res.configError;
      }
      if (item.res.sentCount > 0) {
        sentUsers += 1;
        sentDevices += item.res.sentCount;
        androidSentCount += item.res.androidSentCount;
        webSentCount += item.res.webSentCount;
        if (item.row.role === 'trainee') {
          deliveredTraineeIds.add(item.row.userId);
        }
      }
      const failedForUser = Math.max(0, item.res.errors.length);
      failedDevices += failedForUser;

      for (const tok of item.res.invalidFcmTokens) deadFcmGlobal.add(tok);
      for (const ep of item.res.expiredWebEndpoints) deadWebGlobal.add(ep);
    }
  }

  // ניקוי טוקנים מתים + תיעוד בהיסטוריית הפוש של המתאמנים בצעד אצווה אחד
  if (
    deadFcmGlobal.size > 0 ||
    deadWebGlobal.size > 0 ||
    deliveredTraineeIds.size > 0
  ) {
    await updateServerDbState((prev) => {
      const nextTrainees = prev.trainees.map((t) => {
        const hasDeadFcm = (t.fcmTokens || []).some((x) =>
          deadFcmGlobal.has(x.token)
        );
        const hasDeadWeb = (t.webPushSubscriptions || []).some((s) =>
          deadWebGlobal.has(s.endpoint)
        );
        const didDeliver = deliveredTraineeIds.has(t.id);
        if (!hasDeadFcm && !hasDeadWeb && !didDeliver) {
          return t;
        }

        let nextHistory = t.pushHistory;
        if (didDeliver) {
          const histEntry: TraineePushHistoryEntry = {
            id: basePushId,
            title,
            body,
            sentAt: nowIso,
            sentByCoachName: params.adminName || 'מנהל מערכת',
            targetScreen: 'app-update',
          };
          nextHistory = [
            histEntry,
            ...(Array.isArray(t.pushHistory) ? t.pushHistory : []),
          ].slice(0, 30);
        }

        return {
          ...t,
          ...(hasDeadFcm
            ? {
                fcmTokens: (t.fcmTokens || []).filter(
                  (x) => !deadFcmGlobal.has(x.token)
                ),
              }
            : {}),
          ...(hasDeadWeb
            ? {
                webPushSubscriptions: (t.webPushSubscriptions || []).filter(
                  (s) => !deadWebGlobal.has(s.endpoint)
                ),
              }
            : {}),
          ...(didDeliver ? { pushHistory: nextHistory } : {}),
        };
      });

      let nextCoachPushSettings = prev.coachPushSettings;
      if (
        prev.coachPushSettings &&
        (deadFcmGlobal.size > 0 || deadWebGlobal.size > 0)
      ) {
        const updatedMap: Record<string, CoachPushSubscriptionSettings> = {};
        let touchedCoachSettings = false;
        for (const [cid, cfg] of Object.entries(prev.coachPushSettings)) {
          const hasDeadFcm = (cfg.fcmTokens || []).some((x) =>
            deadFcmGlobal.has(x.token)
          );
          const hasDeadWeb = (cfg.webPushSubscriptions || []).some((s) =>
            deadWebGlobal.has(s.endpoint)
          );
          if (!hasDeadFcm && !hasDeadWeb) {
            updatedMap[cid] = cfg;
          } else {
            touchedCoachSettings = true;
            updatedMap[cid] = {
              ...cfg,
              fcmTokens: (cfg.fcmTokens || []).filter(
                (x) => !deadFcmGlobal.has(x.token)
              ),
              webPushSubscriptions: (cfg.webPushSubscriptions || []).filter(
                (s) => !deadWebGlobal.has(s.endpoint)
              ),
            };
          }
        }
        if (touchedCoachSettings) {
          nextCoachPushSettings = updatedMap;
        }
      }

      return {
        ...prev,
        trainees: nextTrainees,
        ...(nextCoachPushSettings !== prev.coachPushSettings
          ? { coachPushSettings: nextCoachPushSettings }
          : {}),
      };
    });
  }

  const historyEntry: AppUpdatePushHistoryEntry = {
    id: basePushId,
    title,
    body,
    audience,
    ...(params.targetUserId ? { targetUserId: params.targetUserId } : {}),
    targetVersionName: effectiveVersionInfo.latestVersionName,
    targetVersionCode: effectiveVersionInfo.latestVersionCode,
    sentUsers,
    sentDevices,
    failedDevices,
    sentByName: params.adminName || 'מנהל מערכת',
    sentAt: nowIso,
  };

  const pushHistory = await appendAppUpdatePushHistoryOnServer(historyEntry);

  const pushOk =
    sentDevices > 0 || (!configError && failedDevices === 0 && pushTargets.length > 0);
  return {
    ok: pushOk,
    ...(sentDevices === 0 && (configError || failedDevices > 0)
      ? {
          error:
            configError ||
            'שליחת ההתראה נכשלה בכל המכשירים (בדוק הגדרות Firebase / Web Push בשרת).',
        }
      : {}),
    targetedUsers: matchingRows.length,
    sentUsers,
    sentDevices,
    androidSentCount,
    webSentCount,
    failedDevices,
    skippedNoDevice,
    configError,
    historyEntry,
    pushHistory,
  };
}
