import type { Evidence } from '../../lib/types';
import { CheckList, DetailHead, Icon, LinkCard, Privacy, Section } from '../components';

type Data = NonNullable<Evidence['email']>;

export function EmailLinks({ data, onBack, onOpenInvoice }: { data: Data; onBack: () => void; onOpenInvoice?: () => void }) {
  const lookalike = !!data.onRecord && data.sender.address.some((p) => p.changed);
  return (
    <>
      <DetailHead
        title={lookalike ? 'Lookalike sender' : 'Email and links'}
        step="check"
        badges={[{ source: 'on_device' }, { source: 'cloud', label: 'Cloud, links only' }]}
        onBack={onBack}
      />
      <main className="main">
        <Section title="Who sent it">
          <div className="surface">
            <div className={`compare${data.onRecord ? (lookalike ? ' flagged' : '') : ' ok'}`}>
              <span className={`eyebrow${lookalike ? ' flagged' : ''}`}>This email</span>
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
                <span className="eyebrow ok">On record, {data.onRecord.paidTimes === 1 ? 'paid once' : `paid ${data.onRecord.paidTimes} times`}</span>
                <span className="row-title">{data.onRecord.name}</span>
                <span className="mono">{data.onRecord.address}</span>
              </div>
            )}
          </div>
        </Section>

        <CheckList title="What we checked" items={data.checks} />

        {data.attachment && onOpenInvoice && (
          <LinkCard icon={Icon.file()} title={data.attachment} detail="Attached. See the invoice check" onClick={onOpenInvoice} />
        )}

        <Privacy>Safe links don’t make an email safe: most payment scams carry no bad link at all.</Privacy>
      </main>
    </>
  );
}
