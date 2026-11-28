// Loads the demo suppliers and the known-bad list into FISHY's Firestore database.
//
//   SEED_PROJECT_ID=your-project-id npm run seed
//
// Add `-- --dry-run` to see what would be written.
// Needs Google application default credentials for the project.

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { DEMO_KNOWN_BAD, DEMO_SUPPLIERS } from '../extension/src/demo/fixtures.ts';
import { buildSeed } from './seed-data.ts';

/** FISHY's own Firestore database (the same name as DATABASE in extension/src/lib/config.ts). */
const DATABASE_ID = 'fishy';

const project = process.env.SEED_PROJECT_ID;
if (!project) {
  console.error('Set SEED_PROJECT_ID first. See the comment at the top of scripts/seed.ts.');
  process.exit(1);
}

const seed = buildSeed({ suppliers: DEMO_SUPPLIERS, knownBad: DEMO_KNOWN_BAD });
const summary = [`Suppliers: ${Object.values(seed.directoryPublic).map((s) => s.name).join(', ')}`, `Known-bad entries: ${Object.keys(seed.knownBad).length}`];

if (process.argv.includes('--dry-run')) {
  console.log(['Dry run. Nothing was written.', ...summary].join('\n'));
  process.exit(0);
}

initializeApp({ projectId: project });
const db = getFirestore(DATABASE_ID);
const batch = db.batch();
for (const [id, entry] of Object.entries(seed.directoryPublic)) batch.set(db.collection('directoryPublic').doc(id), entry);
for (const [id, entry] of Object.entries(seed.knownBad)) batch.set(db.collection('knownBad').doc(id), entry);
await batch.commit();
console.log([`Written to the "${DATABASE_ID}" database of ${project}.`, ...summary].join('\n'));
