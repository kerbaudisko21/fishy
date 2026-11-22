// What `npm run deploy` asks the Firebase CLI to deploy, and what it tries
// again when some functions did not make it.
//
// Two things were learned from real deploys. Naming the codebase
// ("functions:fishy") makes the CLI redeploy every function every time, even
// when nothing changed. And a region gives a project only so much CPU: twelve
// functions updated twice within a few minutes ran into that limit, and three
// were left behind.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIRST_ONLY, failedFunctions, retryOnly } from '../deploy-plan.ts';

// The end of a real deploy that left three functions behind, colour codes
// and all. The project ID is hidden, as it is in a workflow log.
const HALF_DONE = [
  '\u001b[36m\u001b[1mi  functions:\u001b[22m\u001b[39m updating Node.js 22 (2nd Gen) function \u001b[1mfishy:voice(asia-southeast2)\u001b[22m...',
  'Could not create or update Cloud Run service getauditlog, Container Healthcheck failed. Quota exceeded for total allowable CPU per project per region.',
  '\u001b[32m\u001b[1m✔ \u001b[22m\u001b[39m \u001b[1m\u001b[32mfunctions[fishy:checkLinks(asia-southeast2)]\u001b[39m\u001b[22m Successful update operation.',
  '\u001b[33m\u001b[1m⚠  functions:\u001b[22m\u001b[39m Deploys failed. Skipping deletes.',
  'Functions deploy had errors with the following functions:',
  '\tfishy:domainAge(asia-southeast2)',
  '\tfishy:getAuditLog(asia-southeast2)',
  '\tfishy:startVerificationCall(asia-southeast2)',
  '\u001b[1mFunction URL\u001b[22m (fishy:voice(asia-southeast2)): https://voice-example-et.a.run.app',
  '\u001b[1m\u001b[31mError:\u001b[39m\u001b[22m \u001b[4mThere was an error deploying functions\u001b[24m:',
  '- \u001b[1mError\u001b[22m Failed to update function domainAge in region asia-southeast2',
].join('\n');

test('the first try names no function, so the CLI can skip the ones that did not change', () => {
  assert.equal(FIRST_ONLY, 'firestore,functions,hosting:fishy');
  assert.ok(!FIRST_ONLY.includes('functions:'), 'a named codebase or function is never skipped');
});

test('the functions left behind are read from what the CLI printed', () => {
  assert.deepEqual(failedFunctions(HALF_DONE), ['domainAge', 'getAuditLog', 'startVerificationCall']);
});

test('a function that deployed is not on the list, even though its name is printed too', () => {
  const failed = failedFunctions(HALF_DONE);

  assert.ok(!failed.includes('voice'));
  assert.ok(!failed.includes('checkLinks'));
});

test('a deploy that worked leaves nothing to try again', () => {
  const fine = [
    'i  functions: Skipping the deploy of unchanged functions.',
    '✔  functions[fishy:voice(asia-southeast2)] Skipped (No changes detected)',
    '✔  Deploy complete!',
  ].join('\n');

  assert.deepEqual(failedFunctions(fine), []);
  assert.deepEqual(failedFunctions(''), []);
});

test('a deploy that failed for another reason leaves nothing to try again', () => {
  const noPermission = 'Error: Missing permissions required for functions deploy. You must have permission iam.serviceAccounts.ActAs';

  assert.deepEqual(failedFunctions(noPermission), []);
});

test('only functions of the FISHY codebase are tried again', () => {
  const output = ['Functions deploy had errors with the following functions:', '\tother:theirFunction(us-central1)', '\tfishy:voice(asia-southeast2)'].join('\n');

  assert.deepEqual(failedFunctions(output), ['voice']);
});

test('the list ends at the first line that is not a function', () => {
  const output = [
    'Functions deploy had errors with the following functions:',
    '\tfishy:voice(asia-southeast2)',
    'To try redeploying those functions, run:',
    '\tfishy:notOnTheList(asia-southeast2)',
  ].join('\n');

  assert.deepEqual(failedFunctions(output), ['voice']);
});

test('a line that is more than a function name is not passed on to the command line', () => {
  for (const line of ['\tfishy:voice,hosting:another-site(asia-southeast2)', '\tfishy:voice --force(asia-southeast2)', '\tfishy:$(whoami)(asia-southeast2)']) {
    const output = `Functions deploy had errors with the following functions:\n${line}`;

    assert.deepEqual(failedFunctions(output), [], line);
  }
});

test('a function printed twice is tried once', () => {
  const output = ['Functions deploy had errors with the following functions:', '\tfishy:voice(asia-southeast2)', '\tfishy:voice(asia-southeast2)'].join('\n');

  assert.deepEqual(failedFunctions(output), ['voice']);
});

test('the second try names the failed functions, and the rules and pages a failed deploy did not release', () => {
  assert.equal(retryOnly(['domainAge', 'getAuditLog']), 'firestore,hosting:fishy,functions:fishy:domainAge,functions:fishy:getAuditLog');
});

test('with nothing left behind there is no second try', () => {
  assert.equal(retryOnly([]), null);
});
