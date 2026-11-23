import { Schema } from 'firebase/ai';
import { redact } from '../redact';
import type { Tactic, Verdict } from '../types';

/*
 * What FISHY asks Gemini, and nothing else: no Firebase app, no settings, no browser APIs.
 * The extension and the hosted "Try FISHY" page both use these, so they ask the same questions.
 */

export const TACTICS: Tactic[] = ['urgency', 'secrecy', 'authority', 'skips_process', 'new_payment_details'];

export interface TacticHit {
  tactic: Tactic;
  quote: string;
}

/** The JSON shape the tactic reader must answer in, on device and in the cloud. */
export const tacticSchema = Schema.object({
  properties: {
    tactics: Schema.array({
      items: Schema.object({
        properties: {
          tactic: Schema.enumString({ enum: TACTICS }),
          quote: Schema.string(),
        },
      }),
    }),
  },
});

export const TACTIC_PROMPT = `You read workplace messages for social-engineering pressure.
Return every phrase that uses one of these tactics:
- urgency: a tight deadline or rush
- secrecy: asks to keep it quiet or skip telling others
- authority: leans on a senior title or "I approve it myself"
- skips_process: asks to bypass the usual approval or checks
- new_payment_details: asks to pay a new or changed account
Quote the exact words. Return an empty list if there are none.

Message:
`;

/** Reads the model's JSON answer and keeps only well-formed hits. */
export function parseTactics(json: string): TacticHit[] {
  const parsed = JSON.parse(json) as { tactics?: TacticHit[] };
  return (parsed.tactics ?? []).filter((h) => TACTICS.includes(h.tactic) && h.quote?.trim());
}

export interface ExplainContext {
  /** Who asked, e.g. "Budi Santoso (CFO)". */
  askedBy?: string;
  /** e.g. "Rp 1,250,000,000". */
  amount?: string;
}

/** The explanation prompt: the flags and nothing else from the message, redacted once more. */
export function explainPrompt(verdict: Verdict, ctx: ExplainContext = {}): string {
  const flags = verdict.flags.map((f) => `- ${f.title}: ${f.detail}`).join('\n');
  const patterns = verdict.patterns.length ? `Matches the known scam pattern: ${verdict.patterns.join(', ')}.\n` : '';
  const request = [ctx.askedBy && `Asked by: ${ctx.askedBy}.`, ctx.amount && `Amount: ${ctx.amount}.`].filter(Boolean).join(' ');
  return redact(`You help a company finance employee who was just asked to send money.
In at most 3 short sentences of plain English, say why this request is risky and what to do.
Say "call the person on the number on record before paying". Do not invent facts beyond the list.
Do not say it is certainly a scam; say what the signs are.

${request}
${patterns}Red flags:
${flags}`);
}

/** The offline stand-in for the explanation: the same facts, joined into a sentence. */
export function templateExplanation(verdict: Verdict): string {
  if (verdict.flags.length === 0) {
    return 'No red flags found. For any payment, still confirm with the person on the number on record.';
  }
  const top = verdict.flags.slice(0, 3).map((f) => f.title.toLowerCase());
  const list = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0];
  const more = verdict.flags.length > 3 ? ` (plus ${verdict.flags.length - 3} more)` : '';
  return `This request shows ${list}${more}. Hold the payment and call the person on the number on record before paying.`;
}
