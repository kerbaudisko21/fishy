// Opens the side panel when the toolbar icon is clicked.
// Page messages go straight from the content scripts to the side panel (chrome.runtime.sendMessage),
// so the worker stays small. Gemini Nano runs in the side panel page, not here.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
});

// "See why" on the in-page banner. Chrome only opens the panel from a user gesture,
// so this may be refused; the toolbar icon always works.
chrome.runtime.onMessage.addListener((msg: { type?: string }, sender) => {
  if (msg?.type === 'open_panel' && sender.tab?.id !== undefined) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(console.warn);
  }
});
