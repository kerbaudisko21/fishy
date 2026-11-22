// Starts the phone check for a check the side panel created.
//
// The request names a check and a person, never a number. The number on
// record is read here on the server and is never sent back. This is what
// makes "never calls a number taken from the message" a rule the code
// enforces and not a promise.

import { createHash } from 'node:crypto';

import { decideCall } from './gate.ts';
import { RECORD_ID, RequestError } from './ports.ts';
import type { CheckDeps, Verification } from './ports.ts';
import { hookUrl, menuTwiml } from './twiml.ts';

export interface StartResult {
  ok: true;
  call: 'placed' | 'not_placed';
  /** Why no call was placed, when none was. */
  reason: string | null;
  /** The web approval page for this check, when that page is switched on. */
  approvalUrl: string | null;
}

const ALLOWED_FIELDS = ['checkId', 'personId'];
// A person ID starts with a letter, so a phone number can never pass as one.
const PERSON_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function readRequest(data: unknown): { checkId: string; personId: string } {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', 'Send checkId and personId.');
  }
  const fields = data as Record<string, unknown>;
  const extra = Object.keys(fields).filter((key) => !ALLOWED_FIELDS.includes(key));
  if (extra.length > 0) {
    throw new RequestError(
      'invalid-argument',
      'Only checkId and personId are accepted. A phone number can never be supplied.',
    );
  }
  const { checkId, personId } = fields;
  if (typeof personId !== 'string' || !PERSON_ID.test(personId)) {
    throw new RequestError('invalid-argument', 'personId must be the ID of a person in the directory.');
  }
  if (typeof checkId !== 'string' || !RECORD_ID.test(checkId)) {
    throw new RequestError('invalid-argument', 'checkId is missing or not valid.');
  }
  return { checkId, personId };
}

export async function startCall(deps: CheckDeps, caller: { uid: string } | null, data: unknown): Promise<StartResult> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  const { checkId, personId } = readRequest(data);
  const check = await deps.store.getCheck(checkId);
  if (!check) {
    throw new RequestError('not-found', 'There is no such check.');
  }
  if (check.ownerUid !== caller.uid) {
    throw new RequestError('permission-denied', 'Only the person who created a check may start its call.');
  }
  if (await deps.store.getVerification(checkId)) {
    throw new RequestError('failed-precondition', 'This check already has a call. Create a new check to call again.');
  }
  const person = await deps.store.getPerson(personId);
  if (!person) {
    throw new RequestError('not-found', 'That person is not in the directory.');
  }

  const { config } = deps;
  const now = deps.now();

  let approvalUrl: string | null = null;
  let approvalTokenHash: string | null = null;
  if (config.approvalPageEnabled) {
    // The link carries the check ID and a secret. Only a hash of the secret is stored.
    const secret = deps.newToken();
    approvalTokenHash = hashToken(secret);
    approvalUrl = `${config.publicBaseUrl.replace(/\/+$/, '')}/?t=${encodeURIComponent(`${checkId}.${secret}`)}`;
  }

  const decision = decideCall(config, person.phone);
  let reason: string | null = decision.allowed ? null : decision.reason;

  // Save the record before calling: an answer can arrive before placeCall returns.
  const record: Verification = {
    id: checkId,
    personId,
    requesterUid: caller.uid,
    status: 'waiting',
    choice: null,
    pinVerified: false,
    pinAttempts: 0,
    callPlaced: false,
    callSkippedReason: reason,
    approvalTokenHash,
    approvalExpiresAt: approvalTokenHash ? now + config.approvalTtlMs : null,
    createdAt: now,
    updatedAt: now,
  };
  await deps.store.createVerification(record);

  let callPlaced = false;
  if (decision.allowed) {
    if (!(await deps.store.reserveCall(dayKey(now), config.dailyCallCap))) {
      reason = 'daily_cap_reached';
    } else {
      try {
        await deps.calls.placeCall({
          to: person.phone,
          twiml: menuTwiml(config.publicBaseUrl, checkId),
          statusCallbackUrl: hookUrl(config.publicBaseUrl, 'status', checkId),
        });
        callPlaced = true;
      } catch {
        // The provider's error can contain the number, so it is not passed on.
        reason = 'provider_error';
      }
    }
  }

  // With no call and no approval page nobody can answer, so say so at once.
  const nobodyCanAnswer = !callPlaced && approvalUrl === null;
  await deps.store.updateVerification(checkId, (current) => ({
    ...current,
    callPlaced,
    callSkippedReason: reason,
    status: nobodyCanAnswer && current.status === 'waiting' ? 'unreached' : current.status,
    updatedAt: deps.now(),
  }));

  return { ok: true, call: callPlaced ? 'placed' : 'not_placed', reason, approvalUrl };
}
