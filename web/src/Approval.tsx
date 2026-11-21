import { useEffect, useState } from 'react';
import { answerApproval, CONFIGURED, getApproval, type ApprovalRequest } from './api';
import { DEMO_APPROVAL } from './demo';
import { Brand, money } from './ui';

type Step = 'loading' | 'ask' | 'pin' | 'done' | 'invalid';
type Answer = 'yes' | 'no';

const params = new URLSearchParams(location.search);
// The link carries a one-time token only. The request details come from the server, never from the URL.
const token = params.get('t') ?? '';
const DEMO = !CONFIGURED || params.has('demo');

export function Approval() {
  const [req, setReq] = useState<ApprovalRequest | null>(null);
  const [step, setStep] = useState<Step>('loading');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (DEMO) {
      setReq(DEMO_APPROVAL);
      setStep('ask');
      return;
    }
    if (!token) return setStep('invalid');
    getApproval(token)
      .then((r) => {
        setReq(r);
        setStep(r.expiresAt > Date.now() ? 'ask' : 'invalid');
      })
      .catch(() => setStep('invalid'));
  }, []);

  const pick = (a: Answer) => {
    setAnswer(a);
    setPin('');
    setError('');
    setStep('pin');
  };

  const confirm = async () => {
    if (!answer || pin.length !== 4) return;
    setBusy(true);
    setError('');
    try {
      if (!DEMO) await answerApproval({ token, answer, pin });
      setStep('done');
    } catch {
      setError('That PIN did not work, or this link has expired.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <Brand sub={req ? `Payment check for ${req.company}` : 'Payment check'} />

      {step === 'loading' && (
        <p className="muted" role="status">
          Loading the request…
        </p>
      )}

      {step === 'invalid' && (
        <section className="card" role="alert">
          <h1>This link has expired</h1>
          <span className="muted">Each link works once, for 10 minutes. Ask the finance team to send a new check, or answer the phone call.</span>
        </section>
      )}

      {req && step !== 'invalid' && step !== 'loading' && (
        <section className="card" aria-label="The request">
          <span className="muted">{req.approverName.split(' ')[0]}, someone asked for this in your name</span>
          <span className="amount">{money(req.amount.value, req.amount.currency)}</span>
          <span>to {req.payee}</span>
          <span className="muted">{req.context}</span>
        </section>
      )}

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
          <p className="muted" style={{ margin: 0 }}>
            You answered <strong>{answer === 'yes' ? '“Yes, I asked for it”' : '“No, it wasn’t me”'}</strong>. Your PIN proves it’s you.
          </p>
          <label htmlFor="pin">4-digit PIN</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && void confirm()}
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
          <span>The finance team now sees “Not verified. Do not pay.” Your finance manager has the incident report.</span>
        </section>
      )}
      {step === 'done' && answer === 'yes' && (
        <section role="status" className="result ok">
          <strong>Confirmed</strong>
          <span>The finance team will see that you approved. The red flags stay on the record.</span>
        </section>
      )}

      <p className="foot">
        {DEMO ? 'Demo data. ' : ''}The same check as the phone menu, for when a call can’t reach you. This link works once and expires in 10 minutes.
      </p>
    </main>
  );
}
