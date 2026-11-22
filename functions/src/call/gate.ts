// The call gate.
//
// A real call costs money and rings a real person's phone. So there are two
// locks, both set at deploy time and neither reachable from the interface:
// a master switch that is off by default, and a list of the numbers that may
// be called. Being configured is not the same as being allowed.

import type { CheckConfig } from './ports.ts';

export type GateReason = 'calls_disabled' | 'invalid_number' | 'not_on_allowlist';

export type GateDecision = { allowed: true } | { allowed: false; reason: GateReason };

/** Any number: for a production deployment, never for a demo. */
const ANY_NUMBER = '*';
const INTERNATIONAL = /^\+[1-9]\d{7,14}$/;

function plain(number: string): string {
  return number.replace(/[\s().-]/g, '');
}

export function decideCall(config: Pick<CheckConfig, 'callsEnabled' | 'callAllowlist'>, to: string): GateDecision {
  if (!config.callsEnabled) {
    return { allowed: false, reason: 'calls_disabled' };
  }
  const number = plain(to);
  if (!INTERNATIONAL.test(number)) {
    return { allowed: false, reason: 'invalid_number' };
  }
  const allowlist = config.callAllowlist.map(plain);
  if (allowlist.includes(ANY_NUMBER) || allowlist.includes(number)) {
    return { allowed: true };
  }
  return { allowed: false, reason: 'not_on_allowlist' };
}

/** Reads the allowlist setting: numbers separated by commas. */
export function parseAllowlist(setting: string): string[] {
  return setting
    .split(',')
    .map((entry) => plain(entry.trim()))
    .filter((entry) => entry !== '');
}
