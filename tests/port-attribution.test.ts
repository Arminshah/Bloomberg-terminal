import { describe, expect, it } from 'vitest';
import { buckets, toWeights, type PortLine } from '../src/data/port-intraday';
import { attribution, securitySelection } from '../src/data/port-attribution';

describe('PORT Attribution', () => {
  // Holdings of 6,000 (IT, +1%) and 4,000 (Energy, -2%); a benchmark of IT 60% (+1%, +0.5%) and Financials 40% (-1%).
  const port: PortLine[] = toWeights([
    { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', mv: 6000, ret: 1 },
    { id: 'XOM', name: 'Exxon', bucket: 'Energy', mv: 4000, ret: -2 },
  ]).map(({ mv: _mv, ...l }) => l);
  const bench: PortLine[] = [
    { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', weight: 30, ret: 1 },
    { id: 'MSFT', name: 'Microsoft', bucket: 'Information Technology', weight: 30, ret: 0.5 },
    { id: 'JPM', name: 'JPMorgan', bucket: 'Financials', weight: 40, ret: -1 },
  ];
  const { rows, total } = buckets(port, bench);
  const a = attribution(rows, total);
  const row = (n: string) => a.rows.find((r) => r.name === n)!;

  it('gives the outperformance: portfolio -0.20%, benchmark +0.05%', () => {
    expect(a.port).toBeCloseTo(-0.2, 12);
    expect(a.bench).toBeCloseTo(0.05, 12);
    expect(a.active).toBeCloseTo(-0.25, 12);
  });

  it('splits it into allocation and selection by sector, as Brinson-Fachler does', () => {
    // IT: same weight, so no allocation; selection 0.6 × (1 − 0.75) = 0.15.
    expect(row('Information Technology').allocation).toBeCloseTo(0, 12);
    expect(row('Information Technology').selection).toBeCloseTo(0.15, 12);
    // Financials, not held: (0 − 0.4) × (−1 − 0.05) = 0.42.
    expect(row('Financials').allocation).toBeCloseTo(0.42, 12);
    expect(row('Financials').selection).toBe(0);
    // Energy, not in the benchmark: all allocation, 0.4 × (−2 − 0.05) = −0.82.
    expect(row('Energy').allocation).toBeCloseTo(-0.82, 12);
    expect(row('Energy').selection).toBe(0);
    expect(row('Utilities').total).toBe(0);
  });

  it('adds up to the outperformance exactly', () => {
    expect(a.allocation + a.selection).toBeCloseTo(a.active, 12);
    expect(a.rows.reduce((s, r) => s + r.total, 0)).toBeCloseTo(a.active, 12);
  });

  it("splits a bucket's selection over its holdings", () => {
    const sel = securitySelection(rows);
    expect(sel.find((s) => s.id === 'AAPL')!.effect).toBeCloseTo(0.15, 12);
    // Energy is not in the benchmark: the sector is all allocation, so its holding has no selection share.
    expect(sel.find((s) => s.id === 'XOM')).toBeUndefined();
    const it = sel.filter((s) => s.bucket === 'Information Technology').reduce((x, s) => x + s.effect, 0);
    expect(it).toBeCloseTo(row('Information Technology').selection, 12);
  });
});

describe('PORT Attribution with shorts and hedges', () => {
  // Weights of net asset value with cash, so they add to 100 whatever their signs.
  const bench: PortLine[] = [
    { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', weight: 60, ret: 1 },
    { id: 'XOM', name: 'Exxon', bucket: 'Energy', weight: 10, ret: -1 },
    { id: 'JPM', name: 'JPMorgan', bucket: 'Financials', weight: 30, ret: -1.5 },
  ];

  it('adds up with a short in a sector the benchmark holds', () => {
    const port: PortLine[] = [
      { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', weight: 100, ret: 1 },
      { id: 'XOM', name: 'Exxon', bucket: 'Energy', weight: -20, ret: -2 },
      { name: 'Cash', bucket: 'Cash', weight: 20, ret: 0 },
    ];
    const { rows, total } = buckets(port, bench);
    const a = attribution(rows, total);
    expect(a.allocation + a.selection).toBeCloseTo(a.active, 12);
    // The short's selection: −0.2 × (−2 − (−1)) = +0.2.
    expect(a.rows.find((r) => r.name === 'Energy')!.selection).toBeCloseTo(0.2, 12);
  });

  it('adds up with a hedge in a sector the benchmark lacks', () => {
    const port: PortLine[] = [
      { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', weight: 200, ret: 1 },
      { id: 'ES1', name: 'S&P 500 future', bucket: 'Futures', weight: -100, ret: 1 },
    ];
    const { rows, total } = buckets(port, bench);
    const a = attribution(rows, total);
    expect(total.retPort).toBeCloseTo(1, 12);
    expect(a.allocation + a.selection).toBeCloseTo(a.active, 12);
    // The hedge's sector: its contribution −1 less its weight × the benchmark's return.
    expect(a.rows.find((r) => r.name === 'Futures')!.allocation).toBeCloseTo(-1 - -1 * total.retBench, 12);
  });

  it('leaves the portfolio blank where a holding has no confirmed change', () => {
    const port: PortLine[] = [
      { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', weight: 50, ret: 2 },
      { id: 'MSFT', name: 'Microsoft', bucket: 'Information Technology', weight: 50, ret: NaN },
    ];
    const { rows, total } = buckets(port, bench);
    const it = rows.find((r) => r.name === 'Information Technology')!;
    expect(it.portMissing).toBe(1);
    expect(it.ctrPort).toBeNaN();
    expect(total.retPort).toBeNaN();
    expect(attribution(rows, total).active).toBeNaN();
  });

  it("measures a benchmark sector by its priced members, not counting the others as 0%", () => {
    const partly: PortLine[] = [
      { id: 'AAPL', name: 'Apple', bucket: 'Information Technology', weight: 50, ret: 2 },
      { id: 'MSFT', name: 'Microsoft', bucket: 'Information Technology', weight: 50, ret: NaN },
    ];
    const { rows } = buckets([], partly);
    const it = rows.find((r) => r.name === 'Information Technology')!;
    expect(it.retBench).toBeCloseTo(2, 12);
    expect(it.benchPricedWeight).toBe(50);
    expect(it.ctrBench).toBeCloseTo(2, 12);
  });
});
