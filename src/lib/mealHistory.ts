import {
  CoachDeletedItemNotice,
  LoggedFoodItem,
  LoggedMealEntry,
  MealHistoryAiDetail,
  MealHistoryEntry,
  MealHistoryEventKind,
  MealHistoryItemChange,
  PhotoAngleKind,
  SubmittedMealPhotoMeta,
  UserRole,
} from '@/types/nutrition';

const MAX_MEAL_HISTORY_ENTRIES = 45;
const MAX_MEAL_PHOTO_STORE_ENTRIES = 20;

export function computeShortPhotoHash(dataUrl: string): string {
  if (!dataUrl) return 'img_empty';
  let h = 2166136261;
  const step = Math.max(1, Math.floor(dataUrl.length / 256));
  for (let i = 0; i < dataUrl.length; i += step) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `img_${dataUrl.length.toString(36)}_${(h >>> 0).toString(36)}`;
}

export function formatHebrewTimeLabel(iso = new Date().toISOString()): string {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '12:00';
  }
}

export function stripTransientCoachBadges(
  items: LoggedFoodItem[]
): LoggedFoodItem[] {
  return (items || []).map((item) => {
    const cleanComps = item.components?.length
      ? stripTransientCoachBadges(item.components)
      : undefined;
    return {
      ...item,
      coachBadge: undefined,
      coachPrevSummary: undefined,
      coachEditedAt: undefined,
      coachEditedBy: undefined,
      ...(cleanComps ? { components: cleanComps } : {}),
    };
  });
}

export function clearCoachEditBadgesOnMeal(
  meal: LoggedMealEntry
): LoggedMealEntry {
  return {
    ...meal,
    items: stripTransientCoachBadges(meal.items || []),
    coachEditState: meal.coachEditState
      ? {
          ...meal.coachEditState,
          unreadBadges: false,
          unreadBanner: false,
        }
      : undefined,
  };
}

export function mergeMealPhotoStore(
  existingStore: Record<string, string> | undefined,
  photos: {
    dataUrl: string;
    angle?: PhotoAngleKind;
    labelProductName?: string;
  }[]
): {
  photoStore: Record<string, string>;
  metas: SubmittedMealPhotoMeta[];
} {
  const nextStore: Record<string, string> = { ...(existingStore || {}) };
  const metas: SubmittedMealPhotoMeta[] = [];

  for (const p of photos) {
    if (!p?.dataUrl) continue;
    const hash = computeShortPhotoHash(p.dataUrl);
    if (!nextStore[hash]) {
      nextStore[hash] = p.dataUrl;
    }
    metas.push({
      hash,
      angle: p.angle || 'unset',
      ...(p.labelProductName?.trim()
        ? { labelProductName: p.labelProductName.trim().slice(0, 80) }
        : {}),
    });
  }

  const keys = Object.keys(nextStore);
  if (keys.length > MAX_MEAL_PHOTO_STORE_ENTRIES) {
    const referencedInCurrent = new Set(metas.map((m) => m.hash));
    for (const k of keys) {
      if (Object.keys(nextStore).length <= MAX_MEAL_PHOTO_STORE_ENTRIES) break;
      if (!referencedInCurrent.has(k)) {
        delete nextStore[k];
      }
    }
  }

  return { photoStore: nextStore, metas };
}

function sumMacros(items: LoggedFoodItem[]) {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const it of items || []) {
    calories += Number(it?.macros?.calories) || 0;
    protein += Number(it?.macros?.protein) || 0;
    carbs += Number(it?.macros?.carbs) || 0;
    fat += Number(it?.macros?.fat) || 0;
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fat: Math.round(fat * 10) / 10,
  };
}

export function formatItemBrief(item: LoggedFoodItem): string {
  const grams = Math.round(Number(item.grams) || 0);
  const kcal = Math.round(Number(item.macros?.calories) || 0);
  const compCount = item.components?.length || 0;
  const compText = compCount > 0 ? ` · ${compCount} מרכיבים` : '';
  return `${grams}g · ${kcal} קק״ל${compText}`;
}

