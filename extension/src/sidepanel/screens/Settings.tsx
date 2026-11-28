import { useEffect, useState } from 'react';
import { CHANGES } from '../../lib/changes';
import { builtWhen, COMMIT, VERSION } from '../../lib/version';
import { nanoStatus, prepareNano, type NanoStatus } from '../../lib/ai/tactics';
import { FIREBASE_READY } from '../../lib/config';
import { DetailHead, Icon, Section } from '../components';
import { currentStats, onStats, resetStats, summary } from '../../lib/ai/stats';
import { DOUBTFUL, TRUSTED, TUNE_AFTER } from '../../lib/ai/escalate';

/** Use FISHY without opening it: the shortcuts as set in Chrome, the right-click items, and automatic warnings. */
function WithoutOpening() {
  const [keys, setKeys] = useState<Array<{ name: string; description: string; shortcut: string }>>([]);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.commands) return;
    void chrome.commands.getAll().then((all) => setKeys(all.map((c) => ({ name: c.name ?? '', description: c.name === '_execute_action' ? 'Open FISHY' : (c.description ?? ''), shortcut: c.shortcut ?? '' }))));
    void Promise.all([chrome.storage.local.get('fishyAutoWarn'), chrome.permissions.contains({ origins: ['<all_urls>'] })]).then(([v, granted]) => setAuto(!!v.fishyAutoWarn && granted));
  }, []);
  const toggle = async () => {
    setNote('');
    if (auto) {
      await chrome.storage.local.set({ fishyAutoWarn: false });
      // Give the access back too: FISHY only keeps what it uses.
      await chrome.permissions.remove({ origins: ['<all_urls>'] }).catch(() => undefined);
      setAuto(false);
      return;
    }
    // Chrome asks the person here, on this click: FISHY never has this access unless they say yes.
    const granted = await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
    if (!granted) return setNote('Chrome didn’t give access, so automatic warnings stay off.');
    await chrome.storage.local.set({ fishyAutoWarn: true });
    setAuto(true);
  };
  return (
    <div className="surface card-pad">
      <span className="row-title">Keyboard shortcuts</span>
      {keys.length ? (
        <dl className="kv">
          {keys.map((k) => (
            <div key={k.name} style={{ display: 'contents' }}>
              <dt>{k.description}</dt>
              <dd>{k.shortcut ? <kbd className="key">{k.shortcut}</kbd> : <span className="row-detail">not set</span>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="row-detail">Open FISHY in Chrome to see them.</span>
      )}
      <button className="link" onClick={() => void chrome.tabs?.create({ url: 'chrome://extensions/shortcuts' })}>
        Change the shortcuts
      </button>
      <span className="row-title">Right-click</span>
      <span className="row-detail">Right-click a picture, a video, a link, selected text or the page itself and choose “Check … with FISHY”.</span>
      <button className="watch-start" role="switch" aria-checked={auto} onClick={() => void toggle()}>
        <span className="grow">
          <span className="row-title">Warn me about risky websites</span>
          <span className="row-detail">
            Checks each site you open, on this laptop: nothing is sent. Shows “!” on the FISHY icon and a banner when a site is clearly risky. Chrome asks you to allow access to all sites.
          </span>
        </span>
        <span className={`switch${auto ? ' on' : ''}`} aria-hidden="true">
          <span className="switch-thumb" />
        </span>
      </button>
      {note && <span className="row-detail" role="status">{note}</span>}
    </div>
  );
}

/** How the hybrid AI has run on this laptop: the numbers behind "on device first". */
function AiStats() {
  const [stats, setStats] = useState(currentStats);
  useEffect(() => onStats((s) => setStats({ ...s })), []);
  const t = summary(stats);
  const secs = (ms: number) => (ms ? `${(ms / 1000).toFixed(1)} s` : '–');
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const tuning =
    t.escalations < TUNE_AFTER
      ? `After ${TUNE_AFTER} second opinions FISHY starts tuning when to ask the cloud (${t.escalations} so far).`
      : t.agreement !== null && t.agreement >= TRUSTED
        ? 'Gemini Nano agrees with the cloud almost every time, so its borderline answers now stay on this laptop.'
        : t.agreement !== null && t.agreement < DOUBTFUL
          ? 'Gemini Nano often disagrees with the cloud, so more of its answers get a second opinion.'
          : 'Agreement is in between: FISHY asks the cloud when Nano can’t tell, isn’t sure, or finds a single sign.';
  return (
    <div className="surface card-pad">
      {t.answers ? (
        <>
          <dl className="kv">
            <dt>Answered on this laptop</dt>
            <dd>
              {pct(t.onDeviceShare)} ({t.cloudCallsSaved} of {t.answers})
            </dd>
            <dt>Average time</dt>
            <dd>
              Nano {secs(t.deviceAvgMs)} · cloud {secs(t.cloudAvgMs)}
            </dd>
            <dt>Second opinions</dt>
            <dd>{t.escalations ? `${t.escalations}, agreed with Nano ${pct(t.agreement ?? 0)}` : 'none yet'}</dd>
          </dl>
          <span className="row-detail">{tuning}</span>
          <button className="btn secondary small" onClick={resetStats}>
            Start counting again
          </button>
        </>
      ) : (
        <span className="row-detail">Nothing checked with Gemini yet. Counts only, kept on this laptop: no file, sign or text is stored.</span>
      )}
    </div>
  );
}

interface Props {
  mode: 'demo' | 'live';
  rulesVersion: number;
  knownCount: number;
  onBack: () => void;
  onClear: () => void;
}

const NANO_TEXT: Record<NanoStatus, { title: string; detail: string }> = {
  available: { title: 'Ready on this laptop', detail: 'Captions and emails are read by Gemini Nano. Nothing leaves the laptop.' },
  downloadable: { title: 'Not downloaded yet', detail: 'Until it is, FISHY reads with Gemini in the cloud, on redacted text only.' },
  downloading: { title: 'Downloading…', detail: 'Using Gemini in the cloud on redacted text until it finishes.' },
  unavailable: {
    title: 'Not available in this Chrome',
    detail: 'Needs desktop Chrome 139+ with chrome://flags/#prompt-api-for-gemini-nano-multimodal-input on. FISHY uses the cloud on redacted text.',
  },
};

export function Settings({ rulesVersion, knownCount, onBack, onClear }: Props) {
  const [nano, setNano] = useState<NanoStatus | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void nanoStatus().then(setNano);
  }, []);

  const download = async () => {
    setError(null);
    setProgress(0);
    try {
      await prepareNano((p) => setProgress(p));
      setNano(await nanoStatus());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <DetailHead title="Settings" kicker="How FISHY runs" badges={[]} onBack={onBack} />
      <main className="main">
        <Section title="Gemini Nano on this laptop">
        <div className="surface card-pad">
          {nano ? (
            <>
              <span className="row-title">{NANO_TEXT[nano].title}</span>
              <span className="row-detail">{NANO_TEXT[nano].detail}</span>
            </>
          ) : (
            <span className="row-detail">Checking…</span>
          )}
          {progress !== null && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {(nano === 'downloadable' || nano === 'downloading') && FIREBASE_READY && progress === null && (
            <button className="btn secondary small" onClick={download}>
              {Icon.upload(15)}
              Download Gemini Nano
            </button>
          )}
          {error && <p className="error-line">{error}</p>}
        </div>
        </Section>

        <Section title="Connection">
        <div className="surface card-pad">
          <dl className="kv">
            <dt>Firebase</dt>
            <dd>{FIREBASE_READY ? 'Connected' : 'Not set up (offline)'}</dd>
            <dt>Tactic reader</dt>
            <dd>{FIREBASE_READY ? 'Gemini (hybrid)' : 'Keywords (offline)'}</dd>
            <dt>Scam rules</dt>
            <dd>v{rulesVersion}</dd>
            <dt>Known bad details</dt>
            <dd>{knownCount}</dd>
          </dl>
        </div>
        </Section>

        <Section title="This check">
        <div className="surface card-pad">
          <span className="row-detail">Clears what was checked in this window and starts over.</span>
          <button className="btn secondary small" onClick={onClear}>
            Clear this check
          </button>
        </div>
        </Section>

        <Section title="Without opening FISHY">
          <WithoutOpening />
        </Section>

        <Section title="How the AI ran">
          <AiStats />
        </Section>

        <Section title="About">
          <div className="surface card-pad">
            <span className="row-title">FISHY {`v${VERSION}`}</span>
            <span className="row-detail">
              Build <span className="mono">{COMMIT}</span>, {builtWhen()}
            </span>
          </div>
        </Section>

        <Section title="What’s new" aside={CHANGES[0].version === VERSION ? `in v${VERSION}` : `latest notes: v${CHANGES[0].version}`}>
          <details className="surface card-pad changes-fold">
            <summary>
              {CHANGES[0].items.length} changes in this version
            </summary>
            <ul className="changes">
              {CHANGES[0].items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <span className="row-detail">Every version is listed in CHANGELOG.md.</span>
          </details>
        </Section>
      </main>
    </>
  );
}
