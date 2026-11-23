import type { TacticHit, TacticResult } from './ai/tactics';
import { diffParts, domainOf, registrable, type LookalikeResult } from './checks/domain';
import { mask, type AccountFound, type InvoiceCompare } from './checks/invoice';
import type { KnownMatch } from './checks/known';
import type { AuthVerdict } from './checks/email';
import type { Amount } from './checks/said';
import type { RulesConfig } from './rules/engine';
import type { CaptionLine, CheckItem, Evidence, MediaCheck, PaymentRequest, Signal, Supplier, Tactic } from './types';
import { mediaSignals } from './media-signals';
import { plural } from './names';

export { mediaSignals } from './media-signals';

/*
 * Turns raw check results ("findings") into the three things the panel shows:
 * red-flag signals (for the rules engine), evidence (for the detail screens) and the payment request.
 * Pure functions: easy to test, and the same findings always give the same output.
 */

export interface TranscriptLine {
  speaker: string;
  at: string;
  text: string;
}

export interface Findings {
  place: 'meet' | 'gmail' | 'paste';
  tactics?: TacticResult & { lines: TranscriptLine[] };
  email?: {
    from: string;
    name: string;
    lookalike: LookalikeResult<Supplier> | null;
    /** The supplier the email claims to be (exact or look-alike match). */
    supplier?: Supplier;
    links: number;
    /** null when Web Risk was not reached. */
    unsafe: string[] | null;
    attachments: string[];
    /** From the email's own headers; undefined when Gmail did not give them. */
    auth?: AuthVerdict;
    /** undefined until known; null when the lookup is not available. */
    age?: { days: number; registered: string } | null;
  };
  /** Who asked, for how much, to which account: read from captions, pasted text or the email body. */
  said?: { speaker?: string; role?: string; amount?: Amount; account?: AccountFound };
  voice?: { speaker: string; seconds: number; sentAt: string; score: number; levels: number[]; demo: boolean };
  invoice?: {
    fileName: string;
    number?: string;
    total?: { value: number; currency: string };
    accounts: AccountFound[];
    compare: InvoiceCompare;
    supplier?: Supplier;
    traces: CheckItem[];
  };
  known: KnownMatch[];
  /** Pictures, documents, voice clips and video frames the person chose to check. */
  media?: MediaCheck[];
}

export const TACTIC_LABEL: Record<Tactic, string> = {
  urgency: 'Urgency',
  secrecy: 'Secrecy',
  authority: 'Authority',
  skips_process: 'Skips the process',
  new_payment_details: 'New payment details',
};

/** A domain younger than this is flagged (R3). */
export const YOUNG_DOMAIN_DAYS = 30;
/** A voice score from this up is shown as a red flag (R8); below it is only shown on the Voice screen. */
export const VOICE_FLAG_AT = 0.6;

const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
// Counts with separators and the right plural ("1 payment", "1,284 confirmed scams").

