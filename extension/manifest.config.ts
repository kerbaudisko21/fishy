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
  description: 'Checks pictures, documents, voices and video calls for signs of AI or tampering, then calls the real person before money moves.',
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
  permissions: ['sidePanel', 'storage', 'tabCapture', 'activeTab', 'scripting', 'contextMenus'],
  host_permissions: ['https://meet.google.com/*', 'https://mail.google.com/*'],
  // The floating window loads the panel page in a frame on the page.
  web_accessible_resources: [{ resources: ['src/sidepanel/index.html'], matches: ['<all_urls>'], use_dynamic_url: true }],
  content_scripts: [
    { matches: ['https://meet.google.com/*'], js: ['src/content/meet.ts'], run_at: 'document_idle' },
    { matches: ['https://mail.google.com/*'], js: ['src/content/gmail.ts'], run_at: 'document_idle' },
  ],
});
