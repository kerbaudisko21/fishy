import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BAND_LABEL, scoreMedia, whySentence } from '../../lib/media-score';
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
  const [picked, setPicked] = useState(0);
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

function Card({ item, focused, onChallenge }: { item: MediaCheck; focused: boolean; onChallenge?: () => void }) {
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
          <span className="row-title media-name">{item.name}</span>
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
              <span className="why-line">{why}</span>
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
            <span className="row-detail">Ask them to pass a hand slowly across their face. A real face stays whole; a live face swap often breaks up.</span>
          </span>
          <button className="btn secondary small" onClick={onChallenge}>
            {Icon.video(14)} Check with hand
          </button>
        </div>
      )}

      {s.reasons.length > 1 && (
        <details className="fold" open>
          <summary>
            Why <span className="fold-count">{s.reasons.length}</span>
          </summary>
          <ul className="why-list">
            {s.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
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
        </div>
      </details>
    </article>
  );
}

/** What the checks found: one card per picture, document, voice or video frame, newest first. */
export function Media({ items, busy, focusId, onBack, onFile, patterns = [], patternInfo, onChallenge }: Props) {
  const newest = items[items.length - 1]?.id;
  return (
    <>
      <DetailHead title="What the checks found" badges={[]} onBack={onBack} />
      <main className="main">
        {patternInfo && <ScamType names={patterns} info={patternInfo} />}
        {[...items].reverse().map((item) => (
          <Card key={item.id} item={item} focused={item.id === (focusId ?? newest) && items.length > 1} onChallenge={busy ? undefined : onChallenge} />
        ))}

        <Note icon={Icon.phone(15)}>
          Signs, not proof: a good fake can pass every check. <strong>Before money moves, call the real person on the number on record.</strong>
        </Note>

        <DropZone onFile={onFile} disabled={busy} compact />

        <Privacy>The file’s marks, pixels, motion, voice and a website’s page are measured on this laptop. A picture, video frame or website screenshot goes to the cloud only when Gemini Nano isn’t available or isn’t sure; a voice clip always does. For a website, only its address is looked up. Nothing is stored.</Privacy>
      </main>
    </>
  );
}
