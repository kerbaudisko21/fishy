import type { ForensicHint } from '../types';

/*
 * Does the mouth move with the voice? On a real call, the speaker's mouth opens and closes as the
 * voice gets louder and quieter; in a lip-synced deepfake, or a face pasted over someone else's
 * call, they drift apart (Agarwal et al. 2020; the research report's step 5).
 *
 * Without a face model: the frame is cut into a grid of cells, and for each cell FISHY measures how
 * much it changes from frame to frame (motion energy). It correlates each cell's motion with the
 * voice's loudness, at time shifts of up to ±0.5 s, and keeps the BEST cell. Taking the best cell
 * is deliberately generous: the speaker's mouth, wherever it is, usually wins, so "no cell moves
 * with the voice" is a meaningful sign. A strong match is never taken as proof of a real face
 * (some lip-sync fakes match too well); only a mismatch counts.
 */

export interface LipSyncResult {
  /** Share of moments with a voice speaking, 0–1. */
  speech: number;
  /** The best-matching cell's correlation (−1–1) and time shift in frames (+: the mouth trails the voice). */
  r: number;
  lag: number;
  verdict: 'in_step' | 'lagging' | 'out_of_step' | 'unclear';
}

const COLS = 8;
const ROWS = 6;
const MAX_LAG = 5;

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/**
 * frames: greyscale w×h frames at a steady rate; loudness[i]: the voice's loudness while frame i
 * was shown (same length). `frameMs`: time between frames.
 */
export function lipSync(frames: ArrayLike<number>[], loudness: number[], w: number, h: number): LipSyncResult {
  const n = Math.min(frames.length, loudness.length);
  const peak = Math.max(1e-6, ...loudness.slice(0, n));
  const speaking = loudness.slice(0, n).filter((l) => l > Math.max(0.02, peak * 0.3)).length;
  const speech = n ? speaking / n : 0;
  if (n < 20 || speech < 0.25 || w < COLS || h < ROWS) return { speech, r: 0, lag: 0, verdict: 'unclear' };

  // Motion energy per cell, from one frame to the next.
  const cw = Math.floor(w / COLS);
  const ch = Math.floor(h / ROWS);
  const motion: number[][] = Array.from({ length: COLS * ROWS }, () => []);
  for (let t = 1; t < n; t++) {
    const a = frames[t - 1];
    const b = frames[t];
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        let sum = 0;
        for (let y = cy * ch; y < (cy + 1) * ch; y++) for (let x = cx * cw; x < (cx + 1) * cw; x++) sum += Math.abs(a[y * w + x] - b[y * w + x]);
        motion[cy * COLS + cx].push(sum / (cw * ch));
      }
    }
  }
  const voice = loudness.slice(1, n);

  let best = { r: -1, lag: 0 };
  let moving = false;
  for (const m of motion) {
    if (Math.max(...m) < 1.5) continue; // a still cell (background) says nothing
    moving = true;
    for (let lag = -MAX_LAG; lag <= MAX_LAG; lag++) {
      // lag > 0: the mouth at time t+lag follows the voice at time t.
      const mm = lag >= 0 ? m.slice(lag) : m.slice(0, m.length + lag);
      const vv = lag >= 0 ? voice.slice(0, voice.length - lag) : voice.slice(-lag);
      const r = pearson(mm, vv);
      if (r > best.r) best = { r, lag };
    }
  }
  if (!moving) return { speech, r: 0, lag: 0, verdict: 'unclear' }; // nothing on screen moves: see the frozen check
  const verdict = best.r >= 0.35 ? (Math.abs(best.lag) >= 3 ? 'lagging' : 'in_step') : best.r < 0.15 ? 'out_of_step' : 'unclear';
  return { speech, r: best.r, lag: best.lag, verdict };
}

/** The result as a hint for the card, or null when it is in step or unclear. */
export function lipSyncHint(r: LipSyncResult, frameMs: number): ForensicHint | null {
  if (r.verdict === 'out_of_step') {
    return { id: 'lipsync', strength: 1, text: 'While the voice spoke, nothing on screen moved in step with it: if the speaker is on camera, their mouth isn’t following their voice.' };
  }
  if (r.verdict === 'lagging') {
    return { id: 'lipsync', strength: 1, text: `The mouth moves about ${Math.abs(r.lag) * frameMs} ms ${r.lag > 0 ? 'after' : 'before'} the voice, more than a call’s normal delay.` };
  }
  return null;
}
