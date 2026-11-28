// The replay: after a check, FISHY walks through what it found, like a short video. For a video
// call it plays the frames back and stops on each frame Gemini pointed at; for a picture, a PDF
// page or a website screenshot it stops on each numbered area. At each stop it zooms in, dims the
// rest and says what is wrong. The same stops drive the "Save as a video" recording (replay-video.ts).
import { pinOf } from './media-score';
import type { MediaCheck } from './types';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Pin {
  n: number;
  box: Box;
  frame?: number;
  label: string;
}

export interface Stop {
  /** Which frame of the call to show (video checks only). */
  frame?: number;
  /** The area to zoom into and outline. */
  pin?: Pin;
  /** What to say at this stop. */
  caption?: string;
  ms: number;
}

/** How long each part of the replay lasts. */
export const TIMING = { frame: 450, pin: 2800, still: 1600, intro: 900, outro: 700 };

/** Gemini's numbered areas, in the order the reasons list them. */
export function pinsOf(item: MediaCheck): Pin[] {
  const signs = item.gemini?.signs ?? [];
  return signs.flatMap((sg, i) => (sg.box ? [{ n: pinOf(signs, i), box: sg.box, frame: sg.frame, label: sg.sign }] : []));
}

/** The stops of the replay; empty when there is nothing to point at (or nothing to show). */
export function buildStops(item: MediaCheck): Stop[] {
  if (item.kind === 'voice') return [];
  const pins = pinsOf(item);
  const frames = item.frames ?? [];
  if (frames.length > 1) {
    const frozen = item.forensics?.hints.some((h) => h.id === 'frozen') ?? false;
    const motion = item.forensics?.motion ?? [];
    const stops: Stop[] = [];
    for (let i = 0; i < frames.length; i++) {
      stops.push({ frame: i, ms: TIMING.frame });
      if (frozen && i > 0 && motion[i - 1] !== undefined && motion[i - 1] < 0.6) {
        stops.push({ frame: i, caption: 'Nothing moved since the frame before.', ms: TIMING.still });
      }
      for (const pin of pins.filter((p) => p.frame === i)) stops.push({ frame: i, pin, caption: pin.label, ms: TIMING.pin });
    }
    return stops.some((s) => s.caption) ? stops : [];
  }
  if (!item.preview || !pins.length) return [];
  return [{ ms: TIMING.intro }, ...pins.map((pin) => ({ pin, caption: pin.label, ms: TIMING.pin })), { ms: TIMING.outro }];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How far to zoom into an area and where to move the picture, as fractions of the picture's own
 * size: show it at `s` times, moved by (tx, ty), with the area near the middle and no empty edges.
 */
export function zoomFor(box?: Box): { s: number; tx: number; ty: number } {
  if (!box) return { s: 1, tx: 0, ty: 0 };
  const w = clamp(box.x1 - box.x0, 0.01, 1);
  const h = clamp(box.y1 - box.y0, 0.01, 1);
  const s = clamp(0.55 / Math.max(w, h), 1.4, 3);
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  return { s, tx: clamp(0.5 - cx * s, 1 - s, 0), ty: clamp(0.5 - cy * s, 1 - s, 0) };
}
