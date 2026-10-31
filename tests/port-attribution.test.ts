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
    // Energy's only holding against its own bucket's return: no selection.
    expect(sel.find((s) => s.id === 'XOM')!.effect).toBeCloseTo(0, 12);
    const it = sel.filter((s) => s.bucket === 'Information Technology').reduce((x, s) => x + s.effect, 0);
    expect(it).toBeCloseTo(row('Information Technology').selection, 12);
  });
});
