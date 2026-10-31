// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { desktopData } from './live/yahoo';

const KEY = 'armin:demo';

/**
 * The browser build has no data source of its own (provider terms and browser
 * security rules keep market data in the desktop app), so it opens with the
 * demo off. The demo, a simulator whose every value is marked DEMO DATA, runs
 * only once the user asks for it on this browser, opens the page with
 * ?demo=1, or builds with DEMO_MODE=true. The desktop app never runs it.
 */
export function demoMode(): boolean {
  if (desktopData()) return false;
  // Set at build time with DEMO_MODE=true (see .env.example); false unless asked for.
  if (__DEMO_MODE__) return true;
  try {
    if (new URLSearchParams(window.location.search).get('demo') === '1') return true;
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Turns the demo on or off for this browser and reloads the page. */
export function setDemo(on: boolean) {
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the URL flag still works */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('demo');
  if (on) url.searchParams.set('demo', '1');
  window.location.replace(url.toString());
}
