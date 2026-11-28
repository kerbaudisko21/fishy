import { median } from './grid';

/*
 * Two checks on the DECODED pixels of a JPEG (the caller decodes it with the browser):
 *
 *  1. Grid alignment. JPEG cuts the picture into 8×8 blocks starting at the top-left corner and
 *     rounds each block's frequencies (DCT coefficients) to multiples of a step, so the traces
 *     of compression sit on a grid starting at x = 0, y = 0. If someone crops a JPEG (or pastes
 *     part of one into another picture) and saves it again, the OLD traces stay where they were,
 *     which is now not a multiple of 8 from the corner. Finding a second grid at an offset other
 *     than (0, 0) means the picture was cropped or assembled, then saved again ("non-aligned
 *     double JPEG": Luo, Huang & Qiu, 2007; Bianchi & Piva, 2012). See jpegGrid for why we look
 *     at block averages rather than the visible block edges.
 *
 *  2. Double compression. Saved once, a coefficient divided by the file's own step lands on
 *     whole numbers that all occur, with counts falling smoothly away from zero. Saved twice with
 *     a different step the first time, the first rounding leaves only some whole numbers
 *     reachable, so the counts show a regular comb of gaps or peaks (Lukáš & Fridrich, 2003;
 *     Popescu & Farid, 2004). Two views of it: block averages that sit on an older, coarser step
 *     (robust, any picture shape), and a comb fitted to low-frequency histograms for every
 *     possible first step, compared with the "saved once" explanation.
 *
 * Both are hints for a person, never proof: a picture can be cropped and saved again innocently,
 * and many apps re-save every picture they pass along. Each check stays silent unless the
 * evidence is strong. Pure functions over RGBA, so they run in tests without a canvas.
 */

/** Natural (row * 8 + col) index of each zigzag position, as DQT tables are stored. */
export const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29,
  22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
];

/** A zigzag-ordered table (as readJpeg returns it) in natural row-by-row order. */
export function dezigzag(zigzag: ArrayLike<number>): number[] {
  const out = new Array<number>(64).fill(0);
  for (let i = 0; i < 64; i++) out[ZIGZAG[i]] = zigzag[i];
  return out;
}

/** The standard IJG luminance table (Annex K), natural order. */
const STD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109,
  103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
];

/** The IJG luminance table at a quality (1–100), natural order: what most software writes. */
export function ijgLuma(quality: number): number[] {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const s = q < 50 ? 5000 / q : 200 - 2 * q;
  return STD_LUMA.map((v) => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))));
}

const lum = (d: ArrayLike<number>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * The decoder's own luminance (Y) plane, recovered from RGB. A decoder produces whole-number Y
 * values and then converts to RGB, rounding each channel; in a patch of steady colour those
 * roundings push the same way on every pixel, so the plain weighted sum drifts off the steps the
 * file was saved on. Rounding the weighted sum undoes that (the drift is always under half a level).
 */
function lumaOf(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let p = 0, i = 0; p < w * h; p++, i += 4) out[p] = Math.round(lum(rgba, i));
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Block averages (the DC term) on any 8×8 grid
 * ---------------------------------------------------------------------------------------------- */

/**
 * Running sums over the picture (summed-area tables), so the sum, spread and clipped pixels of any
 * 8×8 block cost four lookups each, on all 64 possible grids.
 */
interface Sums {
  w: number;
  h: number;
  sum: Float64Array;
  sq: Float64Array;
  clip: Int32Array;
}

function sumsOf(rgba: ArrayLike<number>, L: Float32Array, w: number, h: number): Sums {
  const W = w + 1;
  const sum = new Float64Array(W * (h + 1));
  const sq = new Float64Array(W * (h + 1));
  const clip = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rs = 0, rq = 0, rc = 0;
    for (let x = 0; x < w; x++) {
      const v = L[y * w + x];
      rs += v;
      rq += v * v;
      // A colour channel at 0 or 255 was clipped after decoding, which moves the block average
      // off the steps it was saved on (bright skies, saturated reds, paper white).
      const i = (y * w + x) * 4;
      rc += Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) <= 0 || Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) >= 255 ? 1 : 0;
      const at = (y + 1) * W + x + 1;
      sum[at] = sum[at - W] + rs;
      sq[at] = sq[at - W] + rq;
      clip[at] = clip[at - W] + rc;
    }
  }
  return { w, h, sum, sq, clip };
}

