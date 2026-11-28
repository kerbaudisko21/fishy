// The toolbar icon opens FISHY as a floating window on top of the page (content/overlay.ts),
// instead of a side panel that squeezes the page. Clicking it again closes the window.
// Clicking the icon also grants activeTab for that tab, which is what lets FISHY capture the
// call's video or voice there. The side panel stays available from Chrome's side panel menu.
import overlayScript from '../content/overlay.ts?script';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
  // Right-click any picture (a web page, Gmail, WhatsApp Web) → "Check this picture with FISHY".
  chrome.contextMenus.create({ id: 'fishy-check-picture', title: 'Check this picture with FISHY', contexts: ['image'] }, () => void chrome.runtime.lastError);
});

/** A picture the person asked FISHY to check from the right-click menu, waiting for the panel. */
export interface PictureJob {
  kind: 'picture';
  src: string;
  tabId: number;
  pageUrl?: string;
  at: number;
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'fishy-check-picture' || tab?.id === undefined || !info.srcUrl) return;
  const job: PictureJob = { kind: 'picture', src: info.srcUrl, tabId: tab.id, pageUrl: info.pageUrl, at: Date.now() };
  // The panel picks the job up when it opens, or straight away if it's already open.
  void chrome.storage.session.set({ fishyJob: job }).then(() => showOverlay(tab.id!, { keepOpen: true }));
});

async function showOverlay(tabId: number, { keepOpen = false } = {}) {
  try {
    // Running the overlay script toggles the window; from the right-click menu it must only open it.
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

// "See why" on the in-page banner opens the floating window on that tab.
chrome.runtime.onMessage.addListener((msg: { type?: string }, sender) => {
  if (msg?.type === 'open_panel' && sender.tab?.id !== undefined) void showOverlay(sender.tab.id);
});
