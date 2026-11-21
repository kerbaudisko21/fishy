import { describe, expect, it } from 'vitest';
import { core, diffParts, findLookalike, registrable } from './domain';

const known = [{ domain: 'sinarlogistik.co.id' }, { domain: 'mitrakemas.id' }];

describe('domains', () => {
  it('finds the registrable domain and its core', () => {
    expect(registrable('billing@mail.sinarlogistik.co.id')).toBe('sinarlogistik.co.id');
    expect(core('sinar-logistik.co')).toBe('sinarlogistik');
  });

  it('flags the demo look-alike sender (R3)', () => {
    const r = findLookalike('billing@sinar-logistik.co', known);
    expect(r?.match.domain).toBe('sinarlogistik.co.id');
    expect(r?.reason).toBe('One hyphen added, different ending');
  });

  it.each(['sinarlogistlk.co.id', 'sinar1ogistik.co.id', 'mitrakemas.co', 'mitra-kemas.id', 'rnitrakemas.id'])(
    'flags %s as a look-alike',
    (d) => expect(findLookalike(d, known)).not.toBeNull(),
  );

  it('does not flag the real domain, its subdomains or unrelated ones', () => {
    expect(findLookalike('billing@sinarlogistik.co.id', known)).toBeNull();
    expect(findLookalike('a@finance.sinarlogistik.co.id', known)).toBeNull();
    expect(findLookalike('news@example.com', known)).toBeNull();
  });

  it('marks the characters that were added', () => {
    expect(diffParts('billing@sinar-logistik.co', 'billing@sinarlogistik.co.id')).toEqual([
      { text: 'billing@sinar' },
      { text: '-', changed: true },
      { text: 'logistik.co' },
    ]);
  });
});
