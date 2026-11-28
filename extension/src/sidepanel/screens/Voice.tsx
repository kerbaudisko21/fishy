import type { CSSProperties } from 'react';
import type { Evidence } from '../../lib/types';
import { DetailHead, Icon, Privacy } from '../components';

// Shape for the demo story, which has no real recording.
const DEMO_BARS = [30, 52, 40, 68, 84, 60, 44, 72, 90, 64, 38, 56, 80, 96, 70, 48, 34, 58, 76, 88, 62, 42, 66, 82, 94, 74, 50, 36, 54, 70, 86, 60, 40, 64, 78, 52, 32, 46, 30, 22].map((h) => h / 100);

interface Props {
  data: NonNullable<Evidence['voice']>;
  busy?: boolean;
  onBack: () => void;
  onRecordAgain?: () => void;
}

export function Voice({ data, busy, onBack, onRecordAgain }: Props) {
  const pct = Math.round(data.score * 100);
  const bars = data.levels?.length ? data.levels : DEMO_BARS;
  const verdict = pct >= 60 ? 'Likely synthetic' : pct >= 35 ? 'Unclear' : 'Likely real';
  return (
    <>
      <DetailHead title="Voice check" step="check" badges={[{ source: 'cloud', label: 'Cloud, only when you click' }]} onBack={onBack} />
      <main className="main">
        <section className="surface card-pad" aria-label="Score" style={{ gap: 14 }}>
          <div className="card-head">
            <span className="row-title">
              {data.speaker}, {data.seconds} s clip
            </span>
            {data.demo ? <span className="pill none">Demo score</span> : <span className="small">sent {data.sentAt}</span>}
          </div>
          <div className="wave" aria-hidden="true">
            {bars.map((h, i) => (
              <span key={i} style={{ height: `${Math.max(6, Math.round(h * 100))}%`, '--i': i } as CSSProperties} />
            ))}
          </div>
          <div className="score">
            <span className="score-num" style={pct < 60 ? { color: 'var(--ink)' } : undefined}>
              {pct}%
            </span>
            <span style={{ fontSize: 16, fontWeight: 650 }}>{verdict}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="meter" role="img" aria-label={`Score ${pct} out of 100`}>
              <span className="meter-pos" style={{ transform: `translateX(${pct}%)` }}>
                <i />
              </span>
            </div>
            <div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Likely real</span>
              <span>Likely synthetic</span>
            </div>
          </div>
          {onRecordAgain && (
            <button className="btn secondary small" onClick={onRecordAgain} disabled={busy}>
              {Icon.wave()}
              Record again
            </button>
          )}
        </section>

        <p className="note">
          <span className="note-icon">{Icon.phone(15)}</span>
          <span>
            A score supports the case but never decides it. <strong>The call on the number on record decides.</strong>
          </span>
        </p>

        <Privacy>The clip is deleted after scoring. No caption text goes with it.</Privacy>
      </main>
    </>
  );
}
