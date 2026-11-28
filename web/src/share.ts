/*
 * What another app shared to FISHY (Android's share sheet). The service worker (public/sw.js) keeps
 * it in Cache Storage under a one-time key and opens the page at /?shared=<key>; this reads it once
 * and deletes it. It never leaves the phone here.
 */

const SHARES = 'fishy-shares';

export interface Shared {
  /** The first file shared (a picture, video, voice note or PDF), if any. */
  file: File | null;
  /** The message or link that came with it, as one text. */
  text: string;
}

interface Meta {
  title: string;
  text: string;
  url: string;
  files: Array<{ path: string; name: string; type: string }>;
}

/** The shared item for `key`, then deleted; null if it is gone (already opened, or older than a day). */
export async function takeShared(key: string): Promise<Shared | null> {
  if (!/^[0-9a-f-]{36}$/i.test(key) || typeof caches === 'undefined') return null;
  const cache = await caches.open(SHARES);
  const prefix = `/shared/${key}/`;
  try {
    const metaResponse = await cache.match(`${prefix}meta`);
    if (!metaResponse) return null;
    const meta = (await metaResponse.json()) as Meta;
    let file: File | null = null;
    const first = meta.files[0];
    const stored = first && (await cache.match(first.path));
    if (first && stored) file = new File([await stored.blob()], first.name, { type: first.type });
    // A shared link often comes as the text too: say it once.
    const parts = [meta.title, meta.text, meta.url].map((s) => (s ?? '').trim()).filter(Boolean);
    const text = parts.filter((p, i) => !parts.some((q, j) => j !== i && q.includes(p) && (q !== p || j < i))).join('\n');
    return { file, text };
  } finally {
    for (const r of await cache.keys()) if (new URL(r.url).pathname.startsWith(prefix)) await cache.delete(r);
  }
}

/** Takes ?shared= off the address, so a reload doesn't look for it again. */
export function forgetSharedParam() {
  const url = new URL(location.href);
  url.searchParams.delete('shared');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}
