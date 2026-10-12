import { desktopData } from './live/yahoo';

const KEY = 'armin:demo';

/**
 * The browser build has no data source of its own (provider terms and browser
 * security rules keep market data in the desktop app), so it opens with the
 * demo off. The demo, a simulator whose every value is marked DEMO DATA, runs
 * only once the user asks for it on this browser or opens the page with
 * ?demo=1. The desktop app never runs it.
 */
export function demoMode(): boolean {
  if (desktopData()) return false;
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
