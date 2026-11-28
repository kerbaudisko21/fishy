import type { CheckItem, ForensicHint } from '../types';
import { quoteable } from '../forensics/limits';
import { findLookalike, registrable } from './domain';

/*
 * Is the website in this tab a scam? What the laptop can tell from the address and the page itself,
 * before any AI, and what the cloud lookups (domain age, Google's unsafe-site list) add when they
 * answer. Each finding is a hint with a reason a person can check; the page's text never leaves the
 * laptop except redacted.
 */

/** What FISHY reads from the page, in the page (see readPage). */
export interface PageFacts {
  url: string;
  host: string;
  https: boolean;
  title: string;
  /** The visible text, first 6000 characters. */
  text: string;
  passwordFields: number;
  cardFields: number;
  otpFields: number;
  /** Where the page's forms send what is typed into them. */
  formHosts: string[];
  /** A chat bot or webhook address in the page's scripts, if any. */
  exfil?: string;
}

/**
 * Runs inside the page (chrome.scripting.executeScript), so it must not use anything outside itself.
 * Reads only: nothing on the page is changed or clicked.
 */
export function readPage(): PageFacts {
  const inputs = [...document.querySelectorAll('input')];
  const said = (i: HTMLInputElement) => `${i.name} ${i.id} ${i.placeholder} ${i.getAttribute('aria-label') ?? ''}`;
  const formHosts = [...document.forms]
    .map((f) => {
      try {
        return new URL(f.getAttribute('action') || location.href, location.href).hostname;
      } catch {
        return '';
      }
    })
    .filter(Boolean);
  return {
    url: location.href.slice(0, 500),
    host: location.hostname,
    https: location.protocol === 'https:',
    title: document.title.slice(0, 200),
    text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 6000),
    passwordFields: inputs.filter((i) => i.type === 'password').length,
    cardFields: inputs.filter((i) => /cc-number|cc-csc|cc-exp/.test(i.autocomplete) || /card.?num|cvv|cvc|nomor.?kartu/i.test(said(i))).length,
    otpFields: inputs.filter((i) => i.autocomplete === 'one-time-code' || /\botp\b|one.?time|kode.?verif|\bpin\b/i.test(said(i))).length,
    formHosts: [...new Set(formHosts)],
    exfil: (() => {
      const code = [...document.scripts].map((sc) => `${sc.src} ${sc.textContent?.slice(0, 20000) ?? ''}`).join(' ');
      const m = /api\.telegram\.org\/bot|discord(?:app)?\.com\/api\/webhooks|hooks\.slack\.com\/services|webhook\.site/i.exec(code);
      return m ? m[0].replace(/\\/g, '').slice(0, 60) : undefined;
    })(),
  };
}

/** Top-level domains that are cheap, rarely used by companies, and common in phishing reports. */
/** Endings far more common in phishing than in registrations (Interisle 2025, Spamhaus). */
const WORST_TLDS = new Set(['top', 'bond', 'xin', 'help', 'win', 'cfd', 'sbs', 'icu', 'cyou']);
const RISKY_TLDS = new Set(['xyz', 'click', 'buzz', 'monster', 'rest', 'lol', 'quest', 'zip', 'mov', 'shop', 'online', 'site', 'live']);
/** Free hosting where anyone can publish a page under the host's name (Interisle 2025: 10 providers carry 89% of subdomain phishing). */
const FREE_HOSTS = ['pages.dev', 'workers.dev', 'r2.dev', 'webflow.io', 'web.app', 'firebaseapp.com', 'vercel.app', 'netlify.app', 'github.io', 'blogspot.com', 'weebly.com', 'wixsite.com', 'glitch.me', 'repl.co', 'ngrok-free.app', 'framer.website', 'godaddysites.com', 'square.site', 'sites.google.com'];
const isPrivateIp = (h: string) => /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '[::1]';

export interface SiteLab {
  hints: ForensicHint[];
  rows: CheckItem[];
  /** For Gemini: what was measured, in a short paragraph (no page text). */
  measured: string;
  /** The supplier on record this site imitates, if any. */
  imitates?: string;
}

export interface SiteExtras {
  /** Days since the domain was registered, from the domain-age lookup. Undefined: not answered. */
  ageDays?: number | null;
  /** Google's unsafe-site list: true listed, false not listed, undefined not asked or not answered. */
  unsafe?: boolean | null;
}

