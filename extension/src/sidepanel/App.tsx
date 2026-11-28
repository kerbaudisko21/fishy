import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { suspectsFrom } from '../lib/checks/known';
import { patternInfo } from '../lib/rules/engine';
import { firstName } from '../lib/names';
import { IN_EXTENSION } from '../lib/config';
import { isPageMessage, type BannerState, type PanelMessage } from '../lib/messages';
import type { CallTarget, Evidence, SignalKind } from '../lib/types';
import { Header, TrackContext, trackFor } from './components';
import { DataToggle } from './DataToggle';
import { useWindowDrop } from './scanner';
import { placeFor, screenFor, type Screen } from './routes';
import { CheckYourself } from './screens/CheckYourself';
import { Directory } from './screens/Directory';
import { EmailLinks } from './screens/EmailLinks';
import { Invoice } from './screens/Invoice';
import { KnownScams } from './screens/KnownScams';
import { Media } from './screens/Media';
import { Settings } from './screens/Settings';
import { Tactics } from './screens/Tactics';
import { Verdict } from './screens/Verdict';
import { Voice } from './screens/Voice';
import { useAnalysis } from './useAnalysis';
import { useCall } from './useCall';

async function sendBanner(state: BannerState, title: string, line: string) {
  if (!IN_EXTENSION) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const msg: PanelMessage = { type: 'banner', state, title, line };
  chrome.tabs.sendMessage(tab.id, msg).catch(() => {
    /* not a Meet or Gmail tab */
  });
}

/** A screen opens only when its evidence exists. */
function hasEvidence(screen: Screen, ev: Evidence) {
  const key = ({ tactics: 'tactics', email: 'email', invoice: 'invoice', voice: 'voice', media: 'media', known: 'known' } as const)[screen as 'tactics'];
  return !key || !!ev[key];
}

const first = (name?: string) => firstName(name, '');

/** Check is home, Directory sits beside it, everything else opens on top. */
const DEPTH = (s: Screen) => (s === 'verdict' ? 0 : s === 'directory' ? 1 : 2);

