// Reads the check the side panel created: `checks/{id}`.
//
// A client wrote that document, so nothing in it is trusted. Each field is
// checked for its shape here, and anything that does not fit is left out.
// What survives is shown to the approver on the approval page.

import type { CheckRecord } from './ports.ts';

const PLACES = ['meet', 'gmail', 'paste'] as const;
const CURRENCY = /^[A-Z]{3}$/;
const LONGEST_PAYEE = 120;

function readAmount(value: unknown): CheckRecord['amount'] {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const { value: amount, currency } = value as Record<string, unknown>;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  if (typeof currency !== 'string' || !CURRENCY.test(currency)) {
    return null;
  }
  return { value: amount, currency };
}

function readPayee(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const payee = value.replace(/\s+/g, ' ').trim();
  return payee === '' || payee.length > LONGEST_PAYEE ? null : payee;
}

/** Null when the document is not a check at all. */
export function readCheck(data: unknown): CheckRecord | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const { ownerUid, summary } = data as Record<string, unknown>;
  if (typeof ownerUid !== 'string' || ownerUid === '') {
    return null;
  }
  const fields = typeof summary === 'object' && summary !== null ? (summary as Record<string, unknown>) : {};
  const place = PLACES.find((known) => known === fields.place) ?? null;
  return { ownerUid, place, amount: readAmount(fields.amount), payee: readPayee(fields.payee) };
}
