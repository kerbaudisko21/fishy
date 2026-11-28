/*
 * What several frames of a video call show that one frame can't:
 *  - frozen: nothing changed between frames for seconds. A real camera always shows some movement
 *    and grain; a still picture played as a camera (a "virtual camera") shows none. A frozen feed
 *    on a bad connection looks the same, so the advice is to ask the person to move.
 *  - jump: one sudden big change between two frames while the rest are calm, as when a fake
 *    face loses tracking for a moment or a recording is cut.
 * Frames are small greyscale thumbnails of the same size.
 */

export interface MotionResult {
  /** Mean change between each pair of frames, 0–255. */
  diffs: number[];
  frozen: boolean;
  /** Index of the pair (i → i+1) with the sudden jump, if any. */
  jumpAt: number | null;
}

const FROZEN_BELOW = 0.6;

export function meanDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / Math.max(1, a.length);
}

export function motionOf(frames: ArrayLike<number>[]): MotionResult {
  const diffs: number[] = [];
  for (let i = 1; i < frames.length; i++) diffs.push(meanDiff(frames[i - 1], frames[i]));
  const frozen = diffs.length >= 2 && diffs.every((d) => d < FROZEN_BELOW);
  let jumpAt: number | null = null;
  if (diffs.length >= 3) {
    const sorted = [...diffs].sort((x, y) => x - y);
    const typical = sorted[Math.floor((sorted.length - 1) / 2)];
    const max = Math.max(...diffs);
    if (max > 14 && max > 6 * Math.max(1, typical)) jumpAt = diffs.indexOf(max);
  }
  return { diffs, frozen, jumpAt };
}

/** RGBA pixels to greyscale. */
export function grey(rgba: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let p = 0, i = 0; p < out.length; p++, i += 4) out[p] = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
  return out;
}
