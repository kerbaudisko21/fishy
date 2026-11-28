// How old a sender's domain is. A look-alike domain used for an invoice scam is
// often days old, while a real supplier's domain is years old.
//
// Takes the domain and nothing else. Registration dates come from RDAP, the
// public successor to WHOIS; rdap.org forwards each lookup to the registry that
// holds the domain.

import { RequestError } from '../request-error.ts';

export interface RdapEvent {
  eventAction?: string;
  eventDate?: string;
}

/** Returns the domain's RDAP events, or null when no registry has a record of it. */
export interface RdapLookup {
  events(domain: string): Promise<RdapEvent[] | null>;
}

export interface DomainAge {
  days: number;
  /** e.g. "12 Nov 2026" */
  registered: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// A host name: labels of letters, digits and hyphens, with at least one dot.
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export async function domainAge(
  deps: { rdap: RdapLookup; now(): number },
  caller: { uid: string } | null,
  data: unknown,
): Promise<DomainAge> {
  if (!caller) {
    throw new RequestError('unauthenticated', 'Sign in first.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new RequestError('invalid-argument', 'Send the domain as domain.');
  }
  const fields = data as Record<string, unknown>;
  if (Object.keys(fields).some((key) => key !== 'domain')) {
    throw new RequestError('invalid-argument', 'Only domain is accepted. Nothing else about the message may be sent.');
  }
  const domain = typeof fields.domain === 'string' ? fields.domain.trim().toLowerCase().replace(/\.$/, '') : '';
  if (!DOMAIN.test(domain)) {
    throw new RequestError('invalid-argument', 'domain must be a domain name, such as example.com.');
  }

  const events = await deps.rdap.events(domain);
  const registration = events?.find((event) => event.eventAction === 'registration')?.eventDate;
  const at = registration ? Date.parse(registration) : Number.NaN;
  if (Number.isNaN(at)) {
    throw new RequestError('not-found', 'No registration date on record for this domain.');
  }

  const date = new Date(at);
  return {
    days: Math.max(0, Math.floor((deps.now() - at) / DAY_MS)),
    registered: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
  };
}

/** The real lookup, through rdap.org. Times out after 5 seconds. */
export function rdapOrg(): RdapLookup {
  return {
    async events(domain) {
      const response = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
        // rdap.org refuses requests that carry Node's default client name (403).
        headers: { accept: 'application/rdap+json', 'user-agent': 'fishy-domain-age/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      });
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`RDAP answered ${response.status}.`);
      }
      const body = (await response.json()) as { events?: RdapEvent[] };
      return body.events ?? [];
    },
  };
}
