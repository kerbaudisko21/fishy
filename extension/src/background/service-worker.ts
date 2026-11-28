// The toolbar icon opens FISHY as a floating window on top of the page (content/overlay.ts),
// instead of a side panel that squeezes the page. Clicking it again closes the window.
// Clicking the icon, a keyboard shortcut or a right-click item grants activeTab for that tab,
// which is what lets FISHY read the page or capture the call there. The side panel stays
// available from Chrome's side panel menu.
import overlayScript from '../content/overlay.ts?script';
import { readPage, siteLab, type PageFacts } from '../lib/checks/site';
import { scoreMedia } from '../lib/media-score';
import type { FishyJob } from '../lib/jobs';

const MENU: chrome.contextMenus.CreateProperties[] = [
  { id: 'fishy-check-picture', title: 'Check this picture with FISHY', contexts: ['image'] },
  { id: 'fishy-check-video', title: 'Check this video’s face with FISHY', contexts: ['video'] },
  { id: 'fishy-check-link', title: 'Check this link with FISHY (without opening it)', contexts: ['link'] },
  { id: 'fishy-check-text', title: 'Check this message with FISHY', contexts: ['selection'] },
  { id: 'fishy-check-page', title: 'Check this website with FISHY', contexts: ['page'] },
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
  // Right-click anything to check it, without opening FISHY first.
  chrome.contextMenus.removeAll(() => {
    for (const m of MENU) chrome.contextMenus.create(m, () => void chrome.runtime.lastError);
  });
});

/** Hands a job to the panel (it picks it up when it opens, or straight away) and opens the window. */
async function run(job: FishyJob) {
  await chrome.storage.session.set({ fishyJob: job });
  await showOverlay(job.tabId, { keepOpen: true });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id === undefined) return;
  const base = { tabId: tab.id, pageUrl: info.pageUrl, at: Date.now() };
  if (info.menuItemId === 'fishy-check-picture' && info.srcUrl) void run({ ...base, kind: 'picture', src: info.srcUrl });
  if (info.menuItemId === 'fishy-check-video') void run({ ...base, kind: 'face' });
  if (info.menuItemId === 'fishy-check-link' && info.linkUrl) void run({ ...base, kind: 'link', url: info.linkUrl.slice(0, 2048) });
  if (info.menuItemId === 'fishy-check-text' && info.selectionText) void run({ ...base, kind: 'text', text: info.selectionText.slice(0, 5000) });
  if (info.menuItemId === 'fishy-check-page') void run({ ...base, kind: 'site' });
});

// Keyboard shortcuts (chrome://extensions/shortcuts to change them). _execute_action opens FISHY.
chrome.commands.onCommand.addListener((command, tab) => {
  if (tab?.id === undefined) return;
  const base = { tabId: tab.id, pageUrl: tab.url, at: Date.now() };
  if (command === 'check-website') void run({ ...base, kind: 'site' });
  if (command === 'check-face') void run({ ...base, kind: 'face' });
  if (command === 'check-voice') void run({ ...base, kind: 'voice' });
});

async function showOverlay(tabId: number, { keepOpen = false } = {}) {
  try {
    // Running the overlay script toggles the window; from a shortcut or a menu it must only open it.
    if (keepOpen) {
      const [open] = await chrome.scripting.executeScript({ target: { tabId }, func: () => !!document.getElementById('fishy-overlay-host') });
      if (open?.result) return;
    }
    await chrome.scripting.executeScript({ target: { tabId }, files: [overlayScript] });
  } catch (e) {
    // Chrome pages and the Web Store can't be scripted: fall back to the side panel there.
    console.warn('[FISHY] floating window unavailable here, opening the side panel', e);
    await chrome.sidePanel.open({ tabId }).catch(console.warn);
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) void showOverlay(tab.id);
});

// "See why" on an in-page banner opens the floating window on that tab (and checks the website).
chrome.runtime.onMessage.addListener((msg: { type?: string }, sender) => {
  if (sender.tab?.id === undefined) return;
  if (msg?.type === 'open_panel') void showOverlay(sender.tab.id);
  if (msg?.type === 'check_site') void run({ kind: 'site', tabId: sender.tab.id, pageUrl: sender.tab.url, at: Date.now() });
});

/* ---------- Automatic warnings: opt-in, on the laptop only ---------- */

/*
 * When the person switches on "Warn me about risky websites" (Settings), Chrome grants FISHY
 * access to all sites. Each page that finishes loading is then checked on the laptop with the
 * website check's address and page tests: nothing is sent anywhere. The toolbar icon shows "!"
 * on a clearly risky site and "?" on a doubtful one; a clearly risky site also gets a banner.
 */
