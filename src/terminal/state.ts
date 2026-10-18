import { createStore, loadJson, saveJson } from '../core/store';
import type { LayoutId, Route } from './types';
import { migrateRoute, renamedCode } from './legacy';

export interface PanelState {
  history: Route[];
  idx: number;
  linkGroup?: LinkGroup;
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
  sizes: Partial<Record<LayoutId, Split>>;
  active: number;
  panels: PanelState[];
  recentSecs: string[];
  recentFns: string[];
}

export const PANEL_COUNT = 6;

const DEFAULT_ROUTES: Route[] = [
  { fn: 'MARKET' },
  { fn: 'CHART', sec: 'AAPL US Equity' },
  { fn: 'HEADLINES' },
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
  recentFns: ['CHART', 'PROFILE', 'HEADLINES', 'MARKET'],
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

export const LAYOUT_PANELS: Record<LayoutId, number> = { '1': 1, '2': 2, '2v': 2, '3': 3, '4': 4, '5': 5, '6': 6 };

export function currentRoute(s: TerminalState, panel: number): Route {
  const p = s.panels[panel] ?? s.panels[0];
  return p.history[p.idx] ?? { fn: 'HELP' };
}

const MAX_HISTORY = 50;

function withRoute(p: PanelState, route: Route, replace = false): PanelState {
  const cur = p.history[p.idx];
  if (cur && cur.fn === route.fn && cur.sec === route.sec && (cur.args ?? '') === (route.args ?? '')) return p;
  if (replace) {
    const history = [...p.history];
    history[p.idx] = route;
    return { ...p, history };
  }
  const history = [...p.history.slice(0, p.idx + 1), route].slice(-MAX_HISTORY);
  return { ...p, history, idx: history.length - 1 };
}

/** Only visible members follow; functions and their arguments stay local to each panel. */
function followers(s: TerminalState, panels: PanelState[], source: number, id: string): PanelState[] {
  const group = linkGroupOf(panels[source]);
  if (!group || source >= LAYOUT_PANELS[s.layout]) return panels;
  return panels.map((p, i) => {
    if (i === source || i >= LAYOUT_PANELS[s.layout] || linkGroupOf(p) !== group) return p;
    const r = p.history[p.idx];
    return r && acceptsSecurity(r, id) ? withRoute(p, { ...r, sec: id }) : p;
  });
}

/** A linked monitor can publish a row selection while keeping its list on screen. */
export function broadcastSecurity(panel: number, id: string): boolean {
  const s = terminal.get();
  const r = s.panels[panel]?.history[s.panels[panel].idx];
  if (!r || acceptsSecurity(r, id)) return false;
  const group = linkGroupOf(s.panels[panel]);
  const hasFollower = !!group && s.panels.some((p, i) => i !== panel && i < LAYOUT_PANELS[s.layout] && linkGroupOf(p) === group && acceptsSecurity(p.history[p.idx], id));
  if (!hasFollower) return false;
  const panels = followers(s, s.panels, panel, id);
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
    let panels = s.panels.map((v, i) => i === panel ? { ...v, idx: v.idx + delta } : v);
    if (r.sec && r.sec !== p.history[p.idx]?.sec) panels = followers(s, panels, panel, r.sec);
    return { ...s, panels };
  });
}

export function setActive(panel: number) {
  if (terminal.get().active !== panel) terminal.set((s) => ({ ...s, active: panel }));
}

export function setLayout(layout: LayoutId) {
  terminal.set((s) => ({ ...s, layout, active: Math.min(s.active, LAYOUT_PANELS[layout] - 1) }));
}

export function applyPreset(routes: Route[], layout: LayoutId, groups?: LinkGroup[]) {
  terminal.set((s) => ({
    ...s,
    layout,
    active: 0,
    panels: s.panels.map((p, i) => {
      const r = routes[i];
      const linked = { ...p, linkGroup: groups?.[i] ?? 0 };
      return r ? withRoute(linked, migrateRoute(r)) : linked;
    }),
  }));
}

export const DEFAULT_SPLIT: Record<LayoutId, Split> = {
  '1': { cols: [1], rows: [1] },
  '2': { cols: [0.5, 0.5], rows: [1] },
  '2v': { cols: [1], rows: [0.5, 0.5] },
  '3': { cols: [0.575, 0.425], rows: [0.5, 0.5] },
  '4': { cols: [0.5, 0.5], rows: [0.5, 0.5] },
  '5': { cols: [0.4, 0.4, 0.2], rows: [0.5, 0.5] },
  '6': { cols: [1 / 3, 1 / 3, 1 / 3], rows: [0.5, 0.5] },
};

export function splitFor(s: TerminalState): Split {
  return s.sizes?.[s.layout] ?? DEFAULT_SPLIT[s.layout];
}

export function setSplit(layout: LayoutId, split: Split | undefined) {
  terminal.set((s) => {
    const sizes = { ...(s.sizes ?? {}) };
    if (split) sizes[layout] = split;
    else delete sizes[layout];
    return { ...s, sizes };
  });
}
