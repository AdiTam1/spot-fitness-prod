'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
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
  ) => void;
  geminiApiKey?: string;
  initialTab?: string;
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
}: AddMealDrawerProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [items, setItems] = useState<LoggedFoodItem[]>([]);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(
    undefined
  );
  const [photoSizeKB, setPhotoSizeKB] = useState<number | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [freeTextPrompt, setFreeTextPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

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

  useEffect(() => {
    if (opened && mealSlot) {
      setItems(existingEntry?.items ? [...existingEntry.items] : []);
      setPhotoDataUrl(existingEntry?.photoDataUrl);
      setPhotoNote(existingEntry?.photoNote || '');
      setAiSummary(null);
      setActiveTab(initialTab);
    }
  }, [opened, mealSlot, existingEntry, initialTab]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!searchQuery.trim()) {
        setSearchResults(ISRAELI_FOOD_CATALOG);
        setMohCount(0);
        return;
      }
      setSearchLoading(true);
      try {
        const res = await fetch(
          `/api/food/search?q=${encodeURIComponent(searchQuery.trim())}`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.items || []);
          setMohCount(data.mohCount || 0);
        }
      } catch {
        // fallback local
      } finally {
        setSearchLoading(false);
      }
    }, 260);
    return () => clearTimeout(timer);
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressMealImage(file, 800, 0.75);
      setPhotoDataUrl(compressed.dataUrl);
      setPhotoSizeKB(compressed.sizeKB);
    } catch {
      // ignore
    }
  };

  const runAiAnalysis = async (mode: 'photo' | 'text') => {
    const promptToUse = mode === 'photo' ? photoNote : freeTextPrompt;
    setAiLoading(true);
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
      const data = await res.json();
      if (Array.isArray(data.items) && data.items.length > 0) {
        setItems((prev) => [...prev, ...data.items]);
        setAiSummary(
          `זוהו ${data.items.length} מרכיבים ונוספו לארוחה (ניתן לערוך כמויות וערכים למטה)`
        );
      }
    } catch {
      setAiSummary('שגיאה בפענוח ה-AI');
    } finally {
      setAiLoading(false);
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
        onClose={onClose}
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
        <ScrollArea h="calc(90vh - 125px)" offsetScrollbars>
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
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 6,
                background: 'var(--bg-surface-2)',
                padding: 4,
                borderRadius: 14,
                border: '1px solid var(--border-subtle)',
              }}
            >
              {[
                { id: 'catalog', label: 'מאגר מזון', icon: Search },
                { id: 'ai-photo', label: 'צילום AI', icon: Camera },
                { id: 'ai-text', label: 'טקסט AI', icon: Sparkles },
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
                      gap: 5,
                      padding: '9px 6px',
                      borderRadius: 10,
                      border: 'none',
                      background: active ? 'var(--accent-volt)' : 'transparent',
                      color: active ? '#08090c' : 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <Icon size={14} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

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
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
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

            {/* לשונית 2: צילום ארוחה + פענוח AI */}
            {activeTab === 'ai-photo' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                      <Camera size={32} color="var(--accent-volt)" />
                      <div style={{ fontSize: 14, fontWeight: 700 }}>
                        צילום ארוחה לפענוח AI אוטומטי
                      </div>
                      <div
                        style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                      >
                        ה-AI יזהה את המרכיבים, יעריך משקלים ויזין קלוריות ומאקרו
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
                      cursor: 'pointer',
                      marginTop: 8,
                    }}
                  >
                    <Upload size={14} />
                    <span>{photoDataUrl ? 'החלף תמונה' : 'בחר או צלם תמונה'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={handlePhotoUpload}
                    />
                  </label>
                </div>

                <Textarea
                  label="הקשר לצילום עבור ה-AI (אופציונלי)"
                  placeholder="למשל: חזה עוף 150 גרם עם אורז, הסלט מתובל בכפית שמן זית..."
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
                  <Wand2 size={16} />
                  <span>
                    {aiLoading ? 'מפענח מרכיבים וכמויות...' : 'פענח תמונה באמצעות AI'}
                  </span>
                </button>
              </div>
            )}

            {/* לשונית 3: טקסט חופשי ל-AI */}
            {activeTab === 'ai-text' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Textarea
                  label="תאר בטקסט חופשי מה אכלת (ללא צורך בצילום)"
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
                  <Sparkles size={16} />
                  <span>
                    {aiLoading ? 'מחשב ערכים תזונתיים...' : 'פרק משפט לקלוריות ומאקרו'}
                  </span>
                </button>
              </div>
            )}

            {/* לשונית 4: מועדפים */}
            {activeTab === 'favorites' && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
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
                              gridTemplateColumns: 'repeat(5, 1fr)',
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
                onClick={() => {
                  onSaveMeal(mealSlot.id, items, photoDataUrl, photoNote);
                  onClose();
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
                <Check size={16} />
                <span>שמור ארוחה</span>
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
