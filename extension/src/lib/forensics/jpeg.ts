/*
 * How a JPEG was saved, read from its bytes (no decoding of the picture itself).
 *
 *  - Quantization tables. Every JPEG carries the tables its encoder used. Cameras and phones use
 *    their own; most software (editors, browsers, generators, servers) uses the standard IJG tables
 *    scaled by a quality setting (Kornblum, DFRWS 2008; Farid 2011). A file that names a camera but
 *    carries standard software tables was saved again by software after the camera.
 *  - The EXIF thumbnail. A camera writes a small preview into the file when it takes the photo;
 *    editors often leave it untouched. A preview that no longer matches the picture means the
 *    picture changed after it was taken (Farid, SPIE 2010). A matching preview proves nothing.
 */

/** The standard IJG luminance table (Annex K), in the zigzag order DQT segments use. */
const STD_LUMA_ZIGZAG = [
  16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24, 22, 22, 24, 49, 35, 37, 29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72, 92, 78, 64,
  68, 87, 69, 55, 56, 80, 109, 81, 87, 95, 98, 103, 104, 103, 62, 77, 113, 121, 112, 100, 120, 92, 101, 103, 99,
];

export interface JpegStructure {
  /** The first (luminance) quantization table, zigzag order. */
  luma?: number[];
  /** The IJG quality that best explains the table (1–100). */
  quality?: number;
  /** True when the table is the standard IJG table at some quality: saved by typical software. */
  standardTables?: boolean;
  /** The embedded EXIF thumbnail (a JPEG), if any. */
  thumbnail?: Uint8Array;
}

const ijgTable = (q: number) => {
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return STD_LUMA_ZIGZAG.map((v) => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))));
};

/** The IJG quality whose table is closest to this one, and how far off it is (mean absolute error). */
export function fitQuality(table: number[]): { quality: number; error: number } {
  let best = { quality: 0, error: Infinity };
  for (let q = 1; q <= 100; q++) {
    const t = ijgTable(q);
    const error = t.reduce((s, v, i) => s + Math.abs(v - table[i]), 0) / 64;
    if (error < best.error) best = { quality: q, error };
  }
  return best;
}

const u16 = (b: Uint8Array, at: number, little = false) => (little ? b[at] | (b[at + 1] << 8) : (b[at] << 8) | b[at + 1]);
const u32 = (b: Uint8Array, at: number, little = false) =>
  little ? (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0 : ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

/** The EXIF thumbnail from an APP1 segment's TIFF data (IFD1, JPEGInterchangeFormat). */
function exifThumbnail(tiff: Uint8Array): Uint8Array | undefined {
  if (tiff.length < 8) return undefined;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return undefined;
  const ifd0 = u32(tiff, 4, little);
  if (ifd0 + 2 > tiff.length) return undefined;
  const n0 = u16(tiff, ifd0, little);
  const next = ifd0 + 2 + n0 * 12;
  if (next + 4 > tiff.length) return undefined;
  const ifd1 = u32(tiff, next, little);
  if (!ifd1 || ifd1 + 2 > tiff.length) return undefined;
  const n1 = u16(tiff, ifd1, little);
  let offset = 0;
  let length = 0;
  for (let i = 0; i < n1; i++) {
    const e = ifd1 + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    const tag = u16(tiff, e, little);
    if (tag === 0x0201) offset = u32(tiff, e + 8, little);
    if (tag === 0x0202) length = u32(tiff, e + 8, little);
  }
  if (!offset || !length || offset + length > tiff.length) return undefined;
  const thumb = tiff.subarray(offset, offset + length);
  return thumb[0] === 0xff && thumb[1] === 0xd8 ? thumb : undefined;
}

export function readJpeg(bytes: Uint8Array): JpegStructure | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const out: JpegStructure = {};
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) break;
    const marker = bytes[at + 1];
    if (marker === 0xd9 || marker === 0xda) break; // end, or start of scan: the tables come before
    const len = u16(bytes, at + 2);
    const body = bytes.subarray(at + 4, at + 2 + len);
    if (marker === 0xdb && !out.luma) {
      // DQT: [precision/id][64 values] repeated. Take table 0.
      let p = 0;
      while (p < body.length) {
        const precision = body[p] >> 4;
        const id = body[p] & 15;
        const size = precision ? 128 : 64;
        const values = Array.from({ length: 64 }, (_, i) => (precision ? u16(body, p + 1 + i * 2) : body[p + 1 + i]));
        if (id === 0) out.luma = values;
        p += 1 + size;
      }
    }
    if (marker === 0xe1 && body[0] === 0x45 && body[1] === 0x78 && body[2] === 0x69 && body[3] === 0x66) {
      out.thumbnail ??= exifThumbnail(body.subarray(6));
    }
    at += 2 + len;
  }
  if (out.luma && out.luma.length === 64) {
    const fit = fitQuality(out.luma);
    out.quality = fit.quality;
    out.standardTables = fit.error < 0.5;
  }
  return out;
}
