'use client';

import React, { useCallback, useEffect, useRef } from 'react';

interface WheelColumnProps {
  label: string;
  count: number;
  value: number;
  onChange: (next: number) => void;
}

const ITEM_H = 52;
const VISIBLE = 3; // rows shown (selected one in the middle)

/** One scroll-snap column (momentum scrolling, snaps to a value, keyboard accessible). */
function WheelColumn({ label, count, value, onChange }: WheelColumnProps) {
  const ref = useRef<HTMLDivElement>(null);
  const settling = useRef<number | null>(null);
  const programmatic = useRef(false);

  const scrollToValue = useCallback((v: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    programmatic.current = true;
    el.scrollTo({ top: v * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
    window.setTimeout(() => {
      programmatic.current = false;
    }, smooth ? 350 : 60);
  }, []);

  // Sync from props (initial mount, "now" / template shortcuts).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (Math.round(el.scrollTop / ITEM_H) !== value) scrollToValue(value, el.scrollTop !== 0);
  }, [value, scrollToValue]);

  const onScroll = () => {
    if (programmatic.current) return;
    if (settling.current) window.clearTimeout(settling.current);
    settling.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const idx = Math.min(count - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
      if (idx !== value) onChange(idx);
    }, 90);
  };

  return (
    <div
      ref={ref}
      role="spinbutton"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={value}
      aria-valuetext={String(value).padStart(2, '0')}
      onScroll={onScroll}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          onChange((value + count - 1) % count);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          onChange((value + 1) % count);
        }
      }}
      style={{
        height: ITEM_H * VISIBLE,
        width: 84,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        touchAction: 'pan-y',
        paddingBlock: ITEM_H,
        boxSizing: 'border-box',
        outlineOffset: -2,
        position: 'relative',
        zIndex: 1,
      }}
      className="time-wheel-col"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          aria-hidden
          onClick={() => {
            onChange(i);
            scrollToValue(i, true);
          }}
          className="num-mono"
          style={{
            height: ITEM_H,
            scrollSnapAlign: 'center',
            scrollSnapStop: 'always',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: i === value ? 34 : 24,
            fontWeight: i === value ? 700 : 500,
            color: i === value ? 'var(--text)' : 'var(--text-3)',
            transition: 'font-size .12s ease, color .12s ease',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          {String(i).padStart(2, '0')}
        </div>
      ))}
    </div>
  );
}

interface TimeWheelProps {
  /** "HH:MM" (24h). */
  value: string;
  onChange: (next: string) => void;
}

/** Hour / minute wheel. Always laid out left-to-right (13 : 20) regardless of RTL. */
export function TimeWheel({ value, onChange }: TimeWheelProps) {
  const m = value.match(/^(\d{1,2}):(\d{2})$/);
  const hh = m ? Math.min(23, Number(m[1])) : 12;
  const mm = m ? Math.min(59, Number(m[2])) : 0;
  const emit = (h: number, mi: number) =>
    onChange(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);

  return (
    <div
      dir="ltr"
      style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
    >
      {/* Selection band behind the centre row */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          insetInline: 0,
          top: '50%',
          height: ITEM_H,
          transform: 'translateY(-50%)',
          borderRadius: 18,
          background: 'var(--surface-2)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <WheelColumn label="שעה" count={24} value={hh} onChange={(h) => emit(h, mm)} />
      <span aria-hidden className="num-mono" style={{ fontSize: 32, fontWeight: 700, position: 'relative', zIndex: 1 }}>
        :
      </span>
      <WheelColumn label="דקות" count={60} value={mm} onChange={(mi) => emit(hh, mi)} />
    </div>
  );
}
