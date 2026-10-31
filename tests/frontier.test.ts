import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyse, monthsBetween, optimum, parseAssets, priceTable } from '../src/data/frontier';
import { monthEndPath, monthEndsOf, type MonthEndSeries } from '../src/data/live/month-end-prices';
import { general } from '../src/functions/FRONTIER';

const fixture = JSON.parse(readFileSync('tests/fixtures/ftse-month-end-2009-2019.json', 'utf8')) as { closes: Record<string, Record<string, [string, number]>> };
const seriesOf = (symbol: string): MonthEndSeries => ({
  symbol,
  currency: 'GBp',
  months: Object.fromEntries(Object.entries(fixture.closes[symbol]).map(([m, [day, close]]) => [m, { day, close }])),
});
const by = Object.fromEntries(Object.keys(fixture.closes).map((s) => [s, seriesOf(s)]));

describe('securities typed for the mean-variance screen', () => {
  it('reads London lines the terminal way, Yahoo symbols and US tickers', () => {
    const { assets, bad } = parseAssets('BATS LN, gsk ln equity; RKT.L\nAAPL US, MSFT, BRK/B US, ???');
    expect(assets).toEqual([
      { label: 'BATS LN Equity', yahoo: 'BATS.L' },
      { label: 'GSK LN Equity', yahoo: 'GSK.L' },
      { label: 'RKT LN Equity', yahoo: 'RKT.L' },
      { label: 'AAPL US Equity', yahoo: 'AAPL' },
      { label: 'MSFT US Equity', yahoo: 'MSFT' },
      { label: 'BRK/B US Equity', yahoo: 'BRK-B' },
    ]);
    expect(bad).toEqual(['???']);
  });

  it('keeps each security once', () => {
    expect(parseAssets('BATS LN, BATS.L, BATS LN Equity').assets).toHaveLength(1);
  });
});

describe("Yahoo's daily closes as month-end last prices", () => {
  it('keeps the last close of each month in the exchange time zone, skipping gaps', () => {
    // 30 and 31 March 2026 and 1 April at 08:00 London (07:00 UTC in summer time, gmtoffset 3600); a missing close.
    const t = [Date.UTC(2026, 2, 30, 7) / 1000, Date.UTC(2026, 2, 31, 7) / 1000, Date.UTC(2026, 3, 1, 7) / 1000, Date.UTC(2026, 3, 2, 7) / 1000];
    const s = monthEndsOf({ chart: { result: [{ meta: { symbol: 'BATS.L', currency: 'GBp', gmtoffset: 3600, longName: 'British American Tobacco p.l.c.' }, timestamp: t, indicators: { quote: [{ close: [4100, 4120.5, 4130, null] }] } }] } })!;
    expect(s.months).toEqual({ '2026-03': { day: '2026-03-31', close: 4120.5 }, '2026-04': { day: '2026-04-01', close: 4130 } });
    expect(s.currency).toBe('GBp');
    expect(s.name).toBe('British American Tobacco p.l.c.');
    expect(monthEndsOf({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{ close: [] }] } }] } })).toBeNull();
  });

  it('asks for daily closes from the first day of the first month to the last day of the last', () => {
    expect(monthEndPath('BATS.L', '2009-02', '2019-01')).toBe(`/v8/finance/chart/BATS.L?interval=1d&period1=${Date.UTC(2009, 1, 1) / 1000}&period2=${Date.UTC(2019, 1, 1) / 1000}`);
    expect(monthsBetween('2018-11', '2019-02')).toEqual(['2018-11', '2018-12', '2019-01', '2019-02']);
  });
});

describe('the price table and the analysis on it', () => {
  it("dates each row by its month's last trading day and leaves out a security without every month", () => {
    const partial: MonthEndSeries = { symbol: 'NEW.L', months: { '2018-12': { day: '2018-12-31', close: 10 }, '2019-01': { day: '2019-01-31', close: 11 } } };
    const t = priceTable(parseAssets('BATS LN, GSK LN, NEW LN, FERG LN').assets, { ...by, 'NEW.L': partial, 'FERG.L': null }, '2009-02', '2019-01');
    expect(t.months).toHaveLength(120);
    expect(t.dates[0]).toBe('2009-02-27');
    expect(t.dates.at(-1)).toBe('2019-01-31');
    expect(t.kept.map((a) => a.label)).toEqual(['BATS LN Equity', 'GSK LN Equity']);
    expect(t.prices[0].slice(0, 3)).toEqual([1797, 1613, 1639]);
    expect(t.missing.map((a) => a.label)).toEqual(['FERG LN Equity']);
    expect(t.partial).toEqual([{ asset: { label: 'NEW LN Equity', yahoo: 'NEW.L' }, first: '2018-12', last: '2019-01' }]);
  });

  it("gives the paper's four names on their own prices, February 2009 to January 2019, rf 3% a year", () => {
    const t = priceTable(parseAssets('BATS LN, GSK LN, RKT LN, DGE LN').assets, by, '2009-02', '2019-01');
    const a = analyse(t.prices, 0.03 / 12)!;
    expect(a.mv.gmvp.map((w) => (w * 100).toFixed(2))).toEqual(['-7.85', '26.43', '27.29', '54.13']);
    expect((a.ewp.ret * 100).toFixed(3)).toBe('0.701');
    expect(a.tp!.weights.map((w) => (w * 100).toFixed(2))).toEqual(['-45.67', '-26.03', '48.64', '123.06']);
    expect(a.tp!.sharpe.toFixed(4)).toBe('0.2659');
  });

  it('runs the long-only optimum over the screened names', () => {
    const t = priceTable(parseAssets('BATS LN, GSK LN, RKT LN, DGE LN, BKG LN').assets, by, '2009-02', '2019-01');
    const o = optimum(t.prices)!;
    expect(o.weights.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 12);
    expect(o.weights.every((w) => w >= 0)).toBe(true);
    expect(o.weights[0]).toBe(0);
  });

  it("writes figures in a spreadsheet's general format", () => {
    expect(general(0.009445750)).toBe('0.00944575');
    expect(general(0.0309716114)).toBe('0.030971611');
    expect(general(2633.1180, 3)).toBe('2633.118');
    expect(general(870.5, 3)).toBe('870.5');
  });
});
