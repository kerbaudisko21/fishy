import { keywordTactics } from './keywords';
import type { TacticHit } from './prompts';

/** Shown when Gemini did not read a message. The technical error goes to the console only. */
export const READER_FELL_BACK = 'Gemini didn’t answer, so only FISHY’s keyword list read this. Check it again in a moment.';

/** The headline when no red flag was found but Gemini never read the message: never "Looks normal". */
export const PARTLY_CHECKED = {
  pill: 'Partly checked',
  title: 'Gemini didn’t read this.',
  line: 'Only FISHY’s keyword list ran, and it found nothing. Check it again in a moment, and call before money moves.',
};

/** Runs each in turn and returns the first answer, e.g. Gemini Nano, then the cloud model. */
export async function firstThatWorks<T>(tries: Array<() => Promise<T>>): Promise<T> {
  let last: unknown = new Error('Nothing to try.');
  for (const attempt of tries) {
    try {
      return await attempt();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/**
 * Reads a message with Gemini. If Gemini fails (offline, over quota, refused), the fixed keyword
 * list reads it instead and `fromKeywords` labels the result as such: a check never ends on a raw
 * error, and a keyword result is never shown as Gemini's.
 */
export async function geminiOrKeywords<T>(text: string, gemini: () => Promise<T>, fromKeywords: (hits: TacticHit[]) => T): Promise<T> {
  try {
    return await gemini();
  } catch (e) {
    console.warn('[FISHY] Gemini did not read the message; the keyword list did', e);
    return fromKeywords(keywordTactics(text));
  }
}
