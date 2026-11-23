import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import type { Source } from '../types';
import { mediaSchema, parseMedia, PICTURE_PROMPT, VOICE_PROMPT, type MediaReading } from './prompts';
import { audioForGemini, pictureForGemini, toBase64 } from './files';
import { cloudBackend } from './provider';

export { pictureForGemini, toBase64 } from './files';

/*
 * Gemini looks at a picture or listens to a voice clip the person chose to check.
 *  - Pictures: Firebase AI Logic hybrid, PREFER_ON_DEVICE. Gemini Nano reads the picture on the
 *    laptop when Chrome has it (JPEG or PNG); otherwise the cloud model gets it.
 *  - Voices: the cloud model. Firebase AI Logic cannot send audio to Gemini Nano yet.
 * The result is a list of signs, never a verdict on its own: the rules decide, and the call to the
 * real person is the final word.
 */

export interface MediaResult extends MediaReading {
  source: Source;
  model: 'gemini-nano' | 'gemini-cloud';
}

let models: { picture: GenerativeModel; voice: GenerativeModel } | undefined;

function getModels() {
  if (models) return models;
  const ai = getAI(firebaseApp(), { backend: cloudBackend(import.meta.env.VITE_AI_PROVIDER) });
  const cloudModel = import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';
  const json = { responseMimeType: 'application/json', responseSchema: mediaSchema };
  models = {
    picture: getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: { expectedInputs: [{ type: 'image' }, { type: 'text' }] }, promptOptions: { responseConstraint: mediaSchema } },
      inCloudParams: { model: cloudModel, generationConfig: json },
    }),
    voice: getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: cloudModel, generationConfig: json } }),
  };
  return models;
}

function answer(result: { response: { text(): string; inferenceSource?: InferenceSource } }): MediaResult {
  const onDevice = result.response.inferenceSource === InferenceSource.ON_DEVICE;
  return { ...parseMedia(result.response.text()), source: onDevice ? 'on_device' : 'cloud', model: onDevice ? 'gemini-nano' : 'gemini-cloud' };
}

/** Null without a Firebase config: the hard evidence still shows, and the panel says Gemini is not set up. */
export async function readPicture(blob: Blob): Promise<MediaResult | null> {
  if (!FIREBASE_READY) return null;
  const picture = await pictureForGemini(blob);
  const result = await getModels().picture.generateContent([PICTURE_PROMPT, { type: 'inlineData', inlineData: { mimeType: picture.type, data: await toBase64(picture) } }]);
  return answer(result);
}

export async function readVoice(blob: Blob, mime: string): Promise<MediaResult | null> {
  if (!FIREBASE_READY) return null;
  // WAV, which every Gemini API accepts (Chrome records WebM, which the Developer API refuses).
  const wav = await audioForGemini(new Blob([blob], { type: mime }));
  const result = await getModels().voice.generateContent([VOICE_PROMPT, { type: 'inlineData', inlineData: { mimeType: 'audio/wav', data: await toBase64(wav) } }]);
  return answer(result);
}
