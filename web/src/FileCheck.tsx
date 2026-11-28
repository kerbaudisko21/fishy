import { useEffect, useRef, useState, type DragEvent } from 'react';
import { decodeMono16k, VOICE_RATE, wavFrom } from '../../extension/src/lib/ai/files';
import { scanPicture } from '../../extension/src/lib/checks/media';
import { videoLab, voiceLab } from '../../extension/src/lib/forensics/labs';
import { MAX_VOICE_SECONDS, recordingSeconds, VOICE_ANALYSIS_SECONDS } from '../../extension/src/lib/forensics/limits';
import { BAND_LABEL, scoreMedia, STAMP } from '../../extension/src/lib/media-score';
import { line, Reveal } from '../../extension/src/lib/transitions';
import type { CheckItem, ForensicHint, MediaCheck } from '../../extension/src/lib/types';
import { readFrames, readPicture, readVoice, type PictureReading } from './hybrid';
import { isAudio, isPdf, isPicture, isVideo, videoFrames } from './media';

/*
 * Try FISHY · a picture, a video or a voice note, chosen here or shared from another app.
 *  - picture: the file's own marks, then what Gemini sees (Nano in this browser when it has it);
 *  - video: frames spread over the video; this device measures the motion between them, then
 *    Gemini compares them on one numbered sheet;
 *  - voice note: this device measures pitch, pauses, breaths and background, then Gemini in the
 *    cloud listens (Gemini Nano doesn't take audio).
 * The verdict is the score's band (the extension's own evidence fusion), so the two never disagree.
 */

const LOOKS: Record<PictureReading['assessment'], string> = {
  likely_ai: 'Looks made by AI',
  likely_edited: 'Looks edited',
  no_clear_signs: 'No clear signs',
  unclear: 'Hard to tell',
};

const MB = 1024 * 1024;
const MAX_PICTURE = 20 * MB;
const MAX_VOICE = 20 * MB;
// A video isn't decoded whole, only seeked: a longer one is fine.
const MAX_VIDEO = 200 * MB;
const ACCEPT = 'image/*,video/*,audio/*,application/pdf,.opus,.ogg,.m4a';

type Kind = 'picture' | 'voice' | 'frame';

interface Result {
  run: number;
  kind: Kind;
  name: string;
  preview?: string;
  frames?: string[];
  audio?: string;
  rows: CheckItem[];
  facts?: MediaCheck['facts'];
  hints: ForensicHint[];
  gemini?: PictureReading | null;
  note?: string;
}

const urlsOf = (r: Result) => [r.preview, r.audio, ...(r.frames ?? [])].filter((u): u is string => !!u);

/** What Gemini answered, or why it didn't: null without Firebase, undefined when it failed. */
function geminiPart(g: PictureReading | null | undefined): Pick<Result, 'gemini' | 'note'> {
  if (g) return { gemini: g };
  return { gemini: null, note: g === null ? 'Preview without Firebase: only this device’s own checks ran.' : 'Gemini could not finish. Check your connection and try again.' };
}

const failed = (what: string) => (e: unknown) => {
  console.warn(`[FISHY] ${what} check failed`, e);
  return undefined;
};

