export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealTemplateSlot {
  id: string;
  name: string;
  timeHint?: string;
  targets: MacroTargets;
}

export type DayType = 'workout' | 'rest';

export interface NutritionTemplate {
  id: string;
  name: string;
  description: string;
  dayType: DayType;
  tolerancePercent: number;
  meals: MealTemplateSlot[];
  ownerCoachId?: string; // 'coach-admin' עבור טמפלייט מערכתי ראשי, או מזהה מאמן ספציפי
}

export interface FoodUnit {
  label: string;
  grams: number;
}

export interface FoodCatalogItem {
  id: string;
  name: string;
  brand?: string;
  category: string;
  barcode?: string;
  per100g: MacroTargets;
  units: FoodUnit[];
  isPopular?: boolean;
  source?: 'local' | 'moh' | 'openfoodfacts';
}

export type FoodEntrySource =
  | 'ai-photo'
  | 'ai-text'
  | 'catalog'
  | 'barcode'
  | 'manual';

export interface LoggedFoodItem {
  id: string;
  name: string;
  unitLabel: string;
  quantity: number;
  grams: number;
  macros: MacroTargets;
  source: FoodEntrySource;
}

export interface LoggedMealEntry {
  mealSlotId: string;
  items: LoggedFoodItem[];
  photoDataUrl?: string;
  photoNote?: string;
  coachFeedback?: string;
  coachFeedbackAuthor?: string;
  coachFeedbackAt?: string;
  updatedAt: string;
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  waterCups: number;
  waterGoal: number;
  weightKg?: number;
  meals: Record<string, LoggedMealEntry>;
}

export type UserRole = 'admin' | 'coach' | 'trainee';
export type AccountStatus = 'active' | 'pending' | 'paused';

export interface CoachProfile {
  id: string;
  email: string;
  password?: string;
  name: string;
  avatar: string;
  phone: string;
  inviteCode: string;
  status: 'active' | 'paused';
  createdAt?: string;
}

export interface CoachDirectoryItem {
  id: string;
  name: string;
  isSuperAdmin?: boolean;
}

export interface TraineeGroup {
  id: string;
  name: string;
  color: string;
  ownerCoachId: string; // 'coach-admin' או מזהה המאמן שיצר את הקבוצה
}

export interface TraineeProfile {
  id: string;
  email: string;
  password?: string;
  status: AccountStatus;
  name: string;
  avatar: string;
  phone: string;
  goal: string;
  currentWeight: number;
  targetWeight: number;
  tolerancePercent: number;
  primaryCoachId: string; // 'coach-admin' או מזהה המאמן הראשי (הבעלים של המתאמן)
  sharedCoachIds: string[]; // מזהי מאמנים שותפים שקיבלו הרשאת ניהול מקצועי
  groupId?: string; // שיוך לקבוצת מתאמנים
  workoutTemplate: NutritionTemplate;
  restTemplate: NutritionTemplate;
  favoriteFoodIds: string[];
  weightHistory: { date: string; weight: number }[];
  logs: Record<string, DailyLog>;
  createdAt?: string;
}

export interface AuthSessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: AccountStatus;
}
