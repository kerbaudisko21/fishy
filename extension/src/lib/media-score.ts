import type { MediaCheck } from './types';

/*
 * The FISHY score for one checked picture, document, voice or video frame: 0–100, how strongly the
 * evidence points to AI or tampering. Fixed rules, not a number the model makes up (model-made
 * percentages are not calibrated), so the same evidence always gives the same score:
 *  - what the file says about itself is the strongest evidence (an AI label, an AI tool named);
 *  - Gemini's assessment counts next, more with each sign it can point to;
 *  - an editor named in the file adds a little: editing is normal for photos.
 * It is a measure of the signs found, never a probability that the file is fake.
 */

export type ScoreBand = 'high' | 'some' | 'low' | 'pending';

export interface MediaScore {
  /** 0–100, or null while Gemini is still reading and nothing else is known. */
  score: number | null;
  band: ScoreBand;
  /** Why, strongest first, in plain words. */
  reasons: string[];
}

export function scoreMedia(item: MediaCheck): MediaScore {
  const facts = item.facts ?? {};
  // Each reason with the score it supports; the strongest reasons are told first.
  const found: Array<{ value: number; reason: string }> = [];
  let score = 0;
  const raise = (value: number, reason: string) => {
    score = Math.max(score, value);
    found.push({ value, reason });
  };

  if (facts.aiLabel) raise(95, `${facts.aiLabel}.`);
  if (facts.aiTool) raise(90, `Made with ${facts.aiTool}, named in the file’s data.`);

  const g = item.gemini;
  const where = item.kind === 'voice' ? 'heard' : 'saw';
  if (g) {
    const n = g.signs.length;
    const top = g.signs.slice(0, 3).map((s) => `Gemini ${where}: ${s.sign.replace(/\.$/, '')}${s.where ? ` (${s.where})` : ''}.`);
    // A face that breaks up behind a hand is the strongest sign a live video can give.
    const floor = item.challenge && (g.assessment === 'likely_ai' || g.assessment === 'likely_edited') ? 85 : 0;
    if (g.assessment === 'likely_ai') raise(Math.max(floor, Math.min(95, 70 + 5 * n)), top[0] ?? `Gemini ${where} signs of AI.`);
    else if (g.assessment === 'likely_edited') raise(Math.max(floor, Math.min(90, 65 + 5 * n)), top[0] ?? `Gemini ${where} signs of editing.`);
    else if (g.assessment === 'unclear') raise(n ? Math.min(55, 35 + 5 * n) : 15, top[0] ?? `Gemini couldn’t tell from this ${item.kind === 'voice' ? 'clip' : 'picture'} (too small, quiet or blurry), and found nothing to point at.`);
    else raise(10, `Gemini ${where} no clear signs of AI or editing.`);
    top.slice(1).forEach((r, i) => found.push({ value: score - 1 - i, reason: r }));
  }

  // The laptop's own measurements: a strong hint alone is worth a closer look, two make it fishy.
  const hints = item.forensics?.hints ?? [];
  if (hints.length) {
    // Listed by Google as unsafe: as strong as a file that says it was made by AI.
    if (hints.some((h) => h.id === 'unsafe')) raise(95, 'Google’s list of unsafe sites names this address.');
    const frozen = hints.some((h) => h.id === 'frozen');
    const strong = hints.filter((h) => h.strength === 2).length;
    const local = frozen ? 60 : Math.min(70, (strong ? 45 : 30) + 10 * (hints.length - 1));
    for (const h of hints) if (h.id !== 'unsafe') found.push({ value: local - (h.strength === 2 ? 0 : 5), reason: h.text });
    // They agree with Gemini: more weight; they stand alone: their own score.
    score = g && (g.assessment === 'likely_ai' || g.assessment === 'likely_edited') ? Math.min(98, score + 3 * hints.length) : Math.max(score, local);
  }

  if (facts.editedWith) {
    score = Math.min(100, Math.max(score, 30) + 10);
    found.push({ value: 30, reason: `Edited in ${facts.editedWith}.` });
  }

  const reasons = found.sort((x, y) => y.value - x.value).map((f) => f.reason);
  // Nothing known yet: Gemini is still reading and the file had no marks.
  if (g === undefined && !reasons.length) return { score: null, band: 'pending', reasons: [] };
  if (g === null && !reasons.length) {
    return { score: null, band: 'pending', reasons: [item.kind === 'voice' || item.kind === 'frame' ? 'Gemini didn’t run, and the laptop’s own checks found nothing to point at.' : 'No AI or editing marks in the file; Gemini didn’t run.'] };
  }

  const band: ScoreBand = score >= 60 ? 'high' : score >= 25 ? 'some' : 'low';
  return { score, band, reasons };
}

export const BAND_LABEL: Record<ScoreBand, string> = {
  high: 'Strong signs of AI or tampering',
  some: 'Some signs: take a closer look',
  low: 'No clear signs found',
  pending: 'Not scored yet',
};

/** The word on the stamp for each band. */
export const STAMP: Record<Exclude<ScoreBand, 'pending'>, string> = { high: 'Fishy', some: 'Suspect', low: 'Looks OK' };

/**
 * The score's reasons as one plain sentence that says WHY: "Fishy because the earrings change shape
 * (left ear), and the light on his face doesn't match the room." At most the two strongest reasons.
 */
export function whySentence(s: MediaScore): string {
  if (s.score === null || !s.reasons.length) return '';
  const clean = (r: string) => {
    const text = r.replace(/^Gemini (saw|heard):?\s*/i, '').replace(/\.$/, '');
    // Lower-case the first word to run on in the sentence, but not a name ("Content Credentials").
    const [first, second = ''] = text.split(' ');
    const isName = /^[A-Z]/.test(second) || /^[A-Z]{2,}/.test(first);
    return isName ? text : text.charAt(0).toLowerCase() + text.slice(1);
  };
  const parts = s.reasons.slice(0, 2).map(clean);
  const joined = parts.length > 1 ? `${parts[0]}, and ${parts[1]}` : parts[0];
  if (s.band === 'high') return `Fishy because ${joined}.`;
  if (s.band === 'some') return `Worth a closer look: ${joined}.`;
  return `Looks okay: ${joined}.`;
}
