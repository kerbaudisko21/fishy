import type { Evidence } from '../../lib/types';
import { CheckList, DetailHead, Icon, LinkCard } from '../components';
import { money } from '../format';

type Data = NonNullable<Evidence['invoice']>;

export function Invoice({ data, onBack, onOpenKnown }: { data: Data; onBack: () => void; onOpenKnown?: () => void }) {
  const usual = data.usual;
  const changed = !!usual && usual.masked !== data.newAccount.masked;
  const title = changed ? 'Bank account changed' : usual ? 'Bank account matches' : 'Invoice check';
  const sub = [data.due, data.from && `from ${data.from}`].filter(Boolean).join(' · ');

  return (
    <>
      <DetailHead title={title} step="STEP 2 · CHECK" badges={[{ source: 'on_device', label: 'On device · PDF read locally' }]} onBack={onBack} />
      <main className="main">
        <section className="card" aria-label="Invoice" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span className="grow" style={{ gap: 3 }}>
            <span className="row-title">
              {data.number} · {data.supplier}
            </span>
            {sub && <span className="row-detail">{sub}</span>}
          </span>
          {data.amount && (
            <span style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700 }}>{money(data.amount.value, data.amount.currency)}</span>
          )}
        </section>

        <section className="card clip" aria-label="Bank details compared">
          <div className={`compare${changed ? ' flagged' : ''}`} style={{ padding: 16 }}>
            <span className={`eyebrow${changed ? ' flagged' : ''}`}>ON THIS INVOICE{changed ? ' · NEW' : ''}</span>
            <span className="mono big">
              {data.newAccount.bank} {data.newAccount.masked}
            </span>
            <span className="row-detail">Account name: {data.newAccount.holder}</span>
          </div>
          {usual ? (
            <div className="compare" style={{ padding: 16, gap: 10 }}>
              <span className="eyebrow ok">PAID THE LAST {usual.months.length} TIMES</span>
              <span className="mono big">
                {usual.bank} {usual.masked}
              </span>
              <span className="row-detail">Account name: {usual.holder}</span>
              <ol className="history" aria-label="Payment history" style={{ gridTemplateColumns: `repeat(${Math.max(usual.months.length, 1)}, minmax(0, 1fr))` }}>
                {usual.months.map((m, i) => (
                  <li key={`${m}-${i}`}>
                    <span />
                    {m}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="compare" style={{ padding: 16 }}>
              <span className="row-detail">This supplier is not in Directory, so there is no account on record to compare with. Call before paying.</span>
            </div>
          )}
        </section>

        <section aria-label="Edit traces">
          <CheckList title="Edit traces in the PDF" items={data.traces} />
        </section>

        {data.knownScams > 0 && onOpenKnown && (
          <LinkCard
            dark
            icon={Icon.database()}
            title="This account is on the known-scam list"
            detail={`${data.knownScams} confirmed scam${data.knownScams === 1 ? '' : 's'} · see the match`}
            onClick={onOpenKnown}
          />
        )}
      </main>
    </>
  );
}
