import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BAND_LABEL, lrLabel, pinOf, scoreMedia, whySentence } from '../../lib/media-score';
import type { MediaAssessment, MediaCheck } from '../../lib/types';
import { DetailHead, Icon, Note, Privacy, SourceBadge } from '../components';
import { useFirstSeen } from '../motion';
import { DropZone, Filmstrip, HybridTrail, PitchChart, ScamType, ScoreRing, Stamp } from '../scanner';

interface Props {
  items: MediaCheck[];
  busy: boolean;
  /** The check to bring into view (from "Your checks"). */
  focusId?: string | null;
  onBack: () => void;
  onFile: (file: File) => void;
  /** What kind of scam all the checks together point to. */
  patterns?: string[];
  patternInfo?: (name: string) => { signs?: string[]; action?: string } | undefined;
  /** Check the call's video again while the caller passes a hand across their face. */
  onChallenge?: () => void;
  /** 5 s of the call: does the mouth move with the voice? */
  onLipSync?: () => void;
  /** Report a picture as a scam (its fingerprint only). */
  onReport?: (id: string) => void;
}

const TITLE: Record<MediaCheck['kind'], string> = { picture: 'Picture', document: 'Document', voice: 'Voice', frame: 'Video call', site: 'Website' };

const LOOKS: Record<MediaAssessment, { picture: string; voice: string; site: string }> = {
  likely_ai: { picture: 'Looks made by AI', voice: 'Sounds like a cloned voice', site: 'Looks like a scam website' },
  likely_edited: { picture: 'Looks edited', voice: 'Sounds spliced together', site: 'Looks suspicious' },
  no_clear_signs: { picture: 'No clear signs', voice: 'No clear signs', site: 'No clear signs' },
  unclear: { picture: 'Hard to tell', voice: 'Hard to tell', site: 'Hard to tell' },
};

const looks = (kind: MediaCheck['kind'], a: MediaAssessment) => (kind === 'voice' ? LOOKS[a].voice : kind === 'site' ? LOOKS[a].site : LOOKS[a].picture);

function kindIcon(kind: MediaCheck['kind'], size = 16) {
  return kind === 'voice' ? Icon.mic(size) : kind === 'frame' ? Icon.video(size) : kind === 'site' ? Icon.link(size) : kind === 'document' ? Icon.file(size) : Icon.image(size);
}

function Preview({ item, stamp }: { item: MediaCheck; stamp: ReactNode }) {
  const scanning = item.gemini === undefined;
  const [heat, setHeat] = useState(false);
  // A video check opens on the frame Gemini pointed at first.
  const firstPinned = item.gemini?.signs.find((sg) => sg.box && sg.frame !== undefined)?.frame;
  const [picked, setPicked] = useState(firstPinned ?? 0);
  const pins = (item.gemini?.signs ?? [])
    .map((sg, i, all) => (sg.box ? { n: pinOf(all, i), box: sg.box, frame: sg.frame, label: sg.sign } : null))
    .filter((x): x is { n: number; box: { x0: number; y0: number; x1: number; y1: number }; frame: number | undefined; label: string } => !!x)
    .filter((x) => (item.frames ? x.frame === picked : true));
  if (item.kind === 'voice') {
    return (
      <>
      <div className="media-frame voice">
        {item.levels?.length ? (
          <div className={`wave${scanning ? ' listening' : ''}`} aria-hidden="true">
            {item.levels.map((h, i) => (
              <span key={i} style={{ height: `${Math.max(6, Math.round(h * 100))}%`, '--i': i } as CSSProperties} />
            ))}
          </div>
        ) : (
          <span className="voice-placeholder">{Icon.mic(28)}</span>
        )}
        {stamp}
      </div>
      {item.forensics?.pitch && <PitchChart pitch={item.forensics.pitch} />}
      </>
    );
  }
  const shown = item.frames?.[picked] ?? item.preview;
  const heatmap = item.forensics?.heatmap;
  return (
    <>
      <div className={`media-frame${scanning ? ' scanning' : ''}`}>
        {shown ? (
          <img className="media-preview" src={shown} alt={`The ${TITLE[item.kind].toLowerCase()} that was checked`} />
        ) : (
          <span className="voice-placeholder">{kindIcon(item.kind, 28)}</span>
        )}
        {heatmap && heat && <img className="media-heat" src={heatmap} alt="" aria-hidden="true" />}
        {pins.map((pin) => (
          <span key={`pin${pin.n}`} className="pin-box" title={pin.label} style={{ left: `${pin.box.x0 * 100}%`, top: `${pin.box.y0 * 100}%`, width: `${(pin.box.x1 - pin.box.x0) * 100}%`, height: `${(pin.box.y1 - pin.box.y0) * 100}%` }}>
            <span className="pin-num">{pin.n}</span>
          </span>
        ))}
        {item.forensics?.boxes?.map((b, i) => (
          <span key={i} className="media-box" aria-hidden="true" style={{ left: `${b.x0 * 100}%`, top: `${b.y0 * 100}%`, width: `${(b.x1 - b.x0) * 100}%`, height: `${(b.y1 - b.y0) * 100}%` }} />
        ))}
        {scanning && <span className="scan-line" aria-hidden="true" />}
        {stamp}
      </div>
      {item.frames && item.frames.length > 1 && <Filmstrip frames={item.frames} motion={item.forensics?.motion} picked={picked} onPick={setPicked} />}
      {heatmap && (
        <button className="heat-toggle" aria-pressed={heat} onClick={() => setHeat((h) => !h)}>
          {heat ? 'Hide the heat map' : 'Show the re-save heat map'}
        </button>
      )}
    </>
  );
}

