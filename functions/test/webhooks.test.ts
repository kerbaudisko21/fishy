// The phone menu: press 1 or 2, then a PIN.
//
// R6: "Pressing 2 turns the banner red." The banner follows the verification
// record, so these tests pin what each key press writes to it.
//
// Requests are signed with the phone provider's own library, the same way the
// provider signs real webhooks.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleVoice } from '../src/call/webhooks.ts';
import { BASE_URL, BUDI_PIN, harness, sign, waiting } from './helpers.ts';
import type { Harness } from './helpers.ts';

type Step = 'menu' | 'choice' | 'pin' | 'status';

function post(h: Harness, step: Step, params: Record<string, string>, options: { id?: string; signature?: string | null; path?: string } = {}) {
  const id = options.id ?? 'v-test';
  const url = `${BASE_URL}/voice/${step}?v=${id}`;
  const signature = options.signature === undefined ? sign(url, params) : (options.signature ?? undefined);
  return handleVoice(h.deps, { path: options.path ?? `/voice/${step}`, query: { v: id }, body: params, signature });
}

async function statusOf(h: Harness, id = 'v-test') {
  return (await h.store.getVerification(id))?.status;
}

test('pressing 2 marks the request as denied', async () => {
  const h = harness();
  await waiting(h);

  const reply = await post(h, 'choice', { Digits: '2' });

  assert.equal(reply.status, 200);
  assert.equal(await statusOf(h), 'denied');
  assert.equal((await h.store.getVerification('v-test'))?.choice, 2);
  assert.match(reply.xml ?? '', /PIN/, 'the PIN is still asked for, to confirm who answered');
});

test('a webhook with a wrong signature is rejected and changes nothing', async () => {
  const h = harness();
  await waiting(h);

  const reply = await post(h, 'choice', { Digits: '2' }, { signature: 'not-a-real-signature' });

  assert.equal(reply.status, 403);
  assert.equal(await statusOf(h), 'waiting');
});

test('a webhook with no signature is rejected and changes nothing', async () => {
  const h = harness();
  await waiting(h);

  const reply = await post(h, 'choice', { Digits: '2' }, { signature: null });

  assert.equal(reply.status, 403);
  assert.equal(await statusOf(h), 'waiting');
});

test('a signature made for another check cannot be reused on this one', async () => {
  const h = harness();
  await waiting(h);
  const stolen = sign(`${BASE_URL}/voice/choice?v=some-other-check`, { Digits: '1' });

  const reply = await post(h, 'choice', { Digits: '1' }, { signature: stolen });

  assert.equal(reply.status, 403);
  assert.equal(await statusOf(h), 'waiting');
});

test('pressing 1 asks for the PIN, and the right PIN confirms the request', async () => {
  const h = harness();
  await waiting(h);

  const afterChoice = await post(h, 'choice', { Digits: '1' });
  assert.equal(await statusOf(h), 'awaiting_pin');
  assert.match(afterChoice.xml ?? '', /voice\/pin\?v=v-test/);

  await post(h, 'pin', { Digits: BUDI_PIN });
  const saved = await h.store.getVerification('v-test');
  assert.equal(saved?.status, 'confirmed');
  assert.equal(saved?.pinVerified, true);
});

test('pressing 1 alone never confirms anything', async () => {
  const h = harness();
  await waiting(h);

  await post(h, 'choice', { Digits: '1' });

  assert.notEqual(await statusOf(h), 'confirmed');
});

test('a wrong PIN never produces a confirmation, and three wrong PINs close the check', async () => {
  const h = harness();
  await waiting(h);
  await post(h, 'choice', { Digits: '1' });

  for (const attempt of [1, 2, 3]) {
    const reply = await post(h, 'pin', { Digits: '0000' });
    assert.notEqual(await statusOf(h), 'confirmed', `attempt ${attempt}`);
    assert.equal(reply.status, 200);
  }
  assert.equal(await statusOf(h), 'pin_failed');

  // The right PIN afterwards is too late.
  await post(h, 'pin', { Digits: BUDI_PIN });
  assert.equal(await statusOf(h), 'pin_failed');
});

