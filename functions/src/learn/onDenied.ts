// Shared learning: when the real person says "not me" and confirms it with
// their PIN, the details of that request join the known-bad list, or their
// count goes up.
//
// The PIN is what makes this safe. Without it, anyone who could start a check
// could teach the list anything. And whatever is reported, the company's own
// domain and its suppliers' domains and accounts can never be added.

import type { CheckDeps, CheckRecord, KnownBadKey, Verification } from '../call/ports.ts';
import { knownBadEntry, lastFour } from './known-bad-doc.ts';

/** One plain line for the list. It says where the request was made, never what it said. */
export function describeScam(place: CheckRecord['place']): string {
  if (place === 'meet') {
    return 'Fake request on a video call';
  }
  if (place === 'gmail') {
    return 'Fake request by email';
  }
  return 'Fake request in a message';
}

export async function learnFromDenial(deps: CheckDeps, verification: Verification): Promise<number> {
  if (verification.status !== 'denied' || !verification.pinVerified) {
    return 0;
  }
  const suspects = await deps.store.getSuspects(verification.id);
  if (!suspects) {
    return 0;
  }
  const genuine = await deps.store.protectedValues();
  // The list holds an account as its last four digits, so that is what must never match a genuine one.
  const genuineAccounts = new Set(genuine.accounts.map(lastFour));
  const isGenuineDomain = (domain: string): boolean =>
    genuine.domains.some((known) => domain === known || domain.endsWith(`.${known}`));

  const wanted: KnownBadKey[] = [
    ...suspects.accounts.filter((account) => !genuineAccounts.has(lastFour(account))).map((value) => ({ type: 'account' as const, value })),
    ...suspects.domains.filter((domain) => !isGenuineDomain(domain)).map((value) => ({ type: 'domain' as const, value })),
    ...suspects.numbers.map((value) => ({ type: 'number' as const, value })),
  ];
  // Two details that land on the same entry count as one scam, not two.
  const seen = new Set<string>();
  const entries = wanted.filter((key) => {
    const { id } = knownBadEntry(key);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
  if (entries.length > 0) {
    const check = await deps.store.getCheck(verification.id);
    await deps.store.raiseKnownBad(entries, deps.now(), describeScam(check?.place ?? null));
  }
  return entries.length;
}
