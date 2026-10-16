import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/terminal/commands';
import { FUNCTIONS, lookupFn } from '../src/terminal/registry';
import { searchSecurities } from '../src/data/registry';
import { suggest } from '../src/terminal/suggest';
import { LEGACY_CODES, migrateRoute } from '../src/terminal/legacy';
import { renameSavedCodes, defaultTerminal } from '../src/terminal/state';

const parse = (s: string) => parseCommand(s, lookupFn);

describe('command parser', () => {
  it('takes the function first, then the security and its arguments', () => {
    const p = parse('CHART NVDA 1D');
    expect(p).toMatchObject({ kind: 'route', fn: 'CHART', args: '1D' });
    expect(p.kind === 'route' && p.sec?.id).toBe('NVDA US Equity');
    const q = parse('quote aapl');
    expect(q).toMatchObject({ kind: 'route', fn: 'QUOTE' });
    expect(q.kind === 'route' && q.sec?.id).toBe('AAPL US Equity');
    expect(parse('FILINGS MSFT')).toMatchObject({ kind: 'route', fn: 'FILINGS' });
    const c = parse('CRYPTO BTC');
    expect(c.kind === 'route' && c.sec?.id).toBe('XBTUSD Curncy');
    expect(parse('WATCHLIST TECH')).toMatchObject({ kind: 'route', fn: 'WATCHLIST', args: 'TECH' });
    expect(parse('MARKET US')).toMatchObject({ kind: 'route', fn: 'MARKET', args: 'US' });
  });

  it('still takes the security first, then the function', () => {
    const p = parse('AAPL US <EQUITY> CHART <GO>');
    expect(p).toMatchObject({ kind: 'route', fn: 'CHART' });
    expect(p.kind === 'route' && p.sec?.id).toBe('AAPL US Equity');
    expect(parse('BTC INTRADAY')).toMatchObject({ kind: 'route', fn: 'INTRADAY' });
    const g = parse('gold');
    expect(g.kind === 'route' && g.sec?.id).toBe('GC1 Comdty');
  });

  it('keeps a market sector word with the security, whichever comes first', () => {
    const p = parse('CT10 GOVT BONDCALC');
    expect(p.kind === 'route' && p.sec?.yk).toBe('Govt');
    expect(p.kind === 'route' && p.fn).toBe('BONDCALC');
    const v = parse('BONDCALC CT10 GOVT');
    expect(v.kind === 'route' && v.sec?.yk).toBe('Govt');
    expect(v.kind === 'route' && v.fn).toBe('BONDCALC');
    const fx = parse('PROFILE EURUSD CRNCY');
    expect(fx.kind === 'route' && fx.sec?.id).toBe('EURUSD Curncy');
  });

  it('looks a ticker up online when a function that needs a security names one that is not built in', () => {
    expect(parse('CHART ZZZQ')).toMatchObject({ kind: 'error', lookup: 'ZZZQ' });
    // Functions that take free text keep it.
    expect(parse('NEWS ZZZQ')).toMatchObject({ kind: 'route', fn: 'NEWS', args: 'ZZZQ' });
  });

  it('handles bare functions, aliases, arguments and menu numbers', () => {
    expect(parse('HEADLINES')).toMatchObject({ kind: 'route', fn: 'HEADLINES' });
    expect(parse('chat')).toMatchObject({ kind: 'route', fn: 'MESSAGES' });
    expect(parse('NEWS CRYPTO')).toMatchObject({ kind: 'route', fn: 'NEWS', args: 'CRYPTO' });
    expect(parse('3 <GO>')).toEqual({ kind: 'menu', n: 3 });
    expect(parse('CHART?')).toEqual({ kind: 'help', topic: 'CHART' });
  });

  it('loads a bare security into its related functions menu', () => {
    const p = parse('IBM US <EQUITY> <GO>');
    expect(p).toMatchObject({ kind: 'route' });
    expect(p.kind === 'route' && p.sec?.id).toBe('IBM US Equity');
    expect(p.kind === 'route' && p.fn).toBeUndefined();
  });

  it('opens market sector menus and the portfolio', () => {
    expect(parse('EQUITY <GO>')).toEqual({ kind: 'route', fn: 'MENU', args: 'EQUITY' });
    expect(parse('<CRNCY>')).toEqual({ kind: 'route', fn: 'MENU', args: 'CURNCY' });
    expect(parse('M-MKT')).toEqual({ kind: 'route', fn: 'MENU', args: 'M-MKT' });
    expect(parse('CLIENT')).toEqual({ kind: 'route', fn: 'PORTFOLIO' });
  });

  it("lists an issuer's bonds", () => {
    expect(parse('AAPL <CORP> <GO>')).toEqual({ kind: 'route', fn: 'BONDSEARCH', args: 'AAPL CORP' });
    expect(parse('JPM CORP DEBTPROFILE')).toEqual({ kind: 'route', fn: 'DEBTPROFILE', args: 'JPM CORP' });
    expect(parse('DEBTPROFILE JPM CORP')).toEqual({ kind: 'route', fn: 'DEBTPROFILE', args: 'JPM CORP' });
    expect(parse('T GOVT')).toEqual({ kind: 'route', fn: 'BONDSEARCH', args: 'T GOVT' });
    const bond = parse('AAPL 4.65 02/23/46 CORP BONDCALC');
    expect(bond.kind === 'route' && bond.sec?.id).toBe('AAPL 4.65 02/23/46 Corp');
  });

  it('explains sectors that are not covered', () => {
    const p = parse('XYZ 4 01/01/30 MUNI');
    expect(p.kind).toBe('error');
    expect(p.kind === 'error' && p.message).toContain('not covered');
  });

  it('resolves futures, functions and HELP HELP', () => {
    const es = parse('ES1 INDEX INDEXFUTURES');
    expect(es.kind === 'route' && es.sec?.id).toBe('ES1 Index');
    expect(parse('HELP HELP')).toMatchObject({ kind: 'route', fn: 'HELP', args: 'HELP' });
    for (const code of ['BONDSEARCH', 'DEBTPROFILE', 'DEALERQUOTES', 'INDEXFUTURES', 'CONTRIB', 'TOTALRETURN', 'FUNDCHART', 'VOLATILITY', 'VWAP', 'FXFORWARD', 'FXOPTION', 'SWAPCALC', 'HOLIDAYS', 'CENTRALBANKS', 'MENU']) {
      expect(lookupFn(code)?.code, code).toBe(code);
    }
  });

  it('reports unknown input', () => {
    expect(parse('ZZZZZ')).toMatchObject({ kind: 'error' });
    expect(parse('AAPL US EQUITY NOPE')).toMatchObject({ kind: 'error' });
    expect(parse('   ')).toEqual({ kind: 'empty' });
  });
});

