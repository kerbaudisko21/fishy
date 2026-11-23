import { useState } from 'react';
import { createPortal } from 'react-dom';
import { shareIncident } from '../../lib/data';
import { firstName } from '../../lib/names';
import { line, Reveal, useTextSwap } from '../../lib/transitions';
import { useFirstSeen } from '../motion';
import { waitingFor } from '../../lib/call-wait';
import type { CallStatus, CallTarget, PaymentRequest, Signal, Step, Verdict as VerdictT } from '../../lib/types';
import { FlagRow, Icon, Privacy, Section, SourceBadge, StepTrack, Tile, trackFor } from '../components';
import { Amount, money } from '../format';
import type { Screen } from '../routes';
import { useNow } from '../useCall';
import { useExplanation } from '../useExplanation';

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
  /** Clears this check and starts over. */
  onNewCheck: () => void;
  onOpenFlag: (kind: VerdictT['flags'][number]['kind']) => Screen | null;
  onOpen: (s: Screen) => void;
  onPaste: () => void;
  onDemo: () => void;
  /** Shown in a meeting until a voice check has run. */
  onVoice?: () => void;
}

const first = (name?: string) => firstName(name);
const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Tone = 'navy' | 'coral' | 'red' | 'green';

const GROUPS: Array<{ step: Exclude<Step, 'call'>; label: string }> = [
  { step: 'read', label: 'Read' },
  { step: 'check', label: 'Check' },
  { step: 'match', label: 'Match' },
];

/** The source most flags in a group share; only flags that differ show their own badge. */
function groupSource(flags: Signal[]) {
  const onDevice = flags.filter((f) => f.source === 'on_device').length;
  return onDevice >= flags.length - onDevice ? 'on_device' : 'cloud';
}

