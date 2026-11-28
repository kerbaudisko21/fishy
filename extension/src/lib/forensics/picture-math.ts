import { largestCluster, median, placeOf, type Box } from './grid';

/*
 * Pixel forensics for a picture, on the laptop, no AI:
 *
 *  - Error Level Analysis (ELA). A JPEG saved once and saved again at the same quality changes
 *    little; a part pasted in from another picture, or redrawn, has been compressed a different
 *    number of times and changes more. We re-save the picture and measure, block by block, how much
 *    it changed. Edges and fine texture always change more, so each block's error is compared with
 *    its own texture before it counts.
 *  - Noise. Every camera leaves a fine grain over the whole picture. A patch that is much cleaner
 *    or much grainier than the rest was often added afterwards (pasted, retouched, generated).
 *
 * Both only count when the odd blocks form ONE patch (a sign of a local change), not when they are
 * spread everywhere (a property of the whole picture). It is a hint for a person to look at, never
 * a verdict on its own.
 */

export interface PatchFinding {
  /** Share of the picture's blocks in the odd patch, 0–1. */
  share: number;
  box: Box;
  /** "top left", "centre"… */
  place: string;
}

export interface ElaResult {
  /** Mean error over the picture, 0–255. */
  mean: number;
  /** How far the patch stands out: its error over the picture's median, texture allowed for. */
  contrast: number;
  patch: PatchFinding | null;
}

export interface NoiseResult {
  /** Median noise level over the picture (0–255 scale of the residual). */
  level: number;
  patch: (PatchFinding & { kind: 'cleaner' | 'grainier' }) | null;
}

const ELA_BLOCK = 16;
/** A block counts when its texture-adjusted error is this many times the picture's median… */
const ELA_RATIO = 3;
/** …and its raw error is at least this (0–255), so near-lossless re-saves don't flag noise. */
const ELA_MIN_ERR = 2;
const ELA_FLOOR = 0.15;
const NOISE_BLOCK = 32;

const lum = (d: ArrayLike<number>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Per-pixel error between the picture and its re-saved copy (largest channel difference). */
export function errorMap(orig: ArrayLike<number>, resaved: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    out[p] = Math.max(Math.abs(orig[i] - resaved[i]), Math.abs(orig[i + 1] - resaved[i + 1]), Math.abs(orig[i + 2] - resaved[i + 2]));
  }
  return out;
}

/** Mean absolute gradient of the luminance: how much texture a block has. */
function textureMap(orig: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const c = lum(orig, i);
      out[y * w + x] = Math.abs(c - lum(orig, i + 4)) + Math.abs(c - lum(orig, i + w * 4));
    }
  }
  return out;
}

function blockMeans(map: Float32Array, w: number, h: number, size: number) {
  const cols = Math.floor(w / size);
  const rows = Math.floor(h / size);
  const means = new Float32Array(cols * rows);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      for (let y = by * size; y < (by + 1) * size; y++) for (let x = bx * size; x < (bx + 1) * size; x++) sum += map[y * w + x];
      means[by * cols + bx] = sum / (size * size);
    }
  }
  return { cols, rows, means };
}

/** Per-block median: grain is everywhere, edges and text are sparse, so the median ignores them. */
function blockMedians(map: Float32Array, w: number, h: number, size: number) {
  const cols = Math.floor(w / size);
  const rows = Math.floor(h / size);
  const means = new Float32Array(cols * rows);
  const buf = new Float32Array(size * size);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let k = 0;
      for (let y = by * size; y < (by + 1) * size; y++) for (let x = bx * size; x < (bx + 1) * size; x++) buf[k++] = map[y * w + x];
      buf.sort();
      means[by * cols + bx] = buf[buf.length >> 1];
    }
  }
  return { cols, rows, means };
}

/** One patch counts if it is at least `min` blocks and at most `maxShare` of the picture. */
function patchOf(flags: boolean[], cols: number, rows: number, min: number, maxShare: number): PatchFinding | null {
  const total = cols * rows;
  const flagged = flags.filter(Boolean).length;
  if (!total || flagged / total > maxShare * 1.5) return null; // odd everywhere: the picture, not a patch
  const c = largestCluster(flags, cols, rows);
  if (!c || c.size < min || c.size / total > maxShare) return null;
  return { share: c.size / total, box: c.box, place: placeOf(c.box) };
}

export function elaFromPixels(orig: ArrayLike<number>, resaved: ArrayLike<number>, w: number, h: number, tune: { ratio?: number; minErr?: number; floor?: number } = {}): ElaResult & { map: Float32Array } {
  const { ratio = ELA_RATIO, minErr = ELA_MIN_ERR, floor = ELA_FLOOR } = tune;
  const map = errorMap(orig, resaved, w, h);
  const err = blockMeans(map, w, h, ELA_BLOCK);
  const tex = blockMeans(textureMap(orig, w, h), w, h, ELA_BLOCK);
  // Error per unit of texture: a busy block is allowed more error than a smooth one.
  const norm = Array.from(err.means, (e, i) => e / (1 + tex.means[i] / 6));
  const mid = Math.max(floor, median(norm));
  const flags = norm.map((v, i) => v > ratio * mid && err.means[i] >= minErr);
  const patch = patchOf(flags, err.cols, err.rows, 3, 0.2);
  let contrast = 0;
  if (patch) {
    const inside = norm.filter((_, i) => flags[i]);
    contrast = median(inside) / mid;
  }
  const mean = map.reduce((s, v) => s + v, 0) / Math.max(1, map.length);
  return { map, mean, contrast, patch };
}

