// The incident report: shared by the person who ran the check, opened by a link,
// a summary only. Never the text of a message.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RequestError } from '../src/call/ports.ts';
import type { Verification } from '../src/call/ports.ts';
import { getAuditLog, getIncident, markIncidentHandled, shareIncident } from '../src/incident/incident.ts';
import type { CheckSummary, IncidentDeps, IncidentLink, IncidentStore } from '../src/incident/incident.ts';
import { NOW } from './helpers.ts';

const OWNER = { uid: 'user-1' };
const TOKEN = 'incident-token-0123456789abcdef';

function verification(overrides: Partial<Verification> = {}): Verification {
  return {
    id: 'check-1',
    personId: 'budi',
    requesterUid: 'user-1',
    status: 'denied',
    choice: 2,
    pinVerified: true,
    pinAttempts: 1,
    callPlaced: false,
    callSkippedReason: 'calls are off',
    approvalTokenHash: null,
    approvalExpiresAt: null,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 30_000,
    ...overrides,
  };
}

function setup(options: { verification?: Verification | null; flags?: string[] } = {}) {
  const check: CheckSummary = {
    ownerUid: 'user-1',
    createdAt: NOW - 120_000,
    place: 'meet',
    flags: options.flags ?? ['pressure_tactics', 'known_bad_account'],
    amount: { value: 186400, currency: 'USD' },
    payee: 'PT Sinar Logistik · Bank Teluk •••• 9032',
  };
  const links = new Map<string, IncidentLink>();
  const store: IncidentStore = {
    async getCheckSummary(id) {
      return id === 'check-1' ? structuredClone(check) : null;
    },
    async getVerification(id) {
      const found = options.verification === undefined ? verification() : options.verification;
      return id === 'check-1' && found ? structuredClone(found) : null;
    },
    async getPerson(id) {
      return id === 'budi' ? { name: 'Budi Santoso', role: 'CFO' } : null;
    },
    async saveLink(hash, link) {
      links.set(hash, structuredClone(link));
    },
    async getLink(hash) {
      return structuredClone(links.get(hash) ?? null);
    },
    async markHandled(hash, at) {
      links.get(hash)!.handledAt = at;
    },
  };
  let now = NOW;
  const deps: IncidentDeps = { store, now: () => now, newToken: () => TOKEN, publicBaseUrl: 'https://fishy-demo.example' };
  return { deps, links, later: (ms: number) => (now += ms) };
}

async function rejects(run: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(run, (error: unknown) => error instanceof RequestError && error.code === code);
}

test('the person who ran the check gets a link; only its hash is kept', async () => {
  const { deps, links } = setup();
  const shared = await shareIncident(deps, OWNER, { checkId: 'check-1' });
  assert.equal(shared.url, `https://fishy-demo.example/incident?id=${TOKEN}`);
  assert.equal(links.size, 1);
  assert.ok(![...links.keys()].includes(TOKEN));
});

test('only the owner may share, and only after the real person was asked', async () => {
  await rejects(() => shareIncident(setup().deps, { uid: 'someone-else' }, { checkId: 'check-1' }), 'permission-denied');
  await rejects(() => shareIncident(setup().deps, null, { checkId: 'check-1' }), 'unauthenticated');
  await rejects(() => shareIncident(setup({ verification: null }).deps, OWNER, { checkId: 'check-1' }), 'failed-precondition');
  await rejects(() => shareIncident(setup().deps, OWNER, { checkId: 'check-1', note: 'hello' }), 'invalid-argument');
});

test('the report says who was impersonated, what was asked and how it ended', async () => {
  const { deps } = setup();
  await shareIncident(deps, OWNER, { checkId: 'check-1' });
  const incident = await getIncident(deps, { id: TOKEN });
  assert.equal(incident.status, 'stopped');
  assert.equal(incident.posedAs, 'Budi Santoso, CFO');
  assert.equal(incident.askedFor, '$186,400 to PT Sinar Logistik · Bank Teluk •••• 9032');
  assert.equal(incident.confirmed, 'Budi said “not me” and entered the right PIN');
  assert.deepEqual(incident.flags, ['Pressure', 'Known scam account']);
  assert.equal(incident.handled, false);
});

test('flags a client made up are left out of the report', async () => {
  const { deps } = setup({ flags: ['pressure_tactics', 'Pay now to account 123'] });
  await shareIncident(deps, OWNER, { checkId: 'check-1' });
  assert.deepEqual((await getIncident(deps, { id: TOKEN })).flags, ['Pressure']);
});

test('marking it handled shows in the report and the audit log', async () => {
  const { deps } = setup();
  await shareIncident(deps, OWNER, { checkId: 'check-1' });
  await markIncidentHandled(deps, { id: TOKEN });
  assert.equal((await getIncident(deps, { id: TOKEN })).handled, true);
  const { entries } = await getAuditLog(deps, { id: TOKEN });
  assert.deepEqual(
    entries.map((e) => e.what),
    [
      'Red flags found: Pressure, Known scam account',
      'FISHY asked Budi Santoso (CFO) through the web approval page (no phone call was placed)',
      'Budi Santoso said “not me” and entered the right PIN',
      'Marked as handled by the finance manager',
    ],
  );
});

test('an unknown or week-old link opens nothing', async () => {
  const { deps, later } = setup();
  await rejects(() => getIncident(deps, { id: TOKEN }), 'not-found');
  await shareIncident(deps, OWNER, { checkId: 'check-1' });
  later(8 * 24 * 60 * 60 * 1000);
  await rejects(() => getIncident(deps, { id: TOKEN }), 'not-found');
  await rejects(() => getIncident(deps, { id: 'short' }), 'not-found');
});
