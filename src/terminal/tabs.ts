import { createStore } from '../core/store';
import { currentRoute, defaultTerminal, renameSavedCodes, terminal, type TerminalState } from './state';

/**
 * Workspace tabs, as in a browser window: each tab is a whole workspace (layout, panels and their screen history).
 * The tab on screen lives in the `terminal` store, which every screen reads; the others keep their workspace here
 * until they are opened again. Tabs belong to their window, like the workspace itself.
 */
export interface WorkspaceTab {
  id: string;
  /** The name the user gave the tab; without one it is named after its active screen. */
  name?: string;
  /** The workspace of a tab not on screen. */
  saved?: TerminalState;
}

export interface TabsState {
  tabs: WorkspaceTab[];
  active: string;
  /** The number of the next tab's id. */
  next: number;
}

export const MAX_TABS = 12;

const initial = (): TabsState => ({ tabs: [{ id: 't1' }], active: 't1', next: 2 });

export const workspaceTabs = createStore<TabsState>(initial(), 'tabs', 1, { perWindow: true });

// A saved list whose active tab is missing (edited or damaged storage) falls back to its first tab.
{
  const t = workspaceTabs.get();
  if (!Array.isArray(t.tabs) || !t.tabs.length) workspaceTabs.set(initial());
  else if (!t.tabs.some((x) => x.id === t.active)) workspaceTabs.set({ ...t, active: t.tabs[0].id, tabs: t.tabs.map((x, i) => (i === 0 ? { id: x.id, ...(x.name ? { name: x.name } : {}) } : x)) });
}

/** Tabs closed in this session, newest last, for Ctrl+Shift+T. */
const closed: { tab: WorkspaceTab; at: number }[] = [];

/** A new workspace, with the recent securities and functions of the one in use (they are the user's, not a tab's). */
function freshWorkspace(from: TerminalState): TerminalState {
  return { ...defaultTerminal(), recentSecs: from.recentSecs, recentFns: from.recentFns };
}

/** A tab's saved workspace, ready to go on screen: current function names, and the user's recent lists. */
function opened(saved: TerminalState | undefined, from: TerminalState): TerminalState {
  if (!saved || !Array.isArray(saved.panels)) return freshWorkspace(from);
  return renameSavedCodes({ ...defaultTerminal(), ...saved, recentSecs: from.recentSecs, recentFns: from.recentFns });
}

const bare = (t: WorkspaceTab): WorkspaceTab => ({ id: t.id, ...(t.name ? { name: t.name } : {}) });

/** Opens a new tab after the others with a fresh workspace, and shows it. */
export function newTab(): boolean {
  const t = workspaceTabs.get();
  if (t.tabs.length >= MAX_TABS) return false;
  const cur = terminal.get();
  const id = `t${t.next}`;
  workspaceTabs.set({ tabs: [...t.tabs.map((x) => (x.id === t.active ? { ...x, saved: cur } : x)), { id }], active: id, next: t.next + 1 });
  terminal.set(freshWorkspace(cur));
  return true;
}

/** Shows a tab: the one on screen keeps its workspace, the chosen one's comes back as it was left. */
export function switchTab(id: string): void {
  const t = workspaceTabs.get();
  const to = t.tabs.find((x) => x.id === id);
  if (!to || id === t.active) return;
  const cur = terminal.get();
  workspaceTabs.set({ ...t, active: id, tabs: t.tabs.map((x) => (x.id === t.active ? { ...x, saved: cur } : x.id === id ? bare(x) : x)) });
  terminal.set(opened(to.saved, cur));
}

/** The next tab to the right (`1`) or left (`-1`), wrapping round as a browser does. */
export function cycleTab(dir: 1 | -1): void {
  const t = workspaceTabs.get();
  const i = t.tabs.findIndex((x) => x.id === t.active);
  switchTab(t.tabs[(i + dir + t.tabs.length) % t.tabs.length].id);
}

/** The n-th tab (1-8), or the last one for 9, as a browser's Ctrl+1 to Ctrl+9. */
export function tabByNumber(n: number): void {
  const t = workspaceTabs.get();
  const to = n === 9 ? t.tabs[t.tabs.length - 1] : t.tabs[n - 1];
  if (to) switchTab(to.id);
}

