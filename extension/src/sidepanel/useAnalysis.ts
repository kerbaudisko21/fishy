import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { demoData } from '../demo/dataset';
import { readFrames, readPicture, readSite, readVoice, type HybridResult } from '../lib/ai/media';
import { readPage, siteLab, type PageFacts } from '../lib/checks/site';
import { decodeMono16k, VOICE_RATE, wavFrom } from '../lib/ai/files';
import { analysePicture } from '../lib/forensics/picture';
import { videoLab, voiceLab } from '../lib/forensics/labs';
import { readTactics } from '../lib/ai/tactics';
import { IN_EXTENSION } from '../lib/config';
import { domainOf, findLookalike, registrable } from '../lib/checks/domain';
import { judgeAuth } from '../lib/checks/email';
import { compareAccount, editTraces, findAccounts, invoiceNumber, invoiceTotal, mask } from '../lib/checks/invoice';
import { candidatesFromText, matchKnown, type Candidate } from '../lib/checks/known';
import { scanPicture } from '../lib/checks/media';
import { readPdf, renderFirstPage } from '../lib/checks/pdf';
import { mainAmount, type SaidLine } from '../lib/checks/said';
import { checkLinks, domainAge, loadDirectory, loadKnownBad, loadRules, syncSelectors, type Directory } from '../lib/data';
import { base64ToBuffer, type AttachmentReply, type PageMessage, type PanelMessage } from '../lib/messages';
import { toEvidence, toRequest, toSignals, type Findings, type TranscriptLine } from '../lib/pipeline';
import { decide, DEFAULT_RULES, type RulesConfig } from '../lib/rules/engine';
import type { KnownBadEntry, MediaCheck } from '../lib/types';
import { captureTabFrames, recordTabClip } from '../lib/voice';

const READ_EVERY_MS = 4000;
const MAX_LINES = 20;
const NOT_A_PERSON = /^(you|anda|kamu|speaker|pasted|email)$/i;

const clock = (t = Date.now()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const EMPTY: Findings = { place: 'meet', known: [] };
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Gemini's errors, in words a person can act on. */
function geminiError(e: unknown): string {
  const message = (e as Error)?.message ?? String(e);
  if (/firebasevertexai|Firebase AI API/i.test(message)) {
    return 'The Firebase AI Logic API is off in this Firebase project. Turn on “Firebase AI Logic API” (firebasevertexai.googleapis.com) in the Google Cloud console for the project, or open AI Logic → Get started in the Firebase console, wait a minute, then check again.';
  }
  if (/403|ACCESS_DENIED|Permission denied|SERVICE_DISABLED|has not been used/i.test(message)) {
    return 'Gemini is switched off in this Firebase project. In the Firebase console open AI Logic → Get started → Gemini Developer API, wait a minute, then check again.';
  }
  if (/401|app.?check|unauthenticated/i.test(message)) {
    return 'Firebase refused this build (App Check). Check that the debug token in extension/.env.local is added under App Check → Manage debug tokens.';
  }
  if (/429|quota|RESOURCE_EXHAUSTED|prepayment/i.test(message)) {
    return 'Gemini is busy or out of free quota for now. Wait a minute, then check again.';
  }
  if (/failed to fetch|network|offline/i.test(message)) {
    return 'Gemini couldn’t be reached. Check the internet connection, then check again.';
  }
  return `Gemini could not read it: ${message.slice(0, 160)}`;
}

/** Chrome's capture errors, in words a person can act on. */
function captureError(what: 'video' | 'voice' | 'website', e: unknown): string {
  const message = (e as Error)?.message ?? String(e);
  if (/not been invoked|activeTab|invoked for the current page/i.test(message)) {
    return `Chrome lets FISHY read a tab only after you click the FISHY icon on that tab. Go to the ${what === 'website' ? 'website’s' : 'call’s'} tab, click the FISHY icon in the toolbar, then check the ${what} again.`;
  }
  if (/chrome:\/\/|cannot be captured|Chrome pages|chrome-extension|Cannot access|cannot be scripted/i.test(message)) {
    if (what === 'website') return 'FISHY can’t read Chrome’s own pages or the Web Store. Open the website you want to check in a normal tab.';
    return `This tab can’t be captured. Open the video call in a Chrome tab and check the ${what} there.`;
  }
  if (/active stream|already being captured|another capture/i.test(message)) {
    return `The tab is already being captured (screen sharing or another extension). Stop that, then check the ${what} again.`;
  }
  return `The ${what} check didn’t start: ${message}`;
}
const NO_GEMINI = 'Gemini is not set up in this build, so only the laptop’s own checks ran.';
/** 40 loudness bars (0–1) for a voice file's waveform. */
function loudness(samples: Float32Array, bars = 40): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const out = Array.from({ length: bars }, (_, b) => {
    let sum = 0;
    for (let i = b * size; i < Math.min(samples.length, (b + 1) * size); i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / size);
  });
  const peak = Math.max(1e-6, ...out);
  return out.map((v) => v / peak);
}
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random()));

