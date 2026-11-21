import type { CallStatus, CallTarget, PaymentRequest, Verdict as VerdictT } from '../../lib/types';
import { FlagRow, Icon } from '../components';
import { money } from '../format';
import type { Screen } from '../routes';
import { useNow } from '../useCall';

interface Props {
  request?: PaymentRequest;
  verdict: VerdictT;
  hasInput: boolean;
  busy: string | null;
  call: CallStatus;
  targets: CallTarget[];
  targetId: string;
  onTarget: (id: string) => void;
  escalateTo?: CallTarget;
  onCall: () => void;
  onCancel: () => void;
  onOpenFlag: (kind: VerdictT['flags'][number]['kind']) => Screen | null;
  onOpen: (s: Screen) => void;
  onPaste: () => void;
}

const first = (name?: string) => name?.split(' ')[0] ?? 'them';
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Verdict(p: Props) {
  const { request, verdict, call } = p;
  const target = p.targets.find((t) => t.id === p.targetId);
  const who = first(call.target?.name ?? target?.name);
  const n = verdict.flags.length;
  const now = useNow(call.state === 'ringing');

  return (
    <main className="main">
      {request && (
        <section className="card" aria-label="Request" style={{ padding: '14px 16px', fontSize: 13, display: 'grid', gap: 6 }}>
          {request.askedBy.name && (
            <span>
              Asked by <strong>“{request.askedBy.name}{request.askedBy.role ? `, ${request.askedBy.role}` : ''}”</strong>
            </span>
          )}
          {request.amount.value > 0 && (
            <span>
              <strong>{money(request.amount.value, request.amount.currency)}</strong>
              {request.dueText ? ` · ${request.dueText}` : ''}
            </span>
          )}
          <span>
            {request.payee.name} · {request.payee.bank} {request.payee.accountMasked}
          </span>
        </section>
      )}

      {p.busy && (
        <p className="status-line" role="status">
          <span className="spinner" aria-hidden="true" />
          {p.busy}
        </p>
      )}

      {!p.hasInput && call.state === 'idle' && (
        <section className="verdict waiting" aria-live="polite">
          <span className="eyebrow">WATCHING</span>
          <h1>Nothing to check yet.</h1>
          <p>Open a Meet with captions on, or open an email in Gmail. You can also paste a message or drop in an invoice.</p>
        </section>
      )}

      {p.hasInput && call.state === 'idle' && verdict.level === 'fishy' && (
        <section className="verdict fishy" aria-live="polite">
          <span className="eyebrow">HOLD THE PAYMENT</span>
          <h1>Something’s fishy.</h1>
          <p>
            {n} red flag{n === 1 ? '' : 's'}. Don’t pay until the real {who} confirms on the number on record.
          </p>
        </section>
      )}
      {p.hasInput && call.state === 'idle' && verdict.level === 'clear' && (
        <section className="verdict confirmed" aria-live="polite">
          <span className="eyebrow">NO RED FLAGS</span>
          <h1>Looks normal.</h1>
          <p>Before any payment, a call-back on the number on record is still the safe step.</p>
        </section>
      )}
      {call.state === 'ringing' && (
        <section className="verdict ringing" aria-live="polite">
          <span className="eyebrow">CALLING</span>
          <h1>Calling the real {who}…</h1>
          <p>
            {call.target?.phoneMasked}, from Directory. Waiting for them to press 1 or 2.
          </p>
          {call.escalateAt && p.escalateTo && (
            <p className="escalate">
              {Icon.clock()} No answer in {mmss(call.escalateAt - now)} → calls {p.escalateTo.name}, {p.escalateTo.role}
            </p>
          )}
        </section>
      )}
      {(call.state === 'no_answer' || call.state === 'escalated') && (
        <section className="verdict ringing" aria-live="polite">
          <span className="eyebrow">NO ANSWER</span>
          <h1>{call.escalatedTo ? `Calling ${first(call.escalatedTo)}…` : `${who} didn’t answer.`}</h1>
          <p>Keep holding the payment. FISHY moves to the next approver on record.</p>
        </section>
      )}
      {call.state === 'not_me' && (
        <section className="verdict not_me" aria-live="assertive">
          <span className="eyebrow">DO NOT PAY</span>
          <h1>Not verified.</h1>
          <p>The real {who} pressed 2: they did not ask for this payment. Your finance manager has been told.</p>
        </section>
      )}
      {call.state === 'confirmed' && (
        <section className="verdict confirmed" aria-live="polite">
          <span className="eyebrow">CONFIRMED BY PHONE</span>
          <h1>{who} confirmed.</h1>
          <p>Pressed 1 and entered the PIN. The red flags stay on the record; pay through the normal approval.</p>
        </section>
      )}

      {n > 0 && (
        <section className="card" aria-label="Red flags" style={{ overflow: 'hidden' }}>
          <div className="card-head" style={{ padding: '14px 16px 10px' }}>
            <h2 style={{ fontSize: 17 }}>
              {n} red flag{n === 1 ? '' : 's'}
            </h2>
            <span className="small">Tap one for the evidence</span>
          </div>
          {verdict.flags.map((f) => {
            const screen = p.onOpenFlag(f.kind);
            return <FlagRow key={f.kind} flag={f} onOpen={screen ? () => p.onOpen(screen) : undefined} />;
          })}
        </section>
      )}

      {p.hasInput && call.state === 'idle' && (
        <section className="stack" aria-label="Next step">
          {p.targets.length > 1 && (
            <div className="field">
              <label htmlFor="target">Who should confirm?</label>
              <select id="target" value={p.targetId} onChange={(e) => p.onTarget(e.target.value)}>
                {p.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}, {t.role}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn primary" onClick={p.onCall} disabled={!target}>
            {Icon.phone()}
            Call {first(target?.name)} on record
          </button>
          <p className="hint">Calls the number in Directory, never one from the message.</p>
        </section>
      )}
      {call.state === 'ringing' && (
        <button className="btn secondary" onClick={p.onCancel}>
          Cancel call
        </button>
      )}
      {call.state === 'not_me' && (
        <p className="note">
          <span className="note-icon" style={{ color: 'var(--ok)' }}>{Icon.check(15)}</span>
          The account, domain and number in this request were reported to the known-scam list.
        </p>
      )}

      {call.state === 'idle' && (
        <button className="btn secondary" onClick={p.onPaste}>
          {Icon.clipboard()}
          Paste text or check an invoice
        </button>
      )}

      <p className="hint" style={{ display: 'flex', gap: 8, textAlign: 'left' }}>
        <span className="note-icon">{Icon.lock(14)}</span>
        Captions and email text stay on this laptop with Gemini Nano. Without Nano, only redacted text goes to the cloud.
      </p>
    </main>
  );
}
