import { describe, expect, it } from 'vitest';
import { firstName, initials, moneyParts, plural } from './names';

describe('names', () => {
  it('skips titles for the name used in a sentence', () => {
    expect(firstName('Raden Ajeng Kartika Wulandari-Soedarsono')).toBe('Kartika');
    expect(firstName('Dr. Ir. Budi Santoso')).toBe('Budi');
    expect(firstName('H. Ahmad Fauzi')).toBe('Ahmad');
    expect(firstName('Sukarno')).toBe('Sukarno');
    expect(firstName(undefined)).toBe('them');
  });

  it('takes initials from the first and last name, not titles or suffixes', () => {
    expect(initials('Muhammad Rizky Pratama Putra Wijayakusuma III')).toBe('MW');
    expect(initials('Raden Ajeng Kartika Wulandari-Soedarsono')).toBe('KW');
    expect(initials('Ng')).toBe('N');
  });

  it('counts with separators and the right plural', () => {
    expect(plural(1, 'confirmed scam')).toBe('1 confirmed scam');
    expect(plural(1284, 'confirmed scam')).toBe('1,284 confirmed scams');
  });

  it('splits a currency code from the number, keeps a symbol attached', () => {
    expect(moneyParts(12_750_000_000, 'IDR')).toEqual({ currency: 'IDR', number: '12,750,000,000' });
    expect(moneyParts(186400, 'USD')).toEqual({ currency: '', number: '$186,400' });
  });
});
