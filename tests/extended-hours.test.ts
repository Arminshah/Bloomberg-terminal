import { afterEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../src/data/market';
import { chartExtendedSessions, hasSessionColumns, refreshExtendedQuotes } from '../src/data/live/extended-hours';
import { extendedSessions, yahooQuotes } from '../src/data/live/yahoo';

const ID = 'AAPL US Equity';
const time = (iso: string) => Date.parse(iso);
const sec = (iso: string) => time(iso) / 1000;
const NOW = time('2026-10-19T12:30:00Z');
const period = (start: string, end: string) => ({ start: sec(start), end: sec(end) });
function chart() {
  return { chart: { result: [{
    meta: { symbol: 'AAPL', regularMarketPrice: 120, regularMarketTime: sec('2026-10-16T20:00:00Z'), exchangeTimezoneName: 'America/New_York' },
    tradingPeriods: {
      pre: [[period('2026-10-19T08:00:00Z', '2026-10-19T13:30:00Z')]],
      regular: [[period('2026-10-16T13:30:00Z', '2026-10-16T20:00:00Z')], [period('2026-10-19T13:30:00Z', '2026-10-19T20:00:00Z')]],
      post: [[period('2026-10-16T20:00:00Z', '2026-10-17T00:00:00Z')]],
    },
    timestamp: ['2026-10-16T19:55:00Z', '2026-10-16T20:00:00Z', '2026-10-16T23:55:00Z', '2026-10-19T12:25:00Z', '2026-10-19T12:35:00Z'].map(sec),
    indicators: { quote: [{ close: [120, 121, 122.4, 126, 127] }] },
  }] } };
}
afterEach(() => { yahooQuotes.delete(ID); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('extended-hours observations independent of regular-price ownership', () => {
  it('fetches Yahoo supplementary sessions while Alpaca owns the regular price, without changing that quote or its history', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const quote = { symbol: 'AAPL', marketState: 'PRE', regularMarketPrice: 120, regularMarketTime: sec('2026-10-16T20:00:00Z'), preMarketPrice: 126, preMarketTime: sec('2026-10-19T12:25:00Z'), postMarketPrice: 122.4, postMarketTime: sec('2026-10-16T23:55:00Z'), hasPrePostMarketData: true };
    const yahoo = vi.fn(async () => ({ status: 200, data: { quoteResponse: { result: [quote] } } }));
    vi.stubGlobal('window', { arminDesktop: { yahoo, alpaca: vi.fn(), settings: { ALPACA_IEX_PRICES_ENABLED: true } } });
    const before = { ...engine.quote(ID) };
    const bars = engine.daily(ID);
    const closes = Array.from(bars.c.subarray(0, bars.length));
    await Promise.all([refreshExtendedQuotes([ID, ID, 'SPX Index', 'ASML NA Equity'], true), refreshExtendedQuotes([ID], true)]);
    expect(yahoo).toHaveBeenCalledOnce();
    expect(yahoo).toHaveBeenCalledWith('/v7/finance/quote?symbols=AAPL');
    expect(extendedSessions(ID, NOW).pre).toMatchObject({ price: 126, source: 'Yahoo Finance extended-hours quote' });
    expect(extendedSessions(ID, NOW).pre?.pct).toBeCloseTo(5);
    expect(extendedSessions(ID, NOW).post?.pct).toBeCloseTo(2);
    expect(engine.quote(ID)).toEqual(before);
    expect(Array.from(engine.daily(ID).c.subarray(0, bars.length))).toEqual(closes);
  });

  it('uses chart sessions when the quote cookie is refused; session time does not become receipt time', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const yahoo = vi.fn(async (path: string) => path.startsWith('/v7/') ? { status: 401, session: false } : { status: 200, data: chart() });
    vi.stubGlobal('window', { arminDesktop: { yahoo } });
    await refreshExtendedQuotes([ID], true);
    expect(yahoo.mock.calls[1][0]).toContain('/chart/AAPL?range=5d&interval=5m&includePrePost=true');
    expect(extendedSessions(ID, NOW).pre).toMatchObject({ price: 126, time: time('2026-10-19T12:25:00Z'), source: 'Yahoo Finance chart, extended hours (bar close)' });
    expect(extendedSessions(ID, NOW).post).toMatchObject({ price: 122.4, time: time('2026-10-16T23:55:00Z') });
  });

  it('uses the preceding close for pre-market percentages after the regular session has started, and rejects future samples', () => {
    yahooQuotes.set(ID, { regularMarketPrice: 130, regularMarketPreviousClose: 120, regularMarketTime: sec('2026-10-19T14:00:00Z'), preMarketPrice: 126, preMarketTime: sec('2026-10-19T13:25:00Z'), postMarketPrice: 140, postMarketTime: sec('2026-10-19T21:00:00Z') });
    expect(extendedSessions(ID, time('2026-10-19T14:01:00Z')).pre?.pct).toBeCloseTo(5);
    expect(extendedSessions(ID, time('2026-10-19T14:01:00Z')).post).toBeUndefined();
  });

  it('suppresses the prior morning after local midnight and does not turn blank percentages into zero', () => {
    yahooQuotes.set(ID, { regularMarketPrice: 130, regularMarketPreviousClose: 120, regularMarketTime: sec('2026-10-19T20:00:00Z'), preMarketPrice: 126, preMarketTime: sec('2026-10-19T13:25:00Z'), preMarketChangePercent: '', postMarketPrice: 132, postMarketTime: sec('2026-10-19T21:00:00Z'), postMarketChangePercent: '' });
    expect(extendedSessions(ID, time('2026-10-19T22:00:00Z')).pre?.pct).toBeCloseTo(5);
    expect(extendedSessions(ID, time('2026-10-19T22:00:00Z')).post?.pct).toBeCloseTo((132 / 130 - 1) * 100);
    expect(extendedSessions(ID, time('2026-10-20T08:00:00Z')).pre).toBeUndefined();
    yahooQuotes.set(ID, { ...yahooQuotes.get(ID), marketState: 'REGULAR' });
    expect(extendedSessions(ID, time('2026-10-20T14:00:00Z')).post).toBeUndefined();
  });

  it('requests supplementary data only when a session column is selected', () => {
    expect(hasSessionColumns(['NAME', 'PX_LAST'])).toBe(false);
    expect(hasSessionColumns(['ARMIN_PRE_MARKET'])).toBe(true);
    expect(hasSessionColumns(['ARMIN_POST_PX'])).toBe(true);
  });
});

describe('source-defined chart sessions', () => {
  it('uses separate session bases across weekends and rejects future bars', () => {
    const sessions = chartExtendedSessions(chart(), NOW);
    expect(sessions.pre).toMatchObject({ price: 126, time: time('2026-10-19T12:25:00Z') });
    expect(sessions.pre?.pct).toBeCloseTo(5);
    expect(sessions.post?.pct).toBeCloseTo(2);
    expect(sessions.post?.time).toBe(time('2026-10-16T23:55:00Z'));
  });

  it('keeps the morning result during regular trading and removes the earlier evening result once the regular session opens', () => {
    const sessions = chartExtendedSessions(chart(), time('2026-10-19T14:00:00Z'));
    expect(sessions.pre?.pct).toBeCloseTo(127 / 120 * 100 - 100);
    expect(sessions.post).toBeUndefined();
  });

  it('honours an early close and daylight saving boundary from the provider instead of assuming a four-hour evening', () => {
    const fixture = chart();
    const r = fixture.chart.result[0];
    r.tradingPeriods.pre = [];
    r.tradingPeriods.regular = [[period('2026-11-27T14:30:00Z', '2026-11-27T18:00:00Z')]];
    r.tradingPeriods.post = [[period('2026-11-27T18:00:00Z', '2026-11-27T22:00:00Z')]];
    r.timestamp = ['2026-11-27T17:55:00Z', '2026-11-27T18:00:00Z', '2026-11-27T21:55:00Z', '2026-11-27T22:00:00Z'].map(sec);
    r.indicators.quote[0].close = [120, 121, 126, 999];
    expect(chartExtendedSessions(fixture, time('2026-11-27T23:00:00Z')).post).toMatchObject({ price: 126, time: time('2026-11-27T21:55:00Z') });
    expect(chartExtendedSessions(fixture, time('2026-11-27T23:00:00Z')).post?.pct).toBeCloseTo(5);
  });

  it('does not invent a change without an observed regular-session base or quote non-equities', () => {
    const fixture = chart();
    fixture.chart.result[0].indicators.quote[0].close[0] = NaN;
    expect(chartExtendedSessions(fixture, NOW)).toEqual({});
    expect(chartExtendedSessions(null, NOW)).toEqual({});
    expect(extendedSessions('SPX Index', NOW)).toEqual({});
  });
});
