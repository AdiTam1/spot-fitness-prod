'use client';

import React from 'react';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label (required for icon-only buttons). */
  label: string;
  size?: number;
  /** Orange-tinted glass — used for the floating + / mic actions. */
  tint?: boolean;
  /** Render a small orange notification dot. */
  dot?: boolean;
}

/** Round "liquid glass" icon button for floating / header controls. */
export const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  function GlassButton({ label, size = 44, tint = false, dot = false, style, className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        {...rest}
        className={['glass', tint ? 'glass-tint' : '', className || ''].join(' ').trim()}
        style={{
          width: size,
          height: size,
          minWidth: size,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          cursor: rest.disabled ? 'not-allowed' : 'pointer',
          opacity: rest.disabled ? 0.4 : 1,
          ...style,
        }}
      >
        {children}
        {dot && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: size * 0.2,
              left: size * 0.22,
              width: 8,
              height: 8,
              borderRadius: 99,
              background: 'var(--accent)',
            }}
          />
        )}
      </button>
    );
  }
);
