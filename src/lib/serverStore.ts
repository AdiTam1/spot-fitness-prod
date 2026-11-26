import fs from 'fs';
import path from 'path';
import {
  DEFAULT_TEMPLATES,
  stripLegacySeededRecommendedOptionsFromTemplate,
  stripLegacySeededRecommendedOptionsFromTrainee,
} from '@/data/israeliFoodCatalog';
import {
  AccountStatus,
  AppReleasePolicy,
  AppUpdatePushHistoryEntry,
  AuthSessionUser,
  CoachDirectoryItem,
  CoachProfile,
  CoachPushSubscriptionSettings,
  CustomFoodItem,
  NutritionTemplate,
  QuickContextChip,
  TraineeFcmTokenEntry,
  TraineeGroup,
  TraineeProfile,
  TraineeWebPushSubscriptionEntry,
  UserClientVersionInfo,
  UserRole,
} from '@/types/nutrition';
import { hashPassword } from '@/lib/serverAuth';
import {
  OlderLogsInfo,
  redactFcmTokens,
  redactWebPushSubscriptions,
  sanitizeTraineeForClient,
  sanitizeTraineeForRosterList,
  trimTraineeLogsToWindow,
} from '@/lib/traineeSanitize';
export {
  sanitizeTraineeForClient,
  sanitizeTraineeForRosterList,
  trimTraineeLogsToWindow,
};
export type { OlderLogsInfo };
import {
  checkTraineeEmailExistsInSupabase,
  deleteCoachFromSupabase,
  deleteGroupFromSupabase,
  deleteTemplateFromSupabase,
  deleteTraineeFromSupabase,
  findTraineeLoginCandidateInSupabase,
  getRosterSyncStampFromSupabase,
  getTraineeSyncStampFromSupabase,
  isSupabaseConfigured,
  LiveAuthRecord,
  loadAppReleasePolicyFromSupabase,
  loadCoachLiveAuthState,
  loadCustomFoodsContextFromSupabase,
  loadMetaCoachesGroupsTemplatesFromSupabase,
  loadQuickChipsContextForTraineeFromSupabase,
  loadSemanticSearchEnabledFromSupabase,
  loadSingleCoachFromSupabase,
  loadSingleTraineeFromSupabase,
  loadSingleTraineeWithVersionFromSupabase,
  loadStateFromSupabase,
  loadTraineeLiveAuthState,
  loadTraineeSyncBundleFromSupabase,
  saveAppReleasePolicyToSupabase,
  saveCoachCustomFoodsToSupabase,
  saveCoachPushSettingsToSupabase,
  saveCoachesToSupabase,
  saveGlobalCustomFoodsToSupabase,
  saveGlobalQuickChipsToSupabase,
  saveGroupsToSupabase,
  saveSemanticSearchEnabledToSupabase,
  saveShowScraperSourcesToSupabase,
  saveSingleTraineeCasToSupabase,
  saveTemplatesToSupabase,
  saveTraineesToSupabase,
  touchUserLastSeenInSupabase,
  TraineeLoginLookupResult,
  recordUserClientVersionInSupabase,
  appendAppUpdatePushHistoryInSupabase,
} from '@/lib/supabase';

export interface ServerDatabaseState {
  coachEmail: string;
  coachPasswordHash: string;
  coachInviteCode: string;
  coaches: CoachProfile[];
  groups: TraineeGroup[];
  templates: NutritionTemplate[];
  trainees: TraineeProfile[];
  globalQuickChips?: QuickContextChip[];
  globalCustomFoods?: CustomFoodItem[];
  coachCustomFoods?: Record<string, CustomFoodItem[]>;
  coachPushSettings?: Record<string, CoachPushSubscriptionSettings>;
  appReleasePolicy?: AppReleasePolicy;
  showScraperSourcesToAdmin?: boolean;
  semanticSearchEnabled?: boolean;
  userClientVersions?: Record<string, UserClientVersionInfo>;
  appUpdatePushHistory?: AppUpdatePushHistoryEntry[];
  readErrors?: string[];
}

const LOCAL_DB_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'spot-server-db.json');

declare global {
  // eslint-disable-next-line no-var
  var __spotServerDbCache: ServerDatabaseState | undefined;
  // eslint-disable-next-line no-var
  var __spotLastClientVersionCache: Map<string, UserClientVersionInfo> | undefined;
  // eslint-disable-next-line no-var
  var __spotSemanticFlagCache: { value: boolean; expiresAt: number } | undefined;
  // eslint-disable-next-line no-var
  var __spotTraineeWriteLocks: Map<string, Promise<unknown>> | undefined;
}

