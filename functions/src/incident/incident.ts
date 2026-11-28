// The incident report: what happened in one check, as a summary for the finance
// manager and for audit. Never the text of a message.
//
// The report opens from a link the person who ran the check shares. The link
// carries a long random token; only its SHA-256 is kept, so the stored record
// cannot be turned back into a working link. A link works for 7 days.

import { hashToken } from '../call/startCall.ts';
import { RECORD_ID, RequestError } from '../call/ports.ts';
import type { Person, Verification } from '../call/ports.ts';

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

/** What the side panel stored when it created the check, as this module needs it. */
export interface CheckSummary {
  ownerUid: string;
  createdAt: number | null;
  place: 'meet' | 'gmail' | 'paste' | null;
  flags: string[];
  amount: { value: number; currency: string } | null;
  payee: string | null;
}

export interface IncidentLink {
  checkId: string;
  createdAt: number;
  handledAt: number | null;
}

export interface IncidentStore {
  getCheckSummary(checkId: string): Promise<CheckSummary | null>;
  getVerification(checkId: string): Promise<Verification | null>;
  getPerson(personId: string): Promise<Pick<Person, 'name' | 'role'> | null>;
  saveLink(tokenHash: string, link: IncidentLink): Promise<void>;
  getLink(tokenHash: string): Promise<IncidentLink | null>;
  markHandled(tokenHash: string, at: number): Promise<void>;
}

export interface IncidentDeps {
  store: IncidentStore;
  now(): number;
  newToken(): string;
  publicBaseUrl: string;
}

export interface Incident {
  id: string;
  at: number;
  status: 'stopped' | 'confirmed' | 'open';
  where: string;
  targeted: string;
  posedAs: string;
  askedFor: string;
  confirmed: string;
  flags: string[];
  handled: boolean;
}

/**
 * Words for every kind of red flag the side panel can raise (SignalKind in
 * extension/src/lib/types.ts). A test reads that list and fails when a kind has no words here.
 */
export const FLAG_LABEL: Record<string, string> = {
  pressure_tactics: 'Pressure',
  bank_account_changed: 'Bank changed',
  pdf_edited: 'Invoice edited',
  lookalike_sender: 'Look-alike sender',
  sender_auth_failed: 'Sender not authenticated',
  young_domain: 'New domain',
  unsafe_link: 'Unsafe link',
  known_bad_account: 'Known scam account',
  known_bad_domain: 'Known scam domain',
  voice_score: 'Voice score',
  face_score: 'Face score',
  ai_label: 'Labelled as made by AI',
  ai_tool: 'Made with an AI tool',
  edited_with: 'Edited in a photo editor',
  picture_signs: 'Signs of AI or editing in a picture',
  voice_signs: 'Signs of a cloned voice',
  video_signs: 'Signs of a deepfake on the video call',
  document_signs: 'Signs of AI or editing in a document',
  tamper_trace: 'Signs of tampering in the pixels',
  video_frozen: 'Video did not move',
  voice_artifacts: 'Odd measurements in the voice',
  liveness_failed: 'Face broke up in the liveness check',
  site_signs: 'Signs of a scam website',
  lookalike_site: 'Website copies a supplier',
  site_risk: 'Risky website',
  qr_risky: 'Risky QR code',
  lipsync_off: 'Mouth and voice out of step',
  reported_before: 'Reported as a scam before',
};

/** The check's flags as words. A client wrote them, so anything not on the list is left out. */
const flagWords = (flags: string[]): string[] => flags.flatMap((flag) => (Object.hasOwn(FLAG_LABEL, flag) ? [FLAG_LABEL[flag]!] : []));

const PLACE: Record<string, string> = { meet: 'Video meeting', gmail: 'Email', paste: 'Pasted message' };

function fields(data: unknown, allowed: string[]): Record<string, unknown> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', `Send ${allowed.join(' and ')}.`);
  }
  const record = data as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new RequestError('invalid-argument', `Only ${allowed.join(' and ')} are accepted.`);
  }
  return record;
}

const notFound = () => new RequestError('not-found', 'This report link is not valid or has expired.');

