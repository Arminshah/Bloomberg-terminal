import { beforeEach, describe, expect, it } from 'vitest';
import { lookupFn } from '../src/terminal/registry';
import { applyPreset, back, broadcastSecurity, currentRoute, defaultTerminal, forward, linkGroupOf, navigate, setLayout, setLinkGroup, terminal, type LinkGroup } from '../src/terminal/state';
import { primaryMnemonic } from '../src/terminal/legacy';
import { openSecurity } from '../src/components/cells';
import { execute } from '../src/terminal/exec';

const AAPL = 'AAPL US Equity', MSFT = 'MSFT US Equity', EUR = 'EURUSD Curncy';
const route = (panel: number) => currentRoute(terminal.get(), panel);

beforeEach(() => {
  terminal.set(defaultTerminal());
  applyPreset([{ fn: 'CHART', sec: AAPL, args: '1Y' }, { fn: 'FINANCIALS', sec: AAPL }, { fn: 'WATCHLIST' }, { fn: 'PROFILE', sec: AAPL }, { fn: 'PROFILE', sec: AAPL }], '5', [1, 1, 1, 2, 1]);
});

describe('panel security groups', () => {
  it('propagates a security while preserving each function, its arguments, group, and active panel', () => {
    navigate(0, { fn: 'CHART', sec: MSFT, args: '1M' });
    expect(route(1)).toEqual({ fn: 'FINANCIALS', sec: MSFT });
    expect(route(2)).toEqual({ fn: 'WATCHLIST' });
    expect(route(3).sec).toBe(AAPL);
    expect(route(4)).toEqual({ fn: 'PROFILE', sec: MSFT });
    expect(terminal.get().active).toBe(0);
    navigate(1, { fn: 'PROFILE', sec: AAPL });
    expect(route(0)).toEqual({ fn: 'CHART', sec: AAPL, args: '1M' });
    expect(linkGroupOf(terminal.get().panels[0])).toBe(1);
  });

  it('skips incompatible and hidden screens and leaves unlinked panels independent', () => {
    setLayout('4');
    navigate(0, { fn: 'CHART', sec: EUR });
    expect(route(1).sec).toBe(AAPL);
    expect(route(4).sec).toBe(AAPL);
    setLinkGroup(1, 0);
    navigate(0, { fn: 'CHART', sec: MSFT });
    expect(route(1).sec).toBe(AAPL);
    expect(broadcastSecurity(2, 'NOT REGISTERED')).toBe(false);
  });

  it('publishes watchlist selections without replacing the monitor, including repeated selections', () => {
    openSecurity(2, MSFT);
    expect(route(2)).toEqual({ fn: 'WATCHLIST' });
    expect(route(0)).toEqual({ fn: 'CHART', sec: MSFT, args: '1Y' });
    expect(route(1)).toEqual({ fn: 'FINANCIALS', sec: MSFT });
    openSecurity(2, MSFT);
    expect(route(2).fn).toBe('WATCHLIST');
    expect(terminal.get().active).toBe(2);
    expect(terminal.get().recentSecs[0]).toBe(MSFT);
    // An explicit requested screen still opens normally.
    openSecurity(2, AAPL, undefined, 'QUOTE');
    expect(route(2)).toEqual({ fn: 'QUOTE', sec: AAPL });
  });

  it('restores security through back/forward without moving the source history cursor or focus incorrectly', () => {
    navigate(0, { fn: 'CHART', sec: MSFT });
    const idx = terminal.get().panels[0].idx;
    back(0);
    expect(route(1).sec).toBe(AAPL);
    expect(terminal.get().panels[0].idx).toBe(idx - 1);
    forward(0);
    expect(route(1).sec).toBe(MSFT);
    expect(terminal.get().panels[0].idx).toBe(idx);
    expect(terminal.get().active).toBe(0);
  });

  it('bounds automatic history, preserves group on replacement and restores saved groups without rewriting routes', () => {
    for (let i = 0; i < 100; i++) navigate(0, { fn: 'CHART', sec: i % 2 ? AAPL : MSFT });
    expect(terminal.get().panels[1].history.length).toBeLessThanOrEqual(50);
    navigate(0, { fn: 'PROFILE', sec: MSFT }, true);
    expect(linkGroupOf(terminal.get().panels[0])).toBe(1);
    applyPreset([{ fn: 'GP', sec: AAPL }, { fn: 'DES', sec: MSFT }], '2', [3, 3]);
    expect(route(0)).toEqual({ fn: 'CHART', sec: AAPL });
    expect(route(1)).toEqual({ fn: 'PROFILE', sec: MSFT });
    expect(linkGroupOf(terminal.get().panels[0])).toBe(3);
    applyPreset([{ fn: 'MARKET' }], '1');
    expect(terminal.get().panels.every((p) => linkGroupOf(p) === 0)).toBe(true);
    setLinkGroup(0, 99 as LinkGroup);
    expect(linkGroupOf(terminal.get().panels[0])).toBe(0);
  });

  it('connects real command validation, mnemonic aliases and field-inspector eligibility', () => {
    expect(primaryMnemonic('CHART')).toBe('GP');
    expect(primaryMnemonic('FIELDS')).toBe('FLDS');
    expect(lookupFn('FLDS')?.code).toBe('FIELDS');
    expect(execute(0, 'MSFT FLDS PX_LAST')).toBe(true);
    expect(route(0)).toEqual({ fn: 'FIELDS', sec: MSFT, args: 'PX_LAST' });
    expect(route(1)).toEqual({ fn: 'FINANCIALS', sec: MSFT });
    expect(execute(1, 'EURUSD FA')).toBe(false);
    expect(route(0).sec).toBe(MSFT);
  });
});
