// Test doubles for the phone check: a store kept in memory and a call
// provider that only records what it was asked to do. No network, no phone.

import twilio from 'twilio';

import type { CallProvider, CallRequest } from '../src/call/ports.ts';
import type { CheckConfig, CheckDeps } from '../src/call/ports.ts';
import { hashPin } from '../src/call/pin.ts';
import type { CheckRecord, KnownBadKey, Person, Store, Suspects, Verification } from '../src/call/ports.ts';
import { knownBadDoc, knownBadEntry } from '../src/learn/known-bad-doc.ts';
import type { KnownBadDoc } from '../src/learn/known-bad-doc.ts';

export const TEST_AUTH_TOKEN = 'test-auth-token';
export const BASE_URL = 'https://fishy-demo.example';
// A number in the range reserved for fiction. Never a real number.
export const BUDI_PHONE = '+12025550143';
export const BUDI_PIN = '4821';
export const NOW = 1_800_000_000_000;

export function budi(): Person {
  return { id: 'budi', name: 'Budi Prakoso', role: 'CFO', phone: BUDI_PHONE, pin: hashPin(BUDI_PIN, 'test-salt') };
}

/** A check as the side panel creates it: a summary of the request, never its text. */
export function check(overrides: Partial<CheckRecord> = {}): CheckRecord {
  return {
    ownerUid: 'user-1',
    place: 'meet',
    amount: { value: 186400, currency: 'USD' },
    payee: 'Tessaline Packaging · First Example Bank •••• 4416',
    ...overrides,
  };
}

export class MemoryStore implements Store {
  people = new Map<string, Person>([['budi', budi()]]);
  checks = new Map<string, CheckRecord>([['check-1', check()]]);
  verifications = new Map<string, Verification>();
  callsByDay = new Map<string, number>();
  suspects = new Map<string, Suspects>();
  knownBad = new Map<string, KnownBadDoc>();

  async getPerson(personId: string): Promise<Person | null> {
    return this.people.get(personId) ?? null;
  }

  async getCheck(checkId: string): Promise<CheckRecord | null> {
    return structuredClone(this.checks.get(checkId) ?? null);
  }

  async createVerification(verification: Verification): Promise<void> {
    if (this.verifications.has(verification.id)) {
      throw new Error('This check already has a phone check.');
    }
    this.verifications.set(verification.id, structuredClone(verification));
  }

  async getVerification(id: string): Promise<Verification | null> {
    const found = this.verifications.get(id);
    return found ? structuredClone(found) : null;
  }

  async updateVerification(
    id: string,
    change: (current: Verification) => Verification | null,
  ): Promise<Verification | null> {
    const current = this.verifications.get(id);
    if (!current) {
      return null;
    }
    const next = change(structuredClone(current));
    if (next) {
      this.verifications.set(id, structuredClone(next));
    }
    return structuredClone(next ?? current);
  }

  async reserveCall(dayKey: string, dailyCap: number): Promise<boolean> {
    const used = this.callsByDay.get(dayKey) ?? 0;
    if (used >= dailyCap) {
      return false;
    }
    this.callsByDay.set(dayKey, used + 1);
    return true;
  }

  personChecks = new Map<string, number>();
  pinFailures = new Map<string, number[]>();

  async reservePersonCheck(personId: string, hour: string, limit: number): Promise<boolean> {
    const key = `${personId}_${hour}`;
    const used = this.personChecks.get(key) ?? 0;
    if (used >= limit) {
      return false;
    }
    this.personChecks.set(key, used + 1);
    return true;
  }

  async pinFailuresSince(personId: string, since: number): Promise<number> {
    return (this.pinFailures.get(personId) ?? []).filter((t) => t >= since).length;
  }

  async recordPinFailure(personId: string, at: number): Promise<void> {
    this.pinFailures.set(personId, [...(this.pinFailures.get(personId) ?? []), at]);
  }

  async saveSuspects(verificationId: string, suspects: Suspects): Promise<void> {
    this.suspects.set(verificationId, structuredClone(suspects));
  }

  async getSuspects(verificationId: string): Promise<Suspects | null> {
    return structuredClone(this.suspects.get(verificationId) ?? null);
  }

  async raiseKnownBad(entries: readonly KnownBadKey[], now: number, what: string): Promise<void> {
    for (const entry of entries) {
      const { id } = knownBadEntry(entry);
      this.knownBad.set(id, knownBadDoc(this.knownBad.get(id), entry, now, what));
    }
  }

  async protectedValues(): Promise<{ domains: string[]; accounts: string[] }> {
    return {
      domains: ['ombakura-freight.example', 'tessaline-packaging.example', 'sorelka-couriers.example'],
      // One full number and one as the directory shows it: the last four digits.
      accounts: ['4410027731', '9164'],
    };
  }
}

export class RecordingCalls implements CallProvider {
  placed: CallRequest[] = [];
  failWith: Error | null = null;

  async placeCall(request: CallRequest): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.placed.push(request);
  }
}

export function config(overrides: Partial<CheckConfig> = {}): CheckConfig {
  return {
    callsEnabled: false,
    callAllowlist: [],
    dailyCallCap: 20,
    approvalPageEnabled: false,
    publicBaseUrl: BASE_URL,
    approvalTtlMs: 15 * 60 * 1000,
    companyName: 'Ombakura Freight',
    ...overrides,
  };
}

export interface Harness {
  deps: CheckDeps;
  store: MemoryStore;
  calls: RecordingCalls;
  clock: { now: number };
}

export function harness(overrides: Partial<CheckConfig> = {}): Harness {
  const store = new MemoryStore();
  const calls = new RecordingCalls();
  const clock = { now: NOW };
  let tokens = 0;
  const deps: CheckDeps = {
    store,
    calls,
    config: config(overrides),
    now: () => clock.now,
    newToken: () => `secret-token-number-${(tokens += 1)}`,
    validSignature: (signature, url, params) =>
      twilio.validateRequest(TEST_AUTH_TOKEN, signature ?? '', url, params),
  };
  return { deps, store, calls, clock };
}

/** Signs a webhook the way the phone provider does, with its own library. */
export function sign(url: string, params: Record<string, string>): string {
  return twilio.getExpectedTwilioSignature(TEST_AUTH_TOKEN, url, params);
}

/** A phone check that is waiting for an answer, as `startCall` leaves it, with the check it belongs to. */
export async function waiting(h: Harness, overrides: Partial<Verification> = {}): Promise<Verification> {
  const verification: Verification = {
    id: 'v-test',
    personId: 'budi',
    requesterUid: 'user-1',
    status: 'waiting',
    choice: null,
    pinVerified: false,
    pinAttempts: 0,
    callPlaced: true,
    callSkippedReason: null,
    approvalTokenHash: null,
    approvalExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  h.store.checks.set(verification.id, check({ ownerUid: verification.requesterUid }));
  await h.store.createVerification(verification);
  return verification;
}
