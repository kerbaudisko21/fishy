import { describe, expect, it } from 'vitest';
import { callTargets, defaultTarget } from './call-targets';
import type { DirectoryPerson, Supplier } from './types';

// FISHY may only offer to call someone whose number is on record. A name with no number
// behind it makes the call fail at the worst moment: right after "Call … on record".

const BUDI: DirectoryPerson = { id: 'budi', name: 'Budi Santoso', role: 'CFO', phoneMasked: '+62 812 •••• 4410', pinSet: true };
const SARI: DirectoryPerson = { id: 'sari', name: 'Sari Wijaya', role: 'Finance Director', phoneMasked: '+62 811 •••• 0937', escalationOrder: 1, pinSet: true };
const ANDRE: DirectoryPerson = { id: 'andre', name: 'Andre Halim', role: 'CEO', phoneMasked: '+62 813 •••• 5528', escalationOrder: 2, pinSet: true };

const supplier = (phoneMasked: string): Supplier => ({
  id: 'sinar',
  name: 'PT Sinar Logistik',
  domain: 'sinarlogistik.example',
  contact: { name: 'Dewi Lestari', role: 'Billing', phoneMasked },
  account: { bank: 'Bank Nusa', masked: '•••• 7890', holder: 'PT Sinar Logistik' },
  paidMonths: [],
});

describe('who FISHY offers to call', () => {
  it('lists the approvers in the order they are asked', () => {
    expect(callTargets([ANDRE, SARI, BUDI]).map((t) => t.id)).toEqual(['budi', 'sari', 'andre']);
  });

  it('puts the supplier contact first when their number is on record', () => {
    const targets = callTargets([BUDI, SARI], supplier('+62 21 •••• 7710'));

    expect(targets.map((t) => t.id)).toEqual(['sinar', 'budi', 'sari']);
    expect(targets[0]).toEqual({ id: 'sinar', name: 'Dewi Lestari', role: 'Billing, PT Sinar Logistik', phoneMasked: '+62 21 •••• 7710' });
  });

  it('leaves the supplier contact out when no number is on record for them', () => {
    for (const blank of ['', '   ']) {
      expect(callTargets([BUDI, SARI], supplier(blank)).map((t) => t.id)).toEqual(['budi', 'sari']);
    }
  });

  it('leaves out an approver with no number on record', () => {
    expect(callTargets([{ ...BUDI, phoneMasked: '' }, SARI]).map((t) => t.id)).toEqual(['sari']);
  });

  it('is empty when nobody has a number on record', () => {
    expect(callTargets([], supplier(''))).toEqual([]);
  });
});

describe('who is picked first', () => {
  const targets = callTargets([BUDI, SARI, ANDRE], supplier('+62 21 •••• 7710'));

  it('is the person the request claims to come from, when they are on record', () => {
    expect(defaultTarget(targets, 'Sari Wijaya')).toBe('sari');
    expect(defaultTarget(targets, '  sari wijaya ')).toBe('sari');
  });

  it('is the first person on the list otherwise', () => {
    expect(defaultTarget(targets, 'Someone Else')).toBe('sinar');
    expect(defaultTarget(targets, undefined)).toBe('sinar');
  });

  it('is an approver when the supplier contact has no number', () => {
    expect(defaultTarget(callTargets([BUDI, SARI], supplier('')), 'Dewi Lestari')).toBe('budi');
  });

  it('is nobody when the list is empty', () => {
    expect(defaultTarget([], 'Budi Santoso')).toBe('');
  });
});
