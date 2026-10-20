import { describe, expect, it } from 'vitest';
import * as nasdaqMain from '../electron/nasdaq.cjs';
import * as avMain from '../electron/alphavantage.cjs';
import {
  fillSummary, monthEnd, nasdaqDate, nasdaqNumber, nasdaqSummaryPatch, parseNasdaqDividends, parseNasdaqEarningsDate, parseNasdaqForecast,
  parseFinraShort, parseNasdaqHoldings, parseNasdaqRatings, parseNasdaqShort, parseNasdaqSummary, parseNasdaqTarget,
} from '../src/data/live/nasdaq-company';
import { parseAvEstimates, parseAvReports } from '../src/data/live/alphavantage';
import { datedHistory, fiscalLabel, mergeConsensus, missingRevenueHint } from '../src/data/live/consensus';
import { earningsReleases, type Filing } from '../src/data/live/sec';
import { lastFiscalYearEnd } from '../src/data/live/yfund';
import nasdaq from './fixtures/nasdaq-aapl.json';
import avEarnings from './fixtures/alphavantage-ibm-earnings.json';
import avEstimates from './fixtures/alphavantage-ibm-estimates.json';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const text = (k: keyof typeof nasdaq) => JSON.stringify(nasdaq[k]);
const data = <T,>(r: { data: T | null } | { error: string }): T => {
  if ('error' in r) throw new Error(r.error);
  if (r.data == null) throw new Error('no data');
  return r.data;
};

