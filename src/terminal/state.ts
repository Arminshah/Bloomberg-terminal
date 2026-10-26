import { createStore, loadJson, saveJson } from '../core/store';
import type { FixedLayoutId, LayoutId, Route } from './types';
import { migrateRoute, renamedCode } from './legacy';
import { normalizeRows, rowsOf, tileCount, type RowsLayout } from './rows-layout';

export interface PanelState {
  history: Route[];
  idx: number;
  linkGroup?: LinkGroup;
  /** The loaded security survives non-security functions and bounded screen history. */
  loadedSec?: string;
}

export type LinkGroup = 0 | 1 | 2 | 3 | 4;
export const LINK_GROUPS: { id: LinkGroup; name: string; color: string }[] = [
  { id: 0, name: 'Unlinked', color: '#888888' },
  { id: 1, name: 'Red', color: '#ff6767' },
  { id: 2, name: 'Green', color: '#5cdb90' },
  { id: 3, name: 'Blue', color: '#65b9ff' },
  { id: 4, name: 'Yellow', color: '#ffd45c' },
];

/** The function registry supplies eligibility without making this store depend on React screens. */
let acceptsSecurity: (route: Route, id: string) => boolean = () => false;
export function configureSecurityLinks(accepts: typeof acceptsSecurity) { acceptsSecurity = accepts; }
export const linkGroupOf = (p: PanelState | undefined): LinkGroup => LINK_GROUPS.find((g) => g.id === p?.linkGroup)?.id ?? 0;

export interface Split {
  cols: number[];
  rows: number[];
}

export interface TerminalState {
  layout: LayoutId;
  sizes: Partial<Record<FixedLayoutId, Split>>;
  /** The rows and tile sizes of a layout of your own (layout 'rows'). */
  rows?: RowsLayout;
  /** The saved layout this workspace was last set to or saved as, to offer saving its changes. */
  layoutName?: string;
  active: number;
  panels: PanelState[];
  recentSecs: string[];
  recentFns: string[];
}

export const PANEL_COUNT = 6;

const DEFAULT_ROUTES: Route[] = [
  { fn: 'MARKET' },
  { fn: 'CHART', sec: 'AAPL US Equity' },
  { fn: 'MARKETNEWS' },
  { fn: 'HEATMAP' },
  { fn: 'WATCHLIST' },
  { fn: 'FXMATRIX' },
];

export const defaultTerminal = (): TerminalState => ({
  // Four panels with the watchlist (panel 5) as a column on the right.
  layout: '5',
  sizes: {},
  active: 0,
  panels: DEFAULT_ROUTES.map((r) => ({ history: [r], idx: 0 })),
  recentSecs: ['AAPL US Equity', 'SPX Index', 'EURUSD Curncy', 'XBTUSD Curncy'],
  recentFns: ['CHART', 'PROFILE', 'MARKETNEWS', 'MARKET'],
});

/**
 * Version 3 adds the watchlist column (layout 5). A saved four-panel workspace
 * keeps its panels and gains the column, with the watchlist in panel 5.
 */
export function migrateTerminal(saved: { v: number; s: TerminalState }): { v: number; s: TerminalState } {
  if (saved.v !== 2 || !saved.s || typeof saved.s !== 'object') return saved;
  const s = { ...saved.s };
  if (s.layout === '4') {
    s.layout = '5';
    // Without saved panels the defaults apply, which have the watchlist in panel 5.
    if (Array.isArray(s.panels)) {
      s.panels = [...s.panels];
      const p5 = s.panels[4];
      if (!p5 || p5.history[p5.idx]?.fn !== 'WATCHLIST') s.panels[4] = { history: [{ fn: 'WATCHLIST' }], idx: 0 };
    }
  }
  return { v: 3, s };
}

if (typeof localStorage !== 'undefined') {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^armin:terminal(:w\d+)?$/.test(key)) continue;
      const saved = loadJson<{ v: number; s: TerminalState }>(key);
      if (saved?.v === 2) saveJson(key, migrateTerminal(saved));
    }
  } catch {
    // Storage unavailable: the defaults apply.
  }
}

export const terminal = createStore<TerminalState>(defaultTerminal(), 'terminal', 3, { perWindow: true });

