'use client';

import { useMantineColorScheme, type MantineColorScheme } from '@mantine/core';
import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedPill } from './SegmentedPill';

const OPTIONS: { value: MantineColorScheme; label: string; icon: React.ReactNode }[] = [
  { value: 'auto', label: 'מערכת', icon: <Monitor size={15} /> },
  { value: 'dark', label: 'כהה', icon: <Moon size={15} /> },
  { value: 'light', label: 'בהיר', icon: <Sun size={15} /> },
];

/**
 * Appearance switch (system / dark / light). Mantine persists the choice in
 * localStorage; "system" follows `prefers-color-scheme`.
 */
export function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  return (
    <SegmentedPill
      ariaLabel="מצב תצוגה"
      value={colorScheme}
      onChange={(v) => setColorScheme(v as MantineColorScheme)}
      options={OPTIONS}
    />
  );
}
