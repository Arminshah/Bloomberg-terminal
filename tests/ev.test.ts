import { describe, expect, it } from 'vitest';
import { engine } from '../src/data/market';
import { keyStats } from '../src/data/fundamentals';
import { periodFrom, seriesByPeriod } from '../src/data/live/yfund';
import { evBuildUp } from '../src/functions/RV';
import { percentRank } from '../src/finance/stats';
import att from './fixtures/yahoo-t-balance-2026-09.json';

// Yahoo's quarterly balance sheet lines for AT&T as answered on 26 October 2026: debt, cash, minority interest and
// preferred stock.
describe('Enterprise value (PEERS)', () => {
  it("reads minority interest and preferred stock from the balance sheet with the debt and cash", () => {
    const rows = seriesByPeriod(att, 'quarterly');
    const end = Math.max(...rows.keys());
    expect(new Date(end).toISOString().slice(0, 10)).toBe('2026-09-30');
    const p = periodFrom('Q3', end, rows.get(end)!);
    expect(p.debt).toBe(178147);
    expect(p.cash).toBe(10767);
    expect(p.minority).toBe(17985);
    expect(p.preferred).toBe(0);
    // A line the answer leaves out is unknown, not zero.
    expect(periodFrom('Q3', end, new Map([['TotalDebt', 1e9]])).minority).toBeNaN();
  });

  it('adds minority interest and preferred stock to market value and net debt', () => {
    const def = engine.securities.find((d) => d.cls === 'equity' && d.eq && Number.isFinite(d.eq.netDebt) && !['Financials'].includes(d.eq.sector))!;
    const eq = def.eq!;
    const saved = { minority: eq.minority, preferred: eq.preferred };
    try {
      eq.minority = undefined;
      eq.preferred = undefined;
      const without = keyStats(def);
      expect(without.ev).toBeCloseTo(without.evParts.mcap + eq.netDebt, 6);
      eq.minority = 1200;
      eq.preferred = 300;
      const k = keyStats(def);
      expect(k.ev).toBeCloseTo(without.ev + 1500, 6);
      expect(k.evParts).toMatchObject({ netDebt: eq.netDebt, minority: 1200, preferred: 300 });
    } finally {
      eq.minority = saved.minority;
      eq.preferred = saved.preferred;
    }
  });

  it('spells out the parts, saying which the source does not list', () => {
    expect(evBuildUp({ mcap: 200_000, netDebt: 167_380, minority: 17_985, preferred: 0 }, 1e6)).toBe('Market value 200.00B + net debt 167.38B + preferred stock 0 + minority interest 17.99B');
    expect(evBuildUp({ mcap: 100_000, netDebt: -5_000, minority: NaN, preferred: NaN }, 1e6)).toBe('Market value 100.00B − net cash 5.00B + preferred stock: none listed + minority interest: none listed');
  });
});

describe("PEERS' percentile rank", () => {
  it("ranks as Excel's PERCENTRANK.INC: the share of the other values below", () => {
    // Microsoft's example for PERCENTRANK.INC: {13, 12, 11, 8, 4, 3, 2, 1, 1, 1}; 2 is 0.333, 4 is 0.555 (shown
    // truncated to three digits) and 8 is 0.666.
    const xs = [13, 12, 11, 8, 4, 3, 2, 1, 1, 1];
    expect(percentRank(xs, 2)).toBeCloseTo(3 / 9, 12);
    expect(percentRank(xs, 4)).toBeCloseTo(5 / 9, 12);
    expect(percentRank(xs, 8)).toBeCloseTo(6 / 9, 12);
    // The lowest is 0 (ties share it), the highest 1.
    expect(percentRank(xs, 1)).toBe(0);
    expect(percentRank(xs, 13)).toBe(1);
    // NM and missing figures are left out; a value not in the set, or a set of one, has no rank.
    expect(percentRank([10, NaN, 20, 30], 20)).toBe(0.5);
    expect(percentRank(xs, 5)).toBeNaN();
    expect(percentRank([7], 7)).toBeNaN();
  });
});
