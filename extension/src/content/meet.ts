import type { PageMessage } from '../lib/messages';
import { listenForBanner } from './banner';

/*
 * Reads live Meet captions and sends new lines to the side panel.
 * Meet's markup changes without notice (deck risk: "Meet pages change"), so:
 *  - selectors live in one list, to move to Remote Config later;
 *  - the side panel always offers "Paste text" as the fallback.
 * TODO(day 1): confirm the caption selectors on a live meeting with captions on.
 */
const CAPTION_REGION_SELECTORS = ['[role="region"][aria-label*="aption"]', '[aria-live="polite"]'];

listenForBanner();

let lastSent = '';

function findRegion(): Element | null {
  for (const sel of CAPTION_REGION_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function send(text: string) {
  const clean = text.trim();
  if (!clean || clean === lastSent) return;
  lastSent = clean;
  // Speaker attribution is a TODO; the panel shows the meeting's other participant for now.
  const msg: PageMessage = { type: 'captions', speaker: '', text: clean, at: Date.now() };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* side panel closed: nothing to do */
  });
}

let timer: number | undefined;
const observer = new MutationObserver(() => {
  const region = findRegion();
  if (!region) return;
  window.clearTimeout(timer);
  // Wait for the speaker to finish a phrase before sending.
  timer = window.setTimeout(() => send((region as HTMLElement).innerText), 800);
});

observer.observe(document.body, { childList: true, subtree: true, characterData: true });
