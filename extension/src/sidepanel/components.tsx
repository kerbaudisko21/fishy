import type { ReactNode } from 'react';
import type { CheckItem, Signal, Source } from '../lib/types';

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
};

/* ---------- Shell ---------- */

export function Header({ live, dot = true, onSettings }: { live: string; dot?: boolean; onSettings: () => void }) {
  return (
    <header className="header">
      <span className="brand">
        <img src="/icons/icon-48.png" alt="" />
        FISHY
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="live">
          {dot ? <span className="live-dot" /> : Icon.mail()}
          {live}
        </span>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
          {Icon.sliders()}
        </button>
      </span>
    </header>
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

export function FlagRow({ flag, onOpen }: { flag: Signal; onOpen?: () => void }) {
  return (
    <button className="flag" onClick={onOpen} disabled={!onOpen}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="flag-title">{flag.title}</span>
        <span className="flag-detail">{flag.detail}</span>
        <span className="meta">
          <span className="step-label">{flag.step.toUpperCase()}</span>
          <SourceBadge source={flag.source} label={flag.source === 'cloud' && flag.score !== undefined ? 'Cloud · on click' : undefined} />
        </span>
      </span>
      {onOpen && <span style={{ flex: 'none', marginTop: 8, color: '#8a949e' }}>{Icon.chevron()}</span>}
    </button>
  );
}

/* ---------- Detail screens ---------- */

export function DetailHead({
  title,
  step,
  badges,
  onBack,
  backLabel = 'Verdict',
}: {
  title: string;
  step: string;
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
      <h1>{title}</h1>
      <div className="meta wrap">
        <span className="step-label">{step}</span>
        {badges.map((b, i) => (
          <SourceBadge key={i} source={b.source} label={b.label} />
        ))}
      </div>
    </div>
  );
}

export function CheckList({ title, items }: { title: string; items: CheckItem[] }) {
  return (
    <section className="card clip" aria-label={title}>
      <h2 className="card-title">{title}</h2>
      <ul className="rows">
        {items.map((c) => (
          <li key={c.title} className="check-row">
            <span className={`dot ${c.ok ? 'ok' : 'flagged'}`}>{c.ok ? Icon.check() : Icon.bang()}</span>
            <span className="grow">
              <span className="row-title">{c.title}</span>
              <span className="row-detail">{c.detail}</span>
            </span>
            <span className={`row-verdict ${c.ok ? 'ok' : 'flagged'}`}>{c.ok ? 'OK' : 'Red flag'}</span>
          </li>
        ))}
      </ul>
    </section>
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
