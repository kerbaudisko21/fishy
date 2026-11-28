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

/** The two checks of a call: the face and the voice. Message text is a small link elsewhere. */
export function ActionGrid({ onFrame, onVoice, busy }: { onFrame?: () => void; onVoice?: () => void; busy?: boolean }) {
  const why = onFrame ? undefined : 'Open FISHY from the call’s tab';
  return (
    <div className="actions">
      <button className="action" onClick={onFrame} disabled={busy || !onFrame} title={why}>
        <span className="action-icon">{Icon.video(22)}</span>
        <span className="action-title">The face</span>
        <span className="action-detail">Is the person on this call real? Watches 3 s.</span>
      </button>
      <button className="action" onClick={onVoice} disabled={busy || !onVoice} title={why}>
        <span className="action-icon">{Icon.mic(22)}</span>
        <span className="action-title">The voice</span>
        <span className="action-detail">Is it cloned? Listens 10 s.</span>
      </button>
    </div>
  );
}

/** The voice's pitch over the clip: a person's line moves up and down; a flat line is a hint. */
export function PitchChart({ pitch }: { pitch: number[] }) {
  const voiced = pitch.filter((p) => p > 0);
  if (voiced.length < 10) return null;
  // A fixed scale of one octave around the voice's middle, so a flat voice looks flat and a lively
  // one moves: stretching the scale to the clip's own range would make any voice look lively.
  const mid = [...voiced].sort((x, y) => x - y)[voiced.length >> 1];
  const lo = mid / Math.SQRT2;
  const hi = mid * Math.SQRT2;
  const W = 300;
  const H = 56;
  const x = (i: number) => (i / Math.max(1, pitch.length - 1)) * W;
  const y = (p: number) => Math.min(H - 2, Math.max(2, H - ((Math.log(p) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * H));
  // Break the line where the voice isn't voiced.
  const paths: string[] = [];
  let d = '';
  pitch.forEach((p, i) => {
    if (p > 0) d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`;
    else if (d) {
      paths.push(d);
      d = '';
    }
  });
  if (d) paths.push(d);
  return (
    <figure className="pitch" aria-label={`Pitch of the voice, from ${Math.round(Math.min(...voiced))} to ${Math.round(Math.max(...voiced))} Hz`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {paths.map((p, i) => (
          <path key={i} d={p} />
        ))}
      </svg>
      <figcaption>Pitch, measured on this laptop</figcaption>
    </figure>
  );
}

/** The frames of a video check, in time order. */
export function Filmstrip({ frames, motion, onPick, picked }: { frames: string[]; motion?: number[]; onPick: (i: number) => void; picked: number }) {
  return (
    <div className="filmstrip" role="group" aria-label="Frames of the call">
      {frames.map((f, i) => (
        <button key={f} className={`film${i === picked ? ' on' : ''}`} onClick={() => onPick(i)} aria-label={`Frame ${i + 1}`} aria-pressed={i === picked}>
          <img src={f} alt="" />
          <span className="film-num">{i + 1}</span>
          {motion && i > 0 && motion[i - 1] < 0.6 && <span className="film-still" title="No change from the frame before">=</span>}
        </button>
      ))}
    </div>
  );
}

/** How the check ran: on the laptop first, the cloud only when needed. */
export function HybridTrail({ item }: { item: MediaCheck }) {
  const g = item.gemini;
  const steps: Array<{ label: string; where: 'device' | 'cloud'; note?: string }> = [];
  if (item.forensics || item.facts) steps.push({ label: 'Laptop checks', where: 'device' });
  if (item.firstLook) {
    steps.push({ label: 'Gemini Nano', where: 'device', note: item.escalation });
    if (g && g.source === 'cloud') steps.push({ label: 'Gemini cloud', where: 'cloud', note: 'second opinion' });
  } else if (g) {
    steps.push({ label: g.source === 'on_device' ? 'Gemini Nano' : 'Gemini cloud', where: g.source === 'on_device' ? 'device' : 'cloud', note: item.escalation });
  }
  if (!steps.length) return null;
  return (
    <ol className="trail" aria-label="How this was checked">
      {steps.map((st, i) => (
        <li key={i} className={`trail-step ${st.where}`}>
          <span className="trail-dot" aria-hidden="true" />
          <span className="trail-label">{st.label}</span>
          <span className="trail-where">{st.where === 'device' ? 'on this laptop' : 'in the cloud'}</span>
          {st.note && <span className="trail-note">{st.note}</span>}
        </li>
      ))}
    </ol>
  );
}

/** What kind of scam the evidence points to, with what to do about it. */
export function ScamType({ names, info }: { names: string[]; info: (name: string) => { signs?: string[]; action?: string } | undefined }) {
  if (!names.length) return null;
  const [main, ...rest] = names;
  const p = info(main);
  return (
    <section className="scam-type surface" aria-label="What kind of scam this looks like">
      <span className="scam-kicker">Looks like</span>
      <strong className="scam-name">{main}</strong>
      {p?.signs && (
        <ul className="scam-signs">
          {p.signs.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
      {p?.action && (
        <p className="scam-action">
          {Icon.phone(14)} {p.action}
        </p>
      )}
      {rest.length > 0 && <span className="scam-also">Also matches: {rest.join(' · ')}</span>}
    </section>
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
