import { getAI, getGenerativeModel, InferenceMode, InferenceSource, type GenerativeModel } from 'firebase/ai';
import { FIREBASE_READY } from '../config';
import { firebaseApp } from '../firebase';
import type { Source } from '../types';
import { secondOpinionReason } from './escalate';
import { CHALLENGE_NOTE, mediaSchema, NANO_IMAGE, parseMedia, PICTURE_PROMPT, VIDEO_PROMPT, VOICE_PROMPT, withMeasurements, type MediaReading } from './prompts';
import { pictureForGemini, toBase64 } from './files';
import { cloudBackend } from './provider';

export { pictureForGemini, toBase64 } from './files';

/*
 * Gemini looks at a picture, a sheet of video-call frames, or listens to a voice clip the person
 * chose to check. Every request carries what the laptop already measured (pixel checks, motion,
 * voice measurements), so the model weighs evidence instead of guessing.
 *  - Pictures and video: Firebase AI Logic hybrid, PREFER_ON_DEVICE. Gemini Nano takes the first
 *    look on the laptop. When it can't tell, isn't sure, or disagrees with the pixel checks, the
 *    cloud model is asked for a second opinion (ONLY_IN_CLOUD) and both readings are shown.
 *  - Voices: the cloud model. Firebase AI Logic cannot send audio to Gemini Nano yet; the laptop's
 *    own measurements are the on-device part.
 * The result is a list of signs, never a verdict on its own.
 */

export interface MediaResult extends MediaReading {
  source: Source;
  model: 'gemini-nano' | 'gemini-cloud';
}

export interface HybridResult {
  /** The reading the score uses: the second opinion when there was one. */
  final: MediaResult;
  /** Gemini Nano's first look, kept when the cloud gave a second opinion. */
  firstLook?: MediaResult;
  /** Why the cloud was asked ("Gemini Nano wasn't sure"), or why it couldn't answer. */
  escalation?: string;
}

export interface ReadOptions {
  /** What the laptop measured, in a short paragraph. */
  measured?: string;
  /** The laptop's own checks found something: a clean first look is then double-checked. */
  localHint?: boolean;
  /** Video: the caller passed a hand across their face during the frames. */
  challenge?: boolean;
}

let models: { hybrid: GenerativeModel; cloud: GenerativeModel } | undefined;

function getModels() {
  if (models) return models;
  const ai = getAI(firebaseApp(), { backend: cloudBackend(import.meta.env.VITE_AI_PROVIDER) });
  const cloudModel = import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';
  const json = { responseMimeType: 'application/json', responseSchema: mediaSchema };
  models = {
    hybrid: getGenerativeModel(ai, {
      mode: InferenceMode.PREFER_ON_DEVICE,
      onDeviceParams: { createOptions: NANO_IMAGE, promptOptions: { responseConstraint: mediaSchema } },
      inCloudParams: { model: cloudModel, generationConfig: json },
    }),
    cloud: getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams: { model: cloudModel, generationConfig: json } }),
  };
  return models;
}

function answer(result: { response: { text(): string; inferenceSource?: InferenceSource } }): MediaResult {
  const onDevice = result.response.inferenceSource === InferenceSource.ON_DEVICE;
  return { ...parseMedia(result.response.text()), source: onDevice ? 'on_device' : 'cloud', model: onDevice ? 'gemini-nano' : 'gemini-cloud' };
}

/** First look (on device when it can), then a cloud second opinion only when the first isn't enough. */
async function lookTwice(prompt: string, picture: Blob, opts: ReadOptions): Promise<HybridResult> {
  const { hybrid, cloud } = getModels();
  const parts = [withMeasurements(prompt, opts.measured), { type: 'inlineData' as const, inlineData: { mimeType: picture.type, data: await toBase64(picture) } }];
  const first = answer(await hybrid.generateContent(parts));
  const reason = secondOpinionReason(first, !!opts.localHint);
  if (!reason) return { final: first };
  try {
    const second = answer(await cloud.generateContent(parts));
    return { final: second, firstLook: first, escalation: reason };
  } catch (e) {
    console.warn('[FISHY] cloud second opinion failed', e);
    return { final: first, escalation: `${reason}, but the cloud second opinion couldn’t be reached` };
  }
}

/** Null without a Firebase config: the laptop's own checks still show, and the panel says Gemini is not set up. */
export async function readPicture(blob: Blob, opts: ReadOptions = {}): Promise<HybridResult | null> {
  if (!FIREBASE_READY) return null;
  return lookTwice(PICTURE_PROMPT, await pictureForGemini(blob), opts);
}

/** A numbered sheet of frames from the video call. */
export async function readFrames(sheet: Blob, opts: ReadOptions = {}): Promise<HybridResult | null> {
  if (!FIREBASE_READY) return null;
  return lookTwice(opts.challenge ? `${VIDEO_PROMPT}\n${CHALLENGE_NOTE}` : VIDEO_PROMPT, await pictureForGemini(sheet), opts);
}

/** A voice clip as 16 kHz WAV, which every Gemini API accepts. */
export async function readVoice(wav: Blob, opts: ReadOptions = {}): Promise<HybridResult | null> {
  if (!FIREBASE_READY) return null;
  const result = await getModels().cloud.generateContent([withMeasurements(VOICE_PROMPT, opts.measured), { type: 'inlineData', inlineData: { mimeType: 'audio/wav', data: await toBase64(wav) } }]);
  return { final: answer(result) };
}