function itemContentSignature(item: LoggedFoodItem): string {
  const comps = (item.components || [])
    .map((c) => `${c.id}:${c.name}:${Math.round(c.grams * 10)}:${Math.round(c.macros?.calories || 0)}:${c.itemTime || ''}`)
    .join('|');
  return [
    item.name.trim(),
    Math.round((Number(item.grams) || 0) * 10),
    Math.round((Number(item.quantity) || 0) * 10),
    item.unitLabel || '',
    Math.round(Number(item.macros?.calories) || 0),
    Math.round((Number(item.macros?.protein) || 0) * 10),
    Math.round((Number(item.macros?.carbs) || 0) * 10),
    Math.round((Number(item.macros?.fat) || 0) * 10),
    item.itemTime || '',
    comps,
  ].join('::');
}

export function computeMealItemChanges(
  prevItems: LoggedFoodItem[],
  nextItems: LoggedFoodItem[]
): MealHistoryItemChange[] {
  const prevById = new Map((prevItems || []).map((it) => [it.id, it]));
  const nextById = new Map((nextItems || []).map((it) => [it.id, it]));
  const changes: MealHistoryItemChange[] = [];

  for (const nextIt of nextItems || []) {
    const prevIt = prevById.get(nextIt.id);
    if (!prevIt) {
      changes.push({
        itemId: nextIt.id,
        name: nextIt.name,
        changeKind: 'added',
        summary: formatItemBrief(nextIt),
      });
    } else if (itemContentSignature(prevIt) !== itemContentSignature(nextIt)) {
      let summary = formatItemBrief(nextIt);
      let prevSummary = formatItemBrief(prevIt);
      if (summary === prevSummary) {
        if ((prevIt.itemTime || '') !== (nextIt.itemTime || '')) {
          summary = `${summary} · שעה ${nextIt.itemTime || 'ברירת מחדל'}`;
          prevSummary = `${prevSummary} · שעה ${prevIt.itemTime || 'ברירת מחדל'}`;
        } else if (
          Math.round((Number(prevIt.macros?.protein) || 0) * 10) !==
            Math.round((Number(nextIt.macros?.protein) || 0) * 10) ||
          Math.round((Number(prevIt.macros?.carbs) || 0) * 10) !==
            Math.round((Number(nextIt.macros?.carbs) || 0) * 10) ||
          Math.round((Number(prevIt.macros?.fat) || 0) * 10) !==
            Math.round((Number(nextIt.macros?.fat) || 0) * 10)
        ) {
          summary = `${summary} (ח׳ ${nextIt.macros.protein}g · פ׳ ${nextIt.macros.carbs}g · ש׳ ${nextIt.macros.fat}g)`;
          prevSummary = `${prevSummary} (ח׳ ${prevIt.macros.protein}g · פ׳ ${prevIt.macros.carbs}g · ש׳ ${prevIt.macros.fat}g)`;
        } else if ((prevIt.unitLabel || '') !== (nextIt.unitLabel || '')) {
          summary = `${summary} · ${nextIt.unitLabel || '—'}`;
          prevSummary = `${prevSummary} · ${prevIt.unitLabel || '—'}`;
        } else if (prevIt.name.trim() !== nextIt.name.trim()) {
          summary = `${summary} · ${nextIt.name}`;
          prevSummary = `${prevSummary} · ${prevIt.name}`;
        }
      }
      changes.push({
        itemId: nextIt.id,
        name: nextIt.name,
        changeKind: 'updated',
        summary,
        prevSummary,
      });
    }
  }

  for (const prevIt of prevItems || []) {
    if (!nextById.has(prevIt.id)) {
      changes.push({
        itemId: prevIt.id,
        name: prevIt.name,
        changeKind: 'removed',
        summary: `הוסר (${formatItemBrief(prevIt)})`,
        prevSummary: formatItemBrief(prevIt),
        removedItem: stripTransientCoachBadges([prevIt])[0],
      });
    }
  }

  return changes;
}

