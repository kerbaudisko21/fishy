import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/fonts.css';
import '../styles/tokens.css';
import '../styles/transitions.css';
import './panel.css';
import { App } from './App';

// In the floating window the title bar already carries the logo, so the panel drops its own.
if (window.parent !== window) document.documentElement.classList.add("floating");

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