/** Saved panels and recent functions under the current function names (the old codes were renamed). */
export function renameSavedCodes(s: TerminalState): TerminalState {
  const panels = s.panels.map((p) => ({ ...p, history: p.history.map(migrateRoute) }));
  const recentFns = [...new Set(s.recentFns.map((f) => renamedCode(f) ?? f))];
  const changed = panels.some((p, i) => p.history.some((r, j) => r !== s.panels[i].history[j])) || recentFns.join() !== s.recentFns.join();
  return changed ? { ...s, panels, recentFns } : s;
}
{
  const before = terminal.get();
  const after = renameSavedCodes(before);
  if (after !== before) terminal.set(after);
}

/**
 * The front page's news panel showed the official announcements (HEADLINES) until 2.10; it shows the market news
 * now. A panel still on that untouched default (HEADLINES its only screen, without arguments) moves to MARKETNEWS;
 * a panel where HEADLINES was opened, or that went elsewhere since, keeps what it has.
 */
export function frontPageNews(s: TerminalState): TerminalState {
  const panels = s.panels.map((p) => (p.history.length === 1 && p.history[0].fn === 'HEADLINES' && !p.history[0].args && !p.history[0].sec ? { ...p, history: [{ fn: 'MARKETNEWS' }], idx: 0 } : p));
  return panels.some((p, i) => p !== s.panels[i]) ? { ...s, panels } : s;
}
// Once per installation, so a panel set to HEADLINES afterwards stays there.
if (typeof localStorage !== 'undefined' && !loadJson('armin:front-page-news')) {
  const before = terminal.get();
  const after = frontPageNews(before);
  if (after !== before) terminal.set(after);
  saveJson('armin:front-page-news', 1);
}

export const LAYOUT_PANELS: Record<FixedLayoutId, number> = { '1': 1, '2': 2, '2v': 2, '3': 3, '4': 4, '5': 5, '6': 6 };

/** A layout of your own as stored, or one row of one tile when it is missing or damaged. */
export const rowsOrDefault = (r: RowsLayout | undefined): RowsLayout => normalizeRows(r) ?? rowsOf([1]);

/** How many panels a layout shows. */
export function panelCount(s: { layout: LayoutId; rows?: RowsLayout }): number {
  return s.layout === 'rows' ? tileCount(rowsOrDefault(s.rows)) : (LAYOUT_PANELS[s.layout] ?? 1);
}

export function currentRoute(s: TerminalState, panel: number): Route {
  const p = s.panels[panel] ?? s.panels[0];
  return p.history[p.idx] ?? { fn: 'HELP' };
}

function panelSecurity(p: PanelState | undefined): string | undefined {
  if (!p) return undefined;
  if (p.history[p.idx]?.sec) return p.history[p.idx].sec;
  if (p.loadedSec) return p.loadedSec;
  // Older workspaces saved the security only on individual routes.
  for (let i = p.idx - 1; i >= 0; i--) if (p.history[i]?.sec) return p.history[i].sec;
  return undefined;
}

/** A panel keeps its loaded security until another security is loaded. */
export function loadedSecurity(s: TerminalState, panel: number): string | undefined {
  return panelSecurity(s.panels[panel]);
}

const MAX_HISTORY = 50;

function withRoute(p: PanelState, route: Route, replace = false): PanelState {
  const cur = p.history[p.idx];
  if (cur && cur.fn === route.fn && cur.sec === route.sec && (cur.args ?? '') === (route.args ?? '')) return p;
  if (replace) {
    const history = [...p.history];
    history[p.idx] = route;
    return { ...p, history, loadedSec: route.sec ?? panelSecurity(p) };
  }
  const history = [...p.history.slice(0, p.idx + 1), route].slice(-MAX_HISTORY);
  return { ...p, history, idx: history.length - 1, loadedSec: route.sec ?? panelSecurity(p) };
}

/** Functions whose arguments describe one security (OPTIONCALC's strike and volatility): a follower drops them. */
const ARGS_PER_SECURITY = new Set(['OPTIONCALC']);

