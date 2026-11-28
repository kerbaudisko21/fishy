// The shapes the phone check works with, and the two things it needs from the
// outside world: somewhere to keep records, and something that places calls.
// Keeping those behind interfaces lets every rule be tested without a
// database or a phone.

export interface PinRecord {
  salt: string;
  hash: string;
}

/** A person in the directory, including the private details only the server may read. */
export interface Person {
  id: string;
  name: string;
  role: string;
  /** The number on record, in international format. Never sent to a client. */
  phone: string;
  pin: PinRecord;
}

/**
 * - `waiting`: the call was placed or the approval link issued; no answer yet
 * - `awaiting_pin`: pressed 1, PIN not entered yet
 * - `confirmed`: pressed 1 and entered the right PIN
 * - `denied`: pressed 2 ("not me")
 * - `pin_failed`: pressed 1 but never entered the right PIN
 * - `unreached`: nobody answered, or there was no way to ask
 */
export type VerificationStatus = 'waiting' | 'awaiting_pin' | 'confirmed' | 'denied' | 'pin_failed' | 'unreached';

/**
 * The record of one phone check. It is kept where no client can read it. What
 * the side panel sees is the short public version in `checks/{id}.call`.
 */
export interface Verification {
  /** The same ID as the check the side panel created. */
  id: string;
  personId: string;
  /** The signed-in user who asked for the check. */
  requesterUid: string;
  status: VerificationStatus;
  choice: 1 | 2 | null;
  /** True once the right PIN was entered, after either choice. */
  pinVerified: boolean;
  pinAttempts: number;
  callPlaced: boolean;
  /** Why no call was placed, when none was. */
  callSkippedReason: string | null;
  /** SHA-256 of the approval page token. The token itself is never stored. */
  approvalTokenHash: string | null;
  approvalExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * What the side panel wrote when it created the check: a summary, never the
 * text of a message. A client wrote it, so every field is checked on the way in.
 */
export interface CheckRecord {
  ownerUid: string;
  place: 'meet' | 'gmail' | 'paste' | null;
  amount: { value: number; currency: string } | null;
  /** For example "Supplier name · Bank •••• 1234". */
  payee: string | null;
}

/** The details of a suspicious request: never the text of a message. */
export interface Suspects {
  accounts: string[];
  domains: string[];
  numbers: string[];
}

export interface KnownBadKey {
  type: 'account' | 'domain' | 'number';
  value: string;
}

export interface Store {
  getPerson(personId: string): Promise<Person | null>;
  /** The check the side panel created, or null if there is none. */
  getCheck(checkId: string): Promise<CheckRecord | null>;
  /** Fails if this check already has a phone check. */
  createVerification(verification: Verification): Promise<void>;
  getVerification(id: string): Promise<Verification | null>;
  /**
   * Reads the record, passes it to `change`, and saves what comes back, as one
   * step. `change` returns null to leave the record as it is. Resolves to the
   * record as it stands afterwards, or null if there is no such record.
   */
  updateVerification(id: string, change: (current: Verification) => Verification | null): Promise<Verification | null>;
  /** Counts one call against the day's cap. False when the cap is already reached. */
  reserveCall(dayKey: string, dailyCap: number): Promise<boolean>;
  /**
   * Counts one check against a person in the current hour. False when they already had `limit`
   * checks this hour: nobody can ring the same person, or open approval links for them, without end.
   */
  reservePersonCheck(personId: string, hourKey: string, limit: number): Promise<boolean>;
  /** Wrong PINs for this person since `since` (ms), over all checks. */
  pinFailuresSince(personId: string, since: number): Promise<number>;
  /** Records one wrong PIN for this person. */
  recordPinFailure(personId: string, at: number): Promise<void>;
  /** Keeps the details of the request a check is about. Clients cannot read them back. */
  saveSuspects(verificationId: string, suspects: Suspects): Promise<void>;
  getSuspects(verificationId: string): Promise<Suspects | null>;
  /**
   * Adds each detail to the known-bad list with a count of 1, or raises its
   * count by 1. `what` is one plain line about the scam, shown beside the entry.
   */
  raiseKnownBad(entries: readonly KnownBadKey[], now: number, what: string): Promise<void>;
  /**
   * The company's own domain and its suppliers' domains and accounts. These can
   * never be marked bad. An account may be the full number or its last four digits.
   */
  protectedValues(): Promise<{ domains: string[]; accounts: string[] }>;
}

export interface CallRequest {
  to: string;
  /** The first menu, sent with the call so nothing has to be fetched when it is answered. */
  twiml: string;
  statusCallbackUrl: string;
}

export interface CallProvider {
  placeCall(request: CallRequest): Promise<void>;
}

export interface CheckConfig {
  /** Master switch for real calls. Off unless deliberately turned on. */
  callsEnabled: boolean;
  /** Numbers that may be called. `*` means any number. */
  callAllowlist: string[];
  dailyCallCap: number;
  /** The web approval page is a demo device. Off unless deliberately turned on. */
  approvalPageEnabled: boolean;
  /** The public address the phone provider and the approval page use, without a trailing slash. */
  publicBaseUrl: string;
  approvalTtlMs: number;
  /** Shown on the approval page, so the approver knows who is asking. */
  companyName: string;
}

export interface CheckDeps {
  store: Store;
  calls: CallProvider;
  config: CheckConfig;
  now(): number;
  newToken(): string;
  /** True when the signature proves the webhook came from the phone provider. */
  validSignature(signature: string | undefined, url: string, params: Record<string, string>): boolean;
}

export type RequestErrorCode =
  | 'unauthenticated'
  | 'invalid-argument'
  | 'not-found'
  | 'permission-denied'
  | 'failed-precondition'
  | 'resource-exhausted';

/** A request the caller got wrong. Safe to show to the caller. */
export class RequestError extends Error {
  code: RequestErrorCode;

  constructor(code: RequestErrorCode, message: string) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
  }
}

/** IDs are short and plain, so they are safe in a URL and can never be a phone number. */
export const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;
