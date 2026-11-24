'use client';

import { useEffect } from 'react';
import { useComputedColorScheme } from '@mantine/core';
import { Capacitor } from '@capacitor/core';
import { isNativeAndroidApp } from '@/lib/capacitorSteps';

const THEME_COLORS = { dark: '#000000', light: '#f2f2f4' } as const;

/**
 * Keeps the browser / PWA `theme-color` meta tag in sync with the active
 * color scheme (including a manual override from the theme toggle), and
 * normalizes Android Capacitor WebView safe-area insets so native system bars
 * don't cause double top/bottom padding.
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

    if (isNativeAndroidApp()) {
      const cap = Capacitor as unknown as {
        Plugins?: {
          SystemBars?: {
            setStyle?: (opts: { style: 'DARK' | 'LIGHT' }) => Promise<void>;
          };
        };
      };
      void cap.Plugins?.SystemBars?.setStyle?.({
        style: scheme === 'dark' ? 'DARK' : 'LIGHT',
      })?.catch(() => {});
    }
  }, [scheme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isNativeAndroidApp()) return;
    const root = document.documentElement;
    root.dataset.spotAndroidApp = '1';

    const syncAndroidInsets = () => {
      const dpr = window.devicePixelRatio || 1;
      const rawScreenH = window.screen?.height || 0;
      const cssScreenH =
        rawScreenH > window.innerHeight * 1.35 ? rawScreenH / dpr : rawScreenH;
      const reservedOutsidePx = Math.max(0, cssScreenH - window.innerHeight);

      // Ignore transient soft-keyboard resize (~200dp+) so insets stay stable while typing.
      if (reservedOutsidePx >= 180) return;

      const uaMatch = navigator.userAgent.match(/Android\s+(\d+)/i);
      const androidMajor = uaMatch ? Number(uaMatch[1]) : null;
      const barsAreExternal =
        reservedOutsidePx >= 24 ||
        (androidMajor !== null && Number.isFinite(androidMajor) && androidMajor < 15);

      root.dataset.spotAndroidInsetMode = barsAreExternal ? 'external' : 'edge';
    };

    syncAndroidInsets();
    const timer = window.setTimeout(syncAndroidInsets, 250);
    window.addEventListener('resize', syncAndroidInsets);
    window.addEventListener('orientationchange', syncAndroidInsets);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', syncAndroidInsets);
      window.removeEventListener('orientationchange', syncAndroidInsets);
    };
  }, []);

  return null;
}
