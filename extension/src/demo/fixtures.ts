// Synthetic demo data: one fictional company, its staff and suppliers. No real company data.
import type { DirectoryPerson, Evidence, KnownBadEntry, PaymentRequest, Signal, Supplier } from '../lib/types';

export const DEMO_COMPANY = 'Kalindra Group';

export const DEMO_REQUEST: PaymentRequest = {
  id: 'demo-0042',
  place: 'meet',
  askedBy: { name: 'Budi Santoso', role: 'CFO', directoryId: 'budi' },
  amount: { value: 186400, currency: 'USD' },
  payee: { name: 'PT Sinar Logistik', bank: 'Bank Teluk', accountMasked: '•••• 9032' },
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
  { kind: 'known_bad_account', step: 'match', source: 'on_device', title: 'Known scam account', detail: 'Bank Teluk •••• 9032 is in 2 confirmed scams.', seenCount: 2 },
  { kind: 'video_signs', step: 'check', source: 'cloud', title: 'Signs of a deepfake face', detail: 'The earrings change shape between frames 2 and 4 (left ear), plus 2 more. A sign, not proof.', strength: 3 },
  { kind: 'voice_signs', step: 'check', source: 'cloud', title: 'Signs of a cloned voice', detail: 'No breathing between sentences (whole clip), plus 2 more. A sign, not proof.', strength: 3 },
];

// Loudness for the demo voice clip's waveform.
/** A demo voice's pitch: unusually flat, around 118 Hz, with gaps for the pauses. */
const DEMO_PITCH = Array.from({ length: 300 }, (_, i) => (i % 60 > 48 ? 0 : 118 + Math.sin(i / 7) * 3 + ((i * 7919) % 5) * 0.4));

const DEMO_BARS = [30, 52, 40, 68, 84, 60, 44, 72, 90, 64, 38, 56, 80, 96, 70, 48, 34, 58, 76, 88, 62, 42, 66, 82, 94, 74, 50, 36, 54, 70, 86, 60, 40, 64, 78, 52, 32, 46, 30, 22].map((h) => h / 100);

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
    newAccount: { bank: 'Bank Teluk', masked: '•••• 9032', holder: 'Sinar Logistik Global' },
    usual: { bank: 'Bank Karang', masked: '•••• 4471', holder: 'PT Sinar Logistik', months: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'] },
    traces: [
      { ok: false, title: 'Changed after it was made', detail: 'Created 18 Nov · edited 21 Nov in an online PDF editor' },
      { ok: false, title: 'Bank line set in another font', detail: 'Only the account number differs from the rest' },
      { ok: true, title: 'Layout matches past invoices', detail: 'Logo, address and tax number look the same' },
    ],
    knownScams: 2,
  },
  media: [
    {
      id: 'demo-frame',
      kind: 'frame',
      name: 'Video call at 10:44',
      at: '10:44',
      checks: [],
      forensics: {
        hints: [],
        rows: [{ ok: true, title: 'Movement', detail: 'The picture changes between frames, as a live camera does' }],
        motion: [3.1, 2.4, 4.0, 2.8],
      },
      firstLook: { assessment: 'likely_ai', confidence: 'low', source: 'on_device', model: 'gemini-nano', signs: [{ sign: 'The hairline blurs into the background', where: 'top of the head' }] },
      escalation: 'Gemini Nano found only one sign',
      gemini: {
        assessment: 'likely_ai',
        confidence: 'high',
        source: 'cloud',
        model: 'gemini-cloud',
        signs: [
          { sign: 'The earrings change shape between frames', where: 'frames 2–4, left ear' },
          { sign: 'The light on his face comes from the left; the room light comes from the right', where: 'face and window' },
          { sign: 'The edge of his hair blurs into the background', where: 'top of the head' },
        ],
      },
      demo: true,
    },
    {
      id: 'demo-voice',
      kind: 'voice',
      name: '10 s of Budi Santoso',
      at: '10:44',
      levels: DEMO_BARS,
      checks: [],
      forensics: {
        hints: [{ id: 'flat_pitch', strength: 1, text: 'The voice barely moves up or down (about 1.8 semitones; people usually move 4 or more).' }],
        rows: [
          { ok: false, title: 'Pitch movement', detail: '1.8 semitones around 118 Hz' },
          { ok: true, title: 'Room sound between words', detail: 'Digitally silent (−92 dBFS); normal for a call app’s noise filter' },
          { ok: true, title: 'Background from pause to pause', detail: 'Changes by up to 4 dB' },
          { ok: true, title: 'Breaths', detail: '0 heard in 8 s of speech (call apps often filter them out)' },
        ],
        pitch: DEMO_PITCH,
      },
      gemini: {
        assessment: 'likely_ai',
        source: 'cloud',
        model: 'gemini-cloud',
        signs: [
          { sign: 'No breathing between sentences', where: 'whole clip' },
          { sign: 'A metallic edge on the "s" sounds', where: 'at about 4 s' },
          { sign: 'The room sound stops completely between words', where: 'at about 7 s' },
        ],
      },
      demo: true,
    },
  ],
  known: {
    matches: [
      {
        value: 'Bank Teluk •••• 9032',
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
    account: { bank: 'Bank Karang', masked: '•••• 4471', holder: 'PT Sinar Logistik' },
    paidMonths: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
  },
  {
    id: 'mitra',
    name: 'PT Mitra Kemas',
    domain: 'mitrakemas.id',
    contact: { name: 'Yusuf Rahman', role: 'Finance', phoneMasked: '+62 31 •••• 2046' },
    account: { bank: 'Bank Ombak', masked: '•••• 1185', holder: 'PT Mitra Kemas' },
    paidMonths: ['Aug', 'Sep', 'Oct', 'Nov'],
  },
];

export const DEMO_KNOWN_BAD: KnownBadEntry[] = [
  {
    kind: 'account',
    value: '9032',
    display: 'Bank Teluk •••• 9032',
    count: 2,
    events: [
      { date: '14 Nov', what: 'Fake CFO on a video call · another company' },
      { date: '3 Nov', what: 'Supplier invoice by email · another company' },
    ],
  },
  { kind: 'domain', value: 'sinar-logistik.co', display: 'sinar-logistik.co', count: 1 },
];

