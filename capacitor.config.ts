import type { CapacitorConfig } from '@capacitor/cli';

const PRODUCTION_APP_URL =
  process.env.CAPACITOR_SERVER_URL || 'https://spot-fitness-prod.vercel.app';

const config: CapacitorConfig = {
  appId: 'app.spotfitness.mobile',
  appName: 'SPOT Fitness',
  webDir: 'capacitor-shell',
  backgroundColor: '#08090c',
  server: {
    url: PRODUCTION_APP_URL,
    androidScheme: 'https',
    cleartext: false,
    errorPath: 'offline.html',
    allowNavigation: [
      'spot-fitness-prod.vercel.app',
      '*.vercel.app',
    ],
  },
  android: {
    backgroundColor: '#08090c',
    allowMixedContent: false,
    initialFocus: true,
  },
  plugins: {
    CapacitorHttp: {
      // קריטי: משאיר fetch ו-FormData המקוריים של WebView לעבודה תקינה בהעלאת תמונות ופענוח AI
      enabled: false,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // DARK = אייקונים וטקסט בהירים בסטטוס-בר על הרקע הכהה של SPOT
      style: 'DARK',
    },
    PushNotifications: {
      // הסתרה אוטומטית של באנר מערכת כשהאפליקציה פתוחה בחזית (מונע התראות AI כפולות כשהמשתמש במסך)
      presentationOptions: [],
    },
  },
};

export default config;
