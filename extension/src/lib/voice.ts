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
