import type { BannerState, PanelMessage } from '../lib/messages';

// The in-page banner, drawn inside a Shadow DOM so the host page's CSS cannot touch it (and ours cannot touch the page).

const STYLE = `
:host { all: initial; }
.wrap { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
  width: min(720px, calc(100vw - 32px)); font-family: Inter, system-ui, sans-serif; }
.bar { display: flex; align-items: center; gap: 14px; padding: 12px 12px 12px 16px; border-radius: 16px;
  box-shadow: 0 12px 32px rgba(16, 32, 46, .2); animation: drop .35s cubic-bezier(.2,.8,.2,1) both; }
.amber { background: #FFF1D6; border: 1px solid #F0C26A; color: #10202E; }
.red { background: #B42A14; color: #fff; }
.confirmed { background: #DDF1EC; border: 1px solid #9FD3C7; color: #0B3F38; }
.mark { flex: none; width: 36px; height: 36px; border-radius: 10px; background: #F26B4E; color: #10202E;
  display: flex; align-items: center; justify-content: center; }
.text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.title { font-size: 16px; font-weight: 700; }
.line { font-size: 13px; opacity: .9; }
button { flex: none; height: 44px; padding: 0 16px; border-radius: 12px; border: 0; font: 600 14px Inter, system-ui, sans-serif;
  cursor: pointer; background: #10202E; color: #fff; }
.red button { background: #fff; color: #10202E; }
@keyframes drop { from { transform: translateY(-12px); opacity: 0 } to { transform: none; opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .bar { animation: none; } }
`;

const HOOK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2v11.5a4.5 4.5 0 0 1-9 0V12"/><path d="M5 12l2.6 2.2"/></svg>`;

let root: ShadowRoot | null = null;

function ensureRoot() {
  if (root) return root;
  const host = document.createElement('fishy-banner');
  document.documentElement.appendChild(host);
  root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);
  return root;
}

export function showBanner(state: BannerState, title: string, line: string) {
  const r = ensureRoot();
  r.querySelector('.wrap')?.remove();
  if (state === 'hidden') return;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const bar = document.createElement('div');
  bar.className = `bar ${state}`;
  bar.setAttribute('role', 'alert');

  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.innerHTML = HOOK; // static, trusted markup
  const text = document.createElement('span');
  text.className = 'text';
  const t = document.createElement('span');
  t.className = 'title';
  t.textContent = title;
  const l = document.createElement('span');
  l.className = 'line';
  l.textContent = line;
  text.append(t, l);

  const open = document.createElement('button');
  open.textContent = state === 'red' ? 'Open report' : 'See why';
  // TODO: chrome.sidePanel.open needs a user gesture in an extension page; ask the worker to focus the panel.
  open.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open_panel' }));

  bar.append(mark, text, open);
  wrap.append(bar);
  r.appendChild(wrap);
}

export function listenForBanner() {
  chrome.runtime.onMessage.addListener((msg: PanelMessage) => {
    if (msg?.type === 'banner') showBanner(msg.state, msg.title, msg.line);
  });
}
