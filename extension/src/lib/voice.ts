import { grey } from './forensics/video-math';

/**
 * R8 · Records a short clip of the meeting's audio, only when the user clicks "Check this voice".
 * Uses chrome.tabCapture from the side panel; the user keeps hearing the meeting while it records.
 * The clip stays in memory and is sent once to the voice-check function, then dropped.
 */
export interface Clip {
  blob: Blob;
  mime: string;
  seconds: number;
  /** 40 loudness values (0–1) for the waveform. */
  levels: number[];
}

const BARS = 40;

export async function recordTabClip(tabId: number, seconds = 10, onTick?: (left: number) => void): Promise<Clip> {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as unknown as MediaTrackConstraints,
    video: false,
  });

  // Capturing a tab mutes it for the user; play it back so the meeting stays audible.
  // In the floating window (a frame on the page) Chrome starts audio suspended: resume it, or the
  // person hears silence for the 10 seconds.
  const ctx = new AudioContext();
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);
  source.connect(ctx.destination);

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const levels: number[] = [];
  const buf = new Float32Array(analyser.fftSize);
  const sampleEvery = (seconds * 1000) / BARS;
  const sampler = window.setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
    levels.push(Math.min(1, rms * 4));
  }, sampleEvery);

  let left = seconds;
  onTick?.(left);
  const ticker = window.setInterval(() => onTick?.(--left), 1000);

  try {
    await new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('Recording failed.'));
      recorder.start(1000);
      window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000);
    });
  } finally {
    window.clearInterval(sampler);
    window.clearInterval(ticker);
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  }

  const peak = Math.max(0.05, ...levels);
  return { blob: new Blob(chunks, { type: mime }), mime, seconds, levels: levels.slice(0, BARS).map((l) => l / peak) };
}

export interface FrameSet {
  /** The frames as JPEG, in time order. */
  frames: Blob[];
  /** The frames side by side in one picture, numbered, for Gemini to compare in one look. */
  sheet: Blob;
  /** Small greyscale copies (96 px wide) for the motion check. */
  thumbs: Uint8Array[];
  /** Seconds between the first and the last frame. */
  seconds: number;
}

const THUMB_W = 96;
const SHEET_COLS = 3;
const SHEET_CELL_W = 512;

/** Part of the page to black out of every frame: FISHY's own floating window. In page CSS pixels. */
export interface Mask {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The page's viewport, to scale CSS pixels to the captured video's pixels. */
  vw: number;
  vh: number;
}

/** An open capture of the tab's video, for several grabs (watch mode). Stop it when done. */
export interface TabVideo {
  video: HTMLVideoElement;
  stream: MediaStream;
  stop: () => void;
}

export async function openTabVideo(tabId: number, withAudio = false): Promise<TabVideo> {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: withAudio ? ({ mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } } as unknown as MediaTrackConstraints) : false,
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId, maxWidth: 1920, maxHeight: 1080 } } as unknown as MediaTrackConstraints,
  });
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
    // The first frames of a new capture can be black; give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    if (!video.videoWidth || !video.videoHeight) throw new Error('The tab shows no picture yet. Wait until the call’s video is on screen, then check again.');
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }
  return {
    video,
    stream,
    stop: () => {
      video.srcObject = null;
      stream.getTracks().forEach((t) => t.stop());
    },
  };
}

/** Draws the video's current frame and blacks out the mask (scaled from page to video pixels). */
function drawMasked(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number, mask?: Mask | null) {
  ctx.drawImage(video, 0, 0, w, h);
  if (!mask || !mask.vw || !mask.vh) return;
  const sx = w / mask.vw;
  const sy = h / mask.vh;
  ctx.fillStyle = '#000';
  ctx.fillRect(Math.floor(mask.x * sx), Math.floor(mask.y * sy), Math.ceil(mask.w * sx), Math.ceil(mask.h * sy));
}

