import type { DirectoryPerson } from '../../lib/types';

export function Directory({ people }: { people: DirectoryPerson[] }) {
  const ordered = [...people].sort((a, b) => (a.escalationOrder ?? 0) - (b.escalationOrder ?? 0));
  return (
    <main className="main">
      <p className="card" style={{ margin: 0, padding: '12px 14px', fontSize: 13, background: 'var(--note)', border: 0 }}>
        Numbers are set by your admin. FISHY only calls these, never a number from a message.
      </p>
      <section className="card" aria-label="Approvers" style={{ overflow: 'hidden' }}>
        <h2 style={{ fontSize: 16, padding: '14px 16px 10px' }}>Approvers</h2>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ordered.map((p) => (
            <li key={p.id} style={{ padding: '12px 16px', borderTop: '1px solid var(--line-soft)', display: 'grid', gap: 2 }}>
              <strong style={{ fontSize: 14 }}>{p.name}</strong>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                {p.role} · <span style={{ fontFamily: 'var(--font-mono)' }}>{p.phoneMasked}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
