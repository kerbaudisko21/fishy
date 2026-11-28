import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { demoData } from '../demo/dataset';
import { glanceFrames, readFrames, readPicture, readSite, readVoice, type HybridResult } from '../lib/ai/media';
import { NANO_IMAGE } from '../lib/ai/prompts';
import { nanoStatus } from '../lib/ai/tactics';
import { geminiLR, HINT_LR } from '../lib/media-score';
import { lipSync, lipSyncHint } from '../lib/forensics/lipsync';
import { sprtPosition, sprtStep, startSprt } from '../lib/forensics/sprt';
import { overlayMask } from '../lib/overlay-mask';
import { readPage, siteLab, type PageFacts } from '../lib/checks/site';
import { decodeMono16k, VOICE_RATE, wavFrom } from '../lib/ai/files';
import { analysePicture } from '../lib/forensics/picture';
import { videoLab, voiceLab } from '../lib/forensics/labs';
import { qrFromBlob, qrLab } from '../lib/forensics/qr';
import { bands, hamming, SAME_PICTURE_DISTANCE } from '../lib/forensics/phash';
import { loadStats, recordAnswer, trustFor, type StatKind } from '../lib/ai/stats';
import { MAX_VOICE_SECONDS, pictureTooBig, recordingSeconds, VOICE_ANALYSIS_SECONDS } from '../lib/forensics/limits';
import { readTactics } from '../lib/ai/tactics';
import { IN_EXTENSION } from '../lib/config';
import { domainOf, findLookalike, registrable } from '../lib/checks/domain';
import { judgeAuth } from '../lib/checks/email';
import { compareAccount, editTraces, findAccounts, invoiceNumber, invoiceTotal, mask } from '../lib/checks/invoice';
import { candidatesFromText, matchKnown, type Candidate } from '../lib/checks/known';
import { scanPicture } from '../lib/checks/media';
import { readPdf, renderFirstPage } from '../lib/checks/pdf';
import { mainAmount, type SaidLine } from '../lib/checks/said';
import { checkLinks, domainAge, findReported, reportFake, loadDirectory, loadKnownBad, loadRules, syncSelectors, type Directory } from '../lib/data';
import { base64ToBuffer, type AttachmentReply, type PageMessage, type PanelMessage } from '../lib/messages';
import { toEvidence, toRequest, toSignals, type Findings, type TranscriptLine } from '../lib/pipeline';
import { decide, DEFAULT_RULES, type RulesConfig } from '../lib/rules/engine';
import type { KnownBadEntry, MediaCheck } from '../lib/types';
import { captureTabFrames, grabFrames, openTabVideo, recordLipSync, recordTabClip, type TabVideo } from '../lib/voice';

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
/** Watch mode, for the home screen. */
export interface WatchState {
  on: boolean;
  rounds: number;
  /** Where the evidence sits between "real" (0) and "fake" (1). */
  position: number;
  /** Rounds that ended in "looks real so far". */
  realRounds: number;
  last: string;
  alarm?: boolean;
}

