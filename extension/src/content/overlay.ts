// FISHY as a floating window on top of the page, instead of a side panel that squeezes it.
// Injected when the toolbar icon is clicked (see the service worker). Running it again toggles it.
// The window is the side panel's own page in a frame, inside a closed Shadow DOM so the page's CSS
// can't touch it. An ink title bar with the logo drags it, minimises it to a red tag and closes it.

const HOST_ID = 'fishy-overlay-host';
const WIDTH = 400;

const BAR = 40;

const STYLE = `
:host { all: initial; }
.win { position: fixed; z-index: 2147483647; width: ${WIDTH}px; display: flex; flex-direction: column;
  border: 3px solid #141414; border-radius: 8px; overflow: hidden; background: #e8d9b5; box-sizing: border-box;
  box-shadow: 6px 6px 0 rgba(20, 20, 20, .9), 0 18px 48px rgba(20, 20, 20, .25);
  animation: pop .22s cubic-bezier(.23, 1, .32, 1) both; }
.win.hidden, .win.min { visibility: hidden; }
.bar { height: ${BAR}px; flex: none; display: flex; align-items: center; gap: 4px; padding: 0 6px 0 8px;
  background: #141414; color: #fbf7ec; cursor: grab; user-select: none; touch-action: none;
  border-bottom: 4px solid #f7d51d; }
.bar:active { cursor: grabbing; }
.grip { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
.word { font: 900 19px/1 'Arial Narrow', 'Roboto Condensed', Impact, system-ui, sans-serif; letter-spacing: .14em; }
.hint { font: 600 11px/1 system-ui, sans-serif; color: #a59d8b; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button { width: 30px; height: 28px; border: 0; border-radius: 3px; background: transparent; color: #fbf7ec;
  display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
button:focus-visible { outline: 2px solid #f7d51d; outline-offset: 1px; }
@media (hover: hover) and (pointer: fine) { .bar button:hover { background: #cf2419; } .tag:hover { transform: rotate(-6deg) scale(1.05); } }
iframe { border: 0; width: 100%; flex: 1; background: #e8d9b5; }
/* Minimised: FISHY shrinks to its red tag on the edge of the page. Click it to bring the window back. */
.tag { position: fixed; z-index: 2147483647; width: 52px; height: 52px; padding: 0; border-radius: 6px;
  background: transparent; box-shadow: 4px 4px 0 rgba(20, 20, 20, .9); transition: transform .16s cubic-bezier(.23, 1, .32, 1);
  animation: pop .22s cubic-bezier(.23, 1, .32, 1) both; }
.tag[hidden] { display: none; }
.tag svg { width: 52px; height: 52px; display: block; }
@keyframes pop { from { opacity: 0; transform: translateY(-8px) scale(.96); } }
@media (prefers-reduced-motion: reduce) { .win, .tag { animation: none; transition: none; } }
`;

/** The logo: a red evidence tag; a loupe whose handle bends into a fish hook. */
const MARK = (size: number) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 128 128" aria-hidden="true"><rect x="4" y="4" width="120" height="120" rx="12" fill="#CF2419"/><circle cx="22" cy="22" r="6" fill="#FBF7EC"/><circle cx="56" cy="52" r="23" fill="none" stroke="#FBF7EC" stroke-width="11"/><path d="M73 69L87 83L87 97C87 105 81 110 74 110C67 110 62 105 62 98" fill="none" stroke="#FBF7EC" stroke-width="11" stroke-linecap="square"/><path d="M62 98L72 91" fill="none" stroke="#FBF7EC" stroke-width="11" stroke-linecap="square"/></svg>`;

const ICON = {
  min: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" aria-hidden="true"><path d="M5 17h14"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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
  grip.innerHTML = `${MARK(24)}<span class="word">FISHY</span><span class="hint">drag to move</span>`;

  const minBtn = document.createElement('button');
  minBtn.title = 'Minimise';
  minBtn.setAttribute('aria-label', 'Minimise FISHY');
  minBtn.innerHTML = ICON.min;
  const closeBtn = document.createElement('button');
  closeBtn.title = 'Close';
  closeBtn.setAttribute('aria-label', 'Close FISHY');
  closeBtn.innerHTML = ICON.close;
  bar.append(grip, minBtn, closeBtn);

  const tag = document.createElement('button');
  tag.className = 'tag';
  tag.hidden = true;
  tag.title = 'Open FISHY';
  tag.setAttribute('aria-label', 'Open FISHY');
  tag.innerHTML = MARK(52);

  const frame = document.createElement('iframe');
  frame.title = 'FISHY';
  // autoplay: the meeting's sound is played back while the voice is recorded.
  // language-model: this frame sits in someone else's page, and Chrome gives Gemini Nano (the
  // Prompt API) only to a top-level window and its same-origin frames unless the page passes it on.
  // Without it the panel in this window would find no on-device model and use the cloud every time.
  frame.allow = 'clipboard-write; autoplay; language-model';
  frame.src = chrome.runtime.getURL('src/sidepanel/index.html');

  win.append(bar, frame);
  root.append(style, win, tag);
  document.documentElement.append(host);

  // Size and place: top right, as tall as the window allows.
  const place = (left: number, top: number) => {
    const height = Math.min(760, window.innerHeight - 24);
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

  // Minimise to the red tag at the window's top-right corner; the frame keeps running, so a
  // check in progress carries on.
  minBtn.addEventListener('click', () => {
    win.classList.add('min');
    const r = win.getBoundingClientRect();
    tag.style.left = `${Math.min(r.right - 52, window.innerWidth - 60)}px`;
    tag.style.top = `${Math.max(8, r.top)}px`;
    tag.hidden = false;
    tag.focus();
  });
  tag.addEventListener('click', () => {
    tag.hidden = true;
    win.classList.remove('min');
    minBtn.focus();
  });
  closeBtn.addEventListener('click', () => host.remove());

  // FISHY asks to step out of the picture while it captures a frame of the call in this tab.
  // Only its own frame may ask.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow) return;
    const data = e.data as { fishy?: string } | null;
    if (data?.fishy === 'hide') win.classList.add('hidden');
    if (data?.fishy === 'show') win.classList.remove('hidden');
    // Where the window is, so watch mode and lip-sync can black FISHY out of the frames they grab.
    if (data?.fishy === 'rect?') {
      const r = win.getBoundingClientRect();
      frame.contentWindow?.postMessage({ fishy: 'rect', x: r.left, y: r.top, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight }, '*');
    }
  });
}

toggle();
