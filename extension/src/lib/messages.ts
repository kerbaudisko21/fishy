// Messages between the content scripts (Meet, Gmail) and the side panel.
// Content scripts never call AI or Firebase: they only read the page and draw the banner.

export type BannerState = 'hidden' | 'amber' | 'red' | 'confirmed';

export type PageMessage =
  | { type: 'captions'; tabId?: number; speaker: string; text: string; at: number }
  | { type: 'email_opened'; tabId?: number; from: string; subject: string; body: string; attachments: string[] };

export type PanelMessage = { type: 'banner'; state: BannerState; title: string; line: string };

export function isPageMessage(m: unknown): m is PageMessage {
  return !!m && typeof m === 'object' && ['captions', 'email_opened'].includes((m as { type: string }).type);
}
