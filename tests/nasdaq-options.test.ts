import { describe, expect, it } from 'vitest';
import { nasdaqOptionChainRequest, nasdaqOptionProblem } from '../electron/nasdaq.cjs';
import { nasdaqChainAnswer, nasdaqFigure, nasdaqOptionSymbol, nasdaqUnderlying, parseNasdaqChain } from '../src/data/live/nasdaq-options';
import { optionExpiryAt, optionTicker, quotesTime } from '../src/functions/OptionMonitor';
import type { KeyedAnswer } from '../src/data/live/lookup';
import type { SecurityDef } from '../src/data/types';

// Synthetic answers in the layout nasdaq.com's option-chain page used on 31 October 2026: a heading row per expiry,
// then one row per strike with the call (c_) and put (p_) side, figures as text, "--" for none, and the call's
// OCC symbol at the end of its link (the root padded with dashes to six characters).
type SideFigures = Partial<Record<'Last' | 'Change' | 'Bid' | 'Ask' | 'Volume' | 'Openinterest', string>>;
const side = (prefix: 'c_' | 'p_', f: SideFigures) => Object.fromEntries((['Last', 'Change', 'Bid', 'Ask', 'Volume', 'Openinterest'] as const).map((k) => [`${prefix}${k}`, f[k] ?? '--']));
const row = (strike: string, link: string, call: SideFigures, put: SideFigures, expiryDate = 'Nov 20') => ({
  expirygroup: '', expiryDate, ...side('c_', call), c_colour: true, strike, ...side('p_', put), p_colour: false,
  drillDownURL: `/market-activity/stocks/xyz/option-chain/call-put-options/${link}`,
});
const heading = (group: string) => ({ expirygroup: group, expiryDate: null, ...side('c_', {}), strike: null, ...side('p_', {}), drillDownURL: null });
const answer = (rows: unknown[], lastTrade = 'LAST TRADE: $251.40 (AS OF OCT 30, 2026)') => JSON.stringify({
  data: { totalRecord: rows.length, lastTrade, table: { asOf: null, headers: { strike: 'Strike' }, rows }, filterlist: {} }, message: null, status: { rCode: 200, bCodeMessage: null, developerMessage: null },
});
const notFound = JSON.stringify({ data: null, message: null, status: { rCode: 400, bCodeMessage: [{ code: 1001, errorMessage: 'Symbol not exists.' }], developerMessage: null } });

describe('the request for a chain', () => {
  it('builds only the one option-chain URL, for a stock, an ETF or one of the two Nasdaq indices', () => {
    expect(nasdaqOptionChainRequest('MSFT', 'stocks')).toEqual({
      url: 'https://api.nasdaq.com/api/quote/MSFT/option-chain?assetclass=stocks&limit=10000&fromdate=all&excode=oprac&callput=callput&money=all&type=all',
      ttl: 60_000, headers: { Accept: 'application/json, text/plain, */*' },
    });
    expect(nasdaqOptionChainRequest('SPY', 'etf')?.url).toContain('/quote/SPY/option-chain?assetclass=etf&');
    expect(nasdaqOptionChainRequest('BRK.B', 'stocks')?.url).toContain('/quote/BRK.B/option-chain?');
    expect(nasdaqOptionChainRequest('NDX', 'index')?.url).toContain('/quote/NDX/option-chain?assetclass=index&');
    expect(nasdaqOptionChainRequest('XND', 'index')).not.toBeNull();
  });

  it('refuses any other symbol, class or shape', () => {
    for (const [symbol, assetClass] of [['SPX', 'index'], ['MSFT', 'index'], ['NDX', 'stocks2'], ['msft', 'stocks'], ['MSFT/../x', 'stocks'], ['MSFT?a=1', 'etf'], ['', 'stocks'], [1, 'stocks'], ['MSFT', undefined]]) {
      expect(nasdaqOptionChainRequest(symbol, assetClass)).toBeNull();
    }
  });

  it("takes Nasdaq's 'Symbol not exists' as an answer, and a missing table as a changed format", () => {
    expect(nasdaqOptionProblem(notFound)).toBeNull();
    expect(nasdaqOptionProblem(answer([]))).toBeNull();
    expect(nasdaqOptionProblem(JSON.stringify({ data: null, status: { rCode: 400, bCodeMessage: [{ code: 1002, errorMessage: 'Invalid request' }] } }))).toBe('Nasdaq refused the request (Invalid request).');
    expect(nasdaqOptionProblem(JSON.stringify({ data: { rows: [] }, status: { rCode: 200 } }))).toBe('Nasdaq changed the option chain format.');
    expect(nasdaqOptionProblem('<html>')).toBe('Nasdaq returned a page that is not JSON.');
  });
});

