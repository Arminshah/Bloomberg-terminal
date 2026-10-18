import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTreasury, parseTreasuryCsv } from '../src/data/live/ust';
import { feedStatus, setFeed } from '../src/data/live/status';

const csv = 'Date,2 Yr,10 Yr\n10/15/2026,4.7,5.1\n10/16/2026,4.8,5.2';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('official yield recovery', () => {
  it('retries the current year after a timeout and clears its failed feed state on recovery', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T18:00:00Z'));
    let currentCalls = 0;
    const treasury = vi.fn(async (year: number) => {
      if (year !== 2026) return { status: 503, text: '' };
      if (++currentCalls === 1) throw new Error('timeout');
      return { status: 200, text: csv };
    });
    vi.stubGlobal('window', { arminDesktop: { treasury } });
    const stop = startTreasury();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(feedStatus.get().rates).toBe('error');
      expect(currentCalls).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(currentCalls).toBe(2);
      expect(feedStatus.get().rates).toBe('live');
      expect(feedStatus.get().detail.rates).toContain('end of day');
      stop();
      await vi.advanceTimersByTimeAsync(31 * 60_000);
      expect(currentCalls).toBe(2);
    } finally { stop(); }
  });

  it('accepts quoted official CSV cells and rejects blank values and invalid calendar dates', () => {
    const parsed = parseTreasuryCsv('"Date","2 Yr","10 Yr"\n"10/16/2026","0","5.2"\n"10/17/2026","",""\n"02/30/2026","9","9"');
    expect([...parsed.get('USGG2YR Index')!.values()]).toEqual([0]);
    expect([...parsed.get('USGG10YR Index')!.values()]).toEqual([5.2]);
  });

  it('does not record a delivered trade just because a socket connected', () => {
    const before = feedStatus.get().updatedAt.stream;
    setFeed('stream', 'live', 'Socket connected', { delivered: false });
    expect(feedStatus.get().stream).toBe('live');
    expect(feedStatus.get().updatedAt.stream).toBe(before);
    setFeed('stream', 'live', 'Trade delivered');
    expect(feedStatus.get().updatedAt.stream).toBeGreaterThan(0);
  });
});
