import { describe, expect, it } from 'vitest';
import { copyMoveFromPixels, copyMoveHint } from './copymove';

// A deterministic "random" number in [0, 1), so the tests never flake.
const noise = (x: number, y: number, seed = 1) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

/** A 5×7 bitmap for "letter" c, drawn at 2× (10×14 pixels). The same letter is always the same pixels. */
const glyph = (c: number, gx: number, gy: number) => noise(c * 7 + (gx >> 1), (gy >> 1) * 3 + 1, 99) > 0.55;

interface SceneOptions {
  seed: number;
  w: number;
  h: number;
  /** Grain amplitude (0 = a clean screenshot). */
  grain: number;
  /** Add a band of repeating tiles (a pattern that must not be taken for a copy). */
  tiles?: boolean;
}

/** A synthetic receipt-like scene: gradient paper, grain, a few shapes and lines of text. */
function scene({ seed, w, h, grain, tiles }: SceneOptions) {
  const g = new Float32Array(w * h);
  const gx = (noise(seed, 1) - 0.5) * 0.12;
  const gy = (noise(seed, 2) - 0.5) * 0.12;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) g[y * w + x] = 215 + gx * (x - w / 2) + gy * (y - h / 2) + (noise(x, y, seed) - 0.5) * 2 * grain;
  }
  // Shapes: flat rectangles and discs (straight edges and curves).
  for (let s = 0; s < 4; s++) {
    const cx = noise(seed, 10 + s) * w, cy = noise(seed, 20 + s) * h;
    const r = 15 + noise(seed, 30 + s) * 40;
    const tone = 60 + noise(seed, 40 + s) * 120;
    const disc = s % 2 === 0;
    for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, cy + r); y++) {
      for (let x = Math.max(0, Math.floor(cx - r * 1.5)); x < Math.min(w, cx + r * 1.5); x++) {
        if (disc && (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        g[y * w + x] = tone + (noise(x, y, seed + 5) - 0.5) * 2 * grain;
      }
    }
  }
  // Lines of text: letters from a small alphabet so they repeat a lot, plus one word that repeats.
  const left = 20, top = Math.floor(h * 0.15), lines = Math.floor((h * 0.7) / 20);
  for (let line = 0; line < lines; line++) {
    let col = 0;
    const cols = Math.floor((w - 2 * left) / 12);
    while (col < cols) {
      const repeated = noise(seed, line * 31 + col) < 0.15;
      const len = repeated ? 4 : 2 + Math.floor(noise(seed + 1, line * 17 + col) * 6);
      for (let i = 0; i < len && col < cols; i++, col++) {
        const c = repeated ? [3, 7, 1, 12][i] : Math.floor(noise(seed + 2, line * 101 + col) * 20);
        for (let py = 0; py < 14; py++) {
          for (let px = 0; px < 10; px++) {
            if (!glyph(c, px, py)) continue;
            const x = left + col * 12 + px, y = top + line * 20 + py;
            if (x < w && y < h) g[y * w + x] = 40 + (noise(x, y, seed + 9) - 0.5) * 2 * grain;
          }
        }
      }
      col++; // space
    }
  }
  if (tiles) {
    const y0 = Math.floor(h * 0.85);
    for (let y = y0; y < Math.min(h, y0 + 40); y++) {
      for (let x = 0; x < w; x++) {
        const tx = x % 24, ty = (y - y0) % 20;
        if (Math.abs(tx - 12) + Math.abs(ty - 10) < 8) g[y * w + x] = 90 + (noise(x, y, seed + 3) - 0.5) * 2 * grain;
      }
    }
  }
  return g;
}

function rgba(g: Float32Array) {
  const d = new Uint8ClampedArray(g.length * 4);
  for (let p = 0; p < g.length; p++) {
    d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = Math.round(g[p]);
    d[p * 4 + 3] = 255;
  }
  return d;
}

/** Copies a pw×ph patch from (sx, sy) to (tx, ty), optionally adding ±`jitter` levels of noise. */
function cloned(g: Float32Array, w: number, sx: number, sy: number, tx: number, ty: number, pw: number, ph: number, jitter = 0, seed = 1) {
  const out = Float32Array.from(g);
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const j = jitter ? Math.round((noise(x, y, seed + 50) - 0.5) * 2 * jitter) : 0;
      out[(ty + y) * w + tx + x] = Math.round(g[(sy + y) * w + sx + x]) + j;
    }
  }
  return out;
}

const SCENES: SceneOptions[] = [
  { seed: 1, w: 480, h: 360, grain: 3 },
  { seed: 2, w: 480, h: 360, grain: 6 },
  { seed: 3, w: 400, h: 400, grain: 2 },
  { seed: 4, w: 520, h: 320, grain: 4, tiles: true },
  { seed: 5, w: 480, h: 360, grain: 0 }, // a clean screenshot: no grain at all
  { seed: 6, w: 360, h: 480, grain: 5 },
  { seed: 7, w: 480, h: 360, grain: 1, tiles: true },
  { seed: 8, w: 440, h: 340, grain: 8 },
];

