/**
 * חילוץ, נרמול וזיהוי מותגי מזון אמיתיים (אסם, תנובה, שטראוס, ALL IN, וכו')
 * והפרדה ברורה בין מותג המוצר לשם חנות/אתר סקרייפר.
 */

const SCRAPER_STORE_BRANDS = new Set<string>([
  'ויקטורי אונליין',
  'סופר ויקטורי',
  'סופרמרקט ויקטורי',
  'שופרסל אונליין',
  'ניצת הדובדבן',
  'fuder',
  'fuder סופרים',
  'fuder מוצרי סופרים',
  'foodgroups',
  'foodgroups מוצרי מדף',
  'foodik',
  'נטוגרין',
  'netogreen',
  'foodsdictionary',
  'טבע בריא',
  'סופרים בישראל',
  'open food facts',
  'open food facts ישראל',
  'openfoodfacts',
  'מאגר spot מקומי',
  'spot מקומי',
  'spot',
  'מאגר מזון',
  'משרד הבריאות',
  'המאמן שלי',
  'מוצר אישי',
  'מוצר אישי שלי',
  'מהמאמן שלי',
]);

export const FEATURED_ISRAELI_BRANDS: readonly string[] = [
  'תנובה',
  'שטראוס',
  'אסם',
  'ALL IN',
  'טרה',
  'מולר',
  'יטבתה',
  'גד',
  'עלית',
  'תלמה',
  'סוגת',
  'מאפיית ברמן',
  "אנג'ל",
  'טבעול',
  'זוגלובק',
  'מאמא עוף',
  'עוף טוב',
  'סטארקיסט',
  'צבר',
  'אחלה',
  'בארכה',
  'אחוה',
  'בייגל בייגל',
  'קוואקר',
  'אלפרו',
  'BioTechUSA',
  'Optimum Nutrition',
  'MyProtein',
  'Born Winner',
  'Quest',
  'ALFA',
  'WIN',
];

