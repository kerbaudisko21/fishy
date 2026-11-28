import { describe, expect, it } from 'vitest';
import { ijgLuma } from './jpeggrid';
import { bands, hamming, phash64, SAME_PICTURE_DISTANCE } from './phash';

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

/**
 * A random scene as a function of position in 0–1 (so it can be drawn at any size): a gradient,
 * shapes, a few lines of "text". Drawn at a size by sampling the centre of each pixel.
 */
function sceneFn(seed: number) {
  const r = rng(seed);
  const base = [r() * 200 + 30, r() * 200 + 30, r() * 200 + 30];
  const g = [(r() - 0.5) * 120, (r() - 0.5) * 120];
  const shapes = Array.from({ length: 4 + Math.floor(r() * 8) }, () => ({
    cx: r(), cy: r(), rx: 0.05 + r() * 0.3, ry: 0.05 + r() * 0.3, round: r() < 0.5, col: [r() * 255, r() * 255, r() * 255],
  }));
  const lines = Array.from({ length: 3 + Math.floor(r() * 6) }, () => ({ y: r(), x0: r() * 0.5, len: r() * 0.5 }));
  return (x: number, y: number) => {
    let c = base.map((v) => v + g[0] * x + g[1] * y);
    for (const s of shapes) {
      const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry;
      if (s.round ? dx * dx + dy * dy < 1 : Math.abs(dx) < 1 && Math.abs(dy) < 1) c = s.col;
    }
    for (const l of lines) if (y >= l.y && y < l.y + 0.02 && x >= l.x0 && x < l.x0 + l.len) c = [20, 20, 20];
    return c;
  };
}

function draw(f: (x: number, y: number) => number[], w: number, h: number, noise = 0, seed = 1): Uint8ClampedArray {
  const r = rng(seed);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = f((x + 0.5) / w, (y + 0.5) / h);
      const n = noise ? (r() - 0.5) * 2 * noise : 0;
      const i = (y * w + x) * 4;
      out[i] = c[0] + n;
      out[i + 1] = c[1] + n;
      out[i + 2] = c[2] + n;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Nearest-neighbour resize of an existing picture (a cruder resize than the hash's own). */
function resizeNearest(rgba: Uint8ClampedArray, w: number, h: number, nw: number, nh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const i = (Math.floor(((y + 0.5) * h) / nh) * w + Math.floor(((x + 0.5) * w) / nw)) * 4;
      out.set(rgba.subarray(i, i + 4), (y * nw + x) * 4);
    }
  }
  return out;
}

