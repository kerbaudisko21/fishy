/*
 * What was said: speakers in Meet captions and money amounts in any text.
 * Pure helpers, shared by the Meet content script and the side panel.
 */

export interface SaidLine {
  speaker: string;
  text: string;
}

/** A caption speaker label: 1–4 capitalised words, no sentence punctuation, short. "You" counts too. */
export function looksLikeName(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 40 || /[.,!?:;"“”()]/.test(t) || /\d/.test(t)) return false;
  if (/^(you|anda|kamu)$/i.test(t)) return true;
  const words = t.split(/\s+/);
  return words.length <= 4 && words.every((w) => /^[A-ZÀ-ɏ][\p{L}'’-]*$/u.test(w));
}

/**
 * Splits the caption region's text into lines with their speaker.
 * Meet shows a name line, then that person's caption lines, then the next name.
 */
export function parseCaptionText(raw: string): SaidLine[] {
  const out: SaidLine[] = [];
  let speaker = '';
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (looksLikeName(line)) speaker = line;
    else out.push({ speaker, text: line });
  }
  return out;
}

const MULTIPLIERS: Record<string, number> = { k: 1e3, thousand: 1e3, rb: 1e3, ribu: 1e3, m: 1e6, mn: 1e6, million: 1e6, jt: 1e6, juta: 1e6, b: 1e9, bn: 1e9, billion: 1e9, miliar: 1e9, milyar: 1e9 };

export interface Amount {
  value: number;
  currency: 'USD' | 'IDR' | 'SGD';
}

/** Money mentioned in text: "$186,400", "USD 186k", "Rp 2,4 miliar", "186 thousand dollars". */
export function findAmounts(text: string): Amount[] {
  const out: Amount[] = [];
  const re = /(?:(US\$|\$|USD|IDR|Rp\.?|SGD|S\$)\s?([\d][\d.,]*)\s*(k|thousand|rb|ribu|m|mn|million|jt|juta|b|bn|billion|miliar|milyar)?\b)|(?:\b([\d][\d.,]*)\s*(k|thousand|million|juta|miliar|milyar)?\s*(dollars?|usd|rupiah|idr)\b)/gi;
  for (const m of text.matchAll(re)) {
    const cur = (m[1] ?? m[6] ?? '').toLowerCase();
    const currency: Amount['currency'] = /rp|idr|rupiah/.test(cur) ? 'IDR' : /sgd|s\$/.test(cur) ? 'SGD' : 'USD';
    const num = m[2] ?? m[4];
    const mult = MULTIPLIERS[(m[3] ?? m[5] ?? '').toLowerCase()] ?? 1;
    const value = parseNumber(num, currency, mult !== 1) * mult;
    if (Number.isFinite(value) && value > 0) out.push({ value: Math.round(value * 100) / 100, currency });
  }
  return out;
}

/** "186,400.00" → 186400 · IDR "2.450.000" → 2450000 · "2,4" with a multiplier → 2.4 */
function parseNumber(s: string, currency: Amount['currency'], scaled: boolean): number {
  if (currency === 'IDR' || (scaled && /^\d+,\d{1,2}$/.test(s))) {
    // Indonesian style: dots for thousands, comma for decimals.
    return Number.parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  return Number.parseFloat(s.replace(/,/g, ''));
}

/** The largest amount, which is usually the payment being asked for. */
export function mainAmount(text: string): Amount | undefined {
  return findAmounts(text).sort((a, b) => b.value - a.value)[0];
}
