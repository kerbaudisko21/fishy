// Loads the demo company into Firestore: the directory (private and masked
// copies) and the starting known-bad list. It also clears the PIN lock and the
// hourly call count of everyone it loads, so a rehearsal that used them up can
// start again.
//
// Phone numbers and the PIN are read from the environment, never from a file
// in this repository. Use numbers you have verified with the phone provider
// and a made-up PIN. The keys are the IDs in extension/src/demo/fixtures.ts.
//
//   SEED_PROJECT_ID=your-project-id \
//   SEED_PHONES='{"budi":"+00000000000","sari":"+00000000000"}' \
//   SEED_PIN=0000 \
//   npm run seed
//
// Add `-- --dry-run` to see what would be written, with numbers masked.
// Needs Google application default credentials for the project.

import { randomBytes } from 'node:crypto';

import { initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

import { DEMO_DIRECTORY, DEMO_KNOWN_BAD, DEMO_SUPPLIERS } from '../extension/src/demo/fixtures.ts';
import { DATABASE_ID } from '../functions/src/call/store-firestore.ts';
import { buildSeed } from './seed-data.ts';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Set ${name} first. See the comment at the top of scripts/seed.ts.`);
    process.exit(1);
  }
  return value;
}

function readPhones(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(required('SEED_PHONES'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    const phones: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new Error('not a string');
      }
      phones[id] = value;
    }
    return phones;
  } catch {
    console.error('SEED_PHONES must be JSON such as {"budi":"+00000000000"}.');
    process.exit(1);
  }
}

const dryRun = process.argv.includes('--dry-run');

let seed;
try {
  seed = buildSeed({
    people: DEMO_DIRECTORY,
    suppliers: DEMO_SUPPLIERS,
    knownBad: DEMO_KNOWN_BAD,
    phones: readPhones(),
    pin: required('SEED_PIN'),
    saltFor: () => randomBytes(16).toString('hex'),
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const listed = Object.values(seed.directoryPublic);
const summary = [
  `Can be called: ${Object.keys(seed.directory).join(', ') || 'nobody'}`,
  `Left out, no number given: ${seed.skipped.join(', ') || 'nobody'}`,
  `Suppliers: ${listed.filter((entry) => entry.type === 'supplier').map((entry) => entry.name).join(', ')}`,
  `Known-bad entries: ${Object.keys(seed.knownBad).length}`,
  `PIN lock and hourly call count cleared for: ${seed.clearLimitsFor.join(', ') || 'nobody'}`,
];

if (dryRun) {
  console.log(['Dry run. Nothing was written.', ...summary].join('\n'));
  process.exit(0);
}

initializeApp({ projectId: required('SEED_PROJECT_ID') });
const db = getFirestore(DATABASE_ID);
const batch = db.batch();
for (const [id, entry] of Object.entries(seed.directory)) {
  batch.set(db.collection('directory').doc(id), entry);
}
for (const [id, entry] of Object.entries(seed.directoryPublic)) {
  batch.set(db.collection('directoryPublic').doc(id), entry);
}
for (const [id, entry] of Object.entries(seed.knownBad)) {
  batch.set(db.collection('knownBad').doc(id), entry);
}
// Five wrong PINs lock a person for a day and five checks fill their hour (functions/src/call).
// Both are easy to use up while rehearsing, and nothing else clears them.
for (const id of seed.clearLimitsFor) {
  batch.delete(db.collection('pinFailures').doc(id));
  // One counter per person and hour, named "<person>_<hour>".
  const counters = await db
    .collection('personCounters')
    .where(FieldPath.documentId(), '>=', `${id}_`)
    .where(FieldPath.documentId(), '<', `${id}_\uf8ff`)
    .get();
  for (const counter of counters.docs) {
    batch.delete(counter.ref);
  }
}
await batch.commit();
console.log([`Written to the "${DATABASE_ID}" database of ${required('SEED_PROJECT_ID')}.`, ...summary].join('\n'));
