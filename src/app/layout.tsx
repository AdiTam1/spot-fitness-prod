import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';
import React from 'react';
import {
  ColorSchemeScript,
  DirectionProvider,
  MantineColorsTuple,
  MantineProvider,
  createTheme,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'SPOT — מערכת תזונה ומעקב ביצועים',
  description:
    'פלטפורמת מעקב תזונה, ארוחות ופענוח AI מתקדם למאמנים ומתאמנים',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Spot Fitness',
  },
};

export const viewport: Viewport = {
  themeColor: '#08090c',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

const spotOrange: MantineColorsTuple = [
  '#fef5e7',
  '#fae8cb',
  '#f4cf97',
  '#eeb45f',
  '#e99c2f',
  '#e68e13',
  '#d67d09',
  '#be6c03',
  '#a95f00',
  '#935000',
];

const theme = createTheme({
  primaryColor: 'orange',
  primaryShade: { dark: 6, light: 6 },
  colors: {
    orange: spotOrange,
  },
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
            <Notifications position="top-center" zIndex={300} />
            {children}
          </MantineProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
