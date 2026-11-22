// PIN handling.
//
// The PIN is stored as a salted hash, so it is not readable at a glance. A
// four to six digit PIN is too short for a hash alone to protect it: the real
// protection is that only the server can read the record, and that a check
// allows three attempts.

import { scryptSync, timingSafeEqual } from 'node:crypto';

import type { PinRecord } from './ports.ts';

const PIN_FORMAT = /^\d{4,6}$/;
const HASH_FORMAT = /^[0-9a-f]{64}$/;
const HASH_BYTES = 32;

export function isPinFormat(pin: string): boolean {
  return PIN_FORMAT.test(pin);
}

export function hashPin(pin: string, salt: string): PinRecord {
  if (!isPinFormat(pin)) {
    throw new Error('A PIN is four to six digits.');
  }
  return { salt, hash: scryptSync(pin, salt, HASH_BYTES).toString('hex') };
}

/** False for a wrong PIN, a PIN in the wrong format, or a damaged record. Never throws. */
export function verifyPin(pin: string, record: PinRecord): boolean {
  if (!isPinFormat(pin) || record.salt === '' || !HASH_FORMAT.test(record.hash)) {
    return false;
  }
  const expected = Buffer.from(record.hash, 'hex');
  const actual = scryptSync(pin, record.salt, HASH_BYTES);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
