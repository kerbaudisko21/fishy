import { describe, expect, it } from 'vitest';
import { decide } from './engine';
import { DEMO_SIGNALS } from '../../demo/fixtures';
import { mediaSignals } from '../pipeline';
import type { MediaCheck } from '../types';
import type { Signal } from '../types';

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
      expect(decide(mediaSignals([item({ facts: { editedWith: 'Lightroom' } })])).level).toBe('clear');
    });
  });
});
