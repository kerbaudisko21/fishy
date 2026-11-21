// Synthetic demo data: one fictional company, its staff and suppliers. No real company data.
import type { DirectoryPerson, PaymentRequest, Signal } from '../lib/types';

export const DEMO_COMPANY = 'Kalindra Group';

export const DEMO_REQUEST: PaymentRequest = {
  id: 'demo-0042',
  place: 'meet',
  askedBy: { name: 'Budi Santoso', role: 'CFO', directoryId: 'budi' },
  amount: { value: 186400, currency: 'USD' },
  payee: { name: 'PT Sinar Logistik', bank: 'Mandiri', accountMasked: '•••• 9032' },
  dueText: 'today, before 3 pm',
};

export const DEMO_CAPTIONS = [
  { speaker: 'Budi Santoso', at: '10:41', text: 'Rina, I need this paid today, before three. The acquisition closes tonight.' },
  { speaker: 'Budi Santoso', at: '10:42', text: "Keep this between us for now. The board doesn't know yet." },
  {
    speaker: 'Budi Santoso',
    at: '10:43',
    text: "Skip the usual approval, I'm authorising it myself. Use the new account on the invoice Sinar sent this morning.",
  },
];

export const DEMO_SIGNALS: Signal[] = [
  { kind: 'pressure_tactics', step: 'read', source: 'on_device', title: 'Pressure in the request', detail: 'Urgency, secrecy and authority in the captions.' },
  { kind: 'bank_account_changed', step: 'check', source: 'on_device', title: 'Bank account changed', detail: 'The invoice account differs from the last 6 payments to Sinar Logistik.' },
  { kind: 'lookalike_sender', step: 'check', source: 'on_device', title: 'Lookalike sender', detail: 'sinar-logistik.co, 9 days old. On record: sinarlogistik.co.id.' },
  { kind: 'known_bad_account', step: 'match', source: 'on_device', title: 'Known scam account', detail: 'Mandiri •••• 9032 is in 2 confirmed scams.', seenCount: 2 },
  { kind: 'voice_score', step: 'check', source: 'cloud', title: 'Voice likely synthetic', detail: '87% on a 10-second clip you sent. A supporting signal, not proof.', score: 0.87 },
];

export const DEMO_DIRECTORY: DirectoryPerson[] = [
  { id: 'budi', name: 'Budi Santoso', role: 'CFO', phoneMasked: '+62 812 •••• 4410', pinSet: true },
  { id: 'sari', name: 'Sari Wijaya', role: 'Finance Director', phoneMasked: '+62 811 •••• 0937', escalationOrder: 1, pinSet: true },
  { id: 'andre', name: 'Andre Halim', role: 'CEO', phoneMasked: '+62 813 •••• 5528', escalationOrder: 2, pinSet: true },
];
