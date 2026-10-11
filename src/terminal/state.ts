import { createStore } from '../core/store';
import type { LayoutId, Route } from './types';

export interface PanelState {
  history: Route[];
  idx: number;
}

export interface TerminalState {
  layout: LayoutId;
  active: number;
  panels: PanelState[];
  recentSecs: string[];
  recentFns: string[];
}

export const PANEL_COUNT = 6;

const DEFAULT_ROUTES: Route[] = [
  { fn: 'WEI' },
  { fn: 'GP', sec: 'AAPL US Equity' },
  { fn: 'TOP' },
  { fn: 'IMAP' },
  { fn: 'W' },
  { fn: 'FXC' },
];

export const defaultTerminal = (): TerminalState => ({
  layout: '4',
  active: 0,
  panels: DEFAULT_ROUTES.map((r) => ({ history: [r], idx: 0 })),
  recentSecs: ['AAPL US Equity', 'SPX Index', 'EURUSD Curncy', 'XBTUSD Curncy'],
  recentFns: ['GP', 'DES', 'TOP', 'WEI'],
});

export const terminal = createStore<TerminalState>(defaultTerminal(), 'terminal', 2);

export const LAYOUT_PANELS: Record<LayoutId, number> = { '1': 1, '2': 2, '2v': 2, '3': 3, '4': 4, '6': 6 };

export function currentRoute(s: TerminalState, panel: number): Route {
  const p = s.panels[panel] ?? s.panels[0];
  return p.history[p.idx] ?? { fn: 'HELP' };
}

const MAX_HISTORY = 50;

export function navigate(panel: number, route: Route, replace = false) {
  terminal.set((s) => {
    const panels = s.panels.map((p, i) => {
      if (i !== panel) return p;
      const cur = p.history[p.idx];
      if (cur && cur.fn === route.fn && cur.sec === route.sec && (cur.args ?? '') === (route.args ?? '')) return p;
      if (replace) {
        const history = [...p.history];
        history[p.idx] = route;
        return { history, idx: p.idx };
      }
      const history = [...p.history.slice(0, p.idx + 1), route].slice(-MAX_HISTORY);
      return { history, idx: history.length - 1 };
    });
    const recentSecs = route.sec ? [route.sec, ...s.recentSecs.filter((x) => x !== route.sec)].slice(0, 30) : s.recentSecs;
    const recentFns = [route.fn, ...s.recentFns.filter((x) => x !== route.fn)].slice(0, 30);
    return { ...s, panels, recentSecs, recentFns, active: panel };
  });
}

export function back(panel: number) {
  terminal.set((s) => ({
    ...s,
    panels: s.panels.map((p, i) => (i === panel && p.idx > 0 ? { ...p, idx: p.idx - 1 } : p)),
  }));
}

export function forward(panel: number) {
  terminal.set((s) => ({
    ...s,
    panels: s.panels.map((p, i) => (i === panel && p.idx < p.history.length - 1 ? { ...p, idx: p.idx + 1 } : p)),
  }));
}

export function setActive(panel: number) {
  if (terminal.get().active !== panel) terminal.set((s) => ({ ...s, active: panel }));
}

export function setLayout(layout: LayoutId) {
  terminal.set((s) => ({ ...s, layout, active: Math.min(s.active, LAYOUT_PANELS[layout] - 1) }));
}

export function applyPreset(routes: Route[], layout: LayoutId) {
  terminal.set((s) => ({
    ...s,
    layout,
    active: 0,
    panels: s.panels.map((p, i) => {
      const r = routes[i];
      if (!r) return p;
      const history = [...p.history.slice(0, p.idx + 1), r].slice(-MAX_HISTORY);
      return { history, idx: history.length - 1 };
    }),
  }));
}
