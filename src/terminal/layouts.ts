import { applyPreset, linkGroupOf, nameReturnLayout, panelCount, rowsOrDefault, setSplit, terminal, workspaceOf, type TerminalState } from './state';
import { savedLayouts, type SavedLayout } from './userdata';
import type { Route } from './types';

/**
 * Saving and setting layouts, for LAYOUTS and the top bar's menu: a saved layout holds the arrangement (with its rows
 * and tile sizes when it is one of your own), the divider positions, each panel's screen and its link group.
 */

/** The screen each visible panel shows, for saving; LAYOUTS itself gives way to the screen before it. */
export function currentRoutes(s: TerminalState = terminal.get()): Route[] {
  return s.panels.slice(0, panelCount(s)).map((p) => {
    const r = p.history[p.idx];
    return r.fn === 'LAYOUTS' && p.idx > 0 ? p.history[p.idx - 1] : r;
  });
}

/** What saving the workspace under `name` would keep. */
export function snapshotLayout(name: string, s: TerminalState = terminal.get(), now = Date.now()): SavedLayout {
  const split = s.layout === 'rows' ? undefined : s.sizes?.[s.layout];
  return {
    name,
    layout: s.layout,
    routes: currentRoutes(s),
    linkGroups: s.panels.slice(0, panelCount(s)).map(linkGroupOf),
    ...(split ? { split } : {}),
    ...(s.layout === 'rows' ? { rows: rowsOrDefault(s.rows) } : {}),
    saved: now,
  };
}

/** Saves the workspace under `name` (replacing a layout of that name) and remembers it as the one in use. */
export function saveLayout(name: string): SavedLayout {
  const now = terminal.get();
  const ws = workspaceOf(now);
  const l = snapshotLayout(name, ws);
  savedLayouts.set((s) => ({ list: [l, ...s.list.filter((x) => x.name.toUpperCase() !== name.toUpperCase())] }));
  // While LAYOUTS fills the window, the saved workspace is the one it came from: that one takes the name.
  if (ws !== now) nameReturnLayout(l.name);
  else terminal.set((s) => ({ ...s, layoutName: l.name }));
  return l;
}

/** Sets the workspace to a saved layout: its arrangement, sizes, screens and link groups. */
export function applySaved(l: SavedLayout) {
  applyPreset(l.routes, l.layout, l.linkGroups, l.rows, l.name);
  if (l.layout !== 'rows') setSplit(l.layout, l.split);
}

const routeKey = (r: Route) => `${r.fn}|${r.sec ?? ''}|${r.args ?? ''}`;
const sizes = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (typeof x === 'number' ? Math.round(x * 1e4) : x));

/** Whether two layouts show the same: arrangement, sizes, screens and link groups (not their names or dates). */
export function sameLayout(a: SavedLayout, b: SavedLayout): boolean {
  return (
    a.layout === b.layout &&
    sizes(a.split) === sizes(b.split) &&
    sizes(a.rows) === sizes(b.rows) &&
    a.routes.map(routeKey).join() === b.routes.map(routeKey).join() &&
    (a.linkGroups ?? []).map((g) => g ?? 0).join() === (b.linkGroups ?? []).map((g) => g ?? 0).join()
  );
}

/** The saved layout the workspace was set to, when it has changed since (resized, other screens): saving would update it. */
export function unsavedLayout(state: TerminalState, list: SavedLayout[]): SavedLayout | undefined {
  const s = workspaceOf(state);
  const l = s.layoutName ? list.find((x) => x.name === s.layoutName) : undefined;
  return l && !sameLayout(snapshotLayout(l.name, s, l.saved), l) ? l : undefined;
}