function Card({ item, focused, onChallenge, onLipSync, onReport }: { item: MediaCheck; focused: boolean; onChallenge?: () => void; onLipSync?: () => void; onReport?: (id: string) => void }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [focused]);
  const s = scoreMedia(item);
  const voice = item.kind === 'voice';
  const g = item.gemini;
  const pending = g === undefined;
  // The stamp and the ring play once per result, not again on every visit.
  const first = useFirstSeen(`media:${item.id}:${s.score ?? 'x'}`);
  const why = whySentence(s);

  return (
    <article ref={ref} className={`surface media-card${focused ? ' focused' : ''}`} aria-label={`${TITLE[item.kind]}: ${item.name}`}>
      <header className="media-head">
        <span className="media-kind">{kindIcon(item.kind)}</span>
        <span className="grow">
          <span className="row-title media-name" title={item.name}>{item.name}</span>
          <span className="row-detail">{item.demo ? 'Demo result' : `${TITLE[item.kind]} · checked ${item.at}`}</span>
        </span>
      </header>

      <Preview item={item} stamp={s.score !== null ? <Stamp band={s.band} play={first} /> : null} />

      <div className="result-row" aria-live="polite">
        {s.score !== null ? (
          <>
            <ScoreRing score={s.score} band={s.band} />
            <span className="grow">
              <span className={`result-band ${s.band}`}>{BAND_LABEL[s.band]}</span>
              <span className="why-line">{s.band === 'high' ? <mark className="marker">{why}</mark> : why}</span>
            </span>
          </>
        ) : pending ? (
          <span className="explain">
            <span className="t-shimmer" data-text={voice ? 'Gemini is listening…' : 'Gemini is looking…'}>
              {voice ? 'Gemini is listening…' : 'Gemini is looking…'}
            </span>
          </span>
        ) : (
          <span className="row-detail">{item.note ?? s.reasons[0] ?? 'Gemini did not run.'}</span>
        )}
      </div>

      <HybridTrail item={item} />

      {item.kind === 'frame' && !item.challenge && !pending && onChallenge && (
        <div className="challenge">
          <span className="grow">
            <span className="row-title">Make sure: the hand check</span>
            <span className="row-detail">Ask them to pass a hand slowly across their face: a real face stays whole, a live face swap often breaks up. Then ask something only the real person would know (Hong Kong Police advice after the Arup case).</span>
          </span>
          <span className="challenge-actions">
            <button className="btn secondary small" onClick={onChallenge}>
              {Icon.video(14)} Check with hand
            </button>
            {onLipSync && (
              <button className="btn secondary small" onClick={onLipSync} title="5 s while they talk: does the mouth move with the voice?">
                {Icon.mic(14)} Mouth and voice
              </button>
            )}
          </span>
        </div>
      )}

      {s.factors.some((f) => f.lr !== undefined) && (
        <details className="fold" open>
          <summary>
            Why <span className="fold-count">{s.reasons.length}</span>
          </summary>
          <ul className="why-list">
            {s.factors.map((f, i) => (
              <li key={i} className={f.lr === undefined ? 'detail' : undefined}>
                {f.pin !== undefined && <span className="pin-num inline" aria-label={`Box ${f.pin} on the picture`}>{f.pin}</span>}
                <span>{f.text}</span>
                {f.lr !== undefined && <span className={`odds ${f.lr >= 1 ? 'up' : 'down'}`} title="How much this sign changed the odds">{lrLabel(f.lr)}</span>}
              </li>
            ))}
          </ul>
          <details className="odds-how">
            <summary>How is this scored?</summary>
            <p>
              It starts at {Math.round(s.prior * 100)}%, about how often something people doubt turns out fake. Each sign multiplies the odds by its weight (×3 makes fake three times as likely); similar signs count less each. The weights come from published research where it exists, and are FISHY’s estimates where it doesn’t. Signs, not proof.
            </p>
          </details>
        </details>
      )}

      <details className="fold">
        <summary>Details</summary>
        <div className="fold-body">
          {item.forensics && item.forensics.rows.length > 0 && (
            <>
              <span className="row-title">Measured on this laptop</span>
              <ul className="rows" aria-label="Measured on this laptop">
                {item.forensics.rows.map((c) => (
                  <li key={c.title} className="check-row">
                    <span className={`dot ${c.ok ? 'ok' : 'flagged'}`}>{c.ok ? Icon.check() : Icon.bang()}</span>
                    <span className="grow">
                      <span className="row-title">{c.title}</span>
                      <span className="row-detail">{c.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {item.checks.length > 0 && (
            <ul className="rows" aria-label={item.kind === 'document' ? 'In the document' : 'In the file'}>
              {item.checks.map((c) => (
                <li key={c.title} className="check-row">
                  <span className={`dot ${c.ok ? 'ok' : 'flagged'}`}>{c.ok ? Icon.check() : Icon.bang()}</span>
                  <span className="grow">
                    <span className="row-title">{c.title}</span>
                    <span className="row-detail">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="media-verdict">
            <span className="row-title">{voice ? 'What Gemini heard' : 'What Gemini saw'}</span>
            {g ? (
              <>
                <span className="row-detail">
                  {looks(item.kind, g.assessment)}
                  {g.claimsToBe ? `; it presents itself as ${g.claimsToBe}` : ''}
                </span>
                <SourceBadge source={g.source} label={g.source === 'on_device' ? 'Gemini Nano, on device' : 'Gemini, cloud'} />
                {item.firstLook && (
                  <span className="row-detail">
                    First look by Gemini Nano on this laptop: {looks(item.kind, item.firstLook.assessment)}
                    {item.escalation ? `. Asked the cloud because ${item.escalation}.` : '.'}
                  </span>
                )}
              </>
            ) : (
              <span className="row-detail">{pending ? 'Still reading…' : (item.note ?? 'Gemini did not run.')}</span>
            )}
          </div>
          {item.sourceUrl && (
            <div className="media-verdict">
              <span className="row-title">Seen elsewhere?</span>
              <span className="row-detail">A reverse image search finds where else this picture appears, as NSA, FBI and CISA advise. It sends the picture’s web address to that service.</span>
              <span className="link-row">
                <a className="link" href={`https://lens.google.com/uploadbyurl?url=${encodeURIComponent(item.sourceUrl)}`} target="_blank" rel="noreferrer">
                  Google Lens
                </a>
                <a className="link" href={`https://tineye.com/search?url=${encodeURIComponent(item.sourceUrl)}`} target="_blank" rel="noreferrer">
                  TinEye
                </a>
              </span>
            </div>
          )}
          {item.sha256 && (
            <div className="media-verdict">
              <span className="row-title">File fingerprint (SHA-256)</span>
              <span className="row-detail mono hash">{item.sha256}</span>
              <span className="row-detail">Keep it with the incident: it proves which file was checked.</span>
            </div>
          )}
        </div>
      </details>
      {item.phash && onReport && s.score !== null && s.band !== 'low' && (
        <div className="report-row">
          {item.reported ? (
            <span className="row-detail">{Icon.check(13)} Reported. Other FISHY users will see it was reported, by its fingerprint only.</span>
          ) : (
            <>
              <span className="row-detail grow">Confirmed it’s a scam (the real person said no)? Warn other FISHY users.</span>
              <button className="btn secondary small" onClick={() => onReport(item.id)}>
                Report as a scam
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

/** What the checks found: one card per picture, document, voice or video frame, newest first. */
export function Media({ items, busy, focusId, onBack, onFile, patterns = [], patternInfo, onChallenge, onLipSync, onReport }: Props) {
  const newest = items[items.length - 1]?.id;
  return (
    <>
      <DetailHead title="What the checks found" badges={[]} onBack={onBack} />
      <main className="main">
        {patternInfo && <ScamType names={patterns} info={patternInfo} />}
        {[...items].reverse().map((item) => (
          <Card key={item.id} item={item} focused={item.id === (focusId ?? newest) && items.length > 1} onChallenge={busy ? undefined : onChallenge} onLipSync={busy ? undefined : onLipSync} onReport={onReport} />
        ))}

        <Note icon={Icon.phone(15)}>
          Signs, not proof. <strong>Before you reply, click, sign in or pay, check with them another way.</strong>
        </Note>

        <DropZone onFile={onFile} disabled={busy} compact />

        <Privacy>The file’s marks, pixels, motion, voice and a website’s page are measured on this laptop. A picture, video frame or website screenshot goes to the cloud only when Gemini Nano isn’t available or isn’t sure; a voice clip always does. For a website, only its address is looked up. Nothing is stored.</Privacy>
      </main>
    </>
  );
}
