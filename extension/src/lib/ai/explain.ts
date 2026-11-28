import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import type { Source, Verdict } from '../types';
import { explainPrompt, NANO_TEXT, templateExplanation, type ExplainContext } from './prompts';
import { cloudBackend } from './provider';

export { explainPrompt, templateExplanation, type ExplainContext } from './prompts';

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

let model: GenerativeModel | undefined;

function getModel() {
  if (model) return model;
  const ai = getAI(firebaseApp(), { backend: cloudBackend(import.meta.env.VITE_AI_PROVIDER) });
  model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: NANO_TEXT },
    inCloudParams: {
      model: import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite',
      generationConfig: { maxOutputTokens: 160, temperature: 0.2 },
    },
  });
  return model;
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
