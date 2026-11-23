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

export type ScraperSourceId =
  | 'victory'
  | 'nizat'
  | 'tevabari'
  | 'fuder'
  | 'foodgroups'
  | 'sugat'
  | 'tara'
  | 'berman'
  | 'foodsdictionary'
  | 'foodik'
  | 'netogreen'
  | 'moh_gov';

export type FoodCatalogSourceId =
  | ScraperSourceId
  | 'shufersal'
  | 'openfoodfacts'
  | 'local';

export interface SqlFoodCatalogStats {
  available: boolean;
  totalCount: number;
  bySource: Record<string, number>;
}

export type ScraperHealthStatus = 'healthy' | 'warning' | 'broken';

export interface ScraperHealthResult {
  id: ScraperSourceId;
  name: string;
  domain: string;
  category: string;
  mode: 'hybrid' | 'live' | 'sync';
  estimatedCatalogSize: string;
  description: string;
  targetUrl: string;
  status: ScraperHealthStatus;
  httpStatus: number;
  latencyMs: number;
  checkedAt: string;
  schemaValid: boolean;
  itemsExtracted: number;
  syncedCatalogCount: number;
  needsUpdate: boolean;
  sampleItem?: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    unitLabel?: string;
  };
  errorDiagnosis?: string;
}

export interface ScraperCheckHistoryEntry {
  checkedAt: string;
  trigger: 'auto' | 'manual' | 'cron';
  healthy: number;
  warning: number;
  broken: number;
}

export interface ScraperSuiteReport {
  lastCheckedAt: string | null;
  lastSyncedAt: string | null;
  nextAutoCheckAt: string | null;
  trigger: 'auto' | 'manual' | 'cron';
  totalHealthy: number;
  totalWarning: number;
  totalBroken: number;
  totalScrapedCatalogItems: number;
  results: ScraperHealthResult[];
  history: ScraperCheckHistoryEntry[];
  sqlCatalogStats?: SqlFoodCatalogStats;
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
  source?: 'local' | 'moh' | 'openfoodfacts' | 'scraper';
  sourceSiteId?: FoodCatalogSourceId;
  sourceSiteName?: string;
  sourceUrl?: string;
  updatedAt?: string;
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

export type StepsSyncSource =
  | 'health-connect'
  | 'play-services-local'
  | 'device-sensor'
  | 'manual';

export interface TraineeActivityTargets {
  weeklyWorkoutsTarget: number; // מינימום אימונים בשבוע
  workoutTypes: string[]; // סוגי אימונים שהמאמן הגדיר למתאמן
  weeklyCardioTarget: number; // מינימום הליכות / ריצות בשבוע
  cardioMode: 'walk' | 'run' | 'both';
  cardioTargetMinutes: number; // יעד דקות להליכה/ריצה
  dailySleepTargetHours: number; // יעד שעות שינה בלילה
  dailyStepsTarget?: number; // יעד צעדים יומי (ברירת מחדל: 8000)
}

export interface DailyLog {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  isObservationDay?: boolean;
  waterCups: number;
  waterGoal: number;
  weightKg?: number;
  sleepHours?: number;
  steps?: number;
  stepsSource?: StepsSyncSource;
  stepsSyncedAt?: string;
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

export interface PendingAiMealJob {
  id: string;
  targetTraineeId: string;
  date: string;
  mealSlotId: string;
  mealSlotName: string;
  mode: 'photo' | 'text';
  summaryHint?: string;
  status: 'processing' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  engine?: string;
  isAiFallback?: boolean;
  fallbackReason?: string;
  itemsCount?: number;
  errorMsg?: string;
  autoSyncedToLog?: boolean;
  acknowledged?: boolean;
}

export interface TraineeGroup {
  id: string;
  name: string;
  color: string;
  ownerCoachId: string;
  customQuickChips?: QuickContextChip[];
}

export interface TraineeFcmTokenEntry {
  token: string;
  platform: 'android';
  updatedAt: string;
  deviceLabel?: string;
}

export interface TraineeWebPushSubscriptionEntry {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  platform: 'ios-pwa' | 'web';
  updatedAt: string;
  deviceLabel?: string;
  isDeclarativeCapable?: boolean;
}

export interface TraineePushPreferences {
  aiMealReady: boolean;
  coachMessages: boolean;
}

export interface TraineePushHistoryEntry {
  id: string;
  title: string;
  body: string;
  sentAt: string;
  sentByCoachName?: string;
  targetScreen?: 'meal' | 'journal' | 'metrics' | 'profile';
  targetMealSlotId?: string;
}

export type CoachAlertEventKey = 'meals' | 'weight' | 'workouts' | 'water';

export interface CoachAlertEventsConfig {
  meals: boolean;
  weight: boolean;
  workouts: boolean;
  water: boolean;
}

export interface CoachPushSubscriptionSettings {
  coachId: string;
  enabled: boolean;
  traineeIds: string[];
  groupIds: string[];
  events: CoachAlertEventsConfig;
  webPushSubscriptions: TraineeWebPushSubscriptionEntry[];
  fcmTokens?: TraineeFcmTokenEntry[];
  updatedAt: string;
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
  pendingAiJobs?: PendingAiMealJob[]; // משימות פענוח AI שמתבצעות ברקע ומסתנכרנות אוטומטית ליומן
  fcmTokens?: TraineeFcmTokenEntry[]; // טוקנים רשומים של אפליקציית האנדרואיד (FCM)
  webPushSubscriptions?: TraineeWebPushSubscriptionEntry[]; // מנויי Web Push (אייפון במסך הבית + דפדפנים)
  pushPreferences?: TraineePushPreferences; // העדפות פושים של המתאמן
  lastForegroundState?: { isInForeground: boolean; updatedAt: string }; // מעקב חזית כדי לשלוח פוש AI רק אם יצא
  pushHistory?: TraineePushHistoryEntry[]; // היסטוריית פושים אחרונים למתאמן
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
