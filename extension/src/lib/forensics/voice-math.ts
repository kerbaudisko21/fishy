import { percentile } from './grid';

/*
 * Measures a voice clip on the laptop, no AI: the numbers a sound engineer would look at first.
 *
 *  - pitch range: people move their voice up and down by many semitones as they talk; some
 *    synthetic voices stay unusually flat.
 *  - silence: a room always has a little noise between words. Silence that is digitally empty
 *    (far below any microphone's noise floor) suggests generated or cut-together audio. Call apps'
 *    noise filters can also do this, so it is only a hint.
 *  - background jumps: when the background noise level changes sharply from one pause to the next,
 *    the clip may have been joined from several recordings.
 *  - rhythm: pauses of almost exactly the same length, over and over, are a tell of some
 *    text-to-speech voices.
 *  - breaths: a person speaking breathes in every few seconds, a soft noisy sound just before
 *    speech starts. Many cloned voices never breathe (Layton et al., 2024). Call apps' noise
 *    filters remove breaths too, so this counts only for recordings, and weakly.
 *  - spectral flatness and the share of high frequencies are reported for the record.
 *
 * Each hint is a sign, not proof. The numbers also go to Gemini with the clip, so its listening is
 * grounded in measurements.
 */

export interface VoiceMetrics {
  seconds: number;
  /** Share of the clip with speech in it, 0–1. */
  speech: number;
  /** Pitch, Hz, once every 32 ms where the voice is voiced (0 where it isn't). */
  pitch: number[];
  /** Middle 80% of the pitch range, in semitones. */
  pitchRange: number | null;
  /** Median pitch, Hz. */
  pitchMedian: number | null;
  /** Noise floor in the pauses, dBFS (the quieter, the emptier). */
  noiseFloor: number | null;
  /** Share of pause frames that are digitally empty (below −80 dBFS). */
  emptySilence: number;
  /** Largest difference in background level between two pauses, dB. */
  backgroundJump: number | null;
  /** How much the pause lengths vary (coefficient of variation), when there are enough pauses. */
  pauseVariation: number | null;
  pauses: number;
  /** Breaths heard just before speech starts. */
  breaths: number;
  /** Seconds of speech in the clip. */
  speechSeconds: number;
  /** Mean spectral flatness of the speech, 0 (tonal) – 1 (noise-like). */
  flatness: number | null;
  /** Share of the speech's energy above 4 kHz. */
  highBand: number | null;
}

export interface VoiceHint {
  id: 'flat_pitch' | 'empty_silence' | 'background_jump' | 'even_pauses' | 'no_breaths';
  text: string;
  /** 1 a weak hint, 2 a stronger one. */
  strength: 1 | 2;
}

const FRAME = 512;
const HOP = 512;
const EMPTY_DB = -80;

const db = (rms: number) => 20 * Math.log10(Math.max(1e-9, rms));

/** In-place radix-2 FFT (re, im of length a power of two). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const cr = Math.cos(ang * k);
        const ci = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}

/** Pitch of one frame by autocorrelation, 70–400 Hz, or 0 when the frame isn't clearly voiced. */
export function pitchOf(frame: Float32Array, rate: number): number {
  const minLag = Math.floor(rate / 400);
  const maxLag = Math.min(frame.length - 1, Math.ceil(rate / 70));
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy < 1e-6) return 0;
  let bestLag = 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < frame.length; i++) sum += frame[i] * frame[i + lag];
    const r = sum / energy;
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  return best > 0.5 && bestLag ? rate / bestLag : 0;
}

function spectrum(frame: Float32Array) {
  const re = new Float64Array(FRAME);
  const im = new Float64Array(FRAME);
  for (let i = 0; i < FRAME; i++) re[i] = (frame[i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)));
  fft(re, im);
  const power = new Float64Array(FRAME / 2);
  for (let k = 1; k < FRAME / 2; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  return power;
}