async function runWithTraineeLock<T>(
  traineeId: string,
  task: () => Promise<T>
): Promise<T> {
  if (!global.__spotTraineeWriteLocks) {
    global.__spotTraineeWriteLocks = new Map();
  }
  const prev = global.__spotTraineeWriteLocks.get(traineeId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((res) => {
    release = res;
  });
  const chained = prev.catch(() => {}).then(() => gate);
  global.__spotTraineeWriteLocks.set(traineeId, chained);
  await prev.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (global.__spotTraineeWriteLocks.get(traineeId) === chained) {
      global.__spotTraineeWriteLocks.delete(traineeId);
    }
  }
}

const DEFAULT_GROUPS: TraineeGroup[] = [
  {
    id: 'grp-cut',
    name: 'חיטוב ומיצוק',
    color: '#d67d09',
    ownerCoachId: 'coach-admin',
  },
  {
    id: 'grp-bulk',
    name: 'עלייה במסת שריר',
    color: '#38bdf8',
    ownerCoachId: 'coach-admin',
  },
  {
    id: 'grp-vip',
    name: 'ליווי VIP',
    color: '#ff5e7e',
    ownerCoachId: 'coach-admin',
  },
];

function createCleanInitialState(): ServerDatabaseState {
  return {
    coachEmail: (process.env.COACH_EMAIL || 'coach@spot.co.il')
      .trim()
      .toLowerCase(),
    coachPasswordHash: hashPassword(
      (process.env.COACH_PASSWORD || '123456').trim()
    ),
    coachInviteCode: (process.env.COACH_INVITE_CODE || 'SPOT2026').trim(),
    coaches: [],
    groups: DEFAULT_GROUPS,
    templates: DEFAULT_TEMPLATES,
    trainees: [],
    globalQuickChips: [],
    globalCustomFoods: [],
    coachCustomFoods: {},
    coachPushSettings: {},
    appReleasePolicy: { androidBlockedUpToVersionCode: 0 },
    showScraperSourcesToAdmin: false,
    semanticSearchEnabled: false,
    userClientVersions: {},
    appUpdatePushHistory: [],
  };
}

function loadLocalServerFile(): ServerDatabaseState {
  if (global.__spotServerDbCache) {
    return global.__spotServerDbCache;
  }

  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const raw = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as ServerDatabaseState;
      parsed.coaches = Array.isArray(parsed.coaches) ? parsed.coaches : [];
      parsed.groups =
        Array.isArray(parsed.groups) && parsed.groups.length > 0
          ? parsed.groups
          : DEFAULT_GROUPS;
      parsed.globalQuickChips = Array.isArray(parsed.globalQuickChips)
        ? parsed.globalQuickChips
        : [];
      parsed.globalCustomFoods = Array.isArray(parsed.globalCustomFoods)
        ? parsed.globalCustomFoods
        : [];
      parsed.coachCustomFoods =
        parsed.coachCustomFoods && typeof parsed.coachCustomFoods === 'object'
          ? parsed.coachCustomFoods
          : {};
      parsed.coachPushSettings =
        parsed.coachPushSettings && typeof parsed.coachPushSettings === 'object'
          ? parsed.coachPushSettings
          : {};
      global.__spotServerDbCache = parsed;
      return parsed;
    }
  } catch {
    // ignore
  }

  const fresh = createCleanInitialState();
  global.__spotServerDbCache = fresh;
  saveLocalServerFile(fresh);
  return fresh;
}

