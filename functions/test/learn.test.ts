// Shared learning: each "not me" adds to the known-bad list.
//
// Only a "not me" confirmed with the right PIN counts. Otherwise anyone who
// could start a check could fill the list with whatever they liked.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { answerApproval } from '../src/approve/approval.ts';
import { RequestError } from '../src/call/ports.ts';
import { handleVoice } from '../src/call/webhooks.ts';
import { reportSuspects } from '../src/learn/suspects.ts';
import { BASE_URL, BUDI_PIN, check, harness, NOW, sign, waiting } from './helpers.ts';
import type { Harness } from './helpers.ts';

const USER = { uid: 'user-1' };
const SUSPECTS = { accounts: ['9920584416'], domains: ['tessaline-packagings.example'], numbers: ['+12025550162'] };

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

function press(h: Harness, step: 'choice' | 'pin', digits: string) {
  const url = `${BASE_URL}/voice/${step}?v=v-test`;
  const body = { Digits: digits };
  return handleVoice(h.deps, { path: `/voice/${step}`, query: { v: 'v-test' }, body, signature: sign(url, body) });
}

async function ready(suspects: unknown = SUSPECTS): Promise<Harness> {
  const h = harness();
  // The list keeps an account as its last four digits, as the side panel matches it.
  h.store.knownBad.set('account:4416', {
    kind: 'account',
    value: '4416',
    display: 'Harbour Example Bank •••• 4416',
    count: 2,
    events: [{ date: '14 Nov', what: 'Fake request by email' }],
  });
  await waiting(h);
  await reportSuspects(h.deps, USER, { checkId: 'v-test', suspects });
  return h;
}

const count = (h: Harness, key: string): number | undefined => h.store.knownBad.get(key)?.count;

test('a "not me" with the right PIN raises the count of a known account from 2 to 3 and adds the new details', async () => {
  const h = await ready();

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  assert.equal(count(h, 'account:4416'), 3);
  assert.equal(count(h, 'domain:tessaline-packagings.example'), 1);
  assert.equal(count(h, 'phone:12025550162'), 1);
});

test('a "not me" without the PIN does not change the list', async () => {
  const h = await ready();

  await press(h, 'choice', '2');

  assert.equal(count(h, 'account:4416'), 2);
  assert.equal(h.store.knownBad.size, 1);
});

test('a "not me" followed by a wrong PIN does not change the list', async () => {
  const h = await ready();

  await press(h, 'choice', '2');
  await press(h, 'pin', '0000');

  assert.equal(count(h, 'account:4416'), 2);
  assert.equal(h.store.knownBad.size, 1);
});

test('a confirmed request adds nothing', async () => {
  const h = await ready();

  await press(h, 'choice', '1');
  await press(h, 'pin', BUDI_PIN);

  assert.equal(count(h, 'account:4416'), 2);
  assert.equal(h.store.knownBad.size, 1);
});

test('entering the PIN a second time does not count the same scam twice', async () => {
  const h = await ready();

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);
  await press(h, 'pin', BUDI_PIN);

  assert.equal(count(h, 'account:4416'), 3);
});

test('the approval page teaches the list in the same way as the phone', async () => {
  const h = harness({ approvalPageEnabled: true });
  await waiting(h, { approvalTokenHash: createHash('sha256').update('page-token-0123456789').digest('hex'), approvalExpiresAt: NOW + 60_000 });
  await reportSuspects(h.deps, USER, { checkId: 'v-test', suspects: SUSPECTS });

  await answerApproval(h.deps, { token: 'v-test.page-token-0123456789', answer: 'no', pin: BUDI_PIN });

  assert.equal(count(h, 'domain:tessaline-packagings.example'), 1);
});

test('the company’s own domain and its suppliers’ domains and accounts can never be added', async () => {
  const h = await ready({
    accounts: ['4410027731', '9920584416'],
    domains: ['tessaline-packaging.example', 'portal.ombakura-freight.example', 'tessaline-packagings.example'],
    numbers: [],
  });

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  assert.deepEqual([...h.store.knownBad.keys()].sort(), ['account:4416', 'domain:tessaline-packagings.example']);
});

