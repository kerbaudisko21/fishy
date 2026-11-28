// Works out what the seed script writes to Firestore. No database in here, so it can be tested.
//
// The suppliers and the known-bad list come from extension/src/demo/fixtures.ts. Suppliers
// (name and domain) feed the website check's look-alike test and the QR code's name check.

import type { KnownBadEntry, Supplier } from '../extension/src/lib/types.ts';

export interface SeedInput {
  suppliers: readonly Supplier[];
  knownBad: readonly KnownBadEntry[];
}

export interface SeedOutput {
  /** Readable by the panel: suppliers on record, without any phone number. */
  directoryPublic: Record<string, { type: 'supplier' } & Omit<Supplier, 'id'>>;
  /** Document ID to entry. */
  knownBad: Record<string, KnownBadEntry>;
}

export function buildSeed({ suppliers, knownBad }: SeedInput): SeedOutput {
  const output: SeedOutput = { directoryPublic: {}, knownBad: {} };
  for (const { id, ...supplier } of suppliers) {
    // No phone numbers: FISHY no longer calls anyone.
    output.directoryPublic[id] = { type: 'supplier', ...supplier, contact: { ...supplier.contact, phoneMasked: '' } };
  }
  for (const entry of knownBad) output.knownBad[`${entry.kind}:${entry.value}`] = { ...entry };
  return output;
}
