import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import { redact } from '../redact';
import type { Source } from '../types';
import { keywordTactics } from './keywords';
import { cloudBackend } from './provider';
import { parseTactics, tacticInput, tacticSchema, type TacticHit } from './prompts';

export { TACTICS, type TacticHit } from './prompts';

/**
 * Step 1 · Read: tag pressure tactics with Firebase AI Logic hybrid inference.
 *
 * Privacy rule (R1, R7): raw message text may only go to Gemini Nano on the laptop.
 * So we check whether Nano is ready first:
 *  - ready   → ONLY_ON_DEVICE model, raw text, nothing leaves the laptop
 *  - not yet → ONLY_IN_CLOUD model, redacted text only
 * result.response.inferenceSource tells the panel which badge to show.
 * Without a Firebase config (offline dev), a keyword matcher stands in and says so.
 */

let models: { onDevice: GenerativeModel; inCloud: GenerativeModel } | undefined;

function getModels() {
  if (models) return models;
  const ai = getAI(firebaseApp(), { backend: cloudBackend(import.meta.env.VITE_AI_PROVIDER) });
  models = {
    onDevice: getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { promptOptions: { responseConstraint: tacticSchema } },
    }),
    inCloud: getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite',
        generationConfig: { responseMimeType: 'application/json', responseSchema: tacticSchema },
      },
    }),
  };
  return models;
}

/** Prompt API global (Chrome 139+). Typed loosely because @types/chrome does not cover it yet. */
declare const LanguageModel: { availability(): Promise<NanoStatus> } | undefined;

export type NanoStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export async function nanoStatus(): Promise<NanoStatus> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability();
  } catch {
    return 'unavailable';
  }
}

/** Starts the Gemini Nano download. Must be called from a user click (Chrome requires a gesture). */
export function prepareNano(onProgress?: (fraction: number) => void) {
  return getModels().onDevice.initializeDeviceModel((p: number) => onProgress?.(p));
}

export type ReaderModel = 'gemini-nano' | 'gemini-cloud' | 'keywords';

export interface TacticResult {
  hits: TacticHit[];
  source: Source;
  model: ReaderModel;
}

/** The model's hits plus any keyword hit for a tactic the model did not report. */
export function unionHits(model: TacticHit[], keywords: TacticHit[]): TacticHit[] {
  const seen = new Set(model.map((h) => h.tactic));
  return [...model, ...keywords.filter((h) => !seen.has(h.tactic))];
}

export async function readTactics(text: string): Promise<TacticResult> {
  if (!FIREBASE_READY) return { hits: keywordTactics(text), source: 'on_device', model: 'keywords' };

  const local = (await nanoStatus()) === 'available';
  const { onDevice, inCloud } = getModels();
  const result = await (local ? onDevice : inCloud).generateContent(tacticInput(local ? text : redact(text)));
  const onDeviceRan = result.response.inferenceSource === InferenceSource.ON_DEVICE;
  return {
    // The fixed keyword reader always runs too: a message that talks the model out of seeing
    // pressure still trips the keywords (security review M5).
    hits: unionHits(parseTactics(result.response.text()), keywordTactics(text)),
    source: onDeviceRan ? 'on_device' : 'cloud',
    model: onDeviceRan ? 'gemini-nano' : 'gemini-cloud',
  };
}
