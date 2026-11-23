import { describe, expect, it } from 'vitest';
import { scoreMedia } from './media-score';
import type { MediaCheck } from './types';

const item = (over: Partial<MediaCheck>): MediaCheck => ({ id: 'x', kind: 'picture', name: 'p.jpg', at: '10:00', checks: [], ...over });
const g = (assessment: NonNullable<MediaCheck['gemini']>['assessment'], n: number) => ({
  assessment,
  signs: Array.from({ length: n }, (_, i) => ({ sign: `Sign ${i + 1}`, where: 'here' })),
  source: 'cloud' as const,
  model: 'gemini-cloud' as const,
});

describe('the FISHY score', () => {
  it('puts what the file says about itself highest', () => {
    const s = scoreMedia(item({ facts: { aiLabel: 'Content Credentials say it was made by AI' }, gemini: g('no_clear_signs', 0) }));
    expect(s.score).toBe(95);
    expect(s.band).toBe('high');
    expect(s.reasons[0]).toBe('Content Credentials say it was made by AI.');
  });

  it('scores Gemini by its assessment and the number of signs, and says why', () => {
    const s = scoreMedia(item({ gemini: g('likely_ai', 3) }));
    expect(s.score).toBe(85);
    expect(s.reasons).toEqual(['Gemini saw: Sign 1 (here).', 'Gemini saw: Sign 2 (here).', 'Gemini saw: Sign 3 (here).']);
    expect(scoreMedia(item({ kind: 'voice', gemini: g('likely_ai', 1) })).reasons[0]).toBe('Gemini heard: Sign 1 (here).');
  });

  it('keeps "hard to tell" and "no clear signs" low', () => {
    expect(scoreMedia(item({ gemini: g('unclear', 0) })).band).toBe('low');
    expect(scoreMedia(item({ gemini: g('unclear', 2) })).band).toBe('some');
    expect(scoreMedia(item({ gemini: g('no_clear_signs', 0) }))).toMatchObject({ score: 10, band: 'low' });
  });

  it('adds a little for a photo editor', () => {
    expect(scoreMedia(item({ facts: { editedWith: 'Photoshop' }, gemini: g('no_clear_signs', 0) })).score).toBe(40);
  });

  it('has no score while Gemini reads, and says why when it could not run', () => {
    expect(scoreMedia(item({})).score).toBeNull();
    expect(scoreMedia(item({ kind: 'frame', gemini: null })).reasons[0]).toContain('Gemini didn’t run');
  });
});
