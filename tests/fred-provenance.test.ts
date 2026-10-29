import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KeyedAnswer } from '../src/data/live/lookup';

const NOW = Date.parse('2026-10-29T18:00:00Z');
const observations = JSON.stringify({ observations: [{ date: '2026-09-01', value: '10', realtime_start: '2026-10-01' }] });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

describe('FRED per-dataset refresh provenance', () => {
  it('retains failed series clocks even if another series succeeds, and only a genuine unchanged response renews them', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    type Mode = 'success' | 'partial' | 'outage' | 'cached';
    let mode: Mode = 'success';
    const fred = vi.fn(async (kind: string, arg: string): Promise<KeyedAnswer> => {
      if (mode === 'outage' || (mode === 'partial' && arg === 'PAYEMS')) return { status: 503, text: '', error: 'Source unavailable' };
      const text = kind === 'release-dates' ? JSON.stringify({ release_dates: [{ release_id: Number(arg), date: '2026-11-06' }] }) : observations;
      return { status: 200, text, ...(mode === 'cached' ? { cached: true, at: NOW } : {}) };
    });
    vi.stubGlobal('window', { addEventListener: vi.fn(), arminDesktop: { fred, official: async () => ({ status: 503, text: '' }) } });
    const { startFred, reloadFred, fredData } = await import('../src/data/live/fred');
    const { feedStatus } = await import('../src/data/live/status');
    const stop = startFred();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().health.PAYEMS).toMatchObject({ state: 'current', checkedAt: NOW, sourceDate: '2026-09-01' });
      const value = fredData.get().series.PAYEMS;
      vi.setSystemTime(NOW + 60_000);
      mode = 'partial';
      reloadFred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().series.PAYEMS).toEqual(value);
      expect(fredData.get().health.PAYEMS).toMatchObject({ state: 'error', attemptedAt: NOW + 60_000, checkedAt: NOW });
      expect(fredData.get().health.UNRATE).toMatchObject({ state: 'current', checkedAt: NOW + 60_000 });
      expect(feedStatus.get().eco).toBe('error');
      expect(fredData.get().at).toBe(NOW + 60_000);
      vi.setSystemTime(NOW + 120_000);
      mode = 'outage';
      reloadFred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().at).toBe(NOW + 60_000);
      expect(fredData.get().health.UNRATE).toMatchObject({ state: 'error', checkedAt: NOW + 60_000 });
      vi.setSystemTime(NOW + 180_000);
      mode = 'cached';
      reloadFred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().health.PAYEMS).toMatchObject({ state: 'cached', checkedAt: NOW });
      expect(fredData.get().at).toBe(NOW + 60_000);
      expect(feedStatus.get().eco).toBe('error');
      vi.setSystemTime(NOW + 240_000);
      mode = 'success';
      reloadFred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().series.PAYEMS).toEqual(value);
      expect(fredData.get().health.PAYEMS).toMatchObject({ state: 'current', checkedAt: NOW + 240_000, sourceDate: '2026-09-01' });
    } finally { stop(); }
  });


  it('retries a partial outage even when the affected series still has a retained value', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let outage = false;
    const fred = vi.fn(async (kind: string, arg: string): Promise<KeyedAnswer> => {
      if (outage && arg === 'PAYEMS') return { status: 200, text: '{"observations":{}}' };
      return { status: 200, text: kind === 'release-dates' ? JSON.stringify({ release_dates: [{ release_id: Number(arg), date: '2026-11-06' }] }) : observations };
    });
    vi.stubGlobal('window', { addEventListener: vi.fn(), arminDesktop: { fred, official: async () => ({ status: 503, text: '' }) } });
    const { startFred, reloadFred, fredData, parseFredFirstRelease, parseFredReleaseDates } = await import('../src/data/live/fred');
    const stop = startFred();
    try {
      await vi.advanceTimersByTimeAsync(0);
      outage = true;
      reloadFred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().series.PAYEMS).toEqual([['2026-09-01', 10]]);
      expect(fredData.get().health.PAYEMS.state).toBe('error');
      const attempts = fred.mock.calls.filter(([kind, arg]) => kind === 'observations' && arg === 'PAYEMS').length;
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fred.mock.calls.filter(([kind, arg]) => kind === 'observations' && arg === 'PAYEMS')).toHaveLength(attempts + 1);
      expect(fredData.get().health.PAYEMS.checkedAt).toBe(NOW);
      expect(parseFredFirstRelease('{"observations":{}}')).toEqual([]);
      expect(parseFredReleaseDates('{"release_dates":{}}', 50)).toEqual([]);
    } finally { stop(); }
  });

  it('rejects a stale BLS fallback rather than replacing a previously checked observation or renewing its check', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    let failed = false;
    const bls = (month: string) => JSON.stringify({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ data: [{ year: '2026', period: month, value: '100' }] }] } });
    vi.stubGlobal('window', { addEventListener: vi.fn(), arminDesktop: {
      fred: async () => ({ status: 0, text: '', missing: 'FRED_API_KEY' }),
      official: async (source: string): Promise<KeyedAnswer> => source.startsWith('bls')
        ? { status: 200, text: bls(failed ? 'M10' : 'M09'), at: NOW, ...(failed ? { stale: true, cached: true, error: 'Source unavailable' } : {}) }
        : { status: 503, text: '' },
    } });
    const { startFred, reloadFred, fredData } = await import('../src/data/live/fred');
    const stop = startFred();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().series.CPIAUCNS).toEqual([['2026-09-01', 100]]);
      expect(fredData.get().health.CPIAUCNS).toMatchObject({ state: 'current', checkedAt: NOW, source: 'BLS' });
      failed = true;
      vi.setSystemTime(NOW + 13 * 3_600_000);
      reloadFred();
      await vi.advanceTimersByTimeAsync(0);
      expect(fredData.get().series.CPIAUCNS).toEqual([['2026-09-01', 100]]);
      expect(fredData.get().health.CPIAUCNS).toMatchObject({ state: 'error', checkedAt: NOW, sourceDate: '2026-09-01' });
      expect(fredData.get().at).toBe(NOW);
    } finally { stop(); }
  });
});
