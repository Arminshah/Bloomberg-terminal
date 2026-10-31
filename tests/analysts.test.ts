import { describe, expect, it, vi } from 'vitest';
import * as fmpMain from '../electron/fmp.cjs';
import { availabilityNote, fmpProblem, loadAnalystPart, parseConsensus, parseEstimates, parseFinnhubRatings, parseGrades, parseRatings, parseSummary } from '../src/data/live/analysts';
import { finnhubResearchRequest } from '../electron/finnhub-research.cjs';

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

  // The owner asked on 28 October 2026 for refusals in plain words without FMP's own error text.
  it('says what a refusal means in plain words, without the provider\'s error text', () => {
    expect(fmpProblem(402, 'XYZ')).toBe("FMP's plan does not cover XYZ for this dataset (HTTP 402).");
    expect(fmpProblem(401, 'XYZ')).toBe('FMP refused the key (HTTP 401). Check the key on PROVIDERS.');
    expect(fmpProblem(500, 'XYZ')).toBe('FMP answered HTTP 500.');
    expect(fmpProblem(0, 'XYZ')).toBe('FMP did not answer.');
  });

  it('reads a refusal FMP sends as HTTP 200 by its text, and cuts any other message short', () => {
    expect(fmpProblem(200, 'XYZ', 'Premium Query Parameter: This value set for symbol is not available under your current subscription please visit our subscription page')).toBe("FMP's plan does not cover XYZ for this dataset (HTTP 402).");
    expect(fmpProblem(200, 'XYZ', 'Invalid API KEY. Feel free to create a Free API Key or visit our page.')).toBe('FMP refused the key. Check the key on PROVIDERS.');
    expect(fmpProblem(0, 'XYZ', 'Limit Reach . Please upgrade your plan or visit our documentation for more details at https://site.financialmodelingprep.com/')).toMatch(/^FMP refused the request: Limit Reach .{60,}…$/);
  });
});

describe('research fallback and section isolation', () => {
  const counts = { symbol: 'APLD', period: '2026-10-01', strongBuy: 2, buy: 4, hold: 1, sell: 0, strongSell: 0 };
  it('uses only the free recommendation endpoint and preserves the monthly period', () => {
    expect(finnhubResearchRequest('ratings', 'BRK-B')).toBe('https://finnhub.io/api/v1/stock/recommendation?symbol=BRK.B');
    expect(finnhubResearchRequest('consensus', 'APLD')).toBeNull();
    expect(finnhubResearchRequest('ratings', 'APLD&x=1')).toBeNull();
    expect(parseFinnhubRatings(JSON.stringify([{ ...counts, period: '2026-09-01', buy: 2 }, counts]), 'APLD')).toEqual({ data: { strongBuy: 2, buy: 4, hold: 1, sell: 0, strongSell: 0, period: '2026-10-01', consensus: '' } });
  });
  it('does not turn absent/malformed counts into zeros or choose another symbol', () => {
    expect(parseFinnhubRatings(JSON.stringify([{ ...counts, symbol: 'AAPL' }, { ...counts, strongBuy: null }, { ...counts, period: '2026-02-30' }]), 'APLD')).toEqual({ data: null });
  });
  it('falls back on an FMP 402 without hiding successful estimates or inventing targets', async () => {
    const analysts = vi.fn(async () => ({ status: 402, text: '', error: 'HTTP 402: Premium Query Parameter' }));
    const finnhubResearch = vi.fn(async () => ({ status: 200, text: JSON.stringify([counts]), at: 1000 }));
    expect(await loadAnalystPart('ratings', 'APLD', { analysts, finnhubResearch })).toMatchObject({ state: 'ok', source: 'Finnhub', data: { buy: 4, period: '2026-10-01' }, at: 1000 });
    expect(await loadAnalystPart('consensus', 'APLD', { analysts, finnhubResearch })).toMatchObject({ state: 'error', source: 'FMP', message: expect.stringContaining('HTTP 402') });
    expect(finnhubResearch).toHaveBeenCalledTimes(1);
    analysts.mockResolvedValueOnce({ status: 200, text: '[{"date":"2027-05-31","epsAvg":1}]', error: '' });
    expect(await loadAnalystPart('estimates', 'APLD', { analysts, finnhubResearch })).toMatchObject({ state: 'ok', data: [{ date: '2027-05-31', epsAvg: 1 }] });
  });
  it('marks failures on the way as worth asking again, and refusals as not', async () => {
    const analysts = vi.fn(async () => ({ status: 503, text: '', error: 'HTTP 503' }));
    expect(await loadAnalystPart('estimates', 'APLD', { analysts })).toMatchObject({ state: 'error', transient: true });
    analysts.mockResolvedValueOnce({ status: 0, text: '', error: 'Network request failed' });
    expect(await loadAnalystPart('estimates', 'APLD', { analysts })).toMatchObject({ transient: true });
    analysts.mockResolvedValueOnce({ status: 402, text: '', error: 'HTTP 402' });
    expect(await loadAnalystPart('estimates', 'APLD', { analysts })).not.toHaveProperty('transient');
  });
  it("counts the ratings from Finnhub's latest month first, without spending an FMP call", async () => {
    // FMP's tally counts every firm's last grade, however old: 112 for Apple on 28 October 2026 against the 49
    // analysts of Finnhub's October month (11 strong buy, 20 buy, 14 hold, 3 sell, 1 strong sell).
    const apple = { symbol: 'AAPL', period: '2026-10-01', strongBuy: 11, buy: 20, hold: 14, sell: 3, strongSell: 1 };
    const finnhubResearch = vi.fn(async () => ({ status: 200, text: JSON.stringify([apple]) }));
    const analysts = vi.fn(async () => ({ status: 200, text: JSON.stringify([{ symbol: 'AAPL', strongBuy: 1, buy: 69, hold: 33, sell: 9, strongSell: 0, consensus: 'Buy' }]) }));
    expect(await loadAnalystPart('ratings', 'AAPL', { analysts, finnhubResearch })).toMatchObject({ state: 'ok', source: 'Finnhub', data: { strongBuy: 11, buy: 20, hold: 14, sell: 3, strongSell: 1, period: '2026-10-01' } });
    expect(analysts).not.toHaveBeenCalled();
  });

  it("takes FMP's ratings when Finnhub has none; shows both failures when neither works", async () => {
    const finnhubResearch = vi.fn(async () => ({ status: 401, text: '', error: 'HTTP 401' }));
    const analysts = vi.fn(async () => ({ status: 200, text: JSON.stringify([counts]) }));
    expect(await loadAnalystPart('ratings', 'APLD', { analysts, finnhubResearch })).toMatchObject({ state: 'ok', source: 'FMP' });
    expect(finnhubResearch).toHaveBeenCalledTimes(1);
    analysts.mockResolvedValueOnce({ status: 402, text: '' });
    const failed = await loadAnalystPart('ratings', 'APLD', { analysts, finnhubResearch });
    expect(failed.message).toContain('HTTP 402'); expect(failed.message).toContain('HTTP 401');
  });
});

