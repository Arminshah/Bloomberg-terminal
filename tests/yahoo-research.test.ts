import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/yahoo-research.json';
import { createYahooResearchLoader, parseYahooResearch } from '../src/data/live/yahoo-research';
import { loadAnalystPart, type AnalystKind } from '../src/data/live/analysts';

const NOW = Date.parse('2026-10-18T18:00:00Z');
const body = () => structuredClone(fixture);

describe('Yahoo research fallback', () => {
  it('preserves distinct revenue and EPS currencies for foreign issuers instead of inferring EPS units from financial currency', () => {
    const sample = body();
    for (const row of sample.quoteSummary.result[0].earningsTrend.trend) {
      Object.assign(row.earningsEstimate, { earningsCurrency: 'USD' });
      if (row.revenueEstimate) Object.assign(row.revenueEstimate, { revenueCurrency: 'JPY' });
    }
    const result = parseYahooResearch(sample, 'APLD', NOW);
    if ('error' in result) throw new Error(result.error);
    expect(result.data.estimateCurrency).toBeUndefined();
    expect(result.data.estimates[0]).toMatchObject({ currency: 'JPY', epsCurrency: 'USD' });
    delete (sample.quoteSummary.result[0].earningsTrend.trend[1].earningsEstimate as { earningsCurrency?: string }).earningsCurrency;
    const missing = parseYahooResearch(sample, 'APLD', NOW);
    if ('error' in missing) throw new Error(missing.error);
    expect(missing.data.estimates[0].epsCurrency).toBeUndefined();
  });
  it('reads targets, monthly snapshots, rating actions and only annual estimate rows', () => {
    const parsed = parseYahooResearch(body(), 'APLD', NOW);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.data.consensus).toEqual({ mean: 25, median: 24, high: 32, low: 18 });
    expect(parsed.data.ratings).toMatchObject({ buy: 4, period: '0m', consensus: 'buy' });
    expect(parsed.data.recommendations.map((r) => r.period)).toEqual(['0m', '-1m']);
    expect(parsed.data.grades[0]).toMatchObject({ firm: 'Synthetic Research Firm', action: 'upgrade' });
    expect(parsed.data.estimates.map((r) => r.date)).toEqual(['2027-05-31', '2028-05-31']);
    expect(parsed.data.estimates[0]).toMatchObject({ revenueAvg: 600e6, epsAvg: -0.25, epsHigh: 0, analystsEps: 7, currency: 'USD' });
    expect(parsed.data.estimates[1].epsAvg).toBe(0);
    expect(parsed.data.estimates[1].epsLow).toBeNaN();
    expect(parsed.data.estimates[0].netIncomeAvg).toBeNaN();
  });

  it('does not invent missing estimates, counts, target values or a target-history dataset', () => {
    const sample = body();
    Object.assign(sample.quoteSummary.result[0].financialData, { targetMeanPrice: { raw: null }, targetLowPrice: { raw: '' } });
    Object.assign(sample.quoteSummary.result[0].recommendationTrend.trend[1], { strongSell: null });
    sample.quoteSummary.result[0].earningsTrend.trend = [{ period: '0y', endDate: '2027-02-30', earningsEstimate: { avg: { raw: 1 } } }] as typeof sample.quoteSummary.result[0]['earningsTrend']['trend'];
    const parsed = parseYahooResearch(sample, 'APLD', NOW);
    if ('error' in parsed) throw new Error(parsed.error);
    expect(parsed.data.consensus).toBeNull();
    expect(parsed.data.ratings).toBeNull();
    expect(parsed.data.estimates).toEqual([]);
    expect(parsed.data).not.toHaveProperty('summary');
  });

  it('rejects mismatched ticker data and provider-error envelopes', () => {
    expect(parseYahooResearch(body(), 'AAPL', NOW)).toHaveProperty('error');
    expect(parseYahooResearch({ quoteSummary: { result: null, error: { code: 'Unauthorized' } } }, 'APLD', NOW)).toHaveProperty('error');
  });

  it('recovers the supplied FMP 402 / Finnhub 401 case, sharing one Yahoo request across four datasets', async () => {
    const get = vi.fn(async () => ({ status: 200, data: body() }));
    const yahoo = createYahooResearchLoader(get, () => NOW);
    const api = {
      analysts: vi.fn(async () => ({ status: 402, text: '', error: 'HTTP 402: subscription does not include this symbol' })),
      finnhubResearch: vi.fn(async () => ({ status: 401, text: '', error: 'HTTP 401: Invalid API key' })),
      yahooResearch: yahoo.load,
    };
    const results = await Promise.all((['consensus', 'ratings', 'grades', 'estimates'] as AnalystKind[]).map((kind) => loadAnalystPart(kind, 'APLD', api)));
    expect(results.every((r) => r.state === 'ok' && r.source === 'Yahoo Finance' && r.at === NOW)).toBe(true);
    expect(results[1].problems?.join(' ')).toContain('HTTP 401');
    expect(results[1].recommendations).toHaveLength(2);
    expect(get).toHaveBeenCalledTimes(1);
    expect(await loadAnalystPart('summary', 'APLD', api)).toMatchObject({ state: 'error', source: 'FMP' });
    expect(get).toHaveBeenCalledTimes(1);
    await yahoo.load('estimates', 'APLD');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not spend fallback requests when FMP already has fresh data', async () => {
    const yahooResearch = vi.fn();
    const result = await loadAnalystPart('consensus', 'APLD', { analysts: async () => ({ status: 200, text: '[{"targetConsensus":25}]' }), yahooResearch });
    expect(result.source).toBe('FMP');
    expect(yahooResearch).not.toHaveBeenCalled();
  });

  it('retains an earlier Yahoo answer as stale on refresh failure, then resumes on recovery', async () => {
    let now = NOW;
    const get = vi.fn().mockResolvedValueOnce({ status: 200, data: body() }).mockResolvedValueOnce({ status: 429, data: null }).mockResolvedValue({ status: 200, data: body() });
    const yahoo = createYahooResearchLoader(get, () => now);
    expect(await yahoo.load('consensus', 'APLD')).toMatchObject({ state: 'ok', at: NOW, stale: false });
    now += 6 * 3_600_000 + 1;
    expect(await yahoo.load('consensus', 'APLD')).toMatchObject({ state: 'ok', at: NOW, stale: true, message: expect.stringContaining('429') });
    await yahoo.load('ratings', 'APLD');
    expect(get).toHaveBeenCalledTimes(2);
    now += 60_001;
    expect(await yahoo.load('consensus', 'APLD')).toMatchObject({ state: 'ok', at: now, stale: false });
  });

  it('bounds failures and refuses unsupported requests without network traffic', async () => {
    const get = vi.fn(async () => ({ status: 401, data: null, session: false }));
    const yahoo = createYahooResearchLoader(get, () => NOW);
    expect(await yahoo.load('consensus', 'APLD')).toMatchObject({ state: 'error', message: expect.stringContaining('consent') });
    await yahoo.load('estimates', 'APLD');
    expect(get).toHaveBeenCalledTimes(1);
    await yahoo.load('summary', 'APLD');
    await yahoo.load('consensus', 'APLD&url=other');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
