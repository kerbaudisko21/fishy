// Getting a file ready for Gemini. No Firebase and no extension APIs, so the web pages use it too.

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * A picture Gemini Nano can take: JPEG or PNG, at most 1536 px on its longest side.
 * Other formats the browser can open (WebP, GIF) are redrawn as PNG.
 */
export async function pictureForGemini(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const MAX = 1536;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && (blob.type === 'image/jpeg' || blob.type === 'image/png')) {
    bitmap.close();
    return blob;
  }
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}
