import type { Mask } from './voice';

/*
 * In the floating window, FISHY is part of the page it captures. Watch mode and lip-sync ask the
 * window where it is and black that area out of each frame, instead of hiding it (no flicker).
 * The answer comes through the page, so it is checked: numbers only, and no bigger than the
 * floating window can be, so a page can't use it to black out the call itself.
 */
const MAX_W = 440;
const MAX_H = 900;

export function sane(d: unknown): Mask | null {
  const m = d as Partial<Mask> & { fishy?: string };
  if (!m || m.fishy !== 'rect') return null;
  const nums = [m.x, m.y, m.w, m.h, m.vw, m.vh];
  if (!nums.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  if (m.w! <= 0 || m.h! <= 0 || m.w! > MAX_W || m.h! > MAX_H || m.vw! < 100 || m.vh! < 100) return null;
  return { x: m.x!, y: m.y!, w: m.w!, h: m.h!, vw: m.vw!, vh: m.vh! };
}

export function overlayMask(timeoutMs = 300): Promise<Mask | null> {
  if (typeof window === 'undefined' || window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (m: Mask | null) => {
      window.removeEventListener('message', on);
      clearTimeout(timer);
      resolve(m);
    };
    const on = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const m = sane(e.data);
      if (m) done(m);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    window.addEventListener('message', on);
    window.parent.postMessage({ fishy: 'rect?' }, '*');
  });
}
