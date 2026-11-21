import type { SignalKind } from '../lib/types';

export type Screen = 'verdict' | 'tactics' | 'email' | 'invoice' | 'voice' | 'known' | 'directory';
export type DetailScreen = Exclude<Screen, 'verdict' | 'directory'>;

export const DETAIL: Record<DetailScreen, { title: string; step: string }> = {
  tactics: { title: 'Pressure in the request', step: 'STEP 1 · READ' },
  email: { title: 'Lookalike sender', step: 'STEP 2 · CHECK' },
  invoice: { title: 'Bank account changed', step: 'STEP 2 · CHECK' },
  voice: { title: 'Voice check', step: 'STEP 2 · CHECK' },
  known: { title: 'Known scams', step: 'STEP 3 · MATCH' },
};

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