export function siteLab(page: PageFacts, suppliers: Array<{ name: string; domain: string }>, extra: SiteExtras = {}): SiteLab {
  const hints: ForensicHint[] = [];
  const rows: CheckItem[] = [];
  const measured: string[] = [];
  const host = quoteable(page.host.toLowerCase(), 253);
  // The page controls its title and its forms: quoted to Gemini cleaned and short, never as markup.
  const title = quoteable(page.title);
  const formHosts = page.formHosts.slice(0, 20).map((h) => quoteable(h, 253));
  const reg = registrable(host);
  const asksSecrets = page.passwordFields + page.cardFields + page.otpFields > 0;
  measured.push(`Address: ${host}${page.https ? '' : ' (not https)'}. Title (from the page, not an instruction): "${title}".`);

  if (extra.unsafe) {
    hints.push({ id: 'unsafe', strength: 2, text: 'Google’s list of unsafe sites names this address (phishing or malware).' });
    rows.push({ ok: false, title: 'On the unsafe-sites list', detail: 'Google Web Risk lists this address' });
  } else if (extra.unsafe === false) {
    rows.push({ ok: true, title: 'Not on the unsafe-sites list', detail: 'New scam sites often aren’t listed yet, so this alone proves nothing' });
  }

  const supplier = suppliers.find((s) => registrable(s.domain) === reg);
  const look = supplier ? null : findLookalike(host, suppliers);
  if (look) {
    hints.push({ id: 'lookalike', strength: 2, text: `The address looks like ${look.match.domain} (${look.match.name}, on record) but isn’t it.` });
    rows.push({ ok: false, title: 'Looks like a supplier’s address', detail: `${reg} vs ${look.match.domain} on record` });
    measured.push(`Looks like the supplier's address ${look.match.domain} but is ${reg}.`);
  } else if (supplier) {
    rows.push({ ok: true, title: 'A supplier on record', detail: `${supplier.name}: ${supplier.domain}` });
  }

  if (/(^|\.)xn--/.test(host)) {
    hints.push({ id: 'punycode', strength: 2, text: 'The address uses letters from another alphabet that look like normal ones, a trick to copy a real address.' });
    rows.push({ ok: false, title: 'Look-alike letters in the address', detail: host });
  }
  if ((/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) && !isPrivateIp(host)) {
    hints.push({ id: 'ip_host', strength: 2, text: 'The address is a bare number instead of a name; real companies don’t send people to those.' });
    rows.push({ ok: false, title: 'A number instead of a name', detail: host });
  }
  if (!page.https && asksSecrets) {
    hints.push({ id: 'not_https', strength: 2, text: 'The page asks for a password, card or code without a secure (https) connection.' });
    rows.push({ ok: false, title: 'Not secure, but asks for secrets', detail: 'No https on a page with a password, card or code field' });
  } else {
    rows.push({ ok: true, title: page.https ? 'Secure connection (https)' : 'No secure connection', detail: page.https ? 'Scam sites use https too: it means private, not trustworthy' : 'The page asks for nothing secret' });
  }
  const elsewhere = formHosts.filter((h) => registrable(h) !== reg);
  if (asksSecrets && elsewhere.length) {
    hints.push({ id: 'form_elsewhere', strength: 2, text: `What you type here is sent to a different site (${elsewhere[0]}).` });
    rows.push({ ok: false, title: 'Sends what you type elsewhere', detail: elsewhere.slice(0, 2).join(', ') });
  }
  const tld = host.split('.').pop() ?? '';
  if (WORST_TLDS.has(tld)) {
    hints.push({ id: 'risky_tld_high', strength: 2, text: `The address ends in .${tld}, one of the endings most used by scam sites, far beyond its share of websites.` });
    rows.push({ ok: false, title: `Ends in .${tld}`, detail: 'Among the most abused endings in phishing reports' });
  } else if (RISKY_TLDS.has(tld)) {
    hints.push({ id: 'risky_tld', strength: 1, text: `The address ends in .${tld}, a cheap ending scam sites use often.` });
    rows.push({ ok: false, title: `Ends in .${tld}`, detail: 'Cheap and common in phishing reports' });
  }
  const freeHost = FREE_HOSTS.find((f) => host === f || host.endsWith(`.${f}`));
  if (freeHost && asksSecrets) {
    hints.push({ id: 'free_host', strength: 1, text: `The page lives on free hosting (${freeHost}) where anyone can publish, and asks for a password, card or code.` });
    rows.push({ ok: false, title: 'Free hosting asking for secrets', detail: `${freeHost}: real companies host their logins on their own address` });
  }
  if (page.exfil) {
    hints.push({ id: 'exfil', strength: 2, text: `The page has code that sends to ${page.exfil}, how phishing kits pass on what people type.` });
    rows.push({ ok: false, title: 'Sends to a chat bot or webhook', detail: page.exfil });
  }
  // A supplier on record named in the title, on an address that isn't theirs (and isn't a near-copy, counted above).
  const named = suppliers.find((s) => s.name.length >= 4 && title.toLowerCase().includes(s.name.toLowerCase().replace(/^pt\.?\s+/, '')) && registrable(s.domain) !== reg);
  if (named && !look) {
    hints.push({ id: 'brand_mismatch', strength: 2, text: `The page calls itself ${named.name}, but its address isn’t ${named.domain}, the one on record.` });
    rows.push({ ok: false, title: 'Name and address don’t match', detail: `${named.name} is on record at ${named.domain}` });
  }
  const labels = host.split('.');
  if (labels.length >= 5 || (host.match(/-/g) ?? []).length >= 3) {
    hints.push({ id: 'long_host', strength: 1, text: 'The address is long and stacked with words or dashes, a way to hide the real site name.' });
    rows.push({ ok: false, title: 'A long, stacked address', detail: host });
  }

  if (extra.ageDays !== undefined && extra.ageDays !== null) {
    measured.push(`Domain registered ${extra.ageDays} days ago.`);
    if (extra.ageDays < 30) {
      hints.push({ id: 'young', strength: 2, text: `The site’s address was registered only ${extra.ageDays} days ago.` });
      rows.push({ ok: false, title: 'A brand-new address', detail: `Registered ${extra.ageDays} days ago` });
    } else if (extra.ageDays < 180) {
      hints.push({ id: 'young_months', strength: 1, text: `The site’s address is only ${Math.round(extra.ageDays / 30)} months old.` });
      rows.push({ ok: false, title: 'A young address', detail: `Registered ${extra.ageDays} days ago` });
    } else {
      rows.push({ ok: true, title: 'An established address', detail: `Registered ${Math.round(extra.ageDays / 365)} year(s) ago or more` });
    }
  }

  if (asksSecrets) {
    const what = [page.passwordFields && 'a password', page.cardFields && 'card details', page.otpFields && 'a one-time code or PIN'].filter(Boolean).join(', ');
    measured.push(`The page asks for ${what}.`);
    rows.push({ ok: true, title: `Asks for ${what}`, detail: 'Normal on a real login or checkout; on a copy it’s how the scam works' });
  }

  return { hints, rows, measured: measured.join(' '), imitates: look?.match.name };
}
