/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // מסתיר את הכותרת X-Powered-By: Next.js מסורקי תוקפים
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks', 'lucide-react'],
  },
  async headers() {
    return [
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
