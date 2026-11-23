'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Drawer,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  ScrollArea,
  Collapse,
  Switch,
} from '@mantine/core';
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
  Upload,
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
  sumMacros,
} from '@/data/israeliFoodCatalog';
import { compressMealImage } from '@/utils/imageCompression';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ServingToolsManagerModal } from './ServingToolsManagerModal';
import { SavedMealsLibraryTab } from './SavedMealsLibraryTab';
import { AiQuickContextPanel } from './AiQuickContextPanel';
import { useAiProgressMessage } from './BackgroundAiSyncBanner';

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
    photoNote?: string
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
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
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

  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem | null>(
    ISRAELI_FOOD_CATALOG[0]
  );
  const [selectedUnitLabel, setSelectedUnitLabel] = useState<string>(
    ISRAELI_FOOD_CATALOG[0].units[0].label
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [customGrams, setCustomGrams] = useState<number>(
    ISRAELI_FOOD_CATALOG[0].units[0].grams
  );

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [savingMeal, setSavingMeal] = useState(false);
  const [addingOptionIdx, setAddingOptionIdx] = useState<number | null>(null);

  const recognitionRef = useRef<{ stop?: () => void } | null>(null);
  const aiLockRef = useRef(false);
  const recLockRef = useRef(false);
  const prefLockRef = useRef(false);
  const saveLockRef = useRef(false);

  const stopVoiceRecording = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    setIsRecordingVoice(false);
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
      if (lastOpenedKeyRef.current !== openKey) {
        lastOpenedKeyRef.current = openKey;
        setItems(existingEntry?.items ? [...existingEntry.items] : []);
        setPhotoDataUrl(existingEntry?.photoDataUrl);
        setPhotoItems(
          existingEntry?.photoDataUrl && !existingEntry.photoDataUrl.endsWith(',DEMO')
            ? [
                {
                  dataUrl: existingEntry.photoDataUrl,
                  sizeKB: Math.round((existingEntry.photoDataUrl.length * 3) / 4 / 1024),
                  formatLabel: 'WebP',
                  angle: 'top-down',
                },
              ]
            : []
        );
        setPhotoSizeKB(null);
        setPhotoFormatLabel('WebP');
        setPhotoNote(existingEntry?.photoNote || '');
        setFreeTextPrompt('');
        setContextParams({ customUnits: customFoodUnits });
        setSaveAsPreset(false);
        setPresetTitleInput('');
        setSearchQuery('');
        setAiRecommendations([]);
        setAiRecDebug(null);
        setLearnedFeedbackBanner(null);
        setPreferenceFeedbackText('');
        setEditingItemId(null);
        setAiSummary(null);
        setActiveTab(initialTab);
        stopVoiceRecording();
      } else if (existingEntry?.items && existingEntry.items.length > 0) {
        // מיזוג אוטומטי כשמשימת AI ברקע מסתיימת בזמן שהחלונית נשארה פתוחה
        setItems((prev) => {
          const existingIds = new Set(prev.map((p) => p.id));
          const incomingNew = existingEntry.items.filter((i) => !existingIds.has(i.id));
          return incomingNew.length > 0 ? [...prev, ...incomingNew] : prev;
        });
      }
    } else if (!opened) {
      lastOpenedKeyRef.current = '';
      stopVoiceRecording();
    }
    return () => {
      stopVoiceRecording();
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

  const handleSelectCatalogFood = (food: FoodCatalogItem) => {
    setSelectedFood(food);
    const firstUnit = food.units[0] || { label: '100 גרם', grams: 100 };
    setSelectedUnitLabel(firstUnit.label);
    setQuantity(1);
    setCustomGrams(firstUnit.grams);
  };

  const getCombinedUnitsForFood = (food: FoodCatalogItem) => {
    const personal = customFoodUnits.map((u) => ({
      label: `★ ${u.unitName} (${u.grams} גרם)`,
      grams: u.grams,
    }));
    return [...food.units, ...personal];
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
        const angle =
          photoMode === 'nutrition-label'
            ? 'label'
            : preferredAngle || (photoItems.length + i === 0 ? 'top-down' : 'side-45');
        newEntries.push({
          dataUrl: compressed.dataUrl,
          sizeKB: compressed.sizeKB,
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

  const toggleVoiceRecording = () => {
    if (typeof window === 'undefined') return;
    if (isRecordingVoice) {
      stopVoiceRecording();
      return;
    }

    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void } }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; interimResults: boolean; onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void } }).webkitSpeechRecognition;

    if (!SpeechRec) {
      setAiSummary({
        msg: 'הדפדפן שלך אינו תומך בהקלטה קולית (נסה Chrome או Safari)',
        isError: true,
      });
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'he-IL';
      recognition.interimResults = false;
      recognitionRef.current = recognition;
      setIsRecordingVoice(true);
      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setFreeTextPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setIsRecordingVoice(false);
      };
      recognition.onerror = () => {
        recognitionRef.current = null;
        setIsRecordingVoice(false);
      };
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsRecordingVoice(false);
    }
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

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  if (!mealSlot) return null;

  const currentTotals = sumMacros(items.map((i) => i.macros));
  const previewMacros = selectedFood
    ? calculateMacrosForGrams(selectedFood.per100g, customGrams)
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <>
      <Drawer
        opened={opened}
        onClose={() => {
          if (!savingMeal) onClose();
        }}
        position="bottom"
        size="92%"
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontWeight: 800, fontSize: 17 }}>
              {mealSlot.name}
            </span>
            <span
              className="num-mono"
              style={{
                fontSize: 12,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--bg-surface-2)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              יעד: {mealSlot.targets.calories} קק״ל · ח׳{' '}
              {mealSlot.targets.protein}g · פ׳ {mealSlot.targets.carbs}g · ש׳{' '}
              {mealSlot.targets.fat}g
            </span>
          </div>
        }
        styles={{
          content: {
            maxWidth: 560,
            margin: '0 auto',
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
          },
        }}
      >
        <ScrollArea h="calc(90dvh - 125px)" offsetScrollbars>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              paddingBottom: 24,
            }}
          >
            {/* סרגל לשוניות מותאם אישית */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
                gap: 4,
                background: 'var(--bg-surface-2)',
                padding: 4,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              {[
                { id: 'catalog', label: 'מאגר מזון', icon: Search },
                { id: 'ai-recommend', label: '💡 מה לאכול?', icon: Lightbulb },
                { id: 'ai-photo', label: 'צילום AI', icon: Camera },
                { id: 'ai-text', label: 'טקסט / קול', icon: Sparkles },
                { id: 'saved-meals', label: 'הארוחות שלי', icon: Bookmark },
                { id: 'favorites', label: 'מועדפים', icon: Heart },
              ].map((t) => {
                const Icon = t.icon;
                const active = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      padding: '9px 4px',
                      borderRadius: 10,
                      border: 'none',
                      background: active ? 'var(--accent-volt)' : 'transparent',
                      color: active ? '#08090c' : 'var(--text-secondary)',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon size={13} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'saved-meals' && (
              <SavedMealsLibraryTab
                savedMeals={savedMeals}
                traineeLogs={traineeLogs}
                geminiApiKey={geminiApiKey}
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
                onOpenToolsModal={() => setToolsModalOpen(true)}
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
                      border: '1px solid rgba(210, 255, 40, 0.25)',
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
                              : 'rgba(210, 255, 40, 0.08)',
                            border: aiRecDebug.isFallback
                              ? '1px solid rgba(245, 158, 11, 0.35)'
                              : '1px solid rgba(210, 255, 40, 0.25)',
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
                            background: 'rgba(210, 255, 40, 0.05)',
                            border: '1px solid rgba(210, 255, 40, 0.25)',
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

            {/* לשונית 1: מאגר מוצרים + משרד הבריאות + ברקוד */}
            {activeTab === 'catalog' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextInput
                    style={{ flex: 1 }}
                    placeholder="חפש מוצר (קרמבו, קוטג׳, חזה עוף, במבה, אורז...)"
                    leftSection={<Search size={15} />}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.currentTarget.value)}
                  />
                  <button
                    onClick={() => setBarcodeModalOpen(true)}
                    className="btn-surface"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0 14px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <Barcode size={16} color="var(--accent-volt)" />
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
                            ? 'rgba(210, 255, 40, 0.14)'
                            : 'var(--bg-surface-2)',
                          color: active
                            ? 'var(--accent-volt)'
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
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    {searchLoading
                      ? 'מחפש במאגר המשולב (סופרים ישראליים, חנויות טבע + משרד הבריאות)...'
                      : `${searchResults.length} תוצאות מתוך ${totalAvailable.toLocaleString('he-IL')}+ פריטים במאגר ${
                          mohCount > 0 || scraperCount > 0
                            ? `(משרד הבריאות: ${mohCount}, אתרים ישראלים: ${scraperCount})`
                            : ''
                        }`}
                  </span>
                  <span>ערכים ל-100 גרם / יחידת מידה</span>
                </div>

                <ScrollArea.Autosize mah={210} type="always">
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
                      לא נמצאו מוצרים המתאימים ל־&ldquo;{searchQuery}&rdquo;. נסה מילה אחרת, סריקת ברקוד או ניתוח AI.
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
                          onClick={() => handleSelectCatalogFood(food)}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 12,
                            cursor: 'pointer',
                            border: isSelected
                              ? '1px solid var(--accent-volt)'
                              : '1px solid var(--border-subtle)',
                            background: isSelected
                              ? 'rgba(210, 255, 40, 0.08)'
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
                            {food.sourceSiteName && (
                              <div
                                style={{
                                  marginTop: 2,
                                  fontSize: 10,
                                  color: food.sourceSiteId ? 'var(--accent-volt)' : 'var(--text-muted)',
                                  opacity: food.sourceSiteId ? 0.9 : 0.8,
                                }}
                              >
                                {food.brand && food.brand !== food.sourceSiteName
                                  ? `${food.brand} · ${food.sourceSiteName}`
                                  : food.sourceSiteName}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(food.id);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: isFav
                                ? 'var(--macro-protein)'
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
                </ScrollArea.Autosize>

                {selectedFood && (
                  <div
                    style={{
                      background: 'var(--bg-surface-2)',
                      border: '1px solid rgba(210, 255, 40, 0.25)',
                      borderRadius: 16,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 14 }}>
                        {selectedFood.name}{' '}
                        {selectedFood.brand ? `(${selectedFood.brand})` : ''}
                      </div>
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 15,
                          fontWeight: 800,
                          color: 'var(--accent-volt)',
                        }}
                      >
                        {previewMacros.calories} קק״ל
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.4fr 0.8fr 0.8fr',
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <Select
                        size="xs"
                        label="יחידת מידה"
                        value={selectedUnitLabel}
                        onChange={handleUnitChange}
                        data={[
                          ...getCombinedUnitsForFood(selectedFood).map((u) => ({
                            value: u.label,
                            label: u.label,
                          })),
                          { value: 'custom-grams', label: 'משקל חופשי (גרם)' },
                        ]}
                      />
                      <NumberInput
                        size="xs"
                        label="כמות"
                        value={quantity}
                        onChange={handleQuantityChange}
                        min={0.25}
                        max={20}
                        step={0.5}
                        disabled={selectedUnitLabel === 'custom-grams'}
                      />
                      <NumberInput
                        size="xs"
                        label="סה״כ גרמים"
                        value={customGrams}
                        onChange={(val) =>
                          setCustomGrams(Math.max(1, Number(val) || 100))
                        }
                        min={1}
                        max={2000}
                        step={5}
                      />
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div
                        className="num-mono"
                        style={{
                          display: 'flex',
                          gap: 12,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <span style={{ color: 'var(--macro-protein)' }}>
                          חלבון: {previewMacros.protein}g
                        </span>
                        <span style={{ color: 'var(--macro-carbs)' }}>
                          פחמימה: {previewMacros.carbs}g
                        </span>
                        <span style={{ color: 'var(--macro-fat)' }}>
                          שומן: {previewMacros.fat}g
                        </span>
                      </div>

                      <button
                        onClick={() => addSelectedFoodToMeal('catalog')}
                        className="btn-volt"
                        style={{
                          padding: '8px 16px',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={14} />
                        <span>הוסף לארוחה</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* לשונית 2: צילום ארוחה / טבלת ערכים תזונתיים + פענוח AI */}
            {activeTab === 'ai-photo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        photoMode === 'plate' ? '#08090c' : 'var(--text-secondary)',
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
                          ? '#08090c'
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
                    border: '1px dashed rgba(210, 255, 40, 0.35)',
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
                              border: '1px solid rgba(210, 255, 40, 0.35)',
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
                          borderColor: 'rgba(210, 255, 40, 0.35)',
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
                  onOpenToolsModal={() => setToolsModalOpen(true)}
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
                    onClick={toggleVoiceRecording}
                    className={isRecordingVoice ? 'btn-volt' : 'btn-surface'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {isRecordingVoice ? (
                      <>
                        <MicOff size={14} />
                        <span>מקליט בעברית... לחץ לעצירה</span>
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
                  onOpenToolsModal={() => setToolsModalOpen(true)}
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
                    טרם סימנת מאכלים מועדפים. לחץ על אייקון הלב ❤️ ליד כל מוצר בלשונית &ldquo;מאגר מזון&rdquo; כדי לשמור אותו כאן לגישה מהירה.
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
                  background: 'rgba(210, 255, 40, 0.08)',
                  border: '1px solid rgba(210, 255, 40, 0.35)',
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
                      background: 'rgba(210, 255, 40, 0.14)',
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
                    borderColor: 'rgba(210, 255, 40, 0.35)',
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

            {aiSummary && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: aiSummary.isError
                    ? 'rgba(239, 68, 68, 0.14)'
                    : aiSummary.isFallback
                    ? 'rgba(245, 158, 11, 0.14)'
                    : 'rgba(210, 255, 40, 0.1)',
                  border: aiSummary.isError
                    ? '1px solid rgba(239, 68, 68, 0.35)'
                    : aiSummary.isFallback
                    ? '1px solid rgba(245, 158, 11, 0.35)'
                    : '1px solid rgba(210, 255, 40, 0.3)',
                  color: aiSummary.isError
                    ? '#f87171'
                    : aiSummary.isFallback
                    ? '#fbbf24'
                    : 'var(--accent-volt)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
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
            )}

            {/* רשימת הפריטים בארוחה + עריכה ידנית */}
            <div
              style={{
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800 }}>
                  פריטים בארוחה ({items.length})
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  לחץ על אייקון העריכה לשינוי משקל או ערכי מאקרו
                </span>
              </div>

              {items.length === 0 ? (
                <div
                  style={{
                    padding: 20,
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
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {items.map((item) => {
                    const isEditing = editingItemId === item.id;
                    return (
                      <div
                        key={item.id}
                        style={{
                          background: 'var(--bg-surface-2)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 14,
                          padding: '10px 12px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
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
                                      : 'rgba(210, 255, 40, 0.1)',
                                    border: item.isAiFallback
                                      ? '1px solid rgba(245, 158, 11, 0.38)'
                                      : '1px solid rgba(210, 255, 40, 0.28)',
                                    color: item.isAiFallback
                                      ? '#fbbf24'
                                      : 'var(--accent-volt)',
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

                          <div style={{ display: 'flex', gap: 6 }}>
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
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(75px, 1fr))',
                              gap: 6,
                              marginTop: 10,
                              paddingTop: 10,
                              borderTop: '1px solid var(--border-subtle)',
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
                        </Collapse>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* פס סיכום ושמירה */}
            <div
              style={{
                background: 'var(--bg-surface-2)',
                border: '1px solid rgba(210, 255, 40, 0.35)',
                borderRadius: 16,
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
                {items.length > 0 && onSavedMealAction && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      flexWrap: 'wrap',
                      paddingBottom: 6,
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Switch
                      size="xs"
                      checked={saveAsPreset}
                      onChange={(e) => setSaveAsPreset(e.currentTarget.checked)}
                      label={
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
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
                        style={{ flex: '1 1 180px' }}
                      />
                    )}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div
                      className="num-mono"
                      style={{ fontSize: 16, fontWeight: 800 }}
                    >
                      {currentTotals.calories} / {mealSlot.targets.calories} קק״ל
                    </div>
                    <div
                      className="num-mono"
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        gap: 10,
                      }}
                    >
                      <span style={{ color: 'var(--macro-protein)' }}>
                        ח׳ {currentTotals.protein}/{mealSlot.targets.protein}g
                      </span>
                      <span style={{ color: 'var(--macro-carbs)' }}>
                        פ׳ {currentTotals.carbs}/{mealSlot.targets.carbs}g
                      </span>
                      <span style={{ color: 'var(--macro-fat)' }}>
                        ש׳ {currentTotals.fat}/{mealSlot.targets.fat}g
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={savingMeal}
                    onClick={async () => {
                      if (saveLockRef.current) return;
                      saveLockRef.current = true;
                      setSavingMeal(true);
                      try {
                        const primaryPhoto = photoItems[0]?.dataUrl || photoDataUrl;
                        await onSaveMeal(mealSlot.id, items, primaryPhoto, photoNote);
                        if (saveAsPreset && items.length > 0 && onSavedMealAction) {
                          const autoTitle =
                            presetTitleInput.trim() ||
                            items
                              .slice(0, 2)
                              .map((i) => i.name)
                              .join(' + ');
                          const aiItem = items.find((it) => it.aiEngine || it.isAiFallback !== undefined);
                          await onSavedMealAction({
                            op: 'upsert',
                            preset: {
                              title: autoTitle,
                              mealSlotId: mealSlot.id,
                              items,
                              photoDataUrls:
                                photoItems.length > 0
                                  ? photoItems.map((im) => im.dataUrl)
                                  : primaryPhoto
                                  ? [primaryPhoto]
                                  : undefined,
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
                    }}
                    className="btn-volt"
                    style={{
                      padding: '10px 22px',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                    }}
                  >
                    {savingMeal ? (
                      <Loader2 size={16} className="spot-spinner" />
                    ) : (
                      <Check size={16} />
                    )}
                    <span>{savingMeal ? 'שומר ארוחה...' : 'שמור ארוחה'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </Drawer>

      <ServingToolsManagerModal
        opened={toolsModalOpen}
        onClose={() => setToolsModalOpen(false)}
        tools={customServingTools}
        customUnits={customFoodUnits}
        geminiApiKey={geminiApiKey}
        onSave={async (payload) => {
          if (!onManageToolsAndUnits) return { error: 'פעולת שמירה אינה מחוברת' };
          return await onManageToolsAndUnits(payload);
        }}
      />

      <BarcodeScannerModal
        opened={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        onProductFound={(product) => {
          handleSelectCatalogFood(product);
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
        }}
      />
    </>
  );
}
