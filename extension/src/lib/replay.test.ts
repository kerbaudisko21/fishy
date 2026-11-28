import { describe, expect, it } from 'vitest';
import { buildStops, pinsOf, TIMING, zoomFor } from './replay';
import type { MediaCheck } from './types';

const base: MediaCheck = { id: 'x', kind: 'picture', name: 'a.jpg', at: '', checks: [], gemini: null };
const box = { x0: 0.6, y0: 0.1, x1: 0.8, y1: 0.3 };

describe('the replay', () => {
  it('has nothing to show for a voice, a check still running, or a picture with no areas', () => {
    expect(buildStops({ ...base, kind: 'voice' })).toEqual([]);
    expect(buildStops({ ...base, preview: 'blob:p', gemini: null })).toEqual([]);
    expect(buildStops({ ...base, preview: 'blob:p', gemini: { assessment: 'likely_ai', signs: [{ sign: 'Odd hands', where: 'left' }], source: 'cloud', model: 'gemini-cloud' } })).toEqual([]);
  });

  it('steps through each numbered area of a picture, PDF page or website, in the order of the reasons', () => {
    const item: MediaCheck = {
      ...base,
      kind: 'site',
      preview: 'blob:p',
      gemini: { assessment: 'likely_edited', signs: [{ sign: 'No box', where: '' }, { sign: 'Fake login', where: 'top', box }, { sign: 'Odd logo', where: 'left', box }], source: 'cloud', model: 'gemini-cloud' },
    };
    const stops = buildStops(item);
    expect(stops.map((s) => s.caption)).toEqual([undefined, 'Fake login', 'Odd logo', undefined]);
    expect(stops.filter((s) => s.pin).map((s) => s.pin!.n)).toEqual([1, 2]);
    expect(pinsOf(item).map((p) => p.n)).toEqual([1, 2]);
  });

  it('plays a call’s frames in order and stops on the frames Gemini pointed at and the frozen ones', () => {
    const item: MediaCheck = {
      ...base,
      kind: 'frame',
      frames: ['f0', 'f1', 'f2', 'f3'],
      forensics: { hints: [{ id: 'frozen', strength: 2, text: 'Nothing moved' }], rows: [], motion: [5, 0.2, 4] },
      gemini: { assessment: 'likely_ai', signs: [{ sign: 'The hand melts into the cheek', where: 'frame 3', box, frame: 3 }], source: 'cloud', model: 'gemini-cloud' },
    };
    const stops = buildStops(item);
    expect(stops.filter((s) => !s.caption).map((s) => s.frame)).toEqual([0, 1, 2, 3]);
    expect(stops.find((s) => s.caption?.startsWith('Nothing moved'))?.frame).toBe(2);
    const pinned = stops.find((s) => s.pin)!;
    expect(pinned).toMatchObject({ frame: 3, caption: 'The hand melts into the cheek', ms: TIMING.pin });
  });

  it('does not replay a call where nothing was found', () => {
    expect(buildStops({ ...base, kind: 'frame', frames: ['a', 'b'], gemini: { assessment: 'no_clear_signs', signs: [], source: 'cloud', model: 'gemini-cloud' } })).toEqual([]);
  });

  it('zooms an area towards the middle without showing past the picture’s edges', () => {
    expect(zoomFor()).toEqual({ s: 1, tx: 0, ty: 0 });
    for (const b of [box, { x0: 0, y0: 0, x1: 0.05, y1: 0.05 }, { x0: 0.95, y0: 0.9, x1: 1, y1: 1 }, { x0: 0, y0: 0, x1: 1, y1: 1 }]) {
      const { s, tx, ty } = zoomFor(b);
      expect(s).toBeGreaterThanOrEqual(1.4);
      expect(s).toBeLessThanOrEqual(3);
      // The shown window [−tx/s, (1−tx)/s] stays inside the picture and contains the area's centre.
      for (const [t, lo, hi] of [[tx, b.x0, b.x1], [ty, b.y0, b.y1]]) {
        expect(-t / s).toBeGreaterThanOrEqual(-1e-9);
        expect((1 - t) / s).toBeLessThanOrEqual(1 + 1e-9);
        const c = (lo + hi) / 2;
        expect(c).toBeGreaterThanOrEqual(-t / s - 1e-9);
        expect(c).toBeLessThanOrEqual((1 - t) / s + 1e-9);
      }
    }
  });
});