describe('renamed codes', () => {
  it('no function keeps a code or alias from the old list', () => {
    const old = new Set(Object.keys(LEGACY_CODES));
    for (const fn of FUNCTIONS) {
      expect(old.has(fn.code), fn.code).toBe(false);
      for (const a of fn.aliases ?? []) expect(old.has(a), `${fn.code} alias ${a}`).toBe(false);
    }
    // Every new name is a function.
    for (const now of Object.values(LEGACY_CODES)) expect(lookupFn(now)?.code, now).toBe(now);
  });

  it('says what an old code is called now, and runs nothing for it', () => {
    expect(parse('DES')).toMatchObject({ kind: 'error', message: expect.stringContaining('renamed PROFILE') });
    expect(parse('GP AAPL')).toMatchObject({ kind: 'error', message: expect.stringContaining('CHART AAPL') });
    expect(parse('AAPL US EQUITY GP')).toMatchObject({ kind: 'error', message: 'GP was renamed CHART' });
  });

  it('carries saved panels and recent functions over to the new names', () => {
    expect(migrateRoute({ fn: 'GP', sec: 'AAPL US Equity' })).toEqual({ fn: 'CHART', sec: 'AAPL US Equity' });
    expect(migrateRoute({ fn: 'FILINGS' })).toEqual({ fn: 'FILINGS' });
    const old = { ...defaultTerminal(), panels: [{ history: [{ fn: 'WEI' }, { fn: 'DES', sec: 'NVDA US Equity' }], idx: 1 }], recentFns: ['GP', 'DES', 'CHART'] };
    const s = renameSavedCodes(old);
    expect(s.panels[0].history).toEqual([{ fn: 'MARKET' }, { fn: 'PROFILE', sec: 'NVDA US Equity' }]);
    expect(s.recentFns).toEqual(['CHART', 'PROFILE']);
    expect(renameSavedCodes(defaultTerminal())).toEqual(defaultTerminal());
  });
});

describe('search and autocomplete', () => {
  it('ranks exact tickers first', () => {
    expect(searchSecurities('MSFT')[0].def.id).toBe('MSFT US Equity');
    expect(searchSecurities('nvid')[0].def.id).toBe('NVDA US Equity');
  });

  it('suggests functions for a loaded security', () => {
    const s = suggest('AAPL US EQUITY ');
    expect(s.length).toBeGreaterThan(5);
    expect(s.every((x) => x.kind === 'fn')).toBe(true);
    expect(s.some((x) => x.primary === 'FINANCIALS')).toBe(true);
    const fx = suggest('EURUSD CRNCY ');
    expect(fx.some((x) => x.primary === 'FINANCIALS')).toBe(false);
  });

  it('mixes securities and functions for free text', () => {
    const s = suggest('CHART');
    expect(s[0]).toMatchObject({ kind: 'fn', primary: 'CHART' });
  });
});
