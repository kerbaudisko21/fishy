import { describe, expect, it, vi } from 'vitest';
import { firstThatWorks, geminiOrKeywords, PARTLY_CHECKED, READER_FELL_BACK } from './fallback';

// When Gemini fails on a message, the check must still end with an honest result: the fixed
// keyword list reads it, and the result says so. It never ends on a raw error.

const PUSHY = 'Pay today, right now. Keep this between us and skip the usual approval.';

describe('reading a message when Gemini fails', () => {
  it('returns what Gemini found when Gemini answers', async () => {
    const fromKeywords = vi.fn();

    const result = await geminiOrKeywords(PUSHY, async () => ({ hits: [], model: 'gemini-nano' }), fromKeywords);

    expect(result).toEqual({ hits: [], model: 'gemini-nano' });
    expect(fromKeywords).not.toHaveBeenCalled();
  });

  it('lets the keyword list read the message when Gemini throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await geminiOrKeywords(
      PUSHY,
      async () => {
        throw new Error('AI: 503 The model is overloaded');
      },
      (hits) => ({ hits, model: 'keywords', geminiFailed: true }),
    );

    expect(result.model).toBe('keywords');
    expect(result).toHaveProperty('geminiFailed', true);
    expect(result.hits.map((h) => h.tactic)).toEqual(expect.arrayContaining(['urgency', 'secrecy', 'skips_process']));
    warn.mockRestore();
  });

  it('still answers, with no hits, for a calm message', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await geminiOrKeywords(
      'Lunch at noon?',
      async () => {
        throw new Error('offline');
      },
      (hits) => ({ hits, model: 'keywords' }),
    );

    expect(result.hits).toEqual([]);
    warn.mockRestore();
  });

  it('never calls a message "normal" that Gemini did not read', () => {
    const shown = `${PARTLY_CHECKED.pill} ${PARTLY_CHECKED.title} ${PARTLY_CHECKED.line}`;

    expect(shown).not.toMatch(/looks normal|no red flags/i);
    expect(PARTLY_CHECKED.line).toContain('call before money moves');
  });

  it('tells the person in plain words, without the technical error', () => {
    expect(READER_FELL_BACK).toContain('keyword list');
    expect(READER_FELL_BACK).not.toMatch(/error|failed|exception|503/i);
  });
});

describe('trying Gemini Nano first, then the cloud', () => {
  it('stops at the first one that answers', async () => {
    const cloud = vi.fn(async () => 'cloud');

    expect(await firstThatWorks([async () => 'nano', cloud])).toBe('nano');
    expect(cloud).not.toHaveBeenCalled();
  });

  it('moves on when one fails', async () => {
    const result = await firstThatWorks([
      async () => {
        throw new Error('Nano session could not start');
      },
      async () => 'cloud',
    ]);

    expect(result).toBe('cloud');
  });

  it('fails with the last error when none answers', async () => {
    await expect(
      firstThatWorks([
        async () => {
          throw new Error('first');
        },
        async () => {
          throw new Error('last');
        },
      ]),
    ).rejects.toThrow('last');
  });
});