export function appendMealHistoryEntry(
  prevMeal: LoggedMealEntry | undefined,
  nextItems: LoggedFoodItem[],
  params: {
    id?: string;
    timestamp?: string;
    kind: MealHistoryEventKind;
    actorId: string;
    actorName: string;
    actorRole: UserRole;
    summary?: string;
    prevMealTime?: string;
    nextMealTime?: string;
    aiDetail?: MealHistoryAiDetail;
    includeSnapshot?: boolean;
  }
): {
  history: MealHistoryEntry[];
  entry: MealHistoryEntry | null;
  itemChanges: MealHistoryItemChange[];
} {
  const prevItems = prevMeal?.items || [];
  const itemChanges = computeMealItemChanges(prevItems, nextItems);
  const mealTimeChanged =
    (params.nextMealTime || '') !== (params.prevMealTime ?? prevMeal?.mealTime ?? '');

  if (
    itemChanges.length === 0 &&
    !mealTimeChanged &&
    !params.aiDetail &&
    params.kind !== 'coach_feedback' &&
    params.kind !== 'ai_failed' &&
    params.kind !== 'rollback_snapshot'
  ) {
    return {
      history: prevMeal?.history || [],
      entry: null,
      itemChanges: [],
    };
  }

  const prevTotals = sumMacros(prevItems);
  const nextTotals = sumMacros(nextItems);
  const timestamp = params.timestamp || new Date().toISOString();
  const timeLabel = formatHebrewTimeLabel(timestamp);

  let autoSummary = params.summary || '';
  if (!autoSummary) {
    const addedCount = itemChanges.filter((c) => c.changeKind === 'added').length;
    const updatedCount = itemChanges.filter((c) => c.changeKind === 'updated').length;
    const removedCount = itemChanges.filter((c) => c.changeKind === 'removed').length;
    const parts: string[] = [];
    if (addedCount > 0) parts.push(`נוספו ${addedCount}`);
    if (updatedCount > 0) parts.push(`עודכנו ${updatedCount}`);
    if (removedCount > 0) parts.push(`הוסרו ${removedCount}`);
    if (mealTimeChanged) parts.push(`שעה ← ${params.nextMealTime || 'ברירת מחדל'}`);
    autoSummary =
      parts.length > 0
        ? parts.join(' · ')
        : params.kind === 'coach_feedback'
        ? 'המאמן הוסיף משוב לארוחה'
        : 'הארוחה עודכנה';
  }

  const entry: MealHistoryEntry = {
    id:
      params.id ||
      `mh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp,
    timeLabel,
    kind: params.kind,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    summary: autoSummary,
    deltaCalories: nextTotals.calories - prevTotals.calories,
    deltaProtein: Math.round((nextTotals.protein - prevTotals.protein) * 10) / 10,
    deltaCarbs: Math.round((nextTotals.carbs - prevTotals.carbs) * 10) / 10,
    deltaFat: Math.round((nextTotals.fat - prevTotals.fat) * 10) / 10,
    totalCaloriesAfter: nextTotals.calories,
    itemChanges: itemChanges.length > 0 ? itemChanges : undefined,
    aiDetail: params.aiDetail,
    itemsSnapshot:
      params.includeSnapshot !== false
        ? stripTransientCoachBadges(nextItems)
        : undefined,
    mealTimeSnapshot: params.nextMealTime ?? prevMeal?.mealTime,
  };

  const nextHistory = [entry, ...(prevMeal?.history || [])].slice(
    0,
    MAX_MEAL_HISTORY_ENTRIES
  );
  return { history: nextHistory, entry, itemChanges };
}

export function applyCoachDiffToMeal(params: {
  prevMeal?: LoggedMealEntry;
  nextMeal: LoggedMealEntry;
  coachId: string;
  coachName: string;
  nowIso?: string;
  slotName?: string;
}): {
  meal: LoggedMealEntry;
  changed: boolean;
  addedOrUpdatedCount: number;
  removedCount: number;
} {
  const { prevMeal, nextMeal, coachId, coachName, nowIso = new Date().toISOString() } = params;
  const prevItems = prevMeal?.items || [];
  const nextItems = nextMeal.items || [];
  const itemChanges = computeMealItemChanges(prevItems, nextItems);
  const feedbackChanged =
    (nextMeal.coachFeedback || '') !== (prevMeal?.coachFeedback || '') &&
    Boolean(nextMeal.coachFeedback?.trim());
  const mealTimeChanged =
    (nextMeal.mealTime || '') !== (prevMeal?.mealTime || '');

  if (itemChanges.length === 0 && !feedbackChanged && !mealTimeChanged) {
    const preservedPhotos = resolveMealPhotos(nextMeal);
    const fallbackPhotos =
      preservedPhotos.length > 0 ? preservedPhotos : resolveMealPhotos(prevMeal);
    return {
      meal: {
        ...nextMeal,
        ...(fallbackPhotos.length > 0
          ? {
              photoDataUrl: nextMeal.photoDataUrl || fallbackPhotos[0],
              photoDataUrls:
                nextMeal.photoDataUrls && nextMeal.photoDataUrls.length > 0
                  ? nextMeal.photoDataUrls
                  : fallbackPhotos,
            }
          : {}),
        history: nextMeal.history?.length ? nextMeal.history : prevMeal?.history,
        photoStore: nextMeal.photoStore || prevMeal?.photoStore,
        photoMetas: nextMeal.photoMetas || prevMeal?.photoMetas,
        coachEditState: nextMeal.coachEditState ?? prevMeal?.coachEditState,
        pendingCoachDeletedItems:
          nextMeal.pendingCoachDeletedItems ?? prevMeal?.pendingCoachDeletedItems,
      },
      changed: false,
      addedOrUpdatedCount: 0,
      removedCount: 0,
    };
  }

  const changeById = new Map(itemChanges.map((c) => [c.itemId, c]));
  const badgedItems: LoggedFoodItem[] = nextItems.map((it) => {
    const ch = changeById.get(it.id);
    if (ch?.changeKind === 'added') {
      return {
        ...it,
        coachBadge: 'new' as const,
        coachEditedAt: nowIso,
        coachEditedBy: coachName,
      };
    }
    if (ch?.changeKind === 'updated') {
      return {
        ...it,
        coachBadge: 'edited' as const,
        coachPrevSummary: ch.prevSummary,
        coachEditedAt: nowIso,
        coachEditedBy: coachName,
      };
    }
    return it;
  });

  const histRes = appendMealHistoryEntry(prevMeal, badgedItems, {
    timestamp: nowIso,
    kind: feedbackChanged && itemChanges.length === 0 ? 'coach_feedback' : 'coach_edit',
    actorId: coachId,
    actorName: coachName,
    actorRole: 'coach',
    prevMealTime: prevMeal?.mealTime,
    nextMealTime: nextMeal.mealTime,
    summary:
      itemChanges.length > 0
        ? `המאמן ${coachName} ערך את הארוחה`
        : feedbackChanged
        ? `המאמן ${coachName} הוסיף משוב`
        : `המאמן ${coachName} עדכן שעה ל-${nextMeal.mealTime || 'ברירת מחדל'}`,
  });

  const existingDeleted = prevMeal?.pendingCoachDeletedItems || [];
  const newDeleted: CoachDeletedItemNotice[] = itemChanges
    .filter((c) => c.changeKind === 'removed' && c.removedItem)
    .map((c) => ({
      id: `cdel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      item: c.removedItem!,
      coachName,
      deletedAt: nowIso,
      historyEventId: histRes.entry?.id || '',
    }));

  const summaryText = histRes.entry?.summary || `המאמן ${coachName} ערך את הארוחה`;

  const preservedAfterEdit = resolveMealPhotos(nextMeal);
  const fallbackAfterEdit =
    preservedAfterEdit.length > 0 ? preservedAfterEdit : resolveMealPhotos(prevMeal);

  return {
    meal: {
      ...nextMeal,
      ...(fallbackAfterEdit.length > 0
        ? {
            photoDataUrl: nextMeal.photoDataUrl || fallbackAfterEdit[0],
            photoDataUrls:
              nextMeal.photoDataUrls && nextMeal.photoDataUrls.length > 0
                ? nextMeal.photoDataUrls
                : fallbackAfterEdit,
          }
        : {}),
      items: badgedItems,
      photoStore: nextMeal.photoStore || prevMeal?.photoStore,
      photoMetas: nextMeal.photoMetas || prevMeal?.photoMetas,
      history: histRes.history,
      pendingCoachDeletedItems: [...newDeleted, ...existingDeleted].slice(0, 15),
      coachEditState: {
        unreadBanner: true,
        unreadBadges: true,
        lastCoachName: coachName,
        lastCoachId: coachId,
        lastEditedAt: nowIso,
        summaryText,
      },
    },
    changed: true,
    addedOrUpdatedCount: itemChanges.filter((c) => c.changeKind !== 'removed').length,
    removedCount: newDeleted.length,
  };
}

