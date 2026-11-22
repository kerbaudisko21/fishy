import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashPin, isPinFormat, verifyPin } from '../src/call/pin.ts';

test('the right PIN is accepted and a wrong one is not', () => {
  const record = hashPin('4821', 'salt-a');

  assert.equal(verifyPin('4821', record), true);
  assert.equal(verifyPin('4822', record), false);
  assert.equal(verifyPin('', record), false);
});

test('the stored record does not contain the PIN', () => {
  const record = hashPin('4821', 'salt-a');

  assert.ok(!JSON.stringify(record).includes('4821'));
});

test('the same PIN with a different salt gives a different record', () => {
  assert.notEqual(hashPin('4821', 'salt-a').hash, hashPin('4821', 'salt-b').hash);
});

test('a PIN is four to six digits', () => {
  for (const good of ['4821', '48215', '482159']) {
    assert.equal(isPinFormat(good), true, good);
  }
  for (const bad of ['', '482', '4821590', '48a1', ' 4821', '4821#']) {
    assert.equal(isPinFormat(bad), false, bad);
  }
});

test('a damaged record never verifies and never throws', () => {
  assert.equal(verifyPin('4821', { salt: 'salt-a', hash: 'not-hex' }), false);
  assert.equal(verifyPin('4821', { salt: '', hash: '' }), false);
});

test('a PIN in the wrong format is refused before any comparison', () => {
  assert.throws(() => hashPin('12', 'salt-a'), /four to six digits/);
});
