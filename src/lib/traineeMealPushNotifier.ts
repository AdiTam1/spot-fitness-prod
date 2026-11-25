import { generateSecureId } from '@/lib/serverAuth';
import { updateServerDbState } from '@/lib/serverStore';
import {
  sendUnifiedPushToTrainee,
  shouldNotifyTraineeCoachMealChange,
  stripDeadPushTargetsFromTrainee,
} from '@/lib/pushDispatcher';
import {
  DailyLog,
  DayType,
  LoggedMealEntry,
  NutritionTemplate,
  TraineeProfile,
  TraineePushHistoryEntry,
} from '@/types/nutrition';

export interface CoachLoggedMealDelta {
  date: string;
  mealSlotId: string;
  mealSlotName: string;
  changeKind: 'added' | 'updated' | 'cleared';
  itemCount: number;
  totalCalories: number;
  summaryText: string;
}

function resolveMealSlotName(
  trainee: TraineeProfile,
  mealSlotId: string
): string {
  const fromWorkout = (trainee.workoutTemplate?.meals || []).find(
    (m) => m.id === mealSlotId
  )?.name;
  if (fromWorkout) return fromWorkout;
  const fromRest = (trainee.restTemplate?.meals || []).find(
    (m) => m.id === mealSlotId
  )?.name;
  return fromRest || mealSlotId;
}

function mealFingerprint(meal?: LoggedMealEntry): string {
  if (!meal) return 'empty';
  const itemsSig = (meal.items || [])
    .map(
      (i) =>
        `${i.name}|${Math.round(i.grams || 0)}|${i.itemTime || ''}|${Math.round(i.macros?.calories || 0)}|${
          Math.round((i.macros?.protein || 0) * 10)
        }|${Math.round((i.macros?.carbs || 0) * 10)}|${Math.round((i.macros?.fat || 0) * 10)}`
    )
    .join(';');
  return `${itemsSig}::${meal.mealTime || ''}::${meal.photoNote || ''}`;
}

export function detectCoachChangedLoggedMeals(
  prevTrainee: TraineeProfile,
  nextLogs?: Record<string, DailyLog>
): CoachLoggedMealDelta[] {
  if (!nextLogs) return [];
  const prevLogs = prevTrainee.logs || {};
  const allDates = new Set([...Object.keys(prevLogs), ...Object.keys(nextLogs)]);
  const deltas: CoachLoggedMealDelta[] = [];

  for (const date of Array.from(allDates).sort((a, b) => b.localeCompare(a))) {
    const prevMeals = prevLogs[date]?.meals || {};
    const nextMeals = nextLogs[date]?.meals || {};
    const allSlots = new Set([...Object.keys(prevMeals), ...Object.keys(nextMeals)]);

    for (const slotId of Array.from(allSlots)) {
      const prevMeal = prevMeals[slotId];
      const nextMeal = nextMeals[slotId];
      if (mealFingerprint(prevMeal) === mealFingerprint(nextMeal)) continue;

      const prevCount = prevMeal?.items?.length || 0;
      const nextCount = nextMeal?.items?.length || 0;
      if (prevCount === 0 && nextCount === 0 && !nextMeal?.mealTime && !nextMeal?.photoNote) {
        continue;
      }

      const totalCalories = Math.round(
        (nextMeal?.items || []).reduce(
          (sum, it) => sum + (Number(it.macros?.calories) || 0),
          0
        )
      );
      const mealSlotName = resolveMealSlotName(prevTrainee, slotId);

      let changeKind: CoachLoggedMealDelta['changeKind'] = 'updated';
      let summaryText = `${nextCount} מרכיבים (${totalCalories} קק״ל)`;
      if (prevCount === 0 && nextCount > 0) {
        changeKind = 'added';
        const firstNames = (nextMeal?.items || [])
          .slice(0, 2)
          .map((i) => i.name)
          .filter(Boolean)
          .join(', ');
        summaryText = firstNames
          ? `${firstNames}${nextCount > 2 ? ` ועוד ${nextCount - 2}` : ''} (${totalCalories} קק״ל)`
          : `${nextCount} מרכיבים (${totalCalories} קק״ל)`;
      } else if (prevCount > 0 && nextCount === 0) {
        changeKind = 'cleared';
        summaryText = 'המרכיבים בארוחה הוסרו';
      }

      deltas.push({
        date,
        mealSlotId: slotId,
        mealSlotName,
        changeKind,
        itemCount: nextCount,
        totalCalories,
        summaryText,
      });
    }
  }

  return deltas;
}

