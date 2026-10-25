import { afterEach, describe, expect, it, vi } from 'vitest';
import * as finnhubMain from '../electron/finnhub.cjs';
import { finnhubData, loadFinnhub, parseCalendar, parseCalendarHistory, parseEarnings, parseMetric, parseProfile, parseRecommendation, retryFinnhub } from '../src/data/live/finnhub';
import type { KeyedAnswer } from '../src/data/live/lookup';
import { summaryFromFinnhub } from '../src/data/live/yfund';

afterEach(() => { vi.unstubAllGlobals(); retryFinnhub(); });

it('does not show invalid counts/dates or another company in a recommendation trend', () => {
  const row = { symbol: 'APLD', period: '2026-10-01', buy: 4, strongBuy: 1, hold: 2, sell: 0, strongSell: 0 };
  const result = parseRecommendation(JSON.stringify([row, { ...row, symbol: 'AAPL' }, { ...row, buy: -1 }, { ...row, period: '2026-02-30' }]), 'APLD');
  expect(result).toMatchObject({ data: [{ buy: 4, period: '2026-10-01' }] });
  expect('data' in result && result.data).toHaveLength(1);
});

it('uses a replaced Finnhub credential immediately and ignores a late old-account result', async () => {
  let resolve!: (value: KeyedAnswer) => void;
  const old = new Promise<KeyedAnswer>((done) => { resolve = done; });
  const request = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce({ status: 200, text: '{"name":"New account answer"}' });
  vi.stubGlobal('window', { arminDesktop: { finnhub: request } });
  retryFinnhub();
  const pending = loadFinnhub('APLD', 'profile');
  retryFinnhub();
  expect(await loadFinnhub('APLD', 'profile')).toMatchObject({ state: 'ok', data: { name: 'New account answer' } });
  resolve({ status: 200, text: '{"name":"Old account answer"}' });
  expect(await pending).toBeUndefined();
  expect(finnhubData.get().by.APLD.profile?.data).toMatchObject({ name: 'New account answer' });
  expect(request).toHaveBeenCalledTimes(2);
});

describe('an answer for another listing of the same company', () => {
  // Shapes and figures as Finnhub answered for TSM and ASML on 25 October 2026: the home listing's, in its currency.
  const profile = { country: 'TW', currency: 'TWD', estimateCurrency: 'TWD', exchange: 'TAIWAN STOCK EXCHANGE', marketCapitalization: 61848700.400391, name: 'Taiwan Semiconductor Manufacturing Co Ltd', shareOutstanding: 25932.37, ticker: '2330.TW' };
  const surprise = { symbol: '2330.TW', estimate: 29.241, actual: 148.9434, period: '2026-09-30', surprise: 119.7024, surprisePercent: 409.3649, year: 2026, quarter: 3 };
  const report = { symbol: 'ASML.AS', date: '2026-10-14', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 11.0415, epsActual: 12.93, revenueEstimate: 11954637343, revenueActual: 11662000000 };

  it('is left out, with the listing it was for named', () => {
    expect(parseProfile(JSON.stringify(profile), 'TSM')).toEqual({ error: expect.stringContaining('2330.TW, another listing than TSM') });
    expect(parseMetric(JSON.stringify({ symbol: '2330.TW', metric: { peTTM: 24.27, '52WeekHigh': 2590 } }), 'TSM')).toEqual({ error: expect.stringContaining('2330.TW') });
    expect(parseEarnings(JSON.stringify([surprise, { ...surprise, period: '2026-06-30' }]), 'TSM')).toEqual({ error: expect.stringContaining('2330.TW') });
    expect(parseCalendarHistory(JSON.stringify({ earningsCalendar: [report] }), 'ASML')).toEqual({ error: expect.stringContaining('ASML.AS') });
    expect(parseCalendar(JSON.stringify({ earningsCalendar: [{ ...report, date: '2027-01-20', epsActual: null, revenueActual: null }] }), '2026-10-25', 'ASML')).toEqual({ error: expect.stringContaining('ASML.AS') });
  });

  it('keeps the rows for the listing asked about when an answer mixes listings', () => {
    const rows = parseEarnings(JSON.stringify([surprise, { ...surprise, symbol: 'TSM', estimate: 3.1, actual: 3.3 }]), 'TSM');
    expect(rows).toEqual({ data: [expect.objectContaining({ estimate: 3.1, actual: 3.3 })] });
    expect(parseProfile(JSON.stringify({ ...profile, ticker: 'TSM', currency: 'USD' }), 'TSM')).toMatchObject({ data: { name: profile.name } });
    // Class shares are written with a dot by Finnhub and the app alike.
    expect(parseProfile(JSON.stringify({ ...profile, ticker: 'BRK.B' }), 'BRK.B')).toMatchObject({ data: { name: profile.name } });
  });

  it('reaches no screen: the part says why its figures are missing', async () => {
    vi.stubGlobal('window', { arminDesktop: { finnhub: vi.fn().mockResolvedValue({ status: 200, text: JSON.stringify(profile) }) } });
    retryFinnhub();
    expect(await loadFinnhub('TSM', 'profile')).toMatchObject({ state: 'error', message: expect.stringContaining('2330.TW') });
    expect(finnhubData.get().by.TSM.profile?.data).toBeUndefined();
  });
});

// Made-up answers in the layouts of Finnhub's documented examples; no request leaves the test.

