import { getAI, getGenerativeModel, InferenceMode, InferenceSource, Schema, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import { redact } from '../redact';
import type { Source, Tactic } from '../types';
import { keywordTactics } from './keywords';
import { cloudBackend } from './provider';

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

export const TACTICS: Tactic[] = ['urgency', 'secrecy', 'authority', 'skips_process', 'new_payment_details'];

const tacticSchema = Schema.object({
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

const PROMPT = `You read workplace messages for social-engineering pressure.
Return every phrase that uses one of these tactics:
- urgency: a tight deadline or rush
- secrecy: asks to keep it quiet or skip telling others
- authority: leans on a senior title or "I approve it myself"
- skips_process: asks to bypass the usual approval or checks
- new_payment_details: asks to pay a new or changed account
Quote the exact words. Return an empty list if there are none.

Message:
`;

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

export interface TacticHit {
  tactic: Tactic;
  quote: string;
}

export type ReaderModel = 'gemini-nano' | 'gemini-cloud' | 'keywords';

export interface TacticResult {
  hits: TacticHit[];
  source: Source;
  model: ReaderModel;
}

export async function readTactics(text: string): Promise<TacticResult> {
  if (!FIREBASE_READY) return { hits: keywordTactics(text), source: 'on_device', model: 'keywords' };

  const local = (await nanoStatus()) === 'available';
  const { onDevice, inCloud } = getModels();
  const result = await (local ? onDevice : inCloud).generateContent(PROMPT + (local ? text : redact(text)));
  const parsed = JSON.parse(result.response.text()) as { tactics?: TacticHit[] };
  const onDeviceRan = result.response.inferenceSource === InferenceSource.ON_DEVICE;
  return {
    hits: (parsed.tactics ?? []).filter((h) => TACTICS.includes(h.tactic) && h.quote?.trim()),
    source: onDeviceRan ? 'on_device' : 'cloud',
    model: onDeviceRan ? 'gemini-nano' : 'gemini-cloud',
  };
}
