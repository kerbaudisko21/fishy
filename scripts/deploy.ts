// `npm run deploy`, after the pre-deploy check: FISHY's rules, functions and
// pages to Firebase. What is passed after `--` goes on to the Firebase CLI,
// for example `npm run deploy -- --non-interactive`.
//
// When some functions fail, this tries those again once, a minute later. A
// region gives a project only so much CPU, and many functions updated at the
// same moment can run into that limit. A few, a little later, get through.

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

import { FIRST_ONLY, failedFunctions, retryOnly } from './deploy-plan.ts';

const CLI = ['-y', 'firebase-tools@15', 'deploy'];
const passedOn = process.argv.slice(2);
const WAIT_SECONDS = 60;

/** Runs the Firebase CLI. Shows what it prints, and keeps a copy to read. */
function firebaseDeploy(only: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    // The keyboard stays connected, so a deploy by hand can still be asked a question.
    const child = spawn('npx', [...CLI, '--only', only, ...passedOn], {
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

const first = await firebaseDeploy(FIRST_ONLY);
if (first.code === 0) {
  process.exit(0);
}

const failed = failedFunctions(first.output);
const again = retryOnly(failed);
if (again === null) {
  process.exit(first.code);
}

console.log(`\n${failed.length} of the functions did not deploy: ${failed.join(', ')}.`);
console.log(`Trying only those again in ${WAIT_SECONDS} seconds, with the rules and pages.\n`);
await wait(WAIT_SECONDS * 1000);

const second = await firebaseDeploy(again);
if (second.code !== 0) {
  console.error('\nStill not deployed. The functions named above are on their previous version.');
  console.error('The next deploy may not pick them up by itself. To finish by hand, a few minutes from now:');
  console.error(`  npx ${CLI.join(' ')} --only ${again}`);
}
process.exit(second.code);
