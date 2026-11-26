import { AiFailedDraftSnapshot } from '@/types/nutrition';

const IDB_NAME = 'spot_ai_drafts_v1';
const IDB_STORE = 'drafts';
const LS_PREFIX = 'spot_ai_failed_draft_v1:';

function draftKey(
  traineeId: string,
  date: string,
  mealSlotId: string,
  mode: 'photo' | 'text' | 'adjust'
): string {
  return `${traineeId}::${date}::${mealSlotId}::${mode}`;
}

function openDraftDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function saveToLocalStorageFallback(key: string, draft: AiFailedDraftSnapshot) {
  if (typeof window === 'undefined') return;
  try {
    // בגיבוי localStorage נשמור ללא DataURLs ענקיים מעבר למכסה כדי לא להיתקע על QuotaExceededError
    const compactPhotos = draft.photos?.map((p) =>
      p.dataUrl.length <= 180_000 ? p : { ...p, dataUrl: '' }
    );
    window.localStorage.setItem(
      `${LS_PREFIX}${key}`,
      JSON.stringify({ ...draft, photos: compactPhotos })
    );
  } catch {
    // ignore quota error
  }
}

export async function saveFailedAiDraft(
  draft: AiFailedDraftSnapshot
): Promise<void> {
  const key = draftKey(draft.traineeId, draft.date, draft.mealSlotId, draft.mode);
  const db = await openDraftDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(draft, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  saveToLocalStorageFallback(key, draft);
}

export async function loadFailedAiDraft(
  traineeId: string,
  date: string,
  mealSlotId: string,
  mode: 'photo' | 'text' | 'adjust'
): Promise<AiFailedDraftSnapshot | null> {
  if (!traineeId || !date || !mealSlotId) return null;
  const key = draftKey(traineeId, date, mealSlotId, mode);
  const db = await openDraftDb();
  if (db) {
    const idbRes = await new Promise<AiFailedDraftSnapshot | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () =>
          resolve((req.result as AiFailedDraftSnapshot | undefined) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (idbRes) return idbRes;
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(`${LS_PREFIX}${key}`);
      if (raw) return JSON.parse(raw) as AiFailedDraftSnapshot;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function clearFailedAiDraft(
  traineeId: string,
  date: string,
  mealSlotId: string,
  mode: 'photo' | 'text' | 'adjust'
): Promise<void> {
  if (!traineeId || !date || !mealSlotId) return;
  const key = draftKey(traineeId, date, mealSlotId, mode);
  const db = await openDraftDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(`${LS_PREFIX}${key}`);
    } catch {
      // ignore
    }
  }
}
