import { describe, expect, it } from 'vitest';
import { heatFill, layoutHeatmap, weightedChange, type HeatGroup, type HeatLeaf } from '../src/components/HeatTreemap';

const leaf = (key: string, weight: number, pct: number): HeatLeaf => ({ key, label: key, weight, pct, info: [key] });
const groups: HeatGroup[] = [
  {
    name: 'Information Technology',
    subs: [
      { name: 'Semiconductors & Semiconductor Equipment', leaves: [leaf('NVDA', 8, -3.7), leaf('AVGO', 3, -3.7), leaf('MU', 1, -4.8)] },
      { name: 'Software & Services', leaves: [leaf('MSFT', 6, -1.2), leaf('ORCL', 1, -2.2)] },
    ],
  },
  { name: 'Energy', subs: [{ name: 'Energy', leaves: [leaf('XOM', 1, -1.1), leaf('CVX', 0.5, NaN), leaf('GONE', 0, 1)] }] },
];

describe('heat map layout', () => {
  const placed = layoutHeatmap(groups, 1000, 600);
  const inside = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6;

  it('puts every member inside its industry group, and every industry group inside its sector', () => {
    for (const g of placed) {
      for (const s of g.subs) {
        expect(inside(s.r, g.r)).toBe(true);
        for (const l of s.leaves) expect(inside(l.r, s.r)).toBe(true);
      }
    }
  });

  it('sizes sectors by their members’ weight and leaves out a member without one', () => {
    const area = (r: { w: number; h: number }) => r.w * r.h;
    const tech = placed.find((g) => g.group.name === 'Information Technology')!;
    const energy = placed.find((g) => g.group.name === 'Energy')!;
    // 19 against 1.5 of the weight.
    expect(area(tech.r) / area(energy.r)).toBeCloseTo(19 / 1.5, 6);
    expect(energy.subs[0].leaves.map((l) => l.leaf.key)).toEqual(['XOM', 'CVX']);
  });

  it('gives a group the weighted change of the members that have one', () => {
    expect(weightedChange([leaf('A', 3, 2), leaf('B', 1, -2), leaf('C', 5, NaN)])).toBeCloseTo(1, 10);
    expect(weightedChange([leaf('C', 5, NaN)])).toBeNaN();
    const energy = placed.find((g) => g.group.name === 'Energy')!;
    expect(energy.pct).toBeCloseTo(-1.1, 10);
  });

  it('colours a fall red and a rise green, at full colour from ±3%, and no change grey', () => {
    const rgb = (s: string) => s.match(/\d+/g)!.map(Number);
    const [r1, g1] = rgb(heatFill(-2));
    expect(r1).toBeGreaterThan(g1);
    const [r2, g2] = rgb(heatFill(2));
    expect(g2).toBeGreaterThan(r2);
    expect(heatFill(-3)).toBe(heatFill(-9));
    expect(heatFill(NaN)).toBe('#262626');
  });
});

describe('heat map tile labels', () => {
  it('keeps the type small and even: 15 px at most, smaller to fit, none rather than a cut-off ticker', async () => {
    const { tileText } = await import('../src/components/HeatTreemap');
    const big = tileText('NVDA', 300, 200);
    expect(big.fs).toBe(15);
    expect(big.pfs).toBe(13);
    expect(big.showPct).toBe(true);
    const mid = tileText('GOOGL', 60, 40);
    expect(mid.fs).toBeLessThanOrEqual(15);
    expect(mid.fs * 0.6 * 5).toBeLessThanOrEqual(60 - 6); // the whole ticker fits
    expect(tileText('BRK/B', 20, 12).showLabel).toBe(false);
    expect(tileText('MSFT', 40, 14).showPct).toBe(false); // room for the ticker only
  });
});
