import { useEffect, useMemo, useState } from 'react';
import { DEMO_DIRECTORY, DEMO_EVIDENCE, DEMO_REQUEST, DEMO_SIGNALS } from '../demo/fixtures';
import { decide } from '../lib/rules/engine';
import { isPageMessage, type BannerState, type PanelMessage } from '../lib/messages';
import type { CallState, Signal } from '../lib/types';
import { Header } from './components';
import { placeFor, type Screen } from './routes';
import { Directory } from './screens/Directory';
import { EmailLinks } from './screens/EmailLinks';
import { Invoice } from './screens/Invoice';
import { KnownScams } from './screens/KnownScams';
import { Tactics } from './screens/Tactics';
import { Verdict } from './screens/Verdict';
import { Voice } from './screens/Voice';

const DEMO = import.meta.env.VITE_DEMO_MODE !== 'false';
/** False when the panel is opened as a plain web page (design preview), where chrome.* APIs do not exist. */
const IN_EXTENSION = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

async function sendBanner(state: BannerState, title: string, line: string) {
  if (!IN_EXTENSION) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return;
  const msg: PanelMessage = { type: 'banner', state, title, line };
  chrome.tabs.sendMessage(tab.id, msg).catch(() => {
    /* not a Meet or Gmail tab */
  });
}

export function App() {
  const [screen, setScreen] = useState<Screen>('verdict');
  const [signals] = useState<Signal[]>(DEMO ? DEMO_SIGNALS : []);
  const [call, setCall] = useState<CallState>('idle');
  const verdict = useMemo(() => decide(signals), [signals]);
  const evidence = DEMO_EVIDENCE; // TODO: build from live checks once Steps 1–3 are wired.

  // Live pages: captions and opened emails arrive here from the content scripts.
  useEffect(() => {
    if (!IN_EXTENSION) return;
    const onMessage = (msg: unknown) => {
      if (!isPageMessage(msg)) return;
      // TODO: Step 1 → readTactics(msg.text) (src/lib/ai/tactics.ts), Step 2 checks, Step 3 local lists,
      // then add the resulting signals. Kept out of the demo build until Firebase is configured.
      console.debug('[FISHY] page message', msg.type);
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

  // Keep the in-page banner in step with the panel.
  useEffect(() => {
    const first = DEMO_REQUEST.askedBy.name.split(' ')[0];
    if (call === 'not_me') void sendBanner('red', 'Not verified. Do not pay.', `The real ${first} pressed 2.`);
    else if (call === 'confirmed') void sendBanner('confirmed', `${first} confirmed by phone.`, 'Pay through the normal approval.');
    else if (verdict.level === 'fishy') void sendBanner('amber', `Something’s fishy: ${verdict.flags.length} red flags`, 'Hold the payment.');
  }, [call, verdict]);

  // A new screen starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  const startCall = () => {
    setCall('ringing');
    if (DEMO) {
      // Demo only: the real flow is the startVerificationCall Cloud Function + Twilio, reported back via Firestore.
      window.setTimeout(() => setCall('not_me'), 3000);
    }
  };

  const back = () => setScreen('verdict');
  const paste = () => {
    /* TODO: paste-text sheet (fallback when captions cannot be read) */
  };
  const isDetail = screen !== 'verdict' && screen !== 'directory';
  const gmail = placeFor(screen) === 'gmail';
  const live = `${DEMO ? 'Demo · ' : ''}${gmail ? 'Gmail · opened' : 'Meet · live'}`;

  return (
    <>
      <Header live={live} dot={!gmail} />
      {!isDetail && (
        <nav className="tabs" aria-label="Panel">
          <button className="tab" aria-current={screen === 'verdict' ? 'page' : undefined} onClick={() => setScreen('verdict')}>
            Check
          </button>
          <button className="tab" aria-current={screen === 'directory' ? 'page' : undefined} onClick={() => setScreen('directory')}>
            Directory
          </button>
        </nav>
      )}

      {screen === 'verdict' && (
        <Verdict request={DEMO_REQUEST} verdict={verdict} call={call} onCall={startCall} onPaste={paste} onOpen={setScreen} />
      )}
      {screen === 'directory' && <Directory people={DEMO_DIRECTORY} />}
      {screen === 'tactics' && <Tactics data={evidence.tactics} onBack={back} onPaste={paste} />}
      {screen === 'email' && <EmailLinks data={evidence.email} onBack={back} onOpenInvoice={() => setScreen('invoice')} />}
      {screen === 'invoice' && <Invoice data={evidence.invoice} onBack={back} onOpenKnown={() => setScreen('known')} />}
      {screen === 'voice' && (
        <Voice
          data={evidence.voice}
          onBack={back}
          onCheckFace={() => {
            /* TODO (P1): send frames to the face-check Cloud Function, on click only */
          }}
        />
      )}
      {screen === 'known' && <KnownScams data={evidence.known} onBack={back} />}
    </>
  );
}
