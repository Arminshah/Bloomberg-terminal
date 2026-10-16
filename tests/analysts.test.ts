import { describe, expect, it } from 'vitest';
import * as fmpMain from '../electron/fmp.cjs';
import { fmpProblem, parseConsensus, parseEstimates, parseGrades, parseRatings, parseSummary } from '../src/data/live/analysts';

// Made-up answers in the layouts of FMP's stable API; no request leaves the test.

describe('FMP requests (main process)', () => {
  it('builds only the five research requests, for well-formed tickers', () => {
    expect(fmpMain.fmpRequest('consensus', 'AAPL', 'k')).toEqual({ url: 'https://financialmodelingprep.com/stable/price-target-consensus?symbol=AAPL&apikey=k', ttl: 6 * 3_600_000 });
    expect(fmpMain.fmpRequest('summary', 'BRK-B', 'k')!.url).toBe('https://financialmodelingprep.com/stable/price-target-summary?symbol=BRK-B&apikey=k');
    expect(fmpMain.fmpRequest('ratings', 'MSFT', 'k')!.url).toBe('https://financialmodelingprep.com/stable/grades-consensus?symbol=MSFT&apikey=k');
    expect(fmpMain.fmpRequest('grades', 'MSFT', 'k')!.url).toBe('https://financialmodelingprep.com/stable/grades?symbol=MSFT&apikey=k');
    expect(fmpMain.fmpRequest('estimates', 'NVDA', 'k')).toEqual({ url: 'https://financialmodelingprep.com/stable/analyst-estimates?symbol=NVDA&period=annual&limit=10&apikey=k', ttl: 24 * 3_600_000 });
    // The key is encoded, so it cannot add parameters.
    expect(fmpMain.fmpRequest('consensus', 'AAPL', 'a&b=c')!.url).toMatch(/apikey=a%26b%3Dc$/);
    expect(fmpMain.fmpRequest('profile', 'AAPL', 'k')).toBeNull();
    expect(fmpMain.fmpRequest('consensus', 'aapl', 'k')).toBeNull();
    expect(fmpMain.fmpRequest('consensus', 'AAPL&x=1', 'k')).toBeNull();
    expect(fmpMain.fmpRequest('toString', 'AAPL', 'k')).toBeNull();
  });
});

