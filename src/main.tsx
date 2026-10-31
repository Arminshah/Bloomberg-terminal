// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/*! @license Armin Terminal. Copyright (c) 2026 Armin. PolyForm Strict License 1.0.0: non-commercial use only; no copying into other work, changes or redistribution. https://polyformproject.org/licenses/strict/1.0.0 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import './styles/global.css';
import { App } from './App';
import { NoDataSource } from './components/NoDataSource';
import { demoMode } from './data/demo';
import { desktopData } from './data/live/yahoo';
import { restoreCustomSecurities } from './data/live/lookup';
import { enableRealOnly } from './data/live/sources';

// Securities looked up online in earlier sessions must exist before saved panels render.
restoreCustomSecurities();
// The desktop app shows only real data: the simulator is off before anything renders.
enableRealOnly();

if (import.meta.env.MODE === 'single') document.documentElement.classList.add('embedded');

// The browser build runs only as a demo, and only once the user opens it.
createRoot(document.getElementById('root')!).render(<StrictMode>{desktopData() || demoMode() ? <App /> : <NoDataSource />}</StrictMode>);
