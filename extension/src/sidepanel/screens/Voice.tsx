import type { Evidence } from '../../lib/types';
import { DetailHead, Icon } from '../components';

// Decorative clip shape; replace with the real clip's levels when recording is built.
const BARS = [30, 52, 40, 68, 84, 60, 44, 72, 90, 64, 38, 56, 80, 96, 70, 48, 34, 58, 76, 88, 62, 42, 66, 82, 94, 74, 50, 36, 54, 70, 86, 60, 40, 64, 78, 52, 32, 46, 30, 22];

export function Voice({ data, onBack, onCheckFace }: { data: Evidence['voice']; onBack: () => void; onCheckFace: () => void }) {
  const pct = Math.round(data.score * 100);
  return (
    <>
      <DetailHead title="Voice check" step="STEP 2 · CHECK" badges={[{ source: 'cloud', label: 'Cloud · only on your click' }]} onBack={onBack} />
      <main className="main">
        <section className="card card-pad" aria-label="Clip">
          <div className="card-head">
            <span className="row-title">
              “{data.speaker}” · {data.seconds} s clip
            </span>
            <span className="small">sent {data.sentAt}</span>
          </div>
          <div className="wave" aria-hidden="true">
            {BARS.map((h, i) => (
              <span key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
        </section>

        <section className="card card-pad" aria-label="Score" style={{ padding: '18px 16px', gap: 14 }}>
          <div className="score">
            <span className="score-num">{pct}%</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>likely synthetic</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="meter" role="img" aria-label={`Score ${pct} out of 100`}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Likely real</span>
              <span>Likely synthetic</span>
            </div>
          </div>
          <p style={{ margin: 0, paddingTop: 12, borderTop: '1px solid var(--line-soft)', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            Shown as a red flag, not a verdict. A bad line can make a real voice score high, and a good fake can score low.{' '}
            <strong style={{ color: 'var(--ink)' }}>The call to {data.speaker.split(' ')[0]} decides.</strong>
          </p>
        </section>

        <section className="card card-pad" aria-label="Face check">
          <span className="grow" style={{ gap: 3 }}>
            <span className="row-title">Face check · not run</span>
            <span className="row-detail">Sends {data.faceFrames} video frames of this speaker to the cloud for a score.</span>
          </span>
          <button className="btn secondary small" onClick={onCheckFace}>
            Check video frames
          </button>
        </section>

        <p className="hint" style={{ textAlign: 'left', display: 'flex', gap: 8 }}>
          <span className="note-icon">{Icon.lock(14)}</span>
          The clip is deleted after scoring. No caption text was sent with it.
        </p>
      </main>
    </>
  );
}
