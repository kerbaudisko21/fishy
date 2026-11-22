import { useCallback, useEffect, useRef, useState } from 'react';
import { DEMO, ESCALATE_MINUTES, FIREBASE_READY } from '../lib/config';
import { createCheck, startVerificationCall, watchCall, type CheckSummary } from '../lib/data';
import type { CallStatus, CallTarget } from '../lib/types';

/**
 * Step 4 · Call. Live: creates a check in Firestore (summary only), asks Cloud Functions to call the
 * target on the number on record, then follows the call state written back by the phone menu.
 * Without Firebase, a demo call answers "not me" after 3 seconds.
 */
export function useCall() {
  const [call, setCall] = useState<CallStatus>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});

  useEffect(() => () => stop.current(), []);

  const start = useCallback(async (target: CallTarget, summary: CheckSummary) => {
    setError(null);
    setCall({ state: 'ringing', target, escalateAt: Date.now() + ESCALATE_MINUTES * 60_000 });

    if (!FIREBASE_READY) {
      if (!DEMO) {
        setError('Calling needs Firebase: fill in extension/.env.local.');
        setCall({ state: 'idle' });
        return;
      }
      const t = window.setTimeout(() => setCall((c) => ({ ...c, state: 'not_me' })), 3000);
      stop.current = () => window.clearTimeout(t);
      return;
    }

    try {
      const checkId = await createCheck(summary);
      stop.current = watchCall(checkId, (s) => setCall((c) => ({ ...c, ...s })));
      const started = await startVerificationCall(checkId, target.id);
      setCall((c) => ({ ...c, started }));
    } catch (e) {
      stop.current();
      setError(`The call could not start: ${(e as Error).message}`);
      setCall({ state: 'idle' });
    }
  }, []);

  const cancel = useCallback(() => {
    stop.current();
    setCall({ state: 'idle' });
  }, []);

  return { call, start, cancel, error };
}

/** Re-renders every second while a countdown is on screen. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}
