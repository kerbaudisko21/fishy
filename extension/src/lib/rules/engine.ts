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
  version: 1,
  // A file that says it was made by AI, or names the AI tool, is fishy whatever else is true.
  alwaysFishy: ['bank_account_changed', 'known_bad_account', 'known_bad_domain', 'unsafe_link', 'ai_label', 'ai_tool'],
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
  'voice_score',
  'face_score',
];

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
  const patterns = rules.patterns
    .filter((p) => p.requires.every((k) => kinds.has(k)))
    .map((p) => p.name);

  return { level, flags, patterns, callAdvised: true };
}
