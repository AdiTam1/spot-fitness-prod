'use client';

import React from 'react';
import { Clock, X } from 'lucide-react';

interface ItemTimePillProps {
  value?: string;
  fallbackTime?: string;
  placeholderLabel?: string;
  ariaLabel: string;
  clearAriaLabel?: string;
  height?: number;
  onChange: (nextTime: string) => void;
}

/** Compact tappable time-picker pill with an optional clear button. */
export function ItemTimePill({
  value,
  fallbackTime = '12:00',
  placeholderLabel = 'שעה',
  ariaLabel,
  clearAriaLabel = 'אפס שעה',
  height = 30,
  onChange,
}: ItemTimePillProps) {
  const hasValue = Boolean(value);
  const compact = height <= 26;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
    >
      <label
        style={{
          position: 'relative',
          height,
          padding: compact ? '0 8px' : '0 10px',
          borderRadius: compact ? 8 : 10,
          background: hasValue ? 'var(--sel-bg)' : 'var(--surface-2)',
          border: hasValue
            ? '1px solid var(--sel-border)'
            : '1px solid var(--line-2)',
          color: hasValue ? 'var(--sel-text)' : 'var(--text-2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: compact ? 4 : 5,
          fontSize: compact ? 11.5 : 12,
          fontWeight: hasValue ? 700 : 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Clock size={compact ? 11 : 12} />
        <bdi dir="ltr" className="num-mono ltr-num">
          {value || placeholderLabel}
        </bdi>
        <input
          type="time"
          aria-label={ariaLabel}
          value={value || fallbackTime}
          onChange={(e) => onChange(e.currentTarget.value)}
          dir="ltr"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          }}
        />
      </label>
      {hasValue && (
        <button
          type="button"
          aria-label={clearAriaLabel}
          onClick={(e) => {
            e.stopPropagation();
            onChange('');
          }}
          style={{
            width: height,
            height,
            borderRadius: compact ? 8 : 10,
            border: '1px solid var(--line-2)',
            background: 'var(--surface-2)',
            color: 'var(--text-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <X size={compact ? 11 : 12} />
        </button>
      )}
    </div>
  );
}
