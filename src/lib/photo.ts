/**
 * Shrinks a picked photo to what QuR Tag keeps with an item: a JPEG at most 640 pixels
 * on its longest side, as a data: address of at most about 110 KB (the database takes
 * up to 120 KB). Done in the browser, so the full photo never leaves the phone and no
 * file store is needed.
 */
const MAX_SIDE = 640;
const MAX_LENGTH = 110_000;

export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.82, 0.7, 0.58, 0.45, 0.35]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_LENGTH) return url;
  }
  throw new Error('photo too large');
}
