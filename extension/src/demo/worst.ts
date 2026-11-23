// Stress data for the panel (dev only, see dataset.ts). Same shapes as fixtures.ts, but with the
// values real finance teams produce: long Indonesian legal names, regional bank names, rupiah in
// the billions, titles in front of names, one-payment histories, single items and empty lists.
// Every value is plausible. All of it is fictional.
import type { DirectoryPerson, Evidence, PaymentRequest, Signal, Supplier } from '../lib/types';
import { DEMO_EVIDENCE } from './fixtures';

const LONG_DOMAIN = 'sinar-cahaya-logistik-internasional-nusantara.co';

export const WORST_REQUEST: PaymentRequest = {
  id: 'worst-0001',
  place: 'meet',
  // "Raden Ajeng" is a Javanese title, not a first name.
  askedBy: { name: 'Raden Ajeng Kartika Wulandari-Soedarsono', role: 'Chief Financial Officer & Head of Group Treasury, Asia-Pacific', directoryId: 'kartika' },
  amount: { value: 12_750_000_000, currency: 'IDR' },
  payee: { name: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk', bank: 'Bank Pembangunan Daerah Jawa Barat dan Banten', accountMasked: '•••• 9032' },
  dueText: 'by 15:00 WIB today, before the interbank transfer cut-off',
};

// Worded exactly as lib/pipeline.ts words live signals.
export const WORST_SIGNALS: Signal[] = [
  { kind: 'pressure_tactics', step: 'read', source: 'cloud', title: 'Pressure in the request', detail: 'Urgency, secrecy, authority, skips the process and new payment details in the captions.', strength: 5 },
  { kind: 'bank_account_changed', step: 'check', source: 'on_device', title: 'Bank account changed', detail: 'The invoice account differs from the last 1 payment to Sinar Cahaya Logistik Internasional Nusantara Tbk.' },
  { kind: 'lookalike_sender', step: 'check', source: 'on_device', title: 'Lookalike sender', detail: `${LONG_DOMAIN}. On record: sinarcahayalogistik.co.id.` },
  { kind: 'sender_auth_failed', step: 'check', source: 'on_device', title: 'Sender check failed', detail: 'DMARC: fail, SPF: softfail, DKIM: none · reply-to is accounts.payable.sinarcahaya@outlook-mail-services.example.com.' },
  { kind: 'young_domain', step: 'check', source: 'cloud', title: 'Brand-new domain', detail: `${LONG_DOMAIN} is 1 day old.` },
  { kind: 'unsafe_link', step: 'check', source: 'cloud', title: 'Unsafe link', detail: '1 link flagged by Web Risk.' },
  { kind: 'known_bad_account', step: 'match', source: 'on_device', title: 'Known scam account', detail: 'Bank Pembangunan Daerah Jawa Barat dan Banten •••• 9032 is in 1,284 confirmed scams.', seenCount: 1284 },
];

export const WORST_EVIDENCE: Evidence = {
  ...DEMO_EVIDENCE,
  email: {
    sender: {
      name: 'Sinar Cahaya Logistik Internasional Nusantara — Accounts Receivable Department',
      address: [{ text: 'accounts.receivable@sinar' }, { text: '-', changed: true }, { text: 'cahaya-logistik-internasional-nusantara' }, { text: '.co', changed: true }],
    },
    onRecord: { name: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk', address: 'accounts.receivable@sinarcahayalogistik.co.id', paidTimes: 1 },
    checks: DEMO_EVIDENCE.email!.checks,
    attachment: 'INV-SCLIN-2026-11-0047-REVISED-FINAL (2).pdf',
  },
  invoice: {
    ...DEMO_EVIDENCE.invoice!,
    number: 'INV/SCLIN/2026/XI/000047-REV2',
    supplier: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk',
    from: `accounts.receivable@${LONG_DOMAIN}`,
    amount: { value: 12_750_000_000, currency: 'IDR' },
    newAccount: { bank: 'Bank Pembangunan Daerah Jawa Barat dan Banten', masked: '•••• 9032', holder: 'Sinar Cahaya Logistik Internasional Nusantara Global Trading' },
    usual: { bank: 'Bank Central Asia', masked: '•••• 4471', holder: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk', months: ['Nov'] },
  },
};

export const WORST_DIRECTORY: DirectoryPerson[] = [
  { id: 'kartika', name: 'Raden Ajeng Kartika Wulandari-Soedarsono', role: 'Chief Financial Officer & Head of Group Treasury, Asia-Pacific', phoneMasked: '+62 812 •••• 4410', pinSet: true },
  { id: 'rizky', name: 'Muhammad Rizky Pratama Putra Wijayakusuma III', role: 'Vice President, Corporate Finance', phoneMasked: '+62 811 •••• 0937', escalationOrder: 1, pinSet: false },
  { id: 'ng', name: 'Ng', role: 'CEO', phoneMasked: '+65 9 •••• 1234', escalationOrder: 2, pinSet: true },
];

export const WORST_SUPPLIERS: Supplier[] = [
  {
    id: 'sclin',
    name: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk',
    domain: 'sinarcahayalogistik.co.id',
    contact: { name: 'Aleksandra Wiśniewska-Kowalczyk', role: 'Accounts Receivable', phoneMasked: '+62 21 •••• 7710' },
    account: { bank: 'Bank Pembangunan Daerah Jawa Barat dan Banten', masked: '•••• 4471', holder: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk' },
    paidMonths: ['Nov'],
  },
  {
    id: 'jo',
    name: 'CV Jo',
    domain: 'jo.id',
    contact: { name: 'Jo', role: 'Owner', phoneMasked: '+62 31 •••• 2046' },
    account: { bank: 'BRI', masked: '•••• 1185', holder: 'CV Jo' },
    paidMonths: ['Aug', 'Sep', 'Oct', 'Nov'],
  },
];

/* One of everything: a single flag, counts of exactly 1, one approver, one supplier. */
export const ONE_REQUEST: PaymentRequest = {
  id: 'one-0001',
  place: 'gmail',
  askedBy: { name: 'Dewi Lestari', role: 'Billing', directoryId: 'dewi' },
  amount: { value: 1, currency: 'USD' },
  payee: { name: 'PT Mitra Kemas', bank: 'BNI', accountMasked: '•••• 1185' },
};
export const ONE_SIGNALS: Signal[] = [
  { kind: 'known_bad_account', step: 'match', source: 'on_device', title: 'Known scam account', detail: 'BNI •••• 1185 is in 1 confirmed scam.', seenCount: 1 },
];
export const ONE_DIRECTORY: DirectoryPerson[] = [{ id: 'dewi', name: 'Dewi Lestari', role: 'Billing', phoneMasked: '+62 21 •••• 7710', pinSet: true }];
export const ONE_SUPPLIERS: Supplier[] = [WORST_SUPPLIERS[1]];
