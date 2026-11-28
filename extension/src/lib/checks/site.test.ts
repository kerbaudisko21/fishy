import { describe, expect, it } from 'vitest';
import { mediaSignals } from '../media-signals';
import { scoreMedia } from '../media-score';
import { decide } from '../rules/engine';
import { siteLab, type PageFacts } from './site';

const suppliers = [{ name: 'PT Sinar Logistik', domain: 'sinarlogistik.co.id' }];
const page = (o: Partial<PageFacts>): PageFacts => ({
  url: 'https://example.com/',
  host: 'example.com',
  https: true,
  title: 'Example',
  text: '',
  passwordFields: 0,
  cardFields: 0,
  otpFields: 0,
  formHosts: [],
  ...o,
});

describe('website check on the laptop', () => {
  it('a plain, established site raises nothing', () => {
    const lab = siteLab(page({}), suppliers, { ageDays: 4000, unsafe: false });
    expect(lab.hints).toEqual([]);
    expect(lab.rows.every((r) => r.ok)).toBe(true);
  });

  it('catches a copy of a supplier’s address, and names the scam', () => {
    const lab = siteLab(page({ host: 'sinar-logistik.co', url: 'https://sinar-logistik.co/pay' }), suppliers);
    expect(lab.hints[0].id).toBe('lookalike');
    expect(lab.imitates).toBe('PT Sinar Logistik');
    const item = { id: 's', kind: 'site' as const, name: 'sinar-logistik.co', at: '10:00', checks: [], gemini: null, forensics: { hints: lab.hints, rows: lab.rows } };
    const v = decide(mediaSignals([item]));
    expect(v.level).toBe('fishy');
    expect(v.patterns[0]).toBe('Fake website copying a supplier');
  });

  it('a supplier’s real address is recognised, not flagged', () => {
    const lab = siteLab(page({ host: 'portal.sinarlogistik.co.id' }), suppliers);
    expect(lab.hints).toEqual([]);
    expect(lab.rows.some((r) => r.title === 'A supplier on record')).toBe(true);
  });

  it('flags look-alike letters, bare numbers, and secrets asked without https or sent elsewhere', () => {
    expect(siteLab(page({ host: 'xn--pypal-4ve.com' }), []).hints.map((h) => h.id)).toContain('punycode');
    expect(siteLab(page({ host: '203.0.113.9' }), []).hints.map((h) => h.id)).toContain('ip_host');
    const ids = siteLab(page({ https: false, passwordFields: 1, formHosts: ['collect.evil.example'] }), []).hints.map((h) => h.id);
    expect(ids).toEqual(expect.arrayContaining(['not_https', 'form_elsewhere']));
  });

  it('a password field on a normal https site is not a sign by itself', () => {
    expect(siteLab(page({ passwordFields: 1, formHosts: ['example.com'] }), []).hints).toEqual([]);
  });

  it('a young address counts; an unknown age says nothing', () => {
    expect(siteLab(page({}), [], { ageDays: 9 }).hints[0]).toMatchObject({ id: 'young', strength: 2 });
    expect(siteLab(page({}), [], { ageDays: null }).hints).toEqual([]);
  });

  it('on Google’s unsafe list: scored 95 and fishy', () => {
    const lab = siteLab(page({}), [], { unsafe: true });
    const item = { id: 's', kind: 'site' as const, name: 'example.com', at: '10:00', checks: [], gemini: null, forensics: { hints: lab.hints, rows: lab.rows } };
    expect(scoreMedia(item).score).toBe(95);
    expect(decide(mediaSignals([item])).level).toBe('fishy');
  });

  it('a cheap ending alone is only a weak hint', () => {
    const lab = siteLab(page({ host: 'promo-deal.xyz' }), []);
    const item = { id: 's', kind: 'site' as const, name: 'x', at: '10:00', checks: [], gemini: null, forensics: { hints: lab.hints, rows: lab.rows } };
    expect(decide(mediaSignals([item])).level).toBe('clear');
    expect(scoreMedia(item).band).toBe('some');
  });

  it('never puts the page’s text in what Gemini is told', () => {
    expect(siteLab(page({ text: 'Account 1234567890 balance' }), []).measured).not.toContain('1234567890');
  });
});

describe('website answer from Gemini', () => {
  it('maps the website verdicts onto the media reading, with who the page claims to be', async () => {
    const { parseSite } = await import('../ai/prompts');
    const r = parseSite(JSON.stringify({ assessment: 'likely_scam', confidence: 'high', claims_to_be: 'Bank Teluk', signs: [{ sign: 'The bank’s logo on an address that isn’t the bank’s', where: 'top left' }] }));
    expect(r).toMatchObject({ assessment: 'likely_ai', confidence: 'high', claimsToBe: 'Bank Teluk' });
    expect(parseSite(JSON.stringify({ assessment: 'suspicious', signs: [] })).assessment).toBe('likely_edited');
    expect(parseSite(JSON.stringify({ assessment: 'nonsense' })).assessment).toBe('unclear');
  });
});
