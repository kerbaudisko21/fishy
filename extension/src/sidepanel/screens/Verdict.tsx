import type { CallStatus, CallTarget, PaymentRequest, Signal, Step, Verdict as VerdictT } from '../../lib/types';
import { FlagRow, Icon, Privacy, Section, SourceBadge, StepTrack, Tile, type StepState } from '../components';
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
  onDemo: () => void;
  /** Shown in a meeting until a voice check has run. */
  onVoice?: () => void;
}

const first = (name?: string) => name?.split(' ')[0] ?? 'them';
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

  // The hero: one colour per state, one sentence.
  const hero: { tone: Tone; pill: string; title: string; line: string } | null = waiting
    ? { tone: 'navy', pill: 'Watching', title: 'Ready when money is asked for.', line: 'FISHY reads Meet captions and Gmail on this laptop, and stops you before you pay a scammer.' }
    : call.state === 'ringing'
      ? { tone: 'navy', pill: 'Calling', title: `Calling the real ${who}…`, line: `${call.target?.phoneMasked ?? ''} from Directory. Waiting for them to press 1 or 2.` }
      : call.state === 'no_answer' || call.state === 'escalated'
        ? { tone: 'navy', pill: 'No answer', title: call.escalatedTo ? `Calling ${first(call.escalatedTo)}…` : `${who} didn’t answer.`, line: 'Keep holding the payment.' }
        : call.state === 'not_me'
          ? { tone: 'red', pill: 'Do not pay', title: 'Not verified.', line: `The real ${who} pressed 2: they did not ask for this. Your finance manager has been told.` }
          : call.state === 'confirmed'
            ? { tone: 'green', pill: 'Confirmed by phone', title: `${who} confirmed.`, line: 'Pressed 1 and entered the PIN. Pay through the normal approval.' }
            : verdict.level === 'fishy'
              ? { tone: 'coral', pill: 'Hold the payment', title: 'Something’s fishy.', line: `${n} red flag${n === 1 ? '' : 's'}. Don’t pay until ${who} confirms on the number on record.` }
              : { tone: 'green', pill: 'No red flags', title: 'Looks normal.', line: 'For a payment, a call on the number on record is still the safe step.' };

  const flagged = (s: Exclude<Step, 'call'>) => verdict.flags.some((f) => f.step === s);
  const track: Record<Step, StepState> = {
    read: flagged('read') ? 'flagged' : 'done',
    check: flagged('check') ? 'flagged' : 'done',
    match: flagged('match') ? 'flagged' : 'done',
    call: call.state === 'confirmed' ? 'done' : call.state === 'not_me' ? 'flagged' : 'now',
  };

  return (
    <>
      {hero && (
        <section className={`hero ${hero.tone}`} aria-live={call.state === 'not_me' ? 'assertive' : 'polite'}>
          <span className="hero-pill">
            {hero.tone === 'coral' || hero.tone === 'red' ? Icon.bang(12) : hero.tone === 'green' ? Icon.check(12) : call.state === 'idle' ? <span className="pulse" /> : Icon.phone(12)}
            {hero.pill}
          </span>
          <h1>{hero.title}</h1>
          <p>{hero.line}</p>
          {call.state === 'ringing' && call.escalateAt && p.escalateTo && (
            <p className="escalate">
              {Icon.clock()} No answer in {mmss(call.escalateAt - now)}: FISHY calls {p.escalateTo.name}, {p.escalateTo.role}
            </p>
          )}
          {!waiting && <StepTrack states={track} />}
        </section>
      )}

      <main className={`main${p.hasInput && (idle || call.state === 'ringing') ? ' with-bar' : ''}`}>
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
                <div className="start-row">
                  <span className="start-icon">{Icon.video()}</span>
                  <span className="grow">
                    <span className="row-title">In Google Meet</span>
                    <span className="row-detail">Turn on captions (CC). FISHY listens from there.</span>
                  </span>
                </div>
                <div className="start-row">
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
                    <span className="amount">{money(request.amount.value, request.amount.currency)}</span>
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
                      return <FlagRow key={f.kind} flag={f} showSource={f.source !== source} onOpen={screen ? () => p.onOpen(screen) : undefined} />;
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
            The account, domain and number in this request went on the known-scam list.
          </p>
        )}

        {p.hasInput && idle && (
          <Section title="Check more">
            <div className="tiles">
              {p.onVoice && <Tile icon={Icon.wave(20)} title="Voice" detail="10 s clip" onClick={p.onVoice} disabled={!!p.busy} />}
              <Tile icon={Icon.clipboard(20)} title="Paste text" detail="A message" onClick={p.onPaste} />
              <Tile icon={Icon.file(20)} title="Invoice" detail="PDF file" onClick={p.onPaste} />
            </div>
          </Section>
        )}

        <Privacy>Message text stays on this laptop. Without Gemini Nano, only redacted text goes to the cloud.</Privacy>
      </main>

      {p.hasInput && idle && (
        <div className="action-bar">
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
          <span className="bar-hint">Number from Directory, never from the message.</span>
        </div>
      )}
      {call.state === 'ringing' && (
        <div className="action-bar">
          <button className="btn secondary" onClick={p.onCancel}>
            Cancel call
          </button>
        </div>
      )}
    </>
  );
}
