// The web approval page's backend.
//
// Trial phone accounts can only call a few verified numbers, so a judge
// cannot receive the call. The page asks the same two things as the phone:
// yes or no, then the PIN. It goes through the same steps as the phone, so
// the result is the same.
//
// It is a demo device. The link is handed to the person who asked for the
// check, which would let them answer their own request, so the page is off
// unless it is deliberately switched on. The PIN is still required.
//
// Every refusal looks the same from outside: a wrong link, an expired link, a
// used link and a switched-off page all answer "not found".

import { timingSafeEqual } from 'node:crypto';

import { isPinFormat } from '../call/pin.ts';
import { RequestError } from '../call/ports.ts';
import type { CheckDeps, CheckRecord, Verification } from '../call/ports.ts';
import { hashToken } from '../call/startCall.ts';
import { answerChoice, answerPin, MAX_PIN_ATTEMPTS } from '../call/steps.ts';

/** What the page shows the approver. The shape is the one web/src/api.ts expects. */
export interface ApprovalView {
  approverName: string;
  company: string;
  amount: { value: number; currency: string };
  payee: string;
  context: string;
  expiresAt: number;
}

// The link token: the check ID, a dot, then the secret.
const TOKEN = /^([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{16,128})$/;

function notFound(): RequestError {
  return new RequestError('not-found', 'This link is not valid, has expired or was already used.');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function stillOpen(verification: Verification): boolean {
  if (verification.status === 'waiting' || verification.status === 'awaiting_pin') {
    return true;
  }
  // After "no", the PIN may still be entered to confirm who answered.
  return verification.status === 'denied' && !verification.pinVerified && verification.pinAttempts < MAX_PIN_ATTEMPTS;
}

/** The check this link opens. Throws "not found" for anything else. */
async function open(deps: CheckDeps, token: unknown): Promise<Verification> {
  const parts = typeof token === 'string' ? TOKEN.exec(token) : null;
  const id = parts?.[1];
  const secret = parts?.[2];
  if (!deps.config.approvalPageEnabled || !id || !secret) {
    throw notFound();
  }
  const verification = await deps.store.getVerification(id);
  if (!verification?.approvalTokenHash || verification.approvalExpiresAt === null) {
    throw notFound();
  }
  if (deps.now() > verification.approvalExpiresAt || !sameHash(hashToken(secret), verification.approvalTokenHash)) {
    throw notFound();
  }
  if (!stillOpen(verification)) {
    throw notFound();
  }
  return verification;
}

function fieldsOf(data: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', `Send ${allowed.join(', ')}.`);
  }
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !allowed.includes(key))) {
    throw new RequestError('invalid-argument', `Only ${allowed.join(', ')} are accepted.`);
  }
  if (typeof fields.token !== 'string') {
    throw new RequestError('invalid-argument', 'token is missing.');
  }
  return fields;
}

function contextFor(place: CheckRecord['place']): string {
  if (place === 'meet') {
    return 'Asked for on a video call';
  }
  if (place === 'gmail') {
    return 'Asked for by email';
  }
  return 'Asked for in a message';
}

export async function getApproval(deps: CheckDeps, data: unknown): Promise<ApprovalView> {
  const fields = fieldsOf(data, ['token']);
  const verification = await open(deps, fields.token);
  const [person, check] = await Promise.all([
    deps.store.getPerson(verification.personId),
    deps.store.getCheck(verification.id),
  ]);
  return {
    approverName: person?.name ?? '',
    company: deps.config.companyName,
    amount: check?.amount ?? { value: 0, currency: 'USD' },
    payee: check?.payee ?? 'No account named',
    context: contextFor(check?.place ?? null),
    expiresAt: verification.approvalExpiresAt ?? deps.now(),
  };
}

export async function answerApproval(deps: CheckDeps, data: unknown): Promise<{ ok: true }> {
  const fields = fieldsOf(data, ['token', 'answer', 'pin']);
  const { answer, pin } = fields;
  if (answer !== 'yes' && answer !== 'no') {
    throw new RequestError('invalid-argument', 'answer must be yes or no.');
  }
  if (typeof pin !== 'string' || !isPinFormat(pin)) {
    throw new RequestError('invalid-argument', 'pin must be four to six digits.');
  }
  const verification = await open(deps, fields.token);

  // The same two steps as the phone: the key, then the PIN.
  const choice = await answerChoice(deps, verification.id, answer === 'yes' ? '1' : '2');
  if (choice.outcome === 'closed' || choice.outcome === 'invalid') {
    // For example "yes" after "no": an answer that was given is never turned round.
    throw notFound();
  }
  const { outcome } = await answerPin(deps, verification.id, pin);
  if (outcome === 'confirmed' || outcome === 'denied_verified') {
    return { ok: true };
  }
  if (outcome === 'closed') {
    throw notFound();
  }
  throw new RequestError('permission-denied', 'That PIN is not right.');
}
