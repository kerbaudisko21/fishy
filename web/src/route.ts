export type Page = 'approval' | 'incident' | 'try';

/**
 * Which page an address opens.
 *
 * The approval page is for someone holding a one-time link (?t=…), or for a look at it on demo
 * data (?demo). A visitor on the bare address has nothing to approve, so they get Try FISHY
 * instead of "This link no longer works".
 */
export function pageFor(pathname: string, search: string): Page {
  if (pathname.startsWith('/incident')) return 'incident';
  if (pathname.startsWith('/try')) return 'try';
  const params = new URLSearchParams(search);
  return params.has('t') || params.has('demo') ? 'approval' : 'try';
}
