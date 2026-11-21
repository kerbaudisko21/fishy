import type { Tactic } from '../types';
import type { TacticHit } from './tactics';

/**
 * Offline stand-in for the tactic reader, used only when Firebase is not configured
 * (local development). The panel labels it "keywords", never as Gemini.
 */
const PATTERNS: Array<[Tactic, RegExp]> = [
  ['urgency', /\b(today|right now|immediately|asap|urgent(?:ly)?|before (?:\d{1,2}(?::\d{2})?\s?(?:am|pm)?|noon|three|two|four|five|end of day|eod)|within the hour|hari ini|segera|sekarang juga)\b[^.,!?]{0,30}/gi],
  ['secrecy', /\b(keep (?:this|it) (?:between us|quiet|confidential|to yourself)|don'?t tell|do not tell|confidential|rahasia(?:kan)?|jangan bilang)[^.,!?]{0,20}/gi],
  ['authority', /\b(i(?:'| a)m authori[sz]ing|i approve|on my authority|as (?:your|the) (?:cfo|ceo|director)|saya yang setujui)[^.,!?]{0,20}/gi],
  ['skips_process', /\b(skip(?:ping)? the (?:usual )?(?:approval|process|checks?)|bypass|no need to (?:check|verify|call)|tanpa approval)[^.,!?]{0,20}/gi],
  ['new_payment_details', /\b(new (?:bank )?account|changed? (?:our|the) bank|updated bank details|rekening baru)[^.,!?]{0,20}/gi],
];

export function keywordTactics(text: string): TacticHit[] {
  const hits: TacticHit[] = [];
  for (const [tactic, re] of PATTERNS) {
    for (const m of text.matchAll(re)) hits.push({ tactic, quote: m[0].trim() });
  }
  return hits;
}
