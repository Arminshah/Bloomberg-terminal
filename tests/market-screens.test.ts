import { describe, expect, it } from 'vitest';
import * as main from '../electron/supply-chain.cjs';
import * as nasdaqMain from '../electron/nasdaq.cjs';
import { docQueryString, highlightTerms, parseDocSearch } from '../src/data/live/docsearch';
import { isSpac, monthsBetween, parseNasdaqIpo, tradingFrom, usDate } from '../src/data/live/ipo';
import { periodMonths, sinceOffer } from '../src/functions/IPO';
import { groupReturn } from '../src/functions/IndexBoards';
import { buybackSummary, rowRounding, shareRounding, tooCoarse } from '../src/data/buybacks';
import type { CompanyFacts, XbrlFact } from '../src/data/live/sec';

describe('GRR: group returns', () => {
  it("is the change in the members' combined value, or their average when equal-weighted", () => {
    // 100 that rose 10% and 300 that fell 10%: 400 now against 90.9 + 333.3 at the start.
    expect(groupReturn([{ cap: 110, r: 10 }, { cap: 270, r: -10 }])).toBeCloseTo((380 / (100 + 300) - 1) * 100, 6);
    expect(groupReturn([{ cap: 110, r: 10 }, { cap: 270, r: -10 }], true)).toBe(0);
    expect(groupReturn([{ cap: NaN, r: 5 }])).toBeNaN();
    expect(groupReturn([{ cap: NaN, r: 5 }], true)).toBe(5);
  });
});

describe('IPO: Nasdaq calendar', () => {
  const month = JSON.stringify({
    data: {
      priced: { rows: [
        { dealID: '1', proposedTickerSymbol: 'CTY', companyName: 'CITY THERAPEUTICS, INC.', proposedExchange: 'NASDAQ Global', proposedSharePrice: '18.00', sharesOffered: '11,111,111', pricedDate: '10/16/2026', dollarValueOfSharesOffered: '$199,999,998', dealStatus: 'Priced' },
        { dealID: '2', proposedTickerSymbol: 'BRRKU', companyName: 'Bluerock Acquisition Corp. II', proposedExchange: 'NASDAQ Global', proposedSharePrice: '10.00', sharesOffered: '15,000,000', pricedDate: '9/25/2026', dollarValueOfSharesOffered: '$150,000,000' },
        { dealID: '3', proposedTickerSymbol: 'RZAI', companyName: 'ROZE AI INC.', proposedSharePrice: null, sharesOffered: '13,878,565', pricedDate: '9/29/2026', dollarValueOfSharesOffered: '' },
      ] },
      upcoming: { upcomingTable: { rows: [{ dealID: '4', proposedTickerSymbol: 'NEWC', companyName: 'New Co', proposedExchange: 'NYSE', proposedSharePrice: '15.00-17.00', sharesOffered: '10,000,000', expectedPriceDate: '10/30/2026' }] } },
      filed: { rows: [{ dealID: '5', proposedTickerSymbol: 'ISTL', companyName: 'iStep Learning Ltd', filedDate: '10/19/2026', dollarValueOfSharesOffered: '$23,000,000' }] },
      withdrawn: { rows: [{ dealID: '6', proposedTickerSymbol: null, companyName: 'Kepuni Holdings Inc.', filedDate: '8/31/2021', withdrawDate: '10/19/2026', sharesOffered: '2,500,000', dollarValueOfSharesOffered: '$20,125,000' }] },
    },
  });

  it('reads every section of a month', () => {
    const r = parseNasdaqIpo(month);
    if ('error' in r) throw new Error(r.error);
    expect(r.data.map((d) => [d.status, d.symbol, d.price, d.amount, d.spac])).toEqual([
      ['priced', 'CTY', 18, 199999998, false],
      ['priced', 'BRRKU', 10, 150000000, true],
      ['priced', 'RZAI', undefined, undefined, false],
      ['upcoming', 'NEWC', 16, 10_000_000 * 16, false],
      ['filed', 'ISTL', undefined, 23_000_000, false],
      ['withdrawn', '', undefined, 20_125_000, false],
    ]);
    expect(r.data[3]).toMatchObject({ priceLow: 15, priceHigh: 17, date: Date.UTC(2026, 9, 30) });
    expect(r.data[5].filed).toBe(Date.UTC(2021, 7, 31));
    expect(parseNasdaqIpo('nope')).toEqual({ error: 'Nasdaq returned a page that is not JSON.' });
    expect(usDate('9/5/2026')).toBe(Date.UTC(2026, 8, 5));
    expect(isSpac('Live Oak Mobility Acquisition Corp', 'LOVIU', 10)).toBe(true);
  });

  it('measures the first day and the return since the offer', () => {
    const priced = Date.UTC(2026, 9, 15);
    const t = tradingFrom({ timestamp: [priced / 1000 - 86400, priced / 1000 + 14.5 * 3600 + 86400 - 86400 + 3600, priced / 1000 + 2 * 86400], close: [null, 22.4, 20.83] }, priced);
    expect(t).toEqual({ first: 22.4, last: 20.83 });
    const r = sinceOffer({ id: '1', status: 'priced', symbol: 'CTY', name: 'x', exchange: '', price: 18, date: priced, spac: false }, t);
    expect(r.day1).toBeCloseTo(24.444, 2);
    expect(r.since).toBeCloseTo(15.722, 2);
  });

  it('asks for whole months, this one and the same a year back', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(periodMonths('3m', Date.UTC(2026, 9, 21))).toMatchObject({ months: ['2026-08', '2026-09', '2026-10'], prior: ['2025-08', '2025-09', '2025-10'] });
    expect(periodMonths('ytd', Date.UTC(2026, 1, 3)).months).toEqual(['2026-01', '2026-02']);
    expect(nasdaqMain.nasdaqIpoRequest('2026-10', Date.UTC(2026, 9, 21))?.url).toBe('https://api.nasdaq.com/api/ipo/calendar?date=2026-10');
    expect(nasdaqMain.nasdaqIpoRequest('2026-13')).toBeNull();
    expect(nasdaqMain.nasdaqIpoRequest('2019-01', Date.UTC(2026, 9, 21))).toBeNull();
  });
});