export function toSignals(f: Findings): Signal[] {
  const out: Signal[] = [];

  if (f.tactics?.hits.length) {
    const kinds = [...new Set(f.tactics.hits.map((h) => h.tactic))].map((t) => TACTIC_LABEL[t].toLowerCase());
    const where = f.place === 'meet' ? 'the captions' : f.place === 'gmail' ? 'the email' : 'the text';
    out.push({
      kind: 'pressure_tactics',
      step: 'read',
      source: f.tactics.source,
      title: 'Pressure in the request',
      detail: `${listWords(kinds).replace(/^./, (c) => c.toUpperCase())} in ${where}.`,
      strength: kinds.length,
    });
  }

  const inv = f.invoice;
  if (inv?.compare.changed && inv.supplier) {
    out.push({
      kind: 'bank_account_changed',
      step: 'check',
      source: 'on_device',
      title: 'Bank account changed',
      detail: `The invoice account differs from the last ${plural(inv.supplier.paidMonths.length, 'payment')} to ${inv.supplier.name.replace(/^PT\s+/, '')}.`,
    });
  }
  if (inv?.traces.some((t) => !t.ok)) {
    out.push({ kind: 'pdf_edited', step: 'check', source: 'on_device', title: 'Invoice was edited', detail: inv.traces.find((t) => !t.ok)!.detail });
  }

  const em = f.email;
  if (em?.lookalike) {
    out.push({
      kind: 'lookalike_sender',
      step: 'check',
      source: 'on_device',
      title: 'Lookalike sender',
      detail: `${registrable(em.from)}. On record: ${em.lookalike.match.domain}.`,
    });
  }
  if (em?.unsafe?.length) {
    out.push({ kind: 'unsafe_link', step: 'check', source: 'cloud', title: 'Unsafe link', detail: `${plural(em.unsafe.length, 'link')} flagged by Web Risk.` });
  }
  if (em?.auth?.failed) {
    out.push({ kind: 'sender_auth_failed', step: 'check', source: 'on_device', title: 'Sender check failed', detail: `${em.auth.detail}.`.replace(/^./, (c) => c.toUpperCase()) });
  }
  if (em?.age && em.age.days < YOUNG_DOMAIN_DAYS) {
    out.push({ kind: 'young_domain', step: 'check', source: 'cloud', title: 'Brand-new domain', detail: `${registrable(em.from)} is ${plural(em.age.days, 'day')} old.` });
  }

  const v = f.voice;
  if (v && v.score >= VOICE_FLAG_AT) {
    out.push({
      kind: 'voice_score',
      step: 'check',
      source: 'cloud',
      title: 'Voice likely synthetic',
      detail: `${Math.round(v.score * 100)}% on a ${v.seconds}-second clip you sent. A supporting signal, not proof.`,
      score: v.score,
    });
  }

  out.push(...mediaSignals(f.media ?? []));

  for (const m of f.known) {
    if (!m.entry) continue;
    const kind = m.candidate.kind === 'domain' ? 'known_bad_domain' : 'known_bad_account';
    if (out.some((s) => s.kind === kind)) continue;
    out.push({
      kind,
      step: 'match',
      source: 'on_device',
      title: m.candidate.kind === 'domain' ? 'Known scam domain' : m.candidate.kind === 'phone' ? 'Known scam number' : 'Known scam account',
      detail: `${m.entry.display} is in ${plural(m.entry.count, 'confirmed scam')}.`,
      seenCount: m.entry.count,
    });
  }
  return out;
}