/** The person who ran a check gets a link to its report, to pass to the finance manager. */
export async function shareIncident(deps: IncidentDeps, caller: { uid: string } | null, data: unknown): Promise<{ url: string; expiresAt: number }> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  const { checkId } = fields(data, ['checkId']);
  if (typeof checkId !== 'string' || !RECORD_ID.test(checkId)) {
    throw new RequestError('invalid-argument', 'checkId is missing or not valid.');
  }
  const check = await deps.store.getCheckSummary(checkId);
  if (!check) {
    throw new RequestError('not-found', 'There is no such check.');
  }
  if (check.ownerUid !== caller.uid) {
    throw new RequestError('permission-denied', 'Only the person who ran a check may share its report.');
  }
  if (!(await deps.store.getVerification(checkId))) {
    throw new RequestError('failed-precondition', 'There is no report until the real person has been asked.');
  }
  const token = deps.newToken();
  const now = deps.now();
  await deps.store.saveLink(hashToken(token), { checkId, createdAt: now, handledAt: null });
  return { url: `${deps.publicBaseUrl}/incident?id=${token}`, expiresAt: now + LINK_TTL_MS };
}

async function openLink(deps: IncidentDeps, data: unknown) {
  const { id } = fields(data, ['id']);
  if (typeof id !== 'string' || !TOKEN.test(id)) {
    throw notFound();
  }
  const hash = hashToken(id);
  const link = await deps.store.getLink(hash);
  if (!link || deps.now() - link.createdAt > LINK_TTL_MS) {
    throw notFound();
  }
  const [check, verification] = await Promise.all([deps.store.getCheckSummary(link.checkId), deps.store.getVerification(link.checkId)]);
  if (!check || !verification) {
    throw notFound();
  }
  return { hash, link, check, verification };
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

function money(amount: { value: number; currency: string }): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: amount.currency, maximumFractionDigits: 0 }).format(amount.value);
  } catch {
    return `${amount.currency} ${amount.value}`;
  }
}

function answer(verification: Verification, who: string): string {
  switch (verification.status) {
    case 'confirmed':
      return `${who} said yes and entered the right PIN`;
    case 'denied':
      return verification.pinVerified ? `${who} said “not me” and entered the right PIN` : `${who} said “not me”`;
    case 'pin_failed':
      return `${who} did not enter the right PIN`;
    case 'unreached':
      return `${who} could not be reached`;
    default:
      return `Waiting for ${who}`;
  }
}

export async function getIncident(deps: IncidentDeps, data: unknown): Promise<Incident> {
  const { link, check, verification } = await openLink(deps, data);
  const person = await deps.store.getPerson(verification.personId);
  const who = person ? firstName(person.name) : 'The person on record';
  const asked = [check.amount && money(check.amount), check.payee && `to ${check.payee}`].filter(Boolean).join(' ');
  return {
    id: `FI-${link.checkId.slice(0, 6).toUpperCase()}`,
    at: check.createdAt ?? verification.createdAt,
    status: verification.status === 'denied' ? 'stopped' : verification.status === 'confirmed' ? 'confirmed' : 'open',
    where: (check.place && PLACE[check.place]) ?? 'Unknown',
    targeted: 'The finance colleague who ran the check',
    posedAs: person ? `${person.name}, ${person.role}` : 'Unknown',
    askedFor: asked || 'Not stated',
    confirmed: answer(verification, who),
    flags: flagWords(check.flags),
    handled: link.handledAt !== null,
  };
}

export async function markIncidentHandled(deps: IncidentDeps, data: unknown): Promise<{ ok: true }> {
  const { hash } = await openLink(deps, data);
  await deps.store.markHandled(hash, deps.now());
  return { ok: true };
}

/** What was checked and who answered, in order. Built from the records, never from the message. */
export async function getAuditLog(deps: IncidentDeps, data: unknown): Promise<{ entries: Array<{ at: number; what: string }> }> {
  const { link, check, verification } = await openLink(deps, data);
  const person = await deps.store.getPerson(verification.personId);
  const who = person ? `${person.name} (${person.role})` : 'the person on record';
  const entries: Array<{ at: number; what: string }> = [];
  const flags = flagWords(check.flags);
  entries.push({ at: check.createdAt ?? verification.createdAt, what: flags.length ? `Red flags found: ${flags.join(', ')}` : 'Check started with no red flags' });
  entries.push({
    at: verification.createdAt,
    what: verification.callPlaced ? `FISHY called ${who} on the number on record` : `FISHY asked ${who} through the web approval page (no phone call was placed)`,
  });
  if (verification.status !== 'waiting') {
    entries.push({ at: verification.updatedAt, what: answer(verification, who.replace(/ \(.+\)$/, '')) });
  }
  if (link.handledAt !== null) {
    entries.push({ at: link.handledAt, what: 'Marked as handled by the finance manager' });
  }
  return { entries: entries.sort((a, b) => a.at - b.at) };
}
