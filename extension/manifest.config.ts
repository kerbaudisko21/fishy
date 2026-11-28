import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

const icons = {
  16: 'public/icons/icon-16.png',
  32: 'public/icons/icon-32.png',
  48: 'public/icons/icon-48.png',
  128: 'public/icons/icon-128.png',
};

export default defineManifest({
  manifest_version: 3,
  name: 'FISHY',
  description: 'Is it real? Checks pictures, documents, voices, video calls, websites and QR codes for signs of AI or tampering, and says why.',
  version: pkg.version,
  minimum_chrome_version: '139',
  icons,
  action: { default_title: 'Open FISHY', default_icon: icons },
  side_panel: { default_path: 'src/sidepanel/index.html' },
  background: { service_worker: 'src/background/service-worker.ts', type: 'module' },
  // tabCapture: the voice check records a 10-second clip of the meeting, only on the user's click (R8).
  // No 'tabs': FISHY never reads a tab's address or title (security review L4).
  // activeTab: clicking the FISHY icon on the call's tab is what lets Chrome capture that tab.
  // scripting: the toolbar icon puts the floating window on the page it was clicked on.
  // contextMenus: right-click a picture, video, link, selected text or page to check it.
  permissions: ['sidePanel', 'storage', 'tabCapture', 'activeTab', 'scripting', 'contextMenus'],
  // Only when the person switches on "Warn me about risky websites" in Settings (asked at that moment,
  // never at install): every page is checked on the laptop, nothing is sent.
  optional_host_permissions: ['<all_urls>'],
  // Use FISHY without opening it first. A shortcut also grants activeTab, like clicking the icon.
  commands: {
    _execute_action: { suggested_key: { default: 'Alt+Shift+F' }, description: 'Open FISHY' },
    'check-website': { suggested_key: { default: 'Alt+Shift+W' }, description: 'Check this website' },
    'check-face': { suggested_key: { default: 'Alt+Shift+V' }, description: 'Check the face on this video call' },
    'check-voice': { suggested_key: { default: 'Alt+Shift+A' }, description: 'Check the voice on this call (10 s)' },
  },
  // The floating window loads the panel page in a frame on the page.
  web_accessible_resources: [{ resources: ['src/sidepanel/index.html'], matches: ['<all_urls>'], use_dynamic_url: true }],
});
