// Messages between the content scripts (Meet, Gmail) and the side panel.
// Content scripts never call AI or Firebase: they only read the page and draw the banner.

export type BannerState = 'hidden' | 'amber' | 'red' | 'confirmed';

export type PageMessage =
  | { type: 'captions'; tabId?: number; speaker: string; text: string; at: number }
  | { type: 'email_opened'; tabId?: number; from: string; name: string; subject: string; body: string; attachments: string[] };

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
