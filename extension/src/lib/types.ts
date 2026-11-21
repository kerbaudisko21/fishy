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
  payee: { name: string; bank: string; accountMasked: string };
  dueText?: string;
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
