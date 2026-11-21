import type { Evidence } from '../../lib/types';
import { DetailHead, Icon } from '../components';

type Data = NonNullable<Evidence['tactics']>;

export function Tactics({ data, model, onBack, onPaste }: { data: Data; model?: string; onBack: () => void; onPaste: () => void }) {
  const badge = data.source === 'on_device' ? `On device · ${model ?? 'Gemini Nano'}` : 'Cloud · redacted text';
  return (
    <>
      <DetailHead title="Pressure in the request" step="STEP 1 · READ" badges={[{ source: data.source, label: badge }]} onBack={onBack} />
      <main className="main">
        <section className="stat-grid" aria-label="Tactics found">
          {data.counts.map((c) => (
            <div key={c.tactic} className="stat">
              <span className="stat-num">{c.count}×</span>
              <span className="stat-label">{c.label}</span>
              <span className="small">{c.example}</span>
            </div>
          ))}
        </section>

        <section className="card card-pad" aria-label="From the captions" style={{ gap: 14 }}>
          <div className="card-head">
            <h2 className="card-title">From the captions</h2>
            <span className="small">{data.window}</span>
          </div>
          {data.captions.map((line) => (
            <div key={line.at} className="caption">
              <span className="small" style={{ fontWeight: 600 }}>
                “{line.speaker}” · {line.at}
              </span>
              <p>{line.parts.map((p, i) => (p.tactic ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</p>
            </div>
          ))}
        </section>

        {data.pattern && (
        <section className="card" aria-label="Matched pattern" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, background: 'var(--surface-muted)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Icon.shield()}
          </span>
          <span className="grow" style={{ gap: 4 }}>
            <span className="row-title">Matches “{data.pattern}”</span>
            <span className="row-detail">Pattern rules v{data.rulesVersion} from Remote Config. Same signals always give the same verdict.</span>
          </span>
        </section>
        )}

        <div className="note" style={{ flexDirection: 'column', gap: 10 }}>
          <span style={{ display: 'flex', gap: 8 }}>
            <span className="note-icon">{Icon.lock()}</span>
            {data.source === 'on_device'
              ? 'Read on this laptop. Captions are not stored; only the tactic tags are kept.'
              : 'Gemini Nano was not ready, so redacted text went to the cloud. Nothing is stored.'}
          </span>
          <button className="btn secondary small" onClick={onPaste}>
            {Icon.clipboard()}
            Captions missing? Paste text
          </button>
        </div>
      </main>
    </>
  );
}
