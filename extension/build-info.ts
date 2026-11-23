// What each build is stamped with, so the panel and the pages can show which build is running.
// Used by extension/vite.config.ts and web/vite.config.ts. Read when Vite starts: a dev server
// keeps the stamp it started with; every `npm run build` and `npm run package` gets a new one.
import { execSync } from 'node:child_process';

function git(args: string): string {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

/** Vite `define` values: the package version, the commit (with "+" for uncommitted changes) and the build time. */
export function buildDefine(version: string): Record<string, string> {
  const commit = git('rev-parse --short HEAD') || 'unknown';
  const dirty = git('status --porcelain') !== '';
  return {
    __FISHY_VERSION__: JSON.stringify(version),
    __FISHY_COMMIT__: JSON.stringify(`${commit}${dirty ? '+' : ''}`),
    __FISHY_BUILT__: JSON.stringify(new Date().toISOString()),
  };
}
