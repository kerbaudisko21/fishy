// The web approval page, for judges who cannot receive a trial call.
// It asks the same two things as the phone, yes or no and then the PIN, and
// goes through the same steps, so the result is the same.
//
// The page is a demo device and is off unless switched on in the settings:
// the link is handed to the person who asked for the check.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { answerApproval, getApproval } from '../src/approve/approval.ts';
import { RequestError } from '../src/call/ports.ts';
import { PERSON_PIN_FAILURES } from '../src/call/steps.ts';
import { BUDI_PHONE, BUDI_PIN, check, harness, NOW, waiting } from './helpers.ts';
import type { Harness } from './helpers.ts';

const SECRET = 'page-secret-0123456789';
const TOKEN = `v-test.${SECRET}`;
const EXPIRES = NOW + 15 * 60 * 1000;
const ON = { approvalPageEnabled: true };

async function pageCheck(h: Harness) {
  return waiting(h, {
    callPlaced: false,
    callSkippedReason: 'calls_disabled',
    approvalTokenHash: createHash('sha256').update(SECRET).digest('hex'),
    approvalExpiresAt: EXPIRES,
  });
}

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

async function statusOf(h: Harness) {
  return (await h.store.getVerification('v-test'))?.status;
}

test('opening the link shows who is asked, the amount and the payee, and nothing private', async () => {
  const h = harness(ON);
  await pageCheck(h);

  const view = await getApproval(h.deps, { token: TOKEN });

  assert.deepEqual(view, {
    approverName: 'Budi Prakoso',
    company: 'Ombakura Freight',
    amount: { value: 186400, currency: 'USD' },
    payee: 'Tessaline Packaging · First Example Bank •••• 4416',
    context: 'Asked for on a video call',
    expiresAt: EXPIRES,
  });
  const text = JSON.stringify(view);
  assert.ok(!text.includes(BUDI_PHONE));
  assert.ok(!text.includes('salt'));
});

test('a check with no amount or payee still opens, and says so', async () => {
  const h = harness(ON);
  await pageCheck(h);
  h.store.checks.set('v-test', check({ place: 'gmail', amount: null, payee: null }));

  const view = await getApproval(h.deps, { token: TOKEN });

  assert.deepEqual(view.amount, { value: 0, currency: 'USD' });
  assert.equal(view.payee, 'No account named');
  assert.equal(view.context, 'Asked for by email');
});

test('"no" with the right PIN marks the request as not theirs', async () => {
  const h = harness(ON);
  await pageCheck(h);

  const reply = await answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN });

  assert.deepEqual(reply, { ok: true });
  const saved = await h.store.getVerification('v-test');
  assert.equal(saved?.status, 'denied');
  assert.equal(saved?.pinVerified, true);
});

test('"yes" with the right PIN confirms the request', async () => {
  const h = harness(ON);
  await pageCheck(h);

  const reply = await answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: BUDI_PIN });

  assert.deepEqual(reply, { ok: true });
  assert.equal(await statusOf(h), 'confirmed');
});

test('"yes" with a wrong PIN confirms nothing, and three wrong PINs close the check', async () => {
  const h = harness(ON);
  await pageCheck(h);

  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: '0000' }), 'permission-denied');
  assert.equal(await statusOf(h), 'awaiting_pin');
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: '1111' }), 'permission-denied');
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: '2222' }), 'permission-denied');

  assert.equal(await statusOf(h), 'pin_failed');
  // Even the right PIN is too late now.
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: BUDI_PIN }), 'not-found');
  assert.equal(await statusOf(h), 'pin_failed');
});

test('"no" with a wrong PIN still marks the request as not theirs, and the PIN can be tried again', async () => {
  const h = harness(ON);
  await pageCheck(h);

  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: '0000' }), 'permission-denied');
  assert.equal(await statusOf(h), 'denied');
  assert.equal((await h.store.getVerification('v-test'))?.pinVerified, false);

  await answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN });
  assert.equal((await h.store.getVerification('v-test'))?.pinVerified, true);
});