describe("Nasdaq's figures", () => {
  it('reads text figures with thousands separators and signs, and "--" as nothing', () => {
    expect(nasdaqFigure('1,234.50')).toBe(1234.5);
    expect(nasdaqFigure('-0.15')).toBe(-0.15);
    expect(nasdaqFigure('+2.05')).toBe(2.05);
    expect(nasdaqFigure('.5')).toBe(0.5);
    for (const blank of ['--', '', 'N/A', null, undefined, '1.2.3']) expect(nasdaqFigure(blank)).toBeNaN();
  });

  it("reads the underlying's last price and the date (and time, when given) it is as of", () => {
    expect(nasdaqUnderlying('LAST TRADE: $521.91 (AS OF OCT 30, 2026)')).toEqual({ price: 521.91, asOf: '2026-10-30' });
    expect(nasdaqUnderlying('LATEST INDEX VALUE: 28,384.85 (AS OF OCT 30, 2026)')).toEqual({ price: 28384.85, asOf: '2026-10-30' });
    expect(nasdaqUnderlying('LAST TRADE: $10.20 (AS OF NOV 2, 2026 1:05 PM ET)')).toEqual({ price: 10.2, asOf: '2026-11-02', time: '13:05' });
    expect(nasdaqUnderlying('LAST TRADE: $0 (AS OF )')).toEqual({ price: NaN });
    expect(nasdaqUnderlying('LAST TRADE: $5 (AS OF FEB 30, 2026)')).toEqual({ price: 5 });
    expect(nasdaqUnderlying(null)).toEqual({ price: NaN });
  });
});

describe('a chain answer', () => {
  const rows = [
    heading('November 20, 2026'),
    row('245.00', 'xyz---261120c00245000', { Last: '9.10', Change: '-0.40', Bid: '9.00', Ask: '9.20', Volume: '1,204', Openinterest: '12,050' }, { Last: '2.66', Change: '0.12', Bid: '2.60', Ask: '2.70', Volume: '310', Openinterest: '4,005' }),
    row('252.50', 'xyz---261120c00252500', { Bid: '4.80', Ask: '5.00' }, { Bid: '--', Ask: '0.05', Openinterest: '7' }),
    heading('January 15, 2027'),
    row('250.00', 'xyz---270115c00250000', { Bid: '14.00', Ask: '14.40' }, { Bid: '10.00', Ask: '10.30' }, 'Jan 15'),
    // An adjusted root is kept, apart from the standard one.
    row('250.00', 'xyz1--270115c00250000', { Bid: '1.00', Ask: '1.20' }, {}, 'Jan 15'),
  ];

  it('gives each strike a call and a put with the root, expiry and strike from the link', () => {
    const out = parseNasdaqChain(answer(rows), 'XYZ');
    if (!('contracts' in out)) throw new Error('expected contracts');
    expect(out.rejected).toBe(0);
    expect(out.underlying).toEqual({ price: 251.4, asOf: '2026-10-30' });
    expect(out.contracts.map((c) => c.symbol)).toEqual([
      'XYZ261120C00245000', 'XYZ261120P00245000', 'XYZ261120C00252500', 'XYZ261120P00252500',
      'XYZ270115C00250000', 'XYZ270115P00250000', 'XYZ1270115C00250000', 'XYZ1270115P00250000',
    ]);
    expect(out.contracts[0]).toMatchObject({ root: 'XYZ', expiry: '2026-11-20', type: 'C', strike: 245, bid: 9, ask: 9.2, last: 9.1, change: -0.4, volume: 1204, openInterest: 12050 });
    expect(out.contracts[1]).toMatchObject({ type: 'P', bid: 2.6, ask: 2.7, volume: 310, openInterest: 4005 });
    // Nasdaq's "--": no bid, no trade today, no open interest; and Nasdaq gives no quote or trade time.
    expect(out.contracts[3].bid).toBeNaN();
    expect(out.contracts[3].last).toBeNaN();
    expect(out.contracts[3].volume).toBeNaN();
    expect(out.contracts[3].openInterest).toBe(7);
    expect(out.contracts[0].quoteAt).toBeNaN();
    expect(out.contracts[0].iv).toBeNaN();
  });

  it('leaves out rows whose link disagrees with the strike or the date, and roots of other underlyings', () => {
    const bad = [
      row('250.00', 'xyz---261120c00255000', { Bid: '1' }, {}),
      row('250.00', 'xyz---261120c00250000', { Bid: '1' }, {}, 'Nov 21'),
      row('250.00', 'abc---261120c00250000', { Bid: '1' }, {}),
      row('250.00', 'xyz---261320c00250000', { Bid: '1' }, {}),
      row('250.00', 'no-link', { Bid: '1' }, {}),
    ];
    const out = parseNasdaqChain(answer([heading('November 20, 2026'), ...bad, rows[1]]), 'XYZ');
    if (!('contracts' in out)) throw new Error('expected contracts');
    expect(out.rejected).toBe(5);
    expect(out.contracts.map((c) => c.symbol)).toEqual(['XYZ261120C00245000', 'XYZ261120P00245000']);
  });

  it("reads a class share's root without its dot and an index's PM-settled root", () => {
    const share = parseNasdaqChain(answer([row('270.00', 'brkb--261106c00270000', { Bid: '1' }, {}, 'Nov 6')]), 'BRK.B');
    expect('contracts' in share && share.contracts[0].symbol).toBe('BRKB261106C00270000');
    const index = parseNasdaqChain(answer([row('20,000.00', 'ndxp--261120c20000000', { Bid: '1' }, {})], 'LATEST INDEX VALUE: 28,384.85 (AS OF OCT 30, 2026)'), 'NDX');
    expect('contracts' in index && index.contracts[0]).toMatchObject({ symbol: 'NDXP261120C20000000', root: 'NDXP', strike: 20000 });
  });

  it('tells "not filed under this class" apart from an unusable answer', () => {
    expect(parseNasdaqChain(notFound, 'SPY')).toEqual({ notFound: true });
    expect(parseNasdaqChain('{"data":{"rows":[]}}', 'SPY')).toEqual({ error: 'Nasdaq changed the option chain format.' });
    expect(parseNasdaqChain('nope', 'SPY')).toEqual({ error: 'Nasdaq returned a page that is not JSON.' });
  });
});

