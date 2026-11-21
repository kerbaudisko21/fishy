import type { Evidence } from '../../lib/types';
import { DetailHead, Icon, Note, Section } from '../components';

export function KnownScams({ data, onBack }: { data: NonNullable<Evidence['known']>; onBack: () => void }) {
  return (
    <>
      <DetailHead title="Known scams" step="match" badges={[{ source: 'on_device', label: 'On device, local list' }]} onBack={onBack} />
      <main className="main">
        <Section title="Details in this request" aside={`List updated ${data.updated}`}>
          <div className="surface">
            {data.matches.map((m) => (
              <div key={m.value} className={`match${m.count > 1 ? ' hot' : ''}`}>
                <div className="card-head">
                  <span className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                    {m.value}
                  </span>
                  <span className={`pill ${m.count > 1 ? 'strong' : m.count === 1 ? 'soft' : 'none'}`}>
                    {m.count === 0 ? 'No match' : `${m.count} scam${m.count === 1 ? '' : 's'}`}
                  </span>
                </div>
                {m.events && (
                  <ol className="events">
                    {m.events.map((e) => (
                      <li key={e.date}>
                        <span className="date">{e.date}</span>
                        <span>{e.what}</span>
                      </li>
                    ))}
                  </ol>
                )}
                {m.note && <span className="row-detail">{m.note}</span>}
              </div>
            ))}
          </div>
        </Section>

        {data.pattern && (
          <Section title="Scam pattern" aside={`Rules v${data.rulesVersion}`}>
            <div className="surface card-pad" style={{ gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700 }}>{data.pattern.name}</span>
              <ul className="bullets">
                {data.pattern.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </Section>
        )}

        <Note dark icon={Icon.users()}>
          Every “not me” on a call adds its account, domain and number here for all FISHY teams. No message text is shared.
        </Note>
      </main>
    </>
  );
}