/** Splits a line into plain and highlighted parts for the quotes the reader returned. */
export function highlight(text: string, hits: TacticHit[]): CaptionLine['parts'] {
  const ranges: Array<{ start: number; end: number; tactic: Tactic }> = [];
  const lower = text.toLowerCase();
  for (const h of hits) {
    const i = lower.indexOf(h.quote.toLowerCase());
    if (i >= 0 && !ranges.some((r) => i < r.end && i + h.quote.length > r.start)) ranges.push({ start: i, end: i + h.quote.length, tactic: h.tactic });
  }
  ranges.sort((a, b) => a.start - b.start);
  const parts: CaptionLine['parts'] = [];
  let at = 0;
  for (const r of ranges) {
    if (r.start > at) parts.push({ text: text.slice(at, r.start) });
    parts.push({ text: text.slice(r.start, r.end), tactic: r.tactic });
    at = r.end;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}

export function toEvidence(f: Findings, rules: RulesConfig, patterns: string[], knownUpdatedAt: number): Evidence {
  const ev: Evidence = {};
  if (f.media?.length) ev.media = f.media;

  if (f.tactics?.hits.length) {
    const counts = new Map<Tactic, TacticHit[]>();
    for (const h of f.tactics.hits) counts.set(h.tactic, [...(counts.get(h.tactic) ?? []), h]);
    const lines = f.tactics.lines.filter((l) => f.tactics!.hits.some((h) => l.text.toLowerCase().includes(h.quote.toLowerCase())));
    ev.tactics = {
      counts: [...counts.entries()].map(([tactic, hs]) => ({ tactic, label: TACTIC_LABEL[tactic], count: hs.length, example: `“${hs[0].quote}”` })),
      captions: lines.map((l) => ({ speaker: l.speaker, at: l.at, parts: highlight(l.text, f.tactics!.hits) })),
      window: f.place === 'meet' ? 'recent captions' : f.place === 'gmail' ? 'this email' : 'pasted text',
      pattern: patterns.find((p) => rules.patterns.find((x) => x.name === p)?.requires.includes('pressure_tactics')),
      rulesVersion: rules.version,
      source: f.tactics.source,
    };
  }

  const em = f.email;
  if (em) {
    const sup = em.lookalike?.match ?? em.supplier;
    const local = em.from.split('@')[0];
    const checks: CheckItem[] = [];
    if (em.lookalike) checks.push({ ok: false, title: 'Looks like a known supplier', detail: em.lookalike.reason });
    else if (em.supplier) checks.push({ ok: true, title: 'Sender matches the record', detail: `Same domain as ${em.supplier.name}` });
    else checks.push({ ok: true, title: 'Not a supplier on record', detail: 'No look-alike of a known supplier' });
    if (em.unsafe === null) checks.push({ ok: true, title: plural(em.links, 'link'), detail: em.links ? 'Web Risk not reached; links not checked' : 'Nothing to check' });
    else if (em.unsafe.length) checks.push({ ok: false, title: `${plural(em.unsafe.length, 'link')} flagged`, detail: 'Web Risk lists them as unsafe' });
    else checks.push({ ok: true, title: `${plural(em.links, 'link')}, no known threat`, detail: 'Web Risk got the links only, never the email' });
    if (em.auth) checks.splice(1, 0, { ok: !em.auth.failed, title: em.auth.failed ? 'Sender check failed' : 'Sender check passed', detail: em.auth.detail });
    if (em.age) {
      const young = em.age.days < YOUNG_DOMAIN_DAYS;
      checks.splice(1, 0, { ok: !young, title: young ? `Domain is ${plural(em.age.days, 'day')} old` : 'Domain is established', detail: `Registered ${em.age.registered}` });
    }
    ev.email = {
      sender: { name: em.name, address: sup ? diffParts(em.from, `${local}@${sup.domain}`) : [{ text: em.from }] },
      onRecord: sup ? { name: sup.name, address: `${local}@${sup.domain}`, paidTimes: sup.paidMonths.length } : undefined,
      checks,
      attachment: em.attachments.find((a) => /\.pdf$/i.test(a)),
    };
  }

  const inv = f.invoice;
  if (inv?.compare.found) {
    const found = inv.compare.found;
    const knownCount = f.known.find((m) => m.candidate.kind === 'account' && m.entry && m.candidate.value.endsWith(found.number.slice(-4)))?.entry?.count ?? 0;
    ev.invoice = {
      number: inv.number ?? inv.fileName,
      supplier: inv.supplier?.name ?? found.holder ?? 'Unknown supplier',
      from: em?.from,
      amount: inv.total,
      newAccount: { bank: found.bank ? (found.bank === 'Mandiri' ? 'Bank Mandiri' : found.bank) : 'Bank', masked: mask(found.number), holder: found.holder ?? '—' },
      usual: inv.supplier ? { ...inv.supplier.account, months: inv.supplier.paidMonths } : undefined,
      traces: inv.traces,
      knownScams: knownCount,
    };
  }

  if (f.voice) {
    ev.voice = {
      speaker: f.voice.speaker,
      seconds: f.voice.seconds,
      sentAt: f.voice.sentAt,
      score: f.voice.score,
      faceFrames: 5,
      levels: f.voice.levels,
      demo: f.voice.demo,
    };
  }

  if (f.known.length) {
    const pattern = rules.patterns.find((p) => patterns.includes(p.name) && p.signs?.length);
    ev.known = {
      matches: f.known.map((m) => ({
        value: m.entry?.display ?? m.candidate.display,
        count: m.entry?.count ?? 0,
        events: m.entry?.events,
        note: m.candidate.note,
      })),
      pattern: pattern ? { name: pattern.name, bullets: pattern.signs! } : undefined,
      rulesVersion: rules.version,
      updated: agoText(knownUpdatedAt),
    };
  }
  return ev;
}

export function agoText(t: number, now = Date.now()) {
  const min = Math.round((now - t) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  return `${Math.round(min / 60)} h ago`;
}

/**
 * The payment being asked for. The invoice is the best source; otherwise what was said
 * (captions, pasted text, the email body). The person asking comes from captions or the email.
 */
export function toRequest(f: Findings): PaymentRequest | undefined {
  const inv = f.invoice;
  const said = f.said;
  const found = inv?.compare.found ?? said?.account;
  const amount = inv?.total ?? said?.amount;
  if (!found && !amount) return undefined;

  // Unknown when nobody is named; the panel then leaves the "Asked by" line out.
  const askedBy = said?.speaker
    ? { name: said.speaker, role: said.role ?? '' }
    : f.email
      ? { name: f.email.name || domainOf(f.email.from), role: 'by email' }
      : { name: '', role: '' };

  return {
    id: inv?.number ?? inv?.fileName ?? 'request',
    place: f.place,
    askedBy,
    amount: amount ?? { value: 0, currency: 'USD' },
    payee: found
      ? { name: inv?.supplier?.name ?? found.holder ?? 'New account', bank: found.bank ?? 'Bank', accountMasked: mask(found.number) }
      : undefined,
  };
}
