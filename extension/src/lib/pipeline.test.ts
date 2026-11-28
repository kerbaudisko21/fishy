import { describe, expect, it } from 'vitest';
import { DEMO_KNOWN_BAD, DEMO_SUPPLIERS } from '../demo/fixtures';
import { keywordTactics } from './ai/keywords';
import { findLookalike } from './checks/domain';
import { compareAccount, findAccounts } from './checks/invoice';
import { matchKnown } from './checks/known';
import { highlight, toEvidence, toRequest, toSignals, type Findings } from './pipeline';
import { decide, DEFAULT_RULES } from './rules/engine';

const caption = "Skip the usual approval, I'm authorising it myself. Keep this between us, it must go out today.";
const invoiceText = 'Invoice No: INV-SL-2611\nTotal due: USD 186,400\nBank Teluk Account No: 123-456-9032\nAccount name: Sinar Logistik Global';

function demoFindings(): Findings {
  const supplier = DEMO_SUPPLIERS[0];
  const accounts = findAccounts(invoiceText);
  return {
    place: 'gmail',
    tactics: { hits: keywordTactics(caption), source: 'on_device', model: 'keywords', lines: [{ speaker: 'Budi Santoso', at: '10:43', text: caption }] },
    email: {
      from: 'billing@sinar-logistik.co',
      name: 'Sinar Logistik Billing',
      lookalike: findLookalike('billing@sinar-logistik.co', DEMO_SUPPLIERS),
      links: 2,
      unsafe: [],
      attachments: ['INV-SL-2611.pdf'],
    },
    invoice: { fileName: 'INV-SL-2611.pdf', number: 'INV-SL-2611', total: { value: 186400, currency: 'USD' }, accounts, compare: compareAccount(accounts, supplier.account), supplier, traces: [] },
    known: matchKnown(
      [
        { kind: 'account', value: accounts[0].number, display: 'Bank Teluk •••• 9032' },
        { kind: 'domain', value: 'sinar-logistik.co', display: 'sinar-logistik.co' },
      ],
      DEMO_KNOWN_BAD,
    ),
  };
}

describe('pipeline', () => {
  it('turns the demo scam into the same red flags the design shows, and a fishy verdict', () => {
    const f = demoFindings();
    const signals = toSignals(f);
    expect(signals.map((s) => s.kind)).toEqual(['pressure_tactics', 'bank_account_changed', 'lookalike_sender', 'known_bad_account', 'known_bad_domain']);
    expect(decide(signals).level).toBe('fishy');
  });

  it('builds evidence for every screen it has data for', () => {
    const f = demoFindings();
    const v = decide(toSignals(f));
    const ev = toEvidence(f, DEFAULT_RULES, v.patterns, Date.now());
    expect(ev.tactics?.counts.length).toBeGreaterThan(0);
    expect(ev.email?.sender.address.some((p) => p.changed)).toBe(true);
    expect(ev.invoice?.newAccount.masked).toBe('•••• 9032');
    expect(ev.invoice?.knownScams).toBe(2);
    expect(ev.known?.pattern?.name).toBe('Vendor bank change');
    expect(ev.voice).toBeUndefined();
  });

  it('reads the payment request off the invoice', () => {
    expect(toRequest(demoFindings())?.payee).toEqual({ name: 'PT Sinar Logistik', bank: 'Bank Teluk', accountMasked: '•••• 9032' });
  });

  it('adds sender-auth, young-domain and voice flags, and takes the asker from the captions', () => {
    const f: Findings = {
      ...demoFindings(),
      email: {
        ...demoFindings().email!,
        auth: { failed: true, detail: 'DMARC: fail · reply-to is a free webmail address' },
        age: { days: 9, registered: '12 Nov 2026' },
      },
      said: { speaker: 'Budi Santoso', role: 'CFO', amount: { value: 186400, currency: 'USD' } },
      voice: { speaker: 'Budi Santoso', seconds: 10, sentAt: '10:44', score: 0.87, levels: [], demo: false },
    };
    const kinds = toSignals(f).map((s) => s.kind);
    expect(kinds).toEqual(expect.arrayContaining(['sender_auth_failed', 'young_domain', 'voice_score']));
    expect(toRequest(f)?.askedBy).toEqual({ name: 'Budi Santoso', role: 'CFO' });
    const ev = toEvidence(f, DEFAULT_RULES, [], Date.now());
    expect(ev.email?.checks.map((c) => c.title)).toEqual([
      'Looks like a known supplier',
      'Domain is 9 days old',
      'Sender check failed',
      '2 links, no known threat',
    ]);
    expect(ev.voice?.score).toBe(0.87);
  });

  it('builds a request from what was said when there is no invoice', () => {
    const f: Findings = { place: 'meet', known: [], said: { speaker: 'Budi Santoso', role: 'CFO', amount: { value: 186400, currency: 'USD' } } };
    expect(toRequest(f)).toMatchObject({ askedBy: { name: 'Budi Santoso', role: 'CFO' }, amount: { value: 186400 }, payee: undefined });
  });

  it('does not flag a low voice score', () => {
    const f: Findings = { place: 'meet', known: [], voice: { speaker: 'X', seconds: 10, sentAt: '', score: 0.2, levels: [], demo: false } };
    expect(toSignals(f)).toEqual([]);
  });

  it('highlights quoted phrases without overlap', () => {
    const parts = highlight('Pay today, before three.', [
      { tactic: 'urgency', quote: 'today, before three' },
      { tactic: 'urgency', quote: 'today' },
    ]);
    expect(parts).toEqual([{ text: 'Pay ' }, { text: 'today, before three', tactic: 'urgency' }, { text: '.' }]);
  });

  it('gives a clear verdict for a normal message', () => {
    const f: Findings = { place: 'paste', tactics: { hits: [], source: 'on_device', model: 'keywords', lines: [] }, known: [] };
    expect(decide(toSignals(f)).level).toBe('clear');
  });
});