test('what is stored is the detail, how to show it, its count and one line per scam, and nothing else', async () => {
  const h = await ready();

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  assert.deepEqual(h.store.knownBad.get('domain:tessaline-packagings.example'), {
    kind: 'domain',
    value: 'tessaline-packagings.example',
    display: 'tessaline-packagings.example',
    count: 1,
    events: [{ date: '15 Jan', what: 'Fake request on a video call' }],
  });
});

test('details are tidied before they are kept', async () => {
  const h = await ready({ accounts: ['9920 5844-16'], domains: ['  Tessaline-Packagings.EXAMPLE '], numbers: ['+1 (202) 555-0162'] });

  assert.deepEqual(h.store.suspects.get('v-test'), SUSPECTS);
});

test('only the person who started the check may report details for it', async () => {
  const h = harness();
  await waiting(h);

  await rejects(() => reportSuspects(h.deps, { uid: 'someone-else' }, { checkId: 'v-test', suspects: SUSPECTS }), 'permission-denied');
  await rejects(() => reportSuspects(h.deps, null, { checkId: 'v-test', suspects: SUSPECTS }), 'unauthenticated');
  await rejects(() => reportSuspects(h.deps, USER, { checkId: 'missing', suspects: SUSPECTS }), 'not-found');
});

for (const [name, suspects] of Object.entries({
  'message text in place of an account': { accounts: ['please pay this today'], domains: [], numbers: [] },
  'a sentence in place of a domain': { accounts: [], domains: ['Dear Laras, please find attached'], numbers: [] },
  'a number that is not in international format': { accounts: [], domains: [], numbers: ['0812345'] },
  'too many entries': { accounts: Array.from({ length: 11 }, (_unused, n) => `99205844${String(n).padStart(2, '0')}`), domains: [], numbers: [] },
  'an extra field': { accounts: [], domains: [], numbers: [], body: 'the whole email' },
  'a list that is not a list': { accounts: '9920584416', domains: [], numbers: [] },
})) {
  test(`a report with ${name} is refused and nothing is kept`, async () => {
    const h = harness();
    await waiting(h);

    await rejects(() => reportSuspects(h.deps, USER, { checkId: 'v-test', suspects }), 'invalid-argument');
    assert.equal(h.store.suspects.size, 0);
  });
}

test('details cannot be added to a check that is already closed', async () => {
  const h = harness();
  await waiting(h, { status: 'confirmed', choice: 1, pinVerified: true });

  await rejects(() => reportSuspects(h.deps, USER, { checkId: 'v-test', suspects: SUSPECTS }), 'invalid-argument');
});

test('an account is listed by its last four digits, and keeps the bank name it already had', async () => {
  const h = await ready();

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  const entry = h.store.knownBad.get('account:4416');
  assert.equal(entry?.value, '4416');
  assert.equal(entry?.display, 'Harbour Example Bank •••• 4416');
  assert.ok(!JSON.stringify([...h.store.knownBad.values()]).includes('9920584416'), 'the full account number is not published');
});

test('a phone number is listed as digits and shown masked', async () => {
  const h = await ready();

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  const entry = h.store.knownBad.get('phone:12025550162');
  assert.equal(entry?.kind, 'phone');
  assert.equal(entry?.display, '+12 025 •••• 0162');
});

test('the newest scam is listed first, with where it was asked for', async () => {
  const h = await ready();
  h.store.checks.set('v-test', check({ place: 'gmail' }));

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  assert.deepEqual(h.store.knownBad.get('account:4416')?.events, [
    { date: '15 Jan', what: 'Fake request by email' },
    { date: '14 Nov', what: 'Fake request by email' },
  ]);
});

test('two accounts that end in the same four digits count as one', async () => {
  const h = await ready({ accounts: ['9920584416', '1100004416'], domains: [], numbers: [] });

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  assert.equal(count(h, 'account:4416'), 3);
});

test('a supplier account on record is protected even when only its last four digits are on record', async () => {
  const h = await ready({ accounts: ['7302259164'], domains: [], numbers: [] });

  await press(h, 'choice', '2');
  await press(h, 'pin', BUDI_PIN);

  assert.equal(h.store.knownBad.has('account:9164'), false);
});

test('details can be reported before the call starts', async () => {
  const h = harness();

  const reply = await reportSuspects(h.deps, USER, { checkId: 'check-1', suspects: SUSPECTS });

  assert.deepEqual(reply, { kept: 3 });
  assert.deepEqual(h.store.suspects.get('check-1'), SUSPECTS);
});