/** Only visible members follow; functions and their arguments stay local to each panel. */
function followers(s: TerminalState, panels: PanelState[], source: number, id: string): PanelState[] {
  const group = linkGroupOf(panels[source]);
  if (!group || source >= panelCount(s)) return panels;
  return panels.map((p, i) => {
    if (i === source || i >= panelCount(s) || linkGroupOf(p) !== group) return p;
    const r = p.history[p.idx];
    if (!r || !acceptsSecurity(r, id)) return p;
    if (ARGS_PER_SECURITY.has(r.fn) && r.sec !== id) {
      const { args: _args, ...rest } = r;
      return withRoute(p, { ...rest, sec: id });
    }
    return withRoute(p, { ...r, sec: id });
  });
}

/** A linked monitor can publish a row selection while keeping its list on screen. */
export function broadcastSecurity(panel: number, id: string): boolean {
  const s = terminal.get();
  const r = s.panels[panel]?.history[s.panels[panel].idx];
  if (!r || acceptsSecurity(r, id)) return false;
  const group = linkGroupOf(s.panels[panel]);
  const hasFollower = !!group && s.panels.some((p, i) => i !== panel && i < panelCount(s) && linkGroupOf(p) === group && acceptsSecurity(p.history[p.idx], id));
  if (!hasFollower) return false;
  const panels = followers(s, s.panels, panel, id).map((p, i) => i === panel ? { ...p, loadedSec: id } : p);
  terminal.set({ ...s, panels, recentSecs: [id, ...s.recentSecs.filter((x) => x !== id)].slice(0, 30), active: panel });
  return true;
}

export function setLinkGroup(panel: number, group: LinkGroup) {
  if (!LINK_GROUPS.some((g) => g.id === group)) return;
  terminal.set((s) => ({ ...s, panels: s.panels.map((p, i) => i === panel ? { ...p, linkGroup: group } : p) }));
}

export function navigate(panel: number, route: Route, replace = false) {
  terminal.set((s) => {
    if (!s.panels[panel]) return s;
    const previous = currentRoute(s, panel);
    let panels = s.panels.map((p, i) => i === panel ? withRoute(p, route, replace) : p);
    if (route.sec && route.sec !== previous.sec) panels = followers(s, panels, panel, route.sec);
    const recentSecs = route.sec ? [route.sec, ...s.recentSecs.filter((x) => x !== route.sec)].slice(0, 30) : s.recentSecs;
    const recentFns = [route.fn, ...s.recentFns.filter((x) => x !== route.fn)].slice(0, 30);
    return { ...s, panels, recentSecs, recentFns, active: panel };
  });
}

export function back(panel: number) {
  moveHistory(panel, -1);
}

export function forward(panel: number) {
  moveHistory(panel, 1);
}

function moveHistory(panel: number, delta: -1 | 1) {
  terminal.set((s) => {
    const p = s.panels[panel];
    if (!p || p.idx + delta < 0 || p.idx + delta >= p.history.length) return s;
    const r = p.history[p.idx + delta];
    let panels = s.panels.map((v, i) => i === panel ? { ...v, idx: v.idx + delta, loadedSec: r.sec ?? panelSecurity(v) } : v);
    if (r.sec && r.sec !== p.history[p.idx]?.sec) panels = followers(s, panels, panel, r.sec);
    return { ...s, panels };
  });
}

export function setActive(panel: number) {
  if (terminal.get().active !== panel) terminal.set((s) => ({ ...s, active: panel }));
}

/** A panel shown alone on the whole workspace, from its frame's maximise button; the others keep their screens, hidden. */
export const soloPanel = createStore<{ panel: number | null }>({ panel: null });

/** Shows a panel alone, or the whole layout again. */
export function toggleSolo(panel: number) {
  soloPanel.set((s) => ({ panel: s.panel === panel ? null : panel }));
  setActive(panel);
}

export function setLayout(layout: FixedLayoutId) {
  if (layoutReturn.get().before) layoutReturn.set({ before: null });
  terminal.set((s) => ({ ...s, layout, active: Math.min(s.active, LAYOUT_PANELS[layout] - 1) }));
}

/** The workspace LAYOUTS was opened from, when the top bar opened it on the whole window. */
export interface LayoutReturn {
  layout: LayoutId;
  rows?: RowsLayout;
  layoutName?: string;
  active: number;
  /** The first panel as it was: the one LAYOUTS takes over. The other panels are kept as they are, hidden. */
  panel0: PanelState;
}