function saveLocalServerFile(state: ServerDatabaseState) {
  global.__spotServerDbCache = state;
  try {
    if (!fs.existsSync(LOCAL_DB_DIR)) {
      fs.mkdirSync(LOCAL_DB_DIR, { recursive: true });
    }
    fs.writeFileSync(LOCAL_DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Serverless environment uses Supabase directly
  }
}

async function loadServerStateInternal(
  includeTrainees: boolean
): Promise<ServerDatabaseState> {
  const coachEmail = (process.env.COACH_EMAIL || 'coach@spot.co.il')
    .trim()
    .toLowerCase();
  const coachPasswordHash = hashPassword(
    (process.env.COACH_PASSWORD || '123456').trim()
  );
  const coachInviteCode = (process.env.COACH_INVITE_CODE || 'SPOT2026').trim();

  if (isSupabaseConfigured) {
    const remote = includeTrainees
      ? await loadStateFromSupabase()
      : await loadMetaCoachesGroupsTemplatesFromSupabase();

    let templates = remote.templates;
    if (templates.length === 0) {
      templates = DEFAULT_TEMPLATES;
      if (remote.readErrors.length === 0) {
        try {
          await saveTemplatesToSupabase(templates);
        } catch {
          // ignore auto-seed errors on initial read
        }
      }
    }

    let groups = remote.groups;
    if (groups.length === 0) {
      groups = DEFAULT_GROUPS;
      if (remote.readErrors.length === 0) {
        try {
          await saveGroupsToSupabase(groups);
        } catch {
          // ignore auto-seed errors on initial read
        }
      }
    }

    const cleanedTemplates = templates.map(
      (tpl) => stripLegacySeededRecommendedOptionsFromTemplate(tpl).template
    );
    const cleanedTrainees = includeTrainees
      ? remote.trainees.map(
          (t) => stripLegacySeededRecommendedOptionsFromTrainee(t).trainee
        )
      : [];

    return {
      coachEmail,
      coachPasswordHash,
      coachInviteCode,
      coaches: remote.coaches,
      groups,
      templates: cleanedTemplates,
      trainees: cleanedTrainees,
      globalQuickChips: remote.globalQuickChips || [],
      globalCustomFoods: remote.globalCustomFoods || [],
      coachCustomFoods: remote.coachCustomFoods || {},
      coachPushSettings: remote.coachPushSettings || {},
      appReleasePolicy: remote.appReleasePolicy || {
        androidBlockedUpToVersionCode: 0,
      },
      showScraperSourcesToAdmin: Boolean(remote.showScraperSourcesToAdmin),
      semanticSearchEnabled: Boolean(remote.semanticSearchEnabled),
      userClientVersions: remote.userClientVersions || {},
      appUpdatePushHistory: remote.appUpdatePushHistory || [],
      readErrors: remote.readErrors,
    };
  }

  const localState = loadLocalServerFile();
  return {
    ...localState,
    coachEmail,
    coachPasswordHash,
    coachInviteCode: localState.coachInviteCode || coachInviteCode,
    templates: (localState.templates || []).map(
      (tpl) => stripLegacySeededRecommendedOptionsFromTemplate(tpl).template
    ),
    trainees: includeTrainees
      ? (localState.trainees || []).map(
          (t) => stripLegacySeededRecommendedOptionsFromTrainee(t).trainee
        )
      : [],
    appReleasePolicy: localState.appReleasePolicy || {
      androidBlockedUpToVersionCode: 0,
    },
  };
}

/**
 * טוען את מטא-המערכת, המאמנים, הקבוצות והתבניות ללא סריקה של טבלת trainees.
 */
export async function getServerMetaAndCoachesState(): Promise<ServerDatabaseState> {
  return loadServerStateInternal(false);
}

export async function getServerDbState(): Promise<ServerDatabaseState> {
  return loadServerStateInternal(true);
}

export async function findTraineeLoginCandidateOnServer(
  cleanEmail: string
): Promise<TraineeLoginLookupResult> {
  if (isSupabaseConfigured) {
    return await findTraineeLoginCandidateInSupabase(cleanEmail);
  }
  const targetEmail = cleanEmail.trim().toLowerCase();
  const state = loadLocalServerFile();
  const matched = (state.trainees || []).find(
    (t) => (t.email || '').trim().toLowerCase() === targetEmail
  );
  if (!matched) return { candidate: null };
  return {
    candidate: {
      id: matched.id,
      email: matched.email || '',
      password: matched.password || '',
      status: matched.status || 'active',
      name: matched.name,
      sessionVersion: Math.max(1, Number(matched.sessionVersion) || 1),
    },
  };
}

export async function checkTraineeEmailExistsOnServer(
  cleanEmail: string
): Promise<{ exists: boolean; dbUnavailable?: boolean; dbError?: string }> {
  if (isSupabaseConfigured) {
    return await checkTraineeEmailExistsInSupabase(cleanEmail);
  }
  const targetEmail = cleanEmail.trim().toLowerCase();
  const state = loadLocalServerFile();
  const exists = (state.trainees || []).some(
    (t) => (t.email || '').trim().toLowerCase() === targetEmail
  );
  return { exists };
}

export async function createSingleTraineeOnServer(
  trainee: TraineeProfile
): Promise<void> {
  if (isSupabaseConfigured) {
    await saveTraineesToSupabase([trainee]);
    return;
  }
  const current = loadLocalServerFile();
  saveLocalServerFile({
    ...current,
    trainees: [...(current.trainees || []), trainee],
  });
}

export function invalidateSemanticSearchFlagCache(nextValue?: boolean): void {
  if (typeof nextValue === 'boolean') {
    globalThis.__spotSemanticFlagCache = {
      value: nextValue,
      expiresAt: Date.now() + 20_000,
    };
    return;
  }
  globalThis.__spotSemanticFlagCache = undefined;
}

/**
 * קריאה מהירה (~0ms בקאש, או שאילתת מטה בודדת) למצב מתג החיפוש הסמנטי,
 * כדי לא לעכב את מסלול החיפוש המהיר בשליפת כל טבלאות האפליקציה.
 */
export async function getSemanticSearchEnabledFast(): Promise<boolean> {
  const cached = globalThis.__spotSemanticFlagCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let enabled = false;
  if (isSupabaseConfigured) {
    enabled = await loadSemanticSearchEnabledFromSupabase();
  } else {
    enabled = Boolean(loadLocalServerFile().semanticSearchEnabled);
  }

  globalThis.__spotSemanticFlagCache = {
    value: enabled,
    expiresAt: Date.now() + 20_000,
  };
  return enabled;
}

export async function getAppReleasePolicyFromServer(): Promise<AppReleasePolicy> {
  if (isSupabaseConfigured) {
    return await loadAppReleasePolicyFromSupabase();
  }
  const state = await getServerDbState();
  return (
    state.appReleasePolicy || {
      androidBlockedUpToVersionCode: 0,
    }
  );
}

export async function getTraineeAuthStateFromServer(
  traineeId: string
): Promise<LiveAuthRecord | null> {
  if (isSupabaseConfigured) {
    return await loadTraineeLiveAuthState(traineeId);
  }
  const state = await getServerDbState();
  const found = state.trainees.find((t) => t.id === traineeId);
  if (!found) return null;
  return {
    id: found.id,
    role: 'trainee',
    name: found.name,
    status: found.status || 'active',
    sessionVersion: Math.max(1, Number(found.sessionVersion) || 1),
    lastSeenAt: found.lastSeenAt,
  };
}

export async function getCoachAuthStateFromServer(
  coachId: string
): Promise<LiveAuthRecord | null> {
  if (isSupabaseConfigured) {
    return await loadCoachLiveAuthState(coachId);
  }
  const state = await getServerDbState();
  const found = state.coaches.find((c) => c.id === coachId);
  if (!found) return null;
  return {
    id: found.id,
    role: 'coach',
    name: found.name,
    status: found.status || 'active',
    sessionVersion: Math.max(1, Number(found.sessionVersion) || 1),
    lastSeenAt: found.lastSeenAt,
  };
}

export async function touchUserLastSeenOnServer(
  role: 'trainee' | 'coach',
  userId: string,
  prevLastSeenAt?: string
): Promise<void> {
  const prevTs = prevLastSeenAt ? Date.parse(prevLastSeenAt) : 0;
  if (Number.isFinite(prevTs) && prevTs > 0 && Date.now() - prevTs < 45_000) {
    return;
  }
  const nowIso = new Date().toISOString();
  if (isSupabaseConfigured) {
    await touchUserLastSeenInSupabase(role, userId, nowIso);
    return;
  }
  const state = loadLocalServerFile();
  if (role === 'trainee') {
    state.trainees = state.trainees.map((t) =>
      t.id === userId ? { ...t, lastSeenAt: nowIso } : t
    );
  } else {
    state.coaches = state.coaches.map((c) =>
      c.id === userId ? { ...c, lastSeenAt: nowIso } : c
    );
  }
  saveLocalServerFile(state);
}

export async function recordUserClientVersionOnServer(
  role: UserRole,
  userId: string,
  info: Omit<UserClientVersionInfo, 'updatedAt'>
): Promise<void> {
  const key = `${role}:${userId}`;
  const cache = (global.__spotLastClientVersionCache ||= new Map());
  const cached = cache.get(key);
  const nowMs = Date.now();
  const normalized: UserClientVersionInfo = {
    platform: String(info.platform || 'unknown').slice(0, 32),
    appVersionCode:
      typeof info.appVersionCode === 'number' && Number.isFinite(info.appVersionCode)
        ? Math.round(info.appVersionCode)
        : null,
    appVersionName: info.appVersionName
      ? String(info.appVersionName).slice(0, 48)
      : null,
    webBuildId: info.webBuildId ? String(info.webBuildId).slice(0, 64) : null,
    updatedAt: new Date(nowMs).toISOString(),
  };

  if (cached) {
    const cachedTs = Date.parse(cached.updatedAt || '');
    const sameVersion =
      cached.platform === normalized.platform &&
      (cached.appVersionCode ?? null) === (normalized.appVersionCode ?? null) &&
      (cached.appVersionName ?? null) === (normalized.appVersionName ?? null) &&
      (cached.webBuildId ?? null) === (normalized.webBuildId ?? null);
    if (sameVersion && Number.isFinite(cachedTs) && nowMs - cachedTs < 30 * 60_000) {
      return;
    }
  }
  cache.set(key, normalized);

  if (isSupabaseConfigured) {
    try {
      await recordUserClientVersionInSupabase(key, normalized);
    } catch {
      // שקט: לא חוסם פעילות heartbeat רגילה
    }
    return;
  }

  const state = loadLocalServerFile();
  state.userClientVersions = {
    ...(state.userClientVersions || {}),
    [key]: normalized,
  };
  saveLocalServerFile(state);
}

export async function appendAppUpdatePushHistoryOnServer(
  entry: AppUpdatePushHistoryEntry
): Promise<AppUpdatePushHistoryEntry[]> {
  if (isSupabaseConfigured) {
    return await appendAppUpdatePushHistoryInSupabase(entry);
  }
  const state = loadLocalServerFile();
  const nextList = [
    entry,
    ...(Array.isArray(state.appUpdatePushHistory) ? state.appUpdatePushHistory : []),
  ].slice(0, 25);
  state.appUpdatePushHistory = nextList;
  saveLocalServerFile(state);
  return nextList;
}

export async function getSingleTraineeFromServer(
  traineeId: string
): Promise<TraineeProfile | null> {
  if (isSupabaseConfigured) {
    const found = await loadSingleTraineeFromSupabase(traineeId);
    return found
      ? stripLegacySeededRecommendedOptionsFromTrainee(found).trainee
      : null;
  }
  const state = await getServerDbState();
  const found = state.trainees.find((t) => t.id === traineeId);
  return found
    ? stripLegacySeededRecommendedOptionsFromTrainee(found).trainee
    : null;
}

export async function getSingleCoachFromServer(
  coachId: string
): Promise<CoachProfile | null> {
  if (isSupabaseConfigured) {
    const remoteCoach = await loadSingleCoachFromSupabase(coachId);
    if (remoteCoach) return remoteCoach;
  }
  const state = await getServerDbState();
  return state.coaches.find((c) => c.id === coachId) || null;
}

export async function getTraineeSyncStampOnServer(
  traineeId: string
): Promise<{ stamp: string | null; status?: AccountStatus }> {
  if (isSupabaseConfigured) {
    return await getTraineeSyncStampFromSupabase(traineeId);
  }
  return { stamp: null };
}

export async function getRosterSyncStampOnServer(
  previewTraineeId?: string
): Promise<string | null> {
  if (isSupabaseConfigured) {
    return await getRosterSyncStampFromSupabase(previewTraineeId);
  }
  return null;
}

export async function getTraineeSyncBundleOnServer(opts: {
  groupId?: string;
  coachIds?: string[];
}): Promise<{
  globalQuickChips: QuickContextChip[];
  groupQuickChips: QuickContextChip[];
  globalCustomFoods: CustomFoodItem[];
  coachCustomFoods: Record<string, CustomFoodItem[]>;
  semanticSearchEnabled: boolean;
}> {
  if (isSupabaseConfigured) {
    return await loadTraineeSyncBundleFromSupabase(opts);
  }
  const state = await getServerMetaAndCoachesState();
  const globalQuickChips = Array.isArray(state.globalQuickChips)
    ? state.globalQuickChips
    : [];
  const groupQuickChips = opts.groupId
    ? state.groups.find((g) => g.id === opts.groupId)?.customQuickChips || []
    : [];
  const globalCustomFoods = Array.isArray(state.globalCustomFoods)
    ? state.globalCustomFoods
    : [];
  const rawCoach = state.coachCustomFoods || {};
  let coachCustomFoods: Record<string, CustomFoodItem[]> = rawCoach;
  if (Array.isArray(opts.coachIds)) {
    coachCustomFoods = {};
    for (const id of opts.coachIds) {
      if (Array.isArray(rawCoach[id])) {
        coachCustomFoods[id] = rawCoach[id];
      }
    }
  }
  return {
    globalQuickChips,
    groupQuickChips,
    globalCustomFoods,
    coachCustomFoods,
    semanticSearchEnabled: Boolean(state.semanticSearchEnabled),
  };
}

export async function getQuickChipsContextForTrainee(
  groupId?: string
): Promise<{
  globalQuickChips: QuickContextChip[];
  groupQuickChips: QuickContextChip[];
}> {
  if (isSupabaseConfigured) {
    return await loadQuickChipsContextForTraineeFromSupabase(groupId);
  }
  const state = await getServerDbState();
  const globalQuickChips = Array.isArray(state.globalQuickChips)
    ? state.globalQuickChips
    : [];
  const groupQuickChips = groupId
    ? state.groups.find((g) => g.id === groupId)?.customQuickChips || []
    : [];
  return { globalQuickChips, groupQuickChips };
}

export async function getCustomFoodsContextForUser(opts: {
  coachIds?: string[];
}): Promise<{
  globalCustomFoods: CustomFoodItem[];
  coachCustomFoods: Record<string, CustomFoodItem[]>;
}> {
  if (isSupabaseConfigured) {
    return await loadCustomFoodsContextFromSupabase(opts.coachIds);
  }
  const state = await getServerDbState();
  const globalCustomFoods = Array.isArray(state.globalCustomFoods)
    ? state.globalCustomFoods
    : [];
  const rawCoach = state.coachCustomFoods || {};
  if (!Array.isArray(opts.coachIds)) {
    return { globalCustomFoods, coachCustomFoods: rawCoach };
  }
  const coachCustomFoods: Record<string, CustomFoodItem[]> = {};
  for (const id of opts.coachIds) {
    if (Array.isArray(rawCoach[id])) {
      coachCustomFoods[id] = rawCoach[id];
    }
  }
  return { globalCustomFoods, coachCustomFoods };
}

async function persistUpdatedStateDiff(
  current: ServerDatabaseState,
  next: ServerDatabaseState,
  options: { skipTrainees: boolean }
): Promise<ServerDatabaseState> {
  if (isSupabaseConfigured) {
    const tasks: Promise<unknown>[] = [];
    if (next.coaches !== current.coaches) {
      tasks.push(saveCoachesToSupabase(next.coaches));
    }
    if (next.groups !== current.groups) {
      tasks.push(saveGroupsToSupabase(next.groups));
    }
    if (next.templates !== current.templates) {
      tasks.push(saveTemplatesToSupabase(next.templates));
    }
    if (!options.skipTrainees && next.trainees !== current.trainees) {
      // שליחת עדכון אך ורק לשורות המתאמנים שהשתנו בפועל (מונע דריסות צולבות ועומס מיותר)
      const changedTrainees = next.trainees.filter((nt) => {
        const ct = current.trainees.find((x) => x.id === nt.id);
        return ct !== nt;
      });
      if (changedTrainees.length > 0) {
        tasks.push(saveTraineesToSupabase(changedTrainees));
      }
    }
    if (next.globalQuickChips !== current.globalQuickChips) {
      tasks.push(saveGlobalQuickChipsToSupabase(next.globalQuickChips || []));
    }
    if (next.globalCustomFoods !== current.globalCustomFoods) {
      tasks.push(saveGlobalCustomFoodsToSupabase(next.globalCustomFoods || []));
    }
    if (next.coachCustomFoods !== current.coachCustomFoods) {
      tasks.push(saveCoachCustomFoodsToSupabase(next.coachCustomFoods || {}));
    }
    if (next.coachPushSettings !== current.coachPushSettings) {
      tasks.push(saveCoachPushSettingsToSupabase(next.coachPushSettings || {}));
    }
    if (next.appReleasePolicy !== current.appReleasePolicy && next.appReleasePolicy) {
      tasks.push(saveAppReleasePolicyToSupabase(next.appReleasePolicy));
    }
    if (next.showScraperSourcesToAdmin !== current.showScraperSourcesToAdmin) {
      tasks.push(saveShowScraperSourcesToSupabase(Boolean(next.showScraperSourcesToAdmin)));
    }
    if (next.semanticSearchEnabled !== current.semanticSearchEnabled) {
      const nextSem = Boolean(next.semanticSearchEnabled);
      invalidateSemanticSearchFlagCache(nextSem);
      tasks.push(saveSemanticSearchEnabledToSupabase(nextSem));
    }
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
    return next;
  }

  if (next.semanticSearchEnabled !== current.semanticSearchEnabled) {
    invalidateSemanticSearchFlagCache(Boolean(next.semanticSearchEnabled));
  }
  if (options.skipTrainees) {
    const existingLocal = loadLocalServerFile();
    const merged: ServerDatabaseState = {
      ...next,
      trainees: existingLocal.trainees || [],
    };
    saveLocalServerFile(merged);
    return merged;
  }
  saveLocalServerFile(next);
  return next;
}

/**
 * מעדכן הגדרות מערכת / מאמנים / קבוצות / מוצרים מערכתיים מבלי לסרוק את טבלת trainees.
 */
export async function updateServerMetaState(
  updater: (prev: ServerDatabaseState) => ServerDatabaseState
): Promise<ServerDatabaseState> {
  const current = await getServerMetaAndCoachesState();
  const next = updater(current);
  return persistUpdatedStateDiff(current, next, { skipTrainees: true });
}

export async function updateServerDbState(
  updater: (prev: ServerDatabaseState) => ServerDatabaseState
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next = updater(current);
  return persistUpdatedStateDiff(current, next, { skipTrainees: false });
}

/**
 * עדכון אטומי מוגן-מקביליות עבור מתאמן בודד (Per-Trainee Lock + Optimistic CAS Retry).
 * מונע דריסות בין בקשות AI ברקע, שמירת ארוחה מהטלפון, עריכת מאמן וסנכרון צעדים.
 */
export async function updateTraineeAtomic(
  traineeId: string,
  updater: (prev: TraineeProfile) => TraineeProfile | null,
  maxCasAttempts = 5
): Promise<{ prev: TraineeProfile | null; next: TraineeProfile | null }> {
  return runWithTraineeLock(traineeId, async () => {
    if (isSupabaseConfigured) {
      for (let attempt = 0; attempt < maxCasAttempts; attempt++) {
        const loaded = await loadSingleTraineeWithVersionFromSupabase(traineeId);
        if (!loaded) return { prev: null, next: null };
        const updated = updater(loaded.trainee);
        if (!updated || updated === loaded.trainee) {
          return { prev: loaded.trainee, next: loaded.trainee };
        }
        const { conflicted } = await saveSingleTraineeCasToSupabase(
          updated,
          loaded.updatedAt
        );
        if (!conflicted) {
          return { prev: loaded.trainee, next: updated };
        }
        await new Promise((r) => setTimeout(r, 30 + Math.floor(Math.random() * 60)));
      }
      // ניסיון אחרון מובטח אחרי התנגשויות מרובות
      const fresh = await loadSingleTraineeFromSupabase(traineeId);
      if (!fresh) return { prev: null, next: null };
      const finalUpdated = updater(fresh);
      if (!finalUpdated || finalUpdated === fresh) {
        return { prev: fresh, next: fresh };
      }
      await saveTraineesToSupabase([finalUpdated]);
      return { prev: fresh, next: finalUpdated };
    }

    const current = await getServerDbState();
    const existing = current.trainees.find((t) => t.id === traineeId);
    if (!existing) return { prev: null, next: null };
    const updated = updater(existing);
    if (!updated || updated === existing) {
      return { prev: existing, next: existing };
    }
    const nextState: ServerDatabaseState = {
      ...current,
      trainees: current.trainees.map((t) => (t.id === traineeId ? updated : t)),
    };
    saveLocalServerFile(nextState);
    return { prev: existing, next: updated };
  });
}

/**
 * מחיקת מאמן ע"י המנהל הראשי + הגנת Anti-Orphan:
 * כל המתאמנים שהיו בבעלותו עוברים אוטומטית לבעלות המנהל הראשי ('coach-admin')
 */
export async function deleteCoachWithOrphanProtection(
  coachId: string
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next: ServerDatabaseState = {
    ...current,
    coaches: current.coaches.filter((c) => c.id !== coachId),
    trainees: current.trainees.map((t) => ({
      ...t,
      primaryCoachId:
        t.primaryCoachId === coachId ? 'coach-admin' : t.primaryCoachId,
      sharedCoachIds: (t.sharedCoachIds || []).filter((id) => id !== coachId),
    })),
  };

  if (isSupabaseConfigured) {
    await Promise.all([
      deleteCoachFromSupabase(coachId),
      saveTraineesToSupabase(next.trainees),
    ]);
  } else {
    saveLocalServerFile(next);
  }

  return next;
}

export async function deleteGroupOnServer(
  groupId: string
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next: ServerDatabaseState = {
    ...current,
    groups: current.groups.filter((g) => g.id !== groupId),
    // מחיקת קבוצה אינה מוחקת את המתאמנים שבה! רק מנתקת את שיוך הקבוצה
    trainees: current.trainees.map((t) =>
      t.groupId === groupId ? { ...t, groupId: undefined } : t
    ),
  };

  if (isSupabaseConfigured) {
    await Promise.all([
      deleteGroupFromSupabase(groupId),
      saveTraineesToSupabase(next.trainees),
    ]);
  } else {
    saveLocalServerFile(next);
  }

  return next;
}

export async function deleteTemplateOnServer(
  templateId: string
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next: ServerDatabaseState = {
    ...current,
    templates: current.templates.filter((t) => t.id !== templateId),
  };

  if (isSupabaseConfigured) {
    await deleteTemplateFromSupabase(templateId);
  } else {
    saveLocalServerFile(next);
  }

  return next;
}

export async function deleteTraineeOnServer(traineeId: string): Promise<void> {
  if (isSupabaseConfigured) {
    await deleteTraineeFromSupabase(traineeId);
    return;
  }
  const current = await getServerDbState();
  const next: ServerDatabaseState = {
    ...current,
    trainees: current.trainees.filter((t) => t.id !== traineeId),
  };
  saveLocalServerFile(next);
}

// ============================================================================
// פונקציות שער הרשאות (Zero-Trust Object-Level Authorization Guards)
// ============================================================================

export function isSuperAdmin(session: AuthSessionUser): boolean {
  return session.role === 'admin';
}

export function isPrimaryOwnerOfTrainee(
  session: AuthSessionUser,
  trainee: TraineeProfile
): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'coach') {
    return trainee.primaryCoachId === session.id;
  }
  return false;
}

