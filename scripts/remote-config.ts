// Publishes FISHY's Remote Config parameters (remoteconfig.template.json) into
// the project named in .firebaserc, keeping every other parameter as it is.
//
//   npm run remoteconfig -- --dry-run     show what would change
//   npm run remoteconfig                  publish
//
// Needs Google application default credentials for the project.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { initializeApp } from 'firebase-admin/app';
import { getRemoteConfig } from 'firebase-admin/remote-config';

import { mergeParameters } from './remote-config-merge.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let projectId: string;
try {
  const firebaserc = JSON.parse(readFileSync(`${root}.firebaserc`, 'utf8')) as { projects?: { default?: string } };
  projectId = firebaserc.projects?.default ?? '';
} catch {
  projectId = '';
}
if (!projectId) {
  fail('There is no project. Copy .firebaserc.example to .firebaserc and put your project ID in it.');
}

const ours = (JSON.parse(readFileSync(`${root}remoteconfig.template.json`, 'utf8')) as { parameters?: Record<string, unknown> }).parameters ?? {};

initializeApp({ projectId });
const remoteConfig = getRemoteConfig();
const template = await remoteConfig.getTemplate();
const merged = mergeParameters(template.parameters as Record<string, unknown>, ours);

console.log(
  [
    `Project: ${projectId}`,
    `Added: ${merged.added.join(', ') || 'none'}`,
    `Updated: ${merged.updated.join(', ') || 'none'}`,
    `Already up to date: ${merged.unchanged.join(', ') || 'none'}`,
    `Not ours, left as they are: ${merged.kept.length}`,
  ].join('\n'),
);

if (process.argv.includes('--dry-run')) {
  console.log('Dry run. Nothing was published.');
  process.exit(0);
}
if (merged.added.length === 0 && merged.updated.length === 0) {
  console.log('Nothing to publish.');
  process.exit(0);
}

template.parameters = merged.parameters as typeof template.parameters;
// The template carries the version it was read at. If someone else published in
// between, this fails and nothing is overwritten: run it again.
await remoteConfig.validateTemplate(template);
await remoteConfig.publishTemplate(template);
console.log('Published.');
