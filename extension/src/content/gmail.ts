import { parseHeaders, type SenderAuth } from '../lib/checks/email';
import { bufferToBase64, DEFAULT_SELECTORS, watchSelectors, type AttachmentReply, type PageMessage, type PanelMessage } from '../lib/messages';
import { listenForBanner } from './banner';

/*
 * Reads the email the user has OPEN (never the inbox list) and sends it to the side panel,
 * with the sender authentication from that email's own headers.
 * An email that was open before FISHY was opened is read again when the panel asks ("read_page").
 * PDF attachments are fetched only when the panel asks, after the user clicks.
 * TODO(day 1): confirm the selectors on the demo Gmail account (they can be changed in Remote Config).
 */

listenForBanner();

let SEL = DEFAULT_SELECTORS.gmail;
watchSelectors((s) => (SEL = s.gmail));

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

/**
 * The opened message's headers, from Gmail's "Show original" view (same origin, the user's session).
 * Only Authentication-Results and Reply-To are kept; nothing leaves the laptop.
 */
async function senderAuth(): Promise<SenderAuth | undefined> {
  const legacyId = [...document.querySelectorAll<HTMLElement>(SEL.message)].pop()?.getAttribute('data-legacy-message-id');
  if (!legacyId || !/^[0-9a-f]+$/i.test(legacyId)) return undefined;
  const account = /\/mail\/u\/(\d+)/.exec(location.pathname)?.[1] ?? '0';
  const url = `${location.origin}/mail/u/${account}/?view=om&permmsgid=msg-f:${BigInt(`0x${legacyId}`).toString()}`;
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { credentials: 'include', signal: ctrl.signal });
    window.clearTimeout(t);
    if (!res.ok) return undefined;
    const html = await res.text();
    // The raw message sits in a <pre>; take the text, not the page around it.
    const raw = new DOMParser().parseFromString(html, 'text/html').querySelector('pre')?.textContent ?? '';
    return raw ? parseHeaders(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function readOpenEmail() {
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

  const msg: PageMessage = {
    type: 'email_opened',
    from,
    name,
    subject,
    body: body.innerText,
    attachments: attachments().map((a) => a.name),
    auth: await senderAuth(),
  };
  chrome.runtime.sendMessage(msg).catch(() => {
    /* side panel closed */
  });
}

let timer: number | undefined;
new MutationObserver(() => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void readOpenEmail(), 500);
}).observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg: PanelMessage, _sender, reply: (r: AttachmentReply) => void) => {
  if (msg?.type === 'read_page') {
    // FISHY was opened after this email: forget that it was sent, and send it again.
    lastKey = '';
    void readOpenEmail();
    return;
  }
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