/**
 * בונה סיכום טקסטואלי-מובנה של היסטוריית הארוחה להזנה למודל ה-AI בצ'אט חדש
 * (ללא שכפול תמונות כבדות כברירת מחדל, ועם הצגת המצב החי הנוכחי למניעת כפילויות).
 */
export function buildCompactMealTimelineForAi(
  meal?: LoggedMealEntry
): string {
  if (!meal) return '';
  const sections: string[] = [];

  if (meal.items && meal.items.length > 0) {
    const liveLines = meal.items.map((it) => {
      const comps =
        it.components && it.components.length > 0
          ? ` [מורכב מ: ${it.components
              .map((c) => `${c.name} ${Math.round(c.grams)}g`)
              .join(', ')}]`
          : '';
      return `- ${it.name}: ${Math.round(it.grams)}g (${Math.round(
        it.macros?.calories || 0
      )} קק"ל, ח ${Math.round(it.macros?.protein || 0)}g, פ ${Math.round(
        it.macros?.carbs || 0
      )}g, ש ${Math.round(it.macros?.fat || 0)}g)${comps}`;
    });
    sections.push(
      `[מצב נוכחי ביומן הארוחה - כבר נשמר וספור, אין להכפיל אלא אם התבקש תיקון מפורש]:\n${liveLines.join(
        '\n'
      )}`
    );
  }

  const pastEvents = (meal.history || []).slice(0, 8).reverse();
  if (pastEvents.length > 0) {
    const histLines = pastEvents.map((ev) => {
      const extras: string[] = [];
      if (ev.aiDetail?.prompt) extras.push(`טקסט: "${ev.aiDetail.prompt.slice(0, 140)}"`);
      if (ev.aiDetail?.adjustmentPrompt) {
        extras.push(`בקשת תיקון: "${ev.aiDetail.adjustmentPrompt.slice(0, 140)}"`);
      }
      if (ev.aiDetail?.chips?.length) {
        extras.push(`תגיות: ${ev.aiDetail.chips.join(', ')}`);
      }
      if (ev.aiDetail?.photos?.length) {
        const labelNotes = ev.aiDetail.photos
          .map((p, idx) =>
            p.labelProductName
              ? `תמונה ${idx + 1}=תווית(${p.labelProductName})`
              : `תמונה ${idx + 1}=${p.angle}`
          )
          .join(', ');
        extras.push(`מדיה: ${labelNotes}`);
      }
      if (ev.aiDetail?.clarificationAnswers?.length) {
        const ans = ev.aiDetail.clarificationAnswers
          .map(
            (a) =>
              `בחירה: "${a.customProductName || a.selectedOption}"${
                a.gramsOrPortionText ? ` (${a.gramsOrPortionText})` : ''
              }`
          )
          .join('; ');
        extras.push(`הבהרת משתמש: ${ans}`);
      }
      const deltaStr =
        typeof ev.deltaCalories === 'number' && ev.deltaCalories !== 0
          ? ` (${ev.deltaCalories > 0 ? '+' : ''}${ev.deltaCalories} קק"ל)`
          : '';
      return `• [${ev.timeLabel}] ${ev.actorName} (${ev.kind}): ${ev.summary}${deltaStr}${
        extras.length > 0 ? ` | ${extras.join(' | ')}` : ''
      }`;
    });
    sections.push(
      `[היסטוריית עריכות ושליחות קודמות בארוחה זו (מהישן לחדש)]:\n${histLines.join(
        '\n'
      )}`
    );
  }

  return sections.join('\n\n');
}