export function canCoachAccessTrainee(
  session: AuthSessionUser,
  trainee: TraineeProfile
): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'coach') {
    // מתאמנים בסטטוס pending שנרשמו ללא קוד מאמן שייכים ל-coach-admin וגלויים רק למנהל הראשי!
    if (
      trainee.status === 'pending' &&
      trainee.primaryCoachId === 'coach-admin'
    ) {
      return false;
    }
    return (
      trainee.primaryCoachId === session.id ||
      (trainee.sharedCoachIds || []).includes(session.id)
    );
  }
  return false;
}

export function canCoachViewTemplate(
  session: AuthSessionUser,
  template: NutritionTemplate
): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'coach') {
    const owner = template.ownerCoachId || 'coach-admin';
    return owner === 'coach-admin' || owner === session.id;
  }
  return false;
}

export function canCoachEditTemplate(
  session: AuthSessionUser,
  template: NutritionTemplate
): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'coach') {
    return template.ownerCoachId === session.id;
  }
  return false;
}

export function canCoachManageGroup(
  session: AuthSessionUser,
  group: TraineeGroup
): boolean {
  if (session.role === 'admin') return true;
  if (session.role === 'coach') {
    return (
      group.ownerCoachId === 'coach-admin' || group.ownerCoachId === session.id
    );
  }
  return false;
}

