import { useEffect, useRef, useState } from 'react';
import { DEMO_KNOWN_BAD } from '../../extension/src/demo/fixtures';
import { candidatesFromText, matchKnown } from '../../extension/src/lib/checks/known';
import { decide } from '../../extension/src/lib/rules/engine';
import type { Signal, Source, Tactic, Verdict } from '../../extension/src/lib/types';
import { CONFIGURED } from './api';
import { PARTLY_CHECKED } from '../../extension/src/lib/ai/fallback';
import { explain, nanoStatus, readTactics, type Explanation, type NanoStatus, type ReadResult } from './hybrid';
import { line, Reveal } from '../../extension/src/lib/transitions';
import { FileCheck } from './FileCheck';
import { InstallHint } from './Install';
import { forgetSharedParam, takeShared } from './share';
import { Brand, Version } from './ui';

/*
 * /try: the hosted way for judges to see Step 1 and the explanation run through Firebase AI Logic,
 * with nothing to install. The verdict comes from the extension's own rules engine, and known scam
 * details are matched against the demo company's list (labelled as such).
 */

const SAMPLE = `Hi Rina, it's Budi. I'm in the board meeting so I can't talk. We need to pay Sinar today before 3pm or we lose the deal. Use the new account: Bank Teluk 1234569032. I approve it myself, no need to go through Sari. Keep this between us until it's announced.`;