const BRAND_RULES: ReadonlyArray<{
  canonical: string;
  aliases: readonly string[];
  patterns: readonly RegExp[];
}> = [
  {
    canonical: 'ALL IN',
    aliases: ['all in', 'allin', 'all-in', 'all in nutrition', 'אול אין', 'אולאין'],
    patterns: [/(?:^|[\s|,/\-(])(?:all[\s\-]?in|אול\s*אין)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'תנובה',
    aliases: ['תנובה', 'tnuva', 'תנובה אלטרנטיב', 'תנובה alternative', 'תנובה go', 'יופלה', 'yoplait'],
    patterns: [/(?:^|[\s|,/\-(])(?:תנובה|tnuva|יופלה|yoplait)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'שטראוס',
    aliases: ['שטראוס', 'strauss', 'דנונה', 'דנונה pro', 'danone', 'אקטיביה', 'מילקי', 'סימפוניה', 'יטבתה שטראוס'],
    patterns: [/(?:^|[\s|,/\-(])(?:שטראוס|strauss|דנונה|danone|אקטיביה|מילקי)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'אסם',
    aliases: ['אסם', 'אוסם', 'osem', 'אסם נסטלה', 'במבה', 'במבה אסם', 'צבר אסם'],
    patterns: [/(?:^|[\s|,/\-(])(?:אוסם|אסם|osem)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'מולר',
    aliases: ['מולר', 'muller', 'müller', 'מולר פרופ'],
    patterns: [/(?:^|[\s|,/\-(])(?:מולר|m[uü]ller)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'טרה',
    aliases: ['טרה', 'tara', 'מחלבות טרה', 'טוב טעם טרה'],
    patterns: [/(?:^|[\s|,/\-(])(?:טרה|tara)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'יטבתה',
    aliases: ['יטבתה', 'yotvata', 'מחלבת יטבתה'],
    patterns: [/(?:^|[\s|,/\-(])(?:יטבתה|yotvata)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'גד',
    aliases: ['גד', 'gad', 'מחלבות גד'],
    patterns: [/(?:^|[\s|,/\-(])(?:מחלבות גד|גבינת גד|גד|gad)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'משק צוריאל',
    aliases: ['משק צוריאל', 'צוריאל'],
    patterns: [/(?:^|[\s|,/\-(])משק צוריאל(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'עלית',
    aliases: ['עלית', 'elite', 'עלית שטראוס'],
    patterns: [/(?:^|[\s|,/\-(])(?:עלית|elite)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'תלמה',
    aliases: ['תלמה', 'telma'],
    patterns: [/(?:^|[\s|,/\-(])(?:תלמה|telma)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'סוגת',
    aliases: ['סוגת', 'sugat'],
    patterns: [/(?:^|[\s|,/\-(])(?:סוגת|sugat)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'מאפיית ברמן',
    aliases: ['ברמן', 'מאפיית ברמן', 'berman', 'לחם ברמן'],
    patterns: [/(?:^|[\s|,/\-(])(?:מאפיית ברמן|ברמן|berman)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: "אנג'ל",
    aliases: ["אנג'ל", 'אנג׳ל', 'מאפיית אנגל', "מאפיית אנג'ל", 'עינן', 'angel'],
    patterns: [/(?:^|[\s|,/\-(])(?:אנג['׳]ל|מאפיית אנג['׳]ל|עינן)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'טבעול',
    aliases: ['טבעול', 'tivall'],
    patterns: [/(?:^|[\s|,/\-(])(?:טבעול|tivall)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'זוגלובק',
    aliases: ['זוגלובק', 'soglowek'],
    patterns: [/(?:^|[\s|,/\-(])(?:זוגלובק|soglowek)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'מאמא עוף',
    aliases: ['מאמא עוף', 'mama of'],
    patterns: [/(?:^|[\s|,/\-(])מאמא עוף(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'עוף טוב',
    aliases: ['עוף טוב', 'of tov'],
    patterns: [/(?:^|[\s|,/\-(])עוף טוב(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'טירת צבי',
    aliases: ['טירת צבי'],
    patterns: [/(?:^|[\s|,/\-(])טירת צבי(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'סטארקיסט',
    aliases: ['סטארקיסט', 'starkist'],
    patterns: [/(?:^|[\s|,/\-(])(?:סטארקיסט|starkist)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'ריאו',
    aliases: ['ריאו', 'rio mare', 'ריו מרה'],
    patterns: [/(?:^|[\s|,/\-(])(?:ריאו|ריו מרה|rio mare)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'צבר',
    aliases: ['צבר', 'סלטי צבר'],
    patterns: [/(?:^|[\s|,/\-(])(?:סלטי צבר|חומוס צבר|טחינת צבר|צבר)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'אחלה',
    aliases: ['אחלה', 'סלטי אחלה'],
    patterns: [/(?:^|[\s|,/\-(])(?:סלטי אחלה|אחלה)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'בארכה',
    aliases: ['בארכה', 'ברכה', 'הר ברכה'],
    patterns: [/(?:^|[\s|,/\-(])(?:בארכה|הר ברכה)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'אחוה',
    aliases: ['אחוה', 'אחווה'],
    patterns: [/(?:^|[\s|,/\-(])(?:אחוה|אחווה)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'בייגל בייגל',
    aliases: ['בייגל בייגל', 'beigel'],
    patterns: [/(?:^|[\s|,/\-(])בייגל בייגל(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'קוואקר',
    aliases: ['קוואקר', 'quaker'],
    patterns: [/(?:^|[\s|,/\-(])(?:קוואקר|quaker)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'אלפרו',
    aliases: ['אלפרו', 'alpro'],
    patterns: [/(?:^|[\s|,/\-(])(?:אלפרו|alpro)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'חלב הארץ',
    aliases: ['חלב הארץ'],
    patterns: [/(?:^|[\s|,/\-(])חלב הארץ(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'BioTechUSA',
    aliases: ['biotechusa', 'biotech usa', 'ביוטק'],
    patterns: [/(?:^|[\s|,/\-(])(?:biotech\s?usa|ביוטק)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'Optimum Nutrition',
    aliases: ['optimum nutrition', 'optimum', 'אופטימום', 'אופטימום נוטרישן'],
    patterns: [/(?:^|[\s|,/\-(])(?:optimum(?:\s+nutrition)?|אופטימום(?:\s+נוטרישן)?)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'MyProtein',
    aliases: ['myprotein', 'my protein', 'מיי פרוטאין', 'מייפרוטאין'],
    patterns: [/(?:^|[\s|,/\-(])(?:my\s?protein|מיי\s?פרוטאין)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'Born Winner',
    aliases: ['born winner', 'bornwinner', 'בורן ווינר'],
    patterns: [/(?:^|[\s|,/\-(])born\s+winner(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'Quest',
    aliases: ['quest', 'quest nutrition', 'קווסט'],
    patterns: [/(?:^|[\s|,/\-(])(?:quest(?:\s+nutrition)?|קווסט)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'ALFA',
    aliases: ['alfa', 'אלפא'],
    patterns: [/(?:^|[\s|,/\-(])(?:alfa|אלפא\s+(?:קראנץ|קרימי|פרו))(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'WIN',
    aliases: ['win'],
    patterns: [/(?:^|[\s|,/\-(])WIN(?=$|[\s|,/\-).])/],
  },
  {
    canonical: 'סאן ווריור',
    aliases: ['סאן ווריור', 'sunwarrior', 'sun warrior'],
    patterns: [/(?:^|[\s|,/\-(])(?:סאן\s+ווריור|sun\s?warrior)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'B&D',
    aliases: ['b&d', 'בטר אנד דיפרנט', 'better and different'],
    patterns: [/(?:^|[\s|,/\-(])(?:b\s*&\s*d|בטר אנד דיפרנט)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'היינץ',
    aliases: ['היינץ', 'heinz'],
    patterns: [/(?:^|[\s|,/\-(])(?:היינץ|heinz)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'הלמנס',
    aliases: ['הלמנס', 'hellmanns', "hellmann's"],
    patterns: [/(?:^|[\s|,/\-(])(?:הלמנס|hellmann'?s)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'קנור',
    aliases: ['קנור', 'knorr'],
    patterns: [/(?:^|[\s|,/\-(])(?:קנור|knorr)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'וילי פוד',
    aliases: ['וילי פוד', 'ויליפוד', 'willi food'],
    patterns: [/(?:^|[\s|,/\-(])(?:וילי\s?פוד)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'טבע דלי',
    aliases: ['טבע דלי', 'teva deli'],
    patterns: [/(?:^|[\s|,/\-(])טבע\s+דלי(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'סנפרוסט',
    aliases: ['סנפרוסט', 'sunfrost'],
    patterns: [/(?:^|[\s|,/\-(])(?:סנפרוסט|sunfrost)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'יכין',
    aliases: ['יכין', 'yachin'],
    patterns: [/(?:^|[\s|,/\-(])יכין(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'מיה',
    aliases: ['מיה', 'maya'],
    patterns: [/(?:^|[\s|,/\-(])מיה(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'הרדוף',
    aliases: ['הרדוף'],
    patterns: [/(?:^|[\s|,/\-(])הרדוף(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'קלוגס',
    aliases: ['קלוגס', 'קלוגז', "kellogg's", 'kelloggs'],
    patterns: [/(?:^|[\s|,/\-(])(?:קלוג[סז]|kellogg'?s)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'נסטלה',
    aliases: ['נסטלה', 'nestle', 'פיטנס', 'fitness'],
    patterns: [/(?:^|[\s|,/\-(])(?:נסטלה|nestl[eé]|דגני פיטנס)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'פרימור',
    aliases: ['פרימור'],
    patterns: [/(?:^|[\s|,/\-(])פרימור(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'פריגת',
    aliases: ['פריגת', 'prigat'],
    patterns: [/(?:^|[\s|,/\-(])(?:פריגת|prigat)(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'יד מרדכי',
    aliases: ['יד מרדכי'],
    patterns: [/(?:^|[\s|,/\-(])יד מרדכי(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'זיתא',
    aliases: ['זיתא', 'zeta'],
    patterns: [/(?:^|[\s|,/\-(])זיתא(?=$|[\s|,/\-).])/i],
  },
  {
    canonical: 'שופרסל',
    aliases: ['שופרסל', 'המותג שופרסל', 'green שופרסל'],
    patterns: [/(?:^|[\s|,/\-(])(?:שופרסל\s*green|המותג שופרסל)(?=$|[\s|,/\-).])/i],
  },
];

const BRAND_ALIAS_LOOKUP = new Map<string, string>();
for (const rule of BRAND_RULES) {
  BRAND_ALIAS_LOOKUP.set(rule.canonical.toLowerCase(), rule.canonical);
  for (const a of rule.aliases) {
    BRAND_ALIAS_LOOKUP.set(a.toLowerCase(), rule.canonical);
  }
}

function cleanRawBrandCandidate(raw?: string | null): string {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;|&#0?34;/g, '"')
    .replace(/&apos;|&#0?39;|&#0?96;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[״”]/g, '"')
    .replace(/[’׳]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function isScraperPlaceholderBrand(raw?: string | null): boolean {
  const clean = cleanRawBrandCandidate(raw).toLowerCase();
  if (!clean) return true;
  return SCRAPER_STORE_BRANDS.has(clean);
}

function isNonBrandNoise(candidate: string): boolean {
  const c = candidate.trim();
  if (!c || c.length < 2 || c.length > 42) return true;
  if (/^\d+(?:[.,]\d+)?\s*(?:גרם|ג|ג'|ק"ג|קג|מ"ל|מל|ל|%|קלוריות)?$/i.test(c)) {
    return true;
  }
  if (/^(?:בטעם|ללא|עשיר|מופחת|מארז|אריזה|קפוא|טרי|אורגני|חלבון|יוגורט|חטיף)/i.test(c)) {
    return true;
  }
  return false;
}

/**
 * מנרמל שם מותג קיים (למשל "אוסם" -> "אסם", "Allin" -> "ALL IN") ומסנן שמות סקרייפר/חנות פיקטיביים.
 */
export function canonicalizeBrandName(raw?: string | null): string | undefined {
  const clean = cleanRawBrandCandidate(raw);
  if (!clean || isNonBrandNoise(clean)) return undefined;
  const lower = clean.toLowerCase();
  if (SCRAPER_STORE_BRANDS.has(lower)) return undefined;

  const exactAlias = BRAND_ALIAS_LOOKUP.get(lower);
  if (exactAlias) return exactAlias;

  // שמירה על תוויות משולבות כמו "בארכה / הר ברכה" מהמאגר הקיים
  if (!clean.includes('/')) {
    for (const rule of BRAND_RULES) {
      if (rule.patterns.some((re) => re.test(clean))) {
        return rule.canonical;
      }
    }
  }

  return clean;
}

/**
 * מחלץ שם מותג אמיתי מתוך שדה מותג מפורש, פורמט הכותרת (, מותג / | מותג / - מותג), או מילון מותגים ישראלי.
 */
export function extractRealBrandFromProduct(params: {
  explicitBrand?: string | null;
  productName: string;
  sourceSiteId?: string;
}): string | undefined {
  const cleanName = cleanRawBrandCandidate(params.productName);

  // 1. מותג מפורש (מ-JSON-LD / תגית יצרן / OpenFoodFacts), לאחר ניקוי מצמד פסיקים
  if (params.explicitBrand) {
    const firstChunk = String(params.explicitBrand).split(',')[0]?.trim();
    const canonicalExplicit = canonicalizeBrandName(firstChunk);
    if (canonicalExplicit) return canonicalExplicit;
  }

  // 2. סיומות מובנות בשם המוצר: "... | מותג", "..., מותג", "... - מותג"
  if (cleanName.includes('|')) {
    const tail = cleanName.split('|').slice(1).pop()?.trim() || '';
    if (tail && !isNonBrandNoise(tail)) {
      const can = canonicalizeBrandName(tail);
      if (can) return can;
      if (tail.toLowerCase() === 'טבע בריא' && params.sourceSiteId === 'tevabari') {
        return 'טבע בריא';
      }
    }
  }

  if (cleanName.includes(',')) {
    const tail = cleanName.split(',').pop()?.trim() || '';
    if (tail && tail.length >= 2 && tail.length <= 28 && !isNonBrandNoise(tail)) {
      const can = canonicalizeBrandName(tail);
      if (can) return can;
    }
  }

  const dashMatch = cleanName.match(/\s[-–—]\s([^-–—]{2,30})$/);
  if (dashMatch?.[1]) {
    const tail = dashMatch[1].trim();
    if (!isNonBrandNoise(tail)) {
      if (tail === 'ניצת הדובדבן' && params.sourceSiteId === 'nizat') {
        return 'ניצת הדובדבן';
      }
      const can = canonicalizeBrandName(tail);
      if (can) return can;
    }
  }

  // 3. סריקת מילון מותגים בתוך שם המוצר (לדוגמה "שניצל תירס טבעול", "במבה אסם", "חטיף ALL IN")
  for (const rule of BRAND_RULES) {
    if (rule.patterns.some((re) => re.test(cleanName))) {
      return rule.canonical;
    }
  }

  // 4. יצרנים ישירים שמכל אתר היצרן עצמו הוא המותג
  if (params.sourceSiteId === 'sugat') return 'סוגת';
  if (params.sourceSiteId === 'tara') return 'טרה';
  if (params.sourceSiteId === 'berman') return 'מאפיית ברמן';

  return undefined;
}

export function getDisplayBrandForFood(item: {
  brand?: string | null;
  name?: string;
  sourceSiteId?: string;
}): string | undefined {
  return extractRealBrandFromProduct({
    explicitBrand: item.brand,
    productName: item.name || '',
    sourceSiteId: item.sourceSiteId,
  });
}

export function getBrandSearchTerms(brand: string): string[] {
  const clean = cleanRawBrandCandidate(brand);
  if (!clean) return [];
  const lower = clean.toLowerCase();
  const canonical = BRAND_ALIAS_LOOKUP.get(lower) || canonicalizeBrandName(clean) || clean;
  const terms = new Set<string>([clean, canonical]);
  const rule = BRAND_RULES.find(
    (r) => r.canonical.toLowerCase() === canonical.toLowerCase()
  );
  if (rule) {
    for (const alias of rule.aliases) {
      if (alias.length >= 2) terms.add(alias);
    }
  }
  return Array.from(terms);
}

export function matchesBrandSelection(
  item: { brand?: string | null; name?: string; sourceSiteId?: string },
  selectedBrand?: string | null
): boolean {
  if (!selectedBrand || selectedBrand === 'all') return true;
  const targetCanon = canonicalizeBrandName(selectedBrand) || selectedBrand.trim();
  const targetLower = targetCanon.toLowerCase();

  const rawBrand = cleanRawBrandCandidate(item.brand);
  if (rawBrand) {
    for (const part of rawBrand.split('/')) {
      const partClean = part.trim();
      if (!partClean || isScraperPlaceholderBrand(partClean)) continue;
      const partCanon = canonicalizeBrandName(partClean) || partClean;
      if (partCanon.toLowerCase() === targetLower || partClean.toLowerCase() === targetLower) {
        return true;
      }
    }
  }

  const inferred = getDisplayBrandForFood(item);
  if (inferred && inferred.toLowerCase() === targetLower) {
    return true;
  }

  const cleanName = cleanRawBrandCandidate(item.name);
  if (cleanName) {
    const rule = BRAND_RULES.find((r) => r.canonical.toLowerCase() === targetLower);
    if (rule && rule.patterns.some((re) => re.test(cleanName))) {
      return true;
    }
    if (cleanName.toLowerCase().includes(targetLower)) {
      return true;
    }
  }

  return false;
}