export function App() {
  const a = useAnalysis();
  const { call, start, cancel, error: callError } = useCall();
  // The screen and which way the user moved, so the new screen slides in from the right side.
  const [nav, setNav] = useState<{ screen: Screen; dir: 'none' | 'fwd' | 'back' }>({ screen: 'verdict', dir: 'none' });
  const screen = nav.screen;
  const setScreen = (s: Screen) =>
    setNav((n) => (s === n.screen ? n : { screen: s, dir: DEPTH(s) >= DEPTH(n.screen) ? 'fwd' : 'back' }));

  // Who FISHY may call: the supplier contact on record (for a supplier email), then the approvers.
  const supplierName = a.mode === 'live' ? (a.evidence.email?.onRecord?.name ?? (a.evidence.invoice?.usual ? a.evidence.invoice.supplier : undefined)) : undefined;
  const supplier = supplierName ? a.directory.suppliers.find((s) => s.name === supplierName) : undefined;
  const targets: CallTarget[] = useMemo(() => {
    const people = [...a.directory.people].sort((x, y) => (x.escalationOrder ?? 0) - (y.escalationOrder ?? 0));
    const list: CallTarget[] = people.map((p) => ({ id: p.id, name: p.name, role: p.role, phoneMasked: p.phoneMasked }));
    if (supplier) list.unshift({ id: supplier.id, name: supplier.contact.name, role: `${supplier.contact.role}, ${supplier.name}`, phoneMasked: supplier.contact.phoneMasked });
    return list;
  }, [a.directory.people, supplier]);

  const askedName = a.request?.askedBy.name;
  const defaultTarget = targets.find((t) => t.name === askedName)?.id ?? targets[0]?.id ?? '';
  const [targetId, setTargetId] = useState('');
  useEffect(() => setTargetId(defaultTarget), [defaultTarget]);
  const target = targets.find((t) => t.id === targetId);
  const escalateTo = a.directory.people
    .filter((p) => p.escalationOrder && p.id !== target?.id)
    .sort((x, y) => x.escalationOrder! - y.escalationOrder!)
    .map((p) => ({ id: p.id, name: p.name, role: p.role, phoneMasked: p.phoneMasked }))[0];

  // Live pages: captions and opened emails arrive here from the content scripts.
  const { onPage } = a;
  useEffect(() => {
    if (!IN_EXTENSION) return;
    const onMessage = (msg: unknown) => {
      if (isPageMessage(msg)) onPage(msg);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [onPage]);

  // Keep the in-page banner in step with the panel.
  const who = first(call.target?.name);
  useEffect(() => {
    if (call.state === 'not_me') void sendBanner('red', 'Not verified. Do not pay.', `The real ${who} says they did not ask for this.`);
    else if (call.state === 'confirmed') void sendBanner('confirmed', `${who} confirmed with their PIN.`, 'Pay through the normal approval.');
    else if (a.hasInput && a.verdict.level === 'fishy') void sendBanner('amber', `Something’s fishy: ${a.verdict.flags.length} red flags`, 'Hold the payment.');
    else void sendBanner('hidden', '', '');
  }, [call.state, who, a.hasInput, a.verdict]);

  // "Check this picture with FISHY" from the right-click menu: the job waits in session storage.
  const { checkPagePicture } = a;
  useEffect(() => {
    if (!IN_EXTENSION || !chrome.storage?.session) return;
    type Job = { kind: 'picture'; src: string; tabId: number; pageUrl?: string; at: number };
    const take = (job?: Job) => {
      if (!job || job.kind !== 'picture' || Date.now() - job.at > 60_000) return;
      void chrome.storage.session.remove('fishyJob');
      void checkPagePicture(job);
    };
    void chrome.storage.session.get('fishyJob').then((v) => take(v.fishyJob as Job | undefined));
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.fishyJob?.newValue) take(changes.fishyJob.newValue as Job);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [checkPagePicture]);

  // A file dragged anywhere over FISHY can be dropped to check it.
  const { checkFile } = a;
  const dropping = useWindowDrop(useCallback((file: File) => void checkFile(file), [checkFile]));
  const [focusMedia, setFocusMedia] = useState<string | null>(null);

  // A new picture, document, voice or frame being checked: show its card straight away.
  useEffect(() => setFocusMedia(null), [a.evidence.media?.length]);
  const mediaCount = a.evidence.media?.length ?? 0;
  const seenMedia = useRef(mediaCount);
  useEffect(() => {
    if (mediaCount > seenMedia.current && (screen === 'verdict' || screen === 'paste')) setScreen('media');
    seenMedia.current = mediaCount;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaCount]);

  // A new screen starts at the top, and a screen reader hears its heading.
  useEffect(() => {
    window.scrollTo(0, 0);
    if (nav.dir === 'none') return;
    const heading = document.querySelector<HTMLElement>('.screen h1');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [screen, nav.dir]);

  const startCall = () => {
    if (!target) return;
    void start(target, {
      flags: a.verdict.flags.map((f) => f.kind),
      patterns: a.verdict.patterns,
      place: a.place,
      amount: a.request?.amount.value ? a.request.amount : undefined,
      payee: a.request?.payee ? `${a.request.payee.name} · ${a.request.payee.bank} ${a.request.payee.accountMasked}` : undefined,
    }, { suspects: suspectsFrom(a.candidates), escalateTo });
  };

  const back = () => setScreen('verdict');
  const open = (s: Screen) => setScreen(hasEvidence(s, a.evidence) ? s : 'verdict');
  const flagScreen = (kind: SignalKind) => {
    const s = screenFor(kind);
    return hasEvidence(s, a.evidence) ? s : null;
  };

  const ev = a.evidence;
  const tab = screen === 'verdict' || screen === 'directory' ? screen : undefined;
  const detail = tab ? null : placeFor(screen);
  const where = !a.hasInput ? null : screen === 'verdict' || screen === 'directory' || screen === 'paste' || screen === 'settings' || screen === 'media' ? a.place : detail;
  const error = a.error ?? callError;
  const newCheck = () => {
    cancel();
    a.clear();
    back();
  };
  const track = useMemo(() => trackFor(a.verdict, call.state), [a.verdict, call.state]);
  const info = useCallback((name: string) => patternInfo(name, a.rules), [a.rules]);

  return (
    <>
      <DataToggle />
      {dropping && (
        <div className="drop-veil" aria-hidden="true">
          <span>Drop to check it</span>
        </div>
      )}
      <Header where={where} demo={a.mode === 'demo'} tab={tab} onTab={setScreen} onSettings={() => setScreen('settings')} />

      {error && (
        <div style={{ padding: '12px 16px 0' }}>
          <p className="error-line" role="alert">
            <span>{error}</span>
            <button onClick={() => a.setError(null)} aria-label="Dismiss">
              ✕
            </button>
          </p>
        </div>
      )}

      <TrackContext.Provider value={a.hasInput ? track : null}>
      <div key={screen} className={`screen nav-${nav.dir}`}>
      {screen === 'verdict' && (
        <Verdict
          request={a.request}
          verdict={a.verdict}
          hasInput={a.hasInput}
          busy={a.busy}
          call={call}
          targets={targets}
          targetId={targetId}
          onTarget={setTargetId}
          escalateTo={escalateTo}
          onCall={startCall}
          onCancel={cancel}
          onNewCheck={newCheck}
          onOpenFlag={flagScreen}
          onOpen={open}
          onPaste={() => setScreen('paste')}
          onFile={(f) => void a.checkFile(f)}
          media={ev.media}
          onOpenMedia={(id) => {
            setFocusMedia(id);
            setScreen('media');
          }}
          patternInfo={info}
          onVoice={IN_EXTENSION ? () => void a.checkVoice() : undefined}
          onFrame={IN_EXTENSION ? () => void a.checkFrame() : undefined}
          onSite={IN_EXTENSION ? () => void a.checkSite() : undefined}
          watch={a.watch}
          onWatch={IN_EXTENSION ? () => void a.startWatch() : undefined}
          onStopWatch={a.stopWatch}
        />
      )}
      {screen === 'directory' && <Directory people={a.directory.people} suppliers={a.directory.suppliers} />}
      {screen === 'tactics' && ev.tactics && <Tactics data={ev.tactics} onBack={back} onPaste={() => setScreen('paste')} />}
      {screen === 'email' && ev.email && <EmailLinks data={ev.email} onBack={back} onOpenInvoice={ev.invoice ? () => open('invoice') : a.emailOpen ? () => setScreen('paste') : undefined} />}
      {screen === 'invoice' && ev.invoice && <Invoice data={ev.invoice} onBack={back} onOpenKnown={ev.known ? () => open('known') : undefined} />}
      {screen === 'voice' && ev.voice && (
        <Voice data={ev.voice} busy={!!a.busy} onBack={back} onRecordAgain={a.mode === 'live' && IN_EXTENSION ? () => void a.checkVoice() : undefined} />
      )}
      {screen === 'known' && ev.known && <KnownScams data={ev.known} onBack={back} />}
      {screen === 'media' && ev.media && (
        <Media
          items={ev.media}
          busy={!!a.busy}
          focusId={focusMedia}
          onBack={back}
          onFile={(f) => void a.checkFile(f)}
          patterns={a.verdict.patterns}
          patternInfo={info}
          onChallenge={IN_EXTENSION ? () => void a.checkFrame(true) : undefined}
          onLipSync={IN_EXTENSION ? () => void a.checkLipSync() : undefined}
          onReport={(id) => void a.reportPicture(id)}
        />
      )}
      {screen === 'paste' && (
        <CheckYourself
          busy={!!a.busy}
          emailOpen={a.emailOpen}
          onBack={back}
          onText={a.checkText}
          onFile={a.checkFile}
          onAttached={a.checkAttachedInvoice}
          onVoice={a.checkVoice}
          onFrame={a.checkFrame}
          onDone={back}
        />
      )}
      {screen === 'settings' && (
        <Settings
          mode={a.mode}
          rulesVersion={a.rules.version}
          knownCount={a.knownCount}
          onBack={back}
          onClear={newCheck}
        />
      )}
      </div>
      </TrackContext.Provider>
    </>
  );
}
