import { useCallback, useEffect, useRef, useState } from 'react';
import type { Suspects } from '../lib/checks/known';
import { DEMO, ESCALATE_MINUTES, FIREBASE_READY } from '../lib/config';
import { createCheck, reportSuspects, startVerificationCall, watchCall, type CheckSummary } from '../lib/data';
import type { CallState, CallStatus, CallTarget } from '../lib/types';

export interface CallOptions {
  /** The request's accounts, domains and numbers, for shared learning on a confirmed "not me". */
  suspects?: Suspects;
  /** Who to call when the first person does not answer within ESCALATE_MINUTES. */
  escalateTo?: CallTarget;
}

/** States in which the person has not answered yet. */
const UNANSWERED: CallState[] = ['ringing', 'no_answer'];

/**
 * Step 4 · Call. Live: creates a check in Firestore (summary only), reports the request's details
 * for shared learning, asks Cloud Functions to call the target on the number on record, then
 * follows the call state written back by the phone menu or the approval page.
 * No answer within ESCALATE_MINUTES (or the call ends unanswered): one new check, and the next
 * approver on record is called. A check holds one call, so escalation always starts a new one.
 * Without Firebase, a demo call answers "not me" after 3 seconds.
 */
export function useCall() {
  const [call, setCall] = useState<CallStatus>({ state: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});
  const timer = useRef<number | undefined>(undefined);
  const escalation = useRef<{ next: CallTarget; summary: CheckSummary; suspects?: Suspects } | null>(null);
  // The state as of the last render, for the escalation timer.
  const latest = useRef(call);
  useEffect(() => {
    latest.current = call;
  }, [call]);

  const stopAll = () => {
    stop.current();
    stop.current = () => {};
    window.clearTimeout(timer.current);
  };
  useEffect(() => () => stopAll(), []);

  /** Creates a check and calls one person. Returns false when the call could not start. */
  const place = useCallback(async (target: CallTarget, summary: CheckSummary, suspects?: Suspects) => {
    const checkId = await createCheck(summary);
    setCall((c) => ({ ...c, checkId }));
    if (suspects) await reportSuspects(checkId, suspects);
    stop.current = watchCall(checkId, (s) => setCall((c) => ({ ...c, ...s })));
    const started = await startVerificationCall(checkId, target.id);
    setCall((c) => ({ ...c, started }));
  }, []);

  const escalate = useCallback(async () => {
    const next = escalation.current;
    escalation.current = null;
    if (!next) return;
    stopAll();
    setCall({ state: 'escalated', target: next.next, escalatedTo: next.next.name });
    try {
      await place(next.next, next.summary, next.suspects);
    } catch (e) {
      stopAll();
      setError(`The call to ${next.next.name} could not start: ${(e as Error).message}`);
      setCall((c) => ({ ...c, state: 'no_answer' }));
    }
  }, [place]);

  // The call ended unanswered: no need to wait out the rest of the countdown.
  useEffect(() => {
    if (call.state === 'no_answer' && escalation.current) void escalate();
  }, [call.state, escalate]);

  const start = useCallback(
    async (target: CallTarget, summary: CheckSummary, options: CallOptions = {}) => {
      stopAll();
      setError(null);
      const escalateAt = Date.now() + ESCALATE_MINUTES * 60_000;
      setCall({ state: 'ringing', target, escalateAt });

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

      escalation.current = options.escalateTo && options.escalateTo.id !== target.id ? { next: options.escalateTo, summary, suspects: options.suspects } : null;
      if (escalation.current) {
        timer.current = window.setTimeout(() => {
          if (UNANSWERED.includes(latest.current.state)) void escalate();
          else escalation.current = null;
        }, escalateAt - Date.now());
      }

      try {
        await place(target, summary, options.suspects);
      } catch (e) {
        stopAll();
        escalation.current = null;
        setError(`The call could not start: ${(e as Error).message}`);
        setCall({ state: 'idle' });
      }
    },
    [escalate, place],
  );

  const cancel = useCallback(() => {
    stopAll();
    escalation.current = null;
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
