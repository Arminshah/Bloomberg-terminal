import { afterEach, describe, expect, it } from 'vitest';
import { fmtDate, fmtDay, fmtMonthDayNum, setDateOrder } from '../src/core/format';
import { fmtFieldDate, parseFieldDate, windowBars } from '../src/terminal/daterange';
import { groupedRowNumbers } from '../src/terminal/numbering';
import { blockGeometry, blockPages, weekday, weekSlots, type Slot } from '../src/terminal/pricetable';
import { sourceCode } from '../src/data/sourcecode';
import { matchQuarter, surpriseStats } from '../src/data/ern';
import { ratingSummary } from '../src/data/anr';
import { fomcRows, fomcYears } from '../src/data/fomc';
import { equityRatios } from '../src/data/ratios';
import { emptyPeriod, type FinPeriod } from '../src/data/fundamentals';

const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

describe('range boxes (GP, HP)', () => {
  afterEach(() => setDateOrder('DMY'));

  it('reads the date forms the terminal fields take, day first by default', () => {
    expect(parseFieldDate('19/10/2026')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('19/10/26')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('2/1/26')).toBe(D(2026, 1, 2));
    expect(parseFieldDate('19.10.2026')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('2026-10-19')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('20261019')).toBe(D(2026, 10, 19));
    // Two-digit years from 70 are the 1900s, as on a ten-year history they would be.
    expect(parseFieldDate('31/12/99')).toBe(D(1999, 12, 31));
    setDateOrder('MDY');
    expect(parseFieldDate('10/19/2026')).toBe(D(2026, 10, 19));
    expect(parseFieldDate('1/2/26')).toBe(D(2026, 1, 2));
    expect(parseFieldDate('12/31/99')).toBe(D(1999, 12, 31));
    expect(parseFieldDate('2026-10-19')).toBe(D(2026, 10, 19));
  });

  it('refuses what is not a calendar date', () => {
    for (const bad of ['', 'today', '01/13/2026', '30/02/2026', '2026-02-29', '1/2', '19/10/202']) expect(parseFieldDate(bad), bad).toBeUndefined();
    expect(parseFieldDate('29/02/2028')).toBe(D(2028, 2, 29));
    setDateOrder('MDY');
    for (const bad of ['13/01/2026', '02/30/2026']) expect(parseFieldDate(bad), bad).toBeUndefined();
    expect(parseFieldDate('02/29/2028')).toBe(D(2028, 2, 29));
  });

  it('shows dates as DD/MM/YYYY, or MM/DD/YYYY in the US order, and nothing for no date', () => {
    expect(fmtFieldDate(D(2026, 3, 5))).toBe('05/03/2026');
    expect(fmtDay(D(2026, 3, 5))).toBe('05/03/26');
    expect(fmtDate(D(2026, 3, 5), 'UTC')).toBe('05/03/26');
    expect(fmtMonthDayNum(3, 5)).toBe('05/03');
    setDateOrder('MDY');
    expect(fmtFieldDate(D(2026, 3, 5))).toBe('03/05/2026');
    expect(fmtDay(D(2026, 3, 5), true)).toBe('03/05/2026');
    expect(fmtDate(D(2026, 3, 5), 'UTC')).toBe('03/05/26');
    expect(fmtMonthDayNum(3, 5)).toBe('03/05');
    expect(fmtFieldDate(NaN)).toBe('');
  });

  it('counts the bars inside a typed window and those after it', () => {
    const t = [D(2026, 1, 5), D(2026, 1, 6), D(2026, 1, 7), D(2026, 1, 8), D(2026, 1, 9)];
    expect(windowBars(t, D(2026, 1, 6), D(2026, 1, 8))).toEqual({ count: 3, after: 1 });
    // A window wider than the history takes all of it.
    expect(windowBars(t, D(2025, 1, 1), D(2027, 1, 1))).toEqual({ count: 5, after: 0 });
    // A weekend window holds no bar.
    expect(windowBars(t, D(2026, 1, 10), D(2026, 1, 11)).count).toBe(0);
  });
});

