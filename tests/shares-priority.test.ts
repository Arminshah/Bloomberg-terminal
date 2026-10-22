import { describe, expect, it, vi } from 'vitest';

// Yahoo answers made up in the layout of its fundamentals series; nothing leaves the test.
const calls: string[] = [];
vi.mock('../src/data/live/yahoo', async (orig) => ({
  ...(await orig<typeof import('../src/data/live/yahoo')>()),
  desktopData: () => true,
  yahooGet: vi.fn(async (path: string) => {
    calls.push(path);
    return { timeseries: { result: [{ meta: { type: ['quarterlyOrdinarySharesNumber'] }, quarterlyOrdinarySharesNumber: [{ asOfDate: '2026-06-30', reportedValue: { raw: 384_100_000 } }] }] } };
  }),
}));

const { engine } = await import('../src/data/market');
const { fillShareCounts, wantShares } = await import('../src/data/live/shares');

describe('share counts for the stock on screen', () => {
  it('reads an opened stock next, before the rest of the queue', async () => {
    const equities = engine.defs.filter((d) => d.cls === 'equity' && d.eq && d.yahoo).slice(0, 3);
    for (const d of equities) d.eq!.shares = NaN;
    const [first, second, third] = equities;
    const run = fillShareCounts(() => false, 1);
    // The queue has asked for the first stock; the third is opened on a screen meanwhile.
    wantShares(third.id);
    await run;
    const order = (d: (typeof equities)[number]) => calls.findIndex((c) => c.includes(encodeURIComponent(d.yahoo!)));
    expect(order(first)).toBe(0);
    expect(order(third)).toBe(1);
    expect(order(second)).toBeGreaterThan(1);
    expect(third.eq!.shares).toBeCloseTo(384.1, 6);
  });

  it('reads it at once when the queue is not running, and not again once it has a count', async () => {
    const d = engine.defs.filter((x) => x.cls === 'equity' && x.eq && x.yahoo)[5];
    d.eq!.shares = NaN;
    calls.length = 0;
    wantShares(d.id);
    await vi.waitFor(() => expect(d.eq!.shares).toBeCloseTo(384.1, 6));
    expect(calls).toHaveLength(1);
    wantShares(d.id);
    expect(calls).toHaveLength(1);
  });
});
