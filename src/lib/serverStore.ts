import fs from 'fs';
import path from 'path';
import {
  DEFAULT_TEMPLATES,
  createInitialTrainees,
} from '@/data/israeliFoodCatalog';
import { NutritionTemplate, TraineeProfile } from '@/types/nutrition';
import { hashPassword } from '@/lib/serverAuth';
import {
  deleteTraineeFromSupabase,
  isSupabaseConfigured,
  loadSingleTraineeFromSupabase,
  loadStateFromSupabase,
  saveTemplatesToSupabase,
  saveTraineesToSupabase,
} from '@/lib/supabase';

interface ServerDatabaseState {
  coachEmail: string;
  coachPasswordHash: string;
  coachInviteCode: string;
  templates: NutritionTemplate[];
  trainees: TraineeProfile[];
}

const LOCAL_DB_DIR = path.join(process.cwd(), '.data');
const LOCAL_DB_FILE = path.join(LOCAL_DB_DIR, 'spot-server-db.json');

declare global {
  // eslint-disable-next-line no-var
  var __spotServerDbCache: ServerDatabaseState | undefined;
}

function createDefaultServerState(): ServerDatabaseState {
  const initialTrainees = createInitialTrainees().map((t) => ({
    ...t,
    password: hashPassword(t.password || '123456'),
  }));

  return {
    coachEmail: (process.env.COACH_EMAIL || 'coach@spot.co.il').toLowerCase(),
    coachPasswordHash: hashPassword(process.env.COACH_PASSWORD || '123456'),
    coachInviteCode: process.env.COACH_INVITE_CODE || 'SPOT2026',
    templates: DEFAULT_TEMPLATES,
    trainees: initialTrainees,
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
      global.__spotServerDbCache = parsed;
      return parsed;
    }
  } catch {
    // fallback to default memory state
  }

  const fresh = createDefaultServerState();
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
    // On serverless read-only filesystem (e.g. Vercel), Supabase is used as primary storage
  }
}

/**
 * שכבת גישה לנתונים בצד השרת בלבד (Server-Only DAL)
 */
export async function getServerDbState(): Promise<ServerDatabaseState> {
  const localState = loadLocalServerFile();

  // וידוא שמשתני הסביבה מ-Vercel (COACH_EMAIL, COACH_PASSWORD, COACH_INVITE_CODE) תמיד מעודכנים
  if (process.env.COACH_EMAIL) {
    localState.coachEmail = process.env.COACH_EMAIL.trim().toLowerCase();
  }
  if (process.env.COACH_PASSWORD) {
    localState.coachPasswordHash = hashPassword(process.env.COACH_PASSWORD.trim());
  }

  if (isSupabaseConfigured) {
    const remote = await loadStateFromSupabase();
    let changed = false;

    if (remote.templates && remote.templates.length > 0) {
      localState.templates = remote.templates;
    } else {
      await saveTemplatesToSupabase(localState.templates);
      changed = true;
    }

    if (remote.trainees && remote.trainees.length > 0) {
      localState.trainees = remote.trainees;
    } else {
      await saveTraineesToSupabase(localState.trainees);
      changed = true;
    }

    if (changed) {
      saveLocalServerFile(localState);
    }
  }

  return localState;
}

export async function getSingleTraineeFromServer(
  traineeId: string
): Promise<TraineeProfile | null> {
  if (isSupabaseConfigured) {
    const remoteSingle = await loadSingleTraineeFromSupabase(traineeId);
    if (remoteSingle) return remoteSingle;
  }
  const state = await getServerDbState();
  return state.trainees.find((t) => t.id === traineeId) || null;
}

export async function updateServerDbState(
  updater: (prev: ServerDatabaseState) => ServerDatabaseState
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next = updater(current);
  saveLocalServerFile(next);

  if (isSupabaseConfigured) {
    await Promise.all([
      saveTemplatesToSupabase(next.templates),
      saveTraineesToSupabase(next.trainees),
    ]);
  }

  return next;
}

export async function deleteTraineeOnServer(traineeId: string): Promise<void> {
  const current = await getServerDbState();
  const next: ServerDatabaseState = {
    ...current,
    trainees: current.trainees.filter((t) => t.id !== traineeId),
  };
  saveLocalServerFile(next);

  if (isSupabaseConfigured) {
    await deleteTraineeFromSupabase(traineeId);
  }
}

/**
 * מסיר שדות רגישים (כמו גיבוב סיסמה) לפני שליחת פרופיל מתאמן לדפדפן
 */
export function sanitizeTraineeForClient(
  trainee: TraineeProfile
): TraineeProfile {
  return {
    ...trainee,
    password: '', // לעולם לא חושף סיסמה או Hash לדפדפן
  };
}
