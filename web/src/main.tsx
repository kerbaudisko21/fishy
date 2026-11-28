import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/big-shoulders-display';
import '@fontsource-variable/big-shoulders-stencil-display';
import '@fontsource-variable/atkinson-hyperlegible-next';
// One set of colours and fonts for the extension and these pages.
import '../../extension/src/styles/tokens.css';
import '../../extension/src/styles/transitions.css';
import './styles.css';
import { App } from './App';

// Offline shell and "Share to FISHY" on Android (public/sw.js). Not in development: it would cache the dev server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[FISHY] service worker not registered', e));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
