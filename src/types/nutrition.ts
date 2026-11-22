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
  recommendedOptions?: string[]; // אופציות ארוחה מומלצות של המאמן לארוחה זו
}

export type DayType = 'workout' | 'rest';

export interface NutritionTemplate {
  id: string;
  name: string;
  description: string;
  dayType: DayType;
  tolerancePercent: number;
  meals: MealTemplateSlot[];
  ownerCoachId?: string;
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
  aiEngine?: string;
  isAiFallback?: boolean;
  fallbackReason?: string;
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

export interface DailyWorkoutLog {
  completed: boolean;
  workoutType?: string;
  durationMinutes?: number;
  note?: string;
}

export interface DailyCardioLog {
  completed: boolean;
  mode?: 'walk' | 'run';
  label?: string;
  durationMinutes?: number;
}

export interface TraineeActivityTargets {
  weeklyWorkoutsTarget: number; // מינימום אימונים בשבוע
  workoutTypes: string[]; // סוגי אימונים שהמאמן הגדיר למתאמן
  weeklyCardioTarget: number; // מינימום הליכות / ריצות בשבוע
  cardioMode: 'walk' | 'run' | 'both';
  cardioTargetMinutes: number; // יעד דקות להליכה/ריצה
  dailySleepTargetHours: number; // יעד שעות שינה בלילה
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  isObservationDay?: boolean;
  waterCups: number;
  waterGoal: number;
  weightKg?: number;
  sleepHours?: number;
  workoutLog?: DailyWorkoutLog;
  cardioLog?: DailyCardioLog;
  meals: Record<string, LoggedMealEntry>;
}

export type UserRole = 'admin' | 'coach' | 'trainee';
export type AccountStatus = 'active' | 'pending' | 'paused';

export interface BodyMeasurementEntry {
  date: string;
  chestCm?: number;
  waistNavelCm?: number;
  armCm?: number;
  thighCm?: number;
  weightKg?: number;
}

export interface WeeklyCheckInEntry {
  id: string;
  date: string;
  weightKg: number;
  energyLevel: number; // 1..5
  hungerLevel: number; // 1..5
  sleepQuality: number; // 1..5
  note?: string;
}

export interface AiMealSuggestionOption {
  id: string;
  title: string;
  whyItFits: string;
  items: LoggedFoodItem[];
  totals: MacroTargets;
  aiEngine?: string;
  isAiFallback?: boolean;
  fallbackReason?: string;
}

export interface TraineeOnboardingData {
  completed: boolean;
  measurementsCompleted: boolean;
  age?: number;
  gender?: 'male' | 'female';
  heightCm?: number;
  activityLevel?: string;
  activityLevelNote?: string;
  strengthWorkoutsPerWeek?: string;
  strengthWorkoutsNote?: string;
  walkingSessionsPerWeek?: string;
  walkingSessionsNote?: string;
  sleepHours?: string;
  sleepHoursNote?: string;
  dietaryPreferences: string[];
  dietaryPreferencesNote?: string;
  favoriteMustHaveFoods: string[];
  favoriteMustHaveFoodsNote?: string;
  dislikedOrAllergies: string[];
  dislikedOrAllergiesNote?: string;
  eatingChallenges: string[];
  scheduleAndNotes?: string;
  estimatedBmr?: number;
  estimatedTdee?: number;
  completedAt?: string;
}

export interface CoachOnboardingData {
  completed: boolean;
  title?: string;
  specialties: string[];
  specialtiesNote?: string;
  welcomeMessage?: string;
  defaultObservationDays: number;
  defaultCountObservationInStats: boolean;
  defaultTolerancePercent: number;
  defaultWaterGoal: number;
  completedAt?: string;
}

export interface CoachProfile {
  id: string;
  email: string;
  password?: string;
  name: string;
  avatar: string;
  phone: string;
  inviteCode: string;
  status: 'active' | 'paused';
  onboarding?: CoachOnboardingData;
  createdAt?: string;
}

export interface CoachDirectoryItem {
  id: string;
  name: string;
  isSuperAdmin?: boolean;
}

export type QuickChipCategory =
  | 'sauce'
  | 'prep'
  | 'portion'
  | 'drink'
  | 'source'
  | 'tool-hint';

export interface QuickContextChip {
  id: string;
  label: string;
  category: QuickChipCategory;
  scope: 'user' | 'group' | 'global';
  groupId?: string;
  createdBy?: string;
  lastUsedAt?: string;
  useCount?: number;
}

export type ReferenceObjectKind =
  | 'credit-card'
  | 'coin-10'
  | 'coin-5'
  | 'cutlery'
  | 'none';

export type ServingToolKind = 'plate' | 'bowl' | 'box' | 'cup' | 'spoon' | 'custom';

export interface TraineeServingTool {
  id: string;
  name: string;
  kind: ServingToolKind;
  diameterCm?: number;
  depthCm?: number;
  volumeMl?: number;
  defaultFoodGrams?: number;
  notes?: string;
  measuredByAi?: boolean;
  referenceObject?: ReferenceObjectKind;
  confidenceNote?: string;
  updatedAt?: string;
}

export interface TraineeCustomUnit {
  id: string;
  unitName: string;
  foodNameKeyword?: string;
  grams: number;
  servingToolId?: string;
  notes?: string;
  updatedAt?: string;
}

export interface AiContextParams {
  servingToolId?: string;
  servingToolLabel?: string;
  servingToolDiameterCm?: number;
  servingToolDepthCm?: number;
  servingToolVolumeMl?: number;
  saucesAndOils?: string;
  portionOrGrams?: string;
  prepState?: string;
  drinksAndSides?: string;
  mealSource?: 'home' | 'restaurant' | 'packaged' | '';
  activeChipLabels?: string[];
  imageAngles?: ('top-down' | 'side-45' | 'label' | 'other')[];
  customUnits?: TraineeCustomUnit[];
}

export interface SavedMealCoachQuestion {
  id: string;
  question: string;
  askedAt: string;
  reply?: string;
  repliedAt?: string;
  repliedBy?: string;
  status: 'pending' | 'answered';
  recommendedPromoted?: boolean;
}

export interface SavedMealPreset {
  id: string;
  title: string;
  mealSlotId?: string;
  items: LoggedFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  photoDataUrls?: string[];
  photoDataUrl?: string;
  contextSummary?: string;
  contextParams?: AiContextParams;
  aiEngine?: string;
  isAiFallback?: boolean;
  fallbackReason?: string;
  isFavorite: boolean;
  isPinned: boolean;
  useCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  coachQuestion?: SavedMealCoachQuestion;
}

export interface TraineeGroup {
  id: string;
  name: string;
  color: string;
  ownerCoachId: string;
  customQuickChips?: QuickContextChip[];
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
  primaryCoachId: string;
  sharedCoachIds: string[];
  groupId?: string;
  workoutTemplate: NutritionTemplate;
  restTemplate: NutritionTemplate;
  favoriteFoodIds: string[];
  weightHistory: { date: string; weight: number }[];
  measurementsHistory?: BodyMeasurementEntry[];
  onboarding?: TraineeOnboardingData;
  activityTargets?: TraineeActivityTargets;
  enableWorkoutRestSplit?: boolean; // ברירת מחדל false - נפתח למתאמן רק אם המאמן הפעיל זאת
  coachAiNotes?: string; // הערות והנחיות מאמן שמוזרקות לפרומפט ה-AI
  aiLearnedPreferences?: string[]; // זיכרון העדפות נלמד מתגובות המתאמן להצעות AI
  weeklyCheckIns?: WeeklyCheckInEntry[];
  observationDates?: string[]; // תאריכי ימי תשקיף (YYYY-MM-DD)
  countObservationInStats?: boolean; // בחירת מאמן בקליק אם ימי תשקיף נספרים בחישוב היעדים או לא
  savedMeals?: SavedMealPreset[]; // ספריית ארוחות שמורות (מועדפים, נעיצה, פופולריות, התאמת AI, שאלות למאמן)
  customServingTools?: TraineeServingTool[]; // צלחות / קערות / קופסאות / כוסות מוגדרות אישית
  customFoodUnits?: TraineeCustomUnit[]; // יחידות מידה מוגדרות אישית בגרמים
  recentContextChips?: QuickContextChip[]; // צ'יפים מהירים פר-משתמש מסודרים לפי MRU
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