const AUTO_KEY = 'fishyAutoWarn';
const SUPPLIERS_KEY = 'fishySuppliers';
const DISMISSED_KEY = 'fishyDismissed';

async function autoWarnOn(): Promise<boolean> {
  const { [AUTO_KEY]: on } = await chrome.storage.local.get(AUTO_KEY);
  return !!on && (await chrome.permissions.contains({ origins: ['<all_urls>'] }));
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status !== 'complete' || !tab.url || !/^https?:/.test(tab.url)) return;
  void warnIfRisky(tabId, tab.url);
});

async function warnIfRisky(tabId: number, url: string) {
  if (!(await autoWarnOn())) return;
  let page: PageFacts | undefined;
  try {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: readPage });
    page = r?.result as PageFacts | undefined;
  } catch {
    return; // a page FISHY may not read (the Web Store, a PDF viewer…)
  }
  if (!page?.host) return;
  const { [SUPPLIERS_KEY]: suppliers = [] } = await chrome.storage.local.get(SUPPLIERS_KEY);
  const lab = siteLab(page, suppliers as Array<{ name: string; domain: string }>);
  const score = scoreMedia({ id: 'auto', kind: 'site', name: page.host, at: '', checks: [], gemini: null, forensics: { hints: lab.hints, rows: lab.rows } });
  const band = score.score === null ? 'low' : score.band;
  await chrome.action.setBadgeText({ tabId, text: band === 'high' ? '!' : band === 'some' ? '?' : '' });
  if (band !== 'low') await chrome.action.setBadgeBackgroundColor({ tabId, color: band === 'high' ? '#cf2419' : '#8a4b00' });
  await chrome.action.setTitle({ tabId, title: band === 'low' ? 'FISHY' : `FISHY: ${lab.hints[0]?.text ?? 'this site has signs of a scam'}` });
  if (band !== 'high') return;
  const { [DISMISSED_KEY]: dismissed = [] } = await chrome.storage.session.get(DISMISSED_KEY);
  if ((dismissed as string[]).includes(page.host)) return;
  await chrome.scripting
    .executeScript({ target: { tabId }, func: showSiteWarning, args: [lab.hints[0]?.text ?? 'This site has signs of a scam.', page.host] })
    .catch(() => undefined);
  void url;
}

// "Not now" on the banner: don't show it again for this site in this browser session.
chrome.runtime.onMessage.addListener((msg: { type?: string; host?: string }) => {
  if (msg?.type !== 'dismiss_site' || typeof msg.host !== 'string') return;
  void chrome.storage.session.get(DISMISSED_KEY).then(({ [DISMISSED_KEY]: d = [] }) => chrome.storage.session.set({ [DISMISSED_KEY]: [...(d as string[]), msg.host!.slice(0, 253)] }));
});

/** Runs inside the page: a small banner in a closed Shadow DOM. Self-contained (it is serialised). */
function showSiteWarning(reason: string, host: string) {
  if (document.getElementById('fishy-site-warning')) return;
  const el = document.createElement('div');
  el.id = 'fishy-site-warning';
  const root = el.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `:host{all:initial}
.bar{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(640px,calc(100vw - 32px));display:flex;gap:12px;align-items:center;padding:12px 12px 12px 14px;border-radius:6px;background:#cf2419;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 12px 32px rgba(20,20,20,.25)}
.mark{flex:none;width:34px;height:34px;border-radius:10px;background:#141414;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}
.text{flex:1;min-width:0}.title{font-weight:700;font-size:15px}.line{opacity:.92;font-size:13px}
button{flex:none;height:40px;padding:0 14px;border-radius:10px;border:0;font:600 13px system-ui,sans-serif;cursor:pointer}
.why{background:#fff;color:#141414}.later{background:transparent;color:#fff;text-decoration:underline}
button:focus-visible{outline:2px solid #fff;outline-offset:2px}`;
  const bar = document.createElement('div');
  bar.className = 'bar';
  bar.setAttribute('role', 'alert');
  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.textContent = '!';
  mark.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'text';
  const t = document.createElement('div');
  t.className = 'title';
  t.textContent = 'FISHY: careful, this site looks risky';
  const l = document.createElement('div');
  l.className = 'line';
  l.textContent = `${reason} Don’t log in, pay or type anything here yet.`;
  text.append(t, l);
  const why = document.createElement('button');
  why.className = 'why';
  why.textContent = 'See why';
  why.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'check_site' });
    el.remove();
  });
  const later = document.createElement('button');
  later.className = 'later';
  later.textContent = 'Not now';
  later.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'dismiss_site', host });
    el.remove();
  });
  bar.append(mark, text, why, later);
  root.append(style, bar);
  document.documentElement.append(el);
}
