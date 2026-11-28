import { useEffect, useState } from 'react';
import { NANO_IMAGE } from '../lib/ai/prompts';
import { nanoStatus, type NanoStatus } from '../lib/ai/tactics';
import { FIREBASE_READY } from '../lib/config';

/*
 * Where the AI runs right now, always in view: Gemini Nano on this laptop, the cloud, or neither.
 * It checks the picture-capable model (what FISHY needs), and whether the laptop is online.
 */

export interface AiState {
  nano: NanoStatus;
  online: boolean;
  cloud: boolean;
}

export function useAiStatus(): AiState {
  const [nano, setNano] = useState<NanoStatus>('unavailable');
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    let alive = true;
    const check = () => void nanoStatus(NANO_IMAGE).then((s) => alive && setNano(s));
    check();
    const timer = window.setInterval(check, 30_000);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return { nano, online, cloud: FIREBASE_READY };
}

/** The words and colour for a state. Pure, so it can be tested. */
export function aiLabel({ nano, online, cloud }: AiState): { text: string; tone: 'device' | 'cloud' | 'none' | 'wait'; title: string } {
  const ready = nano === 'available';
  const cloudOk = cloud && online;
  if (ready && !online) return { text: 'Offline · Gemini Nano', tone: 'device', title: 'No internet: Gemini Nano checks pictures, video and websites on this laptop. Voice and second opinions need the cloud.' };
  if (ready) return { text: cloudOk ? 'Gemini Nano + cloud' : 'Gemini Nano', tone: 'device', title: 'Gemini Nano runs on this laptop first; the cloud is asked only when it isn’t sure, and for voice.' };
  if (nano === 'downloading' || nano === 'downloadable') return { text: cloudOk ? 'Nano getting ready · cloud' : 'Nano getting ready', tone: 'wait', title: 'Chrome is preparing Gemini Nano. Until then, Gemini in the cloud answers.' };
  if (cloudOk) return { text: 'Cloud only', tone: 'cloud', title: 'Gemini Nano isn’t available in this Chrome, so Gemini in the cloud answers.' };
  return { text: online ? 'Laptop checks only' : 'Offline · laptop checks', tone: 'none', title: 'No Gemini right now: FISHY’s own measurements still run on this laptop.' };
}

export function AiChip() {
  const state = useAiStatus();
  const { text, tone, title } = aiLabel(state);
  return (
    <span className={`ai-chip ${tone}`} title={title} role="status" aria-label={`AI: ${text}. ${title}`}>
      <span className="ai-dot" aria-hidden="true" />
      {text}
    </span>
  );
}
