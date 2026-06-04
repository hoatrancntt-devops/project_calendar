// Generate square PNG app icons from the uploaded global logo, for home-screen / PWA shortcuts.
//
// Why rasterize: home-screen icons (iOS apple-touch-icon, Android/Chrome manifest icons) MUST be
// square raster PNGs — iOS ignores SVG and both platforms distort non-square images. So we
// contain-fit the logo onto a solid square background with maskable-safe padding (~12% each side,
// keeping content inside the ~80% safe zone Android adaptive icons crop to).

/** Draw any logo (PNG/JPEG/SVG data URL) contained on a solid square → PNG data URL. */
export function rasterizeSquarePng(src, size, { bg = '#ffffff', padRatio = 0.12 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);

      const inner = size * (1 - 2 * padRatio);
      // SVGs may report 0 intrinsic size → assume square and fill the inner box.
      const w = img.naturalWidth || img.width || inner;
      const h = img.naturalHeight || img.height || inner;
      const scale = Math.min(inner / w, inner / h);
      const dw = w * scale;
      const dh = h * scale;
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);

      try { resolve(canvas.toDataURL('image/png')); }
      catch (e) { reject(e); } // tainted canvas should never happen for same-origin data URLs
    };
    img.onerror = () => reject(new Error('Không tải được logo để tạo icon'));
    img.src = src;
  });
}

/**
 * Produce the three icon sizes the manifest + apple-touch-icon need, as PNG data URLs.
 * Returns empty strings if no source logo (caller clears stored icons).
 */
export async function generateAppIcons(src) {
  if (!src) return { appIcon192: '', appIcon512: '', appIcon180: '' };
  const [appIcon192, appIcon512, appIcon180] = await Promise.all([
    rasterizeSquarePng(src, 192),
    rasterizeSquarePng(src, 512),
    rasterizeSquarePng(src, 180), // iOS apple-touch-icon
  ]);
  return { appIcon192, appIcon512, appIcon180 };
}
