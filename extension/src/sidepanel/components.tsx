import type { Signal, Source } from '../lib/types';

export function Header({ live }: { live: string }) {
  return (
    <header className="header">
      <span className="brand">
        <img src="/icons/icon-48.png" alt="" />
        FISHY
      </span>
      <span className="live">
        <span className="live-dot" />
        {live}
      </span>
    </header>
  );
}

export function SourceBadge({ source }: { source: Source }) {
  return source === 'on_device' ? (
    <span className="badge on_device">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      </svg>
      On device
    </span>
  ) : (
    <span className="badge cloud">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.5 4.25 4.25 0 0 0 7 18z" />
      </svg>
      Cloud
    </span>
  );
}

export function FlagRow({ flag, onOpen }: { flag: Signal; onOpen: () => void }) {
  return (
    <button className="flag" onClick={onOpen}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="flag-title">{flag.title}</span>
        <span className="flag-detail">{flag.detail}</span>
        <span className="meta">
          <span className="step-label">{flag.step.toUpperCase()}</span>
          <SourceBadge source={flag.source} />
        </span>
      </span>
      <svg style={{ flex: 'none', marginTop: 8, color: '#8a949e' }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

export function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button className="back" onClick={onBack}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Verdict
    </button>
  );
}
