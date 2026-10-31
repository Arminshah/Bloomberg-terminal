import { describe, expect, it } from 'vitest';
import { ALLOWED, ANALYST_MODULES, withoutRestricted, yahooRequest } from '../electron/yahoo-scope.cjs';
import summary from './fixtures/yahoo-apld-summary.json';

// Options and news remain outside the adapter. Research has its own switch.
describe('Yahoo scope in the main process', () => {
  it('permits analyst fields only when research is explicitly enabled, keeping news and options blocked', () => {
    const path = '/v10/finance/quoteSummary/APLD?modules=financialData,earningsTrend,recommendationTrend,price';
    expect(yahooRequest(path, true)).toBe(path);
    const allowed = withoutRestricted(path, structuredClone(summary), true);
    expect(allowed.quoteSummary.result[0].financialData.targetMeanPrice).toBeDefined();
    expect(withoutRestricted('/v1/finance/search?q=APLD', { news: [{}], quotes: [] }, true)).not.toHaveProperty('news');
    expect(ALLOWED.test('/v7/finance/options/APLD?x=1')).toBe(false);
  });

  it('does not allow the option chain path', () => {
    expect(ALLOWED.test('/v7/finance/options/AAPL?date=1792022400')).toBe(false);
    expect(ALLOWED.test('/v7/finance/quote?symbols=AAPL')).toBe(true);
    expect(ALLOWED.test('/v8/finance/chart/AAPL?range=1d&interval=1m')).toBe(true);
  });

  it('asks search for no news and quoteSummary for no analyst modules', () => {
    expect(yahooRequest('/v1/finance/search?q=AAPL&quotesCount=12&newsCount=8')).toBe('/v1/finance/search?q=AAPL&quotesCount=12&newsCount=0');
    expect(yahooRequest('/v1/finance/search?q=AAPL&quotesCount=12')).toBe('/v1/finance/search?q=AAPL&quotesCount=12&newsCount=0');
    expect(yahooRequest('/v10/finance/quoteSummary/AAPL?modules=assetProfile,earningsTrend,recommendationTrend,upgradeDowngradeHistory,earningsHistory,price')).toBe(
      '/v10/finance/quoteSummary/AAPL?modules=assetProfile,price',
    );
    expect(yahooRequest('/v10/finance/quoteSummary/AAPL?modules=assetProfile%2CearningsTrend')).toBe('/v10/finance/quoteSummary/AAPL?modules=assetProfile');
  });

  it('removes analyst modules and fields from a company answer', () => {
    const path = '/v10/finance/quoteSummary/APLD?modules=x';
    const out = withoutRestricted(path, structuredClone(summary)) as typeof summary;
    const r = out.quoteSummary.result[0] as Record<string, Record<string, unknown> | undefined>;
    for (const m of ANALYST_MODULES) expect(r[m]).toBeUndefined();
    for (const f of ['targetMeanPrice', 'targetHighPrice', 'recommendationKey', 'numberOfAnalystOpinions']) expect(r.financialData?.[f]).toBeUndefined();
    expect(r.defaultKeyStatistics?.forwardEps).toBeUndefined();
    // What stays: the company's own figures and its filed holders.
    expect(r.institutionOwnership).toBeDefined();
    expect(r.financialData?.totalRevenue).toBeDefined();
  });

  it('removes analyst fields from quotes and news from search', () => {
    const quote = { quoteResponse: { result: [{ symbol: 'AAPL', regularMarketPrice: 340, averageAnalystRating: '1.9 - Buy', forwardPE: 30, epsForward: 9, epsCurrentYear: 8, priceEpsCurrentYear: 42, trailingPE: 35 }] } };
    const q = withoutRestricted('/v7/finance/quote?symbols=AAPL', quote).quoteResponse.result[0] as Record<string, unknown>;
    expect(q.averageAnalystRating).toBeUndefined();
    expect(q.forwardPE).toBeUndefined();
    expect(q.epsForward).toBeUndefined();
    expect(q.trailingPE).toBe(35);
    const search = withoutRestricted('/v1/finance/search?q=AAPL', { quotes: [{ symbol: 'AAPL' }], news: [{ title: 'x' }], researchReports: [{}] }) as Record<string, unknown>;
    expect(search.news).toBeUndefined();
    expect(search.researchReports).toBeUndefined();
    expect(search.quotes).toBeDefined();
  });
});
