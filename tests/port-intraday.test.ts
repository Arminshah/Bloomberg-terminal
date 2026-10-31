import { describe, expect, it } from 'vitest';
import { GICS_SECTORS, buckets, movers, toWeights, type PortLine } from '../src/data/port-intraday';

describe('PORT Intraday', () => {
  // Two holdings worth 6,000 and 4,000; a three-member benchmark.
  const port: PortLine[] = toWeights([
    { id: 'AAPL US Equity', name: 'APPLE INC', bucket: 'Information Technology', mv: 6000, ret: 1 },
    { id: 'XOM US Equity', name: 'EXXON MOBIL', bucket: 'Energy', mv: 4000, ret: -2 },
  ]).map(({ mv: _mv, ...l }) => l);
  const bench: PortLine[] = [
    { id: 'AAPL US Equity', name: 'Apple', bucket: 'Information Technology', weight: 30, ret: 1 },
    { id: 'MSFT US Equity', name: 'Microsoft', bucket: 'Information Technology', weight: 30, ret: 0.5 },
    { id: 'JPM US Equity', name: 'JPMorgan', bucket: 'Financials', weight: 40, ret: -1 },
  ];
  const { rows, total } = buckets(port, bench);
  const row = (n: string) => rows.find((r) => r.name === n)!;

  it('weights holdings by market value', () => {
    expect(port.map((l) => l.weight)).toEqual([60, 40]);
    expect(toWeights([{ mv: NaN }, { mv: 5 }]).map((x) => x.weight)).toEqual([NaN, 100]);
  });

  it('counts, weighs and adds the contributions of each sector, with the differences', () => {
    const it = row('Information Technology');
    expect([it.nPort, it.nBench, it.wPort, it.wBench, it.wDiff]).toEqual([1, 2, 60, 60, 0]);
    // Port: 60% × 1% = 0.60; benchmark: 30% × 1% + 30% × 0.5% = 0.45.
    expect(it.ctrPort).toBeCloseTo(0.6, 12);
    expect(it.ctrBench).toBeCloseTo(0.45, 12);
    expect(it.ctrDiff).toBeCloseTo(0.15, 12);
    // A sector's return is its contribution over its weight.
    expect(it.retPort).toBeCloseTo(1, 12);
    expect(it.retBench).toBeCloseTo(0.75, 12);
    expect(row('Energy')).toMatchObject({ nPort: 1, nBench: 0, wBench: 0 });
    expect(row('Energy').retBench).toBeNaN();
    expect(row('Financials').ctrBench).toBeCloseTo(-0.4, 12);
  });

  it('totals both sides: the day return is the sum of the contributions', () => {
    expect(total.wPort).toBe(100);
    expect(total.ctrPort).toBeCloseTo(0.6 - 0.8, 12);
    expect(total.ctrBench).toBeCloseTo(0.45 - 0.4, 12);
    expect(total.retPort).toBeCloseTo(-0.2, 12);
  });

  it('lists every GICS sector in order, and expands a sector to its holdings with their benchmark weight', () => {
    expect(rows.map((r) => r.name)).toEqual(GICS_SECTORS);
    expect(row('Information Technology').lines[0]).toMatchObject({ id: 'AAPL US Equity', weight: 60, wBench: 30 });
    expect(row('Information Technology').lines[0].ctr).toBeCloseTo(0.6, 12);
  });

  it('ranks movers by the size of their move either way', () => {
    expect(movers(rows, (r) => r.ctrDiff).map((r) => r.name)).toEqual(['Energy', 'Financials', 'Information Technology']);
  });
});
