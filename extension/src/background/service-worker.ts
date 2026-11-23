// The toolbar icon opens FISHY as a floating window on top of the page (content/overlay.ts),
// instead of a side panel that squeezes the page. Clicking it again closes the window.
// Clicking the icon also grants activeTab for that tab, which is what lets FISHY capture the
// call's video or voice there. The side panel stays available from Chrome's side panel menu.
import overlayScript from '../content/overlay.ts?script';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.error);
});

async function showOverlay(tabId: number) {
  try {
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
