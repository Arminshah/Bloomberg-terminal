import { beforeEach, describe, expect, it } from 'vitest';
import { defaultTerminal, navigate, terminal } from '../src/terminal/state';
import { closeTab, cycleTab, forgetClosedTabs, MAX_TABS, moveTab, newTab, renameTab, reopenClosedTab, switchTab, tabByNumber, tabTitle, workspaceTabs } from '../src/terminal/tabs';

const active = () => workspaceTabs.get().active;
const ids = () => workspaceTabs.get().tabs.map((t) => t.id);
const screen = (panel = 0) => {
  const p = terminal.get().panels[panel];
  return p.history[p.idx];
};

beforeEach(() => {
  workspaceTabs.set({ tabs: [{ id: 't1' }], active: 't1', next: 2 });
  terminal.set(defaultTerminal());
  forgetClosedTabs();
});

describe('workspace tabs', () => {
  it('opens a new tab with a fresh workspace and keeps the first tab\'s screens for when it comes back', () => {
    navigate(0, { fn: 'PROFILE', sec: 'AAPL US Equity' });
    expect(newTab()).toBe(true);
    expect(ids()).toEqual(['t1', 't2']);
    expect(active()).toBe('t2');
    // A new tab opens on WELC, the new-tab page (TE01 01:57), in the default layout: the watchlist stays in panel 5.
    expect(screen()).toEqual({ fn: 'WELCOME' });
    expect(terminal.get().layout).toBe(defaultTerminal().layout);
    expect(terminal.get().panels[4].history[0]).toEqual({ fn: 'WATCHLIST' });
    expect(tabTitle(workspaceTabs.get().tabs[1], terminal.get())).toBe('New Tab');
    // The user's recent securities follow them into the new tab.
    expect(terminal.get().recentSecs[0]).toBe('AAPL US Equity');
    navigate(0, { fn: 'CHART', sec: 'MSFT US Equity' });
    switchTab('t1');
    expect(screen()).toEqual({ fn: 'PROFILE', sec: 'AAPL US Equity' });
    expect(terminal.get().panels[0].history.length).toBe(2); // its back history too
    switchTab('t2');
    expect(screen()).toEqual({ fn: 'CHART', sec: 'MSFT US Equity' });
  });

  it('names a tab after its active screen, "New Tab" while untouched, or the name the user gave', () => {
    expect(tabTitle(workspaceTabs.get().tabs[0], terminal.get())).toBe('New Tab');
    navigate(0, { fn: 'CHART', sec: 'AAPL US Equity' });
    expect(tabTitle(workspaceTabs.get().tabs[0], terminal.get())).toBe('AAPL CHART');
    renameTab('t1', '  EQUITY_LONG  ');
    expect(tabTitle(workspaceTabs.get().tabs[0], terminal.get())).toBe('EQUITY_LONG');
    renameTab('t1', '');
    expect(tabTitle(workspaceTabs.get().tabs[0], terminal.get())).toBe('AAPL CHART');
    newTab();
    // A tab not on screen is named from its saved workspace.
    expect(tabTitle(workspaceTabs.get().tabs[0], undefined)).toBe('AAPL CHART');
  });

  it('closes the tab on screen to the one on its right, else its left, and never leaves the window empty', () => {
    newTab();
    newTab();
    switchTab('t2');
    closeTab('t2');
    expect(ids()).toEqual(['t1', 't3']);
    expect(active()).toBe('t3');
    closeTab('t3');
    expect(active()).toBe('t1');
    navigate(0, { fn: 'PROFILE', sec: 'AAPL US Equity' });
    closeTab('t1');
    expect(ids()).toEqual(['t4']);
    expect(screen()).toEqual({ fn: 'WELCOME' });
  });

  it('closes a tab in the background without touching the one on screen', () => {
    navigate(0, { fn: 'PROFILE', sec: 'AAPL US Equity' });
    newTab();
    navigate(0, { fn: 'CHART', sec: 'NVDA US Equity' });
    closeTab('t1');
    expect(ids()).toEqual(['t2']);
    expect(screen()).toEqual({ fn: 'CHART', sec: 'NVDA US Equity' });
  });

  it('reopens the last closed tab with its screens and name', () => {
    navigate(0, { fn: 'PROFILE', sec: 'AAPL US Equity' });
    renameTab('t1', 'Research');
    newTab();
    closeTab('t1');
    expect(reopenClosedTab()).toBe(true);
    expect(workspaceTabs.get().tabs.at(-1)).toMatchObject({ name: 'Research' });
    expect(screen()).toEqual({ fn: 'PROFILE', sec: 'AAPL US Equity' });
    expect(reopenClosedTab()).toBe(false);
  });

  it('moves between tabs with the browser keys\' order and reorders by dragging', () => {
    newTab();
    newTab();
    cycleTab(1);
    expect(active()).toBe('t1'); // wraps round
    cycleTab(-1);
    expect(active()).toBe('t3');
    tabByNumber(2);
    expect(active()).toBe('t2');
    tabByNumber(9);
    expect(active()).toBe('t3');
    moveTab('t3', 0);
    expect(ids()).toEqual(['t3', 't1', 't2']);
    expect(active()).toBe('t3');
  });

  it('stops at the maximum number of tabs', () => {
    for (let i = 1; i < MAX_TABS; i++) expect(newTab()).toBe(true);
    expect(newTab()).toBe(false);
    expect(ids().length).toBe(MAX_TABS);
  });
});
