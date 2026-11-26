'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, NumberInput, Switch, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Edit3,
  Heart,
  History,
  Layers,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Pin,
  Plus,
  Ruler,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Utensils,
} from 'lucide-react';
import {
  AiContextParams,
  DailyLog,
  FoodCatalogItem,
  LoggedFoodItem,
  SavedMealPreset,
} from '@/types/nutrition';
import {
  ISRAELI_FOOD_CATALOG,
  calculateMacrosForGrams,
  sumMacros,
} from '@/data/israeliFoodCatalog';
import { computePer100gFromServing } from '@/lib/customFoods';
import {
  clampGrams,
  cloneFoodItemWithFreshIds,
  computeYieldPortionDish,
  groupItemsAsCompositeDish,
  hasCompositeComponents,
  recalculateParentDish,
  scaleSimpleFoodItemGrams,
  stripNestedComponents,
} from '@/lib/compositeDishes';
import { normalizeHhMmTime, parseOptionalDecimal } from '@/lib/numericInput';
import { ItemTimePill } from './ui/ItemTimePill';
import {
  startUnifiedVoiceCapture,
  VoiceCaptureController,
  VoiceCaptureState,
} from '@/lib/voiceRecorder';

const SHORTCUT_GRADIENTS = [
  'linear-gradient(142deg, #d67d09 0%, #8a4f04 100%)',
  'linear-gradient(142deg, #b85d09 0%, #663004 100%)',
  'linear-gradient(142deg, #8b4c0d 0%, #452205 100%)',
  'linear-gradient(142deg, #cf7814 0%, #7d4206 100%)',
  'linear-gradient(142deg, #743f0c 0%, #371b04 100%)',
  'linear-gradient(142deg, #a6540a 0%, #592a04 100%)',
];

interface SavedMealsLibraryTabProps {
  savedMeals: SavedMealPreset[];
  traineeLogs?: Record<string, DailyLog>;
  geminiApiKey?: string;
  initialSearchQuery?: string;
  initialFilterMode?: 'all' | 'history' | 'questions';
  contextParams?: AiContextParams;
  onAddItemsToMeal: (items: LoggedFoodItem[], photoDataUrl?: string) => void;
  onOpenToolsModal: () => void;
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
}

