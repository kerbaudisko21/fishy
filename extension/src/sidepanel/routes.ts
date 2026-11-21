import type { SignalKind } from '../lib/types';

export type Screen = 'verdict' | 'tactics' | 'email' | 'invoice' | 'voice' | 'known' | 'directory';

/** Which evidence screen a red flag opens. */
export function screenFor(kind: SignalKind): Screen {
  switch (kind) {
    case 'pressure_tactics':
      return 'tactics';
    case 'bank_account_changed':
    case 'pdf_edited':
      return 'invoice';
    case 'lookalike_sender':
    case 'sender_auth_failed':
    case 'young_domain':
    case 'unsafe_link':
      return 'email';
    case 'voice_score':
    case 'face_score':
      return 'voice';
    default:
      return 'known';
  }
}

/** Where the evidence on each screen came from, for the header chip. */
export function placeFor(screen: Screen): 'meet' | 'gmail' {
  return screen === 'email' || screen === 'invoice' ? 'gmail' : 'meet';
}
