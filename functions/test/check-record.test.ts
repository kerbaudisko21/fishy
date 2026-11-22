// Reading the check the side panel created. A client wrote it, so every
// field is checked, and what does not fit is left out.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readCheck } from '../src/call/check-record.ts';

const SUMMARY = {
  flags: ['bank_account_changed'],
  patterns: ['Vendor bank change'],
  place: 'gmail',
  amount: { value: 186400, currency: 'USD' },
  payee: 'Tessaline Packaging · First Example Bank •••• 4416',
};

test('a check as the side panel writes it is read in full', () => {
  assert.deepEqual(readCheck({ ownerUid: 'user-1', createdAt: {}, summary: SUMMARY }), {
    ownerUid: 'user-1',
    place: 'gmail',
    amount: { value: 186400, currency: 'USD' },
    payee: 'Tessaline Packaging · First Example Bank •••• 4416',
  });
});

test('a document with no owner is not a check', () => {
  assert.equal(readCheck({ summary: SUMMARY }), null);
  assert.equal(readCheck({ ownerUid: 42, summary: SUMMARY }), null);
  assert.equal(readCheck(undefined), null);
  assert.equal(readCheck('a string'), null);
});

test('a check with no summary still has its owner', () => {
  assert.deepEqual(readCheck({ ownerUid: 'user-1' }), { ownerUid: 'user-1', place: null, amount: null, payee: null });
});

for (const [name, amount] of Object.entries({
  'a negative amount': { value: -5, currency: 'USD' },
  'an amount that is not a number': { value: '186400', currency: 'USD' },
  'an amount that is not finite': { value: Number.POSITIVE_INFINITY, currency: 'USD' },
  'a currency that is not a three-letter code': { value: 100, currency: 'dollars, pay at once' },
  'an amount that is text': 'pay 186400 now',
})) {
  test(`${name} is left out`, () => {
    assert.equal(readCheck({ ownerUid: 'user-1', summary: { ...SUMMARY, amount } })?.amount, null);
  });
}

test('a place that is not one of the three is left out', () => {
  assert.equal(readCheck({ ownerUid: 'user-1', summary: { ...SUMMARY, place: 'somewhere else' } })?.place, null);
});

test('a payee is one short line, or nothing', () => {
  const read = (payee: unknown) => readCheck({ ownerUid: 'user-1', summary: { ...SUMMARY, payee } })?.payee;

  assert.equal(read('  Tessaline   Packaging \n First Example Bank  '), 'Tessaline Packaging First Example Bank');
  assert.equal(read('x'.repeat(121)), null, 'long text, such as a pasted message, is not a payee');
  assert.equal(read(''), null);
  assert.equal(read({ name: 'Tessaline' }), null);
});
