// Works out what the seed script writes to Firestore. No database in here, so
// it can be tested.
//
// The people, suppliers and known-bad list come from the demo company in
// extension/src/demo/fixtures.ts, so the live directory and the demo case
// always tell the same story. That file holds masked numbers only. The real
// numbers and the PIN are supplied when the script runs, and both go only
// into `directory`, which clients cannot read.

import { hashPin } from '../functions/src/call/pin.ts';
import type { DirectoryPerson, KnownBadEntry, Supplier } from '../extension/src/lib/types.ts';

export interface SeedInput {
  people: readonly DirectoryPerson[];
  suppliers: readonly Supplier[];
  knownBad: readonly KnownBadEntry[];
  /** Directory ID (a person or a supplier) to the number on record, in international format. */
  phones: Record<string, string>;
  /** One demo PIN for everyone. Four digits, because the approval page asks for four. */
  pin: string;
  saltFor(id: string): string;
}

interface PrivateEntry {
  type: 'person' | 'supplier';
  name: string;
  role: string;
  phone: string;
  pinSalt: string;
  pinHash: string;
}

export interface SeedOutput {
  /** Readable by Cloud Functions only: the number on record and the PIN record. */
  directory: Record<string, PrivateEntry>;
  /** Readable by the side panel: masked numbers only. */
  directoryPublic: Record<string, ({ type: 'person' } & Omit<DirectoryPerson, 'id'>) | ({ type: 'supplier' } & Omit<Supplier, 'id'>)>;
  /** Document ID to entry. The ID is the one the "not me" learning step uses, so counts add up. */
  knownBad: Record<string, KnownBadEntry>;
  /** People who were left out because no number was given for them. */
  skipped: string[];
  /**
   * Everyone who can be called. Seeding clears their PIN lock and hourly call count, so a
   * rehearsal that used them up can start again.
   */
  clearLimitsFor: string[];
}

const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;
const FOUR_DIGITS = /^\d{4}$/;

/** "+62 812 •••• 4410": enough to recognise the number, not enough to dial it. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)} ${phone.slice(3, 6)} •••• ${phone.slice(-4)}`;
}

function numberFor(id: string, given: string): string {
  const phone = given.replace(/[\s().-]/g, '');
  if (!INTERNATIONAL.test(phone)) {
    throw new Error(`The number for "${id}" must be in international format, such as +00000000000.`);
  }
  return phone;
}

export function buildSeed(input: SeedInput): SeedOutput {
  const { people, suppliers, knownBad, phones, pin, saltFor } = input;
  if (!FOUR_DIGITS.test(pin)) {
    throw new Error('The PIN must be four digits.');
  }
  const known = new Set([...people.map((person) => person.id), ...suppliers.map((supplier) => supplier.id)]);
  for (const id of Object.keys(phones)) {
    if (!known.has(id)) {
      throw new Error(`"${id}" is not a person or a supplier in extension/src/demo/fixtures.ts.`);
    }
  }

  const output: SeedOutput = { directory: {}, directoryPublic: {}, knownBad: {}, skipped: [], clearLimitsFor: [] };

  for (const { id, ...person } of people) {
    const given = phones[id];
    if (given === undefined) {
      // Nobody is listed with a number that is not on record.
      output.skipped.push(id);
      continue;
    }
    const phone = numberFor(id, given);
    const record = hashPin(pin, saltFor(id));
    output.directory[id] = { type: 'person', name: person.name, role: person.role, phone, pinSalt: record.salt, pinHash: record.hash };
    output.directoryPublic[id] = { type: 'person', ...person, phoneMasked: maskPhone(phone), pinSet: true };
  }

  for (const { id, ...supplier } of suppliers) {
    const given = phones[id];
    let phoneMasked = '';
    if (given !== undefined) {
      const phone = numberFor(id, given);
      const record = hashPin(pin, saltFor(id));
      phoneMasked = maskPhone(phone);
      output.directory[id] = {
        type: 'supplier',
        name: supplier.contact.name,
        role: `${supplier.contact.role}, ${supplier.name}`,
        phone,
        pinSalt: record.salt,
        pinHash: record.hash,
      };
    }
    // The supplier is always listed: the sender and invoice checks need its domain and account.
    output.directoryPublic[id] = { type: 'supplier', ...supplier, contact: { ...supplier.contact, phoneMasked } };
  }

  for (const entry of knownBad) {
    output.knownBad[`${entry.kind}:${entry.value}`] = { ...entry };
  }
  output.clearLimitsFor = Object.keys(output.directory);
  return output;
}
