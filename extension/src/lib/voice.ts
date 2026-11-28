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

/**
 * Several frames of the tab the person is looking at (a video call in the browser), a short gap
 * apart, only on their click. Nothing is recorded: the frames stay in memory.
 */
export async function captureTabFrames(tabId: number, count = 5, gapMs = 700, onTick?: (n: number) => void): Promise<FrameSet> {
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId, maxWidth: 1920, maxHeight: 1080 } } as unknown as MediaTrackConstraints,
  });
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // The first frames of a new capture can be black; give it a moment.
    await new Promise((r) => setTimeout(r, 300));
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) throw new Error('The tab shows no picture yet. Wait until the call’s video is on screen, then check again.');
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
      ctx.drawImage(video, 0, 0);
      bitmaps.push(await createImageBitmap(canvas));
      frames.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The frame could not be captured.'))), 'image/jpeg', 0.92)));
      thumbCtx.drawImage(video, 0, 0, THUMB_W, thumbH);
      thumbs.push(grey(thumbCtx.getImageData(0, 0, THUMB_W, thumbH).data));
    }
    video.srcObject = null;

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
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
