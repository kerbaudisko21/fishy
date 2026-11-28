// "Save as a video": records the replay (replay.ts) into a short video file on the laptop, to send
// to someone who wouldn't open FISHY: the picture, page, screenshot or call frames, zooming into
// each area with what is wrong written underneath. Drawn on a canvas and recorded with Chrome's
// MediaRecorder; nothing is uploaded.
import { zoomFor, type Stop } from './replay';

const INK = '#141414';
const PAPER = '#fbf7ec';
const RED = '#cf2419';
const MARKER = '#f7d51d';
const HEAD = 76;
const FOOT = 150;
const BODY = "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif";
const DISPLAY = "'Big Shoulders Display Variable', 'Arial Narrow', sans-serif";
const STENCIL = "'Big Shoulders Stencil Display Variable', 'Arial Narrow', sans-serif";

export interface VideoInput {
  stops: Stop[];
  /** The picture, page or screenshot; for a video check, the frames. */
  images: string[];
  /** "Fishy", "Suspect" or "Looks OK", and its colour. */
  band: string;
  bandColor: string;
  /** The one sentence that says why. */
  why: string;
}

/** The best format this Chrome can record: MP4 (easy to send in a chat app), else WebM. */
export function videoType(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be read for the video.'));
    img.src = src;
  });

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else line = next;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(' ') !== lines.join(' ')) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '…');
  return lines;
}

/** Records the replay and returns the video file. Takes as long as the replay itself. */
export async function recordReplay(input: VideoInput, onProgress?: (f: number) => void): Promise<{ blob: Blob; ext: string }> {
  const type = videoType();
  if (!type) throw new Error('This browser can’t record video.');
  const images = await Promise.all(input.images.map(load));
  const first = images[0];
  let W = 960;
  let IH = Math.round((W * first.naturalHeight) / first.naturalWidth);
  if (IH > 1080) {
    IH = 1080;
    W = Math.max(480, Math.round((IH * first.naturalWidth) / first.naturalHeight));
  }
  W = even(W);
  IH = even(IH);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = HEAD + IH + FOOT;
  const ctx = canvas.getContext('2d')!;
  await document.fonts?.ready;

  // The replay, then an end card with the verdict and the advice.
  const END = 2600;
  const stops = input.stops;
  const total = stops.reduce((t, s) => t + s.ms, 0) + END;

  const header = () => {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, W, HEAD);
    ctx.fillStyle = RED;
    ctx.fillRect(20, 16, 44, 44);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(29, 25, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(40, 34, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(46.5, 40.5);
    ctx.lineTo(51, 45);
    ctx.lineTo(51, 50);
    ctx.arc(46, 50, 5, 0, Math.PI, false);
    ctx.stroke();
    ctx.fillStyle = PAPER;
    ctx.font = `900 34px ${STENCIL}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('FISHY', 78, HEAD / 2 + 2);
    ctx.font = `800 28px ${DISPLAY}`;
    const label = input.band.toUpperCase();
    const lw = ctx.measureText(label).width + 28;
    ctx.fillStyle = input.bandColor;
    ctx.fillRect(W - lw - 20, 18, lw, 40);
    ctx.fillStyle = input.bandColor === MARKER ? INK : '#fff';
    ctx.fillText(label, W - lw - 6, HEAD / 2 + 1);
    ctx.fillStyle = MARKER;
    ctx.fillRect(0, HEAD - 5, W, 5);
  };

  const footer = (n: number | undefined, text: string) => {
    ctx.fillStyle = INK;
    ctx.fillRect(0, HEAD + IH, W, FOOT);
    let x = 28;
    if (n !== undefined) {
      ctx.fillStyle = RED;
      ctx.fillRect(x, HEAD + IH + 26, 44, 44);
      ctx.fillStyle = '#fff';
      ctx.font = `800 28px ${BODY}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(String(n), x + 22, HEAD + IH + 49);
      ctx.textAlign = 'left';
      x += 64;
    }
    ctx.fillStyle = PAPER;
    ctx.font = `600 30px ${BODY}`;
    ctx.textBaseline = 'top';
    wrap(ctx, text, W - x - 28, 3).forEach((l, i) => ctx.fillText(l, x, HEAD + IH + 24 + i * 38));
  };

  const draw = (t: number) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, canvas.height);
    header();
    // Which stop we are in, and the zoom moving towards it.
    let at = 0;
    let i = 0;
    while (i < stops.length && t >= at + stops[i].ms) at += stops[i++].ms;
    if (i >= stops.length) {
      // End card.
      ctx.drawImage(images[0], 0, HEAD, W, IH);
      ctx.fillStyle = 'rgba(20, 20, 20, .84)';
      ctx.fillRect(0, HEAD, W, IH);
      ctx.fillStyle = PAPER;
      ctx.font = `800 54px ${DISPLAY}`;
      ctx.textBaseline = 'top';
      wrap(ctx, input.why, W - 80, Math.max(1, Math.floor((IH - 60) / 62))).forEach((l, k) => ctx.fillText(l, 40, HEAD + 40 + k * 62));
      footer(undefined, 'Signs, not proof. Before you reply, click, sign in or pay, check with them another way.');
      return;
    }
    const stop = stops[i];
    const prev = stops[i - 1];
    const from = zoomFor(prev?.pin?.box);
    const to = zoomFor(stop.pin?.box);
    const k = ease((t - at) / 450);
    const s = from.s + (to.s - from.s) * k;
    const tx = from.tx + (to.tx - from.tx) * k;
    const ty = from.ty + (to.ty - from.ty) * k;
    const img = images[stop.frame ?? 0] ?? images[0];
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HEAD, W, IH);
    ctx.clip();
    ctx.drawImage(img, tx * W, HEAD + ty * IH, W * s, IH * s);
    if (stop.pin) {
      const b = stop.pin.box;
      const x = tx * W + b.x0 * W * s;
      const y = HEAD + ty * IH + b.y0 * IH * s;
      const w = (b.x1 - b.x0) * W * s;
      const h = (b.y1 - b.y0) * IH * s;
      // Dim everything but the area, then outline it in yellow.
      ctx.fillStyle = `rgba(20, 20, 20, ${0.5 * k})`;
      ctx.beginPath();
      ctx.rect(0, HEAD, W, IH);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');
      ctx.strokeStyle = MARKER;
      ctx.lineWidth = 6;
      ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = RED;
      ctx.fillRect(x - 3, y - 34, 34, 34);
      ctx.fillStyle = '#fff';
      ctx.font = `800 22px ${BODY}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(String(stop.pin.n), x + 14, y - 17);
      ctx.textAlign = 'left';
    }
    ctx.restore();
    // Frames of a call: which frame this is.
    if (images.length > 1) {
      ctx.fillStyle = 'rgba(20, 20, 20, .7)';
      ctx.fillRect(16, HEAD + 16, 150, 36);
      ctx.fillStyle = PAPER;
      ctx.font = `600 20px ${BODY}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`Frame ${(stop.frame ?? 0) + 1} of ${images.length}`, 28, HEAD + 34);
    }
    footer(stop.pin?.n, stop.caption ?? input.why);
  };

  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()));
  draw(0);
  rec.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = performance.now() - start;
      draw(Math.min(t, total));
      onProgress?.(Math.min(1, t / total));
      if (t >= total) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  stream.getTracks().forEach((tr) => tr.stop());
  await done;
  return { blob: new Blob(chunks, { type: type.mime.split(';')[0] }), ext: type.ext };
}

