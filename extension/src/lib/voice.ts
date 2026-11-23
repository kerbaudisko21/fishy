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
  const ctx = new AudioContext();
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

/**
 * One frame of the tab the person is looking at (a Google Meet, Zoom or Teams call in the browser),
 * as a PNG, only on their click. Uses the same tab capture as the voice clip; nothing is recorded.
 */
export async function captureTabFrame(tabId: number): Promise<Blob> {
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
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    video.srcObject = null;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The frame could not be captured.'))), 'image/png'));
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}