describe('DS: document search', () => {
  it('reads hits and facets, and asks only for what the page allows', () => {
    const text = JSON.stringify({
      hits: { total: { value: 8, relation: 'eq' }, hits: [{ _id: '0000320193-25-000079:aapl-20250927.htm', _source: { ciks: ['0000320193'], display_names: ['Apple Inc.  (AAPL)  (CIK 0000320193)'], form: '10-K', file_description: '10-K', file_date: '2025-10-31', period_ending: '2025-09-27' } }] },
      aggregations: { form_filter: { buckets: [{ key: '10-Q', doc_count: 6 }] }, entity_filter: { buckets: [{ key: 'Apple Inc.  (AAPL)  (CIK 0000320193)', doc_count: 8 }] } },
    });
    expect(parseDocSearch(text)).toEqual({
      total: 8,
      more: false,
      hits: [{ id: '0000320193-25-000079:aapl-20250927.htm', cik: 320193, company: 'Apple Inc.', tickers: ['AAPL'], form: '10-K', description: '10-K', filed: '2025-10-31', period: '2025-09-27', path: '320193/000032019325000079/aapl-20250927.htm', file: 'aapl-20250927.htm' }],
      forms: [{ key: '10-Q', count: 6 }],
      companies: [{ key: 'Apple Inc.  (AAPL)  (CIK 0000320193)', count: 8 }],
    });
    const q = docQueryString({ words: '"supply chain" tariffs', forms: ['10-K', '10-Q'], ciks: [320193], from: '2024-01-01', to: '2026-10-21', page: 1 });
    expect(main.searchUrl(q)).toBe('https://efts.sec.gov/LATEST/search-index?q=%22supply%20chain%22%20tariffs&forms=10-K%2C10-Q&ciks=0000320193&dateRange=custom&startdt=2024-01-01&enddt=2026-10-21&from=100');
    expect(main.searchUrl('q=ok&from=150')).toBeNull();
    expect(main.searchUrl('q=<b>x</b>')).toBeNull();
    expect(main.searchUrl('q=fine&url=http://x')).toBeNull();
    expect(highlightTerms('"supply chain" OR tariffs AND it')).toEqual(['SUPPLY CHAIN', 'TARIFFS']);
  });
});

