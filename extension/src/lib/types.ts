// Shared shapes for the four steps: Read → Check → Match → Call.

export type Step = 'read' | 'check' | 'match' | 'call';

/** Where a signal was computed. Shown as the On device / Cloud badge on every step. */
export type Source = 'on_device' | 'cloud';

export type Tactic = 'urgency' | 'secrecy' | 'authority' | 'skips_process' | 'new_payment_details';

export type SignalKind =
  | 'pressure_tactics'
  | 'bank_account_changed'
  | 'pdf_edited'
  | 'lookalike_sender'
  | 'sender_auth_failed'
  | 'young_domain'
  | 'unsafe_link'
  | 'known_bad_account'
  | 'known_bad_domain'
  | 'voice_score'
  | 'face_score';

export interface Signal {
  kind: SignalKind;
  step: Exclude<Step, 'call'>;
  source: Source;
  /** Short plain-language title, e.g. "Bank account changed". */
  title: string;
  /** One line of evidence, e.g. "Differs from the last 6 payments". */
  detail: string;
  /** For scores (voice, face): 0–1. Scores are supporting signals, never a verdict on their own. */
  score?: number;
  /** For known-bad matches: how many confirmed scams it was seen in. */
  seenCount?: number;
  /** How strong the signal is, e.g. the number of distinct pressure tactics. The rules multiply its weight by this (default 1). */
  strength?: number;
}

export type VerdictLevel = 'clear' | 'fishy';

export type CallState = 'idle' | 'ringing' | 'confirmed' | 'not_me' | 'no_answer' | 'escalated';

export interface Verdict {
  level: VerdictLevel;
  /** Red flags, most important first. */
  flags: Signal[];
  /** Pattern names from Remote Config that matched, e.g. "Vendor bank change". */
  patterns: string[];
  /** Always true: even "clear" still advises a call-back for payments. */
  callAdvised: boolean;
}

export interface PaymentRequest {
  id: string;
  place: 'meet' | 'gmail' | 'paste';
  askedBy: { name: string; role: string; directoryId?: string };
  amount: { value: number; currency: string };
  /** Missing when the request named no account yet. */
  payee?: { name: string; bank: string; accountMasked: string };
  dueText?: string;
}

/* ---------- Evidence shown on the detail screens ---------- */

export interface CheckItem {
  ok: boolean;
  title: string;
  detail: string;
}

export interface CaptionLine {
  speaker: string;
  at: string;
  /** The line split into plain text and highlighted tactic phrases. */
  parts: Array<{ text: string; tactic?: Tactic }>;
}

export interface BankAccount {
  bank: string;
  masked: string;
  holder: string;
}

export interface KnownMatchView {
  value: string;
  count: number;
  note?: string;
  events?: Array<{ date: string; what: string }>;
}

/** Each section is filled by its check; a screen only opens when its section exists. */
export interface Evidence {
  tactics?: {
    counts: Array<{ tactic: Tactic; label: string; count: number; example: string }>;
    captions: CaptionLine[];
    window: string;
    pattern?: string;
    rulesVersion: number;
    source: Source;
  };
  email?: {
    sender: { name: string; address: Array<{ text: string; changed?: boolean }> };
    onRecord?: { name: string; address: string; paidTimes: number };
    checks: CheckItem[];
    attachment?: string;
  };
  invoice?: {
    number: string;
    supplier: string;
    from?: string;
    due?: string;
    amount?: { value: number; currency: string };
    newAccount: BankAccount;
    usual?: BankAccount & { months: string[] };
    traces: CheckItem[];
    knownScams: number;
  };
  voice?: {
    speaker: string;
    seconds: number;
    sentAt: string;
    /** 0–1 */
    score: number;
    faceFrames: number;
    /** Loudness of the recorded clip (0–1), for the waveform. */
    levels?: number[];
    /** True when the score is the demo story's, not a real one. */
    demo?: boolean;
  };
  known?: {
    matches: KnownMatchView[];
    pattern?: { name: string; bullets: string[] };
    rulesVersion: number;
    updated: string;
  };
}

export interface DirectoryPerson {
  id: string;
  name: string;
  role: string;
  /** Masked for display only. The full number lives in Firestore and is read by Cloud Functions, never by the panel. */
  phoneMasked: string;
  escalationOrder?: number;
  pinSet: boolean;
}

/** A supplier on record, from Firestore `directoryPublic` (masked values only). */
export interface Supplier {
  id: string;
  name: string;
  /** Registrable domain on record, e.g. sinarlogistik.co.id */
  domain: string;
  contact: { name: string; role: string; phoneMasked: string };
  account: BankAccount;
  /** Months of past payments to the account on record, oldest first, e.g. ["Jun", …, "Nov"]. */
  paidMonths: string[];
}

export type KnownKind = 'account' | 'domain' | 'phone';

/** A confirmed bad detail from Firestore `knownBad`, cached on the laptop. */
export interface KnownBadEntry {
  kind: KnownKind;
  /** Normalised: digits only for accounts and phones, lower-case registrable domain. */
  value: string;
  /** How it is shown, e.g. "Mandiri •••• 9032". */
  display: string;
  count: number;
  events?: Array<{ date: string; what: string }>;
}

/** Someone FISHY may call: an approver or a supplier contact on record. */
export interface CallTarget {
  id: string;
  name: string;
  role: string;
  phoneMasked: string;
}

export interface CallStatus {
  state: CallState;
  target?: CallTarget;
  /** When the call escalates to the next approver (ms since epoch). */
  escalateAt?: number;
  escalatedTo?: string;
  /** What Cloud Functions answered: whether a phone call was placed, or the approval page to use instead. */
  started?: { call: 'placed' | 'not_placed'; reason: string | null; approvalUrl: string | null };
}
