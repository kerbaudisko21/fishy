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

/** Why the first look needs a second opinion, in plain words, or null when it doesn't. */
export function secondOpinionReason(first: FirstLook, localHint: boolean): string | null {
  if (first.source !== 'on_device') return null; // already the cloud model
  if (first.assessment === 'unclear') return 'Gemini Nano couldn’t tell on this laptop';
  if (first.confidence === 'low') return 'Gemini Nano wasn’t sure';
  if (first.assessment === 'no_clear_signs' && localHint) return 'the pixel checks found something Gemini Nano didn’t';
  if ((first.assessment === 'likely_ai' || first.assessment === 'likely_edited') && first.signs.length <= 1 && first.confidence !== 'high') {
    return 'Gemini Nano found only one sign';
  }
  return null;
}
