// What the side panel is told about a phone check.
//
// R6: "Pressing 2 turns the banner red." The banner follows this state, so
// "not me" must show the moment 2 is pressed, before any PIN.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleVoice } from '../src/call/webhooks.ts';
import { publicCall } from '../src/call/public-call.ts';
import { BASE_URL, BUDI_PIN, harness, sign, waiting } from './helpers.ts';
import type { Harness } from './helpers.ts';

function press(h: Harness, step: 'choice' | 'pin' | 'status', body: Record<string, string>) {
  const url = `${BASE_URL}/voice/${step}?v=v-test`;
  return handleVoice(h.deps, { path: `/voice/${step}`, query: { v: 'v-test' }, body, signature: sign(url, body) });
}

async function shown(h: Harness) {
  const saved = await h.store.getVerification('v-test');
  assert.ok(saved);
  return publicCall(saved);
}

test('while nobody has answered, the panel shows a call in progress', async () => {
  const h = harness();
  await waiting(h);

  assert.deepEqual(await shown(h), { state: 'ringing', personId: 'budi', placed: true, pinVerified: false, reason: null });
});

test('pressing 2 shows "not me" at once, before any PIN', async () => {
  const h = harness();
  await waiting(h);

  await press(h, 'choice', { Digits: '2' });

  assert.deepEqual(await shown(h), { state: 'not_me', personId: 'budi', placed: true, pinVerified: false, reason: null });
});

test('pressing 2 and then the right PIN keeps "not me" and marks it as PIN-checked', async () => {
  const h = harness();
  await waiting(h);

  await press(h, 'choice', { Digits: '2' });
  await press(h, 'pin', { Digits: BUDI_PIN });

  const call = await shown(h);
  assert.equal(call.state, 'not_me');
  assert.equal(call.pinVerified, true);
});

test('pressing 1 alone confirms nothing: the panel still shows a call in progress', async () => {
  const h = harness();
  await waiting(h);

  await press(h, 'choice', { Digits: '1' });

  assert.equal((await shown(h)).state, 'ringing');
});

test('pressing 1 and then the right PIN shows "confirmed"', async () => {
  const h = harness();
  await waiting(h);

  await press(h, 'choice', { Digits: '1' });
  await press(h, 'pin', { Digits: BUDI_PIN });

  assert.deepEqual(await shown(h), { state: 'confirmed', personId: 'budi', placed: true, pinVerified: true, reason: null });
});

test('three wrong PINs after pressing 1 show "no answer", with the reason, and never "confirmed"', async () => {
  const h = harness();
  await waiting(h);

  await press(h, 'choice', { Digits: '1' });
  await press(h, 'pin', { Digits: '0000' });
  await press(h, 'pin', { Digits: '1111' });
  await press(h, 'pin', { Digits: '2222' });

  const call = await shown(h);
  assert.equal(call.state, 'no_answer');
  assert.equal(call.reason, 'pin_failed');
});

test('a call nobody picked up shows "no answer"', async () => {
  const h = harness();
  await waiting(h);

  await press(h, 'status', { CallStatus: 'no-answer' });

  const call = await shown(h);
  assert.equal(call.state, 'no_answer');
  assert.equal(call.reason, 'no_answer');
});

test('when no call could be placed, the panel is told why', async () => {
  const h = harness();
  await waiting(h, { status: 'unreached', callPlaced: false, callSkippedReason: 'calls_disabled' });

  assert.deepEqual(await shown(h), {
    state: 'no_answer',
    personId: 'budi',
    placed: false,
    pinVerified: false,
    reason: 'calls_disabled',
  });
});

test('when only the approval page is in use, the panel can tell that no call went out', async () => {
  const h = harness({ approvalPageEnabled: true });
  await waiting(h, { callPlaced: false, callSkippedReason: 'calls_disabled' });

  const call = await shown(h);
  assert.equal(call.state, 'ringing');
  assert.equal(call.placed, false);
});

test('the public version never carries the PIN attempts, the link token hash or who asked', async () => {
  const h = harness();
  await waiting(h, { approvalTokenHash: 'a'.repeat(64), approvalExpiresAt: 1, pinAttempts: 2 });

  assert.deepEqual(Object.keys(await shown(h)).sort(), ['personId', 'pinVerified', 'placed', 'reason', 'state']);
});
