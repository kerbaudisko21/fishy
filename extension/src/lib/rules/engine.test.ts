import { describe, expect, it } from 'vitest';
import { decide, DEFAULT_RULES, mergeRules, type RulesConfig } from './engine';
import { DEMO_SIGNALS } from '../../demo/fixtures';
import { mediaSignals } from '../pipeline';
import type { MediaCheck, Signal } from '../types';

describe('decide', () => {
  it('flags the demo fake-CFO request as fishy, with all six red flags', () => {
    const v = decide(DEMO_SIGNALS);
    expect(v.level).toBe('fishy');
    expect(v.flags).toHaveLength(6);
    expect(v.patterns).toContain('Vendor bank change');
  });

  it('gives the same verdict for the same signals in any order (R2)', () => {
    const a = decide(DEMO_SIGNALS);
    const b = decide([...DEMO_SIGNALS].reverse());
    expect(b).toEqual(a);
  });

  it('treats a changed bank account as fishy on its own (R4)', () => {
    const only: Signal[] = [
      { kind: 'bank_account_changed', step: 'check', source: 'on_device', title: 'Bank account changed', detail: '' },
    ];
    expect(decide(only).level).toBe('fishy');
  });

  it('does not call a request fishy on a voice score alone', () => {
    const only: Signal[] = [
      { kind: 'voice_score', step: 'check', source: 'cloud', title: 'Voice likely synthetic', detail: '', score: 0.87 },
    ];
    expect(decide(only).level).toBe('clear');
  });

  it('weighs pressure by the number of distinct tactics', () => {
    const pressure = (strength: number): Signal[] => [
      { kind: 'pressure_tactics', step: 'read', source: 'on_device', title: '', detail: '', strength },
    ];
    expect(decide(pressure(1)).level).toBe('clear');
    expect(decide(pressure(3)).level).toBe('fishy');
  });

  it('always advises a call-back, even when clear', () => {
    expect(decide([]).callAdvised).toBe(true);
  });

  describe('pictures, documents and voices', () => {
    const item = (over: Partial<MediaCheck>): MediaCheck => ({ id: 'x', kind: 'picture', name: 'receipt.jpg', at: '10:00', checks: [], ...over });
    const gemini = (assessment: NonNullable<MediaCheck['gemini']>['assessment'], signs = [{ sign: 'The total is in another font', where: 'bottom right' }]) =>
      ({ assessment, signs, source: 'on_device', model: 'gemini-nano' }) as const;

    it('a file labelled as made by AI is fishy on its own', () => {
      expect(decide(mediaSignals([item({ facts: { aiLabel: 'Content Credentials say it was made by AI' } })])).level).toBe('fishy');
    });

    it('Gemini seeing signs of AI or editing is fishy on its own', () => {
      expect(decide(mediaSignals([item({ gemini: gemini('likely_edited') })])).level).toBe('fishy');
      expect(decide(mediaSignals([item({ kind: 'voice', gemini: gemini('likely_ai') })])).flags[0].title).toBe('Signs of a cloned voice');
    });

    it('"hard to tell" needs another red flag, and "no clear signs" adds none', () => {
      expect(decide(mediaSignals([item({ gemini: gemini('unclear') })])).level).toBe('clear');
      expect(mediaSignals([item({ gemini: gemini('no_clear_signs', []) })])).toEqual([]);
    });

    it('editing software alone is not fishy: photos are edited every day', () => {
      expect(decide(mediaSignals([item({ facts: { editedWith: 'a photo editor' } })])).level).toBe('clear');
    });
  });
});

describe('what kind of scam (media)', () => {
  const sig = (kind: Signal['kind'], strength?: number): Signal => ({ kind, step: 'check', source: 'on_device', title: kind, detail: '', strength });
  it('names the most specific scam first, each name once', () => {
    const v = decide([sig('video_signs', 3), sig('pressure_tactics', 3)]);
    expect(v.patterns[0]).toBe('Deepfake on a video call, with pressure');
    expect(v.patterns).toContain('Deepfake video call');
    expect(new Set(v.patterns).size).toBe(v.patterns.length);
    expect(decide([sig('ai_label'), sig('ai_tool')]).patterns).toEqual(['AI-made picture or receipt']);
  });
  it('a face that breaks up behind a hand is fishy on its own', () => {
    const v = decide([sig('liveness_failed', 3)]);
    expect(v.level).toBe('fishy');
    expect(v.patterns).toEqual(['Real-time face swap']);
  });
  it('a pixel hint alone is not enough; with Gemini’s signs it is', () => {
    expect(decide([sig('tamper_trace', 1)]).level).toBe('clear');
    expect(decide([sig('tamper_trace', 1), sig('picture_signs', 1)]).level).toBe('fishy');
  });
  it('every pattern says what to do or what it looks like', () => {
    for (const p of DEFAULT_RULES.patterns.filter((p) => p.requires.some((k) => k.includes('video') || k.includes('voice') || k.includes('liveness')))) {
      expect(p.action ?? p.signs).toBeTruthy();
    }
  });
});

describe('Remote Config on top of the built-in rules', () => {
  it('an older deployed config keeps the media signals switched on', () => {
    const old = { version: 14, alwaysFishy: ['bank_account_changed'], weights: { pressure_tactics: 2 }, threshold: 3, patterns: [{ name: 'Vendor bank change', requires: ['bank_account_changed'] }] } as Partial<RulesConfig>;
    const r = mergeRules(old);
    expect(r.version).toBe(14);
    expect(r.weights.pressure_tactics).toBe(2);
    expect(r.weights.video_signs).toBe(1);
    expect(r.alwaysFishy).toContain('ai_label');
    expect(r.patterns.filter((p) => p.name === 'Vendor bank change')).toHaveLength(1);
    expect(r.patterns.map((p) => p.name)).toContain('Cloned voice');
  });
});