export function detectCoachChangedPlanMeals(
  prevTemplate: NutritionTemplate | undefined,
  nextTemplate: NutritionTemplate | undefined
): string[] {
  if (!nextTemplate) return [];
  const prevMeals = prevTemplate?.meals || [];
  const nextMeals = nextTemplate.meals || [];
  const prevById = new Map(prevMeals.map((m) => [m.id, m]));
  const changedNames: string[] = [];

  for (const nextSlot of nextMeals) {
    const prevSlot = prevById.get(nextSlot.id);
    if (!prevSlot) {
      changedNames.push(nextSlot.name);
      continue;
    }
    const optsA = (prevSlot.recommendedOptions || []).join('|');
    const optsB = (nextSlot.recommendedOptions || []).join('|');
    const changed =
      prevSlot.name !== nextSlot.name ||
      prevSlot.timeHint !== nextSlot.timeHint ||
      Math.round(prevSlot.targets?.calories || 0) !==
        Math.round(nextSlot.targets?.calories || 0) ||
      Math.round((prevSlot.targets?.protein || 0) * 10) !==
        Math.round((nextSlot.targets?.protein || 0) * 10) ||
      Math.round((prevSlot.targets?.carbs || 0) * 10) !==
        Math.round((nextSlot.targets?.carbs || 0) * 10) ||
      Math.round((prevSlot.targets?.fat || 0) * 10) !==
        Math.round((nextSlot.targets?.fat || 0) * 10) ||
      optsA !== optsB;
    if (changed) {
      changedNames.push(nextSlot.name || nextSlot.id);
    }
  }

  for (const prevSlot of prevMeals) {
    if (!nextMeals.some((m) => m.id === prevSlot.id)) {
      changedNames.push(prevSlot.name || prevSlot.id);
    }
  }

  return changedNames;
}

export interface CoachMealPushDispatchItem {
  trainee: TraineeProfile;
  coachName: string;
  title: string;
  body: string;
  screen: 'meal' | 'journal';
  mealSlotId?: string;
  date?: string;
  origin: string;
}

export async function dispatchCoachMealChangePushes(
  items: CoachMealPushDispatchItem[]
): Promise<void> {
  const eligible = items.filter((item) =>
    shouldNotifyTraineeCoachMealChange(item.trainee)
  );
  if (eligible.length === 0) return;

  const results = await Promise.all(
    eligible.map(async (item) => {
      const pushId = generateSecureId('push');
      const sentAt = new Date().toISOString();
      try {
        const res = await sendUnifiedPushToTrainee(item.trainee, {
          pushId,
          title: item.title,
          body: item.body,
          kind: 'coach',
          screen: item.screen,
          mealSlotId: item.mealSlotId,
          date: item.date,
          origin: item.origin,
        });
        const historyEntry: TraineePushHistoryEntry | undefined =
          res.sentCount > 0
            ? {
                id: pushId,
                title: item.title,
                body: item.body,
                sentAt,
                sentByCoachName: item.coachName,
                targetScreen: item.screen,
                targetMealSlotId: item.mealSlotId,
              }
            : undefined;
        return {
          traineeId: item.trainee.id,
          invalidFcmTokens: res.invalidFcmTokens,
          expiredWebEndpoints: res.expiredWebEndpoints,
          historyEntry,
        };
      } catch {
        return null;
      }
    })
  );

  const updatesByTrainee = new Map<
    string,
    {
      invalidFcm: string[];
      expiredWeb: string[];
      histories: TraineePushHistoryEntry[];
    }
  >();

  for (const r of results) {
    if (!r) continue;
    if (
      r.invalidFcmTokens.length === 0 &&
      r.expiredWebEndpoints.length === 0 &&
      !r.historyEntry
    ) {
      continue;
    }
    const prev = updatesByTrainee.get(r.traineeId) || {
      invalidFcm: [],
      expiredWeb: [],
      histories: [],
    };
    prev.invalidFcm.push(...r.invalidFcmTokens);
    prev.expiredWeb.push(...r.expiredWebEndpoints);
    if (r.historyEntry) prev.histories.push(r.historyEntry);
    updatesByTrainee.set(r.traineeId, prev);
  }

  if (updatesByTrainee.size === 0) return;

  await updateServerDbState((prev) => ({
    ...prev,
    trainees: prev.trainees.map((t) => {
      const upd = updatesByTrainee.get(t.id);
      if (!upd) return t;
      const cleaned = stripDeadPushTargetsFromTrainee(
        t,
        upd.invalidFcm,
        upd.expiredWeb
      );
      return {
        ...cleaned,
        pushHistory:
          upd.histories.length > 0
            ? [...upd.histories, ...(cleaned.pushHistory || [])].slice(0, 20)
            : cleaned.pushHistory || [],
      };
    }),
  })).catch(() => {});
}

export function buildPlanMealChangeSummary(
  changedSlots: string[],
  dayType: DayType
): string {
  const dayLabel = dayType === 'workout' ? 'יום אימון' : 'יום מנוחה';
  if (changedSlots.length === 0) {
    return `התפריט ל${dayLabel} עודכן ע״י המאמן.`;
  }
  const preview = changedSlots.slice(0, 3).join(', ');
  const rest = changedSlots.length > 3 ? ` ועוד ${changedSlots.length - 3}` : '';
  return `עודכנו הארוחות בתפריט (${dayLabel}): ${preview}${rest}`;
}
