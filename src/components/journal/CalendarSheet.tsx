'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { GlassButton } from '@/components/ui/GlassButton';

interface CalendarSheetProps {
  opened: boolean;
  onClose: () => void;
  cursor: { year: number; month: number };
  onCursorChange: (next: { year: number; month: number }) => void;
  selectedDate: string;
  todayIso: string;
  onSelectDate: (iso: string) => void;
  isDateActive: (iso: string) => boolean;
  isObservation: (iso: string) => boolean;
  isBlocked: (iso: string) => boolean;
  hasLog: (iso: string) => boolean;
  monthNames: string[];
  weekdayLetters: string[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

/**
 * Journal date picker as a bottom sheet.
 * Day grid (tap selects and closes, as before) + a month/year picker that opens
 * when tapping the month title, and a "back to today" action.
 */
export function CalendarSheet({
  opened,
  onClose,
  cursor,
  onCursorChange,
  selectedDate,
  todayIso,
  onSelectDate,
  isDateActive,
  isObservation,
  isBlocked,
  hasLog,
  monthNames,
  weekdayLetters,
}: CalendarSheetProps) {
  const [view, setView] = useState<'days' | 'months'>('days');
  useEffect(() => {
    if (opened) setView('days');
  }, [opened]);

  const { year, month } = cursor;
  const isDays = view === 'days';

  const monthHasActiveDays = (y: number, m: number) => {
    const dim = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) if (isDateActive(toIso(y, m, d))) return true;
    return false;
  };

  const goPrev = () => {
    if (isDays) {
      onCursorChange(month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
    } else {
      onCursorChange({ year: year - 1, month });
    }
  };
  const goNext = () => {
    if (isDays) {
      onCursorChange(month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
    } else {
      onCursorChange({ year: year + 1, month });
    }
  };

  const firstPad = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ iso: string; day: number } | null> = [];
  for (let i = 0; i < firstPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ iso: toIso(year, month, d), day: d });

  const todayYear = Number(todayIso.slice(0, 4));
  const years = [year - 1, year, year + 1];

  return (
    <Sheet
      opened={opened}
      onClose={onClose}
      size="auto"
      title="בחר תאריך"
      subtitle="ימים פעילים נקבעים ע״י המאמן"
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <GlassButton label={isDays ? 'חודש קודם' : 'שנה קודמת'} onClick={goPrev}>
          <ChevronRight size={18} />
        </GlassButton>
        <button
          type="button"
          aria-expanded={!isDays}
          onClick={() => setView(isDays ? 'months' : 'days')}
          style={{
            height: 44,
            padding: '0 16px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'inherit',
            fontSize: 17,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {isDays ? `${monthNames[month]} ${year}` : 'בחר חודש ושנה'}
          <ChevronDown
            size={16}
            style={{ transform: isDays ? 'none' : 'rotate(180deg)', transition: 'transform .2s ease' }}
          />
        </button>
        <GlassButton label={isDays ? 'חודש הבא' : 'שנה הבאה'} onClick={goNext}>
          <ChevronLeft size={18} />
        </GlassButton>
      </div>

      {isDays ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              aria-hidden
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                textAlign: 'center',
                fontSize: 12,
                color: 'var(--text-3)',
              }}
            >
              {weekdayLetters.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div role="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', rowGap: 4 }}>
              {cells.map((cell, i) => {
                if (!cell) return <div key={`pad-${i}`} />;
                const active = isDateActive(cell.iso);
                const sel = cell.iso === selectedDate;
                const today = cell.iso === todayIso;
                const obs = isObservation(cell.iso);
                const blocked = isBlocked(cell.iso);
                const logged = hasLog(cell.iso);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={!active}
                    aria-label={`${cell.day} ${monthNames[month]}${blocked ? ', חסום להזנה' : ''}${
                      obs ? ', יום תשקיף' : ''
                    }`}
                    aria-pressed={sel}
                    onClick={() => {
                      onSelectDate(cell.iso);
                      onClose();
                    }}
                    style={{
                      height: 46,
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      cursor: active ? 'pointer' : 'not-allowed',
                      fontFamily: 'inherit',
                    }}
                  >
                    <span
                      className="num-mono"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 15,
                        fontWeight: sel || today ? 700 : 500,
                        background: sel ? (blocked ? 'var(--status-danger)' : 'var(--accent)') : 'transparent',
                        color: sel
                          ? 'var(--on-accent)'
                          : active && !blocked
                          ? 'var(--text)'
                          : 'var(--text-3)',
                        border: `1.5px ${obs && !sel ? 'dashed' : 'solid'} ${
                          sel
                            ? 'transparent'
                            : today
                            ? 'var(--text)'
                            : obs
                            ? 'var(--macro-protein)'
                            : 'transparent'
                        }`,
                        textDecoration: blocked ? 'line-through' : 'none',
                        opacity: active ? 1 : 0.45,
                      }}
                    >
                      {cell.day}
                    </span>
                    <span
                      style={{
                        width: 4,
                        height: 4,
                        borderRadius: 9,
                        background: logged && !sel ? 'var(--text-2)' : 'transparent',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--text-2)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 4, height: 4, borderRadius: 9, background: 'var(--text-2)' }} />
              יש תיעוד
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{ width: 14, height: 14, borderRadius: 99, border: '1.5px dashed var(--macro-protein)' }}
              />
              יום תשקיף
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ textDecoration: 'line-through', color: 'var(--text-3)' }}>13</span>
              חסום להזנה
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 99, border: '1.5px solid var(--text)' }} />
              היום
            </span>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div role="radiogroup" aria-label="שנה" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {years.map((y) => {
              const on = y === year;
              return (
                <button
                  key={y}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="num-mono"
                  onClick={() => onCursorChange({ year: y, month })}
                  style={{
                    height: 44,
                    borderRadius: 14,
                    border: 'none',
                    fontSize: 16,
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: on ? 'var(--sel-bg)' : 'var(--surface-2)',
                    color: on ? 'var(--sel-text)' : y > todayYear ? 'var(--text-3)' : 'var(--text)',
                  }}
                >
                  {y}
                </button>
              );
            })}
          </div>
          <div role="radiogroup" aria-label="חודש" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {monthNames.map((name, i) => {
              const on = i === month;
              const act = monthHasActiveDays(year, i);
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    onCursorChange({ year, month: i });
                    setView('days');
                  }}
                  style={{
                    height: 56,
                    borderRadius: 18,
                    fontFamily: 'inherit',
                    fontSize: 15,
                    fontWeight: on ? 700 : 500,
                    cursor: 'pointer',
                    background: on ? 'var(--sel-bg)' : 'transparent',
                    color: on ? 'var(--sel-text)' : act ? 'var(--text)' : 'var(--text-3)',
                    border: `1px solid ${on ? 'var(--sel-bg)' : act ? 'var(--line-2)' : 'var(--line)'}`,
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
            חודשים מעומעמים נמצאים מחוץ לחלון הפעיל שהגדיר המאמן
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button
          type="button"
          className="glass"
          onClick={() => {
            const [ty, tm] = todayIso.split('-').map(Number);
            onCursorChange({ year: ty, month: tm - 1 });
            onSelectDate(todayIso);
            onClose();
          }}
          style={{
            height: 54,
            padding: '0 18px',
            borderRadius: 999,
            fontFamily: 'inherit',
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            flex: 'none',
          }}
        >
          חזור להיום
        </button>
        <button
          type="button"
          className="btn-volt"
          onClick={onClose}
          style={{ flex: 1, height: 54, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          סגור
        </button>
      </div>
    </Sheet>
  );
}
