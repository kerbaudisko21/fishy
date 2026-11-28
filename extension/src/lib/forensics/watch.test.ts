import { describe, expect, it } from 'vitest';
import { lipSync, lipSyncHint } from './lipsync';
import { LOWER, sprtPosition, sprtStep, startSprt, UPPER } from './sprt';

describe('watch mode: the sequential test (SPRT)', () => {
  it('thresholds follow from the error rates (α 1%, β 5%)', () => {
    expect(UPPER).toBeCloseTo(Math.log(0.95 / 0.01), 5);
    expect(LOWER).toBeCloseTo(Math.log(0.05 / 0.99), 5);
  });
  it('one bad round never raises the alarm on its own', () => {
    expect(sprtStep(startSprt(), 1000).decision).toBe('watching');
  });
  it('a few rounds of strong signs do', () => {
    let s = startSprt();
    for (let i = 0; i < 3; i++) s = sprtStep(s, 8);
    expect(s.decision).toBe('fake');
    expect(s.rounds).toBe(3);
  });
  it('clean rounds end in "looks real so far"; mixed rounds keep watching', () => {
    let s = startSprt();
    for (let i = 0; i < 5; i++) s = sprtStep(s, 0.5);
    expect(s.decision).toBe('real');
    let m = startSprt();
    for (let i = 0; i < 6; i++) m = sprtStep(m, i % 2 ? 6 : 0.5);
    expect(m.decision).toBe('watching');
  });
  it('a decision stays put, and broken ratios count as no evidence', () => {
    let s = startSprt();
    for (let i = 0; i < 3; i++) s = sprtStep(s, 8);
    expect(sprtStep(s, 0.01)).toBe(s);
    expect(sprtStep(startSprt(), NaN).llr).toBe(0);
    expect(sprtStep(startSprt(), 0).llr).toBe(0);
  });
  it('the meter runs from the "real" threshold to the "fake" one', () => {
    expect(sprtPosition(startSprt())).toBeCloseTo(-LOWER / (UPPER - LOWER), 5);
    expect(sprtPosition({ llr: 99, rounds: 1, decision: 'fake' })).toBe(1);
  });
});

describe('lip-sync: does anything on screen move with the voice?', () => {
  const W = 64;
  const H = 48;
  const N = 50;
  // A voice: bursts of syllables.
  const voice = Array.from({ length: N }, (_, t) => (Math.sin(t * 0.9) > 0.1 ? 0.3 + 0.2 * Math.sin(t * 2.1) : 0.01));
  /** Frames where one "mouth" cell's brightness follows `drive`, the rest still or randomly moving. */
  function frames(drive: (t: number) => number, noise = false) {
    return Array.from({ length: N }, (_, t) => {
      const f = new Uint8Array(W * H).fill(100);
      const open = drive(t);
      // The mouth cell: rows 32–39, columns 24–31.
      for (let y = 32; y < 40; y++) for (let x = 24; x < 32; x++) f[y * W + x] = 100 + Math.round(open * 300) * ((x + y + t) % 2 ? 1 : -1) * 0.3;
      if (noise) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) f[y * W + x] = (t * 37 + x * 11 + y * 7) % 200;
      return f;
    });
  }
  it('a mouth that opens with the voice is in step', () => {
    const r = lipSync(frames((t) => voice[t]), voice, W, H);
    expect(r.verdict).toBe('in_step');
    expect(lipSyncHint(r, 100)).toBeNull();
  });
  it('a mouth that trails the voice by 0.4 s is flagged as lagging', () => {
    const r = lipSync(frames((t) => voice[Math.max(0, t - 4)]), voice, W, H);
    expect(r.verdict).toBe('lagging');
    // Motion is measured between two frames, so the lag is known to within one frame (100 ms).
    expect(lipSyncHint(r, 100)?.text).toMatch(/(400|500) ms after/);
  });
  it('movement unrelated to the voice is flagged as out of step', () => {
    const unrelated = (t: number) => (Math.cos(t * 0.37 + 1) > 0.6 ? 0.4 : 0);
    const r = lipSync(frames(unrelated, true), voice, W, H);
    expect(['out_of_step', 'unclear']).toContain(r.verdict);
    expect(r.r).toBeLessThan(0.35);
  });
  it('says nothing when no one speaks, nothing moves, or there is too little', () => {
    expect(lipSync(frames((t) => voice[t]), voice.map(() => 0), W, H).verdict).toBe('unclear');
    expect(lipSync(frames(() => 0), voice, W, H).verdict).toBe('unclear');
    expect(lipSync([], [], W, H).verdict).toBe('unclear');
  });
});
