import type { KnownBadEntry, KnownKind } from '../types';
import { registrable } from './domain';
import { findAccounts, mask } from './invoice';

export function normalize(kind: KnownKind, value: string): string {
  return kind === 'domain' ? registrable(value) : value.replace(/\D/g, '');
}

export interface Candidate {
  kind: KnownKind;
  value: string;
  display: string;
  note?: string;
}

export interface KnownMatch {
  candidate: Candidate;
  entry?: KnownBadEntry;
}

/**
 * Step 3 · Match (R5), on the laptop. Accounts match on their last 4 digits plus length when the
 * list holds a masked value, phones and domains match exactly.
 */
export function matchKnown(candidates: Candidate[], list: KnownBadEntry[]): KnownMatch[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      const key = `${c.kind}:${normalize(c.kind, c.value)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => {
      const v = normalize(candidate.kind, candidate.value);
      const entry = list.find((e) => e.kind === candidate.kind && (e.value === v || (candidate.kind === 'account' && e.value.length === 4 && v.endsWith(e.value))));
      return { candidate, entry };
    });
}

/** Bank accounts, phone numbers and URLs mentioned in a message, as match candidates. Never used to place a call. */
export function candidatesFromText(text: string): Candidate[] {
  const out: Candidate[] = findAccounts(text).map((a) => ({ kind: 'account' as const, value: a.number, display: `${a.bank ?? 'Account'} ${mask(a.number)}` }));
  const accountDigits = new Set(out.map((a) => a.value));
  for (const m of text.matchAll(/\+?\d[\d\s().-]{8,}\d/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (accountDigits.has(digits)) continue;
    if (digits.length >= 9 && digits.length <= 15 && /^(\+|0|62)/.test(m[0].trim())) {
      out.push({ kind: 'phone', value: digits, display: `${m[0].trim().slice(0, 8)} •••• ${digits.slice(-4)}`, note: 'Number in the message. FISHY never calls it.' });
    }
  }
  for (const m of text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    out.push({ kind: 'domain', value: m[1], display: registrable(m[1]) });
  }
  return out;
}