test('with the PIN locked, the page is told so instead of "wrong PIN", and nothing is confirmed', async () => {
  const h = harness(ON);
  for (let i = 0; i < PERSON_PIN_FAILURES; i += 1) {
    await h.store.recordPinFailure('budi', NOW - 1000);
  }
  await pageCheck(h);

  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: BUDI_PIN }), 'resource-exhausted');
  assert.notEqual(await statusOf(h), 'confirmed');
});

test('with the PIN locked, "no" is still recorded, only not proven with the PIN', async () => {
  const h = harness(ON);
  for (let i = 0; i < PERSON_PIN_FAILURES; i += 1) {
    await h.store.recordPinFailure('budi', NOW - 1000);
  }
  await pageCheck(h);

  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN }), 'resource-exhausted');
  assert.equal(await statusOf(h), 'denied');
  assert.equal((await h.store.getVerification('v-test'))?.pinVerified, false);
});

test('after "no", the answer cannot be turned into "yes"', async () => {
  const h = harness(ON);
  await pageCheck(h);
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: '0000' }), 'permission-denied');

  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: BUDI_PIN }), 'not-found');

  assert.equal(await statusOf(h), 'denied');
});

test('a link works once: after an answer it no longer opens', async () => {
  const h = harness(ON);
  await pageCheck(h);
  await answerApproval(h.deps, { token: TOKEN, answer: 'yes', pin: BUDI_PIN });

  await rejects(() => getApproval(h.deps, { token: TOKEN }), 'not-found');
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN }), 'not-found');
  assert.equal(await statusOf(h), 'confirmed');
});

test('a wrong link token is refused and changes nothing', async () => {
  const h = harness(ON);
  await pageCheck(h);

  await rejects(() => getApproval(h.deps, { token: 'v-test.a-guessed-secret-000000' }), 'not-found');
  await rejects(
    () => answerApproval(h.deps, { token: 'v-test.a-guessed-secret-000000', answer: 'no', pin: BUDI_PIN }),
    'not-found',
  );
  assert.equal(await statusOf(h), 'waiting');
});

test('an expired link is refused', async () => {
  const h = harness(ON);
  await pageCheck(h);
  h.clock.now = EXPIRES + 1;

  await rejects(() => getApproval(h.deps, { token: TOKEN }), 'not-found');
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN }), 'not-found');
  assert.equal(await statusOf(h), 'waiting');
});

test('with the page switched off, even a valid link is refused', async () => {
  const h = harness({ approvalPageEnabled: false });
  await pageCheck(h);

  await rejects(() => getApproval(h.deps, { token: TOKEN }), 'not-found');
  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN }), 'not-found');
  assert.equal(await statusOf(h), 'waiting');
});

test('a check that was started without a page link cannot be answered from the page', async () => {
  const h = harness(ON);
  await waiting(h);

  await rejects(() => answerApproval(h.deps, { token: TOKEN, answer: 'no', pin: BUDI_PIN }), 'not-found');
  assert.equal(await statusOf(h), 'waiting');
});

for (const [name, body] of Object.entries({
  'an answer that is not yes or no': { token: TOKEN, answer: 'maybe', pin: BUDI_PIN },
  'a PIN that is not digits': { token: TOKEN, answer: 'yes', pin: 'abcd' },
  'a missing PIN': { token: TOKEN, answer: 'yes' },
  'an extra field': { token: TOKEN, answer: 'yes', pin: BUDI_PIN, phone: '+12025550199' },
  'a token that is not text': { token: 42, answer: 'yes', pin: BUDI_PIN },
})) {
  test(`${name} is refused and changes nothing`, async () => {
    const h = harness(ON);
    await pageCheck(h);

    await rejects(() => answerApproval(h.deps, body), 'invalid-argument');
    assert.equal(await statusOf(h), 'waiting');
  });
}