function period(over: Partial<FinPeriod>): FinPeriod {
  return { ...emptyPeriod('FY', D(2025, 12, 31)), ...over };
}

describe('DES ratios page', () => {
  const ltm = period({
    rev: 1000, cogs: 600, gp: 400, rnd: 50, opInc: 200, interest: 20, pretax: 180, ni: 150, shares: 100, eps: 1.5, dps: 0.5,
    cash: 120, recv: 100, inv: 80, curAssets: 400, curLiab: 200, totAssets: 2000, debt: 500, equity: 1000, cfo: 250, capex: 50, fcf: 200,
  });
  const latest = period({ rev: 1000, eps: 1.5, equity: 1000, totAssets: 2000 });
  const prior = period({ rev: 800, eps: 1.2, equity: 900, totAssets: 1600 });

  it('works each ratio out from the statements', () => {
    const r = equityRatios(ltm, latest, prior, 3000);
    expect(r.pcf).toBeCloseTo(12);
    expect(r.pfcf).toBeCloseTo(15);
    expect(r.cfToNi).toBeCloseTo(250 / 150);
    expect(r.bookPerShare).toBeCloseTo(10);
    expect(r.revPerShare).toBeCloseTo(10);
    expect(r.cashPerShare).toBeCloseTo(1.2);
    expect(r.fcfPerShare).toBeCloseTo(2);
    expect(r.revGrowth).toBeCloseTo(25);
    expect(r.epsGrowth).toBeCloseTo(25);
    expect(r.bookGrowth).toBeCloseTo(100 / 9);
    expect(r.assetGrowth).toBeCloseTo(25);
    expect(r.rndToSales).toBeCloseTo(5);
    expect(r.retention).toBeCloseTo(100 * (1 - 0.5 / 1.5));
    expect(r.grossMargin).toBeCloseTo(40);
    expect(r.opMargin).toBeCloseTo(20);
    expect(r.pretaxMargin).toBeCloseTo(18);
    expect(r.netMargin).toBeCloseTo(15);
    expect(r.roa).toBeCloseTo(7.5);
    expect(r.roe).toBeCloseTo(15);
    expect(r.assetTurnover).toBeCloseTo(0.5);
    expect(r.currentRatio).toBeCloseTo(2);
    expect(r.quickRatio).toBeCloseTo(1.6);
    expect(r.debtToAssets).toBeCloseTo(25);
    expect(r.debtToEquity).toBeCloseTo(50);
    expect(r.interestCover).toBeCloseTo(10);
    expect(r.invTurnover).toBeCloseTo(7.5);
    expect(r.recvTurnover).toBeCloseTo(10);
  });

  it('treats costs by their size, whichever sign the statements give them', () => {
    const negative = equityRatios({ ...ltm, cogs: -600, rnd: -50, capex: -50 }, latest, prior, 3000);
    expect(negative.rndToSales).toBeCloseTo(5);
    expect(negative.invTurnover).toBeCloseTo(7.5);
    expect(negative.capexToSales).toBeCloseTo(5);
  });

  it('leaves a ratio out rather than divide by nothing or by a loss', () => {
    const r = equityRatios({ ...ltm, equity: -10, cfo: NaN, shares: 0, eps: -1 }, latest, period({ rev: 0, eps: -2 }), 3000);
    expect(r.roe).toBeNaN();
    expect(r.debtToEquity).toBeNaN();
    expect(r.pcf).toBeNaN();
    expect(r.bookPerShare).toBeNaN();
    expect(r.revGrowth).toBeNaN();
    expect(r.epsGrowth).toBeNaN();
    expect(r.retention).toBeNaN();
    expect(equityRatios(ltm, latest, undefined, 3000).revGrowth).toBeNaN();
  });
});

