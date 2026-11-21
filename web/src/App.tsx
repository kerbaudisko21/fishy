import { useState } from 'react';
import { answerApproval } from './api';

type Step = 'ask' | 'pin' | 'done';
type Answer = 'yes' | 'no';

// The link carries a one-time token only. The request details come from the server (TODO), never from the URL.
const token = new URLSearchParams(location.search).get('t') ?? '';

export function App() {
  const [step, setStep] = useState<Step>('ask');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = (a: Answer) => {
    setAnswer(a);
    setStep('pin');
  };

  const confirm = async () => {
    if (!answer || pin.length !== 4) return;
    setBusy(true);
    setError('');
    try {
      await answerApproval({ token, answer, pin });
      setStep('done');
    } catch {
      setError('That PIN did not work, or this link has expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <header className="brand">
        <img src="/apple-touch-icon.png" alt="" width={32} height={32} />
        <span>
          <strong>FISHY</strong>
          <small>Payment check</small>
        </span>
      </header>

      <section className="card" aria-label="The request">
        {/* TODO: load from the server with the token. Demo values for now. */}
        <span className="muted">Someone asked for this in your name</span>
        <span className="amount">$186,400</span>
        <span>to PT Sinar Logistik, Mandiri •••• 9032</span>
      </section>

      {step === 'ask' && (
        <div className="stack">
          <h1>Did you ask for this payment?</h1>
          <button className="btn danger" onClick={() => pick('no')}>
            No, it wasn’t me
          </button>
          <button className="btn secondary" onClick={() => pick('yes')}>
            Yes, I asked for it
          </button>
        </div>
      )}

      {step === 'pin' && (
        <div className="stack">
          <h1>Enter your PIN</h1>
          <label htmlFor="pin">4-digit PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="btn primary" onClick={confirm} disabled={busy || pin.length !== 4}>
            {busy ? 'Checking…' : 'Confirm'}
          </button>
          <button className="link" onClick={() => setStep('ask')}>
            Change my answer
          </button>
        </div>
      )}

      {step === 'done' && answer === 'no' && (
        <section role="status" className="result danger">
          <strong>Payment stopped</strong>
          <span>The finance team now sees “Not verified. Do not pay.”</span>
        </section>
      )}
      {step === 'done' && answer === 'yes' && (
        <section role="status" className="result ok">
          <strong>Confirmed</strong>
          <span>The finance team will see that you approved.</span>
        </section>
      )}

      <p className="foot">The same check as the phone menu. This link works once and expires in 10 minutes.</p>
    </main>
  );
}
