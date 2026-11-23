import { useEffect, useState } from 'react';
import { builtWhen, COMMIT, VERSION } from '../../lib/version';
import { nanoStatus, prepareNano, type NanoStatus } from '../../lib/ai/tactics';
import { FIREBASE_READY } from '../../lib/config';
import { DetailHead, Icon, Section } from '../components';

interface Props {
  mode: 'demo' | 'live';
  rulesVersion: number;
  knownCount: number;
  onBack: () => void;
  onDemo: () => void;
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

export function Settings({ mode, rulesVersion, knownCount, onBack, onDemo, onClear }: Props) {
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

        <Section title="Demo">
        <div className="surface card-pad">
          <span className="row-detail">
            {mode === 'demo' ? 'Showing the synthetic Kalindra Group case.' : 'Showing live checks from this browser.'}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn secondary small" onClick={onDemo}>
              Load the demo case
            </button>
            <button className="btn secondary small" onClick={onClear}>
              Clear this check
            </button>
          </div>
        </div>
        </Section>

        <Section title="About">
          <div className="surface card-pad">
            <span className="row-title">FISHY {`v${VERSION}`}</span>
            <span className="row-detail">
              Build <span className="mono">{COMMIT}</span>, {builtWhen()}
            </span>
          </div>
        </Section>
      </main>
    </>
  );
}