export function createDefaultCoachPushSettings(
  coachId: string
): CoachPushSubscriptionSettings {
  return {
    coachId,
    enabled: true,
    traineeIds: [],
    groupIds: [],
    events: {
      meals: true,
      weight: true,
      workouts: true,
      water: false,
    },
    webPushSubscriptions: [],
    fcmTokens: [],
    updatedAt: '',
  };
}

export function sanitizeCoachPushSettingsForClient(
  raw: CoachPushSubscriptionSettings | undefined,
  coachId: string
): CoachPushSubscriptionSettings {
  const base = raw || createDefaultCoachPushSettings(coachId);
  return {
    ...base,
    coachId,
    webPushSubscriptions: redactWebPushSubscriptions(base.webPushSubscriptions),
    fcmTokens: redactFcmTokens(base.fcmTokens),
  };
}

export function sanitizeCoachForClient(coach: CoachProfile): CoachProfile {
  return {
    ...coach,
    password: '',
  };
}

export function buildCoachDirectory(
  state: ServerDatabaseState
): CoachDirectoryItem[] {
  const list: CoachDirectoryItem[] = [
    {
      id: 'coach-admin',
      name: 'מנהל ראשי',
      isSuperAdmin: true,
    },
  ];
  for (const c of state.coaches) {
    if (c.status === 'active') {
      list.push({
        id: c.id,
        name: c.name,
        isSuperAdmin: false,
      });
    }
  }
  return list;
}
