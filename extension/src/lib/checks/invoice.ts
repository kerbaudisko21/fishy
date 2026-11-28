import type { BankAccount, CheckItem } from '../types';

/**
 * Banks we recognise by name on an invoice. The first four are the demo company's made-up banks,
 * so that no real bank is named in the demo; the rest are Indonesian and regional banks.
 */
const BANKS = ['Bank Teluk', 'Bank Karang', 'Bank Ombak', 'Bank Selat', 'BCA', 'Mandiri', 'BNI', 'BRI', 'CIMB Niaga', 'Permata', 'Danamon', 'BSI', 'OCBC', 'Maybank', 'Panin', 'BTN', 'UOB', 'DBS', 'HSBC', 'Jago', 'SeaBank'];

export interface AccountFound {
  bank?: string;
  number: string;
  holder?: string;
}

/** Account numbers next to an account label ("Account", "A/C", "Rekening", "No. Rek"). */
export function findAccounts(text: string): AccountFound[] {
  const out: AccountFound[] = [];
  // The label, an optional bank name ("account: Bank Teluk 123-456-9032"), then the number.
  const re = /(?:account(?:\s*(?:no\.?|number))?|acct\.?|a\/c|rekening|no\.?\s*rek\.?)\s*[:#]?\s*(?:(?:bank\s+)?[A-Za-z]{2,12}\s*[:,-]?\s+)?([0-9][0-9\s.-]{4,24}[0-9])/gi;
  for (const m of text.matchAll(re)) {
    const number = m[1].replace(/\D/g, '');
    if (number.length < 6 || number.length > 20) continue;
    const before = text.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + m[0].length);
    const bank = [...BANKS].reverse().find((b) => new RegExp(`\\b${b}\\b`, 'i').test(before));
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 120);
    const holderRe = /(?:\baccount name|\ba\.n\.|\batas nama|\bbeneficiary(?: name)?)\s*:?\s*([^\n]{3,60})/i;
    const holder = (holderRe.exec(after) ?? holderRe.exec(before))?.[1]?.trim();
    if (!out.some((a) => a.number === number)) out.push({ bank, number, holder });
  }
  return out;
}

export function invoiceNumber(text: string): string | undefined {
  return /invoice\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{3,})/i.exec(text)?.[1];
}

export function invoiceTotal(text: string): { value: number; currency: string } | undefined {
  const m = /(?:total(?: due)?|amount due|jumlah(?: tagihan)?)\s*:?\s*(USD|IDR|Rp\.?|\$|SGD)\s*([\d.,]+)/i.exec(text);
  if (!m) return undefined;
  const currency = /rp|idr/i.test(m[1]) ? 'IDR' : /sgd/i.test(m[1]) ? 'SGD' : 'USD';
  // IDR uses dots for thousands; USD uses commas.
  const raw = currency === 'IDR' ? m[2].replace(/\./g, '').replace(',', '.') : m[2].replace(/,/g, '');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? { value, currency } : undefined;
}

export const mask = (digits: string) => `•••• ${digits.slice(-4)}`;
export const last4 = (s: string) => s.replace(/\D/g, '').slice(-4);

/** PDF date "D:20261118093000+07'00'" → Date */
export function parsePdfDate(s?: string): Date | undefined {
  const m = s && /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-])?(\d{2})?'?(\d{2})?/.exec(s);
  if (!m) return undefined;
  const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz, th = '00', tm = '00'] = m;
  const offset = !tz || tz === 'Z' ? 'Z' : `${tz}${th}:${tm}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}${offset}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const EDITORS = /ilovepdf|smallpdf|sejda|pdfescape|pdf24|pdffiller|dochub|online|foxit phantom|pdf-xchange editor/i;

export interface PdfFacts {
  created?: Date;
  modified?: Date;
  producer?: string;
  /** Font of the text item holding the account number, and the most common font on the page. */
  accountFont?: string;
  mainFont?: string;
}

const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Edit traces (R4): changed after creation, made with an online editor, account set in another font. */
export function editTraces(f: PdfFacts): CheckItem[] {
  const items: CheckItem[] = [];
  const edited = f.created && f.modified && f.modified.getTime() - f.created.getTime() > 60 * 60 * 1000;
  const online = !!f.producer && EDITORS.test(f.producer);
  if (edited || online) {
    const when = edited ? `Created ${day(f.created!)} · edited ${day(f.modified!)}` : 'Saved';
    items.push({ ok: false, title: 'Changed after it was made', detail: `${when}${online ? ' in an online PDF editor' : ''}` });
  } else {
    items.push({ ok: true, title: 'No later edits found', detail: f.created ? `Created ${day(f.created)}, not changed since` : 'No edit dates in the file' });
  }
  if (f.accountFont && f.mainFont && f.accountFont !== f.mainFont) {
    items.push({ ok: false, title: 'Bank line set in another font', detail: 'Only the account number differs from the rest' });
  }
  return items;
}

export interface InvoiceCompare {
  changed: boolean;
  found?: AccountFound;
}

/** R4: a changed bank account is flagged. The record only holds the last 4 digits, so we compare those. */
export function compareAccount(found: AccountFound[], onRecord?: BankAccount): InvoiceCompare {
  if (!found.length) return { changed: false };
  if (!onRecord) return { changed: false, found: found[0] };
  const usual = last4(onRecord.masked);
  const match = found.find((a) => a.number.endsWith(usual));
  return match ? { changed: false, found: match } : { changed: true, found: found[0] };
}
