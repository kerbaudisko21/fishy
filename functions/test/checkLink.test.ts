// The link-safety check. The extension never talks to the list service
// itself: it asks this function, which holds the credentials.
//
// The service sees the address it is asked about, so the function removes
// the query string, the fragment and any sign-in details first, whatever the
// client sent.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestError } from '../src/request-error.ts';
import { ADVISORY, checkLink, expired } from '../src/webrisk/checkLink.ts';
import type { ThreatLookup } from '../src/webrisk/checkLink.ts';

const USER = { uid: 'user-1' };
const NOW = 1_800_000_000_000;

function lookup(answer: { threatTypes: string[]; expireTime: string | null } = { threatTypes: [], expireTime: null }) {
  const asked: string[] = [];
  const port: ThreatLookup = {
    async search(uri) {
      asked.push(uri);
      return answer;
    },
  };
  return { port, asked };
}

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

test('the service is never sent a query string, a fragment or sign-in details', async () => {
  const { port, asked } = lookup();

  const result = await checkLink(
    { lookup: port, now: () => NOW },
    USER,
    { url: 'https://user:secret@files.example.org/a/b?invoice=TP-2026-047&token=abc#section' },
  );

  assert.deepEqual(asked, ['https://files.example.org/a/b']);
  assert.equal(result.checked, 'https://files.example.org/a/b');
});

test('a clean address comes back as no match', async () => {
  const { port } = lookup();

  const result = await checkLink({ lookup: port, now: () => NOW }, USER, { url: 'https://files.example.org/a' });

  assert.deepEqual(result, {
    checked: 'https://files.example.org/a',
    match: false,
    threatTypes: [],
    expireTime: null,
    advisory: null,
  });
});

test('a match comes back with its kinds, its expiry and the required attribution', async () => {
  const expireTime = new Date(NOW + 5 * 60 * 1000).toISOString();
  const { port } = lookup({ threatTypes: ['SOCIAL_ENGINEERING', 'MALWARE'], expireTime });

  const result = await checkLink({ lookup: port, now: () => NOW }, USER, { url: 'https://files.example.org/a' });

  assert.equal(result.match, true);
  assert.deepEqual(result.threatTypes, ['SOCIAL_ENGINEERING', 'MALWARE']);
  assert.equal(result.expireTime, expireTime);
  assert.deepEqual(result.advisory, ADVISORY);
  assert.equal(ADVISORY.text, 'Advisory provided by Google');
  assert.match(ADVISORY.url, /^https:\/\//);
});

test('a match that has already expired is not reported as a match', async () => {
  const { port } = lookup({ threatTypes: ['MALWARE'], expireTime: new Date(NOW - 1000).toISOString() });

  const result = await checkLink({ lookup: port, now: () => NOW }, USER, { url: 'https://files.example.org/a' });

  assert.equal(result.match, false);
});

test('a result is only good until its expiry time', () => {
  const expireTime = new Date(NOW + 1000).toISOString();

  assert.equal(expired({ match: true, expireTime }, NOW), false);
  assert.equal(expired({ match: true, expireTime }, NOW + 1001), true);
  assert.equal(expired({ match: true, expireTime: null }, NOW), false, 'the caller applies its own short limit');
});

test('a caller who is not signed in is refused', async () => {
  const { port, asked } = lookup();

  await rejects(() => checkLink({ lookup: port, now: () => NOW }, null, { url: 'https://files.example.org/a' }), 'unauthenticated');
  assert.deepEqual(asked, []);
});

for (const [name, data] of Object.entries({
  'no address': {},
  'an address that is not text': { url: 42 },
  'an address that is not a web address': { url: 'ftp://files.example.org/a' },
  'a script address': { url: 'javascript:alert(1)' },
  'an address that is too long': { url: `https://files.example.org/${'a'.repeat(2100)}` },
  'extra fields': { url: 'https://files.example.org/a', body: 'the text of the email' },
})) {
  test(`a request with ${name} is refused and nothing is looked up`, async () => {
    const { port, asked } = lookup();

    await rejects(() => checkLink({ lookup: port, now: () => NOW }, USER, data), 'invalid-argument');
    assert.deepEqual(asked, []);
  });
}

test('if the service fails, the answer says the check could not be done, without details', async () => {
  const port: ThreatLookup = {
    async search() {
      throw new Error('quota exceeded for project 12345');
    },
  };

  await assert.rejects(
    () => checkLink({ lookup: port, now: () => NOW }, USER, { url: 'https://files.example.org/a' }),
    (error: unknown) => error instanceof Error && !error.message.includes('12345'),
  );
});
