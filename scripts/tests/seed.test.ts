// What the seed script writes to Firestore.
//
// Phone numbers and PINs are supplied when the script runs. They never come
// from a file in the repository, and they only ever go into the collection
// that clients cannot read.
//
// The tests take people and suppliers from the demo fixtures by position, so
// they keep working when the demo company is renamed.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_DIRECTORY, DEMO_KNOWN_BAD, DEMO_SUPPLIERS } from '../../extension/src/demo/fixtures.ts';
import { verifyPin } from '../../functions/src/call/pin.ts';
import { knownBadEntry } from '../../functions/src/learn/known-bad-doc.ts';
import { buildSeed, maskPhone } from '../seed-data.ts';

const [first, second, third] = DEMO_DIRECTORY;
const [supplier, otherSupplier] = DEMO_SUPPLIERS;
assert.ok(first && second && third && supplier && otherSupplier, 'the demo company has three people and two suppliers');

// Numbers in the range reserved for fiction.
const PHONES = { [first.id]: '+12025550143', [second.id]: '+1 202 555 0144', [supplier.id]: '+12025550145' };

function seed(phones: Record<string, string> = PHONES, pin = '4821') {
  return buildSeed({
    people: DEMO_DIRECTORY,
    suppliers: DEMO_SUPPLIERS,
    knownBad: DEMO_KNOWN_BAD,
    phones,
    pin,
    saltFor: (id) => `salt-${id}`,
  });
}

test('the copy the side panel reads has names, roles and masked numbers, and nothing private', () => {
  const { directoryPublic } = seed();

  assert.deepEqual(directoryPublic[first.id], {
    type: 'person',
    name: first.name,
    role: first.role,
    phoneMasked: '+12 025 •••• 0143',
    pinSet: true,
    ...(first.escalationOrder === undefined ? {} : { escalationOrder: first.escalationOrder }),
  });
  const text = JSON.stringify(directoryPublic);
  for (const secret of ['2025550143', '2025550144', '2025550145', 'salt-', '4821', 'pinHash']) {
    assert.ok(!text.includes(secret), `the public copy must not contain ${secret}`);
  }
});

test('the private directory has the number on record and a PIN record, not the PIN', () => {
  const { directory } = seed();

  assert.equal(directory[first.id]?.phone, '+12025550143');
  assert.equal(directory[second.id]?.phone, '+12025550144', 'spaces are removed');
  assert.ok(!JSON.stringify(directory).includes('4821'));
  const record = { salt: directory[first.id]?.pinSalt ?? '', hash: directory[first.id]?.pinHash ?? '' };
  assert.equal(verifyPin('4821', record), true);
  assert.equal(verifyPin('0000', record), false);
});

test('only people with a number are listed, and the rest are reported', () => {
  const { directory, directoryPublic, skipped } = seed();

  assert.deepEqual(skipped, [third.id]);
  assert.equal(directoryPublic[third.id], undefined, 'nobody is listed with a number that is not on record');
  assert.equal(directory[third.id], undefined);
});

test('a supplier is always listed, and its contact can be called only when a number is given', () => {
  const { directory, directoryPublic } = seed();

  const listed = directoryPublic[supplier.id];
  assert.ok(listed?.type === 'supplier');
  assert.equal(listed.domain, supplier.domain);
  assert.deepEqual(listed.account, supplier.account);
  assert.equal(listed.contact.phoneMasked, '+12 025 •••• 0145');
  assert.equal(directory[supplier.id]?.name, supplier.contact.name);
  assert.equal(directory[supplier.id]?.phone, '+12025550145');

  const other = directoryPublic[otherSupplier.id];
  assert.ok(other?.type === 'supplier');
  assert.equal(other.contact.phoneMasked, '', 'no number given: none is shown');
  assert.equal(directory[otherSupplier.id], undefined);
});

test('a number that is not in international format stops the seed', () => {
  assert.throws(() => seed({ [first.id]: '0812' }), /international format/);
});

test('a number for someone who is not in the demo company stops the seed', () => {
  assert.throws(() => seed({ nobody: '+12025550143' }), /not a person or a supplier/);
});

test('the PIN must be four digits, because the approval page asks for four', () => {
  assert.throws(() => seed(PHONES, '482100'), /four digits/);
  assert.throws(() => seed(PHONES, 'abcd'), /four digits/);
});

test('the known-bad list is filed under the IDs the learning step uses, so counts add up', () => {
  const { knownBad } = seed();

  assert.equal(Object.keys(knownBad).length, DEMO_KNOWN_BAD.length);
  for (const entry of DEMO_KNOWN_BAD) {
    const type = entry.kind === 'phone' ? 'number' : entry.kind;
    assert.deepEqual(knownBad[knownBadEntry({ type, value: entry.value }).id], entry);
  }
});

test('a masked number shows the start and the last four digits only', () => {
  assert.equal(maskPhone('+12025550143'), '+12 025 •••• 0143');
});
