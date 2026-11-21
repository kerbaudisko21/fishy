import { bufferToBase64, type AttachmentReply, type PageMessage, type PanelMessage } from '../lib/messages';
import { listenForBanner } from './banner';

/*
 * Reads the email the user has OPEN (never the inbox list) and sends it to the side panel.
 * PDF attachments are fetched only when the panel asks, after the user clicks.
 * TODO(day 1): confirm these selectors on the demo Gmail account; keep them in one place.
 */
const SEL = {
  subject: 'h2[data-thread-perm-id], h2.hP',
  sender: 'span.gD[email], span[email]',
  body: 'div.a3s',
  attachment: '[download_url]',
};

listenForBanner();

let lastKey = '';

/** Gmail's download_url attribute: "application/pdf:INV.pdf:https://mail.google.com/…" */
function attachments() {
  return [...document.querySelectorAll<HTMLElement>(SEL.attachment)]
    .map((a) => {
      const raw = a.getAttribute('download_url') ?? '';
      const [type, name, ...rest] = raw.split(':');
      return { type, name, url: rest.join(':') };
    })
    .filter((a) => a.name && a.url.startsWith('https://mail.google.com/'));
}

function readOpenEmail() {
  const bodies = document.querySelectorAll<HTMLElement>(SEL.body);
  const body = bodies[bodies.length - 1]; // the newest message in the thread
  if (!body) return;
  const subject = document.querySelector<HTMLElement>(SEL.subject)?.innerText ?? '';
  const senderEl = [...document.querySelectorAll<HTMLElement>(SEL.sender)].pop();
  const from = senderEl?.getAttribute('email') ?? '';
  const name = senderEl?.getAttribute('name') ?? senderEl?.innerText ?? '';
  const key = `${from}|${subject}|${body.innerText.length}`;
  if (!from || key === lastKey) return;
  lastKey = key;

  const msg: PageMessage = { type: 'email_opened', from, name, subject, body: body.innerText, attachments: attachments().map((a) => a.name) };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* side panel closed */
  });
}

let timer: number | undefined;
new MutationObserver(() => {
  window.clearTimeout(timer);
  timer = window.setTimeout(readOpenEmail, 500);
}).observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg: PanelMessage, _sender, reply: (r: AttachmentReply) => void) => {
  if (msg?.type !== 'fetch_attachment') return;
  const pdf = attachments().find((a) => a.type === 'application/pdf' || /\.pdf$/i.test(a.name));
  if (!pdf) {
    reply({ ok: false, error: 'This email has no PDF attachment.' });
    return;
  }
  // Same-origin fetch with the user's Gmail session; the file goes to the side panel only.
  fetch(pdf.url, { credentials: 'include' })
    .then((r) => {
      if (!r.ok) throw new Error(`Gmail answered ${r.status}`);
      return r.arrayBuffer();
    })
    .then((buf) => reply({ ok: true, name: pdf.name, base64: bufferToBase64(buf) }))
    .catch((e: Error) => reply({ ok: false, error: `Could not read the attachment: ${e.message}` }));
  return true; // keep the channel open for the async reply
});
