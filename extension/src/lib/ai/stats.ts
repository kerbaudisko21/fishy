/*
 * How the hybrid AI has run on this laptop, kept on this laptop: which answers came from Gemini
 * Nano and which from the cloud, how long each took, and, every time the cloud gave a second
 * opinion, whether it agreed with Nano. FISHY uses the agreement rate to tune when it asks the
 * cloud ("self-tuning escalation"), and Settings shows it. No file, sign or text is stored: counts only.
 */

export type StatKind = 'picture' | 'document' | 'frame' | 'site' | 'voice';

export interface KindStats {
  device: number;
  cloud: number;
  deviceMs: number;
  cloudMs: number;
  /** Second opinions asked, and how many agreed with Nano's first look. */
  escalations: number;
  agreed: number;
}

export type Stats = Partial<Record<StatKind, KindStats>>;

const KEY = 'fishyAiStats';
const empty = (): KindStats => ({ device: 0, cloud: 0, deviceMs: 0, cloudMs: 0, escalations: 0, agreed: 0 });
let cache: Stats = {};
const listeners = new Set<(s: Stats) => void>();

const storage = () => (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null);

export async function loadStats(): Promise<Stats> {
  try {
    const s = storage();
    if (s) cache = ((await s.get(KEY))[KEY] as Stats) ?? {};
    else if (typeof localStorage !== 'undefined') cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stats;
  } catch {
    cache = {};
  }
  listeners.forEach((l) => l(cache));
  return cache;
}

function save() {
  try {
    const s = storage();
    if (s) void s.set({ [KEY]: cache });
    else if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* counts are a convenience; losing them changes nothing that matters */
  }
  listeners.forEach((l) => l(cache));
}

export function onStats(listener: (s: Stats) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const positive = (assessment: string) => assessment === 'likely_ai' || assessment === 'likely_edited';

/** One answer: where it ran, how long it took, and (with a second opinion) whether they agreed. */
export function recordAnswer(kind: StatKind, r: { source: 'on_device' | 'cloud'; ms: number; firstLook?: { assessment: string }; final: { assessment: string } }) {
  const k = (cache[kind] ??= empty());
  if (r.source === 'on_device') {
    k.device++;
    k.deviceMs += r.ms;
  } else {
    k.cloud++;
    k.cloudMs += r.ms;
  }
  if (r.firstLook) {
    k.escalations++;
    if (positive(r.firstLook.assessment) === positive(r.final.assessment)) k.agreed++;
  }
  save();
}

export function resetStats() {
  cache = {};
  save();
}

export function currentStats(): Stats {
  return cache;
}

/**
 * How much Nano's first look can be trusted for this kind of check: the share of second opinions
 * that agreed with it, smoothed (Laplace) so a few cases don't swing it. `n` is how many there were.
 */
export function trustFor(kind: StatKind, stats: Stats = cache): { rate: number; n: number } {
  const k = stats[kind];
  const n = k?.escalations ?? 0;
  return { rate: ((k?.agreed ?? 0) + 1) / (n + 2), n };
}

/** The totals Settings shows. */
export function summary(stats: Stats = cache) {
  const all = Object.values(stats).reduce((t, k) => {
    t.device += k!.device;
    t.cloud += k!.cloud;
    t.deviceMs += k!.deviceMs;
    t.cloudMs += k!.cloudMs;
    t.escalations += k!.escalations;
    t.agreed += k!.agreed;
    return t;
  }, empty());
  const answers = all.device + all.cloud;
  return {
    answers,
    onDeviceShare: answers ? all.device / answers : 0,
    deviceAvgMs: all.device ? all.deviceMs / all.device : 0,
    cloudAvgMs: all.cloud ? all.cloudMs / all.cloud : 0,
    escalations: all.escalations,
    agreement: all.escalations ? all.agreed / all.escalations : null,
    /** Answers Nano gave on its own: each one a cloud call that wasn't needed. */
    cloudCallsSaved: all.device,
  };
}
