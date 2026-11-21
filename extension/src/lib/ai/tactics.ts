import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource, Schema } from 'firebase/ai';
import { firebaseApp } from '../firebase';
import { redact } from '../redact';
import type { Source, Tactic } from '../types';

/**
 * Step 1 · Read: tag pressure tactics with Firebase AI Logic hybrid inference.
 *
 * Privacy rule (R1, R7): raw message text may only go to Gemini Nano on the laptop.
 * So we check whether Nano is ready first:
 *  - ready   → ONLY_ON_DEVICE model, raw text, nothing leaves the laptop
 *  - not yet → ONLY_IN_CLOUD model, redacted text only
 * result.response.inferenceSource tells the panel which badge to show.
 */

const TACTICS: Tactic[] = ['urgency', 'secrecy', 'authority', 'skips_process', 'new_payment_details'];

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

const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });

const onDevice = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: { promptOptions: { responseConstraint: tacticSchema } },
});

const inCloud = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', responseSchema: tacticSchema },
  },
});

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
declare const LanguageModel: { availability(): Promise<'available' | 'downloadable' | 'downloading' | 'unavailable'> } | undefined;

export async function nanoStatus() {
  if (typeof LanguageModel === 'undefined') return 'unavailable' as const;
  return LanguageModel.availability();
}

/** Starts the Gemini Nano download. Must be called from a user click (Chrome requires a gesture). */
export function prepareNano(onProgress?: (fraction: number) => void) {
  return onDevice.initializeDeviceModel((p: number) => onProgress?.(p));
}

export interface TacticHit {
  tactic: Tactic;
  quote: string;
}

export async function readTactics(text: string): Promise<{ hits: TacticHit[]; source: Source }> {
  const local = (await nanoStatus()) === 'available';
  const model = local ? onDevice : inCloud;
  const input = local ? text : redact(text);

  const result = await model.generateContent(PROMPT + input);
  const parsed = JSON.parse(result.response.text()) as { tactics?: TacticHit[] };
  const source: Source = result.response.inferenceSource === InferenceSource.ON_DEVICE ? 'on_device' : 'cloud';
  return { hits: parsed.tactics ?? [], source };
}