describe('HP price table', () => {
  // Trading days newest first: Tue 10/20, Mon 10/19, Fri 10/16, Thu 10/15, then Fri 10/02 after a skipped week.
  const days = [D(2026, 10, 20), D(2026, 10, 19), D(2026, 10, 16), D(2026, 10, 15), D(2026, 10, 2)].map((t) => ({ t }));
  const shape = (slots: Slot<{ t: number }>[]) => slots.map((s) => ('gap' in s ? '-' : weekday(s.row.t))).join(' ');

  it('puts a blank line between weeks of daily prices, and none between other periods', () => {
    expect(shape(weekSlots(days, true))).toBe('Tu Mo - Fr Th - Fr');
    expect(shape(weekSlots(days, false))).toBe('Tu Mo Fr Th Fr');
  });

  it('fills each page column by column and never starts or ends a block on a gap', () => {
    // Three lines a block: "Tu Mo -" and "Fr Th -" drop their closing gap, and the last Friday opens page 2.
    const pages = blockPages(weekSlots(days, true), 2, 3);
    expect(pages.map((p) => p.map((c) => shape(c)))).toEqual([['Tu Mo', 'Fr Th'], ['Fr']]);
    // A gap that would open a block is left out.
    expect(blockPages(weekSlots(days, true), 1, 2).map((p) => shape(p[0]))).toEqual(['Tu Mo', 'Fr Th', 'Fr']);
    const many = blockPages(weekSlots(days, false), 2, 2);
    expect(many.map((p) => p.map((c) => shape(c)))).toEqual([['Tu Mo', 'Fr Th'], ['Fr']]);
  });

  it('fits as many blocks across as the width allows', () => {
    expect(blockGeometry(1200, 600, 20)).toEqual({ cols: 4, perCol: 30 });
    expect(blockGeometry(500, 600, 20).cols).toBe(1);
    expect(blockGeometry(2400, 100, 20)).toEqual({ cols: 4, perCol: 8 });
  });
});

describe('ERN table', () => {
  const quarter = (end: string, date: number | undefined, est: number, actual: number) => ({
    end, label: end, date, eps: { est, low: NaN, high: NaN, analysts: NaN, actual }, rev: { est: NaN, low: NaN, high: NaN, analysts: NaN, actual: NaN },
  });
  const past = [quarter('2026-06-27', D(2026, 7, 30), 1.5, 1.6), quarter('2026-03-28', undefined, 1.4, 1.3), quarter('2025-12-27', D(2026, 1, 29), 2.3, 2.4)];

  it('finds the quarter reported on a date: by report date, else the last quarter ended before it', () => {
    expect(matchQuarter(D(2026, 7, 31), past)?.end).toBe('2026-06-27');
    expect(matchQuarter(D(2026, 4, 30), past)?.end).toBe('2026-03-28');
    expect(matchQuarter(D(2026, 1, 30), past)?.end).toBe('2025-12-27');
    // Nothing ended in the four months before.
    expect(matchQuarter(D(2025, 6, 1), past)).toBeUndefined();
  });

  it('averages surprises and price moves over the reports that have them', () => {
    const st = surpriseStats([5, -3, NaN, 1], [2, -4, NaN]);
    expect(st.avgSurprise).toBeCloseTo(1);
    expect(st.avgAbsSurprise).toBeCloseTo(3);
    expect(st.surprises).toBe(3);
    expect(st.avgAbsMove).toBeCloseTo(3);
    expect(st.moves).toBe(2);
    expect(surpriseStats([], []).avgSurprise).toBeNaN();
  });
});

