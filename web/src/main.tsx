import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/atkinson-hyperlegible-next';
// One set of colours and fonts for the extension and these pages.
import '../../extension/src/styles/tokens.css';
import '../../extension/src/styles/transitions.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
