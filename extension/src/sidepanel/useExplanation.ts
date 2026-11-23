import { useEffect, useState } from 'react';
import { explainVerdict, type ExplainContext, type Explanation } from '../lib/ai/explain';
import type { Verdict } from '../lib/types';

/**
 * "Why this is risky": asks Gemini once per new result (not on every render or call-state change).
 * Returns null while it is writing, and when there is nothing to explain.
 */
export function useExplanation(verdict: Verdict, ctx: ExplainContext, active: boolean) {
  const [result, setResult] = useState<{ key: string; explanation: Explanation } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const key = `${verdict.flags.map((f) => `${f.kind}:${f.detail}`).join('|')}#${ctx.askedBy ?? ''}#${ctx.amount ?? ''}`;

  useEffect(() => {
    if (!active || verdict.level !== 'fishy' || verdict.flags.length === 0) return;
    let live = true;
    setFailed(null);
    explainVerdict(verdict, ctx)
      .then((explanation) => live && setResult({ key, explanation }))
      .catch((e) => {
        console.warn('[FISHY] explanation failed', e);
        if (live) setFailed(key);
      });
    return () => {
      live = false;
    };
    // The key stands for the verdict and context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);

  return {
    explanation: result?.key === key ? result.explanation : null,
    writing: active && verdict.level === 'fishy' && verdict.flags.length > 0 && result?.key !== key && failed !== key,
  };
}
