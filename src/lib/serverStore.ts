import fs from 'fs';
import path from 'path';
import { DEFAULT_TEMPLATES } from '@/data/israeliFoodCatalog';
import {
  AuthSessionUser,
  CoachDirectoryItem,
  CoachProfile,
  NutritionTemplate,
  QuickContextChip,
  TraineeGroup,
  TraineeProfile,
} from '@/types/nutrition';
import { hashPassword } from '@/lib/serverAuth';
import {
  deleteCoachFromSupabase,
  deleteGroupFromSupabase,
  deleteTemplateFromSupabase,
  deleteTraineeFromSupabase,
  isSupabaseConfigured,
  loadQuickChipsContextForTraineeFromSupabase,
  loadSingleCoachFromSupabase,
  loadSingleTraineeFromSupabase,
  loadStateFromSupabase,
  saveCoachesToSupabase,
  saveGlobalQuickChipsToSupabase,
  saveGroupsToSupabase,
  saveTemplatesToSupabase,
  saveTraineesToSupabase,
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
  readErrors?: string[];
}

const LOCAL_DB_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'spot-server-db.json');

declare global {
  // eslint-disable-next-line no-var
  var __spotServerDbCache: ServerDatabaseState | undefined;
}

const DEFAULT_GROUPS: TraineeGroup[] = [
  {
    id: 'grp-cut',
    name: 'חיטוב ומיצוק',
    color: '#d2ff28',
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

export async function getServerDbState(): Promise<ServerDatabaseState> {
  const coachEmail = (process.env.COACH_EMAIL || 'coach@spot.co.il')
    .trim()
    .toLowerCase();
  const coachPasswordHash = hashPassword(
    (process.env.COACH_PASSWORD || '123456').trim()
  );
  const coachInviteCode = (process.env.COACH_INVITE_CODE || 'SPOT2026').trim();

  if (isSupabaseConfigured) {
    const remote = await loadStateFromSupabase();

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

    return {
      coachEmail,
      coachPasswordHash,
      coachInviteCode,
      coaches: remote.coaches,
      groups,
      templates,
      trainees: remote.trainees,
      globalQuickChips: remote.globalQuickChips || [],
      readErrors: remote.readErrors,
    };
  }

  const localState = loadLocalServerFile();
  localState.coachEmail = coachEmail;
  localState.coachPasswordHash = coachPasswordHash;
  return localState;
}

export async function getSingleTraineeFromServer(
  traineeId: string
): Promise<TraineeProfile | null> {
  if (isSupabaseConfigured) {
    return await loadSingleTraineeFromSupabase(traineeId);
  }
  const state = await getServerDbState();
  return state.trainees.find((t) => t.id === traineeId) || null;
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

export async function updateServerDbState(
  updater: (prev: ServerDatabaseState) => ServerDatabaseState
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next = updater(current);

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
    if (next.trainees !== current.trainees) {
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
    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  } else {
    saveLocalServerFile(next);
  }

  return next;
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

export function sanitizeTraineeForClient(
  trainee: TraineeProfile
): TraineeProfile {
  return {
    ...trainee,
    password: '',
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
