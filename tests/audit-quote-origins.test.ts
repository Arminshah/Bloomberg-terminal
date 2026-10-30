/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { requestContext, readJsonBounded, createQuoteOrigins } = require('../scripts/live/audit/quote-origins.cjs');
const { withQuoteDiagnostics, withQuoteCapture } = require('../scripts/live/audit/references.cjs');
const { formatAnnotations } = require('../scripts/live/audit/annotate.cjs');

// Publisher-shaped structural inputs exercise capture mechanics, not live-source facts.
const quoteUrl = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=WMT&crumb=SyntheticSessionSecret';
const quote = { symbol: 'WMT', regularMarketPrice: 121.25, regularMarketOpen: 120.83, regularMarketVolume: 15840000, regularMarketTime: Date.parse('2026-10-29T20:00:00Z') / 1000, gmtOffSetMilliseconds: -14400000, marketCap: 1e12, currency: 'USD', secret: 'NeverCopyThisField' };

describe('development audit quote-origin observation', () => {
  it('accepts only normal Yahoo quote/chart/spark requests and strips all query credentials', () => {
    expect(requestContext(quoteUrl)).toEqual({ kind: 'quote', symbols: ['WMT'], sourceUrl: 'https://query1.finance.yahoo.com/v7/finance/quote' });
    for (const url of ['https://evil.invalid/v7/finance/quote?symbols=WMT', 'https://query1.finance.yahoo.com.evil.invalid/v7/finance/quote?symbols=WMT', 'http://query1.finance.yahoo.com/v7/finance/quote?symbols=WMT']) expect(requestContext(url)).toBeNull();
  });
  it('retains exact raw fields and request/response clocks without credentials or unrelated fields', () => {
    const origins = createQuoteOrigins();
    origins.record(requestContext(quoteUrl), { quoteResponse: { result: [quote] } }, 100, 200);
    expect(origins.snapshot('WMT').quote[0]).toMatchObject({ requestedAt: 100, receivedAt: 200, fields: { regularMarketOpen: 120.83, regularMarketVolume: 15840000, sessionDate: '2026-10-29', marketCap: 1e12 } });
    expect(JSON.stringify(origins.snapshot('WMT'))).not.toMatch(/SyntheticSessionSecret|NeverCopyThisField|crumb/);
    expect(origins.snapshot('KO')).toEqual({});
  });
  it('records original chart OHLCV separately from the full quote and detects explicit identity mismatches', () => {
    const origins = createQuoteOrigins();
    const context = requestContext('https://query2.finance.yahoo.com/v8/finance/chart/WMT?range=10y&interval=1d');
    const row = { meta: { symbol: 'WMT', gmtoffset: -14400 }, timestamp: [Date.parse('2026-10-29T13:30:00Z') / 1000], indicators: { quote: [{ open: [120.74], close: [121.25], volume: [16048288] }] } };
    origins.record(context, { chart: { result: [row] } }, 100, 200);
    expect(origins.snapshot('WMT').chartDaily[0].bars).toEqual([{ timestamp: row.timestamp[0], sessionDate: '2026-10-29', open: 120.74, close: 121.25, volume: 16048288 }]);
    expect(origins.snapshot('WMT').chartDaily[0].interval).toBe('1d');
    origins.record(context, { chart: { result: [{ ...row, meta: { symbol: 'KO' } }] } }, 300, 400);
    expect(origins.snapshot('WMT').chartDaily[1].status).toBe('identity-mismatch');
  });
  it('keeps only numeric price/share summary modules and strips the query and unrelated profile text', () => {
    const origins = createQuoteOrigins();
    const context = requestContext('https://query2.finance.yahoo.com/v10/finance/quoteSummary/WMT?modules=financialData&crumb=SyntheticSessionSecret');
    origins.record(context, { quoteSummary: { result: [{ financialData: { currentPrice: { raw: 121.25 }, recommendationKey: 'NeverCopyThisField' }, summaryDetail: { marketCap: { raw: 1e12 }, previousClose: 120 }, assetProfile: { longBusinessSummary: 'NeverCopyThisProfile' }, defaultKeyStatistics: { sharesOutstanding: { raw: 8e9 } } }] } }, 100, 200, 300);
    expect(origins.snapshot('WMT', 300).summary[0].modules).toEqual({ financialData: { currentPrice: 121.25 }, summaryDetail: { marketCap: 1e12, previousClose: 120 }, defaultKeyStatistics: { sharesOutstanding: 8e9 } });
    expect(JSON.stringify(origins.snapshot('WMT', 300))).not.toMatch(/SyntheticSessionSecret|NeverCopyThis|crumb/);
  });
  it('does not attribute a response parsed after the screen snapshot to that earlier screen', () => {
    const origins = createQuoteOrigins();
    const context = requestContext(quoteUrl);
    origins.record(context, { quoteResponse: { result: [quote] } }, 100, 200, 300);
    expect(origins.snapshot('WMT', 250)).toEqual({});
    origins.record(context, { quoteResponse: { result: [{ ...quote, regularMarketVolume: 16048288 }] } }, 310, 320, 350);
    expect(origins.snapshot('WMT', 300).quote.map((row: { fields: { regularMarketVolume: number } }) => row.fields.regularMarketVolume)).toEqual([15840000]);
    expect(origins.snapshot('WMT', NaN)).toEqual({});
  });
  it('bounds symbols and revisions while retaining same-timestamp corrections as distinct observations', () => {
    const origins = createQuoteOrigins(2);
    const record = (symbol: string, volume: number) => origins.record(requestContext(quoteUrl.replace('WMT', symbol)), { quoteResponse: { result: [{ ...quote, symbol, regularMarketVolume: volume }] } }, 100, 200);
    record('WMT', 1); record('WMT', 2); record('WMT', 3);
    expect(origins.snapshot('WMT').quote.map((row: { fields: { regularMarketVolume: number } }) => row.fields.regularMarketVolume)).toEqual([2, 3]);
    record('KO', 4); record('TSLA', 5);
    expect(origins.snapshot('WMT')).toEqual({});
  });
  it('bounds cloned response parsing without consuming the app response', async () => {
    const response = new Response('{"a":1}');
    expect(await readJsonBounded(response.clone(), 20)).toEqual({ a: 1 });
    expect(await response.json()).toEqual({ a: 1 });
    await expect(readJsonBounded(new Response('{"a":1}'), 4)).rejects.toThrow('size-limit');
    let cancelled = false;
    const oversized = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-length': '1000' } });
    await expect(readJsonBounded(oversized, 20)).rejects.toThrow('size-limit');
    expect(cancelled).toBe(true);
  });
  it('cancels a stalled clone read at its time bound and tolerates a synchronous clone failure', async () => {
    let cancelled = false;
    const stalled = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
    await expect(readJsonBounded(stalled, 100, 5)).rejects.toThrow('time-limit');
    expect(cancelled).toBe(true);
    const origins = createQuoteOrigins();
    const consumed = new Response('{"app":"normal response"}');
    await consumed.text();
    expect(() => origins.observe(quoteUrl, consumed, 100, 200)).not.toThrow();
    expect(origins.snapshot('WMT')).toEqual({});
  });
  it('makes every source current-day value visible before public annotation truncation', () => {
    const diagnostics = { days: ['2026-10-28', '2026-10-29'], sources: ['Tiingo', 'Massive', 'Nasdaq'].map((source) => ({ source, observations: [{ day: '2026-10-28', volume: 14456444 }, { day: '2026-10-29', volume: 16048288 }], ignoredLargeContext: 'x'.repeat(4000) })) };
    const failure = { status: 'FAIL', field: 'Volume', app: 15840000, ref: 16048288, allowed: 160482.88 };
    const annotated = withQuoteDiagnostics(failure, diagnostics);
    expect(annotated).toMatchObject(failure);
    expect(annotated.diagnostics).toBe(diagnostics);
    expect(annotated.detail.length).toBeLessThan(1500);
    for (const source of ['Tiingo', 'Massive', 'Nasdaq']) expect(annotated.detail).toContain(`${source}=16048288`);
    expect(annotated.detail).toContain('Previous available 2026-10-28');
  });
  it('retains all current sources plus raw app provenance within an actual public failure annotation', () => {
    const origins = createQuoteOrigins();
    origins.record(requestContext(quoteUrl), { quoteResponse: { result: [quote] } }, 100, 200, 300);
    const snapshot = { capturedAt: 400, domains: [{ domain: 'quote', displayed: { volume: 15840000 }, quote: { provider: 'Yahoo Finance', dayProvider: 'Yahoo Finance', volumeSource: 'regularMarketVolume', time: quote.regularMarketTime * 1000 } }], quoteOrigins: origins.snapshot('WMT', 400) };
    const diagnostics = { days: ['2026-10-28', '2026-10-29'], sources: ['Tiingo', 'Massive', 'Nasdaq'].map((source) => ({ source, observations: [{ day: '2026-10-29', volume: 16048288 }] })) };
    const failure = { status: 'FAIL', area: 'quote', item: 'WMT', field: 'Volume', app: 15840000, ref: 16048288, allowed: 160482.88, refName: 'Tiingo volume 2026-10-29' };
    const annotated = withQuoteDiagnostics(failure, diagnostics, snapshot);
    const output = formatAnnotations({ summary: { fail: 1 }, rows: [annotated] }, {});
    expect(annotated).toMatchObject(failure);
    for (const source of ['Tiingo', 'Massive', 'Nasdaq']) expect(output).toContain(`${source}=16048288`);
    expect(output).toContain('Yahoo.quote 15840000,day=2026-10-29@300');
    expect(output).not.toContain('[truncated]');
    expect(annotated.capturedQuote.state).toBe(snapshot.domains[0]);
  });
  it('adds market-cap inputs without changing the failed comparison and excludes future raw records defensively', () => {
    const future = { kind: 'quote', receivedAt: 200, observedAt: 500, fields: { marketCap: 1e12 } };
    const snapshot = { capturedAt: 400, domains: [{ domain: 'quote', marketCap: { value: 1e12, currency: 'USD', price: 121.25, shares: 8e9, priceProvider: 'Yahoo Finance', priceTime: 100, shareBasis: { source: 'Yahoo quoteSummary', method: 'same-response cap/current price', observedAt: 300, marketCap: 1e12, price: 121.25 } } }], quoteOrigins: { quote: [future] } };
    const failure = { status: 'FAIL', field: 'Market cap', app: 1e12, ref: 9e11, allowed: 18e9 };
    const result = withQuoteCapture(failure, snapshot, { source: 'Nasdaq summary', retrievedAt: 600, marketCap: 9e11 });
    expect(result).toMatchObject(failure);
    expect(result.capturedQuote.origins).toEqual({});
    expect(result.detail).toContain('shares=8000000000');
    expect(result.detail).toContain('sourcePrice=121.25');
    expect(result.referenceObservation.retrievedAt).toBe(600);
  });
  it('labels an intraday chart observation as one minute bar rather than daily session volume', () => {
    const origins = createQuoteOrigins();
    const context = requestContext('https://query2.finance.yahoo.com/v8/finance/chart/WMT?range=1d&interval=1m');
    origins.record(context, { chart: { result: [{ meta: { symbol: 'WMT', gmtoffset: -14400 }, timestamp: [1793304000], indicators: { quote: [{ open: [121.25], volume: [1500] }] } }] } }, 100, 200, 300);
    const annotated = withQuoteCapture({ status: 'FAIL', field: 'Volume', app: 15840000, ref: 16048288, allowed: 160482.88 }, { capturedAt: 400, quoteOrigins: origins.snapshot('WMT', 400) });
    expect(annotated.detail).toContain('Yahoo.chartIntraday last 1m bar volume=1500,barTime=1793304000');
  });
});