export function voiceMetrics(samples: Float32Array, rate: number): VoiceMetrics {
  const frames: Float32Array[] = [];
  for (let at = 0; at + FRAME <= samples.length; at += HOP) frames.push(samples.subarray(at, at + FRAME));
  const levels = frames.map((f) => db(Math.sqrt(f.reduce((s, v) => s + v * v, 0) / f.length)));
  const seconds = samples.length / rate;
  const loud = percentile(levels, 95);
  // Speech: within 30 dB of the loud parts and above a floor.
  const isSpeech = levels.map((l) => l > Math.max(-55, loud - 30));
  const speechShare = isSpeech.filter(Boolean).length / Math.max(1, frames.length);

  const pitch = frames.map((f, i) => (isSpeech[i] ? pitchOf(f, rate) : 0));
  const voiced = pitch.filter((p) => p > 0);
  const pitchRange = voiced.length >= 20 ? 12 * Math.log2(percentile(voiced, 90) / percentile(voiced, 10)) : null;
  const pitchMedian = voiced.length >= 20 ? percentile(voiced, 50) : null;

  // Pauses: runs of non-speech frames at least ~150 ms long, between speech.
  const runs: Array<{ start: number; end: number }> = [];
  let start = -1;
  isSpeech.forEach((s, i) => {
    if (!s && start < 0) start = i;
    if ((s || i === isSpeech.length - 1) && start >= 0) {
      const end = s ? i : i + 1;
      if (end - start >= Math.ceil((0.15 * rate) / HOP) && start > 0 && s) runs.push({ start, end });
      start = -1;
    }
  });
  const pauseFrames = runs.flatMap((r) => levels.slice(r.start, r.end));
  const noiseFloor = pauseFrames.length ? percentile(pauseFrames, 50) : null;
  const emptySilence = pauseFrames.length ? pauseFrames.filter((l) => l < EMPTY_DB).length / pauseFrames.length : 0;
  const pauseLevels = runs.map((r) => percentile(levels.slice(r.start, r.end), 50));
  const backgroundJump = pauseLevels.length >= 2 ? Math.max(...pauseLevels) - Math.min(...pauseLevels) : null;
  const lengths = runs.map((r) => r.end - r.start);
  const meanLen = lengths.reduce((s, v) => s + v, 0) / Math.max(1, lengths.length);
  const pauseVariation = lengths.length >= 4 ? Math.sqrt(lengths.reduce((s, v) => s + (v - meanLen) ** 2, 0) / lengths.length) / meanLen : null;

  // Breaths: in the last 0.6 s of a pause, frames clearly above the pause's own level that are
  // noise-like (many zero crossings, a flat spectrum): air, not a voice.
  const zcr = (f: Float32Array) => {
    let c = 0;
    for (let i = 1; i < f.length; i++) if ((f[i] >= 0) !== (f[i - 1] >= 0)) c++;
    return c / f.length;
  };
  const flatOf = (f: Float32Array) => {
    const p = spectrum(f);
    let logSum = 0;
    let sum = 0;
    for (let k = 1; k < p.length; k++) {
      logSum += Math.log(p[k] + 1e-12);
      sum += p[k] + 1e-12;
    }
    return Math.exp(logSum / (p.length - 1)) / (sum / (p.length - 1));
  };
  const tail = Math.ceil((0.6 * rate) / HOP);
  let breaths = 0;
  for (const r of runs) {
    const base = percentile(levels.slice(r.start, r.end), 30);
    const from = Math.max(r.start, r.end - tail);
    const breathy = [];
    for (let i = from; i < r.end; i++) if (levels[i] > base + 6 && levels[i] > -70 && zcr(frames[i]) > 0.2 && flatOf(frames[i]) > 0.2) breathy.push(i);
    if (breathy.length >= 2) breaths++;
  }

  let flatSum = 0;
  let highSum = 0;
  let n = 0;
  const highBin = Math.round((4000 / (rate / 2)) * (FRAME / 2));
  frames.forEach((f, i) => {
    if (!isSpeech[i]) return;
    const p = spectrum(f);
    let logSum = 0;
    let sum = 0;
    let high = 0;
    for (let k = 1; k < p.length; k++) {
      const v = p[k] + 1e-12;
      logSum += Math.log(v);
      sum += v;
      if (k >= highBin) high += v;
    }
    const count = p.length - 1;
    flatSum += Math.exp(logSum / count) / (sum / count);
    highSum += high / sum;
    n++;
  });

  return {
    seconds,
    speech: speechShare,
    pitch,
    pitchRange,
    pitchMedian,
    noiseFloor,
    emptySilence,
    backgroundJump,
    pauseVariation,
    pauses: runs.length,
    breaths,
    speechSeconds: (isSpeech.filter(Boolean).length * HOP) / rate,
    flatness: n ? flatSum / n : null,
    highBand: n && rate > 8000 ? highSum / n : null,
  };
}

