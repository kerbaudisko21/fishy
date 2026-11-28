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
    expect(scoreMedia(item({ facts: { editedWith: 'a photo editor' }, gemini: g('no_clear_signs', 0) })).score).toBe(40);
  });

  it('has no score while Gemini reads, and says why when it could not run', () => {
    expect(scoreMedia(item({})).score).toBeNull();
    expect(scoreMedia(item({ kind: 'frame', gemini: null })).reasons[0]).toContain('Gemini didn’t run');
  });
});

describe('why it is fishy, in one sentence', () => {
  it('leads with the verdict and the two strongest reasons', async () => {
    const { whySentence } = await import('./media-score');
    expect(whySentence(scoreMedia(item({ gemini: g('likely_ai', 3) })))).toBe('Fishy because sign 1 (here), and sign 2 (here).');
    expect(whySentence(scoreMedia(item({ gemini: g('no_clear_signs', 0) })))).toBe('Looks okay: no clear signs of AI or editing.');
    expect(whySentence(scoreMedia(item({ facts: { aiLabel: 'Content Credentials say it was made by AI' } })))).toBe(
      'Fishy because Content Credentials say it was made by AI.',
    );
  });
});

describe('the laptop’s own measurements in the score', () => {
  const base = { id: 'x', name: 'x', at: '10:00', checks: [] };
  it('a frozen video is fishy before Gemini answers, and says why', () => {
    const s = scoreMedia({ ...base, kind: 'frame', gemini: null, forensics: { hints: [{ id: 'frozen', strength: 2, text: 'Nothing moved in 2.8 s.' }], rows: [] } });
    expect(s.band).toBe('high');
    expect(s.reasons[0]).toMatch(/Nothing moved/);
  });
  it('one strong pixel hint alone is worth a closer look, not a verdict', () => {
    const s = scoreMedia({ ...base, kind: 'picture', gemini: { assessment: 'no_clear_signs', signs: [], source: 'on_device', model: 'gemini-nano' }, forensics: { hints: [{ id: 'ela', strength: 2, text: 'The centre re-saves differently.' }], rows: [] } });
    expect(s.band).toBe('some');
    expect(s.reasons[0]).toMatch(/re-saves/);
  });
  it('a face that broke up behind a hand scores at least 85', () => {
    const s = scoreMedia({ ...base, kind: 'frame', challenge: true, gemini: { assessment: 'likely_edited', signs: [{ sign: 'The hand melts into the cheek', where: 'frames 3–5' }], source: 'cloud', model: 'gemini-cloud' } });
    expect(s.score).toBeGreaterThanOrEqual(85);
  });
});
