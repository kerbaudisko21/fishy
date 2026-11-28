import { describe, expect, it } from 'vitest';
import { dezigzag, estimateStep, ijgLuma, jpegDouble, jpegGrid, jpegGridHints, ZIGZAG } from './jpeggrid';

/*
 * Tests run in node with no JPEG encoder, so we simulate one: 8×8 block DCT, quantize with the
 * IJG table at a quality, dequantize, inverse DCT, round and clamp to 8 bits. That is all the
 * checks look at (the entropy coding is lossless). Colour pictures go through YCbCr with the
 * same table on all three channels and are rounded back to RGB, like a browser decode.
 */

/** Deterministic random numbers (mulberry32), so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C8 = Array.from({ length: 8 }, (_, u) => Array.from({ length: 8 }, (_, x) => ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)));

/** One channel through the JPEG round trip at a quality (w, h need not be multiples of 8). */
function jpegPlane(src: Float64Array, w: number, h: number, quality: number): Float64Array {
  const q = ijgLuma(quality);
  const out = new Float64Array(w * h);
  const b = new Float64Array(64);
  const t = new Float64Array(64);
  for (let by = 0; by < h; by += 8) {
    for (let bx = 0; bx < w; bx += 8) {
      // Edge blocks are padded by repeating the last row/column, as encoders do.
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = src[Math.min(h - 1, by + y) * w + Math.min(w - 1, bx + x)] - 128;
      for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) { let s = 0; for (let y = 0; y < 8; y++) s += C8[v][y] * b[y * 8 + x]; t[v * 8 + x] = s; }
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += C8[u][x] * t[v * 8 + x]; b[v * 8 + u] = Math.round(s / q[v * 8 + u]) * q[v * 8 + u]; }
      for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let v = 0; v < 8; v++) s += C8[v][y] * b[v * 8 + u]; t[y * 8 + u] = s; }
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        if (by + y >= h || bx + x >= w) continue;
        let s = 0;
        for (let u = 0; u < 8; u++) s += C8[u][x] * t[y * 8 + u];
        out[(by + y) * w + bx + x] = Math.min(255, Math.max(0, Math.round(s + 128)));
      }
    }
  }
  return out;
}

/** An RGBA picture through the simulated JPEG save and browser decode. */
function jpeg(rgba: Uint8ClampedArray, w: number, h: number, quality: number): Uint8ClampedArray {
  const Y = new Float64Array(w * h), Cb = new Float64Array(w * h), Cr = new Float64Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = rgba[p * 4], g = rgba[p * 4 + 1], bl = rgba[p * 4 + 2];
    Y[p] = 0.299 * r + 0.587 * g + 0.114 * bl;
    Cb[p] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * bl;
    Cr[p] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * bl;
  }
  const y2 = jpegPlane(Y, w, h, quality), cb2 = jpegPlane(Cb, w, h, quality), cr2 = jpegPlane(Cr, w, h, quality);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    out[p * 4] = Math.round(y2[p] + 1.402 * (cr2[p] - 128));
    out[p * 4 + 1] = Math.round(y2[p] - 0.344136 * (cb2[p] - 128) - 0.714136 * (cr2[p] - 128));
    out[p * 4 + 2] = Math.round(y2[p] + 1.772 * (cb2[p] - 128));
    out[p * 4 + 3] = 255;
  }
  return out;
}

function crop(rgba: Uint8ClampedArray, w: number, h: number, dx: number, dy: number) {
  const nw = w - dx, nh = h - dy;
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(rgba.subarray(((y + dy) * w + dx) * 4, ((y + dy) * w + w) * 4), y * nw * 4);
  return { rgba: out, w: nw, h: nh };
}

/**
 * A synthetic "photo": a lit gradient, overlapping shapes with soft shading, a few text-like
 * strokes and camera grain. Other kinds: 'grey' has no colour; 'paper' is a photographed
 * receipt (off-white paper with fibre and uneven light, dark text); 'scan' is a scanned receipt,
 * paper clipped to pure white; 'screen' is a screenshot (flat panels and crisp text, no grain).
 */
