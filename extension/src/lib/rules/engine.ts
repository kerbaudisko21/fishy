import type { Signal, SignalKind, Verdict } from '../types';

/**
 * Scam patterns, fetched from Remote Config (key: `scam_rules`) so new scam
 * types are blocked without a release. DEFAULT_PATTERNS is the offline fallback
 * and must match remoteconfig.template.json.
 */
export interface ScamPattern {
  name: string;
  /** All of these must be present for the pattern to match. */
  requires: SignalKind[];
  /** Plain-language signs, shown on the Known scams screen. */
  signs?: string[];
  /** What to do about it, in one line. */
  action?: string;
}

export interface RulesConfig {
  version: number;
  /** Signals that make a request fishy on their own. */
  alwaysFishy: SignalKind[];
  /** Weight per signal; a request is fishy when the sum reaches `threshold`. */
  weights: Partial<Record<SignalKind, number>>;
  threshold: number;
  patterns: ScamPattern[];
}

export const DEFAULT_RULES: RulesConfig = {
  version: 16,
  // A file that says it was made by AI, or names the AI tool, is fishy whatever else is true.
  // So is a face that breaks up when a hand passes in front of it.
  alwaysFishy: ['bank_account_changed', 'known_bad_account', 'known_bad_domain', 'unsafe_link', 'ai_label', 'ai_tool', 'liveness_failed'],
  weights: {
    // Per distinct tactic: one ("need it today") stays clear, three or more (urgent + secret + skip approval) is fishy.
    pressure_tactics: 1,
    lookalike_sender: 3,
    sender_auth_failed: 2,
    young_domain: 1,
    pdf_edited: 2,
    voice_score: 1,
    face_score: 1,
    // Gemini's signs: "likely AI" or "likely edited" has strength 3 and is fishy on its own;
    // "something odd" has strength 1 and needs another red flag.
    picture_signs: 1,
    voice_signs: 1,
    video_signs: 1,
    document_signs: 1,
    // The laptop's own measurements: hints that add to other signs.
    tamper_trace: 2,
    video_frozen: 2,
    voice_artifacts: 1,
    site_signs: 1,
    lookalike_site: 3,
    site_risk: 2,
    // Editing software is normal for photos, so it only adds to other signs.
    edited_with: 1,
  },
  threshold: 3,
  patterns: [
    {
      name: 'Vendor bank change',
      requires: ['bank_account_changed'],
      signs: [
        'New account for a supplier you already pay',
        'Asked for in a rush, outside the usual approval',
        'Request comes from a boss or the supplier, not both',
      ],
    },
    { name: 'Executive asks for a secret, urgent transfer', requires: ['pressure_tactics'] },
    { name: 'Lookalike supplier invoice', requires: ['lookalike_sender', 'bank_account_changed'] },
    // What kind of scam the media points to. Names repeat where different evidence means the same scam.
    {
      name: 'Deepfake executive on a video call',
      requires: ['video_signs', 'pressure_tactics'],
      signs: ['A boss or colleague on video asks for an urgent, secret payment', 'The face shows deepfake signs across frames'],
      action: 'Leave the call and phone them back on the number on record.',
    },
    {
      name: 'Deepfake video call',
      requires: ['video_signs'],
      signs: ['The face changes in ways a real face doesn’t, from frame to frame'],
      action: 'Ask them to pass a hand slowly across their face, then check the video again.',
    },
    {
      name: 'Real-time face swap',
      requires: ['liveness_failed'],
      signs: ['The face broke up when a hand passed in front of it'],
      action: 'Don’t act on anything from this call. Phone them back on the number on record.',
    },
    {
      name: 'Fake camera feed',
      requires: ['video_frozen'],
      signs: ['The video didn’t move at all for seconds: possibly a still picture played as a camera'],
      action: 'Ask them to wave or turn their head, then check the video again.',
    },
    {
      name: 'Executive voice clone',
      requires: ['voice_signs', 'pressure_tactics'],
      signs: ['A familiar voice asks for an urgent payment', 'The voice shows signs of being generated'],
      action: 'Hang up and call them back on the number on record.',
    },
    {
      name: 'Cloned voice',
      requires: ['voice_signs'],
      signs: ['The voice shows signs of being generated or cut together'],
      action: 'Ask something only the real person would know, then call them back on the number on record.',
    },
    {
      name: 'Fake website copying a supplier',
      requires: ['lookalike_site'],
      signs: ['The address is a near-copy of a supplier’s on record'],
      action: 'Close it. Type the supplier’s address yourself, or call them on the number on record.',
    },
    {
      name: 'Phishing or fake website',
      requires: ['site_signs'],
      signs: ['The page shows signs of a scam or of copying a real company'],
      action: 'Don’t log in, pay or type anything here. Go to the company’s site by typing its address yourself.',
    },
    {
      name: 'Phishing or fake website',
      requires: ['site_risk'],
      signs: ['The address or the page has tricks scam sites use'],
      action: 'Don’t log in, pay or type anything here. Go to the company’s site by typing its address yourself.',
    },
    {
      name: 'Doctored invoice',
      requires: ['pdf_edited', 'bank_account_changed'],
      signs: ['The invoice was edited after it was made', 'Its bank account differs from the one on record'],
      action: 'Pay only to the account on record, after a call to the supplier.',
    },
    {
      name: 'Forged document',
      requires: ['document_signs'],
      signs: ['The page shows signs of AI or editing'],
      action: 'Ask the sender for the original, and confirm it with them by phone.',
    },
    {
      name: 'AI-made picture or receipt',
      requires: ['ai_label'],
      signs: ['The file itself says it was made by AI'],
      action: 'Don’t accept it as proof. Ask for the original from its source.',
    },
    {
      name: 'AI-made picture or receipt',
      requires: ['ai_tool'],
      signs: ['An AI image generator is named in the file'],
      action: 'Don’t accept it as proof. Ask for the original from its source.',
    },
    {
      name: 'Doctored picture or payment screenshot',
      requires: ['tamper_trace'],
      signs: ['One part of the picture differs from the rest, as when something is pasted in'],
      action: 'Check your own bank account or the original source, never the picture.',
    },
    {
      name: 'Doctored picture or payment screenshot',
      requires: ['picture_signs'],
      signs: ['The picture shows signs of AI or editing'],
      action: 'Check your own bank account or the original source, never the picture.',
    },
  ],
};

