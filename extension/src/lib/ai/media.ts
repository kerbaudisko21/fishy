import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import type { Source } from '../types';
import { mediaSchema, parseMedia, PICTURE_PROMPT, VOICE_PROMPT, type MediaReading } from './prompts';
import { cloudBackend } from './provider';

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

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * A picture Gemini Nano can take: JPEG or PNG, at most 1536 px on its longest side.
 * Other formats the browser can open (WebP, GIF) are redrawn as PNG.
 */
export async function pictureForGemini(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const MAX = 1536;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && (blob.type === 'image/jpeg' || blob.type === 'image/png')) {
    bitmap.close();
    return blob;
  }
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
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
  const mimeType = mime.split(';')[0] || 'audio/webm';
  const result = await getModels().voice.generateContent([VOICE_PROMPT, { type: 'inlineData', inlineData: { mimeType, data: await toBase64(blob) } }]);
  return answer(result);
}
