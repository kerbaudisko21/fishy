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
  | 'face_score'
  /** The file labels itself as made by AI (Content Credentials or the IPTC source type). */
  | 'ai_label'
  /** An AI generator is named in the file's data. */
  | 'ai_tool'
  /** A photo editor is named in the file's data. */
  | 'edited_with'
  /** Gemini sees signs of AI or editing in a picture, a document page or a video frame. */
  | 'picture_signs'
  /** Gemini hears signs of a cloned or spliced voice. */
  | 'voice_signs'
  /** Gemini sees signs of a deepfake across frames of the video call. */
  | 'video_signs'
  /** Gemini sees signs of AI or editing on a document's page. */
  | 'document_signs'
  /** The laptop's pixel checks found one patch that differs from the rest of the picture. */
  | 'tamper_trace'
  /** The video call didn't move at all for seconds: possibly a still picture played as a camera. */
  | 'video_frozen'
  /** The laptop's voice measurements found something odd (flat pitch, joined recordings…). */
  | 'voice_artifacts'
  /** The face broke up when the caller passed a hand in front of it (the liveness check). */
  | 'liveness_failed'
  /** Gemini sees signs that the website in this tab is a scam or a copy. */
  | 'site_signs'
  /** The website's address imitates a supplier on record. */
  | 'lookalike_site'
  /** The laptop found something risky about the website (look-alike letters, no https with a password…). */
  | 'site_risk';

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

export type MediaKind = 'picture' | 'document' | 'voice' | 'frame' | 'site';
export type MediaAssessment = 'likely_ai' | 'likely_edited' | 'no_clear_signs' | 'unclear';

/** One thing the person chose to check: a picture, a document, a voice clip or a frame of the call. */
export interface GeminiReading {
  assessment: MediaAssessment;
  signs: Array<{ sign: string; where: string }>;
  confidence?: 'low' | 'medium' | 'high';
  /** Website checks: who the page claims to be. */
  claimsToBe?: string;
  source: Source;
  model: 'gemini-nano' | 'gemini-cloud';
}

/** A hint from the laptop's own measurements, in plain words. */
export interface ForensicHint {
  id: string;
  text: string;
  /** 1 a weak hint, 2 a stronger one. */
  strength: 1 | 2;
}

export interface MediaForensics {
  hints: ForensicHint[];
  /** Rows for the Details fold: what was measured and what it came to. */
  rows: CheckItem[];
  /** A see-through overlay of where the picture changed most when re-saved. */
  heatmap?: string;
  /** Voice: pitch every 32 ms (0 = not voiced), for the chart. */
  pitch?: number[];
  /** Video: change between frames, 0–255. */
  motion?: number[];
}

export interface MediaCheck {
  id: string;
  kind: MediaKind;
  /** "receipt.jpg", "Frame of the video call", "10 s of the meeting". */
  name: string;
  /** When it was checked, e.g. "10:44". */
  at: string;
  /** An object URL of the picture, the document's first page or the frame. Stays on the laptop. */
  preview?: string;
  /** Loudness (0–1) for a voice clip's waveform. */
  levels?: number[];
  /** What the file says about itself. */
  facts?: { aiLabel?: string; aiTool?: string; editedWith?: string };
  /** The same facts as rows ("Labelled as made by AI", "No AI or editing marks in the file"). */
  checks: CheckItem[];
  /** What Gemini saw or heard. Undefined while it reads; null when it could not run (see `note`). */
  gemini?: GeminiReading | null;
  /** Gemini Nano's first look on the laptop, when the cloud was asked for a second opinion. */
  firstLook?: GeminiReading;
  /** Why the cloud was asked ("Gemini Nano wasn't sure"). */
  escalation?: string;
  /** What the laptop measured itself, before any AI. */
  forensics?: MediaForensics;
  /** For a video check: the frames, in time order (object URLs). */
  frames?: string[];
  /** A video check made while the caller passed a hand across their face. */
  challenge?: boolean;
  note?: string;
  /** True for the demo story's sample result. */
  demo?: boolean;
}

/** Each section is filled by its check; a screen only opens when its section exists. */
export interface Evidence {
  media?: MediaCheck[];
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
  /** How it is shown, e.g. "Bank Teluk •••• 9032". */
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
  /** The check this call belongs to (live only), for sharing its incident report. */
  checkId?: string;
  target?: CallTarget;
  /** When the call escalates to the next approver (ms since epoch). */
  escalateAt?: number;
  escalatedTo?: string;
  /** What Cloud Functions answered: whether a phone call was placed, or the approval page to use instead. */
  started?: { call: 'placed' | 'not_placed'; reason: string | null; approvalUrl: string | null };
}
