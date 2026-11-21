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
} from 'lucide-react';
import {
  AiMealSuggestionOption,
  FoodCatalogItem,
  LoggedFoodItem,
  LoggedMealEntry,
  MealTemplateSlot,
} from '@/types/nutrition';
import {
  ISRAELI_FOOD_CATALOG,
  calculateMacrosForGrams,
  sumMacros,
} from '@/data/israeliFoodCatalog';
import { compressMealImage } from '@/utils/imageCompression';
import { BarcodeScannerModal } from './BarcodeScannerModal';

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
  learnedPreferences?: string[];
  onPreferenceLearned?: (prefs: string[]) => void;
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
}: AddMealDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [items, setItems] = useState<LoggedFoodItem[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    undefined
  );
  const [photoSizeKB, setPhotoSizeKB] = useState<number | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [photoMode, setPhotoMode] = useState<'plate' | 'nutrition-label'>('plate');
  const [freeTextPrompt, setFreeTextPrompt] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  const [aiRecommendations, setAiRecommendations] = useState<AiMealSuggestionOption[]>([]);
  const [aiRecLoading, setAiRecLoading] = useState(false);
  const [preferenceFeedbackText, setPreferenceFeedbackText] = useState('');
  const [learningPrefLoading, setLearningPrefLoading] = useState(false);
  const [learnedFeedbackBanner, setLearnedFeedbackBanner] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] =
    useState<FoodCatalogItem[]>(ISRAELI_FOOD_CATALOG);
  const [searchLoading, setSearchLoading] = useState(false);
  const [mohCount, setMohCount] = useState(0);

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

  useEffect(() => {
    if (opened && mealSlot) {
      setItems(existingEntry?.items ? [...existingEntry.items] : []);
      setPhotoDataUrl(existingEntry?.photoDataUrl);
      setPhotoSizeKB(null);
      setPhotoNote(existingEntry?.photoNote || '');
      setFreeTextPrompt('');
      setSearchQuery('');
      setAiRecommendations([]);
      setLearnedFeedbackBanner(null);
      setPreferenceFeedbackText('');
      setEditingItemId(null);
      setAiSummary(null);
      setActiveTab(initialTab);
      stopVoiceRecording();
    } else if (!opened) {
      stopVoiceRecording();
    }
    return () => {
      stopVoiceRecording();
    };
  }, [opened, mealSlot, existingEntry, initialTab]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults(ISRAELI_FOOD_CATALOG);
        setMohCount(0);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/food/search?q=${encodeURIComponent(searchQuery.trim())}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || []);
          setMohCount(data.mohCount || 0);
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 260);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  const handleSelectCatalogFood = (food: FoodCatalogItem) => {
    setSelectedFood(food);
    const firstUnit = food.units[0] || { label: '100 גרם', grams: 100 };
    setSelectedUnitLabel(firstUnit.label);
    setQuantity(1);
    setCustomGrams(firstUnit.grams);
  };

  const handleUnitChange = (unitLabel: string | null) => {
    if (!selectedFood || !unitLabel) return;
    setSelectedUnitLabel(unitLabel);
    if (unitLabel === 'custom-grams') return;
    const found = selectedFood.units.find((u) => u.label === unitLabel);
    if (found) {
      setCustomGrams(Math.round(found.grams * quantity));
    }
  };

  const handleQuantityChange = (val: string | number) => {
    const q = Math.max(0.25, Number(val) || 1);
    setQuantity(q);
    if (selectedFood && selectedUnitLabel !== 'custom-grams') {
      const found = selectedFood.units.find(
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAiSummary('נא לבחור קובץ תמונה תקין (JPG, PNG, WebP)');
      e.target.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setAiSummary('קובץ התמונה גדול מדי (מקסימום 20MB)');
      e.target.value = '';
      return;
    }
    setPhotoUploading(true);
    setAiSummary(null);
    try {
      const compressed = await compressMealImage(file, 800, 0.75);
      setPhotoDataUrl(compressed.dataUrl);
      setPhotoSizeKB(compressed.sizeKB);
    } catch {
      setAiSummary('לא ניתן לקרוא את התמונה – נסה לצלם שוב');
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
    const promptToUse =
      mode === 'photo' && photoMode === 'nutrition-label'
        ? `קרא את טבלת הערכים התזונתיים מהתמונה וחלץ את המוצר והערכים שלו למנה/100 גרם: ${rawPrompt}`
        : rawPrompt;
    aiLockRef.current = true;
    setAiLoading(true);
    if (optionIndex !== undefined) setAddingOptionIdx(optionIndex);
    setAiSummary(null);
    try {
      const res = await fetch('/api/ai/analyze-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl:
            mode === 'photo'
              ? photoDataUrl || 'data:image/webp;base64,DEMO'
              : undefined,
          textPrompt: promptToUse,
          customApiKey: geminiApiKey,
        }),
      });
      if (!res.ok) {
        setAiSummary('שגיאה בפענוח ה-AI – נסה שוב');
        return;
      }
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems((prev) => [...prev, ...data.items]);
        setAiSummary(
          `זוהו ${data.items.length} מרכיבים ונוספו לארוחה (ניתן לערוך כמויות וערכים למטה)`
        );
      } else {
        setAiSummary('לא זוהו מרכיבים – נסה לתאר בצורה מפורטת יותר');
      }
    } catch {
      setAiSummary('שגיאה בפענוח ה-AI');
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
      setAiSummary('הדפדפן שלך אינו תומך בהקלטה קולית (נסה Chrome או Safari)');
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
          remainingMacros,
          customApiKey: geminiApiKey,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.options)) {
        setAiRecommendations(data.options);
      } else {
        setAiSummary('לא התקבלו הצעות – נסה שוב');
      }
    } catch {
      setAiSummary('שגיאה בקבלת המלצות ארוחה מ-AI');
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
          feedbackText: preferenceFeedbackText.trim(),
          customApiKey: geminiApiKey,
        }),
      });
      const data = await res.json();
      if (res.ok && data.learnedRule) {
        setLearnedFeedbackBanner(`נלמד ונשמר לעתיד: "${data.learnedRule}"`);
        setPreferenceFeedbackText('');
        if (onPreferenceLearned && Array.isArray(data.allPreferences)) {
          onPreferenceLearned(data.allPreferences);
        }
      } else {
        setLearnedFeedbackBanner('שגיאה בשמירת ההעדפה');
      }
    } catch {
      setLearnedFeedbackBanner('שגיאה בשמירת ההעדפה');
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
          if (!savingMeal && !aiLoading) onClose();
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
                                setAiSummary(`נוספה לארוחה ההצעה: "${option.title}"`);
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
                      <span>משהו בהצעות לא מתאים לך? (זיכרון למידה לעתיד - ללא צ׳אט)</span>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        marginBottom: 8,
                      }}
                    >
                      רשום העדפה או הגבלה (למשל: &quot;אני לא אוכל גבינות חוץ מגבינה צהובה&quot; או &quot;אני לא אוכל גלוטן&quot;). המערכת תחלץ את הכלל ותזכור אותו אוטומטית בכל ההצעות הבאות.
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
                          background: 'rgba(34, 197, 94, 0.12)',
                          border: '1px solid rgba(34, 197, 94, 0.35)',
                          color: '#4ade80',
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        ✓ {learnedFeedbackBanner}
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
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    {searchLoading
                      ? 'סורק מאגר ישראלי ו-API משרד הבריאות...'
                      : `${searchResults.length} תוצאות ${
                          mohCount > 0
                            ? `(כולל ${mohCount} ממאגר משרד הבריאות)`
                            : ''
                        }`}
                  </span>
                  <span>ערכים ל-100 גרם / יחידת מידה</span>
                </div>

                <ScrollArea.Autosize mah={180} type="always">
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
                      gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                      gap: 8,
                    }}
                  >
                    {searchResults.slice(0, 20).map((food) => {
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
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
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
                              {food.brand ? `${food.brand} · ` : ''}
                              {food.per100g.calories} קק״ל
                            </div>
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
                          ...selectedFood.units.map((u) => ({
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
                    padding: 18,
                    textAlign: 'center',
                  }}
                >
                  {photoDataUrl ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <img
                        src={photoDataUrl}
                        alt="צילום ארוחה"
                        style={{
                          maxHeight: 170,
                          borderRadius: 12,
                          objectFit: 'cover',
                        }}
                      />
                      {photoSizeKB && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--accent-volt)',
                            fontWeight: 700,
                          }}
                        >
                          כווץ אוטומטית ל-{photoSizeKB}KB (WebP)
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
                          : 'צילום ארוחה לפענוח AI אוטומטי'}
                      </div>
                      <div
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                      >
                        {photoMode === 'nutrition-label'
                          ? 'ה-AI יקרא את הטבלה שעל האריזה (ל-100 גרם או למנה) ויוסיף לארוחה'
                          : 'ה-AI יזהה את המרכיבים, יעריך משקלים ויזין קלוריות ומאקרו'}
                      </div>
                    </div>
                  )}

                  <label
                    className="btn-surface"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      fontSize: 12,
                      cursor: photoUploading ? 'wait' : 'pointer',
                      marginTop: 8,
                      opacity: photoUploading ? 0.65 : 1,
                    }}
                  >
                    <Upload size={14} />
                    <span>
                      {photoUploading
                        ? 'מכווץ ומעבד תמונה...'
                        : photoDataUrl
                        ? 'החלף תמונה'
                        : 'בחר או צלם תמונה'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      disabled={photoUploading}
                      onChange={handlePhotoUpload}
                    />
                  </label>
                </div>

                <Textarea
                  label={
                    photoMode === 'nutrition-label'
                      ? 'שם המוצר וכמות שאכלת (למשל: חטיף חלבון - יחידה אחת 60 גרם)'
                      : 'הקשר לצילום עבור ה-AI (אופציונלי)'
                  }
                  placeholder={
                    photoMode === 'nutrition-label'
                      ? 'למשל: חטיף חלבון 60 גרם...'
                      : 'למשל: חזה עוף 150 גרם עם אורז, הסלט מתובל בכפית שמן זית...'
                  }
                  value={photoNote}
                  onChange={(e) => setPhotoNote(e.currentTarget.value)}
                  minRows={2}
                />

                <button
                  disabled={aiLoading}
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
                  {aiLoading ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Wand2 size={16} />
                  )}
                  <span>
                    {aiLoading
                      ? 'מפענח מרכיבים וכמויות...'
                      : photoMode === 'nutrition-label'
                      ? 'חלץ ערכים תזונתיים מהאריזה (AI)'
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

                <button
                  disabled={aiLoading || !freeTextPrompt.trim()}
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
                  {aiLoading ? (
                    <Loader2 size={16} className="spot-spinner" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  <span>
                    {aiLoading ? 'מחשב ערכים תזונתיים...' : 'פרק משפט לקלוריות ומאקרו'}
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

            {aiSummary && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'rgba(210, 255, 40, 0.1)',
                  border: '1px solid rgba(210, 255, 40, 0.3)',
                  color: 'var(--accent-volt)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {aiSummary}
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
                                gap: 8,
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
                    await onSaveMeal(mealSlot.id, items, photoDataUrl, photoNote);
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
        </ScrollArea>
      </Drawer>

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
