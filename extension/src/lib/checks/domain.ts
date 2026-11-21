/** Second-level suffixes where the registrable domain has three labels (example.co.id). */
const TWO_PART_SUFFIXES = new Set([
  'co.id', 'or.id', 'ac.id', 'go.id', 'web.id', 'my.id', 'biz.id', 'sch.id', 'net.id',
  'co.uk', 'org.uk', 'com.sg', 'com.my', 'com.au', 'co.jp', 'com.hk', 'co.nz', 'com.ph', 'co.th', 'com.vn',
]);

export function domainOf(address: string): string {
  const at = address.lastIndexOf('@');
  return (at >= 0 ? address.slice(at + 1) : address).trim().toLowerCase().replace(/\.$/, '');
}

/** example.co.id from billing.mail.example.co.id */
export function registrable(domain: string): string {
  const labels = domainOf(domain).split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return labels.slice(TWO_PART_SUFFIXES.has(lastTwo) ? -3 : -2).join('.');
}

/** The brand part with the public suffix and punctuation removed: "sinarlogistik". */
export function core(domain: string): string {
  const reg = registrable(domain);
  const labels = reg.split('.');
  const suffixLen = TWO_PART_SUFFIXES.has(labels.slice(-2).join('.')) ? 2 : 1;
  return labels.slice(0, labels.length - suffixLen).join('').replace(/[^a-z0-9]/g, '');
}

/** Folds common look-alike characters so "paypa1" and "rnicrosoft" compare equal to the real names. */
function fold(s: string): string {
  return s.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/[1l|]/g, 'l').replace(/5/g, 's');
}

export function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

export interface LookalikeResult<T> {
  /** The known domain this one imitates. */
  match: T;
  reason: string;
}

/**
 * Returns the known domain that `sender` imitates, or null when it is an exact match or clearly unrelated.
 * Catches added hyphens or dots, a changed ending (.co vs .co.id), swapped look-alike characters and 1–2 typos.
 */
export function findLookalike<T extends { domain: string }>(sender: string, known: T[]): LookalikeResult<T> | null {
  const reg = registrable(sender);
  if (known.some((k) => registrable(k.domain) === reg)) return null;

  const c = core(sender);
  for (const k of known) {
    const kc = core(k.domain);
    if (!kc || kc.length < 4) continue;
    const sameCore = c === kc;
    const extra = registrable(sender).replace(/[^a-z0-9]/g, '') !== registrable(k.domain).replace(/[^a-z0-9]/g, '');
    if (sameCore) {
      const hyphen = registrable(sender).includes('-') && !registrable(k.domain).includes('-');
      const reasons = [hyphen ? 'one hyphen added' : '', extra ? 'different ending' : ''].filter(Boolean);
      return { match: k, reason: reasons.length ? capitalise(reasons.join(', ')) : 'Same name, different domain' };
    }
    if (fold(c) === fold(kc)) return { match: k, reason: 'Look-alike characters swapped in' };
    if (Math.min(c.length, kc.length) >= 5 && levenshtein(c, kc) <= 2) return { match: k, reason: 'One or two letters changed' };
  }
  return null;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Splits `a` into segments, marking characters that are not in `b` (longest-common-subsequence diff).
 * Used to highlight what changed in a look-alike address.
 */
export function diffParts(a: string, b: string): Array<{ text: string; changed?: boolean }> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const marks: boolean[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && a[i] === b[j]) {
      marks.push(false);
      i++;
      j++;
    } else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) {
      j++;
    } else {
      marks.push(true);
      i++;
    }
  }
  const parts: Array<{ text: string; changed?: boolean }> = [];
  marks.forEach((changed, k) => {
    const last = parts[parts.length - 1];
    if (last && !!last.changed === changed) last.text += a[k];
    else parts.push(changed ? { text: a[k], changed: true } : { text: a[k] });
  });
  return parts;
}