describe('FMP answers', () => {
  it('reads the price target consensus', () => {
    expect(parseConsensus('[{"symbol":"ABC","targetHigh":300,"targetLow":180.5,"targetConsensus":251.25,"targetMedian":255}]')).toEqual({ data: { high: 300, low: 180.5, mean: 251.25, median: 255 } });
    // No targets: an empty list, or a row without a consensus.
    expect(parseConsensus('[]')).toEqual({ data: null });
    expect(parseConsensus('[{"symbol":"ABC","targetConsensus":0}]')).toEqual({ data: null });
    // FMP's refusal comes back as words, not as a figure.
    expect(parseConsensus('{"Error Message":"Invalid API KEY."}')).toEqual({ error: 'Invalid API KEY.' });
    expect(parseConsensus('<html>')).toEqual({ error: 'The answer was not JSON' });
  });

  it('reads how targets moved and who published them', () => {
    const text = JSON.stringify([
      { symbol: 'ABC', lastMonthCount: 3, lastMonthAvgPriceTarget: 260.5, lastQuarterCount: 9, lastQuarterAvgPriceTarget: 255, lastYearCount: 30, lastYearAvgPriceTarget: 240.1, allTimeCount: 120, allTimeAvgPriceTarget: 200, publishers: '["Benzinga","TheFly"]' },
    ]);
    expect(parseSummary(text)).toEqual({
      data: { lastMonth: { count: 3, avg: 260.5 }, lastQuarter: { count: 9, avg: 255 }, lastYear: { count: 30, avg: 240.1 }, allTime: { count: 120, avg: 200 }, publishers: ['Benzinga', 'TheFly'] },
    });
    // A publisher list that is not JSON is left out rather than shown wrong.
    const bad = parseSummary('[{"lastMonthCount":0,"lastMonthAvgPriceTarget":0,"publishers":"[Benzinga"}]');
    expect('data' in bad && bad.data?.publishers).toEqual([]);
  });

  it('reads the tally of ratings', () => {
    expect(parseRatings('[{"symbol":"ABC","strongBuy":1,"buy":20,"hold":10,"sell":2,"strongSell":0,"consensus":"Buy"}]')).toEqual({ data: { strongBuy: 1, buy: 20, hold: 10, sell: 2, strongSell: 0, consensus: 'Buy' } });
    expect(parseRatings('[{"symbol":"ABC","strongBuy":0,"buy":0,"hold":0,"sell":0,"strongSell":0,"consensus":"Hold"}]')).toEqual({ data: null });
  });

  it('lists rating actions newest first, without rows it cannot read', () => {
    const rows = [
      { symbol: 'ABC', date: '2026-09-01', gradingCompany: 'Firm A', previousGrade: 'Hold', newGrade: 'Buy', action: 'upgrade' },
      { symbol: 'ABC', date: '2026-10-02', gradingCompany: 'Firm B', previousGrade: 'Buy', newGrade: 'Buy', action: 'MAINTAIN' },
      { symbol: 'ABC', date: 'not a date', gradingCompany: 'Firm C', newGrade: 'Sell', action: 'downgrade' },
      { symbol: 'ABC', date: '2026-08-01', gradingCompany: '', newGrade: 'Sell', action: 'downgrade' },
    ];
    const r = parseGrades(JSON.stringify(rows));
    expect(r).toEqual({
      data: [
        { date: '2026-10-02', firm: 'Firm B', from: 'Buy', to: 'Buy', action: 'maintain' },
        { date: '2026-09-01', firm: 'Firm A', from: 'Hold', to: 'Buy', action: 'upgrade' },
      ],
    });
    const many = Array.from({ length: 40 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, gradingCompany: `F${i}`, newGrade: 'Buy', action: 'maintain' }));
    expect((parseGrades(JSON.stringify(many)) as { data: unknown[] }).data).toHaveLength(25);
  });

  it('reads annual estimates oldest first, under either field naming', () => {
    const stable = [
      { symbol: 'ABC', date: '2027-09-27', revenueLow: 400e9, revenueHigh: 450e9, revenueAvg: 420e9, epsAvg: 8.1, epsHigh: 8.9, epsLow: 7.5, numAnalystsRevenue: 20, numAnalystsEps: 22 },
      { symbol: 'ABC', date: '2026-09-27', revenueLow: 380e9, revenueHigh: 400e9, revenueAvg: 390e9, epsAvg: 7.2, epsHigh: 7.6, epsLow: 6.9, numAnalystsRevenue: 25, numAnalystsEps: 27 },
    ];
    const r = parseEstimates(JSON.stringify(stable)) as { data: { date: string; epsAvg: number; analystsEps: number; revenueAvg: number }[] };
    expect(r.data.map((e) => e.date)).toEqual(['2026-09-27', '2027-09-27']);
    expect(r.data[0]).toMatchObject({ revenueAvg: 390e9, epsAvg: 7.2, epsLow: 6.9, epsHigh: 7.6, analystsEps: 27, analystsRevenue: 25 });
    // The v3 API's names for the same figures.
    const v3 = [{ symbol: 'ABC', date: '2026-12-31', estimatedRevenueAvg: 10, estimatedEpsAvg: 1.5, estimatedEpsLow: 1, estimatedEpsHigh: 2, numberAnalystsEstimatedEps: 4, numberAnalystEstimatedRevenue: 3 }];
    expect((parseEstimates(JSON.stringify(v3)) as { data: unknown[] }).data[0]).toMatchObject({ revenueAvg: 10, epsAvg: 1.5, epsLow: 1, epsHigh: 2, analystsEps: 4, analystsRevenue: 3 });
    // A figure FMP leaves out stays NaN (shown as "--"), not zero.
    const sparse = parseEstimates('[{"date":"2026-12-31","epsAvg":2}]') as { data: { revenueAvg: number }[] };
    expect(sparse.data[0].revenueAvg).toBeNaN();
  });

  it('says what a refusal means', () => {
    expect(fmpProblem(402, 'XYZ', 'HTTP 402: Premium Query Parameter')).toBe("FMP's free plan does not include this for XYZ (HTTP 402, payment required): Premium Query Parameter");
    expect(fmpProblem(401, 'XYZ', 'HTTP 401: Invalid API KEY.')).toBe('FMP refused the key (HTTP 401): Invalid API KEY. Check FMP_API_KEY on PROVIDERS.');
    expect(fmpProblem(500, 'XYZ')).toBe('FMP answered HTTP 500');
    expect(fmpProblem(0, 'XYZ')).toBe('FMP did not answer');
  });
});