describe('Research source availability: each row its own source', () => {
  // Applied Digital on 28 October 2026: FMP refused every dataset (HTTP 402), Finnhub's key was refused, and Yahoo
  // answered. The FMP refusal used to be the note on every row, Yahoo's included.
  const api = {
    analysts: vi.fn(async () => ({ status: 402, text: '', error: 'HTTP 402: Premium Query Parameter: This value set for symbol is not available under your current subscription please visit our subscription page' })),
    finnhubResearch: vi.fn(async () => ({ status: 401, text: '', error: 'HTTP 401: Invalid API key' })),
    yahooResearch: vi.fn(async (kind: string) => (kind === 'grades' ? { state: 'ok' as const, source: 'Yahoo Finance' as const, data: [] } : { state: 'ok' as const, source: 'Yahoo Finance' as const, data: { mean: 40, median: 41, low: 30, high: 50 }, at: 1 })),
  };

  it("a row Yahoo fills says FMP's plan does not cover the ticker and names Yahoo, without FMP's text", async () => {
    const part = await loadAnalystPart('consensus', 'APLD', api);
    expect(part.source).toBe('Yahoo Finance');
    expect(availabilityNote(part, 'APLD')).toBe("FMP's plan does not cover APLD; Yahoo Finance fills this row.");
    expect(availabilityNote(part, 'APLD')).not.toMatch(/subscription page|Premium|Finnhub/);
  });

  it('a row no source fills says what each source answered, in a few words', async () => {
    const part = await loadAnalystPart('ratings', 'APLD', { ...api, yahooResearch: vi.fn(async () => ({ state: 'ok' as const, source: 'Yahoo Finance' as const, data: null })) });
    expect(availabilityNote(part, 'APLD')).toBe("Finnhub refused the key; FMP's plan does not cover APLD; Yahoo Finance has none for APLD.");
  });

  it('a row FMP answers itself carries no other source\'s failure', async () => {
    const counts = { symbol: 'APLD', period: '2026-10-01', strongBuy: 2, buy: 4, hold: 1, sell: 0, strongSell: 0 };
    const part = await loadAnalystPart('estimates', 'APLD', { analysts: vi.fn(async () => ({ status: 200, text: '[{"date":"2027-05-31","epsAvg":1}]' })), finnhubResearch: vi.fn(async () => ({ status: 200, text: JSON.stringify([counts]) })) });
    expect(part.source).toBe('FMP');
    expect(availabilityNote(part, 'APLD')).toBe('');
  });
});