describe('BBK: buybacks', () => {
  const f = (start: string | undefined, end: string, val: number, form = '10-Q', fp = 'Q1'): XbrlFact => ({ ...(start ? { start } : {}), end, val, accn: `a-${end}-${form}`, form, fy: 2026, fp, filed: end.replace(/-\d\d$/, '-28') });
  const cf: CompanyFacts = {
    cik: 1,
    name: 'Example Co',
    ownEnd: {},
    facts: {
      'us-gaap:PaymentsForRepurchaseOfCommonStock': { USD: [
        f('2025-07-01', '2025-09-30', 100), f('2025-10-01', '2025-12-31', 120), f('2026-01-01', '2026-03-31', 80),
        // The fourth quarter only as a six-month total: the quarter is calculated.
        f('2026-01-01', '2026-06-30', 230, '10-Q', 'Q2'),
      ] },
      'us-gaap:StockRepurchasedDuringPeriodShares': { shares: [f('2025-07-01', '2025-09-30', 10), f('2025-10-01', '2025-12-31', 12), f('2026-01-01', '2026-03-31', 8), f('2026-04-01', '2026-06-30', 15)] },
      'us-gaap:PaymentsOfDividends': { USD: [f('2025-07-01', '2025-09-30', 20), f('2025-10-01', '2025-12-31', 20), f('2026-01-01', '2026-03-31', 21), f('2026-04-01', '2026-06-30', 21)] },
      'us-gaap:StockRepurchaseProgramRemainingAuthorizedRepurchaseAmount1': { USD: [f(undefined, '2026-06-30', 900)] },
      'dei:EntityCommonStockSharesOutstanding': { shares: [f(undefined, '2025-07-20', 1000), f(undefined, '2026-07-20', 950)] },
    },
  };
  it('totals the last four quarters with their shares and dividends', () => {
    const s = buybackSummary(cf, 'USD', 'quarter');
    expect(s.rows.map((r) => [r.end, r.buyback, r.derived ?? false, r.shares])).toEqual([
      ['2025-09-30', 100, false, 10],
      ['2025-12-31', 120, false, 12],
      ['2026-03-31', 80, false, 8],
      ['2026-06-30', 150, true, 15],
    ]);
    expect(s.ltm).toEqual({ buyback: 450, shares: 45, dividends: 82, through: '2026-06-30', basis: 'quarters', sharesRounding: 13, sharesMissing: [] });
    expect(s.remaining).toEqual({ val: 900, end: '2026-06-30' });
    expect(s.sharesNow).toEqual({ val: 950, end: '2026-07-20' });
    expect(s.sharesYearAgo).toEqual({ val: 1000, end: '2025-07-20' });
    expect(s.rows[3].sharesOut).toBe(950);
  });

  it('reads how coarsely a share count is filed, and gives no average price where the rounding could move it more than 1%', () => {
    expect(shareRounding(5_000_000)).toBe(1_000_000);
    expect(shareRounding(37_450_000)).toBe(10_000);
    expect(shareRounding(1_234_567)).toBe(1);
    // Coca-Cola files whole millions: 1,000,000 shares for 102 million dollars is anything from 68 to 204 a share.
    expect(tooCoarse(1_000_000, shareRounding(1_000_000))).toBe(true);
    expect(tooCoarse(37_450_000, shareRounding(37_450_000))).toBe(false);
    // A count derived from two rounded totals can be off by both roundings.
    expect(rowRounding({ end: '2026-06-30', shares: 3_000_000, sharesDerived: true })).toBe(2_000_000);
  });

  it("names the quarter whose share count the filings leave out (Coca-Cola's fourth quarter)", () => {
    const k = (start: string, end: string, val: number, form: string, fp: string): XbrlFact => ({ start, end, val, accn: `k-${end}-${form}`, form, fy: 2025, fp, filed: end.replace(/-\d\d$/, '-28') });
    const ko: CompanyFacts = {
      cik: 21344,
      name: 'Coca-Cola',
      ownEnd: {},
      facts: {
        // Filed as year-to-date cash totals and a full year (Coca-Cola, 2025), in millions of dollars.
        'us-gaap:PaymentsForRepurchaseOfCommonStock': { USD: [
          k('2025-01-01', '2025-03-28', 370e6, '10-Q', 'Q1'), k('2025-01-01', '2025-06-27', 472e6, '10-Q', 'Q2'),
          k('2025-01-01', '2025-09-26', 644e6, '10-Q', 'Q3'), k('2025-01-01', '2025-12-31', 746e6, '10-K', 'FY'),
          k('2026-01-01', '2026-04-03', 477e6, '10-Q', 'Q1'),
        ] },
        // Shares for each quarter, but no full-year count in the annual report.
        'us-gaap:TreasuryStockSharesAcquired': { shares: [
          k('2025-01-01', '2025-03-28', 4e6, '10-Q', 'Q1'), k('2025-03-29', '2025-06-27', 1e6, '10-Q', 'Q2'),
          k('2025-06-28', '2025-09-26', 3e6, '10-Q', 'Q3'), k('2026-01-01', '2026-04-03', 5e6, '10-Q', 'Q1'),
        ] },
      },
    };
    const s = buybackSummary(ko, 'USD', 'quarter');
    expect(s.ltm?.buyback).toBe(102e6 + 172e6 + 102e6 + 477e6);
    expect(s.ltm?.shares).toBeNaN();
    expect(s.ltm?.sharesMissing.map((r) => r.end)).toEqual(['2025-12-31']);
  });
});

describe('WBF: Treasury futures in 32nds', () => {
  it('writes prices and changes in 32nds and quarters of a 32nd', async () => {
    const { futures32, change32 } = await import('../src/functions/WBF');
    expect(futures32(105.28125)).toBe('105-09');
    expect(futures32(101.87891)).toBe('101-28¼');
    expect(futures32(106.484375)).toBe('106-15+');
    expect(futures32(103.9375)).toBe('103-30');
    expect(futures32(103.9453125)).toBe('103-30¼');
    expect(change32(-0.03125)).toBe('-0-01');
    expect(change32(0.5)).toBe('+0-16');
    expect(change32(0)).toBe('0-00');
  });
});