export function noiseFromPixels(orig: ArrayLike<number>, w: number, h: number): NoiseResult {
  // High-pass residual: a pixel minus the mean of its four neighbours. What's left is grain and edges.
  const res = new Float32Array(w * h);
  const bright = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const c = lum(orig, i);
      bright[y * w + x] = c;
      res[y * w + x] = Math.abs(c - (lum(orig, i - 4) + lum(orig, i + 4) + lum(orig, i - w * 4) + lum(orig, i + w * 4)) / 4);
    }
  }
  const noise = blockMedians(res, w, h, NOISE_BLOCK);
  const light = blockMeans(bright, w, h, NOISE_BLOCK);
  // Very dark or blown-out blocks have no grain to measure.
  const usable = Array.from(noise.means, (_, i) => light.means[i] > 24 && light.means[i] < 232);
  const values = Array.from(noise.means).filter((_, i) => usable[i]);
  const level = median(values);
  if (values.length < 12 || level < 0.4) return { level, patch: null };
  const clean = Array.from(noise.means, (v, i) => usable[i] && v < level * 0.3);
  const grainy = Array.from(noise.means, (v, i) => usable[i] && v > level * 3.2);
  const c = patchOf(clean, noise.cols, noise.rows, 4, 0.15);
  const g = patchOf(grainy, noise.cols, noise.rows, 4, 0.15);
  const pick = c && (!g || c.share >= g.share) ? { ...c, kind: 'cleaner' as const } : g ? { ...g, kind: 'grainier' as const } : null;
  return { level, patch: pick };
}

/** The error map as a see-through heat overlay (coral where the picture changed most). */
export function heatPixels(map: Float32Array, w: number, h: number, gain = 18): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const a = Math.min(255, map[p] * gain);
    out[p * 4] = 242;
    out[p * 4 + 1] = 105 - Math.min(60, a / 4);
    out[p * 4 + 2] = 75;
    out[p * 4 + 3] = a;
  }
  return out;
}

/*
 * A repeating pattern hidden in the picture's fine grain. Many AI image generators build pictures
 * from a grid (latent upsampling by 4 or 8), which leaves peaks at fixed frequencies in the noise
 * residual (Corvi et al., 2023). Only for pictures that are not JPEG: JPEG's own 8×8 blocks make
 * the same peaks. Strong compression or resizing removes them, so a missing peak means nothing.
 */
export interface GridPattern {
  /** How many of the grid frequencies stand out. */
  peaks: number;
  /** The strongest peak over its surroundings. */
  ratio: number;
}

const GRID_N = 256;

export function gridPatternFromPixels(orig: ArrayLike<number>, w: number, h: number, fftFn: (re: Float64Array, im: Float64Array) => void): GridPattern | null {
  if (w < GRID_N + 2 || h < GRID_N + 2) return null;
  const x0 = Math.floor((w - GRID_N) / 2);
  const y0 = Math.floor((h - GRID_N) / 2);
  const g = (x: number, y: number) => lum(orig, ((y0 + y) * w + x0 + x) * 4);
  // Residual: each pixel minus the mean of its 3×3 neighbourhood.
  const re = Array.from({ length: GRID_N }, () => new Float64Array(GRID_N));
  const im = Array.from({ length: GRID_N }, () => new Float64Array(GRID_N));
  for (let y = 0; y < GRID_N; y++) {
    for (let x = 0; x < GRID_N; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += g(Math.min(GRID_N - 1, Math.max(0, x + dx)), Math.min(GRID_N - 1, Math.max(0, y + dy)));
      re[y][x] = g(x, y) - sum / 9;
    }
  }
  for (let y = 0; y < GRID_N; y++) fftFn(re[y], im[y]);
  const colRe = new Float64Array(GRID_N);
  const colIm = new Float64Array(GRID_N);
  for (let x = 0; x < GRID_N; x++) {
    for (let y = 0; y < GRID_N; y++) {
      colRe[y] = re[y][x];
      colIm[y] = im[y][x];
    }
    fftFn(colRe, colIm);
    for (let y = 0; y < GRID_N; y++) {
      re[y][x] = colRe[y];
      im[y][x] = colIm[y];
    }
  }
  const mag = (u: number, v: number) => Math.hypot(re[(v + GRID_N) % GRID_N][(u + GRID_N) % GRID_N], im[(v + GRID_N) % GRID_N][(u + GRID_N) % GRID_N]);
  let peaks = 0;
  let ratio = 0;
  const step = GRID_N / 8;
  for (const [ku, kv] of [[1, 0], [2, 0], [0, 1], [0, 2], [1, 1], [2, 2]] as const) {
    const u = ku * step;
    const v = kv * step;
    const peak = Math.max(mag(u, v), mag(u + 1, v), mag(u, v + 1));
    // Its surroundings: a ring of points 3–6 bins away.
    const around: number[] = [];
    for (let dv = -6; dv <= 6; dv++) for (let du = -6; du <= 6; du++) if (Math.max(Math.abs(du), Math.abs(dv)) >= 3) around.push(mag(u + du, v + dv));
    const r = peak / Math.max(1e-9, median(around));
    ratio = Math.max(ratio, r);
    if (r > 8) peaks++;
  }
  return { peaks, ratio };
}
