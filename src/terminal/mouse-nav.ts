import { back, forward, terminal } from './state';
import { stepTab } from './tab-history';

/**
 * The mouse's back and forward buttons move through a panel's screens as they move through a browser tab's pages:
 * back returns to the screen before, forward to the one left. The panel under the pointer moves; a keyboard's
 * Browser Back and Forward keys move the active panel.
 */

export type Direction = 'back' | 'forward';
type Source = 'mouse' | 'key' | 'app';

let last: { dir: Direction; source: Source; at: number } | null = null;

/**
 * One step back or forward in a panel's history. Windows reports a side button twice, as a mouse button and as the
 * window's "browser back" command, so the same step from another source within 400 ms is the same press.
 */
export function historyStep(dir: Direction, source: Source, panel = terminal.get().active, now = Date.now()): boolean {
  if (last && last.dir === dir && last.source !== source && now - last.at < 400) return false;
  last = { dir, source, at: now };
  browserStep(panel, dir);
  return true;
}

/** As a browser's back and forward: through the screen's tabs first, then to the screen before or after. */
export function browserStep(panel: number, dir: Direction): void {
  if (stepTab(panel, dir)) return;
  (dir === 'back' ? back : forward)(panel);
}

/** The panel an event happened in, else the active one. */
function panelOf(target: EventTarget | null): number {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-panel]') : null;
  const n = el ? Number(el.dataset.panel) : NaN;
  return Number.isInteger(n) ? n : terminal.get().active;
}

/** Listens for the side buttons, the Browser Back and Forward keys and the desktop window's commands. */
export function startHistoryButtons(): () => void {
  // Buttons 3 and 4 are the side buttons: back and forward.
  const side = (e: MouseEvent) => e.button === 3 || e.button === 4;
  const onDown = (e: MouseEvent) => {
    if (side(e)) e.preventDefault();
  };
  const onUp = (e: MouseEvent) => {
    if (!side(e)) return;
    e.preventDefault();
    historyStep(e.button === 3 ? 'back' : 'forward', 'mouse', panelOf(e.target));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'BrowserBack' && e.key !== 'BrowserForward') return;
    e.preventDefault();
    historyStep(e.key === 'BrowserBack' ? 'back' : 'forward', 'key');
  };
  window.addEventListener('mousedown', onDown, true);
  window.addEventListener('mouseup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  const off = window.arminDesktop?.onHistory?.((dir) => historyStep(dir === 'forward' ? 'forward' : 'back', 'app'));
  return () => {
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('mouseup', onUp, true);
    window.removeEventListener('keydown', onKey, true);
    off?.();
  };
}
