import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { DAY_MS, dayNum } from '../src/data/calendar';
import { dividendGrowth, earningsReaction, reportSessionDay, splitRatio, splitType } from '../src/data/fundamentals';
import { buildRealFund, cleanOfficerName, floatStats, officersFrom } from '../src/data/live/yfund';
import { barsFromChart, splitsFromChart } from '../src/data/live/yahoo';
import { loadAnalystPart, type AnalystPart, type RatingTally, type TargetConsensus } from '../src/data/live/analysts';
import type { FinnhubPart, NextReport } from '../src/data/live/finnhub';
import { analystSnapshot, nextQuarterLine, ratingPeriod, ratingsLine, targetLine, type SnapshotInput } from '../src/data/live/analyst-snapshot';
import { lookupFn } from '../src/terminal/registry';
import { parseCommand } from '../src/terminal/commands';

// Trimmed live Yahoo answers (18 October 2026): AAPL and ASML.AS key statistics and officers, GE and NVDA splits.
import live from './fixtures/yahoo-profile-splits.json';

const iso = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const NOW = Date.UTC(2026, 9, 18, 12);

describe('float and short interest (Yahoo key statistics)', () => {
  it('reads the fields Yahoo gives for a US stock', () => {
    const f = floatStats(live.AAPL.quoteSummary.result[0].defaultKeyStatistics);
    expect(f.float).toBe(14_569_078_010);
    expect(f.short).toBe(120_763_539);
    expect(f.shortPctFloat).toBeCloseTo(0.83, 6);
    expect(f.daysToCover).toBe(2.82);
    expect(new Date(f.asOf).toISOString().slice(0, 10)).toBe('2026-09-30');
    expect(f.shortPrior).toBe(139_749_097);
    expect(new Date(f.priorAsOf).toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('leaves what Yahoo does not give as missing, never zero', () => {
    // ASML in Amsterdam: a float, and {} for every short-interest field.
    const f = floatStats(live['ASML.AS'].quoteSummary.result[0].defaultKeyStatistics);
    expect(f.float).toBe(382_977_408);
    for (const k of ['short', 'shortPctFloat', 'daysToCover', 'asOf', 'shortPrior', 'priorAsOf'] as const) expect(f[k], k).toBeNaN();
    const zero = floatStats({ floatShares: { raw: 0 }, sharesShort: { raw: 0 }, shortRatio: 0, dateShortInterest: null });
    expect(Object.values(zero).every((v) => Number.isNaN(v))).toBe(true);
    expect(Object.values(floatStats(undefined)).every((v) => Number.isNaN(v))).toBe(true);
  });
});

describe('company officers (Yahoo company profile)', () => {
  it('lists every officer in the source order with age, birth year, pay and fiscal year', () => {
    const list = officersFrom(live.AAPL.quoteSummary.result[0].assetProfile);
    expect(list).toHaveLength(10);
    expect(list[0]).toEqual({ name: 'Timothy D. Cook', title: 'Executive Chairman of the Board', age: 64, yearBorn: 1961, totalPay: 16_759_518, fiscalYear: 2025 });
    // Doubled spaces collapse; degrees after the name stay.
    expect(list[1].name).toBe('Kevan Parekh');
    expect(list.map((o) => o.name)).toContain('Jennifer G. Newstead J.D.');
    // No age, birth year or pay in the source: missing, not zero.
    const ir = list.find((o) => o.name === 'Suhasini Chandramouli')!;
    expect(ir.age).toBeNaN();
    expect(ir.yearBorn).toBeNaN();
    expect(ir.totalPay).toBeNaN();
    expect(ir.fiscalYear).toBe(2025);
  });

  it('cleans names the way the profile CEO is cleaned, and skips unnamed rows', () => {
    expect(cleanOfficerName('Prof. William J.  Dally Ph.D.')).toBe('William J. Dally Ph.D.');
    expect(cleanOfficerName('Mrs Jane Doe')).toBe('Jane Doe');
    expect(officersFrom({ companyOfficers: [{ title: 'CFO' }, { name: '  ', title: 'x' }, { name: 'Ann Lee', totalPay: { raw: 0 } }] })).toEqual([{ name: 'Ann Lee', title: '', age: NaN, yearBorn: NaN, totalPay: NaN, fiscalYear: NaN }]);
    expect(officersFrom({})).toEqual([]);
  });

  it('keeps the officers, float and short interest with the rest of the company data', () => {
    const fund = buildRealFund(engine.get('AAPL US Equity')!, structuredClone(live.AAPL), null, null, null, NOW);
    expect(fund.officers.find((o) => /chief executive|ceo/i.test(o.title))?.name).toBe('John Ternus');
    expect(fund.float.short).toBe(120_763_539);
    // A company summary without either: none, rather than made up.
    const bare = buildRealFund(engine.get('AAPL US Equity')!, { quoteSummary: { result: [{}] } }, null, null, null, NOW);
    expect(bare.officers).toEqual([]);
    expect(bare.float.float).toBeNaN();
  });
});

describe('splits (Yahoo chart events)', () => {
  it('reads numerator, denominator and the exchange-local date, oldest first', () => {
    const ge = splitsFromChart(live.GE);
    expect(ge.map((x) => [iso(x.day), x.numerator, x.denominator])).toEqual([
      ['2019-02-26', 104, 100],
      ['2021-08-02', 1, 8],
      ['2023-01-04', 1281, 1000],
      ['2024-04-02', 1253, 1000],
    ]);
    // The history request returns them with the bars and dividends.
    const nvda = barsFromChart(live.NVDA);
    expect(nvda.bars).toHaveLength(3);
    expect(nvda.splits.map((x) => `${iso(x.day)} ${splitRatio(x)}`)).toEqual(['2021-07-20 4:1', '2024-06-10 10:1']);
  });

  it('drops splits without both counts and labels reverse splits', () => {
    const chart = { chart: { result: [{ meta: { gmtoffset: 0 }, events: { splits: { a: { date: 1e9, numerator: 0, denominator: 1 }, b: { date: 1e9, numerator: 2 }, c: { numerator: 2, denominator: 1 }, d: { date: 1e9, numerator: 3, denominator: 2 } } } }] } };
    expect(splitsFromChart(chart)).toEqual([{ day: dayNum(1e12), numerator: 3, denominator: 2 }]);
    expect(splitsFromChart(null)).toEqual([]);
    expect(splitType({ numerator: 1, denominator: 8 })).toBe('Reverse split');
    expect(splitType({ numerator: 3, denominator: 2 })).toBe('Stock split');
    expect(splitRatio({ numerator: 1281, denominator: 1000 })).toBe('1281:1000');
  });
});

describe('five-year dividend growth', () => {
  const asOf = Date.UTC(2026, 9, 18);
  /** Quarterly dividends for `years` years back from asOf, growing `g` a year. */
  const quarterly = (years: number, g: number, start = 0.5) => {
    const out: { ex: number; amount: number }[] = [];
    for (let k = 0; k < years * 4; k++) {
      const ex = asOf - (k * 91 + 10) * DAY_MS;
      out.push({ ex, amount: start / (1 + g) ** Math.floor(k / 4) });
    }
    return out;
  };
  const tenYears = Date.UTC(2016, 9, 18);

  it('is the compound annual growth of the 12-month dividend', () => {
    expect(dividendGrowth(quarterly(10, 0.1), asOf, tenYears)).toBeCloseTo(10, 6);
    expect(dividendGrowth(quarterly(10, -0.05), asOf, tenYears)).toBeCloseTo(-5, 6);
  });

  it('needs a full year of dividends five years back', () => {
    // The price history (and the record with it) starts five and a half years ago.
    expect(dividendGrowth(quarterly(10, 0.1), asOf, Date.UTC(2021, 3, 18))).toBeNaN();
    // Dividends began five and a half years ago: the year five years back would be a partial one.
    expect(dividendGrowth(quarterly(5.5, 0.1), asOf, tenYears)).toBeNaN();
    // Dividends stopped this year, or never paid.
    expect(dividendGrowth(quarterly(10, 0.1).filter((d) => d.ex < asOf - 400 * DAY_MS), asOf, tenYears)).toBeNaN();
    expect(dividendGrowth([], asOf, tenYears)).toBeNaN();
    expect(dividendGrowth(quarterly(10, 0.1), asOf, NaN)).toBeNaN();
  });

  it('skips amounts the record does not give', () => {
    const list = [...quarterly(10, 0.1), { ex: asOf - 5 * DAY_MS, amount: NaN }];
    expect(dividendGrowth(list, asOf, tenYears)).toBeCloseTo(10, 6);
  });
});

describe('share price reaction to a report', () => {
  // Thu 2026-10-22 to Wed 2026-10-28 (no session at the weekend).
  const days = ['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28'].map((d) => dayNum(Date.parse(`${d}T00:00:00Z`)));
  const closes = [100, 102, 110, 99, 101];
  const series = { t: Float64Array.from(days.map((d) => d * DAY_MS)), c: Float64Array.from(closes), length: days.length };
  const day = (d: string) => dayNum(Date.parse(`${d}T00:00:00Z`));
  const allFinal = day('2026-10-28');

  it('measures before the open on the report day, after the close on the next session', () => {
    expect(earningsReaction(series, day('2026-10-26'), 'Bef-mkt', allFinal)).toEqual({ pct: (110 / 102 - 1) * 100, basis: 'before-open', from: day('2026-10-23'), to: day('2026-10-26') });
    expect(earningsReaction(series, day('2026-10-26'), 'Aft-mkt', allFinal)).toEqual({ pct: (99 / 110 - 1) * 100, basis: 'after-close', from: day('2026-10-26'), to: day('2026-10-27') });
    // Time not known: the report day against the previous close, and the basis says so.
    expect(earningsReaction(series, day('2026-10-26'), '--', allFinal)).toMatchObject({ pct: (110 / 102 - 1) * 100, basis: 'unknown' });
  });

  it('measures a report on a day without a session on the first session after it', () => {
    expect(earningsReaction(series, day('2026-10-24'), 'Aft-mkt', allFinal)).toEqual({ pct: (110 / 102 - 1) * 100, basis: 'no-session', from: day('2026-10-23'), to: day('2026-10-26') });
  });

  it('waits for final closes and needs history before the report', () => {
    // The 28th is still trading: the after-close reaction to the 27th is not known yet.
    expect(earningsReaction(series, day('2026-10-27'), 'Aft-mkt', day('2026-10-27')).pct).toBeNaN();
    expect(earningsReaction(series, day('2026-10-27'), 'Aft-mkt', allFinal).pct).toBeCloseTo((101 / 99 - 1) * 100, 10);
    expect(earningsReaction(series, day('2026-10-22'), 'Bef-mkt', allFinal).pct).toBeNaN();
    expect(earningsReaction(series, day('2026-10-29'), 'Bef-mkt', allFinal).pct).toBeNaN();
    expect(earningsReaction(series, NaN, '--', allFinal).pct).toBeNaN();
  });

  it('dates a report in the exchange time zone, or by its date when it has no time', () => {
    expect(iso(reportSessionDay(Date.parse('2026-10-29T20:05:00Z'), 'America/New_York'))).toBe('2026-10-29');
    // 22:00 in New York is still the 29th there.
    expect(iso(reportSessionDay(Date.parse('2026-10-30T02:00:00Z'), 'America/New_York'))).toBe('2026-10-29');
    expect(iso(reportSessionDay(Date.parse('2026-10-30T00:00:00Z'), 'America/New_York'))).toBe('2026-10-30');
    expect(iso(reportSessionDay(Date.parse('2026-10-30T02:00:00Z'), undefined))).toBe('2026-10-30');
  });
});

describe('analyst consensus on PROFILE and QUOTE', () => {
  const received = Date.UTC(2026, 9, 18, 9);
  const fmpTarget: AnalystPart<TargetConsensus | null> = { state: 'ok', source: 'FMP', data: { high: 300, low: 180, mean: 250, median: 255 }, at: received };
  const report: FinnhubPart<NextReport | null> = { state: 'ok', data: { date: '2026-10-29', hour: 'amc', quarter: 4, year: 2026, epsEstimate: 1.78, revenueEstimate: 102e9 }, at: received };
  const base: SnapshotInput = { desktop: true, symbol: 'AAPL', ticker: 'AAPL US', yahooResearch: true, last: 200, ccy: 'USD' };

  it('labels each figure with its source', () => {
    expect(targetLine(fmpTarget, 200, 'USD')).toEqual({ label: 'Price target (consensus)', value: '250.00 USD (+25.0% vs last)', source: 'FMP, received 10/18/26' });
    // Yahoo names a currency; one other than the quote's is not compared with the price.
    expect(targetLine({ ...fmpTarget, source: 'Yahoo Finance', currency: 'EUR', stale: true }, 200, 'USD')).toMatchObject({ value: '250.00 EUR', source: 'Yahoo Finance, received 10/18/26, STALE' });
    const fmp: AnalystPart<RatingTally | null> = { state: 'ok', source: 'FMP', data: { strongBuy: 1, buy: 20, hold: 10, sell: 2, strongSell: 0, consensus: 'Buy' } };
    expect(ratingsLine(fmp)).toMatchObject({ value: '21 / 10 / 2 (Buy)', source: 'FMP' });
    expect(nextQuarterLine(report)).toEqual({ label: 'EPS estimate, next quarter', value: '1.78 for Q4 2026, report 10/29/26 after the close', source: 'Finnhub, received 10/18/26' });
  });

  it("names a tally's month as its source dates it", () => {
    expect(ratingPeriod('2026-10-01')).toBe('Oct 2026');
    expect(ratingPeriod('0m')).toBe('current month');
    expect(ratingPeriod('-1m')).toBe('1 month earlier');
    expect(ratingPeriod('-2m')).toBe('2 months earlier');
    expect(ratingPeriod(undefined)).toBe('');
  });

  it('takes the ratings through the ANALYSTS fallback chain: FMP, then Finnhub', async () => {
    const recs = '[{"buy":25,"hold":6,"period":"2026-10-01","sell":1,"strongBuy":12,"strongSell":0,"symbol":"AAPL"},{"buy":24,"hold":7,"period":"2026-09-01","sell":0,"strongBuy":13,"strongSell":0,"symbol":"AAPL"}]';
    const part = await loadAnalystPart('ratings', 'AAPL', {
      analysts: async () => ({ status: 0, text: '', missing: 'FMP_API_KEY' }),
      finnhubResearch: async () => ({ status: 200, text: recs, at: received }),
    });
    expect(ratingsLine(part as AnalystPart<RatingTally | null>)).toEqual({ label: 'Ratings buy / hold / sell', value: '37 / 6 / 1', source: 'Finnhub, Oct 2026' });
  });

  it("says why a figure is missing, in the source's words", () => {
    const snap = analystSnapshot({ ...base, consensus: { state: 'error', source: 'FMP', message: 'No price targets for AAPL from FMP or Yahoo.' }, ratings: { state: 'loading' }, calendar: { state: 'needs-key', message: 'Needs FINNHUB_API_KEY (PROVIDERS).' } });
    expect(snap.notConnected).toBeUndefined();
    expect(snap.lines.map((l) => [l.value, l.missing])).toEqual([
      ['--', 'No price targets for AAPL from FMP or Yahoo.'],
      ['Loading…', undefined],
      ['--', 'Needs FINNHUB_API_KEY (PROVIDERS).'],
    ]);
    expect(nextQuarterLine({ state: 'ok', data: null, at: received })).toMatchObject({ value: '--', missing: 'Finnhub lists no report for the next three months.' });
  });

  it('is not connected only when no source can be asked, and says which key or switch would enable one', () => {
    const browser = analystSnapshot({ ...base, desktop: false, symbol: null });
    expect(browser.lines).toEqual([]);
    expect(browser.notConnected).toMatch(/FMP_API_KEY.*FINNHUB_API_KEY.*YAHOO_RESEARCH_ENABLED/);
    const keys = { consensus: { state: 'needs-key' as const, message: 'Needs FMP_API_KEY on PROVIDERS.' }, ratings: { state: 'needs-key' as const }, calendar: { state: 'needs-key' as const } };
    // Yahoo research answers without a key: still connected.
    expect(analystSnapshot({ ...base, ...keys }).notConnected).toBeUndefined();
    const none = analystSnapshot({ ...base, ...keys, yahooResearch: false });
    expect(none.lines).toEqual([]);
    expect(none.notConnected).toContain('FMP_API_KEY would enable price targets and ratings');
    expect(none.notConnected).toContain('FINNHUB_API_KEY recommendation counts');
    const off = analystSnapshot({ ...base, consensus: { state: 'off' }, ratings: { state: 'off' }, calendar: { state: 'off' }, yahooResearch: false });
    expect(off.notConnected).toContain('FMP_ENABLED switched on');
    expect(off.notConnected).toContain('FINNHUB_ENABLED switched on');
    expect(analystSnapshot({ ...base, symbol: null, ticker: 'ASML NA' }).note).toBe('Analyst research here covers US-listed stocks; ASML NA is not one.');
  });
});

describe('MANAGEMENT (MGMT)', () => {
  it('is an equity function under its Bloomberg mnemonic', () => {
    expect(lookupFn('MGMT')).toBe(lookupFn('MANAGEMENT'));
    expect(lookupFn('MANAGEMENT')).toMatchObject({ category: 'Equity', needsSec: true, classes: ['equity'] });
    expect(parseCommand('MGMT AAPL', lookupFn)).toMatchObject({ kind: 'route', fn: 'MANAGEMENT', sec: { id: 'AAPL US Equity' } });
  });
});
