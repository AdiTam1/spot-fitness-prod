/** @type {import('next').NextConfig} */
const RESOLVED_WEB_BUILD_ID = (
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.NEXT_BUILD_ID ||
  `spot-${Date.now()}`
).slice(0, 32);

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // מסתיר את הכותרת X-Powered-By: Next.js מסורקי תוקפים
  env: {
    NEXT_PUBLIC_WEB_BUILD_ID: RESOLVED_WEB_BUILD_ID,
  },
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks', 'lucide-react'],
    serverComponentsExternalPackages: ['web-push'],
  },
  async headers() {
    const apkDownloadHeaders = [
      {
        key: 'Content-Type',
        value: 'application/vnd.android.package-archive',
      },
      {
        key: 'Content-Disposition',
        value: 'attachment; filename="spot-fitness-release.apk"',
      },
      {
        key: 'Cache-Control',
        value: 'public, max-age=300, must-revalidate',
      },
    ];
    return [
      {
        source: '/downloads/spot-fitness-release.apk',
        headers: apkDownloadHeaders,
      },
      {
        source: '/downloads/spot-fitness.apk',
        headers: apkDownloadHeaders,
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY', // מונע התקפות Clickjacking (הטמעת האתר ב-iframe זדוני)
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff', // מונע MIME-Sniffing XSS
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload', // כופה HTTPS בלבד
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()', // מתיר מצלמה רק לאפליקציה שלנו (לצילום אוכל וברקוד) וחוסם מיקרופון ומיקום
          },
        ],
      },
    ];
  },
};

export default nextConfig;