type Kind = 'photo' | 'grey' | 'paper' | 'scan' | 'screen';
function scene(seed: number, w: number, h: number, kind: Kind = 'photo'): Uint8ClampedArray {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = new Uint8ClampedArray(w * h * 4);
  const base = [r() * 200 + 30, r() * 200 + 30, r() * 200 + 30];
  const gx = (r() - 0.5) * 0.6, gy = (r() - 0.5) * 0.6;
  const shapes = Array.from({ length: 6 + Math.floor(r() * 10) }, () => ({
    cx: r() * w, cy: r() * h, rx: 10 + r() * w * 0.3, ry: 10 + r() * h * 0.3, round: r() < 0.5,
    col: [r() * 255, r() * 255, r() * 255], shade: (r() - 0.5) * 1.5,
  }));
  const lines = Array.from({ length: 4 + Math.floor(r() * 8) }, () => ({ y: Math.floor(r() * h), x0: Math.floor(r() * w * 0.5), len: Math.floor(r() * w * 0.5), t: 1 + Math.floor(r() * 2) }));
  const grain = kind === 'screen' ? 0 : 1 + r() * 3;
  // Natural texture (foliage, fabric, paper fibre): smooth random noise at a few scales.
  const texAmp = kind === 'scan' || kind === 'screen' ? 0 : kind === 'paper' ? 3 + r() * 3 : 4 + r() * 22;
  const octaves = [4.37, 9.71, 23.3].map((cell) => {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const g = Float64Array.from({ length: gw * gh }, () => r() - 0.5);
    return (x: number, y: number) => {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  });
  const texture = (x: number, y: number) => texAmp * (octaves[0](x, y) * 0.5 + octaves[1](x, y) + octaves[2](x, y) * 1.5);
  const freq = 0.02 + r() * 0.1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: number[];
      if (kind === 'scan' || kind === 'paper') {
        const paper = kind === 'scan' ? 262 : 200 + 20 * Math.sin(x * 0.004 + y * 0.003) + gx * 30;
        c = [paper, paper, paper - 4];
        for (const l of lines) if (y >= l.y && y < l.y + 6 && x >= l.x0 && x < l.x0 + l.len && Math.sin(x * 1.3) > -0.2) c = [45, 45, 55];
      } else if (kind === 'screen') {
        c = [245, 245, 248];
        for (const s of shapes.slice(0, 5)) if (Math.abs(x - s.cx) < s.rx && Math.abs(y - s.cy) < s.ry / 3) c = s.col.map(Math.round);
        for (const l of lines) if (y >= l.y && y < l.y + 7 && x >= l.x0 && x < l.x0 + l.len && Math.sin(x * 1.1) > 0) c = [30, 30, 30];
      } else {
        c = base.map((v) => v + gx * x + gy * y + 12 * Math.sin(x * freq + y * freq * 0.7));
        for (const s of shapes) {
          const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry;
          const inside = s.round ? dx * dx + dy * dy < 1 : Math.abs(dx) < 1 && Math.abs(dy) < 1;
          if (inside) c = s.col.map((v) => v + s.shade * 20 * dx);
        }
        for (const l of lines) if (y >= l.y && y < l.y + l.t && x >= l.x0 && x < l.x0 + l.len) c = [20, 20, 20];
      }
      const n = gauss() * grain + texture(x, y);
      const i = (y * w + x) * 4;
      if (kind !== 'photo' && kind !== 'screen') {
        const v = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2] + n;
        out[i] = out[i + 1] = out[i + 2] = v;
      } else {
        out[i] = c[0] + n;
        out[i + 1] = c[1] + n;
        out[i + 2] = c[2] + n;
      }
      out[i + 3] = 255;
    }
  }
  return out;
}

const zz = (natural: number[]) => ZIGZAG.map((n) => natural[n]);
const W = 320;
const H = 256;
const KINDS: Kind[] = ['photo', 'paper', 'grey', 'photo', 'scan', 'photo', 'screen', 'paper', 'photo', 'grey', 'screen', 'paper'];
/** Kinds with texture: the traces live in textured blocks, so flat screenshots and white scans have none to show. */
const textured = (k: Kind) => k !== 'scan' && k !== 'screen';

/** Shrink (or grow) by area averaging, as chat apps do before re-saving. */
function resize(rgba: Uint8ClampedArray, w: number, h: number, nw: number, nh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nw * nh * 4);
  const sx = w / nw, sy = h / nh;
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const acc = [0, 0, 0];
      let wsum = 0;
      for (let yy = Math.floor(y * sy); yy < Math.min(h, Math.ceil((y + 1) * sy)); yy++) {
        const wy = Math.min((y + 1) * sy, yy + 1) - Math.max(y * sy, yy);
        for (let xx = Math.floor(x * sx); xx < Math.min(w, Math.ceil((x + 1) * sx)); xx++) {
          const wt = wy * (Math.min((x + 1) * sx, xx + 1) - Math.max(x * sx, xx));
          const i = (yy * w + xx) * 4;
          for (let c = 0; c < 3; c++) acc[c] += wt * rgba[i + c];
          wsum += wt;
        }
      }
      const o = (y * nw + x) * 4;
      for (let c = 0; c < 3; c++) out[o + c] = acc[c] / wsum;
      out[o + 3] = 255;
    }
  }
  return out;
}

