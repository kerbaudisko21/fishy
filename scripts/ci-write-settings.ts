// Run by the deploy workflow, before `npm run deploy`. Writes the three
// settings files from the workflow's environment. The rules are in ci-settings.ts.
//
// It never prints a value. Outside GitHub Actions it refuses to run, so it
// cannot replace settings files a person wrote by hand.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ciSettings } from './ci-settings.ts';

if (process.env.GITHUB_ACTIONS !== 'true') {
  console.error('This writes over .firebaserc and the .env files. It only runs in GitHub Actions. On a laptop, write them by hand: see the README.');
  process.exit(1);
}

const result = ciSettings(process.env);
if (!result.ok) {
  for (const problem of result.problems) {
    console.error(`STOP: ${problem}`);
  }
  console.error('\nNo settings were written. Set these in the repository: Settings > Secrets and variables > Actions.');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const { files } = result;
writeFileSync(root + '.firebaserc', files.firebaserc);
writeFileSync(root + files.functionsEnvPath, files.functionsEnv);
writeFileSync(root + 'web/.env.local', files.webEnv);
console.log('Wrote .firebaserc, the Functions settings and web/.env.local.');
