/**
 * דחיסת תמונות בצד הלקוח (Client-side WebP Compression)
 * מקטינה תמונות מצלמה מ-4MB~ ל-50KB~ בפורמט WebP כדי לחסוך 98% מנפח האחסון ב-Supabase
 * ולהאיץ דרמטית את השליחה ל-Gemini Vision API.
 */
export async function compressMealImage(
  file: File,
  maxWidth = 800,
  quality = 0.75
): Promise<{ dataUrl: string; sizeKB: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/webp', quality);
        const approxBytes = Math.round((dataUrl.length * 3) / 4);
        resolve({
          dataUrl,
          sizeKB: Math.max(1, Math.round(approxBytes / 1024)),
        });
      };
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
