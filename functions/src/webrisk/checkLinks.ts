// Checks the links of one email against a list of suspected unsafe sites.
//
// Takes addresses and nothing else. Each one is stripped of its query string,
// fragment and sign-in details before it is looked up (see checkLink.ts), and
// nothing else about the email is accepted at all.

import { RequestError } from '../request-error.ts';
import { ADVISORY, checkLink, cleanUrl } from './checkLink.ts';
import type { ThreatLookup } from './checkLink.ts';

export interface LinksResult {
  /** The addresses, as they were sent, that are on a list. */
  unsafe: string[];
  /** How many different addresses were looked up. */
  checked: number;
  /** Required wherever a match is shown. Null when nothing matched. */
  advisory: { text: string; url: string } | null;
}

const MOST_URLS = 100;
// One email rarely has more. Past this, the rest are left unchecked and `checked` says so.
const MOST_LOOKUPS = 20;
const MAX_LENGTH = 2048;

export async function checkLinks(
  deps: { lookup: ThreatLookup; now(): number },
  caller: { uid: string } | null,
  data: unknown,
): Promise<LinksResult> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', 'Send the addresses as urls.');
  }
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== 'urls')) {
    throw new RequestError('invalid-argument', 'Only urls is accepted. Nothing else about the message may be sent.');
  }
  const { urls } = fields;
  if (!Array.isArray(urls) || urls.length > MOST_URLS) {
    throw new RequestError('invalid-argument', `urls must be a list of at most ${MOST_URLS} addresses.`);
  }
  if (!urls.every((url): url is string => typeof url === 'string' && url.length <= MAX_LENGTH)) {
    throw new RequestError('invalid-argument', 'Each address must be text, and not too long.');
  }

  // Many links in one email point at the same page. Look each page up once.
  const sentAs = new Map<string, string[]>();
  for (const url of urls) {
    const cleaned = cleanUrl(url);
    if (cleaned === null) {
      continue;
    }
    sentAs.set(cleaned, [...(sentAs.get(cleaned) ?? []), url]);
  }
  const toLookUp = [...sentAs.keys()].slice(0, MOST_LOOKUPS);
  const results = await Promise.all(toLookUp.map((url) => checkLink(deps, caller, { url })));

  const unsafe = results.filter((result) => result.match).flatMap((result) => sentAs.get(result.checked) ?? []);
  return { unsafe: [...new Set(unsafe)], checked: toLookUp.length, advisory: unsafe.length > 0 ? ADVISORY : null };
}
