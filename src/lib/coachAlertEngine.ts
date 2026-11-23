import {
  CoachAlertEventKey,
  CoachPushSubscriptionSettings,
  LoggedFoodItem,
  TraineeProfile,
} from '@/types/nutrition';
import { generateSecureId } from '@/lib/serverAuth';
import {
  canCoachAccessTrainee,
  getServerDbState,
  updateServerDbState,
} from '@/lib/serverStore';
import { dispatchPushToTargets } from '@/lib/pushDispatcher';

export interface DetectedCoachAlertEvent {
  type: CoachAlertEventKey;
  emoji: string;
  text: string;
  date: string;
}

function buildMealItemsSignature(items?: LoggedFoodItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map(
      (i) =>
        `${i.id}:${i.name}:${Number(i.grams) || 0}:${Math.round(Number(i.macros?.calories) || 0)}`
    )
    .join('|');
}

function formatDishLabel(items: LoggedFoodItem[]): string {
  const names = items.map((i) => i.name).filter(Boolean);
  if (names.length === 0) return 'ארוחה';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} ו${names[1]}`;
  return `${names[0]}, ${names[1]} ועוד ${names.length - 2}`;
}

export function buildMealAlertEvent(params: {
  slotName: string;
  items: LoggedFoodItem[];
  date: string;
}): DetectedCoachAlertEvent {
  const totalCal = Math.round(
    params.items.reduce((s, i) => s + (Number(i.macros?.calories) || 0), 0)
  );
  return {
    type: 'meals',
    emoji: '🍽️',
    text: `${params.slotName}: ${formatDishLabel(params.items)} (${totalCal} קק״ל)`,
    date: params.date,
  };
}

/**
 * משווה בין מצב המתאמן לפני השמירה למצב אחרי השמירה ומזהה אילו סוגי פעילות הוזנו הרגע
 */
export function detectTraineeActivityEvents(
  prevTrainee: TraineeProfile,
  nextTrainee: TraineeProfile
): DetectedCoachAlertEvent[] {
  const events: DetectedCoachAlertEvent[] = [];

  const slotNames = new Map<string, string>();
  for (const s of nextTrainee.workoutTemplate?.meals || []) {
    slotNames.set(s.id, s.name);
  }
  for (const s of nextTrainee.restTemplate?.meals || []) {
    if (!slotNames.has(s.id)) slotNames.set(s.id, s.name);
  }

  const nextLogs = nextTrainee.logs || {};
  const prevLogs = prevTrainee.logs || {};

  // 1. משקל (בדיקה לפי currentWeight או weightHistory)
  const prevHistLen = prevTrainee.weightHistory?.length || 0;
  const nextHist = nextTrainee.weightHistory || [];
  if (
    nextTrainee.currentWeight !== prevTrainee.currentWeight ||
    nextHist.length > prevHistLen
  ) {
    const latest = nextHist[nextHist.length - 1];
    const displayWeight = latest?.weight ?? nextTrainee.currentWeight;
    events.push({
      type: 'weight',
      emoji: '⚖️',
      text: `עדכון משקל: ${displayWeight} ק״ג`,
      date: latest?.date || '',
    });
  }

  for (const [dateKey, newDay] of Object.entries(nextLogs)) {
    if (!newDay || dateKey === '__profile_meta') continue;
    const prevDay = prevLogs[dateKey];

    // 2. ארוחות חדשות / שהשתנו
    for (const [slotId, newMeal] of Object.entries(newDay.meals || {})) {
      const items = newMeal?.items || [];
      if (items.length === 0) continue;
      const prevItems = prevDay?.meals?.[slotId]?.items || [];
      if (buildMealItemsSignature(items) !== buildMealItemsSignature(prevItems)) {
        const prevIds = new Set(prevItems.map((x) => x.id));
        const added = items.filter((x) => !prevIds.has(x.id));
        const relevant = added.length > 0 ? added : items;
        const slotName = slotNames.get(slotId) || slotId;
        events.push(
          buildMealAlertEvent({
            slotName,
            items: relevant,
            date: dateKey,
          })
        );
      }
    }

    // 3. אימון כוח / פעילות אימון
    const wPrev = prevDay?.workoutLog;
    const wNext = newDay.workoutLog;
    if (
      wNext?.completed &&
      (!wPrev?.completed ||
        wNext.workoutType !== wPrev.workoutType ||
        wNext.durationMinutes !== wPrev.durationMinutes)
    ) {
      events.push({
        type: 'workouts',
        emoji: '🏋️',
        text: `אימון הושלם: ${wNext.workoutType || 'אימון כוח'}${
          wNext.durationMinutes ? ` (${wNext.durationMinutes} דק׳)` : ''
        }`,
        date: dateKey,
      });
    }

    // אימון אירובי
    const cPrev = prevDay?.cardioLog;
    const cNext = newDay.cardioLog;
    if (
      cNext?.completed &&
      (!cPrev?.completed ||
        cNext.label !== cPrev.label ||
        cNext.durationMinutes !== cPrev.durationMinutes)
    ) {
      events.push({
        type: 'workouts',
        emoji: '🏃',
        text: `אירובי הושלם: ${cNext.label || 'פעילות אירובית'}${
          cNext.durationMinutes ? ` (${cNext.durationMinutes} דק׳)` : ''
        }`,
        date: dateKey,
      });
    }

    // 4. שתייה (כוסות מים)
    const prevWater = prevDay?.waterCups || 0;
    const nextWater = newDay.waterCups || 0;
    if (nextWater !== prevWater && nextWater > 0) {
      events.push({
        type: 'water',
        emoji: '💧',
        text: `שתייה: ${nextWater}/${newDay.waterGoal || 12} כוסות מים`,
        date: dateKey,
      });
    }
  }

  return events;
}

function canCoachIdAccessTrainee(
  coachId: string,
  trainee: TraineeProfile,
  coachesList: Array<{ id: string; email: string; name: string; status: 'active' | 'paused' }>
): boolean {
  if (coachId === 'coach-admin') return true;
  const coach = coachesList.find((c) => c.id === coachId);
  if (!coach || coach.status !== 'active') return false;
  return canCoachAccessTrainee(
    {
      id: coach.id,
      email: coach.email,
      name: coach.name,
      role: 'coach',
      status: coach.status,
    },
    trainee
  );
}

/**
 * שולח התראות Push מיידיות למאמנים שעוקבים אחרי המתאמן (ישירות או דרך קבוצה) וסימנו את סוגי ההזנות הללו
 */
export async function notifySubscribedCoachesForEvents(params: {
  trainee: TraineeProfile;
  events: DetectedCoachAlertEvent[];
  origin?: string;
}): Promise<void> {
  const { trainee, events, origin } = params;
  if (!events.length) return;

  const state = await getServerDbState();
  const settingsMap = state.coachPushSettings || {};
  const entries = Object.entries(settingsMap);
  if (entries.length === 0) return;

  const deadTargetsByCoach = new Map<
    string,
    { deadFcm: string[]; deadWeb: string[] }
  >();

  await Promise.all(
    entries.map(async ([coachId, cfg]: [string, CoachPushSubscriptionSettings]) => {
      if (!cfg || cfg.enabled === false) return;

      const fcmCount = cfg.fcmTokens?.length || 0;
      const webCount = cfg.webPushSubscriptions?.length || 0;
      if (fcmCount + webCount === 0) return;

      if (!canCoachIdAccessTrainee(coachId, trainee, state.coaches)) return;

      const matchesTrainee = (cfg.traineeIds || []).includes(trainee.id);
      const matchesGroup = Boolean(
        trainee.groupId && (cfg.groupIds || []).includes(trainee.groupId)
      );
      if (!matchesTrainee && !matchesGroup) return;

      const matchingEvents = events.filter((ev) => cfg.events?.[ev.type] === true);
      if (matchingEvents.length === 0) return;

      const lead = matchingEvents[0];
      const title = `${lead.emoji} עדכון חדש מ-${trainee.name}`;
      const body = matchingEvents.map((e) => e.text).join(' • ');

      const res = await dispatchPushToTargets({
        fcmTokens: cfg.fcmTokens,
        webPushSubscriptions: cfg.webPushSubscriptions,
        message: {
          pushId: generateSecureId('calert'),
          title,
          body,
          kind: 'coach-alert',
          screen: 'inspector',
          traineeId: trainee.id,
          date: lead.date || undefined,
          origin,
        },
      }).catch(() => null);

      if (
        res &&
        (res.invalidFcmTokens.length > 0 || res.expiredWebEndpoints.length > 0)
      ) {
        deadTargetsByCoach.set(coachId, {
          deadFcm: res.invalidFcmTokens,
          deadWeb: res.expiredWebEndpoints,
        });
      }
    })
  );

  if (deadTargetsByCoach.size > 0) {
    await updateServerDbState((prev) => {
      const nextMap: Record<string, CoachPushSubscriptionSettings> = {
        ...(prev.coachPushSettings || {}),
      };
      for (const [cid, dead] of Array.from(deadTargetsByCoach.entries())) {
        const cur = nextMap[cid];
        if (!cur) continue;
        const deadFcmSet = new Set(dead.deadFcm);
        const deadWebSet = new Set(dead.deadWeb);
        nextMap[cid] = {
          ...cur,
          fcmTokens: (cur.fcmTokens || []).filter((x) => !deadFcmSet.has(x.token)),
          webPushSubscriptions: (cur.webPushSubscriptions || []).filter(
            (x) => !deadWebSet.has(x.endpoint)
          ),
        };
      }
      return { ...prev, coachPushSettings: nextMap };
    }).catch(() => {});
  }
}