/** SHA-256 of the file as received, hex: what investigators hash before looking (NSA/FBI/CISA). */
async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
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
    loadDirectory()
      .then((d) => {
        setDirectory(d);
        // For the automatic website warnings: supplier names and domains only, kept on this laptop.
        if (IN_EXTENSION) void chrome.storage.local.set({ fishySuppliers: d.suppliers.map((s) => ({ name: s.name, domain: s.domain })) });
      })
      .catch((e) => setError(`Directory: ${String(e.message ?? e)}`));
    loadKnownBad().then(setKnown).catch((e) => console.warn('[FISHY] known list', e));
    loadRules().then(setRules);
    void loadStats();
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

  /**
   * A QR code in a picture or page: where it leads or who it pays. A link's address (only the
   * address) is looked up for its age and on the unsafe-sites list, like the website check.
   */
  const qrEvidence = useCallback(
    async (blob: Blob) => {
      const data = await qrFromBlob(blob).catch(() => null);
      let lab = qrLab(data, directory.suppliers);
      if (lab?.url && lab.host) {
        const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
        const [age, links] = await Promise.all([within(domainAge(registrable(lab.host))), within(checkLinks([lab.url]))]);
        lab = qrLab(data, directory.suppliers, { ageDays: age ? age.days : undefined, unsafe: links ? links.unsafe.length > 0 : undefined });
      }
      return lab;
    },
    [directory.suppliers],
  );

  /** Gemini's reading fills in the card once it arrives; a failure is said on the card, not hidden. */
  const askGemini = useCallback(
    async (id: string, run: () => Promise<HybridResult | null>, kind?: StatKind) => {
      try {
        const started = performance.now();
        const result = await run();
        if (result && kind) recordAnswer(kind, { source: result.final.source, ms: performance.now() - started, firstLook: result.firstLook, final: result.final });
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
      // Refused before anything decodes it: a small file can claim to be enormous.
      const tooBig = pictureTooBig(bytes);
      if (tooBig) return setError(tooBig);
      // A damaged file, or a format that isn't a photo (an SVG drawing), is said plainly, with no empty card.
      if (!bytes.length) return setError(`${name} is empty.`);
      try {
        (await createImageBitmap(blob)).close();
      } catch {
        return setError(`${name} couldn’t be opened as a picture. FISHY checks photos and screenshots (JPEG, PNG, WebP, GIF); the file may be damaged or not really a picture.`);
      }
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
      const qr = await qrEvidence(blob);
      const hints = [...(lab?.hints ?? []), ...(qr?.hints ?? [])];
      const rows = [...(qr?.rows ?? []), ...(lab?.rows ?? [])];
      // Reported before by other FISHY users? Only the 64-bit fingerprint goes out.
      if (lab?.phash) {
        const match = await findReported(lab.phash, bands(lab.phash), hamming, SAME_PICTURE_DISTANCE);
        if (match) {
          const many = match.reports >= 3;
          hints.unshift({ id: many ? 'reported_many' : 'reported', strength: 2, text: `This picture${match.distance ? ' (or a near copy)' : ''} was reported as a scam by ${match.reports} FISHY user${match.reports === 1 ? '' : 's'} before.` });
          rows.unshift({ ok: false, title: 'Reported as a scam before', detail: `${match.reports} report${match.reports === 1 ? '' : 's'}; reports are by users and can be wrong, so ${many ? 'several agree' : 'one counts only a little'}` });
        }
      }
      const sha256 = await sha256Hex(bytes);
      if (lab || qr) patchMedia(id, { phash: lab?.phash, sha256, forensics: { hints, rows, heatmap: lab?.heatmap, boxes: lab?.boxes } });
      setBusy('Gemini is looking at the picture…');
      const measured = [lab?.measured, qr?.measured].filter(Boolean).join(' ');
      await askGemini(id, () => readPicture(blob, { measured, localHint: hints.length > 0, trust: trustFor('picture') }), 'picture');
      setBusy(null);
    },
    [askGemini, goLive, patchMedia, putMedia, qrEvidence],
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
      // A recording's length is read before it is decoded: hours of audio would take gigabytes.
      if (!live) {
        const seconds = await recordingSeconds(blob);
        if (seconds !== null && seconds > MAX_VOICE_SECONDS) {
          return setError(`That recording is ${Math.round(seconds / 60)} minutes long. FISHY checks voice clips up to 5 minutes; cut the part with the voice you doubt.`);
        }
      }
      putMedia({ id, kind: 'voice', name, at: clock(), levels, checks: [] });
      setBusy('Measuring the voice on this laptop…');
      let samples: Float32Array;
      try {
        // Only the first minute is measured and sent: enough for every check, and a fixed cost.
        samples = (await decodeMono16k(new Blob([blob], { type: mime }))).subarray(0, VOICE_ANALYSIS_SECONDS * VOICE_RATE);
      } catch (e) {
        patchMedia(id, { gemini: null, note: `This recording couldn’t be opened: ${(e as Error).message}` });
        setBusy(null);
        return;
      }
      const lab = voiceLab(samples, VOICE_RATE, live);
      patchMedia(id, { forensics: { hints: lab.hints, rows: lab.rows, pitch: lab.pitch }, ...(levels ? {} : { levels: loudness(samples) }) });
      setBusy('Gemini is listening to the voice…');
      await askGemini(id, () => readVoice(wavFrom(samples), { measured: lab.measured }), 'voice');
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
        const qr = await qrEvidence(page);
        if (qr) patchMedia(id, { forensics: { hints: qr.hints, rows: qr.rows } });
        if (findAccounts(text).length) await checkInvoice(data.slice(0), name);
        setBusy('Gemini is looking at the first page…');
        await askGemini(id, () => readPicture(page, { measured: 'This is page 1 of a PDF, drawn by FISHY: judge what is on the page, not the drawing.', trust: trustFor('document') }), 'document');
      } catch (e) {
        setError(`Document check: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [askGemini, checkInvoice, goLive, patchMedia, putMedia, qrEvidence],
  );

  /** Whatever the person dropped or chose: a picture, a PDF or a voice recording. */
  const checkFile = useCallback(
    async (file: File) => {
      // Checked before reading: a huge file would freeze the panel and is too big for Gemini anyway.
      if (file.size > MAX_FILE_BYTES) return setError(`That file is ${Math.round(file.size / 1048576)} MB. FISHY checks files up to 20 MB.`);
      if (!file.size) return setError(`${file.name} is empty.`);
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
        await askGemini(id, () => readFrames(set.sheet, { measured: lab.measured, localHint: !!lab.hints.length, challenge, trust: trustFor('frame') }), 'frame');
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
          return `${u.origin}${u.pathname}`.slice(0, 2048);
        } catch {
          return `https://${page.host}/`;
        }
      })();
      const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
      const [age, links] = await Promise.all([within(domainAge(registrable(page.host))), within(checkLinks([address]))]);
      lab = siteLab(page, directory.suppliers, { ageDays: age ? age.days : undefined, unsafe: links ? links.unsafe.length > 0 : undefined });
      patchMedia(id, { forensics: { hints: lab.hints, rows: lab.rows } });

      setBusy('Gemini is looking at the website…');
      await askGemini(id, () => readSite(picture, { measured: lab.measured, localHint: !!lab.hints.length, trust: trustFor('site') }), 'site');
    } catch (e) {
      setError(captureError('website', e));
    } finally {
      setBusy(null);
    }
  }, [askGemini, directory.suppliers, goLive, patchMedia, putMedia]);

  /**
   * A picture the person right-clicked on a page ("Check this picture with FISHY"). Fetched inside
   * the page first, which works for the page's own pictures and for chat apps' blob: pictures;
   * otherwise the picture is cut out of a screenshot (its file marks are lost then, and the card says so).
   */
  const checkPagePicture = useCallback(
    async (job: { src: string; tabId: number; pageUrl?: string }) => {
      if (!IN_EXTENSION) return;
      setError(null);
      setBusy('Getting the picture from the page…');
      const fromUrl = (() => {
        try {
          const u = new URL(job.src);
          const last = decodeURIComponent(u.pathname.split('/').pop() ?? '');
          return /\.(jpe?g|png|webp|gif)$/i.test(last) ? last : `Picture from ${new URL(job.pageUrl ?? job.src).hostname || 'a page'}`;
        } catch {
          return 'Picture from a page';
        }
      })();
      try {
        // 1. In the page: same-origin, blob: and open (CORS) pictures, with their original bytes.
        const [inPage] = await chrome.scripting.executeScript({
          target: { tabId: job.tabId },
          args: [job.src],
          func: async (src: string) => {
            try {
              const r = await fetch(src);
              if (!r.ok) return null;
              const b = await r.blob();
              if (!b.type.startsWith('image/') || b.size > 20 * 1024 * 1024) return null;
              const bytes = new Uint8Array(await b.arrayBuffer());
              let text = '';
              for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              return { b64: btoa(text), type: b.type };
            } catch {
              return null;
            }
          },
        });
        const got = inPage?.result as { b64: string; type: string } | null | undefined;
        if (got) {
          const bin = atob(got.b64);
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          await checkPicture(new Blob([bytes], { type: got.type }), fromUrl);
          return void setFindings((f) => ({ ...f, media: (f.media ?? []).map((m, i, all) => (i === all.length - 1 && /^https?:/.test(job.src) ? { ...m, sourceUrl: job.src } : m)) }));
        }
        // 2. Where it is on screen, then a screenshot cut to it.
        const [where] = await chrome.scripting.executeScript({
          target: { tabId: job.tabId },
          args: [job.src],
          func: (src: string) => {
            const img = [...document.images].find((i) => i.currentSrc === src || i.src === src);
            if (!img) return null;
            img.scrollIntoView({ block: 'center', inline: 'center' });
            const r = img.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height, dpr: window.devicePixelRatio };
          },
        });
        const rect = where?.result as { x: number; y: number; w: number; h: number; dpr: number } | null | undefined;
        if (!rect || rect.w < 8 || rect.h < 8) throw new Error('The picture could not be read from this page.');
        const floating = window.parent !== window;
        if (floating) {
          window.parent.postMessage({ fishy: 'hide' }, '*');
          await new Promise((r) => setTimeout(r, 150));
        }
        let shot: string;
        try {
          const tab = await chrome.tabs.get(job.tabId);
          shot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
        } finally {
          if (floating) window.parent.postMessage({ fishy: 'show' }, '*');
        }
        const full = await createImageBitmap(await (await fetch(shot)).blob());
        const sx = Math.max(0, Math.round(rect.x * rect.dpr));
        const sy = Math.max(0, Math.round(rect.y * rect.dpr));
        const sw = Math.min(full.width - sx, Math.round(rect.w * rect.dpr));
        const sh = Math.min(full.height - sy, Math.round(rect.h * rect.dpr));
        const canvas = new OffscreenCanvas(Math.max(1, sw), Math.max(1, sh));
        canvas.getContext('2d')!.drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
        full.close();
        await checkPicture(await canvas.convertToBlob({ type: 'image/png' }), `${fromUrl} (from the screen)`);
      } catch (e) {
        setError(captureError('website', e).replace('check the website again', 'right-click the picture again'));
        setBusy(null);
      }
    },
    [checkPicture],
  );

  /* ---------- Watch mode: the face, every 20 s, on the laptop, with a sequential test ---------- */

  const [watch, setWatch] = useState<WatchState | null>(null);
  const watchRun = useRef<{ stop: () => void } | null>(null);

  const stopWatch = useCallback(() => {
    watchRun.current?.stop();
    watchRun.current = null;
    setWatch((w) => (w && w.on ? { ...w, on: false } : w));
  }, []);
  useEffect(() => () => watchRun.current?.stop(), []);

  /**
   * Keeps one capture of the call open and, every round, grabs 3 frames (FISHY blacked out of
   * them), measures the motion, and has Gemini glance at them: Gemini Nano on the laptop when it
   * is ready (every 20 s), the cloud otherwise (every 45 s, to keep calls down). Each round's
   * likelihood ratio goes into Wald's SPRT: it raises the alarm only when the evidence adds up,
   * then asks the cloud for a second opinion and shows the result as a card.
   */
  const startWatch = useCallback(async () => {
    if (!IN_EXTENSION) return setError('Open this in the extension to watch the call.');
    if (watchRun.current) return;
    const tab = await activeTab();
    if (tab?.id === undefined) return setError('Open the call’s tab first.');
    setError(null);
    let capture: TabVideo;
    try {
      capture = await openTabVideo(tab.id);
    } catch (e) {
      return setError(captureError('video', e));
    }
    goLive();
    let stopped = false;
    let timer: number | undefined;
    let sprt = startSprt();
    let realRounds = 0;
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      capture.stop();
    };
    watchRun.current = { stop };
    setWatch({ on: true, rounds: 0, position: sprtPosition(sprt), realRounds: 0, last: 'Starting…' });
    capture.stream.getVideoTracks()[0]?.addEventListener('ended', () => stopWatch());

    const round = async () => {
      if (stopped) return;
      const nano = (await nanoStatus(NANO_IMAGE)) === 'available';
      try {
        const set = await grabFrames(capture.video, 3, 600, await overlayMask());
        if (stopped) return;
        const lab = videoLab(set.thumbs, set.seconds);
        const started = performance.now();
        const look = await glanceFrames(set.sheet, lab.measured).catch(() => null);
        if (look) recordAnswer('frame', { source: look.source, ms: performance.now() - started, final: look });
        const lr = (look ? geminiLR(look.assessment, look.signs.length, false) : 1) * (lab.frozen ? HINT_LR.frozen : 1);
        sprt = sprtStep(sprt, lr);
        const said = look ? `${look.source === 'on_device' ? 'Gemini Nano' : 'Gemini cloud'}: ${look.assessment === 'likely_ai' || look.assessment === 'likely_edited' ? 'signs of a fake' : look.assessment === 'no_clear_signs' ? 'no clear signs' : 'hard to tell'}` : lab.frozen ? 'The picture didn’t move' : 'Motion checked (Gemini not connected)';
        if (sprt.decision === 'fake') {
          stop();
          watchRun.current = null;
          setWatch({ on: false, rounds: sprt.rounds, position: 1, realRounds, last: said, alarm: true });
          const id = newId();
          const frames = set.frames.map((f) => URL.createObjectURL(f));
          putMedia({ id, kind: 'frame', name: `Watch mode alarm at ${clock()}`, at: clock(), preview: frames[0], frames, checks: [], forensics: { hints: lab.hints, rows: [...lab.rows, { ok: false, title: 'Watch mode raised the alarm', detail: `The evidence added up over ${sprt.rounds} rounds (sequential test, 1% false-alarm rate)` }], motion: lab.motion } });
          await askGemini(id, () => readFrames(set.sheet, { measured: lab.measured, forceCloud: 'watch mode raised the alarm, so the cloud double-checks' }), 'frame');
          return;
        }
        if (sprt.decision === 'real') {
          realRounds += sprt.rounds;
          sprt = startSprt(); // keep watching: a face can be swapped in later
        }
        setWatch({ on: true, rounds: sprt.rounds, position: sprtPosition(sprt), realRounds, last: said });
      } catch (e) {
        console.warn('[FISHY] watch round failed', e);
      }
      if (!stopped) timer = window.setTimeout(() => void round(), nano ? 20_000 : 45_000);
    };
    void round();
  }, [askGemini, goLive, putMedia, stopWatch]);

  /** Lip-sync: 5 s of the call; does anything on screen move with the voice? Measured on the laptop. */
  const checkLipSync = useCallback(async () => {
    if (!IN_EXTENSION) return setError('Open this in the extension to check the call.');
    const tab = await activeTab();
    if (tab?.id === undefined) return setError('Open the call’s tab first.');
    setError(null);
    try {
      setBusy('Watching the mouth and listening for 5 s…');
      const clip = await recordLipSync(tab.id, 5, await overlayMask(), (left) => setBusy(`Watching the mouth and listening… ${left} s`));
      goLive();
      const r = lipSync(clip.frames, clip.loudness, clip.w, clip.h);
      const hint = lipSyncHint(r, clip.frameMs);
      const detail =
        r.verdict === 'unclear'
          ? r.speech < 0.25
            ? 'Too little speech to compare: try again while the person talks'
            : 'Nothing clear either way'
          : r.verdict === 'in_step'
            ? `Something on screen moves with the voice (match ${r.r.toFixed(2)}). Some fakes match too, so this proves nothing`
            : `Best match ${r.r.toFixed(2)}${r.verdict === 'lagging' ? `, ${Math.abs(r.lag) * clip.frameMs} ms apart` : ''}`;
      putMedia({
        id: newId(),
        kind: 'frame',
        name: `Lip-sync at ${clock()}`,
        at: clock(),
        checks: [],
        gemini: null,
        note: 'Measured on this laptop only: no picture or sound left it.',
        forensics: { hints: hint ? [hint] : [], rows: [{ ok: !hint, title: 'Mouth and voice', detail }, { ok: true, title: 'Speech in the clip', detail: `${Math.round(r.speech * 100)}% of 5 s` }] },
      });
    } catch (e) {
      setError(captureError('video', e));
    } finally {
      setBusy(null);
    }
  }, [goLive, putMedia]);

  /** Reports a checked picture as a scam: its fingerprint only, once per person. */
  const reportPicture = useCallback(
    async (id: string) => {
      const item = findings.media?.find((m) => m.id === id);
      if (!item?.phash) return;
      const ok = await reportFake(item.phash, bands(item.phash), item.kind === 'document' ? 'document' : item.kind === 'frame' ? 'frame' : 'picture');
      if (ok) patchMedia(id, { reported: true });
      else setError('The report couldn’t be sent. Check the internet connection and that Firebase is set up.');
    },
    [findings.media, patchMedia],
  );

  /**
   * A link, checked by its address only, without opening it: look-alike of a supplier, look-alike
   * letters, risky ending, a bare number; and in the cloud (the address only) its age and Google's
   * unsafe-sites list. Opening it is the person's choice afterwards.
   */
  const checkLink = useCallback(
    async (url: string) => {
      goLive();
      setError(null);
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        return setError('That link isn’t a web address FISHY can check.');
      }
      if (!/^https?:$/.test(u.protocol)) return setError('FISHY checks web links (http and https).');
      const id = newId();
      const page: PageFacts = { url: `${u.origin}${u.pathname}`.slice(0, 2048), host: u.hostname, https: u.protocol === 'https:', title: '', text: '', passwordFields: 0, cardFields: 0, otpFields: 0, formHosts: [] };
      let lab = siteLab(page, directory.suppliers);
      putMedia({ id, kind: 'site', name: u.hostname, at: clock(), checks: [], gemini: null, note: 'Only the address was checked: FISHY didn’t open the link. If you open it, use “The website” to check the page too.', forensics: { hints: lab.hints, rows: lab.rows } });
      setBusy('Looking up the address…');
      const within = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 6000))]);
      const [age, links] = await Promise.all([within(domainAge(registrable(u.hostname))), within(checkLinks([page.url]))]);
      lab = siteLab(page, directory.suppliers, { ageDays: age ? age.days : undefined, unsafe: links ? links.unsafe.length > 0 : undefined });
      patchMedia(id, { forensics: { hints: lab.hints, rows: lab.rows } });
      setBusy(null);
    },
    [directory.suppliers, goLive, patchMedia, putMedia],
  );

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
    // The previews, frames and heat maps were object URLs: give their memory back.
    setFindings((f) => {
      for (const m of f.media ?? []) for (const url of [m.preview, m.forensics?.heatmap, ...(m.frames ?? [])]) if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
      return EMPTY;
    });
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
    checkLink,
    checkPagePicture,
    checkLipSync,
    reportPicture,
    watch,
    startWatch,
    stopWatch,
    checkFile,
    clear,
    loadDemo,
    emailOpen: !!findings.email,
    hasVoice: mode === 'demo' || !!findings.voice,
  };
}

export type Analysis = ReturnType<typeof useAnalysis>;