describe('Finnhub requests (main process)', () => {
  it('builds only the company requests the app makes', () => {
    const now = Date.parse('2026-10-18T10:00:00Z');
    expect(finnhubMain.finnhubRequest('metric', 'AAPL', now)).toEqual({ url: 'https://finnhub.io/api/v1/stock/metric?symbol=AAPL&metric=all', ttl: 6 * 3_600_000 });
    expect(finnhubMain.finnhubRequest('recommendation', 'BRK.B', now)!.url).toBe('https://finnhub.io/api/v1/stock/recommendation?symbol=BRK.B');
    expect(finnhubMain.finnhubRequest('calendar', 'MSFT', now)!.url).toBe('https://finnhub.io/api/v1/calendar/earnings?from=2026-10-18&to=2027-01-26&symbol=MSFT');
    // The key goes in a header, never in the URL.
    expect(finnhubMain.finnhubHeaders('k')).toEqual({ 'X-Finnhub-Token': 'k' });
    for (const bad of [['price-target', 'AAPL'], ['metric', 'aapl'], ['metric', 'AAPL&token=x'], ['toString', 'AAPL']]) expect(finnhubMain.finnhubRequest(bad[0], bad[1], now)).toBeNull();
  });
});

describe('Finnhub answers', () => {
  it('reads the profile and key ratios', () => {
    expect(parseProfile('{"country":"US","currency":"USD","exchange":"NASDAQ NMS - GLOBAL MARKET","finnhubIndustry":"Technology","ipo":"1980-12-12","marketCapitalization":5040000,"name":"Apple Inc","shareOutstanding":14700,"weburl":"https://www.apple.com/"}')).toEqual({
      data: { name: 'Apple Inc', industry: 'Technology', country: 'US', currency: 'USD', exchange: 'NASDAQ NMS - GLOBAL MARKET', ipo: '1980-12-12', website: 'https://www.apple.com/', sharesOutstanding: 14700, marketCap: 5040000 },
    });
    expect(parseProfile('{}')).toEqual({ data: null });
    expect(parseProfile('{"error":"Invalid API key"}')).toEqual({ error: 'Invalid API key' });
    const m = parseMetric('{"metric":{"peBasicExclExtraTTM":39.6,"pbQuarterly":55.1,"psTTM":10.2,"beta":1.07,"roeTTM":151.9,"grossMarginTTM":46.5,"operatingMarginTTM":31.6,"netProfitMarginTTM":24.3,"totalDebt/totalEquityQuarterly":1.87,"revenueGrowthTTMYoy":6.1,"52WeekHigh":348.15},"series":{}}') as unknown as { data: Record<string, number> };
    // peTTM is missing, so its variant is used; a ratio Finnhub does not give stays NaN.
    expect(m.data.pe).toBe(39.6);
    expect(m.data.debtToEquity).toBe(1.87);
    expect(m.data.roa).toBeNaN();
    expect(parseMetric('{"metric":{},"series":{}}')).toEqual({ data: null });
  });

  it('turns them into the company summary shape, with fractions and percent where it expects them', () => {
    const p = (parseProfile('{"name":"Apple Inc","finnhubIndustry":"Technology","marketCapitalization":5000000,"shareOutstanding":14700}') as { data: never }).data;
    const m = (parseMetric('{"metric":{"peTTM":40,"grossMarginTTM":46.5,"totalDebt/totalEquityQuarterly":1.87,"payoutRatioTTM":15}}') as { data: never }).data;
    const r = summaryFromFinnhub(p, m).quoteSummary.result[0];
    expect(r.summaryDetail.trailingPE).toBe(40);
    expect(r.summaryDetail.payoutRatio).toBeCloseTo(0.15, 10);
    expect(r.summaryDetail.marketCap).toBe(5e12);
    expect(r.financialData.grossMargins).toBeCloseTo(0.465, 10);
    expect(r.financialData.debtToEquity).toBeCloseTo(187, 10);
    expect(r.defaultKeyStatistics.sharesOutstanding).toBe(14.7e9);
    expect(r.assetProfile.industry).toBe('Technology');
    expect(summaryFromFinnhub(null, null)).toBeNull();
  });

  it('reads recommendation counts, EPS surprises and the next report', () => {
    const recs = parseRecommendation('[{"buy":24,"hold":7,"period":"2026-09-01","sell":0,"strongBuy":13,"strongSell":0,"symbol":"AAPL"},{"buy":25,"hold":6,"period":"2026-10-01","sell":1,"strongBuy":12,"strongSell":0,"symbol":"AAPL"}]') as { data: { period: string }[] };
    expect(recs.data.map((r) => r.period)).toEqual(['2026-10-01', '2026-09-01']);
    const eps = parseEarnings('[{"actual":1.65,"estimate":1.6,"period":"2026-06-30","quarter":3,"surprise":0.05,"surprisePercent":3.125,"symbol":"AAPL","year":2026},{"actual":2.4,"estimate":2.35,"period":"2025-12-31","quarter":1,"surprise":0.05,"surprisePercent":2.1277,"symbol":"AAPL","year":2026}]') as { data: { period: string; surprisePct: number }[] };
    expect(eps.data.map((q) => q.period)).toEqual(['2026-06-30', '2025-12-31']);
    expect(eps.data[0].surprisePct).toBe(3.125);
    const cal = parseCalendar('{"earningsCalendar":[{"date":"2026-10-29","epsActual":null,"epsEstimate":1.78,"hour":"amc","quarter":4,"revenueActual":null,"revenueEstimate":102000000000,"symbol":"AAPL","year":2026},{"date":"2026-10-01","hour":"amc","quarter":3,"year":2026}]}', '2026-10-18');
    expect(cal).toEqual({ data: { date: '2026-10-29', hour: 'amc', quarter: 4, year: 2026, epsEstimate: 1.78, revenueEstimate: 102e9 } });
    expect(parseCalendar('{"earningsCalendar":[]}', '2026-10-18')).toEqual({ data: null });
  });
});
