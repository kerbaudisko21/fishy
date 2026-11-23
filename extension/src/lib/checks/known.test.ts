import { describe, expect, it } from 'vitest';
import { candidatesFromText, international, matchKnown, suspectsFrom } from './known';
import type { KnownBadEntry } from '../types';

const LIST: KnownBadEntry[] = [
  { kind: 'account', value: '9032', display: 'Mandiri •••• 9032', count: 2 },
  { kind: 'domain', value: 'sinar-logistik.co', display: 'sinar-logistik.co', count: 1 },
];

describe('known bad details (R5)', () => {
  it('matches a masked account on its last digits and a domain on its registrable part, with the seen count', () => {
    const m = matchKnown(
      [
        { kind: 'account', value: '123-456-9032', display: 'Mandiri •••• 9032' },
        { kind: 'domain', value: 'pay.sinar-logistik.co', display: 'sinar-logistik.co' },
        { kind: 'phone', value: '+62 857 1234 2219', display: '+62 857 •••• 2219' },
      ],
      LIST,
    );
    expect(m.map((x) => x.entry?.count ?? 0)).toEqual([2, 1, 0]);
  });

  it('pulls phone numbers and link domains out of a message', () => {
    const c = candidatesFromText('Call +62 857 1234 2219 or open https://pay.sinar-logistik.co/inv');
    expect(c.map((x) => x.kind)).toEqual(['phone', 'domain']);
    expect(c[0].note).toMatch(/never calls/);
  });
});

describe('suspects to report with a phone check (shared learning)', () => {
  it('turns local numbers into international ones and leaves out what is not a number', () => {
    expect(international('0857 1234 2219')).toBe('+6285712342219');
    expect(international('+62 857 1234 2219')).toBe('+6285712342219');
    expect(international('6285712342219')).toBe('+6285712342219');
    expect(international('12345')).toBeNull();
  });

  it('keeps accounts as digits, domains as registrable names and numbers in international form', () => {
    const s = suspectsFrom([
      { kind: 'account', value: '123-456-9032', display: '' },
      { kind: 'domain', value: 'pay.sinar-logistik.co', display: '' },
      { kind: 'domain', value: 'sinar-logistik.co', display: '' },
      { kind: 'phone', value: '085712342219', display: '' },
      { kind: 'phone', value: '999', display: '' },
    ]);
    expect(s).toEqual({ accounts: ['1234569032'], domains: ['sinar-logistik.co'], numbers: ['+6285712342219'] });
  });
});
