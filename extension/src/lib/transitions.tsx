import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

/*
 * React wiring for the transitions.dev snippets in styles/transitions.css. Shared by the side panel
 * and the web pages. Durations are read from the CSS variables, so the CSS stays the one source.
 */

const ms = (name: string, fallback: number) => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(v) ? v : fallback;
};

/**
 * Texts reveal: children with `className="t-stagger-line t-stagger-line--N"` rise in, staggered,
 * when this mounts. Give it a new `key` to play it again for a new state.
 */
export function Reveal({
  as: Tag = 'div',
  className = '',
  style,
  children,
  play = true,
  ...rest
}: { as?: ElementType; className?: string; style?: CSSProperties; children: ReactNode; /** False shows it at rest, for a result already seen. */ play?: boolean } & Pick<HTMLAttributes<HTMLElement>, 'role' | 'aria-label' | 'aria-live' | 'aria-busy'>) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !play) return;
    el.classList.remove('is-shown');
    void el.offsetHeight; // start from the hidden state, then transition to shown
    el.classList.add('is-shown');
    // Plays on mount only; a later change of `play` does not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Tag ref={ref} className={`t-stagger${play ? '' : ' is-shown is-still'} ${className}`.trim()} style={style} {...rest}>
      {children}
    </Tag>
  );
}

/** The class for line n of a Reveal (1-based; 6 lines are styled). */
export const line = (n: number, extra = '') => `t-stagger-line t-stagger-line--${Math.min(Math.max(n, 1), 6)}${extra ? ` ${extra}` : ''}`;

/**
 * Text states swap: shows `text`, and when it changes, the old text leaves upwards and the new one
 * rises in. Returns the text to render and the ref for the `.t-text-swap` element.
 */
export function useTextSwap(text: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const el = ref.current;
    if (text === shown) return;
    if (!el) return setShown(text);
    el.classList.add('is-exit');
    const t = window.setTimeout(() => {
      setShown(text);
      el.classList.remove('is-exit');
      el.classList.add('is-enter-start');
      requestAnimationFrame(() => {
        void el.offsetHeight; // reflow so the return to rest transitions
        el.classList.remove('is-enter-start');
      });
    }, ms('--text-swap-dur', 150));
    return () => window.clearTimeout(t);
  }, [text, shown]);
  return { ref, shown };
}

/**
 * Error state shake: call `shake()` on a wrong answer. The `.t-input` element shakes, and
 * `.is-error` on it and its `.t-input-wrap` holds for --revert-hold, then fades back.
 */
export function useErrorShake() {
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    wrap.current?.classList.remove('is-error');
    input.current?.classList.remove('is-error');
  };

  const shake = () => {
    const w = wrap.current;
    const i = input.current;
    if (!w || !i) return;
    clear();
    w.classList.add('is-error');
    i.classList.add('is-error');
    i.classList.remove('is-shaking');
    void i.offsetWidth; // replay the shake from rest
    i.classList.add('is-shaking');
    const shakeMs = ms('--shake-dur-a', 80) * 2 + ms('--shake-dur-b', 60) * 2;
    timers.current.push(window.setTimeout(() => i.classList.remove('is-shaking'), shakeMs + 20));
    timers.current.push(window.setTimeout(clear, shakeMs + ms('--revert-hold', 3000)));
  };

  return { wrap, input, shake, clear };
}
