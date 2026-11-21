// Messages between the content scripts (Meet, Gmail) and the side panel.
// Content scripts never call AI or Firebase: they only read the page and draw the banner.
import type { SenderAuth } from './checks/email';
import type { SaidLine } from './checks/said';

export type BannerState = 'hidden' | 'amber' | 'red' | 'confirmed';

export type PageMessage =
  | { type: 'captions'; lines: SaidLine[]; at: number }
  | { type: 'email_opened'; from: string; name: string; subject: string; body: string; attachments: string[]; auth?: SenderAuth };

/** Page selectors, pushed from Remote Config so a Meet or Gmail change is fixed without a release. */
export interface PageSelectors {
  meetCaptions: string[];
  gmail: { subject: string; sender: string; body: string; attachment: string; message: string };
}

export const DEFAULT_SELECTORS: PageSelectors = {
  meetCaptions: ['[role="region"][aria-label*="aption"]', '[aria-live="polite"]'],
  gmail: {
    subject: 'h2[data-thread-perm-id], h2.hP',
    sender: 'span.gD[email], span[email]',
    body: 'div.a3s',
    attachment: '[download_url]',
    message: '[data-legacy-message-id]',
  },
};

export const SELECTORS_KEY = 'pageSelectors';

/** Content scripts: current selectors, updated live when the panel stores new ones. */
export function watchSelectors(onChange: (s: PageSelectors) => void) {
  const apply = (v?: Partial<PageSelectors>) =>
    onChange({ meetCaptions: v?.meetCaptions?.length ? v.meetCaptions : DEFAULT_SELECTORS.meetCaptions, gmail: { ...DEFAULT_SELECTORS.gmail, ...v?.gmail } });
  apply();
  chrome.storage.local
    .get(SELECTORS_KEY)
    .then((r) => apply(r[SELECTORS_KEY] as Partial<PageSelectors> | undefined))
    .catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[SELECTORS_KEY]) apply(changes[SELECTORS_KEY].newValue as Partial<PageSelectors> | undefined);
  });
}

export type PanelMessage =
  | { type: 'banner'; state: BannerState; title: string; line: string }
  /** Asks the Gmail tab for the open email's first PDF attachment (only when the user clicks). */
  | { type: 'fetch_attachment' };

export type AttachmentReply = { ok: true; name: string; base64: string } | { ok: false; error: string };

export function isPageMessage(m: unknown): m is PageMessage {
  return !!m && typeof m === 'object' && ['captions', 'email_opened'].includes((m as { type: string }).type);
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