/** Grey JPEG round trip at a quality: 8×8 DCT, quantize with the IJG table, back, round. */
const C8 = Array.from({ length: 8 }, (_, u) => Array.from({ length: 8 }, (_, x) => ((u === 0 ? Math.SQRT1_2 : 1) / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
function jpegGrey(rgba: Uint8ClampedArray, w: number, h: number, quality: number): Uint8ClampedArray {
  const q = ijgLuma(quality);
  const out = new Uint8ClampedArray(rgba.length);
  const b = new Float64Array(64), t = new Float64Array(64);
  const at = (x: number, y: number) => {
    const i = (Math.min(h - 1, y) * w + Math.min(w - 1, x)) * 4;
    return 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  };
  for (let by = 0; by < h; by += 8) {
    for (let bx = 0; bx < w; bx += 8) {
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) b[y * 8 + x] = at(bx + x, by + y) - 128;
      for (let v = 0; v < 8; v++) for (let x = 0; x < 8; x++) { let s = 0; for (let y = 0; y < 8; y++) s += C8[v][y] * b[y * 8 + x]; t[v * 8 + x] = s; }
      for (let v = 0; v < 8; v++) for (let u = 0; u < 8; u++) { let s = 0; for (let x = 0; x < 8; x++) s += C8[u][x] * t[v * 8 + x]; b[v * 8 + u] = Math.round(s / q[v * 8 + u]) * q[v * 8 + u]; }
      for (let y = 0; y < 8; y++) for (let u = 0; u < 8; u++) { let s = 0; for (let v = 0; v < 8; v++) s += C8[v][y] * b[v * 8 + u]; t[y * 8 + u] = s; }
      for (let y = 0; y < 8 && by + y < h; y++) for (let x = 0; x < 8 && bx + x < w; x++) {
        let s = 0;
        for (let u = 0; u < 8; u++) s += C8[u][x] * t[y * 8 + u];
        const i = ((by + y) * w + bx + x) * 4;
        out[i] = out[i + 1] = out[i + 2] = Math.round(s + 128);
        out[i + 3] = 255;
      }
    }
  }
  return out;
}

const brighten = (rgba: Uint8ClampedArray, by: number) => rgba.map((v, i) => (i % 4 === 3 ? v : v + by));

describe('perceptual hash', () => {
  const f = sceneFn(11);
  const W = 400, H = 300;
  const orig = draw(f, W, H);
  const h0 = phash64(orig, W, H);

  it('is 16 hex characters, deterministic, and 0 from itself', () => {
    expect(h0).toMatch(/^[0-9a-f]{16}$/);
    expect(phash64(orig, W, H)).toBe(h0);
    expect(hamming(h0, h0)).toBe(0);
    // Top bit is always 0 (63 coefficient bits).
    expect(parseInt(h0[0], 16)).toBeLessThan(8);
  });

  it('survives the changes a picture goes through when it is passed around', () => {
    const variants: Record<string, string> = {
      'drawn at 1600×1200': phash64(draw(f, 1600, 1200), 1600, 1200),
      'drawn at 120×90': phash64(draw(f, 120, 90), 120, 90),
      'resized to 61% (nearest)': phash64(resizeNearest(orig, W, H, 244, 183), 244, 183),
      'stretched to 400×400': phash64(resizeNearest(orig, W, H, 400, 400), 400, 400),
      'brighter by 30': phash64(brighten(orig, 30), W, H),
      'darker by 30': phash64(brighten(orig, -30), W, H),
      'noise ±12': phash64(draw(f, W, H, 12, 5), W, H),
      'JPEG quality 50': phash64(jpegGrey(orig, W, H, 50), W, H),
      'JPEG quality 30, twice': phash64(jpegGrey(jpegGrey(orig, W, H, 30), W, H, 75), W, H),
    };
    const d = Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, hamming(h0, v)]));
    console.log('same picture, changed:', JSON.stringify(d));
    for (const v of Object.values(d)) expect(v).toBeLessThanOrEqual(SAME_PICTURE_DISTANCE);
  });

  it('keeps different pictures far apart', () => {
    const hashes = Array.from({ length: 40 }, (_, i) => phash64(draw(sceneFn(1000 + i), 256, 192), 256, 192));
    let min = 64, sum = 0, n = 0;
    for (let i = 0; i < hashes.length; i++) {
      for (let j = i + 1; j < hashes.length; j++) {
        const d = hamming(hashes[i], hashes[j]);
        min = Math.min(min, d);
        sum += d;
        n++;
      }
    }
    console.log(`different pictures: ${n} pairs, smallest distance ${min}, mean ${(sum / n).toFixed(1)}`);
    expect(min).toBeGreaterThan(SAME_PICTURE_DISTANCE + 4);
  });

  it('measures a 1 megapixel picture quickly', () => {
    const big = draw(f, 1200, 840);
    const t0 = performance.now();
    phash64(big, 1200, 840);
    const ms = performance.now() - t0;
    console.log(`phash64 at 1 MP: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(1000);
  });

  it('handles flat, tiny and broken input without throwing', () => {
    const flat = new Uint8ClampedArray(64 * 64 * 4).fill(200);
    expect(phash64(flat, 64, 64)).toBe('0000000000000000');
    expect(phash64(new Uint8ClampedArray(4).fill(9), 1, 1)).toMatch(/^[0-9a-f]{16}$/);
    expect(phash64(new Uint8ClampedArray(3), 10, 10)).toBe('0000000000000000');
  });
});

describe('hamming and bands', () => {
  it('counts differing bits', () => {
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('0000000000000001', '0000000000000003')).toBe(1);
    expect(hamming('00ff', '00f0')).toBe(4);
  });
  it('splits into four 16-bit pieces and joins back', () => {
    const h = '0123456789abcdef';
    expect(bands(h)).toEqual(['0123', '4567', '89ab', 'cdef']);
    expect(bands(h).join('')).toBe(h);
    expect(bands('ABC').join('')).toBe('0000000000000abc');
  });
  it('two hashes within distance 3 always share a piece', () => {
    const r = rng(3);
    for (let t = 0; t < 500; t++) {
      const a = Array.from({ length: 16 }, () => Math.floor(r() * 16).toString(16)).join('');
      let bits = BigInt('0x' + a);
      for (let k = 0; k < 3; k++) bits ^= 1n << BigInt(Math.floor(r() * 64));
      const b = bits.toString(16).padStart(16, '0');
      expect(hamming(a, b)).toBeLessThanOrEqual(3);
      expect(bands(a).some((p, i) => bands(b)[i] === p)).toBe(true);
    }
  });
});
