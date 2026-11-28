import { useEffect, useState } from 'react';
import { answerApproval, CONFIGURED, getApproval, type ApprovalRequest } from './api';
import { DEMO_APPROVAL } from './demo';
import { firstName, moneyParts } from '../../extension/src/lib/names';
import { line, Reveal, useErrorShake } from '../../extension/src/lib/transitions';
import { Brand, Version } from './ui';

type Step = 'loading' | 'ask' | 'pin' | 'done' | 'invalid' | 'offline' | 'locked';
type Answer = 'yes' | 'no';

/** The server's refusal, e.g. "not-found" from a callable function's "functions/not-found". */
const codeOf = (e: unknown) => String((e as { code?: string })?.code ?? '').replace(/^functions\//, '');
// The server closes the link after three wrong PINs.
const PIN_TRIES = 3;
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

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
  const [wrong, setWrong] = useState(0);
  const [now, setNow] = useState(Date.now());
  const pinField = useErrorShake();

  // The time left on the link, so the person on the phone knows how long they have.
  useEffect(() => {
    if (step !== 'ask' && step !== 'pin') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step]);
  useEffect(() => {
    if (req && !DEMO && (step === 'ask' || step === 'pin') && now >= req.expiresAt) setStep('invalid');
  }, [now, req, step]);

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
      // Only a refusal means the link is gone. Anything else is the connection, and a reload may fix it.
      .catch((e) => setStep(codeOf(e) === 'not-found' ? 'invalid' : 'offline'));
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
    } catch (e) {
      const code = codeOf(e);
      if (code === 'permission-denied') {
        const left = PIN_TRIES - (wrong + 1);
        setWrong((w) => w + 1);
        setPin('');
        setError(left > 0 ? `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That PIN is not right.');
        pinField.shake();
      } else if (code === 'resource-exhausted') {
        // Too many wrong PINs for this person in a day: no PIN works now, so do not ask for another.
        setStep('locked');
      } else if (code === 'not-found') {
        setStep('invalid');
      } else {
        setError('Your answer was not sent. Check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const parts = req ? moneyParts(req.amount.value, req.amount.currency) : null;

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
          <h1>This link no longer works</h1>
          <span className="muted">
            It has expired, was already answered, or was closed after three wrong PINs. Each link works once, for 10 minutes. Ask the finance team to start a new check.
          </span>
        </section>
      )}

      {step === 'offline' && (
        <section className="card" role="alert">
          <h1>The request didn’t load</h1>
          <span className="muted">Check your connection, then try again. The link still works until it expires.</span>
          <button className="btn secondary" onClick={() => location.reload()}>
            Try again
          </button>
        </section>
      )}

      {req && step !== 'invalid' && step !== 'loading' && (
        <section className="card" aria-label="The request">
          <span className="muted">{firstName(req.approverName, 'Hello')}, someone asked for this in your name</span>
          <span className="amount money">
            {parts?.currency && <span className="money-cur">{parts.currency}</span>}
            <span className="money-num">{parts?.number}</span>
          </span>
          <span>to {req.payee}</span>
          <span className="muted">{req.context}</span>
          {(step === 'ask' || step === 'pin') && !DEMO && (
            <span className="expires">
              This link expires in <strong>{mmss(req.expiresAt - now)}</strong>
            </span>
          )}
        </section>
      )}

      {step === 'ask' && (
        <Reveal key="ask" className="stack">
          <h1 className={line(1)}>Did you ask for this payment?</h1>
          {/* The reveal moves a wrapper, so a button keeps its own states (pressed, disabled). */}
          <div className={line(2)}>
            <button className="btn danger" onClick={() => pick('no')}>
              No, it wasn’t me
            </button>
          </div>
          <div className={line(3)}>
            <button className="btn secondary" onClick={() => pick('yes')}>
              Yes, I asked for it
            </button>
          </div>
        </Reveal>
      )}

      {step === 'pin' && (
        <Reveal key="pin" className="stack">
          <h1 className={line(1)}>Enter your PIN</h1>
          <p className={line(2, 'muted')} style={{ margin: 0 }}>
            You answered <strong>{answer === 'yes' ? '“Yes, I asked for it”' : '“No, it wasn’t me”'}</strong>. Your PIN proves it’s you.
          </p>
          <label htmlFor="pin" className={line(3)}>
            4-digit PIN
          </label>
          <div ref={pinField.wrap} className={line(4, 't-input-wrap')}>
          <div ref={pinField.input} className="t-input">
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="done"
            autoFocus
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              pinField.clear();
            }}
            onKeyDown={(e) => e.key === 'Enter' && void confirm()}
          />
          </div>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className={line(5)}>
            <button className="btn primary" onClick={confirm} disabled={busy || pin.length !== 4}>
              {busy ? 'Checking…' : 'Confirm'}
            </button>
          </div>
          <div className={line(6)}>
            <button className="link" onClick={() => setStep('ask')}>
              Change my answer
            </button>
          </div>
        </Reveal>
      )}

      {step === 'locked' && (
        <section className="card" role="alert">
          <h1>Your PIN is locked</h1>
          <span className="muted">
            Too many wrong PINs were entered for you in the last day, so no PIN works for now.{' '}
            {answer === 'no' ? 'Your answer “No, it wasn’t me” was recorded, but it is not proven with your PIN.' : 'Nothing was confirmed.'} Tell the finance team to reach you another way.
          </span>
        </section>
      )}

      {step === 'done' && answer === 'no' && (
        <Reveal as="section" role="status" className="result danger">
          <strong className={line(1)}>Payment stopped</strong>
          <span className={line(2)}>The finance team now sees “Not verified. Do not pay.”</span>
          <span className={line(3)}>Someone is using your name. Tell your team that any payment “from you” today needs a call back on the number on record.</span>
        </Reveal>
      )}
      {step === 'done' && answer === 'yes' && (
        <Reveal as="section" role="status" className="result ok">
          <strong className={line(1)}>Confirmed</strong>
          <span className={line(2)}>The finance team now sees that you approved. The red flags stay on the check’s record.</span>
        </Reveal>
      )}

      <p className="foot">
        {DEMO ? 'Demo data. ' : ''}The same check as the phone menu, for when a call can’t reach you. This link works once and expires in 10 minutes.
      </p>
      <Version />
    </main>
  );
}
