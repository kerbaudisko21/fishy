import type { Evidence } from '../../lib/types';
import { CheckList, DetailHead, Icon, LinkCard } from '../components';
import { money } from '../format';

export function Invoice({ data, onBack, onOpenKnown }: { data: Evidence['invoice']; onBack: () => void; onOpenKnown: () => void }) {
  const n = data.usual.months.length;
  return (
    <>
      <DetailHead title="Bank account changed" step="STEP 2 · CHECK" badges={[{ source: 'on_device', label: 'On device · PDF read locally' }]} onBack={onBack} />
      <main className="main">
        <section className="card" aria-label="Invoice" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span className="grow" style={{ gap: 3 }}>
            <span className="row-title">
              {data.number} · {data.supplier}
            </span>
            <span className="row-detail">
              {data.due} · from {data.from}
            </span>
          </span>
          <span style={{ fontFamily: 'var(--font-head)', fontSize: 18, fontWeight: 700 }}>{money(data.amount.value, data.amount.currency)}</span>
        </section>

        <section className="card clip" aria-label="Bank details compared">
          <div className="compare flagged" style={{ padding: 16 }}>
            <span className="eyebrow flagged">ON THIS INVOICE · NEW</span>
            <span className="mono big">
              {data.newAccount.bank} {data.newAccount.masked}
            </span>
            <span className="row-detail">Account name: {data.newAccount.holder}</span>
          </div>
          <div className="compare" style={{ padding: 16, gap: 10 }}>
            <span className="eyebrow ok">PAID THE LAST {n} TIMES</span>
            <span className="mono big">
              {data.usual.bank} {data.usual.masked}
            </span>
            <span className="row-detail">Account name: {data.usual.holder}</span>
            <ol className="history" aria-label="Payment history">
              {data.usual.months.map((m) => (
                <li key={m}>
                  <span />
                  {m}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-label="Edit traces">
          <CheckList title="Edit traces in the PDF" items={data.traces} />
        </section>

        {data.knownScams > 0 && (
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
