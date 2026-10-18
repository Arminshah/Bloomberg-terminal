import { describe, expect, it } from 'vitest';
import * as finnhubMain from '../electron/finnhub.cjs';
import { parseCalendar, parseEarnings, parseMetric, parseProfile, parseRecommendation } from '../src/data/live/finnhub';
import { summaryFromFinnhub } from '../src/data/live/yfund';

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
