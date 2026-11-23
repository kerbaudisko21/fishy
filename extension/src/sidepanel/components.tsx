import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CallState, CheckItem, Signal, SignalKind, Source, Step, Verdict } from '../lib/types';

/* ---------- Icons (inline stroke SVG, decorative) ---------- */

const svg = (size: number, children: ReactNode, strokeWidth = 1.8) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  chip: (s = 11) => svg(s, <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>, 2.2),
  cloud: (s = 12) => svg(s, <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.25 4.25 0 0 0 7 18z" />, 2),
  chevron: (s = 18) => svg(s, <path d="M9 6l6 6-6 6" />, 2),
  back: (s = 16) => svg(s, <path d="M15 6l-6 6 6 6" />, 2),
  lock: (s = 15) => svg(s, <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
  shield: (s = 18) => svg(s, <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />),
  file: (s = 18) => svg(s, <><path d="M14 3H6v18h12V7l-4-4z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>),
  database: (s = 18) => svg(s, <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></>),
  users: (s = 18) => svg(s, <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>),
  clipboard: (s = 15) => svg(s, <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9z" /></>),
  check: (s = 13) => svg(s, <path d="M5 12.5l4.5 4.5L19 7" />, 2.6),
  bang: (s = 13) => svg(s, <path d="M12 6v8M12 18v.5" />, 2.6),
  mail: (s = 13) => svg(s, <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>, 2),
  clock: (s = 16) => svg(s, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  phone: (s = 18) => svg(s, <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />, 1.9),
  sliders: (s = 18) => svg(s, <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>),
  wave: (s = 16) => svg(s, <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />),
  upload: (s = 16) => svg(s, <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></>),
  bank: (s = 18) => svg(s, <><path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></>),
  speech: (s = 18) => svg(s, <><path d="M4 5h16v11H9l-5 4V5z" /><path d="M12 8v3M12 13.5v.01" /></>),
  link: (s = 18) => svg(s, <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  face: (s = 18) => svg(s, <><circle cx="12" cy="12" r="9" /><path d="M9 10v.01M15 10v.01M9 15c1.7 1.3 4.3 1.3 6 0" /></>),
  video: (s = 18) => svg(s, <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3" /></>),
};

/** One icon per kind of red flag, so a list of flags can be scanned without reading. */
export function flagIcon(kind: SignalKind, size = 18) {
  switch (kind) {
    case 'pressure_tactics':
      return Icon.speech(size);
    case 'bank_account_changed':
    case 'known_bad_account':
      return Icon.bank(size);
    case 'pdf_edited':
      return Icon.file(size);
    case 'lookalike_sender':
    case 'sender_auth_failed':
    case 'young_domain':
    case 'known_bad_domain':
      return Icon.mail(size);
    case 'unsafe_link':
      return Icon.link(size);
    case 'voice_score':
      return Icon.wave(size);
    case 'face_score':
      return Icon.face(size);
    default:
      return Icon.database(size);
  }
}

/* ---------- Shell ---------- */

export type Tab = 'verdict' | 'directory';

export function Header({
  where,
  demo,
  tab,
  onTab,
  onSettings,
}: {
  /** Where FISHY is listening right now, or null when it is only watching. */
  where: 'meet' | 'gmail' | 'paste' | null;
  demo: boolean;
  /** The tab bar shows only on the two top-level screens. */
  tab?: Tab;
  onTab: (t: Tab) => void;
  onSettings: () => void;
}) {
  const label = where === 'meet' ? 'Meet' : where === 'gmail' ? 'Gmail' : 'Pasted';
  return (
    <header className="header">
      <div className="header-row">
        <span className="brand">
          <img src="/icons/icon-48.png" alt="" />
          <span className="brand-word">FISHY</span>
        </span>
        <span className="header-tools">
          {demo && <span className="demo-tag">Demo</span>}
          {where && (
            <span className="live">
              {where === 'meet' ? <span className="live-dot" /> : where === 'gmail' ? Icon.mail(12) : Icon.clipboard(12)}
              <span className="live-label">{label}</span>
            </span>
          )}
          <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
            {Icon.sliders()}
          </button>
        </span>
      </div>
      {tab && <Tabs tab={tab} onTab={onTab} />}
    </header>
  );
}

/** Verdict / Directory, with one underline that slides between them. */
function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ verdict: null, directory: null });
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = refs.current[tab];
    if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
  }, [tab]);
  // Slide only after the first position is drawn, so the bar doesn't fly in on mount.
  useLayoutEffect(() => {
    if (!bar || ready) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [bar, ready]);

  return (
    <nav className="tabs" aria-label="Panel">
      {(['verdict', 'directory'] as const).map((t) => (
        <button
          key={t}
          ref={(el) => {
            refs.current[t] = el;
          }}
          className="tab"
          aria-current={tab === t ? 'page' : undefined}
          onClick={() => onTab(t)}
        >
          {t === 'verdict' ? 'Verdict' : 'Directory'}
        </button>
      ))}
      {bar && <span className={`tab-bar${ready ? ' ready' : ''}`} aria-hidden="true" style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w / 100})` }} />}
    </nav>
  );
}

export const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'read', label: 'Read' },
  { id: 'check', label: 'Check' },
  { id: 'match', label: 'Match' },
  { id: 'call', label: 'Call' },
];

export type StepState = 'done' | 'now' | 'todo' | 'flagged';

/** What each step found for the current check: the same states on the verdict and on every evidence screen. */
export function trackFor(verdict: Verdict, call: CallState): Record<Step, StepState> {
  const flagged = (s: Exclude<Step, 'call'>) => (verdict.flags.some((f) => f.step === s) ? 'flagged' : 'done');
  return {
    read: flagged('read'),
    check: flagged('check'),
    match: flagged('match'),
    call: call === 'confirmed' ? 'done' : call === 'not_me' ? 'flagged' : 'now',
  };
}

/** The current check's step states, for the small track on evidence screens. */
export const TrackContext = createContext<Record<Step, StepState> | null>(null);

/** The four steps on one line. Used in the verdict and, small, on every evidence screen. */
export function StepTrack({ states, small, intro, live, current }: { states: Record<Step, StepState>; small?: boolean; intro?: boolean; live?: Step; current?: Step }) {
  return (
    <ol className={`track${small ? ' small' : ''}${intro ? ' intro' : ''}`} aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s.id} className={`track-step ${states[s.id]}${live === s.id ? ' live' : ''}${current === s.id ? ' current' : ''}`} aria-current={current === s.id ? 'step' : undefined} style={{ '--i': i } as CSSProperties}>
          <span className="track-node" aria-hidden="true">
            {states[s.id] === 'done' ? Icon.check(small ? 9 : 11) : states[s.id] === 'flagged' ? Icon.bang(small ? 9 : 11) : small ? null : i + 1}
          </span>
          <span className="track-label">
            {s.label}
            <span className="visually-hidden">
              {states[s.id] === 'done' ? ', done' : states[s.id] === 'flagged' ? ', red flags' : states[s.id] === 'now' ? ', current step' : ', not yet'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, aside, children, label }: { title: ReactNode; aside?: ReactNode; children: ReactNode; label?: string }) {
  return (
    <section className="section" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <div className="section-head">
        <h2>{title}</h2>
        {aside && <span className="section-aside">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function SourceBadge({ source, label }: { source: Source; label?: string }) {
  return source === 'on_device' ? (
    <span className="badge on_device">
      {Icon.chip()}
      {label ?? 'On device'}
    </span>
  ) : (
    <span className="badge cloud">
      {Icon.cloud()}
      {label ?? 'Cloud'}
    </span>
  );
}

export function FlagRow({ flag, onOpen, showSource, index = 0 }: { flag: Signal; onOpen?: () => void; showSource?: boolean; index?: number }) {
  return (
    <button className="flag" onClick={onOpen} disabled={!onOpen} style={{ '--i': index } as CSSProperties}>
      <span className="flag-icon">{flagIcon(flag.kind)}</span>
      <span className="grow" style={{ gap: 3 }}>
        <span className="flag-title">{flag.title}</span>
        <span className="flag-detail">{flag.detail}</span>
        {showSource && (
          <span className="meta">
            <SourceBadge source={flag.source} label={flag.source === 'cloud' && flag.score !== undefined ? 'Cloud, on click' : undefined} />
          </span>
        )}
      </span>
      {onOpen && <span className="flag-chevron">{Icon.chevron(16)}</span>}
    </button>
  );
}

/** A big tap target with an icon, for the "check more" actions. */
export function Tile({ icon, title, detail, onClick, disabled }: { icon: ReactNode; title: string; detail?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button className="tile-btn" onClick={onClick} disabled={disabled}>
      <span className="tile-icon">{icon}</span>
      <span className="tile-title">{title}</span>
      {detail && <span className="tile-detail">{detail}</span>}
    </button>
  );
}

/* ---------- Detail screens ---------- */

const NUMBER: Record<Step, number> = { read: 1, check: 2, match: 3, call: 4 };

export function DetailHead({
  title,
  step,
  kicker,
  badges,
  onBack,
  backLabel = 'Back to the verdict',
}: {
  title: string;
  /** The step this evidence belongs to; draws the small step track. */
  step?: Step;
  /** A short line above the title on screens that are not a step. */
  kicker?: string;
  badges: Array<{ source: Source; label?: string }>;
  onBack: () => void;
  backLabel?: string;
}) {
  // The verdict's own step states, so a step flagged there is flagged here too.
  const track = useContext(TrackContext);
  const states = step
    ? (track ?? (Object.fromEntries(Object.entries(NUMBER).map(([k, n]) => [k, n < NUMBER[step] ? 'done' : n === NUMBER[step] ? 'now' : 'todo'])) as Record<Step, StepState>))
    : undefined;
  return (
    <div className="detail-head">
      <button className="back" onClick={onBack}>
        {Icon.back()}
        {backLabel}
      </button>
      {states ? (
        <div className="detail-step">
          <span>
            Step {NUMBER[step!]} of 4 · {step![0].toUpperCase() + step!.slice(1)}
          </span>
          <StepTrack states={states} small current={step} />
        </div>
      ) : (
        kicker && <span className="detail-kicker">{kicker}</span>
      )}
      <h1 tabIndex={-1}>{title}</h1>
      {badges.length > 0 && (
        <div className="meta wrap">
          {badges.map((b, i) => (
            <SourceBadge key={i} source={b.source} label={b.label} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CheckList({ title, items }: { title: string; items: CheckItem[] }) {
  const flagged = items.filter((c) => !c.ok).length;
  return (
    <Section title={title} aside={flagged ? `${flagged} red flag${flagged === 1 ? '' : 's'}` : 'All clear'}>
      <ul className="rows surface">
        {items.map((c) => (
          <li key={c.title} className="check-row">
            <span className={`dot ${c.ok ? 'ok' : 'flagged'}`}>{c.ok ? Icon.check() : Icon.bang()}</span>
            <span className="grow">
              <span className="row-title">{c.title}</span>
              <span className="row-detail">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function LinkCard({
  icon,
  title,
  detail,
  dark,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  dark?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`link-card${dark ? ' dark' : ''}`} onClick={onClick}>
      <span className="tile">{icon}</span>
      <span className="grow">
        <span className="row-title">{title}</span>
        <span className="row-detail">{detail}</span>
      </span>
      {Icon.chevron()}
    </button>
  );
}

export function Note({ children, icon = Icon.lock(), dark }: { children: ReactNode; icon?: ReactNode; dark?: boolean }) {
  return (
    <p className={`note${dark ? ' dark' : ''}`}>
      <span className="note-icon">{icon}</span>
      <span>{children}</span>
    </p>
  );
}

/** One quiet line about where the data went. */
export function Privacy({ children }: { children: ReactNode }) {
  return (
    <p className="privacy">
      <span className="note-icon">{Icon.lock(13)}</span>
      <span>{children}</span>
    </p>
  );
}