describe("Nasdaq's quote and company pages (no key)", () => {
  it('reads its numbers and US-style dates', () => {
    expect(nasdaqNumber('$4,968,807,493,700')).toBe(4968807493700);
    expect(nasdaqNumber('76.59%')).toBe(76.59);
    expect(nasdaqNumber('N/A')).toBeNaN();
    expect(nasdaqDate('08/10/2026')).toBe(day('2026-08-10'));
    expect(nasdaqDate('Aug 13, 2026')).toBe(day('2026-08-13'));
    expect(nasdaqDate('02/30/2026')).toBeNaN();
    expect(monthEnd('Sep 2026')).toBe('2026-09-30');
    expect(monthEnd('Feb 2028')).toBe('2028-02-29');
  });

  it("reads Apple's summary: market value, industry, the one-year target and the dividend", () => {
    const s = data(parseNasdaqSummary(text('summary')));
    expect(s.marketCap).toBeGreaterThan(1e12);
    expect(s.industry).toBeTruthy();
    expect(s.annualDividend).toBeGreaterThan(0);
    expect(s.exDividend).toBeGreaterThan(day('2026-01-01'));
  });

  it('reads the dividend record with its declaration, record and payment dates, newest first', () => {
    const d = data(parseNasdaqDividends(text('dividends')));
    expect(d.length).toBeGreaterThan(3);
    expect(d[0].ex).toBeGreaterThan(d[1].ex);
    expect(d[0]).toMatchObject({ type: 'Cash' });
    for (const k of ['declared', 'record', 'pay'] as const) expect(Number.isFinite(d[0][k])).toBe(true);
  });

  it('reads short interest, institutional ownership, the price target, the mean rating and the EPS forecasts', () => {
    const short = data(parseNasdaqShort(text('short-interest')));
    expect(short[0].shares).toBeGreaterThan(1e6);
    expect(short[0].daysToCover).toBeGreaterThan(0);
    const h = data(parseNasdaqHoldings(text('holdings')));
    expect(h.institutionalPct).toBeGreaterThan(10);
    expect(h.sharesOutstanding).toBeGreaterThan(1e9);
    expect(h.top[0].name).toBeTruthy();
    const t = data(parseNasdaqTarget(text('target')));
    expect(t.mean).toBeGreaterThan(t.low);
    expect(t.buy + t.hold + t.sell).toBeGreaterThan(0);
    expect(data(parseNasdaqRatings(text('ratings'))).mean).toMatch(/buy|hold|sell/i);
    const f = data(parseNasdaqForecast(text('forecast')));
    expect(f.quarterly[0].end).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/);
    expect(f.yearly.length).toBeGreaterThan(0);
  });

  it("reads the next report's date and session from the page's sentence", () => {
    const n = data(parseNasdaqEarningsDate(JSON.stringify({ data: { reportText: 'SoFi Technologies, Inc. Common Stock   is expected* to report earnings on  10/27/2026 before market open.  The report will be for the fiscal Quarter ending Sep 2026.' }, status: { rCode: 200 } })));
    expect(n).toEqual({ date: day('2026-10-27'), timing: 'Bef-mkt', estimated: true, end: '2026-09-30' });
    expect(data(parseNasdaqEarningsDate(text('earnings-date'))).date).toBeGreaterThan(day('2026-01-01'));
  });

  it("treats Nasdaq's 'not available' for a stock listed elsewhere as no data, so FINRA is asked instead", () => {
    const na = JSON.stringify({ data: null, message: 'Short interest is not available. Short interest is only supported for Nasdaq Listed stocks', status: { rCode: 200, bCodeMessage: null } });
    expect(parseNasdaqShort(na)).toEqual({ data: null });
    const finra = parseFinraShort(JSON.stringify([
      { settlementDate: '2026-09-15', currentShortPositionQuantity: 40584069, averageDailyVolumeQuantity: 14540305, daysToCoverQuantity: 2.79 },
      { settlementDate: '2026-09-30', currentShortPositionQuantity: 53162724, averageDailyVolumeQuantity: 16311203, daysToCoverQuantity: 3.26 },
    ]));
    expect(data(finra)[0]).toEqual({ date: day('2026-09-30'), shares: 53162724, avgVolume: 16311203, daysToCover: 3.26 });
    expect(nasdaqMain.finraShortRequest('KO', day('2026-10-20'))!.body).toContain('"startDate":"2026-08-06"');
  });

  it('turns a refusal into an error, and an unknown symbol is never kept as data', () => {
    expect('error' in parseNasdaqSummary(text('refused'))).toBe(true);
    expect(nasdaqMain.nasdaqProblem(text('refused'))).toMatch(/refused/);
  });

  it('fills only the gaps in a Yahoo-shaped summary', () => {
    const patch = nasdaqSummaryPatch({ summary: data(parseNasdaqSummary(text('summary'))), short: data(parseNasdaqShort(text('short-interest'))), holdings: data(parseNasdaqHoldings(text('holdings'))) });
    const yahoo = { quoteSummary: { result: [{ summaryDetail: { marketCap: { raw: 123 }, dividendRate: {} }, assetProfile: { industry: 'Consumer Electronics' } }] } };
    const { summary, filled } = fillSummary(yahoo, patch);
    const r = summary.quoteSummary.result[0];
    expect(r.summaryDetail.marketCap).toEqual({ raw: 123 });
    expect(r.summaryDetail.dividendRate).toBeGreaterThan(0);
    expect(r.assetProfile.industry).toBe('Consumer Electronics');
    expect(r.defaultKeyStatistics.sharesShort).toBeGreaterThan(1e6);
    expect(r.majorHoldersBreakdown.institutionsPercentHeld).toBeLessThan(1);
    expect(r.institutionOwnership.ownershipList[0].pctHeld).toBeLessThan(1);
    expect(filled).toEqual(expect.arrayContaining(['summaryDetail', 'defaultKeyStatistics', 'majorHoldersBreakdown', 'institutionOwnership']));
    expect(yahoo.quoteSummary.result[0].summaryDetail.dividendRate).toEqual({});
  });

  it('asks only for the kinds and tickers the app uses', () => {
    expect(nasdaqMain.nasdaqCompanyRequest('summary', 'BRK.B')!.url).toBe('https://api.nasdaq.com/api/quote/BRK.B/summary?assetclass=stocks');
    expect(nasdaqMain.nasdaqCompanyRequest('summary', '../x')).toBeNull();
    expect(nasdaqMain.nasdaqCompanyRequest('everything', 'AAPL')).toBeNull();
  });
});

