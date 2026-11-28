/*
 * Watch mode decides with Wald's sequential probability ratio test (SPRT), not on one frame:
 *
 *   S = Σ ln LRᵢ   (the evidence from each round, added up)
 *   S ≥ A = ln((1 − β) / α)  → stop: "looks like a deepfake"   (α: false alarms we accept, 1%)
 *   S ≤ B = ln(β / (1 − α))  → stop: "looks real so far"        (β: fakes we accept to miss, 5%)
 *   otherwise                 → watch another round
 *
 * It needs the fewest rounds, on average, for the error rates chosen (Wald, 1945). One odd frame
 * can't raise the alarm: each round's step is capped, so it takes at least two bad rounds.
 */

export const ALPHA = 0.01;
export const BETA = 0.05;
export const UPPER = Math.log((1 - BETA) / ALPHA); // ≈ 4.55
export const LOWER = Math.log(BETA / (1 - ALPHA)); // ≈ −2.99
/** The largest step one round may take, each way. */
const MAX_UP = 2.3;
const MAX_DOWN = 1.2;

export interface SprtState {
  /** The evidence so far, as a log-likelihood ratio. */
  llr: number;
  rounds: number;
  decision: 'watching' | 'fake' | 'real';
}

export const startSprt = (): SprtState => ({ llr: 0, rounds: 0, decision: 'watching' });

/** One round's likelihood ratio added in. After a decision, start again with startSprt(). */
export function sprtStep(s: SprtState, lr: number): SprtState {
  if (s.decision !== 'watching') return s;
  const step = Math.max(-MAX_DOWN, Math.min(MAX_UP, Math.log(Number.isFinite(lr) && lr > 0 ? lr : 1)));
  const llr = s.llr + step;
  return { llr, rounds: s.rounds + 1, decision: llr >= UPPER ? 'fake' : llr <= LOWER ? 'real' : 'watching' };
}

/** Where the evidence sits between the two thresholds, 0 (real) – 1 (fake), for the meter. */
export function sprtPosition(s: SprtState): number {
  return Math.max(0, Math.min(1, (s.llr - LOWER) / (UPPER - LOWER)));
}
