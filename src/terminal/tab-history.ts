import { currentRoute, terminal } from './state';

/**
 * The tabs a screen showed, kept like a browser tab's pages: the mouse's back button returns to the tab before
 * ("2) Suppliers" back to "1) Summary") before it leaves the screen, and a screen gone back to opens on the tab it was
 * left on. Each screen in a panel's history has its own list, so going back and forward between screens and tabs runs
 * in the order they were shown.
 */

interface Entry {
  stack: number[];
  pos: number;
  set?: (n: number) => void;
  /** A tab this module is showing, so the screen's report of it is not a new step. */
  stepping?: number;
}

const byRoute = new WeakMap<object, Entry>();
const showing = new Map<number, { route: object; entry: Entry }>();

/**
 * A screen reports the tab it shows. `fresh` is its first report since it opened: a screen gone back to returns to
 * the tab it was left on. Otherwise a different tab is a new step, and the steps ahead of it are dropped.
 */
export function noteTab(panel: number, route: object, tab: number, set: (n: number) => void, fresh: boolean): void {
  let entry = byRoute.get(route);
  if (!entry) {
    entry = { stack: [tab], pos: 0 };
    byRoute.set(route, entry);
  }
  entry.set = set;
  showing.set(panel, { route, entry });
  if (entry.stepping === tab) {
    entry.stepping = undefined;
    return;
  }
  const at = entry.stack[entry.pos];
  if (at === tab) return;
  if (fresh) {
    entry.stepping = at;
    set(at);
    return;
  }
  entry.stack = [...entry.stack.slice(0, entry.pos + 1), tab].slice(-50);
  entry.pos = entry.stack.length - 1;
}

/** The screen in a panel closed: its list stays with its place in the history. */
export function leaveTabs(panel: number, route: object): void {
  if (showing.get(panel)?.route === route) showing.delete(panel);
}

/** One tab back or forward on the panel's screen; false when it has none that way, so the screen itself changes. */
export function stepTab(panel: number, dir: 'back' | 'forward'): boolean {
  const cur = showing.get(panel);
  const set = cur?.entry.set;
  if (!cur || !set || cur.route !== currentRoute(terminal.get(), panel)) return false;
  const { entry } = cur;
  const next = entry.pos + (dir === 'back' ? -1 : 1);
  if (next < 0 || next >= entry.stack.length) return false;
  entry.pos = next;
  entry.stepping = entry.stack[next];
  set(entry.stack[next]);
  return true;
}
