import { describe, expect, it } from 'vitest';
import { secondOpinionReason } from '../ai/escalate';
import { largestCluster, placeOf } from './grid';
import { fitQuality, readJpeg } from './jpeg';
import { voiceLab, videoLab } from './labs';
import { elaFromPixels, gridPatternFromPixels, noiseFromPixels } from './picture-math';
import { motionOf } from './video-math';
import { fft, pitchOf, voiceHints, voiceMetrics } from './voice-math';

/** A w×h RGBA picture filled by `f(x, y)` → grey level. */
function picture(w: number, h: number, f: (x: number, y: number) => number) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = f(x, y);
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
  }
  return d;
}

// A deterministic "random" number, so the tests never flake.
const noise = (x: number, y: number, seed = 1) => {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return n - Math.floor(n);
};

describe('grid', () => {
  it('finds the largest patch and says where it is', () => {
    const cols = 6;
    const flags = Array.from({ length: 36 }, (_, i) => [0, 1, 6, 7, 35].includes(i));
    const c = largestCluster(flags, cols, 6)!;
    expect(c.size).toBe(4);
    expect(placeOf(c.box)).toBe('top left');
  });
});

describe('Error Level Analysis', () => {
  const w = 160;
  const h = 160;
  const orig = picture(w, h, (x, y) => 100 + noise(x, y) * 40);
  it('flags one patch that changes more when re-saved', () => {
    // The re-save changes the bottom-right patch a lot, the rest a little.
    const resaved = picture(w, h, (x, y) => 100 + noise(x, y) * 40 + (x > 100 && y > 100 ? 18 : noise(x, y, 2) > 0.5 ? 1 : 0));
    const r = elaFromPixels(orig, resaved, w, h);
    expect(r.patch?.place).toBe('bottom right');
    expect(r.contrast).toBeGreaterThan(3);
  });
  it('does not flag a picture that changes evenly everywhere', () => {
    const resaved = picture(w, h, (x, y) => 100 + noise(x, y) * 40 + (noise(x, y, 3) > 0.5 ? 6 : 4));
    expect(elaFromPixels(orig, resaved, w, h).patch).toBeNull();
  });
});

describe('noise', () => {
  it('flags a patch with no grain in a grainy picture', () => {
    const d = picture(320, 320, (x, y) => (x >= 224 && y < 96 ? 120 : 110 + noise(x, y) * 30));
    const r = noiseFromPixels(d, 320, 320);
    expect(r.patch?.kind).toBe('cleaner');
    expect(r.patch?.place).toBe('top right');
  });
  it('stays quiet on even grain', () => {
    expect(noiseFromPixels(picture(320, 320, (x, y) => 110 + noise(x, y) * 30), 320, 320).patch).toBeNull();
  });
});

describe('grid pattern (AI generators)', () => {
  it('finds a period-8 pattern hidden in the grain', () => {
    const d = picture(300, 300, (x, y) => 120 + noise(x, y) * 20 + (x % 8 === 0 ? 14 : 0) + (y % 8 === 0 ? 14 : 0) + (x % 4 === 0 ? 6 : 0) + (y % 4 === 0 ? 6 : 0));
    expect(gridPatternFromPixels(d, 300, 300, fft)!.peaks).toBeGreaterThanOrEqual(2);
  });
  it('finds none in plain grain', () => {
    expect(gridPatternFromPixels(picture(300, 300, (x, y) => 120 + noise(x, y) * 20), 300, 300, fft)!.peaks).toBeLessThan(2);
  });
  it('skips pictures too small to measure', () => {
    expect(gridPatternFromPixels(picture(100, 100, () => 0), 100, 100, fft)).toBeNull();
  });
});

