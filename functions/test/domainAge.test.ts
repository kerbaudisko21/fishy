// Domain age: the side panel sends one domain, and gets back how many days ago it was registered.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestError } from '../src/request-error.ts';
import { domainAge } from '../src/rdap/domainAge.ts';
import type { RdapEvent } from '../src/rdap/domainAge.ts';

const USER = { uid: 'user-1' };
const NOW = Date.parse('2026-11-23T12:00:00Z');

function rdap(events: RdapEvent[] | null) {
  const asked: string[] = [];
  return {
    asked,
    deps: {
      now: () => NOW,
      rdap: {
        async events(domain: string) {
          asked.push(domain);
          return events;
        },
      },
    },
  };
}

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

test('a domain registered three days ago is 3 days old', async () => {
  const { deps, asked } = rdap([
    { eventAction: 'last changed', eventDate: '2026-11-22T00:00:00Z' },
    { eventAction: 'registration', eventDate: '2026-11-20T08:00:00Z' },
  ]);

  assert.deepEqual(await domainAge(deps, USER, { domain: 'Sinar-Abadi.co.' }), { days: 3, registered: '20 Nov 2026' });
  assert.deepEqual(asked, ['sinar-abadi.co']);
});

test('no record, or no registration date, is not-found', async () => {
  await rejects(() => domainAge(rdap(null).deps, USER, { domain: 'example.com' }), 'not-found');
  await rejects(() => domainAge(rdap([{ eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' }]).deps, USER, { domain: 'example.com' }), 'not-found');
});

test('only a signed-in caller may ask', async () => {
  await rejects(() => domainAge(rdap([]).deps, null, { domain: 'example.com' }), 'unauthenticated');
});

test('only the domain is accepted, and it must be a domain', async () => {
  const { deps, asked } = rdap([]);
  await rejects(() => domainAge(deps, USER, { domain: 'example.com', body: 'Please pay today' }), 'invalid-argument');
  await rejects(() => domainAge(deps, USER, { domain: 'https://example.com/pay' }), 'invalid-argument');
  await rejects(() => domainAge(deps, USER, { domain: 'localhost' }), 'invalid-argument');
  await rejects(() => domainAge(deps, USER, 'example.com'), 'invalid-argument');
  assert.deepEqual(asked, []);
});
