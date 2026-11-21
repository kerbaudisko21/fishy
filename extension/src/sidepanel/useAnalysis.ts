import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_EVIDENCE, DEMO_REQUEST, DEMO_SIGNALS } from '../demo/fixtures';
import { readTactics } from '../lib/ai/tactics';
import { DEMO, IN_EXTENSION } from '../lib/config';
import { domainOf, findLookalike, registrable } from '../lib/checks/domain';
import { compareAccount, editTraces, findAccounts, invoiceNumber, invoiceTotal, mask } from '../lib/checks/invoice';
import { candidatesFromText, matchKnown, type Candidate } from '../lib/checks/known';
import { readPdf } from '../lib/checks/pdf';
import { checkLinks, loadDirectory, loadKnownBad, loadRules, type Directory } from '../lib/data';
import { base64ToBuffer, type AttachmentReply, type PageMessage, type PanelMessage } from '../lib/messages';
import { toEvidence, toRequest, toSignals, type Findings, type TranscriptLine } from '../lib/pipeline';
import { decide, DEFAULT_RULES, type RulesConfig } from '../lib/rules/engine';
import type { KnownBadEntry } from '../lib/types';

const READ_EVERY_MS = 4000;
const MAX_LINES = 20;

const clock = (t = Date.now()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const EMPTY: Findings = { place: 'meet', known: [] };

/**
 * Holds everything one check knows: page input → Steps 1–3 → signals, evidence and verdict.
 * In demo mode it starts on the synthetic Kalindra Group case; any new input switches to live.
 */
export function useAnalysis() {
  const [mode, setMode] = useState<'demo' | 'live'>(DEMO ? 'demo' : 'live');
  const [directory, setDirectory] = useState<Directory>({ people: [], suppliers: [] });
  const [known, setKnown] = useState<{ list: KnownBadEntry[]; updatedAt: number }>({ list: [], updatedAt: 0 });
  const [rules, setRules] = useState<RulesConfig>(DEFAULT_RULES);
  const [findings, setFindings] = useState<Findings>(EMPTY);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const transcript = useRef<TranscriptLine[]>([]);
  const lastRead = useRef(0);
  const readTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadDirectory().then(setDirectory).catch((e) => setError(`Directory: ${String(e.message ?? e)}`));
    loadKnownBad().then(setKnown).catch((e) => console.warn('[FISHY] known list', e));
    loadRules().then(setRules);
  }, []);

  const goLive = useCallback(() => setMode('live'), []);

  const addCandidates = useCallback((c: Candidate[]) => setCandidates((prev) => [...prev, ...c]), []);

  /** Step 1 · Read. */
  const read = useCallback(async (text: string, place: Findings['place'], lines: TranscriptLine[]) => {
    setBusy('Reading for pressure…');
    setError(null);
    try {
      const res = await readTactics(text);
      setFindings((f) => ({ ...f, place, tactics: { ...res, lines } }));
    } catch (e) {
      setError(`The tactic reader failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

  /** Meet captions arrive as the caption region's text; keep the last lines in memory only. */
  const onCaptions = useCallback(
    (text: string, speaker: string) => {
      goLive();
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const l of lines) {
        if (!transcript.current.some((t) => t.text === l)) transcript.current.push({ speaker: speaker || 'Speaker', at: clock(), text: l });
      }
      transcript.current = transcript.current.slice(-MAX_LINES);
      addCandidates(candidatesFromText(lines.join('\n')));

      window.clearTimeout(readTimer.current);
      const wait = Math.max(0, READ_EVERY_MS - (Date.now() - lastRead.current));
      readTimer.current = window.setTimeout(() => {
        lastRead.current = Date.now();
        const window_ = [...transcript.current];
        void read(window_.map((l) => l.text).join('\n'), 'meet', window_);
      }, wait);
    },
    [addCandidates, goLive, read],
  );

  /** An opened Gmail message: sender check, links, tactics, known details. */
  const onEmail = useCallback(
    async (m: Extract<PageMessage, { type: 'email_opened' }>) => {
      goLive();
      const exact = directory.suppliers.find((s) => registrable(s.domain) === registrable(m.from));
      const lookalike = exact ? null : findLookalike(m.from, directory.suppliers);
      const urls = [...m.body.matchAll(/https?:\/\/[^\s"'<>)]+/gi)].map((x) => x[0]);
      setFindings((f) => ({
        ...f,
        place: 'gmail',
        email: { from: m.from, name: m.name, lookalike, supplier: exact, links: urls.length, unsafe: null, attachments: m.attachments },
      }));
      addCandidates([{ kind: 'domain', value: domainOf(m.from), display: registrable(m.from) }, ...candidatesFromText(m.body)]);

      const lines = m.body.split(/\n+|(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
      void read(`${m.subject}\n${m.body}`, 'gmail', lines.map((text) => ({ speaker: m.name || m.from, at: 'email', text })));

      const res = await checkLinks(urls);
      if (res) setFindings((f) => (f.email ? { ...f, email: { ...f.email, unsafe: res.unsafe } } : f));
    },
    [addCandidates, directory.suppliers, goLive, read],
  );

  /** Step 2 · Invoice: read the PDF on the laptop and compare the account with the record (R4). */
  const checkInvoice = useCallback(
    async (data: ArrayBuffer, fileName: string) => {
      goLive();
      setBusy('Reading the invoice…');
      setError(null);
      try {
        const { text, facts } = await readPdf(data, (t) => findAccounts(t)[0]?.number);
        const accounts = findAccounts(text);
        if (!accounts.length) throw new Error('No bank account found in this PDF.');
        setFindings((f) => {
          const claimed = f.email?.lookalike?.match ?? f.email?.supplier;
          const lowered = text.toLowerCase();
          const supplier =
            claimed ??
            directory.suppliers.find((s) => lowered.includes(s.name.toLowerCase().replace(/^pt\s+/, '')) || lowered.includes(s.domain));
          return {
            ...f,
            place: f.email ? 'gmail' : f.place,
            invoice: {
              fileName,
              number: invoiceNumber(text),
              total: invoiceTotal(text),
              accounts,
              compare: compareAccount(accounts, supplier?.account),
              supplier,
              traces: editTraces(facts),
            },
          };
        });
        addCandidates([
          ...accounts.map((a) => ({ kind: 'account' as const, value: a.number, display: `${a.bank ?? 'Account'} ${mask(a.number)}` })),
          ...candidatesFromText(text).map((c) => (c.kind === 'phone' ? { ...c, note: 'Number printed on the invoice. FISHY never calls it.' } : c)),
        ]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [addCandidates, directory.suppliers, goLive],
  );

  /** Asks the Gmail tab for the open email's PDF; only on the user's click. */
  const checkAttachedInvoice = useCallback(async () => {
    if (!IN_EXTENSION) return setError('Open this in the extension to read Gmail attachments.');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    setBusy('Getting the attachment…');
    try {
      const reply = (await chrome.tabs.sendMessage(tab.id, { type: 'fetch_attachment' } satisfies PanelMessage)) as AttachmentReply | undefined;
      if (!reply?.ok) throw new Error(reply?.error ?? 'Open the email in Gmail first.');
      await checkInvoice(base64ToBuffer(reply.base64), reply.name);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }, [checkInvoice]);

  /** Paste-text fallback (deck risk: Meet pages change). */
  const checkText = useCallback(
    (text: string) => {
      goLive();
      setFindings((f) => ({ ...f, place: 'paste' }));
      addCandidates(candidatesFromText(text));
      const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      return read(text, 'paste', lines.map((t) => ({ speaker: 'Pasted', at: clock(), text: t })));
    },
    [addCandidates, goLive, read],
  );

  const clear = useCallback(() => {
    transcript.current = [];
    setFindings(EMPTY);
    setCandidates([]);
    setError(null);
    setMode('live');
  }, []);

  const loadDemo = useCallback(() => {
    clear();
    setMode('demo');
  }, [clear]);

  const full: Findings = useMemo(() => ({ ...findings, known: matchKnown(candidates, known.list) }), [findings, candidates, known.list]);

  const out = useMemo(() => {
    if (mode === 'demo') {
      return { signals: DEMO_SIGNALS, evidence: DEMO_EVIDENCE, request: DEMO_REQUEST, verdict: decide(DEMO_SIGNALS, rules), place: 'meet' as const };
    }
    const signals = toSignals(full);
    const verdict = decide(signals, rules);
    return { signals, evidence: toEvidence(full, rules, verdict.patterns, known.updatedAt), request: toRequest(full), verdict, place: full.place };
  }, [mode, full, rules, known.updatedAt]);

  const onPage = useCallback((m: PageMessage) => (m.type === 'captions' ? onCaptions(m.text, m.speaker) : void onEmail(m)), [onCaptions, onEmail]);

  /** Did anything get checked yet? (live mode starts empty) */
  const hasInput = mode === 'demo' || !!(findings.tactics || findings.email || findings.invoice || candidates.length);

  return {
    mode,
    ...out,
    hasInput,
    directory,
    rules,
    knownCount: known.list.length,
    busy,
    error,
    setError,
    onPage,
    checkText,
    checkInvoice,
    checkAttachedInvoice,
    clear,
    loadDemo,
    emailOpen: !!findings.email,
  };
}

export type Analysis = ReturnType<typeof useAnalysis>;