export function SavedMealsLibraryTab({
  savedMeals,
  traineeLogs = {},
  geminiApiKey,
  initialSearchQuery = '',
  initialFilterMode = 'all',
  contextParams,
  onAddItemsToMeal,
  onOpenToolsModal,
  onSavedMealAction,
}: SavedMealsLibraryTabProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterMode, setFilterMode] = useState<
    'all' | 'history' | 'questions'
  >(initialFilterMode);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>('idle');
  const voiceControllerRef = useRef<VoiceCaptureController | null>(null);
  const recordingSearchVoice = voiceState !== 'idle';

  useEffect(() => {
    setFilterMode(initialFilterMode);
    setSelectedDetailId(null);
  }, [initialFilterMode]);

  useEffect(() => {
    return () => {
      voiceControllerRef.current?.cancel();
      voiceControllerRef.current = null;
    };
  }, []);

  // מצבי פעולה פר-מנה
  const [adjustingPresetId, setAdjustingPresetId] = useState<string | null>(null);
  const [adjustPrompt, setAdjustPrompt] = useState('');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editItems, setEditItems] = useState<LoggedFoodItem[]>([]);
  const [editGramsDrafts, setEditGramsDrafts] = useState<Record<string, string | number>>({});
  const editScaleBaseRef = useRef<
    Record<string, { grams: number; macros: { calories: number; protein: number; carbs: number; fat: number } }>
  >({});
  const [askingPresetId, setAskingPresetId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickedIdsByPreset, setPickedIdsByPreset] = useState<Record<string, Set<string>>>({});
  const [expandedPresetDishIds, setExpandedPresetDishIds] = useState<Set<string>>(new Set());
  const [potServingDrafts, setPotServingDrafts] = useState<Record<string, string>>({});

  // מצב בניית מנה מורכבת חדשה / סיר ביתי ישירות מהספרייה
  const [creatingDishOpen, setCreatingDishOpen] = useState(false);
  const [newDishTitle, setNewDishTitle] = useState('');
  const [newDishIsPot, setNewDishIsPot] = useState(false);
  const [newDishYieldGrams, setNewDishYieldGrams] = useState<string>('900');
  const [newDishIngredients, setNewDishIngredients] = useState<LoggedFoodItem[]>([]);
  const [newIngCatalogQuery, setNewIngCatalogQuery] = useState('');
  const [manualIngName, setManualIngName] = useState('');
  const [manualIngGrams, setManualIngGrams] = useState<string>('100');
  const [manualIngCal, setManualIngCal] = useState<string>('');
  const [manualIngPro, setManualIngPro] = useState<string>('0');
  const [manualIngCarb, setManualIngCarb] = useState<string>('0');
  const [manualIngFat, setManualIngFat] = useState<string>('0');
  const [editYieldGrams, setEditYieldGrams] = useState<string>('');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    msg: string;
    isError?: boolean;
    engine?: string;
    isFallback?: boolean;
  } | null>(null);

  const sortedSavedMeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = [...savedMeals];
    if (filterMode === 'questions') {
      list = list.filter((m) => Boolean(m.coachQuestion));
    }
    if (q) {
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.items.some((it) => it.name.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => {
      if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
        return a.isPinned ? -1 : 1;
      }
      if (Boolean(a.isFavorite) !== Boolean(b.isFavorite)) {
        return a.isFavorite ? -1 : 1;
      }
      if ((b.useCount || 0) !== (a.useCount || 0)) {
        return (b.useCount || 0) - (a.useCount || 0);
      }
      return (b.lastUsedAt || b.updatedAt).localeCompare(a.lastUsedAt || a.updatedAt);
    });
  }, [savedMeals, filterMode, searchQuery]);

  const historicalMeals = useMemo(() => {
    const entries: {
      key: string;
      date: string;
      mealSlotId: string;
      items: LoggedFoodItem[];
      totalCalories: number;
      photoDataUrl?: string;
    }[] = [];
    const q = searchQuery.trim().toLowerCase();
    const dates = Object.keys(traineeLogs).sort((a, b) => b.localeCompare(a));
    for (const date of dates.slice(0, 45)) {
      const log = traineeLogs[date];
      if (!log?.meals) continue;
      for (const [slotId, meal] of Object.entries(log.meals)) {
        if (!meal?.items || meal.items.length === 0) continue;
        const summaryTitle = meal.items.map((i) => i.name).join(' + ');
        if (q && !summaryTitle.toLowerCase().includes(q) && !date.includes(q)) {
          continue;
        }
        const sum = sumMacros(meal.items.map((i) => i.macros));
        entries.push({
          key: `${date}-${slotId}`,
          date,
          mealSlotId: slotId,
          items: meal.items,
          totalCalories: Math.round(sum.calories),
          photoDataUrl: meal.photoDataUrl,
        });
      }
    }
    return entries.slice(0, 30);
  }, [traineeLogs, searchQuery]);

  const withDerivedPer100g = (it: LoggedFoodItem): LoggedFoodItem => {
    if (it.per100g) return it;
    const g = Math.max(1, it.grams || 0);
    const hasAnyMacro =
      it.macros.calories > 0 ||
      it.macros.protein > 0 ||
      it.macros.carbs > 0 ||
      it.macros.fat > 0;
    const factor = 100 / g;
    const fitsNormalBounds =
      it.macros.calories * factor <= 950 &&
      it.macros.protein * factor <= 100 &&
      it.macros.carbs * factor <= 100 &&
      it.macros.fat * factor <= 100;
    if (!hasAnyMacro || !fitsNormalBounds) return it;
    return {
      ...it,
      per100g: computePer100gFromServing(it.macros, g),
    };
  };

  const cloneItemsForLog = (
    items: LoggedFoodItem[],
    preset?: SavedMealPreset
  ): LoggedFoodItem[] => {
    const baseList =
      preset?.presetKind === 'dish' && items.length > 1
        ? [
            groupItemsAsCompositeDish(items, preset.title, {
              sourcePresetId: preset.id,
            }),
          ]
        : items;
    return baseList.map((it) =>
      cloneFoodItemWithFreshIds(it, 'preset', {
        ...(preset?.id ? { sourcePresetId: preset.id } : {}),
        ...(preset?.recipeYieldGrams && hasCompositeComponents(it)
          ? { recipeYieldGrams: preset.recipeYieldGrams }
          : {}),
      })
    );
  };

  const getSelectedIdsForPreset = (preset: SavedMealPreset): Set<string> => {
    if (pickedIdsByPreset[preset.id]) return pickedIdsByPreset[preset.id];
    const all = new Set<string>();
    for (const it of preset.items) {
      all.add(it.id);
      for (const c of it.components || []) all.add(c.id);
    }
    return all;
  };

  const countSelectedTopForPreset = (preset: SavedMealPreset): number => {
    const sel = getSelectedIdsForPreset(preset);
    let cnt = 0;
    for (const it of preset.items) {
      if (hasCompositeComponents(it)) {
        if (sel.has(it.id) || it.components!.some((c) => sel.has(c.id))) cnt += 1;
      } else if (sel.has(it.id)) {
        cnt += 1;
      }
    }
    return cnt;
  };

  const togglePickPresetItem = (preset: SavedMealPreset, item: LoggedFoodItem) => {
    setPickedIdsByPreset((prev) => {
      const cur = new Set(getSelectedIdsForPreset(preset));
      if (hasCompositeComponents(item)) {
        const compIds = item.components!.map((c) => c.id);
        const allChecked =
          cur.has(item.id) ||
          (compIds.length > 0 && compIds.every((id) => cur.has(id)));
        if (allChecked) {
          cur.delete(item.id);
          for (const id of compIds) cur.delete(id);
        } else {
          cur.add(item.id);
          for (const id of compIds) cur.add(id);
        }
      } else {
        if (cur.has(item.id)) cur.delete(item.id);
        else cur.add(item.id);
      }
      return { ...prev, [preset.id]: cur };
    });
  };

  const togglePickPresetComponent = (
    preset: SavedMealPreset,
    parent: LoggedFoodItem,
    comp: LoggedFoodItem
  ) => {
    setPickedIdsByPreset((prev) => {
      const cur = new Set(getSelectedIdsForPreset(preset));
      const compIds = parent.components?.map((c) => c.id) || [];
      if (cur.has(parent.id)) {
        cur.delete(parent.id);
        for (const id of compIds) {
          if (id !== comp.id) cur.add(id);
        }
      } else if (cur.has(comp.id)) {
        cur.delete(comp.id);
      } else {
        cur.add(comp.id);
        if (compIds.length > 0 && compIds.every((id) => cur.has(id))) {
          cur.add(parent.id);
        }
      }
      return { ...prev, [preset.id]: cur };
    });
  };

  const handleUsePresetExact = async (preset: SavedMealPreset) => {
    onAddItemsToMeal(
      cloneItemsForLog(preset.items, preset),
      preset.photoDataUrl || preset.photoDataUrls?.[0]
    );
    setFeedbackBanner({ msg: `נטענה הארוחה "${preset.title}"` });
    if (onSavedMealAction) {
      await onSavedMealAction({ op: 'increment-use', presetId: preset.id });
    }
  };

  const handleUsePickedFromPreset = async (preset: SavedMealPreset) => {
    const sel = getSelectedIdsForPreset(preset);
    const chosen: LoggedFoodItem[] = [];
    for (const it of preset.items) {
      if (sel.has(it.id)) {
        chosen.push(it);
      } else if (hasCompositeComponents(it)) {
        const subComps = it.components!.filter((c) => sel.has(c.id));
        if (subComps.length > 0) {
          chosen.push(recalculateParentDish({ ...it, components: subComps }));
        }
      }
    }
    if (chosen.length === 0) {
      setFeedbackBanner({ msg: 'יש לסמן לפחות פריט או מרכיב אחד להוספה', isError: true });
      return;
    }
    const cloned = chosen.map((it) =>
      cloneFoodItemWithFreshIds(it, 'pick', { sourcePresetId: preset.id })
    );
    onAddItemsToMeal(cloned, preset.photoDataUrl || preset.photoDataUrls?.[0]);
    setFeedbackBanner({
      msg: `נוספו ${cloned.length} פריטים נבחרים מתוך "${preset.title}"`,
    });
    if (onSavedMealAction) {
      await onSavedMealAction({ op: 'increment-use', presetId: preset.id });
    }
  };

  const handleUsePotYieldPortion = async (
    preset: SavedMealPreset,
    servingGrams: number
  ) => {
    if (!preset.recipeYieldGrams || preset.recipeYieldGrams <= 0) return;
    const rawIngredients = preset.items.flatMap((it) =>
      hasCompositeComponents(it)
        ? it.components!.map(stripNestedComponents)
        : [stripNestedComponents(it)]
    );
    if (rawIngredients.length === 0) return;

    const dish = computeYieldPortionDish({
      title: preset.title,
      rawIngredients,
      cookedYieldGrams: preset.recipeYieldGrams,
      servingGrams,
      source: 'manual',
      sourcePresetId: preset.id,
    });
    onAddItemsToMeal([dish], preset.photoDataUrl || preset.photoDataUrls?.[0]);
    setFeedbackBanner({
      msg: `נוספה מנת צלחת (${Math.round(servingGrams)}g) מתוך הסיר "${preset.title}"`,
    });
    if (onSavedMealAction) {
      await onSavedMealAction({ op: 'increment-use', presetId: preset.id });
    }
  };

  const catalogQuickMatches = useMemo<FoodCatalogItem[]>(() => {
    const q = newIngCatalogQuery.trim().toLowerCase();
    if (!q) return [];
    return ISRAELI_FOOD_CATALOG.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [newIngCatalogQuery]);

  const handleAddCatalogIngredientToNewDish = (food: FoodCatalogItem) => {
    const grams = clampGrams(parseOptionalDecimal(manualIngGrams) ?? 100, 100);
    const macros = calculateMacrosForGrams(food.per100g, grams);
    setNewDishIngredients((prev) => [
      ...prev,
      {
        id: `newing-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: food.name,
        unitLabel: `${grams} גרם`,
        quantity: 1,
        grams,
        per100g: { ...food.per100g },
        macros,
        source: 'catalog',
        inputConfidence: 'catalog',
      },
    ]);
    setNewIngCatalogQuery('');
  };

  const handleAddManualIngredientToNewDish = () => {
    const name = manualIngName.trim();
    const grams = parseOptionalDecimal(manualIngGrams);
    const cal = parseOptionalDecimal(manualIngCal);
    if (!name || grams === undefined || grams <= 0 || cal === undefined || cal < 0) {
      setFeedbackBanner({
        msg: 'נא למלא שם מרכיב, גרמים (> 0) וקלוריות תקינות',
        isError: true,
      });
      return;
    }
    const g = clampGrams(grams, 100);
    const macros = {
      calories: Math.round(cal),
      protein: Math.round((parseOptionalDecimal(manualIngPro) ?? 0) * 10) / 10,
      carbs: Math.round((parseOptionalDecimal(manualIngCarb) ?? 0) * 10) / 10,
      fat: Math.round((parseOptionalDecimal(manualIngFat) ?? 0) * 10) / 10,
    };
    setNewDishIngredients((prev) => [
      ...prev,
      {
        id: `maning-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name,
        unitLabel: `${g} גרם`,
        quantity: 1,
        grams: g,
        macros,
        source: 'manual',
        inputConfidence: 'reported',
      },
    ]);
    setManualIngName('');
    setManualIngCal('');
    setManualIngPro('0');
    setManualIngCarb('0');
    setManualIngFat('0');
  };

  const handleSaveNewDishPreset = async () => {
    if (!onSavedMealAction || !newDishTitle.trim() || newDishIngredients.length === 0) {
      setFeedbackBanner({
        msg: 'יש להזין שם מנה ולפחות מרכיב אחד',
        isError: true,
      });
      return;
    }
    const yieldParsed = newDishIsPot
      ? parseOptionalDecimal(newDishYieldGrams)
      : undefined;
    if (newDishIsPot && (yieldParsed === undefined || yieldParsed <= 0)) {
      setFeedbackBanner({
        msg: 'במצב סיר ביתי יש להזין משקל סיר מוכן כולל גדול מ-0',
        isError: true,
      });
      return;
    }

    const compositeDish = groupItemsAsCompositeDish(
      newDishIngredients,
      newDishTitle.trim()
    );
    if (yieldParsed) {
      compositeDish.recipeYieldGrams = clampGrams(yieldParsed, 900);
    }

    setBusyId('new-dish');
    try {
      const res = await onSavedMealAction({
        op: 'upsert',
        preset: {
          title: newDishTitle.trim(),
          presetKind: 'dish',
          ...(yieldParsed ? { recipeYieldGrams: clampGrams(yieldParsed, 900) } : {}),
          items: [compositeDish],
          isFavorite: false,
          isPinned: false,
          useCount: 0,
        },
      });
      if (res.error) {
        setFeedbackBanner({ msg: res.error, isError: true });
        return;
      }
      setCreatingDishOpen(false);
      setNewDishTitle('');
      setNewDishIngredients([]);
      setNewDishIsPot(false);
      setFeedbackBanner({ msg: `המנה הקבועה "${compositeDish.name}" נשמרה בספרייה!` });
    } finally {
      setBusyId(null);
    }
  };

  const handleAdjustWithAi = async (preset: SavedMealPreset) => {
    if (!adjustPrompt.trim()) {
      setFeedbackBanner({ msg: 'כתוב מה השתנה הפעם (למשל: 100 גרם פסטה)', isError: true });
      return;
    }
    setAdjustLoading(true);
    setFeedbackBanner(null);
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'adjust-meal',
          baseItems: preset.items,
          adjustmentPrompt: adjustPrompt.trim(),
          contextParams,
          customApiKey: geminiApiKey,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.items) || data.items.length === 0) {
        setFeedbackBanner({
          msg: data.error || 'לא הצלחתי להתאים את הארוחה',
          isError: true,
        });
        return;
      }
      onAddItemsToMeal(data.items, preset.photoDataUrl);
      if (onSavedMealAction) {
        await onSavedMealAction({ op: 'increment-use', presetId: preset.id });
      }
      setAdjustingPresetId(null);
      setAdjustPrompt('');
      setFeedbackBanner({
        msg: `הארוחה הותאמה והוספה לארוחה הנוכחית (${data.items.length} מרכיבים)`,
        engine: data.engine,
        isFallback: Boolean(data.isAiFallback),
      });
    } finally {
      setAdjustLoading(false);
    }
  };

  const handleSaveEditedPreset = async (preset: SavedMealPreset) => {
    if (!onSavedMealAction || !editTitle.trim() || editItems.length === 0) return;
    const invalidItem = editItems.find((it) => {
      const draftVal = editGramsDrafts[it.id];
      if (draftVal === undefined) return false;
      const parsed = parseOptionalDecimal(draftVal);
      return parsed === undefined || parsed <= 0;
    });
    if (invalidItem) {
      setFeedbackBanner({
        msg: `נא להזין משקל בגרם גדול מ-0 עבור "${invalidItem.name}"`,
        isError: true,
      });
      return;
    }
    setBusyId(preset.id);
    try {
      const parsedYield = editYieldGrams.trim()
        ? parseOptionalDecimal(editYieldGrams)
        : undefined;
      const res = await onSavedMealAction({
        op: 'upsert',
        preset: {
          ...preset,
          title: editTitle.trim(),
          ...(parsedYield && parsedYield > 0 ? { recipeYieldGrams: parsedYield } : {}),
          items: editItems.map((it) =>
            hasCompositeComponents(it) ? recalculateParentDish(it) : withDerivedPer100g(it)
          ),
        },
      });
      if (res.error) {
        setFeedbackBanner({ msg: res.error, isError: true });
        return;
      }
      setEditingPresetId(null);
      setEditGramsDrafts({});
      editScaleBaseRef.current = {};
      setFeedbackBanner({ msg: 'הארוחה השמורה עודכנה' });
    } finally {
      setBusyId(null);
    }
  };

  const handleAskCoach = async (presetId: string) => {
    if (!onSavedMealAction || !questionText.trim()) return;
    setBusyId(presetId);
    try {
      const res = await onSavedMealAction({
        op: 'ask-question',
        presetId,
        question: questionText.trim(),
      });
      if (res.error) {
        setFeedbackBanner({ msg: res.error, isError: true });
        return;
      }
      setAskingPresetId(null);
      setQuestionText('');
      setFeedbackBanner({ msg: 'השאלה נשמרה ונשלחה למאמן במערכת!' });
    } finally {
      setBusyId(null);
    }
  };

  const handleWhatsAppShare = async (preset: SavedMealPreset) => {
    const text = `היי! אשמח להתייעץ לגבי הארוחה שלי:\n🍽️ ${preset.title}\n📊 ${Math.round(
      preset.totalCalories
    )} קק"ל · חלבון ${preset.totalProtein}g · פחמימות ${preset.totalCarbs}g · שומן ${preset.totalFat}g\nמרכיבים:\n${preset.items
      .map((it) => `• ${it.name} (${it.unitLabel})`)
      .join('\n')}${
      preset.coachQuestion?.question ? `\n\nשאלה: ${preset.coachQuestion.question}` : ''
    }`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const handleSaveHistoryAsPreset = async (entry: (typeof historicalMeals)[number]) => {
    if (!onSavedMealAction) return;
    setBusyId(entry.key);
    try {
      const title = entry.items
        .slice(0, 2)
        .map((i) => i.name)
        .join(' + ');
      const res = await onSavedMealAction({
        op: 'upsert',
        preset: {
          title,
          mealSlotId: entry.mealSlotId,
          items: cloneItemsForLog(entry.items),
          photoDataUrl: entry.photoDataUrl,
          isFavorite: false,
          isPinned: false,
          useCount: 1,
        },
      });
      if (res.error) {
        setFeedbackBanner({ msg: res.error, isError: true });
      } else {
        setFeedbackBanner({ msg: `נשמר ל'ארוחות שלי': ${title}` });
        setFilterMode('all');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleStartVoiceSearch = () => {
    if (typeof window === 'undefined') return;
    if (voiceState === 'listening') {
      voiceControllerRef.current?.stop();
      return;
    }
    if (voiceState === 'transcribing') return;

    setFeedbackBanner(null);
    voiceControllerRef.current = startUnifiedVoiceCapture({
      customApiKey: geminiApiKey,
      onStateChange: (next) => {
        setVoiceState(next);
        if (next === 'idle') voiceControllerRef.current = null;
      },
      onTranscript: (text) => {
        setSearchQuery(text);
      },
      onError: (msg) => {
        setFeedbackBanner({ msg, isError: true });
        notifications.show({
          color: 'orange',
          title: 'הקלטה קולית',
          message: msg,
        });
      },
    });
  };

  const detailPreset = selectedDetailId
    ? savedMeals.find((m) => m.id === selectedDetailId) || null
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* שורת חיפוש מעוגלת בסגנון גלריית קיצורים + כפתור כלים מהיר */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            borderRadius: 999,
            padding: '0 12px',
            height: 38,
          }}
        >
          <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            placeholder="חיפוש בארוחות שמורות..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12.5,
              padding: '0 8px',
            }}
          />
          <button
            type="button"
            title={
              voiceState === 'listening'
                ? 'מקליט... לחץ לעצירה'
                : voiceState === 'transcribing'
                ? 'מתמלל הקלטה...'
                : 'חיפוש קולי'
            }
            onClick={handleStartVoiceSearch}
            style={{
              background:
                voiceState === 'listening'
                  ? 'rgba(239, 68, 68, 0.18)'
                  : 'transparent',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
              flexShrink: 0,
              color:
                voiceState === 'listening'
                  ? 'var(--danger-text)'
                  : voiceState === 'transcribing'
                  ? 'var(--accent-orange-bright)'
                  : 'var(--text-secondary)',
            }}
          >
            {voiceState === 'transcribing' ? (
              <Loader2 size={14} className="spot-spinner" />
            ) : voiceState === 'listening' ? (
              <MicOff size={14} />
            ) : (
              <Mic size={14} />
            )}
          </button>
        </div>

        {onSavedMealAction && (
          <button
            type="button"
            onClick={() => setCreatingDishOpen((p) => !p)}
            className="btn-surface"
            style={{
              height: 40,
              padding: '0 12px',
              borderRadius: 999,
              fontSize: 12.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              flexShrink: 0,
              cursor: 'pointer',
              borderColor: creatingDishOpen ? 'var(--accent)' : undefined,
            }}
          >
            <Plus size={14} />
            <span>צור מנה / סיר</span>
          </button>
        )}
      </div>

      {/* טופס יצירת מנה מורכבת או סיר ביתי ישירות לספרייה */}
      {creatingDishOpen && (
        <div
          style={{
            padding: 12,
            borderRadius: 18,
            background: 'var(--surface-2)',
            border: '1px solid var(--line-2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 800 }}>
              יצירת מנה מורכבת או מתכון סיר ביתי
            </span>
            <button
              type="button"
              onClick={() => setCreatingDishOpen(false)}
              style={{ border: 0, background: 'transparent', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}
            >
              סגור
            </button>
          </div>
          <TextInput
            size="xs"
            label="שם המנה"
            placeholder='למשל: "קפה של בוקר" או "מג׳דרה בסיר"'
            value={newDishTitle}
            onChange={(e) => setNewDishTitle(e.currentTarget.value)}
          />
          <Switch
            size="xs"
            color="cyan"
            checked={newDishIsPot}
            onChange={(e) => setNewDishIsPot(e.currentTarget.checked)}
            label={
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>
                סיר ביתי (גלם ← מוכן: הכנס חומרי גלם יבשים + משקל הסיר המוכן)
              </span>
            }
          />
          {newDishIsPot && (
            <NumberInput
              size="xs"
              label="משקל הסיר המוכן הסופי (גרם)"
              placeholder="למשל 950"
              value={newDishYieldGrams}
              min={10}
              max={20000}
              onChange={(v) => setNewDishYieldGrams(String(v ?? ''))}
            />
          )}

          {/* חיפוש מהיר ממאגר המזון הישראלי או הזנה ידנית */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
              הוסף מרכיבים למנה (במשקל גלם לסיר או במשקל אכילה):
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <TextInput
                size="xs"
                style={{ flex: 1 }}
                placeholder="חפש במאגר (למשל: אורז, חלב, שמן זית)..."
                value={newIngCatalogQuery}
                onChange={(e) => setNewIngCatalogQuery(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                dir="ltr"
                style={{ width: 82 }}
                placeholder="גרם"
                value={manualIngGrams}
                onChange={(e) => setManualIngGrams(e.currentTarget.value)}
              />
            </div>
            {catalogQuickMatches.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {catalogQuickMatches.map((food) => (
                  <button
                    key={food.id}
                    type="button"
                    onClick={() => handleAddCatalogIngredientToNewDish(food)}
                    className="glass"
                    style={{
                      padding: '4px 9px',
                      borderRadius: 999,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    + {food.name} ({Math.round(food.per100g.calories)}/100g)
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.6fr 0.6fr auto', gap: 5, alignItems: 'end' }}>
              <TextInput
                size="xs"
                placeholder="או שם מרכיב ידני..."
                value={manualIngName}
                onChange={(e) => setManualIngName(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                dir="ltr"
                placeholder="קק״ל"
                value={manualIngCal}
                onChange={(e) => setManualIngCal(e.currentTarget.value)}
              />
              <TextInput
                size="xs"
                dir="ltr"
                placeholder="חלבון"
                value={manualIngPro}
                onChange={(e) => setManualIngPro(e.currentTarget.value)}
              />
              <button
                type="button"
                onClick={handleAddManualIngredientToNewDish}
                className="glass"
                style={{ height: 30, padding: '0 10px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                + הוסף
              </button>
            </div>
          </div>

          {newDishIngredients.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {newDishIngredients.map((ing) => (
                <div
                  key={ing.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 8px',
                    borderRadius: 10,
                    background: 'var(--card)',
                    fontSize: 12,
                  }}
                >
                  <span>
                    <b>{ing.name}</b> · {ing.grams}g · {ing.macros.calories} קק״ל
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewDishIngredients((prev) => prev.filter((x) => x.id !== ing.id))
                    }
                    style={{ border: 0, background: 'transparent', color: 'var(--danger-text)', cursor: 'pointer' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={busyId === 'new-dish'}
                onClick={() => void handleSaveNewDishPreset()}
                className="btn-volt"
                style={{ height: 40, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', marginTop: 4 }}
              >
                {busyId === 'new-dish' ? 'שומר...' : `שמור מנה (${newDishIngredients.length} מרכיבים)`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3 צ׳יפים פשוטים וברורים: שמורות / היסטוריית ארוחות / התייעצות מאמן */}
      <div data-h-scroll style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
        {[
          { id: 'all', label: `ארוחות שמורות (${savedMeals.length})` },
          { id: 'history', label: `היסטוריית ארוחות (${historicalMeals.length})` },
          {
            id: 'questions',
            label: `שאלות למאמן (${savedMeals.filter((m) => Boolean(m.coachQuestion)).length})`,
          },
        ].map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => {
              setSelectedDetailId(null);
              setFilterMode(f.id as typeof filterMode);
            }}
            aria-pressed={filterMode === f.id}
            style={{
              minHeight: 40,
              padding: '0 14px',
              borderRadius: 999,
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: filterMode === f.id ? 700 : 500,
              cursor: 'pointer',
              flex: 'none',
              whiteSpace: 'nowrap',
              border: `1px solid ${filterMode === f.id ? 'var(--sel-border)' : 'var(--line-2)'}`,
              background: filterMode === f.id ? 'var(--sel-bg)' : 'transparent',
              color: filterMode === f.id ? 'var(--sel-text)' : 'var(--text)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {feedbackBanner && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 16,
            fontSize: 12,
            fontWeight: 600,
            background: feedbackBanner.isError
              ? 'rgba(239, 68, 68, 0.14)'
              : 'var(--fill-1)',
            border: feedbackBanner.isError
              ? '1px solid rgba(239, 68, 68, 0.35)'
              : '1px solid var(--line-2)',
            color: feedbackBanner.isError ? 'var(--danger-text)' : 'var(--text)',
          }}
        >
          {feedbackBanner.msg}
          {feedbackBanner.engine && (
            <span style={{ display: 'block', fontSize: 12, marginTop: 2 }}>
              {feedbackBanner.isFallback
                ? `לא AI · Fallback (${feedbackBanner.engine})`
                : `✨ AI · ${feedbackBanner.engine}`}
            </span>
          )}
        </div>
      )}

      {filterMode === 'history' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {historicalMeals.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              לא נמצאו ארוחות היסטוריות תואמות ביומן.
            </div>
          ) : (
            historicalMeals.map((entry) => (
              <div
                key={entry.key}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 18,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <History size={13} color="var(--text-2)" />
                    <span className="num-mono" style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                      {entry.date}
                    </span>
                    <span className="num-mono" style={{ fontSize: 12, fontWeight: 700 }}>
                      · {entry.totalCalories} קק״ל
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      disabled={busyId === entry.key}
                      onClick={() => handleSaveHistoryAsPreset(entry)}
                      className="btn-surface"
                      style={{ padding: '4px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      <Bookmark size={11} style={{ marginLeft: 4 }} />
                      שמור בספרייה
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onAddItemsToMeal(cloneItemsForLog(entry.items), entry.photoDataUrl);
                        setFeedbackBanner({ msg: `ארוחה מתאריך ${entry.date} נטענה` });
                      }}
                      className="btn-volt"
                      style={{ padding: '4px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                    >
                      + טען לארוחה
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {entry.items
                    .map(
                      (it) =>
                        `${it.itemTime ? `${it.itemTime} · ` : ''}${it.name} (${it.unitLabel})`
                    )
                    .join(' · ')}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div>
          {sortedSavedMeals.length === 0 ? (
            <div
              style={{
                padding: 20,
                textAlign: 'center',
                borderRadius: 20,
                background: 'var(--surface-2)',
                border: '1px dashed var(--line)',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              עדיין אין ארוחות שמורות בגלריה. בסיום הוספת ארוחה סמן <b>״שמור גם ב&apos;ארוחות שמורות&apos;״</b> או טען מהיסטוריית הארוחות.
            </div>
          ) : !detailPreset ? (
            /* גלריית כרטיסים צבעונית (2 עמודות בהשראת Apple Shortcuts Gallery) */
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 10,
              }}
            >
              {sortedSavedMeals.map((preset, idx) => {
                const bg = SHORTCUT_GRADIENTS[idx % SHORTCUT_GRADIENTS.length];
                const thumb = preset.photoDataUrl || preset.photoDataUrls?.[0];
                return (
                  <div
                    key={preset.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDetailId(preset.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedDetailId(preset.id);
                      }
                    }}
                    style={{
                      background: bg,
                      borderRadius: 18,
                      padding: 12,
                      minHeight: 118,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      position: 'relative',
                      boxShadow: '0 8px 20px -8px rgba(0, 0, 0, 0.55)',
                      border: preset.isPinned
                        ? '1px solid rgba(255, 255, 255, 0.45)'
                        : '1px solid rgba(255, 255, 255, 0.14)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 6,
                      }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={preset.title}
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 16,
                            objectFit: 'cover',
                            border: '1px solid rgba(255,255,255,0.35)',
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 16,
                            background: 'var(--line-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text)',
                          }}
                        >
                          <Utensils size={16} />
                        </div>
                      )}

                      <button
                        type="button"
                        title="הוסף לארוחה בקליק"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUsePresetExact(preset);
                        }}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: '50%',
                          border: 'none',
                          background: 'rgba(255, 255, 255, 0.28)',
                          backdropFilter: 'blur(6px)',
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={16} strokeWidth={2.8} />
                      </button>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 900,
                          color: 'var(--text)',
                          lineHeight: 1.25,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {preset.isPinned ? 'נעוץ · ' : ''}
                        {preset.title}
                      </div>
                      <div
                        className="num-mono"
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: 'rgba(255, 255, 255, 0.86)',
                          marginTop: 4,
                        }}
                      >
                        {Math.round(preset.totalCalories)} קק״ל · {preset.items.length} מרכיבים
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            (() => {
              const preset = detailPreset;
              const isAdjusting = adjustingPresetId === preset.id;
              const isEditing = editingPresetId === preset.id;
              const isAsking = askingPresetId === preset.id;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedDetailId(null)}
                    className="btn-surface"
                    style={{
                      alignSelf: 'flex-start',
                      padding: '5px 11px',
                      borderRadius: 999,
                      fontSize: 12.5,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      cursor: 'pointer',
                    }}
                  >
                    <ChevronRight size={14} />
                    <span>חזור לגלריית השמורות</span>
                  </button>

                  <div
                    key={preset.id}
                    style={{
                      background: 'var(--surface-2)',
                      border: preset.isPinned
                        ? '1px solid var(--line-2)'
                        : '1px solid var(--line)',
                      borderRadius: 16,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 9,
                    }}
                  >
                  {/* כותרת ופעולות מהירות */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                      {preset.photoDataUrl && (
                        <img
                          src={preset.photoDataUrl}
                          alt={preset.title}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 16,
                            objectFit: 'cover',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span>{preset.title}</span>
                          {preset.useCount > 0 && (
                            <span
                              className="num-mono"
                              style={{
                                fontSize: 12,
                                padding: '1px 6px',
                                borderRadius: 999,
                                background: 'var(--line)',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              נבחר {preset.useCount}×
                            </span>
                          )}
                          {(preset.isAiFallback !== undefined || preset.aiEngine) && (
                            <span
                              style={{
                                fontSize: 12,
                                padding: '1px 6px',
                                borderRadius: 999,
                                fontWeight: 800,
                                background: preset.isAiFallback
                                  ? 'rgba(245, 158, 11, 0.16)'
                                  : 'var(--surface-2)',
                                color: preset.isAiFallback ? 'var(--warn-text)' : 'var(--accent-volt)',
                              }}
                            >
                              {preset.isAiFallback
                                ? `לא AI · ${preset.aiEngine || 'Fallback'}`
                                : `AI · ${preset.aiEngine}`}
                            </span>
                          )}
                        </div>
                        <div className="num-mono" style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          <b style={{ color: 'var(--text)' }}>{Math.round(preset.totalCalories)} קק״ל</b> · ח׳ {preset.totalProtein}g · פ׳ {preset.totalCarbs}g · ש׳ {preset.totalFat}g
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        type="button"
                        title={preset.isPinned ? 'בטל נעיצה' : 'נעץ לראש הרשימה'}
                        onClick={() => onSavedMealAction?.({ op: 'toggle-pin', presetId: preset.id })}
                        className="btn-surface"
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          borderColor: preset.isPinned ? 'var(--accent-volt)' : undefined,
                        }}
                      >
                        <Pin size={12} color={preset.isPinned ? 'var(--accent-volt)' : 'var(--text-secondary)'} />
                      </button>
                      <button
                        type="button"
                        title="מועדף"
                        onClick={() => onSavedMealAction?.({ op: 'toggle-favorite', presetId: preset.id })}
                        className="btn-surface"
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Heart
                          size={12}
                          color={preset.isFavorite ? '#f43f5e' : 'var(--text-secondary)'}
                          fill={preset.isFavorite ? '#f43f5e' : 'none'}
                        />
                      </button>
                      <button
                        type="button"
                        title="ערוך מנה שמורה"
                        onClick={() => {
                          if (isEditing) {
                            setEditingPresetId(null);
                            setEditGramsDrafts({});
                            editScaleBaseRef.current = {};
                          } else {
                            setEditingPresetId(preset.id);
                            setEditTitle(preset.title);
                            setEditYieldGrams(
                              preset.recipeYieldGrams ? String(preset.recipeYieldGrams) : ''
                            );
                            setEditItems(preset.items.map((x) => cloneFoodItemWithFreshIds(x, 'ed', { id: x.id })));
                            setEditGramsDrafts({});
                            const baseMap: Record<string, { grams: number; macros: { calories: number; protein: number; carbs: number; fat: number } }> = {};
                            for (const x of preset.items) {
                              baseMap[x.id] = {
                                grams: Math.max(1, x.grams),
                                macros: { ...x.macros },
                              };
                            }
                            editScaleBaseRef.current = baseMap;
                          }
                        }}
                        className="btn-surface"
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Edit3 size={12} color="var(--text-secondary)" />
                      </button>
                      <button
                        type="button"
                        title="מחק מהספרייה"
                        onClick={() => onSavedMealAction?.({ op: 'delete', presetId: preset.id })}
                        className="btn-surface"
                        style={{
                          width: 28,
                          height: 28,
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={12} color="var(--danger-text)" />
                      </button>
                    </div>
                  </div>

                  {/* פירוט מרכיבים אינטראקטיבי: הרחבה ובחירת פריטים ייחודיים להוספה */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      padding: 10,
                      borderRadius: 14,
                      background: 'var(--card)',
                      border: '1px solid var(--line)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 700 }}>
                      <span>בחר מה להוסיף מהמנה / ארוחה ({countSelectedTopForPreset(preset)} / {preset.items.length}):</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPickedIdsByPreset((prev) => {
                            const next = { ...prev };
                            if (countSelectedTopForPreset(preset) === preset.items.length) {
                              next[preset.id] = new Set();
                            } else {
                              delete next[preset.id];
                            }
                            return next;
                          });
                        }}
                        style={{ border: 0, background: 'transparent', color: 'var(--accent)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {countSelectedTopForPreset(preset) === preset.items.length ? 'נקה הכל' : 'בחר הכל'}
                      </button>
                    </div>
                    {preset.items.map((it) => {
                      const sel = getSelectedIdsForPreset(preset);
                      const isComp = hasCompositeComponents(it);
                      const isDishExpanded = expandedPresetDishIds.has(it.id);
                      const childAllSelected = isComp
                        ? sel.has(it.id) || it.components!.every((c) => sel.has(c.id))
                        : sel.has(it.id);
                      const childPartial =
                        isComp && !childAllSelected && it.components!.some((c) => sel.has(c.id));

                      return (
                        <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                            <input
                              type="checkbox"
                              checked={childAllSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = childPartial;
                              }}
                              onChange={() => togglePickPresetItem(preset, it)}
                              aria-label={`בחר ${it.name}`}
                            />
                            <span style={{ flex: 1, fontWeight: 600 }}>
                              {it.name}{' '}
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                                ({it.unitLabel} · {Math.round(it.macros.calories)} קק״ל)
                              </span>
                            </span>
                            {isComp && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPresetDishIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(it.id)) next.delete(it.id);
                                    else next.add(it.id);
                                    return next;
                                  })
                                }
                                className="glass"
                                style={{
                                  height: 24,
                                  padding: '0 8px',
                                  borderRadius: 999,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  cursor: 'pointer',
                                }}
                              >
                                <Layers size={11} />
                                <span>{it.components!.length}</span>
                                {isDishExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                              </button>
                            )}
                          </div>
                          {isComp && (
                            <Collapse in={isDishExpanded}>
                              <div
                                style={{
                                  paddingInlineStart: 24,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 4,
                                  paddingTop: 2,
                                }}
                              >
                                {it.components!.map((comp) => {
                                  const compChecked = sel.has(it.id) || sel.has(comp.id);
                                  return (
                                    <label
                                      key={comp.id}
                                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={compChecked}
                                        onChange={() => togglePickPresetComponent(preset, it, comp)}
                                      />
                                      <span>
                                        {comp.name} ({comp.grams}g · {Math.round(comp.macros.calories)} קק״ל)
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </Collapse>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* מחשבון מנת צלחת מתוך סיר ביתי (גלם -> מוכן) */}
                  {preset.recipeYieldGrams && preset.recipeYieldGrams > 0 && (() => {
                    const plateGramsRaw = potServingDrafts[preset.id] ?? '200';
                    const plateGrams = clampGrams(parseOptionalDecimal(plateGramsRaw) ?? 200, 200);
                    const previewPlate = computeYieldPortionDish({
                      title: preset.title,
                      rawIngredients: preset.items.flatMap((it) =>
                        hasCompositeComponents(it)
                          ? it.components!.map(stripNestedComponents)
                          : [stripNestedComponents(it)]
                      ),
                      cookedYieldGrams: preset.recipeYieldGrams,
                      servingGrams: plateGrams,
                    });
                    return (
                      <div
                        style={{
                          padding: 10,
                          borderRadius: 14,
                          background: 'rgba(56, 189, 248, 0.08)',
                          border: '1px solid rgba(56, 189, 248, 0.28)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#38bdf8' }}>
                          מתכון סיר ביתי · תפוקה מוכנה {Math.round(preset.recipeYieldGrams)} גרם
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <TextInput
                            size="xs"
                            dir="ltr"
                            style={{ width: 100 }}
                            label="שמתי בצלחת (ג׳)"
                            value={plateGramsRaw}
                            onChange={(e) => {
                              const val = e.currentTarget.value;
                              setPotServingDrafts((prev) => ({ ...prev, [preset.id]: val }));
                            }}
                          />
                          <div className="num-mono" style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>
                            = <b>{previewPlate.macros.calories} קק״ל</b> · ח׳ {previewPlate.macros.protein}g · פ׳ {previewPlate.macros.carbs}g · ש׳ {previewPlate.macros.fat}g
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleUsePotYieldPortion(preset, plateGrams)}
                            className="btn-volt"
                            style={{ padding: '6px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                          >
                            + הוסף מנת צלחת ({Math.round(plateGrams)}g)
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* סטטוס התייעצות מול המאמן */}
                  {preset.coachQuestion && (
                    <div
                      style={{
                        padding: '7px 10px',
                        borderRadius: 16,
                        background:
                          preset.coachQuestion.status === 'answered'
                            ? 'var(--fill-1)'
                            : 'rgba(56, 189, 248, 0.08)',
                        border:
                          preset.coachQuestion.status === 'answered'
                            ? '1px solid var(--line-2)'
                            : '1px solid rgba(56, 189, 248, 0.25)',
                        fontSize: 12,
                      }}
                    >
                      <div>
                        <b>השאלה שלך:</b> {preset.coachQuestion.question}
                      </div>
                      {preset.coachQuestion.reply ? (
                        <div style={{ marginTop: 4, color: 'var(--accent-volt)' }}>
                          <b>תשובת {preset.coachQuestion.repliedBy || 'המאמן'}:</b>{' '}
                          {preset.coachQuestion.reply}
                        </div>
                      ) : (
                        <div style={{ marginTop: 3, color: 'var(--info-text)', fontSize: 12 }}>
                          ממתין למענה המאמן...
                        </div>
                      )}
                    </div>
                  )}

                  {/* כפתורי הפעולה המרכזיים למנה */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleUsePresetExact(preset)}
                      className="btn-volt"
                      style={{
                        padding: '6px 11px',
                        fontSize: 12,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={12} />
                      <span>הוסף הכל</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleUsePickedFromPreset(preset)}
                      className="btn-surface"
                      style={{
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 800,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        borderColor: 'var(--accent)',
                      }}
                    >
                      <Check size={12} />
                      <span>הוסף נבחרים ({countSelectedTopForPreset(preset)})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAdjustingPresetId(isAdjusting ? null : preset.id);
                        setAdjustPrompt('');
                      }}
                      className="btn-surface"
                      style={{
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        borderColor: 'var(--line-2)',
                        color: 'var(--accent-volt)',
                      }}
                    >
                      <Sparkles size={12} />
                      <span>התאם שינוי עם AI</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAskingPresetId(isAsking ? null : preset.id);
                        setQuestionText(preset.coachQuestion?.question || '');
                      }}
                      className="btn-surface"
                      style={{
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                    >
                      <MessageCircle size={12} color="var(--text-2)" />
                      <span>שאל מאמן</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleWhatsAppShare(preset)}
                      className="btn-surface"
                      style={{
                        padding: '6px 9px',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                        color: 'var(--ok-text)',
                      }}
                    >
                      <Share2 size={12} />
                      <span>וואטסאפ</span>
                    </button>
                  </div>

                  {/* פאנל התאמת שינוי עם AI */}
                  {isAdjusting && (
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 16,
                        background: 'var(--fill-1)',
                        border: '1px solid var(--line-2)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <TextInput
                        size="xs"
                        label="מה השתנה בארוחה הפעם?"
                        placeholder='למשל: "הפעם היה 100 גרם פסטה מבושלת ובלי שמן זית"'
                        value={adjustPrompt}
                        onChange={(e) => setAdjustPrompt(e.currentTarget.value)}
                      />
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {['100 גרם פסטה', 'חצי מנה', 'כפול בחלבון', 'בלי רוטב'].map((quick) => (
                          <button
                            key={quick}
                            type="button"
                            onClick={() => setAdjustPrompt(quick)}
                            className="btn-surface"
                            style={{ padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}
                          >
                            {quick}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={adjustLoading || !adjustPrompt.trim()}
                        onClick={() => handleAdjustWithAi(preset)}
                        className="btn-volt"
                        style={{
                          padding: '7px 12px',
                          fontSize: 12,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          cursor: 'pointer',
                        }}
                      >
                        {adjustLoading ? (
                          <Loader2 size={13} className="spot-spinner" />
                        ) : (
                          <Sparkles size={13} />
                        )}
                        <span>חשב מחדש עם AI והוסף לארוחה</span>
                      </button>
                    </div>
                  )}

                  {/* פאנל עריכת מנה שמורה */}
                  {isEditing && (
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 16,
                        background: 'var(--card)',
                        border: '1px solid var(--line)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <TextInput
                        size="xs"
                        label="שם המנה"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.currentTarget.value)}
                      />
                      {preset.recipeYieldGrams !== undefined && (
                        <TextInput
                          size="xs"
                          dir="ltr"
                          label="משקל סיר מוכן כולל (גרם)"
                          value={editYieldGrams}
                          onChange={(e) => setEditYieldGrams(e.currentTarget.value)}
                        />
                      )}
                      {editItems.map((it, idx) => (
                        <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.25fr 0.6fr auto',
                            gap: 6,
                            alignItems: 'end',
                          }}
                        >
                          <TextInput
                            size="xs"
                            label={idx === 0 ? 'שם מנה / פריט' : undefined}
                            value={it.name}
                            onChange={(e) => {
                              const val = e.currentTarget.value;
                              setEditItems((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, name: val } : x))
                              );
                            }}
                          />
                          <NumberInput
                            size="xs"
                            label={idx === 0 ? 'גרם' : undefined}
                            placeholder="100"
                            value={
                              editGramsDrafts[it.id] !== undefined
                                ? editGramsDrafts[it.id]
                                : it.grams
                            }
                            min={0.1}
                            max={10000}
                            decimalScale={1}
                            clampBehavior="none"
                            onChange={(val) => {
                              setEditGramsDrafts((prev) => ({
                                ...prev,
                                [it.id]: val,
                              }));
                              const parsed = parseOptionalDecimal(val);
                              if (parsed === undefined || parsed <= 0) return;
                              const g = clampGrams(parsed, it.grams);
                              setEditItems((prev) =>
                                prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  if (hasCompositeComponents(x)) {
                                    const curG = Math.max(0.1, x.grams);
                                    const factor = g / curG;
                                    return recalculateParentDish({
                                      ...x,
                                      components: x.components!.map((c) =>
                                        scaleSimpleFoodItemGrams(c, clampGrams(c.grams * factor, c.grams))
                                      ),
                                    });
                                  }
                                  return scaleSimpleFoodItemGrams(x, g);
                                })
                              );
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {idx === 0 && (
                              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>
                                שעה
                              </span>
                            )}
                            <ItemTimePill
                              value={it.itemTime}
                              placeholderLabel="שעה"
                              ariaLabel={`שעה עבור ${it.name}`}
                              clearAriaLabel={`אפס שעה עבור ${it.name}`}
                              height={30}
                              onChange={(nextT) => {
                                const clean = normalizeHhMmTime(nextT);
                                setEditItems((prev) =>
                                  prev.map((x, i) =>
                                    i === idx ? { ...x, itemTime: clean } : x
                                  )
                                );
                              }}
                            />
                          </div>
                        </div>
                        {hasCompositeComponents(it) && (
                          <div style={{ paddingInlineStart: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {it.components!.map((comp, cIdx) => (
                              <div
                                key={comp.id}
                                style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 6, alignItems: 'center' }}
                              >
                                <TextInput
                                  size="xs"
                                  value={comp.name}
                                  onChange={(e) => {
                                    const name = e.currentTarget.value;
                                    setEditItems((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? recalculateParentDish({
                                              ...x,
                                              components: x.components!.map((c, ci) =>
                                                ci === cIdx ? { ...c, name } : c
                                              ),
                                            })
                                          : x
                                      )
                                    );
                                  }}
                                />
                                <NumberInput
                                  size="xs"
                                  value={comp.grams}
                                  min={0.1}
                                  max={10000}
                                  decimalScale={1}
                                  onChange={(v) => {
                                    const p = parseOptionalDecimal(v);
                                    if (p === undefined || p <= 0) return;
                                    const nextG = clampGrams(p, comp.grams);
                                    setEditItems((prev) =>
                                      prev.map((x, i) =>
                                        i === idx
                                          ? recalculateParentDish({
                                              ...x,
                                              components: x.components!.map((c, ci) =>
                                                ci === cIdx
                                                  ? stripNestedComponents(scaleSimpleFoodItemGrams(c, nextG))
                                                  : c
                                              ),
                                            })
                                          : x
                                      )
                                    );
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={busyId === preset.id}
                        onClick={() => handleSaveEditedPreset(preset)}
                        className="btn-volt"
                        style={{ padding: '7px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                      >
                        <Check size={12} style={{ marginLeft: 4 }} />
                        שמור שינויים בספרייה
                      </button>
                    </div>
                  )}

                  {/* פאנל שאלה למאמן */}
                  {isAsking && (
                    <div
                      style={{
                        padding: 10,
                        borderRadius: 16,
                        background: 'rgba(56, 189, 248, 0.06)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <Textarea
                        size="xs"
                        label="כתוב שאלה ממוקדת למאמן על הארוחה"
                        placeholder="למשל: האם הכמות הזו מתאימה ליום אימון או כדאי להוריד כף טחינה?"
                        value={questionText}
                        onChange={(e) => setQuestionText(e.currentTarget.value)}
                        minRows={2}
                      />
                      <button
                        type="button"
                        disabled={busyId === preset.id || !questionText.trim()}
                        onClick={() => handleAskCoach(preset.id)}
                        className="btn-volt"
                        style={{ padding: '7px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                      >
                        שלח שאלה למאמן
                      </button>
                    </div>
                  )}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
