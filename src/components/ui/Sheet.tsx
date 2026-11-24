'use client';

import React from 'react';
import { Drawer, type DrawerProps } from '@mantine/core';
import { X } from 'lucide-react';
import { GlassButton } from './GlassButton';

interface SheetProps extends Omit<DrawerProps, 'title' | 'position' | 'withCloseButton'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Extra controls rendered next to the close button. */
  headerExtra?: React.ReactNode;
}

/**
 * Bottom sheet: 34px top corners, grabber, large title + subtitle and a glass
 * close button. Thin wrapper over Mantine's Drawer so behaviour is unchanged.
 */
export function Sheet({ title, subtitle, headerExtra, children, onClose, size = '93%', styles, ...rest }: SheetProps) {
  return (
    <Drawer
      position="bottom"
      size={size}
      onClose={onClose}
      withCloseButton={false}
      padding={0}
      styles={{
        body: { padding: '10px 20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
        // `size="auto"` hugs the content (capped) instead of filling the viewport.
        ...(size === 'auto' ? { content: { height: 'auto', maxHeight: '93dvh', flex: '0 0 100%', width: '100%' } } : {}),
        ...(styles as object),
      }}
      {...rest}
    >
      <div className="sheet-grabber" aria-hidden />
      {(title || subtitle) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {title && <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{title}</h1>}
            {subtitle && <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{subtitle}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {headerExtra}
            <GlassButton label="סגירה" onClick={onClose}>
              <X size={18} strokeWidth={2.2} />
            </GlassButton>
          </div>
        </div>
      )}
      {children}
    </Drawer>
  );
}
