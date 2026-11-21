import { useEffect, useState } from 'react';
import { CONFIGURED, getAuditLog, getIncident, markHandled, turnOnAlerts, type Incident } from './api';
import { DEMO_AUDIT, DEMO_INCIDENT } from './demo';
import { Brand, when } from './ui';

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? '';
const DEMO = !CONFIGURED || params.has('demo');

/** The finance manager's view (deck screen 9) and the audit trail: a summary only, never the message. */
export function IncidentPage() {
  const [inc, setInc] = useState<Incident | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [alerts, setAlerts] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (DEMO) {
      setInc(DEMO_INCIDENT);
      setState('ready');
      return;
    }
    if (!id) return setState('missing');
    getIncident(id)
      .then((r) => {
        setInc(r);
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, []);

  const handle = async () => {
    if (!inc) return;
    setBusy(true);
    try {
      if (!DEMO) await markHandled(inc.id);
      setInc({ ...inc, handled: true });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!inc) return;
    const entries = DEMO ? DEMO_AUDIT : (await getAuditLog(inc.id)).entries;
    const text = [`FISHY audit log · incident ${inc.id}`, ...entries.map((e) => `${new Date(e.at).toISOString()}  ${e.what}`)].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `fishy-${inc.id}.txt` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const alertsOn = async () => {
    if (DEMO) return setAlerts('Alerts need the live Firebase project.');
    const r = await turnOnAlerts().catch(() => 'unsupported' as const);
    setAlerts(r === 'on' ? 'Alerts are on for this browser.' : r === 'denied' ? 'Notifications are blocked for this site.' : 'This browser cannot receive alerts.');
  };

  return (
    <main className="page dark">
      <Brand sub="Team alert" />

      {state === 'loading' && (
        <p className="muted" role="status">
          Loading…
        </p>
      )}
      {state === 'missing' && (
        <section className="panel" role="alert">
          <h1>Incident not found</h1>
          <span className="muted">Open it from the alert, or check that you are signed in as a finance manager.</span>
        </section>
      )}

      {inc && (
        <section className="panel" aria-label="Incident">
          <span className="muted">
            Incident {inc.id} · {when(inc.at)}
          </span>
          <h1>{inc.status === 'stopped' ? 'Stopped before the money moved' : inc.status === 'confirmed' ? 'Confirmed by the approver' : 'Check in progress'}</h1>
          <dl className="facts">
            <dt>Where</dt>
            <dd>{inc.where}</dd>
            <dt>Targeted</dt>
            <dd>{inc.targeted}</dd>
            <dt>Posed as</dt>
            <dd>{inc.posedAs}</dd>
            <dt>Asked for</dt>
            <dd>{inc.askedFor}</dd>
            <dt>Confirmed</dt>
            <dd>{inc.confirmed}</dd>
          </dl>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">
              {inc.flags.length} RED FLAG{inc.flags.length === 1 ? '' : 'S'}
            </span>
            <ul className="chips">
              {inc.flags.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Summary only. The captions and emails stayed on the staff member’s laptop.
          </p>
          <div className="stack" style={{ marginTop: 'auto' }}>
            <button className="btn brand" onClick={handle} disabled={busy || inc.handled}>
              {inc.handled ? 'Handled' : 'Mark as handled'}
            </button>
            <button className="btn ghost" onClick={download}>
              Download audit log
            </button>
          </div>
        </section>
      )}

      <div className="stack" style={{ gap: 6 }}>
        <button className="link light" onClick={alertsOn}>
          Turn on team alerts in this browser
        </button>
        {alerts && (
          <p className="muted" role="status" style={{ margin: 0, textAlign: 'center' }}>
            {alerts}
          </p>
        )}
      </div>
      {DEMO && <p className="foot">Demo data.</p>}
    </main>
  );
}
