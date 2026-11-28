/*
 * Work handed to the panel from outside it: a keyboard shortcut, a right-click item or a banner.
 * The service worker puts the job in session storage and opens FISHY; the panel takes it and runs it.
 */

interface JobBase {
  tabId: number;
  pageUrl?: string;
  at: number;
}

export type FishyJob =
  | (JobBase & { kind: 'picture'; src: string })
  | (JobBase & { kind: 'site' })
  | (JobBase & { kind: 'face' })
  | (JobBase & { kind: 'voice' })
  | (JobBase & { kind: 'link'; url: string })
  | (JobBase & { kind: 'text'; text: string });

const KINDS = new Set(['picture', 'site', 'face', 'voice', 'link', 'text']);

/** A job is only taken if it is well formed and less than a minute old. */
export function validJob(v: unknown, now = Date.now()): FishyJob | null {
  const j = v as Partial<FishyJob> | null;
  if (!j || typeof j !== 'object' || !KINDS.has(j.kind as string) || typeof j.tabId !== 'number' || typeof j.at !== 'number') return null;
  if (now - j.at > 60_000 || j.at > now + 5_000) return null;
  if (j.kind === 'picture' && typeof (j as { src?: unknown }).src !== 'string') return null;
  if (j.kind === 'link' && typeof (j as { url?: unknown }).url !== 'string') return null;
  if (j.kind === 'text' && typeof (j as { text?: unknown }).text !== 'string') return null;
  return j as FishyJob;
}
