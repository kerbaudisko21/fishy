import { parseCaptionText, type SaidLine } from '../lib/checks/said';
import { DEFAULT_SELECTORS, watchSelectors, type PageMessage } from '../lib/messages';
import { listenForBanner } from './banner';

/*
 * Reads live Meet captions and sends new lines, with their speaker, to the side panel.
 * Meet's markup changes without notice (deck risk: "Meet pages change"), so the selectors come
 * from Remote Config via the panel, and the panel always offers "Paste text" as the fallback.
 * TODO(day 1): confirm the caption selectors on a live meeting with captions on.
 */

listenForBanner();

let selectors = DEFAULT_SELECTORS.meetCaptions;
watchSelectors((s) => (selectors = s.meetCaptions));

const sent = new Set<string>();

function findRegion(): HTMLElement | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el?.innerText.trim()) return el;
  }
  return null;
}

function sendNew(includeLast: boolean) {
  const region = findRegion();
  if (!region) return;
  // Meet rewrites the last line while someone is still speaking, so it is sent only after a pause.
  const lines = parseCaptionText(region.innerText);
  const fresh: SaidLine[] = (includeLast ? lines : lines.slice(0, -1)).filter((l) => !sent.has(`${l.speaker}|${l.text}`));
  if (!fresh.length) return;
  fresh.forEach((l) => sent.add(`${l.speaker}|${l.text}`));
  if (sent.size > 500) sent.clear();

  const msg: PageMessage = { type: 'captions', lines: fresh, at: Date.now() };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* side panel closed: nothing to do */
  });
}

let timer: number | undefined;
let pause: number | undefined;
new MutationObserver(() => {
  window.clearTimeout(timer);
  window.clearTimeout(pause);
  timer = window.setTimeout(() => sendNew(false), 800);
  // After 2.5 s of quiet the last line is final too.
  pause = window.setTimeout(() => sendNew(true), 2500);
}).observe(document.body, { childList: true, subtree: true, characterData: true });
