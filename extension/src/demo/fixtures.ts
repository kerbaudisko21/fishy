// Synthetic demo data: one fictional company, its staff and suppliers. No real company data.
import type { DirectoryPerson, Evidence, KnownBadEntry, PaymentRequest, Signal, Supplier } from '../lib/types';

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
  { kind: 'pressure_tactics', step: 'read', source: 'on_device', title: 'Pressure in the request', detail: 'Urgency, secrecy and authority in the captions.', strength: 4 },
  { kind: 'bank_account_changed', step: 'check', source: 'on_device', title: 'Bank account changed', detail: 'The invoice account differs from the last 6 payments to Sinar Logistik.' },
  { kind: 'lookalike_sender', step: 'check', source: 'on_device', title: 'Lookalike sender', detail: 'sinar-logistik.co, 9 days old. On record: sinarlogistik.co.id.' },
  { kind: 'known_bad_account', step: 'match', source: 'on_device', title: 'Known scam account', detail: 'Mandiri •••• 9032 is in 2 confirmed scams.', seenCount: 2 },
  { kind: 'voice_score', step: 'check', source: 'cloud', title: 'Voice likely synthetic', detail: '87% on a 10-second clip you sent. A supporting signal, not proof.', score: 0.87 },
];

export const DEMO_EVIDENCE: Evidence = {
  tactics: {
    counts: [
      { tactic: 'urgency', label: 'Urgency', count: 2, example: '“today, before three”' },
      { tactic: 'secrecy', label: 'Secrecy', count: 1, example: '“keep this between us”' },
      { tactic: 'authority', label: 'Authority', count: 2, example: '“I’m authorising it myself”' },
      { tactic: 'skips_process', label: 'Skips the process', count: 1, example: '“skip the usual approval”' },
    ],
    window: 'last 4 min',
    captions: [
      {
        speaker: 'Budi Santoso',
        at: '10:41',
        parts: [
          { text: 'Rina, I need this paid ' },
          { text: 'today, before three', tactic: 'urgency' },
          { text: '. The acquisition closes tonight.' },
        ],
      },
      {
        speaker: 'Budi Santoso',
        at: '10:42',
        parts: [{ text: 'Keep this between us', tactic: 'secrecy' }, { text: ' for now. The board doesn’t know yet.' }],
      },
      {
        speaker: 'Budi Santoso',
        at: '10:43',
        parts: [
          { text: 'Skip the usual approval', tactic: 'skips_process' },
          { text: ', ' },
          { text: 'I’m authorising it myself', tactic: 'authority' },
          { text: '. Use the ' },
          { text: 'new account', tactic: 'new_payment_details' },
          { text: ' on the invoice Sinar sent this morning.' },
        ],
      },
    ],
    pattern: 'Executive asks for a secret, urgent transfer',
    rulesVersion: 14,
    source: 'on_device',
  },
  email: {
    sender: {
      name: 'Sinar Logistik Billing',
      address: [{ text: 'billing@sinar' }, { text: '-', changed: true }, { text: 'logistik' }, { text: '.co', changed: true }],
    },
    onRecord: { name: 'PT Sinar Logistik', address: 'billing@sinarlogistik.co.id', paidTimes: 6 },
    checks: [
      { ok: false, title: 'Looks like a known supplier', detail: 'One hyphen added, different ending' },
      { ok: false, title: 'Domain is 9 days old', detail: 'Registered 12 Nov 2026' },
      { ok: false, title: 'Sender check failed', detail: 'DMARC: fail · reply-to is a free webmail address' },
      { ok: true, title: '2 links, no known threat', detail: 'Web Risk got the links only, never the email' },
    ],
    attachment: 'INV-SL-2611.pdf',
  },
  invoice: {
    number: 'INV-SL-2611',
    supplier: 'PT Sinar Logistik',
    from: 'billing@sinar-logistik.co',
    due: 'Due today',
    amount: { value: 186400, currency: 'USD' },
    newAccount: { bank: 'Bank Mandiri', masked: '•••• 9032', holder: 'Sinar Logistik Global' },
    usual: { bank: 'BCA', masked: '•••• 4471', holder: 'PT Sinar Logistik', months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'] },
    traces: [
      { ok: false, title: 'Changed after it was made', detail: 'Created 18 Nov · edited 21 Nov in an online PDF editor' },
      { ok: false, title: 'Bank line set in another font', detail: 'Only the account number differs from the rest' },
      { ok: true, title: 'Layout matches past invoices', detail: 'Logo, address and tax number look the same' },
    ],
    knownScams: 2,
  },
  voice: { speaker: 'Budi Santoso', seconds: 10, sentAt: '10:44', score: 0.87, faceFrames: 5 },
  known: {
    matches: [
      {
        value: 'Mandiri •••• 9032',
        count: 2,
        events: [
          { date: '14 Nov', what: 'Fake CFO on a video call · another company' },
          { date: '3 Nov', what: 'Supplier invoice by email · another company' },
        ],
      },
      { value: 'sinar-logistik.co', count: 1 },
      { value: '+62 857 •••• 2219', count: 0, note: 'Number printed on the invoice. FISHY never calls it.' },
    ],
    pattern: {
      name: 'Vendor bank change',
      bullets: [
        'New account for a supplier you already pay',
        'Asked for in a rush, outside the usual approval',
        'Request comes from a boss or the supplier, not both',
      ],
    },
    rulesVersion: 14,
    updated: '2 h ago',
  },
};

export const DEMO_DIRECTORY: DirectoryPerson[] = [
  { id: 'budi', name: 'Budi Santoso', role: 'CFO', phoneMasked: '+62 812 •••• 4410', pinSet: true },
  { id: 'sari', name: 'Sari Wijaya', role: 'Finance Director', phoneMasked: '+62 811 •••• 0937', escalationOrder: 1, pinSet: true },
  { id: 'andre', name: 'Andre Halim', role: 'CEO', phoneMasked: '+62 813 •••• 5528', escalationOrder: 2, pinSet: true },
];

export const DEMO_SUPPLIERS: Supplier[] = [
  {
    id: 'sinar',
    name: 'PT Sinar Logistik',
    domain: 'sinarlogistik.co.id',
    contact: { name: 'Dewi Lestari', role: 'Billing', phoneMasked: '+62 21 •••• 7710' },
    account: { bank: 'BCA', masked: '•••• 4471', holder: 'PT Sinar Logistik' },
    paidMonths: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
  },
  {
    id: 'mitra',
    name: 'PT Mitra Kemas',
    domain: 'mitrakemas.id',
    contact: { name: 'Yusuf Rahman', role: 'Finance', phoneMasked: '+62 31 •••• 2046' },
    account: { bank: 'BNI', masked: '•••• 1185', holder: 'PT Mitra Kemas' },
    paidMonths: ['Aug', 'Sep', 'Oct', 'Nov'],
  },
];

export const DEMO_KNOWN_BAD: KnownBadEntry[] = [
  {
    kind: 'account',
    value: '9032',
    display: 'Mandiri •••• 9032',
    count: 2,
    events: [
      { date: '14 Nov', what: 'Fake CFO on a video call · another company' },
      { date: '3 Nov', what: 'Supplier invoice by email · another company' },
    ],
  },
  { kind: 'domain', value: 'sinar-logistik.co', display: 'sinar-logistik.co', count: 1 },
];

