import { ESCALATE_MINUTES } from '../../lib/config';
import { initials } from '../../lib/names';
import type { DirectoryPerson, Supplier } from '../../lib/types';
import { Privacy, Section } from '../components';


const SHADES = ['#10202e', '#2f4a5f', '#4c6577'];

export function Directory({ people, suppliers }: { people: DirectoryPerson[]; suppliers: Supplier[] }) {
  const ordered = [...people].sort((a, b) => (a.escalationOrder ?? 0) - (b.escalationOrder ?? 0));
  return (
    <main className="main">
      {/* The screen's name for screen readers; the tab above already shows it. */}
      <h1 className="visually-hidden">Directory</h1>
      <Section title="Approvers" aside="Called in this order">
        <ol className="rows surface">
          {ordered.length === 0 && <li className="check-row row-detail">No approvers on record yet.</li>}
          {ordered.map((p, i) => (
            <li key={p.id} className="check-row" style={{ alignItems: 'center' }}>
              <span className="avatar" style={{ background: SHADES[Math.min(i, SHADES.length - 1)] }} aria-hidden="true">
                {initials(p.name)}
              </span>
              <span className="grow">
                <span className="row-title">{p.name}</span>
                <span className="row-detail">
                  {p.role}, <span className="mono">{p.phoneMasked}</span>
                </span>
              </span>
              <span className="pills">
                <span className={`pill ${p.pinSet ? 'ok' : 'warn'}`}>{p.pinSet ? 'PIN set' : 'No PIN'}</span>
                {p.escalationOrder ? <span className="pill none">After {p.escalationOrder * ESCALATE_MINUTES} min</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Suppliers" aside="The account we usually pay">
        <ul className="rows surface">
          {suppliers.map((s) => (
            <li key={s.id} className="check-row" style={{ flexDirection: 'column', gap: 4 }}>
              <span className="row-title">{s.name}</span>
              <span className="mono supplier-account">
                {s.account.bank} {s.account.masked}
              </span>
              <span className="row-detail">
                {s.contact.name}, <span className="mono">{s.contact.phoneMasked}</span>
              </span>
              <span className="row-detail">{s.domain}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Privacy>FISHY only calls these numbers, never one from a message. Admins change them in the Firebase console.</Privacy>
    </main>
  );
}