/** Several frames from an open capture, a short gap apart. */
export async function grabFrames(video: HTMLVideoElement, count: number, gapMs: number, mask?: Mask | null, onTick?: (n: number) => void): Promise<FrameSet> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const thumbH = Math.max(1, Math.round((THUMB_W * h) / w));
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = THUMB_W;
  thumbCanvas.height = thumbH;
  const thumbCtx = thumbCanvas.getContext('2d', { willReadFrequently: true })!;

  const frames: Blob[] = [];
  const thumbs: Uint8Array[] = [];
  const bitmaps: ImageBitmap[] = [];
  for (let i = 0; i < count; i++) {
    if (i) await new Promise((r) => setTimeout(r, gapMs));
    onTick?.(i + 1);
    drawMasked(ctx, video, w, h, mask);
    bitmaps.push(await createImageBitmap(canvas));
    frames.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The frame could not be captured.'))), 'image/jpeg', 0.92)));
    thumbCtx.drawImage(canvas, 0, 0, THUMB_W, thumbH);
    thumbs.push(grey(thumbCtx.getImageData(0, 0, THUMB_W, thumbH).data));
  }

  // One numbered sheet: Gemini sees every frame at once and can compare them.
  const cellH = Math.round((SHEET_CELL_W * h) / w);
  const rows = Math.ceil(count / SHEET_COLS);
  const sheetCanvas = document.createElement('canvas');
  sheetCanvas.width = SHEET_CELL_W * Math.min(SHEET_COLS, count);
  sheetCanvas.height = cellH * rows;
  const s = sheetCanvas.getContext('2d')!;
  s.fillStyle = '#000';
  s.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  bitmaps.forEach((b, i) => {
    const x = (i % SHEET_COLS) * SHEET_CELL_W;
    const y = Math.floor(i / SHEET_COLS) * cellH;
    s.drawImage(b, x, y, SHEET_CELL_W, cellH);
    s.fillStyle = 'rgba(0,0,0,.7)';
    s.fillRect(x + 6, y + 6, 30, 26);
    s.fillStyle = '#fff';
    s.font = 'bold 18px sans-serif';
    s.fillText(String(i + 1), x + 15, y + 26);
    b.close();
  });
  const sheet = await new Promise<Blob>((resolve, reject) => sheetCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The frames could not be put together.'))), 'image/jpeg', 0.9));
  return { frames, sheet, thumbs, seconds: ((count - 1) * gapMs) / 1000 };
}

/**
 * Several frames of the tab the person is looking at (a video call in the browser), a short gap
 * apart, only on their click. Nothing is recorded: the frames stay in memory.
 */
export async function captureTabFrames(tabId: number, count = 5, gapMs = 700, onTick?: (n: number) => void, mask?: Mask | null): Promise<FrameSet> {
  const tab = await openTabVideo(tabId);
  try {
    return await grabFrames(tab.video, count, gapMs, mask, onTick);
  } finally {
    tab.stop();
  }
}

export interface LipSyncClip {
  frames: Uint8Array[];
  loudness: number[];
  w: number;
  h: number;
  frameMs: number;
}

/**
 * Lip-sync: 5 s of the call at 10 frames a second, small and greyscale, with the voice's loudness
 * at each frame. The call stays audible (the capture is played back); nothing is recorded.
 */
export async function recordLipSync(tabId: number, seconds = 5, mask?: Mask | null, onTick?: (left: number) => void): Promise<LipSyncClip> {
  const tab = await openTabVideo(tabId, true);
  const ctx = new AudioContext();
  try {
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    const source = ctx.createMediaStreamSource(tab.stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    source.connect(ctx.destination);
    const buf = new Float32Array(analyser.fftSize);

    const W = 128;
    const H = Math.max(1, Math.round((W * tab.video.videoHeight) / tab.video.videoWidth));
    const full = document.createElement('canvas');
    full.width = tab.video.videoWidth;
    full.height = tab.video.videoHeight;
    const fctx = full.getContext('2d', { willReadFrequently: true })!;
    const small = document.createElement('canvas');
    small.width = W;
    small.height = H;
    const sctx = small.getContext('2d', { willReadFrequently: true })!;

    const frameMs = 100;
    const frames: Uint8Array[] = [];
    const loudness: number[] = [];
    const total = Math.round((seconds * 1000) / frameMs);
    for (let i = 0; i < total; i++) {
      if (i % 10 === 0) onTick?.(Math.ceil((total - i) / 10));
      drawMasked(fctx, tab.video, full.width, full.height, mask);
      sctx.drawImage(full, 0, 0, W, H);
      frames.push(grey(sctx.getImageData(0, 0, W, H).data));
      analyser.getFloatTimeDomainData(buf);
      loudness.push(Math.sqrt(buf.reduce((t, v) => t + v * v, 0) / buf.length));
      await new Promise((r) => setTimeout(r, frameMs));
    }
    return { frames, loudness, w: W, h: H, frameMs };
  } finally {
    void ctx.close();
    tab.stop();
  }
}
