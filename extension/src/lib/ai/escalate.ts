import type { MediaReading } from './prompts';
import type { Source } from '../types';

/*
 * Hybrid by design, not only as a fallback: Gemini Nano takes the first look on the laptop (fast,
 * private, free). FISHY asks the cloud model for a second opinion only when that first look isn't
 * good enough to act on. A clear first look never leaves the laptop.
 */

export interface FirstLook extends MediaReading {
  source: Source;
}

/**
 * How far Nano's first looks have agreed with the cloud's second opinions on this laptop
 * (see stats.ts): `rate` 0–1, over `n` second opinions.
 */
export interface Trust {
  rate: number;
  n: number;
}

/** Enough second opinions to tune on, and the agreement that counts as trusted or doubtful. */
export const TUNE_AFTER = 8;
export const TRUSTED = 0.9;
export const DOUBTFUL = 0.6;

/**
 * Why the first look needs a second opinion, in plain words, or null when it doesn't.
 * Self-tuning: once Nano has agreed with the cloud almost every time (≥ 90% over 8 or more second
 * opinions), its borderline answers are trusted and stay on the laptop. Once it has disagreed often
 * (< 60%), even its "medium" answers are checked. "Couldn't tell" and "the pixel checks found
 * something" always go to the cloud.
 */
export function secondOpinionReason(first: FirstLook, localHint: boolean, trust?: Trust): string | null {
  if (first.source !== 'on_device') return null; // already the cloud model
  if (first.assessment === 'unclear') return 'Gemini Nano couldn’t tell on this laptop';
  if (first.assessment === 'no_clear_signs' && localHint) return 'the pixel checks found something Gemini Nano didn’t';
  const tuned = !!trust && trust.n >= TUNE_AFTER;
  const trusted = tuned && trust!.rate >= TRUSTED;
  const doubtful = tuned && trust!.rate < DOUBTFUL;
  if (first.confidence === 'low' && !trusted) return 'Gemini Nano wasn’t sure';
  if ((first.assessment === 'likely_ai' || first.assessment === 'likely_edited') && first.signs.length <= 1 && first.confidence !== 'high' && !trusted) {
    return 'Gemini Nano found only one sign';
  }
  if (doubtful && first.confidence !== 'high') return `Gemini Nano has often disagreed with the cloud here (${Math.round(trust!.rate * 100)}%)`;
  return null;
}
