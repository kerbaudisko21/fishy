import { useEffect, useState } from 'react';

/*
 * One short line on how to get FISHY on a phone. Android: install it, then share from WhatsApp
 * (the installed app appears in the share sheet). iPhone: Safari has no share target, so add it to
 * the Home Screen and choose the file in FISHY. Hidden once FISHY runs installed.
 */

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const android = () => /Android/.test(navigator.userAgent);

export function InstallHint() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(standalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    addEventListener('beforeinstallprompt', onPrompt);
    addEventListener('appinstalled', onInstalled);
    return () => {
      removeEventListener('beforeinstallprompt', onPrompt);
      removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (ios()) {
    return (
      <p className="install">
        <span>
          On iPhone: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>. Then choose a file in FISHY.
        </span>
      </p>
    );
  }
  if (!prompt && !android()) return null;
  return (
    <p className="install">
      <span>On Android: install FISHY, then share from WhatsApp.</span>
      {prompt && (
        <button
          className="btn install-btn"
          onClick={async () => {
            // The prompt can be shown once: either way, the button goes.
            await prompt.prompt();
            await prompt.userChoice;
            setPrompt(null);
          }}
        >
          Install
        </button>
      )}
    </p>
  );
}
