'use client';

import React from 'react';

export interface SegmentedPillOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface SegmentedPillProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedPillOption<T>[];
  ariaLabel?: string;
  size?: 'sm' | 'md';
  style?: React.CSSProperties;
}

/**
 * iOS-style segmented control: a pill track on surface-2 with the selected
 * segment lifted onto the card colour. Selection is never orange.
 */
export function SegmentedPill<T extends string = string>({
  value,
  onChange,
  options,
  ariaLabel,
  size = 'md',
  style,
}: SegmentedPillProps<T>) {
  const h = size === 'sm' ? 34 : 40;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        gap: 4,
        padding: 4,
        borderRadius: 999,
        background: 'var(--surface-2)',
        ...style,
      }}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            style={{
              height: h,
              minWidth: 0,
              borderRadius: 999,
              border: 'none',
              padding: '0 8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontFamily: 'inherit',
              fontSize: size === 'sm' ? 13 : 14,
              fontWeight: on ? 700 : 600,
              whiteSpace: 'nowrap',
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
              opacity: opt.disabled ? 0.45 : 1,
              background: on ? 'var(--card)' : 'transparent',
              color: on ? 'var(--text)' : 'var(--text-2)',
              boxShadow: on ? '0 2px 8px rgba(0,0,0,.18), inset 0 1px 0 var(--line-2)' : 'none',
              transition: 'background-color .18s ease, color .18s ease',
            }}
          >
            {opt.icon}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
