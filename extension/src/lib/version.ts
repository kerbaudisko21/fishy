// Which build is running: set at build time by build-info.ts (see the two vite.config.ts files).

declare const __FISHY_VERSION__: string | undefined;
declare const __FISHY_COMMIT__: string | undefined;
declare const __FISHY_BUILT__: string | undefined;

export const VERSION = typeof __FISHY_VERSION__ === 'string' ? __FISHY_VERSION__ : 'dev';
/** Short commit, with "+" when the build had uncommitted changes. */
export const COMMIT = typeof __FISHY_COMMIT__ === 'string' ? __FISHY_COMMIT__ : 'unknown';
export const BUILT_AT = typeof __FISHY_BUILT__ === 'string' ? __FISHY_BUILT__ : '';

/** "23 Nov, 14:05" in the viewer's time zone. */
export function builtWhen(iso = BUILT_AT): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return 'unknown time';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** One line: "v0.2.0 · 760809d · built 23 Nov, 14:05". */
export function versionLine(): string {
  return `v${VERSION} · ${COMMIT} · built ${builtWhen()}`;
}
