import { describe, expect, it, vi } from 'vitest';

// Yahoo answers made up in the layout of its fundamentals series; nothing leaves the test.
const calls: string[] = [];
vi.mock('../src/data/live/yahoo', async (orig) => ({
  ...(await orig<typeof import('../src/data/live/yahoo')>()),
  yahooGet: vi.fn(async (path: string) => {
    calls.push(path);
    return { timeseries: { result: [{ meta: { type: ['quarterlyOrdinarySharesNumber'] }, quarterlyOrdinarySharesNumber: [{ asOfDate: '2026-06-30', reportedValue: { raw: 14_700_000_000 } }] }] } };
  }),
}));

const { engine } = await import('../src/data/market');
const { fillShareCounts } = await import('../src/data/live/shares');
const { marketCap } = await import('../src/data/analytics');

describe('share counts without Yahoo\'s session', () => {
  it('fills a missing count from the reported series, keeps it, and leaves known counts alone', async () => {
    const equities = engine.defs.filter((d) => d.cls === 'equity' && d.eq && d.yahoo);
    const [missing, known] = equities;
    missing.eq!.shares = NaN;
    const before = known.eq!.shares;
    expect(await fillShareCounts(() => false, 0)).toBe(1);
    expect(missing.eq!.shares).toBe(14_700);
    expect(known.eq!.shares).toBe(before);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/ws/fundamentals-timeseries/');
    expect(calls[0]).toContain(encodeURIComponent(missing.yahoo!));
    expect(Number.isFinite(marketCap(missing.id))).toBe(true);
    // The next start reads the kept count without asking again.
    missing.eq!.shares = NaN;
    expect(await fillShareCounts(() => false, 0)).toBe(0);
    expect(missing.eq!.shares).toBe(14_700);
    expect(calls).toHaveLength(1);
  });
});