describe("Alpha Vantage's earnings and estimates (the owner's key)", () => {
  const reports = data(parseAvReports(JSON.stringify(avEarnings)));
  const estimates = data(parseAvEstimates(JSON.stringify(avEstimates)));

  it('reads each reported quarter with its date, session and EPS, and the estimates by period', () => {
    expect(reports[0]).toEqual({ end: '2026-06-30', date: '2026-07-22', timing: 'Aft-mkt', epsEst: 2.93, epsActual: 2.93 });
    const q = estimates.find((e) => e.period === 'quarter' && e.end === '2026-06-30')!;
    expect(q.revEst).toBeCloseTo(17178737000, -3);
    expect(q.revAnalysts).toBe(9);
    expect(estimates.some((e) => e.period === 'year')).toBe(true);
  });

  it('turns a refusal or the daily limit into an error', () => {
    expect(parseAvReports(JSON.stringify({ Information: 'The **demo** API key is for demo purposes only.' }))).toEqual({ error: expect.stringMatching(/^Alpha Vantage: The \*\*demo/) });
  });

  it('fills past quarters, their revenue estimates and the coming quarters when no other source answers', () => {
    const c = mergeConsensus({ av: { reports, estimates }, statementCcy: 'USD', fye: 12, now: day('2026-10-20') });
    const q2 = c.past.find((q) => q.end === '2026-06-30')!;
    expect(q2).toMatchObject({ label: 'Q2 2026', date: day('2026-07-22'), timing: 'Aft-mkt' });
    expect(q2.eps).toMatchObject({ est: 2.93, actual: 2.93, estFrom: 'Alpha Vantage' });
    expect(q2.rev.est).toBeCloseTo(17178737000, -3);
    expect(q2.rev.estFrom).toBe('Alpha Vantage');
    expect(c.next).toMatchObject({ end: '2026-09-30', label: 'Q3 2026' });
    expect(c.next!.rev.est).toBeCloseTo(16842959380, -3);
    expect(c.following?.end).toBe('2026-12-31');
  });

  it("keeps the estimate for a fast grower whose revenue came in far above it", () => {
    // 2.5 times the estimate (a small company's surprise) is still the same basis; ten times is not.
    const statements = (x: number) => [{ end: day('2026-06-30'), rev: (17178737000 * x) / 1e6 }] as never;
    const beat = mergeConsensus({ av: { reports, estimates }, statements: statements(2.5), statementCcy: 'USD', fye: 12, now: day('2026-10-20') });
    expect(beat.past.find((q) => q.end === '2026-06-30')!.rev.estFrom).toBe('Alpha Vantage');
    const other = mergeConsensus({ av: { reports, estimates }, statements: statements(10), statementCcy: 'USD', fye: 12, now: day('2026-10-20') });
    expect(other.past.find((q) => q.end === '2026-06-30')!.rev.est).toBeNaN();
  });

  it('says which key fills past quarters without an expected revenue', () => {
    const q = (est: number) => ({ end: '2026-06-30', label: 'Q2 2026', eps: { est: NaN, low: NaN, high: NaN, analysts: NaN, actual: NaN }, rev: { est, low: NaN, high: NaN, analysts: NaN, actual: 5e7 } });
    expect(missingRevenueHint([q(NaN), q(4e7)], undefined)).toMatch(/1 of 2 reported quarters.*ALPHA_VANTAGE_API_KEY/);
    expect(missingRevenueHint([q(4e7)], undefined)).toBeUndefined();
  });

  it('leaves revenue estimates out for a company reporting in another currency', () => {
    const c = mergeConsensus({ av: { reports, estimates }, statementCcy: 'TWD', fye: 12, now: day('2026-10-20') });
    expect(c.past[0].rev.est).toBeNaN();
    expect(c.past[0].eps.est).toBe(2.93);
  });

  it('asks for the two kinds with a valid ticker only, and keeps its answers', () => {
    expect(avMain.avEarningsRequest('earnings', 'BRK-B', 'k')!.url).toContain('function=EARNINGS&symbol=BRK-B&apikey=k');
    expect(avMain.avEarningsRequest('estimates', 'AAPL', 'k')!.url).toContain('function=EARNINGS_ESTIMATES');
    expect(avMain.avEarningsRequest('quote', 'AAPL', 'k')).toBeNull();
    expect(avMain.cacheId('earnings', 'AAPL', 'one')).not.toBe(avMain.cacheId('earnings', 'AAPL', 'two'));
    // A cache file that cannot be written still keeps the answer in memory, and nothing throws.
    const cache = avMain.createDiskCache(() => '/nonexistent-armin-dir/\0/cache.json');
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', '{"x":1}', 5);
    expect(cache.get('a')).toEqual({ text: '{"x":1}', at: 5 });
  });
});

