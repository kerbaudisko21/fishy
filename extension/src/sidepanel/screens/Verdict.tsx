import type { CallState, PaymentRequest, Verdict as VerdictT } from '../../lib/types';
import { FlagRow } from '../components';
import { screenFor, type Screen } from '../routes';

interface Props {
  request: PaymentRequest;
  verdict: VerdictT;
  call: CallState;
  onCall: () => void;
  onPaste: () => void;
  onOpen: (s: Screen) => void;
}

const money = (v: number, c: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(v);

export function Verdict({ request, verdict, call, onCall, onPaste, onOpen }: Props) {
  const first = request.askedBy.name.split(' ')[0];
  const n = verdict.flags.length;

  return (
    <main className="main">
      <section className="card" aria-label="Request" style={{ padding: '14px 16px', fontSize: 13, display: 'grid', gap: 6 }}>
        <span>
          Asked by <strong>“{request.askedBy.name}, {request.askedBy.role}”</strong>
        </span>
        <span>
          <strong>{money(request.amount.value, request.amount.currency)}</strong>
          {request.dueText ? ` · ${request.dueText}` : ''}
        </span>
        <span>
          {request.payee.name} · {request.payee.bank} {request.payee.accountMasked}
        </span>
      </section>

      {call === 'idle' && verdict.level === 'fishy' && (
        <section className="verdict fishy" aria-live="polite">
          <span className="eyebrow">HOLD THE PAYMENT</span>
          <h1>Something’s fishy.</h1>
          <p>
            {n} red flag{n === 1 ? '' : 's'}. Don’t pay until the real {first} confirms on the number on record.
          </p>
        </section>
      )}
      {call === 'idle' && verdict.level === 'clear' && (
        <section className="verdict confirmed" aria-live="polite">
          <span className="eyebrow">NO RED FLAGS</span>
          <h1>Looks normal.</h1>
          <p>For any payment, a call-back to {first} is still the safe step.</p>
        </section>
      )}
      {call === 'ringing' && (
        <section className="verdict ringing" aria-live="polite">
          <span className="eyebrow">CALLING</span>
          <h1>Calling the real {first}…</h1>
          <p>On the number in Directory. Waiting for 1 or 2.</p>
        </section>
      )}
      {call === 'not_me' && (
        <section className="verdict not_me" aria-live="assertive">
          <span className="eyebrow">DO NOT PAY</span>
          <h1>Not verified.</h1>
          <p>The real {first} pressed 2: they did not ask for this payment.</p>
        </section>
      )}
      {call === 'confirmed' && (
        <section className="verdict confirmed" aria-live="polite">
          <span className="eyebrow">CONFIRMED BY PHONE</span>
          <h1>{first} confirmed.</h1>
          <p>Pressed 1 and entered the PIN. Pay through the normal approval.</p>
        </section>
      )}

      {n > 0 && (
        <section className="card" aria-label="Red flags" style={{ overflow: 'hidden' }}>
          <h2 style={{ fontSize: 17, padding: '14px 16px 10px' }}>
            {n} red flag{n === 1 ? '' : 's'}
          </h2>
          {verdict.flags.map((f) => (
            <FlagRow key={f.kind} flag={f} onOpen={() => onOpen(screenFor(f.kind))} />
          ))}
        </section>
      )}

      {call === 'idle' && (
        <>
          <button className="btn primary" onClick={onCall}>
            Call {first} on record
          </button>
          <p className="hint">Calls the number in Directory, never one from the message.</p>
          <button className="btn secondary" onClick={onPaste}>
            Paste text to check
          </button>
        </>
      )}
    </main>
  );
}
