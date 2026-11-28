// Guessing the PIN must get nowhere: not on one check, not by switching answers, and not by
// opening many checks for the same person. (Security review, Nov 23: finding H1.)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestError } from '../src/call/ports.ts';
import { startCall } from '../src/call/startCall.ts';
import { answerChoice, answerPin, MAX_PIN_ATTEMPTS, PERSON_PIN_FAILURES, PIN_LOCK_WINDOW_MS } from '../src/call/steps.ts';
import { BUDI_PIN, check, harness, waiting } from './helpers.ts';

const WRONG = '0000';

test('switching from "yes" to "no" does not reset the PIN attempts', async () => {
  const h = harness();
  await waiting(h);
  await answerChoice(h.deps, 'v-test', '1');
  await answerPin(h.deps, 'v-test', WRONG);
  await answerPin(h.deps, 'v-test', WRONG);
  await answerChoice(h.deps, 'v-test', '2');
  const after = await h.store.getVerification('v-test');
  // The second answer cannot reopen the PIN prompt with fresh attempts.
  assert.ok(after!.pinAttempts >= 2);
  const { outcome } = await answerPin(h.deps, 'v-test', WRONG);
  assert.notEqual(outcome, 'retry');
});

test('after five wrong PINs over any checks, even the right PIN is refused for a day', async () => {
  const h = harness();
  for (let i = 0; i < PERSON_PIN_FAILURES; i += 1) {
    await h.store.recordPinFailure('budi', h.clock.now - 1000);
  }
  await waiting(h);
  await answerChoice(h.deps, 'v-test', '1');
  const { outcome } = await answerPin(h.deps, 'v-test', BUDI_PIN);
  assert.notEqual(outcome, 'confirmed');

  // A day later the lock has passed.
  const later = harness();
  later.clock.now = h.clock.now + PIN_LOCK_WINDOW_MS + 1;
  for (let i = 0; i < PERSON_PIN_FAILURES; i += 1) {
    await later.store.recordPinFailure('budi', h.clock.now - 1000);
  }
  await waiting(later);
  await answerChoice(later.deps, 'v-test', '1');
  assert.equal((await answerPin(later.deps, 'v-test', BUDI_PIN)).outcome, 'confirmed');
});

test('a locked person is told the PIN is locked, so nobody keeps guessing why the right PIN fails', async () => {
  const h = harness();
  for (let i = 0; i < PERSON_PIN_FAILURES; i += 1) {
    await h.store.recordPinFailure('budi', h.clock.now - 1000);
  }
  await waiting(h);
  await answerChoice(h.deps, 'v-test', '1');
  const answered = await answerPin(h.deps, 'v-test', BUDI_PIN);
  assert.equal(answered.locked, true);
  assert.notEqual(answered.outcome, 'confirmed');
});

test('someone who is not locked is never told they are, right PIN or wrong', async () => {
  const h = harness();
  await waiting(h);
  await answerChoice(h.deps, 'v-test', '1');
  assert.equal((await answerPin(h.deps, 'v-test', WRONG)).locked, false);
  assert.equal((await answerPin(h.deps, 'v-test', BUDI_PIN)).locked, false);
});

test('every wrong PIN counts against the person, not only the check', async () => {
  const h = harness();
  await waiting(h);
  await answerChoice(h.deps, 'v-test', '1');
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i += 1) {
    await answerPin(h.deps, 'v-test', WRONG);
  }
  assert.equal(await h.store.pinFailuresSince('budi', 0), MAX_PIN_ATTEMPTS);
});

test('one person gets at most five checks an hour, whoever asks', async () => {
  const h = harness({ approvalPageEnabled: true });
  for (let i = 1; i <= 6; i += 1) {
    h.store.checks.set(`check-${i}`, check());
  }
  for (let i = 1; i <= 5; i += 1) {
    await startCall(h.deps, { uid: 'user-1' }, { checkId: `check-${i}`, personId: 'budi' });
  }
  await assert.rejects(
    () => startCall(h.deps, { uid: 'user-1' }, { checkId: 'check-6', personId: 'budi' }),
    (error: unknown) => error instanceof RequestError && error.code === 'resource-exhausted',
  );
});
