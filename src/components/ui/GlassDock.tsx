'use client';

import React from 'react';
import { Plus } from 'lucide-react';

export interface DockTab<T extends string = string> {
  id: T;
  label: string;
  icon: React.ReactNode;
}

interface GlassDockProps<T extends string = string> {
  tabs: DockTab<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Round orange-tinted action next to the dock (e.g. add meal). */
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
  };
  ariaLabel?: string;
}

/**
 * Floating liquid-glass bottom navigation with an optional separate round
 * action button. Renders a bottom fade so content scrolls under it cleanly.
 */
export function GlassDock<T extends string = string>({
  tabs,
  active,
  onChange,
  action,
  ariaLabel = 'ניווט ראשי',
}: GlassDockProps<T>) {
  return (
    <>
      <div className="mobile-dock-fade" aria-hidden />
      <div className="mobile-bottom-dock">
        <nav
          className="glass"
          aria-label={ariaLabel}
          style={{
            flex: 1,
            height: 66,
            borderRadius: 999,
            display: 'grid',
            gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
            padding: 6,
            gap: 2,
          }}
        >
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => onChange(t.id)}
                style={{
                  border: 'none',
                  borderRadius: 999,
                  background: on ? 'var(--line-2)' : 'transparent',
                  color: on ? 'var(--text)' : 'var(--text-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  minWidth: 0,
                  transition: 'background-color .18s ease, color .18s ease',
                }}
              >
                {t.icon}
                <span style={{ fontSize: 11, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap' }}>
                  {t.label}
                </span>
              </button>
            );
          })}
        </nav>
        {action && (
          <button
            type="button"
            className="glass glass-tint"
            aria-label={action.label}
            title={action.label}
            disabled={action.disabled}
            onClick={action.onClick}
            style={{
              width: 66,
              height: 66,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 'none',
              cursor: action.disabled ? 'not-allowed' : 'pointer',
              opacity: action.disabled ? 0.5 : 1,
            }}
          >
            {action.icon ?? <Plus size={28} strokeWidth={2.4} />}
          </button>
        )}
      </div>
    </>
  );
}