const box = (t: ArrayLike<number>, W: number, x: number, y: number) => t[(y + 8) * W + x + 8] - t[y * W + x + 8] - t[(y + 8) * W + x] + t[y * W + x];

/** Least pixel variance a block needs to count: flat blocks all share one value and fake a pattern. */
const MIN_BLOCK_VAR = 2;
/** At most this many blocks per grid (evenly spread): plenty for the statistics, and fast. */
const MAX_BLOCKS = 6000;

/**
 * The DC term (JPEG scaling: 8 × the block mean, minus the 128 level shift) of every textured,
 * unclipped block on the grid starting at (ox, oy).
 */
function dcValues(s: Sums, ox: number, oy: number): Float64Array {
  const W = s.w + 1;
  const cols = Math.floor((s.w - ox) / 8);
  const rows = Math.floor((s.h - oy) / 8);
  const stride = Math.max(1, Math.ceil((cols * rows) / MAX_BLOCKS));
  const out: number[] = [];
  for (let b = 0; b < cols * rows; b += stride) {
    const x = ox + (b % cols) * 8;
    const y = oy + Math.floor(b / cols) * 8;
    if (box(s.clip, W, x, y) > 0) continue;
    const total = box(s.sum, W, x, y);
    if (box(s.sq, W, x, y) / 64 - (total / 64) ** 2 < MIN_BLOCK_VAR) continue;
    out.push(total / 8 - 1024);
  }
  return Float64Array.from(out);
}

/** How strongly the values sit on multiples of q: mean cos(2π·v/q), 1 = exactly, 0 = not at all. */
function onLattice(values: Float64Array, q: number): number {
  let c = 0;
  const f = (2 * Math.PI) / q;
  for (let i = 0; i < values.length; i++) c += Math.cos(f * values[i]);
  return values.length ? c / values.length : 0;
}

/**
 * Largest step to try: the values must span several steps, or a narrow spread of values near a
 * multiple of q would look like a pattern.
 */
function maxStepFor(values: Float64Array): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length < 4) return 0;
  const iqr = sorted[Math.floor(sorted.length * 0.75)] - sorted[Math.floor(sorted.length * 0.25)];
  return Math.min(64, Math.floor(iqr / 2));
}

/** The DC step the file itself was saved with: the largest step its block averages sit on. */
function ownDcStep(values: Float64Array): number {
  const top = maxStepFor(values);
  for (let q = top; q >= 2; q--) if (onLattice(values, q) > 0.8) return q;
  return 1;
}

/* ------------------------------------------------------------------------------------------------
 * 1. Grid alignment
 * ---------------------------------------------------------------------------------------------- */

export interface GridResult {
  /** Where the strongest 8×8 grid starts, 0–7 on each axis. (0, 0) is where a JPEG's own grid is. */
  offset: { x: number; y: number };
  /** How far that grid stands out from the typical one (0–1: share of block averages on its steps). */
  strength: number;
  /**
   * False when a grid at another offset stands out clearly: as the strongest grid, or as a second
   * grid beside the file's own (cropped, then re-saved at a similar or better quality).
   */
  aligned: boolean;
  /** True when the picture's own JPEG grid is visible at all. A resized or re-drawn picture has none. */
  confident: boolean;
  /** The shifted grid found, when aligned is false. */
  shifted: { x: number; y: number } | null;
  /** Score of the strongest shifted grid over the typical one, found or not (for tuning). */
  shiftScore: number;
}

/** The file's own grid must have at least this share of block averages on its steps to say anything. */
const OWN_GRID_MIN = 0.5;
/** A shifted grid must reach this score… */
const SHIFT_MIN = 0.17;
/** …and stand this many standard errors above the typical shifted grid, so noise never counts. */
const SHIFT_MIN_Z = 5;
const MIN_DC_BLOCKS = 200;

/**
 * Why block averages, not visible blocking: we tried measuring the faint block edges (the usual
 * "blocking grid"), but re-saving at a high quality smooths the old edges away, even though the
 * old rounding of each block's average survives almost intact. So for each of the 64 grids we
 * ask how strongly the block averages sit on multiples of some step. On the file's own grid they
 * always do (that is the current save). On a grid shifted by (dx, dy) they only do when the
 * picture was saved as a JPEG before, in a position shifted by that much: cropped, or pasted.
 */
