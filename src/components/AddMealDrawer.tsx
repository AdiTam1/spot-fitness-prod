'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Drawer,
  Modal,
  TextInput,
  Textarea,
  NumberInput,
  Collapse,
  Switch,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Camera,
  Search,
  Sparkles,
  Barcode,
  Plus,
  Minus,
  Trash2,
  Check,
  Edit3,
  Heart,
  Wand2,
  Lightbulb,
  Mic,
  MicOff,
  FileText,
  Brain,
  Loader2,
  Bookmark,
  Image as ImageIcon,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  SlidersHorizontal,
  Utensils,
  FolderOpen,
  CalendarDays,
  Clock,
  Ruler,
  History,
  RefreshCw,
  Layers,
  CheckSquare,
  Minimize2,
  RotateCcw,
  AlertTriangle,
  Maximize2,
} from 'lucide-react';
import {
  AiContextParams,
  AiFailedDraftSnapshot,
  AiMealSuggestionOption,
  CustomFoodItem,
  DailyLog,
  FoodCatalogItem,
  LoggedFoodItem,
  LoggedMealEntry,
  MacroTargets,
  MealHistoryEntry,
  MealTemplateSlot,
  PendingAiMealJob,
  PhotoAngleKind,
  QuickContextChip,
  SavedMealPreset,
  TraineeCustomUnit,
  TraineeServingTool,
  UserFoodHistoryItem,
  UserRole,
} from '@/types/nutrition';
import {
  computePer100gFromServing,
  customFoodToCatalogItem,
} from '@/lib/customFoods';
import {
  CustomFoodModal,
  type CustomFoodsMutationResult,
} from './CustomFoodModal';
import { CustomFoodsLibraryPanel } from './CustomFoodsLibraryPanel';
import {
  ISRAELI_FOOD_CATALOG,
  calculateMacrosForGrams,
  getTodayIso,
  sumMacros,
} from '@/data/israeliFoodCatalog';
import {
  buildSearchCacheKey,
  canDisplayFoodSourceName,
  getCachedFoodSearch,
  getInstantLocalFoods,
  loadLocalFoodHistory,
  mergeLocalAndRemoteFoodResults,
  mergeServerAndLocalHistory,
  normalizeClientFoodText,
  RETAIL_SITE_OPTIONS,
  saveLocalFoodHistory,
  SEMANTIC_SOURCE_TABS,
  SemanticSourceGroup,
  setCachedFoodSearch,
  upsertLocalHistoryList,
} from '@/lib/foodSearchClient';
import {
  FEATURED_ISRAELI_BRANDS,
  getDisplayBrandForFood,
  matchesBrandSelection,
} from '@/lib/foodBrands';
import { compressMealImage } from '@/utils/imageCompression';
import {
  compressDataUrlToThumbnail,
  HEBREW_MONTH_NAMES,
} from '@/lib/dateUtils';
import {
  normalizeHhMmTime,
  parseOptionalDecimal,
  sanitizeIntegerInput,
} from '@/lib/numericInput';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ServingToolsManagerModal } from './ServingToolsManagerModal';
import { GlassButton } from './ui/GlassButton';
import { ItemTimePill } from './ui/ItemTimePill';
import { SegmentedPill } from './ui/SegmentedPill';
import { SavedMealsLibraryTab } from './SavedMealsLibraryTab';
import { AiQuickContextPanel } from './AiQuickContextPanel';
import { AiClarificationCard } from './AiClarificationCard';
import { MealHistoryPanel } from './MealHistoryPanel';
import { CompositeDishRow, type ItemFieldDraft } from './CompositeDishRow';
import { useAiProgressMessage } from './BackgroundAiSyncBanner';
import {
  clearFailedAiDraft,
  loadFailedAiDraft,
  saveFailedAiDraft,
} from '@/lib/aiDraftStore';
import {
  cloneFoodItemWithFreshIds,
  extractSelectedItemsForPreset,
  filterUnacceptedSuggestedExtras,
  groupItemsAsCompositeDish,
  hasCompositeComponents,
  normalizeSuggestedExtraName,
  recalculateParentDish,
  removeSelectedFromItems,
  stripNestedComponents,
} from '@/lib/compositeDishes';
import {
  startUnifiedVoiceCapture,
  VoiceCaptureController,
  VoiceCaptureState,
} from '@/lib/voiceRecorder';
import {
  handlePossibleAuthRejection,
  useSpotUnsavedEditing,
} from '@/lib/webVersionGuard';
import { resolveMealPhotos } from '@/lib/mealHistory';
import {
  getClientRuntimeContext,
  trackClientEvent,
} from '@/lib/telemetry/clientTracker';

