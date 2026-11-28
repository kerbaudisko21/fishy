import { createContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AiChip } from './AiStatus';
import { versionLine } from '../lib/version';
import type { CallState, CheckItem, Signal, SignalKind, Source, Step, Verdict } from '../lib/types';

/* ---------- Icons: FISHY's own set ----------
 * Drawn for FISHY, not taken from a stock set: square ends, sharp corners, one heavier stroke,
 * like marks cut into a stencil or ruled on an evidence form. Decorative (aria-hidden).
 */

const svg = (size: number, children: ReactNode, strokeWidth = 2.2) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  chip: (s = 11) => svg(s, <><path d="M6 6h12v12H6z" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>, 2.4),
  cloud: (s = 12) => svg(s, <path d="M5 18h14l2-4-3-4h-2l-2-4H9L7 10H5l-2 4z" />, 2.2),
  chevron: (s = 18) => svg(s, <path d="M9 5l7 7-7 7" />, 2.4),
  back: (s = 16) => svg(s, <path d="M15 5l-7 7 7 7" />, 2.4),
  lock: (s = 15) => svg(s, <><path d="M5 11h14v10H5z" /><path d="M8 11V6h8v5" /></>),
  shield: (s = 18) => svg(s, <path d="M12 3l8 3v7l-8 8-8-8V6z" />),
  file: (s = 18) => svg(s, <><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4M8 12h8M8 16h5" /></>),
  database: (s = 18) => svg(s, <path d="M4 4h16v5H4zM4 9.5h16v5H4zM4 15h16v5H4z" />),
  users: (s = 18) => svg(s, <><path d="M6 4h6v6H6zM3 20v-5h12v5" /><path d="M16 5h4v5h-4M18 14h3v6" /></>),
  /** A message: a ruled speech card. */
  clipboard: (s = 15) => svg(s, <><path d="M3 4h18v12H10l-5 4v-4H3z" /><path d="M7 8h10M7 12h6" /></>),
  check: (s = 13) => svg(s, <path d="M4 12.5l5 5L20 6" />, 2.8),
  bang: (s = 13) => svg(s, <path d="M12 4v10M12 18v2" />, 2.8),
  mail: (s = 13) => svg(s, <><path d="M3 5h18v14H3z" /><path d="M3 5l9 7 9-7" /></>),
  clock: (s = 16) => svg(s, <><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" /><path d="M12 7v5h4" /></>),
  phone: (s = 18) => svg(s, <path d="M5 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4l-2 2C9.5 21 3 14.5 3 5z" />, 2),
  sliders: (s = 18) => svg(s, <><path d="M3 6h18M3 12h18M3 18h18" /><path d="M14 4h3v4h-3zM6 10h3v4H6zM11 16h3v4h-3z" fill="currentColor" /></>, 2),
  /** Sound, as bars: the voice check. */
  wave: (s = 16) => svg(s, <path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4" />, 2.4),
  /** Drop a file: into a tray. */
  upload: (s = 16) => svg(s, <><path d="M4 14v6h16v-6" /><path d="M12 16V4M7 9l5-5 5 5" /></>, 2.4),
  bank: (s = 18) => svg(s, <path d="M3 9l9-5 9 5zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />),
  speech: (s = 18) => svg(s, <><path d="M3 4h18v12H10l-5 4v-4H3z" /><path d="M12 7v4M12 13v1" /></>),
  /** A website: a browser window. */
  link: (s = 18) => svg(s, <><path d="M3 4h18v16H3zM3 9h18" /><path d="M6 6.5h1M9 6.5h1" /><path d="M14 12v4.5a2 2 0 0 1-4 0V15" /></>),
  /** A face in a viewfinder: the deepfake check. */
  face: (s = 18) => svg(s, <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><path d="M9 10v1M15 10v1M9 15h6" /></>, 2.3),
  video: (s = 18) => svg(s, <><path d="M3 6h12v12H3z" /><path d="M15 10l6-4v12l-6-4" /></>),
  image: (s = 18) => svg(s, <><path d="M3 4h18v16H3z" /><path d="M3 16l5-5 4 4 3-3 6 6" /><path d="M15 7h2v2h-2z" fill="currentColor" /></>),
  /** Save: out of the tray. */
  download: (s = 16) => svg(s, <><path d="M4 14v6h16v-6" /><path d="M12 4v12M7 11l5 5 5-5" /></>, 2.4),
  play: (s = 14) => svg(s, <path d="M7 4l13 8-13 8z" fill="currentColor" />, 2),
  stop: (s = 14) => svg(s, <path d="M6 6h12v12H6z" fill="currentColor" />, 2),
  mic: (s = 18) => svg(s, <><path d="M9 3h6v11H9z" /><path d="M5 11c0 4 3 7 7 7s7-3 7-7M12 18v3M8 21h8" /></>),
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
    case 'voice_signs':
      return Icon.wave(size);
    case 'ai_label':
    case 'ai_tool':
    case 'edited_with':
    case 'picture_signs':
      return Icon.image(size);
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
        <span className="brand" title={`FISHY ${versionLine()}`}>
          <img src="/icons/icon-48.png" alt="" />
          <span className="brand-word">FISHY</span>
        </span>
        <span className="header-tools">
          <AiChip />
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

/** Check / Scams, with one underline that slides between them. */
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
          {t === 'verdict' ? 'Check' : 'Scams'}
        </button>
      ))}
      {bar && <span className={`tab-bar${ready ? ' ready' : ''}`} aria-hidden="true" style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w / 100})` }} />}
    </nav>
  );
}

/**
 * The three steps a person sees, the same as "How it works": Check what you were sent, See the
 * signs, Call the real person. (Internally each red flag still records where it came from:
 * read, check or match. All of those are signs.)
 */
export type TrackStep = 'checked' | 'signs' | 'call';

export const STEPS: Array<{ id: TrackStep; label: string; long: string }> = [
  { id: 'checked', label: 'Check', long: 'Check' },
  { id: 'signs', label: 'Signs', long: 'See the signs' },
  { id: 'call', label: 'Call', long: 'Call the real person' },
];

export type StepState = 'done' | 'now' | 'todo' | 'flagged';

/** What each step found for the current check: the same states on the verdict and on every evidence screen. */
export function trackFor(verdict: Verdict, call: CallState): Record<TrackStep, StepState> {
  return {
    checked: 'done',
    signs: verdict.flags.length ? 'flagged' : 'done',
    call: call === 'confirmed' ? 'done' : call === 'not_me' ? 'flagged' : 'now',
  };
}

/** The current check's step states, for the small track on evidence screens. */
export const TrackContext = createContext<Record<TrackStep, StepState> | null>(null);

/** The three steps on one line. Used in the verdict and, small, on every evidence screen. */
export function StepTrack({ states, small, intro, live, current }: { states: Record<TrackStep, StepState>; small?: boolean; intro?: boolean; live?: TrackStep; current?: TrackStep }) {
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


export function DetailHead({
  title,
  kicker,
  badges,
  onBack,
  backLabel = 'Back to the verdict',
}: {
  title: string;
  /** Where this evidence came from (read, check, match). Kept for reference; no step track is drawn any more. */
  step?: Step;
  /** A short line above the title on screens that are not a step. */
  kicker?: string;
  badges: Array<{ source: Source; label?: string }>;
  onBack: () => void;
  backLabel?: string;
}) {
  return (
    <div className="detail-head">
      <button className="back" onClick={onBack}>
        {Icon.back()}
        {backLabel}
      </button>
      {kicker && <span className="detail-kicker">{kicker}</span>}
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
