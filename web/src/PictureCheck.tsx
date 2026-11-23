import { useEffect, useState, type DragEvent } from 'react';
import { scanPicture, type PictureFacts } from '../../extension/src/lib/checks/media';
import { BAND_LABEL, scoreMedia } from '../../extension/src/lib/media-score';
import { mediaSignals } from '../../extension/src/lib/media-signals';
import { decide } from '../../extension/src/lib/rules/engine';
import { line, Reveal } from '../../extension/src/lib/transitions';
import { readPicture, type PictureReading } from './hybrid';

/*
 * Try FISHY · a picture: the file's own marks, read in this browser, then what Gemini sees
 * (Gemini Nano in this browser when it has it, the cloud model otherwise). The verdict comes from
 * the extension's own rules.
 */

const LOOKS: Record<PictureReading['assessment'], string> = {
  likely_ai: 'Looks made by AI',
  likely_edited: 'Looks edited',
  no_clear_signs: 'No clear signs',
  unclear: 'Hard to tell',
};

interface Result {
  name: string;
  preview: string;
  facts: PictureFacts;
  gemini?: PictureReading | null;
  note?: string;
}

export function PictureCheck() {
  const [result, setResult] = useState<Result | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.preview);
  }, [result]);

  const check = async (file?: File) => {
    if (!file) return;
    // A picture up to 20 MB: bigger would freeze the page and is too big for Gemini anyway.
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
      setResult(null);
      return;
    }
    setBusy(true);
    const facts = scanPicture(new Uint8Array(await file.arrayBuffer()));
    const base: Result = { name: file.name, preview: URL.createObjectURL(file), facts };
    setResult(base);
    try {
      const gemini = await readPicture(file);
      setResult({ ...base, gemini, note: gemini ? undefined : 'Preview without Firebase: only the file’s own marks were checked.' });
    } catch (e) {
      console.warn('[FISHY] picture check failed', e);
      setResult({ ...base, gemini: null, note: 'Gemini could not read it. Check your connection and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void check(e.dataTransfer.files[0]);
  };

  const asCheck = result && {
    id: 'try',
    kind: 'picture' as const,
    name: result.name,
    at: '',
    checks: result.facts.checks,
    facts: { aiLabel: result.facts.aiLabel, aiTool: result.facts.aiTool, editedWith: result.facts.editedWith },
    gemini: result.gemini ? { assessment: result.gemini.assessment, signs: result.gemini.signs, source: result.gemini.source, model: result.gemini.reader } : result.gemini,
  };
  const score = asCheck ? scoreMedia(asCheck) : null;
  const verdict = result
    ? decide(
        mediaSignals([
          {
            id: 'try',
            kind: 'picture',
            name: result.name,
            at: '',
            checks: result.facts.checks,
            facts: { aiLabel: result.facts.aiLabel, aiTool: result.facts.aiTool, editedWith: result.facts.editedWith },
            gemini: result.gemini ? { assessment: result.gemini.assessment, signs: result.gemini.signs, source: result.gemini.source, model: result.gemini.reader } : result.gemini,
          },
        ]),
      )
    : null;
  const fishy = verdict?.level === 'fishy';
  // Not fishy, but something to look at (an editor named in a receipt, "hard to tell").
  const look = !fishy && (verdict?.flags.length ?? 0) > 0;

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
        <strong>Drop a picture here, or choose one</strong>
        <span className="muted">A photo of a person, an ID, a receipt, a transfer screenshot or a frame of a video call.</span>
        <input type="file" accept="image/*" className="visually-hidden" disabled={busy} onChange={(e) => void check(e.target.files?.[0])} />
      </label>

      {result && (
        <Reveal as="section" key={result.preview} className="stack" aria-label="Picture result">
          <img className={line(1, 'try-preview')} src={result.preview} alt="The picture that was checked" />
          {result.gemini !== undefined && (
            <div className={line(2, `verdict ${fishy ? 'fishy' : look ? 'look' : 'clear'}`)}>
              <span className="verdict-pill">{fishy ? 'Don’t trust it yet' : look ? 'A sign to look at' : 'No red flags'}</span>
              <h2>{fishy ? 'Something’s fishy.' : look ? 'Take a closer look.' : 'Nothing obvious.'}</h2>
              <span>
                {fishy
                  ? 'Before money moves, call the person on a number you already have.'
                  : look
                    ? 'Not enough to call it fake, but check the sign below, and call the person before money moves.'
                    : 'That is not proof it is real: a good fake passes checks. For money, still call the person.'}
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
            <strong>In the file</strong>
            <ul className="flags">
              {result.facts.checks.map((c) => (
                <li key={c.title}>
                  <span className="flag-title">{c.title}</span>
                  <span className="muted">{c.detail}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={line(5, 'card')}>
            <div className="card-head">
              <strong>What Gemini saw</strong>
              {result.gemini && (
                <span className={`ran ${result.gemini.source}`}>{result.gemini.source === 'on_device' ? 'Gemini Nano, on this device' : 'Gemini, cloud'}</span>
              )}
            </div>
            {result.gemini === undefined ? (
              <span className="t-shimmer" data-text="Gemini is looking…">
                Gemini is looking…
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
          </div>
        </Reveal>
      )}
    </div>
  );
}