/** Display order: hard evidence first, scores last (they are supporting signals, not proof). */
const ORDER: SignalKind[] = [
  'pressure_tactics',
  'bank_account_changed',
  'lookalike_sender',
  'known_bad_account',
  'known_bad_domain',
  'unsafe_link',
  'sender_auth_failed',
  'young_domain',
  'ai_label',
  'ai_tool',
  'pdf_edited',
  'edited_with',
  'picture_signs',
  'voice_signs',
  'liveness_failed',
  'video_signs',
  'video_frozen',
  'document_signs',
  'tamper_trace',
  'voice_artifacts',
  'lookalike_site',
  'site_signs',
  'site_risk',
  'voice_score',
  'face_score',
];

/** The signals that come from checking a picture, document, voice or video. */
const MEDIA_KINDS = new Set<SignalKind>(['ai_label', 'ai_tool', 'edited_with', 'picture_signs', 'voice_signs', 'video_signs', 'document_signs', 'tamper_trace', 'video_frozen', 'voice_artifacts', 'liveness_failed', 'pdf_edited', 'site_signs', 'lookalike_site', 'site_risk']);
/** Between two equally specific scams, the one the media points to comes first (0) — FISHY's focus. */
const mediaFirst = (p: ScamPattern) => (p.requires.some((k) => MEDIA_KINDS.has(k)) ? 0 : 1);

/**
 * Deterministic verdict: the same signals always give the same verdict (R2).
 * No model output decides the verdict; Gemini only produces signals and explanations.
 */
export function decide(signals: Signal[], rules: RulesConfig = DEFAULT_RULES): Verdict {
  const kinds = new Set(signals.map((s) => s.kind));
  const strength = (k: SignalKind) => Math.max(1, ...signals.filter((s) => s.kind === k).map((s) => s.strength ?? 1));
  const score = [...kinds].reduce((sum, k) => sum + (rules.weights[k] ?? 0) * strength(k), 0);
  const hard = rules.alwaysFishy.some((k) => kinds.has(k));
  const level = hard || score >= rules.threshold ? 'fishy' : 'clear';

  const flags = [...signals].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  // The most specific scam first (more required signals); each name once.
  const patterns = [...new Set(
    rules.patterns
      .filter((p) => p.requires.every((k) => kinds.has(k)))
      .sort((a, b) => b.requires.length - a.requires.length || mediaFirst(a) - mediaFirst(b))
      .map((p) => p.name),
  )];

  return { level, flags, patterns, callAdvised: true };
}

/**
 * Rules from Remote Config on top of the built-in ones. A deployed config adds to and adjusts the
 * built-in rules; it never silently drops a signal the extension knows about (an older config
 * without the media signals must not switch them off).
 */
export function mergeRules(remote: Partial<RulesConfig>, base: RulesConfig = DEFAULT_RULES): RulesConfig {
  const remoteNames = new Set((remote.patterns ?? []).map((p) => p.name));
  return {
    version: remote.version ?? base.version,
    alwaysFishy: [...new Set([...base.alwaysFishy, ...(remote.alwaysFishy ?? [])])],
    weights: { ...base.weights, ...(remote.weights ?? {}) },
    threshold: remote.threshold ?? base.threshold,
    patterns: [...(remote.patterns ?? []), ...base.patterns.filter((p) => !remoteNames.has(p.name))],
  };
}

/** The scam pattern behind a name, for its signs and what to do. */
export function patternInfo(name: string, rules: RulesConfig = DEFAULT_RULES): ScamPattern | undefined {
  return rules.patterns.find((p) => p.name === name);
}
