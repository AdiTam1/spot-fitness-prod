import fs from 'fs';
import path from 'path';
import { DEFAULT_TEMPLATES } from '@/data/israeliFoodCatalog';
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

/**
 * יצירת מצב התחלתי נקי ללא מתאמני דמו מומצאים (עומר/נועה/איתי).
 * רק טמפלייטי הבסיס של הארוחות נוצרים כדי שלמאמן יהיו תבניות מוכנות לעבודה.
 */
function createCleanInitialState(): ServerDatabaseState {
  return {
    coachEmail: (process.env.COACH_EMAIL || 'coach@spot.co.il')
      .trim()
      .toLowerCase(),
    coachPasswordHash: hashPassword(
      (process.env.COACH_PASSWORD || '123456').trim()
    ),
    coachInviteCode: (process.env.COACH_INVITE_CODE || 'SPOT2026').trim(),
    templates: DEFAULT_TEMPLATES,
    trainees: [], // אפס מתאמנים מומצאים! רק מתאמנים אמיתיים מה-DB יכולים להתחבר
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
    // Serverless environment (Vercel) uses Supabase directly
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

  // כאשר Supabase מוגדר (ב-Vercel או ב-.env.local) -> קורא אך ורק מ-Supabase!
  if (isSupabaseConfigured) {
    const remote = await loadStateFromSupabase();

    let templates = remote.templates;
    if (templates.length === 0) {
      templates = DEFAULT_TEMPLATES;
      await saveTemplatesToSupabase(templates);
    }

    return {
      coachEmail,
      coachPasswordHash,
      coachInviteCode,
      templates,
      trainees: remote.trainees, // מחזיר אך ורק את הרשומות האמיתיות מטבלת trainees ב-Supabase!
    };
  }

  // מצב פיתוח מקומי ללא חיבור Supabase
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

export async function updateServerDbState(
  updater: (prev: ServerDatabaseState) => ServerDatabaseState
): Promise<ServerDatabaseState> {
  const current = await getServerDbState();
  const next = updater(current);

  if (isSupabaseConfigured) {
    await Promise.all([
      saveTemplatesToSupabase(next.templates),
      saveTraineesToSupabase(next.trainees),
    ]);
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

export function sanitizeTraineeForClient(
  trainee: TraineeProfile
): TraineeProfile {
  return {
    ...trainee,
    password: '',
  };
}
