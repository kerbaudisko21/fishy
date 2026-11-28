import { largestCluster, placeOf, type Box } from './grid';

/*
 * Copy-move: a part of the picture copied and pasted somewhere else in the SAME picture, as when
 * a digit, a signature or a stamp is cloned on a receipt. No AI, no canvas: pure arithmetic.
 *
 * How (block matching, after Fridrich, Soukal and Lukáš, 2003):
 *  1. Cut the picture's brightness into overlapping 16×16 blocks, one at every pixel, so a copy
 *     moved by any whole number of pixels lands exactly on another block.
 *  2. Describe each block by a few coarse 2D cosine-transform coefficients: its overall shape,
 *     not its fine grain, so a lightly noised copy still has (almost) the same description.
 *  3. Sort the descriptions so similar blocks end up next to each other, compare each block with
 *     its next few neighbours in that order, and check the candidates pixel by pixel.
 *  4. A real copy moves MANY neighbouring blocks by the SAME shift. So we count matched pairs per
 *     shift and only report one when it is backed by a large, solid patch of blocks.
 *
 * What fools a naive version, and what we do about it:
 *  - Flat areas (white paper, sky) match everywhere → blocks with little contrast are skipped.
 *  - Straight lines, edges, ruled tables and gradients match themselves shifted along the line →
 *    a block that still looks the same when moved 4 pixels across or down is ignored.
 *  - Neighbouring blocks overlap and always look alike → matches closer than MIN_SHIFT are ignored.
 *  - Tiles, and words printed on several lines, match at several shifts (one tile, two tiles…) →
 *    a block matched at two clearly different shifts is set aside as "repeating", and a shift
 *    mostly backed by such blocks is a pattern, not a copy.
 *  - Repeated letters and words make thin or gappy clusters → the patch must be wide, tall and
 *    solid (most of its outline filled).
 * Genuinely repeated content (the same logo printed twice, two identical lines in a screenshot)
 * IS a copy as far as pixels go; that is why this is a hint for a person to look at, not a verdict.
 *
 * Size: the work grows with the number of pixels. Pass a copy downscaled to about 1.2 MP; above
 * MAX_PIXELS we fall back to reading every n-th pixel, which is cruder than a proper downscale.
 */

export interface CopyMoveResult {
  found: boolean;
  /** How far the copy sits from the part it was copied from, in pixels of the picture passed in. */
  shift?: { dx: number; dy: number };
  /** Matched block pairs behind the best shift (0 when nothing matched). */
  pairs: number;
  /** The two look-alike parts, as fractions of the picture (which one is the original can't be told). */
  source?: Box;
  target?: Box;
  /** Where the copy is, in words: "top left", "centre"… */
  place?: string;
}

export interface CopyMoveHint {
  id: 'copy_move';
  strength: 1 | 2;
  text: string;
}

const B = 16;
/** Above this many pixels we sample by a whole-number stride, aiming for TARGET_PIXELS. */
const MAX_PIXELS = 1_500_000;
const TARGET_PIXELS = 1_200_000;
/** Blocks whose brightness varies less than this (standard deviation, 0–255) are too flat to tell apart. */
const MIN_STD = 6;
/** Pairs closer than this (pixels) are overlapping neighbours, not a copy. */
const MIN_SHIFT = 2 * B;
/** How many following blocks, in sorted order, each block is compared with. */
const SCAN = 16;
/** Largest difference allowed on any coarse coefficient before we bother with the pixels. */
const FEAT_TOL = 12;
/** Mean absolute pixel difference (0–255) for two blocks to count as the same. */
const PIX_TOL = 3;
/** A block that matches itself moved by SELF_STEP pixels is a line or an edge, not a shape. */
const SELF_STEP = 4;
const SELF_TOL = PIX_TOL + 1;
/** Matched pairs needed behind one shift: a floor; the patch tests below do most of the work. */
const MIN_PAIRS = 60;
/** The patch of matched blocks must cover this many CELL×CELL cells of block corners… */
const CELL = 2;
const MIN_CELLS = 40;
/** …spread at least this far (pixels) across and down. */
const MIN_SPAN = 16;
/** Share of the patch's outline (in cells) its blocks must fill. */
const MIN_FILL = 0.65;
/** At most this share of the patch may also match at other shifts (repeating words, tiles). */
const REPEAT_SHARE = 0.3;
/** How many of the strongest shifts we examine. */
const CANDIDATES = 8;
/** Stop collecting pairs past this, so a pathological picture can't eat the memory. */
const MAX_PAIRS = 1_000_000;
/** Partners kept per block: one is enough for a copy, a few more show what repeats. */
const MAX_PARTNERS = 3;

