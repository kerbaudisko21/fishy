import jsQR from 'jsqr';
import type { CheckItem, ForensicHint } from '../types';
import { siteLab, type PageFacts } from '../checks/site';
import { quoteable } from './limits';

/*
 * QR codes in a picture or a PDF ("quishing"): scam invoices, posters and payment screenshots carry
 * a QR code that leads to a fake payment page, or pays someone else. Read on the laptop.
 *  - A link: its address gets the same checks as the website check (look-alike of a supplier,
 *    look-alike letters, a bare number, a risky ending, no https).
 *  - A QRIS / EMVCo payment code (Indonesia's standard payment QR): who it pays, the amount, and
 *    its built-in checksum (CRC-16). A code edited by hand, to change who gets paid, fails it.
 */

export type QrContent =
  | { kind: 'url'; url: string; host: string }
  | { kind: 'payment'; merchant?: string; city?: string; amount?: string; currency?: string; checksumOk: boolean; raw: string }
  | { kind: 'text'; text: string };

/** Reads the first QR code in a picture's pixels, or null. Large pictures should be scaled first. */
export function readQr(rgba: Uint8ClampedArray, w: number, h: number): string | null {
  if (w < 21 || h < 21) return null;
  try {
    return jsQR(rgba, w, h, { inversionAttempts: 'attemptBoth' })?.data || null;
  } catch {
    return null;
  }
}

/** CRC-16/CCITT-FALSE, the checksum EMVCo payment codes end with (tag 63). */
export function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i++) {
    crc ^= text.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** EMVCo "tag, length, value" fields: "5913ACME COFFEE…" → { '59': 'ACME COFFEE' }. */
export function emvFields(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  let at = 0;
  while (at < text.length) {
    const tag = text.slice(at, at + 2);
    const len = Number(text.slice(at + 2, at + 4));
    if (!/^\d{2}$/.test(tag) || !Number.isInteger(len) || at + 4 + len > text.length) return null;
    out[tag] = text.slice(at + 4, at + 4 + len);
    at += 4 + len;
  }
  return out;
}

export function classifyQr(data: string): QrContent {
  const text = data.trim();
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text);
      return { kind: 'url', url: `${u.origin}${u.pathname}`.slice(0, 2048), host: u.hostname };
    } catch {
      /* not a usable link */
    }
  }
  if (text.startsWith('000201')) {
    const fields = emvFields(text);
    if (fields) {
      const body = text.slice(0, -4);
      const checksumOk = !!fields['63'] && body.endsWith('6304') && crc16(body) === fields['63'].toUpperCase();
      const currency = fields['53'] === '360' ? 'IDR' : fields['53'];
      return { kind: 'payment', merchant: fields['59'] && quoteable(fields['59'], 60), city: fields['60'] && quoteable(fields['60'], 40), amount: fields['54'], currency, checksumOk, raw: text.slice(0, 512) };
    }
  }
  return { kind: 'text', text: quoteable(text, 200) };
}

export interface QrLab {
  hints: ForensicHint[];
  rows: CheckItem[];
  measured: string;
  /** For a link: its address, for the cloud lookups (age, unsafe list). */
  url?: string;
  host?: string;
}

