// Checks one link against a list of suspected unsafe sites.
//
// The list service sees the address it is asked about. So whatever the client
// sent, the query string, the fragment and any sign-in details are removed
// here first, and nothing else about the email is accepted at all.
//
// Results are not stored. A match is only reported until its expiry time,
// and must be shown with the attribution below.

import { RequestError } from '../request-error.ts';

export interface ThreatLookup {
  /** The kinds of threat listed for this address, and when that answer stops being valid. */
  search(uri: string): Promise<{ threatTypes: string[]; expireTime: string | null }>;
}

export interface LinkResult {
  /** The address that was actually looked up. */
  checked: string;
  match: boolean;
  threatTypes: string[];
  expireTime: string | null;
  /** Required wherever a match is shown. Null when there is no match. */
  advisory: { text: string; url: string } | null;
}

export const ADVISORY = {
  text: 'Advisory provided by Google',
  url: 'https://cloud.google.com/web-risk/docs/advisory',
} as const;

const MAX_LENGTH = 2048;

/** Scheme, host, port and path only. Null if it is not a web address. */
export function cleanUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return null;
  }
}

/** True once a result may no longer be shown or relied on. */
export function expired(result: { match: boolean; expireTime: string | null }, now: number): boolean {
  return result.expireTime !== null && Date.parse(result.expireTime) <= now;
}

export async function checkLink(
  deps: { lookup: ThreatLookup; now(): number },
  caller: { uid: string } | null,
  data: unknown,
): Promise<LinkResult> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', 'Send the address as url.');
  }
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== 'url')) {
    throw new RequestError('invalid-argument', 'Only url is accepted. Nothing else about the message may be sent.');
  }
  const { url } = fields;
  if (typeof url !== 'string' || url.length > MAX_LENGTH) {
    throw new RequestError('invalid-argument', 'url is missing or too long.');
  }
  const checked = cleanUrl(url);
  if (checked === null) {
    throw new RequestError('invalid-argument', 'url must be a web address.');
  }

  let found: { threatTypes: string[]; expireTime: string | null };
  try {
    found = await deps.lookup.search(checked);
  } catch {
    // The service's own error can name the project, so it is not passed on.
    throw new Error('The link could not be checked.');
  }

  const match = found.threatTypes.length > 0 && !expired({ match: true, expireTime: found.expireTime }, deps.now());
  if (!match) {
    return { checked, match: false, threatTypes: [], expireTime: null, advisory: null };
  }
  return { checked, match: true, threatTypes: found.threatTypes, expireTime: found.expireTime, advisory: ADVISORY };
}
