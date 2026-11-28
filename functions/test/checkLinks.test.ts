// The link check for one email. The side panel sends the links and nothing
// else, and gets back the ones that are on a list.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestError } from '../src/request-error.ts';
import { ADVISORY } from '../src/webrisk/checkLink.ts';
import type { ThreatLookup } from '../src/webrisk/checkLink.ts';
import { checkLinks } from '../src/webrisk/checkLinks.ts';

const USER = { uid: 'user-1' };
const NOW = 1_800_000_000_000;
const LATER = new Date(NOW + 60_000).toISOString();

function lookup(bad: string[] = []) {
  const asked: string[] = [];
  const port: ThreatLookup = {
    async search(uri) {
      asked.push(uri);
      return bad.includes(uri) ? { threatTypes: ['SOCIAL_ENGINEERING'], expireTime: LATER } : { threatTypes: [], expireTime: null };
    },
  };
  return { port, asked };
}

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

test('the links that are on a list come back exactly as they were sent', async () => {
  const { port } = lookup(['https://pay.tessaline-packagings.example/invoice']);

  const result = await checkLinks(
    { lookup: port, now: () => NOW },
    USER,
    { urls: ['https://pay.tessaline-packagings.example/invoice?id=TP-2026-047', 'https://tessaline-packaging.example/about'] },
  );

  assert.deepEqual(result.unsafe, ['https://pay.tessaline-packagings.example/invoice?id=TP-2026-047']);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.advisory, ADVISORY);
});

test('the service is never sent a query string, a fragment or sign-in details', async () => {
  const { port, asked } = lookup();

  await checkLinks(
    { lookup: port, now: () => NOW },
    USER,
    { urls: ['https://user:secret@files.example.org/a/b?invoice=TP-2026-047&token=abc#section'] },
  );

  assert.deepEqual(asked, ['https://files.example.org/a/b']);
});

test('links to the same page are looked up once', async () => {
  const { port, asked } = lookup(['https://files.example.org/a']);

  const result = await checkLinks(
    { lookup: port, now: () => NOW },
    USER,
    { urls: ['https://files.example.org/a?x=1', 'https://files.example.org/a?x=2', 'https://files.example.org/a?x=1'] },
  );

  assert.equal(asked.length, 1);
  assert.deepEqual(result.unsafe, ['https://files.example.org/a?x=1', 'https://files.example.org/a?x=2']);
});

test('with nothing on a list, the answer is empty and carries no advisory', async () => {
  const { port } = lookup();

  const result = await checkLinks({ lookup: port, now: () => NOW }, USER, { urls: ['https://files.example.org/a'] });

  assert.deepEqual(result, { unsafe: [], checked: 1, advisory: null });
});

test('things that are not web addresses are skipped, not looked up', async () => {
  const { port, asked } = lookup();

  const result = await checkLinks(
    { lookup: port, now: () => NOW },
    USER,
    { urls: ['mailto:yoga.permana@tessaline-packaging.example', 'javascript:alert(1)', 'not a link'] },
  );

  assert.deepEqual(asked, []);
  assert.deepEqual(result, { unsafe: [], checked: 0, advisory: null });
});

test('at most 20 different pages are looked up for one email', async () => {
  const { port, asked } = lookup();
  const urls = Array.from({ length: 30 }, (_unused, n) => `https://files.example.org/page-${n}`);

  const result = await checkLinks({ lookup: port, now: () => NOW }, USER, { urls });

  assert.equal(asked.length, 20);
  assert.equal(result.checked, 20);
});

test('a caller who is not signed in is refused', async () => {
  const { port, asked } = lookup();

  await rejects(() => checkLinks({ lookup: port, now: () => NOW }, null, { urls: [] }), 'unauthenticated');
  assert.deepEqual(asked, []);
});

for (const [name, data] of Object.entries({
  'the subject of the email': { urls: [], subject: 'Updated bank details' },
  'the body of the email': { urls: [], body: 'Please pay today' },
  'a list that is not a list': { urls: 'https://files.example.org/a' },
  'an entry that is not text': { urls: [42] },
  'more than 100 links': { urls: Array.from({ length: 101 }, () => 'https://files.example.org/a') },
})) {
  test(`a request with ${name} is refused and nothing is looked up`, async () => {
    const { port, asked } = lookup();

    await rejects(() => checkLinks({ lookup: port, now: () => NOW }, USER, data), 'invalid-argument');
    assert.deepEqual(asked, []);
  });
}

test('if the list service fails, the whole check fails and no link is called safe', async () => {
  const port: ThreatLookup = {
    async search() {
      throw new Error('service is down, project fishy-demo');
    },
  };

  await assert.rejects(
    () => checkLinks({ lookup: port, now: () => NOW }, USER, { urls: ['https://files.example.org/a'] }),
    (error: unknown) => error instanceof Error && !(error instanceof RequestError) && !error.message.includes('fishy-demo'),
  );
});
