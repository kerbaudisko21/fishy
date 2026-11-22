// What the side panel is told about a phone check: `checks/{id}.call`.
//
// The full record stays where no client can read it. This is the short public
// version, and the side panel turns its banner from it.
//
//   ringing    waiting for an answer, on the phone or on the approval page
//   confirmed  pressed 1 and entered the right PIN
//   not_me     pressed 2. This is set at once, before any PIN.
//   no_answer  nobody answered, nobody could be asked, or the PIN was never right

import type { Verification } from './ports.ts';

export type PublicCallState = 'ringing' | 'confirmed' | 'not_me' | 'no_answer';

export interface PublicCall {
  state: PublicCallState;
  personId: string;
  /** False when no call went out, for example when only the approval page is in use. */
  placed: boolean;
  /** True once the right PIN was entered, after either answer. */
  pinVerified: boolean;
  /** Why there was no answer, when there was none. */
  reason: string | null;
}

function stateOf(verification: Verification): PublicCallState {
  switch (verification.status) {
    case 'confirmed':
      return 'confirmed';
    case 'denied':
      return 'not_me';
    case 'pin_failed':
    case 'unreached':
      return 'no_answer';
    default:
      return 'ringing';
  }
}

export function publicCall(verification: Verification): PublicCall {
  const state = stateOf(verification);
  let reason: string | null = null;
  if (state === 'no_answer') {
    reason = verification.status === 'pin_failed' ? 'pin_failed' : (verification.callSkippedReason ?? 'no_answer');
  }
  return {
    state,
    personId: verification.personId,
    placed: verification.callPlaced,
    pinVerified: verification.pinVerified,
    reason,
  };
}
