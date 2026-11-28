import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { BAND_LABEL, scoreMedia, STAMP, type ScoreBand } from '../lib/media-score';
import type { MediaCheck } from '../lib/types';
import { Icon } from './components';

/*
 * The Scanner layout's parts: a drop zone that takes anything, three big actions, a score ring
 * that fills and counts up, and the list of what was checked. Motion follows DESIGN.md: an
 * entrance plays once, only transform/opacity/stroke move, reduced motion shows the end state.
 */

export const ACCEPT = 'image/*,application/pdf,.pdf,audio/*,.m4a,.mp3,.wav,.ogg,.webm,.opus';
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** A number that counts up to `value` once, over `ms`. */
function useCountUp(value: number, ms = 700) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0));
  useEffect(() => {
    if (reduced()) return setShown(value);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** The FISHY score as a ring: fills to the score, colour by band. */
export function ScoreRing({ score, band, size = 76 }: { score: number; band: ScoreBand; size?: number }) {
  const shown = useCountUp(score);
  const r = 32;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring ${band}`} style={{ width: size, height: size }} role="img" aria-label={`FISHY score ${score} out of 100`}>
      <svg viewBox="0 0 76 76" width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx="38" cy="38" r={r} />
        <circle className="ring-fill" cx="38" cy="38" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
      </svg>
      <span className="ring-num" aria-hidden="true">
        {shown}
      </span>
    </div>
  );
}

/**
 * The verdict as an ink stamp, slammed onto the picture once: FISHY, SUSPECT or LOOKS OK.
 * `play` is false for a result already seen, so it doesn't stamp again on every visit.
 */
export function Stamp({ band, play }: { band: ScoreBand; play: boolean }) {
  if (band === 'pending') return null;
  return (
    <span className={`stamp ${band}${play ? ' play' : ''}`} aria-hidden="true">
      {STAMP[band]}
    </span>
  );
}

/** A small score badge for lists. */
export function ScoreChip({ item }: { item: MediaCheck }) {
  const s = scoreMedia(item);
  if (s.score === null) return <span className={`chip pending`}>{item.gemini === undefined ? '…' : '–'}</span>;
  return <span className={`chip ${s.band}`}>{s.score}</span>;
}

/** Drop anything here, or click to choose. */
export function DropZone({ onFile, disabled, compact, children }: { onFile: (f: File) => void; disabled?: boolean; compact?: boolean; children?: ReactNode }) {
  const [over, setOver] = useState(false);
  const take = (file?: File) => file && !disabled && onFile(file);
  return (
    <label
      className={`dropzone${over ? ' over' : ''}${compact ? ' compact' : ''}`}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation(); // the window-wide drop must not check it a second time
        setOver(false);
        take(e.dataTransfer.files[0]);
      }}
    >
      <span className="dropzone-icon">{Icon.upload(compact ? 18 : 22)}</span>
      <span className="dropzone-text">
        <strong>{compact ? 'Check something else' : 'Drop a picture, a PDF or a voice note'}</strong>
        {!compact && <span>or click to choose a file. Up to 20 MB.</span>}
      </span>
      {children}
      <input type="file" accept={ACCEPT} className="visually-hidden" disabled={disabled} onChange={(e) => take(e.target.files?.[0] ?? undefined)} />
    </label>
  );
}

/** The three big actions: the video call, the voice on it, a message. */
export function ActionGrid({ onFrame, onVoice, onText, busy }: { onFrame?: () => void; onVoice?: () => void; onText: () => void; busy?: boolean }) {
  return (
    <div className="actions">
      <button className="action" onClick={onFrame} disabled={busy || !onFrame} title={onFrame ? undefined : 'Open FISHY from the call’s tab'}>
        <span className="action-icon">{Icon.video(22)}</span>
        <span className="action-title">Video</span>
        <span className="action-detail">Is the face real?</span>
      </button>
      <button className="action" onClick={onVoice} disabled={busy || !onVoice} title={onVoice ? undefined : 'Open FISHY from the call’s tab'}>
        <span className="action-icon">{Icon.mic(22)}</span>
        <span className="action-title">Voice</span>
        <span className="action-detail">Is it cloned?</span>
      </button>
      <button className="action" onClick={onText} disabled={busy}>
        <span className="action-icon">{Icon.clipboard(22)}</span>
        <span className="action-title">Message</span>
        <span className="action-detail">Is it pressure?</span>
      </button>
    </div>
  );
}

const KIND_ICON = (kind: MediaCheck['kind']) => (kind === 'voice' ? Icon.mic(16) : kind === 'frame' ? Icon.video(16) : kind === 'document' ? Icon.file(16) : Icon.image(16));

/** What was checked in this session, newest first, with its score. */
export function RecentChecks({ items, onOpen }: { items: MediaCheck[]; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="recent surface">
      {[...items].reverse().map((m) => (
        <li key={m.id}>
          <button className="recent-row" onClick={() => onOpen(m.id)}>
            <span className="recent-icon">{KIND_ICON(m.kind)}</span>
            <span className="grow">
              <span className="row-title recent-name">{m.name}</span>
              <span className="row-detail">{BAND_LABEL[scoreMedia(m).band]}</span>
            </span>
            <ScoreChip item={m} />
            <span className="flag-chevron">{Icon.chevron(16)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A file dragged anywhere over the window: say where it can go. */
export function useWindowDrop(onFile: (f: File) => void) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    const hasFile = (e: globalThis.DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: globalThis.DragEvent) => {
      if (!hasFile(e)) return;
      depth.current += 1;
      setActive(true);
    };
    const leave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (!depth.current) setActive(false);
    };
    const over = (e: globalThis.DragEvent) => hasFile(e) && e.preventDefault();
    const drop = (e: globalThis.DragEvent) => {
      if (!hasFile(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      const file = e.dataTransfer?.files[0];
      if (file) onFile(file);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFile]);
  return active;
}
