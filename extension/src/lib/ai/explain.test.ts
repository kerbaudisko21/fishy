import { describe, expect, it } from 'vitest';
import type { Signal, Verdict } from '../types';
import { explainPrompt, explainVerdict, templateExplanation } from './explain';

const flag = (title: string, detail: string): Signal => ({ kind: 'pressure_tactics', step: 'read', source: 'on_device', title, detail });

const fishy: Verdict = {
  level: 'fishy',
  flags: [
    flag('Bank account changed', 'Bank Teluk 1234567890 differs from the last 6 payments'),
    flag('Pressure in the request', 'Urgency and secrecy'),
    flag('Known scam account', 'Seen in 2 confirmed scams'),
    flag('Look-alike sender', 'sinar-abadi.co vs sinarabadi.co.id'),
  ],
  patterns: ['Vendor bank change'],
  callAdvised: true,
};

describe('explainPrompt', () => {
  it('carries the flags, the pattern and the context', () => {
    const p = explainPrompt(fishy, { askedBy: 'Budi (CFO)', amount: 'Rp 1,250,000,000' });
    expect(p).toContain('- Bank account changed:');
    expect(p).toContain('Vendor bank change');
    expect(p).toContain('Asked by: Budi (CFO).');
  });

  it('never carries a full account number', () => {
    expect(explainPrompt(fishy)).not.toContain('1234567890');
  });
});

describe('templateExplanation', () => {
  it('names the top three flags and counts the rest', () => {
    const t = templateExplanation(fishy);
    expect(t).toContain('4 red flags: bank account changed, pressure in the request and known scam account, plus 1 more.');
    expect(t).toContain('number on record');
  });

  it('still advises a call-back when nothing was found', () => {
    expect(templateExplanation({ ...fishy, level: 'clear', flags: [], patterns: [] })).toContain('number on record');
  });
});

describe('explainVerdict', () => {
  it('uses the labelled template without a Firebase config', async () => {
    const r = await explainVerdict(fishy);
    expect(r.model).toBe('template');
    expect(r.text).toBe(templateExplanation(fishy));
  });
});

describe('parseMedia', () => {
  it('drops a "sign" that says there is no sign, so a clean result stays clean', async () => {
    const { parseMedia } = await import('./prompts');
    const r = parseMedia(JSON.stringify({ assessment: 'no_clear_signs', signs: [{ sign: 'No visible signs of AI or edits', where: 'Overall image' }] }));
    expect(r).toEqual({ assessment: 'no_clear_signs', signs: [], confidence: 'medium' });
    expect(parseMedia(JSON.stringify({ assessment: 'unclear', signs: [{ sign: 'The face appears natural', where: '' }, { sign: 'Warped fingers', where: 'left hand' }] })).signs).toEqual([
      { sign: 'Warped fingers', where: 'left hand' },
    ]);
  });
});

