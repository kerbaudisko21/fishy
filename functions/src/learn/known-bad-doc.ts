// The shape of one entry in the known-bad list, as the side panel reads it
// from `knownBad/{id}`:
//
//   { kind, value, display, count, events: [{ date, what }] }
//
// - An account is listed by its last four digits. The full number of an
//   account is never published, and the side panel matches on the last four.
// - A domain is listed as it is. A phone number is listed as digits only.
//
// No database in here, so the shape can be tested.

import type { KnownBadKey } from '../call/ports.ts';

export interface KnownBadEvent {
  /** For example "14 Nov". */
  date: string;
  /** One plain line about the scam. Never the text of a message. */
  what: string;
}

export interface KnownBadDoc {
  kind: 'account' | 'domain' | 'phone';
  value: string;
  display: string;
  count: number;
  events: KnownBadEvent[];
}

const MOST_EVENTS = 5;
// Dates are shown the way the finance team reads them, in their own time zone.
const DISPLAY_TIME_ZONE = 'Asia/Jakarta';

export function lastFour(account: string): string {
  return account.replace(/\D/g, '').slice(-4);
}

function shortDate(now: number): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: DISPLAY_TIME_ZONE }).format(
    new Date(now),
  );
}

/** Where a detail lives in the list, and how it is shown. */
export function knownBadEntry(key: KnownBadKey): { id: string; kind: KnownBadDoc['kind']; value: string; display: string } {
  if (key.type === 'account') {
    const value = lastFour(key.value);
    return { id: `account:${value}`, kind: 'account', value, display: `•••• ${value}` };
  }
  if (key.type === 'domain') {
    const value = key.value.trim().toLowerCase();
    return { id: `domain:${value}`, kind: 'domain', value, display: value };
  }
  const value = key.value.replace(/\D/g, '');
  return {
    id: `phone:${value}`,
    kind: 'phone',
    value,
    display: `+${value.slice(0, 2)} ${value.slice(2, 5)} •••• ${value.slice(-4)}`,
  };
}

function eventsOf(existing: Record<string, unknown>): KnownBadEvent[] {
  if (!Array.isArray(existing.events)) {
    return [];
  }
  return existing.events.flatMap((event: unknown) => {
    if (typeof event !== 'object' || event === null) {
      return [];
    }
    const { date, what } = event as Record<string, unknown>;
    return typeof date === 'string' && typeof what === 'string' ? [{ date, what }] : [];
  });
}

/**
 * The entry after one more confirmed scam. `existing` is what the list holds
 * now, if anything: its count goes up by one, and it keeps the way it was
 * shown, which may name the bank.
 */
export function knownBadDoc(existing: unknown, key: KnownBadKey, now: number, what: string): KnownBadDoc {
  const entry = knownBadEntry(key);
  const before = typeof existing === 'object' && existing !== null ? (existing as Record<string, unknown>) : {};
  const count = typeof before.count === 'number' && Number.isFinite(before.count) && before.count > 0 ? before.count : 0;
  const display = typeof before.display === 'string' && before.display.trim() !== '' ? before.display : entry.display;
  return {
    kind: entry.kind,
    value: entry.value,
    display,
    count: count + 1,
    events: [{ date: shortDate(now), what }, ...eventsOf(before)].slice(0, MOST_EVENTS),
  };
}
