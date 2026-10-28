import { describe, expect, it } from 'vitest';
import { positions, rankStrategies, runStrategy, STRATEGIES } from '../src/finance/strategies';

const DAY = 86_400_000;
const days = (n: number) => Array.from({ length: n }, (_, i) => Date.UTC(2024, 0, 1) + i * DAY);

describe('STRATEGIES (BTST): trading rules on daily closes', () => {
  it('buys and holds: the price change less one entry cost, and its statistics', () => {
    const c = [100, 110, 99, 120, 132];
    const t = days(c.length);
    const r = runStrategy('hold', t, c, 0, 10, false);
    expect(r.totalReturn).toBeCloseTo((0.999 * 132) / 100 * 100 - 100, 10);
    expect(r.equity.length).toBe(5);
    // From 110 to 99 is the worst fall: −10%.
    expect(r.maxDrawdown).toBeCloseTo(-10, 10);
    expect(r).toMatchObject({ trades: 1, closed: 0, now: 1, exposure: 100 });
    expect(Number.isNaN(r.winRate)).toBe(true);
  });

  it('decides on a close from the closes up to it only: later prices never change an earlier position', () => {
    const c = Array.from({ length: 400 }, (_, i) => 100 + 10 * Math.sin(i / 9) + i * 0.05);
    const changed = [...c.slice(0, 300), ...c.slice(300).map((x) => x * 1.5)];
    for (const s of STRATEGIES) {
      const a = positions(s.id, c, true);
      const b = positions(s.id, changed, true);
      expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)));
    }
  });

  it('follows each rule: RSI buys below 30 and sells above 70; the breakout buys a new 20-day high', () => {
    // Falling then rising: RSI drops under 30, then rises over 70.
    const c = [...Array.from({ length: 20 }, (_, i) => 100 - i * 2), ...Array.from({ length: 20 }, (_, i) => 62 + i * 3)];
    const p = Array.from(positions('rsi', c, false));
    const firstLong = p.indexOf(1);
    expect(firstLong).toBeGreaterThan(13);
    expect(firstLong).toBeLessThan(20);
    expect(p.at(-1)).toBe(0);
    const flat = [...Array.from({ length: 25 }, () => 50), 51, 52, 40];
    const b = Array.from(positions('breakout', flat, false));
    expect(b[25]).toBe(1);
    // 40 is below the lowest of the 10 days before: out.
    expect(b[27]).toBe(0);
    // With shorts, the moving average cross is short while the 50-day average is below the 200-day.
    const down = Array.from({ length: 260 }, (_, i) => 300 - i);
    expect(positions('sma-cross', down, true).at(-1)).toBe(-1);
    expect(positions('sma-cross', down, false).at(-1)).toBe(0);
  });

  it('counts trades and wins, charges a reversal twice, and earns the next day’s change', () => {
    // The 200-day rule on a series that crosses its average twice.
    const c = [...Array.from({ length: 210 }, () => 100), 110, 112, 90, 85, 120, 125];
    const t = days(c.length);
    const r = runStrategy('sma200', t, c, 205, 0, false);
    // Long after 110 (one day early it is not above the average), out at 90, long again at 120.
    expect(r.trades).toBe(2);
    expect(r.closed).toBe(1);
    expect(r.winRate).toBe(0);
    // Long on 110 → 112 → 90 (−19.64%), out, then long on 120 → 125.
    expect(r.totalReturn).toBeCloseTo(((112 / 110) * (90 / 112) * (125 / 120) - 1) * 100, 10);
    const ls = runStrategy('sma200', t, c, 205, 10, true);
    // Short while at or below the average, long above: reversals cost 20 bp, the first entry 10.
    expect(ls.trades).toBe(4);
  });

  it('ranks every rule over the period, leaving out those without enough history before it', () => {
    const c = Array.from({ length: 300 }, (_, i) => 100 * Math.exp(i * 0.001) * (1 + 0.05 * Math.sin(i / 7)));
    const t = days(c.length);
    const { start, results, short } = rankStrategies(t, c, 252, 5, false);
    expect(start).toBe(300 - 1 - 252);
    // 47 closes before the period: the 50/200 cross, the 200-day average and 6-month momentum cannot decide yet.
    expect(short).toEqual(['sma-cross', 'sma200', 'momentum']);
    expect(results.map((r) => r.id)).toEqual(['hold', 'macd', 'rsi', 'bollinger', 'breakout']);
    for (const r of results) expect(r.equity.length).toBe(253);
  });
});
