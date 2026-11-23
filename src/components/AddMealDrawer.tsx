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
import { SavedMealsLibraryTab } from './SavedMealsLibraryTab';
import { AiQuickContextPanel } from './AiQuickContextPanel';
import { useAiProgressMessage } from './BackgroundAiSyncBanner';
import {
  startUnifiedVoiceCapture,
  VoiceCaptureController,
  VoiceCaptureState,
} from '@/lib/voiceRecorder';

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
  const [activeTab, setActiveTab] = useState<string>(initialTab);
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
        pushUnit(`🍽️ ${t.name} (${Math.round(g)} גרם)`, Math.round(g), true);
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

  return (
    <>
      <Drawer
        opened={opened}
        onClose={() => {
          if (!savingMeal) onClose();
        }}
        position="bottom"
        size="93%"
        zIndex={200}
        overlayProps={{ backgroundOpacity: 0.8, blur: 6 }}
        withCloseButton={false}
        styles={{
          content: {
            maxWidth: 560,
            margin: '0 auto',
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            maxHeight: '94dvh',
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
        {/* אזור עליון קבוע (אינו נגלל): כותרת נקייה + חיפוש אוניברסלי + בחירת מצלמה */}
        <div
          style={{
            padding: '12px 16px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            background: '#101218',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flexShrink: 0,
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <button
                type="button"
                aria-label="סגור"
                onClick={() => {
                  if (!savingMeal) onClose();
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface-2)',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={16} />
              </button>

              {(activeTab !== 'hub' || trimmedQuery.length > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    if (trimmedQuery) {
                      setSearchQuery('');
                      setActiveTab('hub');
                    } else {
                      setActiveTab('hub');
                    }
                  }}
                  style={{
                    padding: '5px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface-2)',
                    color: 'var(--text-secondary)',
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <ChevronRight size={13} />
                  <span>חזרה</span>
                </button>
              )}

              <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {mealSlot.name}
                </div>
                <label
                  title="שינוי שעת הארוחה"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: 'rgba(214, 125, 9, 0.14)',
                    border: '1px solid rgba(214, 125, 9, 0.38)',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Clock size={11} color="var(--accent-orange-bright)" />
                  <input
                    type="time"
                    value={mealTime || mealSlot.timeHint || '12:00'}
                    onChange={(e) => setMealTime(e.target.value)}
                    dir="ltr"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 800,
                      width: 58,
                      cursor: 'pointer',
                      fontFamily: "'Space Grotesk', 'Heebo', sans-serif",
                    }}
                  />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {dateInfo && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 9px',
                    borderRadius: 999,
                    background: 'var(--bg-surface-2)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <CalendarDays size={11} color="var(--accent-orange-bright)" />
                  <span>{dateInfo.dayTag}</span>
                  <span
                    dir="ltr"
                    className="num-mono"
                    style={{ color: 'var(--text-secondary)', fontSize: 10, fontWeight: 600 }}
                  >
                    {dateInfo.shortDate}
                  </span>
                </div>
              )}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 9px',
                  borderRadius: 999,
                  background: 'rgba(214, 125, 9, 0.14)',
                  border: '1px solid rgba(214, 125, 9, 0.35)',
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: 'var(--accent-orange-bright)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span>יעד</span>
                <span dir="ltr" className="num-mono">
                  {mealSlot.targets.calories}
                </span>
              </div>
            </div>
          </div>

          {/* סרגל חיפוש כולל + כפתור כוכבים (AI) ידני בלבד + מצלמה מהחיפוש */}
          {(activeTab === 'hub' || activeTab === 'catalog') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-surface-2)',
                  border: trimmedQuery
                    ? '1px solid rgba(214, 125, 9, 0.5)'
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
                      background: 'rgba(255,255,255,0.08)',
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
                        ? 'rgba(214, 125, 9, 0.22)'
                        : 'transparent',
                    color:
                      voiceState === 'listening'
                        ? '#f87171'
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
                      ? '1px solid rgba(168, 85, 247, 0.65)'
                      : '1px solid var(--border-subtle)',
                    background: trimmedQuery
                      ? 'linear-gradient(135deg, #9333ea 0%, #6d28d9 100%)'
                      : 'var(--bg-surface-3)',
                    color: trimmedQuery ? '#ffffff' : '#c084fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    boxShadow: trimmedQuery
                      ? '0 2px 10px rgba(147, 51, 234, 0.45)'
                      : 'none',
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
                    background: 'var(--accent-volt)',
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
                    border: '1px solid rgba(214, 125, 9, 0.35)',
                  }}
                >
                  <label
                    className="btn-surface"
                    style={{
                      padding: '8px 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                      borderColor: 'rgba(214, 125, 9, 0.4)',
                    }}
                  >
                    <Camera size={13} color="var(--accent-volt)" />
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
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <ImageIcon size={13} color="#38bdf8" />
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
                      fontSize: 11,
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
                    : 'rgba(214, 125, 9, 0.14)',
                border:
                  voiceState === 'listening'
                    ? '1px solid rgba(239, 68, 68, 0.42)'
                    : '1px solid rgba(214, 125, 9, 0.42)',
                color: voiceState === 'listening' ? '#fca5a5' : 'var(--accent-volt)',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                {voiceState === 'listening' ? (
                  <Mic size={14} color="#f87171" style={{ flexShrink: 0 }} />
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
                      fontSize: 11,
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
                    fontSize: 11,
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
            padding: '14px 16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {aiSummary && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                background: aiSummary.isError
                  ? 'rgba(239, 68, 68, 0.14)'
                  : aiSummary.isFallback
                  ? 'rgba(245, 158, 11, 0.14)'
                  : 'rgba(214, 125, 9, 0.1)',
                border: aiSummary.isError
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : aiSummary.isFallback
                  ? '1px solid rgba(245, 158, 11, 0.35)'
                  : '1px solid rgba(214, 125, 9, 0.3)',
                color: aiSummary.isError
                  ? '#f87171'
                  : aiSummary.isFallback
                  ? '#fbbf24'
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
                  <div style={{ marginTop: 4, fontSize: 10, opacity: 0.95 }}>
                    {aiSummary.isFallback
                      ? `⚠️ תג תחקור: לא AI פיענח (${aiSummary.engine})${
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

          {/* פאנל א׳: מסך פתיחה / בחירת דרך הוספה (2 עמודות בהשראת תמונות 4 ו-14) */}
          {activeTab === 'hub' && trimmedQuery.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                בחר דרך להוספת ארוחה או הקלד למעלה לחיפוש / AI:
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 10,
                }}
              >
                {[
                  {
                    id: 'ai-photo',
                    title: 'צילום AI',
                    subtitle: 'צלחת או תווית ערכים',
                    bg: 'linear-gradient(145deg, #d67d09 0%, #8a4f04 100%)',
                    icon: <Camera size={22} color="#ffffff" />,
                  },
                  {
                    id: 'ai-text',
                    title: 'טקסט / קול ל-AI',
                    subtitle: 'תיאור חופשי + תיבול',
                    bg: 'linear-gradient(145deg, #7c3aed 0%, #4c1d95 100%)',
                    icon: <Sparkles size={22} color="#ffffff" />,
                  },
                  {
                    id: 'saved-meals',
                    title: 'ארוחות שמורות',
                    subtitle: `${savedMeals.length} מנות בגלריה`,
                    bg: 'linear-gradient(145deg, #0284c7 0%, #1e3a8a 100%)',
                    icon: <Bookmark size={22} color="#ffffff" />,
                  },
                  {
                    id: 'ai-recommend',
                    title: 'מה לאכול?',
                    subtitle: 'המלצות AI + המאמן',
                    bg: 'linear-gradient(145deg, #059669 0%, #064e3b 100%)',
                    icon: <Lightbulb size={22} color="#ffffff" />,
                  },
                  {
                    id: 'barcode-action',
                    title: 'סריקת ברקוד',
                    subtitle: 'מוצרים ארוזים בסופר',
                    bg: 'linear-gradient(145deg, #d97706 0%, #78350f 100%)',
                    icon: <Barcode size={22} color="#ffffff" />,
                  },
                  {
                    id: 'favorites',
                    title: 'מועדפים ומאגר',
                    subtitle: `${favoriteIds.length} מועדפים · אלפי מוצרים`,
                    bg: 'linear-gradient(145deg, #e11d48 0%, #881337 100%)',
                    icon: <Heart size={22} color="#ffffff" />,
                  },
                ].map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      if (card.id === 'barcode-action') {
                        setBarcodeModalOpen(true);
                      } else {
                        setActiveTab(card.id);
                      }
                    }}
                    style={{
                      background: card.bg,
                      border: '1px solid rgba(255,255,255,0.16)',
                      borderRadius: 18,
                      padding: '14px 13px',
                      minHeight: 102,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      textAlign: 'right',
                      cursor: 'pointer',
                      boxShadow: '0 8px 22px -10px rgba(0,0,0,0.65)',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 11,
                        background: 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {card.icon}
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 900, color: '#ffffff' }}>
                        {card.title}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.85)',
                          marginTop: 2,
                        }}
                      >
                        {card.subtitle}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* פאנל ב׳: תוצאות חיפוש מאוחדות (ארוחות שמורות תואמות + מאגר מוצרים + כפתור ✨ ל-AI למעלה) */}
          {(activeTab === 'hub' || activeTab === 'catalog') && trimmedQuery.length > 0 && matchedSavedPresets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: '#38bdf8' }}>
                ארוחות שמורות תואמות ({matchedSavedPresets.length})
              </div>
              {matchedSavedPresets.map((preset) => (
                <div
                  key={preset.id}
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid rgba(56, 189, 248, 0.28)',
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
                    <div className="num-mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
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
                    style={{ padding: '6px 11px', fontSize: 11.5, cursor: 'pointer', flexShrink: 0 }}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* אופציות מומלצות של המאמן לארוחה זו */}
                {mealSlot.recommendedOptions && mealSlot.recommendedOptions.length > 0 && (
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: '1px solid rgba(214, 125, 9, 0.25)',
                      borderRadius: 14,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: 'var(--accent-volt)',
                        marginBottom: 8,
                      }}
                    >
                      ⭐ אופציות מומלצות של המאמן ל{mealSlot.name} (הוספה בקליק):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {mealSlot.recommendedOptions.map((optText, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 10px',
                            borderRadius: 10,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 600 }}>{optText}</span>
                          <button
                            disabled={aiLoading}
                            onClick={() => runAiAnalysis('text', optText, idx)}
                            className="btn-surface"
                            style={{
                              padding: '5px 10px',
                              fontSize: 11,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              color: 'var(--accent-volt)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            {addingOptionIdx === idx && (
                              <Loader2 size={12} className="spot-spinner" />
                            )}
                            <span>
                              {addingOptionIdx === idx ? 'מנתח ומוסיף...' : '+ בחר והוסף'}
                            </span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* כפתור Smart Macro Finisher */}
                <div
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 14,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginBottom: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800 }}>
                        🤖 השלמת מאקרו חכמה (Smart Macro Finisher)
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        יתרה להשלמה בארוחה זו:{' '}
                        <b className="num-mono" style={{ color: 'var(--accent-volt)' }}>
                          {Math.max(0, mealSlot.targets.calories - currentTotals.calories)} קק״ל · ח׳{' '}
                          {Math.max(0, Math.round(mealSlot.targets.protein - currentTotals.protein))}g
                        </b>
                      </div>
                    </div>

                    <button
                      disabled={aiRecLoading}
                      onClick={fetchAiRecommendations}
                      className="btn-volt"
                      style={{
                        padding: '8px 14px',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                    >
                      {aiRecLoading ? (
                        <Loader2 size={14} className="spot-spinner" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      <span>
                        {aiRecLoading ? 'בונה 3 הצעות מותאמות...' : 'הצע לי 3 ארוחות ליתרה'}
                      </span>
                    </button>
                  </div>

                  {/* הצגת העדפות שכבר נלמדו */}
                  {learnedPreferences.length > 0 && (
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        background: 'rgba(255,255,255,0.03)',
                        padding: '6px 10px',
                        borderRadius: 8,
                        marginBottom: 10,
                      }}
                    >
                      <span style={{ color: 'var(--accent-volt)', fontWeight: 700 }}>
                        🧠 העדפות שנלמדו בחשבון שלך:{' '}
                      </span>
                      {learnedPreferences.join(' · ')}
                    </div>
                  )}

                  {/* רשימת 3 ההצעות מה-AI */}
                  {aiRecommendations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                      {aiRecDebug?.engine && (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '5px 10px',
                            borderRadius: 8,
                            background: aiRecDebug.isFallback
                              ? 'rgba(245, 158, 11, 0.14)'
                              : 'rgba(214, 125, 9, 0.08)',
                            border: aiRecDebug.isFallback
                              ? '1px solid rgba(245, 158, 11, 0.35)'
                              : '1px solid rgba(214, 125, 9, 0.25)',
                            color: aiRecDebug.isFallback ? '#fbbf24' : 'var(--accent-volt)',
                          }}
                        >
                          {aiRecDebug.isFallback
                            ? `⚠️ נוצר ע״י מנוע כללים מקומי (לא AI · ${aiRecDebug.engine})${
                                aiRecDebug.fallbackReason
                                  ? ` · סיבה לתחקור: ${aiRecDebug.fallbackReason}`
                                  : ''
                              }`
                            : `✨ נוצר ע״י AI (${aiRecDebug.engine})`}
                        </div>
                      )}
                      {aiRecommendations.map((option) => (
                        <div
                          key={option.id}
                          style={{
                            padding: 12,
                            borderRadius: 12,
                            background: 'rgba(214, 125, 9, 0.05)',
                            border: '1px solid rgba(214, 125, 9, 0.25)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 800 }}>
                              {option.title}
                            </div>
                            <button
                              onClick={() => {
                                setItems((prev) => [...prev, ...option.items]);
                                setAiSummary({
                                  msg: `נוספה לארוחה ההצעה: "${option.title}"`,
                                });
                              }}
                              className="btn-volt"
                              style={{
                                padding: '5px 12px',
                                fontSize: 11,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              + הוסף ארוחה זו
                            </button>
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {option.whyItFits}
                          </div>
                          <div
                            className="num-mono"
                            style={{
                              fontSize: 11,
                              color: 'var(--accent-volt)',
                              fontWeight: 700,
                            }}
                          >
                            {option.totals.calories} קק״ל · חלבון {option.totals.protein}g · פחמימה{' '}
                            {option.totals.carbs}g · שומן {option.totals.fat}g
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* תיבת פידבק ללמידה שקטה ללא צ'אט */}
                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 800,
                        marginBottom: 4,
                      }}
                    >
                      <Brain size={14} color="var(--accent-volt)" />
                      <span>משהו בהצעות לא מתאים לך?</span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        marginBottom: 8,
                      }}
                    >
                      רשום העדפה או הגבלה (למשל: &quot;אני לא אוכל גבינות חוץ מגבינה צהובה&quot; או &quot;אני לא אוכל גלוטן&quot;) כדי שנזכור אותה בהצעות הבאות.
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <TextInput
                        style={{ flex: 1 }}
                        size="xs"
                        placeholder="למשל: אני לא אוכל גבינות חוץ מגבינה צהובה..."
                        value={preferenceFeedbackText}
                        onChange={(e) => setPreferenceFeedbackText(e.currentTarget.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && preferenceFeedbackText.trim() && !learningPrefLoading) {
                            e.preventDefault();
                            handleLearnPreference();
                          }
                        }}
                      />
                      <button
                        disabled={learningPrefLoading || !preferenceFeedbackText.trim()}
                        onClick={handleLearnPreference}
                        className="btn-surface"
                        style={{
                          padding: '0 12px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          color: 'var(--accent-volt)',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        {learningPrefLoading && (
                          <Loader2 size={12} className="spot-spinner" />
                        )}
                        <span>
                          {learningPrefLoading ? 'לומד ושומר...' : 'שמור העדפה לעתיד'}
                        </span>
                      </button>
                    </div>
                    {learnedFeedbackBanner && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '7px 10px',
                          borderRadius: 8,
                          background: learnedFeedbackBanner.isError
                            ? 'rgba(239, 68, 68, 0.14)'
                            : 'rgba(34, 197, 94, 0.12)',
                          border: learnedFeedbackBanner.isError
                            ? '1px solid rgba(239, 68, 68, 0.35)'
                            : '1px solid rgba(34, 197, 94, 0.35)',
                          color: learnedFeedbackBanner.isError
                            ? '#f87171'
                            : '#4ade80',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        <div>
                          {learnedFeedbackBanner.isError
                            ? learnedFeedbackBanner.msg
                            : `✓ ${learnedFeedbackBanner.msg}`}
                        </div>
                        {!learnedFeedbackBanner.isError && learnedFeedbackBanner.engine && (
                          <div
                            style={{
                              marginTop: 4,
                              fontSize: 10,
                              color: learnedFeedbackBanner.isFallback
                                ? '#fbbf24'
                                : 'var(--text-secondary)',
                            }}
                          >
                            {learnedFeedbackBanner.isFallback
                              ? `⚠️ נשמר ע״י מנגנון מקומי (לא AI · ${learnedFeedbackBanner.engine})${
                                  learnedFeedbackBanner.fallbackReason
                                    ? ` · סיבה: ${learnedFeedbackBanner.fallbackReason}`
                                    : ''
                                }`
                              : `✨ נותח ע״י AI (${learnedFeedbackBanner.engine})`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
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
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-secondary)' }}>
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
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    <Barcode size={13} color="var(--accent-volt)" />
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
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 999,
                          cursor: 'pointer',
                          border: active
                            ? '1px solid var(--accent-volt)'
                            : '1px solid var(--border-subtle)',
                          background: active
                            ? 'rgba(214, 125, 9, 0.16)'
                            : 'var(--bg-surface-2)',
                          color: active
                            ? 'var(--accent-orange-bright)'
                            : 'var(--text-secondary)',
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
                    fontSize: 10.5,
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
                      borderRadius: 12,
                      background: 'var(--bg-surface-2)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
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
                            borderRadius: 12,
                            cursor: 'pointer',
                            border: isSelected
                              ? '1px solid var(--accent-volt)'
                              : '1px solid var(--border-subtle)',
                            background: isSelected
                              ? 'rgba(214, 125, 9, 0.1)'
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
                                fontSize: 11,
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {food.per100g.calories} קק״ל · ח:{food.per100g.protein} פ:{food.per100g.carbs} ש:{food.per100g.fat}
                            </div>
                            {(food.sourceSiteName || food.barcode) && (
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 10,
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
                                      background: 'rgba(255,255,255,0.06)',
                                      color: 'var(--text-secondary)',
                                      fontSize: 9.5,
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {items.length > 0 && photoItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('meal-items')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: 12,
                      background: 'rgba(214, 125, 9, 0.14)',
                      border: '1px solid rgba(214, 125, 9, 0.42)',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    <span>
                      ✨ זוהו {items.length} מרכיבים מצילום זה ({currentTotals.calories} קק״ל)
                    </span>
                    <span style={{ color: 'var(--accent-orange-bright)' }}>
                      צפה וערוך מרכיבים ←
                    </span>
                  </button>
                )}

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    background: 'var(--bg-surface-2)',
                    padding: 4,
                    borderRadius: 12,
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <button
                    onClick={() => setPhotoMode('plate')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px',
                      borderRadius: 8,
                      border: 'none',
                      background:
                        photoMode === 'plate' ? 'var(--accent-volt)' : 'transparent',
                      color:
                        photoMode === 'plate' ? '#ffffff' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <Camera size={14} />
                    <span>צילום ארוחה / צלחת</span>
                  </button>
                  <button
                    onClick={() => setPhotoMode('nutrition-label')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      padding: '8px',
                      borderRadius: 8,
                      border: 'none',
                      background:
                        photoMode === 'nutrition-label'
                          ? 'var(--accent-volt)'
                          : 'transparent',
                      color:
                        photoMode === 'nutrition-label'
                          ? '#ffffff'
                          : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <FileText size={14} />
                    <span>טבלת ערכים תזונתיים מאריזה</span>
                  </button>
                </div>

                <div
                  style={{
                    background: 'var(--bg-surface-2)',
                    border: '1px dashed rgba(214, 125, 9, 0.35)',
                    borderRadius: 16,
                    padding: 16,
                    textAlign: 'center',
                  }}
                >
                  {photoItems.length > 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        {photoItems.map((im, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: 'relative',
                              width: photoItems.length === 1 ? 168 : 102,
                              height: photoItems.length === 1 ? 140 : 102,
                              borderRadius: 12,
                              overflow: 'hidden',
                              border: '1px solid rgba(214, 125, 9, 0.35)',
                            }}
                          >
                            <img
                              src={im.dataUrl}
                              alt={`צילום ארוחה ${idx + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <button
                              type="button"
                              title="הסר תמונה"
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
                                top: 4,
                                right: 4,
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                background: 'rgba(0,0,0,0.75)',
                                border: 'none',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                              }}
                            >
                              <X size={12} />
                            </button>
                            <button
                              type="button"
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
                                bottom: 3,
                                left: 3,
                                right: 3,
                                fontSize: 9,
                                fontWeight: 700,
                                borderRadius: 5,
                                border: 'none',
                                background: 'rgba(0,0,0,0.78)',
                                color: 'var(--accent-volt)',
                                padding: '2px 4px',
                                cursor: 'pointer',
                              }}
                            >
                              {im.angle === 'top-down'
                                ? 'מלמעלה 90°'
                                : im.angle === 'side-45'
                                ? 'מהצד ~45°'
                                : 'תווית / אחר'}{' '}
                              · {im.sizeKB}KB
                            </button>
                          </div>
                        ))}
                      </div>
                      {photoSizeKB && (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'var(--accent-volt)',
                            fontWeight: 700,
                          }}
                        >
                          {photoItems.length}/3 תמונות נבחרו ({photoFormatLabel} דחוס מהיר)
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 10,
                      }}
                    >
                      {photoMode === 'nutrition-label' ? (
                        <FileText size={32} color="var(--accent-volt)" />
                      ) : (
                        <Camera size={32} color="var(--accent-volt)" />
                      )}
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        {photoMode === 'nutrition-label'
                          ? 'צילום טבלת ערכים תזונתיים מאריזת מוצר'
                          : 'העלאה או צילום ארוחה לפענוח AI (עד 3 תמונות)'}
                      </div>
                      <div
                        style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 360 }}
                      >
                        {photoMode === 'nutrition-label'
                          ? 'ה-AI יקרא את הטבלה שעל האריזה (ל-100 גרם או למנה) ויוסיף לארוחה'
                          : '💡 לדיוק מרבי בקלוריות ובנפח: צלם או העלה 2 תמונות — אחת מלמעלה (90°) ואחת מהצד (~45°), עם שולי הצלחת בפריים'}
                      </div>
                    </div>
                  )}

                  {photoItems.length < 3 && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        marginTop: 10,
                      }}
                    >
                      <label
                        className="btn-surface"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          fontSize: 12,
                          cursor: photoUploading ? 'wait' : 'pointer',
                          opacity: photoUploading ? 0.65 : 1,
                          borderColor: 'rgba(56, 189, 248, 0.35)',
                        }}
                      >
                        <ImageIcon size={14} color="#38bdf8" />
                        <span>
                          {photoUploading
                            ? 'מכווץ ומעבד...'
                            : photoItems.length > 0
                            ? 'הוסף תמונה מהגלריה'
                            : 'בחר מהגלריה / קובץ'}
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

                      <label
                        className="btn-surface"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '8px 14px',
                          fontSize: 12,
                          cursor: photoUploading ? 'wait' : 'pointer',
                          opacity: photoUploading ? 0.65 : 1,
                          borderColor: 'rgba(214, 125, 9, 0.35)',
                        }}
                      >
                        <Camera size={14} color="var(--accent-volt)" />
                        <span>
                          {photoItems.length === 0 ? 'צלם עכשיו במצלמה' : 'צלם זווית נוספת'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          hidden
                          disabled={photoUploading}
                          onChange={(e) =>
                            handlePhotoUpload(
                              e,
                              photoItems.length === 0 ? 'top-down' : 'side-45'
                            )
                          }
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

                <Textarea
                  label={
                    photoMode === 'nutrition-label'
                      ? 'שם המוצר וכמות שאכלת (למשל: חטיף חלבון - יחידה אחת 60 גרם)'
                      : 'הקשר נוסף לצילום עבור ה-AI (אופציונלי)'
                  }
                  placeholder={
                    photoMode === 'nutrition-label'
                      ? 'למשל: חטיף חלבון 60 גרם...'
                      : 'למשל: 180 גרם פסטה מבושלת, ללא תוספת שמן...'
                  }
                  value={photoNote}
                  onChange={(e) => setPhotoNote(e.currentTarget.value)}
                  minRows={2}
                />

                <button
                  disabled={
                    isSlotBgProcessing ||
                    aiLoading ||
                    photoUploading ||
                    (photoItems.length === 0 && !photoDataUrl && !photoNote.trim())
                  }
                  onClick={() => runAiAnalysis('photo')}
                  className="btn-volt"
                  style={{
                    padding: '12px',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  {isSlotBgProcessing || aiLoading ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Wand2 size={16} />
                  )}
                  <span>
                    {isSlotBgProcessing || aiLoading
                      ? progressTicker.currentStepText
                      : photoMode === 'nutrition-label'
                      ? 'חלץ ערכים תזונתיים מהאריזה (AI)'
                      : photoItems.length > 1
                      ? `פענח ${photoItems.length} תמונות ברקע (AI)`
                      : 'פענח תמונה באמצעות AI'}
                  </span>
                </button>
              </div>
            )}

            {/* לשונית 3: טקסט חופשי + הקלטה קולית ל-AI */}
            {activeTab === 'ai-text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>
                    תאר בטקסט או בהקלטה קולית מה אכלת:
                  </span>
                  <button
                    type="button"
                    disabled={voiceState === 'transcribing'}
                    onClick={() => toggleVoiceRecording('ai-text')}
                    className={voiceState !== 'idle' ? 'btn-volt' : 'btn-surface'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 13px',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: voiceState === 'transcribing' ? 'wait' : 'pointer',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {voiceState === 'listening' ? (
                      <>
                        <MicOff size={14} />
                        <span>מקליט בעברית... לחץ לסיום ותמלול</span>
                      </>
                    ) : voiceState === 'transcribing' ? (
                      <>
                        <Loader2 size={14} className="spot-spinner" />
                        <span>מתמלל הקלטה ב-AI...</span>
                      </>
                    ) : (
                      <>
                        <Mic size={14} color="var(--accent-volt)" />
                        <span>🎙️ הקלט ארוחה בקול</span>
                      </>
                    )}
                  </button>
                </div>

                <Textarea
                  ref={aiTextRef}
                  placeholder="למשל: אכלתי 2 ביצים מקושקשות, חצי גביע קוטג' 5%, 2 פרוסות לחם כוסמין וקרמבו אחד"
                  value={freeTextPrompt}
                  onChange={(e) => setFreeTextPrompt(e.currentTarget.value)}
                  minRows={3}
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    "2 ביצים, חצי קוטג' 5%, 2 פרוסות לחם כוסמין וקרמבו",
                    '200 גרם חזה עוף, כוס אורז וכף טחינה גולמית',
                    'יוגורט דנונה פרו ו-2 קרמבו',
                  ].map((sample) => (
                    <button
                      key={sample}
                      onClick={() => setFreeTextPrompt(sample)}
                      className="btn-surface"
                      style={{
                        padding: '5px 10px',
                        fontSize: 11,
                        cursor: 'pointer',
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

                <button
                  disabled={isSlotBgProcessing || aiLoading || !freeTextPrompt.trim()}
                  onClick={() => runAiAnalysis('text')}
                  className="btn-volt"
                  style={{
                    padding: '12px',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    cursor: 'pointer',
                  }}
                >
                  {isSlotBgProcessing || aiLoading ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>
                    {isSlotBgProcessing || aiLoading
                      ? progressTicker.currentStepText
                      : 'פרק משפט לקלוריות ומאקרו'}
                  </span>
                </button>
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
                                fontSize: 11,
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
                              fontSize: 11,
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
                  background: 'rgba(214, 125, 9, 0.08)',
                  border: '1px solid rgba(214, 125, 9, 0.35)',
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
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(214, 125, 9, 0.14)',
                      color: 'var(--accent-volt)',
                    }}
                  >
                    {progressTicker.formattedElapsed}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  ניתוח AI מתקדם עשוי לקחת 1–3 דקות. <b>אפשר לצאת מהחלונית או אפילו לסגור בינתיים</b> — הפענוח ממשיך ברקע והפריטים יסתנכרנו אוטומטית ליומן הארוחות שלך.
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-surface"
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    borderColor: 'rgba(214, 125, 9, 0.35)',
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
                  color: '#f87171',
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
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 900 }}>
                    מרכיבי הארוחה הנוכחית ({items.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('hub')}
                    className="btn-surface"
                    style={{
                      padding: '5px 11px',
                      borderRadius: 999,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + הוסף עוד פריטים
                  </button>
                </div>

                {allMealPhotos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                    {allMealPhotos.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`תמונת ארוחה ${i + 1}`}
                        onClick={() => setActiveTab('ai-photo')}
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 12,
                          objectFit: 'cover',
                          border: '1px solid rgba(214, 125, 9, 0.45)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}

                {items.length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      textAlign: 'center',
                      borderRadius: 14,
                      background: 'var(--bg-surface-2)',
                      color: 'var(--text-muted)',
                      fontSize: 12,
                    }}
                  >
                    טרם נוספו פריטים לארוחה זו.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((item) => {
                      const isEditing = editingItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={{
                            background: 'var(--bg-surface-2)',
                            border: isEditing
                              ? '1px solid rgba(214, 125, 9, 0.45)'
                              : '1px solid var(--border-subtle)',
                            borderRadius: 14,
                            padding: '10px 12px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 8,
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 700 }}>
                                  {item.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: '1px 7px',
                                    borderRadius: 999,
                                    background: 'rgba(255,255,255,0.06)',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  {item.unitLabel}
                                </span>
                                {(item.isAiFallback || item.aiEngine) && (
                                  <span
                                    title={
                                      item.fallbackReason
                                        ? `סיבת גיבוי: ${item.fallbackReason}`
                                        : item.aiEngine
                                    }
                                    style={{
                                      fontSize: 9,
                                      padding: '1px 6px',
                                      borderRadius: 999,
                                      fontWeight: 800,
                                      background: item.isAiFallback
                                        ? 'rgba(245, 158, 11, 0.16)'
                                        : 'rgba(214, 125, 9, 0.14)',
                                      border: item.isAiFallback
                                        ? '1px solid rgba(245, 158, 11, 0.38)'
                                        : '1px solid rgba(214, 125, 9, 0.32)',
                                      color: item.isAiFallback
                                        ? '#fbbf24'
                                        : 'var(--accent-orange-bright)',
                                    }}
                                  >
                                    {item.isAiFallback
                                      ? `לא AI · ${item.aiEngine || 'Fallback'}`
                                      : `AI · ${item.aiEngine}`}
                                  </span>
                                )}
                              </div>
                              <div
                                className="num-mono"
                                style={{
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  marginTop: 2,
                                }}
                              >
                                <b style={{ color: 'var(--text-primary)' }}>
                                  {item.macros.calories} קק״ל
                                </b>{' '}
                                · ח׳ {item.macros.protein}g · פ׳ {item.macros.carbs}
                                g · ש׳ {item.macros.fat}g
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button
                                onClick={() =>
                                  setEditingItemId(isEditing ? null : item.id)
                                }
                                className="btn-surface"
                                style={{
                                  width: 30,
                                  height: 30,
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <Edit3
                                  size={13}
                                  color={
                                    isEditing
                                      ? 'var(--accent-volt)'
                                      : 'var(--text-secondary)'
                                  }
                                />
                              </button>
                              <button
                                onClick={() => removeItem(item.id)}
                                className="btn-surface"
                                style={{
                                  width: 30,
                                  height: 30,
                                  padding: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={13} color="#ef4444" />
                              </button>
                            </div>
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
                      borderRadius: 14,
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
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
                          📌 שמור מנה זו גם ב&quot;הארוחות שלי&quot; לשימוש חוזר
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

                <button
                  disabled={savingMeal}
                  onClick={() => void handleSaveMealAndClose()}
                  className="btn-volt"
                  style={{
                    padding: '12px 18px',
                    fontSize: 13.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  {savingMeal ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Check size={16} />
                  )}
                  <span>
                    {savingMeal
                      ? 'שומר ארוחה...'
                      : `שמור ארוחה (${currentTotals.calories} קק״ל)`}
                  </span>
                </button>
              </div>
            )}
        </div>

        {/* אזור תחתון קבוע תמיד (Persistent Current Meal Summary Card + שמירה מהירה) */}
        {activeTab !== 'meal-items' && (
          <div
            style={{
              flexShrink: 0,
              background: '#0d0f15',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px))',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setActiveTab('meal-items')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('meal-items');
                }
              }}
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '7px 10px',
                borderRadius: 14,
                background: 'var(--bg-surface-2)',
                border:
                  items.length > 0
                    ? '1px solid rgba(214, 125, 9, 0.42)'
                    : '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              {mealThumbnailUrl ? (
                <img
                  src={mealThumbnailUrl}
                  alt={mealSlot.name}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    objectFit: 'cover',
                    flexShrink: 0,
                    border: '1px solid rgba(255,255,255,0.16)',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(214, 125, 9, 0.14)',
                    border: '1px solid rgba(214, 125, 9, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Utensils size={16} color="var(--accent-orange-bright)" />
                </div>
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: '#ffffff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    בארוחה: {items.length} מרכיבים
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--accent-orange-bright)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    לעריכה ופירוט ⌄
                  </span>
                </div>
                <div
                  className="num-mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: 2,
                  }}
                >
                  <span dir="ltr">
                    <b style={{ color: '#ffffff' }}>{currentTotals.calories}</b> / {mealSlot.targets.calories}
                  </span>{' '}
                  קק״ל · ח׳ {currentTotals.protein} · פ׳ {currentTotals.carbs} · ש׳ {currentTotals.fat}
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={savingMeal}
              onClick={() => void handleSaveMealAndClose()}
              className="btn-volt"
              style={{
                padding: '11px 16px',
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {savingMeal ? (
                <Loader2 size={14} className="spot-spinner" />
              ) : (
                <Check size={14} />
              )}
              <span>שמור</span>
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
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
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
                        background: 'rgba(214, 125, 9, 0.14)',
                        border: '1px solid rgba(214, 125, 9, 0.32)',
                        color: 'var(--accent-orange-bright)',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      <Barcode size={10} />
                      {selectedFood.barcode}
                    </span>
                  )}
                  {enrichingFood && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent-orange-bright)', fontSize: 10 }}>
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
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>
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
                      fontSize: 11,
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
                        border: active
                          ? '1px solid var(--accent-volt)'
                          : uOpt.isUser
                          ? '1px solid rgba(56, 189, 248, 0.38)'
                          : '1px solid var(--border-subtle)',
                        background: active
                          ? 'rgba(214, 125, 9, 0.18)'
                          : uOpt.isUser
                          ? 'rgba(56, 189, 248, 0.1)'
                          : 'var(--bg-surface-2)',
                        color: active ? '#ffffff' : uOpt.isUser ? '#7dd3fc' : 'var(--text-secondary)',
                        fontSize: 11.5,
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
                      border: '1px dashed rgba(214, 125, 9, 0.55)',
                      background: inlineUnitOpen ? 'rgba(214, 125, 9, 0.16)' : 'transparent',
                      color: 'var(--accent-orange-bright)',
                      fontSize: 11.5,
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
                    border: '1px solid rgba(214, 125, 9, 0.35)',
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
                      label={<span style={{ fontSize: 11 }}>שייך למוצר זה</span>}
                    />
                    <button
                      type="button"
                      disabled={savingInlineUnit || !inlineUnitName.trim()}
                      onClick={() => void handleSaveInlineCustomUnit()}
                      className="btn-volt"
                      style={{
                        padding: '6px 12px',
                        fontSize: 11.5,
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
