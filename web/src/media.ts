import { grey } from '../../extension/src/lib/forensics/video-math';

/*
 * Getting a shared or chosen video ready to check, in this browser: frames spread over the video,
 * small greyscale copies for the motion check (the extension's own), and one numbered sheet of the
 * frames for Gemini to compare in one look. Nothing is uploaded here.
 */

export interface VideoFrames {
  /** The frames as JPEG object URLs, in time order. */
  frames: string[];
  /** The frames side by side, numbered, for Gemini. */
  sheet: Blob;
  /** 96 px wide greyscale copies for the motion check. */
  thumbs: Uint8Array[];
  /** Seconds between the first and the last frame. */
  seconds: number;
  /** The whole video's length. */
  duration: number;
}

const THUMB_W = 96;
const FRAME_MAX = 720;
const SHEET_COLS = 3;
const SHEET_CELL_W = 512;

const once = (el: HTMLMediaElement, ok: string, ms = 8000) =>
  new Promise<void>((resolve, reject) => {
    const done = () => {
      clearTimeout(timer);
      el.removeEventListener(ok, done);
      el.removeEventListener('error', fail);
      resolve();
    };
    const fail = () => {
      clearTimeout(timer);
      el.removeEventListener(ok, done);
      reject(new Error('This video can’t be opened in this browser.'));
    };
    const timer = setTimeout(fail, ms);
    el.addEventListener(ok, done);
    el.addEventListener('error', fail, { once: true });
  });

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('A frame could not be drawn.'))), 'image/jpeg', quality));

/** About 9 frames (12 for a longer video), spread evenly over the whole video. */
export async function videoFrames(file: Blob): Promise<VideoFrames> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const meta = once(video, 'loadeddata');
    video.src = url;
    await meta;
    let duration = video.duration;
    // A recording made in a browser (MediaRecorder WebM) often doesn't know its length until the end is read.
    if (!Number.isFinite(duration)) {
      const known = once(video, 'durationchange');
      video.currentTime = 1e9;
      await known.catch(() => undefined);
      duration = Number.isFinite(video.duration) ? video.duration : 0;
      // Back to the start, so the first frames aren't taken while it is still finding its way back.
      const back = once(video, 'seeked');
      video.currentTime = 0;
      await back.catch(() => undefined);
    }
    const w0 = video.videoWidth;
    const h0 = video.videoHeight;
    if (!w0 || !h0) throw new Error('This video has no picture.');
    const count = duration > 30 ? 12 : 9;
    const scale = Math.min(1, FRAME_MAX / Math.max(w0, h0));
    const w = Math.round(w0 * scale);
    const h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const thumbH = Math.max(1, Math.round((THUMB_W * h) / w));
    const small = document.createElement('canvas');
    small.width = THUMB_W;
    small.height = thumbH;
    const smallCtx = small.getContext('2d', { willReadFrequently: true })!;

    const cellH = Math.round((SHEET_CELL_W * h) / w);
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = SHEET_CELL_W * Math.min(SHEET_COLS, count);
    sheetCanvas.height = cellH * Math.ceil(count / SHEET_COLS);
    const sheet = sheetCanvas.getContext('2d')!;
    sheet.fillStyle = '#000';
    sheet.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    const frames: string[] = [];
    const thumbs: Uint8Array[] = [];
    const times = Array.from({ length: count }, (_, i) => (duration > 0 ? (duration * (i + 0.5)) / count : 0));
    for (const [i, t] of times.entries()) {
      // Seeking to where it already is fires no "seeked": nudge it.
      const seeked = once(video, 'seeked');
      video.currentTime = Math.abs(video.currentTime - t) < 0.001 ? t + 0.001 : t;
      await seeked;
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(URL.createObjectURL(await toBlob(canvas, 0.85)));
      smallCtx.drawImage(canvas, 0, 0, THUMB_W, thumbH);
      thumbs.push(grey(smallCtx.getImageData(0, 0, THUMB_W, thumbH).data));
      const x = (i % SHEET_COLS) * SHEET_CELL_W;
      const y = Math.floor(i / SHEET_COLS) * cellH;
      sheet.drawImage(canvas, x, y, SHEET_CELL_W, cellH);
      sheet.fillStyle = 'rgba(0,0,0,.7)';
      sheet.fillRect(x + 6, y + 6, 30, 26);
      sheet.fillStyle = '#fff';
      sheet.font = 'bold 18px sans-serif';
      sheet.fillText(String(i + 1), x + 15, y + 26);
    }
    return { frames, sheet: await toBlob(sheetCanvas, 0.9), thumbs, seconds: times[count - 1] - times[0], duration };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Is this file a voice note? WhatsApp's .opus notes sometimes arrive without a type. */
export const isAudio = (f: File) => f.type.startsWith('audio/') || (/\.(opus|ogg|oga|m4a|mp3|wav|aac|amr|webm)$/i.test(f.name) && !f.type.startsWith('video/'));
export const isVideo = (f: File) => f.type.startsWith('video/') || /\.(mp4|mov|3gp|mkv)$/i.test(f.name);
export const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
export const isPicture = (f: File) => f.type.startsWith('image/');