const lum = (d: ArrayLike<number>, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** The picture's brightness, read every `stride` pixels. */
function luminance(d: ArrayLike<number>, w: number, h: number, stride: number) {
  const lw = Math.floor(w / stride);
  const lh = Math.floor(h / stride);
  const out = new Float32Array(lw * lh);
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) out[y * lw + x] = lum(d, (y * stride * w + x * stride) * 4);
  }
  return { L: out, lw, lh };
}

/** Running sums of brightness and brightness², so any block's contrast costs four look-ups. */
function integrals(L: Float32Array, lw: number, lh: number) {
  const W = lw + 1;
  const s = new Float64Array(W * (lh + 1));
  const s2 = new Float64Array(W * (lh + 1));
  for (let y = 0; y < lh; y++) {
    let row = 0;
    let row2 = 0;
    for (let x = 0; x < lw; x++) {
      const v = L[y * lw + x];
      row += v;
      row2 += v * v;
      s[(y + 1) * W + x + 1] = s[y * W + x + 1] + row;
      s2[(y + 1) * W + x + 1] = s2[y * W + x + 1] + row2;
    }
  }
  return { s, s2, W };
}

/** The 1D cosine basis for a 16-long signal, first 4 frequencies, scaled so it keeps energy. */
function cosineBasis(): Float64Array[] {
  return [0, 1, 2, 3].map((u) => {
    const a = u === 0 ? Math.sqrt(1 / B) : Math.sqrt(2 / B);
    return Float64Array.from({ length: B }, (_, x) => a * Math.cos((Math.PI * (2 * x + 1) * u) / (2 * B)));
  });
}

/** Coefficients kept, as (horizontal, vertical) frequency, lowest first in zig-zag order. */
const ZIGZAG: [number, number][] = [[0, 0], [1, 0], [0, 1], [0, 2], [1, 1], [2, 0], [3, 0], [2, 1], [1, 2], [0, 3]];
const NF = ZIGZAG.length;

/** Mean absolute difference between two 16×16 blocks, giving up early once it can't be under `limit`. */
function blockDiff(L: Float32Array, lw: number, ax: number, ay: number, bx: number, by: number, limit: number): number {
  const budget = limit * B * B;
  let sum = 0;
  for (let y = 0; y < B; y++) {
    const ra = (ay + y) * lw + ax;
    const rb = (by + y) * lw + bx;
    for (let x = 0; x < B; x++) sum += Math.abs(L[ra + x] - L[rb + x]);
    if (sum > budget) return Infinity;
  }
  return sum / (B * B);
}

/** True when the block looks the same moved a little across or down: a line, an edge, a ramp. */
function oneDimensional(L: Float32Array, lw: number, lh: number, x: number, y: number): boolean {
  const sx = x + SELF_STEP + B <= lw ? x + SELF_STEP : x - SELF_STEP;
  const sy = y + SELF_STEP + B <= lh ? y + SELF_STEP : y - SELF_STEP;
  if (sx >= 0 && blockDiff(L, lw, x, y, sx, y, SELF_TOL) <= SELF_TOL) return true;
  if (sy >= 0 && blockDiff(L, lw, x, y, x, sy, SELF_TOL) <= SELF_TOL) return true;
  return false;
}

