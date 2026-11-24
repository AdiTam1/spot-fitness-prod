'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NumberInput, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  Bookmark,
  Check,
  ChevronRight,
  Edit3,
  Heart,
  History,
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
  LoggedFoodItem,
  SavedMealPreset,
} from '@/types/nutrition';
import { sumMacros } from '@/data/israeliFoodCatalog';
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
  contextParams,
  onAddItemsToMeal,
  onOpenToolsModal,
  onSavedMealAction,
}: SavedMealsLibraryTabProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [filterMode, setFilterMode] = useState<
    'all' | 'pinned' | 'popular' | 'history' | 'questions'
  >('all');
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>('idle');
  const voiceControllerRef = useRef<VoiceCaptureController | null>(null);
  const recordingSearchVoice = voiceState !== 'idle';

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
  const [askingPresetId, setAskingPresetId] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    msg: string;
    isError?: boolean;
    engine?: string;
    isFallback?: boolean;
  } | null>(null);

  const sortedSavedMeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = [...savedMeals];
    if (filterMode === 'pinned') {
      list = list.filter((m) => m.isPinned || m.isFavorite);
    } else if (filterMode === 'questions') {
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
      if (filterMode !== 'popular' && a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
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

  const cloneItemsForLog = (items: LoggedFoodItem[]): LoggedFoodItem[] =>
    items.map((it, idx) => ({
      ...it,
      id: `preset-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
    }));

  const handleUsePresetExact = async (preset: SavedMealPreset) => {
    onAddItemsToMeal(
      cloneItemsForLog(preset.items),
      preset.photoDataUrl || preset.photoDataUrls?.[0]
    );
    setFeedbackBanner({ msg: `נטענה הארוחה "${preset.title}"` });
    if (onSavedMealAction) {
      await onSavedMealAction({ op: 'increment-use', presetId: preset.id });
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
    setBusyId(preset.id);
    try {
      const res = await onSavedMealAction({
        op: 'upsert',
        preset: {
          ...preset,
          title: editTitle.trim(),
          items: editItems,
        },
      });
      if (res.error) {
        setFeedbackBanner({ msg: res.error, isError: true });
        return;
      }
      setEditingPresetId(null);
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

        <button
          type="button"
          onClick={onOpenToolsModal}
          className="btn-surface"
          title="ניהול כלים ויחידות מדידה"
          style={{
            padding: '8px 11px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            borderColor: 'var(--line-2)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <Ruler size={13} color="currentColor" />
          <span>כלים ויחידות</span>
        </button>
      </div>

      {/* צ׳יפים לסינון */}
      <div data-h-scroll style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
        {[
          { id: 'all', label: `הכל (${savedMeals.length})` },
          { id: 'pinned', label: 'נעוצות / מועדפות' },
          { id: 'popular', label: 'פופולריות' },
          { id: 'history', label: `היסטוריה (${historicalMeals.length})` },
          { id: 'questions', label: 'התייעצות מאמן' },
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
              border: `1px solid ${filterMode === f.id ? 'var(--sel-bg)' : 'var(--line-2)'}`,
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
                  {entry.items.map((it) => `${it.name} (${it.unitLabel})`).join(' · ')}
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
              עדיין אין ארוחות שמורות בגלריה. בסיום הוספת ארוחה סמן <b>״שמור גם ב&apos;ארוחות שלי&apos;״</b> או שמור מתוך ההיסטוריה.
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
                          } else {
                            setEditingPresetId(preset.id);
                            setEditTitle(preset.title);
                            setEditItems(preset.items.map((x) => ({ ...x })));
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

                  {/* פירוט רכיבים */}
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {preset.items.map((it) => `${it.name} (${it.unitLabel})`).join(' · ')}
                  </div>

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
                      <span>הוסף בדיוק כמו שזה</span>
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
                      {editItems.map((it, idx) => (
                        <div
                          key={it.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.4fr 0.7fr',
                            gap: 6,
                            alignItems: 'end',
                          }}
                        >
                          <TextInput
                            size="xs"
                            label={idx === 0 ? 'שם רכיב' : undefined}
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
                            value={it.grams}
                            min={1}
                            max={3000}
                            onChange={(val) => {
                              const g = Math.max(1, Number(val) || 1);
                              setEditItems((prev) =>
                                prev.map((x, i) => {
                                  if (i !== idx) return x;
                                  const ratio = x.grams > 0 ? g / x.grams : 1;
                                  return {
                                    ...x,
                                    grams: g,
                                    unitLabel: `${g} גרם`,
                                    macros: {
                                      calories: Math.round(x.macros.calories * ratio),
                                      protein: Math.round(x.macros.protein * ratio * 10) / 10,
                                      carbs: Math.round(x.macros.carbs * ratio * 10) / 10,
                                      fat: Math.round(x.macros.fat * ratio * 10) / 10,
                                    },
                                  };
                                })
                              );
                            }}
                          />
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