export function jpegGrid(rgba: ArrayLike<number>, w: number, h: number): GridResult {
  const none: GridResult = { offset: { x: 0, y: 0 }, strength: 0, aligned: true, confident: false, shifted: null, shiftScore: 0 };
  if (w < 64 || h < 64 || rgba.length < w * h * 4) return none;
  const sums = sumsOf(rgba, lumaOf(rgba, w, h), w, h);
  const own = dcValues(sums, 0, 0);
  if (own.length < MIN_DC_BLOCKS) return none;
  const ownStep = ownDcStep(own);
  const ownScore = ownStep >= 2 ? onLattice(own, ownStep) : 0;

  const scores: { x: number; y: number; score: number; n: number }[] = [];
  for (let oy = 0; oy < 8; oy++) {
    for (let ox = 0; ox < 8; ox++) {
      if (!ox && !oy) continue;
      const v = dcValues(sums, ox, oy);
      let score = 0;
      const top = maxStepFor(v);
      for (let q = 3; q <= top; q++) {
        // The file's own step, or a step that divides it, is an echo of the current grid: on a
        // smooth picture a block shifted by a pixel or two has nearly the same average as the
        // block it overlaps most, and half a block's average is a multiple of half the step.
        // The cost: a crop re-saved with the same DC step is not seen (it rarely is anyway).
        if (ownStep % q === 0) continue;
        const e = onLattice(v, q);
        score = Math.max(score, e);
      }
      scores.push({ x: ox, y: oy, score, n: v.length });
    }
  }
  const typical = median(scores.map((s) => s.score));
  const best = scores.reduce((a, b) => (b.score > a.score ? b : a));
  const se = 1 / Math.sqrt(2 * Math.max(1, best.n));
  const isShifted = best.n >= MIN_DC_BLOCKS && best.score >= SHIFT_MIN && best.score - typical >= SHIFT_MIN_Z * se;
  const confident = ownScore >= OWN_GRID_MIN || isShifted;
  const top = isShifted && best.score > ownScore ? best : { x: 0, y: 0, score: ownScore };
  return {
    offset: { x: top.x, y: top.y },
    strength: Math.max(0, top.score - typical),
    aligned: !isShifted,
    confident,
    shifted: isShifted ? { x: best.x, y: best.y } : null,
    shiftScore: best.score - typical,
  };
}

/* ------------------------------------------------------------------------------------------------
 * 2. Double compression
 * ---------------------------------------------------------------------------------------------- */

export interface DoubleResult {
  doubleCompressed: boolean;
  /** Share of the "saved once" misfit that a "saved twice" explanation removes (AC histograms), 0–1. */
  score: number;
  /** Same for the block averages: how strongly they sit on an older, coarser step (0–1). */
  dcScore: number;
  /** The standard quality the picture was most likely saved at first, when it was saved twice. */
  firstQualityHint?: number;
}

/** Low frequencies (row, col): they have the most non-zero values, so the fullest histograms. */
const COEFS: [number, number][] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [0, 2],
  [2, 0],
  [1, 2],
  [2, 1],
];
const KMAX = 48;
/** Expected count a histogram bin needs before it is used in the fit. */
const MIN_EXPECTED = 20;
/** Natural histograms are not perfectly smooth: allow this much relative misfit per bin. */
const MODEL_SLACK = 0.2;
/** "Saved twice" must remove at least this share of the "saved once" misfit… */
const DQ_MIN_SCORE = 0.6;
/** …and this much misfit in total (in χ² units), so small pictures with thin histograms stay silent. */
const DQ_MIN_GAIN = 120;
/** …in at least this many of the coefficients, each gaining this much, so one odd histogram is not enough. */
const DQ_MIN_COEFS = 2;
const DQ_MIN_COEF_GAIN = 40;

// 8-point DCT basis with JPEG's scaling (orthonormal), so coefficients match the quantization steps.
const C8: Float64Array[] = Array.from({ length: 8 }, (_, u) => {
  const row = new Float64Array(8);
  const c = u === 0 ? Math.SQRT1_2 : 1;
  for (let x = 0; x < 8; x++) row[x] = (c / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  return row;
});

/**
 * The few coefficients we need from every 8×8 block on the file's own grid. Blocks with clipped
 * pixels (pure black or white, common on receipts) are skipped: clipping moves their coefficients
 * off the quantization steps and only blurs the histograms.
 */
function blockCoefficients(rgba: ArrayLike<number>, L: Float32Array, w: number, h: number): Float64Array[] {
  const cols = Math.floor(w / 8);
  const rows = Math.floor(h / 8);
  const out = COEFS.map(() => new Float64Array(cols * rows));
  let n = 0;
  const block = new Float64Array(64);
  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let clipped = false;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const p = (by * 8 + y) * w + bx * 8 + x;
          const i = p * 4;
          if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) <= 0 || Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) >= 255) clipped = true;
          block[y * 8 + x] = L[p];
        }
      }
      if (clipped) continue;
      for (let c = 0; c < COEFS.length; c++) {
        const [v, u] = COEFS[c];
        let s = 0;
        for (let y = 0; y < 8; y++) {
          let r = 0;
          for (let x = 0; x < 8; x++) r += C8[u][x] * block[y * 8 + x];
          s += C8[v][y] * r;
        }
        out[c][n] = s;
      }
      n++;
    }
  }
  return out.map((a) => a.subarray(0, n));
}