const NONE: CopyMoveResult = { found: false, pairs: 0 };

/** Looks for one part of the picture copied onto another part (RGBA pixels, w × h). */
export function copyMoveFromPixels(d: ArrayLike<number>, w: number, h: number): CopyMoveResult {
  if (!(w > 0 && h > 0) || d.length < w * h * 4) return NONE;
  const stride = w * h > MAX_PIXELS ? Math.ceil(Math.sqrt((w * h) / TARGET_PIXELS)) : 1;
  const { L, lw, lh } = luminance(d, w, h, stride);
  // The picture must hold two blocks at least MIN_SHIFT apart, or there is nothing to compare.
  if (lw < B || lh < B || Math.hypot(lw - B, lh - B) < MIN_SHIFT) return NONE;

  const nx = lw - B + 1;
  const ny = lh - B + 1;
  const { s, s2, W } = integrals(L, lw, lh);

  // Keep only blocks with enough contrast; flat ones match everything and prove nothing.
  const keep = new Uint8Array(nx * ny);
  let n = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const a = y * W + x, b = a + B, c = (y + B) * W + x, e = c + B;
      const sum = s[e] - s[b] - s[c] + s[a];
      const sum2 = s2[e] - s2[b] - s2[c] + s2[a];
      const mean = sum / (B * B);
      if (sum2 / (B * B) - mean * mean >= MIN_STD * MIN_STD) {
        keep[y * nx + x] = 1;
        n++;
      }
    }
  }
  if (n < 2) return NONE;

  // The 2D cosine transform splits into rows then columns: first each row segment against the 4
  // horizontal frequencies, for every starting column, then those against the vertical ones.
  const C = cosineBasis();
  const R = [0, 1, 2, 3].map(() => new Float32Array(lh * nx));
  for (let y = 0; y < lh; y++) {
    const row = y * lw;
    for (let x = 0; x < nx; x++) {
      let r0 = 0, r1 = 0, r2 = 0, r3 = 0;
      for (let k = 0; k < B; k++) {
        const v = L[row + x + k];
        r0 += C[0][k] * v; r1 += C[1][k] * v; r2 += C[2][k] * v; r3 += C[3][k] * v;
      }
      const o = y * nx + x;
      R[0][o] = r0; R[1][o] = r1; R[2][o] = r2; R[3][o] = r3;
    }
  }

  const feat = new Float32Array(n * NF);
  const pos = new Int32Array(n);
  // Sort key: the first 6 coefficients, coarsely rounded and packed into 32 bits, then the block's
  // number in the low 21 bits. Plain number sorting is then a lexicographic sort that still lets
  // us find each block again — far faster than sorting objects with a comparison function.
  const keys = new Float64Array(n);
  const coarse = (f: number) => Math.min(31, Math.max(0, Math.floor(f / 24) + 16));
  let k = 0;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (!keep[y * nx + x]) continue;
      const f = k * NF;
      for (let z = 0; z < NF; z++) {
        const [u, v] = ZIGZAG[z];
        const Ru = R[u];
        const Cv = C[v];
        let acc = 0;
        for (let j = 0; j < B; j++) acc += Cv[j] * Ru[(y + j) * nx + x];
        feat[f + z] = acc;
      }
      // The first coefficient is 16 × the block's mean brightness (0–4080): 128 steps of 2 levels.
      let prefix = Math.min(127, Math.max(0, Math.floor(feat[f] / 32)));
      for (let z = 1; z <= 5; z++) prefix = prefix * 32 + coarse(feat[f + z]);
      keys[k] = prefix * 2_097_152 + k;
      pos[k] = y * nx + x;
      k++;
    }
  }
  keys.sort();
  // Unpack once: block number, and its corner, in sorted order.
  const order = new Int32Array(n);
  const ox = new Int32Array(n);
  const oy = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const a = keys[i] % 2_097_152;
    order[i] = a;
    ox[i] = pos[a] % nx;
    oy[i] = (pos[a] / nx) | 0;
  }

  // Compare each block with the next few in sorted order; keep pairs far apart that truly match.
  const pairSx: number[] = [];
  const pairSy: number[] = [];
  const pairDx: number[] = [];
  const pairDy: number[] = [];
  // Whether a block is a line or an edge, worked out once per block: 0 unknown, 1 no, 2 yes.
  const lineLike = new Uint8Array(n);
  for (let i = 0; i < n && pairSx.length < MAX_PAIRS; i++) {
    const a = order[i];
    const ax = ox[i], ay = oy[i];
    let found = 0;
    for (let j = i + 1; j < Math.min(n, i + 1 + SCAN) && found < MAX_PARTNERS; j++) {
      const b = order[j];
      const bx = ox[j], by = oy[j];
      let dx = bx - ax, dy = by - ay;
      if (dx * dx + dy * dy < MIN_SHIFT * MIN_SHIFT) continue;
      let close = true;
      for (let z = 0; z < NF; z++) {
        if (Math.abs(feat[a * NF + z] - feat[b * NF + z]) > FEAT_TOL) { close = false; break; }
      }
      if (!close || blockDiff(L, lw, ax, ay, bx, by, PIX_TOL) > PIX_TOL) continue;
      if (!lineLike[a]) lineLike[a] = oneDimensional(L, lw, lh, ax, ay) ? 2 : 1;
      if (lineLike[a] === 2) break;
      found++;
      // (dx, dy) and (−dx, −dy) are the same copy seen from either end: keep dx ≥ 0.
      let sx = ax, sy = ay;
      if (dx < 0 || (dx === 0 && dy < 0)) { sx = bx; sy = by; dx = -dx; dy = -dy; }
      pairSx.push(sx); pairSy.push(sy); pairDx.push(dx); pairDy.push(dy);
    }
  }
  if (!pairSx.length) return NONE;

  const np = pairSx.length;
  const ends = (p: number) => [pairSy[p] * nx + pairSx[p], (pairSy[p] + pairDy[p]) * nx + pairSx[p] + pairDx[p]];

  // A block matched at two clearly different shifts is part of something that repeats (a word
  // printed on several lines, a tile): real, not copied. Remember the first shift each block was
  // matched at, and flag it when a different one turns up.
  const NO = -32768;
  const firstDx = new Int16Array(nx * ny).fill(NO);
  const firstDy = new Int16Array(nx * ny);
  const repeats = new Uint8Array(nx * ny);
  for (let p = 0; p < np; p++) {
    for (const e of ends(p)) {
      if (firstDx[e] === NO) { firstDx[e] = pairDx[p]; firstDy[e] = pairDy[p]; }
      else if (Math.abs(firstDx[e] - pairDx[p]) > 2 || Math.abs(firstDy[e] - pairDy[p]) > 2) repeats[e] = 1;
    }
  }
  const unique = (p: number) => ends(p).every((e) => !repeats[e]);

  // Pairs per shift: all of them, and those between blocks that match nowhere else.
  const OFF = 1 << 14;
  const shiftKey = (dx: number, dy: number) => (dx + OFF) * 2 * OFF + (dy + OFF);
  const all = new Map<number, number>();
  const uniq = new Map<number, number>();
  for (let p = 0; p < np; p++) {
    const key = shiftKey(pairDx[p], pairDy[p]);
    all.set(key, (all.get(key) ?? 0) + 1);
    if (unique(p)) uniq.set(key, (uniq.get(key) ?? 0) + 1);
  }
  // Support counts the ±1 neighbours too, since a resampled copy smears by a pixel.
  const support = (m: Map<number, number>, dx: number, dy: number) => {
    let t = 0;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) t += m.get(shiftKey(dx + ox, dy + oy)) ?? 0;
    return t;
  };
  const ranked = [...uniq.keys()]
    .map((key) => {
      const dx = Math.floor(key / (2 * OFF)) - OFF, dy = (key % (2 * OFF)) - OFF;
      return { dx, dy, pairs: support(uniq, dx, dy) };
    })
    .sort((a, b) => b.pairs - a.pairs);
  if (!ranked.length) return NONE;

  // Judge the strongest few shifts in turn: the top one can be a smear of an edge or a texture.
  const cols = Math.ceil(nx / CELL);
  const rows = Math.ceil(ny / CELL);
  const pairs = ranked[0].pairs;
  let found: { dx: number; dy: number; pairs: number; box: Box } | null = null;
  const tried: { dx: number; dy: number }[] = [];
  for (const cand of ranked) {
    if (cand.pairs < MIN_PAIRS || tried.length >= CANDIDATES) break;
    if (tried.some((t) => Math.abs(t.dx - cand.dx) <= 2 && Math.abs(t.dy - cand.dy) <= 2)) continue;
    tried.push(cand);
    const own = support(all, cand.dx, cand.dy);
    const flags = new Array<boolean>(cols * rows).fill(false);
    for (let p = 0; p < np; p++) {
      if (Math.abs(pairDx[p] - cand.dx) > 1 || Math.abs(pairDy[p] - cand.dy) > 1 || !unique(p)) continue;
      flags[((pairSy[p] / CELL) | 0) * cols + ((pairSx[p] / CELL) | 0)] = true;
    }
    const cluster = largestCluster(flags, cols, rows);
    const spanX = cluster ? Math.round((cluster.box.x1 - cluster.box.x0) * cols) * CELL : 0;
    const spanY = cluster ? Math.round((cluster.box.y1 - cluster.box.y0) * rows) * CELL : 0;
    // A copy moves one solid patch, wider and taller than a line of text, that matches nowhere else.
    if (cand.pairs < (1 - REPEAT_SHARE) * own) continue;
    if (!cluster || cluster.size < MIN_CELLS || spanX < MIN_SPAN || spanY < MIN_SPAN) continue;
    // …and fills most of its outline: repeated words leave gaps between words and lines.
    if (cluster.size < MIN_FILL * (spanX / CELL) * (spanY / CELL)) continue;
    found = { dx: cand.dx, dy: cand.dy, pairs: cand.pairs, box: cluster.box };
    break;
  }
  if (!found) return { found: false, pairs };
  const best = found;
  const cluster = found;

  // Block corners → the area those blocks cover, as fractions of the picture.
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = cluster.box.x0 * cols * CELL;
  const y0 = cluster.box.y0 * rows * CELL;
  const x1 = Math.min(nx, cluster.box.x1 * cols * CELL) + B - 1;
  const y1 = Math.min(ny, cluster.box.y1 * rows * CELL) + B - 1;
  const source: Box = { x0: clamp(x0 / lw), y0: clamp(y0 / lh), x1: clamp(x1 / lw), y1: clamp(y1 / lh) };
  const target: Box = {
    x0: clamp((x0 + best.dx) / lw), y0: clamp((y0 + best.dy) / lh),
    x1: clamp((x1 + best.dx) / lw), y1: clamp((y1 + best.dy) / lh),
  };
  return { found: true, shift: { dx: best.dx * stride, dy: best.dy * stride }, pairs: best.pairs, source, target, place: placeOf(target) };
}

/** The finding in plain words, or null when nothing was copied. */
export function copyMoveHint(r: CopyMoveResult): CopyMoveHint | null {
  if (!r.found) return null;
  const where = r.place ? ` (around the ${r.place})` : '';
  // Tested in Chrome on realistic receipts: no false alarms on clean ones, about half of cloned
  // amounts caught, but a logo or icon printed twice is a real copy too. So it is a weak sign, and
  // the card outlines both parts for a person to judge.
  return {
    id: 'copy_move',
    strength: 1,
    text: `Two parts of the picture are pixel-for-pixel the same${where}: a number or stamp may have been cloned, or it simply shows the same thing twice. Compare the two outlined areas.`,
  };
}