export function Verdict(p: Props) {
  const { request, verdict, call } = p;
  const target = p.targets.find((t) => t.id === p.targetId);
  const who = first(call.target?.name ?? target?.name);
  const n = verdict.flags.length;
  const now = useNow(call.state === 'ringing');
  const idle = call.state === 'idle';
  const waiting = !p.hasInput && idle;
  // A phone call, or the approval page when no call was placed: the panel says which.
  const wait = waitingFor({ who, phoneMasked: call.target?.phoneMasked ?? '' }, call.started);

  // The hero: one colour per state, one sentence.
  const hero: { tone: Tone; pill: string; title: string; line: string } | null = waiting
    ? { tone: 'navy', pill: 'Watching', title: 'Ready when money is asked for.', line: 'FISHY reads Meet captions and Gmail on this laptop, and stops you before you pay a scammer.' }
    : call.state === 'ringing'
      ? { tone: 'navy', pill: wait.pill, title: wait.title, line: wait.line }
      : call.state === 'no_answer' || call.state === 'escalated'
        ? { tone: 'navy', pill: 'No answer', title: call.escalatedTo ? `Calling ${first(call.escalatedTo)}…` : `${who} didn’t answer.`, line: 'Keep holding the payment.' }
        : call.state === 'not_me'
          ? { tone: 'red', pill: 'Do not pay', title: 'Not verified.', line: `The real ${who} says they did not ask for this. Stop the payment.` }
          : call.state === 'confirmed'
            ? { tone: 'green', pill: 'Confirmed', title: `${who} confirmed.`, line: 'They said yes and entered their PIN. Pay through the normal approval.' }
            : verdict.level === 'fishy'
              ? { tone: 'coral', pill: 'Hold the payment', title: 'Something’s fishy.', line: `${n} red flag${n === 1 ? '' : 's'}. Don’t pay until ${who} confirms on the number on record.` }
              : { tone: 'green', pill: 'No red flags', title: 'Looks normal.', line: 'For a payment, a call on the number on record is still the safe step.' };

  // Motion: the result plays in once per new result; the hero text replays on every state change.
  const sig = waiting ? 'waiting' : `${verdict.level}:${verdict.flags.map((f) => f.kind).join(',')}:${request?.amount.value ?? 0}`;
  const heroKey = waiting ? 'waiting' : call.state === 'idle' ? verdict.level : call.state;
  const intro = useFirstSeen(`result:${sig}`);
  const heroIntro = useFirstSeen(`hero:${sig}:${heroKey}`);
  let flagIndex = 0;

  const track = trackFor(verdict, call.state);
  // The incident report link, copied for the finance manager.
  const [shared, setShared] = useState<{ checkId: string; text: string } | null>(null);
  const copyReport = async () => {
    if (!call.checkId) return;
    const url = await shareIncident(call.checkId);
    if (!url) return setShared({ checkId: call.checkId, text: 'The report link could not be made. Try again in a moment.' });
    try {
      await navigator.clipboard.writeText(url);
      setShared({ checkId: call.checkId, text: 'Link copied. Send it to your finance manager; it works for 7 days.' });
    } catch {
      setShared({ checkId: call.checkId, text: url });
    }
  };
  const sharedLine = shared && shared.checkId === call.checkId ? shared.text : null;
  // Entrances play once per result, not on every return from an evidence screen.
  const scriptIntro = useFirstSeen(`script:${call.checkId ?? sig}`);
  const hint = useTextSwap(sharedLine ?? 'This result stays on the check’s record.');
  const ended = call.state === 'not_me' || call.state === 'confirmed';
  const calling = call.state === 'ringing' || call.state === 'escalated';

  // "Why this is risky": Gemini on the red flags only, never the message.
  const { explanation, writing } = useExplanation(
    verdict,
    {
      askedBy: request?.askedBy.name ? `${request.askedBy.name}${request.askedBy.role ? ` (${request.askedBy.role})` : ''}` : undefined,
      amount: request && request.amount.value > 0 ? money(request.amount.value, request.amount.currency) : undefined,
    },
    p.hasInput,
  );
  const whyIntro = useFirstSeen(`why:${explanation?.text ?? ''}`);

  return (
    <>
      {hero && (
        <section className={`hero ${hero.tone}`} aria-live={call.state === 'not_me' ? 'assertive' : 'polite'}>
          <div key={heroKey} className={`hero-body${heroIntro ? ' intro' : ''}`}>
            <span className="hero-pill">
              {hero.tone === 'coral' || hero.tone === 'red' ? Icon.bang(12) : hero.tone === 'green' ? Icon.check(12) : call.state === 'idle' ? <span className="pulse" /> : <span className="ringing">{Icon.phone(12)}</span>}
              {hero.pill}
            </span>
            <h1>{hero.title}</h1>
            <p>{hero.line}</p>
          </div>
          {call.state === 'ringing' && wait.approvalUrl && (
            <a className="escalate" href={wait.approvalUrl} target="_blank" rel="noreferrer">
              {Icon.phone(14)} Open the approval page
            </a>
          )}
          {call.state === 'ringing' && !wait.approvalUrl && call.escalateAt && p.escalateTo && (
            <p className="escalate">
              {Icon.clock()} No answer in {mmss(call.escalateAt - now)}: FISHY calls {p.escalateTo.name}, {p.escalateTo.role}
            </p>
          )}
          {!waiting && <StepTrack states={track} intro={intro} live={call.state === 'ringing' ? 'call' : undefined} />}
        </section>
      )}

      <main className={`main${p.hasInput && (idle || calling || ended) ? ' with-bar' : ''}${intro ? ' intro' : ''}`}>
        {p.busy && (
          <p className="status-line" role="status">
            <span className="spinner" aria-hidden="true" />
            {p.busy}
          </p>
        )}

        {waiting && (
          <>
            <Section title="Start a check">
              <div className="surface">
                <div className="start-row passive">
                  <span className="start-icon">{Icon.video()}</span>
                  <span className="grow">
                    <span className="row-title">In Google Meet</span>
                    <span className="row-detail">Turn on captions (CC). FISHY listens from there.</span>
                  </span>
                </div>
                <div className="start-row passive">
                  <span className="start-icon">{Icon.mail(18)}</span>
                  <span className="grow">
                    <span className="row-title">In Gmail</span>
                    <span className="row-detail">Open the email that asks for a payment.</span>
                  </span>
                </div>
                <button className="start-row action" onClick={p.onPaste}>
                  <span className="start-icon">{Icon.clipboard(18)}</span>
                  <span className="grow">
                    <span className="row-title">Paste or drop it here</span>
                    <span className="row-detail">A message, or an invoice PDF.</span>
                  </span>
                  <span className="flag-chevron">{Icon.chevron(16)}</span>
                </button>
              </div>
            </Section>

            <Section title="How it works">
              <ol className="how surface">
                <li>
                  <span className="how-num">1</span>
                  <span className="grow">
                    <span className="row-title">Read</span>
                    <span className="row-detail">Spots pressure: a rush, a secret, a boss skipping approval.</span>
                  </span>
                </li>
                <li>
                  <span className="how-num">2</span>
                  <span className="grow">
                    <span className="row-title">Check</span>
                    <span className="row-detail">The sender, the links and the invoice’s bank account.</span>
                  </span>
                </li>
                <li>
                  <span className="how-num">3</span>
                  <span className="grow">
                    <span className="row-title">Match</span>
                    <span className="row-detail">Accounts and domains already used in scams.</span>
                  </span>
                </li>
                <li>
                  <span className="how-num">4</span>
                  <span className="grow">
                    <span className="row-title">Call</span>
                    <span className="row-detail">Phones the real person on a number on record.</span>
                  </span>
                </li>
              </ol>
            </Section>

            <button className="btn secondary" onClick={p.onDemo}>
              Try the demo case
            </button>
          </>
        )}

        {call.state === 'not_me' && (
          <Section title="What to say now">
            <Reveal className="surface card-pad script" play={scriptIntro}>
              <p className={line(1, 'script-line')}>“I have to verify payment requests through our approval policy. I’ll call you back on the number we have on file.”</p>
              <span className={line(2, 'row-detail')}>Then leave the call. Don’t repeat the account details or send anything while you’re still on it.</span>
            </Reveal>
          </Section>
        )}

        {request && (
          <Section title="The request">
            <dl className="request surface">
              {request.askedBy.name && (
                <div>
                  <dt>Asked by</dt>
                  <dd>
                    {request.askedBy.name}
                    {request.askedBy.role && <span className="request-sub">{request.askedBy.role}</span>}
                  </dd>
                </div>
              )}
              {request.amount.value > 0 && (
                <div>
                  <dt>Amount</dt>
                  <dd>
                    <Amount value={request.amount.value} currency={request.amount.currency} />
                    {request.dueText && <span className="request-sub">{request.dueText}</span>}
                  </dd>
                </div>
              )}
              <div>
                <dt>Pay to</dt>
                <dd>
                  {request.payee ? (
                    <>
                      {request.payee.name}
                      <span className="request-sub mono">
                        {request.payee.bank} {request.payee.accountMasked}
                      </span>
                    </>
                  ) : (
                    <span className="request-sub">No account named yet</span>
                  )}
                </dd>
              </div>
            </dl>
          </Section>
        )}

        {/* Once the person has answered, the call decided it; the advice to call would be stale. */}
        {(explanation || writing) && !ended && (
          <Section
            title="Why this is risky"
            aside={explanation ? explanation.model === 'template' ? 'Built from the red flags' : <SourceBadge source={explanation.source} label={explanation.source === 'on_device' ? 'Gemini Nano, on device' : 'Gemini, cloud'} /> : undefined}
          >
            <div className="surface card-pad" aria-live="polite" aria-busy={writing}>
              {explanation ? (
                <Reveal key={explanation.text} play={whyIntro}>
                  <p className={line(1, 'explain')}>{explanation.text}</p>
                </Reveal>
              ) : (
                <p className="explain">
                  <span className="t-shimmer" data-text="Gemini is reading the red flags…">
                    Gemini is reading the red flags…
                  </span>
                </p>
              )}
            </div>
          </Section>
        )}

        {n > 0 && (
          <Section title={`${n} red flag${n === 1 ? '' : 's'}`} label="Red flags" aside="Tap one for the evidence">
            <div className="surface flags">
              {GROUPS.map((g) => {
                const flags = verdict.flags.filter((f) => f.step === g.step);
                if (!flags.length) return null;
                const source = groupSource(flags);
                return (
                  <div key={g.step} className="flag-group">
                    <div className="group-head">
                      <span>{g.label}</span>
                      <SourceBadge source={source} />
                    </div>
                    {flags.map((f) => {
                      const screen = p.onOpenFlag(f.kind);
                      return <FlagRow key={f.kind} index={flagIndex++} flag={f} showSource={f.source !== source} onOpen={screen ? () => p.onOpen(screen) : undefined} />;
                    })}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {call.state === 'not_me' && (
          <p className="note">
            <span className="note-icon" style={{ color: 'var(--ok)' }}>{Icon.check(15)}</span>
            Once {who} confirms with their PIN, the account, domain and number in this request join the known-scam list.
          </p>
        )}

        {p.hasInput && idle && (
          <Section title="Check more">
            <div className="tiles">
              {p.onVoice && <Tile icon={Icon.wave(20)} title="Voice" detail="10 s clip" onClick={p.onVoice} disabled={!!p.busy} />}
              <Tile icon={Icon.clipboard(20)} title="Paste or drop" detail="A message or invoice" onClick={p.onPaste} />
            </div>
          </Section>
        )}

        <Privacy>Message text stays on this laptop. Without Gemini Nano, only redacted text goes to the cloud.</Privacy>
      </main>

      {/* In <body>, so the screen's slide-in transform doesn't move a fixed bar. */}
      {p.hasInput && idle && createPortal(
        <div className={`action-bar${intro ? ' intro' : ''}`}>
          {p.targets.length > 1 && (
            <label className="target">
              <span>Confirm with</span>
              <select value={p.targetId} onChange={(e) => p.onTarget(e.target.value)}>
                {p.targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}, {t.role}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button className="btn primary" onClick={p.onCall} disabled={!target}>
            {Icon.phone()}
            Call {first(target?.name)} on record
          </button>
          <span className="bar-hint">{target ? 'Number from Directory, never from the message.' : 'No one on record to call yet. Add approvers in the Firebase console.'}</span>
        </div>,
        document.body,
      )}
      {calling &&
        createPortal(
          <div className="action-bar">
            <button className="btn secondary" onClick={p.onCancel}>
              Cancel call
            </button>
          </div>,
          document.body,
        )}
      {p.hasInput && ended &&
        createPortal(
          <div className="action-bar intro">
            <button className="btn primary" onClick={p.onNewCheck}>
              {call.state === 'confirmed' ? 'Done, start a new check' : 'Start a new check'}
            </button>
            {call.checkId && (
              <button className="btn secondary" onClick={() => void copyReport()}>
                Copy the incident report link
              </button>
            )}
            <span className="bar-hint" role="status">
              <span ref={hint.ref} className="t-text-swap">
                {hint.shown}
              </span>
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}