export function resolveMealPhotos(
  meal?:
    | Pick<
        LoggedMealEntry,
        'photoDataUrl' | 'photoDataUrls' | 'photoStore' | 'photoMetas'
      >
    | null
): string[] {
  if (!meal) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  const pushValid = (raw?: string | null) => {
    if (!raw || typeof raw !== 'string') return;
    if (raw.endsWith(',DEMO')) return;
    if (seen.has(raw)) return;
    seen.add(raw);
    urls.push(raw);
  };

  if (Array.isArray(meal.photoDataUrls)) {
    for (const u of meal.photoDataUrls) pushValid(u);
  }
  pushValid(meal.photoDataUrl);
  if (meal.photoStore) {
    if (Array.isArray(meal.photoMetas)) {
      for (const m of meal.photoMetas) {
        if (m?.hash) pushValid(meal.photoStore[m.hash]);
      }
    }
    for (const storedUrl of Object.values(meal.photoStore)) {
      pushValid(storedUrl);
    }
  }
  return urls;
}

function snapshotItemComparisonKey(item: LoggedFoodItem): string {
  const comps = (item.components || [])
    .map((c) => snapshotItemComparisonKey(c))
    .sort()
    .join('|');
  return [
    (item.name || '').trim(),
    Math.round((Number(item.grams) || 0) * 10),
    Math.round((Number(item.quantity) || 0) * 10),
    item.unitLabel || '',
    Math.round(Number(item.macros?.calories) || 0),
    Math.round((Number(item.macros?.protein) || 0) * 10),
    Math.round((Number(item.macros?.carbs) || 0) * 10),
    Math.round((Number(item.macros?.fat) || 0) * 10),
    (item.itemTime || '').trim(),
    comps,
  ].join('::');
}

