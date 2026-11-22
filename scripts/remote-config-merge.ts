// Adds FISHY's parameters to a project's Remote Config template without
// touching anyone else's. No network in here, so it can be tested.
//
// A project has one Remote Config template, and publishing replaces all of
// it. In a project shared with another app, publishing our own file would
// delete that app's parameters. So we read the live template, add or update
// only the parameters named in remoteconfig.template.json, and publish that.

export interface MergeResult {
  /** The parameters to publish: everything that was there, plus ours. */
  parameters: Record<string, unknown>;
  added: string[];
  updated: string[];
  unchanged: string[];
  /** Parameters that are not ours. They are passed through exactly as they were. */
  kept: string[];
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeParameters(existing: Record<string, unknown>, ours: Record<string, unknown>): MergeResult {
  const result: MergeResult = { parameters: { ...existing }, added: [], updated: [], unchanged: [], kept: [] };
  for (const [key, value] of Object.entries(ours)) {
    if (!(key in existing)) {
      result.added.push(key);
    } else if (same(existing[key], value)) {
      result.unchanged.push(key);
    } else {
      result.updated.push(key);
    }
    result.parameters[key] = value;
  }
  result.kept = Object.keys(existing).filter((key) => !(key in ours));
  return result;
}
