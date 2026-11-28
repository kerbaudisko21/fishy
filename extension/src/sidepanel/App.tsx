import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { patternInfo } from '../lib/rules/engine';
import { validJob } from '../lib/jobs';
import { IN_EXTENSION } from '../lib/config';
import type { Evidence, SignalKind } from '../lib/types';
import { Header, TrackContext, trackFor } from './components';
import { DataToggle } from './DataToggle';
import { useWindowDrop } from './scanner';
import { placeFor, screenFor, type Screen } from './routes';
import { CheckYourself } from './screens/CheckYourself';
import { ScamGuide } from './screens/ScamGuide';
import { EmailLinks } from './screens/EmailLinks';
import { Invoice } from './screens/Invoice';
import { KnownScams } from './screens/KnownScams';
import { Media } from './screens/Media';
import { Settings } from './screens/Settings';
import { Tactics } from './screens/Tactics';
import { Verdict } from './screens/Verdict';
import { Voice } from './screens/Voice';
import { useAnalysis } from './useAnalysis';

/** A screen opens only when its evidence exists. */
function hasEvidence(screen: Screen, ev: Evidence) {
  const key = ({ tactics: 'tactics', email: 'email', invoice: 'invoice', voice: 'voice', media: 'media', known: 'known' } as const)[screen as 'tactics'];
  return !key || !!ev[key];
}

/** Check is home, the scam guide sits beside it, everything else opens on top. */
const DEPTH = (s: Screen) => (s === 'verdict' ? 0 : s === 'directory' ? 1 : 2);

export function App() {
  const a = useAnalysis();
  // The screen and which way the user moved, so the new screen slides in from the right side.
  const [nav, setNav] = useState<{ screen: Screen; dir: 'none' | 'fwd' | 'back' }>({ screen: 'verdict', dir: 'none' });
  const screen = nav.screen;
  const setScreen = (s: Screen) =>
    setNav((n) => (s === n.screen ? n : { screen: s, dir: DEPTH(s) >= DEPTH(n.screen) ? 'fwd' : 'back' }));

  // Work from outside the panel: a keyboard shortcut, a right-click item or a banner's "See why".
  const { checkPagePicture, checkSite, checkFrame, checkVoice, checkLink, checkText } = a;
  useEffect(() => {
    if (!IN_EXTENSION || !chrome.storage?.session) return;
    const take = (v: unknown) => {
      const job = validJob(v);
      if (!job) return;
      void chrome.storage.session.remove('fishyJob');
      if (job.kind === 'picture') void checkPagePicture(job);
      if (job.kind === 'site') void checkSite();
      if (job.kind === 'face') void checkFrame();
      if (job.kind === 'voice') void checkVoice();
      if (job.kind === 'link') void checkLink(job.url);
      if (job.kind === 'text') {
        void checkText(job.text);
        setScreen('verdict');
      }
    };
    void chrome.storage.session.get('fishyJob').then((v) => take(v.fishyJob));
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.fishyJob?.newValue) take(changes.fishyJob.newValue);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkPagePicture, checkSite, checkFrame, checkVoice, checkLink, checkText]);

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

  const back = () => setScreen('verdict');
  const open = (s: Screen) => setScreen(hasEvidence(s, a.evidence) ? s : 'verdict');
  const flagScreen = (kind: SignalKind) => {
    const s = screenFor(kind);
    return hasEvidence(s, a.evidence) ? s : null;
  };

  const ev = a.evidence;
  const tab = screen === 'verdict' || screen === 'directory' ? screen : undefined;
  const detail = tab ? null : placeFor(screen);
  const where = !a.hasInput || a.place !== 'paste' ? null : screen === 'verdict' || screen === 'paste' ? a.place : detail;
  const error = a.error;
  const newCheck = () => {
    a.clear();
    back();
  };
  const track = useMemo(() => trackFor(a.verdict, 'idle'), [a.verdict]);
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
          verdict={a.verdict}
          hasInput={a.hasInput}
          readerFailed={a.readerFailed}
          busy={a.busy}
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
      {screen === 'directory' && <ScamGuide seen={a.verdict.patterns} />}
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
