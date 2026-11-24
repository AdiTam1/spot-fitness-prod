'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import {
  AiContextParams,
  AiMealSuggestionOption,
  DailyLog,
  FoodCatalogItem,
  LoggedFoodItem,
  LoggedMealEntry,
  MealTemplateSlot,
  PendingAiMealJob,
  QuickContextChip,
  SavedMealPreset,
  TraineeCustomUnit,
  TraineeServingTool,
} from '@/types/nutrition';
import {
  ISRAELI_FOOD_CATALOG,
  calculateMacrosForGrams,
  getTodayIso,
  sumMacros,
} from '@/data/israeliFoodCatalog';
import { compressMealImage } from '@/utils/imageCompression';
import {
  compressDataUrlToThumbnail,
  HEBREW_MONTH_NAMES,
} from '@/lib/dateUtils';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ServingToolsManagerModal } from './ServingToolsManagerModal';
import { GlassButton } from './ui/GlassButton';
import { SegmentedPill } from './ui/SegmentedPill';
import { SavedMealsLibraryTab } from './SavedMealsLibraryTab';
import { AiQuickContextPanel } from './AiQuickContextPanel';
import { useAiProgressMessage } from './BackgroundAiSyncBanner';
import {
  startUnifiedVoiceCapture,
  VoiceCaptureController,
  VoiceCaptureState,
} from '@/lib/voiceRecorder';
import {
  handlePossibleAuthRejection,
  useSpotUnsavedEditing,
} from '@/lib/webVersionGuard';

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
    mealTime?: string
  ) => void | Promise<void>;
  geminiApiKey?: string;
  initialTab?: string;
  traineeId?: string;
  traineeName?: string;
  learnedPreferences?: string[];
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
    scope: 'user' | 'group' | 'global';
    op: 'touch' | 'upsert' | 'delete' | 'replace';
    traineeId?: string;
    groupId?: string;
    chip?: Partial<QuickContextChip>;
    chips?: Partial<QuickContextChip>[];
    chipId?: string;
  }) => Promise<{ error?: string }>;
  selectedDate?: string;
  backgroundAiJobs?: PendingAiMealJob[];
  onStartBackgroundAiAnalysis?: (payload: {
    traineeId: string;
    date: string;
    mealSlotId: string;
    mealSlotName: string;
    mode: 'photo' | 'text';
    imageDataUrl?: string;
    imageDataUrls?: string[];
    textPrompt?: string;
    contextParams?: AiContextParams;
  }) => Promise<{ jobId: string }>;
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
  traineeId,
  learnedPreferences = [],
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
  selectedDate,
  backgroundAiJobs = [],
  onStartBackgroundAiAnalysis,
}: AddMealDrawerProps) {
  useSpotUnsavedEditing('add-meal-drawer', opened);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
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
      angle: 'top-down' | 'side-45' | 'label' | 'other';
    }[]
  >([]);
  const [photoSizeKB, setPhotoSizeKB] = useState<number | null>(null);
  const [photoFormatLabel, setPhotoFormatLabel] = useState<'WebP' | 'JPEG'>('WebP');
  const [photoNote, setPhotoNote] = useState('');
  const [photoMode, setPhotoMode] = useState<'plate' | 'nutrition-label'>('plate');
  const [freeTextPrompt, setFreeTextPrompt] = useState('');
  const [contextParams, setContextParams] = useState<AiContextParams>({});
  const [toolsModalOpen, setToolsModalOpen] = useState(false);
  const [saveAsPreset, setSaveAsPreset] = useState(false);
  const [presetTitleInput, setPresetTitleInput] = useState('');
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>('idle');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<{
    msg: string;
    isError?: boolean;
    engine?: string;
    isFallback?: boolean;
    fallbackReason?: string;
  } | null>(null);

  const [aiRecommendations, setAiRecommendations] = useState<AiMealSuggestionOption[]>([]);
  const [aiRecDebug, setAiRecDebug] = useState<{
    engine?: string;
    isFallback?: boolean;
    fallbackReason?: string;
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

  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [searchResults, setSearchResults] =
    useState<FoodCatalogItem[]>(ISRAELI_FOOD_CATALOG);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mohCount, setMohCount] = useState(0);
  const [scraperCount, setScraperCount] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(ISRAELI_FOOD_CATALOG.length);

  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(null);
  const [selectedUnitLabel, setSelectedUnitLabel] = useState<string>('custom-grams');
  const [quantity, setQuantity] = useState<number>(1);
  const [customGrams, setCustomGrams] = useState<number>(100);
  const [cameraChooserOpen, setCameraChooserOpen] = useState(false);
  const [mealTime, setMealTime] = useState<string>('');
  const [toolsInitialSection, setToolsInitialSection] = useState<'tools' | 'units'>('units');
  const [enrichingFood, setEnrichingFood] = useState(false);
  const [inlineUnitOpen, setInlineUnitOpen] = useState(false);
  const [inlineUnitName, setInlineUnitName] = useState('');
  const [inlineUnitGrams, setInlineUnitGrams] = useState<number | string>(100);
  const [inlineUnitForFoodOnly, setInlineUnitForFoodOnly] = useState(true);
  const [savingInlineUnit, setSavingInlineUnit] = useState(false);

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [addingOptionIdx, setAddingOptionIdx] = useState<number | null>(null);

  const voiceControllerRef = useRef<VoiceCaptureController | null>(null);
  const voiceBaseTextRef = useRef<string>('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const aiTextRef = useRef<HTMLTextAreaElement | null>(null);
  const aiLockRef = useRef(false);
  const recLockRef = useRef(false);
  const prefLockRef = useRef(false);
  const saveLockRef = useRef(false);

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

  const hadInitialItemsRef = useRef(false);
  const lastOpenedKeyRef = useRef<string>('');
  const slotBgProcessingJob =
    opened && mealSlot
      ? backgroundAiJobs.find(
          (j) =>
            j.status === 'processing' &&
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
  const isSlotBgProcessing = Boolean(slotBgProcessingJob);
  const progressTicker = useAiProgressMessage(
    aiLoading || isSlotBgProcessing,
    slotBgProcessingJob?.startedAt
  );

  useEffect(() => {
    if (opened && mealSlot) {
      const openKey = `${mealSlot.id}::${selectedDate || ''}::${initialTab}`;
      const entryPhotos =
        existingEntry?.photoDataUrls && existingEntry.photoDataUrls.length > 0
          ? existingEntry.photoDataUrls.filter(
              (u) => Boolean(u) && !u.endsWith(',DEMO')
            )
          : existingEntry?.photoDataUrl &&
            !existingEntry.photoDataUrl.endsWith(',DEMO')
          ? [existingEntry.photoDataUrl]
          : [];

      if (lastOpenedKeyRef.current !== openKey) {
        lastOpenedKeyRef.current = openKey;
        hadInitialItemsRef.current = Boolean(existingEntry?.items?.length);
        setItems(existingEntry?.items ? [...existingEntry.items] : []);
        setPhotoDataUrl(entryPhotos[0] || existingEntry?.photoDataUrl);
        setPhotoItems(
          entryPhotos.map((url, idx) => ({
            dataUrl: url,
            sizeKB: Math.round((url.length * 3) / 4 / 1024),
            formatLabel: 'WebP' as const,
            angle: idx === 0 ? ('top-down' as const) : ('side-45' as const),
          }))
        );
        setPhotoSizeKB(null);
        setPhotoFormatLabel('WebP');
        setPhotoNote(existingEntry?.photoNote || '');
        setFreeTextPrompt('');
        setContextParams({ customUnits: customFoodUnits });
        setSaveAsPreset(false);
        setPresetTitleInput('');
        setSearchQuery('');
        setSelectedFood(null);
        setCameraChooserOpen(false);
        setMealTime(existingEntry?.mealTime || mealSlot.timeHint || '');
        setInlineUnitOpen(false);
        setInlineUnitName('');
        setInlineUnitGrams(100);
        setEnrichingFood(false);
        setAiRecommendations([]);
        setAiRecDebug(null);
        setLearnedFeedbackBanner(null);
        setPreferenceFeedbackText('');
        setEditingItemId(null);
        setAiSummary(null);
        if (initialTab === 'barcode') {
          setActiveTab('hub');
          setBarcodeModalOpen(true);
        } else {
          setActiveTab(initialTab || 'hub');
        }
        stopVoiceRecording(false);
      } else {
        if (existingEntry?.items && existingEntry.items.length > 0) {
          // מיזוג אוטומטי כשמשימת AI ברקע מסתיימת בזמן שהחלונית נשארה פתוחה
          setItems((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const incomingNew = existingEntry.items.filter((i) => !existingIds.has(i.id));
            return incomingNew.length > 0 ? [...prev, ...incomingNew] : prev;
          });
        }
        if (entryPhotos.length > 0) {
          setPhotoItems((prev) => {
            const prevUrls = new Set(prev.map((p) => p.dataUrl));
            const incomingPhotos = entryPhotos.filter((u) => !prevUrls.has(u));
            if (incomingPhotos.length === 0) return prev;
            const merged = [
              ...incomingPhotos.map((url, idx) => ({
                dataUrl: url,
                sizeKB: Math.round((url.length * 3) / 4 / 1024),
                formatLabel: 'WebP' as const,
                angle: idx === 0 ? ('top-down' as const) : ('side-45' as const),
              })),
              ...prev,
            ].slice(0, 3);
            setPhotoDataUrl(merged[0]?.dataUrl);
            return merged;
          });
        }
      }
    } else if (!opened) {
      lastOpenedKeyRef.current = '';
      stopVoiceRecording(false);
    }
    return () => {
      stopVoiceRecording(false);
    };
  }, [opened, mealSlot, existingEntry, initialTab, customFoodUnits, selectedDate]);

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const qs = new URLSearchParams({
          q: searchQuery.trim(),
          limit: '80',
        });
        if (sourceFilter && sourceFilter !== 'all') {
          qs.set('source', sourceFilter);
        }
        const res = await fetch(`/api/food/search?${qs.toString()}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || ISRAELI_FOOD_CATALOG);
          setMohCount(data.mohCount || 0);
          setScraperCount(data.scraperCount || data.syncedCount || 0);
          setTotalAvailable(data.totalAvailable || (data.items || []).length);
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, searchQuery.trim() ? 240 : 40);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, sourceFilter, opened]);

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
    const firstNon100 = combined.find((u) => u.grams !== 100);
    const firstUnit = firstNon100 || combined[0] || { label: '100 גרם', grams: 100 };
    setSelectedUnitLabel(firstUnit.label);
    setQuantity(1);
    setCustomGrams(firstUnit.grams);

    const needsEnrich =
      Boolean(food.sourceUrl) &&
      (!food.barcode || !food.units.some((u) => Math.round(u.grams) !== 100));
    if (needsEnrich) {
      setEnrichingFood(true);
      try {
        const res = await fetch('/api/food/enrich', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: food }),
        });
        if (res.ok) {
          const data = (await res.json()) as { item?: FoodCatalogItem };
          if (data.item) {
            const enriched = data.item;
            setSearchResults((prev) =>
              prev.map((x) => (x.id === enriched.id ? enriched : x))
            );
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
    const gramsNum = Math.max(1, Math.min(3000, Math.round(Number(inlineUnitGrams) || 100)));
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
      setCustomGrams(Math.round(found.grams * quantity));
    }
  };

  const handleQuantityChange = (val: string | number) => {
    const q = Math.max(0.25, Number(val) || 1);
    setQuantity(q);
    if (selectedFood && selectedUnitLabel !== 'custom-grams') {
      const found = getCombinedUnitsForFood(selectedFood).find(
        (u) => u.label === selectedUnitLabel
      );
      if (found) {
        setCustomGrams(Math.round(found.grams * q));
      }
    }
  };

  const addSelectedFoodToMeal = (
    sourceOverride: 'catalog' | 'barcode' = 'catalog'
  ) => {
    if (!selectedFood) return;
    const totalGrams = Math.max(1, Number(customGrams) || 100);
    const calculatedMacros = calculateMacrosForGrams(
      selectedFood.per100g,
      totalGrams
    );

    const newItem: LoggedFoodItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: selectedFood.brand
        ? `${selectedFood.name} (${selectedFood.brand})`
        : selectedFood.name,
      unitLabel:
        selectedUnitLabel === 'custom-grams'
          ? `${totalGrams} גרם`
          : quantity === 1
          ? selectedUnitLabel
          : `${quantity} × ${selectedUnitLabel}`,
      quantity,
      grams: totalGrams,
      macros: calculatedMacros,
      source: sourceOverride,
    };

    setItems((prev) => [...prev, newItem]);
  };

  const [photoUploading, setPhotoUploading] = useState(false);

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    preferredAngle?: 'top-down' | 'side-45' | 'label' | 'other'
  ) => {
    const files = Array.from(e.target.files || []).slice(
      0,
      Math.max(0, 3 - photoItems.length)
    );
    if (files.length === 0) {
      e.target.value = '';
      return;
    }
    const invalid = files.find((f) => !f.type.startsWith('image/'));
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
      const newEntries: {
        dataUrl: string;
        sizeKB: number;
        formatLabel: 'WebP' | 'JPEG';
        angle: 'top-down' | 'side-45' | 'label' | 'other';
      }[] = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressMealImage(files[i], 800, 0.72);
        const thumbUrl = await compressDataUrlToThumbnail(
          compressed.dataUrl,
          640,
          155000
        );
        const approxKB = Math.max(1, Math.round((thumbUrl.length * 3) / 4 / 1024));
        const angle =
          photoMode === 'nutrition-label'
            ? 'label'
            : preferredAngle || (photoItems.length + i === 0 ? 'top-down' : 'side-45');
        newEntries.push({
          dataUrl: thumbUrl,
          sizeKB: approxKB,
          formatLabel: compressed.formatLabel,
          angle,
        });
      }
      setPhotoItems((prev) => {
        const merged = [...prev, ...newEntries].slice(0, 3);
        setPhotoDataUrl(merged[0]?.dataUrl);
        setPhotoSizeKB(merged[0]?.sizeKB ?? null);
        setPhotoFormatLabel(merged[0]?.formatLabel ?? 'WebP');
        return merged;
      });
      setCameraChooserOpen(false);
      setActiveTab('ai-photo');
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
    const activeImages = photoItems.length > 0
      ? photoItems
      : photoDataUrl && !photoDataUrl.endsWith(',DEMO')
      ? [{ dataUrl: photoDataUrl, angle: 'top-down' as const }]
      : [];

    if (mode === 'photo' && activeImages.length === 0 && !rawPrompt.trim()) {
      setAiSummary({ msg: 'נא להעלות תמונה או להזין תיאור של הארוחה', isError: true });
      return;
    }
    const promptToUse =
      mode === 'photo' && photoMode === 'nutrition-label'
        ? `קרא את טבלת הערכים התזונתיים מהתמונה וחלץ את המוצר והערכים שלו למנה/100 גרם: ${rawPrompt}`
        : rawPrompt;

    const fullContextParams: AiContextParams = {
      ...contextParams,
      imageAngles: activeImages.map((im) => im.angle),
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
        textPrompt: promptToUse,
        contextParams: fullContextParams,
      });
      return;
    }

    aiLockRef.current = true;
    setAiLoading(true);
    if (optionIndex !== undefined) setAddingOptionIdx(optionIndex);
    setAiSummary(null);
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl: mode === 'photo' ? activeImages[0]?.dataUrl || undefined : undefined,
          imageDataUrls:
            mode === 'photo' && activeImages.length > 0
              ? activeImages.map((im) => im.dataUrl)
              : undefined,
          textPrompt: promptToUse,
          contextParams: fullContextParams,
          customApiKey: geminiApiKey,
        }),
      });
      if (await handlePossibleAuthRejection(res)) return;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiSummary({
          msg: data.error || 'שגיאה בפענוח ה-AI – נסה שוב',
          isError: true,
        });
        return;
      }
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems((prev) => [...prev, ...data.items]);
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
      setAiSummary({ msg: 'שגיאה בפענוח ה-AI', isError: true });
    } finally {
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
    try {
      const res = await fetch('/api/ai/recommend-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'recommend',
          traineeId,
          mealName: mealSlot.name,
          targetMacros: remainingMacros,
          customApiKey: geminiApiKey,
        }),
      });
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
        });
      } else {
        setAiRecDebug(null);
        setAiSummary({ msg: 'לא התקבלו הצעות – נסה שוב', isError: true });
      }
    } catch {
      setAiRecDebug(null);
      setAiSummary({ msg: 'שגיאה בקבלת המלצות ארוחה מ-AI', isError: true });
    } finally {
      recLockRef.current = false;
      setAiRecLoading(false);
    }
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

  const updateLoggedItemGrams = (id: string, newGrams: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const safeGrams = Math.max(1, newGrams);
        const ratio = safeGrams / Math.max(1, item.grams);
        return {
          ...item,
          grams: safeGrams,
          unitLabel: `${safeGrams} גרם`,
          macros: {
            calories: Math.round(item.macros.calories * ratio),
            protein: Math.round(item.macros.protein * ratio * 10) / 10,
            carbs: Math.round(item.macros.carbs * ratio * 10) / 10,
            fat: Math.round(item.macros.fat * ratio * 10) / 10,
          },
        };
      })
    );
  };

  const updateLoggedItemMacroField = (
    id: string,
    field: 'calories' | 'protein' | 'carbs' | 'fat',
    value: number
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              macros: {
                ...item.macros,
                [field]: Math.max(0, Number(value) || 0),
              },
            }
          : item
      )
    );
  };

  const updateLoggedItemName = (id: string, name: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name } : item))
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!mealSlot) return null;

  const currentTotals = sumMacros(items.map((i) => i.macros));
  const previewMacros = selectedFood
    ? calculateMacrosForGrams(selectedFood.per100g, customGrams)
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  const allMealPhotos =
    photoItems.length > 0
      ? photoItems.map((im) => im.dataUrl)
      : photoDataUrl && !photoDataUrl.endsWith(',DEMO')
      ? [photoDataUrl]
      : [];
  const mealThumbnailUrl = allMealPhotos[0];

  const handleSaveMealAndClose = async () => {
    if (saveLockRef.current) return;
    saveLockRef.current = true;
    setSavingMeal(true);
    try {
      const primaryPhoto = allMealPhotos[0] || photoDataUrl;
      await onSaveMeal(
        mealSlot.id,
        items,
        primaryPhoto,
        photoNote,
        allMealPhotos.length > 0 ? allMealPhotos : undefined,
        mealTime || undefined
      );
      if (saveAsPreset && items.length > 0 && onSavedMealAction) {
        const autoTitle =
          presetTitleInput.trim() ||
          items
            .slice(0, 2)
            .map((i) => i.name)
            .join(' + ');
        const aiItem = items.find(
          (it) => it.aiEngine || it.isAiFallback !== undefined
        );
        await onSavedMealAction({
          op: 'upsert',
          preset: {
            title: autoTitle,
            mealSlotId: mealSlot.id,
            items,
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
      onClose();
    } finally {
      saveLockRef.current = false;
      setSavingMeal(false);
    }
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
              {(activeTab !== 'hub' || trimmedQuery.length > 0) && activeTab !== 'ai-recommend' && (
                <GlassButton
                  label="חזרה"
                  size={40}
                  onClick={() => {
                    if (trimmedQuery) setSearchQuery('');
                    setActiveTab('hub');
                  }}
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
                    {activeTab === 'hub' ? `נרשם ל${mealSlot.name}` : 'יעד'}{' '}
                    {activeTab !== 'hub' && (
                      <span className="num-mono" dir="ltr" style={{ color: 'var(--text)', fontWeight: 600 }}>
                        {mealSlot.targets.calories}
                      </span>
                    )}
                  </span>
                </div>
                )}
              </div>
            </div>
            {activeTab === 'ai-recommend' ? (
              <GlassButton label="חזרה" onClick={() => setActiveTab('hub')}>
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
                  background: 'var(--bg-surface-2)',
                  border: trimmedQuery
                    ? '1px solid var(--line-2)'
                    : '1px solid var(--border-strong)',
                  borderRadius: 999,
                  padding: '0 10px 0 6px',
                  height: 42,
                  gap: 5,
                }}
              >
                <Search size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  placeholder="חפש מוצר, ברקוד, שמורות או כתוב ל-AI..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
                {trimmedQuery && (
                  <button
                    type="button"
                    aria-label="נקה חיפוש"
                    onClick={() => setSearchQuery('')}
                    style={{
                      width: 24,
                      height: 24,
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
                    <X size={12} />
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
                    width: 34,
                    height: 34,
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
                    <MicOff size={16} />
                  ) : voiceState === 'transcribing' ? (
                    <Loader2 size={15} className="spot-spinner" />
                  ) : (
                    <Mic size={16} />
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
                      setActiveTab('ai-text');
                    }
                  }}
                  style={{
                    width: 32,
                    height: 32,
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
                    <Loader2 size={14} className="spot-spinner" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                </button>
                <button
                  type="button"
                  title="צילום במצלמה / בחירת תמונות מהגלריה או קבצים"
                  onClick={() => setCameraChooserOpen((v) => !v)}
                  style={{
                    width: 32,
                    height: 32,
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
                  <Camera size={15} />
                </button>
              </div>

              {cameraChooserOpen && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    padding: 6,
                    borderRadius: 14,
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--line-2)',
                  }}
                >
                  <label
                    className="btn-surface"
                    style={{
                      padding: '8px 6px',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
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
                      disabled={photoUploading}
                      onChange={(e) => void handlePhotoUpload(e, 'top-down')}
                    />
                  </label>
                  <label
                    className="btn-surface"
                    style={{
                      padding: '8px 6px',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <ImageIcon size={13} color="var(--text-2)" />
                    <span>גלריה (מרובה)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      disabled={photoUploading}
                      onChange={(e) => void handlePhotoUpload(e)}
                    />
                  </label>
                  <label
                    className="btn-surface"
                    style={{
                      padding: '8px 6px',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <FolderOpen size={13} color="#a78bfa" />
                    <span>בחירת קבצים</span>
                    <input
                      type="file"
                      accept="image/*,.heic,.heif,.webp,.png,.jpg,.jpeg"
                      multiple
                      hidden
                      disabled={photoUploading}
                      onChange={(e) => void handlePhotoUpload(e)}
                    />
                  </label>
                </div>
              )}
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
          {aiSummary && !heroScreen && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: aiSummary.isError
                  ? 'rgba(239, 68, 68, 0.14)'
                  : aiSummary.isFallback
                  ? 'rgba(245, 158, 11, 0.14)'
                  : 'var(--fill-1)',
                border: aiSummary.isError
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : aiSummary.isFallback
                  ? '1px solid rgba(245, 158, 11, 0.35)'
                  : '1px solid var(--line-2)',
                color: aiSummary.isError
                  ? 'var(--danger-text)'
                  : aiSummary.isFallback
                  ? 'var(--warn-text)'
                  : 'var(--accent-volt)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{aiSummary.msg}</div>
                {aiSummary.engine && (
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.95 }}>
                    {aiSummary.isFallback
                      ? `תג תחקור: לא AI פיענח (${aiSummary.engine})${
                          aiSummary.fallbackReason
                            ? ` · סיבה: ${aiSummary.fallbackReason}`
                            : ''
                        }`
                      : `✨ מנוע AI פעיל: ${aiSummary.engine}`}
                  </div>
                )}
              </div>
              <button
                type="button"
                aria-label="סגור הודעה"
                onClick={() => setAiSummary(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  opacity: 0.75,
                  cursor: 'pointer',
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* Hub: big photo tile, 2×2 shortcuts and one-tap saved meals */}
          {activeTab === 'hub' && trimmedQuery.length === 0 && (() => {
            const addPreset = (preset: SavedMealPreset) => {
              const cloned = preset.items.map((it, i) => ({
                ...it,
                id: `hub-pre-${Date.now()}-${i}`,
              }));
              setItems((prev) => [...prev, ...cloned]);
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
            const tiles: { id: string; title: string; subtitle: string; Icon: typeof Camera }[] = [
              { id: 'ai-text', title: 'טקסט / קול ל-AI', subtitle: 'תיאור חופשי + תיבול', Icon: Mic },
              { id: 'barcode-action', title: 'סריקת ברקוד', subtitle: 'מוצרים ארוזים', Icon: Barcode },
              {
                id: 'favorites',
                title: 'מועדפים ומאגר',
                subtitle: favoriteIds.length > 0 ? `${favoriteIds.length} מועדפים · חיפוש מוצרים` : 'חיפוש מאכלים ומוצרים',
                Icon: Search,
              },
              { id: 'ai-recommend', title: 'מה לאכול?', subtitle: 'המלצות AI + המאמן', Icon: Lightbulb },
            ];
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('ai-photo')}
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
                        if (t.id === 'barcode-action') setBarcodeModalOpen(true);
                        else setActiveTab(t.id);
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
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ארוחות שמורות</h3>
                  <button
                    type="button"
                    className="glass"
                    onClick={() => setActiveTab('saved-meals')}
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
                    <Bookmark size={15} />
                    כל השמורות
                    {savedMeals.length > 0 && (
                      <span className="num-mono" style={{ color: 'var(--text-2)' }}>
                        {savedMeals.length}
                      </span>
                    )}
                  </button>
                </div>

                {topSaved.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 16px',
                      borderRadius: 20,
                      border: '1.5px dashed var(--line-2)',
                      fontSize: 13,
                      color: 'var(--text-2)',
                    }}
                  >
                    עוד אין ארוחות שמורות. אחרי שמירת ארוחה, סמן ״שמור כמנה״ כדי להוסיף אותה כאן בלחיצה אחת.
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
                      const cloned = preset.items.map((it, i) => ({
                        ...it,
                        id: `srch-pre-${Date.now()}-${i}`,
                      }));
                      setItems((prev) => [...prev, ...cloned]);
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
              contextParams={{
                ...contextParams,
                customUnits: customFoodUnits,
              }}
              onAddItemsToMeal={(newItems, img) => {
                setItems((prev) => [...prev, ...newItems]);
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
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>יתרה להשלמה בארוחה זו</span>
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
                      <bdi dir="ltr" className="ltr-num">
                        {Math.max(0, mealSlot.targets.calories - currentTotals.calories)}
                      </bdi>{' '}
                      קק״ל · ח׳{' '}
                      <bdi dir="ltr" className="ltr-num">
                        {Math.max(0, Math.round(mealSlot.targets.protein - currentTotals.protein))}
                      </bdi>
                    </span>
                  </div>

                  {aiRecommendations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {aiRecDebug?.engine && (
                        <span style={{ fontSize: 13, color: aiRecDebug.isFallback ? 'var(--warn-text)' : 'var(--text-2)' }}>
                          {aiRecDebug.isFallback
                            ? `נוצר ע״י מנוע כללים מקומי (לא AI · ${aiRecDebug.engine})${
                                aiRecDebug.fallbackReason ? ` · ${aiRecDebug.fallbackReason}` : ''
                              }`
                            : `נוצר ע״י AI (${aiRecDebug.engine})`}
                        </span>
                      )}
                      {aiRecommendations.map((option) => (
                        <div key={option.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                          <button
                            type="button"
                            aria-label={`הוסף את ${option.title} לארוחה`}
                            onClick={() => {
                              setItems((prev) => [...prev, ...option.items]);
                              setAiSummary({ msg: `נוספה לארוחה ההצעה: "${option.title}"` });
                            }}
                            className="glass"
                            style={{ width: 44, height: 44, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}
                          >
                            <Plus size={20} strokeWidth={2.2} />
                          </button>
                          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 15, fontWeight: 600 }}>{option.title}</span>
                            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{option.whyItFits}</span>
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

                  <button
                    type="button"
                    disabled={aiRecLoading}
                    onClick={fetchAiRecommendations}
                    className="glass"
                    style={{
                      height: 50,
                      borderRadius: 999,
                      fontFamily: 'inherit',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    {aiRecLoading ? <Loader2 size={16} className="spot-spinner" /> : <Sparkles size={16} />}
                    {aiRecLoading ? 'בונה 3 הצעות מותאמות…' : aiRecommendations.length > 0 ? 'הצע 3 אחרות' : 'הצע לי 3 ארוחות ליתרה'}
                  </button>
                </section>

                {/* Learned preferences + silent-learning feedback */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-2)' }}>העדפות שנלמדו בחשבון שלך</span>
                  {learnedPreferences.length > 0 && (
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
                    תוצאות מהמאגר הישראלי והסופרים:
                  </span>
                  <button
                    type="button"
                    onClick={() => setBarcodeModalOpen(true)}
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

                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    overflowX: 'auto',
                    paddingBottom: 2,
                  }}
                >
                  {[
                    { id: 'all', label: 'הכל (מאגר משולב)' },
                    { id: 'shufersal', label: 'שופרסל (DB)' },
                    { id: 'victory', label: 'ויקטורי' },
                    { id: 'nizat', label: 'ניצת הדובדבן' },
                    { id: 'tevabari', label: 'טבע בריא' },
                    { id: 'fuder', label: 'Fuder סופרים' },
                    { id: 'foodgroups', label: 'FoodGroups' },
                    { id: 'sugat', label: 'סוגת' },
                    { id: 'tara', label: 'טרה' },
                    { id: 'berman', label: 'ברמן' },
                    { id: 'foodsdictionary', label: 'FoodsDictionary' },
                    { id: 'foodik', label: 'Foodik' },
                    { id: 'netogreen', label: 'NetoGreen' },
                    { id: 'moh_gov', label: 'משרד הבריאות' },
                    { id: 'openfoodfacts', label: 'ברקוד / סופרים' },
                    { id: 'local', label: 'בסיס SPOT' },
                  ].map((src) => {
                    const active = sourceFilter === src.id;
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => setSourceFilter(src.id)}
                        style={{
                          flexShrink: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          border: active ? '1px solid var(--sel-border)'
                            : '1px solid var(--border-subtle)',
                          background: active ? 'var(--sel-bg)'
                            : 'var(--bg-surface-2)',
                          color: active ? 'var(--sel-text)'
                            : 'var(--text-2)',
                        }}
                      >
                        {src.label}
                      </button>
                    );
                  })}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 13.5,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    {searchLoading
                      ? 'מחפש במאגר המשולב (סופרים ישראליים, חנויות טבע + משרד הבריאות)...'
                      : `${searchResults.length} תוצאות מתוך ${totalAvailable.toLocaleString('he-IL')}+ פריטים`}
                  </span>
                  <span>לחץ לבחירת כמות</span>
                </div>

                {searchResults.length === 0 && !searchLoading ? (
                  <div
                    style={{
                      padding: 18,
                      textAlign: 'center',
                      borderRadius: 18,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-2)',
                      fontSize: 13,
                    }}
                  >
                    לא נמצאו מוצרים המתאימים ל־&ldquo;{searchQuery}&rdquo;. אפשר ללחוץ על כפתור <b>✨</b> בשורת החיפוש למעלה לפיענוח ב-AI!
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {searchResults.slice(0, 48).map((food) => {
                      const isSelected = selectedFood?.id === food.id;
                      const isFav = favoriteIds.includes(food.id);
                      return (
                        <div
                          key={food.id}
                          onClick={() => void handleSelectCatalogFood(food)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 18,
                            cursor: 'pointer',
                            border: isSelected ? '1px solid var(--text-3)'
                              : '1px solid var(--border-subtle)',
                            background: isSelected ? 'var(--surface-3)'
                              : 'var(--bg-surface-2)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
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
                              {food.name}
                            </div>
                            <div
                              className="num-mono"
                              style={{
                                fontSize: 13,
                                color: 'var(--text-2)',
                              }}
                            >
                              {food.per100g.calories} קק״ל · ח:{food.per100g.protein} פ:{food.per100g.carbs} ש:{food.per100g.fat}
                            </div>
                            {(food.sourceSiteName || food.barcode) && (
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 13,
                                  display: 'flex',
                                  alignItems: 'center',
                                  flexWrap: 'wrap',
                                  gap: 6,
                                  color: food.sourceSiteId
                                    ? 'var(--accent-orange-bright)'
                                    : 'var(--text-muted)',
                                }}
                              >
                                {food.sourceSiteName && (
                                  <span>
                                    {food.brand && food.brand !== food.sourceSiteName
                                      ? `${food.brand} · ${food.sourceSiteName}`
                                      : food.sourceSiteName}
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
                                      fontSize: 13.5,
                                    }}
                                  >
                                    <Barcode size={9} />
                                    {food.barcode}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(food.id);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: isFav
                                ? '#ff5e7e'
                                : 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: 4,
                            }}
                          >
                            <Heart
                              size={14}
                              fill={isFav ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>
                      );
                    })}
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
                    onClick={() => setActiveTab('meal-items')}
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

                <SegmentedPill
                  ariaLabel="סוג צילום"
                  value={photoMode}
                  onChange={(v) => setPhotoMode(v as 'plate' | 'nutrition-label')}
                  options={[
                    { value: 'plate', label: 'צלחת / ארוחה', icon: <Camera size={15} /> },
                    { value: 'nutrition-label', label: 'טבלת ערכים', icon: <FileText size={15} /> },
                  ]}
                />

                {/* Capture area */}
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
                        {photoItems.map((im, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: 'relative',
                              flex: 'none',
                              width: photoItems.length === 1 ? '100%' : 132,
                              height: photoItems.length === 1 ? 190 : 132,
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
                            <button
                              type="button"
                              className="glass"
                              aria-label="החלף סוג זווית"
                              onClick={() => {
                                setPhotoItems((prev) =>
                                  prev.map((x, i) =>
                                    i === idx
                                      ? {
                                          ...x,
                                          angle:
                                            x.angle === 'top-down'
                                              ? 'side-45'
                                              : x.angle === 'side-45'
                                              ? 'label'
                                              : 'top-down',
                                        }
                                      : x
                                  )
                                );
                              }}
                              style={{
                                position: 'absolute',
                                insetBlockEnd: 8,
                                insetInlineEnd: 8,
                                height: 32,
                                padding: '0 12px',
                                borderRadius: 999,
                                fontFamily: 'inherit',
                                fontSize: 13,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {im.angle === 'top-down'
                                ? 'מלמעלה 90°'
                                : im.angle === 'side-45'
                                ? 'מהצד ~45°'
                                : 'תווית / אחר'}
                            </button>
                          </div>
                        ))}
                      </div>
                      {photoSizeKB && (
                        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                          <bdi className="ltr-num">{photoItems.length}/3</bdi> תמונות נבחרו · {photoFormatLabel}
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
                        {photoMode === 'nutrition-label' ? <FileText size={28} /> : <Camera size={28} />}
                      </span>
                      <span style={{ fontSize: 17, fontWeight: 700 }}>
                        {photoMode === 'nutrition-label' ? 'צלם את טבלת הערכים מהאריזה' : 'צלם את הצלחת'}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 320, lineHeight: 1.45 }}>
                        {photoMode === 'nutrition-label'
                          ? 'ה-AI יקרא את הטבלה (ל-100 גרם או למנה) ויוסיף לארוחה'
                          : 'עד 3 תמונות. לדיוק מרבי: אחת מלמעלה (90°) ואחת מהצד (~45°)'}
                      </span>
                    </div>
                  )}

                  {photoItems.length < 3 && (
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
                          onChange={(e) => handlePhotoUpload(e, photoItems.length === 0 ? 'top-down' : 'side-45')}
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

                <AiQuickContextPanel
                  traineeId={traineeId}
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="photo-note" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                    {photoMode === 'nutrition-label'
                      ? 'שם המוצר וכמות שאכלת'
                      : 'הקשר נוסף לצילום (אופציונלי)'}
                  </label>
                  <textarea
                    id="photo-note"
                    rows={2}
                    placeholder={
                      photoMode === 'nutrition-label'
                        ? 'למשל: חטיף חלבון - יחידה אחת 60 גרם'
                        : 'למשל: 180 גרם פסטה מבושלת, ללא תוספת שמן'
                    }
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

                {/* Pinned analyse action (design: "נתח את הצלחת") */}
                <div className="wizard-nav" style={{ marginTop: 0, background: 'linear-gradient(to top, var(--bg) 70%, transparent)' }}>
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
                        : photoMode === 'nutrition-label'
                        ? 'חלץ ערכים מהאריזה'
                        : photoItems.length > 1
                        ? `נתח ${photoItems.length} תמונות`
                        : 'נתח את הצלחת'}
                    </span>
                  </button>
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

            {/* לשונית 4: מועדפים */}
            {activeTab === 'favorites' && (
              <>
                {ISRAELI_FOOD_CATALOG.filter((f) =>
                  favoriteIds.includes(f.id)
                ).length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      borderRadius: 14,
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                    }}
                  >
                    טרם סימנת מאכלים מועדפים.
                    <div style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => setActiveTab('catalog')}
                        className="btn-volt"
                        style={{ padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}
                      >
                        עיון במאגר המזון המלא
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {ISRAELI_FOOD_CATALOG.filter((f) =>
                      favoriteIds.includes(f.id)
                    ).map((food) => {
                      const defaultUnit = food.units[0];
                      const macros = calculateMacrosForGrams(
                        food.per100g,
                        defaultUnit.grams
                      );
                      return (
                        <div
                          key={food.id}
                          style={{
                            background: 'var(--bg-surface-2)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 12,
                            padding: 12,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              {food.name}
                            </div>
                            <div
                              className="num-mono"
                              style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {defaultUnit.label} · {macros.calories} קק״ל
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setItems((prev) => [
                                ...prev,
                                {
                                  id: `fav-${Date.now()}-${Math.random()
                                    .toString(36)
                                    .slice(2, 6)}`,
                                  name: food.name,
                                  unitLabel: defaultUnit.label,
                                  quantity: 1,
                                  grams: defaultUnit.grams,
                                  macros,
                                  source: 'catalog',
                                },
                              ]);
                            }}
                            className="btn-surface"
                            style={{
                              padding: '6px 10px',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            + הוסף
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {(isSlotBgProcessing || aiLoading) && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: 'var(--fill-1)',
                  border: '1px solid var(--line-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} color="var(--accent-volt)" className="spot-spinner" />
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent-volt)' }}>
                      {progressTicker.currentStepText}
                    </span>
                  </div>
                  <span
                    className="num-mono"
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--surface-2)',
                      color: 'var(--accent-volt)',
                    }}
                  >
                    {progressTicker.formattedElapsed}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  ניתוח AI מתקדם עשוי לקחת 1–3 דקות. <b>אפשר לצאת מהחלונית או אפילו לסגור בינתיים</b> — הפענוח ממשיך ברקע והפריטים יסתנכרנו אוטומטית ליומן הארוחות שלך.
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-surface"
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderColor: 'var(--line-2)',
                    color: 'var(--accent-volt)',
                  }}
                >
                  אפשר לצאת בינתיים — סגור חלונית והמשך רגיל ←
                </button>
              </div>
            )}

            {slotBgFailedJob && !aiSummary && !isSlotBgProcessing && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: 'var(--danger-text)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {slotBgFailedJob.errorMsg || 'פענוח ה-AI נכשל — נסה שוב או הוסף מהמאגר'}
              </div>
            )}

            {/* פאנל נפרד לניהול ועריכת המרכיבים שכבר בארוחה (נפתח מלחיצה על הכרטיסייה התחתונה) */}
            {activeTab === 'meal-items' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    display: heroScreen ? 'none' : 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 17, fontWeight: 700 }}>
                    מרכיבי הארוחה הנוכחית ({items.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('hub')}
                    className="btn-surface"
                    style={{
                      padding: '5px 11px',
                      borderRadius: 999,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + הוסף עוד פריטים
                  </button>
                </div>

                {/* Result header (design: PhotoResult) — photo hero + totals vs meal target */}
                {allMealPhotos.length > 0 && (
                  <div style={{ position: 'relative', margin: '0 -16px', overflow: 'hidden', background: 'var(--surface-2)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={allMealPhotos[0]}
                      alt="תמונת הארוחה"
                      onClick={() => setActiveTab('ai-photo')}
                      style={{ display: 'block', width: '100%', height: 'calc(300px + var(--sa-top, 0px))', objectFit: 'cover', cursor: 'pointer' }}
                    />
                    <div style={{ position: 'absolute', insetBlockStart: 'calc(var(--sa-top, 0px) + 12px)', insetInline: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <GlassButton
                        label="סגירה"
                        data-autofocus
                        onClick={() => {
                          if (!savingMeal) onClose();
                        }}
                      >
                        <X size={18} strokeWidth={2.2} />
                      </GlassButton>
                      <button
                        type="button"
                        className="glass"
                        onClick={() => setActiveTab('ai-photo')}
                        style={{ height: 44, padding: '0 16px', borderRadius: 999, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                      >
                        <Camera size={15} />
                        צלם שוב
                      </button>
                    </div>
                    {allMealPhotos.length > 1 && (
                      <span
                        className="glass"
                        style={{
                          position: 'absolute',
                          insetBlockEnd: 10,
                          insetInlineStart: 10,
                          height: 30,
                          padding: '0 12px',
                          borderRadius: 999,
                          fontSize: 13,
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        +<bdi className="ltr-num">{allMealPhotos.length - 1}</bdi> תמונות
                      </span>
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
                        <bdi className="ltr-num">{items.length}</bdi> מרכיבים · יעד{' '}
                        <bdi className="ltr-num">{mealSlot.targets.calories}</bdi>
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
                              width: `${Math.min(100, Math.round((m.v / Math.max(1, m.g)) * 100))}%`,
                              background: m.c,
                              borderRadius: 9,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>
                          <bdi dir="ltr" className="num-mono ltr-num">{Math.round(m.v)}</bdi>
                          <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>
                            {' '}/ <bdi dir="ltr" className="num-mono ltr-num">{Math.round(m.g)}</bdi> ג׳
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {heroScreen && (
                <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span style={{ fontSize: 17, fontWeight: 700 }}>
                      מרכיבי הארוחה הנוכחית ({items.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('hub')}
                      className="btn-surface"
                      style={{
                        padding: '5px 11px',
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + הוסף עוד פריטים
                    </button>
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
                    {items.map((item) => {
                      const isEditing = editingItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={{
                            borderBottom: '1px solid var(--line)',
                            padding: '8px 2px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 10,
                            }}
                          >
                            <button
                              type="button"
                              aria-label={isEditing ? 'סגור עריכה' : `ערוך ${item.name}`}
                              aria-expanded={isEditing}
                              onClick={() => setEditingItemId(isEditing ? null : item.id)}
                              style={{ minWidth: 0, flex: 1, background: 'transparent', border: 0, padding: 0, textAlign: 'start', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer', minHeight: 44 }}
                            >
                              <div style={{ fontSize: 16, fontWeight: 600 }}>{item.name}</div>
                              <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                                <bdi dir="ltr" className="num-mono ltr-num">{item.macros.calories}</bdi> קק״ל
                                {item.isAiFallback ? ' · לא AI' : item.aiEngine ? ' · AI' : ''}
                              </div>
                            </button>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 2,
                                padding: 3,
                                borderRadius: 999,
                                background: 'var(--surface-2)',
                                flex: 'none',
                              }}
                            >
                              <button
                                type="button"
                                aria-label={`הפחת כמות ${item.name}`}
                                onClick={() => updateLoggedItemGrams(item.id, item.grams - 10)}
                                style={{ width: 44, height: 40, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              >
                                <Minus size={16} strokeWidth={2.2} />
                              </button>
                              <bdi dir="ltr" className="num-mono ltr-num" style={{ minWidth: 56, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>
                                {Math.round(item.grams)} ג׳
                              </bdi>
                              <button
                                type="button"
                                aria-label={`הוסף כמות ${item.name}`}
                                onClick={() => updateLoggedItemGrams(item.id, item.grams + 10)}
                                style={{ width: 44, height: 40, borderRadius: 999, border: 0, background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              >
                                <Plus size={16} strokeWidth={2.2} />
                              </button>
                            </span>
                          </div>

                          <Collapse in={isEditing}>
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 8,
                              }}
                            >
                              <TextInput
                                size="xs"
                                label="שם המרכיב"
                                value={item.name}
                                onChange={(e) =>
                                  updateLoggedItemName(item.id, e.currentTarget.value)
                                }
                              />
                              <div
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))',
                                  gap: 6,
                                }}
                              >
                                <NumberInput
                                  size="xs"
                                  label="גרם"
                                  value={item.grams}
                                  min={1}
                                  step={5}
                                  onChange={(val) =>
                                    updateLoggedItemGrams(
                                      item.id,
                                      Number(val) || 100
                                    )
                                  }
                                />
                                <NumberInput
                                  size="xs"
                                  label="קק״ל"
                                  value={item.macros.calories}
                                  min={0}
                                  onChange={(val) =>
                                    updateLoggedItemMacroField(
                                      item.id,
                                      'calories',
                                      Number(val)
                                    )
                                  }
                                />
                                <NumberInput
                                  size="xs"
                                  label="חלבון"
                                  value={item.macros.protein}
                                  min={0}
                                  decimalScale={1}
                                  onChange={(val) =>
                                    updateLoggedItemMacroField(
                                      item.id,
                                      'protein',
                                      Number(val)
                                    )
                                  }
                                />
                                <NumberInput
                                  size="xs"
                                  label="פחמימה"
                                  value={item.macros.carbs}
                                  min={0}
                                  decimalScale={1}
                                  onChange={(val) =>
                                    updateLoggedItemMacroField(
                                      item.id,
                                      'carbs',
                                      Number(val)
                                    )
                                  }
                                />
                                <NumberInput
                                  size="xs"
                                  label="שומן"
                                  value={item.macros.fat}
                                  min={0}
                                  decimalScale={1}
                                  onChange={(val) =>
                                    updateLoggedItemMacroField(
                                      item.id,
                                      'fat',
                                      Number(val)
                                    )
                                  }
                                />
                              </div>
                              <button
                                type="button"
                                aria-label={`הסר ${item.name}`}
                                onClick={() => removeItem(item.id)}
                                style={{ alignSelf: 'flex-start', minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, padding: 0, color: 'var(--danger-text)', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                              >
                                <Trash2 size={15} />
                                הסר מרכיב
                              </button>
                            </div>
                          </Collapse>
                        </div>
                      );
                    })}
                  </div>
                )}

                {items.length > 0 && onSavedMealAction && (
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
                          שמור מנה זו גם ב&quot;הארוחות שלי&quot; לשימוש חוזר
                        </span>
                      }
                    />
                    {saveAsPreset && (
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
                    )}
                  </div>
                )}

              </div>
            )}
        </div>

        {activeTab === 'meal-items' && (
          <div
            style={{
              flexShrink: 0,
              background: heroScreen ? 'var(--card)' : 'var(--bg)',
              padding: '10px 16px calc(var(--sa-bottom) + 12px)',
              display: 'flex',
            }}
          >
            <button
              disabled={savingMeal}
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
                cursor: 'pointer',
              }}
            >
              {savingMeal ? <Loader2 size={16} className="spot-spinner" /> : <Check size={16} />}
              <span>{savingMeal ? 'שומר ארוחה...' : `שמור ארוחה (${currentTotals.calories} קק״ל)`}</span>
            </button>
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
                onClick={() => setActiveTab('meal-items')}
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
              disabled={savingMeal}
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
                cursor: 'pointer',
              }}
            >
              {savingMeal ? <Loader2 size={18} className="spot-spinner" /> : <Check size={18} />}
              <span>
                שמור · <bdi dir="ltr" className="ltr-num">{currentTotals.calories}</bdi> קק״ל
              </span>
            </button>
          </div>
        )}
      </Drawer>

      {/* פופ-אפ ממוקד לבחירת כמות/אריזה/מידה אישית עם החשכה מלאה מאחור וכפתור סגירה עצמאי */}
      <Modal
        opened={Boolean(selectedFood)}
        onClose={() => {
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

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 900, lineHeight: 1.3 }}>
                  {selectedFood.name}
                  {selectedFood.brand ? ` (${selectedFood.brand})` : ''}
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
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-orange-bright)', fontSize: 12 }}>
                      <Loader2 size={10} className="spot-spinner" />
                      <span>מושך מידות אריזה וברקוד...</span>
                    </span>
                  )}
                </div>
              </div>

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
                      min={1}
                      max={3000}
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
                      disabled={savingInlineUnit || !inlineUnitName.trim()}
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
                value={quantity}
                onChange={handleQuantityChange}
                min={0.25}
                max={20}
                step={0.5}
                disabled={selectedUnitLabel === 'custom-grams'}
              />
              <NumberInput
                size="sm"
                label="סה״כ גרמים"
                value={customGrams}
                onChange={(val) => setCustomGrams(Math.max(1, Number(val) || 100))}
                min={1}
                max={2000}
                step={5}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                addSelectedFoodToMeal('catalog');
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
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              <span>הוסף לארוחה</span>
            </button>
          </div>
        )}
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

      <BarcodeScannerModal
        opened={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        onProductFound={(product) => {
          void handleSelectCatalogFood(product, false);
          const defaultUnit = product.units[0] || {
            label: '100 גרם',
            grams: 100,
          };
          const macros = calculateMacrosForGrams(
            product.per100g,
            defaultUnit.grams
          );
          setItems((prev) => [
            ...prev,
            {
              id: `bc-${Date.now()}`,
              name: product.brand
                ? `${product.name} (${product.brand})`
                : product.name,
              unitLabel: defaultUnit.label,
              quantity: 1,
              grams: defaultUnit.grams,
              macros,
              source: 'barcode',
            },
          ]);
          setAiSummary({ msg: `נוסף מסורק ברקוד: ${product.name}` });
        }}
      />
    </>
  );
}
