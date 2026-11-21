import { NextRequest, NextResponse } from 'next/server';

/**
 * שכבת הגנה היקפית (Next.js Edge Middleware)
 * חוסמת תבניות תקיפה (SQLi / XSS / Path Traversal) בכתובת ה-URL ומוסיפה כותרות CSP ואבטחה.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const fullUrl = `${pathname}${search}`;

  // 1. חסימת ניסיונות Path Traversal או הזרקת סקריפטים בפרמטרים של ה-URL
  let decodedUrl = fullUrl;
  try {
    decodedUrl = decodeURIComponent(fullUrl);
  } catch {
    return NextResponse.json({ error: 'Malformed URL' }, { status: 400 });
  }

  if (
    decodedUrl.includes('..') ||
    /<script/i.test(decodedUrl) ||
    /javascript:/i.test(decodedUrl) ||
    /union\s+select/i.test(decodedUrl)
  ) {
    return NextResponse.json(
      { error: 'Blocked by Edge Security Filter' },
      { status: 403 }
    );
  }

  const response = NextResponse.next();

  // 2. מניעת שמירת מידע אישי ב-Cache עבור כל נתיבי ה-API
  if (pathname.startsWith('/api/')) {
    response.headers.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
    );
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  // 3. כותרת Content-Security-Policy (CSP) להגנה מפני הזרקת סקריפטים חיצוניים
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