/**
 * The step a coefficient was last rounded to, when the file's table is unknown: the largest step
 * whose multiples the values sit on (the mean of cos(2π·value/step) is near 1 only then).
 */
export function estimateStep(values: ArrayLike<number>): number {
  const used: number[] = [];
  for (let i = 0; i < values.length; i++) if (Math.abs(values[i]) >= 1.5) used.push(values[i]);
  if (used.length < 50) return 1;
  for (let q = 64; q >= 2; q--) {
    let s = 0;
    for (const v of used) s += Math.cos((2 * Math.PI * v) / q);
    if (s / used.length > 0.8) return q;
  }
  return 1;
}

/** How many first-save values m ≥ 0 end up in each bin k after the second save: round(m·q1/q2). */
function multiplicity(q1: number, q2: number, kmax: number): Float64Array {
  const n = new Float64Array(kmax + 1);
  for (let m = 0; ; m++) {
    const k = Math.round((m * q1) / q2);
    if (k > kmax) break;
    n[k]++;
  }
  return n;
}

/**
 * Misfit (χ²) of the histogram h (bins 1..KMAX, folded |k|) against "bin k holds n[k] first-save
 * values, under a smooth falling envelope". The envelope is fitted locally in log space (a
 * straight line through nearby occupied bins), which is exact for the Laplacian shape natural
 * coefficients follow, so a single save fits with n ≡ 1 and a double save fits with its comb.
 */
function misfit(hist: Float64Array, n: Float64Array, radius: number, last: number): { chi2: number; bins: number } {
  let chi2 = 0;
  let bins = 0;
  // Bin 1 sits on the sharp peak at zero, where real histograms depart most from any smooth
  // shape (flat areas pile up there); it is left out of both the envelope and the misfit.
  for (let k = 2; k <= last; k++) {
    // Weighted least squares of log(h/n) = a + b·(j - k) over occupied bins nearby.
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let j = Math.max(2, k - radius); j <= Math.min(KMAX, k + radius); j++) {
      if (n[j] <= 0 || j === k) continue;
      const wgt = hist[j] + 1;
      const y = Math.log((hist[j] + 0.5) / n[j]);
      const x = j - k;
      sw += wgt; sx += wgt * x; sy += wgt * y; sxx += wgt * x * x; sxy += wgt * x * y;
    }
    if (sw <= 0) continue;
    const det = sw * sxx - sx * sx;
    const a = det > 1e-9 ? (sy * sxx - sx * sxy) / det : sy / sw;
    // An empty bin in the model still catches a little spill from rounding noise.
    const expected = Math.exp(a) * Math.max(n[k], 0.03);
    const envelope = Math.exp(a);
    if (envelope < MIN_EXPECTED) continue;
    const d = hist[k] - expected;
    chi2 += (d * d) / (expected + 1 + (MODEL_SLACK * expected) ** 2);
    bins++;
  }
  return { chi2, bins };
}

interface CoefFit {
  nullChi2: number;
  bestChi2: number;
  bestQ1: number;
  q2: number;
  bins: number;
  hist: Float64Array;
  last: number;
}

