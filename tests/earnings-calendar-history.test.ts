import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeCalendar, parseFinnhubWindow, parseNasdaqDay, type NasdaqReport, type WindowReport } from '../src/data/live/earnings-calendar';

const NOW = Date.parse('2026-10-29T18:00:00Z');
const DATE = '2026-09-01';
const response = (eps: number) => JSON.stringify({ data: { rows: [{ symbol: 'TEST', name: 'Test', fiscalQuarterEnding: 'Jun/2026', epsForecast: '0.9', eps: String(eps), surprise: '11' }] }, status: { rCode: 200 } });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.resetModules(); });

function storage() {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, key: (i: number) => [...values.keys()][i], getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); }, removeItem: (k: string) => { values.delete(k); } };
}

describe('historical calendar correction checks', () => {
  it('revalidates old days under a weekly budget, preserves original/corrected views, and exposes an outage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('localStorage', storage());
    const first = await import('../src/data/live/earnings-calendar');
    let answer = { status: 200, text: response(1), at: NOW };
    const bridge = vi.fn(async () => answer);
    vi.stubGlobal('window', { addEventListener: vi.fn(), arminDesktop: { earningsCalendar: bridge } });
    first.requestCalendarDays([DATE]);
    await vi.advanceTimersByTimeAsync(700);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(first.earningsCalendar.get().days[DATE]).toMatchObject({ state: 'ok', at: NOW });
    expect(first.calendarDayVersion(DATE, 'first-observed')?.rows[0].epsActual).toBe(1);
    // A new app session hydrates the bounded response cache without an immediate redundant request.
    vi.resetModules();
    const calendar = await import('../src/data/live/earnings-calendar');
    calendar.requestCalendarDays([DATE]);
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge).toHaveBeenCalledTimes(1);
    expect(calendar.earningsCalendar.get().days[DATE]?.data?.[0].epsActual).toBe(1);
    const correctedAt = NOW + calendar.HISTORY_RECHECK_MS + 3_600_000;
    vi.setSystemTime(correctedAt);
    answer = { status: 200, text: response(1.2), at: correctedAt };
    calendar.requestCalendarDays([DATE]);
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(calendar.calendarHistory.get().by[DATE]).toHaveLength(2);
    expect(calendar.calendarDayVersion(DATE, 'first-observed')?.rows[0].epsActual).toBe(1);
    expect(calendar.calendarDayVersion(DATE, 'as-of', NOW + 1)?.rows[0].epsActual).toBe(1);
    expect(calendar.calendarDayVersion(DATE)?.rows[0].epsActual).toBe(1.2);
    const outageAt = correctedAt + calendar.HISTORY_RECHECK_MS + 3_600_000;
    vi.setSystemTime(outageAt);
    answer = { status: 200, text: response(9), at: correctedAt, cached: true, stale: true, error: 'Source unavailable' } as typeof answer;
    calendar.requestCalendarDays([DATE]);
    await vi.advanceTimersByTimeAsync(0);
    const failed = calendar.earningsCalendar.get().days[DATE];
    expect(failed).toMatchObject({ state: 'error', stale: true, at: correctedAt });
    expect(failed.message).toContain('Source unavailable');
    expect(failed.data?.[0].epsActual).toBe(1.2);
    expect(calendar.calendarHistory.get().by[DATE]).toHaveLength(2);
    expect(calendar.calendarDayVersion(DATE)?.rows[0].epsActual).toBe(1.2);
    // An unchanged genuine response recovers health without manufacturing a correction.
    const recoveredAt = outageAt + 6 * 3_600_000 + 1;
    vi.setSystemTime(recoveredAt);
    answer = { status: 200, text: response(1.2), at: recoveredAt };
    calendar.requestCalendarDays([DATE]);
    await vi.advanceTimersByTimeAsync(0);
    expect(calendar.earningsCalendar.get().days[DATE]).toMatchObject({ state: 'ok', at: recoveredAt });
    expect(calendar.calendarHistory.get().by[DATE]).toHaveLength(2);
  });

  it('archives definition changes without treating new receipt clocks as revisions', async () => {
    const { recordCalendarDay, calendarHistory, calendarDayVersion } = await import('../src/data/live/earnings-calendar');
    calendarHistory.set({ by: {} });
    const row = { symbol: 'TEST', fiscalEnd: '2026-06', epsEst: 0.9, epsActual: 1, basis: 'adjusted' as const, ccy: 'USD', shareBasis: 'listing' as const, splitBasis: 'as-reported', scope: 'consolidated', observedAt: NOW, lastSuccessfulAt: NOW };
    recordCalendarDay(DATE, [row], NOW);
    recordCalendarDay(DATE, [{ ...row, observedAt: NOW + 1000, lastSuccessfulAt: NOW + 1000 }], NOW + 1000);
    expect(calendarHistory.get().by[DATE]).toHaveLength(1);
    expect(calendarDayVersion(DATE)?.rows[0]).toMatchObject({ basis: 'adjusted', ccy: 'USD', shareBasis: 'listing' });
    recordCalendarDay(DATE, [{ ...row, basis: 'gaap', revisionId: 'provider-correction' }], NOW + 2000);
    expect(calendarHistory.get().by[DATE]).toHaveLength(2);
    expect(calendarDayVersion(DATE, 'first-observed')?.rows[0].basis).toBe('adjusted');
    expect(calendarDayVersion(DATE)?.rows[0]).toMatchObject({ basis: 'gaap', revisionId: 'provider-correction' });
  });

  it('rejects HTTP-200 schema changes rather than promoting them as a day without earnings', () => {
    for (const text of ['{}', '{"data":{}}', '{"data":null,"status":{"rCode":400}}']) expect(parseNasdaqDay(text, DATE)).toHaveProperty('error');
    expect(parseNasdaqDay('{"data":null,"status":{"rCode":200}}', DATE)).toEqual({ data: [] });
    expect(parseFinnhubWindow('{}')).toHaveProperty('error');
    expect(parseFinnhubWindow('{"earningsCalendar":[]}')).toEqual({ data: [] });
  });

  it('does not turn a stale historical day or a different declared fiscal quarter into growth', () => {
    const current = parseNasdaqDay(response(1), DATE);
    if ('error' in current) throw new Error(current.error);
    const previous = { ...current.data[0], date: '2026-06-01', fiscalEnd: '2026-03', epsActual: 0.8 };
    expect(mergeCalendar({ nasdaq: current.data, nasdaqHistory: [previous] })[0].epsQuarterAgo).toBe(0.8);
    expect(mergeCalendar({ nasdaq: current.data, nasdaqHistory: [{ ...previous, stale: true, error: 'Source unavailable' }] })[0].epsQuarterAgo).toBeNaN();
    expect(mergeCalendar({ nasdaq: current.data, nasdaqHistory: [{ ...previous, fiscalEnd: '2025-12' }] })[0].epsQuarterAgo).toBeNaN();
  });

  it('joins incomplete EPS pairs only when their currency and declared methodology are equivalent', () => {
    const definition = { basis: 'adjusted' as const, ccy: 'USD', shareBasis: 'listing' as const, splitBasis: 'as-reported', scope: 'consolidated', epsType: 'diluted' as const, unit: 'per-share' as const };
    const n: NasdaqReport = { ...definition, symbol: 'TEST', name: 'Test', date: DATE, timing: '--', marketCap: NaN, fiscalEnd: '2026-06', epsEst: 0.9, epsActual: NaN, analysts: 4, yearAgoEps: NaN };
    const f: WindowReport = { ...definition, symbol: 'TEST', date: DATE, timing: '--', epsEst: NaN, epsActual: 1, revEst: NaN, revActual: NaN };
    const compatible = mergeCalendar({ nasdaq: [n], finnhub: [f] })[0].eps;
    expect(compatible).toMatchObject({ ...definition, est: 0.9, actual: 1, estFrom: 'Nasdaq', actualFrom: 'Finnhub' });
    for (const different of [{ basis: 'gaap' as const }, { ccy: 'CAD' }, { shareBasis: 'ordinary' as const }, { splitBasis: 'split-adjusted' }, { scope: undefined }, { basis: undefined }]) {
      const pair = mergeCalendar({ nasdaq: [n], finnhub: [{ ...f, ...different }] })[0].eps;
      expect(pair.actual).toBe(1);
      expect(pair.est).toBeNaN();
      expect(pair.alternatives?.[0]).toMatchObject({ source: 'Nasdaq', est: 0.9 });
    }
  });
});
