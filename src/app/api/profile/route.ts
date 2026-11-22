import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import {
  attachSessionCookie,
  clearSessionCookie,
  getSessionFromRequest,
  sanitizeText,
  verifyCsrfOrigin,
} from '@/lib/serverAuth';
import {
  getSingleTraineeFromServer,
  updateServerDbState,
} from '@/lib/serverStore';

export async function POST(request: NextRequest) {
  try {
    if (!verifyCsrfOrigin(request)) {
      return NextResponse.json(
        { error: 'בקשה אינה מורשית' },
        { status: 403 }
      );
    }

    const session = getSessionFromRequest(request);
    if (!session || session.role !== 'trainee') {
      return NextResponse.json(
        { error: 'נדרשת התחברות כמתאמן' },
        { status: 401 }
      );
    }

    const liveTrainee = await getSingleTraineeFromServer(session.id);
    if (!liveTrainee || liveTrainee.status !== 'active') {
      const res = NextResponse.json({ error: 'החשבון אינו פעיל' }, { status: 403 });
      return clearSessionCookie(res);
    }

    const body = (await request.json()) as { name?: string };
    const cleanName = sanitizeText(body?.name, 80);
    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json(
        { error: 'יש להזין שם תצוגה של לפחות 2 תווים' },
        { status: 400 }
      );
    }

    const nextAvatar = cleanName.charAt(0) || liveTrainee.avatar || 'מ';

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