const flagged = (rgba: Uint8ClampedArray, w: number, h: number, q: number | null) => {
  const g = jpegGrid(rgba, w, h);
  const dq = jpegDouble(rgba, w, h, q === null ? null : zz(ijgLuma(q)));
  return { g, dq, cropped: g.confident && !g.aligned, double: dq.doubleCompressed };
};

const rate = (pairs: readonly (readonly [number, number])[], hits: Record<string, number>, runs: Record<string, number>) =>
  pairs.map(([a, b]) => `${a}->${b} ${hits[`${a}->${b}`] ?? 0}/${runs[`${a}->${b}`]}`).join(', ');

describe('JPEG helpers', () => {
  it('dezigzag undoes the zigzag order', () => {
    const t = ijgLuma(75);
    expect(dezigzag(zz(t))).toEqual(t);
    expect(t[0]).toBe(8);
  });
  it('finds the step values sit on', () => {
    expect(estimateStep(Array.from({ length: 300 }, (_, i) => (i % 13) * 7 - 42 + (i % 3) * 0.2))).toBe(7);
    expect(estimateStep(Array.from({ length: 300 }, (_, i) => Math.sin(i) * 40))).toBe(1);
  });
  it('stays silent on tiny, empty or flat pictures', () => {
    expect(jpegGrid(new Uint8ClampedArray(16 * 16 * 4), 16, 16)).toMatchObject({ aligned: true, confident: false });
    const flat = new Uint8ClampedArray(128 * 128 * 4).fill(128);
    expect(jpegGrid(flat, 128, 128)).toMatchObject({ aligned: true, confident: false });
    expect(jpegDouble(flat, 128, 128, null).doubleCompressed).toBe(false);
    expect(jpegDouble(new Uint8ClampedArray(10), 128, 128, null).doubleCompressed).toBe(false);
  });
});

describe('saved once: never flagged', () => {
  it('16 scenes × 7 qualities, plus odd sizes, resized re-saves and an unknown table', { timeout: 120_000 }, () => {
    let runs = 0, gridFP = 0, dqFP = 0, maxShift = 0, maxDc = 0, maxComb = 0;
    const note = (r: ReturnType<typeof flagged>) => {
      runs++;
      if (r.cropped) gridFP++;
      if (r.double) dqFP++;
      maxShift = Math.max(maxShift, r.g.shiftScore);
      maxDc = Math.max(maxDc, r.dq.dcScore);
      maxComb = Math.max(maxComb, r.dq.score);
    };
    for (let s = 0; s < 16; s++) {
      const kind = KINDS[s % KINDS.length];
      const src = scene(100 + s, W, H, kind);
      for (const q of [60, 70, 75, 80, 85, 90, 95]) note(flagged(jpeg(src, W, H, q), W, H, q));
      // Table unknown: steps estimated from the pixels.
      note(flagged(jpeg(src, W, H, 80), W, H, null));
      // A size that is not a multiple of 8.
      const odd = scene(400 + s, 317, 251, kind);
      note(flagged(jpeg(odd, 317, 251, 75 + (s % 4) * 5), 317, 251, 75 + (s % 4) * 5));
      // Saved, shrunk to 3/4 (as chat apps do), saved again: the old traces are gone, nothing to say.
      const small = resize(jpeg(src, W, H, 70), W, H, 240, 192);
      note(flagged(jpeg(small, 240, 192, 85), 240, 192, 85));
    }
    console.log(
      `saved once: ${runs} pictures, cropped flagged ${gridFP}, double flagged ${dqFP}; largest shifted-grid score ` +
        `${maxShift.toFixed(3)} (flags at 0.17), DC ${maxDc.toFixed(3)} (flags at 0.5), comb ${maxComb.toFixed(3)} (flags at 0.6 with more)`,
    );
    expect(gridFP).toBe(0);
    expect(dqFP).toBe(0);
  });
});