/** Kept until a layout is applied or chosen, so LAYOUTS can save the workspace it came from, or go back to it. */
export const layoutReturn = createStore<{ before: LayoutReturn | null }>({ before: null }, 'layout-return', 1);

/** Opens LAYOUTS on the whole window (one panel): building a layout wants the room. The workspace before is kept. */
export function openLayouts() {
  const s = terminal.get();
  if (s.layout !== '1' && !layoutReturn.get().before) layoutReturn.set({ before: { layout: s.layout, rows: s.rows, layoutName: s.layoutName, active: s.active, panel0: s.panels[0] } });
  terminal.set((x) => ({ ...x, layout: '1', active: 0 }));
  if (currentRoute(terminal.get(), 0).fn !== 'LAYOUTS') navigate(0, { fn: 'LAYOUTS' });
}

/** The workspace saving and "changed" are about: the one LAYOUTS was opened from while it fills the window. */
export function workspaceOf(s: TerminalState, before = layoutReturn.get().before): TerminalState {
  if (!before || s.layout !== '1' || currentRoute(s, 0).fn !== 'LAYOUTS') return s;
  return { ...s, layout: before.layout, rows: before.rows, layoutName: before.layoutName, active: before.active, panels: s.panels.map((p, i) => (i === 0 ? before.panel0 : p)) };
}

/** Back to the workspace LAYOUTS was opened from. */
export function closeLayouts() {
  const before = layoutReturn.get().before;
  if (!before) return;
  layoutReturn.set({ before: null });
  terminal.set((s) => workspaceOf(s, before));
}

/** Saving the workspace LAYOUTS was opened from under a name makes that its name when it comes back. */
export function nameReturnLayout(name: string) {
  const before = layoutReturn.get().before;
  if (before) layoutReturn.set({ before: { ...before, layoutName: name } });
}

/**
 * Sets the panels' screens, the layout (with its rows when it is one of your own) and their link groups. `name`: the
 * saved layout this is, so its changes can be saved; a preset or a new layout has none.
 */
export function applyPreset(routes: Route[], layout: LayoutId, groups?: LinkGroup[], rows?: RowsLayout, name?: string) {
  if (layoutReturn.get().before) layoutReturn.set({ before: null });
  terminal.set((s) => ({
    ...s,
    layout,
    ...(layout === 'rows' ? { rows: rowsOrDefault(rows) } : {}),
    layoutName: name,
    active: 0,
    panels: s.panels.map((p, i) => {
      const r = routes[i];
      const linked = { ...p, linkGroup: groups?.[i] ?? 0 };
      return r ? withRoute(linked, migrateRoute(r)) : linked;
    }),
  }));
}

export const DEFAULT_SPLIT: Record<FixedLayoutId, Split> = {
  '1': { cols: [1], rows: [1] },
  '2': { cols: [0.5, 0.5], rows: [1] },
  '2v': { cols: [1], rows: [0.5, 0.5] },
  '3': { cols: [0.575, 0.425], rows: [0.5, 0.5] },
  '4': { cols: [0.5, 0.5], rows: [0.5, 0.5] },
  '5': { cols: [0.4, 0.4, 0.2], rows: [0.5, 0.5] },
  '6': { cols: [1 / 3, 1 / 3, 1 / 3], rows: [0.5, 0.5] },
};

/** A layout of your own sizes its rows and tiles itself (rows-layout.ts); one object, as screens read it while drawing. */
const ROWS_SPLIT: Split = { cols: [1], rows: [1] };

export function splitFor(s: TerminalState): Split {
  return s.layout === 'rows' ? ROWS_SPLIT : s.sizes?.[s.layout] ?? DEFAULT_SPLIT[s.layout] ?? DEFAULT_SPLIT['1'];
}

/** A layout of your own, resized (its dividers dragged). */
export function setRows(rows: RowsLayout) {
  terminal.set((s) => ({ ...s, rows }));
}

export function setSplit(layout: FixedLayoutId, split: Split | undefined) {
  terminal.set((s) => {
    const sizes = { ...(s.sizes ?? {}) };
    if (split) sizes[layout] = split;
    else delete sizes[layout];
    return { ...s, sizes };
  });
}
