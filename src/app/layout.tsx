import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';
import React from 'react';
import {
  ColorSchemeScript,
  DirectionProvider,
  MantineProvider,
  createTheme,
} from '@mantine/core';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'SPOT — מערכת תזונה ומעקב ביצועים',
  description:
    'פלטפורמת מעקב תזונה, ארוחות ופענוח AI מתקדם למאמנים ומתאמנים',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#08090c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

const theme = createTheme({
  primaryColor: 'lime',
  defaultRadius: 'md',
  fontFamily:
    '"Heebo", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <DirectionProvider initialDirection="rtl">
          <MantineProvider theme={theme} defaultColorScheme="dark">
            {children}
          </MantineProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
