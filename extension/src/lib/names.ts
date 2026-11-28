// Words for people, counts and amounts, shared by the side panel and the web pages.

/**
 * Titles that come before a name and are not what a colleague calls someone: Javanese and
 * Indonesian honorifics, Hajj titles, academic and professional titles. Words that are also common
 * first names (Andi, Ayu, Rara) are left out on purpose: better a title in a sentence than a wrong name.
 */
const TITLES = new Set(['raden', 'ajeng', 'mas', 'bendoro', 'gusti', 'kanjeng', 'tengku', 'teuku', 'haji', 'hajjah', 'h', 'hj', 'dr', 'drs', 'dra', 'ir', 'prof', 'mr', 'mrs', 'ms', 'bapak', 'ibu', 'pak', 'bu']);
// Suffixes that are not a family name, for initials.
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'se', 'mm', 'mba', 'sh', 'st', 'ak', 'cpa']);

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);
const bare = (word: string) => word.toLowerCase().replace(/[.,]/g, '');

/** The name to use in a sentence ("Call Kartika"), skipping titles such as "Raden Ajeng" or "Dr.". */
export function firstName(name: string | undefined, fallback = 'them'): string {
  if (!name?.trim()) return fallback;
  const parts = words(name);
  return parts.find((w) => !TITLES.has(bare(w))) ?? parts[0];
}

/** Two initials: the first name and the last family name, skipping titles and suffixes like "III". */
export function initials(name: string): string {
  const parts = words(name).filter((w) => !TITLES.has(bare(w)) && !SUFFIXES.has(bare(w)));
  if (parts.length === 0) return '?';
  const letter = (w: string) => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(w)][0]?.segment ?? '';
  const first = letter(parts[0]);
  const last = parts.length > 1 ? letter(parts[parts.length - 1]) : '';
  return (first + last).toUpperCase();
}

/** "1 confirmed scam", "1,284 confirmed scams". */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * An amount, split so a long currency code can sit on its own line: { currency: 'IDR', number: '12,750,000,000' }.
 * A one-character symbol stays attached ("$186,400").
 */
export function moneyParts(value: number, currency: string): { currency: string; number: string } {
  const parts = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).formatToParts(value);
  const symbol = parts.find((p) => p.type === 'currency')?.value ?? currency;
  const number = parts
    .filter((p) => p.type !== 'currency' && p.type !== 'literal')
    .map((p) => p.value)
    .join('');
  return symbol.length === 1 ? { currency: '', number: `${symbol}${number}` } : { currency: symbol, number };
}
