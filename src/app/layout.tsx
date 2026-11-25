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
import { ThemeMetaSync } from '@/components/ui/ThemeMetaSync';
import { InteractionLayer } from '@/components/ui/InteractionLayer';
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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
    { media: '(prefers-color-scheme: light)', color: '#f2f2f4' },
  ],
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

// Neutral (non-navy) gray scale used by Mantine's dark color scheme.
const neutralDark: MantineColorsTuple = [
  '#f5f5f5',
  '#c7c7cc',
  '#a8a8a8',
  '#8e8e93',
  '#5a5a5e',
  '#3a3a3c',
  '#2c2c2e',
  '#1c1c1e',
  '#111112',
  '#000000',
];

const theme = createTheme({
  primaryColor: 'orange',
  primaryShade: { dark: 6, light: 6 },
  colors: {
    orange: spotOrange,
    dark: neutralDark,
  },
  white: '#ffffff',
  black: '#0a0a0a',
  defaultRadius: 'lg',
  radius: { xs: '8px', sm: '12px', md: '16px', lg: '22px', xl: '28px' },
  fontFamily:
    '"Heebo", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace: '"Space Grotesk", "Heebo", sans-serif',
  headings: {
    fontFamily:
      '"Heebo", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    Button: { defaultProps: { radius: 'xl' } },
    Badge: { defaultProps: { radius: 'xl' } },
    SegmentedControl: { defaultProps: { radius: 'xl' } },
    // Decimal keypad everywhere numbers are typed (weights like 68.4 need the separator).
    NumberInput: {
      defaultProps: {
        inputMode: 'decimal',
        hideControls: true,
        allowedDecimalSeparators: ['.', ','],
      },
    },
    // Overlays slide up like native bottom sheets (Modals are restyled as sheets on phones).
    Modal: { defaultProps: { transitionProps: { transition: 'slide-up', duration: 220 } } },
  },
});


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Defaults to the OS preference; the user's toggle is persisted by Mantine in localStorage. */}
        <ColorSchemeScript defaultColorScheme="auto" />
      </head>
      <body>
        <DirectionProvider initialDirection="rtl">
          <MantineProvider
            theme={theme}
            defaultColorScheme="auto"
          >
            <ThemeMetaSync />
            <InteractionLayer />
            <Notifications position="top-center" zIndex={300} />
            {children}
          </MantineProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
