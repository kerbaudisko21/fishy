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

/**
 * Any recording the browser can play, as 16 kHz mono WAV. Chrome records WebM/Opus, which the
 * Gemini API does not accept; WAV it always does. 10 s of speech is about 320 KB.
 */
export async function audioForGemini(blob: Blob): Promise<Blob> {
  const RATE = 16000;
  const decoded = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
  const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * RATE)), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);

  const wav = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => wav.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  wav.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  wav.setUint32(16, 16, true);
  wav.setUint16(20, 1, true); // PCM
  wav.setUint16(22, 1, true); // mono
  wav.setUint32(24, RATE, true);
  wav.setUint32(28, RATE * 2, true);
  wav.setUint16(32, 2, true);
  wav.setUint16(34, 16, true);
  text(36, 'data');
  wav.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([wav], { type: 'audio/wav' });
}

