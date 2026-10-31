/// <reference types="node" />
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { referenceEnd, invalidDailyBars, splitFactorsAt, requestBudget } = require('../scripts/live/audit/references.cjs');

describe('dated and valid audit references', () => {
  const rows = [{ day: '2026-10-27' }, { day: '2026-10-28' }];
  it('does not compare a completed new session with an older reference window', () => {
    expect(referenceEnd(rows, '2026-10-29', '2026-10-30')).toBe(-1);
    expect(referenceEnd(rows, '2026-10-28', '2026-10-30')).toBe(1);
    expect(referenceEnd(rows, '', '2026-10-28')).toBe(0);
  });
  it('rejects a reference high below its close and other impossible daily bars', () => {
    const bar = { date: '2026-10-29T00:00:00Z', open: 100, high: 110, low: 90, close: 105, volume: 1000, splitFactor: 1 };
    expect(invalidDailyBars([bar])).toBeUndefined();
    for (const patch of [{ high: 104 }, { low: 106 }, { volume: -1 }, { splitFactor: 0 }, { date: '2026-02-30' }]) expect(invalidDailyBars([{ ...bar, ...patch }])).toBeTruthy();
    expect(invalidDailyBars([bar, bar])).toContain('duplicate');
  });
  it('does not apply a split that occurred after the captured session', () => {
    const bars = [{ splitFactor: 1 }, { splitFactor: 1 }, { splitFactor: 2 }, { splitFactor: 1 }];
    expect(splitFactorsAt(bars, 1).slice(0, 2)).toEqual([1, 1]);
    expect(splitFactorsAt(bars, 2).slice(0, 3)).toEqual([2, 2, 1]);
    expect(splitFactorsAt(bars, 1)[2]).toBeNaN();
  });
  it('serializes simultaneous free-plan requests under the shared interval', async () => {
    let clock = 1000;
    const waits: number[] = [];
    const budget = requestBudget({ now: () => clock, sleep: async (ms: number) => { waits.push(ms); clock += ms; } });
    await Promise.all([budget.wait(), budget.wait(), budget.wait(), budget.wait(), budget.wait(), budget.wait()]);
    expect(waits).toEqual([15500, 15500, 15500, 15500, 15500]);
    expect(clock).toBe(78500);
  });
});