describe('FOMC table', () => {
  // The upper bound: 4.50 until a cut taking effect on 2026-09-17, then 4.25; the series reaches 2026-10-16.
  const upper = { changes: [['2025-01-02', 4.5], ['2026-09-17', 4.25]] as [string, number][], last: 4.25, asOf: '2026-10-16' };
  const lower = { changes: [['2025-01-02', 4.25], ['2026-09-17', 4.0]] as [string, number][], last: 4.0, asOf: '2026-10-16' };

  it('reads each decision from the range in effect the day after it', () => {
    const rows = fomcRows(['2026-07-29', '2026-09-16', '2026-10-28', '2026-09-16'], lower, upper, '2026-10-19');
    expect(rows.map((r) => r.date)).toEqual(['2026-07-29', '2026-09-16', '2026-10-28']);
    expect(rows[0]).toMatchObject({ status: 'decided', lower: 4.25, upper: 4.5, changeBp: 0 });
    expect(rows[1]).toMatchObject({ status: 'decided', lower: 4.0, upper: 4.25, changeBp: -25 });
    expect(rows[2]).toMatchObject({ status: 'scheduled' });
    expect(rows[2].upper).toBeNaN();
  });

  it('leaves a decision the series does not reach unknown, and marks today', () => {
    const rows = fomcRows(['2024-12-18', '2026-10-16', '2026-10-19'], lower, upper, '2026-10-19');
    // Before the series starts.
    expect(rows[0].upper).toBeNaN();
    expect(rows[0].changeBp).toBeNaN();
    // The day after is past the series' last day.
    expect(rows[1].upper).toBeNaN();
    expect(rows[2].status).toBe('today');
    expect(fomcRows(['2026-01-28'], undefined, undefined, '2026-10-19')[0].upper).toBeNaN();
  });

  it('lists the years the calendar covers', () => {
    expect(fomcYears(['2027-01-27', '2026-01-28', '2026-03-18'])).toEqual([2026, 2027]);
  });
});

describe('ANR summary', () => {
  it('shares out buys, holds and sells and scores them from 1 (sell) to 5 (buy)', () => {
    const r = ratingSummary({ strongBuy: 2, buy: 4, hold: 3, sell: 1, strongSell: 0, consensus: 'Buy' });
    expect(r).toMatchObject({ buys: 6, holds: 3, sells: 1, total: 10 });
    expect(r.buyPct).toBeCloseTo(60);
    expect(r.sellPct).toBeCloseTo(10);
    expect(r.score).toBeCloseTo((10 + 16 + 9 + 2) / 10);
  });

  it('gives no score without ratings and ignores missing counts', () => {
    expect(ratingSummary({ strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0, consensus: '' }).score).toBeNaN();
    expect(ratingSummary({ strongBuy: NaN, buy: 1, hold: NaN, sell: 0, strongSell: 0, consensus: '' }).score).toBe(4);
  });
});

describe('headline source codes', () => {
  it('gives well-known publishers their usual short names', () => {
    expect(sourceCode('Reuters')).toBe('RTRS');
    expect(sourceCode('Benzinga')).toBe('BZ');
    expect(sourceCode('The Wall Street Journal')).toBe('WSJ');
    expect(sourceCode('SEC EDGAR (company filing)')).toBe('SEC');
    expect(sourceCode('Yahoo Finance')).toBe('YHOO');
  });

  it('abbreviates any other name from its words or its site', () => {
    expect(sourceCode('Kiplinger Personal Finance')).toBe('KPF');
    expect(sourceCode('Investopedia')).toBe('INVE');
    // A short name in capitals stays whole; a longer one is cut to four letters.
    expect(sourceCode('MSN')).toBe('MSN');
    expect(sourceCode('NASDAQ')).toBe('NASD');
    expect(sourceCode('www.reuters.com')).toBe('RTRS');
    expect(sourceCode('example.com')).toBe('EXAM');
    expect(sourceCode('  ')).toBe('--');
  });
});

describe('grouped monitor numbers (WEI, GLCO, WB)', () => {
  it('starts each group on its own ten', () => {
    expect(groupedRowNumbers([8, 6, 3])).toEqual([[11, 12, 13, 14, 15, 16, 17, 18], [21, 22, 23, 24, 25, 26], [31, 32, 33]]);
  });

  it('moves the next group past a group longer than nine rows', () => {
    const [, emea, asia] = groupedRowNumbers([8, 14, 10]);
    expect(emea[0]).toBe(21);
    expect(emea[13]).toBe(34);
    expect(asia[0]).toBe(41);
    expect(asia[9]).toBe(50);
  });

  it('keeps a ten for an empty group and skips the function bar numbers', () => {
    expect(groupedRowNumbers([2, 0, 1])).toEqual([[11, 12], [], [31]]);
    const big = groupedRowNumbers([9, 9, 9, 9, 9, 9, 9, 9, 9]);
    expect(big[8]).toEqual([91, 92, 93, 94, 95, 100, 101, 102, 103]);
  });
});
