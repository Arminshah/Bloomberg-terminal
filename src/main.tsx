import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles/global.css';
import { App } from './App';
import { restoreCustomSecurities } from './data/live/lookup';
import { enableRealOnly } from './data/live/sources';

// Securities looked up online in earlier sessions must exist before saved panels render.
restoreCustomSecurities();
// The desktop app shows only real data: the simulator is off before anything renders.
enableRealOnly();

if (import.meta.env.MODE === 'single') document.documentElement.classList.add('embedded');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
