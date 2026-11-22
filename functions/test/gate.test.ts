// The call gate. A real call costs money and rings a real person's phone, so
// it is closed unless someone deliberately opens it for specific numbers.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decideCall, parseAllowlist } from '../src/call/gate.ts';

const NUMBER = '+12025550143';

test('calls are off by default', () => {
  assert.deepEqual(decideCall({ callsEnabled: false, callAllowlist: [NUMBER] }, NUMBER), {
    allowed: false,
    reason: 'calls_disabled',
  });
});

test('with calls on, a number that is not on the allowlist is not called', () => {
  assert.deepEqual(decideCall({ callsEnabled: true, callAllowlist: ['+12025550100'] }, NUMBER), {
    allowed: false,
    reason: 'not_on_allowlist',
  });
});

test('with calls on, an empty allowlist allows nobody', () => {
  assert.equal(decideCall({ callsEnabled: true, callAllowlist: [] }, NUMBER).allowed, false);
});

test('with calls on, a number on the allowlist is called', () => {
  assert.deepEqual(decideCall({ callsEnabled: true, callAllowlist: [NUMBER] }, NUMBER), { allowed: true });
});

test('numbers are compared without spaces, dashes or brackets', () => {
  assert.equal(decideCall({ callsEnabled: true, callAllowlist: ['+1 (202) 555-0143'] }, NUMBER).allowed, true);
});

test('a star opens the gate for every number, and only when calls are on', () => {
  assert.equal(decideCall({ callsEnabled: true, callAllowlist: ['*'] }, NUMBER).allowed, true);
  assert.equal(decideCall({ callsEnabled: false, callAllowlist: ['*'] }, NUMBER).allowed, false);
});

test('a number that is not in international format is never called', () => {
  assert.deepEqual(decideCall({ callsEnabled: true, callAllowlist: ['*'] }, '0812345'), {
    allowed: false,
    reason: 'invalid_number',
  });
});

test('reads the allowlist from a comma-separated setting', () => {
  assert.deepEqual(parseAllowlist(' +12025550143 , +1 202 555 0100 ,, '), ['+12025550143', '+12025550100']);
  assert.deepEqual(parseAllowlist(''), []);
  assert.deepEqual(parseAllowlist('*'), ['*']);
});
