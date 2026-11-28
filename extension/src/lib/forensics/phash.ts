/*
 * A perceptual hash: a 64-bit fingerprint of what a picture LOOKS like, so "this picture was
 * reported before" still matches after it has been resized, re-saved, brightened or lightly
 * noised on its way through chat apps. Byte-for-byte hashes (SHA-256) break on any of those.
 *
 * The method is the classic DCT hash (Zauner, 2010): shrink to 32×32 grey, take the 2D DCT, keep
 * the 8×8 lowest frequencies (the broad layout of light and dark), and write one bit per
 * frequency: above or below their median. Fine detail, noise and compression live in the high
 * frequencies we throw away; overall brightness lives in the DC term we skip.
 *
 * Pure functions, no canvas, so it runs in tests and in a worker.
 */

const SIDE = 32;
const KEEP = 8;

/**
 * Two pictures whose hashes differ in at most this many of the 64 bits are treated as the same
 * picture. Measured in phash.test.ts on synthetic scenes: resizing, brightness shifts, light noise
 * and JPEG re-saves stay well under it, while unrelated scenes sit far above it (about 32 bits
 * apart on average; see the test for the smallest gap measured). 8 is the figure commonly used
 * for this hash and leaves room on both sides.
 */
export const SAME_PICTURE_DISTANCE = 8;

const lum = (d: ArrayLike<number>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * Shrink one axis by area averaging: each output cell is the mean of the source pixels it covers,
 * counting partly covered pixels by the fraction covered. Averaging (rather than picking pixels)
 * is what makes the hash the same at any input size.
 */
function shrinkWeights(n: number, out: number): { start: number; weights: number[] }[] {
  const scale = n / out;
  const cells: { start: number; weights: number[] }[] = [];
  for (let o = 0; o < out; o++) {
    const a = o * scale;
    const b = (o + 1) * scale;
    const start = Math.floor(a);
    const end = Math.min(n, Math.ceil(b));
    const weights: number[] = [];
    for (let s = start; s < end; s++) weights.push((Math.min(b, s + 1) - Math.max(a, s)) / scale);
    cells.push({ start, weights });
  }
  return cells;
}

/** Grey 32×32 version of the picture, by area averaging (works for upscaling too). */
export function grey32(rgba: ArrayLike<number>, w: number, h: number): Float64Array {
  const xs = shrinkWeights(w, SIDE);
  const ys = shrinkWeights(h, SIDE);
  // Horizontal pass, row by row, into h × 32.
  const rows = new Float64Array(h * SIDE);
  for (let y = 0; y < h; y++) {
    for (let o = 0; o < SIDE; o++) {
      const { start, weights } = xs[o];
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += weights[k] * lum(rgba, (y * w + start + k) * 4);
      rows[y * SIDE + o] = sum;
    }
  }
  const out = new Float64Array(SIDE * SIDE);
  for (let o = 0; o < SIDE; o++) {
    const { start, weights } = ys[o];
    for (let x = 0; x < SIDE; x++) {
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += weights[k] * rows[(start + k) * SIDE + x];
      out[o * SIDE + x] = sum;
    }
  }
  return out;
}

// DCT-II basis for 32 points, only the first 8 frequencies are ever needed.
const BASIS: Float64Array[] = Array.from({ length: KEEP }, (_, u) => {
  const row = new Float64Array(SIDE);
  const c = u === 0 ? Math.sqrt(1 / SIDE) : Math.sqrt(2 / SIDE);
  for (let x = 0; x < SIDE; x++) row[x] = c * Math.cos(((2 * x + 1) * u * Math.PI) / (2 * SIDE));
  return row;
});

/**
 * The 64-bit perceptual hash as 16 hex characters.
 *
 * Bits: the 8×8 lowest frequencies in row order, skipping [0][0] (overall brightness, which says
 * nothing about content), give 63 bits; the top bit is always 0 so the hash is exactly 16 hex
 * characters. Distances are therefore out of 63 in practice. Bit = 1 when the frequency is above
 * the median of the 63, so the hash ignores contrast as well as brightness.
 */
export function phash64(rgba: ArrayLike<number>, w: number, h: number): string {
  if (w < 1 || h < 1 || rgba.length < w * h * 4) return '0'.repeat(16);
  const g = grey32(rgba, w, h);
  // Separable DCT: rows first (32 × 8), then columns, only the 8×8 corner.
  const tmp = new Float64Array(SIDE * KEEP);
  for (let y = 0; y < SIDE; y++) {
    for (let u = 0; u < KEEP; u++) {
      let s = 0;
      for (let x = 0; x < SIDE; x++) s += BASIS[u][x] * g[y * SIDE + x];
      tmp[y * KEEP + u] = s;
    }
  }
  const coef: number[] = [];
  for (let v = 0; v < KEEP; v++) {
    for (let u = 0; u < KEEP; u++) {
      if (u === 0 && v === 0) continue;
      let s = 0;
      for (let y = 0; y < SIDE; y++) s += BASIS[v][y] * tmp[y * KEEP + u];
      // Round away floating-point dust so a flat picture hashes the same on every machine.
      coef.push(Math.round(s * 1e6) / 1e6);
    }
  }
  const sorted = [...coef].sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  // Bit 62 is the first coefficient, bit 0 the last; bit 63 stays 0.
  let hi = 0;
  let lo = 0;
  for (let i = 0; i < coef.length; i++) {
    if (coef[i] <= med) continue;
    const bit = 62 - i;
    if (bit >= 32) hi |= 1 << (bit - 32);
    else lo |= 1 << bit;
  }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

const POP = Array.from({ length: 16 }, (_, n) => (n & 1) + ((n >> 1) & 1) + ((n >> 2) & 1) + ((n >> 3) & 1));

/** Number of differing bits between two hex hashes of the same length (longer one truncated). */
export function hamming(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    d += Number.isNaN(x) ? 4 : POP[x];
  }
  return d + 4 * Math.abs(a.length - b.length);
}

/**
 * The hash in four 16-bit pieces (4 hex characters each, in order), for an index where piece i is
 * looked up in table i (keep the position in the key: the same 4 characters in a different place
 * mean nothing). To find candidates, look up all four pieces, then check the full Hamming distance.
 * bands(h).join('') === h.
 *
 * What this guarantees, honestly: two hashes within distance 3 ALWAYS share at least one piece
 * (four pieces, at most three of them can hold a differing bit). Within distance 4 to 8 they
 * usually do, because differing bits rarely spread evenly, but not always: a match at distance 6
 * can be missed. A caller that must never miss a match up to SAME_PICTURE_DISTANCE should also
 * scan, or index more, smaller pieces.
 */
export function bands(hash: string): string[] {
  const h = hash.toLowerCase().padStart(16, '0').slice(-16);
  return [0, 1, 2, 3].map((i) => h.slice(i * 4, i * 4 + 4));
}
