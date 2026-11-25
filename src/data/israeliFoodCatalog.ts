import { FoodCatalogItem, MacroTargets, NutritionTemplate, TraineeProfile } from '@/types/nutrition';

export const ISRAELI_FOOD_CATALOG: FoodCatalogItem[] = [
  {
    id: 'krembo-strauss',
    name: 'קרמבו וניל / מוקה',
    brand: 'שטראוס',
    category: 'חטיפים ומתוקים',
    barcode: '7290000066318',
    per100g: { calories: 380, protein: 3.2, carbs: 64, fat: 12 },
    units: [
      { label: 'יחידה (25 גרם)', grams: 25 },
      { label: '2 יחידות (50 גרם)', grams: 50 },
      { label: '100 גרם', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'cottage-tnuva-5',
    name: "קוטג' 5%",
    brand: 'תנובה',
    category: 'מוצרי חלב',
    barcode: '7290004127329',
    per100g: { calories: 93, protein: 11, carbs: 1.5, fat: 5 },
    units: [
      { label: 'גביע שלם (250 גרם)', grams: 250 },
      { label: 'חצי גביע (125 גרם)', grams: 125 },
      { label: 'כף גדושה (25 גרם)', grams: 25 },
      { label: '100 גרם', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'cottage-tnuva-3',
    name: "קוטג' 3%",
    brand: 'תנובה',
    category: 'מוצרי חלב',
    barcode: '7290004127336',
    per100g: { calories: 76, protein: 11.2, carbs: 1.5, fat: 3 },
    units: [
      { label: 'גביע שלם (250 גרם)', grams: 250 },
      { label: 'חצי גביע (125 גרם)', grams: 125 },
      { label: 'כף גדושה (25 גרם)', grams: 25 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'chicken-breast-grilled',
    name: 'חזה עוף צלוי / על הפלנצ׳ה',
    category: 'בשר, עוף ודגים',
    per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
    units: [
      { label: 'מנה בינונית (150 גרם)', grams: 150 },
      { label: 'מנה גדולה (200 גרם)', grams: 200 },
      { label: 'נתח אחד (100 גרם)', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'basmati-rice-cooked',
    name: 'אורז בסמטי לבן מבושל',
    category: 'פחמימות ודגנים',
    per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
    units: [
      { label: 'כוס מבושלת (160 גרם)', grams: 160 },
      { label: 'כף גדושה (25 גרם)', grams: 25 },
      { label: 'מנה (200 גרם)', grams: 200 },
      { label: '100 גרם', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'egg-whole',
    name: 'ביצה (קשה / חביתה / מקושקשת)',
    category: 'ביצים ומוצרי חלב',
    per100g: { calories: 143, protein: 12.6, carbs: 0.7, fat: 9.5 },
    units: [
      { label: 'יחידה L (60 גרם)', grams: 60 },
      { label: '2 ביצים L (120 גרם)', grams: 120 },
      { label: '3 ביצים L (180 גרם)', grams: 180 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'raw-tahini',
    name: 'טחינה גולמית (100% שומשום)',
    brand: 'בארכה / הר ברכה',
    category: 'שומנים בריאים',
    barcode: '7290000181509',
    per100g: { calories: 645, protein: 22, carbs: 11, fat: 58 },
    units: [
      { label: 'כף אחת (15 גרם)', grams: 15 },
      { label: 'כפית (5 גרם)', grams: 5 },
      { label: '2 כפות (30 גרם)', grams: 30 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'prepared-tahini',
    name: 'טחינה מוכנה (מתובלת עם מים ולימון)',
    category: 'שומנים בריאים',
    per100g: { calories: 330, protein: 11, carbs: 6, fat: 29 },
    units: [
      { label: 'כף אחת (20 גרם)', grams: 20 },
      { label: '2 כפות (40 גרם)', grams: 40 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'spelt-bread-sliced',
    name: 'לחם כוסמין מלא פרוס',
    brand: 'אנג׳ל / ברמן',
    category: 'פחמימות ודגנים',
    barcode: '7290000072500',
    per100g: { calories: 235, protein: 10.5, carbs: 40, fat: 2.8 },
    units: [
      { label: 'פרוסה אחת (32 גרם)', grams: 32 },
      { label: '2 פרוסות (64 גרם)', grams: 64 },
      { label: '100 גרם', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'light-bread',
    name: 'לחם קל דגנים',
    brand: 'אנג׳ל / עינן',
    category: 'פחמימות ודגנים',
    per100g: { calories: 175, protein: 9.8, carbs: 29, fat: 1.8 },
    units: [
      { label: 'פרוסה אחת (25 גרם)', grams: 25 },
      { label: '2 פרוסות (50 גרם)', grams: 50 },
    ],
    source: 'local',
  },
  {
    id: 'bamba-osem',
    name: 'במבה קלאסית',
    brand: 'אסם',
    category: 'חטיפים ומתוקים',
    barcode: '7290000068787',
    per100g: { calories: 534, protein: 14.5, carbs: 56.5, fat: 27.5 },
    units: [
      { label: 'שקית קטנה (25 גרם)', grams: 25 },
      { label: 'שקית רגילה (60 גרם)', grams: 60 },
      { label: 'שקית גדולה (80 גרם)', grams: 80 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'danone-pro-20',
    name: 'יוגורט דנונה PRO חלבון (20 גרם)',
    brand: 'שטראוס',
    category: 'מוצרי חלב',
    barcode: '7290107645058',
    per100g: { calories: 67, protein: 10, carbs: 5.5, fat: 0.5 },
    units: [
      { label: 'גביע אחד (200 גרם)', grams: 200 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'go-protein-milkshake',
    name: 'משקה חלבון GO (25 גרם חלבון)',
    brand: 'תנובה',
    category: 'מוצרי חלב',
    barcode: '7290110328412',
    per100g: { calories: 53, protein: 7.4, carbs: 4.5, fat: 0.5 },
    units: [
      { label: 'בקבוק אישי (340 מ״ל)', grams: 340 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'tuna-in-water',
    name: 'טונה בהירה במים (מסוננת)',
    brand: 'סטארקיסט / ריאו',
    category: 'בשר, עוף ודגים',
    barcode: '7290000120836',
    per100g: { calories: 112, protein: 26, carbs: 0, fat: 0.8 },
    units: [
      { label: 'קופסה אחת מסוננת (112 גרם)', grams: 112 },
      { label: 'חצי קופסה (56 גרם)', grams: 56 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'tuna-in-oil',
    name: 'טונה בהירה בשמן (מסוננת)',
    brand: 'סטארקיסט',
    category: 'בשר, עוף ודגים',
    barcode: '7290000120829',
    per100g: { calories: 194, protein: 26, carbs: 0, fat: 10 },
    units: [
      { label: 'קופסה אחת מסוננת (112 גרם)', grams: 112 },
    ],
    source: 'local',
  },
  {
    id: 'oats-quaker',
    name: 'שיבולת שועל להכנה מהירה (קוואקר)',
    brand: 'קוואקר',
    category: 'פחמימות ודגנים',
    barcode: '7290000211411',
    per100g: { calories: 379, protein: 13.2, carbs: 67.7, fat: 6.5 },
    units: [
      { label: 'כף גדושה (10 גרם)', grams: 10 },
      { label: 'חצי כוס יבשה (40 גרם)', grams: 40 },
      { label: 'כוס יבשה (80 גרם)', grams: 80 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'salmon-fillet-baked',
    name: 'פילה סלמון אפוי בתנור',
    category: 'בשר, עוף ודגים',
    per100g: { calories: 206, protein: 22, carbs: 0, fat: 12 },
    units: [
      { label: 'נתח סטנדרטי (160 גרם)', grams: 160 },
      { label: 'נתח גדול (220 גרם)', grams: 220 },
      { label: '100 גרם', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'olive-oil',
    name: 'שמן זית כתית מעולה',
    category: 'שומנים בריאים',
    per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 },
    units: [
      { label: 'כפית (5 גרם)', grams: 5 },
      { label: 'כף (10 גרם)', grams: 10 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'avocado-fresh',
    name: 'אבוקדו טרי (ללא קליפה)',
    category: 'שומנים בריאים',
    per100g: { calories: 160, protein: 2, carbs: 8.5, fat: 14.7 },
    units: [
      { label: 'רבע אבוקדו (40 גרם)', grams: 40 },
      { label: 'חצי אבוקדו (80 גרם)', grams: 80 },
      { label: 'אבוקדו שלם (160 גרם)', grams: 160 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'sweet-potato-baked',
    name: 'בטטה אפויה בתנור',
    category: 'פחמימות ודגנים',
    per100g: { calories: 90, protein: 2, carbs: 20.7, fat: 0.2 },
    units: [
      { label: 'בטטה בינונית (150 גרם)', grams: 150 },
      { label: 'בטטה גדולה (250 גרם)', grams: 250 },
      { label: '100 גרם', grams: 100 },
    ],
    source: 'local',
  },
  {
    id: 'emek-cheese-9',
    name: 'גבינה צהובה עמק לייט 9%',
    brand: 'תנובה',
    category: 'מוצרי חלב',
    barcode: '7290000042213',
    per100g: { calories: 205, protein: 31, carbs: 0.5, fat: 9 },
    units: [
      { label: 'פרוסה אחת (25 גרם)', grams: 25 },
      { label: '2 פרוסות (50 גרם)', grams: 50 },
    ],
    source: 'local',
  },
  {
    id: 'emek-cheese-28',
    name: 'גבינה צהובה עמק 28%',
    brand: 'תנובה',
    category: 'מוצרי חלב',
    barcode: '7290000042190',
    per100g: { calories: 353, protein: 25, carbs: 0.5, fat: 28 },
    units: [
      { label: 'פרוסה אחת (25 גרם)', grams: 25 },
    ],
    source: 'local',
  },
  {
    id: 'whey-protein-scoop',
    name: 'אבקת חלבון מי גבינה (Whey)',
    brand: 'אופטימום / אלפא / Allin',
    category: 'תוספי תזונה',
    per100g: { calories: 385, protein: 78, carbs: 8, fat: 4.5 },
    units: [
      { label: 'סקופ אחד (32 גרם)', grams: 32 },
      { label: 'סקופ וחצי (48 גרם)', grams: 48 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'banana-fresh',
    name: 'בננה',
    category: 'פירות וירקות',
    per100g: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
    units: [
      { label: 'יחידה בינונית (115 גרם)', grams: 115 },
      { label: 'יחידה קטנה (90 גרם)', grams: 90 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'apple-fresh',
    name: 'תפוח עץ',
    category: 'פירות וירקות',
    per100g: { calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
    units: [
      { label: 'יחידה בינונית (160 גרם)', grams: 160 },
    ],
    source: 'local',
  },
  {
    id: 'almonds-natural',
    name: 'שקדים טבעיים',
    category: 'שומנים בריאים',
    per100g: { calories: 579, protein: 21, carbs: 21.5, fat: 50 },
    units: [
      { label: 'חופן / 10 שקדים (12 גרם)', grams: 12 },
      { label: '20 שקדים (24 גרם)', grams: 24 },
    ],
    source: 'local',
  },
  {
    id: 'israeli-salad',
    name: 'סלט ירקות קצוץ (ללא שמן)',
    category: 'פירות וירקות',
    per100g: { calories: 22, protein: 0.9, carbs: 4.4, fat: 0.2 },
    units: [
      { label: 'קערה אישית (200 גרם)', grams: 200 },
      { label: 'קערה גדולה (350 גרם)', grams: 350 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'Beef-lean-steak',
    name: 'סינטה / פילה בקר רזה צלוי',
    category: 'בשר, עוף ודגים',
    per100g: { calories: 205, protein: 29, carbs: 0, fat: 9.5 },
    units: [
      { label: 'מנה (150 גרם)', grams: 150 },
      { label: 'סטייק (220 גרם)', grams: 220 },
    ],
    source: 'local',
  },
  {
    id: 'white-cheese-tnuva-5',
    name: 'גבינה לבנה 5%',
    brand: 'תנובה',
    category: 'מוצרי חלב',
    per100g: { calories: 95, protein: 9.5, carbs: 4, fat: 5 },
    units: [
      { label: 'כף גדושה (25 גרם)', grams: 25 },
      { label: 'חצי גביע (125 גרם)', grams: 125 },
      { label: 'גביע שלם (250 גרם)', grams: 250 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'chocolate-para-milk',
    name: 'שוקולד פרה חלב',
    brand: 'עלית שטראוס',
    category: 'חטיפים ומתוקים',
    per100g: { calories: 542, protein: 7, carbs: 58, fat: 31 },
    units: [
      { label: 'קובייה אחת (4.2 גרם)', grams: 4 },
      { label: 'שורה (4 קוביות - 17 גרם)', grams: 17 },
      { label: 'חפיסה (100 גרם)', grams: 100 },
    ],
    isPopular: true,
    source: 'local',
  },
  {
    id: 'dark-chocolate-70',
    name: 'שוקולד מריר 70% מוצקי קקאו',
    brand: 'עלית / לינדט',
    category: 'חטיפים ומתוקים',
    per100g: { calories: 580, protein: 8.5, carbs: 34, fat: 44 },
    units: [
      { label: 'קובייה (5 גרם)', grams: 5 },
      { label: 'שורה (20 גרם)', grams: 20 },
      { label: '100 גרם', grams: 100 },
    ],
    source: 'local',
  },
  {
    id: 'chocolate-chip-cookie',
    name: 'עוגיית שוקולד צ׳יפס',
    brand: 'אסם / מאפה ביתי',
    category: 'חטיפים ומתוקים',
    per100g: { calories: 488, protein: 5.8, carbs: 65, fat: 23 },
    units: [
      { label: 'עוגייה אחת (20 גרם)', grams: 20 },
      { label: '2 עוגיות (40 גרם)', grams: 40 },
      { label: '100 גרם', grams: 100 },
    ],
    source: 'local',
  },
  {
    id: 'milky-strauss',
    name: 'מילקי שוקולד עם קצפת',
    brand: 'שטראוס',
    category: 'מוצרי חלב',
    per100g: { calories: 139, protein: 3.1, carbs: 20.5, fat: 4.8 },
    units: [
      { label: 'גביע אחד (170 גרם)', grams: 170 },
    ],
    source: 'local',
  },
  {
    id: 'schnitzel-homemade',
    name: 'שניצל עוף ביתי מטוגן',
    category: 'בשר, עוף ודגים',
    per100g: { calories: 225, protein: 24, carbs: 12, fat: 9 },
    units: [
      { label: 'יחידה בינונית (130 גרם)', grams: 130 },
      { label: '2 יחידות (260 גרם)', grams: 260 },
    ],
    source: 'local',
  },
  {
    id: 'schnitzel-baked-homemade',
    name: 'שניצל עוף אפוי בתנור',
    category: 'בשר, עוף ודגים',
    per100g: { calories: 165, protein: 24.5, carbs: 9.5, fat: 3.1 },
    units: [
      { label: 'יחידה בינונית (130 גרם)', grams: 130 },
      { label: '2 יחידות (260 גרם)', grams: 260 },
    ],
    source: 'local',
  },
  {
    id: 'chicken-liver-baked',
    name: 'כבד עוף אפוי / צלוי',
    category: 'בשר, עוף ודגים',
    per100g: { calories: 172, protein: 25.8, carbs: 1.1, fat: 6.4 },
    units: [
      { label: 'מנה בינונית (150 גרם)', grams: 150 },
      { label: 'חצי מנה (75 גרם)', grams: 75 },
      { label: 'יחידה ממוצעת (35 גרם)', grams: 35 },
    ],
    source: 'local',
  },
  {
    id: 'beet-cooked',
    name: 'סלק אדום מבושל / אפוי',
    category: 'ירקות וסלטים',
    per100g: { calories: 44, protein: 1.7, carbs: 10.0, fat: 0.2 },
    units: [
      { label: 'יחידה בינונית (100 גרם)', grams: 100 },
      { label: 'כוס קוביות (150 גרם)', grams: 150 },
    ],
    source: 'local',
  },
  {
    id: 'quinoa-cooked',
    name: 'קינואה מבושלת',
    category: 'פחמימות ודגנים',
    per100g: { calories: 120, protein: 4.4, carbs: 21.3, fat: 1.9 },
    units: [
      { label: 'כוס מבושלת (185 גרם)', grams: 185 },
      { label: 'חצי כוס (90 גרם)', grams: 90 },
    ],
    source: 'local',
  },
  {
    id: 'sweet-potato-baked',
    name: 'בטטה אפויה בתנור',
    category: 'פחמימות ודגנים',
    per100g: { calories: 90, protein: 2.0, carbs: 20.7, fat: 0.2 },
    units: [
      { label: 'יחידה בינונית (150 גרם)', grams: 150 },
      { label: 'יחידה גדולה (250 גרם)', grams: 250 },
    ],
    source: 'local',
  },
  {
    id: 'pasta-cooked',
    name: 'פסטה מבושלת',
    category: 'פחמימות ודגנים',
    per100g: { calories: 155, protein: 5.5, carbs: 31, fat: 0.9 },
    units: [
      { label: 'כוס מבושלת (140 גרם)', grams: 140 },
      { label: 'מנה (220 גרם)', grams: 220 },
    ],
    source: 'local',
  },
  {
    id: 'red-wine-semi-dry',
    name: 'יין אדום חצי יבש',
    category: 'משקאות ואלכוהול',
    per100g: { calories: 85, protein: 0.1, carbs: 3.5, fat: 0 },
    units: [
      { label: 'כוס יין סטנדרטית (150 מ"ל)', grams: 150 },
      { label: 'כוס נדיבה (200 גרם / מ"ל)', grams: 200 },
      { label: '100 גרם / מ"ל', grams: 100 },
    ],
    source: 'local',
  },
  {
    id: 'red-wine-dry',
    name: 'יין אדום יבש',
    category: 'משקאות ואלכוהול',
    per100g: { calories: 83, protein: 0.1, carbs: 2.6, fat: 0 },
    units: [
      { label: 'כוס יין סטנדרטית (150 מ"ל)', grams: 150 },
      { label: 'כוס נדיבה (200 גרם / מ"ל)', grams: 200 },
      { label: '100 גרם / מ"ל', grams: 100 },
    ],
    source: 'local',
  },
  {
    id: 'white-wine',
    name: 'יין לבן יבש / חצי יבש',
    category: 'משקאות ואלכוהול',
    per100g: { calories: 82, protein: 0.1, carbs: 2.8, fat: 0 },
    units: [
      { label: 'כוס יין (150 מ"ל)', grams: 150 },
      { label: 'כוס נדיבה (200 גרם / מ"ל)', grams: 200 },
    ],
    source: 'local',
  },
  {
    id: 'beer-lager',
    name: 'בירה בהירה (לאגר)',
    category: 'משקאות ואלכוהול',
    per100g: { calories: 43, protein: 0.5, carbs: 3.6, fat: 0 },
    units: [
      { label: 'בקבוק שליש (330 מ"ל)', grams: 330 },
      { label: 'כוס חצי (500 מ"ל)', grams: 500 },
    ],
    source: 'local',
  },
  {
    id: 'milk-tnuva-3',
    name: 'חלב תנובה 3%',
    brand: 'תנובה',
    category: 'מוצרי חלב',
    per100g: { calories: 60, protein: 3.3, carbs: 4.8, fat: 3 },
    units: [
      { label: 'כוס (200 מ"ל)', grams: 200 },
      { label: 'מזיגה לקפה (50 מ"ל)', grams: 50 },
    ],
    source: 'local',
  },
];

export function calculateMacrosForGrams(per100g: MacroTargets, grams: number): MacroTargets {
  const ratio = grams / 100;
  return {
    calories: Math.round(per100g.calories * ratio),
    protein: Math.round(per100g.protein * ratio * 10) / 10,
    carbs: Math.round(per100g.carbs * ratio * 10) / 10,
    fat: Math.round(per100g.fat * ratio * 10) / 10,
  };
}

export function sumMacros(list: MacroTargets[]): MacroTargets {
  return list.reduce(
    (acc, cur) => ({
      calories: Math.round(acc.calories + cur.calories),
      protein: Math.round((acc.protein + cur.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + cur.carbs) * 10) / 10,
      fat: Math.round((acc.fat + cur.fat) * 10) / 10,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export const DEFAULT_TEMPLATES: NutritionTemplate[] = [
  {
    id: 'tpl-cut-1850',
    name: 'חיטוב מדויק – 1,850 קל׳ (יום אימון)',
    description: 'דגש על חלבון גבוה (160g) ופחמימה סביב האימון',
    dayType: 'workout',
    tolerancePercent: 10,
    ownerCoachId: 'coach-admin',
    meals: [
      {
        id: 'meal-1',
        name: 'ארוחת בוקר',
        timeHint: '08:00',
        targets: { calories: 420, protein: 35, carbs: 40, fat: 13 },
        recommendedOptions: [
          "2 ביצים + חצי גביע קוטג' 5% + 2 פרוסות לחם כוסמין",
          'יוגורט דנונה PRO + חצי כוס שיבולת שועל + בננה',
        ],
      },
      {
        id: 'meal-2',
        name: 'ארוחת צהריים (לפני אימון)',
        timeHint: '13:00',
        targets: { calories: 580, protein: 50, carbs: 65, fat: 13 },
        recommendedOptions: [
          '150 גרם חזה עוף + 200 גרם אורז בסמטי + כפית שמן זית בסלט',
          '160 גרם פילה סלמון + בטטה אפויה בינונית + סלט ירקות',
        ],
      },
      {
        id: 'meal-3',
        name: 'נשנוש / שייק אחרי אימון',
        timeHint: '17:00',
        targets: { calories: 300, protein: 30, carbs: 35, fat: 4 },
        recommendedOptions: [
          'סקופ אבקת חלבון + בננה + תפוח עץ',
          'משקה חלבון GO + פרי + 10 שקדים',
        ],
      },
      {
        id: 'meal-4',
        name: 'ארוחת ערב',
        timeHint: '20:30',
        targets: { calories: 550, protein: 45, carbs: 40, fat: 22 },
        recommendedOptions: [
          'קופסת טונה במים + 2 פרוסות לחם כוסמין + כף טחינה גולמית + ביצה',
          "גביע קוטג' 5% + 2 פרוסות גבינה צהובה 9% + 2 פרוסות לחם + חצי אבוקדו",
        ],
      },
    ],
  },
  {
    id: 'tpl-cut-rest-1600',
    name: 'חיטוב – 1,600 קל׳ (יום מנוחה)',
    description: 'הפחתת פחמימה קלה ביום ללא אימון ושמירה על חלבון',
    dayType: 'rest',
    tolerancePercent: 10,
    ownerCoachId: 'coach-admin',
    meals: [
      {
        id: 'meal-1',
        name: 'ארוחת בוקר',
        timeHint: '08:30',
        targets: { calories: 400, protein: 35, carbs: 32, fat: 14 },
      },
      {
        id: 'meal-2',
        name: 'ארוחת צהריים',
        timeHint: '13:30',
        targets: { calories: 520, protein: 48, carbs: 45, fat: 16 },
      },
      {
        id: 'meal-3',
        name: 'ארוחת ביניים',
        timeHint: '17:00',
        targets: { calories: 220, protein: 25, carbs: 18, fat: 5 },
      },
      {
        id: 'meal-4',
        name: 'ארוחת ערב',
        timeHint: '20:30',
        targets: { calories: 460, protein: 42, carbs: 28, fat: 20 },
      },
    ],
  },
  {
    id: 'tpl-bulk-2550',
    name: 'עלייה במסת שריר נקייה – 2,550 קל׳',
    description: '5 ארוחות מאוזנות לעלייה נקייה במסת השריר',
    dayType: 'workout',
    tolerancePercent: 10,
    ownerCoachId: 'coach-admin',
    meals: [
      {
        id: 'meal-1',
        name: 'ארוחת בוקר',
        timeHint: '07:30',
        targets: { calories: 550, protein: 38, carbs: 62, fat: 16 },
      },
      {
        id: 'meal-2',
        name: 'ארוחת ביניים בוקר',
        timeHint: '10:30',
        targets: { calories: 350, protein: 28, carbs: 38, fat: 9 },
      },
      {
        id: 'meal-3',
        name: 'ארוחת צהריים',
        timeHint: '13:30',
        targets: { calories: 700, protein: 52, carbs: 85, fat: 16 },
      },
      {
        id: 'meal-4',
        name: 'אחרי אימון',
        timeHint: '17:30',
        targets: { calories: 380, protein: 32, carbs: 50, fat: 5 },
      },
      {
        id: 'meal-5',
        name: 'ארוחת ערב',
        timeHint: '21:00',
        targets: { calories: 570, protein: 42, carbs: 50, fat: 22 },
      },
    ],
  },
];

export function getTodayIso(offsetDays = 0): string {
  const target = new Date(Date.now() + offsetDays * 86400000);
  try {
    // סנכרון אחיד של תאריך מול שעון ישראל גם בשרת Vercel (שפועל ב-UTC) וגם בדפדפן
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(target);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // fallback if Intl timezone is unavailable
  }
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createInitialTrainees(): TraineeProfile[] {
  const today = getTodayIso();
  const workoutTpl = DEFAULT_TEMPLATES[0];
  const restTpl = DEFAULT_TEMPLATES[1];
  const bulkTpl = DEFAULT_TEMPLATES[2];

  return [
    {
      id: 'trainee-1',
      email: 'omer@spot.co.il',
      password: '123456',
      status: 'active',
      name: 'עומר לוי',
      avatar: 'ע',
      phone: '054-4321987',
      goal: 'חיטוב וירידה באחוזי שומן',
      currentWeight: 78.4,
      targetWeight: 74.0,
      tolerancePercent: 10,
      primaryCoachId: 'coach-admin',
      sharedCoachIds: [],
      workoutTemplate: JSON.parse(JSON.stringify(workoutTpl)),
      restTemplate: JSON.parse(JSON.stringify(restTpl)),
      favoriteFoodIds: ['cottage-tnuva-5', 'chicken-breast-grilled', 'basmati-rice-cooked', 'krembo-strauss', 'egg-whole'],
      weightHistory: [
        { date: 'שבוע 1', weight: 80.5 },
        { date: 'שבוע 2', weight: 79.8 },
        { date: 'שבוע 3', weight: 79.1 },
        { date: 'שבוע 4', weight: 78.4 },
      ],
      logs: {
        [today]: {
          date: today,
          dayType: 'workout',
          waterCups: 7,
          waterGoal: 12,
          weightKg: 78.4,
          meals: {
            'meal-1': {
              mealSlotId: 'meal-1',
              updatedAt: '08:25',
              coachFeedback: 'ארוחת בוקר מצוינת עומר! פגעת בול בחלבון.',
              coachFeedbackAt: '09:10',
              items: [
                {
                  id: 'item-101',
                  name: 'ביצה (קשה / חביתה / מקושקשת)',
                  unitLabel: '2 ביצים L (120 גרם)',
                  quantity: 1,
                  grams: 120,
                  macros: { calories: 172, protein: 15.1, carbs: 0.8, fat: 11.4 },
                  source: 'catalog',
                },
                {
                  id: 'item-102',
                  name: "קוטג' 5% תנובה",
                  unitLabel: 'חצי גביע (125 גרם)',
                  quantity: 1,
                  grams: 125,
                  macros: { calories: 116, protein: 13.8, carbs: 1.9, fat: 6.3 },
                  source: 'catalog',
                },
                {
                  id: 'item-103',
                  name: 'לחם כוסמין מלא פרוס',
                  unitLabel: '2 פרוסות (64 גרם)',
                  quantity: 1,
                  grams: 64,
                  macros: { calories: 150, protein: 6.7, carbs: 25.6, fat: 1.8 },
                  source: 'catalog',
                },
              ],
            },
            'meal-2': {
              mealSlotId: 'meal-2',
              updatedAt: '13:15',
              photoNote: 'חזה עוף על הפלנצ׳ה עם אורז בסמטי וסלט קצוץ',
              items: [
                {
                  id: 'item-201',
                  name: 'חזה עוף צלוי / על הפלנצ׳ה',
                  unitLabel: 'מנה בינונית (150 גרם)',
                  quantity: 1,
                  grams: 150,
                  macros: { calories: 248, protein: 46.5, carbs: 0, fat: 5.4 },
                  source: 'ai-photo',
                },
                {
                  id: 'item-202',
                  name: 'אורז בסמטי לבן מבושל',
                  unitLabel: 'מנה (200 גרם)',
                  quantity: 1,
                  grams: 200,
                  macros: { calories: 260, protein: 5.4, carbs: 56, fat: 0.6 },
                  source: 'ai-photo',
                },
                {
                  id: 'item-203',
                  name: 'טחינה גולמית (100% שומשום)',
                  unitLabel: 'כפית (5 גרם)',
                  quantity: 1,
                  grams: 5,
                  macros: { calories: 32, protein: 1.1, carbs: 0.6, fat: 2.9 },
                  source: 'ai-photo',
                },
              ],
            },
          },
        },
      },
    },
    {
      id: 'trainee-2',
      email: 'noa@spot.co.il',
      password: '123456',
      status: 'active',
      name: 'נועה כהן',
      avatar: 'נ',
      phone: '052-8876123',
      goal: 'חיטוב ומיצוק',
      currentWeight: 61.2,
      targetWeight: 58.0,
      tolerancePercent: 10,
      primaryCoachId: 'coach-admin',
      sharedCoachIds: [],
      workoutTemplate: JSON.parse(JSON.stringify(restTpl)),
      restTemplate: JSON.parse(JSON.stringify(restTpl)),
      favoriteFoodIds: ['danone-pro-20', 'krembo-strauss', 'salmon-fillet-baked'],
      weightHistory: [
        { date: 'שבוע 1', weight: 62.4 },
        { date: 'שבוע 2', weight: 61.9 },
        { date: 'שבוע 3', weight: 61.5 },
        { date: 'שבוע 4', weight: 61.2 },
      ],
      logs: {
        [today]: {
          date: today,
          dayType: 'workout',
          waterCups: 9,
          waterGoal: 10,
          weightKg: 61.2,
          meals: {
            'meal-1': {
              mealSlotId: 'meal-1',
              updatedAt: '09:00',
              items: [
                {
                  id: 'item-301',
                  name: 'יוגורט דנונה PRO חלבון (20 גרם)',
                  unitLabel: 'גביע אחד (200 גרם)',
                  quantity: 1,
                  grams: 200,
                  macros: { calories: 134, protein: 20, carbs: 11, fat: 1 },
                  source: 'barcode',
                },
                {
                  id: 'item-302',
                  name: 'קרמבו וניל / מוקה (שטראוס)',
                  unitLabel: '2 יחידות (50 גרם)',
                  quantity: 1,
                  grams: 50,
                  macros: { calories: 190, protein: 1.6, carbs: 32, fat: 6 },
                  source: 'catalog',
                },
              ],
            },
          },
        },
      },
    },
    {
      id: 'trainee-3',
      email: 'itay@spot.co.il',
      password: '123456',
      status: 'pending',
      name: 'איתי מזרחי',
      avatar: 'א',
      phone: '050-9911223',
      goal: 'עלייה במסת שריר',
      currentWeight: 83.0,
      targetWeight: 88.0,
      tolerancePercent: 10,
      primaryCoachId: 'coach-admin',
      sharedCoachIds: [],
      workoutTemplate: JSON.parse(JSON.stringify(bulkTpl)),
      restTemplate: JSON.parse(JSON.stringify(bulkTpl)),
      favoriteFoodIds: ['chicken-breast-grilled', 'whey-protein-scoop', 'oats-quaker'],
      weightHistory: [
        { date: 'שבוע 1', weight: 81.2 },
        { date: 'שבוע 2', weight: 81.9 },
        { date: 'שבוע 3', weight: 82.5 },
        { date: 'שבוע 4', weight: 83.0 },
      ],
      logs: {},
    },
  ];
}
