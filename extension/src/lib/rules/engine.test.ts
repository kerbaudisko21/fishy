import { describe, expect, it } from 'vitest';
import { decide } from './engine';
import { DEMO_SIGNALS } from '../../demo/fixtures';
import type { Signal } from '../types';

describe('decide', () => {
  it('flags the demo fake-CFO request as fishy, with all five red flags', () => {
    const v = decide(DEMO_SIGNALS);
    expect(v.level).toBe('fishy');
    expect(v.flags).toHaveLength(5);
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
});