function formatDrawerDateLabel(selectedDate?: string): { dayTag: string; shortDate: string } | null {
  if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return null;
  const todayIso = getTodayIso();
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const monthShort = (HEBREW_MONTH_NAMES[dt.getMonth()] || '').slice(0, 4);
  const shortDate = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  if (selectedDate === todayIso) return { dayTag: 'היום', shortDate };
  const tParts = todayIso.split('-').map(Number);
  const yest = new Date(tParts[0], tParts[1] - 1, tParts[2] - 1);
  const yestIso = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`;
  if (selectedDate === yestIso) return { dayTag: 'אתמול', shortDate };
  const weekNames = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'];
  return { dayTag: `${weekNames[dt.getDay()]} · ${d} ${monthShort}`, shortDate };
}

interface AddMealDrawerProps {
  opened: boolean;
  onClose: () => void;
  mealSlot: MealTemplateSlot | null;
  /** All meal slots of the active day — drives the meal-type segmented control on the hub. */
  mealSlotOptions?: MealTemplateSlot[];
  /** Switch the drawer to another meal slot (from the hub segmented control). */
  onChangeMealSlot?: (slot: MealTemplateSlot) => void;
  existingEntry?: LoggedMealEntry;
  favoriteIds: string[];
  onToggleFavorite: (foodId: string) => void;
  onSaveMeal: (
    mealSlotId: string,
    items: LoggedFoodItem[],
    photoDataUrl?: string,
    photoNote?: string,
    photoDataUrls?: string[],
    mealTime?: string,
    aiSuggestedExtras?: LoggedFoodItem[]
  ) => void | Promise<void>;
  geminiApiKey?: string;
  initialTab?: string;
  isObservationDay?: boolean;
  traineeId?: string;
  traineeName?: string;
  learnedPreferences?: string[];
  showLearnedPreferences?: boolean;
  onPreferenceLearned?: (prefs: string[]) => void;
  savedMeals?: SavedMealPreset[];
  customServingTools?: TraineeServingTool[];
  customFoodUnits?: TraineeCustomUnit[];
  recentContextChips?: QuickContextChip[];
  groupQuickChips?: QuickContextChip[];
  globalQuickChips?: QuickContextChip[];
  traineeLogs?: Record<string, DailyLog>;
  onSavedMealAction?: (payload: {
    op:
      | 'upsert'
      | 'toggle-pin'
      | 'toggle-favorite'
      | 'increment-use'
      | 'ask-question'
      | 'delete';
    preset?: Partial<SavedMealPreset>;
    presetId?: string;
    question?: string;
  }) => Promise<{ error?: string }>;
  onManageToolsAndUnits?: (payload: {
    customServingTools?: TraineeServingTool[];
    customFoodUnits?: TraineeCustomUnit[];
  }) => Promise<{ error?: string }>;
  onManageQuickChips?: (payload: {
    scope: 'user' | 'group' | 'coach-trainees' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
  actorRole?: UserRole;
  isCoachPreview?: boolean;
  recentLabelProducts?: string[];
  externalOpenAdjustNonce?: number;
  externalClarificationJobId?: string;
  onMarkCoachBadgesRead?: (mealSlotId: string) => void;
  onRestoreCoachDeletedItem?: (payload: {
    mealSlotId: string;
    noticeId?: string;
    historyEventId?: string;
    itemId?: string;
  }) => Promise<void>;
  onRollbackMealHistory?: (payload: {
    mealSlotId: string;
    historyEntryId: string;
  }) => Promise<void>;
  onRefreshDataFromServer?: () => void;
  showScraperSources?: boolean;
  semanticSearchEnabled?: boolean;
  customFoods?: CustomFoodItem[];
  onCustomFoodsUpdated?: (res: CustomFoodsMutationResult) => void;
  selectedDate?: string;
  backgroundAiJobs?: PendingAiMealJob[];
  onStartBackgroundAiAnalysis?: (payload: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    mealSlotName: string;
    mode: 'photo' | 'text' | 'adjust';
    imageDataUrl?: string;
    imageDataUrls?: string[];
    imageMetas?: { angle: PhotoAngleKind; labelProductName?: string }[];
    textPrompt?: string;
    baseItems?: LoggedFoodItem[];
    selectedTargetIds?: string[];
    correctionHistory?: { beforeNames?: string[]; prompt: string; at?: string }[];
    adjustmentPrompt?: string;
    contextParams?: AiContextParams;
  }) => Promise<{ jobId: string }>;
  onAcknowledgeAiJob?: (jobId: string, traineeId?: string) => void | Promise<void>;
  onCancelAiJob?: (jobId: string, traineeId?: string) => void | Promise<void>;
}

export function AddMealDrawer({
  opened,
  onClose,
  mealSlot,
  existingEntry,
  favoriteIds,
  onToggleFavorite,
  onSaveMeal,
  geminiApiKey,
  initialTab = 'catalog',
  isObservationDay = false,
  traineeId,
  traineeName,
  learnedPreferences = [],
  showLearnedPreferences = false,
  onPreferenceLearned,
  savedMeals = [],
  mealSlotOptions = [],
  onChangeMealSlot,
  customServingTools = [],
  customFoodUnits = [],
  recentContextChips = [],
  groupQuickChips = [],
  globalQuickChips = [],
  traineeLogs = {},
  onSavedMealAction,
  onManageToolsAndUnits,
  onManageQuickChips,
  actorRole = 'trainee',
  isCoachPreview = false,
  recentLabelProducts = [],
  externalOpenAdjustNonce = 0,
  externalClarificationJobId,
  onMarkCoachBadgesRead,
  onRestoreCoachDeletedItem,
  onRollbackMealHistory,
  onRefreshDataFromServer,
  showScraperSources = false,
  semanticSearchEnabled = false,
  customFoods = [],
  onCustomFoodsUpdated,
  selectedDate,
  backgroundAiJobs = [],
  onStartBackgroundAiAnalysis,
  onAcknowledgeAiJob,
  onCancelAiJob,
}: AddMealDrawerProps) {
  useSpotUnsavedEditing('add-meal-drawer', opened);
  const [activeTab, setActiveTab] = useState<string>(initialTab || 'hub');
  const [tabHistory, setTabHistory] = useState<string[]>([initialTab || 'hub']);
  const barcodeStandaloneRef = useRef(false);
  const isDesignHeader = activeTab === 'ai-recommend' || activeTab === 'saved-meals';
  const [items, setItems] = useState<LoggedFoodItem[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    undefined
  );
  const [photoItems, setPhotoItems] = useState<
    {
      dataUrl: string;
      sizeKB: number;
      formatLabel: 'WebP' | 'JPEG';
      angle: PhotoAngleKind;
      labelProductName?: string;
      labelInputOpen?: boolean;
    }[]
  >([]);
  const [photoSizeKB, setPhotoSizeKB] = useState<number | null>(null);
  const [photoFormatLabel, setPhotoFormatLabel] = useState<'WebP' | 'JPEG'>('WebP');
  const [photoNote, setPhotoNote] = useState('');
  const [includePreviousMealPhotos, setIncludePreviousMealPhotos] = useState(false);
  const [progressFloatingCollapsed, setProgressFloatingCollapsed] = useState(false);
  const [highlightedHistoryEventId, setHighlightedHistoryEventId] = useState<string | null>(null);
  const [freeTextPrompt, setFreeTextPrompt] = useState('');
  const [contextParams, setContextParams] = useState<AiContextParams>({});
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [customFoodModalOpen, setCustomFoodModalOpen] = useState(false);
  const [customFoodInitialName, setCustomFoodInitialName] = useState('');
  const [editingCustomFood, setEditingCustomFood] = useState<CustomFoodItem | null>(null);
  const [customFoodsManagerOpen, setCustomFoodsManagerOpen] = useState(false);
  const [savedMealsInitialFilter, setSavedMealsInitialFilter] = useState<'all' | 'history' | 'questions'>('all');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionVoiceState, setCorrectionVoiceState] = useState<VoiceCaptureState>('idle');
  const [suggestedExtras, setSuggestedExtras] = useState<LoggedFoodItem[]>([]);
  const [preCorrectionItems, setPreCorrectionItems] = useState<LoggedFoodItem[] | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupDishTitle, setGroupDishTitle] = useState('');
  const [correctionHistory, setCorrectionHistory] = useState<
    { beforeNames?: string[]; prompt: string; at?: string }[]
  >([]);
  const [learnedRuleHint, setLearnedRuleHint] = useState<string | null>(null);
  const [savingRuleHint, setSavingRuleHint] = useState(false);
  const [targetDishIdForAdd, setTargetDishIdForAdd] = useState<string | null>(null);
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [savePresetAsSingleDish, setSavePresetAsSingleDish] = useState(false);
  const [presetTitleInput, setPresetTitleInput] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>('idle');
  const [dismissedFailedJobId, setDismissedFailedJobId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<{
    msg: string;
    isError?: boolean;
    engine?: string;
    isFallback?: boolean;
    fallbackReason?: string;
  } | null>(null);

  useEffect(() => {
    if (!aiSummary || aiSummary.isError) return;
    const t = setTimeout(() => {
      setAiSummary(null);
    }, 5500);
    return () => clearTimeout(t);
  }, [aiSummary]);

  const [aiRecommendations, setAiRecommendations] = useState<AiMealSuggestionOption[]>([]);
  const [aiRecDebug, setAiRecDebug] = useState<{
    engine?: string;
    isFallback?: boolean;
    fallbackReason?: string;
    appliedContextSummary?: string;
  } | null>(null);
  const [aiRecLoading, setAiRecLoading] = useState(false);
  const [preferenceFeedbackText, setPreferenceFeedbackText] = useState('');
  const [learningPrefLoading, setLearningPrefLoading] = useState(false);
  const [learnedFeedbackBanner, setLearnedFeedbackBanner] = useState<{
    msg: string;
    isError?: boolean;
    engine?: string;
    isFallback?: boolean;
    fallbackReason?: string;
  } | null>(null);

  const canShowScraperSources = actorRole === 'admin' && Boolean(showScraperSources);
  const [semanticSearchActive, setSemanticSearchActive] = useState<boolean>(
    Boolean(semanticSearchEnabled)
  );
  useEffect(() => {
    setSemanticSearchActive(Boolean(semanticSearchEnabled));
  }, [semanticSearchEnabled]);
  const [usedSemanticRrf, setUsedSemanticRrf] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceGroup, setSourceGroup] = useState<SemanticSourceGroup>('all');
  const [retailSubSite, setRetailSubSite] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [remoteAvailableBrands, setRemoteAvailableBrands] = useState<string[]>([]);
  const [personalHistory, setPersonalHistory] = useState<UserFoodHistoryItem[]>([]);
  const [remoteResults, setRemoteResults] = useState<FoodCatalogItem[]>([]);
  const [hasRemoteSynced, setHasRemoteSynced] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSkeletons, setShowSkeletons] = useState(false);
  const [liveExpanding, setLiveExpanding] = useState(false);
  const [canManualExpandLive, setCanManualExpandLive] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRetryNonce, setSearchRetryNonce] = useState(0);
  const [activeResultIndex, setActiveResultIndex] = useState<number>(-1);
  const [mohCount, setMohCount] = useState(0);
  const [scraperCount, setScraperCount] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(ISRAELI_FOOD_CATALOG.length);

  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(null);
  const [selectedUnitLabel, setSelectedUnitLabel] = useState<string>('custom-grams');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [customGrams, setCustomGrams] = useState<number | string>(100);
  const [customItemTime, setCustomItemTime] = useState<string>('');
  const [cameraChooserOpen, setCameraChooserOpen] = useState(false);
  const [mealItemsPhotoPickerOpen, setMealItemsPhotoPickerOpen] = useState(false);
  const [heroLightboxOpen, setHeroLightboxOpen] = useState(false);
  const [activeHeroPhotoIdx, setActiveHeroPhotoIdx] = useState(0);
  const heroSwipeTouchStartRef = useRef<{ x: number; y: number } | null>(null);
  const heroSwipedRecentlyRef = useRef(false);
  const [saveSelectedPresetOpen, setSaveSelectedPresetOpen] = useState(false);
  const [saveSelectedPresetTitle, setSaveSelectedPresetTitle] = useState('');
  const [saveSelectedAsSingleDish, setSaveSelectedAsSingleDish] = useState(false);
  const [savingSelectedPreset, setSavingSelectedPreset] = useState(false);
  const [fsZoomScale, setFsZoomScale] = useState(1);
  const [fsPanOffset, setFsPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fsGestureActive, setFsGestureActive] = useState(false);
  const fsStageRef = useRef<HTMLDivElement | null>(null);
  const fsLastTapTsRef = useRef<number>(0);
  const fsGestureRef = useRef<{
    mode: 'none' | 'pinch' | 'pan' | 'swipe';
    startDist: number;
    startScale: number;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
  }>({
    mode: 'none',
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
  });
  const [mealTime, setMealTime] = useState<string>('');
  const [toolsInitialSection, setToolsInitialSection] = useState<'tools' | 'units'>('units');
  const [enrichingFood, setEnrichingFood] = useState(false);
  const [inlineUnitOpen, setInlineUnitOpen] = useState(false);
  const [inlineUnitName, setInlineUnitName] = useState('');
  const [inlineUnitGrams, setInlineUnitGrams] = useState<number | string>(100);
  const [inlineUnitForFoodOnly, setInlineUnitForFoodOnly] = useState(true);
  const [savingInlineUnit, setSavingInlineUnit] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemFieldDrafts, setItemFieldDrafts] = useState<
    Record<
      string,
      Partial<Record<'grams' | 'calories' | 'protein' | 'carbs' | 'fat', string | number>>
    >
  >({});
  const itemScaleBaseRef = useRef<
    Record<string, { grams: number; macros: { calories: number; protein: number; carbs: number; fat: number } }>
  >({});
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [addingOptionIdx, setAddingOptionIdx] = useState<number | null>(null);

  const voiceControllerRef = useRef<VoiceCaptureController | null>(null);
  const voiceBaseTextRef = useRef<string>('');
  const correctionVoiceCtrlRef = useRef<VoiceCaptureController | null>(null);
  const correctionVoiceBaseRef = useRef<string>('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const aiTextRef = useRef<HTMLTextAreaElement | null>(null);
  const aiLockRef = useRef(false);
  const recLockRef = useRef(false);
  const prefLockRef = useRef(false);
  const saveLockRef = useRef(false);
  const activeSearchAbortRef = useRef<AbortController | null>(null);
  const liveExpandAbortRef = useRef<AbortController | null>(null);
  const searchAbortedByUserRef = useRef(false);
  const fgAiAbortRef = useRef<AbortController | null>(null);
  const aiRecAbortRef = useRef<AbortController | null>(null);
  const fgAdjustAbortRef = useRef<AbortController | null>(null);
  const enrichAbortRef = useRef<AbortController | null>(null);
  const pendingBgAdjustDraftRef = useRef<{
    prompt: string;
    targetIds?: string[];
    wasSelectionMode: boolean;
    selectedIdsSnapshot: string[];
  } | null>(null);

  const navigateTab = (nextTab: string, options?: { replace?: boolean }) => {
    const resolvedTab = nextTab === 'favorites' ? 'catalog' : nextTab;
    if (nextTab === 'favorites') {
      setSourceGroup('favorites_recent');
    }
    setMealItemsPhotoPickerOpen(false);
    setTabHistory((prev) => {
      if (options?.replace) {
        return prev.length > 0 ? [...prev.slice(0, -1), resolvedTab] : [resolvedTab];
      }
      const top = prev[prev.length - 1];
      if (top === resolvedTab) return prev;
      return [...prev, resolvedTab];
    });
    setActiveTab(resolvedTab);
  };

  const handleDrawerBack = () => {
    if (savingMeal) return;
    if (activeTab === 'hub' && searchQuery.trim().length > 0) {
      setSearchQuery('');
      return;
    }
    if (tabHistory.length > 1) {
      const nextHistory = tabHistory.slice(0, -1);
      const prevTab = nextHistory[nextHistory.length - 1] || 'hub';
      setTabHistory(nextHistory);
      setActiveTab(prevTab);
      return;
    }
    onClose();
  };

  const stopVoiceRecording = (commit = false) => {
    const ctrl = voiceControllerRef.current;
    voiceControllerRef.current = null;
    if (ctrl) {
      try {
        if (commit) ctrl.stop();
        else ctrl.cancel();
      } catch {
        // ignore
      }
    }
    if (!commit) {
      setVoiceState('idle');
    }
  };

  const stopCorrectionVoice = (commit = false) => {
    const ctrl = correctionVoiceCtrlRef.current;
    correctionVoiceCtrlRef.current = null;
    if (ctrl) {
      try {
        if (commit) ctrl.stop();
        else ctrl.cancel();
      } catch {
        // ignore
      }
    }
    if (!commit) {
      setCorrectionVoiceState('idle');
    }
  };

  const hadInitialItemsRef = useRef(false);
  const lastOpenedKeyRef = useRef<string>('');
  const pendingAdjustReplaceRef = useRef(false);
  const appliedAdjustJobIdsRef = useRef<Set<string>>(new Set());
  const slotBgProcessingJob =
    opened && mealSlot
      ? backgroundAiJobs.find(
          (j) =>
            j.status === 'processing' &&
            j.mealSlotId === mealSlot.id &&
            (!selectedDate || j.date === selectedDate)
        )
      : undefined;
  const slotBgClarifyJob =
    opened && mealSlot
      ? backgroundAiJobs.find(
          (j) =>
            j.status === 'awaiting_clarification' &&
            !j.acknowledged &&
            (externalClarificationJobId ? j.id === externalClarificationJobId : true) &&
            j.mealSlotId === mealSlot.id &&
            (!selectedDate || j.date === selectedDate)
        )
      : undefined;
  const slotBgFailedJob =
    opened && mealSlot
      ? backgroundAiJobs.find(
          (j) =>
            j.status === 'failed' &&
            !j.acknowledged &&
            j.mealSlotId === mealSlot.id &&
            (!selectedDate || j.date === selectedDate)
        )
      : undefined;
  const sawUnreadCoachBadgesSlotRef = useRef<string | null>(null);
  const prefilledFailedSectionsRef = useRef<Set<string>>(new Set());
  const dismissedExtrasKeysRef = useRef<Set<string>>(new Set());
  const itemsRef = useRef<LoggedFoodItem[]>(items);
  itemsRef.current = items;
  const isSlotBgProcessing = Boolean(slotBgProcessingJob);
  const progressTicker = useAiProgressMessage(
    aiLoading || isSlotBgProcessing,
    slotBgProcessingJob?.startedAt
  );

  useEffect(() => {
    if (opened && mealSlot) {
      const openKey = `${mealSlot.id}::${selectedDate || ''}::${initialTab}`;
      const entryPhotos = resolveMealPhotos(existingEntry);

      if (lastOpenedKeyRef.current !== openKey) {
        lastOpenedKeyRef.current = openKey;
        hadInitialItemsRef.current = Boolean(existingEntry?.items?.length);
        setItems(existingEntry?.items ? [...existingEntry.items] : []);
        dismissedExtrasKeysRef.current = new Set();
        setSuggestedExtras(
          filterUnacceptedSuggestedExtras(
            existingEntry?.aiSuggestedExtras,
            existingEntry?.items
          )
        );
        setPreCorrectionItems(null);
        setCorrectionError(null);
        setSelectionMode(false);
        setSelectedIds(new Set());
        setGroupModalOpen(false);
        setGroupDishTitle('');
        setCorrectionHistory([]);
        setLearnedRuleHint(null);
        setTargetDishIdForAdd(null);
        stopCorrectionVoice(false);
        setPhotoDataUrl(entryPhotos[0] || existingEntry?.photoDataUrl);
        setPhotoItems([]);
        setPhotoSizeKB(null);
        setPhotoFormatLabel('WebP');
        setPhotoNote('');
        setIncludePreviousMealPhotos(false);
        setFreeTextPrompt('');
        setHighlightedHistoryEventId(null);
        setProgressFloatingCollapsed(false);
        prefilledFailedSectionsRef.current = new Set();
        setContextParams({ customUnits: customFoodUnits });
        setSaveAsPreset(false);
        setSavePresetAsSingleDish(false);
        setPresetTitleInput('');
        setSearchQuery('');
        setSourceGroup('all');
        setRetailSubSite('all');
        setSelectedBrand('all');
        setRemoteAvailableBrands([]);
        setRemoteResults([]);
        setHasRemoteSynced(false);
        setSearchError(null);
        setCanManualExpandLive(false);
        setActiveResultIndex(-1);
        setSelectedFood(null);
        setCameraChooserOpen(false);
        setMealItemsPhotoPickerOpen(false);
        setHeroLightboxOpen(false);
        setActiveHeroPhotoIdx(0);
        setFsZoomScale(1);
        setFsPanOffset({ x: 0, y: 0 });
        setSaveSelectedPresetOpen(false);
        pendingBgAdjustDraftRef.current = null;
        setMealTime(existingEntry?.mealTime || mealSlot.timeHint || '');
        setInlineUnitOpen(false);
        setInlineUnitName('');
        setInlineUnitGrams(100);
        setCustomItemTime('');
        setEnrichingFood(false);
        setAiRecommendations([]);
        setAiRecDebug(null);
        setLearnedFeedbackBanner(null);
        setPreferenceFeedbackText('');
        setEditingItemId(null);
        setItemFieldDrafts({});
        itemScaleBaseRef.current = {};
        setDismissedFailedJobId(null);
        setAiSummary(null);
        setSavedMealsInitialFilter('all');
        pendingAdjustReplaceRef.current = false;
        if (initialTab === 'barcode') {
          barcodeStandaloneRef.current = true;
          setTabHistory(['hub']);
          setActiveTab('hub');
          setBarcodeModalOpen(true);
        } else if (initialTab === 'favorites') {
          barcodeStandaloneRef.current = false;
          setSourceGroup('favorites_recent');
          setTabHistory(['catalog']);
          setActiveTab('catalog');
        } else {
          const startTab = initialTab || 'hub';
          barcodeStandaloneRef.current = false;
          setTabHistory([startTab]);
          setActiveTab(startTab);
        }
        stopVoiceRecording(false);
      } else {
        const unackedCompletedAdjust = backgroundAiJobs.find(
          (j) =>
            j.status === 'completed' &&
            !j.acknowledged &&
            (j.mode === 'adjust' || j.replaceMealItems) &&
            j.mealSlotId === mealSlot.id &&
            (!selectedDate || j.date === selectedDate) &&
            !appliedAdjustJobIdsRef.current.has(j.id)
        );
        if (existingEntry?.items && existingEntry.items.length > 0) {
          if (unackedCompletedAdjust || pendingAdjustReplaceRef.current) {
            if (unackedCompletedAdjust) {
              appliedAdjustJobIdsRef.current.add(unackedCompletedAdjust.id);
            }
            pendingAdjustReplaceRef.current = false;
            setItems((prev) => {
              const prevIds = new Set(prev.map((p) => p.id));
              const differs =
                prev.length !== existingEntry.items.length ||
                existingEntry.items.some((i) => !prevIds.has(i.id));
              if (differs) {
                setPreCorrectionItems((old) => old ?? [...prev]);
                setItemFieldDrafts({});
                itemScaleBaseRef.current = {};
                return [...existingEntry.items];
              }
              return prev;
            });
            setSuggestedExtras((prev) =>
              filterUnacceptedSuggestedExtras(
                prev,
                existingEntry.items,
                dismissedExtrasKeysRef.current
              )
            );
            setAiSummary({
              msg: 'הארוחה תוקנה ועודכנה ברקע בהצלחה ✨',
              engine: unackedCompletedAdjust?.engine,
              isFallback: unackedCompletedAdjust?.isAiFallback,
              fallbackReason: unackedCompletedAdjust?.fallbackReason,
            });
          } else {
            // מיזוג אוטומטי כשמשימת AI ברקע מסתיימת בזמן שהחלונית נשארה פתוחה
            setItems((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const incomingNew = existingEntry.items.filter((i) => !existingIds.has(i.id));
              return incomingNew.length > 0 ? [...prev, ...incomingNew] : prev;
            });
          }
        }
        if (existingEntry?.aiSuggestedExtras && existingEntry.aiSuggestedExtras.length > 0) {
          const mergedCurrentItems = [
            ...itemsRef.current,
            ...(existingEntry.items || []),
          ];
          setSuggestedExtras((prev) =>
            filterUnacceptedSuggestedExtras(
              [...prev, ...existingEntry.aiSuggestedExtras!],
              mergedCurrentItems,
              dismissedExtrasKeysRef.current
            )
          );
        }
        if (entryPhotos.length > 0 && !photoDataUrl) {
          setPhotoDataUrl(entryPhotos[0]);
        }
      }
    } else if (!opened) {
      if (sawUnreadCoachBadgesSlotRef.current && actorRole === 'trainee' && !isCoachPreview) {
        const readSlot = sawUnreadCoachBadgesSlotRef.current;
        sawUnreadCoachBadgesSlotRef.current = null;
        onMarkCoachBadgesRead?.(readSlot);
      }
      lastOpenedKeyRef.current = '';
      barcodeStandaloneRef.current = false;
      stopVoiceRecording(false);
      stopCorrectionVoice(false);
    }
    return () => {
      stopVoiceRecording(false);
      stopCorrectionVoice(false);
    };
  }, [opened, mealSlot, existingEntry, initialTab, customFoodUnits, selectedDate]);

  // סימון צפייה על באדג'ים של מאמן אך ורק למתאמן עצמו בעת יציאה מפירוט הארוחה
  useEffect(() => {
    if (
      opened &&
      mealSlot &&
      activeTab === 'meal-items' &&
      existingEntry?.coachEditState?.unreadBadges &&
      actorRole === 'trainee' &&
      !isCoachPreview
    ) {
      sawUnreadCoachBadgesSlotRef.current = mealSlot.id;
    } else if (
      opened &&
      activeTab !== 'meal-items' &&
      sawUnreadCoachBadgesSlotRef.current &&
      actorRole === 'trainee' &&
      !isCoachPreview
    ) {
      const readSlot = sawUnreadCoachBadgesSlotRef.current;
      sawUnreadCoachBadgesSlotRef.current = null;
      onMarkCoachBadgesRead?.(readSlot);
    }
  }, [opened, mealSlot, activeTab, existingEntry?.coachEditState?.unreadBadges, actorRole, isCoachPreview, onMarkCoachBadgesRead]);

  // מילוי אוטומטי מ"טיוטת קריסה" בעת כניסה חוזרת אוטומטית או לחיצה על "שלח שוב"
  useEffect(() => {
    if (!opened || !mealSlot || !traineeId || !selectedDate) return;
    const targetMode: 'photo' | 'text' | 'adjust' | null =
      activeTab === 'ai-photo'
        ? 'photo'
        : activeTab === 'ai-text'
        ? 'text'
        : correctionOpen || externalOpenAdjustNonce > 0
        ? 'adjust'
        : null;
    if (!targetMode) return;
    const sectionKey = `${traineeId}::${selectedDate}::${mealSlot.id}::${targetMode}::${externalOpenAdjustNonce}`;
    if (prefilledFailedSectionsRef.current.has(sectionKey)) return;
    prefilledFailedSectionsRef.current.add(sectionKey);

    let cancelled = false;
    void loadFailedAiDraft(traineeId, selectedDate, mealSlot.id, targetMode).then((idbDraft) => {
      if (cancelled) return;
      const serverFallbackDraft =
        slotBgFailedJob?.mode === targetMode ? slotBgFailedJob.retryPayload : undefined;
      const draft = idbDraft || serverFallbackDraft;
      if (!draft) {
        // במקרה שאין קריסה שמורה: השדות נשארים ריקים בעת כניסה רגילה
        return;
      }
      if (targetMode === 'photo') {
        if (draft.photos && draft.photos.length > 0) {
          const restored = draft.photos
            .filter((p) => Boolean(p.dataUrl))
            .slice(0, 8)
            .map((p) => ({
              dataUrl: p.dataUrl,
              sizeKB: Math.max(1, Math.round((p.dataUrl.length * 3) / 4 / 1024)),
              formatLabel: 'WebP' as const,
              angle: p.angle || ('unset' as PhotoAngleKind),
              labelProductName: p.labelProductName,
              labelInputOpen: p.angle === 'label',
            }));
          if (restored.length > 0) {
            setPhotoItems(restored);
            setPhotoDataUrl(restored[0].dataUrl);
            setPhotoSizeKB(restored[0].sizeKB);
          }
        }
        if (draft.textPrompt) setPhotoNote(draft.textPrompt);
        if (draft.contextParams) {
          setContextParams({ ...draft.contextParams, customUnits: customFoodUnits });
        }
        if (typeof draft.includePreviousMealPhotos === 'boolean') {
          setIncludePreviousMealPhotos(draft.includePreviousMealPhotos);
        }
      } else if (targetMode === 'text') {
        if (draft.textPrompt) setFreeTextPrompt(draft.textPrompt);
        if (draft.contextParams) {
          setContextParams({ ...draft.contextParams, customUnits: customFoodUnits });
        }
      } else if (targetMode === 'adjust') {
        if (draft.adjustmentPrompt) setCorrectionText(draft.adjustmentPrompt);
        if (draft.selectedTargetIds && draft.selectedTargetIds.length > 0) {
          setSelectionMode(true);
          setSelectedIds(new Set(draft.selectedTargetIds));
        }
        if (externalOpenAdjustNonce > 0) {
          setCorrectionOpen(true);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    opened,
    mealSlot,
    traineeId,
    selectedDate,
    activeTab,
    correctionOpen,
    externalOpenAdjustNonce,
    slotBgFailedJob,
    customFoodUnits,
  ]);

  // טעינה מיידית (0ms) מ-localStorage של ההיסטוריה האישית וסנכרון שקט מול השרת
  useEffect(() => {
    if (!opened) return;
    const localHist = loadLocalFoodHistory(traineeId);
    if (localHist.length > 0) {
      setPersonalHistory(localHist);
    }
    const controller = new AbortController();
    fetch('/api/food/history', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: UserFoodHistoryItem[] } | null) => {
        if (controller.signal.aborted || !data?.items) return;
        setPersonalHistory((prev) => {
          const merged = mergeServerAndLocalHistory(data.items || [], prev);
          saveLocalFoodHistory(traineeId, merged);
          return merged;
        });
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [opened, traineeId]);

  const trackFoodInteraction = (
    food: FoodCatalogItem,
    actionKind: 'picked' | 'barcode' | 'logged',
    lastUnitLabel?: string,
    lastGrams?: number
  ) => {
    setPersonalHistory((prev) => {
      const next = upsertLocalHistoryList(prev, food, actionKind, lastUnitLabel, lastGrams);
      saveLocalFoodHistory(traineeId, next);
      return next;
    });
    fetch('/api/food/history', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: food,
        actionKind,
        lastUnitLabel,
        lastGrams,
      }),
    }).catch(() => undefined);
  };

  const customFoodById = useMemo(() => {
    const m = new Map<string, CustomFoodItem>();
    for (const cf of customFoods) {
      if (cf?.id) m.set(cf.id, cf);
    }
    return m;
  }, [customFoods]);

  const getFoodImageThumb = (food?: Pick<FoodCatalogItem, 'id' | 'imageDataUrl'> | null) =>
    food?.imageDataUrl || (food?.id ? customFoodById.get(food.id)?.imageDataUrl : undefined);

  const canEditCustomFood = (cf?: CustomFoodItem) => {
    if (!cf) return false;
    if (actorRole === 'admin') return true;
    if (actorRole === 'trainee') return cf.scope === 'trainee';
    return cf.scope !== 'global';
  };

  const customCatalogItems = useMemo(
    () => customFoods.map(customFoodToCatalogItem),
    [customFoods]
  );

  const effectiveRetailSubSite =
    canShowScraperSources && sourceGroup === 'retail' ? retailSubSite : 'all';

  const instantLocalResults = useMemo(
    () =>
      getInstantLocalFoods({
        query: searchQuery,
        sourceGroup,
        retailSubSite: effectiveRetailSubSite,
        selectedBrand,
        personalHistory,
        favoriteIds,
        customFoods: customCatalogItems,
        semanticEnabled: semanticSearchActive,
        limit: 36,
      }),
    [searchQuery, sourceGroup, effectiveRetailSubSite, selectedBrand, personalHistory, favoriteIds, customCatalogItems, semanticSearchActive]
  );

  const searchResults = useMemo(() => {
    let base: Array<FoodCatalogItem & Partial<UserFoodHistoryItem>>;
    if (sourceGroup === 'favorites_recent' || sourceGroup === 'custom_only') {
      base = instantLocalResults;
    } else if (!hasRemoteSynced) {
      base = instantLocalResults;
    } else {
      base = mergeLocalAndRemoteFoodResults(
        instantLocalResults,
        remoteResults,
        searchQuery,
        personalHistory,
        favoriteIds,
        36,
        semanticSearchActive
      );
    }

    if (selectedBrand && selectedBrand !== 'all') {
      return base.filter((it) => matchesBrandSelection(it, selectedBrand));
    }
    return base;
  }, [
    sourceGroup,
    hasRemoteSynced,
    instantLocalResults,
    remoteResults,
    searchQuery,
    selectedBrand,
    personalHistory,
    favoriteIds,
    semanticSearchActive,
  ]);

  const brandFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    const addBrand = (raw?: string, weight = 1) => {
      if (!raw) return;
      counts.set(raw, (counts.get(raw) || 0) + weight);
    };
    for (const item of [...instantLocalResults, ...remoteResults]) {
      const b = getDisplayBrandForFood(item);
      if (b) addBrand(b, 2);
    }
    for (const b of remoteAvailableBrands) {
      addBrand(b, 1);
    }
    const dynamicSorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he'))
      .map(([b]) => b);

    const out: string[] = [];
    const seen = new Set<string>();
    if (selectedBrand && selectedBrand !== 'all') {
      seen.add(selectedBrand);
      out.push(selectedBrand);
    }
    for (const b of [...dynamicSorted, ...FEATURED_ISRAELI_BRANDS]) {
      if (!seen.has(b)) {
        seen.add(b);
        out.push(b);
      }
      if (out.length >= 28) break;
    }
    return out;
  }, [instantLocalResults, remoteResults, remoteAvailableBrands, selectedBrand]);

  const effectiveSourceParam =
    canShowScraperSources && sourceGroup === 'retail' && retailSubSite && retailSubSite !== 'all'
      ? retailSubSite
      : sourceGroup;

  useEffect(() => {
    setActiveResultIndex(-1);
  }, [searchQuery, sourceGroup, effectiveRetailSubSite, selectedBrand]);

  useEffect(() => {
    if (!opened) return;
    if (sourceGroup === 'favorites_recent' || sourceGroup === 'custom_only') {
      setSearchLoading(false);
      setShowSkeletons(false);
      setLiveExpanding(false);
      setCanManualExpandLive(false);
      setUsedSemanticRrf(false);
      setSearchError(null);
      setHasRemoteSynced(false);
      return;
    }

    const qTrim = searchQuery.trim();
    const cleanLen = normalizeClientFoodText(qTrim).replace(/\s+/g, '').length;
    const isBarcodeDigits = /^[0-9]{6,16}$/.test(qTrim);
    const hasActiveBrand = Boolean(selectedBrand && selectedBrand !== 'all');
    const shouldQueryRemote =
      isBarcodeDigits ||
      cleanLen >= 2 ||
      hasActiveBrand ||
      (activeTab === 'catalog' && qTrim.length === 0);

    if (!shouldQueryRemote) {
      setRemoteResults([]);
      setRemoteAvailableBrands([]);
      setHasRemoteSynced(false);
      setSearchLoading(false);
      setShowSkeletons(false);
      setLiveExpanding(false);
      setCanManualExpandLive(false);
      setUsedSemanticRrf(false);
      setSearchError(null);
      return;
    }

    const cacheKey = buildSearchCacheKey(
      qTrim,
      sourceGroup,
      effectiveRetailSubSite,
      selectedBrand,
      semanticSearchActive
    );
    const cached = getCachedFoodSearch(cacheKey);
    if (cached) {
      setRemoteResults(cached.items);
      if (Array.isArray(cached.availableBrands)) {
        setRemoteAvailableBrands(cached.availableBrands);
      }
      if (typeof cached.semanticSearchEnabled === 'boolean') {
        setSemanticSearchActive(cached.semanticSearchEnabled);
      }
      setUsedSemanticRrf(Boolean(cached.usedSemanticRrf));
      setHasRemoteSynced(true);
      setSearchLoading(false);
      setShowSkeletons(false);
      setLiveExpanding(false);
      setCanManualExpandLive(cached.needsLiveFallback && !cached.liveDone);
      setSearchError(null);
      setMohCount(cached.mohCount);
      setScraperCount(cached.scraperCount);
      if (cached.totalAvailable) setTotalAvailable(cached.totalAvailable);
      return;
    }

    // אפס את הרשימה הישנה מיד כדי למנוע לחיצה בשגיאה על תוצאות משאילתה קודמת
    setHasRemoteSynced(false);
    setRemoteResults([]);
    setUsedSemanticRrf(false);
    setSearchError(null);
    setLiveExpanding(false);
    setCanManualExpandLive(false);

    const controller = new AbortController();
    activeSearchAbortRef.current?.abort();
    activeSearchAbortRef.current = controller;
    searchAbortedByUserRef.current = false;
    let skeletonTimer: ReturnType<typeof setTimeout> | null = null;
    let dbTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let liveTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let dbTimedOut = false;
    let liveTimedOut = false;
    const debounceMs = isBarcodeDigits || qTrim.length === 0 ? 40 : 250;

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      if (instantLocalResults.length === 0) {
        skeletonTimer = setTimeout(() => {
          if (!controller.signal.aborted) setShowSkeletons(true);
        }, 150);
      }

      const dbStartedAt = Date.now();
      const dbController = new AbortController();
      const onParentAbortDb = () => dbController.abort();
      controller.signal.addEventListener('abort', onParentAbortDb, { once: true });
      dbTimeoutTimer = setTimeout(() => {
        dbTimedOut = true;
        dbController.abort();
      }, 12_000);

      try {
        const qs = new URLSearchParams({
          q: qTrim,
          limit: '36',
          mode: 'db',
        });
        if (effectiveSourceParam && effectiveSourceParam !== 'all') {
          qs.set('source', effectiveSourceParam);
        }
        if (hasActiveBrand) {
          qs.set('brand', selectedBrand);
        }
        const res = await fetch(`/api/food/search?${qs.toString()}`, {
          signal: dbController.signal,
        });
        const dbClientMs = Math.max(0, Date.now() - dbStartedAt);
        if (res.status === 401 || res.status === 403) {
          void handlePossibleAuthRejection(res);
        }
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          const errMsg = errJson?.error || `שגיאת שרת (${res.status})`;
          trackClientEvent('client_error', 'food_search_trace', {
            screen: 'catalog',
            flushNow: true,
            details: {
              mode: 'db',
              status: res.status,
              clientMs: dbClientMs,
              queryLen: qTrim.length,
              errorMsg: errMsg,
              ...getClientRuntimeContext(),
            },
          });
          throw new Error(errMsg);
        }
        const data = await res.json();
        if (controller.signal.aborted) return;

        const dbItems = (Array.isArray(data.items) ? data.items : []) as FoodCatalogItem[];
        if (dbClientMs >= 1200) {
          trackClientEvent('performance', 'food_search_trace', {
            screen: 'catalog',
            flushNow: true,
            details: {
              mode: 'db',
              status: 200,
              clientMs: dbClientMs,
              serverMs: data.dbLatencyMs,
              resultCount: dbItems.length,
              usedHybridRpc: Boolean(data.usedHybridRpc),
              usedSemanticRrf: Boolean(data.usedSemanticRrf),
              queryLen: qTrim.length,
              ...getClientRuntimeContext(),
            },
          });
        }
        const dbBrands = (Array.isArray(data.availableBrands) ? data.availableBrands : []) as string[];
        const needsLive = Boolean(data.needsLiveFallback) && cleanLen >= 3;
        const mCount = data.mohCount || 0;
        const sCount = data.scraperCount || data.syncedCount || 0;
        const semOn = typeof data.semanticSearchEnabled === 'boolean'
          ? data.semanticSearchEnabled
          : semanticSearchActive;
        const semRrf = Boolean(data.usedSemanticRrf);

        setSemanticSearchActive(semOn);
        setUsedSemanticRrf(semRrf);
        setRemoteResults(dbItems);
        if (dbBrands.length > 0) setRemoteAvailableBrands(dbBrands);
        setHasRemoteSynced(true);
        setShowSkeletons(false);
        setSearchLoading(false);
        setMohCount(mCount);
        setScraperCount(sCount);
        if (data.totalAvailable) setTotalAvailable(data.totalAvailable);

        const resolvedCacheKey = buildSearchCacheKey(
          qTrim,
          sourceGroup,
          effectiveRetailSubSite,
          selectedBrand,
          semOn
        );
        setCachedFoodSearch(resolvedCacheKey, {
          items: dbItems,
          availableBrands: dbBrands,
          needsLiveFallback: needsLive,
          liveDone: false,
          mohCount: mCount,
          scraperCount: sCount,
          totalAvailable: data.totalAvailable,
          semanticSearchEnabled: semOn,
          usedSemanticRrf: semRrf,
        });

        // שלב 2 אוטומטי לא-חוסם: מרחיב ברקע מול מאגרי מוצרים חיים רק כשחסרות תוצאות ב-DB
        if (needsLive) {
          setLiveExpanding(true);
          const liveStartedAt = Date.now();
          const liveController = new AbortController();
          liveExpandAbortRef.current = liveController;
          const onParentAbortLive = () => liveController.abort();
          controller.signal.addEventListener('abort', onParentAbortLive, { once: true });
          liveTimeoutTimer = setTimeout(() => {
            liveTimedOut = true;
            liveController.abort();
          }, 10_000);
          try {
            const liveQs = new URLSearchParams({
              q: qTrim,
              limit: '36',
              mode: 'live',
            });
            if (effectiveSourceParam && effectiveSourceParam !== 'all') {
              liveQs.set('source', effectiveSourceParam);
            }
            if (hasActiveBrand) {
              liveQs.set('brand', selectedBrand);
            }
            const liveRes = await fetch(`/api/food/search?${liveQs.toString()}`, {
              signal: liveController.signal,
            });
            const liveClientMs = Math.max(0, Date.now() - liveStartedAt);
            if (liveRes.status === 401 || liveRes.status === 403) {
              void handlePossibleAuthRejection(liveRes);
            }
            if (liveRes.ok && !controller.signal.aborted) {
              const liveData = await liveRes.json();
              const liveItems = (Array.isArray(liveData.items) ? liveData.items : []) as FoodCatalogItem[];
              if (liveClientMs >= 2500) {
                trackClientEvent('performance', 'food_search_trace', {
                  screen: 'catalog',
                  flushNow: true,
                  details: {
                    mode: 'live',
                    status: 200,
                    clientMs: liveClientMs,
                    serverMs: liveData.dbLatencyMs,
                    resultCount: liveItems.length,
                    queryLen: qTrim.length,
                    ...getClientRuntimeContext(),
                  },
                });
              }
              const liveBrands = (Array.isArray(liveData.availableBrands)
                ? liveData.availableBrands
                : dbBrands) as string[];
              const nextM = liveData.mohCount ?? mCount;
              const nextS = liveData.scraperCount ?? sCount;
              const liveSemRrf = Boolean(liveData.usedSemanticRrf) || semRrf;
              setUsedSemanticRrf(liveSemRrf);
              setRemoteResults(liveItems);
              if (liveBrands.length > 0) setRemoteAvailableBrands(liveBrands);
              setMohCount(nextM);
              setScraperCount(nextS);
              setCachedFoodSearch(resolvedCacheKey, {
                items: liveItems,
                availableBrands: liveBrands,
                needsLiveFallback: false,
                liveDone: true,
                mohCount: nextM,
                scraperCount: nextS,
                totalAvailable: liveData.totalAvailable || data.totalAvailable,
                semanticSearchEnabled: semOn,
                usedSemanticRrf: liveSemRrf,
              });
            } else {
              setCanManualExpandLive(true);
            }
          } catch {
            if (liveTimedOut) {
              trackClientEvent('client_error', 'food_search_trace', {
                screen: 'catalog',
                flushNow: true,
                details: {
                  mode: 'live',
                  timedOut: true,
                  clientMs: Math.max(0, Date.now() - liveStartedAt),
                  queryLen: qTrim.length,
                  ...getClientRuntimeContext(),
                },
              });
            }
            if (!controller.signal.aborted) setCanManualExpandLive(true);
          } finally {
            if (liveTimeoutTimer) clearTimeout(liveTimeoutTimer);
            controller.signal.removeEventListener('abort', onParentAbortLive);
            if (liveExpandAbortRef.current === liveController) {
              liveExpandAbortRef.current = null;
            }
            if (!controller.signal.aborted) setLiveExpanding(false);
          }
        } else {
          setCanManualExpandLive(cleanLen >= 3 && effectiveSourceParam !== 'moh_gov');
        }
      } catch (err) {
        if (dbTimedOut && !controller.signal.aborted) {
          trackClientEvent('client_error', 'food_search_trace', {
            screen: 'catalog',
            flushNow: true,
            details: {
              mode: 'db',
              timedOut: true,
              clientMs: Math.max(0, Date.now() - dbStartedAt),
              queryLen: qTrim.length,
              ...getClientRuntimeContext(),
            },
          });
          setSearchError('החיפוש ארך זמן רב מדי — מוצגות תוצאות מקומיות, אפשר לנסות שוב');
          return;
        }
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (!controller.signal.aborted) {
          const msg = err instanceof Error ? err.message : 'שגיאת חיבור בחיפוש';
          trackClientEvent('client_error', 'food_search_trace', {
            screen: 'catalog',
            flushNow: true,
            details: {
              mode: 'db',
              status: 0,
              clientMs: Math.max(0, Date.now() - dbStartedAt),
              queryLen: qTrim.length,
              errorMsg: msg,
              ...getClientRuntimeContext(),
            },
          });
          setSearchError(msg);
        }
      } finally {
        if (dbTimeoutTimer) clearTimeout(dbTimeoutTimer);
        if (skeletonTimer) clearTimeout(skeletonTimer);
        controller.signal.removeEventListener('abort', onParentAbortDb);
        if (!controller.signal.aborted) {
          setSearchLoading(false);
          setShowSkeletons(false);
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      if (skeletonTimer) clearTimeout(skeletonTimer);
      if (dbTimeoutTimer) clearTimeout(dbTimeoutTimer);
      if (liveTimeoutTimer) clearTimeout(liveTimeoutTimer);
      controller.abort();
      if (activeSearchAbortRef.current === controller) {
        activeSearchAbortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sourceGroup, effectiveRetailSubSite, selectedBrand, semanticSearchActive, activeTab, opened, searchRetryNonce]);

  const handleCancelFoodSearch = () => {
    searchAbortedByUserRef.current = true;
    activeSearchAbortRef.current?.abort();
    activeSearchAbortRef.current = null;
    liveExpandAbortRef.current?.abort();
    liveExpandAbortRef.current = null;
    setSearchLoading(false);
    setLiveExpanding(false);
    setShowSkeletons(false);
  };

  const runManualLiveExpand = async () => {
    const qTrim = searchQuery.trim();
    if (!qTrim || liveExpanding) return;
    setLiveExpanding(true);
    setCanManualExpandLive(false);
    const liveStartedAt = Date.now();
    const liveController = new AbortController();
    liveExpandAbortRef.current = liveController;
    let liveTimedOut = false;
    const timeoutId = setTimeout(() => {
      liveTimedOut = true;
      liveController.abort();
    }, 12_000);
    try {
      const qs = new URLSearchParams({
        q: qTrim,
        limit: '36',
        mode: 'live',
      });
      if (effectiveSourceParam && effectiveSourceParam !== 'all') {
        qs.set('source', effectiveSourceParam);
      }
      if (selectedBrand && selectedBrand !== 'all') {
        qs.set('brand', selectedBrand);
      }
      const res = await fetch(`/api/food/search?${qs.toString()}`, {
        signal: liveController.signal,
      });
      const liveClientMs = Math.max(0, Date.now() - liveStartedAt);
      if (res.status === 401 || res.status === 403) {
        void handlePossibleAuthRejection(res);
      }
      if (!res.ok) {
        trackClientEvent('client_error', 'food_search_trace', {
          screen: 'catalog',
          flushNow: true,
          details: {
            mode: 'live_manual',
            status: res.status,
            clientMs: liveClientMs,
            queryLen: qTrim.length,
            ...getClientRuntimeContext(),
          },
        });
      } else {
        const data = await res.json();
        const items = (Array.isArray(data.items) ? data.items : []) as FoodCatalogItem[];
        if (liveClientMs >= 2500) {
          trackClientEvent('performance', 'food_search_trace', {
            screen: 'catalog',
            flushNow: true,
            details: {
              mode: 'live_manual',
              status: 200,
              clientMs: liveClientMs,
              serverMs: data.dbLatencyMs,
              resultCount: items.length,
              queryLen: qTrim.length,
              ...getClientRuntimeContext(),
            },
          });
        }
        const brands = (Array.isArray(data.availableBrands) ? data.availableBrands : []) as string[];
        const semOn = typeof data.semanticSearchEnabled === 'boolean'
          ? data.semanticSearchEnabled
          : semanticSearchActive;
        const semRrf = Boolean(data.usedSemanticRrf);
        setSemanticSearchActive(semOn);
        setUsedSemanticRrf(semRrf);
        setRemoteResults(items);
        if (brands.length > 0) setRemoteAvailableBrands(brands);
        setHasRemoteSynced(true);
        const cacheKey = buildSearchCacheKey(
          qTrim,
          sourceGroup,
          effectiveRetailSubSite,
          selectedBrand,
          semOn
        );
        setCachedFoodSearch(cacheKey, {
          items,
          availableBrands: brands,
          needsLiveFallback: false,
          liveDone: true,
          mohCount: data.mohCount || mohCount,
          scraperCount: data.scraperCount || scraperCount,
          totalAvailable: data.totalAvailable,
          semanticSearchEnabled: semOn,
          usedSemanticRrf: semRrf,
        });
      }
    } catch {
      trackClientEvent('client_error', 'food_search_trace', {
        screen: 'catalog',
        flushNow: true,
        details: {
          mode: 'live_manual',
          timedOut: liveTimedOut,
          clientMs: Math.max(0, Date.now() - liveStartedAt),
          queryLen: qTrim.length,
          ...getClientRuntimeContext(),
        },
      });
    } finally {
      clearTimeout(timeoutId);
      if (liveExpandAbortRef.current === liveController) {
        liveExpandAbortRef.current = null;
      }
      setLiveExpanding(false);
    }
  };

  const extractNamePackageGrams = (raw: string): number | null => {
    const cleaned = String(raw || '')
      .replace(/ל[-\s]?100\s*(?:גרם|ג'|ג"|מ"ל|מל|מ״ל)/gi, ' ')
      .replace(/\b100\s*(?:גרם|ג'|ג"|מ"ל|מל|מ״ל)\b/gi, ' ');
    const kg = cleaned.match(/(\d+(?:[.,]\d+)?)\s*(?:ק"ג|ק״ג|קג|ליטר|ל'|kg)(?=$|\s|[,.)\]\-/])/i);
    if (kg) {
      const v = Number(kg[1].replace(',', '.'));
      if (Number.isFinite(v) && v > 0 && v <= 5) return Math.round(v * 1000);
    }
    const g = cleaned.match(/(\d+(?:[.,]\d+)?)\s*(?:גרם|ג'|ג"|ג|מ"ל|מ״ל|מל|g|gr|ml)(?=$|\s|[,.)\]\-/])/i);
    if (g) {
      const v = Number(g[1].replace(',', '.'));
      if (Number.isFinite(v) && v >= 5 && v <= 5000) return Math.round(v);
    }
    return null;
  };

  const getCombinedUnitsForFood = (food: FoodCatalogItem) => {
    const out: Array<{ label: string; grams: number; isUserUnit?: boolean }> = [];
    const seenGrams = new Set<number>();
    const pushUnit = (label: string, grams: number, isUserUnit = false) => {
      const g = Math.round(Number(grams) || 0);
      if (!label || g <= 0) return;
      if (g !== 100 && seenGrams.has(g) && !isUserUnit) return;
      if (!isUserUnit && g !== 100) seenGrams.add(g);
      out.push({ label, grams: g, isUserUnit });
    };

    const namePkgG = extractNamePackageGrams(food.name);
    if (namePkgG && namePkgG !== 100 && !food.units.some((u) => Math.round(u.grams) === namePkgG)) {
      pushUnit(`חבילה / יחידה (${namePkgG} גרם)`, namePkgG, false);
    }
    for (const u of food.units) {
      pushUnit(u.label, u.grams, false);
    }

    const foodLower = food.name.toLowerCase();
    const sortedCustomUnits = [...customFoodUnits].sort((a, b) => {
      const aMatch = a.foodNameKeyword && foodLower.includes(a.foodNameKeyword.toLowerCase()) ? 1 : 0;
      const bMatch = b.foodNameKeyword && foodLower.includes(b.foodNameKeyword.toLowerCase()) ? 1 : 0;
      return bMatch - aMatch;
    });
    for (const u of sortedCustomUnits) {
      pushUnit(`★ ${u.unitName} (${u.grams} גרם)`, u.grams, true);
    }
    for (const t of customServingTools) {
      const g = Number(t.defaultFoodGrams || t.volumeMl || 0);
      if (g > 0) {
        pushUnit(`${t.name} (${Math.round(g)} גרם)`, Math.round(g), true);
      }
    }
    if (!out.some((u) => u.grams === 100)) {
      pushUnit('100 גרם', 100, false);
    }
    return out;
  };

  const handleSelectCatalogFood = async (food: FoodCatalogItem, openPortion = true) => {
    if (!openPortion) {
      setSelectedFood(null);
      return;
    }
    setInlineUnitOpen(false);
    setSelectedFood(food);
    const combined = getCombinedUnitsForFood(food);
    const histEntry = personalHistory.find((h) => h.id === food.id);
    const histUnitMatch =
      histEntry?.lastUnitLabel
        ? combined.find((u) => u.label === histEntry.lastUnitLabel)
        : undefined;
    const firstNon100 = combined.find((u) => u.grams !== 100);
    const firstUnit = histUnitMatch || firstNon100 || combined[0] || { label: '100 גרם', grams: 100 };
    setSelectedUnitLabel(firstUnit.label);
    setQuantity(1);
    setCustomGrams(firstUnit.grams);
    setCustomItemTime('');

    // שמירה מיידית של הבחירה בהיסטוריה האישית + הגדלת פופולריות גלובלית ברקע
    trackFoodInteraction(food, 'picked', firstUnit.label, firstUnit.grams);

    const needsEnrich =
      Boolean(food.sourceUrl) &&
      (!food.barcode || !food.units.some((u) => Math.round(u.grams) !== 100));
    if (needsEnrich) {
      enrichAbortRef.current?.abort();
      const enrichCtrl = new AbortController();
      enrichAbortRef.current = enrichCtrl;
      setEnrichingFood(true);
      try {
        const res = await fetch('/api/food/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: enrichCtrl.signal,
          body: JSON.stringify({ item: food }),
        });
        if (res.ok) {
          const data = (await res.json()) as { item?: FoodCatalogItem };
          if (data.item) {
            const enriched = data.item;
            setRemoteResults((prev) =>
              prev.map((x) => (x.id === enriched.id ? enriched : x))
            );
            setPersonalHistory((prev) => {
              const next = upsertLocalHistoryList(prev, enriched, 'picked', firstUnit.label, firstUnit.grams);
              saveLocalFoodHistory(traineeId, next);
              return next;
            });
            setSelectedFood((prev) => {
              if (!prev || prev.id !== enriched.id) return prev;
              const nextCombined = getCombinedUnitsForFood(enriched);
              const betterPkg = nextCombined.find((u) => !u.isUserUnit && u.grams !== 100);
              if (betterPkg && firstUnit.grams === 100) {
                setSelectedUnitLabel(betterPkg.label);
                setQuantity(1);
                setCustomGrams(betterPkg.grams);
              }
              return enriched;
            });
          }
        }
      } catch {
        // ignore lazy enrichment network failure
      } finally {
        setEnrichingFood(false);
      }
    }
  };

  const handleSaveInlineCustomUnit = async () => {
    if (!inlineUnitName.trim() || !onManageToolsAndUnits || !selectedFood) return;
    const parsedUnitGrams = parseOptionalDecimal(inlineUnitGrams);
    if (parsedUnitGrams === undefined || parsedUnitGrams <= 0) return;
    const gramsNum = Math.max(1, Math.min(3000, Math.round(parsedUnitGrams)));
    setSavingInlineUnit(true);
    try {
      const nextUnit: TraineeCustomUnit = {
        id: `unit-${Date.now()}`,
        unitName: inlineUnitName.trim(),
        foodNameKeyword: inlineUnitForFoodOnly ? selectedFood.name.slice(0, 40) : undefined,
        grams: gramsNum,
        updatedAt: new Date().toISOString(),
      };
      const updatedList = [...customFoodUnits, nextUnit];
      const res = await onManageToolsAndUnits({ customFoodUnits: updatedList });
      if (!res?.error) {
        const newLabel = `★ ${nextUnit.unitName} (${nextUnit.grams} גרם)`;
        setSelectedUnitLabel(newLabel);
        setQuantity(1);
        setCustomGrams(nextUnit.grams);
        setInlineUnitName('');
        setInlineUnitOpen(false);
      }
    } finally {
      setSavingInlineUnit(false);
    }
  };

  const handleUnitChange = (unitLabel: string | null) => {
    if (!selectedFood || !unitLabel) return;
    setSelectedUnitLabel(unitLabel);
    if (unitLabel === 'custom-grams') return;
    const found = getCombinedUnitsForFood(selectedFood).find(
      (u) => u.label === unitLabel
    );
    if (found) {
      const q = Math.max(0.25, parseOptionalDecimal(quantity) ?? 1);
      setCustomGrams(Math.max(1, Math.round(found.grams * q)));
    }
  };

  const handleQuantityChange = (val: string | number) => {
    setQuantity(val);
    const q = parseOptionalDecimal(val);
    if (
      q !== undefined &&
      q > 0 &&
      selectedFood &&
      selectedUnitLabel !== 'custom-grams'
    ) {
      const found = getCombinedUnitsForFood(selectedFood).find(
        (u) => u.label === selectedUnitLabel
      );
      if (found) {
        setCustomGrams(Math.max(1, Math.round(found.grams * q)));
      }
    }
  };

  const addSelectedFoodToMeal = (
    sourceOverride: 'catalog' | 'barcode' = 'catalog'
  ) => {
    if (!selectedFood) return false;
    const parsedGrams = parseOptionalDecimal(customGrams);
    if (parsedGrams === undefined || parsedGrams <= 0) {
      return false;
    }
    const totalGrams = Math.max(0.1, Math.round(parsedGrams * 10) / 10);
    const parsedQuantity = parseOptionalDecimal(quantity);
    const safeQuantity =
      selectedUnitLabel === 'custom-grams'
        ? 1
        : parsedQuantity !== undefined && parsedQuantity > 0
        ? parsedQuantity
        : 1;
    const calculatedMacros = calculateMacrosForGrams(
      selectedFood.per100g,
      totalGrams
    );

    const normalizedItemTime = normalizeHhMmTime(customItemTime);
    const cleanSelectedBrand = getDisplayBrandForFood(selectedFood);
    const newItem: LoggedFoodItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name:
        cleanSelectedBrand && !selectedFood.name.includes(cleanSelectedBrand)
          ? `${selectedFood.name} (${cleanSelectedBrand})`
          : selectedFood.name,
      unitLabel:
        selectedUnitLabel === 'custom-grams'
          ? `${totalGrams} גרם`
          : safeQuantity === 1
          ? selectedUnitLabel
          : `${safeQuantity} × ${selectedUnitLabel}`,
      quantity: safeQuantity,
      grams: totalGrams,
      per100g: { ...selectedFood.per100g },
      ...(normalizedItemTime ? { itemTime: normalizedItemTime } : {}),
      macros: calculatedMacros,
      source: sourceOverride,
      inputConfidence: 'catalog',
    };

    trackFoodInteraction(
      selectedFood,
      sourceOverride === 'barcode' ? 'barcode' : 'logged',
      selectedUnitLabel === 'custom-grams' ? `${totalGrams} גרם` : selectedUnitLabel,
      totalGrams
    );
    appendItemsSmart([newItem]);
    return true;
  };

  const [photoUploading, setPhotoUploading] = useState(false);

  const applyFailedDraftForRetry = (
    draft?: AiFailedDraftSnapshot,
    histEvent?: MealHistoryEntry
  ) => {
    const d = draft || histEvent?.aiDetail?.retryDraftPayload;
    const mode = d?.mode || (histEvent?.aiDetail?.mode === 'adjust' ? 'adjust' : histEvent?.aiDetail?.photos?.length ? 'photo' : 'text');
    const resolvedPhotos =
      d?.photos && d.photos.length > 0
        ? d.photos
            .filter((p) => Boolean(p.dataUrl))
            .map((p) => ({
              dataUrl: p.dataUrl,
              sizeKB: Math.max(1, Math.round((p.dataUrl.length * 3) / 4 / 1024)),
              formatLabel: 'WebP' as const,
              angle: p.angle || ('unset' as PhotoAngleKind),
              labelProductName: p.labelProductName,
              labelInputOpen: p.angle === 'label',
            }))
        : (histEvent?.aiDetail?.photos || [])
            .map((m) => {
              const url = existingEntry?.photoStore?.[m.hash];
              if (!url) return null;
              return {
                dataUrl: url,
                sizeKB: Math.max(1, Math.round((url.length * 3) / 4 / 1024)),
                formatLabel: 'WebP' as const,
                angle: m.angle || ('unset' as PhotoAngleKind),
                labelProductName: m.labelProductName,
                labelInputOpen: m.angle === 'label',
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

    if (mode === 'adjust') {
      setCorrectionText(d?.adjustmentPrompt || histEvent?.aiDetail?.adjustmentPrompt || '');
      if (d?.selectedTargetIds?.length) {
        setSelectionMode(true);
        setSelectedIds(new Set(d.selectedTargetIds));
      }
      navigateTab('meal-items');
      setCorrectionOpen(true);
      return;
    }

    if (mode === 'photo' || resolvedPhotos.length > 0) {
      if (resolvedPhotos.length > 0) {
        setPhotoItems(resolvedPhotos.slice(0, 8));
        setPhotoDataUrl(resolvedPhotos[0].dataUrl);
        setPhotoSizeKB(resolvedPhotos[0].sizeKB);
      }
      setPhotoNote(d?.textPrompt || histEvent?.aiDetail?.prompt || '');
      if (d?.contextParams) {
        setContextParams({ ...d.contextParams, customUnits: customFoodUnits });
      }
      setIncludePreviousMealPhotos(Boolean(d?.includePreviousMealPhotos));
      navigateTab('ai-photo');
      return;
    }

    setFreeTextPrompt(d?.textPrompt || histEvent?.aiDetail?.prompt || '');
    if (d?.contextParams) {
      setContextParams({ ...d.contextParams, customUnits: customFoodUnits });
    }
    navigateTab('ai-text');
  };

  const handleDirectRetryFailedJob = async (
    failedJob?: PendingAiMealJob,
    draft?: AiFailedDraftSnapshot,
    histEvent?: MealHistoryEntry
  ) => {
    const modeHint = failedJob?.mode || draft?.mode;
    const idbDraft =
      traineeId && selectedDate && mealSlot && modeHint
        ? await loadFailedAiDraft(traineeId, selectedDate, mealSlot.id, modeHint)
        : null;
    const rawDraft = draft || failedJob?.retryPayload;
    const resolvedDraft: AiFailedDraftSnapshot | undefined =
      rawDraft && idbDraft
        ? {
            ...idbDraft,
            ...rawDraft,
            photos:
              rawDraft.photos && rawDraft.photos.length > 0
                ? rawDraft.photos
                : idbDraft.photos,
          }
        : rawDraft || idbDraft || histEvent?.aiDetail?.retryDraftPayload;

    const retryMode: 'photo' | 'text' | 'adjust' =
      failedJob?.mode ||
      resolvedDraft?.mode ||
      (histEvent?.aiDetail?.mode === 'adjust'
        ? 'adjust'
        : histEvent?.aiDetail?.photos?.length
        ? 'photo'
        : 'text');

    const resolvedPhotos =
      resolvedDraft?.photos && resolvedDraft.photos.length > 0
        ? resolvedDraft.photos.filter((p) => Boolean(p.dataUrl))
        : (failedJob?.photoDataUrls || []).length > 0
        ? failedJob!.photoDataUrls!.map((dataUrl, idx) => ({
            dataUrl,
            angle: (failedJob?.photoMetas?.[idx]?.angle || 'unset') as PhotoAngleKind,
            labelProductName: failedJob?.photoMetas?.[idx]?.labelProductName,
          }))
        : (histEvent?.aiDetail?.photos || [])
            .map((m) => {
              const url = existingEntry?.photoStore?.[m.hash];
              if (!url) return null;
              return {
                dataUrl: url,
                angle: m.angle || ('unset' as PhotoAngleKind),
                labelProductName: m.labelProductName,
              };
            })
            .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const adjustPrompt =
      resolvedDraft?.adjustmentPrompt || histEvent?.aiDetail?.adjustmentPrompt;
    const textPrompt = resolvedDraft?.textPrompt || histEvent?.aiDetail?.prompt;
    const canDirectResend =
      Boolean(onStartBackgroundAiAnalysis && traineeId && selectedDate && mealSlot) &&
      ((retryMode === 'adjust' && Boolean(adjustPrompt?.trim()) && items.length > 0) ||
        (retryMode === 'photo' &&
          (resolvedPhotos.length > 0 || Boolean(textPrompt?.trim()))) ||
        (retryMode === 'text' && Boolean(textPrompt?.trim())));

    if (
      canDirectResend &&
      onStartBackgroundAiAnalysis &&
      traineeId &&
      selectedDate &&
      mealSlot
    ) {
      if (failedJob?.id) {
        void onAcknowledgeAiJob?.(failedJob.id, traineeId);
        setDismissedFailedJobId(failedJob.id);
      }
      setAiSummary(null);
      await onStartBackgroundAiAnalysis({
        traineeId,
        date: selectedDate,
        mealSlotId: mealSlot.id,
        mealSlotName: mealSlot.name,
        mode: retryMode,
        imageDataUrl:
          retryMode === 'photo'
            ? resolvedPhotos[0]?.dataUrl
            : retryMode === 'adjust'
            ? allMealPhotos[0]
            : undefined,
        imageDataUrls:
          retryMode === 'photo' && resolvedPhotos.length > 0
            ? resolvedPhotos.map((p) => p.dataUrl)
            : retryMode === 'adjust' && allMealPhotos.length > 0
            ? allMealPhotos
            : undefined,
        imageMetas:
          retryMode === 'photo' && resolvedPhotos.length > 0
            ? resolvedPhotos.map((p) => ({
                angle: p.angle,
                labelProductName: p.labelProductName,
              }))
            : undefined,
        textPrompt,
        baseItems: retryMode === 'adjust' ? items : undefined,
        selectedTargetIds:
          retryMode === 'adjust' ? resolvedDraft?.selectedTargetIds : undefined,
        adjustmentPrompt: retryMode === 'adjust' ? adjustPrompt : undefined,
        contextParams: resolvedDraft?.contextParams,
      });
      return;
    }

    if (failedJob?.id) {
      setDismissedFailedJobId(failedJob.id);
    }
    setAiSummary(null);
    applyFailedDraftForRetry(resolvedDraft, histEvent);
  };

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    preferredAngle?: PhotoAngleKind,
    options?: { stayOnTab?: boolean }
  ) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) {
      e.target.value = '';
      return;
    }

    const existingPhotos = Array.from(
      new Set(
        [
          ...photoItems.map((im) => im.dataUrl),
          ...(photoDataUrl && !photoDataUrl.endsWith(',DEMO') ? [photoDataUrl] : []),
          ...resolveMealPhotos(existingEntry),
        ].filter(Boolean)
      )
    );
    const remainingSlots = Math.max(0, 8 - existingPhotos.length);
    if (remainingSlots <= 0) {
      setAiSummary({
        msg: 'ניתן לשמור עד 8 תמונות בארוחה סה״כ (כבר קיימות 8 תמונות)',
        isError: true,
      });
      setCameraChooserOpen(false);
      setMealItemsPhotoPickerOpen(false);
      e.target.value = '';
      return;
    }

    const files = rawFiles.slice(0, remainingSlots);
    const isImageFile = (f: File) =>
      f.type.startsWith('image/') ||
      /\.(jpe?g|png|webp|heic|heif|avif|bmp|gif)$/i.test(f.name || '');
    const invalid = files.find((f) => !isImageFile(f));
    if (invalid) {
      setAiSummary({ msg: 'נא לבחור קבצי תמונה תקינים (JPG, PNG, WebP)', isError: true });
      e.target.value = '';
      return;
    }
    const tooBig = files.find((f) => f.size > 20 * 1024 * 1024);
    if (tooBig) {
      setAiSummary({ msg: 'קובץ התמונה גדול מדי (מקסימום 20MB)', isError: true });
      e.target.value = '';
      return;
    }
    setPhotoUploading(true);
    setAiSummary(null);
    try {
      const projectedTotal = Math.min(8, existingPhotos.length + files.length);
      // תקציב משקל דינמי <= ~2.5MB מול מגבלת Vercel: ב-5 עד 8 תמונות מכווצים קצת יותר חסכוני (~105KB)
      const perImageTargetBytes = projectedTotal > 4 ? 105_000 : 155_000;
      const maxDim = projectedTotal > 4 ? 600 : 640;

      const newEntries: {
        dataUrl: string;
        sizeKB: number;
        formatLabel: 'WebP' | 'JPEG';
        angle: PhotoAngleKind;
        labelProductName?: string;
        labelInputOpen?: boolean;
      }[] = [];
      const externalExistingCount = existingPhotos.filter(
        (u) => !photoItems.some((p) => p.dataUrl === u)
      ).length;
      const maxNewPhotoItems = Math.max(0, 8 - externalExistingCount);
      let cumulativeBytes = existingPhotos.reduce((acc, u) => acc + u.length, 0);

      for (let i = 0; i < files.length; i++) {
        const compressed = await compressMealImage(files[i], 800, 0.72);
        const thumbUrl = await compressDataUrlToThumbnail(
          compressed.dataUrl,
          maxDim,
          perImageTargetBytes
        );
        if (cumulativeBytes + thumbUrl.length > 2_500_000) {
          setAiSummary({
            msg: 'הגעת לתקרת המשקל לשליחה (עד ~2.5MB) — לחץ שלח או הסר תמונה ישנה.',
            isError: true,
          });
          break;
        }
        cumulativeBytes += thumbUrl.length;
        const approxKB = Math.max(1, Math.round((thumbUrl.length * 3) / 4 / 1024));
        const angle: PhotoAngleKind = preferredAngle || 'unset';
        newEntries.push({
          dataUrl: thumbUrl,
          sizeKB: approxKB,
          formatLabel: compressed.formatLabel,
          angle,
          labelInputOpen: angle === 'label',
        });
      }
      setPhotoItems((prev) => {
        const merged = [...newEntries, ...prev].slice(0, maxNewPhotoItems);
        setPhotoDataUrl(merged[0]?.dataUrl || existingPhotos[0]);
        setPhotoSizeKB(merged[0]?.sizeKB ?? null);
        setPhotoFormatLabel(merged[0]?.formatLabel ?? 'WebP');
        return merged;
      });
      setCameraChooserOpen(false);
      setMealItemsPhotoPickerOpen(false);
      if (options?.stayOnTab) {
        if (newEntries.length > 0) {
          setActiveHeroPhotoIdx(0);
        }
        if (rawFiles.length > remainingSlots && newEntries.length > 0) {
          setAiSummary({
            msg: `נוספו ${newEntries.length} תמונות (מגבלה של עד 8 תמונות סה״כ בארוחה)`,
          });
        }
      } else {
        navigateTab('ai-photo');
      }
    } catch {
      setAiSummary({ msg: 'לא ניתן לקרוא את התמונה – נסה לצלם שוב', isError: true });
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
    }
  };

  const runAiAnalysis = async (
    mode: 'photo' | 'text',
    customTextOverride?: string,
    optionIndex?: number
  ) => {
    if (aiLockRef.current) return;
    const rawPrompt = customTextOverride ?? (mode === 'photo' ? photoNote : freeTextPrompt);
    const activeImages = photoItems.length > 0 ? photoItems : [];

    if (mode === 'photo' && activeImages.length === 0 && !rawPrompt.trim()) {
      setAiSummary({ msg: 'נא להעלות תמונה או להזין תיאור של הארוחה', isError: true });
      return;
    }
    const promptToUse = rawPrompt;

    const selectedAngles = activeImages.map((im) => im.angle || 'unset');
    const labelProducts = activeImages.map((im) =>
      im.angle === 'label' && im.labelProductName?.trim()
        ? im.labelProductName.trim()
        : undefined
    );
    const fullContextParams: AiContextParams = {
      ...contextParams,
      imageAngles: selectedAngles.length > 0 ? selectedAngles.map((a) => (a === 'unset' ? 'other' : a)) : undefined,
      imageLabelProducts: labelProducts.some(Boolean) ? labelProducts : undefined,
      includePreviousMealPhotos: mode === 'photo' ? includePreviousMealPhotos : false,
      customUnits: customFoodUnits,
    };

    // עדכון היסטוריית צ'יפים לפי שימוש אחרון (MRU) ברקע
    if (
      onManageQuickChips &&
      traineeId &&
      Array.isArray(contextParams.activeChipLabels) &&
      contextParams.activeChipLabels.length > 0
    ) {
      const chipObjs = contextParams.activeChipLabels.map((lbl) => {
        const found =
          recentContextChips.find((c) => c.label === lbl) ||
          groupQuickChips.find((c) => c.label === lbl) ||
          globalQuickChips.find((c) => c.label === lbl);
        return {
          label: lbl,
          category: found?.category || ('prep' as const),
        };
      });
      void onManageQuickChips({
        scope: 'user',
        op: 'touch',
        traineeId,
        chips: chipObjs,
      });
    }

    // אם קיימת תמיכת רקע והפענוח הוא לאופציית צילום/טקסט של המשתמש — הרץ ברקע עם סנכרון אוטומטי ל-DB!
    if (
      optionIndex === undefined &&
      onStartBackgroundAiAnalysis &&
      traineeId &&
      selectedDate &&
      mealSlot
    ) {
      setAiSummary(null);
      await onStartBackgroundAiAnalysis({
        traineeId,
        date: selectedDate,
        mealSlotId: mealSlot.id,
        mealSlotName: mealSlot.name,
        mode,
        imageDataUrl: mode === 'photo' ? activeImages[0]?.dataUrl || undefined : undefined,
        imageDataUrls:
          mode === 'photo' && activeImages.length > 0
            ? activeImages.map((im) => im.dataUrl)
            : undefined,
        imageMetas:
          mode === 'photo' && activeImages.length > 0
            ? activeImages.map((im) => ({
                angle: im.angle,
                labelProductName: im.labelProductName,
              }))
            : undefined,
        textPrompt: promptToUse,
        contextParams: fullContextParams,
      });
      return;
    }

    aiLockRef.current = true;
    setAiLoading(true);
    if (optionIndex !== undefined) setAddingOptionIdx(optionIndex);
    setAiSummary(null);
    const fgDraft =
      traineeId && selectedDate && mealSlot && optionIndex === undefined
        ? {
            traineeId,
            date: selectedDate,
            mealSlotId: mealSlot.id,
            mode,
            photos: activeImages.map((im) => ({
              dataUrl: im.dataUrl,
              angle: im.angle,
              labelProductName: im.labelProductName,
            })),
            textPrompt: promptToUse,
            contextParams: fullContextParams,
            includePreviousMealPhotos,
            failedAt: new Date().toISOString(),
          }
        : null;
    fgAiAbortRef.current?.abort();
    const fgCtrl = new AbortController();
    fgAiAbortRef.current = fgCtrl;
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: fgCtrl.signal,
        body: JSON.stringify({
          imageDataUrl: mode === 'photo' ? activeImages[0]?.dataUrl || undefined : undefined,
          imageDataUrls:
            mode === 'photo' && activeImages.length > 0
              ? activeImages.map((im) => im.dataUrl)
              : undefined,
          textPrompt: promptToUse,
          contextParams: fullContextParams,
          traineeId,
          date: selectedDate,
          mealSlotId: mealSlot?.id,
          customApiKey: geminiApiKey,
        }),
      });
      if (fgCtrl.signal.aborted) return;
      if (await handlePossibleAuthRejection(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (fgDraft) {
          void saveFailedAiDraft({ ...fgDraft, errorMsg: data.error });
        }
        setAiSummary({
          msg: data.error || 'שגיאה בפענוח ה-AI – נסה שוב',
          isError: true,
        });
        return;
      }
      if (fgDraft && traineeId && selectedDate && mealSlot) {
        void clearFailedAiDraft(traineeId, selectedDate, mealSlot.id, mode);
      }
      if (Array.isArray(data.items) && data.items.length > 0) {
        appendItemsSmart(data.items);
        if (Array.isArray(data.suggestedExtras) && data.suggestedExtras.length > 0) {
          setSuggestedExtras((prev) =>
            filterUnacceptedSuggestedExtras(
              [...prev, ...data.suggestedExtras],
              [...itemsRef.current, ...data.items],
              dismissedExtrasKeysRef.current
            )
          );
        }
        const isFallback = Boolean(data.isAiFallback || data.isFallback);
        const detail =
          isFallback && data.summary
            ? `${data.summary} (ניתן לערוך כמויות וערכים למטה)`
            : `זוהו ${data.items.length} מרכיבים ונוספו לארוחה (ניתן לערוך כמויות וערכים למטה)`;
        setAiSummary({
          msg: detail,
          engine: data.engine,
          isFallback,
          fallbackReason: data.fallbackReason,
        });
      } else {
        setAiSummary({
          msg: 'לא זוהו מרכיבים – נסה לתאר בצורה מפורטת יותר',
          isError: true,
        });
      }
    } catch {
      if (fgCtrl.signal.aborted) return;
      if (fgDraft) void saveFailedAiDraft({ ...fgDraft, errorMsg: 'שגיאה בפענוח ה-AI' });
      setAiSummary({ msg: 'שגיאה בפענוח ה-AI', isError: true });
    } finally {
      if (fgAiAbortRef.current === fgCtrl) {
        fgAiAbortRef.current = null;
      }
      aiLockRef.current = false;
      setAiLoading(false);
      setAddingOptionIdx(null);
    }
  };

  const toggleVoiceRecording = (targetField: 'search' | 'ai-text' = 'ai-text') => {
    if (typeof window === 'undefined') return;
    if (voiceState === 'listening') {
      stopVoiceRecording(true);
      return;
    }
    if (voiceState === 'transcribing') {
      return;
    }

    const baseText = (targetField === 'search' ? searchQuery : freeTextPrompt).trim();
    voiceBaseTextRef.current = baseText;
    setAiSummary(null);

    voiceControllerRef.current = startUnifiedVoiceCapture({
      customApiKey: geminiApiKey,
      onStateChange: (next) => {
        setVoiceState(next);
        if (next === 'idle') {
          voiceControllerRef.current = null;
        }
      },
      onTranscript: (transcript) => {
        const clean = transcript.trim();
        if (!clean) return;
        const combined = voiceBaseTextRef.current
          ? `${voiceBaseTextRef.current} ${clean}`
          : clean;
        if (targetField === 'search') {
          setSearchQuery(combined);
        } else {
          setFreeTextPrompt(combined);
        }
      },
      onError: (msg, info) => {
        setAiSummary({ msg, isError: true });
        notifications.show({
          color: 'orange',
          title: 'הכתבה קולית',
          message: msg,
        });
        if (info?.micBlocked) {
          setTimeout(() => {
            if (targetField === 'search') {
              searchInputRef.current?.focus();
            } else {
              aiTextRef.current?.focus();
            }
          }, 80);
        }
      },
    });
  };

  const fetchAiRecommendations = async () => {
    if (!mealSlot || recLockRef.current) return;
    const totalsNow = sumMacros(items.map((i) => i.macros));
    const remainingMacros = {
      calories: Math.max(80, mealSlot.targets.calories - totalsNow.calories),
      protein: Math.max(5, Math.round(mealSlot.targets.protein - totalsNow.protein)),
      carbs: Math.max(5, Math.round(mealSlot.targets.carbs - totalsNow.carbs)),
      fat: Math.max(3, Math.round(mealSlot.targets.fat - totalsNow.fat)),
    };
    recLockRef.current = true;
    setAiRecLoading(true);
    setLearnedFeedbackBanner(null);
    setAiSummary(null);
    aiRecAbortRef.current?.abort();
    const recCtrl = new AbortController();
    aiRecAbortRef.current = recCtrl;
    try {
      const res = await fetch('/api/ai/recommend-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: recCtrl.signal,
        body: JSON.stringify({
          action: 'recommend',
          traineeId,
          mealName: mealSlot.name,
          targetMacros: remainingMacros,
          customApiKey: geminiApiKey,
        }),
      });
      if (recCtrl.signal.aborted) return;
      if (await handlePossibleAuthRejection(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiSummary({
          msg: data.error || 'שגיאה בקבלת המלצות ארוחה מ-AI',
          isError: true,
        });
        return;
      }
      if (Array.isArray(data.options)) {
        setAiRecommendations(data.options);
        setAiRecDebug({
          engine: data.engine,
          isFallback: Boolean(data.isAiFallback),
          fallbackReason: data.fallbackReason,
          appliedContextSummary: data.appliedContextSummary,
        });
      } else {
        setAiRecDebug(null);
        setAiSummary({ msg: 'לא התקבלו הצעות – נסה שוב', isError: true });
      }
    } catch {
      if (recCtrl.signal.aborted) return;
      setAiRecDebug(null);
      setAiSummary({ msg: 'שגיאה בקבלת המלצות ארוחה מ-AI', isError: true });
    } finally {
      if (aiRecAbortRef.current === recCtrl) {
        aiRecAbortRef.current = null;
      }
      recLockRef.current = false;
      setAiRecLoading(false);
    }
  };

  const handleCancelAiRecommend = () => {
    aiRecAbortRef.current?.abort();
    aiRecAbortRef.current = null;
    recLockRef.current = false;
    setAiRecLoading(false);
    setAiSummary({ msg: 'קבלת ההצעות בוטלה — ההגדרות והטקסט נשמרו.' });
  };

  const handleLearnPreference = async () => {
    if (!preferenceFeedbackText.trim() || prefLockRef.current) return;
    prefLockRef.current = true;
    setLearningPrefLoading(true);
    setLearnedFeedbackBanner(null);
    try {
      const res = await fetch('/api/ai/recommend-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'learn-preference',
          traineeId,
          userFeedbackText: preferenceFeedbackText.trim(),
          customApiKey: geminiApiKey,
        }),
      });
      if (await handlePossibleAuthRejection(res)) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.learnedRule) {
        setLearnedFeedbackBanner({
          msg: `נלמד ונשמר לעתיד: "${data.learnedRule}"`,
          engine: data.engine,
          isFallback: Boolean(data.isAiFallback),
          fallbackReason: data.fallbackReason,
        });
        setPreferenceFeedbackText('');
        const nextPrefs = data.aiLearnedPreferences || data.allPreferences;
        if (onPreferenceLearned && Array.isArray(nextPrefs)) {
          onPreferenceLearned(nextPrefs);
        }
      } else {
        setLearnedFeedbackBanner({
          msg: data.error || 'שגיאה בשמירת ההעדפה',
          isError: true,
        });
      }
    } catch {
      setLearnedFeedbackBanner({
        msg: 'שגיאה בשמירת ההעדפה',
        isError: true,
      });
    } finally {
      prefLockRef.current = false;
      setLearningPrefLoading(false);
    }
  };

  const appendItemsSmart = (newItems: LoggedFoodItem[]) => {
    if (newItems.length === 0) return;
    if (targetDishIdForAdd) {
      const additions = newItems.flatMap((it) =>
        hasCompositeComponents(it)
          ? it.components!.map(stripNestedComponents)
          : [stripNestedComponents(it)]
      );
      setItems((prev) =>
        prev.map((it) =>
          it.id === targetDishIdForAdd
            ? recalculateParentDish({
                ...it,
                components: [...(it.components || []), ...additions],
              })
            : it
        )
      );
      setEditingItemId(targetDishIdForAdd);
      setTargetDishIdForAdd(null);
      setAiSummary({ msg: `נוספו ${additions.length} מרכיבים לתוך המנה` });
      return;
    }
    setItems((prev) => [...prev, ...newItems]);
  };

  const updateLoggedItemFull = (nextItem: LoggedFoodItem) => {
    setItems((prev) => prev.map((it) => (it.id === nextItem.id ? nextItem : it)));
  };

  const handleToggleSelectTop = (item: LoggedFoodItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (hasCompositeComponents(item)) {
        const compIds = item.components!.map((c) => c.id);
        const allSelected =
          next.has(item.id) ||
          (compIds.length > 0 && compIds.every((id) => next.has(id)));
        if (allSelected) {
          next.delete(item.id);
          for (const id of compIds) next.delete(id);
        } else {
          next.add(item.id);
          for (const id of compIds) next.add(id);
        }
      } else {
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  };

  const handleToggleSelectComponent = (
    parent: LoggedFoodItem,
    comp: LoggedFoodItem
  ) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const compIds = parent.components?.map((c) => c.id) || [];
      if (next.has(parent.id)) {
        // הפיכה לבחירה חלקית: כל שאר המרכיבים נשארים, והמרכיב הזה נמחק
        next.delete(parent.id);
        for (const id of compIds) {
          if (id !== comp.id) next.add(id);
        }
      } else if (next.has(comp.id)) {
        next.delete(comp.id);
      } else {
        next.add(comp.id);
        if (compIds.length > 0 && compIds.every((id) => next.has(id))) {
          next.add(parent.id);
        }
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setItems((prev) => removeSelectedFromItems(prev, selectedIds));
    setSelectedIds(new Set());
    setSelectionMode(false);
    notifications.show({
      title: 'הפריטים הוסרו',
      message: 'הפריטים שנבחרו הוסרו מהארוחה.',
      color: 'orange',
    });
  };

  const handleConfirmGroupSelected = () => {
    const title = groupDishTitle.trim();
    if (!title || selectedIds.size === 0) return;
    const selectedTop = items.filter((it) => selectedIds.has(it.id));
    if (selectedTop.length < 2) return;

    const firstIdx = items.findIndex((it) => selectedIds.has(it.id));
    const grouped = groupItemsAsCompositeDish(selectedTop, title);
    const remaining = items.filter((it) => !selectedIds.has(it.id));
    const insertAt = Math.min(Math.max(0, firstIdx), remaining.length);
    const nextList = [
      ...remaining.slice(0, insertAt),
      grouped,
      ...remaining.slice(insertAt),
    ];

    setItems(nextList);
    setEditingItemId(grouped.id);
    setSelectedIds(new Set());
    setSelectionMode(false);
    setGroupDishTitle('');
    setGroupModalOpen(false);
    notifications.show({
      title: 'אוחדו למנה אחת',
      message: `המנה "${grouped.name}" נוצרה בהצלחה.`,
      color: 'teal',
    });
  };

  const handleSyncBackPreset = async (dish: LoggedFoodItem) => {
    if (!dish.sourcePresetId || !onSavedMealAction) return;
    const targetPreset = savedMeals.find((p) => p.id === dish.sourcePresetId);
    if (!targetPreset) return;

    const clonedDish = cloneFoodItemWithFreshIds(dish, 'sync', {
      sourcePresetId: targetPreset.id,
    });
    const nextPresetItems =
      targetPreset.items.length <= 1 || targetPreset.presetKind === 'dish'
        ? [clonedDish]
        : targetPreset.items.map((it) =>
            it.name.trim().toLowerCase() === dish.name.trim().toLowerCase()
              ? clonedDish
              : it
          );

    const res = await onSavedMealAction({
      op: 'upsert',
      preset: {
        ...targetPreset,
        items: nextPresetItems,
      },
    });
    if (res.error) {
      notifications.show({ title: 'שגיאה', message: res.error, color: 'red' });
      return;
    }
    notifications.show({
      title: 'המנה השמורה עודכנה',
      message: `"${targetPreset.title}" עודכנה בספרייה לשימוש עתידי.`,
      color: 'teal',
    });
  };

  const handleSaveLearnedRuleHint = async () => {
    const cleanRule = (learnedRuleHint || '').trim();
    if (!cleanRule || savingRuleHint) return;
    setSavingRuleHint(true);
    try {
      const res = await fetch('/api/ai/recommend-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'learn-preference',
          traineeId,
          userFeedbackText: cleanRule,
          customApiKey: geminiApiKey,
        }),
      });
      if (await handlePossibleAuthRejection(res)) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.learnedRule) {
        const nextPrefs = data.aiLearnedPreferences || data.allPreferences;
        if (onPreferenceLearned && Array.isArray(nextPrefs)) {
          onPreferenceLearned(nextPrefs);
        }
        setLearnedRuleHint(null);
        notifications.show({
          title: 'העדפה נשמרה למנות הבאות',
          message: `"${data.learnedRule}"`,
          color: 'teal',
        });
      }
    } finally {
      setSavingRuleHint(false);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    delete itemScaleBaseRef.current[id];
    setItemFieldDrafts((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const initialEntryPhotos = useMemo(() => {
    return resolveMealPhotos(existingEntry);
  }, [existingEntry]);

  const allMealPhotos = useMemo(() => {
    const merged = [
      ...photoItems.map((im) => im.dataUrl),
      ...(photoDataUrl && !photoDataUrl.endsWith(',DEMO') ? [photoDataUrl] : []),
      ...initialEntryPhotos,
    ];
    return merged
      .filter((u, idx, arr) => Boolean(u) && arr.indexOf(u) === idx)
      .slice(0, 8);
  }, [photoItems, photoDataUrl, initialEntryPhotos]);

  const hasPendingItemFieldEdits = useMemo(
    () =>
      items.some((it) => {
        const d = itemFieldDrafts[it.id];
        if (!d) return false;
        if (d.grams !== undefined) {
          const parsedG = parseOptionalDecimal(d.grams);
          if (
            parsedG === undefined ||
            parsedG <= 0 ||
            Math.round(parsedG * 10) / 10 !== Math.round(it.grams * 10) / 10
          ) {
            return true;
          }
        }
        const macroKeys = ['calories', 'protein', 'carbs', 'fat'] as const;
        return macroKeys.some((k) => {
          if (d[k] === undefined) return false;
          const p = parseOptionalDecimal(d[k]);
          if (p === undefined || p < 0) return true;
          const norm = k === 'calories' ? Math.round(p) : Math.round(p * 10) / 10;
          return norm !== it.macros[k];
        });
      }),
    [items, itemFieldDrafts]
  );

  const hasMealChanges = useMemo(() => {
    const initialItems = existingEntry?.items || [];
    const hasInitialContent =
      initialItems.length > 0 ||
      initialEntryPhotos.length > 0 ||
      Boolean((existingEntry?.photoNote || '').trim());

    if (
      !hasInitialContent &&
      items.length === 0 &&
      allMealPhotos.length === 0 &&
      !photoNote.trim()
    ) {
      return false;
    }

    if (hasPendingItemFieldEdits) return true;

    if (saveAsPreset && items.length > 0 && Boolean(onSavedMealAction)) {
      return true;
    }

    if (items.length !== initialItems.length) return true;
    for (let idx = 0; idx < items.length; idx++) {
      const cur = items[idx];
      const base = initialItems[idx];
      if (!cur || !base) return true;
      if (
        cur.id !== base.id ||
        cur.name.trim() !== base.name.trim() ||
        Math.round(cur.grams * 10) / 10 !== Math.round(base.grams * 10) / 10 ||
        (cur.unitLabel || '') !== (base.unitLabel || '') ||
        (normalizeHhMmTime(cur.itemTime || '') || '') !==
          (normalizeHhMmTime(base.itemTime || '') || '') ||
        Math.round(cur.macros.calories) !== Math.round(base.macros.calories) ||
        Math.round(cur.macros.protein * 10) !== Math.round(base.macros.protein * 10) ||
        Math.round(cur.macros.carbs * 10) !== Math.round(base.macros.carbs * 10) ||
        Math.round(cur.macros.fat * 10) !== Math.round(base.macros.fat * 10) ||
        JSON.stringify(cur.components || []) !== JSON.stringify(base.components || [])
      ) {
        return true;
      }
    }

    if (allMealPhotos.length !== initialEntryPhotos.length) return true;
    for (let idx = 0; idx < allMealPhotos.length; idx++) {
      if (allMealPhotos[idx] !== initialEntryPhotos[idx]) return true;
    }

    if (photoNote.trim() && photoNote !== (existingEntry?.photoNote || '')) return true;

    const baselineTime =
      normalizeHhMmTime(existingEntry?.mealTime || mealSlot?.timeHint || '') || '';
    const currentTime =
      normalizeHhMmTime(mealTime || mealSlot?.timeHint || '') || '';
    if (currentTime !== baselineTime) return true;

    return false;
  }, [
    existingEntry,
    initialEntryPhotos,
    items,
    allMealPhotos,
    photoNote,
    hasPendingItemFieldEdits,
    saveAsPreset,
    onSavedMealAction,
    mealTime,
    mealSlot?.timeHint,
  ]);

  if (!mealSlot) return null;

  const currentTotals = sumMacros(items.map((i) => i.macros));
  const previewGramsVal = Math.max(0, parseOptionalDecimal(customGrams) ?? 0);
  const previewMacros = selectedFood
    ? calculateMacrosForGrams(selectedFood.per100g, previewGramsVal)
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const mealThumbnailUrl = allMealPhotos[0];

  const handleSaveMealAndClose = async () => {
    if (saveLockRef.current || !hasMealChanges) return;
    const invalidItem = items.find((it) => {
      const gDraft = itemFieldDrafts[it.id]?.grams;
      if (gDraft === undefined) return false;
      const parsed = parseOptionalDecimal(gDraft);
      return parsed === undefined || parsed <= 0;
    });
    if (invalidItem) {
      setEditingItemId(invalidItem.id);
      setAiSummary({
        msg: `נא להזין משקל בגרם גדול מ-0 עבור "${invalidItem.name}"`,
        isError: true,
      });
      return;
    }

    const finalItems = items.map((it) => {
      const d = itemFieldDrafts[it.id];
      const macroField = (
        k: 'calories' | 'protein' | 'carbs' | 'fat',
        current: number
      ) => {
        if (!d || d[k] === undefined) return current;
        const p = parseOptionalDecimal(d[k]);
        if (p === undefined || p < 0) return 0;
        return k === 'calories' ? Math.round(p) : Math.round(p * 10) / 10;
      };
      const resolvedMacros = {
        calories: macroField('calories', it.macros.calories),
        protein: macroField('protein', it.macros.protein),
        carbs: macroField('carbs', it.macros.carbs),
        fat: macroField('fat', it.macros.fat),
      };
      const hasAnyMacro =
        resolvedMacros.calories > 0 ||
        resolvedMacros.protein > 0 ||
        resolvedMacros.carbs > 0 ||
        resolvedMacros.fat > 0;
      const gSafe = Math.max(1, it.grams);
      const rawPer100Factor = 100 / gSafe;
      const fitsNormalBounds =
        resolvedMacros.calories * rawPer100Factor <= 950 &&
        resolvedMacros.protein * rawPer100Factor <= 100 &&
        resolvedMacros.carbs * rawPer100Factor <= 100 &&
        resolvedMacros.fat * rawPer100Factor <= 100;
      const derivedPer100g =
        !it.per100g && hasAnyMacro && fitsNormalBounds
          ? computePer100gFromServing(resolvedMacros, gSafe)
          : it.per100g;
      return {
        ...it,
        ...(derivedPer100g ? { per100g: derivedPer100g } : {}),
        macros: resolvedMacros,
      };
    });

    saveLockRef.current = true;
    setSavingMeal(true);
    try {
      const primaryPhoto = allMealPhotos[0] || photoDataUrl;
      const effectivePhotoNote = photoNote.trim()
        ? photoNote
        : existingEntry?.photoNote || '';
      const remainingSuggestedExtras = filterUnacceptedSuggestedExtras(
        suggestedExtras,
        finalItems,
        dismissedExtrasKeysRef.current
      );
      await onSaveMeal(
        mealSlot.id,
        finalItems,
        primaryPhoto,
        effectivePhotoNote,
        allMealPhotos.length > 0 ? allMealPhotos : undefined,
        mealTime || undefined,
        remainingSuggestedExtras
      );
      if (saveAsPreset && finalItems.length > 0 && onSavedMealAction) {
        const autoTitle =
          presetTitleInput.trim() ||
          finalItems
            .slice(0, 2)
            .map((i) => i.name)
            .join(' + ');
        const aiItem = finalItems.find(
          (it) => it.aiEngine || it.isAiFallback !== undefined
        );
        const presetItemsToSave = savePresetAsSingleDish
          ? [groupItemsAsCompositeDish(finalItems, autoTitle)]
          : finalItems;
        await onSavedMealAction({
          op: 'upsert',
          preset: {
            title: autoTitle,
            mealSlotId: mealSlot.id,
            presetKind: savePresetAsSingleDish ? 'dish' : 'meal',
            items: presetItemsToSave,
            photoDataUrls: allMealPhotos.length > 0 ? allMealPhotos : undefined,
            photoDataUrl: primaryPhoto,
            contextParams,
            aiEngine: aiItem?.aiEngine,
            isAiFallback: aiItem?.isAiFallback,
            fallbackReason: aiItem?.fallbackReason,
            useCount: 1,
          },
        });
      }
      setSuggestedExtras([]);
      setPreCorrectionItems(null);
      setItemFieldDrafts({});
      itemScaleBaseRef.current = {};
      onClose();
    } finally {
      saveLockRef.current = false;
      setSavingMeal(false);
    }
  };

  const markSuggestedExtrasDismissed = (extrasList: LoggedFoodItem[]) => {
    for (const ex of extrasList) {
      if (ex.id) dismissedExtrasKeysRef.current.add(`id:${ex.id}`);
      const norm = normalizeSuggestedExtraName(ex.name);
      if (norm) dismissedExtrasKeysRef.current.add(`name:${norm}`);
    }
  };

  const handleDismissSuggestedExtras = (targetExtra?: LoggedFoodItem) => {
    const toDismiss = targetExtra ? [targetExtra] : suggestedExtras;
    markSuggestedExtrasDismissed(toDismiss);
    const nextExtras = targetExtra
      ? suggestedExtras.filter((p) => p.id !== targetExtra.id)
      : [];
    setSuggestedExtras(nextExtras);
    if (existingEntry && mealSlot && !hasMealChanges) {
      void onSaveMeal(
        mealSlot.id,
        existingEntry.items || [],
        existingEntry.photoDataUrl,
        existingEntry.photoNote,
        existingEntry.photoDataUrls,
        existingEntry.mealTime,
        nextExtras
      );
    }
  };

  const toggleCorrectionVoice = () => {
    if (correctionVoiceState !== 'idle') {
      stopCorrectionVoice(correctionVoiceState === 'listening');
      return;
    }
    stopVoiceRecording(false);
    correctionVoiceBaseRef.current = correctionText.trim();
    correctionVoiceCtrlRef.current = startUnifiedVoiceCapture({
      customApiKey: geminiApiKey,
      onStateChange: (st) => {
        setCorrectionVoiceState(st);
        if (st === 'idle') correctionVoiceCtrlRef.current = null;
      },
      onTranscript: (transcript) => {
        const clean = transcript.trim();
        if (!clean) return;
        const base = correctionVoiceBaseRef.current;
        setCorrectionText(base ? `${base} ${clean}` : clean);
      },
      onError: (msg) => {
        setCorrectionVoiceState('idle');
        correctionVoiceCtrlRef.current = null;
        setCorrectionError(msg);
      },
    });
  };

  const handleRunAiCorrection = async () => {
    const cleanPrompt = correctionText.trim();
    if (!cleanPrompt || correctionLoading || isSlotBgProcessing || items.length === 0) return;
    stopCorrectionVoice(false);
    setCorrectionError(null);

    const scopedIds =
      selectionMode && selectedIds.size > 0 ? Array.from(selectedIds) : undefined;
    const nextHistoryEntry = {
      beforeNames: items.map((i) => i.name),
      prompt: cleanPrompt,
      at: new Date().toISOString(),
    };
    const nextHistory = [...correctionHistory, nextHistoryEntry].slice(-6);
    setCorrectionHistory(nextHistory);

    // הרצת תיקון ברקע (תומך ביציאה מהחלונית / יציאה מהאפליקצייה + פוש + סנכרון חוזר אוטומטי!)
    if (onStartBackgroundAiAnalysis && traineeId && selectedDate && mealSlot) {
      const baseSnapshot = [...items];
      pendingBgAdjustDraftRef.current = {
        prompt: cleanPrompt,
        targetIds: scopedIds,
        wasSelectionMode: selectionMode,
        selectedIdsSnapshot: Array.from(selectedIds),
      };
      setPreCorrectionItems(baseSnapshot);
      pendingAdjustReplaceRef.current = true;
      setCorrectionOpen(false);
      setCorrectionText('');
      setSelectionMode(false);
      setSelectedIds(new Set());
      setAiSummary(null);
      await onStartBackgroundAiAnalysis({
        traineeId,
        date: selectedDate,
        mealSlotId: mealSlot.id,
        mealSlotName: mealSlot.name,
        mode: 'adjust',
        baseItems: baseSnapshot,
        selectedTargetIds: scopedIds,
        correctionHistory: nextHistory,
        adjustmentPrompt: cleanPrompt,
        contextParams: { ...contextParams, customUnits: customFoodUnits },
        imageDataUrl: allMealPhotos[0],
        imageDataUrls: allMealPhotos.length > 0 ? allMealPhotos : undefined,
      });
      return;
    }

    const adjustDraft =
      traineeId && selectedDate && mealSlot
        ? {
            traineeId,
            date: selectedDate,
            mealSlotId: mealSlot.id,
            mode: 'adjust' as const,
            adjustmentPrompt: cleanPrompt,
            selectedTargetIds: scopedIds,
            baseItems: [...items],
            contextParams: { ...contextParams, customUnits: customFoodUnits },
            failedAt: new Date().toISOString(),
          }
        : null;

    fgAdjustAbortRef.current?.abort();
    const adjCtrl = new AbortController();
    fgAdjustAbortRef.current = adjCtrl;
    setCorrectionLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: adjCtrl.signal,
        body: JSON.stringify({
          mode: 'adjust-meal',
          baseItems: items,
          selectedTargetIds: scopedIds,
          correctionHistory: nextHistory,
          adjustmentPrompt: cleanPrompt,
          contextParams: { ...contextParams, customUnits: customFoodUnits },
          traineeId,
          date: selectedDate,
          mealSlotId: mealSlot?.id,
          imageDataUrl: allMealPhotos[0],
          imageDataUrls: allMealPhotos.length > 0 ? allMealPhotos : undefined,
        }),
      });
      if (adjCtrl.signal.aborted) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.items) || (data.items.length === 0 && !scopedIds)) {
        const errMsg =
          data?.error || 'לא הצלחנו לעדכן את הארוחה כרגע — נסה שוב בעוד רגע.';
        if (adjustDraft) {
          void saveFailedAiDraft({ ...adjustDraft, errorMsg: errMsg });
        }
        setCorrectionError(errMsg);
        return;
      }

      if (adjustDraft && traineeId && selectedDate && mealSlot) {
        void clearFailedAiDraft(traineeId, selectedDate, mealSlot.id, 'adjust');
      }

      setPreCorrectionItems([...items]);
      const prevTimeByName = new Map<string, string>();
      for (const prevIt of items) {
        if (prevIt.itemTime) {
          prevTimeByName.set(prevIt.name.trim().toLowerCase(), prevIt.itemTime);
        }
      }
      const nextItemsWithTimes = (data.items as LoggedFoodItem[]).map((it) => {
        if (it.itemTime) return it;
        const t = prevTimeByName.get(it.name.trim().toLowerCase());
        return t ? { ...it, itemTime: t } : it;
      });
      setItems(nextItemsWithTimes);
      setItemFieldDrafts({});
      itemScaleBaseRef.current = {};
      setSelectionMode(false);
      setSelectedIds(new Set());
      if (typeof data.learnedRuleHint === 'string' && data.learnedRuleHint.trim()) {
        setLearnedRuleHint(data.learnedRuleHint.trim());
      }
      const nextNames = new Set(
        (data.items as LoggedFoodItem[]).map((it) => it.name.trim().toLowerCase())
      );
      setSuggestedExtras((prev) =>
        prev.filter((ex) => !nextNames.has(ex.name.trim().toLowerCase()))
      );
      setAiSummary({
        msg: data.summary || 'הארוחה עודכנה בהצלחה באמצעות AI',
        engine: data.engine,
        isFallback: Boolean(data.isAiFallback),
        fallbackReason: data.fallbackReason,
      });
      notifications.show({
        title: 'הארוחה עודכנה',
        message: data.summary || 'הרכיבים והערכים עודכנו לפי בקשתך.',
        color: 'teal',
      });
      setCorrectionOpen(false);
      setCorrectionText('');
    } catch {
      if (adjCtrl.signal.aborted) return;
      if (adjustDraft) {
        void saveFailedAiDraft({
          ...adjustDraft,
          errorMsg: 'שגיאת תקשורת בעת שליחת התיקון',
        });
      }
      setCorrectionError('שגיאת תקשורת בעת שליחת התיקון — בדוק חיבור ונסה שוב.');
    } finally {
      if (fgAdjustAbortRef.current === adjCtrl) {
        fgAdjustAbortRef.current = null;
      }
      setCorrectionLoading(false);
    }
  };

  const handleCancelActiveAi = () => {
    if (isSlotBgProcessing && slotBgProcessingJob) {
      const job = slotBgProcessingJob;
      void onCancelAiJob?.(job.id, traineeId);
      if (job.mode === 'adjust') {
        pendingAdjustReplaceRef.current = false;
        const backup = pendingBgAdjustDraftRef.current;
        const promptToRestore = backup?.prompt || job.retryPayload?.adjustmentPrompt || '';
        const selectedToRestore =
          backup?.selectedIdsSnapshot || job.retryPayload?.selectedTargetIds || [];
        if (promptToRestore) setCorrectionText(promptToRestore);
        if (backup?.wasSelectionMode || selectedToRestore.length > 0) {
          setSelectionMode(true);
          setSelectedIds(new Set(selectedToRestore));
        }
        setCorrectionOpen(true);
        pendingBgAdjustDraftRef.current = null;
      }
      setAiSummary({ msg: 'הבקשה בוטלה לבקשתך — כל הנתונים שהזנת נשמרו.' });
      return;
    }

    if (aiLoading) {
      fgAiAbortRef.current?.abort();
      fgAiAbortRef.current = null;
      aiLockRef.current = false;
      setAiLoading(false);
      setAddingOptionIdx(null);
      setAiSummary({ msg: 'הבקשה בוטלה לבקשתך — כל הנתונים שהזנת נשמרו.' });
      return;
    }

    if (correctionLoading) {
      fgAdjustAbortRef.current?.abort();
      fgAdjustAbortRef.current = null;
      setCorrectionLoading(false);
      setCorrectionError(null);
      setAiSummary({ msg: 'הבקשה בוטלה לבקשתך — הנחיית התיקון והבחירות נשמרו.' });
    }
  };

  const renderFloatingAiOverlay = () => {
    if (!opened) return null;
    const isProcessing = isSlotBgProcessing || aiLoading;

    if (isProcessing && progressFloatingCollapsed) {
      const pct = Math.min(
        95,
        Math.round(100 * (1 - Math.exp(-progressTicker.elapsedSec / 25)))
      );
      return (
        <button
          type="button"
          aria-label={`פענוח AI מתקדם ${pct}% — לחץ להרחבה`}
          onClick={() => setProgressFloatingCollapsed(false)}
          className="glass"
          style={{
            position: 'fixed',
            bottom: 'calc(var(--sa-bottom, 0px) + 84px)',
            insetInlineEnd: 16,
            zIndex: 255,
            width: 56,
            height: 56,
            padding: 0,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <svg
            width="56"
            height="56"
            viewBox="0 0 56 56"
            aria-hidden
            style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
          >
            <circle
              cx="28"
              cy="28"
              r="26"
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth="3"
            />
            <circle
              cx="28"
              cy="28"
              r="26"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(pct / 100) * 163.4} 163.4`}
              style={{ transition: 'stroke-dasharray .8s ease' }}
            />
          </svg>
          <Sparkles size={20} color="currentColor" />
        </button>
      );
    }

    return null;
  };

  /**
   * באנר סטטוס / שגיאת AI המשולב בזרימת הדף מתחת לכותרת כדי שלעולם לא יסתיר
   * את כפתורי השליחה או השמירה התחתונים בעת כניסה לארוחה.
   */
  const renderInlineAiBanner = (isHeroLayout = false) => {
    if (!opened) return null;
    const isProcessing = isSlotBgProcessing || aiLoading;
    const isAdjusting = slotBgProcessingJob?.mode === 'adjust';
    const bannerMargin = isHeroLayout
      ? 'calc(var(--sa-top, 0px) + 66px) 16px 4px'
      : '8px 16px 0';

    if (isProcessing && !progressFloatingCollapsed) {
      return (
        <div
          className="glass"
          role="status"
          aria-live="polite"
          style={{
            flexShrink: 0,
            margin: bannerMargin,
            borderRadius: 22,
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Loader2 size={16} color="var(--accent)" className="spot-spinner" />
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)' }}>
                {isAdjusting
                  ? 'מתקן ומחשב מחדש את הארוחה...'
                  : progressTicker.currentStepText}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span
                className="num-mono"
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--surface-2)',
                  color: 'var(--accent)',
                }}
              >
                {progressTicker.formattedElapsed}
              </span>
              <button
                type="button"
                aria-label="מזער"
                onClick={() => setProgressFloatingCollapsed(true)}
                className="hit-44"
                style={{
                  width: 30,
                  height: 30,
                  border: 0,
                  borderRadius: 999,
                  background: 'transparent',
                  color: 'var(--text-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Minimize2 size={15} />
              </button>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
            {isAdjusting
              ? 'מעדכן את רכיבי הארוחה לפי בקשתך — התיקון ממשיך בשרת.'
              : 'ניתוח AI מתקדם עשוי לקחת 1–3 דקות — אפשר לסגור חלונית ולהמשיך רגיל.'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleCancelActiveAi}
              className="btn-surface"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                color: 'var(--danger-text)',
                borderColor: 'rgba(239, 68, 68, 0.35)',
              }}
            >
              עצור / בטל בקשה
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-surface"
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                color: 'var(--accent)',
              }}
            >
              אפשר לצאת בינתיים — סגור חלונית ←
            </button>
          </div>
        </div>
      );
    }

    if (aiSummary) {
      const iconBg = aiSummary.isError
        ? 'rgba(239, 68, 68, 0.16)'
        : aiSummary.isFallback
        ? 'rgba(245, 158, 11, 0.16)'
        : 'rgba(16, 185, 129, 0.16)';
      const accentCol = aiSummary.isError
        ? 'var(--danger-text)'
        : aiSummary.isFallback
        ? 'var(--warn-text)'
        : 'var(--accent-volt, var(--accent))';

      return (
        <div
          className="glass"
          role="status"
          aria-live="polite"
          style={{
            flexShrink: 0,
            margin: bannerMargin,
            borderRadius: 22,
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            borderColor: aiSummary.isError
              ? 'rgba(239, 68, 68, 0.38)'
              : aiSummary.isFallback
              ? 'rgba(245, 158, 11, 0.35)'
              : 'var(--line-2)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: iconBg,
              color: accentCol,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {aiSummary.isError ? (
              <AlertTriangle size={16} />
            ) : aiSummary.isFallback ? (
              <Sparkles size={16} />
            ) : (
              <Check size={16} strokeWidth={2.6} />
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
              {aiSummary.msg}
            </div>
            {aiSummary.engine && (
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>
                {aiSummary.isFallback
                  ? `תג תחקור: גיבוי (${aiSummary.engine})${
                      aiSummary.fallbackReason ? ` · ${aiSummary.fallbackReason}` : ''
                    }`
                  : `✨ מנוע AI: ${aiSummary.engine}`}
              </div>
            )}
          </div>
          {aiSummary.isError && slotBgFailedJob && (
            <button
              type="button"
              onClick={() => {
                void handleDirectRetryFailedJob(
                  slotBgFailedJob,
                  slotBgFailedJob.retryPayload
                );
              }}
              className="btn-volt"
              style={{
                height: 32,
                padding: '0 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={12} />
              <span>שלח שוב</span>
            </button>
          )}
          <button
            type="button"
            aria-label="סגור הודעה"
            onClick={() => setAiSummary(null)}
            className="hit-44"
            style={{
              width: 30,
              height: 30,
              border: 0,
              borderRadius: 999,
              background: 'var(--surface-2)',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    if (slotBgFailedJob && slotBgFailedJob.id !== dismissedFailedJobId) {
      return (
        <div
          className="glass"
          role="alert"
          style={{
            flexShrink: 0,
            margin: bannerMargin,
            borderRadius: 22,
            padding: '11px 13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            borderColor: 'rgba(239, 68, 68, 0.4)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.16)',
              color: 'var(--danger-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.35 }}>
              {slotBgFailedJob.errorMsg || 'פענוח ה-AI נכשל'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
              הפרטים שהזנת שמורים — אפשר לשלוח שוב ישירות מכאן.
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              void handleDirectRetryFailedJob(
                slotBgFailedJob,
                slotBgFailedJob.retryPayload
              );
            }}
            className="btn-volt"
            style={{
              height: 34,
              padding: '0 13px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={13} />
            <span>שלח שוב</span>
          </button>
          <button
            type="button"
            aria-label="סגור התראה"
            onClick={() => {
              setDismissedFailedJobId(slotBgFailedJob.id);
              void onAcknowledgeAiJob?.(slotBgFailedJob.id, traineeId);
            }}
            className="hit-44"
            style={{
              width: 30,
              height: 30,
              border: 0,
              borderRadius: 999,
              background: 'var(--surface-2)',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      );
    }

    return null;
  };

  const trimmedQuery = searchQuery.trim();
  const matchedSavedPresets = trimmedQuery
    ? savedMeals
        .filter((m) => {
          const ql = trimmedQuery.toLowerCase();
          return (
            m.title.toLowerCase().includes(ql) ||
            m.items.some((it) => it.name.toLowerCase().includes(ql))
          );
        })
        .slice(0, 5)
    : [];

  const dateInfo = formatDrawerDateLabel(selectedDate);
  const fullScreen = activeTab !== 'hub' && activeTab !== 'catalog';
  const heroScreen = activeTab === 'meal-items' && allMealPhotos.length > 0;
  const safeHeroPhotoIdx =
    allMealPhotos.length > 0
      ? Math.min(Math.max(0, activeHeroPhotoIdx), allMealPhotos.length - 1)
      : 0;

  const stepHeroPhoto = (delta: -1 | 1) => {
    if (allMealPhotos.length <= 1) return;
    setActiveHeroPhotoIdx((prev) => {
      const cur = Math.min(Math.max(0, prev), allMealPhotos.length - 1);
      return Math.max(0, Math.min(allMealPhotos.length - 1, cur + delta));
    });
  };

  const handlePhotoTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    heroSwipeTouchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handlePhotoTouchEnd = (e: React.TouchEvent) => {
    const start = heroSwipeTouchStartRef.current;
    heroSwipeTouchStartRef.current = null;
    if (!start || allMealPhotos.length <= 1) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) >= 34 && Math.abs(dx) > Math.abs(dy) * 1.1) {
      heroSwipedRecentlyRef.current = true;
      setTimeout(() => {
        heroSwipedRecentlyRef.current = false;
      }, 250);
      stepHeroPhoto(dx < 0 ? 1 : -1);
    }
  };

  const renderPhotoSourceOptions = (
    stayOnTab: boolean,
    onCloseChooser?: () => void
  ) => {
    const usedCount = allMealPhotos.length;
    const remainingSlots = Math.max(0, 8 - usedCount);
    const limitReached = remainingSlots <= 0;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
          borderRadius: 16,
          background: 'var(--bg-surface-2)',
          border: '1px solid var(--line-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: limitReached ? 'var(--warn-text)' : 'var(--text-2)' }}>
            {limitReached
              ? 'הגעת למקסימום של 8 תמונות בארוחה (8/8)'
              : `הוספת תמונה (${usedCount}/8 קיימות · ניתן לבחור עוד ${remainingSlots})`}
          </span>
          {onCloseChooser && (
            <button
              type="button"
              aria-label="סגור בחירת תמונה"
              onClick={onCloseChooser}
              style={{
                width: 24,
                height: 24,
                border: 0,
                borderRadius: 999,
                background: 'var(--surface-2)',
                color: 'var(--text-2)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            opacity: limitReached ? 0.45 : 1,
            pointerEvents: limitReached ? 'none' : 'auto',
          }}
        >
          <label
            className="btn-surface"
            style={{
              padding: '9px 6px',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: photoUploading || limitReached ? 'not-allowed' : 'pointer',
              borderColor: 'var(--line-2)',
            }}
          >
            <Camera size={13} color="currentColor" />
            <span>מצלמה בלייב</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={photoUploading || limitReached}
              onChange={(e) =>
                void handlePhotoUpload(e, undefined, stayOnTab ? { stayOnTab: true } : undefined)
              }
            />
          </label>
          <label
            className="btn-surface"
            style={{
              padding: '9px 6px',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: photoUploading || limitReached ? 'not-allowed' : 'pointer',
            }}
          >
            <ImageIcon size={13} color="var(--text-2)" />
            <span>גלריה</span>
            <input
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={photoUploading || limitReached}
              onChange={(e) =>
                void handlePhotoUpload(e, undefined, stayOnTab ? { stayOnTab: true } : undefined)
              }
            />
          </label>
          <label
            className="btn-surface"
            style={{
              padding: '9px 6px',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: photoUploading || limitReached ? 'not-allowed' : 'pointer',
            }}
          >
            <FolderOpen size={13} color="#a78bfa" />
            <span>קבצים</span>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.avif"
              multiple
              hidden
              disabled={photoUploading || limitReached}
              onChange={(e) =>
                void handlePhotoUpload(e, undefined, stayOnTab ? { stayOnTab: true } : undefined)
              }
            />
          </label>
        </div>
      </div>
    );
  };

  const renderMealItemsToolbar = (title: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 700 }}>{title}</span>
        {/* בסדר RTL: האלמנט הראשון (הוסף עוד פריטים) הוא תמיד הימני ביותר ובשורה אחת עם גלילה אופקית */}
        <div
          data-h-scroll
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 6,
            flexWrap: 'nowrap',
            overflowX: 'auto',
            paddingBottom: 2,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <button
            type="button"
            onClick={() => {
              setTargetDishIdForAdd(null);
              navigateTab('hub');
            }}
            style={{
              padding: '7px 12px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--contrast-btn-bg)',
              color: 'var(--contrast-btn-text)',
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            + הוסף עוד פריטים
          </button>
          <button
            type="button"
            className="glass"
            onClick={() => setMealItemsPhotoPickerOpen((v) => !v)}
            style={{
              padding: '7px 11px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderColor: mealItemsPhotoPickerOpen ? 'var(--accent)' : undefined,
              color: mealItemsPhotoPickerOpen ? 'var(--accent)' : 'var(--text)',
            }}
          >
            {photoUploading ? <Loader2 size={14} className="spot-spinner" /> : <Camera size={14} />}
            <span>
              {allMealPhotos.length > 0
                ? `תמונות (${allMealPhotos.length}/8)`
                : 'הוסף תמונה'}
            </span>
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (selectionMode) {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                } else {
                  setSelectionMode(true);
                }
              }}
              className="glass"
              style={{
                padding: '7px 11px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                borderColor: selectionMode ? 'var(--accent)' : undefined,
                color: selectionMode ? 'var(--accent)' : 'var(--text)',
              }}
            >
              <CheckSquare size={14} />
              <span>{selectionMode ? 'סיים בחירה' : 'בחר'}</span>
            </button>
          )}
          {selectionMode && items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size > 0) {
                  setSelectedIds(new Set());
                } else {
                  const all = new Set<string>();
                  for (const it of items) {
                    all.add(it.id);
                    for (const c of it.components || []) all.add(c.id);
                  }
                  setSelectedIds(all);
                }
              }}
              className="glass"
              style={{
                padding: '7px 10px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
              }}
            >
              {selectedIds.size > 0 ? 'נקה' : 'בחר הכל'}
            </button>
          )}
          <button
            type="button"
            className="glass"
            onClick={() => {
              setHighlightedHistoryEventId(null);
              navigateTab('meal-history');
            }}
            style={{
              padding: '7px 11px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              color: 'var(--text)',
            }}
          >
            <History size={14} />
            <span>
              היסטוריה
              {(existingEntry?.history?.length || 0) > 0
                ? ` (${existingEntry!.history!.length})`
                : ''}
            </span>
          </button>
        </div>
      </div>
      {mealItemsPhotoPickerOpen &&
        renderPhotoSourceOptions(true, () => setMealItemsPhotoPickerOpen(false))}
    </div>
  );

  return (
    <>
      <Drawer
        opened={opened}
        onClose={() => {
          if (!savingMeal) onClose();
        }}
        position="bottom"
        size={fullScreen ? '100%' : '93%'}
        zIndex={200}
        classNames={{ content: fullScreen ? (heroScreen ? 'add-meal-full add-meal-hero' : 'add-meal-full') : undefined }}
        overlayProps={{ backgroundOpacity: 0.55, blur: 3 }}
        withCloseButton={false}
        styles={{
          content: {
            maxWidth: 560,
            margin: '0 auto',
            borderTopLeftRadius: 36,
            borderTopRightRadius: 36,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: fullScreen ? '100dvh' : '94dvh',
          },
          body: {
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          },
        }}
      >
        {/* Fixed (non-scrolling) top: grabber, title, meal time, search */}
        <div
          style={{
            padding: fullScreen ? 'calc(var(--sa-top, 0px) + 12px) 20px 12px' : '10px 20px 12px',
            borderBottom: (activeTab === 'hub' && !trimmedQuery) || fullScreen ? 'none' : '1px solid var(--border-subtle)',
            background: fullScreen ? 'transparent' : 'var(--card)',
            ...(heroScreen ? { position: 'absolute' as const, insetInline: 0, insetBlockStart: 0, zIndex: 3, padding: 0 } : {}),
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            flexShrink: 0,
          }}
        >
          {!fullScreen && <div className="sheet-grabber" aria-hidden />}
          <div
            style={{
              display: activeTab === 'meal-items' && allMealPhotos.length > 0 ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {(activeTab !== 'hub' || trimmedQuery.length > 0 || tabHistory.length > 1) && activeTab !== 'ai-recommend' && (
                <GlassButton
                  label="חזרה"
                  size={40}
                  onClick={handleDrawerBack}
                >
                  <ChevronRight size={18} />
                </GlassButton>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: activeTab === 'hub' || isDesignHeader ? 24 : 19,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    color: 'var(--text)',
                  }}
                >
                  {activeTab === 'hub'
                    ? 'מה אכלת?'
                    : activeTab === 'ai-recommend'
                    ? 'מה לאכול?'
                    : activeTab === 'saved-meals'
                    ? 'ארוחות שמורות'
                    : mealSlot.name}
                </h2>
                {activeTab === 'ai-recommend' && (
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {mealSlot.name} · המלצות המאמן וה-AI
                  </div>
                )}
                {activeTab === 'meal-history' && (
                  <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    היסטוריית עריכות, שליחות AI ושחזור
                  </div>
                )}
                {activeTab !== 'ai-recommend' && activeTab !== 'saved-meals' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 13,
                    color: 'var(--text-2)',
                    flexWrap: 'wrap',
                  }}
                >
                  {dateInfo && <span>{dateInfo.dayTag}</span>}
                  {dateInfo && <span aria-hidden>·</span>}
                  <label
                    title="שינוי שעת הארוחה"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      cursor: 'pointer',
                    }}
                  >
                    <Clock size={12} />
                    <input
                      type="time"
                      aria-label="שעת הארוחה"
                      value={mealTime || mealSlot.timeHint || '12:00'}
                      onChange={(e) => setMealTime(e.target.value)}
                      dir="ltr"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--text)',
                        fontSize: 13,
                        fontWeight: 600,
                        width: 'auto',
                        minWidth: 52,
                        padding: 0,
                        cursor: 'pointer',
                        fontFamily: "'Space Grotesk', 'Heebo', sans-serif",
                      }}
                    />
                  </label>
                  <span aria-hidden>·</span>
                  <span>
                    {activeTab === 'hub' ? (
                      `נרשם ל${mealSlot.name}`
                    ) : isObservationDay ? (
                      'יום תשקיף'
                    ) : (
                      <>
                        יעד{' '}
                        <span className="num-mono" dir="ltr" style={{ color: 'var(--text)', fontWeight: 600 }}>
                          {mealSlot.targets.calories}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                )}
              </div>
            </div>
            {activeTab === 'ai-recommend' ? (
              <GlassButton label="חזרה" onClick={handleDrawerBack}>
                <ChevronLeft size={18} />
              </GlassButton>
            ) : activeTab === 'saved-meals' ? (
              <GlassButton
                label="ניהול כלים ויחידות מידה"
                onClick={() => {
                  setToolsInitialSection('tools');
                  setToolsModalOpen(true);
                }}
              >
                <SlidersHorizontal size={18} />
              </GlassButton>
            ) : (
            <GlassButton
              label="סגירה"
              data-autofocus
              onClick={() => {
                if (!savingMeal) onClose();
              }}
            >
              <X size={18} strokeWidth={2.2} />
            </GlassButton>
            )}
          </div>

          {/* Meal type — preselected by time, switches the slot being logged */}
          {activeTab === 'hub' && !trimmedQuery && mealSlotOptions.length > 1 && onChangeMealSlot && (
            <SegmentedPill
              ariaLabel="סוג ארוחה"
              value={mealSlot.id}
              onChange={(id) => {
                const next = mealSlotOptions.find((m) => m.id === id);
                if (next && next.id !== mealSlot.id && !savingMeal) onChangeMealSlot(next);
              }}
              options={mealSlotOptions.map((m) => ({
                value: m.id,
                label: m.name.replace(/^ארוחת\s+/, '').replace(/\s*\(.*\)\s*$/, ''),
              }))}
            />
          )}

          {/* סרגל חיפוש כולל + כפתור כוכבים (AI) ידני בלבד + מצלמה מהחיפוש */}
          {(activeTab === 'hub' || activeTab === 'catalog') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--surface-2, var(--bg-surface-2))',
                  border: trimmedQuery
                    ? '1.5px solid var(--text)'
                    : '1.5px solid var(--line-2)',
                  borderRadius: 999,
                  padding: '0 16px 0 8px',
                  height: 54,
                  gap: 8,
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                <Search size={19} color="var(--text-2)" style={{ flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={searchResults.length > 0 && (activeTab === 'catalog' || trimmedQuery.length > 0)}
                  aria-controls="spot-food-search-listbox"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown' && searchResults.length > 0) {
                      e.preventDefault();
                      setActiveResultIndex((prev) => Math.min(searchResults.length - 1, prev + 1));
                    } else if (e.key === 'ArrowUp' && searchResults.length > 0) {
                      e.preventDefault();
                      setActiveResultIndex((prev) => Math.max(0, prev - 1));
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    } else if (e.key === 'Escape' && searchQuery) {
                      e.preventDefault();
                      setSearchQuery('');
                    }
                  }}
                  placeholder="חפש מוצר, ברקוד, היסטוריה או כתוב ל-AI..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 16,
                    fontWeight: 500,
                  }}
                />
                {trimmedQuery && (
                  <button
                    type="button"
                    aria-label="נקה חיפוש"
                    onClick={() => setSearchQuery('')}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'var(--line)',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
                <button
                  type="button"
                  disabled={voiceState === 'transcribing'}
                  aria-label="הכתבה קולית לחיפוש או ל-AI"
                  title={
                    voiceState === 'listening'
                      ? 'מקליט... לחץ לסיום ותמלול'
                      : voiceState === 'transcribing'
                      ? 'מתמלל הקלטה ב-AI...'
                      : 'הכתבה קולית לחיפוש או ל-AI'
                  }
                  onClick={() => toggleVoiceRecording('search')}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: 'none',
                    background:
                      voiceState === 'listening'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : voiceState === 'transcribing'
                        ? 'var(--surface-2)'
                        : 'transparent',
                    color:
                      voiceState === 'listening'
                        ? 'var(--danger-text)'
                        : voiceState === 'transcribing'
                        ? 'var(--accent-volt)'
                        : 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: voiceState === 'transcribing' ? 'wait' : 'pointer',
                    flexShrink: 0,
                    touchAction: 'manipulation',
                    position: 'relative',
                    zIndex: 2,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {voiceState === 'listening' ? (
                    <MicOff size={18} />
                  ) : voiceState === 'transcribing' ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Mic size={18} />
                  )}
                </button>
                <button
                  type="button"
                  disabled={isSlotBgProcessing || aiLoading}
                  title={
                    trimmedQuery
                      ? `שלח לפיענוח AI: "${trimmedQuery}"`
                      : 'פיענוח חופשי באמצעות AI'
                  }
                  onClick={() => {
                    if (trimmedQuery) {
                      setFreeTextPrompt(trimmedQuery);
                      void runAiAnalysis('text', trimmedQuery);
                    } else {
                      navigateTab('ai-text');
                    }
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: trimmedQuery
                      ? '1px solid rgba(235, 147, 28, 0.7)'
                      : '1px solid var(--border-subtle)',
                    background: trimmedQuery
                      ? 'linear-gradient(135deg, #eb931c 0%, #b36206 100%)'
                      : 'var(--bg-surface-3)',
                    color: trimmedQuery ? 'var(--text)' : 'var(--accent-orange-bright)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: 'none',
                  }}
                >
                  {isSlotBgProcessing || aiLoading ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Sparkles size={17} />
                  )}
                </button>
                <button
                  type="button"
                  title="צילום במצלמה / בחירת תמונות מהגלריה או קבצים"
                  onClick={() => setCameraChooserOpen((v) => !v)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'var(--btn-primary)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Camera size={17} />
                </button>
              </div>

              {cameraChooserOpen &&
                renderPhotoSourceOptions(false, () => setCameraChooserOpen(false))}
            </div>
          )}

          {voiceState !== 'idle' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 12,
                background:
                  voiceState === 'listening'
                    ? 'rgba(239, 68, 68, 0.14)'
                    : 'var(--surface-2)',
                border:
                  voiceState === 'listening'
                    ? '1px solid rgba(239, 68, 68, 0.42)'
                    : '1px solid var(--line-2)',
                color: voiceState === 'listening' ? 'var(--danger-text)' : 'var(--accent-volt)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {voiceState === 'listening' ? (
                  <Mic size={14} color="var(--danger-text)" style={{ flexShrink: 0 }} />
                ) : (
                  <Loader2 size={14} className="spot-spinner" style={{ flexShrink: 0 }} />
                )}
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {voiceState === 'listening'
                    ? 'מקליט בקול (עברית)... דבר ואז לחץ לסיום'
                    : 'מתמלל הקלטה ב-AI...'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {voiceState === 'listening' && (
                  <button
                    type="button"
                    onClick={() => stopVoiceRecording(true)}
                    className="btn-volt"
                    style={{
                      padding: '4px 10px',
                      fontSize: 12,
                      fontWeight: 800,
                      borderRadius: 999,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    סיים ותמלל
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => stopVoiceRecording(false)}
                  className="btn-surface"
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 999,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {heroScreen && (
            <div
              style={{
                position: 'absolute',
                insetBlockStart: 'calc(var(--sa-top, 0px) + 12px)',
                insetInline: 16,
                zIndex: 30,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <GlassButton
                label="חזרה"
                size={50}
                data-autofocus
                onClick={handleDrawerBack}
                style={{ pointerEvents: 'auto' }}
              >
                <ChevronRight size={22} strokeWidth={2.3} />
              </GlassButton>
              <GlassButton
                label="צפה בתמונה במסך מלא"
                size={50}
                onClick={() => setHeroLightboxOpen(true)}
                style={{ pointerEvents: 'auto' }}
              >
                <Maximize2 size={20} strokeWidth={2} />
              </GlassButton>
            </div>
          )}

          {renderInlineAiBanner(heroScreen)}

          {/* גוף הבוטום-שיט המרכזי: גלילה יחידה נקייה ללא גלילה מקוננת */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: heroScreen ? '0 16px 20px' : '14px 16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* באנר ייעודי בעת הוספת מרכיב ישירות לתוך מנה מורכבת קיימת */}
          {targetDishIdForAdd && activeTab !== 'meal-items' && (() => {
            const targetDish = items.find((it) => it.id === targetDishIdForAdd);
            if (!targetDish) return null;
            return (
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: 14,
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                <span>מוסיף מרכיב לתוך המנה: &quot;{targetDish.name}&quot;</span>
                <button
                  type="button"
                  onClick={() => setTargetDishIdForAdd(null)}
                  style={{
                    border: 0,
                    background: 'transparent',
                    color: 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  בטל (הוסף לארוחה רגיל)
                </button>
              </div>
            );
          })()}

          {/* Notification pill rendered in floating overlay */}

          {/* Hub: big photo tile, 2×2 shortcuts and saved meals / history */}
          {activeTab === 'hub' && trimmedQuery.length === 0 && (() => {
            const cloneItemsWithPer100g = (
              srcItems: LoggedFoodItem[],
              prefix: string,
              sourcePresetId?: string
            ): LoggedFoodItem[] =>
              srcItems.map((it) =>
                cloneFoodItemWithFreshIds(it, prefix, {
                  ...(sourcePresetId ? { sourcePresetId } : {}),
                })
              );

            const addPreset = (preset: SavedMealPreset) => {
              const sourceItems =
                preset.presetKind === 'dish' && preset.items.length > 1
                  ? [groupItemsAsCompositeDish(preset.items, preset.title, { sourcePresetId: preset.id })]
                  : preset.items;
              const cloned = cloneItemsWithPer100g(sourceItems, 'hub-pre', preset.id);
              appendItemsSmart(cloned);
              if (preset.photoDataUrl && !photoDataUrl) {
                setPhotoDataUrl(preset.photoDataUrl);
              }
              setAiSummary({ msg: `נוספה המנה "${preset.title}"` });
            };
            const topSaved = [...savedMeals]
              .sort((a, b) => {
                if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
                if ((a.mealSlotId === mealSlot.id) !== (b.mealSlotId === mealSlot.id)) {
                  return a.mealSlotId === mealSlot.id ? -1 : 1;
                }
                return (b.lastUsedAt || b.updatedAt || '').localeCompare(a.lastUsedAt || a.updatedAt || '');
              })
              .slice(0, 3);

            const hubHistoryFallbackMeals: Array<{
              key: string;
              date: string;
              shortDate: string;
              title: string;
              items: LoggedFoodItem[];
              totals: MacroTargets;
              photoDataUrl?: string;
            }> = [];
            if (topSaved.length < 3) {
              const seenSigs = new Set(
                topSaved.map((p) => p.items.map((x) => `${x.name}:${Math.round(x.grams || 0)}`).join('|'))
              );
              const dates = Object.keys(traineeLogs)
                .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
                .sort((a, b) => b.localeCompare(a));
              for (const d of dates.slice(0, 30)) {
                const log = traineeLogs[d];
                if (!log?.meals) continue;
                const slotEntries = Object.entries(log.meals).sort(([aId], [bId]) =>
                  aId === mealSlot.id ? -1 : bId === mealSlot.id ? 1 : 0
                );
                for (const [sId, entry] of slotEntries) {
                  if (d === selectedDate && sId === mealSlot.id) continue;
                  if (!entry?.items || entry.items.length === 0) continue;
                  const sig = entry.items
                    .map((x) => `${x.name}:${Math.round(x.grams || 0)}`)
                    .join('|');
                  if (seenSigs.has(sig)) continue;
                  seenSigs.add(sig);
                  const [, mo, da] = d.split('-');
                  hubHistoryFallbackMeals.push({
                    key: `hub-hist-${d}-${sId}`,
                    date: d,
                    shortDate: `${da}.${mo}`,
                    title: entry.items.map((i) => i.name).join(' + '),
                    items: entry.items,
                    totals: sumMacros(entry.items.map((i) => i.macros)),
                    photoDataUrl: entry.photoDataUrl || entry.photoDataUrls?.[0],
                  });
                  if (topSaved.length + hubHistoryFallbackMeals.length >= 3) break;
                }
                if (topSaved.length + hubHistoryFallbackMeals.length >= 3) break;
              }
            }

            const showingHistoryOnly = topSaved.length === 0 && hubHistoryFallbackMeals.length > 0;
            const showingMixed = topSaved.length > 0 && hubHistoryFallbackMeals.length > 0;
            const sectionHeading = showingHistoryOnly
              ? 'היסטוריית ארוחות'
              : showingMixed
              ? 'ארוחות שמורות והיסטוריית ארוחות'
              : 'ארוחות שמורות';

            const tiles: { id: string; title: string; subtitle: string; Icon: typeof Camera }[] = [
              { id: 'ai-text', title: 'טקסט / קול ל-AI', subtitle: 'תיאור חופשי + תיבול', Icon: Mic },
              { id: 'barcode-action', title: 'סריקת ברקוד', subtitle: 'מוצרים ארוזים', Icon: Barcode },
              {
                id: 'catalog',
                title: 'מאגר מוצרים ומועדפים',
                subtitle:
                  favoriteIds.length > 0
                    ? `${favoriteIds.length} מועדפים · חיפוש ומוצרים אישיים`
                    : 'חיפוש, מועדפים ומוצרים אישיים',
                Icon: Search,
              },
              { id: 'ai-recommend', title: 'מה לאכול?', subtitle: 'המלצות AI + המאמן', Icon: Lightbulb },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <button
                  type="button"
                  onClick={() => navigateTab('ai-photo')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: 18,
                    borderRadius: 26,
                    border: 'none',
                    background: 'var(--btn-primary)',
                    color: 'var(--btn-primary-text)',
                    textAlign: 'right',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 20,
                      background: 'rgba(128,128,128,.18)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flex: 'none',
                    }}
                  >
                    <Camera size={28} strokeWidth={1.8} />
                  </span>
                  <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>צלם את הצלחת</span>
                    <span style={{ fontSize: 13, opacity: 0.72 }}>
                      צלחת או תווית ערכים · ה-AI מזהה מנות וכמויות
                    </span>
                  </span>
                  <ChevronLeft size={22} />
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                  {tiles.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (t.id === 'barcode-action') {
                          barcodeStandaloneRef.current = false;
                          setBarcodeModalOpen(true);
                        } else if (t.id === 'catalog') {
                          setSourceGroup('all');
                          navigateTab('catalog');
                        } else {
                          navigateTab(t.id);
                        }
                      }}
                      style={{
                        minHeight: 86,
                        padding: 14,
                        borderRadius: 22,
                        border: 'none',
                        background: 'var(--surface-2)',
                        color: 'var(--text)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 10,
                        textAlign: 'right',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <t.Icon size={22} strokeWidth={1.8} />
                      <span style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{sectionHeading}</h3>
                  <button
                    type="button"
                    className="glass"
                    onClick={() => {
                      setSavedMealsInitialFilter(showingHistoryOnly ? 'history' : 'all');
                      navigateTab('saved-meals');
                    }}
                    style={{
                      height: 34,
                      padding: '0 12px',
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {showingHistoryOnly ? <History size={15} /> : <Bookmark size={15} />}
                    {showingHistoryOnly ? 'לכל ההיסטוריה' : 'כל השמורות'}
                    {!showingHistoryOnly && savedMeals.length > 0 && (
                      <span className="num-mono" style={{ color: 'var(--text-2)' }}>
                        {savedMeals.length}
                      </span>
                    )}
                  </button>
                </div>

                {topSaved.length === 0 && hubHistoryFallbackMeals.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 20,
                      border: '1.5px dashed var(--line-2)',
                      fontSize: 13,
                      color: 'var(--text-2)',
                    }}
                  >
                    עוד אין ארוחות שמורות או היסטוריה. אחרי תיעוד ארוחה, סמן ״שמור גם בארוחות שמורות״ או טען מההיסטוריה.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topSaved.map((preset) => (
                      <div
                        key={preset.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px 10px 10px',
                          borderRadius: 20,
                          border: '1px solid var(--line)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span
                            style={{
                              fontSize: 15,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {preset.title}
                          </span>
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              fontSize: 12,
                              color: 'var(--text-2)',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className="num-mono" style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {Math.round(preset.totalCalories)} קק״ל
                            </span>
                            {[
                              { l: 'ח', v: preset.totalProtein, c: 'var(--macro-protein)' },
                              { l: 'פ', v: preset.totalCarbs, c: 'var(--macro-carbs)' },
                              { l: 'ש', v: preset.totalFat, c: 'var(--macro-fat)' },
                            ].map((m) => (
                              <span key={m.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 9, background: m.c }} />
                                {m.l} <span className="num-mono">{Math.round(m.v)}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                        <GlassButton label={`הוסף ${preset.title}`} onClick={() => addPreset(preset)}>
                          <Plus size={20} strokeWidth={2.2} />
                        </GlassButton>
                      </div>
                    ))}
                    {hubHistoryFallbackMeals.map((histMeal) => (
                      <div
                        key={histMeal.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 14px 10px 10px',
                          borderRadius: 20,
                          border: '1px solid var(--line)',
                          background: 'var(--surface-2)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 14.5,
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {histMeal.title}
                            </span>
                          </span>
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              fontSize: 12,
                              color: 'var(--text-2)',
                              flexWrap: 'wrap',
                            }}
                          >
                            <span className="num-mono" style={{ color: '#38bdf8', fontWeight: 700 }}>
                              היסטוריה · {histMeal.shortDate}
                            </span>
                            <span className="num-mono" style={{ color: 'var(--text)', fontWeight: 600 }}>
                              {Math.round(histMeal.totals.calories)} קק״ל
                            </span>
                            {[
                              { l: 'ח', v: histMeal.totals.protein, c: 'var(--macro-protein)' },
                              { l: 'פ', v: histMeal.totals.carbs, c: 'var(--macro-carbs)' },
                              { l: 'ש', v: histMeal.totals.fat, c: 'var(--macro-fat)' },
                            ].map((m) => (
                              <span key={m.l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 6, height: 6, borderRadius: 9, background: m.c }} />
                                {m.l} <span className="num-mono">{Math.round(m.v)}</span>
                              </span>
                            ))}
                          </span>
                        </span>
                        <GlassButton
                          label={`הוסף מהיסטוריה ${histMeal.title}`}
                          onClick={() => {
                            const cloned = cloneItemsWithPer100g(histMeal.items, 'hub-hist');
                            appendItemsSmart(cloned);
                            if (histMeal.photoDataUrl && !photoDataUrl) {
                              setPhotoDataUrl(histMeal.photoDataUrl);
                            }
                            setAiSummary({
                              msg: `נטענה ארוחה מהיסטוריית ${histMeal.shortDate}: "${histMeal.title}"`,
                            });
                          }}
                        >
                          <Plus size={20} strokeWidth={2.2} />
                        </GlassButton>
                      </div>
                    ))}
                  </div>
                )}

                {personalHistory.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <History size={15} />
                        נבחרו ונסרקו לאחרונה
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceGroup('favorites_recent');
                          navigateTab('catalog');
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-2)',
                          fontSize: 12.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        לכל ההיסטוריה ({personalHistory.length})
                      </button>
                    </div>
                    <div className="h-scroll" style={{ display: 'flex', gap: 8, paddingBottom: 4 }}>
                      {personalHistory.slice(0, 10).map((hist) => (
                        <button
                          key={hist.foodKey}
                          type="button"
                          onClick={() => void handleSelectCatalogFood(hist)}
                          style={{
                            flex: '0 0 auto',
                            maxWidth: 195,
                            padding: '9px 12px',
                            borderRadius: 16,
                            border: '1px solid var(--line)',
                            background: 'var(--surface-2)',
                            color: 'var(--text)',
                            textAlign: 'right',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            {hist.actionKind === 'barcode' && <Barcode size={12} color="var(--accent-orange-bright)" />}
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {hist.name}
                            </span>
                          </div>
                          <span className="num-mono" style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                            {hist.per100g.calories} קק״ל · ח׳ {hist.per100g.protein}
                            {hist.useCount > 1 ? ` · ×${hist.useCount}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* פאנל ב׳: תוצאות חיפוש מאוחדות (ארוחות שמורות תואמות + מאגר מוצרים + כפתור ✨ ל-AI למעלה) */}
          {(activeTab === 'hub' || activeTab === 'catalog') && trimmedQuery.length > 0 && matchedSavedPresets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--accent-orange-bright)' }}>
                ארוחות שמורות תואמות ({matchedSavedPresets.length})
              </div>
              {matchedSavedPresets.map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--line-2)',
                    borderRadius: 12,
                    padding: '9px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{preset.title}</div>
                    <div className="num-mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {Math.round(preset.totalCalories)} קק״ל · {preset.items.length} מרכיבים
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const srcList =
                        preset.presetKind === 'dish' && preset.items.length > 1
                          ? [groupItemsAsCompositeDish(preset.items, preset.title, { sourcePresetId: preset.id })]
                          : preset.items;
                      const cloned = srcList.map((it) =>
                        cloneFoodItemWithFreshIds(it, 'srch-pre', { sourcePresetId: preset.id })
                      );
                      appendItemsSmart(cloned);
                      if (preset.photoDataUrl && !photoDataUrl) {
                        setPhotoDataUrl(preset.photoDataUrl);
                      }
                      setAiSummary({ msg: `נוספה המנה "${preset.title}"` });
                    }}
                    className="btn-volt"
                    style={{ padding: '6px 11px', fontSize: 12.5, cursor: 'pointer', flexShrink: 0 }}
                  >
                    + הוסף
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'saved-meals' && (
            <SavedMealsLibraryTab
              savedMeals={savedMeals}
              traineeLogs={traineeLogs}
              geminiApiKey={geminiApiKey}
              initialSearchQuery={searchQuery}
              initialFilterMode={savedMealsInitialFilter}
              contextParams={{
                ...contextParams,
                customUnits: customFoodUnits,
              }}
              onAddItemsToMeal={(newItems, img) => {
                appendItemsSmart(newItems);
                if (img && !photoDataUrl) {
                  setPhotoDataUrl(img);
                }
              }}
              onOpenToolsModal={() => {
                    setToolsInitialSection('tools');
                    setToolsModalOpen(true);
                  }}
              onSavedMealAction={onSavedMealAction}
            />
          )}

          {/* לשונית מיוחדת: 💡 מה לאכול? (המלצות המאמן + Smart Macro Finisher + למידת העדפות ללא צ'אט) */}
          {activeTab === 'ai-recommend' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Coach options (design: AiRecommend) */}
                {mealSlot.recommendedOptions && mealSlot.recommendedOptions.length > 0 && (
                  <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>אופציות של המאמן לארוחה זו</span>
                    {mealSlot.recommendedOptions.map((optText, idx) => (
                      <article
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '14px 16px',
                          borderRadius: 22,
                          background: 'var(--card)',
                          border: '1px solid var(--line)',
                          boxShadow: 'var(--card-shadow)',
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, lineHeight: 1.35 }}>{optText}</span>
                        <button
                          type="button"
                          disabled={aiLoading}
                          onClick={() => runAiAnalysis('text', optText, idx)}
                          className="btn-surface"
                          style={{
                            height: 44,
                            padding: '0 16px',
                            borderRadius: 999,
                            fontFamily: 'inherit',
                            fontSize: 14,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flex: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          {addingOptionIdx === idx && <Loader2 size={14} className="spot-spinner" />}
                          {addingOptionIdx === idx ? 'מנתח…' : 'בחר והוסף'}
                        </button>
                      </article>
                    ))}
                  </section>
                )}

                {/* Smart macro finisher */}
                <section
                  style={{
                    background: 'var(--card)',
                    border: '1px solid var(--line)',
                    borderRadius: 26,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    boxShadow: 'var(--card-shadow)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ fontSize: 17, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        השלמת מאקרו חכמה
                        <Sparkles size={15} color="var(--accent)" />
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        {isObservationDay ? 'הצעות מותאמות ליום תשקיף' : 'יתרה להשלמה בארוחה זו'}
                      </span>
                    </span>
                    <span
                      className="num-mono"
                      style={{
                        height: 32,
                        padding: '0 12px',
                        borderRadius: 999,
                        background: 'var(--accent)',
                        color: 'var(--on-accent)',
                        fontSize: 14,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        flex: 'none',
                      }}
                    >
                      {isObservationDay ? (
                        <span>יום תשקיף</span>
                      ) : (
                        <>
                          <bdi dir="ltr" className="ltr-num">
                            {Math.max(0, mealSlot.targets.calories - currentTotals.calories)}
                          </bdi>{' '}
                          קק״ל · ח׳{' '}
                          <bdi dir="ltr" className="ltr-num">
                            {Math.max(0, Math.round(mealSlot.targets.protein - currentTotals.protein))}
                          </bdi>
                        </>
                      )}
                    </span>
                  </div>

                  {aiRecommendations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {aiRecDebug?.engine && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 13, color: aiRecDebug.isFallback ? 'var(--warn-text)' : 'var(--text-2)' }}>
                            {aiRecDebug.isFallback
                              ? `נוצר ע״י מנוע כללים מקומי (לא AI · ${aiRecDebug.engine})${
                                  aiRecDebug.fallbackReason ? ` · ${aiRecDebug.fallbackReason}` : ''
                                }`
                              : `נוצר ע״י AI (${aiRecDebug.engine})`}
                          </span>
                          {aiRecDebug.appliedContextSummary && (
                            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                              הותאם לפי: {aiRecDebug.appliedContextSummary}
                            </span>
                          )}
                        </div>
                      )}
                      {aiRecommendations.map((option) => (
                        <div key={option.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <button
                            type="button"
                            aria-label={`הוסף את ${option.title} לארוחה`}
                            onClick={() => {
                              appendItemsSmart(option.items);
                              setAiSummary({ msg: `נוספה לארוחה ההצעה: "${option.title}"` });
                            }}
                            className="glass"
                            style={{ width: 44, height: 44, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}
                          >
                            <Plus size={20} strokeWidth={2.2} />
                          </button>
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{ fontSize: 15, fontWeight: 700 }}>{option.title}</span>
                            {option.items.length > 0 && (
                              <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.4 }}>
                                <b>מרכיבים:</b>{' '}
                                {option.items
                                  .map(
                                    (it) =>
                                      `${it.name} (${it.unitLabel || `${Math.round(it.grams)} גרם`})`
                                  )
                                  .join(' · ')}
                              </span>
                            )}
                            {option.whyItFits && (
                              <span style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.4 }}>
                                {option.whyItFits}
                              </span>
                            )}
                            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                              <bdi dir="ltr" className="num-mono ltr-num">{option.totals.calories}</bdi> קק״ל · ח׳{' '}
                              <bdi dir="ltr" className="ltr-num">{option.totals.protein}</bdi> · פ׳{' '}
                              <bdi dir="ltr" className="ltr-num">{option.totals.carbs}</bdi> · ש׳{' '}
                              <bdi dir="ltr" className="ltr-num">{option.totals.fat}</bdi>
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      disabled={aiRecLoading}
                      onClick={fetchAiRecommendations}
                      className="glass"
                      style={{
                        flex: 1,
                        height: 50,
                        borderRadius: 999,
                        fontFamily: 'inherit',
                        fontSize: 15,
                        fontWeight: 600,
                        cursor: aiRecLoading ? 'wait' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      {aiRecLoading ? <Loader2 size={16} className="spot-spinner" /> : <Sparkles size={16} />}
                      {aiRecLoading ? 'בונה 3 הצעות מותאמות…' : aiRecommendations.length > 0 ? 'הצע 3 אחרות' : 'הצע לי 3 ארוחות ליתרה'}
                    </button>
                    {aiRecLoading && (
                      <button
                        type="button"
                        onClick={handleCancelAiRecommend}
                        className="glass"
                        style={{
                          height: 50,
                          padding: '0 16px',
                          borderRadius: 999,
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: 'var(--danger-text)',
                          borderColor: 'rgba(239, 68, 68, 0.35)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        עצור
                      </button>
                    )}
                  </div>
                </section>

                {/* Learned preferences (shown only when coach explicitly enabled) + silent-learning feedback */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {showLearnedPreferences && learnedPreferences.length > 0 && (
                    <>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>העדפות שנלמדו בחשבון שלך</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {learnedPreferences.map((pref) => (
                          <span
                            key={pref}
                            style={{
                              minHeight: 36,
                              padding: '0 14px',
                              borderRadius: 999,
                              border: '1px solid var(--line-2)',
                              fontSize: 14,
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            {pref}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>
                    משהו בהצעות לא מתאים? רשום העדפה או הגבלה כדי שנזכור אותה בהצעות הבאות.
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      aria-label="העדפה או הגבלה"
                      placeholder="העדפה או הגבלה (למשל: אני לא אוכל גבינות)"
                      value={preferenceFeedbackText}
                      onChange={(e) => setPreferenceFeedbackText(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && preferenceFeedbackText.trim() && !learningPrefLoading) {
                          e.preventDefault();
                          handleLearnPreference();
                        }
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 52,
                        borderRadius: 999,
                        border: '1px solid var(--line-2)',
                        background: 'transparent',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        fontSize: 16,
                        padding: '0 18px',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      disabled={learningPrefLoading || !preferenceFeedbackText.trim()}
                      onClick={handleLearnPreference}
                      className="btn-volt"
                      style={{ height: 52, padding: '0 20px', fontSize: 15, flex: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      {learningPrefLoading && <Loader2 size={14} className="spot-spinner" />}
                      {learningPrefLoading ? 'שומר…' : 'שמור'}
                    </button>
                  </div>
                  {learnedFeedbackBanner && (
                    <div
                      role="status"
                      style={{
                        padding: '10px 14px',
                        borderRadius: 18,
                        background: 'var(--surface-2)',
                        color: learnedFeedbackBanner.isError ? 'var(--danger-text)' : 'var(--text)',
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {learnedFeedbackBanner.isError ? learnedFeedbackBanner.msg : `✓ ${learnedFeedbackBanner.msg}`}
                      {!learnedFeedbackBanner.isError && learnedFeedbackBanner.engine && (
                        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: learnedFeedbackBanner.isFallback ? 'var(--warn-text)' : 'var(--text-2)' }}>
                          {learnedFeedbackBanner.isFallback
                            ? `נשמר ע״י מנגנון מקומי (לא AI · ${learnedFeedbackBanner.engine})${
                                learnedFeedbackBanner.fallbackReason ? ` · ${learnedFeedbackBanner.fallbackReason}` : ''
                              }`
                            : `נותח ע״י AI (${learnedFeedbackBanner.engine})`}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* תוצאות מאגר המזון (מוצג בחיפוש או בלשונית מאגר ללא גלילה מקוננת) */}
            {(activeTab === 'catalog' ||
              (activeTab === 'hub' && trimmedQuery.length > 0)) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-2)' }}>
                    מאגר מוצרים, מועדפים והיסטוריה:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      barcodeStandaloneRef.current = false;
                      setBarcodeModalOpen(true);
                    }}
                    className="btn-surface"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <Barcode size={13} color="currentColor" />
                    <span>ברקוד</span>
                  </button>
                </div>

                {/* 4 מסננים סמנטיים + סינון לפי מותג + סינון סקרייפרים למנהל מסומן בלבד */}
                <div
                  className="h-scroll"
                  style={{
                    display: 'flex',
                    gap: 6,
                    paddingBottom: 2,
                    alignItems: 'center',
                  }}
                >
                  {SEMANTIC_SOURCE_TABS.map((tab) => {
                    const active = sourceGroup === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setSourceGroup(tab.id);
                          if (tab.id !== 'retail') setRetailSubSite('all');
                          if (tab.id === 'moh_gov' || tab.id === 'custom_only') {
                            setSelectedBrand('all');
                          }
                        }}
                        style={{
                          flexShrink: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          padding: '5px 12px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          border: active
                            ? '1px solid var(--sel-border)'
                            : '1px solid var(--border-subtle)',
                          background: active ? 'var(--sel-bg)' : 'var(--bg-surface-2)',
                          color: active ? 'var(--sel-text)' : 'var(--text-2)',
                        }}
                      >
                        {tab.label}
                        {tab.id === 'favorites_recent' && personalHistory.length + favoriteIds.length > 0
                          ? ` (${personalHistory.length})`
                          : ''}
                      </button>
                    );
                  })}

                  {sourceGroup !== 'moh_gov' && sourceGroup !== 'custom_only' && (
                    <select
                      aria-label="סינון לפי מותג"
                      value={selectedBrand}
                      onChange={(e) => setSelectedBrand(e.target.value)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12.5,
                        fontWeight: 700,
                        padding: '5px 10px',
                        borderRadius: 999,
                        border:
                          selectedBrand !== 'all'
                            ? '1px solid var(--sel-border)'
                            : '1px solid var(--border-subtle)',
                        background:
                          selectedBrand !== 'all' ? 'var(--sel-bg)' : 'var(--bg-surface-2)',
                        color: selectedBrand !== 'all' ? 'var(--sel-text)' : 'var(--text)',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="all">כל המותגים</option>
                      {brandFilterOptions.map((brandOpt) => (
                        <option key={brandOpt} value={brandOpt}>
                          מותג: {brandOpt}
                        </option>
                      ))}
                    </select>
                  )}

                  {canShowScraperSources && sourceGroup === 'retail' && (
                    <select
                      aria-label="סינון לפי מקור סקרייפר (מנהל)"
                      value={retailSubSite}
                      onChange={(e) => setRetailSubSite(e.target.value)}
                      style={{
                        flexShrink: 0,
                        fontSize: 12.5,
                        fontWeight: 700,
                        padding: '5px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--accent-orange-bright)',
                        background: 'var(--bg-surface-2)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      {RETAIL_SITE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* צ׳יפים מהירים למותגים מובילים בלחיצה אחת */}
                {sourceGroup !== 'moh_gov' &&
                  sourceGroup !== 'custom_only' &&
                  (sourceGroup === 'retail' || selectedBrand !== 'all') &&
                  brandFilterOptions.length > 0 && (
                    <div
                      className="h-scroll"
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        paddingBottom: 2,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedBrand('all')}
                        style={{
                          flexShrink: 0,
                          fontSize: 12,
                          fontWeight: 700,
                          padding: '3px 10px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          border:
                            selectedBrand === 'all'
                              ? '1px solid var(--sel-border)'
                              : '1px solid var(--border-subtle)',
                          background:
                            selectedBrand === 'all' ? 'var(--sel-bg)' : 'var(--bg-surface-2)',
                          color:
                            selectedBrand === 'all' ? 'var(--sel-text)' : 'var(--text-2)',
                        }}
                      >
                        כל המותגים
                      </button>
                      {brandFilterOptions.slice(0, 12).map((brandName) => {
                        const isBrandActive = selectedBrand === brandName;
                        return (
                          <button
                            key={brandName}
                            type="button"
                            onClick={() =>
                              setSelectedBrand(isBrandActive ? 'all' : brandName)
                            }
                            style={{
                              flexShrink: 0,
                              fontSize: 12,
                              fontWeight: 700,
                              padding: '3px 10px',
                              borderRadius: 999,
                              cursor: 'pointer',
                              border: isBrandActive
                                ? '1px solid var(--sel-border)'
                                : '1px solid var(--border-subtle)',
                              background: isBrandActive
                                ? 'var(--sel-bg)'
                                : 'var(--bg-surface-2)',
                              color: isBrandActive ? 'var(--sel-text)' : 'var(--text-2)',
                            }}
                          >
                            {brandName}
                          </button>
                        );
                      })}
                    </div>
                  )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 8,
                    fontSize: 13,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {(searchLoading || liveExpanding) && (
                      <Loader2 size={13} className="spot-spinner" />
                    )}
                    {liveExpanding
                      ? canShowScraperSources
                        ? 'מרחיב תוצאות אוטומטית באתרי הסופרים אונליין...'
                        : 'מרחיב חיפוש מוצרים ומותגים אונליין...'
                      : searchLoading
                      ? 'מחפש במהירות במאגר ה-DB...'
                      : `${searchResults.length} תוצאות${totalAvailable > searchResults.length ? ` (מתוך ${totalAvailable.toLocaleString('he-IL')}+)` : ''}`}
                    {(searchLoading || liveExpanding) && (
                      <button
                        type="button"
                        onClick={handleCancelFoodSearch}
                        style={{
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          background: 'rgba(239, 68, 68, 0.1)',
                          color: 'var(--danger-text)',
                          borderRadius: 999,
                          padding: '2px 9px',
                          fontSize: 11.5,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                        }}
                      >
                        בטל חיפוש
                      </button>
                    )}
                    {usedSemanticRrf && !searchLoading && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '1px 7px',
                          borderRadius: 999,
                          background: 'var(--surface-2)',
                          color: 'var(--accent)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        חיפוש סמנטי
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCustomFood(null);
                        setCustomFoodInitialName(trimmedQuery);
                        setCustomFoodModalOpen(true);
                      }}
                      className="btn-surface"
                      style={{
                        padding: '5px 11px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        borderColor: 'var(--line-2)',
                        color: 'var(--text)',
                      }}
                    >
                      <Plus size={12} />
                      <span>
                        {trimmedQuery.length >= 2
                          ? `צור "${trimmedQuery.slice(0, 18)}" כמוצר אישי`
                          : 'מוצר אישי חדש'}
                      </span>
                    </button>
                    {customFoods.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCustomFoodsManagerOpen(true)}
                        className="btn-surface"
                        style={{
                          padding: '5px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        נהל מוצרים ({customFoods.length})
                      </button>
                    )}
                  </div>
                </div>

                {searchError && (
                  <div
                    role="alert"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 14,
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12.5,
                      color: 'var(--danger-text)',
                    }}
                  >
                    <span>{searchError}</span>
                    <button
                      type="button"
                      onClick={() => setSearchRetryNonce((n) => n + 1)}
                      className="btn-surface"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      <RefreshCw size={12} />
                      נסה שוב
                    </button>
                  </div>
                )}

                {showSkeletons ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6].map((idx) => (
                      <div
                        key={idx}
                        style={{
                          height: 76,
                          borderRadius: 18,
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border-subtle)',
                          opacity: 0.65,
                        }}
                      />
                    ))}
                  </div>
                ) : searchResults.length === 0 && !searchLoading && !liveExpanding ? (
                  <div
                    style={{
                      padding: 18,
                      textAlign: 'center',
                      borderRadius: 18,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-2)',
                      fontSize: 13,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      {trimmedQuery
                        ? `לא נמצאו מוצרים המתאימים ל־"${searchQuery}". אפשר ללחוץ על כפתור ✨ בשורת החיפוש למעלה לפיענוח ב-AI, או להוסיף מוצר אישי משלך!`
                        : sourceGroup === 'custom_only'
                        ? 'עדיין לא הוגדרו מוצרים אישיים. תוכל להוסיף מוצר אישי חדש כולל תמונה וערכים מותאמים!'
                        : sourceGroup === 'favorites_recent'
                        ? 'טרם סימנת מועדפים או בחרת מוצרים. כל מוצר שתסמן בלב או תוסיף יופיע כאן!'
                        : 'לא נמצאו מוצרים בקטגוריה זו. ניתן לחפש מוצר או להוסיף מוצר אישי חדש.'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCustomFood(null);
                        setCustomFoodInitialName(trimmedQuery);
                        setCustomFoodModalOpen(true);
                      }}
                      className="btn-volt"
                      style={{
                        padding: '8px 16px',
                        fontSize: 13,
                        fontWeight: 700,
                        borderRadius: 999,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} />
                      <span>
                        {trimmedQuery
                          ? `הוסף "${trimmedQuery}" כמוצר אישי`
                          : 'הוסף מוצר אישי חדש'}
                      </span>
                    </button>
                    {trimmedQuery.length >= 2 && (
                      <button
                        type="button"
                        onClick={() => void runManualLiveExpand()}
                        className="btn-surface"
                        style={{
                          padding: '6px 12px',
                          fontSize: 12.5,
                          fontWeight: 700,
                          borderRadius: 999,
                          cursor: 'pointer',
                        }}
                      >
                        {canShowScraperSources
                          ? 'נסה לחפש בזמן אמת באתרי הסופרים'
                          : 'נסה לחפש מוצרים ומותגים נוספים אונליין'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div
                      id="spot-food-search-listbox"
                      role="listbox"
                      aria-label="תוצאות חיפוש מזון"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                        gap: 8,
                      }}
                    >
                      {searchResults.map((food, idx) => {
                        const isSelected = selectedFood?.id === food.id;
                        const isKeyboardActive = idx === activeResultIndex && trimmedQuery.length > 0;
                        const isFav = favoriteIds.includes(food.id);
                        const histInfo = food as FoodCatalogItem & Partial<UserFoodHistoryItem>;
                        const displayBrand = getDisplayBrandForFood(food);
                        const visibleSourceName = canDisplayFoodSourceName(
                          food,
                          canShowScraperSources
                        )
                          ? food.sourceSiteName
                          : undefined;
                        const matchTok = trimmedQuery.split(/\s+/).find((w) => w.length >= 2);
                        const highlightParts =
                          matchTok && food.name
                            ? food.name.split(
                                new RegExp(
                                  `(${matchTok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
                                  'ig'
                                )
                              )
                            : null;

                        return (
                          <div
                            key={`${food.id}-${idx}`}
                            style={{
                              borderRadius: 18,
                              border: isSelected || isKeyboardActive
                                ? '1px solid var(--sel-border)'
                                : '1px solid var(--border-subtle)',
                              background: isSelected ? 'var(--surface-3)' : 'var(--bg-surface-2)',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 4,
                              overflow: 'hidden',
                            }}
                          >
                            <button
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => void handleSelectCatalogFood(food)}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                padding: '10px 12px 10px 4px',
                                background: 'transparent',
                                border: 'none',
                                textAlign: 'right',
                                cursor: 'pointer',
                                color: 'inherit',
                                fontFamily: 'inherit',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                              }}
                            >
                              {getFoodImageThumb(food) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={getFoodImageThumb(food)}
                                  alt={food.name}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 11,
                                    objectFit: 'cover',
                                    flexShrink: 0,
                                    border: '1px solid var(--line)',
                                  }}
                                />
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  fontSize: 13,
                                  fontWeight: 700,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {highlightParts
                                  ? highlightParts.map((part, pIdx) =>
                                      part.toLowerCase() === matchTok?.toLowerCase() ? (
                                        <mark
                                          key={pIdx}
                                          style={{
                                            background: 'rgba(235, 147, 28, 0.25)',
                                            color: 'inherit',
                                            borderRadius: 4,
                                            padding: '0 1px',
                                          }}
                                        >
                                          {part}
                                        </mark>
                                      ) : (
                                        <React.Fragment key={pIdx}>{part}</React.Fragment>
                                      )
                                    )
                                  : food.name}
                              </div>
                              <div
                                className="num-mono"
                                style={{
                                  fontSize: 12.5,
                                  color: 'var(--text-2)',
                                }}
                              >
                                {food.per100g.calories} קק״ל · ח:{food.per100g.protein} פ:{food.per100g.carbs} ש:{food.per100g.fat}
                              </div>
                              {(displayBrand || visibleSourceName || food.barcode || histInfo.useCount) && (
                                <div
                                  style={{
                                    marginTop: 3,
                                    fontSize: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 5,
                                    color:
                                      food.source === 'custom'
                                        ? '#10b981'
                                        : histInfo.useCount
                                        ? 'var(--ok-text)'
                                        : displayBrand || visibleSourceName
                                        ? 'var(--accent-orange-bright)'
                                        : 'var(--text-muted)',
                                  }}
                                >
                                  {displayBrand && (
                                    <span
                                      style={{
                                        padding: '0 6px',
                                        borderRadius: 999,
                                        background: 'rgba(235, 147, 28, 0.14)',
                                        color: 'var(--accent-orange-bright)',
                                        fontWeight: 700,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {displayBrand}
                                    </span>
                                  )}
                                  {histInfo.useCount && (
                                    <span>
                                      {histInfo.actionKind === 'barcode'
                                        ? 'נסרק לאחרונה'
                                        : `נבחר ×${histInfo.useCount}`}
                                    </span>
                                  )}
                                  {visibleSourceName && visibleSourceName !== displayBrand && (
                                    <span
                                      style={{
                                        opacity: 0.9,
                                        fontSize: 11.5,
                                      }}
                                    >
                                      {visibleSourceName}
                                    </span>
                                  )}
                                  {food.barcode && (
                                    <span
                                      dir="ltr"
                                      className="num-mono"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 2,
                                        padding: '0 5px',
                                        borderRadius: 6,
                                        background: 'var(--line)',
                                        color: 'var(--text-2)',
                                        fontSize: 12,
                                      }}
                                    >
                                      <Barcode size={9} />
                                      {food.barcode}
                                    </span>
                                  )}
                                </div>
                              )}
                              </div>
                            </button>
                            <button
                              type="button"
                              aria-label={isFav ? `הסר את ${food.name} ממועדפים` : `סמן את ${food.name} כמועדף`}
                              onClick={() => onToggleFavorite(food.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isFav ? '#ff5e7e' : 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '8px 10px 8px 8px',
                                flexShrink: 0,
                              }}
                            >
                              <Heart size={14} fill={isFav ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {canManualExpandLive && !liveExpanding && (
                      <button
                        type="button"
                        onClick={() => void runManualLiveExpand()}
                        className="btn-surface"
                        style={{
                          alignSelf: 'center',
                          padding: '7px 14px',
                          fontSize: 12.5,
                          fontWeight: 700,
                          borderRadius: 999,
                          cursor: 'pointer',
                        }}
                      >
                        {canShowScraperSources
                          ? 'הרחב חיפוש בזמן אמת באתרי הסופרים'
                          : 'חפש עוד מוצרי מדף ומותגים אונליין'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* לשונית 2: צילום ארוחה / טבלת ערכים תזונתיים + פענוח AI */}
            {activeTab === 'ai-photo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {items.length > 0 && photoItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigateTab('meal-items')}
                    className="glass"
                    style={{
                      minHeight: 48,
                      padding: '0 16px',
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontFamily: 'inherit',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <span>
                      זוהו <bdi className="ltr-num">{items.length}</bdi> מרכיבים ·{' '}
                      <bdi className="ltr-num">{currentTotals.calories}</bdi> קק״ל
                    </span>
                    <span style={{ color: 'var(--text-2)' }}>צפה וערוך ←</span>
                  </button>
                )}

                {/* Capture area — unified plate/label upload up to 8 photos */}
                <div
                  style={{
                    background: 'var(--surface-2)',
                    borderRadius: 26,
                    padding: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 14,
                  }}
                >
                  {photoItems.length > 0 ? (
                    <>
                      <div data-h-scroll style={{ display: 'flex', gap: 10, paddingBottom: 2 }}>
                        {photoItems.map((im, idx) => {
                          const isLabel = im.angle === 'label';
                          return (
                            <div
                              key={idx}
                              style={{
                                position: 'relative',
                                flex: 'none',
                                width: photoItems.length === 1 ? '100%' : 138,
                                height: photoItems.length === 1 ? 190 : 138,
                                borderRadius: 22,
                                overflow: 'hidden',
                                background: 'var(--surface-3)',
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={im.dataUrl}
                                alt={`צילום ארוחה ${idx + 1}`}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <button
                                type="button"
                                className="glass"
                                aria-label={`הסר תמונה ${idx + 1}`}
                                onClick={() => {
                                  setPhotoItems((prev) => {
                                    const next = prev.filter((_, i) => i !== idx);
                                    setPhotoDataUrl(next[0]?.dataUrl);
                                    setPhotoSizeKB(next[0]?.sizeKB ?? null);
                                    return next;
                                  });
                                }}
                                style={{
                                  position: 'absolute',
                                  insetBlockStart: 8,
                                  insetInlineStart: 8,
                                  width: 36,
                                  height: 36,
                                  borderRadius: 999,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <X size={16} strokeWidth={2.4} />
                              </button>
                              <div
                                style={{
                                  position: 'absolute',
                                  insetBlockEnd: 8,
                                  insetInlineEnd: 8,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <button
                                  type="button"
                                  className="glass"
                                  aria-label="החלף תג זווית או טבלת ערכים"
                                  onClick={() => {
                                    setPhotoItems((prev) =>
                                      prev.map((x, i) => {
                                        if (i !== idx) return x;
                                        const nextAngle: PhotoAngleKind =
                                          x.angle === 'unset' || !x.angle
                                            ? 'label'
                                            : x.angle === 'label'
                                            ? 'top-down'
                                            : x.angle === 'top-down'
                                            ? 'side-45'
                                            : 'unset';
                                        return {
                                          ...x,
                                          angle: nextAngle,
                                          labelInputOpen:
                                            nextAngle === 'label' ? true : x.labelInputOpen,
                                        };
                                      })
                                    );
                                  }}
                                  style={{
                                    height: 32,
                                    padding: '0 11px',
                                    borderRadius: 999,
                                    fontFamily: 'inherit',
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    borderColor: isLabel ? 'var(--accent)' : undefined,
                                    color: isLabel ? 'var(--accent)' : 'var(--text)',
                                  }}
                                >
                                  <span>
                                    {im.angle === 'label'
                                      ? 'טבלת ערכים'
                                      : im.angle === 'top-down'
                                      ? 'מלמעלה 90°'
                                      : im.angle === 'side-45'
                                      ? 'מהצד ~45°'
                                      : 'בחר זווית'}
                                  </span>
                                  {isLabel && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      aria-label="פתח או סגור שדה שם מוצר לתווית"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPhotoItems((prev) =>
                                          prev.map((x, i) =>
                                            i === idx
                                              ? {
                                                  ...x,
                                                  labelInputOpen: x.labelInputOpen === false,
                                                }
                                              : x
                                          )
                                        );
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setPhotoItems((prev) =>
                                            prev.map((x, i) =>
                                              i === idx
                                                ? {
                                                    ...x,
                                                    labelInputOpen: x.labelInputOpen === false,
                                                  }
                                                : x
                                            )
                                          );
                                        }
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 2,
                                        borderRadius: 999,
                                      }}
                                    >
                                      <ChevronDown
                                        size={14}
                                        style={{
                                          transform:
                                            im.labelInputOpen !== false
                                              ? 'rotate(180deg)'
                                              : 'none',
                                          transition: 'transform 0.15s ease',
                                        }}
                                      />
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {photoItems.some((p) => p.angle === 'label' && p.labelInputOpen !== false) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {photoItems.map((im, idx) =>
                            im.angle === 'label' && im.labelInputOpen !== false ? (
                              <div
                                key={`lbl-input-${idx}`}
                                style={{
                                  background: 'var(--card)',
                                  border: '1px solid var(--line-2)',
                                  borderRadius: 18,
                                  padding: '10px 12px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 7,
                                }}
                              >
                                <label
                                  htmlFor={`label-prod-${idx}`}
                                  style={{
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    color: 'var(--text-2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  <FileText size={13} color="var(--accent)" />
                                  <span>
                                    {photoItems.filter((x) => x.angle === 'label').length > 1
                                      ? `שם של איזה מוצר הטבלה (תמונה ${idx + 1})`
                                      : 'שם של איזה מוצר התווית (אופציונלי)'}
                                  </span>
                                </label>
                                <input
                                  id={`label-prod-${idx}`}
                                  type="text"
                                  placeholder="למשל: מילקי שוקולד, חטיף חלבון, יוגורט GO..."
                                  value={im.labelProductName || ''}
                                  onChange={(e) => {
                                    const val = e.currentTarget.value;
                                    setPhotoItems((prev) =>
                                      prev.map((x, i) =>
                                        i === idx ? { ...x, labelProductName: val } : x
                                      )
                                    );
                                  }}
                                  style={{
                                    font: 'inherit',
                                    fontSize: 14,
                                    color: 'var(--text)',
                                    background: 'var(--surface-2)',
                                    border: '1px solid var(--line)',
                                    borderRadius: 12,
                                    padding: '8px 11px',
                                    outline: 'none',
                                  }}
                                />
                                {recentLabelProducts.length > 0 && (
                                  <div
                                    data-h-scroll
                                    style={{ display: 'flex', gap: 6, paddingBottom: 2 }}
                                  >
                                    {recentLabelProducts.slice(0, 8).map((prod) => (
                                      <button
                                        key={`${idx}-${prod}`}
                                        type="button"
                                        onClick={() =>
                                          setPhotoItems((prev) =>
                                            prev.map((x, i) =>
                                              i === idx
                                                ? { ...x, labelProductName: prod }
                                                : x
                                            )
                                          )
                                        }
                                        style={{
                                          flex: 'none',
                                          padding: '4px 10px',
                                          borderRadius: 999,
                                          border: '1px solid var(--line-2)',
                                          background:
                                            im.labelProductName === prod
                                              ? 'var(--accent)'
                                              : 'var(--surface-2)',
                                          color:
                                            im.labelProductName === prod
                                              ? 'var(--on-accent)'
                                              : 'var(--text)',
                                          fontSize: 12,
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        {prod}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : null
                          )}
                        </div>
                      )}

                      {photoSizeKB && (
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                          <bdi className="ltr-num">{photoItems.length}/8</bdi> תמונות נבחרו · {photoFormatLabel}
                        </span>
                      )}
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', padding: '8px 0' }}>
                      <span
                        aria-hidden
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 22,
                          background: 'var(--card)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Camera size={28} />
                      </span>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>
                        צלם ארוחה או טבלת ערכים
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 330, lineHeight: 1.45 }}>
                        עד 8 תמונות ביחד — צלחות, זוויות צילום וטבלאות ערכים. ה-AI מזהה ומחבר הכל אוטומטית.
                      </span>
                    </div>
                  )}

                  {allMealPhotos.length < 8 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <label
                        className="btn-volt"
                        style={{
                          flex: '1 1 160px',
                          height: 52,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          fontSize: 15,
                          cursor: photoUploading ? 'wait' : 'pointer',
                          opacity: photoUploading ? 0.65 : 1,
                        }}
                      >
                        <Camera size={18} />
                        <span>{photoItems.length === 0 ? 'צלם עכשיו' : 'צלם זווית נוספת'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          hidden
                          disabled={photoUploading}
                          onChange={(e) => handlePhotoUpload(e)}
                        />
                      </label>
                      <label
                        className="glass"
                        style={{
                          flex: '1 1 160px',
                          height: 52,
                          borderRadius: 999,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          fontSize: 15,
                          fontWeight: 600,
                          cursor: photoUploading ? 'wait' : 'pointer',
                          opacity: photoUploading ? 0.65 : 1,
                        }}
                      >
                        <ImageIcon size={18} />
                        <span>
                          {photoUploading ? 'מכווץ ומעבד...' : photoItems.length > 0 ? 'הוסף מהגלריה' : 'מהגלריה / קובץ'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          hidden
                          disabled={photoUploading}
                          onChange={(e) => handlePhotoUpload(e)}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* הקשר נוסף לצילום + משקל מנה נטו בגרם (ללא הצלחת) — בראש ההגדרות מעל דיוק מהיר */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="photo-note" style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
                      הקשר נוסף לצילום / שם מוצר וכמות (אופציונלי)
                    </label>
                    <textarea
                      id="photo-note"
                      rows={2}
                      placeholder="למשל: פיתה כוסמין, גבינה צהובה 9%, או חטיף חלבון אחד מהתווית"
                      value={photoNote}
                      onChange={(e) => setPhotoNote(e.currentTarget.value)}
                      style={{
                        font: 'inherit',
                        fontSize: 16,
                        color: 'var(--text)',
                        background: 'var(--card)',
                        border: '1px solid var(--line-2)',
                        borderRadius: 20,
                        padding: '12px 14px',
                        resize: 'none',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {initialEntryPhotos.length > 0 && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={includePreviousMealPhotos}
                      onClick={() => setIncludePreviousMealPhotos((v) => !v)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        textAlign: 'right',
                        padding: '10px 14px',
                        borderRadius: 16,
                        border: includePreviousMealPhotos
                          ? '1.5px solid var(--accent)'
                          : '1px solid var(--line-2)',
                        background: includePreviousMealPhotos
                          ? 'rgba(16, 185, 129, 0.08)'
                          : 'var(--card)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 20,
                          height: 20,
                          minWidth: 20,
                          borderRadius: 6,
                          border: includePreviousMealPhotos
                            ? 'none'
                            : '1.5px solid var(--text-3)',
                          background: includePreviousMealPhotos
                            ? 'var(--accent)'
                            : 'transparent',
                          color: 'var(--on-accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {includePreviousMealPhotos ? <Check size={13} strokeWidth={3} /> : null}
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                          צרף להשוואה גם תמונות קודמות מארוחה זו ({initialEntryPhotos.length})
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                          מועיל כשמעדכנים/משווים אוכל שכבר נצפה בארוחה הזו.
                        </span>
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={Boolean(contextParams.strictUserList)}
                    onClick={() =>
                      setContextParams((prev) => ({
                        ...prev,
                        strictUserList: !prev.strictUserList,
                      }))
                    }
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      textAlign: 'right',
                      padding: '10px 14px',
                      borderRadius: 16,
                      border: contextParams.strictUserList
                        ? '1.5px solid var(--accent-solid, #10b981)'
                        : '1px solid var(--line-2)',
                      background: contextParams.strictUserList
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'var(--card)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.15s ease, background 0.15s ease',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 20,
                        height: 20,
                        minWidth: 20,
                        marginTop: 2,
                        borderRadius: 6,
                        border: contextParams.strictUserList
                          ? 'none'
                          : '1.5px solid var(--text-3)',
                        background: contextParams.strictUserList
                          ? 'var(--accent-solid, #10b981)'
                          : 'transparent',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {contextParams.strictUserList ? <Check size={13} strokeWidth={3} /> : null}
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                        נתתי פירוט מדויק של כל מה שאכלתי (אל תוסיף רכיבים נוספים)
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.35 }}>
                        {contextParams.strictUserList
                          ? 'נעול: ה-AI ייצמד אך ורק לשמות ולמשקלים שכתבת בלי לנחש פריטים אחרים.'
                          : 'השמות והמשקלים שכתבת נשמרים תמיד; רכיבים נוספים בצילום יוצעו לך לאישור בנפרד.'}
                      </span>
                    </span>
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label htmlFor="photo-net-grams" style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 600 }}>
                      כמה גרם המנה (ללא הצלחת, אופציונלי)
                    </label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        background: 'var(--card)',
                        border: '1px solid var(--line-2)',
                        borderRadius: 18,
                        padding: '0 14px',
                        height: 48,
                      }}
                    >
                      <input
                        id="photo-net-grams"
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="למשל: 250"
                        value={contextParams.netFoodWeightGrams ?? ''}
                        onChange={(e) => {
                          const raw = sanitizeIntegerInput(e.currentTarget.value);
                          if (raw === '') {
                            setContextParams({
                              ...contextParams,
                              netFoodWeightGrams: undefined,
                            });
                            return;
                          }
                          const parsed = Number(raw);
                          if (Number.isFinite(parsed) && parsed >= 0) {
                            setContextParams({
                              ...contextParams,
                              netFoodWeightGrams: Math.min(5000, Math.round(parsed)),
                            });
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text)',
                          font: 'inherit',
                          fontSize: 16,
                          fontWeight: 700,
                          textAlign: 'right',
                          outline: 'none',
                        }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text-2)',
                          flexShrink: 0,
                        }}
                      >
                        גרם (ללא צלחת)
                      </span>
                    </div>
                  </div>
                </div>

                <AiQuickContextPanel
                  traineeId={traineeId}
                  actorRole={actorRole}
                  customServingTools={customServingTools}
                  customFoodUnits={customFoodUnits}
                  recentContextChips={recentContextChips}
                  groupQuickChips={groupQuickChips}
                  globalQuickChips={globalQuickChips}
                  contextParams={contextParams}
                  onChangeContextParams={setContextParams}
                  onOpenToolsModal={() => {
                    setToolsInitialSection('tools');
                    setToolsModalOpen(true);
                  }}
                  onManageQuickChips={onManageQuickChips}
                />

                {/* Pinned analyse action (design: "נתח את הצלחת") */}
                <div className="wizard-nav" style={{ marginTop: 0, background: 'linear-gradient(to top, var(--bg) 70%, transparent)', display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    disabled={
                      isSlotBgProcessing ||
                      aiLoading ||
                      photoUploading ||
                      (photoItems.length === 0 && !photoDataUrl && !photoNote.trim())
                    }
                    onClick={() => runAiAnalysis('photo')}
                    className="btn-volt"
                    style={{
                      flex: 1,
                      height: 56,
                      fontSize: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {isSlotBgProcessing || aiLoading ? <Loader2 size={18} className="spot-spinner" /> : <Wand2 size={18} />}
                    <span>
                      {isSlotBgProcessing || aiLoading
                        ? progressTicker.currentStepText
                        : photoItems.length > 1
                        ? `נתח ${photoItems.length} תמונות`
                        : 'נתח ארוחה / תווית'}
                    </span>
                  </button>
                  {(isSlotBgProcessing || aiLoading) && (
                    <button
                      type="button"
                      onClick={handleCancelActiveAi}
                      className="glass"
                      style={{
                        height: 56,
                        padding: '0 16px',
                        borderRadius: 999,
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--danger-text)',
                        borderColor: 'rgba(239, 68, 68, 0.38)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      עצור
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* לשונית 3: טקסט חופשי + הקלטה קולית ל-AI */}
            {activeTab === 'ai-text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Big, borderless "write it like a message" field (design: QuickLog) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
                  <label htmlFor="ql-text" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    מה אכלת? כתוב כמו להודעה
                  </label>
                  <textarea
                    id="ql-text"
                    ref={aiTextRef}
                    rows={3}
                    placeholder="למשל: אכלתי 2 ביצים מקושקשות, חצי גביע קוטג' 5%, 2 פרוסות לחם כוסמין וקרמבו אחד"
                    value={freeTextPrompt}
                    onChange={(e) => setFreeTextPrompt(e.currentTarget.value)}
                    style={{
                      font: 'inherit',
                      fontSize: 24,
                      fontWeight: 500,
                      lineHeight: 1.3,
                      color: 'var(--text)',
                      background: 'transparent',
                      border: 0,
                      outline: 'none',
                      resize: 'none',
                      padding: 0,
                      caretColor: 'var(--accent)',
                      minHeight: 96,
                    }}
                  />
                </div>

                <div data-h-scroll style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
                  {[
                    "2 ביצים, חצי קוטג' 5%, 2 פרוסות לחם כוסמין וקרמבו",
                    '200 גרם חזה עוף, כוס אורז וכף טחינה גולמית',
                    'יוגורט דנונה פרו ו-2 קרמבו',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setFreeTextPrompt(sample)}
                      style={{
                        flex: 'none',
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 999,
                        border: '1px solid var(--line-2)',
                        background: 'transparent',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                        fontSize: 13,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sample}
                    </button>
                  ))}
                </div>

                <AiQuickContextPanel
                  traineeId={traineeId}
                  actorRole={actorRole}
                  customServingTools={customServingTools}
                  customFoodUnits={customFoodUnits}
                  recentContextChips={recentContextChips}
                  groupQuickChips={groupQuickChips}
                  globalQuickChips={globalQuickChips}
                  contextParams={contextParams}
                  onChangeContextParams={setContextParams}
                  onOpenToolsModal={() => {
                    setToolsInitialSection('tools');
                    setToolsModalOpen(true);
                  }}
                  onManageQuickChips={onManageQuickChips}
                />

                {/* Primary action + floating orange mic */}
                <div style={{ display: 'flex', flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    disabled={isSlotBgProcessing || aiLoading || !freeTextPrompt.trim()}
                    onClick={() => runAiAnalysis('text')}
                    className="btn-volt"
                    style={{
                      flex: 1,
                      height: 56,
                      fontSize: 16,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {isSlotBgProcessing || aiLoading ? (
                      <Loader2 size={18} className="spot-spinner" />
                    ) : (
                      <Sparkles size={18} />
                    )}
                    <span>
                      {isSlotBgProcessing || aiLoading
                        ? progressTicker.currentStepText
                        : 'פרק משפט לקלוריות ומאקרו'}
                    </span>
                  </button>
                  {(isSlotBgProcessing || aiLoading) && (
                    <button
                      type="button"
                      onClick={handleCancelActiveAi}
                      className="glass"
                      style={{
                        height: 56,
                        padding: '0 15px',
                        borderRadius: 999,
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--danger-text)',
                        borderColor: 'rgba(239, 68, 68, 0.38)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      עצור
                    </button>
                  )}
                  <button
                    type="button"
                    className="glass glass-tint"
                    disabled={voiceState === 'transcribing'}
                    aria-label={
                      voiceState === 'listening'
                        ? 'עצור הקלטה ותמלל'
                        : voiceState === 'transcribing'
                          ? 'מתמלל הקלטה'
                          : 'הקלט ארוחה בקול'
                    }
                    aria-pressed={voiceState === 'listening'}
                    onClick={() => toggleVoiceRecording('ai-text')}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 999,
                      flex: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: voiceState === 'transcribing' ? 'wait' : 'pointer',
                      boxShadow:
                        voiceState === 'listening'
                          ? '0 0 0 6px color-mix(in srgb, var(--accent) 28%, transparent)'
                          : undefined,
                    }}
                  >
                    {voiceState === 'listening' ? (
                      <MicOff size={24} />
                    ) : voiceState === 'transcribing' ? (
                      <Loader2 size={24} className="spot-spinner" />
                    ) : (
                      <Mic size={24} />
                    )}
                  </button>
                </div>
                {voiceState === 'listening' && (
                  <div role="status" style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center' }}>
                    מקליט בעברית… לחץ שוב לסיום ותמלול
                  </div>
                )}
              </div>
            )}

            {/* פאנל נפרד לניהול ועריכת המרכיבים שכבר בארוחה (נפתח מלחיצה על הכרטיסייה התחתונה) */}
            {activeTab === 'meal-items' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Result header (design: PhotoResult) — swipeable hero photos carousel */}
                {allMealPhotos.length > 0 && (
                  <div
                    dir="ltr"
                    onTouchStart={handlePhotoTouchStart}
                    onTouchEnd={handlePhotoTouchEnd}
                    style={{
                      position: 'relative',
                      margin: '0 -16px',
                      overflow: 'hidden',
                      background: 'var(--surface-2)',
                      touchAction: 'pan-y',
                      userSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        width: '100%',
                        transform: `translateX(-${safeHeroPhotoIdx * 100}%)`,
                        transition: 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    >
                      {allMealPhotos.map((photoUrl, idx) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`${photoUrl.slice(0, 32)}-${idx}`}
                          src={photoUrl}
                          alt={`תמונת הארוחה ${idx + 1} מתוך ${allMealPhotos.length}`}
                          onClick={() => {
                            if (heroSwipedRecentlyRef.current) return;
                            setHeroLightboxOpen(true);
                          }}
                          style={{
                            display: 'block',
                            width: '100%',
                            flex: '0 0 100%',
                            height: 'calc(300px + var(--sa-top, 0px))',
                            objectFit: 'cover',
                            cursor: 'pointer',
                          }}
                        />
                      ))}
                    </div>

                    {allMealPhotos.length > 1 && (
                      <div
                        className="glass"
                        dir="ltr"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          insetBlockEnd: 60,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          zIndex: 4,
                          height: 30,
                          padding: '0 8px',
                          borderRadius: 999,
                          background: 'rgba(15, 17, 22, 0.62)',
                          color: '#ffffff',
                          border: '1px solid rgba(255, 255, 255, 0.22)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          maxWidth: 'calc(100% - 28px)',
                        }}
                      >
                        <button
                          type="button"
                          aria-label="תמונה קודמת"
                          disabled={safeHeroPhotoIdx <= 0}
                          onClick={() => stepHeroPhoto(-1)}
                          style={{
                            width: 22,
                            height: 22,
                            border: 0,
                            borderRadius: 999,
                            background: 'transparent',
                            color: 'inherit',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: safeHeroPhotoIdx <= 0 ? 'default' : 'pointer',
                            opacity: safeHeroPhotoIdx <= 0 ? 0.35 : 0.95,
                            padding: 0,
                          }}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {allMealPhotos.map((_, idx) => {
                            const active = idx === safeHeroPhotoIdx;
                            return (
                              <button
                                key={idx}
                                type="button"
                                aria-label={`תמונה ${idx + 1}`}
                                aria-current={active ? 'true' : undefined}
                                onClick={() => setActiveHeroPhotoIdx(idx)}
                                style={{
                                  width: active ? 16 : 6,
                                  height: 6,
                                  borderRadius: 999,
                                  border: 0,
                                  padding: 0,
                                  background: active ? 'var(--accent)' : 'rgba(255,255,255,0.45)',
                                  transition: 'width 180ms ease, background 180ms ease',
                                  cursor: 'pointer',
                                }}
                              />
                            );
                          })}
                        </div>
                        <span
                          className="num-mono ltr-num"
                          style={{ fontSize: 11.5, fontWeight: 700, paddingInline: 2 }}
                        >
                          {safeHeroPhotoIdx + 1}/{allMealPhotos.length}
                        </span>
                        <button
                          type="button"
                          aria-label="תמונה הבאה"
                          disabled={safeHeroPhotoIdx >= allMealPhotos.length - 1}
                          onClick={() => stepHeroPhoto(1)}
                          style={{
                            width: 22,
                            height: 22,
                            border: 0,
                            borderRadius: 999,
                            background: 'transparent',
                            color: 'inherit',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor:
                              safeHeroPhotoIdx >= allMealPhotos.length - 1 ? 'default' : 'pointer',
                            opacity: safeHeroPhotoIdx >= allMealPhotos.length - 1 ? 0.35 : 0.95,
                            padding: 0,
                          }}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {allMealPhotos.length > 0 && (
                  <div aria-hidden style={{ height: 42, margin: '-52px -16px 0', borderRadius: '28px 28px 0 0', background: 'var(--card)', position: 'relative', flexShrink: 0 }} />
                )}

                <div
                  style={{
                    padding: '4px 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: heroScreen ? 'row-reverse' : 'row', alignItems: heroScreen ? 'center' : 'baseline', justifyContent: 'space-between' }}>
                    {heroScreen ? (
                      <label
                        className="btn-surface"
                        style={{
                          position: 'relative',
                          height: 44,
                          padding: '0 14px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <ChevronDown size={15} />
                        <span>{mealSlot.name.replace(/^ארוחת\s+/, '')} ·</span>
                        <bdi dir="ltr" className="num-mono ltr-num">
                          {mealTime || mealSlot.timeHint || '12:00'}
                        </bdi>
                        <input
                          type="time"
                          aria-label="שעת הארוחה"
                          value={mealTime || mealSlot.timeHint || '12:00'}
                          onChange={(e) => setMealTime(e.target.value)}
                          dir="ltr"
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                        />
                      </label>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        <bdi className="ltr-num">{items.length}</bdi> מרכיבים
                        {isObservationDay ? (
                          ' · יום תשקיף'
                        ) : (
                          <>
                            {' '}· יעד <bdi className="ltr-num">{mealSlot.targets.calories}</bdi>
                          </>
                        )}
                      </span>
                    )}
                    <span>
                      <bdi dir="ltr" className="num-mono ltr-num" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1 }}>
                        {currentTotals.calories}
                      </bdi>{' '}
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>קק״ל</span>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                    {(
                      [
                        { l: 'חלבון', v: currentTotals.protein, g: mealSlot.targets.protein, c: 'var(--macro-protein)' },
                        { l: 'פחמימות', v: currentTotals.carbs, g: mealSlot.targets.carbs, c: 'var(--macro-carbs)' },
                        { l: 'שומן', v: currentTotals.fat, g: mealSlot.targets.fat, c: 'var(--macro-fat)' },
                      ] as const
                    ).map((m) => (
                      <div key={m.l} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
                          <span style={{ width: 7, height: 7, borderRadius: 9, background: m.c }} />
                          {m.l}
                        </div>
                        <div style={{ height: 5, borderRadius: 9, background: 'var(--surface-3)', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${
                                isObservationDay
                                  ? items.length > 0 && m.v > 0
                                    ? 50
                                    : 0
                                  : Math.min(100, Math.round((m.v / Math.max(1, m.g)) * 100))
                              }%`,
                              background: m.c,
                              borderRadius: 9,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          <bdi dir="ltr" className="num-mono ltr-num">{Math.round(m.v)}</bdi>
                          {isObservationDay ? (
                            <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> ג׳</span>
                          ) : (
                            <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                              {' '}/ <bdi dir="ltr" className="num-mono ltr-num">{Math.round(m.g)}</bdi> ג׳
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {renderMealItemsToolbar(
                  heroScreen
                    ? `פריטי הארוחה (${items.length})`
                    : `מרכיבי הארוחה הנוכחית (${items.length})`
                )}

                {learnedRuleHint && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '9px 12px',
                      borderRadius: 16,
                      background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                      למדתי מהתיקון: <b>&quot;{learnedRuleHint}&quot;</b>
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={savingRuleHint}
                        onClick={() => void handleSaveLearnedRuleHint()}
                        className="btn-volt"
                        style={{ height: 30, padding: '0 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {savingRuleHint ? 'שומר...' : 'זכור לפעמים הבאות'}
                      </button>
                      <button
                        type="button"
                        aria-label="התעלם"
                        onClick={() => setLearnedRuleHint(null)}
                        style={{ border: 0, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}

                {preCorrectionItems !== null && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: 16,
                      background: 'var(--bg-surface-2, var(--card))',
                      border: '1px solid var(--line-2)',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                      הארוחה עודכנה ע״י AI
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setItems(preCorrectionItems);
                        setPreCorrectionItems(null);
                        setCorrectionError(null);
                      }}
                      style={{
                        border: '1px solid var(--line-2)',
                        background: 'var(--card)',
                        color: 'var(--text)',
                        borderRadius: 999,
                        padding: '5px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <RefreshCw size={12} />
                      <span>בטל תיקון</span>
                    </button>
                  </div>
                )}

                {suggestedExtras.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: '12px 14px',
                      borderRadius: 18,
                      border: '1.5px solid rgba(245, 158, 11, 0.45)',
                      background: 'rgba(245, 158, 11, 0.08)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 13,
                          fontWeight: 700,
                          color: 'var(--text)',
                        }}
                      >
                        <Sparkles size={15} />
                        <span>
                          ה-AI זיהה בתמונה עוד {suggestedExtras.length} פריטים שלא כתבת — אכלת גם אותם?
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDismissSuggestedExtras()}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color: 'var(--text-2)',
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        זיהיתי הכל · התעלם מהכל
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {suggestedExtras.map((extra) => (
                        <div
                          key={extra.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 12,
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>
                              {extra.name}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                              <bdi dir="ltr" className="num-mono ltr-num">
                                {Math.round(extra.grams)}g
                              </bdi>{' '}
                              ·{' '}
                              <bdi dir="ltr" className="num-mono ltr-num">
                                {Math.round(extra.macros.calories)}
                              </bdi>{' '}
                              קק״ל
                              {extra.visualReason ? ` · ${extra.visualReason}` : ''}
                            </span>
                            {hasCompositeComponents(extra) && (
                              <span style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.45 }}>
                                פירוט מרכיבים:{' '}
                                {extra.components!
                                  .map((c) => `${c.name} (${Math.round(c.grams)}g · ${Math.round(c.macros.calories)} קק״ל)`)
                                  .join(' · ')}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <button
                              type="button"
                              onClick={() => {
                                markSuggestedExtrasDismissed([extra]);
                                appendItemsSmart([extra]);
                                setSuggestedExtras((prev) =>
                                  prev.filter((p) => p.id !== extra.id)
                                );
                              }}
                              style={{
                                border: 'none',
                                borderRadius: 999,
                                padding: '6px 11px',
                                background: 'var(--accent-solid, #10b981)',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 700,
                                fontFamily: 'inherit',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Plus size={13} />
                              <span>הוסף</span>
                            </button>
                            <button
                              type="button"
                              aria-label={`הסר הצעה ${extra.name}`}
                              onClick={() => handleDismissSuggestedExtras(extra)}
                              style={{
                                border: '1px solid var(--line-2)',
                                borderRadius: 999,
                                width: 30,
                                height: 30,
                                background: 'var(--bg-surface-2, transparent)',
                                color: 'var(--text-2)',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {slotBgClarifyJob && (
                  <AiClarificationCard
                    job={slotBgClarifyJob}
                    mealPhotoStore={existingEntry?.photoStore}
                    onResolved={(summary) => {
                      setAiSummary({
                        msg: summary || 'תווית הערכים זוהתה והארוחה עודכנה ✨',
                      });
                      onRefreshDataFromServer?.();
                    }}
                  />
                )}

                {existingEntry?.pendingCoachDeletedItems &&
                  existingEntry.pendingCoachDeletedItems.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {existingEntry.pendingCoachDeletedItems.map((notice) => (
                        <button
                          key={notice.id}
                          type="button"
                          onClick={() => {
                            setHighlightedHistoryEventId(notice.historyEventId);
                            navigateTab('meal-history');
                          }}
                          style={{
                            textAlign: 'right',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '10px 13px',
                            borderRadius: 16,
                            border: '1px dashed rgba(245, 158, 11, 0.5)',
                            background: 'rgba(245, 158, 11, 0.08)',
                            color: 'var(--text)',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--warn-text)' }}>
                              הוסר ע״י {notice.coachName}: {notice.item.name}
                            </span>
                            <span style={{ fontSize: 11.5, color: 'var(--text-2)' }}>
                              לחץ לצפייה ושחזור הפריט מתוך היסטוריית הארוחה ←
                            </span>
                          </div>
                          <RotateCcw size={15} color="var(--warn-text)" style={{ flexShrink: 0 }} />
                        </button>
                      ))}
                    </div>
                  )}

                {items.length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      borderRadius: 20,
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    טרם נוספו פריטים לארוחה זו.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {items.map((item) => (
                      <CompositeDishRow
                        key={item.id}
                        item={item}
                        mealTimeFallback={mealTime || mealSlot.timeHint || '12:00'}
                        selectionMode={selectionMode}
                        selectedIds={selectedIds}
                        onToggleSelectTop={handleToggleSelectTop}
                        onToggleSelectComponent={handleToggleSelectComponent}
                        isExpanded={editingItemId === item.id}
                        onToggleExpand={() =>
                          setEditingItemId(editingItemId === item.id ? null : item.id)
                        }
                        onUpdateItem={updateLoggedItemFull}
                        onRemoveItem={removeItem}
                        onRequestAddIngredient={(dishId) => {
                          setTargetDishIdForAdd(dishId);
                          navigateTab('catalog');
                        }}
                        canSyncBackPreset={Boolean(
                          item.sourcePresetId &&
                            onSavedMealAction &&
                            savedMeals.some((p) => p.id === item.sourcePresetId)
                        )}
                        onSyncBackPreset={(d) => void handleSyncBackPreset(d)}
                        itemDraft={itemFieldDrafts[item.id]}
                        onDraftChange={(id, draft) =>
                          setItemFieldDrafts((prev) => {
                            const next = { ...prev };
                            if (draft === null) delete next[id];
                            else next[id] = draft;
                            return next;
                          })
                        }
                      />
                    ))}
                  </div>
                )}

                {!selectionMode && items.length > 0 && onSavedMealAction && (
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 20,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <Switch
                      size="xs"
                      color="orange"
                      checked={saveAsPreset}
                      onChange={(e) => setSaveAsPreset(e.currentTarget.checked)}
                      label={
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          שמור מנה זו גם ב&quot;ארוחות שמורות&quot; לשימוש חוזר
                        </span>
                      }
                    />
                    {saveAsPreset && (
                      <>
                        <TextInput
                          size="xs"
                          placeholder={
                            items
                              .slice(0, 2)
                              .map((i) => i.name)
                              .join(' + ') || 'שם למנה השמורה'
                          }
                          value={presetTitleInput}
                          onChange={(e) => setPresetTitleInput(e.currentTarget.value)}
                        />
                        {items.length > 1 && (
                          <Switch
                            size="xs"
                            color="teal"
                            checked={savePresetAsSingleDish}
                            onChange={(e) =>
                              setSavePresetAsSingleDish(e.currentTarget.checked)
                            }
                            label={
                              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                                שמור כמנה אחת מקופלת (כגון &quot;קפה&quot; המכילה את חומרי הגלם)
                              </span>
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

              </div>
            )}

            {activeTab === 'meal-history' && (
              <MealHistoryPanel
                meal={existingEntry}
                highlightedEventId={highlightedHistoryEventId}
                onRetryFailed={(draft, histEvent) => {
                  void handleDirectRetryFailedJob(undefined, draft, histEvent);
                }}
                onRestoreCoachDeletedItem={
                  onRestoreCoachDeletedItem
                    ? (params) =>
                        onRestoreCoachDeletedItem({
                          mealSlotId: mealSlot.id,
                          ...params,
                        })
                    : undefined
                }
                onRollbackToEntry={
                  onRollbackMealHistory
                    ? (historyEntryId) =>
                        onRollbackMealHistory({
                          mealSlotId: mealSlot.id,
                          historyEntryId,
                        })
                    : undefined
                }
              />
            )}
          </div>
        </div>

        {activeTab === 'meal-items' && (
          <div
            style={{
              flexShrink: 0,
              background: heroScreen ? 'var(--card)' : 'var(--bg)',
              padding: '10px 16px calc(var(--sa-bottom) + 12px)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {selectionMode ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%', alignItems: 'center' }}>
                <button
                  type="button"
                  disabled={selectedIds.size === 0}
                  onClick={handleDeleteSelected}
                  className="glass"
                  style={{
                    height: 50,
                    padding: '0 14px',
                    borderRadius: 999,
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: selectedIds.size > 0 ? 'var(--danger-text)' : 'var(--text-3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Trash2 size={15} />
                  <span>מחק ({selectedIds.size})</span>
                </button>
                {onSavedMealAction && (
                  <button
                    type="button"
                    disabled={selectedIds.size === 0}
                    onClick={() => {
                      const extracted = extractSelectedItemsForPreset(items, selectedIds);
                      if (extracted.length === 0) return;
                      setSaveSelectedPresetTitle(
                        extracted
                          .slice(0, 2)
                          .map((x) => x.name)
                          .join(' + ')
                      );
                      setSaveSelectedAsSingleDish(false);
                      setSaveSelectedPresetOpen(true);
                    }}
                    className="glass"
                    style={{
                      height: 50,
                      padding: '0 14px',
                      borderRadius: 999,
                      fontSize: 13.5,
                      fontWeight: 700,
                      color: selectedIds.size > 0 ? 'var(--accent)' : 'var(--text-3)',
                      borderColor: selectedIds.size > 0 ? 'var(--accent)' : undefined,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <Bookmark size={15} />
                    <span>שמור ארוחה</span>
                  </button>
                )}
                {items.filter((it) => selectedIds.has(it.id)).length >= 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      const selTop = items.filter((it) => selectedIds.has(it.id));
                      setGroupDishTitle(
                        selTop
                          .slice(0, 2)
                          .map((x) => x.name)
                          .join(' + ')
                      );
                      setGroupModalOpen(true);
                    }}
                    className="glass"
                    style={{
                      height: 50,
                      padding: '0 14px',
                      borderRadius: 999,
                      fontSize: 13.5,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <Layers size={15} />
                    <span>אחד למנה</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={selectedIds.size === 0 || isSlotBgProcessing || correctionLoading}
                  onClick={() => setCorrectionOpen(true)}
                  className="btn-volt"
                  style={{
                    flex: '1 1 160px',
                    height: 50,
                    padding: '0 14px',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Wand2 size={16} />
                  <span>תקן נבחרים ב-AI ({selectedIds.size})</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="glass"
                  disabled={isSlotBgProcessing || correctionLoading}
                  onClick={() => setCorrectionOpen(true)}
                  style={{
                    height: 56,
                    padding: '0 20px',
                    borderRadius: 999,
                    flex: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontFamily: 'inherit',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: isSlotBgProcessing ? 'wait' : 'pointer',
                    opacity: isSlotBgProcessing ? 0.65 : 1,
                  }}
                >
                  {isSlotBgProcessing && slotBgProcessingJob?.mode === 'adjust' ? (
                    <>
                      <Loader2 size={16} className="spot-spinner" />
                      <span>מתקן...</span>
                    </>
                  ) : (
                    <>
                      <Wand2 size={16} />
                      <span>תקן</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={savingMeal || !hasMealChanges}
                  title={!hasMealChanges ? 'הוסף, הסר או ערוך פריט כדי לשמור שינויים' : undefined}
                  onClick={() => void handleSaveMealAndClose()}
                  className="btn-volt"
                  style={{
                    flex: 1,
                    height: 56,
                    fontSize: 16,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: hasMealChanges ? 'pointer' : 'not-allowed',
                  }}
                >
                  {savingMeal ? <Loader2 size={16} className="spot-spinner" /> : <Check size={16} />}
                  <span>
                    {savingMeal
                      ? 'שומר ארוחה...'
                      : !hasMealChanges
                      ? `אין שינויים לשמירה (${currentTotals.calories} קק״ל)`
                      : `שמור ארוחה (${currentTotals.calories} קק״ל)`}
                  </span>
                </button>
              </>
            )}
          </div>
        )}

        {/* Pinned action bar (design): one primary save button carrying the meal total, plus a
            glass pill that opens the meal's items. Hidden while there is nothing to save. */}
        {activeTab !== 'meal-items' && (items.length > 0 || hadInitialItemsRef.current) && (
          <div
            style={{
              flexShrink: 0,
              background: fullScreen ? 'var(--bg)' : 'var(--card)',
              padding: '10px 16px calc(var(--sa-bottom) + 12px)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            {items.length > 0 && (
              <button
                type="button"
                className="glass"
                onClick={() => navigateTab('meal-items')}
                aria-label={`עריכת מרכיבי הארוחה (${items.length})`}
                style={{
                  height: 56,
                  padding: '0 18px',
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: 'inherit',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  flex: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {mealThumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mealThumbnailUrl}
                    alt=""
                    style={{ width: 30, height: 30, borderRadius: 9, objectFit: 'cover' }}
                  />
                ) : (
                  <Utensils size={18} />
                )}
                <bdi className="ltr-num">{items.length}</bdi> מרכיבים
              </button>
            )}
            <button
              type="button"
              disabled={savingMeal || !hasMealChanges}
              title={!hasMealChanges ? 'אין שינויים לשמירה' : undefined}
              onClick={() => void handleSaveMealAndClose()}
              className="btn-volt"
              style={{
                flex: 1,
                height: 56,
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: hasMealChanges ? 'pointer' : 'not-allowed',
              }}
            >
              {savingMeal ? <Loader2 size={18} className="spot-spinner" /> : <Check size={18} />}
              <span>
                {!hasMealChanges ? 'ללא שינוי · ' : 'שמור · '}
                <bdi dir="ltr" className="ltr-num">{currentTotals.calories}</bdi> קק״ל
              </span>
            </button>
          </div>
        )}
        {renderFloatingAiOverlay()}
      </Drawer>

      {/* פופ-אפ ממוקד לבחירת כמות/אריזה/מידה אישית עם החשכה מלאה מאחור וכפתור סגירה עצמאי */}
      <Modal
        opened={Boolean(selectedFood)}
        onClose={() => {
          enrichAbortRef.current?.abort();
          setEnrichingFood(false);
          setInlineUnitOpen(false);
          setSelectedFood(null);
        }}
        centered
        radius="xl"
        size="md"
        zIndex={230}
        withCloseButton={false}
        overlayProps={{ backgroundOpacity: 0.82, blur: 6 }}
      >
        {selectedFood && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <button
                type="button"
                aria-label="סגור חלון בחירת כמות"
                onClick={() => {
                  enrichAbortRef.current?.abort();
                  setEnrichingFood(false);
                  setInlineUnitOpen(false);
                  setSelectedFood(null);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid var(--border-strong)',
                  background: 'var(--bg-surface-2)',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={15} />
              </button>

              {getFoodImageThumb(selectedFood) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={getFoodImageThumb(selectedFood)}
                  alt={selectedFood.name}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 13,
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '1px solid var(--line)',
                  }}
                />
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 900, lineHeight: 1.3 }}>
                  {selectedFood.name}
                  {(() => {
                    const b = getDisplayBrandForFood(selectedFood);
                    return b && !selectedFood.name.includes(b) ? ` (${b})` : '';
                  })()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <span>
                    ל-100 גרם: {selectedFood.per100g.calories} קק״ל · ח׳ {selectedFood.per100g.protein}g
                  </span>
                  {selectedFood.barcode && (
                    <span
                      dir="ltr"
                      className="num-mono"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '1px 6px',
                        borderRadius: 999,
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line-2)',
                        color: 'var(--accent-orange-bright)',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      <Barcode size={10} />
                      {selectedFood.barcode}
                    </span>
                  )}
                  {enrichingFood && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent-orange-bright)', fontSize: 12 }}>
                      <Loader2 size={10} className="spot-spinner" />
                      <span>מושך מידות אריזה וברקוד...</span>
                      <button
                        type="button"
                        onClick={() => {
                          enrichAbortRef.current?.abort();
                          setEnrichingFood(false);
                        }}
                        style={{
                          border: 0,
                          background: 'transparent',
                          color: 'var(--danger-text)',
                          fontSize: 11.5,
                          fontWeight: 700,
                          textDecoration: 'underline',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        עצור
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {(() => {
                const matchedCustom = customFoodById.get(selectedFood.id);
                if (!matchedCustom || !canEditCustomFood(matchedCustom)) return null;
                return (
                  <button
                    type="button"
                    aria-label="ערוך מוצר אישי"
                    title="ערוך מוצר אישי / הוסף תמונה"
                    onClick={() => {
                      setEditingCustomFood(matchedCustom);
                      setCustomFoodInitialName('');
                      setCustomFoodModalOpen(true);
                    }}
                    className="btn-surface"
                    style={{
                      height: 32,
                      padding: '0 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Edit3 size={13} />
                    <span>ערוך</span>
                  </button>
                );
              })()}

              <button
                type="button"
                aria-label="מועדף"
                onClick={() => onToggleFavorite(selectedFood.id)}
                className="btn-surface"
                style={{ width: 32, height: 32, padding: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
              >
                <Heart
                  size={15}
                  color={favoriteIds.includes(selectedFood.id) ? '#ff5e7e' : 'var(--text-secondary)'}
                  fill={favoriteIds.includes(selectedFood.id) ? '#ff5e7e' : 'none'}
                />
              </button>
            </div>

            {/* תצוגת ערכים גדולה וברורה */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                borderRadius: 16,
                padding: '14px 12px',
                textAlign: 'center',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div
                className="num-mono"
                style={{ fontSize: 28, fontWeight: 900, color: 'var(--accent-orange-bright)' }}
              >
                {previewMacros.calories} קק״ל
              </div>
              <div
                className="num-mono"
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 14,
                  fontSize: 12,
                  fontWeight: 700,
                  marginTop: 6,
                }}
              >
                <span style={{ color: 'var(--macro-protein)' }}>חלבון: {previewMacros.protein}g</span>
                <span style={{ color: 'var(--macro-carbs)' }}>פחמימה: {previewMacros.carbs}g</span>
                <span style={{ color: 'var(--macro-fat)' }}>שומן: {previewMacros.fat}g</span>
              </div>
            </div>

            {/* בחירת יחידה בקפסולות + מידות המשתמש */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  יחידת מידה (אריזה, מידות אישיות וגרם):
                </span>
                {onManageToolsAndUnits && (
                  <button
                    type="button"
                    onClick={() => {
                      setToolsInitialSection('units');
                      setToolsModalOpen(true);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-orange-bright)',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Ruler size={11} />
                    <span>ניהול המידות שלי</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ...getCombinedUnitsForFood(selectedFood).map((u) => ({
                    value: u.label,
                    label: u.label,
                    isUser: Boolean(u.isUserUnit),
                  })),
                  { value: 'custom-grams', label: 'משקל חופשי (גרם)', isUser: false },
                ].map((uOpt) => {
                  const active = selectedUnitLabel === uOpt.value;
                  return (
                    <button
                      key={uOpt.value}
                      type="button"
                      onClick={() => handleUnitChange(uOpt.value)}
                      style={{
                        padding: '6px 11px',
                        borderRadius: 999,
                        border: active ? '1px solid var(--sel-border)'
                          : uOpt.isUser
                          ? '1px solid rgba(56, 189, 248, 0.38)'
                          : '1px solid var(--border-subtle)',
                        background: active ? 'var(--sel-bg)'
                          : uOpt.isUser
                          ? 'rgba(56, 189, 248, 0.1)'
                          : 'var(--bg-surface-2)',
                        color: active ? '#ffffff' : uOpt.isUser ? 'var(--info-text)' : 'var(--text-secondary)',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {uOpt.label}
                    </button>
                  );
                })}

                {onManageToolsAndUnits && (
                  <button
                    type="button"
                    onClick={() => setInlineUnitOpen((v) => !v)}
                    style={{
                      padding: '6px 11px',
                      borderRadius: 999,
                      border: '1px dashed var(--line-2)',
                      background: inlineUnitOpen ? 'var(--surface-2)' : 'transparent',
                      color: 'var(--accent-orange-bright)',
                      fontSize: 12.5,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={12} />
                    <span>הוסף מידה אישית</span>
                  </button>
                )}
              </div>

              {inlineUnitOpen && onManageToolsAndUnits && (
                <div
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 12,
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--line-2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: 8 }}>
                    <TextInput
                      size="xs"
                      label="שם המידה"
                      placeholder="למשל: חבילה / קערה שלי"
                      value={inlineUnitName}
                      onChange={(e) => setInlineUnitName(e.currentTarget.value)}
                    />
                    <NumberInput
                      size="xs"
                      label="גרם"
                      placeholder="100"
                      min={1}
                      max={3000}
                      clampBehavior="none"
                      value={inlineUnitGrams}
                      onChange={setInlineUnitGrams}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Switch
                      size="xs"
                      color="orange"
                      checked={inlineUnitForFoodOnly}
                      onChange={(e) => setInlineUnitForFoodOnly(e.currentTarget.checked)}
                      label={<span style={{ fontSize: 12 }}>שייך למוצר זה</span>}
                    />
                    <button
                      type="button"
                      disabled={
                        savingInlineUnit ||
                        !inlineUnitName.trim() ||
                        (parseOptionalDecimal(inlineUnitGrams) ?? 0) <= 0
                      }
                      onClick={() => void handleSaveInlineCustomUnit()}
                      className="btn-volt"
                      style={{
                        padding: '6px 12px',
                        fontSize: 12.5,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {savingInlineUnit ? <Loader2 size={12} className="spot-spinner" /> : <Check size={12} />}
                      <span>שמור ובחר</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
              }}
            >
              <NumberInput
                size="sm"
                label="כמות"
                placeholder="1"
                value={quantity}
                onChange={handleQuantityChange}
                min={0.25}
                max={20}
                step={0.5}
                clampBehavior="none"
                disabled={selectedUnitLabel === 'custom-grams'}
              />
              <NumberInput
                size="sm"
                label="סה״כ גרמים"
                placeholder="100"
                value={customGrams}
                onChange={setCustomGrams}
                min={1}
                max={2000}
                step={5}
                clampBehavior="none"
              />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                שעה למנה (אופציונלי)
              </span>
              <ItemTimePill
                value={customItemTime}
                fallbackTime={mealTime || mealSlot.timeHint || '12:00'}
                placeholderLabel={mealTime || mealSlot.timeHint || '12:00'}
                ariaLabel="שעה ייעודית למנה"
                clearAriaLabel="אפס שעה למנה"
                height={34}
                onChange={(val) => setCustomItemTime(normalizeHhMmTime(val) || '')}
              />
            </div>

            {(() => {
              const canAdd =
                (parseOptionalDecimal(customGrams) ?? 0) > 0 &&
                (selectedUnitLabel === 'custom-grams' ||
                  (parseOptionalDecimal(quantity) ?? 0) > 0);
              return (
                <button
                  type="button"
                  disabled={!canAdd}
                  onClick={() => {
                    if (!addSelectedFoodToMeal('catalog')) return;
                    setAiSummary({ msg: `נוסף לארוחה: ${selectedFood.name}` });
                    setInlineUnitOpen(false);
                    setSelectedFood(null);
                  }}
                  className="btn-volt"
                  style={{
                    padding: '12px 16px',
                    fontSize: 14,
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: canAdd ? 'pointer' : 'not-allowed',
                    opacity: canAdd ? 1 : 0.45,
                  }}
                >
                  <Plus size={16} />
                  <span>הוסף לארוחה</span>
                </button>
              );
            })()}
          </div>
        )}
      </Modal>

      <Modal
        opened={correctionOpen}
        onClose={() => {
          if (correctionLoading) {
            handleCancelActiveAi();
          }
          stopCorrectionVoice(false);
          setCorrectionOpen(false);
          setCorrectionError(null);
        }}
        title={
          selectionMode && selectedIds.size > 0
            ? `תיקון ממוקד ב-AI (${selectedIds.size} נבחרים)`
            : 'תיקון הארוחה עם AI'
        }
        zIndex={270}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>
            {selectionMode && selectedIds.size > 0
              ? 'ה-AI יקבל את ההקשר וההיסטוריה המלאה של הארוחה, אך ישנה אך ורק את הפריטים/מרכיבים שסימנת — שאר המנות נשארות נעולות.'
              : 'תאר מה לשנות, להחליף, להסיר או לעדכן בגרמים — שאר המרכיבים והמשקלים יישארו כפי שהם.'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              'הסר פריט שזיהה בטעות',
              'תקן כמות של פריט ל-150 גרם',
              'החלף שם מאכל שלא זוהה נכון',
            ].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() =>
                  setCorrectionText((prev) =>
                    prev.trim() ? `${prev.trim()}, ${chip}` : chip
                  )
                }
                style={{
                  border: '1px solid var(--line-2)',
                  background: 'var(--card)',
                  color: 'var(--text-2)',
                  borderRadius: 999,
                  padding: '5px 10px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                + {chip}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
              הנחיית תיקון:
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {correctionVoiceState !== 'idle' && (
                <button
                  type="button"
                  onClick={() => stopCorrectionVoice(false)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: 'var(--danger-text)',
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  ביטול
                </button>
              )}
              <button
                type="button"
                disabled={correctionVoiceState === 'transcribing'}
                onClick={toggleCorrectionVoice}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 11px',
                  borderRadius: 999,
                  border: '1px solid var(--line-2)',
                  background:
                    correctionVoiceState === 'listening'
                      ? 'rgba(239, 68, 68, 0.14)'
                      : 'var(--card)',
                  color:
                    correctionVoiceState === 'listening' ? '#ef4444' : 'var(--text)',
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  cursor: correctionVoiceState === 'transcribing' ? 'wait' : 'pointer',
                }}
              >
                {correctionVoiceState === 'listening' ? (
                  <>
                    <MicOff size={13} />
                    <span>עצור הקלטה</span>
                  </>
                ) : correctionVoiceState === 'transcribing' ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>מתמלל...</span>
                  </>
                ) : (
                  <>
                    <Mic size={13} />
                    <span>דבר תיקון</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <Textarea
            autosize
            minRows={3}
            maxRows={6}
            placeholder="למשל: הסלק שזיהית הוא בעצם כבד אפוי 160 גרם, והאורז הוא 120 גרם"
            value={correctionText}
            onChange={(e) => setCorrectionText(e.currentTarget.value)}
            disabled={correctionLoading}
            aria-label="הוראת תיקון ל-AI"
          />
          {correctionError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              {correctionError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn-volt"
              disabled={!correctionText.trim() || correctionLoading || items.length === 0}
              onClick={handleRunAiCorrection}
              style={{
                flex: 1,
                height: 52,
                fontSize: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor:
                  !correctionText.trim() || correctionLoading ? 'not-allowed' : 'pointer',
                opacity: !correctionText.trim() || correctionLoading ? 0.65 : 1,
              }}
            >
              {correctionLoading ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  <span>מתקן ארוחה מול AI...</span>
                </>
              ) : (
                <>
                  <Check size={16} />
                  <span>שלח תיקון ל-AI</span>
                </>
              )}
            </button>
            {correctionLoading && (
              <button
                type="button"
                onClick={handleCancelActiveAi}
                className="glass"
                style={{
                  height: 52,
                  padding: '0 15px',
                  borderRadius: 999,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: 'var(--danger-text)',
                  borderColor: 'rgba(239, 68, 68, 0.38)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                עצור
              </button>
            )}
          </div>
        </div>
      </Modal>

      <ServingToolsManagerModal
        opened={toolsModalOpen}
        onClose={() => setToolsModalOpen(false)}
        tools={customServingTools}
        customUnits={customFoodUnits}
        geminiApiKey={geminiApiKey}
        initialSection={toolsInitialSection}
        zIndex={260}
        onSave={async (payload) => {
          if (!onManageToolsAndUnits) return { error: 'פעולת שמירה אינה מחוברת' };
          return await onManageToolsAndUnits(payload);
        }}
      />

      <CustomFoodModal
        opened={customFoodModalOpen}
        onClose={() => {
          setCustomFoodModalOpen(false);
          setEditingCustomFood(null);
        }}
        actorRole={actorRole}
        traineeId={traineeId}
        traineeName={traineeName}
        initialFood={editingCustomFood}
        initialName={customFoodInitialName}
        defaultScope="trainee"
        zIndex={280}
        onSaved={(res) => {
          onCustomFoodsUpdated?.(res);
          if (res.item) {
            const catItem = customFoodToCatalogItem(res.item);
            const wasEdit = Boolean(editingCustomFood && editingCustomFood.id === res.item.id);
            setEditingCustomFood(null);
            if (wasEdit) {
              if (selectedFood?.id === res.item.id) {
                setSelectedFood(catItem);
              }
              notifications.show({
                color: 'teal',
                title: 'המוצר האישי עודכן',
                message: `השינויים ב-"${res.item.name}" נשמרו!`,
              });
            } else {
              void handleSelectCatalogFood(catItem);
              notifications.show({
                color: 'teal',
                title: 'מוצר אישי נשמר',
                message: `"${res.item.name}" נוצר — בחר משקל/כמות להוספה לארוחה!`,
              });
            }
          }
        }}
      />

      <Modal
        opened={customFoodsManagerOpen}
        onClose={() => setCustomFoodsManagerOpen(false)}
        title="ניהול מוצרים אישיים"
        centered
        size="md"
        zIndex={275}
        styles={{
          content: { borderRadius: 24, maxWidth: 'calc(100vw - 24px)' },
        }}
      >
        <CustomFoodsLibraryPanel
          mode="trainee-self"
          actorRole={actorRole}
          traineeId={traineeId}
          traineeName={traineeName}
          foods={customFoods}
          onMutated={(res) => onCustomFoodsUpdated?.(res)}
          title="המוצרים האישיים והמשותפים שלך"
          subtitle="תוכל לערוך או למחוק מוצרים שיצרת, ולהוסיף מוצרים חדשים עם חלוקת הקלוריות שלך."
        />
      </Modal>

      <Modal
        opened={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        title="איחוד פריטים למנה אחת"
        zIndex={275}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
            תן שם למנה המאוחדת (לדוגמה: &quot;קפה&quot; או &quot;סלט קצוץ&quot;). הפריטים שסימנת יהפכו למרכיבים פנימיים שניתן להרחיב, להכפיל או לערוך.
          </span>
          <TextInput
            label="שם המנה"
            placeholder="קפה"
            value={groupDishTitle}
            onChange={(e) => setGroupDishTitle(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirmGroupSelected();
              }
            }}
          />
          <button
            type="button"
            disabled={!groupDishTitle.trim()}
            onClick={handleConfirmGroupSelected}
            className="btn-volt"
            style={{ height: 46, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
          >
            אחד למנה
          </button>
        </div>
      </Modal>

      <BarcodeScannerModal
        opened={barcodeModalOpen}
        onClose={() => {
          setBarcodeModalOpen(false);
          if (barcodeStandaloneRef.current) {
            barcodeStandaloneRef.current = false;
            onClose();
          }
        }}
        onProductFound={(product) => {
          const wasStandalone = barcodeStandaloneRef.current;
          barcodeStandaloneRef.current = false;
          void handleSelectCatalogFood(product, false);
          const defaultUnit = product.units[0] || {
            label: '100 גרם',
            grams: 100,
          };
          trackFoodInteraction(product, 'barcode', defaultUnit.label, defaultUnit.grams);
          const macros = calculateMacrosForGrams(
            product.per100g,
            defaultUnit.grams
          );
          appendItemsSmart([
            {
              id: `bc-${Date.now()}`,
              name: (() => {
                const b = getDisplayBrandForFood(product);
                return b && !product.name.includes(b)
                  ? `${product.name} (${b})`
                  : product.name;
              })(),
              unitLabel: defaultUnit.label,
              quantity: 1,
              grams: defaultUnit.grams,
              per100g: { ...product.per100g },
              macros,
              source: 'barcode',
              inputConfidence: 'catalog',
            },
          ]);
          setAiSummary({ msg: `נוסף מסורק ברקוד: ${product.name}` });
          if (wasStandalone) {
            setTabHistory(['meal-items']);
            setActiveTab('meal-items');
          } else {
            navigateTab('meal-items');
          }
        }}
      />

      {/* צפייה במסך מלא בתמונות הארוחה עם צביטה להגדלה/הקטנה, גרירה והחלקה */}
      <Modal
        opened={heroLightboxOpen && allMealPhotos.length > 0}
        onClose={() => {
          setHeroLightboxOpen(false);
          setFsZoomScale(1);
          setFsPanOffset({ x: 0, y: 0 });
        }}
        fullScreen
        withCloseButton={false}
        zIndex={310}
        styles={{
          content: { background: '#050608', color: '#fff', display: 'flex', flexDirection: 'column' },
          body: { padding: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
        }}
      >
        <div
          style={{
            padding: 'calc(var(--sa-top, 0px) + 12px) 16px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
            gap: 8,
          }}
        >
          <GlassButton
            label="סגור צפייה במסך מלא"
            size={44}
            onClick={() => {
              setHeroLightboxOpen(false);
              setFsZoomScale(1);
              setFsPanOffset({ x: 0, y: 0 });
            }}
          >
            <X size={20} strokeWidth={2.3} />
          </GlassButton>
          <span className="num-mono ltr-num" style={{ fontSize: 14, fontWeight: 700 }}>
            {safeHeroPhotoIdx + 1} / {allMealPhotos.length}
          </span>
          {fsZoomScale > 1.05 ? (
            <button
              type="button"
              onClick={() => {
                setFsZoomScale(1);
                setFsPanOffset({ x: 0, y: 0 });
              }}
              className="glass"
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                color: '#fff',
                background: 'rgba(255,255,255,0.12)',
                cursor: 'pointer',
              }}
            >
              ×{fsZoomScale.toFixed(1)} · איפוס
            </button>
          ) : (
            <div style={{ width: 44 }} aria-hidden />
          )}
        </div>

        <div
          ref={fsStageRef}
          dir="ltr"
          onWheel={(e) => {
            if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return;
            const factor = e.deltaY < 0 ? 1.15 : 0.87;
            const next = Math.max(1, Math.min(4, Math.round(fsZoomScale * factor * 100) / 100));
            setFsZoomScale(next);
            if (next <= 1.04) {
              setFsZoomScale(1);
              setFsPanOffset({ x: 0, y: 0 });
            } else {
              const st = fsStageRef.current;
              const mx = st ? ((next - 1) * st.clientWidth) / 2 : 0;
              const my = st ? ((next - 1) * st.clientHeight) / 2 : 0;
              setFsPanOffset((p) => ({
                x: Math.max(-mx, Math.min(mx, p.x)),
                y: Math.max(-my, Math.min(my, p.y)),
              }));
            }
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const t1 = e.touches[0];
              const t2 = e.touches[1];
              const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
              fsGestureRef.current = {
                mode: 'pinch',
                startDist: Math.max(1, dist),
                startScale: fsZoomScale,
                startX: (t1.clientX + t2.clientX) / 2,
                startY: (t1.clientY + t2.clientY) / 2,
                startPanX: fsPanOffset.x,
                startPanY: fsPanOffset.y,
              };
              setFsGestureActive(true);
              return;
            }
            if (e.touches.length === 1) {
              const t = e.touches[0];
              const now = Date.now();
              if (now - fsLastTapTsRef.current < 280) {
                fsLastTapTsRef.current = 0;
                if (fsZoomScale > 1.05) {
                  setFsZoomScale(1);
                  setFsPanOffset({ x: 0, y: 0 });
                } else {
                  setFsZoomScale(2.4);
                  setFsPanOffset({ x: 0, y: 0 });
                }
                fsGestureRef.current.mode = 'none';
                return;
              }
              fsLastTapTsRef.current = now;
              if (fsZoomScale > 1.05) {
                fsGestureRef.current = {
                  mode: 'pan',
                  startDist: 1,
                  startScale: fsZoomScale,
                  startX: t.clientX,
                  startY: t.clientY,
                  startPanX: fsPanOffset.x,
                  startPanY: fsPanOffset.y,
                };
                setFsGestureActive(true);
              } else {
                fsGestureRef.current = {
                  mode: 'swipe',
                  startDist: 1,
                  startScale: 1,
                  startX: t.clientX,
                  startY: t.clientY,
                  startPanX: 0,
                  startPanY: 0,
                };
              }
            }
          }}
          onTouchMove={(e) => {
            const g = fsGestureRef.current;
            const st = fsStageRef.current;
            if (e.touches.length === 2 && g.mode === 'pinch') {
              const t1 = e.touches[0];
              const t2 = e.touches[1];
              const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
              const nextScale = Math.max(
                1,
                Math.min(4, g.startScale * (dist / Math.max(1, g.startDist)))
              );
              setFsZoomScale(nextScale);
              if (nextScale <= 1.02) {
                setFsPanOffset({ x: 0, y: 0 });
              } else if (st) {
                const mx = ((nextScale - 1) * st.clientWidth) / 2;
                const my = ((nextScale - 1) * st.clientHeight) / 2;
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                setFsPanOffset({
                  x: Math.max(-mx, Math.min(mx, g.startPanX + (midX - g.startX))),
                  y: Math.max(-my, Math.min(my, g.startPanY + (midY - g.startY))),
                });
              }
              return;
            }
            if (e.touches.length === 1 && g.mode === 'pan') {
              const t = e.touches[0];
              const mx = st ? ((fsZoomScale - 1) * st.clientWidth) / 2 : 0;
              const my = st ? ((fsZoomScale - 1) * st.clientHeight) / 2 : 0;
              setFsPanOffset({
                x: Math.max(-mx, Math.min(mx, g.startPanX + (t.clientX - g.startX))),
                y: Math.max(-my, Math.min(my, g.startPanY + (t.clientY - g.startY))),
              });
            }
          }}
          onTouchEnd={(e) => {
            const g = fsGestureRef.current;
            setFsGestureActive(false);
            if (g.mode === 'swipe' && fsZoomScale <= 1.05 && allMealPhotos.length > 1) {
              const t = e.changedTouches[0];
              if (t) {
                const dx = t.clientX - g.startX;
                const dy = t.clientY - g.startY;
                if (Math.abs(dx) >= 34 && Math.abs(dx) > Math.abs(dy) * 1.1) {
                  setFsZoomScale(1);
                  setFsPanOffset({ x: 0, y: 0 });
                  stepHeroPhoto(dx < 0 ? 1 : -1);
                }
              }
            } else if (fsZoomScale < 1.05) {
              setFsZoomScale(1);
              setFsPanOffset({ x: 0, y: 0 });
            }
            fsGestureRef.current.mode = 'none';
          }}
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            touchAction: 'none',
            userSelect: 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              transform: `translateX(-${safeHeroPhotoIdx * 100}%)`,
              transition: fsGestureActive ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {allMealPhotos.map((photoUrl, idx) => {
              const isActiveSlide = idx === safeHeroPhotoIdx;
              return (
                <div
                  key={`${photoUrl.slice(0, 32)}-fs-${idx}`}
                  style={{
                    flex: '0 0 100%',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 12px',
                    overflow: 'hidden',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt={`תמונת ארוחה ${idx + 1} מתוך ${allMealPhotos.length}`}
                    draggable={false}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: 12,
                      transform: isActiveSlide
                        ? `translate3d(${fsPanOffset.x}px, ${fsPanOffset.y}px, 0) scale(${fsZoomScale})`
                        : undefined,
                      transformOrigin: 'center center',
                      transition: fsGestureActive ? 'none' : 'transform 160ms ease-out',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {allMealPhotos.length > 1 && fsZoomScale <= 1.05 && (
            <>
              <button
                type="button"
                aria-label="תמונה קודמת"
                disabled={safeHeroPhotoIdx <= 0}
                onClick={() => {
                  setFsZoomScale(1);
                  setFsPanOffset({ x: 0, y: 0 });
                  stepHeroPhoto(-1);
                }}
                className="glass"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: safeHeroPhotoIdx <= 0 ? 'default' : 'pointer',
                  opacity: safeHeroPhotoIdx <= 0 ? 0.3 : 0.9,
                }}
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                aria-label="תמונה הבאה"
                disabled={safeHeroPhotoIdx >= allMealPhotos.length - 1}
                onClick={() => {
                  setFsZoomScale(1);
                  setFsPanOffset({ x: 0, y: 0 });
                  stepHeroPhoto(1);
                }}
                className="glass"
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 40,
                  height: 40,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: safeHeroPhotoIdx >= allMealPhotos.length - 1 ? 'default' : 'pointer',
                  opacity: safeHeroPhotoIdx >= allMealPhotos.length - 1 ? 0.3 : 0.9,
                }}
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}
        </div>

        <div
          dir="ltr"
          style={{
            padding: '10px 16px calc(var(--sa-bottom, 0px) + 16px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {fsZoomScale <= 1.05 && (
            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>
              צבוט באצבעות או הקש פעמיים להגדלה
            </span>
          )}
          {allMealPhotos.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', maxWidth: '100%' }}>
              {allMealPhotos.map((photoUrl, idx) => {
                const active = idx === safeHeroPhotoIdx;
                return (
                  <button
                    key={`thumb-${idx}`}
                    type="button"
                    aria-label={`בחר תמונה ${idx + 1}`}
                    onClick={() => {
                      setFsZoomScale(1);
                      setFsPanOffset({ x: 0, y: 0 });
                      setActiveHeroPhotoIdx(idx);
                    }}
                    style={{
                      width: 46,
                      height: 46,
                      padding: 0,
                      borderRadius: 10,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: active ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.22)',
                      opacity: active ? 1 : 0.55,
                      cursor: 'pointer',
                      background: 'transparent',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* שמירת פריטים/מנות נבחרים ממצב בחירה לתוך "ארוחות שמורות" */}
      <Modal
        opened={saveSelectedPresetOpen}
        onClose={() => !savingSelectedPreset && setSaveSelectedPresetOpen(false)}
        title="שמירה בארוחות שמורות"
        centered
        size="sm"
        zIndex={275}
        styles={{ content: { borderRadius: 24, maxWidth: 'calc(100vw - 24px)' } }}
      >
        {(() => {
          const pickedItems = extractSelectedItemsForPreset(items, selectedIds);
          const pickedTotals = sumMacros(pickedItems.map((i) => i.macros));
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                נבחרו <bdi className="ltr-num">{pickedItems.length}</bdi> פריטים לשמירה ·{' '}
                <bdi className="ltr-num">{pickedTotals.calories}</bdi> קק״ל
              </div>
              <TextInput
                size="sm"
                label="שם למנה / ארוחה השמורה"
                placeholder="למשל: שניצל ואורז / ארוחת בוקר קבועה"
                value={saveSelectedPresetTitle}
                onChange={(e) => setSaveSelectedPresetTitle(e.currentTarget.value)}
              />
              {pickedItems.length > 1 && (
                <Switch
                  size="xs"
                  color="teal"
                  checked={saveSelectedAsSingleDish}
                  onChange={(e) => setSaveSelectedAsSingleDish(e.currentTarget.checked)}
                  label={
                    <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                      שמור כמנה אחת מקופלת (המכילה את כל המרכיבים שנבחרו)
                    </span>
                  }
                />
              )}
              <button
                type="button"
                disabled={
                  savingSelectedPreset ||
                  !saveSelectedPresetTitle.trim() ||
                  pickedItems.length === 0 ||
                  !onSavedMealAction
                }
                onClick={async () => {
                  if (!mealSlot || !onSavedMealAction || pickedItems.length === 0) return;
                  const cleanTitle = saveSelectedPresetTitle.trim();
                  if (!cleanTitle) return;
                  setSavingSelectedPreset(true);
                  try {
                    const presetItemsToSave = saveSelectedAsSingleDish
                      ? [groupItemsAsCompositeDish(pickedItems, cleanTitle)]
                      : pickedItems;
                    const aiItem = pickedItems.find(
                      (it) => it.aiEngine || it.isAiFallback !== undefined
                    );
                    const res = await onSavedMealAction({
                      op: 'upsert',
                      preset: {
                        title: cleanTitle,
                        mealSlotId: mealSlot.id,
                        presetKind:
                          saveSelectedAsSingleDish ||
                          (pickedItems.length === 1 && hasCompositeComponents(pickedItems[0]))
                            ? 'dish'
                            : 'meal',
                        items: presetItemsToSave,
                        photoDataUrls: allMealPhotos.length > 0 ? allMealPhotos : undefined,
                        photoDataUrl: allMealPhotos[0],
                        contextParams,
                        aiEngine: aiItem?.aiEngine,
                        isAiFallback: aiItem?.isAiFallback,
                        fallbackReason: aiItem?.fallbackReason,
                        useCount: 1,
                      },
                    });
                    if (!res?.error) {
                      notifications.show({
                        color: 'teal',
                        title: 'נשמר בארוחות שמורות ✨',
                        message: `"${cleanTitle}" זמינה כעת לשימוש חוזר.`,
                      });
                      setSaveSelectedPresetOpen(false);
                      setSelectionMode(false);
                      setSelectedIds(new Set());
                    }
                  } finally {
                    setSavingSelectedPreset(false);
                  }
                }}
                className="btn-volt"
                style={{
                  height: 48,
                  fontSize: 15,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  cursor: savingSelectedPreset ? 'wait' : 'pointer',
                }}
              >
                {savingSelectedPreset ? (
                  <Loader2 size={16} className="spot-spinner" />
                ) : (
                  <Bookmark size={16} />
                )}
                <span>{savingSelectedPreset ? 'שומר...' : 'שמור בארוחות שמורות'}</span>
              </button>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
