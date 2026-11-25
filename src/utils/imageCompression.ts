async function compressImageWithLimit(
  file: File,
  maxWidth: number,
  quality: number,
  maxUrlLength: number,
  fallbackWidth: number,
  fallbackQuality: number
): Promise<{ dataUrl: string; sizeKB: number; formatLabel: 'WebP' | 'JPEG' }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const encode = (wLimit: number, q: number) => {
          let width = img.width;
          let height = img.height;
          if (width > wLimit) {
            height = Math.round((height * wLimit) / width);
            width = wLimit;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.drawImage(img, 0, 0, width, height);

          // חלק מהדפדפנים (בעיקר iOS Safari) עלולים להחזיר PNG ענק במקום WebP - נעבור ל-JPEG אם WebP לא נוצר
          const webpUrl = canvas.toDataURL('image/webp', q);
          if (webpUrl.startsWith('data:image/webp')) {
            return { url: webpUrl, formatLabel: 'WebP' as const };
          }
          const jpegUrl = canvas.toDataURL('image/jpeg', q);
          return { url: jpegUrl, formatLabel: 'JPEG' as const };
        };

        let result = encode(maxWidth, quality);
        if (!result) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        if (result.url.length > maxUrlLength) {
          const smaller = encode(fallbackWidth, fallbackQuality);
          if (smaller) result = smaller;
        }

        const approxBytes = Math.round((result.url.length * 3) / 4);
        resolve({
          dataUrl: result.url,
          sizeKB: Math.max(1, Math.round(approxBytes / 1024)),
          formatLabel: result.formatLabel,
        });
      };
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * דחיסת תמונות ארוחה בצד הלקוח (Client-side WebP / JPEG Compression)
 * מקטינה תמונות מצלמה מ-4MB~ ל-80-250KB כדי לחסוך נפח ולהאיץ את השליחה ל-Gemini Vision API.
 */
export async function compressMealImage(
  file: File,
  maxWidth = 800,
  quality = 0.72
): Promise<{ dataUrl: string; sizeKB: number; formatLabel: 'WebP' | 'JPEG' }> {
  return compressImageWithLimit(file, maxWidth, quality, 600_000, 640, 0.58);
}

/**
 * דחיסת תמונת מוצר אישי מוקטנת ומהירה לשמירה בספריית המוצרים.
 */
export async function compressProductImage(
  file: File
): Promise<{ dataUrl: string; sizeKB: number; formatLabel: 'WebP' | 'JPEG' }> {
  return compressImageWithLimit(file, 360, 0.74, 140_000, 240, 0.58);
}