describe('cropped by 1–7 px, then saved again', () => {
  it('finds the shifted grid when the second save is at a higher quality', { timeout: 120_000 }, () => {
    const pairs = [[75, 90], [60, 95], [80, 92], [85, 85], [90, 75]] as const;
    const hits: Record<string, number> = {}, runs: Record<string, number> = {};
    let wrongOffset = 0;
    for (let s = 0; s < 16; s++) {
      const kind = KINDS[s % KINDS.length];
      if (!textured(kind)) continue;
      const src = scene(200 + s, W + 8, H + 8, kind);
      for (const [q1, q2] of pairs) {
        const dx = 1 + (s % 7), dy = (s * 3) % 8;
        const c = crop(jpeg(src, W + 8, H + 8, q1), W + 8, H + 8, dx, dy);
        const r = flagged(jpeg(c.rgba, c.w, c.h, q2), c.w, c.h, q2);
        const key = `${q1}->${q2}`;
        runs[key] = (runs[key] ?? 0) + 1;
        if (r.cropped) {
          hits[key] = (hits[key] ?? 0) + 1;
          // The old grid now starts at (-dx, -dy) mod 8.
          if (r.g.shifted!.x !== (8 - dx) % 8 || r.g.shifted!.y !== (8 - dy) % 8) wrongOffset++;
        }
      }
    }
    console.log(`cropped and re-saved, detected: ${rate(pairs, hits, runs)}; wrong offset ${wrongOffset}`);
    expect(wrongOffset).toBe(0);
    // At least 80% when the re-save is finer (simulation; real photos with more texture do better).
    for (const key of ['75->90', '60->95', '80->92']) expect(hits[key] ?? 0).toBeGreaterThanOrEqual(Math.ceil(runs[key] * 0.8));
  });
});

describe('saved twice at different qualities', () => {
  it('is found when the first save was coarser', { timeout: 120_000 }, () => {
    const pairs = [[60, 90], [75, 90], [50, 80], [70, 85], [90, 75], [85, 70]] as const;
    const hits: Record<string, number> = {}, runs: Record<string, number> = {};
    const hints: string[] = [];
    for (let s = 0; s < 16; s++) {
      const kind = KINDS[s % KINDS.length];
      if (!textured(kind)) continue;
      const src = scene(300 + s, W, H, kind);
      for (const [q1, q2] of pairs) {
        const r = flagged(jpeg(jpeg(src, W, H, q1), W, H, q2), W, H, q2);
        const key = `${q1}->${q2}`;
        runs[key] = (runs[key] ?? 0) + 1;
        if (r.double) {
          hits[key] = (hits[key] ?? 0) + 1;
          if (r.dq.firstQualityHint !== undefined) hints.push(`${q1}:${r.dq.firstQualityHint}`);
        }
      }
    }
    console.log(`saved twice, detected: ${rate(pairs, hits, runs)}`);
    console.log(`first-quality hints (true:guess): ${[...new Set(hints)].join(' ')}`);
    for (const key of ['60->90', '75->90', '50->80', '70->85']) expect(hits[key] ?? 0).toBeGreaterThanOrEqual(Math.ceil(runs[key] * 0.8));
  });
});

describe('hints', () => {
  it('words the findings and stays silent without them', () => {
    expect(jpegGridHints(null, null)).toEqual([]);
    expect(
      jpegGridHints(
        { offset: { x: 0, y: 0 }, strength: 0.9, aligned: true, confident: true, shifted: null, shiftScore: 0.02 },
        { doubleCompressed: false, score: 0.1, dcScore: 0.1 },
      ),
    ).toEqual([]);
    const hints = jpegGridHints(
      { offset: { x: 3, y: 0 }, strength: 0.5, aligned: false, confident: true, shifted: { x: 3, y: 0 }, shiftScore: 0.5 },
      { doubleCompressed: true, score: 0.9, dcScore: 0.9, firstQualityHint: 60 },
    );
    expect(hints.map((h) => h.id)).toEqual(['cropped_resaved', 'double_jpeg']);
    expect(hints[0].strength).toBe(2);
    expect(hints[0].text).toMatch(/cropped or pasted together/);
  });
});

describe('speed', () => {
  it('a 1 megapixel picture', { timeout: 60_000 }, () => {
    const w = 1200, h = 840;
    const d = jpeg(scene(7, w, h, 'photo'), w, h, 80);
    const t0 = performance.now();
    jpegGrid(d, w, h);
    const t1 = performance.now();
    jpegDouble(d, w, h, zz(ijgLuma(80)));
    const t2 = performance.now();
    console.log(`1 MP: grid ${(t1 - t0).toFixed(0)} ms, double ${(t2 - t1).toFixed(0)} ms`);
    expect(t2 - t0).toBeLessThan(5000);
  });
});
