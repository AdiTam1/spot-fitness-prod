'use client';

import React from 'react';
import { Check } from 'lucide-react';

interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  selected?: boolean;
  icon?: React.ReactNode;
  /** Hide the leading ✓ on selected chips (e.g. for filter tabs with counts). */
  hideCheck?: boolean;
  size?: 'sm' | 'md';
}

/**
 * Selectable pill. Selected = filled neutral button colour + white bold text + ✓.
 * Unselected = transparent with a thin border at full opacity (never dimmed).
 */
export function Chip({
  selected = false,
  icon,
  hideCheck = false,
  size = 'md',
  style,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      style={{
        height: size === 'sm' ? 34 : 40,
        padding: size === 'sm' ? '0 12px' : '0 14px',
        borderRadius: 999,
        fontFamily: 'inherit',
        fontSize: size === 'sm' ? 13 : 14,
        fontWeight: selected ? 700 : 500,
        background: selected ? 'var(--sel-bg)' : 'transparent',
        color: selected ? 'var(--sel-text)' : 'var(--text)',
        border: `1px solid ${selected ? 'var(--sel-bg)' : 'var(--line-2)'}`,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color .15s ease, border-color .15s ease',
        ...style,
      }}
    >
      {selected && !hideCheck ? <Check size={15} strokeWidth={2.8} /> : icon}
      {children}
    </button>
  );
}
