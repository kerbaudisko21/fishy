import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
// The extension's own logic, so the hosted page reads a message exactly the way the extension does.
import { firstThatWorks, geminiOrKeywords } from '../../extension/src/lib/ai/fallback';
import { keywordTactics } from '../../extension/src/lib/ai/keywords';
import { pictureForGemini, toBase64 } from '../../extension/src/lib/ai/files';
import { explainPrompt, mediaSchema, NANO_IMAGE, NANO_TEXT, parseMedia, parseTactics, PICTURE_PROMPT, tacticInput, tacticSchema, templateExplanation, type MediaReading, type TacticHit } from '../../extension/src/lib/ai/prompts';
import { cloudBackend } from '../../extension/src/lib/ai/provider';
import { redact } from '../../extension/src/lib/redact';
import type { Source, Verdict } from '../../extension/src/lib/types';
import { CONFIGURED, firebase } from './api';

/*
 * "Try FISHY" in a browser, with no extension and no secret: Firebase AI Logic hybrid inference,
 * protected by App Check through reCAPTCHA Enterprise.
 *  - Step 1 · Read: Gemini Nano on this device gets the raw text; without Nano, the cloud model
 *    gets a redacted copy only (the same rule as the extension).
 *  - Explanation: on the red flags only, so Firebase AI Logic may choose (PREFER_ON_DEVICE).
 * If Gemini does not answer (offline, over quota, refused), the keyword list reads the message
 * and the page says so; the explanation is then built from the red flags.
 * Without a Firebase config (local design preview), the keyword reader stands in and says so.
 */

export type Reader = 'gemini-nano' | 'gemini-cloud' | 'keywords';

export interface ReadResult {
  hits: TacticHit[];
  source: Source;
  reader: Reader;
  /** What the cloud model was sent, when it was the cloud. */
  sentToCloud?: string;
  /** Gemini was asked and did not answer, so only the keyword list read the message. */
  geminiFailed?: boolean;
}

declare const LanguageModel: { availability(options?: unknown): Promise<NanoStatus> } | undefined;
export type NanoStatus = 'available' | 'downloadable' | 'downloading' | 'unavailable';

export async function nanoStatus(): Promise<NanoStatus> {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try {
    return await LanguageModel.availability(NANO_TEXT);
  } catch {
    return 'unavailable';
  }
}

let models: { onDevice: GenerativeModel; inCloud: GenerativeModel; explain: GenerativeModel; picture: GenerativeModel } | undefined;

function getModels() {
  if (models) return models;
  const ai = getAI(firebase(), { backend: cloudBackend(import.meta.env.VITE_AI_PROVIDER) });
  const cloudModel = import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';
  models = {
    onDevice: getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { createOptions: NANO_TEXT, promptOptions: { responseConstraint: tacticSchema } },
    }),
    inCloud: getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: { model: cloudModel, generationConfig: { responseMimeType: 'application/json', responseSchema: tacticSchema } },
    }),
    picture: getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: NANO_IMAGE, promptOptions: { responseConstraint: mediaSchema } },
      inCloudParams: { model: cloudModel, generationConfig: { responseMimeType: 'application/json', responseSchema: mediaSchema } },
    }),
    explain: getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: NANO_TEXT },
      inCloudParams: { model: cloudModel, generationConfig: { maxOutputTokens: 160, temperature: 0.2 } },
    }),
  };
  return models;
}

export async function readTactics(text: string): Promise<ReadResult> {
  if (!CONFIGURED) return { hits: keywordTactics(text), source: 'on_device', reader: 'keywords' };
  return geminiOrKeywords<ReadResult>(
    text,
    async () => {
      const local = (await nanoStatus()) === 'available';
      const { onDevice, inCloud } = getModels();
      const redacted = redact(text);
      const cloud = () => inCloud.generateContent(tacticInput(redacted));
      // Raw text goes to Nano only. The cloud model, first choice or fallback, gets the redacted copy.
      const result = await firstThatWorks(local ? [() => onDevice.generateContent(tacticInput(text)), cloud] : [cloud]);
      const onDeviceRan = result.response.inferenceSource === InferenceSource.ON_DEVICE;
      return {
        // The keyword reader always runs too, so a message cannot talk the model out of seeing pressure.
        hits: (() => { const model = parseTactics(result.response.text()); const seen = new Set(model.map((h) => h.tactic)); return [...model, ...keywordTactics(text).filter((h) => !seen.has(h.tactic))]; })(),
        source: onDeviceRan ? 'on_device' : 'cloud',
        reader: onDeviceRan ? 'gemini-nano' : 'gemini-cloud',
        sentToCloud: onDeviceRan ? undefined : redacted,
      };
    },
    (hits) => ({ hits, source: 'on_device', reader: 'keywords', geminiFailed: true }),
  );
}

export interface Explanation {
  text: string;
  source: Source;
  reader: Reader | 'template';
}

export async function explain(verdict: Verdict): Promise<Explanation> {
  const template: Explanation = { text: templateExplanation(verdict), source: 'on_device', reader: 'template' };
  if (!CONFIGURED || verdict.flags.length === 0) return template;
  try {
    const result = await getModels().explain.generateContent(explainPrompt(verdict));
    const onDevice = result.response.inferenceSource === InferenceSource.ON_DEVICE;
    return {
      text: result.response.text().trim() || template.text,
      source: onDevice ? 'on_device' : 'cloud',
      reader: onDevice ? 'gemini-nano' : 'gemini-cloud',
    };
  } catch (e) {
    // The verdict is already on screen: explain it from the red flags instead of failing the check.
    console.warn('[FISHY] Gemini did not explain; built from the red flags', e);
    return template;
  }
}

export interface PictureReading extends MediaReading {
  source: Source;
  reader: 'gemini-nano' | 'gemini-cloud';
}

/** What Gemini sees in a picture: Gemini Nano in this browser when it can, the cloud model otherwise. Null without Firebase. */
export async function readPicture(blob: Blob): Promise<PictureReading | null> {
  if (!CONFIGURED) return null;
  const picture = await pictureForGemini(blob);
  const result = await getModels().picture.generateContent([PICTURE_PROMPT, { type: 'inlineData', inlineData: { mimeType: picture.type, data: await toBase64(picture) } }]);
  const onDevice = result.response.inferenceSource === InferenceSource.ON_DEVICE;
  return { ...parseMedia(result.response.text()), source: onDevice ? 'on_device' : 'cloud', reader: onDevice ? 'gemini-nano' : 'gemini-cloud' };
}