function fitCoefficient(values: Float64Array, q2: number): CoefFit | null {
  if (q2 < 1) return null;
  const hist = new Float64Array(KMAX + 1);
  let nonzero = 0;
  for (let i = 0; i < values.length; i++) {
    const k = Math.abs(Math.round(values[i] / q2));
    if (k >= 1 && k <= KMAX) {
      hist[k]++;
      nonzero++;
    }
  }
  if (nonzero < 150) return null;
  // Use bins up to where the counts thin out.
  let last = 1;
  for (let k = 1; k <= KMAX; k++) if (hist[k] >= MIN_EXPECTED) last = k;
  if (last < 5) return null;
  const ones = new Float64Array(KMAX + 1).fill(1);
  const base = misfit(hist, ones, 3, last);
  // Too few well-filled bins to see a pattern in.
  if (base.bins < 4) return null;
  let bestChi2 = base.chi2;
  let bestQ1 = q2;
  const maxQ1 = Math.min(255, Math.max(16, q2 * 10));
  for (let q1 = 1; q1 <= maxQ1; q1++) {
    if (q1 === q2) continue;
    const n = multiplicity(q1, q2, KMAX);
    // The window has to span a couple of the comb's teeth to see the envelope through them.
    const radius = Math.max(3, Math.ceil((2 * q1) / q2) + 1);
    const fit = misfit(hist, n, radius, last);
    // Compare like with like: a fit that dropped bins is not a better fit.
    if (fit.bins < base.bins * 0.8) continue;
    const chi2 = fit.chi2 * (base.bins / Math.max(1, fit.bins));
    if (chi2 < bestChi2) {
      bestChi2 = chi2;
      bestQ1 = q1;
    }
  }
  return { nullChi2: base.chi2, bestChi2, bestQ1, q2, bins: base.bins, hist, last };
}

/**
 * Was the picture saved twice at different qualities? `lumaTable` is the file's luminance table
 * in zigzag order (readJpeg(bytes).luma), or null when unknown (the steps are then estimated
 * from the pixels, which works for most pictures but is less certain).
 *
 * Blocks are taken on the file's own grid at (0, 0), because that is the grid the current table
 * applies to. Caveat: when the first save was on a different grid (the picture was cropped in
 * between), this check cannot see it; the grid check above covers that case. Found reliably
 * only when the first save was coarser (lower quality) than the last: a finer first save is
 * mostly wiped out by the coarser rounding after it.
 */
export function jpegDouble(rgba: ArrayLike<number>, w: number, h: number, lumaTable: ArrayLike<number> | null): DoubleResult {
  const none: DoubleResult = { doubleCompressed: false, score: 0, dcScore: 0 };
  if (w < 64 || h < 64 || rgba.length < w * h * 4) return none;
  const L = lumaOf(rgba, w, h);
  const table = lumaTable && lumaTable.length >= 64 ? dezigzag(lumaTable) : null;

  // Block averages: the first save's DC step, if any.
  const dc = dcValues(sumsOf(rgba, L, w, h), 0, 0);
  const dcStep = table ? table[0] : ownDcStep(dc);
  const dcFit = dcDouble(dc, dcStep);

  // AC histograms: the comb fit.
  const values = blockCoefficients(rgba, L, w, h);
  const fits = COEFS.map(([v, u], c) => {
    const q2 = table ? table[v * 8 + u] : estimateStep(values[c]);
    return fitCoefficient(values[c], q2);
  });
  let nullTotal = 0;
  let gain = 0;
  let agreeing = 0;
  for (const f of fits) {
    if (!f) continue;
    nullTotal += f.nullChi2;
    gain += f.nullChi2 - f.bestChi2;
    if (f.bestQ1 !== f.q2 && f.bestChi2 < f.nullChi2 * (1 - DQ_MIN_SCORE) && f.nullChi2 - f.bestChi2 >= DQ_MIN_COEF_GAIN) agreeing++;
  }
  const score = nullTotal > 0 ? gain / nullTotal : 0;
  const byComb = score >= DQ_MIN_SCORE && gain >= DQ_MIN_GAIN && agreeing >= DQ_MIN_COEFS;
  const byDc = dcFit.score >= DC_DOUBLE_MIN;
  const doubleCompressed = byComb || byDc;
  const out: DoubleResult = { doubleCompressed, score, dcScore: dcFit.score };
  if (!doubleCompressed) return out;
  const hint = byDc ? qualityForDcStep(dcFit.q1) : firstQuality(fits);
  if (hint !== undefined) out.firstQualityHint = hint;
  return out;
}

/** Least score for "the block averages sit on a coarser, older step". */
const DC_DOUBLE_MIN = 0.5;
/** Distinct well-filled averages needed before the DC check says anything. */
const DC_MIN_DISTINCT = 16;

