// Runs before every deploy (`npm run deploy`), or by itself (`npm run deploy:check`).
// Reads the settings files, prints what is about to be deployed, and stops the
// deploy if it would go wrong. The rules are in deploy-check.ts.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { checkDeploy, parseEnv } from './deploy-check.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string): string | null => (existsSync(root + path) ? readFileSync(root + path, 'utf8') : null);

/** Several settings files as one text, later files winning. Null when none exists. */
function together(paths: string[]): string | null {
  const texts = paths.map(read).filter((text): text is string => text !== null);
  return texts.length === 0 ? null : texts.join('\n');
}

// The same files Vite reads for a production build, then VITE_* from the environment.
const webFiles = together(['web/.env', 'web/.env.local', 'web/.env.production', 'web/.env.production.local']);
const webEnv: Record<string, string | undefined> = { ...(webFiles === null ? {} : parseEnv(webFiles)) };
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('VITE_') && value) {
    webEnv[key] = value;
  }
}

const result = checkDeploy(
  {
    firebaserc: read('.firebaserc'),
    // The Firebase CLI reads functions/.env first, then the file for the project.
    functionsEnv: (projectId) => (read(`functions/.env.${projectId}`) === null ? null : together(['functions/.env', `functions/.env.${projectId}`])),
    webEnv,
  },
  // A workflow log on a public repository can be read by anyone.
  { publicLog: process.env.GITHUB_ACTIONS === 'true' },
);

console.log(result.summary);
for (const finding of result.findings) {
  console.log(`${finding.level === 'error' ? 'STOP' : 'Note'}: ${finding.message}`);
}
if (!result.ok) {
  console.error('\nNot deployed. Fix the lines marked STOP and run it again.');
  process.exit(1);
}