test('a PIN sent before any choice does nothing', async () => {
  const h = harness();
  await waiting(h);

  await post(h, 'pin', { Digits: BUDI_PIN });

  assert.equal(await statusOf(h), 'waiting');
});

test('after 2, pressing 1 cannot undo the denial', async () => {
  const h = harness();
  await waiting(h);
  await post(h, 'choice', { Digits: '2' });

  await post(h, 'choice', { Digits: '1' });
  await post(h, 'pin', { Digits: BUDI_PIN });

  assert.equal(await statusOf(h), 'denied');
});

test('after 1, pressing 2 still denies the request', async () => {
  const h = harness();
  await waiting(h);
  await post(h, 'choice', { Digits: '1' });

  await post(h, 'choice', { Digits: '2' });

  assert.equal(await statusOf(h), 'denied');
});

test('after 2, the right PIN marks the denial as verified and a wrong PIN does not', async () => {
  const wrong = harness();
  await waiting(wrong);
  await post(wrong, 'choice', { Digits: '2' });
  await post(wrong, 'pin', { Digits: '0000' });
  assert.equal((await wrong.store.getVerification('v-test'))?.pinVerified, false);
  assert.equal(await statusOf(wrong), 'denied');

  const right = harness();
  await waiting(right);
  await post(right, 'choice', { Digits: '2' });
  await post(right, 'pin', { Digits: BUDI_PIN });
  assert.equal((await right.store.getVerification('v-test'))?.pinVerified, true);
  assert.equal(await statusOf(right), 'denied');
});

test('a key other than 1 or 2 changes nothing and the menu is offered again', async () => {
  const h = harness();
  await waiting(h);

  const reply = await post(h, 'choice', { Digits: '7' });

  assert.equal(await statusOf(h), 'waiting');
  assert.match(reply.xml ?? '', /Press 1/);
});

for (const callStatus of ['no-answer', 'busy', 'failed', 'canceled', 'completed']) {
  test(`a call that ends as "${callStatus}" before any key is pressed is recorded as unreached`, async () => {
    const h = harness();
    await waiting(h);

    const reply = await post(h, 'status', { CallStatus: callStatus });

    assert.equal(reply.status, 204);
    assert.equal(await statusOf(h), 'unreached');
  });
}

test('hanging up after pressing 1 but before the PIN does not confirm', async () => {
  const h = harness();
  await waiting(h);
  await post(h, 'choice', { Digits: '1' });

  await post(h, 'status', { CallStatus: 'completed' });

  assert.equal(await statusOf(h), 'pin_failed');
});

test('the end of the call does not change an answer that was already given', async () => {
  const h = harness();
  await waiting(h);
  await post(h, 'choice', { Digits: '2' });

  await post(h, 'status', { CallStatus: 'completed' });

  assert.equal(await statusOf(h), 'denied');
});

test('the menu step answers with a menu that points at this check', async () => {
  const h = harness();
  await waiting(h);

  const reply = await post(h, 'menu', {});

  assert.equal(reply.status, 200);
  assert.match(reply.xml ?? '', /^<\?xml/);
  assert.match(reply.xml ?? '', /Press 1/);
  assert.ok(reply.xml?.includes(`${BASE_URL}/voice/choice?v=v-test`));
});

test('the same steps work when the function is reached without the /voice prefix', async () => {
  const h = harness();
  await waiting(h);

  const reply = await post(h, 'choice', { Digits: '2' }, { path: '/choice' });

  assert.equal(reply.status, 200);
  assert.equal(await statusOf(h), 'denied');
});

test('an unknown check or an unknown step is refused', async () => {
  const h = harness();
  await waiting(h);

  assert.equal((await post(h, 'choice', { Digits: '2' }, { id: 'missing' })).status, 404);
  const url = `${BASE_URL}/voice/other?v=v-test`;
  const reply = await handleVoice(h.deps, { path: '/voice/other', query: { v: 'v-test' }, body: {}, signature: sign(url, {}) });
  assert.equal(reply.status, 404);
});