export function doesMealMatchHistorySnapshot(
  meal: LoggedMealEntry | undefined,
  entry: MealHistoryEntry
): boolean {
  if (!Array.isArray(entry.itemsSnapshot)) return false;
  const liveTime = (meal?.mealTime || '').trim();
  const snapTime = (entry.mealTimeSnapshot || '').trim();
  if (liveTime !== snapTime) return false;

  const liveItems = meal?.items || [];
  const snapItems = entry.itemsSnapshot;
  if (liveItems.length !== snapItems.length) return false;

  const liveSigs = liveItems.map(snapshotItemComparisonKey).sort();
  const snapSigs = snapItems.map(snapshotItemComparisonKey).sort();
  for (let i = 0; i < liveSigs.length; i++) {
    if (liveSigs[i] !== snapSigs[i]) return false;
  }
  return true;
}

export function normalizeSuggestedExtraName(raw?: string): string {
  return String(raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * מסנן הצעות AI נוספות שכבר אושרו ונוספו לרשימת הפריטים בארוחה (לפי מזהה או שם מנורמל)
 * או שסומנו כהתעלמות בסשן הפעיל, ומונע כפילויות.
 */
export function filterUnacceptedSuggestedExtras(
  extras: LoggedFoodItem[] | undefined,
  currentItems: LoggedFoodItem[] | undefined,
  dismissedKeys?: Set<string>
): LoggedFoodItem[] {
  if (!Array.isArray(extras) || extras.length === 0) return [];

  const existingIds = new Set<string>();
  const existingNames = new Set<string>();
  for (const item of currentItems || []) {
    if (!item) continue;
    if (item.id) existingIds.add(item.id);
    const normName = normalizeSuggestedExtraName(item.name);
    if (normName) existingNames.add(normName);
    if (Array.isArray(item.components) && item.components.length > 0) {
      for (const comp of item.components) {
        if (comp.id) existingIds.add(comp.id);
        const compNorm = normalizeSuggestedExtraName(comp.name);
        if (compNorm) existingNames.add(compNorm);
      }
    }
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const filtered: LoggedFoodItem[] = [];
  for (const ex of extras) {
    if (!ex) continue;
    if (ex.id && (existingIds.has(ex.id) || seenIds.has(ex.id) || dismissedKeys?.has(`id:${ex.id}`))) {
      continue;
    }
    const exNorm = normalizeSuggestedExtraName(ex.name);
    if (
      exNorm &&
      (existingNames.has(exNorm) || seenNames.has(exNorm) || dismissedKeys?.has(`name:${exNorm}`))
    ) {
      continue;
    }
    if (ex.id) seenIds.add(ex.id);
    if (exNorm) seenNames.add(exNorm);
    filtered.push(ex);
  }
  return filtered;
}
