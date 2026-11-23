import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  attachSessionCookie,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import { authenticateActiveSession } from '@/lib/liveAuth';
import { updateServerDbState } from '@/lib/serverStore';

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    const auth = await authenticateActiveSession(request, { touchLastSeen: true });
    if (!auth.ok) {
      return auth.response;
    }
    const session = auth.session;
    if (session.role !== 'trainee') {
      return NextResponse.json(
        { error: 'נדרשת התחברות כמתאמן' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as { name?: string };
    const cleanName = sanitizeText(body?.name, 80);
    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json(
        { error: 'יש להזין שם תצוגה של לפחות 2 תווים' },
        { status: 400 }
      );
    }

    const nextAvatar = cleanName.charAt(0) || auth.liveName.charAt(0) || 'מ';

    await updateServerDbState((prev) => ({
      ...prev,
      trainees: prev.trainees.map((t) =>
        t.id === session.id ? { ...t, name: cleanName, avatar: nextAvatar } : t
      ),
    }));

    const updatedUser = { ...session, name: cleanName };
    const res = NextResponse.json({
      ok: true,
      name: cleanName,
      avatar: nextAvatar,
      user: updatedUser,
    });
    return attachSessionCookie(res, updatedUser);
  } catch (error) {
    console.error('Update trainee profile error:', error);
    return NextResponse.json(
      { error: 'שגיאה בעדכון פרטי הפרופיל' },
      { status: 500 }
    );
  }
}