describe('report dates without Yahoo', () => {
  it("dates a quarter by the company's 8-K results filing, and its session by the acceptance time", () => {
    const f = (accession: string, filed: string, accepted: string, items = '2.02,9.01'): Filing => ({ accession, form: '8-K', filed, accepted, items: items.split(',') });
    const releases = earningsReleases([
      f('0000320193-26-000071', '2026-07-30', '2026-07-31T00:30:28.000Z'),
      f('0001818874-26-000050', '2026-07-29', '2026-07-29T11:06:09.000Z'),
      f('0000000000-26-000001', '2026-07-01', '2026-07-01T14:00:00.000Z', '5.02'),
    ]);
    expect(releases).toEqual([
      { date: '2026-07-30', at: Date.parse('2026-07-31T00:30:28.000Z'), timing: 'Aft-mkt', accession: '0000320193-26-000071' },
      { date: '2026-07-29', at: Date.parse('2026-07-29T11:06:09.000Z'), timing: 'Bef-mkt', accession: '0001818874-26-000050' },
    ]);
    const c = mergeConsensus({ finnhubEps: [{ period: '2026-06-27', actual: 1.6, estimate: 1.5, quarter: 3, year: 2026 } as never], secReleases: releases.slice(0, 1) });
    expect(c.past[0]).toMatchObject({ date: day('2026-07-30'), timing: 'Aft-mkt' });
  });

  it('names fiscal quarters by the year the fiscal year ends', () => {
    expect(fiscalLabel('2025-12-27', 9)).toBe('Q1 2026');
    expect(fiscalLabel('2026-09-26', 9)).toBe('Q4 2026');
    expect(fiscalLabel('2026-10-03', 9)).toBe('Q4 2026');
    expect(fiscalLabel('2026-06-30', 12)).toBe('Q2 2026');
    expect(fiscalLabel('2026-05-31', 12)).toBeUndefined();
    expect(new Date(lastFiscalYearEnd('0926', day('2026-10-20')) * 1000).toISOString().slice(0, 10)).toBe('2026-09-26');
    expect(new Date(lastFiscalYearEnd('1231', day('2026-10-20')) * 1000).toISOString().slice(0, 10)).toBe('2025-12-31');
  });

  it("dates the statements' undated reports and adds the next one", () => {
    const hist = [{ period: 'Q2 26', date: day('2026-06-30'), dateUnknown: true, actual: 2.1, timing: '--' as const, revAct: 17000 }];
    const out = datedHistory(hist, {
      past: [{ end: '2026-06-30', label: 'Q2 2026', date: day('2026-07-22'), timing: 'Aft-mkt', eps: {} as never, rev: {} as never }],
      next: { end: '2026-09-30', label: 'Q3 2026', date: day('2026-10-21'), dateEstimated: true, timing: 'Aft-mkt', eps: {} as never, rev: {} as never },
    });
    expect(out).toEqual([
      { period: 'Q2 26', date: day('2026-07-22'), dateUnknown: false, actual: 2.1, timing: 'Aft-mkt', revAct: 17000 },
      { period: 'Next', date: day('2026-10-21'), approx: true, actual: null, timing: 'Aft-mkt', revAct: null },
    ]);
  });
});