/**
 * Closes a tab. Closing the one on screen shows the tab to its right, else the one to its left; closing the last
 * tab leaves a fresh one, so the window always has a workspace.
 */
export function closeTab(id: string): void {
  const t = workspaceTabs.get();
  const i = t.tabs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const cur = terminal.get();
  const tab = t.tabs[i];
  closed.push({ tab: id === t.active ? { ...tab, saved: cur } : tab, at: Date.now() });
  if (closed.length > 20) closed.shift();
  if (t.tabs.length === 1) {
    const fresh = `t${t.next}`;
    workspaceTabs.set({ tabs: [{ id: fresh }], active: fresh, next: t.next + 1 });
    terminal.set(freshWorkspace(cur));
    return;
  }
  const tabs = t.tabs.filter((x) => x.id !== id);
  if (id !== t.active) {
    workspaceTabs.set({ ...t, tabs });
    return;
  }
  const to = tabs[Math.min(i, tabs.length - 1)];
  workspaceTabs.set({ ...t, active: to.id, tabs: tabs.map((x) => (x.id === to.id ? bare(x) : x)) });
  terminal.set(opened(to.saved, cur));
}

/** Reopens the tab closed last, with its workspace, after the others. */
export function reopenClosedTab(): boolean {
  const last = closed.pop();
  const t = workspaceTabs.get();
  if (!last || t.tabs.length >= MAX_TABS) {
    if (last) closed.push(last);
    return false;
  }
  const cur = terminal.get();
  const id = `t${t.next}`;
  workspaceTabs.set({ tabs: [...t.tabs.map((x) => (x.id === t.active ? { ...x, saved: cur } : x)), { ...(last.tab.name ? { name: last.tab.name } : {}), id }], active: id, next: t.next + 1 });
  terminal.set(opened(last.tab.saved, cur));
  return true;
}

/** Names a tab; an empty name goes back to naming it after its screen. */
export function renameTab(id: string, name: string): void {
  const clean = name.replace(/\s+/g, ' ').trim().slice(0, 40);
  workspaceTabs.set((t) => ({ ...t, tabs: t.tabs.map((x) => (x.id === id ? { id: x.id, ...(clean ? { name: clean } : {}), ...(x.saved ? { saved: x.saved } : {}) } : x)) }));
}

/** Moves a tab to another place in the strip (dragging it). */
export function moveTab(id: string, toIndex: number): void {
  workspaceTabs.set((t) => {
    const from = t.tabs.findIndex((x) => x.id === id);
    if (from < 0) return t;
    const tabs = [...t.tabs];
    const [tab] = tabs.splice(from, 1);
    tabs.splice(Math.max(0, Math.min(toIndex, tabs.length)), 0, tab);
    return tabs.every((x, i) => x === t.tabs[i]) ? t : { ...t, tabs };
  });
}

const DEFAULT_SCREENS = JSON.stringify(defaultTerminal().panels.map((p) => p.history));

/**
 * What a tab is called: its name, else "New Tab" while its workspace is the untouched default, else its active
 * screen ("AAPL CHART"), as a browser names a tab after its page.
 */
export function tabTitle(tab: WorkspaceTab, live: TerminalState | undefined): string {
  if (tab.name) return tab.name;
  const s = live ?? tab.saved;
  if (!s || !Array.isArray(s.panels)) return 'New Tab';
  if (JSON.stringify(s.panels.map((p) => p.history)) === DEFAULT_SCREENS) return 'New Tab';
  const r = currentRoute(s, s.active);
  return `${r.sec ? `${r.sec.split(' ')[0]} ` : ''}${r.fn}`;
}

/** The route a tab names: its active panel's, or none while the tab is untouched ("New Tab"). */
export function tabRoute(tab: WorkspaceTab, live: TerminalState | undefined) {
  const s = live ?? tab.saved;
  if (!s || !Array.isArray(s.panels) || JSON.stringify(s.panels.map((p) => p.history)) === DEFAULT_SCREENS) return undefined;
  return currentRoute(s, s.active);
}

/** For the tests: forget the tabs closed in this session. */
export function forgetClosedTabs(): void {
  closed.length = 0;
}