export function FileCheck({ incoming }: { incoming?: File | null }) {
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const runs = useRef(0);
  const sharedRun = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  /** Shows a result if it is still the latest check; the result it replaces lets go of its files. */
  const show = (r: Result) => {
    if (r.run !== runs.current) return false;
    setResult((prev) => {
      if (prev && prev.run !== r.run) urlsOf(prev).forEach((u) => URL.revokeObjectURL(u));
      return r;
    });
    urls.current = urlsOf(r);
    return true;
  };

  const check = async (file?: File | null) => {
    if (!file) return;
    const run = ++runs.current;
    setNotice('');
    const refuse = (text: string) => {
      setResult(null);
      setBusy(null);
      setNotice(text);
    };
    if (!file.size) return refuse(`${file.name || 'That file'} is empty.`);
    if (isPdf(file)) return refuse('Open PDFs on a laptop with the FISHY extension.');
    const tooBig = (max: number) => `That file is ${Math.round(file.size / MB)} MB. FISHY checks these up to ${max / MB} MB.`;

    try {
      if (isPicture(file)) {
        if (file.size > MAX_PICTURE) return refuse(tooBig(MAX_PICTURE));
        setBusy('Reading the file…');
        const facts = scanPicture(new Uint8Array(await file.arrayBuffer()));
        const base: Result = {
          run,
          kind: 'picture',
          name: file.name,
          preview: URL.createObjectURL(file),
          rows: facts.checks,
          facts: { aiLabel: facts.aiLabel, aiTool: facts.aiTool, editedWith: facts.editedWith },
          hints: [],
        };
        if (!show(base)) return;
        setBusy('Gemini is looking…');
        show({ ...base, ...geminiPart(await readPicture(file).catch(failed('picture'))) });
      } else if (isVideo(file)) {
        if (file.size > MAX_VIDEO) return refuse(tooBig(MAX_VIDEO));
        setBusy('Taking frames from the video…');
        const set = await videoFrames(file);
        const lab = videoLab(set.thumbs, set.seconds);
        const base: Result = { run, kind: 'frame', name: file.name, frames: set.frames, rows: lab.rows, hints: lab.hints };
        if (!show(base)) return set.frames.forEach((u) => URL.revokeObjectURL(u));
        setBusy('Gemini is comparing the frames…');
        show({ ...base, ...geminiPart(await readFrames(set.sheet, lab.measured).catch(failed('video'))) });
      } else if (isAudio(file)) {
        if (file.size > MAX_VOICE) return refuse(tooBig(MAX_VOICE));
        // Its length is read before it is decoded: hours of audio would take gigabytes.
        const seconds = await recordingSeconds(file);
        if (seconds !== null && seconds > MAX_VOICE_SECONDS) return refuse(`That recording is ${Math.round(seconds / 60)} minutes long. FISHY checks voice notes up to 5 minutes.`);
        setBusy('Measuring the voice on this device…');
        // Only the first minute is measured and sent: enough for every check.
        const samples = (await decodeMono16k(file)).subarray(0, VOICE_ANALYSIS_SECONDS * VOICE_RATE);
        const lab = voiceLab(samples, VOICE_RATE, false);
        const base: Result = { run, kind: 'voice', name: file.name, audio: URL.createObjectURL(file), rows: lab.rows, hints: lab.hints };
        if (!show(base)) return;
        setBusy('Gemini is listening…');
        show({ ...base, ...geminiPart(await readVoice(wavFrom(samples), lab.measured).catch(failed('voice'))) });
      } else {
        refuse('FISHY checks pictures, videos, voice notes and messages.');
      }
    } catch (e) {
      console.warn('[FISHY] file check failed', e);
      if (run === runs.current) refuse(`This file couldn’t be opened here. ${(e as Error).message ?? ''}`.trim());
    } finally {
      if (run === runs.current) setBusy(null);
    }
  };

  // A file shared in from another app is checked as soon as it arrives.
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    if (!incoming) return;
    sharedRun.current = runs.current + 1;
    void checkRef.current(incoming);
  }, [incoming]);

  // A shared file's result scrolls into view as soon as it is there: that is what the person came for.
  useEffect(() => {
    if (result && result.run === sharedRun.current) {
      sharedRun.current = 0;
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ block: 'start' }));
    }
  }, [result]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void check(e.dataTransfer.files[0]);
  };

  const item: MediaCheck | null = result && {
    id: 'try',
    kind: result.kind,
    name: result.name,
    at: '',
    checks: result.kind === 'picture' ? result.rows : [],
    facts: result.facts,
    forensics: { hints: result.hints, rows: result.rows },
    gemini: result.gemini ? { assessment: result.gemini.assessment, signs: result.gemini.signs, source: result.gemini.source, model: result.gemini.reader } : result.gemini,
  };
  const score = item ? scoreMedia(item) : null;
  // One source of truth: the verdict card says what the score's band says.
  const band = score && score.band !== 'pending' ? score.band : 'low';
  const fishy = band === 'high';
  const look = band === 'some';
  const voice = result?.kind === 'voice';

  return (
    <div className="stack">
      <label
        className={`dropzone${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <strong>Choose a picture, video or voice note</strong>
        <span className="muted">A photo, a screenshot, a video someone sent you, or a voice message.</span>
        <input type="file" accept={ACCEPT} className="visually-hidden" disabled={!!busy} onChange={(e) => void check(e.target.files?.[0])} />
      </label>

      {busy && (
        <p className="muted" role="status">
          {busy}
        </p>
      )}
      {notice && (
        <p className="notice" role="alert">
          {notice}
        </p>
      )}

      {result && (
        <div ref={resultRef} className="anchor">
          <Reveal as="section" key={result.run} className="stack" aria-label="Result">
            {result.preview && <img className={line(1, 'try-preview')} src={result.preview} alt="The picture that was checked" />}
            {result.frames && (
              <div className={line(1, 'frame-strip')} role="group" aria-label={`${result.frames.length} frames from the video`}>
                {result.frames.map((f, i) => (
                  <img key={f} src={f} alt={`Frame ${i + 1}`} />
                ))}
              </div>
            )}
            {result.audio && (
              <div className={line(1, 'card voice-card')}>
                <strong className="file-name">{result.name || 'Voice note'}</strong>
                <audio controls preload="metadata" src={result.audio} />
              </div>
            )}
            {result.gemini !== undefined && (
              <div className={line(2, `verdict ${fishy ? 'fishy' : look ? 'look' : 'clear'}`)}>
                <span className="verdict-pill">{STAMP[band]}</span>
                <h2>{fishy ? 'Something’s fishy.' : look ? 'Take a closer look.' : 'No clear signs.'}</h2>
                <span>
                  {fishy
                    ? 'Before you act on it, call the person on a number you already have.'
                    : look
                      ? 'Not enough to call it fake. Check the signs below, and call the person before you act.'
                      : 'That isn’t proof it’s real: a good fake passes checks. If it asks you to act, call the person first.'}
                </span>
              </div>
            )}
            {score && score.score !== null && (
              <div className={line(3, `card score-card ${score.band}`)}>
                <div className="score-line">
                  <span className="score-big">{score.score}</span>
                  <span className="muted">/100</span>
                  <strong>{BAND_LABEL[score.band]}</strong>
                </div>
                <div className="bar" role="img" aria-label={`FISHY score ${score.score} out of 100`}>
                  <span style={{ width: `${score.score}%` }} />
                </div>
                {score.reasons.length > 0 && (
                  <>
                    <strong>Why</strong>
                    <ul className="why-list">
                      {score.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            <div className={line(4, 'card')}>
              <div className="card-head">
                <strong>{result.kind === 'picture' ? 'In the file' : 'Measured on this device'}</strong>
                {result.kind !== 'picture' && <span className="ran on_device">On this device</span>}
              </div>
              <ul className="flags">
                {result.rows.map((c) => (
                  <li key={c.title}>
                    <span className="flag-title">{c.title}</span>
                    <span className="muted">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={line(5, 'card')}>
              <div className="card-head">
                <strong>What Gemini {voice ? 'heard' : 'saw'}</strong>
                {result.gemini && (
                  <span className={`ran ${result.gemini.source}`}>{result.gemini.source === 'on_device' ? 'Gemini Nano, on this device' : 'Gemini, cloud'}</span>
                )}
              </div>
              {result.gemini === undefined ? (
                <span className="t-shimmer" data-text={voice ? 'Gemini is listening…' : 'Gemini is looking…'}>
                  {voice ? 'Gemini is listening…' : 'Gemini is looking…'}
                </span>
              ) : result.gemini === null ? (
                <span className="muted">{result.note}</span>
              ) : (
                <>
                  <span className="flag-title">{LOOKS[result.gemini.assessment]}</span>
                  {result.gemini.signs.length > 0 && (
                    <ul className="flags">
                      {result.gemini.signs.map((s, i) => (
                        <li key={i}>
                          <span>{s.sign}</span>
                          {s.where && <span className="muted">{s.where}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {voice && <span className="muted">Only the cloud model can listen: Gemini Nano doesn’t take audio yet. The measurements above stayed on this device.</span>}
            </div>
          </Reveal>
        </div>
      )}
    </div>
  );
}
