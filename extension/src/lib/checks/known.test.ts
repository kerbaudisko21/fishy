import { describe, expect, it } from 'vitest';
import { candidatesFromText, matchKnown } from './known';
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
