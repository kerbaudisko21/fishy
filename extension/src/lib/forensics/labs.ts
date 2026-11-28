import type { CheckItem, ForensicHint, MediaForensics } from '../types';
import { motionOf } from './video-math';
import { voiceHints, voiceMetrics, voiceMetricsText } from './voice-math';

/*
 * The laptop's own measurements of a voice clip or a set of video frames, turned into what the
 * card shows (hints and rows) and what Gemini is told (a short paragraph).
 */

export interface Lab extends MediaForensics {
  measured: string;
}

/** Voice: pitch, silence, background, breaths and rhythm. `live` is a call (noise filters likely). */
export function voiceLab(samples: Float32Array, rate: number, live: boolean): Lab {
  const m = voiceMetrics(samples, rate);
  const hints: ForensicHint[] = voiceHints(m)
    // On a live call the app's noise filter empties pauses and removes breaths: don't count those.
    .filter((h) => !(live && (h.id === 'empty_silence' || h.id === 'no_breaths')))
    .map((h) => ({ id: h.id, text: h.text, strength: h.strength }));
  const flagged = new Set(hints.map((h) => h.id));
  const rows: CheckItem[] = [];
  if (m.pitchRange !== null) rows.push({ ok: !flagged.has('flat_pitch'), title: 'Pitch movement', detail: `${m.pitchRange.toFixed(1)} semitones around ${Math.round(m.pitchMedian ?? 0)} Hz` });
  if (m.noiseFloor !== null) {
    rows.push({ ok: !flagged.has('empty_silence'), title: 'Room sound between words', detail: m.emptySilence > 0.6 ? `Digitally silent (${Math.round(m.noiseFloor)} dBFS)${live ? '; normal for a call app’s noise filter' : ''}` : `Present (${Math.round(m.noiseFloor)} dBFS)` });
  }
  if (m.backgroundJump !== null) rows.push({ ok: !flagged.has('background_jump'), title: 'Background from pause to pause', detail: `Changes by up to ${Math.round(m.backgroundJump)} dB` });
  if (m.speechSeconds >= 3) rows.push({ ok: !flagged.has('no_breaths'), title: 'Breaths', detail: `${m.breaths} heard in ${Math.round(m.speechSeconds)} s of speech${live ? ' (call apps often filter them out)' : ''}` });
  if (m.pauseVariation !== null) rows.push({ ok: !flagged.has('even_pauses'), title: 'Rhythm of the pauses', detail: m.pauseVariation < 0.12 ? 'Almost the same length every time' : 'Varies, as in natural speech' });
  if (m.speech < 0.15) rows.push({ ok: true, title: 'Too little speech to measure', detail: 'Record again while the person is talking' });
  return {
    hints,
    rows,
    pitch: m.pitch,
    measured: `${voiceMetricsText(m)}${live ? ' This is a live call through a call app, whose noise filter can empty pauses and remove breaths.' : ''}`,
  };
}

/** Video: did the picture move, and did it jump? */
export function videoLab(thumbs: Uint8Array[], seconds: number): Lab & { frozen: boolean } {
  const m = motionOf(thumbs);
  const hints: ForensicHint[] = [];
  const rows: CheckItem[] = [];
  if (m.frozen) {
    hints.push({ id: 'frozen', strength: 2, text: `Nothing moved in ${seconds.toFixed(1)} s: it may be a still picture played as a camera, or a frozen connection.` });
    rows.push({ ok: false, title: 'No movement', detail: `The frames are the same for ${seconds.toFixed(1)} s` });
  } else {
    rows.push({ ok: true, title: 'Movement', detail: `The picture changes between frames, as a live camera does` });
  }
  if (m.jumpAt !== null) {
    hints.push({ id: 'jump', strength: 1, text: `The picture jumps suddenly between frames ${m.jumpAt + 1} and ${m.jumpAt + 2} while the rest are calm, as when a fake face loses tracking.` });
    rows.push({ ok: false, title: 'A sudden jump', detail: `Between frames ${m.jumpAt + 1} and ${m.jumpAt + 2}` });
  }
  const measured = `Motion between frames (0–255): ${m.diffs.map((d) => d.toFixed(1)).join(', ')}.${m.frozen ? ' The frames are practically identical.' : ''}${m.jumpAt !== null ? ` Sudden jump between frames ${m.jumpAt + 1} and ${m.jumpAt + 2}.` : ''}`;
  return { hints, rows, motion: m.diffs, measured, frozen: m.frozen };
}
