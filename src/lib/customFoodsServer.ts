import {
  customFoodToCatalogItem,
  resolveVisibleCustomFoodsForCoach,
  resolveVisibleCustomFoodsForTrainee,
} from '@/lib/customFoods';
import {
  canCoachAccessTrainee,
  getCustomFoodsContextForUser,
  getSingleTraineeFromServer,
} from '@/lib/serverStore';
import { AuthSessionUser, FoodCatalogItem } from '@/types/nutrition';

/**
 * טוען בזריזות את מוצרי המזון האישיים והמשותפים הרלוונטיים למשתמש הפעיל
 * עבור חיפוש ברקוד ופענוח AI עם בקרת הרשאות מלאה.
 */
export async function resolveVisibleCustomCatalogForActor(
  session: AuthSessionUser,
  traineeIdHint?: string
): Promise<FoodCatalogItem[]> {
  try {
    if (session.role === 'trainee') {
      const trainee = await getSingleTraineeFromServer(session.id);
      if (!trainee || trainee.status !== 'active') return [];
      const coachIds = [
        trainee.primaryCoachId,
        ...(trainee.sharedCoachIds || []),
      ].filter(Boolean);
      const foodsCtx = await getCustomFoodsContextForUser({ coachIds });
      return resolveVisibleCustomFoodsForTrainee(
        trainee,
        foodsCtx.coachCustomFoods,
        foodsCtx.globalCustomFoods
      ).map(customFoodToCatalogItem);
    }

    if (traineeIdHint) {
      const trainee = await getSingleTraineeFromServer(traineeIdHint);
      if (trainee && canCoachAccessTrainee(session, trainee)) {
        const coachIds = [
          trainee.primaryCoachId,
          ...(trainee.sharedCoachIds || []),
          session.id,
        ].filter(Boolean);
        const foodsCtx = await getCustomFoodsContextForUser({ coachIds });
        const forTrainee = resolveVisibleCustomFoodsForTrainee(
          trainee,
          foodsCtx.coachCustomFoods,
          foodsCtx.globalCustomFoods
        );
        return forTrainee.map(customFoodToCatalogItem);
      }
    }

    const foodsCtx = await getCustomFoodsContextForUser({
      coachIds: [session.id],
    });
    return resolveVisibleCustomFoodsForCoach(
      session.id,
      session.role,
      foodsCtx.coachCustomFoods,
      foodsCtx.globalCustomFoods
    ).map(customFoodToCatalogItem);
  } catch {
    return [];
  }
}
