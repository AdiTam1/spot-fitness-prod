import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { getSessionFromRequest } from '@/lib/serverAuth';
import { enrichCatalogItemFromSourceUrl } from '@/lib/scrapers/israeliScrapers';
import { persistCatalogItemsToDb } from '@/lib/scrapers/scraperStore';
import { isValidMacroSet } from '@/lib/scrapers/helpers';
import { FoodCatalogItem } from '@/types/nutrition';

export const runtime = 'nodejs';

/**
 * מעשיר מוצר מה-DB בהעשרה מהירה לפי כתובת המקור שלו (משיכת ברקוד ומשקלי חבילה מלאים),
 * ומעדכן את הטבלה ברקע לשימוש עתידי מיידי.
 */
export async function POST(request: NextRequest) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { item?: FoodCatalogItem };
    const item = body?.item;
    if (!item || !item.id || !item.name || !item.sourceUrl) {
      return NextResponse.json({ item });
    }

    const enriched = await enrichCatalogItemFromSourceUrl(item);
    const improved =
      Boolean(enriched.barcode && !item.barcode) ||
      (enriched.units?.length || 0) > (item.units?.length || 0);

    if (improved && isValidMacroSet(enriched.per100g)) {
      try {
        waitUntil(persistCatalogItemsToDb([enriched]).catch(() => undefined));
      } catch {
        // ignore outside Vercel lifecycle
      }
    }

    return NextResponse.json({ item: enriched, improved });
  } catch {
    return NextResponse.json({ error: 'שגיאה בהעשרת פרטי מוצר' }, { status: 500 });
  }
}
