import type { CSSProperties } from 'react';
import type { Evidence } from '../../lib/types';
import { CheckList, DetailHead, Icon, LinkCard, Section } from '../components';
import { money } from '../format';

type Data = NonNullable<Evidence['invoice']>;

export function Invoice({ data, onBack, onOpenKnown }: { data: Data; onBack: () => void; onOpenKnown?: () => void }) {
  const usual = data.usual;
  const changed = !!usual && usual.masked !== data.newAccount.masked;
  const title = changed ? 'Bank account changed' : usual ? 'Bank account matches' : 'Invoice check';
  const sub = [data.due, data.from && `from ${data.from}`].filter(Boolean).join(', ');

  return (
    <>
      <DetailHead title={title} step="check" badges={[{ source: 'on_device', label: 'On device, PDF read locally' }]} onBack={onBack} />
      <main className="main">
        <section className="surface" aria-label="Invoice" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span className="grow" style={{ gap: 3 }}>
            <span className="row-title">{data.supplier}</span>
            <span className="row-detail">
              {data.number}
              {sub ? `, ${sub}` : ''}
            </span>
          </span>
          {data.amount && <span style={{ fontFamily: 'var(--font-head)', fontSize: 20, fontWeight: 700 }}>{money(data.amount.value, data.amount.currency)}</span>}
        </section>

        <Section title="Where the money goes">
          <div className="surface">
            <div className={`compare${changed ? ' flagged' : ''}`} style={{ padding: 16 }}>
              <span className="compare-label">
                <span className={`eyebrow${changed ? ' flagged' : ''}`}>On this invoice</span>
                {changed && <span className="pill new">New account</span>}
              </span>
              <span className="mono big">
                {data.newAccount.bank} {data.newAccount.masked}
              </span>
              <span className="row-detail">{data.newAccount.holder}</span>
            </div>
            {usual ? (
              <div className="compare" style={{ padding: 16, gap: 8 }}>
                <span className="eyebrow ok">Paid the last {usual.months.length} times</span>
                <span className="mono big">
                  {usual.bank} {usual.masked}
                </span>
                <span className="row-detail">{usual.holder}</span>
                <ol className="history" aria-label="Payment history" style={{ gridTemplateColumns: `repeat(${Math.max(usual.months.length, 1)}, minmax(0, 1fr))` }}>
                  {usual.months.map((m, i) => (
                    <li key={`${m}-${i}`} style={{ '--i': i } as CSSProperties}>
                      <span />
                      {m}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="compare" style={{ padding: 16 }}>
                <span className="row-detail">This supplier isn’t in Directory, so there’s no account to compare. Call before paying.</span>
              </div>
            )}
          </div>
        </Section>

        <CheckList title="Edit traces in the PDF" items={data.traces} />

        {data.knownScams > 0 && onOpenKnown && (
          <LinkCard
            dark
            icon={Icon.database()}
            title="This account is on the known-scam list"
            detail={`Seen in ${data.knownScams} confirmed scam${data.knownScams === 1 ? '' : 's'}`}
            onClick={onOpenKnown}
          />
        )}
      </main>
    </>
  );
}
