'use client';

import { useEffect } from 'react';
import { useComputedColorScheme } from '@mantine/core';

const THEME_COLORS = { dark: '#000000', light: '#f2f2f4' } as const;

/**
 * Keeps the browser / PWA `theme-color` meta tag in sync with the active
 * color scheme (including a manual override from the theme toggle).
 */
export function ThemeMetaSync() {
  const scheme = useComputedColorScheme('dark', { getInitialValueInEffect: true });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const color = THEME_COLORS[scheme];
    let metas = Array.from(
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    );
    if (metas.length === 0) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
      metas = [meta];
    }
    metas.forEach((m) => {
      m.content = color;
      m.removeAttribute('media');
    });
  }, [scheme]);

  return null;
}
