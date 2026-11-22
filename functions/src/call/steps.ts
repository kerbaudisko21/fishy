// What each answer does to a verification.
//
// The phone menu and the web approval page both go through these functions,
// so pressing a key on either one has exactly the same effect.
//
// The rules fail closed:
// - "2" (not me) always wins unless the request was already confirmed.
// - "1" alone confirms nothing. Only "1" followed by the right PIN does.
// - Once a check is closed, nothing reopens it.

import { learnFromDenial } from '../learn/onDenied.ts';
import { verifyPin } from './pin.ts';
import type { CheckDeps, Verification } from './ports.ts';

export const MAX_PIN_ATTEMPTS = 3;

export type ChoiceOutcome = 'ask_pin' | 'denied' | 'invalid' | 'closed';

export type PinOutcome = 'confirmed' | 'denied_verified' | 'denied_unverified' | 'retry' | 'pin_failed' | 'closed';

interface Change<Outcome> {
  /** The new record, or null when nothing changes. */
  next: Verification | null;
  outcome: Outcome;
}

export function withChoice(current: Verification, digit: string, now: number): Change<ChoiceOutcome> {
  if (digit !== '1' && digit !== '2') {
    return { next: null, outcome: 'invalid' };
  }
  if (digit === '2') {
    if (current.status === 'waiting' || current.status === 'awaiting_pin') {
      return { next: { ...current, status: 'denied', choice: 2, pinAttempts: 0, updatedAt: now }, outcome: 'denied' };
    }
    if (current.status === 'denied' && !current.pinVerified && current.pinAttempts < MAX_PIN_ATTEMPTS) {
      return { next: null, outcome: 'denied' };
    }
    return { next: null, outcome: 'closed' };
  }
  if (current.status === 'waiting') {
    return { next: { ...current, status: 'awaiting_pin', choice: 1, updatedAt: now }, outcome: 'ask_pin' };
  }
  if (current.status === 'awaiting_pin') {
    return { next: null, outcome: 'ask_pin' };
  }
  return { next: null, outcome: 'closed' };
}

export function withPin(current: Verification, pinIsRight: boolean, now: number): Change<PinOutcome> {
  if (current.status === 'awaiting_pin') {
    if (pinIsRight) {
      return { next: { ...current, status: 'confirmed', pinVerified: true, updatedAt: now }, outcome: 'confirmed' };
    }
    const pinAttempts = current.pinAttempts + 1;
    if (pinAttempts >= MAX_PIN_ATTEMPTS) {
      return { next: { ...current, status: 'pin_failed', pinAttempts, updatedAt: now }, outcome: 'pin_failed' };
    }
    return { next: { ...current, pinAttempts, updatedAt: now }, outcome: 'retry' };
  }
  if (current.status === 'denied' && !current.pinVerified && current.pinAttempts < MAX_PIN_ATTEMPTS) {
    if (pinIsRight) {
      return { next: { ...current, pinVerified: true, updatedAt: now }, outcome: 'denied_verified' };
    }
    const pinAttempts = current.pinAttempts + 1;
    return {
      next: { ...current, pinAttempts, updatedAt: now },
      outcome: pinAttempts >= MAX_PIN_ATTEMPTS ? 'denied_unverified' : 'retry',
    };
  }
  return { next: null, outcome: 'closed' };
}

const CALL_ENDED = new Set(['no-answer', 'busy', 'failed', 'canceled', 'completed']);

/** A call that ended. An answer that was already given is never changed. */
export function withCallStatus(current: Verification, callStatus: string, now: number): Verification | null {
  if (!CALL_ENDED.has(callStatus)) {
    return null;
  }
  if (current.status === 'waiting') {
    return { ...current, status: 'unreached', updatedAt: now };
  }
  if (current.status === 'awaiting_pin') {
    return { ...current, status: 'pin_failed', updatedAt: now };
  }
  return null;
}

export interface Answered<Outcome> {
  outcome: Outcome;
  /** The record after the answer, or null if there is no such check. */
  verification: Verification | null;
}

export async function answerChoice(deps: CheckDeps, id: string, digit: string): Promise<Answered<ChoiceOutcome>> {
  const seen: { outcome: ChoiceOutcome } = { outcome: 'closed' };
  const verification = await deps.store.updateVerification(id, (current) => {
    const change = withChoice(current, digit, deps.now());
    seen.outcome = change.outcome;
    return change.next;
  });
  return { outcome: seen.outcome, verification };
}

export async function answerPin(deps: CheckDeps, id: string, pin: string): Promise<Answered<PinOutcome>> {
  const before = await deps.store.getVerification(id);
  if (!before) {
    return { outcome: 'closed', verification: null };
  }
  const person = await deps.store.getPerson(before.personId);
  const pinIsRight = person ? verifyPin(pin, person.pin) : false;

  const seen: { outcome: PinOutcome } = { outcome: 'closed' };
  const verification = await deps.store.updateVerification(id, (current) => {
    const change = withPin(current, pinIsRight, deps.now());
    seen.outcome = change.outcome;
    return change.next;
  });
  if (seen.outcome === 'denied_verified' && verification) {
    // "Not me", confirmed with the PIN: the details of this request join the
    // known-bad list. This outcome happens once per check, so nothing is
    // counted twice. A failure here must not undo the answer just recorded.
    try {
      await learnFromDenial(deps, verification);
    } catch {
      // The answer stands. The list simply did not learn from this one.
    }
  }
  return { outcome: seen.outcome, verification };
}
