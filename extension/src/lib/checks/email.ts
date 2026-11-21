import { registrable } from './domain';

/** Sender authentication read from the email's own headers (Gmail "Show original"), on the laptop. */
export interface SenderAuth {
  dmarc?: 'pass' | 'fail' | 'none';
  spf?: 'pass' | 'fail' | 'softfail' | 'neutral' | 'none';
  dkim?: 'pass' | 'fail' | 'none';
  replyTo?: string;
}

const FREE_MAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.co.id', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'mail.com', 'gmx.com', 'yandex.com', 'zoho.com']);

/** Reads Authentication-Results and Reply-To from raw headers. Only the first header block is used. */
export function parseHeaders(raw: string): SenderAuth {
  const head = raw.split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g, ' ');
  const results = [...head.matchAll(/^Authentication-Results:(.*)$/gim)].map((m) => m[1].toLowerCase()).join(' ');
  const pick = <T extends string>(name: string, allowed: T[]): T | undefined => {
    const v = new RegExp(`\\b${name}=(\\w+)`).exec(results)?.[1] as T | undefined;
    return v && allowed.includes(v) ? v : v ? ('fail' as T) : undefined;
  };
  const replyTo = /^Reply-To:.*?<?([\w.+-]+@[\w.-]+)>?\s*$/im.exec(head)?.[1]?.toLowerCase();
  return {
    dmarc: pick('dmarc', ['pass', 'fail', 'none']),
    spf: pick('spf', ['pass', 'fail', 'softfail', 'neutral', 'none']),
    dkim: pick('dkim', ['pass', 'fail', 'none']),
    replyTo,
  };
}

export interface AuthVerdict {
  failed: boolean;
  detail: string;
}

/** Fails on a DMARC fail, or a reply-to on a free webmail address while the sender is a company domain. */
export function judgeAuth(from: string, auth: SenderAuth): AuthVerdict {
  const parts: string[] = [];
  let failed = false;
  if (auth.dmarc) {
    parts.push(`DMARC: ${auth.dmarc}`);
    if (auth.dmarc === 'fail') failed = true;
  } else if (auth.spf || auth.dkim) {
    parts.push(`SPF: ${auth.spf ?? '—'}, DKIM: ${auth.dkim ?? '—'}`);
    if (auth.spf === 'fail' && auth.dkim !== 'pass') failed = true;
  }
  const fromDomain = registrable(from);
  const replyDomain = auth.replyTo ? registrable(auth.replyTo) : undefined;
  if (replyDomain && replyDomain !== fromDomain) {
    const free = FREE_MAIL.has(replyDomain);
    parts.push(free ? 'reply-to is a free webmail address' : `replies go to ${replyDomain}`);
    if (free && !FREE_MAIL.has(fromDomain)) failed = true;
  }
  return { failed, detail: parts.join(' · ') || 'No authentication results in the headers' };
}