describe('asking for a chain', () => {
  it('tries stocks, then ETFs, and remembers which class an underlying is filed under', async () => {
    const asked: string[] = [];
    const request = async (symbol: string, assetClass: string): Promise<KeyedAnswer> => {
      asked.push(`${symbol}:${assetClass}`);
      return { status: 200, text: assetClass === 'etf' ? answer([row('500.00', 'qqq---261120c00500000', { Bid: '1' }, {})]) : notFound };
    };
    const first = await nasdaqChainAnswer(request, 'QQQ', false);
    expect(first.parsed && 'contracts' in first.parsed && first.parsed.contracts.length).toBe(2);
    await nasdaqChainAnswer(request, 'QQQ', false);
    expect(asked).toEqual(['QQQ:stocks', 'QQQ:etf', 'QQQ:etf']);
    // An index is asked once, under its own class; a symbol Nasdaq files nowhere ends as not found.
    await nasdaqChainAnswer(request, 'NDX', true);
    expect(asked.at(-1)).toBe('NDX:index');
    const none = await nasdaqChainAnswer(async () => ({ status: 200, text: notFound }), 'ZZZZ', false);
    expect(none.parsed).toEqual({ notFound: true });
  });

  it('maps US stocks and ETFs to their ticker and only NDX and XND among indices', () => {
    const def = (id: string, ticker: string, cls: SecurityDef['cls']) => ({ id, ticker, cls }) as SecurityDef;
    expect(nasdaqOptionSymbol(def('MSFT US Equity', 'MSFT US', 'equity'))).toEqual({ symbol: 'MSFT', index: false });
    expect(nasdaqOptionSymbol(def('BRK/B US Equity', 'BRK/B US', 'equity'))).toEqual({ symbol: 'BRK.B', index: false });
    expect(nasdaqOptionSymbol(def('NDX Index', 'NDX', 'index'))).toEqual({ symbol: 'NDX', index: true });
    expect(nasdaqOptionSymbol(def('SPX Index', 'SPX', 'index'))).toBeNull();
    expect(nasdaqOptionSymbol(def('VOD LN Equity', 'VOD LN', 'equity'))).toBeNull();
  });
});

describe("the monitor's times and tickers", () => {
  it('takes the quotes as of the close on a later day and as of arrival on the day itself', () => {
    const friday = { asOf: '2026-10-30' };
    const saturday = Date.UTC(2026, 9, 31, 12);
    expect(new Date(quotesTime(friday, saturday)).toISOString()).toBe('2026-10-30T20:00:00.000Z');
    const fridayMorning = Date.UTC(2026, 9, 30, 15);
    expect(quotesTime(friday, fridayMorning)).toBe(fridayMorning);
    expect(new Date(quotesTime({ asOf: '2026-11-02', time: '13:05' }, Date.UTC(2026, 10, 2, 20))).toISOString()).toBe('2026-11-02T18:05:00.000Z');
    expect(quotesTime({}, saturday)).toBe(saturday);
  });

  it("expires NDX's monthly options at the opening and the rest at the close, in New York time", () => {
    expect(new Date(optionExpiryAt('2026-11-20', 'NDX')).toISOString()).toBe('2026-11-20T14:30:00.000Z');
    expect(new Date(optionExpiryAt('2026-11-20', 'NDXP')).toISOString()).toBe('2026-11-20T21:00:00.000Z');
    expect(new Date(optionExpiryAt('2026-10-30', 'MSFT')).toISOString()).toBe('2026-10-30T20:00:00.000Z');
  });

  it('writes tickers as OMON does', () => {
    expect(optionTicker({ root: 'MSFT', expiry: '2026-11-20', type: 'C', strike: 472.5 })).toBe('MSFT 11/20/26 C472.5');
    expect(optionTicker({ root: 'NDXP', expiry: '2027-01-15', type: 'P', strike: 20000 })).toBe('NDXP 01/15/27 P20000');
  });
});
