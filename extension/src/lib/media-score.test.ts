import { describe, expect, it } from 'vitest';
import { HINT_LR, lrLabel, PRIOR, scoreMedia, whySentence } from './media-score';
import type { MediaCheck } from './types';

const item = (over: Partial<MediaCheck>): MediaCheck => ({ id: 'x', kind: 'picture', name: 'p.jpg', at: '10:00', checks: [], ...over });
const g = (assessment: NonNullable<MediaCheck['gemini']>['assessment'], n: number) => ({
  assessment,
  signs: Array.from({ length: n }, (_, i) => ({ sign: `Sign ${i + 1}`, where: 'here' })),
  source: 'cloud' as const,
  model: 'gemini-cloud' as const,
});
/** The score the odds formula gives, for checking the arithmetic by hand. */
const expected = (...lrs: number[]) => {
  const up = lrs.filter((l) => l >= 1).sort((a, b) => b - a);
  const down = lrs.filter((l) => l < 1);
  let odds = PRIOR / (1 - PRIOR);
  up.forEach((l, k) => (odds *= l ** (0.8 ** k)));
  down.forEach((l) => (odds *= l));
  return Math.round((100 * odds) / (1 + odds));
};

describe('the FISHY score: odds multiplied by each sign', () => {
  it('starts from the prior and multiplies by each sign’s likelihood ratio', () => {
    // An AI label (×60) and Gemini seeing nothing (×0.7): 0.176 × 60 × 0.7 = 7.4 → 88%.
    const s = scoreMedia(item({ facts: { aiLabel: 'Content Credentials say it was made by AI' }, gemini: g('no_clear_signs', 0) }));
    expect(s.score).toBe(expected(60, 0.7));
    expect(s.score).toBe(88);
    expect(s.band).toBe('high');
    expect(s.reasons[0]).toBe('Content Credentials say it was made by AI.');
    expect(s.factors[0].lr).toBe(60);
  });

  it('counts Gemini once, more with each sign it can point to, and shows the other signs as detail', () => {
    // Gemini as a detector: LR+ ≈ 3 (Jia et al. 2024), so on its own it is worth a closer look, not a verdict.
    const s = scoreMedia(item({ gemini: g('likely_ai', 3) }));
    expect(s.score).toBe(expected(3 * 1.3 ** 2));
    expect(s.band).toBe('some');
    expect(s.reasons).toEqual(['Gemini saw: Sign 1 (here).', 'Gemini saw: Sign 2 (here).', 'Gemini saw: Sign 3 (here).']);
    expect(s.factors.filter((f) => f.lr !== undefined)).toHaveLength(1);
    expect(scoreMedia(item({ kind: 'voice', gemini: g('likely_ai', 1) })).reasons[0]).toBe('Gemini heard: Sign 1 (here).');
  });

  it('keeps "hard to tell" and "no clear signs" low; signs that are pointed at raise it', () => {
    expect(scoreMedia(item({ gemini: g('unclear', 0) })).band).toBe('low');
    expect(scoreMedia(item({ gemini: g('unclear', 4) })).band).toBe('some');
    expect(scoreMedia(item({ gemini: g('no_clear_signs', 0) }))).toMatchObject({ score: expected(0.7), band: 'low' });
  });

  it('a photo editor alone is a small step (editing photos is normal)', () => {
    expect(scoreMedia(item({ facts: { editedWith: 'a photo editor' }, gemini: g('no_clear_signs', 0) })).band).toBe('low');
  });

  it('correlated signs never count twice: the second strongest is damped', () => {
    const one = scoreMedia(item({ kind: 'voice', gemini: null, forensics: { hints: [{ id: 'background_jump', strength: 2, text: 'a' }], rows: [] } })).score!;
    const two = scoreMedia(item({ kind: 'voice', gemini: null, forensics: { hints: [{ id: 'background_jump', strength: 2, text: 'a' }, { id: 'background_jump', strength: 2, text: 'b' }], rows: [] } })).score!;
    expect(two).toBe(expected(3, 3));
    expect(two).toBeLessThan(expected(9));
    expect(two).toBeGreaterThan(one);
  });

  it('has no score while Gemini reads, and says why when it could not run', () => {
    expect(scoreMedia(item({})).score).toBeNull();
    expect(scoreMedia(item({ kind: 'frame', gemini: null })).reasons[0]).toContain('Gemini didn’t run');
  });

  it('labels each ratio for the card', () => {
    expect(lrLabel(8)).toBe('×8');
    expect(lrLabel(1.8)).toBe('×1.8');
    expect(lrLabel(0.5)).toBe('÷2');
    expect(lrLabel(0.7)).toBe('÷1.4');
    expect(lrLabel(60)).toBe('×60');
  });

  it('every hint the checks can raise has a ratio above 1 (absence is never counted as proof)', () => {
    for (const lr of Object.values(HINT_LR)) expect(lr).toBeGreaterThan(1);
  });
});

describe('why it is fishy, in one sentence', () => {
  it('leads with the verdict and the two strongest reasons', () => {
    expect(whySentence(scoreMedia(item({ gemini: g('likely_ai', 3) })))).toBe('Worth a closer look: sign 1 (here), and sign 2 (here).');
    expect(whySentence(scoreMedia(item({ gemini: g('likely_ai', 3), forensics: { hints: [{ id: 'thumbnail', strength: 2, text: 'The camera preview doesn’t match.' }], rows: [] } })))).toMatch(/^Fishy because/);
    expect(whySentence(scoreMedia(item({ gemini: g('no_clear_signs', 0) })))).toBe('Looks okay: no clear signs of AI or editing.');
    expect(whySentence(scoreMedia(item({ facts: { aiLabel: 'Content Credentials say it was made by AI' } })))).toBe('Fishy because Content Credentials say it was made by AI.');
  });
});

describe('the laptop’s own measurements in the score', () => {
  const base = { id: 'x', name: 'x', at: '10:00', checks: [] };
  it('a frozen video is worth a closer look before Gemini answers (network freezes happen), and says why', () => {
    const s = scoreMedia({ ...base, kind: 'frame', gemini: null, forensics: { hints: [{ id: 'frozen', strength: 2, text: 'Nothing moved in 2.8 s.' }], rows: [] } });
    expect(s.band).toBe('some');
    expect(s.reasons[0]).toMatch(/Nothing moved/);
  });
  it('one strong pixel hint against a clean Gemini reading is worth a closer look, not a verdict', () => {
    const s = scoreMedia({ ...base, kind: 'picture', gemini: { assessment: 'no_clear_signs', signs: [], source: 'on_device', model: 'gemini-nano' }, forensics: { hints: [{ id: 'thumbnail', strength: 2, text: 'The camera preview doesn’t match.' }], rows: [] } });
    expect(s.score).toBe(expected(8, 0.7));
    expect(s.band).toBe('some');
    expect(s.reasons[0]).toMatch(/preview/);
  });
  it('a face that broke up behind a hand is strong evidence', () => {
    const s = scoreMedia({ ...base, kind: 'frame', challenge: true, gemini: { assessment: 'likely_edited', signs: [{ sign: 'The hand melts into the cheek', where: 'frames 3–5' }], source: 'cloud', model: 'gemini-cloud' } });
    expect(s.score).toBe(expected(12));
    expect(s.band).toBe('high');
  });
});
