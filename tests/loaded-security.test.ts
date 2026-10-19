import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execute } from '../src/terminal/exec';
import { back, broadcastSecurity, currentRoute, defaultTerminal, forward, loadedSecurity, navigate, setLinkGroup, terminal } from '../src/terminal/state';

const AAPL = 'AAPL US Equity';
const MSFT = 'MSFT US Equity';

beforeEach(() => terminal.set(defaultTerminal()));
afterEach(() => terminal.set(defaultTerminal()));

describe('loaded panel security', () => {
  it('survives global functions, sector menus and help without changing their scope', () => {
    expect(execute(0, 'AAPL DES')).toBe(true);
    expect(execute(0, 'WEI')).toBe(true);
    expect(currentRoute(terminal.get(), 0)).toEqual({ fn: 'MARKET' });
    expect(execute(0, 'GP')).toBe(true);
    expect(currentRoute(terminal.get(), 0)).toMatchObject({ fn: 'CHART', sec: AAPL });
    expect(execute(0, 'EQUITY')).toBe(true);
    expect(currentRoute(terminal.get(), 0)).toMatchObject({ fn: 'MENU', args: 'EQUITY', sec: undefined });
    expect(execute(0, 'HELP GP')).toBe(true);
    expect(currentRoute(terminal.get(), 0)).toMatchObject({ fn: 'HELP', args: 'CHART', sec: AAPL });
    expect(execute(0, 'DES?')).toBe(true);
    expect(currentRoute(terminal.get(), 0)).toMatchObject({ fn: 'HELP', args: 'PROFILE', sec: AAPL });
    expect(execute(0, 'MENU')).toBe(true);
    expect(currentRoute(terminal.get(), 0)).toMatchObject({ fn: 'MENU', sec: AAPL, args: undefined });
  });

  it('persists the selection beyond bounded history and updates only after a valid selection', () => {
    expect(execute(0, 'AAPL DES')).toBe(true);
    for (let i = 0; i < 60; i++) navigate(0, { fn: 'MARKET', args: String(i) });
    expect(terminal.get().panels[0].history).toHaveLength(50);
    expect(terminal.get().panels[0].history.every((r) => !r.sec)).toBe(true);
    // Round-trip the persisted panel schema, including the independent loaded security.
    terminal.set(JSON.parse(JSON.stringify(terminal.get())));
    expect(execute(0, 'FA')).toBe(true);
    expect(currentRoute(terminal.get(), 0).sec).toBe(AAPL);
    expect(execute(0, 'EURUSD FA')).toBe(false);
    expect(loadedSecurity(terminal.get(), 0)).toBe(AAPL);
    expect(execute(0, 'MSFT DES')).toBe(true);
    expect(execute(0, 'TOP')).toBe(true);
    expect(execute(0, 'GP')).toBe(true);
    expect(currentRoute(terminal.get(), 0).sec).toBe(MSFT);
  });

  it('keeps each panel independent and does not borrow a default security from another panel', () => {
    expect(loadedSecurity(terminal.get(), 0)).toBeUndefined();
    expect(execute(0, 'GP')).toBe(false);
    expect(loadedSecurity(terminal.get(), 1)).toBe(AAPL);
    expect(execute(0, 'MSFT DES')).toBe(true);
    expect(execute(1, 'WEI')).toBe(true);
    expect(execute(1, 'GP')).toBe(true);
    expect(currentRoute(terminal.get(), 1).sec).toBe(AAPL);
  });

  it('restores older saved workspaces using only visited routes before the history cursor', () => {
    const saved = defaultTerminal();
    saved.panels[0] = { history: [{ fn: 'PROFILE', sec: AAPL }, { fn: 'MARKET' }, { fn: 'PROFILE', sec: MSFT }], idx: 1 };
    terminal.set(saved);
    expect(loadedSecurity(terminal.get(), 0)).toBe(AAPL);
    expect(execute(0, 'GP')).toBe(true);
    expect(currentRoute(terminal.get(), 0).sec).toBe(AAPL);
  });

  it('tracks security history and linked monitor selections while keeping the monitor visible', () => {
    expect(execute(0, 'AAPL DES')).toBe(true);
    expect(execute(0, 'MSFT DES')).toBe(true);
    back(0);
    expect(loadedSecurity(terminal.get(), 0)).toBe(AAPL);
    forward(0);
    expect(loadedSecurity(terminal.get(), 0)).toBe(MSFT);
    navigate(2, { fn: 'WATCHLIST' });
    setLinkGroup(0, 1);
    setLinkGroup(2, 1);
    expect(broadcastSecurity(2, AAPL)).toBe(true);
    expect(currentRoute(terminal.get(), 2)).toEqual({ fn: 'WATCHLIST' });
    expect(loadedSecurity(terminal.get(), 2)).toBe(AAPL);
    expect(loadedSecurity(terminal.get(), 0)).toBe(AAPL);
  });
});