describe('JPEG structure', () => {
  const std = [16, 11, 12, 14, 12, 10, 16, 14, 13, 14, 18, 17, 16, 19, 24, 40, 26, 24, 22, 22, 24, 49, 35, 37, 29, 40, 58, 51, 61, 60, 57, 51, 56, 55, 64, 72, 92, 78, 64, 68, 87, 69, 55, 56, 80, 109, 81, 87, 95, 98, 103, 104, 103, 62, 77, 113, 121, 112, 100, 120, 92, 101, 103, 99];
  const at = (q: number) => {
    const s = q < 50 ? 5000 / q : 200 - 2 * q;
    return std.map((v) => Math.min(255, Math.max(1, Math.floor((v * s + 50) / 100))));
  };
  it('recognises the standard software table and its quality', () => {
    expect(fitQuality(at(75))).toEqual({ quality: 75, error: 0 });
    expect(fitQuality(at(92)).quality).toBe(92);
  });
  const jpegWith = (table: number[]) => new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 67, 0x00, ...table, 0xff, 0xda, 0, 2]);
  it('reads the table from a file and says whether it is standard', () => {
    const r = readJpeg(jpegWith(at(80)))!;
    expect(r.quality).toBe(80);
    expect(r.standardTables).toBe(true);
    // A camera-style table: not a scaled standard one.
    const camera = readJpeg(jpegWith(std.map((v, i) => (i % 3 ? v : v + 7) >> 1)))!;
    expect(camera.standardTables).toBe(false);
  });
  it('is not fooled by a file that is not a JPEG', () => {
    expect(readJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

describe('video motion', () => {
  const frame = (shift: number) => Uint8Array.from({ length: 96 * 54 }, (_, i) => Math.round(noise(i % 96, Math.floor(i / 96), shift) * 255));
  it('says a still picture is frozen', () => {
    const still = frame(1);
    const r = videoLab([still, still, still, still, still], 2.8);
    expect(r.frozen).toBe(true);
    expect(r.hints[0].id).toBe('frozen');
  });
  it('a live camera moves', () => {
    expect(motionOf([frame(1), frame(2), frame(3), frame(4)]).frozen).toBe(false);
  });
  it('finds one sudden jump among calm frames', () => {
    const base = frame(1);
    const calm = (d: number) => base.map((v) => Math.min(255, v + d));
    expect(motionOf([base, calm(2), calm(3), frame(9), frame(9).map((v) => Math.min(255, v + 2))]).jumpAt).toBe(2);
  });
});

describe('voice measurements', () => {
  const RATE = 16000;
  /** "Speech": voiced bursts with a pitch contour, separated by pauses with a little room noise. */
  function clip(opts: { pitch: (t: number) => number; pauseNoise: (k: number) => number; seconds?: number }) {
    const n = (opts.seconds ?? 10) * RATE;
    const out = new Float32Array(n);
    let phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const word = Math.floor(t / 0.8);
      const inWord = t % 0.8 < 0.55;
      if (inWord) {
        phase += (2 * Math.PI * opts.pitch(t)) / RATE;
        out[i] = 0.3 * Math.sin(phase) + 0.12 * Math.sin(2 * phase);
      } else {
        out[i] = (noise(i, 0) - 0.5) * opts.pauseNoise(word);
      }
    }
    return out;
  }

  it('finds the pitch of a voiced frame', () => {
    const f = Float32Array.from({ length: 512 }, (_, i) => Math.sin((2 * Math.PI * 150 * i) / RATE));
    expect(pitchOf(f, RATE)).toBeGreaterThan(140);
    expect(pitchOf(f, RATE)).toBeLessThan(160);
  });

  it('a lively voice with room sound raises no hints', () => {
    const m = voiceMetrics(clip({ pitch: (t) => 120 * Math.pow(2, Math.sin(t * 2.3) * 0.6), pauseNoise: () => 0.004 }), RATE);
    expect(m.pitchRange!).toBeGreaterThan(4);
    expect(voiceHints(m).map((h) => h.id)).not.toContain('flat_pitch');
    expect(voiceHints(m).map((h) => h.id)).not.toContain('background_jump');
  });

  it('flags a flat pitch and a background that changes between pauses', () => {
    const m = voiceMetrics(clip({ pitch: () => 118, pauseNoise: (k) => (k % 2 ? 0.0006 : 0.012) }), RATE);
    const ids = voiceHints(m).map((h) => h.id);
    expect(ids).toContain('flat_pitch');
    expect(ids).toContain('background_jump');
  });

  it('flags digitally empty pauses on a recording, but not on a live call', () => {
    const samples = clip({ pitch: (t) => 120 * Math.pow(2, Math.sin(t * 2.3) * 0.6), pauseNoise: () => 0 });
    expect(voiceLab(samples, RATE, false).hints.map((h) => h.id)).toContain('empty_silence');
    expect(voiceLab(samples, RATE, true).hints.map((h) => h.id)).not.toContain('empty_silence');
  });

  it('too little speech says nothing', () => {
    expect(voiceHints(voiceMetrics(new Float32Array(RATE * 5), RATE))).toEqual([]);
  });
});

describe('hybrid escalation', () => {
  const look = (o: Partial<Parameters<typeof secondOpinionReason>[0]>) => ({ assessment: 'no_clear_signs' as const, signs: [], confidence: 'high' as const, source: 'on_device' as const, ...o });
  it('keeps a clear, confident first look on the laptop', () => {
    expect(secondOpinionReason(look({}), false)).toBeNull();
    expect(secondOpinionReason(look({ assessment: 'likely_ai', signs: [{ sign: 'a', where: '' }, { sign: 'b', where: '' }] }), false)).toBeNull();
  });
  it('asks the cloud when Gemini Nano is unsure, can’t tell, or disagrees with the pixel checks', () => {
    expect(secondOpinionReason(look({ assessment: 'unclear' }), false)).toMatch(/couldn’t tell/);
    expect(secondOpinionReason(look({ confidence: 'low' }), false)).toMatch(/wasn’t sure/);
    expect(secondOpinionReason(look({}), true)).toMatch(/pixel checks/);
    expect(secondOpinionReason(look({ assessment: 'likely_edited', signs: [{ sign: 'a', where: '' }], confidence: 'medium' }), false)).toMatch(/only one sign/);
  });
  it('never asks again when the first look already came from the cloud', () => {
    expect(secondOpinionReason(look({ assessment: 'unclear', source: 'cloud' }), true)).toBeNull();
  });
});
