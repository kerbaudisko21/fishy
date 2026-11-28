import { describe, expect, it } from 'vitest';
import { pinOf } from '../media-score';
import { boxOnSheet, parseBox } from './boxes';
import { parseMedia } from './prompts';

describe('where Gemini points', () => {
  it('reads a 0–1000 box as fractions, and refuses broken ones', () => {
    expect(parseBox([100, 200, 300, 600])).toEqual({ x0: 0.2, y0: 0.1, x1: 0.6, y1: 0.3 });
    expect(parseBox([0, 0, 2000, 2000])).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
    for (const bad of [null, 'box', [1, 2, 3], [100, 100, 100, 100], [500, 500, 100, 100], [NaN, 1, 2, 3], ['1', '2', '3', '4']]) expect(parseBox(bad)).toBeNull();
  });
  it('keeps boxes on signs in an answer, and drops broken ones', () => {
    const r = parseMedia(JSON.stringify({ assessment: 'likely_ai', signs: [{ sign: 'Warped hand', where: 'left', box: [500, 0, 800, 250] }, { sign: 'Odd light', where: '', box: 'here' }] }));
    expect(r.signs[0].box).toEqual({ x0: 0, y0: 0.5, x1: 0.25, y1: 0.8 });
    expect(r.signs[1].box).toBeUndefined();
  });
  it('puts a box on a sheet of 9 frames (3 × 3) onto its frame', () => {
    // Centre in the middle cell of the bottom row → frame 8 (0-based 7).
    const at = boxOnSheet({ x0: 0.4, y0: 0.7, x1: 0.6, y1: 0.9 }, 9)!;
    expect(at.frame).toBe(7);
    expect(at.box.x0).toBeCloseTo(0.2);
    expect(at.box.y1).toBeCloseTo(0.7);
    // 5 frames: 3 across, 2 rows; the empty last cell has no frame.
    expect(boxOnSheet({ x0: 0.7, y0: 0.6, x1: 0.9, y1: 0.9 }, 5)).toBeNull();
  });
  it('numbers the boxes in order, counting only signs that have one', () => {
    const signs = [{ box: {} }, {}, { box: {} }];
    expect(pinOf(signs, 0)).toBe(1);
    expect(pinOf(signs, 2)).toBe(2);
  });
});
