import type { CSSProperties } from 'react';
import { BAND_LABEL, scoreMedia } from '../../lib/media-score';
import type { MediaAssessment, MediaCheck } from '../../lib/types';
import { DetailHead, Icon, Note, Privacy, Section, SourceBadge } from '../components';

interface Props {
  items: MediaCheck[];
  busy: boolean;
  onBack: () => void;
  onCheckMore: () => void;
}

const TITLE: Record<MediaCheck['kind'], string> = { picture: 'Picture', document: 'Document', voice: 'Voice', frame: 'Video call' };

const VERDICT: Record<MediaAssessment, { tone: 'flagged' | 'ok' | 'unclear'; picture: string; voice: string }> = {
  likely_ai: { tone: 'flagged', picture: 'Looks made by AI', voice: 'Sounds like a cloned voice' },
  likely_edited: { tone: 'flagged', picture: 'Looks edited', voice: 'Sounds spliced together' },
  no_clear_signs: { tone: 'ok', picture: 'No clear signs', voice: 'No clear signs' },
  unclear: { tone: 'unclear', picture: 'Hard to tell', voice: 'Hard to tell' },
};

function kindIcon(kind: MediaCheck['kind']) {
  return kind === 'voice' ? Icon.mic(16) : kind === 'frame' ? Icon.video(16) : kind === 'document' ? Icon.file(16) : Icon.image(16);
}

function Preview({ item }: { item: MediaCheck }) {
  if (item.kind === 'voice') {
    const bars = item.levels?.length ? item.levels : [];
    return bars.length ? (
      <div className="wave" aria-hidden="true">
        {bars.map((h, i) => (
          <span key={i} style={{ height: `${Math.max(6, Math.round(h * 100))}%`, '--i': i } as CSSProperties} />
        ))}
      </div>
    ) : null;
  }
  return item.preview ? <img className="media-preview" src={item.preview} alt={`The ${TITLE[item.kind].toLowerCase()} that was checked`} /> : null;
}

/** The FISHY score: how strongly the evidence points to AI or tampering, and why. */
function ScorePart({ item }: { item: MediaCheck }) {
  const s = scoreMedia(item);
  if (s.score === null) {
    return s.reasons.length ? <span className="row-detail">{s.reasons[0]}</span> : null;
  }
  return (
    <div className={`score-block ${s.band}`}>
      <div className="score">
        <span className="score-num">{s.score}</span>
        <span className="score-of">/100</span>
        <span className="score-band">{BAND_LABEL[s.band]}</span>
      </div>
      <div className="meter" role="img" aria-label={`FISHY score ${s.score} out of 100`}>
        <span className="meter-pos" style={{ transform: `translateX(${s.score}%)` }}>
          <i />
        </span>
      </div>
      {s.reasons.length > 0 && (
        <div className="why">
          <span className="row-title">Why</span>
          <ul>
            {s.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function GeminiPart({ item }: { item: MediaCheck }) {
  const voice = item.kind === 'voice';
  const g = item.gemini;
  if (g === undefined) {
    return (
      <p className="explain">
        <span className="t-shimmer" data-text={voice ? 'Gemini is listening…' : 'Gemini is looking…'}>
          {voice ? 'Gemini is listening…' : 'Gemini is looking…'}
        </span>
      </p>
    );
  }
  if (g === null) return <span className="row-detail">{item.note ?? 'Gemini did not run.'}</span>;
  const v = VERDICT[g.assessment];
  return (
    <>
      <div className="media-verdict">
        <span className={`dot ${v.tone === 'ok' ? 'ok' : 'flagged'}`} aria-hidden="true">
          {v.tone === 'ok' ? Icon.check() : Icon.bang()}
        </span>
        <span className="row-title">{voice ? v.voice : v.picture}</span>
        <SourceBadge source={g.source} label={g.source === 'on_device' ? 'Gemini Nano, on device' : 'Gemini, cloud'} />
      </div>
      {/* The signs themselves are listed under "Why", with the score. */}
      {g.signs.length > 3 && <span className="row-detail">Plus {g.signs.length - 3} more {g.signs.length - 3 === 1 ? 'sign' : 'signs'}.</span>}
    </>
  );
}

/** Step 2 · What the checks found in the pictures, documents, voices and video the person checked. */
export function Media({ items, busy, onBack, onCheckMore }: Props) {
  const anyCloud = items.some((m) => m.gemini?.source === 'cloud' || m.kind === 'voice');
  return (
    <>
      <DetailHead
        title="What the checks found"
        step="check"
        badges={[{ source: 'on_device', label: 'File marks read on this laptop' }, ...(anyCloud ? [{ source: 'cloud' as const, label: 'Cloud, only what you chose' }] : [])]}
        onBack={onBack}
      />
      <main className="main">
        {[...items].reverse().map((item) => (
          <Section
            key={item.id}
            title={
              <span className="media-title">
                {kindIcon(item.kind)}
                {TITLE[item.kind]}
              </span>
            }
            aside={item.demo ? 'Demo result' : `checked ${item.at}`}
          >
            <div className="surface card-pad media-card">
              <span className="row-detail media-name">{item.name}</span>
              <Preview item={item} />
              <ScorePart item={item} />
              {item.checks.length > 0 && (
                <ul className="rows media-facts" aria-label="In the file">
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
              <div className="media-gemini" aria-live="polite">
                <span className="eyebrow">{item.kind === 'voice' ? 'What Gemini heard' : 'What Gemini saw'}</span>
                <GeminiPart item={item} />
              </div>
            </div>
          </Section>
        ))}

        <Note icon={Icon.phone(15)}>
          These are signs, not proof: a good fake can pass every check. <strong>Before money moves, call the real person on the number on record.</strong>
        </Note>

        <button className="btn secondary" onClick={onCheckMore} disabled={busy}>
          {Icon.upload(16)}
          Check something else
        </button>

        <Privacy>The file’s marks are read on this laptop. A picture goes to the cloud only when Gemini Nano isn’t available; a voice clip always does. Nothing is stored.</Privacy>
      </main>
    </>
  );
}
