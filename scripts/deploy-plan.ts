// What `npm run deploy` asks the Firebase CLI to deploy, and what it tries
// again when some functions did not make it. The runner is deploy.ts.

const CODEBASE = 'fishy';
const HOSTING_TARGET = 'fishy';

/**
 * The first try: FISHY's rules, functions and pages.
 *
 * "functions" has no name after it on purpose. firebase.json holds one
 * codebase, so this still deploys FISHY's functions and no others. But a
 * codebase or function that is named ("functions:fishy") is never skipped by
 * the CLI, so every function was built and replaced on every deploy, changed
 * or not.
 */
export const FIRST_ONLY = `firestore,functions,hosting:${HOSTING_TARGET}`;

const HEADING = 'Functions deploy had errors with the following functions:';
// One line of the CLI's list: codebase:name(region). Nothing else may be on it.
const LINE = /^\s*([a-z0-9-]+):([A-Za-z][A-Za-z0-9_-]*)\(([a-z0-9-]+)\)\s*$/;
// Colour codes, as the CLI prints them in a workflow log.
const COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * The names of the functions the Firebase CLI says it could not deploy.
 * Empty when the deploy worked, failed for another reason, or printed its
 * list in a form this does not know: then nothing is tried again.
 */
export function failedFunctions(output: string): string[] {
  const lines = output.replace(COLOUR, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === HEADING);
  if (start === -1) {
    return [];
  }

  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = LINE.exec(line);
    if (!match) {
      break;
    }
    const [, codebase, name] = match;
    if (codebase === CODEBASE && name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * The second try: the functions left behind, by name, so the CLI does not
 * skip them. The rules and pages come along because a deploy whose functions
 * failed stops before it releases the pages. Null when there is nothing to
 * try again.
 */
export function retryOnly(failed: string[]): string | null {
  if (failed.length === 0) {
    return null;
  }
  return ['firestore', `hosting:${HOSTING_TARGET}`, ...failed.map((name) => `functions:${CODEBASE}:${name}`)].join(',');
}