/** The measurements that are worth a person's attention, as plain-language hints. */
export function voiceHints(m: VoiceMetrics): VoiceHint[] {
  const out: VoiceHint[] = [];
  if (m.speech < 0.15 || m.seconds < 3) return out;
  if (m.pitchRange !== null && m.pitchRange < 2.5) {
    out.push({ id: 'flat_pitch', strength: 1, text: `The voice barely moves up or down (about ${m.pitchRange.toFixed(1)} semitones; people usually move 4 or more).` });
  }
  if (m.pauses >= 2 && m.emptySilence > 0.6) {
    out.push({ id: 'empty_silence', strength: 1, text: 'The pauses between words are digitally silent, with no room sound. Generated or edited audio does this; so can a call app’s noise filter.' });
  }
  if (m.backgroundJump !== null && m.pauses >= 2 && m.backgroundJump >= 15 && m.emptySilence < 0.6) {
    out.push({ id: 'background_jump', strength: 2, text: `The background noise changes by ${Math.round(m.backgroundJump)} dB from one pause to another, as when separate recordings are joined.` });
  }
  if (m.speechSeconds >= 6 && m.pauses >= 2 && m.breaths === 0 && m.emptySilence < 0.6) {
    out.push({ id: 'no_breaths', strength: 1, text: `No breath could be heard in ${Math.round(m.speechSeconds)} s of speech. Cloned voices often don’t breathe; a call app’s noise filter can remove breaths too.` });
  }
  if (m.pauseVariation !== null && m.pauseVariation < 0.12) {
    out.push({ id: 'even_pauses', strength: 1, text: 'The pauses are almost exactly the same length each time, which is unusual for a person speaking freely.' });
  }
  return out;
}

/** The measurements in one short paragraph for Gemini. */
export function voiceMetricsText(m: VoiceMetrics): string {
  const f = (v: number | null, digits = 1, unit = '') => (v === null ? 'not measured' : `${v.toFixed(digits)}${unit}`);
  return [
    `Clip: ${m.seconds.toFixed(1)} s, speech in ${Math.round(m.speech * 100)}% of it, ${m.pauses} pauses.`,
    `Pitch: median ${f(m.pitchMedian, 0, ' Hz')}, range ${f(m.pitchRange, 1, ' semitones')}.`,
    `Pauses: noise floor ${f(m.noiseFloor, 0, ' dBFS')}, ${Math.round(m.emptySilence * 100)}% digitally silent, background level varies by ${f(m.backgroundJump, 0, ' dB')}, pause length variation ${f(m.pauseVariation, 2)}.`,
    `Breaths heard before speech: ${m.breaths} in ${m.speechSeconds.toFixed(1)} s of speech.`,
    `Spectrum: flatness ${f(m.flatness, 2)}, energy above 4 kHz ${m.highBand === null ? 'not measured' : `${Math.round(m.highBand * 100)}%`}.`,
  ].join(' ');
}
