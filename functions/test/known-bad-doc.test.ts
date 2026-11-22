// The shape of one entry in the known-bad list, as the side panel reads it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { knownBadDoc, knownBadEntry } from '../src/learn/known-bad-doc.ts';

// 15 January 2027, 15:00 in Jakarta.
const NOW = 1_800_000_000_000;

test('a first sighting starts at a count of 1, with one line about the scam', () => {
  assert.deepEqual(knownBadDoc(undefined, { type: 'domain', value: 'Tessaline-Packagings.EXAMPLE' }, NOW, 'Fake request by email'), {
    kind: 'domain',
    value: 'tessaline-packagings.example',
    display: 'tessaline-packagings.example',
    count: 1,
    events: [{ date: '15 Jan', what: 'Fake request by email' }],
  });
});

test('an account is kept as its last four digits, never the full number', () => {
  const doc = knownBadDoc(undefined, { type: 'account', value: '9920584416' }, NOW, 'Fake request by email');

  assert.equal(doc.value, '4416');
  assert.equal(doc.display, '•••• 4416');
  assert.equal(knownBadEntry({ type: 'account', value: '9920 5844-16' }).id, 'account:4416');
  assert.ok(!JSON.stringify(doc).includes('9920584416'));
});

test('a phone number is kept as digits and shown masked', () => {
  const entry = knownBadEntry({ type: 'number', value: '+12025550162' });

  assert.deepEqual(entry, { id: 'phone:12025550162', kind: 'phone', value: '12025550162', display: '+12 025 •••• 0162' });
});

test('another sighting raises the count and keeps the way the entry was shown', () => {
  const existing = {
    kind: 'account',
    value: '4416',
    display: 'Harbour Example Bank •••• 4416',
    count: 2,
    events: [{ date: '14 Nov', what: 'Fake request by email' }],
  };

  const doc = knownBadDoc(existing, { type: 'account', value: '9920584416' }, NOW, 'Fake request on a video call');

  assert.equal(doc.count, 3);
  assert.equal(doc.display, 'Harbour Example Bank •••• 4416');
  assert.deepEqual(doc.events, [
    { date: '15 Jan', what: 'Fake request on a video call' },
    { date: '14 Nov', what: 'Fake request by email' },
  ]);
});

test('only the five newest lines are kept', () => {
  const events = Array.from({ length: 5 }, (_unused, n) => ({ date: `${n + 1} Nov`, what: 'Fake request by email' }));

  const doc = knownBadDoc({ count: 5, events }, { type: 'domain', value: 'a.example' }, NOW, 'Fake request by email');

  assert.equal(doc.count, 6);
  assert.equal(doc.events.length, 5);
  assert.equal(doc.events[0]?.date, '15 Jan');
  assert.equal(doc.events.at(-1)?.date, '4 Nov');
});

test('a damaged entry is repaired, not trusted', () => {
  const doc = knownBadDoc(
    { count: 'many', display: '', events: [{ date: 3 }, 'text', null, { date: '1 Nov', what: 'Fake request by email' }] },
    { type: 'domain', value: 'a.example' },
    NOW,
    'Fake request by email',
  );

  assert.equal(doc.count, 1);
  assert.equal(doc.display, 'a.example');
  assert.deepEqual(doc.events, [
    { date: '15 Jan', what: 'Fake request by email' },
    { date: '1 Nov', what: 'Fake request by email' },
  ]);
});