/**
 * Saved twice, with a coarser DC step q1 the first time: every block average is a multiple of
 * the current step q2 AND close to a multiple of q1, so of all the multiples of q2 only those
 * near multiples of q1 occur. Saved once, every multiple of q2 in the range occurs.
 *
 * Each distinct average counts once, however many blocks have it, so a picture with one big
 * even background cannot fake the pattern; averages seen only once are skipped as stray. The
 * score is the mean of cos(2π·value/q1) over the distinct values: near 1 when they all sit on
 * q1's multiples, near 0 when they fill the range evenly.
 */
function dcDouble(values: Float64Array, q2: number): { score: number; q1: number } {
  const none = { score: 0, q1: q2 };
  if (q2 < 1 || values.length < MIN_DC_BLOCKS) return none;
  const counts = new Map<number, number>();
  for (const v of values) {
    const k = Math.round(v / q2);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const ks = [...counts].filter(([, n]) => n >= 2).map(([k]) => k).sort((a, b) => a - b);
  if (ks.length < DC_MIN_DISTINCT) return none;
  // The values must span at least four of the larger steps, or any step "fits" a short run.
  const span = (ks[ks.length - 1] - ks[0]) * q2;
  let best = none;
  for (let q1 = q2 + 1; q1 <= Math.min(128, span / 4); q1++) {
    let c = 0;
    for (const k of ks) c += Math.cos((2 * Math.PI * k * q2) / q1);
    const score = c / ks.length;
    // Prefer the largest step that fits about as well (a step's divisors fit too).
    if (score > best.score + 0.05 || (score >= best.score - 0.05 && score >= DC_DOUBLE_MIN && q1 > best.q1 && q1 % best.q1 === 0)) best = { score, q1 };
  }
  return best;
}

/** The standard quality (1–100) whose DC step is q1: the middle of the qualities that share it. */
function qualityForDcStep(q1: number): number | undefined {
  const qs: number[] = [];
  for (let q = 1; q <= 100; q++) if (ijgLuma(q)[0] === q1) qs.push(q);
  return qs.length ? qs[qs.length >> 1] : undefined;
}

/** The standard quality whose table explains all the coefficients' first steps together best. */
function firstQuality(fits: (CoefFit | null)[]): number | undefined {
  let best: { q: number; chi2: number } | null = null;
  let nullTotal = 0;
  for (const f of fits) if (f) nullTotal += f.nullChi2;
  for (let q = 1; q <= 100; q++) {
    const t = ijgLuma(q);
    let chi2 = 0;
    COEFS.forEach(([v, u], c) => {
      const f = fits[c];
      if (!f) return;
      const q1 = t[v * 8 + u];
      if (q1 === f.q2) {
        chi2 += f.nullChi2;
        return;
      }
      const radius = Math.max(3, Math.ceil((2 * q1) / f.q2) + 1);
      const fit = misfit(f.hist, multiplicity(q1, f.q2, KMAX), radius, f.last);
      // A step so coarse that it leaves too few bins to judge explains nothing: count it as no fit.
      chi2 += fit.bins < f.bins * 0.8 ? f.nullChi2 : fit.chi2 * (f.bins / Math.max(1, fit.bins));
    });
    if (!best || chi2 < best.chi2) best = { q, chi2 };
  }
  // Only name a quality when it explains the histograms nearly as well as the free fit did.
  return best && best.chi2 < nullTotal * 0.5 ? best.q : undefined;
}

/* ------------------------------------------------------------------------------------------------
 * Plain-language hints
 * ---------------------------------------------------------------------------------------------- */

export interface JpegGridHint {
  id: 'cropped_resaved' | 'double_jpeg';
  strength: 1 | 2;
  text: string;
}

export function jpegGridHints(grid: GridResult | null, dq: DoubleResult | null): JpegGridHint[] {
  const out: JpegGridHint[] = [];
  if (grid && grid.confident && !grid.aligned) {
    out.push({
      id: 'cropped_resaved',
      // Strong only when the shifted grid is the strongest one: the old blocking outweighs the new.
      strength: grid.offset.x !== 0 || grid.offset.y !== 0 ? (grid.strength >= 0.3 ? 2 : 1) : 1,
      text: "The picture's compression grid is shifted: it was cropped or pasted together, then saved again.",
    });
  }
  if (dq && dq.doubleCompressed) {
    out.push({
      id: 'double_jpeg',
      // Saving twice is common and often innocent (chat apps re-save), so this stays a weak hint.
      strength: 1,
      text: 'The picture was saved twice at different qualities, as happens when it is edited and saved again.',
    });
  }
  return out;
}
