import type { Evidence } from '../../lib/types';
import { CheckList, DetailHead, Icon, LinkCard } from '../components';

type Data = NonNullable<Evidence['email']>;

export function EmailLinks({ data, onBack, onOpenInvoice }: { data: Data; onBack: () => void; onOpenInvoice?: () => void }) {
  return (
    <>
      <DetailHead
        title={data.onRecord && data.sender.address.some((p) => p.changed) ? 'Lookalike sender' : 'Email and links'}
        step="STEP 2 · CHECK"
        badges={[{ source: 'on_device' }, { source: 'cloud', label: 'Cloud · Web Risk' }]}
        onBack={onBack}
      />
      <main className="main">
        <section className="card clip" aria-label="Sender compared">
          <div className={`compare${data.onRecord ? '' : ' ok'}`}>
            <span className={`eyebrow${data.onRecord ? ' flagged' : ''}`}>THIS EMAIL</span>
            <span className="row-title">{data.sender.name}</span>
            <span className="mono">
              {data.sender.address.map((p, i) =>
                p.changed ? (
                  <span key={i} className="diff">
                    {p.text}
                  </span>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </span>
          </div>
          {data.onRecord && (
            <div className="compare ok">
              <span className="eyebrow ok">ON RECORD · PAID {data.onRecord.paidTimes} TIMES</span>
              <span className="row-title">{data.onRecord.name}</span>
              <span className="mono">{data.onRecord.address}</span>
            </div>
          )}
        </section>

        <CheckList title="What we checked" items={data.checks} />

        {data.attachment && onOpenInvoice && (
          <LinkCard icon={Icon.file()} title={data.attachment} detail="Attached · see the invoice check" onClick={onOpenInvoice} />
        )}

        <p className="hint" style={{ textAlign: 'left' }}>
          Links passing Web Risk does not make this email safe: business email scams often carry no bad link at all.
        </p>
      </main>
    </>
  );
}