/**
 * Holds everything one check knows: page input → Steps 1–3 → signals, evidence and verdict.
 * In demo mode it starts on the synthetic Kalindra Group case; any new input switches to live.
 */
export function useAnalysis() {
  // FISHY always starts empty: the person checks something of their own.
  const [mode, setMode] = useState<'demo' | 'live'>('live');
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
    void syncSelectors();
  }, []);

  const goLive = useCallback(() => setMode('live'), []);
  const addCandidates = useCallback((c: Candidate[]) => setCandidates((prev) => [...prev, ...c]), []);

  /** Who asked, for how much, to which account. The role comes from Directory when the name is on record. */
  const readSaid = useCallback(
    (text: string, lines: TranscriptLine[]): Findings['said'] => {
      const speaker = [...lines].reverse().find((l) => l.speaker && !NOT_A_PERSON.test(l.speaker))?.speaker;
      const person = speaker ? directory.people.find((p) => p.name.toLowerCase() === speaker.toLowerCase()) : undefined;
      return { speaker, role: person?.role, amount: mainAmount(text), account: findAccounts(text)[0] };
    },
    [directory.people],
  );

  /** Step 1 · Read. */
  const read = useCallback(
    async (text: string, place: Findings['place'], lines: TranscriptLine[]) => {
      setBusy('Reading for pressure…');
      setError(null);
      const said = readSaid(text, lines);
      setFindings((f) => ({ ...f, place, said: { ...f.said, ...Object.fromEntries(Object.entries(said ?? {}).filter(([, v]) => v !== undefined)) } }));
      try {
        const res = await readTactics(text);
        setFindings((f) => ({ ...f, place, tactics: { ...res, lines } }));
      } catch (e) {
        setError(`The tactic reader failed: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [readSaid],
  );

  /** New Meet caption lines, with their speaker; kept in memory only (last 20 lines). */
  const onCaptions = useCallback(
    (lines: SaidLine[]) => {
      goLive();
      for (const l of lines) transcript.current.push({ speaker: l.speaker || 'Speaker', at: clock(), text: l.text });
      transcript.current = transcript.current.slice(-MAX_LINES);
      addCandidates(candidatesFromText(lines.map((l) => l.text).join('\n')));

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

  /** An opened Gmail message: sender check, headers, domain age, links, tactics, known details. */
  const onEmail = useCallback(
    async (m: Extract<PageMessage, { type: 'email_opened' }>) => {
      goLive();
      const exact = directory.suppliers.find((s) => registrable(s.domain) === registrable(m.from));
      const lookalike = exact ? null : findLookalike(m.from, directory.suppliers);
      const urls = [...m.body.matchAll(/https?:\/\/[^\s"'<>)]+/gi)].map((x) => x[0]);
      setFindings((f) => ({
        ...f,
        place: 'gmail',
        email: {
          from: m.from,
          name: m.name,
          lookalike,
          supplier: exact,
          links: urls.length,
          unsafe: null,
          attachments: m.attachments,
          auth: m.auth ? judgeAuth(m.from, m.auth) : undefined,
        },
      }));
      addCandidates([{ kind: 'domain', value: domainOf(m.from), display: registrable(m.from) }, ...candidatesFromText(m.body)]);

      const lines = m.body.split(/\n+|(?<=[.!?])\s+/).map((l) => l.trim()).filter(Boolean).slice(0, 40);
      void read(`${m.subject}\n${m.body}`, 'gmail', lines.map((text) => ({ speaker: m.name || m.from, at: 'email', text })));

      // Cloud lookups take the domain or the links only, never the email.
      const sameEmail = (f: Findings) => f.email?.from === m.from;
      if (!exact) {
        void domainAge(registrable(m.from)).then((age) => setFindings((f) => (sameEmail(f) ? { ...f, email: { ...f.email!, age } } : f)));
      }
      const res = await checkLinks(urls);
      if (res) setFindings((f) => (sameEmail(f) ? { ...f, email: { ...f.email!, unsafe: res.unsafe } } : f));
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

  const activeTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  };

  /** Asks the Gmail tab for the open email's PDF; only on the user's click. */
  const checkAttachedInvoice = useCallback(async () => {
    if (!IN_EXTENSION) return setError('Open this in the extension to read Gmail attachments.');
    const tab = await activeTab();
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

  /* ---------- Check something: pictures, documents, voices and the video call ---------- */

  const putMedia = useCallback((item: MediaCheck) => setFindings((f) => ({ ...f, media: [...(f.media ?? []).filter((m) => m.id !== item.id), item] })), []);
  const patchMedia = useCallback(
    (id: string, patch: Partial<MediaCheck>) => setFindings((f) => ({ ...f, media: (f.media ?? []).map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    [],
  );

  /** Gemini's reading fills in the card once it arrives; a failure is said on the card, not hidden. */
  const askGemini = useCallback(
    async (id: string, run: () => Promise<HybridResult | null>) => {
      try {
        const result = await run();
        patchMedia(id, result ? { gemini: result.final, firstLook: result.firstLook, escalation: result.escalation } : { gemini: null, note: NO_GEMINI });
      } catch (e) {
        console.warn('[FISHY] Gemini media check failed', e);
        patchMedia(id, { gemini: null, note: geminiError(e) });
      }
    },
    [patchMedia],
  );

  /** A picture or a frame of the call: the file's own marks on the laptop, then what Gemini sees. */
  const checkPicture = useCallback(
    async (blob: Blob, name: string) => {
      const kind = 'picture' as const;
      goLive();
      setError(null);
      const id = newId();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const facts = scanPicture(bytes);
      putMedia({
        id,
        kind,
        name,
        at: clock(),
        preview: URL.createObjectURL(blob),
        facts: { aiLabel: facts.aiLabel, aiTool: facts.aiTool, editedWith: facts.editedWith },
        checks: facts.checks,
      });
      // The laptop's own pixel checks first; Gemini is told what they found.
      setBusy('Checking the pixels on this laptop…');
      const lab = await analysePicture(blob, bytes, facts.camera).catch((e) => {
        console.warn('[FISHY] pixel checks failed', e);
        return null;
      });
      if (lab) patchMedia(id, { forensics: { hints: lab.hints, rows: lab.rows, heatmap: lab.heatmap } });
      setBusy('Gemini is looking at the picture…');
      await askGemini(id, () => readPicture(blob, { measured: lab?.measured, localHint: !!lab?.hints.length }));
      setBusy(null);
    },
    [askGemini, goLive, patchMedia, putMedia],
  );

  /**
   * A voice clip: the laptop measures it first (pitch, silences, breaths, background), then Gemini
   * listens with those numbers in hand. Audio goes to the cloud model (Gemini Nano does not take
   * audio through Firebase AI Logic yet); the measurements are the on-device part.
   */
  const checkVoiceClip = useCallback(
    async (blob: Blob, mime: string, name: string, levels?: number[], live = false) => {
      goLive();
      setError(null);
      const id = newId();
      putMedia({ id, kind: 'voice', name, at: clock(), levels, checks: [] });
      setBusy('Measuring the voice on this laptop…');
      let samples: Float32Array;
      try {
        samples = await decodeMono16k(new Blob([blob], { type: mime }));
      } catch (e) {
        patchMedia(id, { gemini: null, note: `This recording couldn’t be opened: ${(e as Error).message}` });
        setBusy(null);
        return;
      }
      const lab = voiceLab(samples, VOICE_RATE, live);
      patchMedia(id, { forensics: { hints: lab.hints, rows: lab.rows, pitch: lab.pitch }, ...(levels ? {} : { levels: loudness(samples) }) });
      setBusy('Gemini is listening to the voice…');
      await askGemini(id, () => readVoice(wavFrom(samples), { measured: lab.measured }));
      setBusy(null);
    },
    [askGemini, goLive, patchMedia, putMedia],
  );

  /** A PDF: its edit traces, and Gemini's look at the first page. An invoice also gets the bank-account checks. */
  const checkDocument = useCallback(
    async (data: ArrayBuffer, name: string) => {
      goLive();
      setError(null);
      setBusy('Reading the document…');
      const id = newId();
      try {
        const { text, facts } = await readPdf(data.slice(0));
        const page = await renderFirstPage(data);
        putMedia({ id, kind: 'document', name, at: clock(), preview: URL.createObjectURL(page), checks: editTraces(facts) });
        if (findAccounts(text).length) await checkInvoice(data.slice(0), name);
        setBusy('Gemini is looking at the first page…');
        await askGemini(id, () => readPicture(page, { measured: 'This is page 1 of a PDF, drawn by FISHY: judge what is on the page, not the drawing.' }));
      } catch (e) {
        setError(`Document check: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [askGemini, checkInvoice, goLive, putMedia],
  );

  /** Whatever the person dropped or chose: a picture, a PDF or a voice recording. */
  const checkFile = useCallback(
    async (file: File) => {
      // Checked before reading: a huge file would freeze the panel and is too big for Gemini anyway.
      if (file.size > MAX_FILE_BYTES) return setError(`That file is ${Math.round(file.size / 1048576)} MB. FISHY checks files up to 20 MB.`);
      if (file.type.startsWith('image/')) return checkPicture(file, file.name);
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return checkDocument(await file.arrayBuffer(), file.name);
      if (file.type.startsWith('audio/') || /\.(m4a|mp3|wav|ogg|webm|opus)$/i.test(file.name)) return checkVoiceClip(file, file.type || 'audio/webm', file.name);
      setError('FISHY checks pictures, PDF documents and voice recordings.');
    },
    [checkDocument, checkPicture, checkVoiceClip],
  );

  /** Records 10 s of the call in this tab, only on the user's click, and has Gemini listen to it. */
  const checkVoice = useCallback(async () => {
    if (!IN_EXTENSION) return setError('Open this in the extension to record the call.');
    const tab = await activeTab();
    if (tab?.id === undefined) return setError('Open the call’s tab first.');
    setError(null);
    try {
      const clip = await recordTabClip(tab.id, 10, (left) => setBusy(`Recording the voice… ${left} s`));
      const speaker = [...transcript.current].reverse().find((l) => !NOT_A_PERSON.test(l.speaker))?.speaker;
      await checkVoiceClip(clip.blob, clip.mime, speaker ? `${clip.seconds} s of ${speaker}` : `${clip.seconds} s of the call`, clip.levels, true);
    } catch (e) {
      setError(captureError('voice', e));
      setBusy(null);
    }
  }, [checkVoiceClip]);

  /**
   * Several frames of the video call in this tab, only on the user's click. The laptop checks
   * whether the picture moves; Gemini compares the frames side by side (on the laptop first).
   * `challenge`: the caller was asked to pass a hand slowly across their face while it captures.
   */
  const checkFrame = useCallback(
    async (challenge = false) => {
      if (!IN_EXTENSION) return setError('Open this in the extension to check the video call.');
      const tab = await activeTab();
      if (tab?.id === undefined) return setError('Open the call’s tab first.');
      setError(null);
      const count = challenge ? 8 : 5;
      try {
        setBusy(challenge ? 'Watching the hand pass… keep it slow' : 'Watching the video for 3 seconds…');
        // In the floating window, step out of the picture while it captures.
        const floating = window.parent !== window;
        if (floating) {
          window.parent.postMessage({ fishy: 'hide' }, '*');
          await new Promise((r) => setTimeout(r, 120));
        }
        let set: Awaited<ReturnType<typeof captureTabFrames>>;
        try {
          set = await captureTabFrames(tab.id, count, challenge ? 500 : 700);
        } finally {
          if (floating) window.parent.postMessage({ fishy: 'show' }, '*');
        }
        goLive();
        const id = newId();
        const lab = videoLab(set.thumbs, set.seconds);
        const frames = set.frames.map((f) => URL.createObjectURL(f));
        putMedia({
          id,
          kind: 'frame',
          name: challenge ? `Hand check at ${clock()}` : `Video call at ${clock()}`,
          at: clock(),
          preview: frames[0],
          frames,
          challenge,
          checks: [],
          forensics: { hints: lab.hints, rows: lab.rows, motion: lab.motion },
        });
        setBusy(challenge ? 'Gemini is checking the face behind the hand…' : 'Gemini is comparing the frames…');
        await askGemini(id, () => readFrames(set.sheet, { measured: lab.measured, localHint: !!lab.hints.length, challenge }));
      } catch (e) {
        setError(captureError('video', e));
      } finally {
        setBusy(null);
      }
    },
    [askGemini, goLive, putMedia],
  );

  /**
   * The website in this tab: the laptop reads the address and the page (forms, what it asks for),
   * the cloud is asked only for the domain's age and Google's unsafe-site list (the address, never
   * the page), then Gemini looks at a screenshot, on the laptop first.
   */
  const checkSite = useCallback(async () => {
    if (!IN_EXTENSION) return setError('Open this in the extension to check a website.');
    const tab = await activeTab();
    if (tab?.id === undefined) return setError('Open the website’s tab first.');
    setError(null);
    try {
      setBusy('Reading the website on this laptop…');
      const [first] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
      const page = first?.result as PageFacts | undefined;
      if (!page?.host) throw new Error('Cannot access this page.');
      const floating = window.parent !== window;
      if (floating) {
        window.parent.postMessage({ fishy: 'hide' }, '*');
        await new Promise((r) => setTimeout(r, 150));
      }
      let shot: string;
      try {
        shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 85 });
      } finally {
        if (floating) window.parent.postMessage({ fishy: 'show' }, '*');
      }
      const picture = await (await fetch(shot)).blob();
      goLive();
      const id = newId();
      let lab = siteLab(page, directory.suppliers);
      putMedia({ id, kind: 'site', name: page.host, at: clock(), preview: URL.createObjectURL(picture), checks: [], forensics: { hints: lab.hints, rows: lab.rows } });

      // Only the address goes out: its age, and whether Google lists it (no query string, no page).
      setBusy('Looking up the address…');
      const address = (() => {
        try {
          const u = new URL(page.url);
          return `${u.origin}${u.pathname}`;
        } catch {
          return `https://${page.host}/`;
        }
      })();
      const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
      const [age, links] = await Promise.all([within(domainAge(registrable(page.host))), within(checkLinks([address]))]);
      lab = siteLab(page, directory.suppliers, { ageDays: age ? age.days : undefined, unsafe: links ? links.unsafe.length > 0 : undefined });
      patchMedia(id, { forensics: { hints: lab.hints, rows: lab.rows } });

      setBusy('Gemini is looking at the website…');
      await askGemini(id, () => readSite(picture, { measured: lab.measured, localHint: !!lab.hints.length }));
    } catch (e) {
      setError(captureError('website', e));
    } finally {
      setBusy(null);
    }
  }, [askGemini, directory.suppliers, goLive, patchMedia, putMedia]);

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
      const demo = demoData();
      return { signals: demo.signals, evidence: demo.evidence, request: demo.request, verdict: decide(demo.signals, rules), place: demo.request?.place ?? ('meet' as const) };
    }
    const signals = toSignals(full);
    const verdict = decide(signals, rules);
    return { signals, evidence: toEvidence(full, rules, verdict.patterns, known.updatedAt), request: toRequest(full), verdict, place: full.place };
  }, [mode, full, rules, known.updatedAt]);

  const onPage = useCallback((m: PageMessage) => (m.type === 'captions' ? onCaptions(m.lines) : void onEmail(m)), [onCaptions, onEmail]);

  /** Did anything get checked yet? (live mode starts empty) */
  const hasInput = mode === 'demo' || !!(findings.tactics || findings.email || findings.invoice || findings.voice || findings.media?.length || candidates.length);

  return {
    mode,
    ...out,
    hasInput,
    /** Accounts, domains and numbers seen in the request, for shared learning on a call. */
    candidates,
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
    checkVoice,
    checkFrame,
    checkSite,
    checkFile,
    clear,
    loadDemo,
    emailOpen: !!findings.email,
    hasVoice: mode === 'demo' || !!findings.voice,
  };
}

export type Analysis = ReturnType<typeof useAnalysis>;
