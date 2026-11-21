import type { PageMessage } from '../lib/messages';
import { listenForBanner } from './banner';

/*
 * Reads the email the user has OPEN (never the inbox list) and sends it to the side panel.
 * TODO(day 1): confirm these selectors on the demo Gmail account; keep them in one place.
 */
const SEL = {
  subject: 'h2[data-thread-perm-id], h2.hP',
  sender: '[email].gD, span[email]',
  body: 'div.a3s',
  attachment: '[download_url], .aZo',
};

listenForBanner();

let lastKey = '';

function readOpenEmail() {
  const body = document.querySelector<HTMLElement>(SEL.body);
  if (!body) return;
  const subject = document.querySelector<HTMLElement>(SEL.subject)?.innerText ?? '';
  const from = document.querySelector<HTMLElement>(SEL.sender)?.getAttribute('email') ?? '';
  const key = `${from}|${subject}`;
  if (key === lastKey) return;
  lastKey = key;

  const attachments = [...document.querySelectorAll<HTMLElement>(SEL.attachment)]
    .map((a) => a.getAttribute('download_url')?.split(':')[1] ?? a.innerText)
    .filter(Boolean);

  const msg: PageMessage = { type: 'email_opened', from, subject, body: body.innerText, attachments };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

let timer: number | undefined;
new MutationObserver(() => {
  window.clearTimeout(timer);
  timer = window.setTimeout(readOpenEmail, 500);
}).observe(document.body, { childList: true, subtree: true });
