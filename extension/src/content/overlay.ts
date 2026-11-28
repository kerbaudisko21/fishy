// FISHY as a floating window on top of the page, instead of a side panel that squeezes it.
// Injected when the toolbar icon is clicked (see the service worker). Running it again toggles it.
// The window is the side panel's own page in a frame, inside a closed Shadow DOM so the page's CSS
// can't touch it. A thin bar on top drags it, minimises it and closes it.

const HOST_ID = 'fishy-overlay-host';
const WIDTH = 400;

const STYLE = `
:host { all: initial; }
.win { position: fixed; z-index: 2147483647; width: ${WIDTH}px; display: flex; flex-direction: column;
  border-radius: 18px; overflow: hidden; background: #eaeff1;
  box-shadow: 0 18px 48px rgba(16, 32, 46, .28), 0 2px 6px rgba(16, 32, 46, .18);
  animation: pop .22s cubic-bezier(.23, 1, .32, 1) both; }
.win.hidden { visibility: hidden; }
.bar { height: 30px; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 6px 0 12px;
  background: #10202e; color: #c8d3dc; cursor: grab; user-select: none; touch-action: none;
  font: 700 12px system-ui, sans-serif; letter-spacing: .06em; }
.bar:active { cursor: grabbing; }
.grip { flex: 1; display: flex; align-items: center; gap: 8px; }
.dots { width: 14px; height: 10px; background: radial-gradient(circle, #5d7385 1.2px, transparent 1.4px) 0 0 / 5px 5px; }
button { width: 26px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: #c8d3dc;
  display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
button:hover { background: #1b3042; color: #fff; }
button:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
iframe { border: 0; width: 100%; flex: 1; background: #eaeff1; }
.win.min iframe { display: none; }
@keyframes pop { from { opacity: 0; transform: translateY(-8px) scale(.98); } }
@media (prefers-reduced-motion: reduce) { .win { animation: none; } }
`;

const ICON = {
  min: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
  max: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function toggle() {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const host = document.createElement('div');
  host.id = HOST_ID;
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLE;

  const win = document.createElement('div');
  win.className = 'win';
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', 'FISHY');

  const bar = document.createElement('div');
  bar.className = 'bar';
  const grip = document.createElement('span');
  grip.className = 'grip';
  grip.innerHTML = '<span class="dots" aria-hidden="true"></span>';
  grip.append('FISHY');

  const minBtn = document.createElement('button');
  minBtn.title = 'Minimise';
  minBtn.setAttribute('aria-label', 'Minimise FISHY');
  minBtn.innerHTML = ICON.min;
  const closeBtn = document.createElement('button');
  closeBtn.title = 'Close';
  closeBtn.setAttribute('aria-label', 'Close FISHY');
  closeBtn.innerHTML = ICON.close;
  bar.append(grip, minBtn, closeBtn);

  const frame = document.createElement('iframe');
  frame.title = 'FISHY';
  // autoplay: the meeting's sound is played back while the voice is recorded.
  // language-model: this frame sits in someone else's page, and Chrome gives Gemini Nano (the
  // Prompt API) only to a top-level window and its same-origin frames unless the page passes it on.
  // Without it the panel in this window would find no on-device model and use the cloud every time.
  frame.allow = 'clipboard-write; autoplay; language-model';
  frame.src = chrome.runtime.getURL('src/sidepanel/index.html');

  win.append(bar, frame);
  root.append(style, win);
  document.documentElement.append(host);

  // Size and place: top right, as tall as the window allows.
  const place = (left: number, top: number) => {
    const height = win.classList.contains('min') ? 30 : Math.min(760, window.innerHeight - 24);
    const x = Math.min(Math.max(8, left), window.innerWidth - WIDTH - 8);
    const y = Math.min(Math.max(8, top), window.innerHeight - Math.min(height, 60));
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    win.style.height = `${height}px`;
  };
  place(window.innerWidth - WIDTH - 16, 12);
  window.addEventListener('resize', () => place(win.offsetLeft, win.offsetTop));

  // Drag by the bar (not its buttons).
  bar.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const dx = e.clientX - win.offsetLeft;
    const dy = e.clientY - win.offsetTop;
    bar.setPointerCapture(e.pointerId);
    frame.style.pointerEvents = 'none'; // keep the drag when the pointer crosses the frame
    const move = (ev: PointerEvent) => place(ev.clientX - dx, ev.clientY - dy);
    const up = () => {
      frame.style.pointerEvents = '';
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up);
      bar.removeEventListener('pointercancel', up);
    };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
  });

  minBtn.addEventListener('click', () => {
    const min = win.classList.toggle('min');
    minBtn.innerHTML = min ? ICON.max : ICON.min;
    minBtn.title = min ? 'Restore' : 'Minimise';
    minBtn.setAttribute('aria-label', min ? 'Restore FISHY' : 'Minimise FISHY');
    place(win.offsetLeft, win.offsetTop);
  });
  closeBtn.addEventListener('click', () => host.remove());

  // FISHY asks to step out of the picture while it captures a frame of the call in this tab.
  // Only its own frame may ask.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const data = e.data as { fishy?: string } | null;
    if (data?.fishy === 'hide') win.classList.add('hidden');
    if (data?.fishy === 'show') win.classList.remove('hidden');
  });
}

toggle();