const LABEL: Record<Tactic, string> = {
  urgency: 'Urgency',
  secrecy: 'Secrecy',
  authority: 'Authority',
  skips_process: 'Skips the process',
  new_payment_details: 'New payment details',
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function signalsFrom(text: string, read: ReadResult): Signal[] {
  const out: Signal[] = [];
  const kinds = [...new Set(read.hits.map((h) => h.tactic))];
  if (kinds.length) {
    out.push({
      kind: 'pressure_tactics',
      step: 'read',
      source: read.source,
      title: 'Pressure in the request',
      detail: `${list(kinds.map((k) => LABEL[k].toLowerCase())).replace(/^./, (c) => c.toUpperCase())} in the text.`,
      strength: kinds.length,
    });
  }
  for (const m of matchKnown(candidatesFromText(text), DEMO_KNOWN_BAD)) {
    if (!m.entry) continue;
    const account = m.entry.kind === 'account';
    out.push({
      kind: account ? 'known_bad_account' : 'known_bad_domain',
      step: 'match',
      source: 'on_device',
      title: account ? 'Known scam account' : 'Known scam domain',
      detail: `${m.entry.display} is in ${m.entry.count} confirmed scam${m.entry.count === 1 ? '' : 's'} on the demo list.`,
      seenCount: m.entry.count,
    });
  }
  return out;
}

const WHERE: Record<string, string> = {
  'gemini-nano': 'Gemini Nano, on this device',
  'gemini-cloud': 'Gemini, cloud (redacted text)',
  keywords: 'Keyword reader (no Firebase config)',
  'keywords-fallback': 'Keyword list (Gemini didn’t answer)',
  template: 'Built from the red flags',
};

function Ran({ source, reader }: { source: Source; reader: string }) {
  return <span className={`ran ${source}`}>{WHERE[reader] ?? reader}</span>;
}

export function TryPage() {
  const [text, setText] = useState('');
  const [nano, setNano] = useState<NanoStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ read: ReadResult; verdict: Verdict } | null>(null);
  const [why, setWhy] = useState<Explanation | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const [incoming, setIncoming] = useState<File | null>(null);
  const [shareNote, setShareNote] = useState('');
  const messageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void nanoStatus().then(setNano);
  }, []);

  // Shared from another app (Android's share sheet, through the service worker): load it once, then check it.
  useEffect(() => {
    const key = new URLSearchParams(location.search).get('shared');
    if (!key) return;
    forgetSharedParam();
    if (key === 'failed') return setShareNote('That share didn’t come through. Try again, or choose the file below.');
    void takeShared(key).then((shared) => {
      if (!shared || (!shared.file && !shared.text)) return setShareNote('That share was already opened. Share it again, or choose the file below.');
      if (shared.file) {
        setIncoming(shared.file);
        // A caption that came with it waits in the message box, unchecked.
        if (shared.text) setText(shared.text);
      } else {
        setText(shared.text);
        requestAnimationFrame(() => messageRef.current?.scrollIntoView({ block: 'start' }));
        void check(shared.text);
      }
    });
    // Once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = async (given?: string) => {
    const message = (given ?? text).trim();
    if (!message) return;
    setError('');
    setResult(null);
    setWhy(null);
    setBusy('Reading for pressure…');
    try {
      const read = await readTactics(message);
      const verdict = decide(signalsFrom(message, read));
      setResult({ read, verdict });
      requestAnimationFrame(() => resultRef.current?.focus());
      if (verdict.level === 'fishy') {
        setBusy('Gemini is explaining the red flags…');
        setWhy(await explain(verdict));
      }
    } catch (e) {
      console.warn('[FISHY] try failed', e);
      setError('The check did not finish. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const fishy = result?.verdict.level === 'fishy';
  // Gemini never read the message and the keyword list found nothing: that is not "Looks normal".
  const partly = !!result?.read.geminiFailed && !fishy;

  return (
    <main className="page try">
      <Brand sub="Try it in your browser" />

      <section className="stack">
        <h1>Is it real?</h1>
        <p className="lead">
          Got a picture, video, voice note or message you’re not sure about? Check it before you act on it. Gemini runs on this device when your
          browser has Gemini Nano, in the cloud otherwise.
        </p>
        <p className={`nano ${nano === 'available' ? 'on' : ''}`} role="status">
          {!CONFIGURED
            ? 'Preview without Firebase: a keyword reader stands in for Gemini.'
            : nano === null
              ? 'Looking for Gemini Nano…'
              : nano === 'available'
                ? 'Gemini Nano is ready in this browser: the text stays on this device.'
                : 'Gemini Nano is not available in this browser, so the cloud model reads a redacted copy.'}
        </p>
        <InstallHint />
        {shareNote && (
          <p className="notice" role="alert">
            {shareNote}
          </p>
        )}
      </section>

      <section className="stack anchor" aria-label="A file">
        <h2 className="try-h2">A picture, video or voice note</h2>
        <FileCheck incoming={incoming} />
      </section>

      <div className="stack anchor" ref={messageRef}>
        <h2 className="try-h2">A message</h2>
        <label htmlFor="message">Paste a message, an email or a chat</label>
        <textarea id="message" autoCapitalize="sentences" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="An email, a chat message or meeting captions…" rows={7} />
        <div className="row">
          <button className="link" onClick={() => setText(SAMPLE)}>
            Use the sample
          </button>
          <button className="btn primary grow" onClick={() => void check()} disabled={!text.trim() || !!busy}>
            {busy && !result ? 'Checking…' : 'Check it'}
          </button>
        </div>
        {busy && (
          <p className="muted" role="status">
            {busy}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>

      {result && (
        <Reveal as="section" key={result.read.hits.map((h) => h.quote).join('|') + result.verdict.flags.length} className="stack" aria-label="Result">
          <div className={line(1, `verdict ${fishy ? 'fishy' : partly ? 'look' : 'clear'}`)}>
            <span className="verdict-pill">{fishy ? 'Don’t act yet' : partly ? PARTLY_CHECKED.pill : 'No red flags'}</span>
            <h2 tabIndex={-1} ref={resultRef}>
              {fishy ? 'Something’s fishy.' : partly ? PARTLY_CHECKED.title : 'Looks normal.'}
            </h2>
            <span>
              {fishy
                ? `${result.verdict.flags.length} red flag${result.verdict.flags.length === 1 ? '' : 's'}. Don’t act on it until the person confirms on a number you already have.`
                : partly
                  ? PARTLY_CHECKED.line
                  : 'If it asks you to act, a call on a number you already have is still the safe step.'}
            </span>
          </div>

          {why && (
            <div className={line(2, 'card')}>
              <div className="card-head">
                <strong>Why this is risky</strong>
                <Ran source={why.source} reader={why.reader} />
              </div>
              <p className="explain">{why.text}</p>
            </div>
          )}

          <div className={line(3, 'card')}>
            <div className="card-head">
              <strong>Pressure found</strong>
              <Ran source={result.read.source} reader={result.read.geminiFailed ? 'keywords-fallback' : result.read.reader} />
            </div>
            {result.read.hits.length === 0 ? (
              <span className="muted">No pressure tactics in this text.</span>
            ) : (
              <ul className="hits">
                {result.read.hits.map((h, i) => (
                  <li key={i}>
                    <span className="hit-label">{LABEL[h.tactic]}</span>
                    <mark>{h.quote}</mark>
                  </li>
                ))}
              </ul>
            )}
            {result.read.sentToCloud && (
              <details>
                <summary>What the cloud model was sent</summary>
                <p className="sent">{result.read.sentToCloud}</p>
              </details>
            )}
          </div>

          {result.verdict.flags.length > 0 && (
            <div className={line(4, 'card')}>
              <strong>Red flags</strong>
              <ul className="flags">
                {result.verdict.flags.map((f) => (
                  <li key={f.kind}>
                    <span className="flag-title">{f.title}</span>
                    <span className="muted">{f.detail}</span>
                  </li>
                ))}
              </ul>
              <span className="muted">The verdict comes from fixed rules, not from the model: the same red flags always give the same verdict.</span>
            </div>
          )}

          {fishy && (
            <div className={line(5, 'card next')}>
              <strong>In the extension, FISHY would now call the real person</strong>
              <span className="muted">On the number on record, never one from the message. They press 1 or 2, then enter their PIN.</span>
              <a className="btn secondary" href="/?demo">
                See what the approver sees
              </a>
            </div>
          )}
        </Reveal>
      )}

      <p className="foot">
        FISHY does not store what you paste. Known scam details are matched against the demo company’s list. All names in the sample are made up.
      </p>
      <Version />
    </main>
  );
}
