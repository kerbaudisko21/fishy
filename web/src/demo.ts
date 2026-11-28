// Synthetic demo data for the web pages (no real company). Used when Firebase is not configured or ?demo is in the URL.
import type { ApprovalRequest, Incident } from './api';

const NORMAL_APPROVAL: ApprovalRequest = {
  approverName: 'Budi Santoso',
  company: 'Kalindra Group',
  amount: { value: 186400, currency: 'USD' },
  payee: 'PT Sinar Logistik, Mandiri •••• 9032',
  context: 'On a video call with Rina Kartika · today 10:41',
  expiresAt: Date.now() + 10 * 60 * 1000,
};

// Stress data (break-ui), only in development: /?demo&data=worst. Plausible, fictional values.
const WORST_APPROVAL: ApprovalRequest = {
  approverName: 'Raden Ajeng Kartika Wulandari-Soedarsono',
  company: 'PT Kalindra Sejahtera Investama Nusantara Tbk',
  amount: { value: 12_750_000_000, currency: 'IDR' },
  payee: 'PT Sinar Cahaya Logistik Internasional Nusantara Tbk, Bank Pembangunan Daerah Jawa Barat dan Banten •••• 9032',
  context: 'On a video call with Aleksandra Wiśniewska-Kowalczyk · today 10:41',
  expiresAt: Date.now() + 10 * 60 * 1000,
};

const WORST = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('data') === 'worst';
export const DEMO_APPROVAL: ApprovalRequest = WORST ? WORST_APPROVAL : NORMAL_APPROVAL;

export const DEMO_INCIDENT: Incident = {
  id: 'FI-0042',
  at: Date.now() - 4 * 60 * 1000,
  status: 'stopped',
  where: 'Video meeting + invoice email',
  targeted: 'The finance colleague who ran the check',
  posedAs: 'Budi Santoso, CFO',
  askedFor: '$186,400 to Mandiri •••• 9032',
  confirmed: 'Budi said “not me” and entered the right PIN',
  flags: ['Pressure', 'Bank changed', 'Lookalike sender', 'Known scam account', 'Voice 87%'],
  handled: false,
};

export const DEMO_AUDIT = [
  { at: Date.now() - 6 * 60 * 1000, what: 'Red flags found: pressure, bank changed, lookalike sender, known scam account' },
  { at: Date.now() - 5 * 60 * 1000, what: 'Rina held the payment and asked FISHY to call Budi on record' },
  { at: Date.now() - 4 * 60 * 1000, what: 'Budi pressed 2 (not me) and entered a correct PIN' },
  { at: Date.now() - 4 * 60 * 1000, what: 'Mandiri •••• 9032 and sinar-logistik.co added to the known-scam list' },
];
