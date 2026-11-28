import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_KNOWN_BAD, DEMO_SUPPLIERS } from '../../extension/src/demo/fixtures.ts';
import { buildSeed } from '../seed-data.ts';

test('the seed lists every demo supplier, with no phone number', () => {
  const seed = buildSeed({ suppliers: DEMO_SUPPLIERS, knownBad: DEMO_KNOWN_BAD });
  assert.equal(Object.keys(seed.directoryPublic).length, DEMO_SUPPLIERS.length);
  for (const entry of Object.values(seed.directoryPublic)) {
    assert.equal(entry.type, 'supplier');
    assert.equal(entry.contact.phoneMasked, '');
    assert.ok(entry.domain);
  }
});

test('known-bad entries are keyed by kind and value', () => {
  const seed = buildSeed({ suppliers: [], knownBad: DEMO_KNOWN_BAD });
  for (const entry of DEMO_KNOWN_BAD) assert.deepEqual(seed.knownBad[`${entry.kind}:${entry.value}`], entry);
});
