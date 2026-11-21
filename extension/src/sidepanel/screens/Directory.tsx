import type { DirectoryPerson, Supplier } from '../../lib/types';
import { Icon, Note } from '../components';

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const SHADES = ['#10202e', '#2f4a5f', '#4c6577'];

export function Directory({ people, suppliers }: { people: DirectoryPerson[]; suppliers: Supplier[] }) {
  const ordered = [...people].sort((a, b) => (a.escalationOrder ?? 0) - (b.escalationOrder ?? 0));
  return (
    <main className="main">
      <Note>Numbers are set by your admin. FISHY only calls these, never a number from a message.</Note>

      <section className="card clip" aria-label="Approvers">
        <div className="card-head" style={{ padding: '14px 16px 10px' }}>
          <h2 className="card-title" style={{ padding: 0 }}>
            Approvers
          </h2>
          <span className="small">called in this order</span>
        </div>
        {ordered.length === 0 && <p className="row-detail" style={{ padding: '0 16px 14px', margin: 0 }}>No approvers on record yet.</p>}
        <ol className="rows">
          {ordered.map((p, i) => (
            <li key={p.id} className="check-row" style={{ alignItems: 'center' }}>
              <span className="avatar" style={{ background: SHADES[Math.min(i, SHADES.length - 1)] }} aria-hidden="true">
                {initials(p.name)}
              </span>
              <span className="grow">
                <span className="row-title">{p.name}</span>
                <span className="row-detail">
                  {p.role} · <span className="mono">{p.phoneMasked}</span>
                </span>
              </span>
              {p.escalationOrder ? (
                <span className="pill none">After {p.escalationOrder * 10} min</span>
              ) : (
                <span className="pill" style={{ background: p.pinSet ? 'var(--ok-bg)' : 'var(--amber-bg)', color: p.pinSet ? 'var(--ok)' : 'var(--amber-text)' }}>
                  {p.pinSet ? 'PIN set' : 'No PIN'}
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="card clip" aria-label="Suppliers">
        <h2 className="card-title">Suppliers</h2>
        <ul className="rows">
          {suppliers.map((s) => (
            <li key={s.id} className="check-row" style={{ flexDirection: 'column', gap: 4 }}>
              <span className="row-title">{s.name}</span>
              <span className="row-detail">
                {s.contact.name}, {s.contact.role.toLowerCase()} · <span className="mono">{s.contact.phoneMasked}</span>
              </span>
              <span className="row-detail">
                Pays to <span className="mono" style={{ color: 'var(--ink)' }}>{s.account.bank} {s.account.masked}</span> · {s.domain}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="hint" style={{ textAlign: 'left', display: 'flex', gap: 8 }}>
        <span className="note-icon">{Icon.lock(14)}</span>
        View only. Admins change numbers, PINs and accounts in the Firebase console.
      </p>
    </main>
  );
}
