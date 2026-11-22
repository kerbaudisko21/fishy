// A project can be deployed before it has a phone account: the secrets then
// hold placeholders and calls are switched off. Starting a check must still
// work, so the approval page can be used.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { startCall } from '../src/call/startCall.ts';
import { twilioCalls } from '../src/call/twilio-calls.ts';
import { BUDI_PHONE, harness } from './helpers.ts';

const USER = { uid: 'user-1' };
const REQUEST = { checkId: 'check-1', personId: 'budi' };

test('with placeholder phone secrets and calls switched off, a check still starts and gets its approval link', async () => {
  const h = harness({ approvalPageEnabled: true });
  const deps = { ...h.deps, calls: twilioCalls('not-set', 'not-set', '') };

  const result = await startCall(deps, USER, REQUEST);

  assert.equal(result.ok, true);
  assert.equal(result.call, 'not_placed');
  assert.equal(result.reason, 'calls_disabled');
  assert.ok(result.approvalUrl);
  assert.equal((await h.store.getVerification('check-1'))?.status, 'waiting');
});

test('with placeholder phone secrets and calls switched on, the call fails closed and the number is not passed on', async () => {
  const h = harness({ callsEnabled: true, callAllowlist: [BUDI_PHONE] });
  const deps = { ...h.deps, calls: twilioCalls('not-set', 'not-set', '') };

  const result = await startCall(deps, USER, REQUEST);

  assert.equal(result.call, 'not_placed');
  assert.equal(result.reason, 'provider_error');
  assert.ok(!JSON.stringify(result).includes(BUDI_PHONE));
  // No call and no approval page: nobody can answer, so it is not left waiting.
  assert.equal((await h.store.getVerification('check-1'))?.status, 'unreached');
});
