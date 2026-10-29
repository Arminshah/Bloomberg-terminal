import { afterEach, describe, expect, it, vi } from 'vitest';
import { datasetHealth } from '../src/data/live/provenance';
import { freshnessOf, isOfficialProvider } from '../src/data/freshness';
import type { KeyedAnswer } from '../src/data/live/lookup';

const NOW = Date.parse('2026-10-29T18:00:00Z');

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('source confirmation clocks', () => {
  it('advances a successful unchanged check, preserves source dates, and retains success across a failed attempt', () => {
    const first = datasetHealth(undefined, { at: NOW, ok: true, source: 'FRED', sourceDate: '2026-09-01' });
    const unchanged = datasetHealth(first, { at: NOW + 60_000, ok: true, sourceDate: '2026-09-01' });
    expect(unchanged).toMatchObject({ state: 'current', checkedAt: NOW + 60_000, sourceDate: '2026-09-01' });
    const cached = datasetHealth(unchanged, { at: NOW + 120_000, ok: true, cached: true, checkedAt: NOW + 120_000 });
    expect(cached).toMatchObject({ state: 'cached', checkedAt: NOW + 60_000 });
    const outage = datasetHealth(cached, { at: NOW + 180_000, ok: true, stale: true, sourceDate: '2026-10-01', error: 'Source unavailable' });
    expect(outage).toMatchObject({ state: 'error', attemptedAt: NOW + 180_000, checkedAt: NOW + 60_000, sourceDate: '2026-09-01', error: 'Source unavailable' });
  });

  it('retains official publication/effective timing without giving a cache or failed call a new check', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const official = vi.fn(async (): Promise<KeyedAnswer & { publishedAt?: number; effectiveAt?: number }> => ({ status: 200, text: 'unchanged', at: NOW, publishedAt: NOW - 86_400_000, effectiveAt: NOW - 7 * 86_400_000 }));
    vi.stubGlobal('window', { arminDesktop: { official } });
    const { officialAnswer } = await import('../src/data/live/official');
    const first = await officialAnswer('nyfed', '2026-01-01');
    expect(first).toMatchObject({ checkedAt: NOW, publishedAt: NOW - 86_400_000, effectiveAt: NOW - 7 * 86_400_000 });
    vi.setSystemTime(NOW + 60_000);
    official.mockResolvedValueOnce({ status: 200, text: 'unchanged', at: NOW + 60_000, publishedAt: NOW - 86_400_000, effectiveAt: NOW - 7 * 86_400_000 });
    expect((await officialAnswer('nyfed', '2026-01-01')).checkedAt).toBe(NOW + 60_000);
    official.mockResolvedValueOnce({ status: 200, text: 'unchanged', at: NOW, cached: true });
    const cached = await officialAnswer('nyfed', '2026-01-01');
    expect(cached.at).toBe(NOW);
    expect(cached.checkedAt).toBeUndefined();
    official.mockRejectedValueOnce(new Error('timeout'));
    expect(await officialAnswer('nyfed', '2026-01-01')).toMatchObject({ status: 0, attemptedAt: NOW + 60_000, error: 'timeout' });
  });

  it('classifies providers explicitly instead of treating an unfamiliar publisher as official', () => {
    expect(isOfficialProvider('Unknown Vendor')).toBe(false);
    expect(isOfficialProvider('FRED')).toBe(true);
    expect(freshnessOf({ src: 'EOD', provider: 'Unknown Vendor', time: NOW - 86_400_000 }, { cls: 'equity' }, NOW)?.label).toBe('END OF DAY');
    expect(freshnessOf({ src: 'EOD', provider: 'FRED', time: NOW - 86_400_000 }, { cls: 'equity' }, NOW)?.label).toBe('REFERENCE');
  });
});
