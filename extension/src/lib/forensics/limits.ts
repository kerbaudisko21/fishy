/*
 * Limits that keep a hostile file from freezing or crashing FISHY. A small file can claim to be a
 * 30000 × 30000 picture (a "decompression bomb"), and 20 MB of compressed audio can be hours long;
 * decoding either would take gigabytes. These read the size from the file's header first.
 */

/** Pictures larger than this are refused before they are decoded (about 50 megapixels). */
export const MAX_PICTURE_PIXELS = 50_000_000;
/** Voice clips longer than this are refused before they are decoded. */
export const MAX_VOICE_SECONDS = 5 * 60;
/** Only the first part of a clip is measured: enough for every voice measurement. */
export const VOICE_ANALYSIS_SECONDS = 60;

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);

/** Width and height from a PNG, JPEG, GIF or WebP header, or null when the header doesn't say. */
export function pictureSize(b: Uint8Array): { width: number; height: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: u32be(b, 16), height: u32be(b, 20) };
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { width: u16le(b, 6), height: u16le(b, 8) };
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (kind === 'VP8X') return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    if (kind === 'VP8 ') return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) return null;
      const marker = b[at + 1];
      // Start of frame (baseline, progressive, …): height then width.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(b, at + 7), height: u16be(b, at + 5) };
      }
      const len = u16be(b, at + 2);
      if (len < 2) return null;
      at += 2 + len;
    }
  }
  return null;
}

/** Why a picture is refused, or null when it can be opened safely. */
export function pictureTooBig(bytes: Uint8Array): string | null {
  const size = pictureSize(bytes);
  if (size && size.width * size.height > MAX_PICTURE_PIXELS) {
    return `This picture is ${size.width} × ${size.height} pixels, too large to open safely. FISHY checks pictures up to about 50 megapixels.`;
  }
  return null;
}

/** How long a recording is, read by the browser without decoding it (null when it can't tell). */
export async function recordingSeconds(blob: Blob): Promise<number | null> {
  if (typeof Audio === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio();
    audio.preload = 'metadata';
    return await new Promise<number | null>((resolve) => {
      const done = (v: number | null) => {
        audio.removeAttribute('src');
        resolve(v);
      };
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
      audio.onerror = () => done(null);
      setTimeout(() => done(null), 4000);
      audio.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Text from a web page or a file, made safe to quote to a model: one line, no markup, short. */
export function quoteable(text: string, max = 120): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}
