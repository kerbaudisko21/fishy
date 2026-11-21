import type { Evidence } from '../../lib/types';
import { DetailHead, Icon, Privacy, Section } from '../components';

type Data = NonNullable<Evidence['tactics']>;

export function Tactics({ data, model, onBack, onPaste }: { data: Data; model?: string; onBack: () => void; onPaste: () => void }) {
  const badge = data.source === 'on_device' ? `On device, ${model ?? 'Gemini Nano'}` : 'Cloud, redacted text';
  return (
    <>
      <DetailHead title="Pressure in the request" step="read" badges={[{ source: data.source, label: badge }]} onBack={onBack} />
      <main className="main">
        <Section title="Tactics found">
          <div className="stat-grid">
            {data.counts.map((c) => (
              <div key={c.tactic} className="stat">
                <span className="stat-num">{c.count}×</span>
                <span className="stat-label">{c.label}</span>
                <span className="small">{c.example}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="From the captions" aside={data.window}>
          <div className="surface card-pad" style={{ gap: 12 }}>
            {data.captions.map((line) => (
              <div key={line.at} className="caption">
                <span className="small" style={{ fontWeight: 600 }}>
                  {line.speaker}, {line.at}
                </span>
                <p>{line.parts.map((p, i) => (p.tactic ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</p>
              </div>
            ))}
          </div>
        </Section>

        {data.pattern && (
          <section className="surface" aria-label="Matched pattern" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="tile-icon" style={{ margin: 0 }}>{Icon.shield()}</span>
            <span className="grow">
              <span className="row-title">Matches “{data.pattern}”</span>
              <span className="row-detail">Scam rules v{data.rulesVersion}</span>
            </span>
          </section>
        )}

        <button className="btn secondary" onClick={onPaste}>
          {Icon.clipboard()}
          Captions missing? Paste the text
        </button>

        <Privacy>
          {data.source === 'on_device' ? 'Read on this laptop. Captions are not stored.' : 'Nano was not ready, so redacted text went to the cloud. Nothing is stored.'}
        </Privacy>
      </main>
    </>
  );
}