/** Forgeries per scene: patch size, source and target as fractions of the picture. */
const MOVES = [
  { pw: 48, ph: 32, s: [0.1, 0.2], t: [0.6, 0.55] },
  { pw: 64, ph: 40, s: [0.45, 0.3], t: [0.1, 0.7] },
  { pw: 80, ph: 48, s: [0.2, 0.5], t: [0.7, 0.15] },
];

describe('copy-move', () => {
  it('finds an exact copied patch, with a plausible shift and place', () => {
    const o = SCENES[0];
    const g = scene(o);
    // Copy a 64×40 piece of text from the upper left to the lower right.
    const f = cloned(g, o.w, 40, 80, 330, 270, 64, 40);
    const r = copyMoveFromPixels(rgba(f), o.w, o.h);
    expect(r.found).toBe(true);
    expect(Math.abs(Math.abs(r.shift!.dx) - 290)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.abs(r.shift!.dy) - 190)).toBeLessThanOrEqual(1);
    expect(r.place).toBe('bottom right');
    expect(copyMoveHint(r)?.text).toContain('bottom right');
  });

  it('finds a copy with ±2 levels of noise added', () => {
    const o = SCENES[1];
    const g = scene(o);
    const f = cloned(g, o.w, 60, 100, 300, 40, 56, 40, 2);
    const r = copyMoveFromPixels(rgba(f), o.w, o.h);
    expect(r.found).toBe(true);
    expect(Math.abs(Math.abs(r.shift!.dx) - 240)).toBeLessThanOrEqual(1);
  });

  it('does not flag clean scenes (text with repeated letters and words, shapes, gradients, tiles)', () => {
    for (const o of SCENES) {
      const r = copyMoveFromPixels(rgba(scene(o)), o.w, o.h);
      expect(r.found, `scene ${o.seed} (${r.pairs} pairs)`).toBe(false);
      expect(copyMoveHint(r)).toBeNull();
    }
  });

  it('detects most forgeries over the synthetic set (exact and noised), with no false alarms', { timeout: 60_000 }, () => {
    let clean = 0, falseAlarms = 0, forged = 0, caught = 0, caughtExact = 0, caughtNoisy = 0;
    for (const o of SCENES) {
      const g = scene(o);
      clean++;
      if (copyMoveFromPixels(rgba(g), o.w, o.h).found) falseAlarms++;
      for (const m of MOVES) {
        const sx = Math.floor(m.s[0] * o.w), sy = Math.floor(m.s[1] * o.h);
        const tx = Math.min(o.w - m.pw, Math.floor(m.t[0] * o.w)), ty = Math.min(o.h - m.ph, Math.floor(m.t[1] * o.h));
        for (const jitter of [0, 2]) {
          forged++;
          const r = copyMoveFromPixels(rgba(cloned(g, o.w, sx, sy, tx, ty, m.pw, m.ph, jitter, o.seed)), o.w, o.h);
          const right = r.found && Math.abs(Math.abs(r.shift!.dx) - Math.abs(tx - sx)) <= 1 && Math.abs(Math.abs(r.shift!.dy) - Math.abs(ty - sy)) <= 1;
          if (right) {
            caught++;
            if (jitter) caughtNoisy++;
            else caughtExact++;
          }
        }
      }
    }
    console.log(`copy-move: caught ${caught}/${forged} (exact ${caughtExact}/${forged / 2}, noised ${caughtNoisy}/${forged / 2}); false alarms ${falseAlarms}/${clean}`);
    expect(falseAlarms).toBe(0);
    expect(caught / forged).toBeGreaterThanOrEqual(0.75);
  });

  it('copes with tiny, flat and broken pictures', () => {
    for (const [w, h] of [[1, 1], [8, 8], [31, 31], [20, 200], [40, 40]]) {
      const d = rgba(Float32Array.from({ length: w * h }, (_, p) => noise(p % w, Math.floor(p / w)) * 255));
      expect(copyMoveFromPixels(d, w, h).found).toBe(false);
    }
    const flat = rgba(new Float32Array(300 * 300).fill(200));
    expect(copyMoveFromPixels(flat, 300, 300)).toEqual({ found: false, pairs: 0 });
    expect(copyMoveFromPixels(new Uint8ClampedArray(10), 100, 100).found).toBe(false);
    expect(copyMoveFromPixels(new Uint8ClampedArray(0), 0, 0).found).toBe(false);
  });

  it('checks a 1 MP picture in reasonable time', () => {
    const o = { seed: 11, w: 1000, h: 1000, grain: 3 };
    const f = cloned(scene(o), o.w, 100, 300, 600, 700, 80, 48);
    const d = rgba(f);
    const t0 = performance.now();
    const r = copyMoveFromPixels(d, o.w, o.h);
    const ms = performance.now() - t0;
    console.log(`copy-move: 1 MP in ${ms.toFixed(0)} ms`);
    expect(r.found).toBe(true);
    expect(ms).toBeLessThan(4000);
  });

  it('samples a very large picture instead of running out of time', () => {
    const o = { seed: 12, w: 1800, h: 1000, grain: 3 };
    const r = copyMoveFromPixels(rgba(scene(o)), o.w, o.h);
    expect(r.found).toBe(false);
  });
});
