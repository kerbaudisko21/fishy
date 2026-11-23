import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import { redact } from '../redact';
import type { Source, Verdict } from '../types';
import { cloudBackend } from './provider';

/**
 * Step 3 · "Why it's fishy": Gemini turns the red flags into a short explanation in plain words.
 *
 * It gets the signals only (titles and one-line evidence, already masked), never the message.
 * So unlike the tactic reader, it can let Firebase AI Logic choose: PREFER_ON_DEVICE runs Gemini
 * Nano when the laptop has it and falls back to the cloud model when it does not.
 * The input is redacted once more anyway, in case the cloud answers.
 * Without a Firebase config, a fixed sentence built from the same flags stands in and says so.
 */

export type ExplainModel = 'gemini-nano' | 'gemini-cloud' | 'template';

export interface Explanation {
  text: string;
  source: Source;
  model: ExplainModel;
}

export interface ExplainContext {
  /** Who asked, e.g. "Budi Santoso (CFO)". */
  askedBy?: string;
  /** e.g. "Rp 1,250,000,000". */
  amount?: string;
}

let model: GenerativeModel | undefined;

function getModel() {
  if (model) return model;
  const ai = getAI(firebaseApp(), { backend: cloudBackend(import.meta.env.VITE_AI_PROVIDER) });
  model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite',
      generationConfig: { maxOutputTokens: 160, temperature: 0.2 },
    },
  });
  return model;
}

/** The prompt. Exported for tests: it must carry the flags and nothing else from the message. */
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

/** The offline stand-in: the same facts, joined into a sentence. */
export function templateExplanation(verdict: Verdict): string {
  if (verdict.flags.length === 0) {
    return 'No red flags found. For any payment, still confirm with the person on the number on record.';
  }
  const top = verdict.flags.slice(0, 3).map((f) => f.title.toLowerCase());
  const list = top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0];
  const more = verdict.flags.length > 3 ? ` (plus ${verdict.flags.length - 3} more)` : '';
  return `This request shows ${list}${more}. Hold the payment and call the person on the number on record before paying.`;
}

export async function explainVerdict(verdict: Verdict, ctx: ExplainContext = {}): Promise<Explanation> {
  if (!FIREBASE_READY || verdict.flags.length === 0) {
    return { text: templateExplanation(verdict), source: 'on_device', model: 'template' };
  }
  const result = await getModel().generateContent(explainPrompt(verdict, ctx));
  const onDevice = result.response.inferenceSource === InferenceSource.ON_DEVICE;
  const text = result.response.text().trim();
  return {
    text: text || templateExplanation(verdict),
    source: onDevice ? 'on_device' : 'cloud',
    model: onDevice ? 'gemini-nano' : 'gemini-cloud',
  };
}
