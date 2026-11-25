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
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <label
        style={{
          position: 'relative',
          height,
          padding: '0 10px',
          borderRadius: 10,
          background: hasValue ? 'var(--sel-bg)' : 'var(--surface-2)',
          border: hasValue
            ? '1px solid var(--sel-border)'
            : '1px solid var(--line-2)',
          color: hasValue ? 'var(--sel-text)' : 'var(--text-2)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          fontSize: 12,
          fontWeight: hasValue ? 700 : 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <Clock size={12} />
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
          onClick={() => onChange('')}
          style={{
            width: height,
            height,
            borderRadius: 10,
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
          <X size={12} />
        </button>
      )}
    </div>
  );
}
