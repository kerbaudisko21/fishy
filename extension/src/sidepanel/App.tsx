import { useEffect, useMemo, useState } from 'react';
import { DEMO_DIRECTORY, DEMO_REQUEST, DEMO_SIGNALS } from '../demo/fixtures';
import { decide } from '../lib/rules/engine';
import { isPageMessage, type BannerState, type PanelMessage } from '../lib/messages';
import type { CallState, Signal } from '../lib/types';
import { Header } from './components';
import { DETAIL, type Screen } from './routes';
import { Detail } from './screens/Detail';
import { Directory } from './screens/Directory';
import { Verdict } from './screens/Verdict';

const DEMO = import.meta.env.VITE_DEMO_MODE !== 'false';

async function sendBanner(state: BannerState, title: string, line: string) {
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

  // Live pages: captions and opened emails arrive here from the content scripts.
  useEffect(() => {
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

  const startCall = () => {
    setCall('ringing');
    if (DEMO) {
      // Demo only: the real flow is the startVerificationCall Cloud Function + Twilio, reported back via Firestore.
      window.setTimeout(() => setCall('not_me'), 3000);
    }
  };

  return (
    <>
      <Header live={DEMO ? 'Demo' : 'Meet · live'} />
      <nav className="tabs" aria-label="Panel">
        <button className="tab" aria-current={screen !== 'directory' ? 'page' : undefined} onClick={() => setScreen('verdict')}>
          Check
        </button>
        <button className="tab" aria-current={screen === 'directory' ? 'page' : undefined} onClick={() => setScreen('directory')}>
          Directory
        </button>
      </nav>

      {screen === 'verdict' && (
        <Verdict
          request={DEMO_REQUEST}
          verdict={verdict}
          call={call}
          onCall={startCall}
          onPaste={() => {
            /* TODO: paste-text sheet (fallback when captions cannot be read) */
          }}
          onOpen={setScreen}
        />
      )}
      {screen === 'directory' && <Directory people={DEMO_DIRECTORY} />}
      {screen !== 'verdict' && screen !== 'directory' && (
        <Detail title={DETAIL[screen].title} step={DETAIL[screen].step} onBack={() => setScreen('verdict')} />
      )}
    </>
  );
}
