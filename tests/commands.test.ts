import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCommand } from '../src/terminal/commands';
import { FUNCTIONS, lookupFn } from '../src/terminal/registry';
import { resolveSecurity, searchSecurities } from '../src/data/registry';
import { engine } from '../src/data/market';
import * as onlineLookup from '../src/data/live/lookup';
import { execute } from '../src/terminal/exec';
import { suggest } from '../src/terminal/suggest';
import { argsWith, LEGACY_CODES, migrateRoute, primaryMnemonic, styledMnemonic } from '../src/terminal/legacy';
import { currentRoute, renameSavedCodes, defaultTerminal, terminal } from '../src/terminal/state';

const parse = (s: string) => parseCommand(s, lookupFn);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe('mnemonic command aliases', () => {
  it('maps every mnemonic to the existing canonical function and its help metadata', () => {
    const old = new Set(Object.keys(LEGACY_CODES));
    for (const fn of FUNCTIONS) {
      expect(old.has(fn.code), fn.code).toBe(false);
    }
    for (const [alias, canonical] of Object.entries(LEGACY_CODES)) {
      expect(lookupFn(alias), alias).toBe(lookupFn(canonical));
      expect(lookupFn(canonical)?.aliases, canonical).toContain(alias);
      expect(parse(alias), alias).toEqual({ kind: 'route', fn: canonical });
      expect(parse(`${alias} AAPL`), alias).toEqual(parse(`${canonical} AAPL`));
      expect(parse(`AAPL US EQUITY ${alias}`), alias).toEqual(parse(`AAPL US EQUITY ${canonical}`));
    }
  });

  it('runs mnemonics with the same arguments and HELP workflows', () => {
    expect(parse('gp nvda 1d')).toMatchObject({ kind: 'route', fn: 'CHART', args: '1D', sec: { id: 'NVDA US Equity' } });
    expect(parse('AAPL US <EQUITY> GP 5Y <GO>')).toMatchObject({ kind: 'route', fn: 'CHART', args: '5Y', sec: { id: 'AAPL US Equity' } });
    expect(parse('WATCH TECH')).toEqual({ kind: 'route', fn: 'WATCHLIST', args: 'TECH' });
    expect(parse('W TECH')).toEqual({ kind: 'route', fn: 'WORKSHEET', args: 'TECH' });
    expect(parse('WEI US')).toEqual({ kind: 'route', fn: 'MARKET', args: 'US' });
    expect(parse('N AAPL')).toMatchObject({ kind: 'route', fn: 'NEWS', sec: { id: 'AAPL US Equity' } });
    expect(parse('HELP GP')).toEqual({ kind: 'route', fn: 'HELP', args: 'CHART' });
    expect(parse('GP?')).toEqual({ kind: 'help', topic: 'CHART' });
    expect(parse('HELP N')).toEqual({ kind: 'route', fn: 'HELP', args: 'NEWS' });
  });

  it('opens the top market news on TOP and keeps the official announcements under their own name', () => {
    expect(parse('TOP')).toEqual({ kind: 'route', fn: 'MARKETNEWS' });
    expect(parse('TOP <GO>')).toEqual({ kind: 'route', fn: 'MARKETNEWS' });
    expect(parse('HELP TOP')).toEqual({ kind: 'route', fn: 'HELP', args: 'MARKETNEWS' });
    expect(lookupFn('MARKETNEWS')?.aliases).toContain('TOP');
    expect(lookupFn('HEADLINES')?.aliases).not.toContain('TOP');
    expect(parse('HEADLINES')).toEqual({ kind: 'route', fn: 'HEADLINES' });
    expect(parse('ANNOUNCEMENTS')).toEqual({ kind: 'route', fn: 'HEADLINES' });
  });

  it('keeps explicit securities ahead of colliding mnemonic names before and after lookup', () => {
    const base = resolveSecurity('AAPL')!;
    for (const ticker of ['N', 'W']) {
      const text = `${ticker} US EQUITY`;
      expect(parse(text)).toMatchObject({ kind: 'error', lookup: ticker });
      expect(parse(`${ticker} EQUITY GP`)).toMatchObject({ kind: 'error', lookup: ticker });
      expect(parse(`GP ${text}`)).toMatchObject({ kind: 'error', lookup: ticker });
      engine.addSecurity({ ...base, id: `${ticker} US Equity`, ticker: `${ticker} US`, name: `${ticker} test equity`, alias: [] });
      expect(parse(text)).toMatchObject({ kind: 'route', sec: { id: `${ticker} US Equity` } });
      expect(parse(`${text} GP`)).toMatchObject({ kind: 'route', fn: 'CHART', sec: { id: `${ticker} US Equity` } });
      expect(parse(`GP ${text}`)).toMatchObject({ kind: 'route', fn: 'CHART', sec: { id: `${ticker} US Equity` } });
      expect(parse(`HELP ${ticker}`)).toEqual({ kind: 'route', fn: 'HELP', args: LEGACY_CODES[ticker] });
      expect(parse(ticker)).toEqual({ kind: 'route', fn: LEGACY_CODES[ticker] });
    }
    expect(parse('W 1 COMDTY GP')).toMatchObject({ kind: 'route', fn: 'CHART', sec: { id: 'W 1 Comdty' } });
  });

  it('preserves the requested function and arguments when unknown tickers are registered', () => {
    const commands = ['GP ZZZQ 1D', 'ZZZQ GP 1D', 'ZZZQ US EQUITY GP 1D'];
    for (const text of commands) expect(parse(text), text).toMatchObject({ kind: 'error', lookup: 'ZZZQ' });
    const base = resolveSecurity('AAPL')!;
    engine.addSecurity({ ...base, id: 'ZZZQ US Equity', ticker: 'ZZZQ US', name: 'Online test equity', alias: [] });
    for (const text of commands) {
      expect(parse(text), text).toMatchObject({ kind: 'route', fn: 'CHART', args: '1D', sec: { id: 'ZZZQ US Equity' } });
    }
  });

  it('reruns the original mnemonic command after an asynchronous online lookup', async () => {
    const before = terminal.get();
    const def = { ...resolveSecurity('AAPL')!, id: 'QZZX US Equity', ticker: 'QZZX US', name: 'Looked up test equity', alias: [] };
    vi.spyOn(onlineLookup, 'lookupSource').mockReturnValue('yahoo');
    const lookup = vi.spyOn(onlineLookup, 'lookupSecurity').mockImplementation(async () => {
      engine.addSecurity(def);
      return { ok: true, def };
    });
    try {
      expect(execute(0, 'GP QZZX 1D')).toBe(true);
      await vi.waitFor(() => expect(currentRoute(terminal.get(), 0)).toEqual({ fn: 'CHART', sec: 'QZZX US Equity', args: '1D' }));
      expect(lookup).toHaveBeenCalledWith('QZZX');
    } finally {
      terminal.set(before);
    }
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

  it('keeps a screen saved as TOP on the official announcements it showed', () => {
    expect(migrateRoute({ fn: 'TOP', args: 'CB' })).toEqual({ fn: 'HEADLINES', args: 'CB' });
    const old = { ...defaultTerminal(), panels: [{ history: [{ fn: 'TOP' }], idx: 0 }], recentFns: ['TOP', 'MARKETNEWS'] };
    const s = renameSavedCodes(old);
    expect(s.panels[0].history).toEqual([{ fn: 'HEADLINES' }]);
    expect(s.recentFns).toEqual(['HEADLINES', 'MARKETNEWS']);
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

  it('completes mnemonic aliases to canonical functions and ranks exact aliases first', () => {
    // An online ticker source must not steal exact function mnemonics.
    vi.stubGlobal('window', { arminDesktop: { yahoo: vi.fn() } });
    for (const [alias, canonical] of Object.entries(LEGACY_CODES)) {
      expect(suggest(alias)[0], alias).toMatchObject({ kind: 'fn', primary: canonical, execute: canonical });
      expect(suggest(`${alias} `)[0], alias).toMatchObject({ kind: 'fn', primary: canonical, execute: canonical });
    }
    expect(suggest('HELP GP')[0]).toMatchObject({ kind: 'fn', primary: 'CHART', execute: 'HELP CHART' });
    expect(suggest('AAPL US EQUITY GP')[0]).toMatchObject({ kind: 'fn', primary: 'CHART', execute: 'AAPL US Equity CHART' });
    expect(suggest('EURUSD CRNCY FA')).toEqual([]);
    expect(suggest('ZZZX')[0]).toMatchObject({ kind: 'sec', key: 'online:ZZZX', execute: 'ZZZX US EQUITY' });
  });
});

describe('codes from the reference guides that name screens the app has', () => {
  it('opens HELP for HL (help search), RELEASES for WECO (world economic calendars) and BONDS for SOVM (sovereign debt)', () => {
    expect(parse('HL')).toEqual({ kind: 'route', fn: 'HELP' });
    expect(parse('HL dividend yield')).toEqual({ kind: 'route', fn: 'HELP', args: 'DIVIDEND YIELD' });
    expect(parse('WECO')).toEqual({ kind: 'route', fn: 'RELEASES' });
    expect(parse('SOVM')).toEqual({ kind: 'route', fn: 'BONDS' });
    // The screens keep their own names in their headers.
    expect(primaryMnemonic('RELEASES')).toBe('ECO');
    expect(primaryMnemonic('BONDS')).toBe('WB');
  });

  it('opens DOCSEARCH for DSCO (Document Search), keeping DS as its name', () => {
    expect(parse('DSCO')).toEqual({ kind: 'route', fn: 'DOCSEARCH' });
    expect(parse('AAPL US Equity DSCO')).toMatchObject({ kind: 'route', fn: 'DOCSEARCH', sec: expect.objectContaining({ id: 'AAPL US Equity' }) });
    expect(primaryMnemonic('DOCSEARCH')).toBe('DS');
  });

  it('opens ECONSTATS for GEW (key economic statistics by country) and ALERTS for NLRT (news alerts)', () => {
    expect(parse('GEW')).toEqual({ kind: 'route', fn: 'ECONSTATS' });
    expect(parse('NLRT')).toEqual({ kind: 'route', fn: 'ALERTS' });
    expect(primaryMnemonic('ECONSTATS')).toBe('ECST');
    expect(primaryMnemonic('ALERTS')).toBe('ALRT');
  });

  it('reads a mnemonic that is also a US ticker, followed by US, as the stock', () => {
    // Bio-Techne, Hecla Mining and the iShares fund, looked up online with the function typed after them.
    expect(parse('TECH US')).toMatchObject({ kind: 'error', lookup: 'TECH' });
    expect(parse('TECH US DES')).toMatchObject({ kind: 'error', lookup: 'TECH' });
    expect(parse('HL US')).toMatchObject({ kind: 'error', lookup: 'HL' });
    expect(parse('IYC US CHART')).toMatchObject({ kind: 'error', lookup: 'IYC' });
    // On their own or before anything else they are the functions; other mnemonics keep a region after them.
    expect(parse('TECH')).toEqual({ kind: 'route', fn: 'STUDIES' });
    expect(parse('HL dividends')).toEqual({ kind: 'route', fn: 'HELP', args: 'DIVIDENDS' });
    expect(parse('IYC')).toEqual({ kind: 'route', fn: 'CURVEMENU' });
    expect(parse('WEI US')).toEqual({ kind: 'route', fn: 'MARKET', args: 'US' });
  });
});

describe('terminal mnemonics added in 2.13', () => {
  it('opens the existing workflows under their terminal mnemonics', () => {
    const cases: [string, string][] = [
      ['CF', 'FILINGS'], ['ERN', 'EARNINGS'], ['NSE', 'NEWS'], ['EQRV', 'PEERS'], ['OWN', 'HOLDERS'],
      ['QR', 'TRADES'], ['HVG', 'VOLATILITY'], ['PDF', 'SETTINGS'], ['EXCH', 'EXCHANGES'],
    ];
    for (const [alias, code] of cases) {
      expect(LEGACY_CODES[alias], alias).toBe(code);
      expect(parse(alias), alias).toEqual({ kind: 'route', fn: code });
    }
    expect(parse('CF MSFT')).toMatchObject({ kind: 'route', fn: 'FILINGS', sec: { id: 'MSFT US Equity' } });
    expect(parse('AAPL US EQUITY ERN')).toMatchObject({ kind: 'route', fn: 'EARNINGS', sec: { id: 'AAPL US Equity' } });
  });

  it('keeps the first mnemonic of a function as the one its header shows', () => {
    expect(primaryMnemonic('EARNINGS')).toBe('EE');
    expect(primaryMnemonic('HOLDERS')).toBe('HDS');
    expect(primaryMnemonic('TRADES')).toBe('TAS');
    expect(primaryMnemonic('CHART')).toBe('GP');
    // CF is typed for FILINGS, but the SEC-only screen keeps its own name.
    expect(primaryMnemonic('FILINGS')).toBe('FILINGS');
    expect(primaryMnemonic('SETTINGS')).toBe('PDF');
    expect(primaryMnemonic('EXCHANGES')).toBe('EXCH');
  });

  it('opens GPO as a bar chart and GPC as a candlestick chart, with any typed period after the style', () => {
    expect(parse('GPC')).toEqual({ kind: 'route', fn: 'CHART', args: 'CANDLE' });
    expect(parse('GPO AAPL')).toMatchObject({ kind: 'route', fn: 'CHART', args: 'BAR', sec: { id: 'AAPL US Equity' } });
    expect(parse('GPC AAPL 3M')).toMatchObject({ kind: 'route', fn: 'CHART', args: 'CANDLE 3M', sec: { id: 'AAPL US Equity' } });
    expect(parse('AAPL GPC 5Y')).toMatchObject({ kind: 'route', fn: 'CHART', args: 'CANDLE 5Y', sec: { id: 'AAPL US Equity' } });
    expect(parse('AAPL US EQUITY GPO')).toMatchObject({ kind: 'route', fn: 'CHART', args: 'BAR', sec: { id: 'AAPL US Equity' } });
    expect(parse('GP AAPL 5Y')).toMatchObject({ kind: 'route', fn: 'CHART', args: '5Y' });
    expect(parse('HELP GPC')).toEqual({ kind: 'route', fn: 'HELP', args: 'CHART' });
    // Choosing GPC from the suggestions keeps the candles.
    expect(suggest('GPC')[0]).toMatchObject({ kind: 'fn', primary: 'CHART', execute: 'GPC' });
    expect(suggest('AAPL US EQUITY GPO')[0]).toMatchObject({ kind: 'fn', primary: 'CHART', execute: 'AAPL US Equity GPO' });
  });

  it('shows a styled chart under its own mnemonic', () => {
    expect(styledMnemonic('CHART', 'CANDLE 3M')).toEqual({ mnemonic: 'GPC', args: '3M' });
    expect(styledMnemonic('CHART', 'BAR')).toEqual({ mnemonic: 'GPO' });
    expect(styledMnemonic('CHART', '5Y')).toEqual({ mnemonic: 'GP', args: '5Y' });
    expect(styledMnemonic('PROFILE')).toEqual({ mnemonic: 'DES' });
    expect(argsWith('GPC', '1Y')).toBe('CANDLE 1Y');
    expect(argsWith('GP', '')).toBeUndefined();
  });

  it('runs RSI, MACD and BOLL as charts with that study, as the terminal does', () => {
    expect(parse('AAPL RSI')).toMatchObject({ kind: 'route', fn: 'CHART', args: 'RSI', sec: { id: 'AAPL US Equity' } });
    expect(parse('MACD AAPL 6M')).toMatchObject({ kind: 'route', fn: 'CHART', args: 'MACD 6M', sec: { id: 'AAPL US Equity' } });
    expect(parse('BOLL')).toEqual({ kind: 'route', fn: 'CHART', args: 'BOLL' });
    expect(styledMnemonic('CHART', 'RSI 1Y')).toEqual({ mnemonic: 'RSI', args: '1Y' });
    expect(suggest('BOLL')[0]).toMatchObject({ kind: 'fn', primary: 'CHART', execute: 'BOLL' });
  });

  it('accepts EVT, ECMX and FOMC', () => {
    expect(parse('EVT')).toEqual({ kind: 'route', fn: 'EVENTS' });
    expect(parse('ECMX')).toEqual({ kind: 'route', fn: 'ECONSTATS' });
    expect(parse('FOMC')).toEqual({ kind: 'route', fn: 'FEDMEETINGS' });
    // Headers keep the mnemonic the terminal's menus list first.
    expect(primaryMnemonic('EVENTS')).toBe('EVTS');
    expect(primaryMnemonic('ECONSTATS')).toBe('ECST');
    expect(primaryMnemonic('FEDMEETINGS')).toBe('FOMC');
  });
});