/** What a QR code found in a picture or document means, as hints and rows. */
export function qrLab(data: string | null, suppliers: Array<{ name: string; domain: string }>, extra: { ageDays?: number | null; unsafe?: boolean | null } = {}): QrLab | null {
  if (!data) return null;
  const q = classifyQr(data);
  if (q.kind === 'url') {
    const page: PageFacts = { url: q.url, host: q.host, https: q.url.startsWith('https:'), title: '', text: '', passwordFields: 0, cardFields: 0, otpFields: 0, formHosts: [] };
    const site = siteLab(page, suppliers, extra);
    const risky = site.hints.filter((h) => h.id !== 'young' || h.strength === 2);
    // A link to a plain http page is normal for a poster; only the address tricks count here.
    const counted = risky.filter((h) => h.id !== 'not_https');
    const hints: ForensicHint[] = counted.length
      ? [{ id: 'qr_risky', strength: 2, text: `The QR code leads to ${q.host}: ${counted[0].text.charAt(0).toLowerCase()}${counted[0].text.slice(1)}` }]
      : [];
    if (counted.some((h) => h.id === 'unsafe')) hints.push({ id: 'unsafe', strength: 2, text: 'Google’s list of unsafe sites names the address in the QR code.' });
    // QR redirectors and link shorteners hide where a code really goes (APWG Q4 2025).
    const redirector = ['scan.page', 'view.page', 'qrfy.io', 'qr.page', 'tinyurl.com', 'bit.ly', 's.id', 'cutt.ly', 'rb.gy', 'shorturl.at', 'is.gd', 't.ly'].find((r) => q.host === r || q.host.endsWith(`.${r}`));
    if (redirector) hints.push({ id: 'qr_redirect', strength: 1, text: `The QR code goes through ${redirector}, a redirect service that hides where it really leads.` });
    return {
      hints,
      rows: [{ ok: !counted.length, title: 'QR code leads to a website', detail: q.host }, ...site.rows.filter((r) => !r.ok)],
      measured: `A QR code in it links to ${q.host}.`,
      url: q.url,
      host: q.host,
    };
  }
  if (q.kind === 'payment') {
    const who = [q.merchant, q.city].filter(Boolean).join(', ') || 'an unnamed merchant';
    const amount = q.amount ? ` for ${q.currency ?? ''} ${q.amount}`.replace('  ', ' ') : '';
    // Name check, in the style of the EU's Verification of Payee (Oct 2025): Match, Close match or
    // No match against the suppliers on record. A close match (one or two letters off) is the
    // look-alike case. Bank Indonesia's advice: check the merchant name before paying.
    const name = nameCheck(q.merchant, suppliers);
    const hints: ForensicHint[] = name.result === 'close' ? [{ id: 'qr_name_close', strength: 2, text: `The payment QR code pays “${q.merchant}”, close to but not the same as ${name.supplier} on record.` }] : [];
    if (!q.checksumOk) hints.push({ id: 'qr_checksum', strength: 2, text: 'The payment QR code’s checksum is wrong: it was changed after it was made, as when the merchant is swapped.' });
    return {
      hints,
      rows: [
        { ok: true, title: 'Payment QR code', detail: `Pays ${who}${amount}. Check this is who you mean to pay.` },
        { ok: q.checksumOk, title: q.checksumOk ? 'Its checksum is right' : 'Its checksum is wrong', detail: q.checksumOk ? 'A real code can still pay a scammer: check the name' : 'The code was edited after it was made' },
        ...(name.result === 'match' ? [{ ok: true, title: 'Name check: match', detail: `Same name as ${name.supplier} on record` }] : name.result === 'close' ? [{ ok: false, title: 'Name check: close match', detail: `Close to ${name.supplier} on record, but not the same: a look-alike?` }] : []),
      ],
      measured: `A payment QR code in it pays ${who}${amount}${q.checksumOk ? '' : '; its checksum is wrong'}.`,
    };
  }
  return { hints: [], rows: [{ ok: true, title: 'QR code', detail: `Contains text: ${q.text}` }], measured: '' };
}

/** The QR code in a picture or a rendered page, if any. Scaled to at most 1600 px: QR codes survive it. */
export async function qrFromBlob(blob: Blob): Promise<string | null> {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') return null;
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = new OffscreenCanvas(w, h).getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return readQr(ctx.getImageData(0, 0, w, h).data, w, h);
  } finally {
    bitmap.close();
  }
}

/** "PT Sinar Logistik Tbk." → "sinar logistik": the name without company forms and punctuation. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(pt|cv|tbk|ud|persero|ltd|limited|inc|co|corp|llc|gmbh|sdn bhd|pte)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const edits = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return row[b.length];
};

/** Match, close match (1–2 letters off, a look-alike) or none, against the suppliers on record. */
export function nameCheck(merchant: string | undefined, suppliers: Array<{ name: string }>): { result: 'match' | 'close' | 'none'; supplier?: string } {
  const m = normaliseName(merchant ?? '');
  if (m.length < 4) return { result: 'none' };
  for (const s of suppliers) {
    const n = normaliseName(s.name);
    if (n.length < 4) continue;
    if (n === m) return { result: 'match', supplier: s.name };
    if (Math.min(n.length, m.length) >= 5 && edits(n, m) <= 2) return { result: 'close', supplier: s.name };
  }
  return { result: 'none' };
}
