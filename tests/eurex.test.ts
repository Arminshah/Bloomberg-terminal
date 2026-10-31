import { afterEach, describe, expect, it, vi } from 'vitest';
import { eurexProblem, eurexRequest } from '../electron/eurex.cjs';
import { applyEurex, EUREX_REFRESH, eurexFront, frontMonth, parseEurex, startEurex } from '../src/data/live/eurex';
import { refreshAll } from '../src/terminal/refresh';
import { engine } from '../src/data/market';
import { realFutureContract } from '../src/data/realfut';

// Synthetic answers in the layout of Eurex's statistics JSON (checked on 31 October 2026): the index close and the
// trading dates in the header, one row per contract month with zeros where it did not trade. The figures are made up.
const answer = (date: string, dates: string[], close: number, rows: [string, number, number, number, number, number, number, number][]) => JSON.stringify({
  header: { volume: 0, openInterest: 0, underlyingClosingPrice: close, tradingDates: dates.map((d) => `${d.slice(6, 8)}-${d.slice(4, 6)}-${d.slice(0, 4)} 12:00`) },
  meta: { productCode: 'FESX', isin: 'DE0009652388', productType: 'F' },
  dataRows: rows.map(([expiry, open, high, low, last, dSettle, volume, openInt]) => ({ date: expiry, open, high, low, last, dSettle, volume, openInt, contractType: 'M' })),
  _date: date,
});
const LATEST = answer('20261030', ['20261030', '20261029'], 6131.31, [
  ['20271217', 0, 0, 0, 0, 6187, 0, 1972],
  ['20261218', 6215, 6216, 6096, 6119, 6142, 741552, 2238355],
  ['20270319', 6221, 6223, 6141, 6158, 6177, 578, 36677],
]);
const BEFORE = answer('20261029', ['20261029', '20261028'], 6175.45, [['20261218', 6190, 6230, 6180, 6200, 6188, 600000, 2230000]]);

describe("Eurex's statistics", () => {
  it('asks only for the Euro Stoxx 50 and DAX futures, on a day or the latest', () => {
    expect(eurexRequest('FESX')).toEqual({ url: 'https://www.eurex.com/api/v1/overallstatistics/34652?filtertype=overview', ttl: 3_600_000 });
    expect(eurexRequest('FDAX', '20261029')?.url).toBe('https://www.eurex.com/api/v1/overallstatistics/34642?busdate=20261029&filtertype=overview');
    for (const [p, d] of [['FGBL', undefined], ['FESX', '2026-10-29'], ['FESX', '../x'], [1, undefined]]) expect(eurexRequest(p, d)).toBeNull();
    expect(eurexProblem(LATEST)).toBeNull();
    expect(eurexProblem('{"data":[]}')).toBe('Eurex changed its statistics format.');
    expect(eurexProblem('<html>')).toBe('Eurex returned a page that is not JSON.');
  });

  it('reads the dates newest first and the months by expiry, and finds the front month with its code', () => {
    const day = parseEurex(LATEST);
    if ('error' in day) throw new Error(day.error);
    expect(day.dates).toEqual(['2026-10-30', '2026-10-29']);
    expect(day.underlyingClose).toBe(6131.31);
    expect(day.months.map((m) => m.expiry)).toEqual(['2026-12-18', '2027-03-19', '2027-12-17']);
    expect(frontMonth(day, 'VG', '2026-10-30')).toMatchObject({ code: 'VGZ6', settle: 6142, volume: 741552, openInterest: 2238355 });
    // On its last trading day a contract still leads; the day after, the next one does.
    expect(frontMonth(day, 'VG', '2026-12-18')?.code).toBe('VGZ6');
    expect(frontMonth(day, 'VG', '2026-12-21')?.code).toBe('VGH7');
    expect(parseEurex('nope')).toEqual({ error: 'Eurex returned a page that is not JSON.' });
  });

  it("gives VG1 the front month's settlement against the same contract's settlement the day before", () => {
    const latest = parseEurex(LATEST);
    const before = parseEurex(BEFORE);
    if ('error' in latest || 'error' in before) throw new Error('parse');
    expect(applyEurex('FESX', latest, before)).toBe(true);
    const q = engine.quote('VG1 Index')!;
    expect(q.last).toBe(6142);
    expect(q.prevClose).toBe(6188);
    expect(q.volume).toBe(741552);
    expect(eurexFront.get('VG1 Index')).toEqual({ code: 'VGZ6', expiry: '2026-12-18', openInterest: 2238355, asOf: '2026-10-30', underlyingClose: 6131.31 });
    // The contract is set against the index close of the settlement day, from that day to expiry.
    const c = realFutureContract(engine.get('VG1 Index')!);
    expect(c).toMatchObject({ code: 'VGZ6', days: 49, oi: 2238355, spot: 6131.31, asOf: '2026-10-30' });
  });

  it('values the DAX future without a dividend yield, the DAX being a performance index', () => {
    const latest = parseEurex(LATEST);
    if ('error' in latest) throw new Error('parse');
    expect(applyEurex('FDAX', latest)).toBe(true);
    const c = realFutureContract(engine.get('GX1 Index')!);
    expect(c.code).toBe('GXZ6');
    expect(c.q).toBe(0);
    expect(c.fair).toBeCloseTo(6131.31 * Math.exp((c.rate / 100) * (49 / 365)), 6);
  });
});

describe('Eurex and REFRESH', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts a load in the background and does not hold REFRESH for Eurex\'s 30-second pace, nor start a second load', async () => {
    // Eurex has not answered yet (its pace keeps the next request 30 seconds away).
    const ask = vi.fn(() => new Promise<never>(() => undefined));
    vi.stubGlobal('window', { arminDesktop: { eurex: ask } });
    const stop = startEurex();
    expect(ask).toHaveBeenCalledTimes(1);
    const report = await refreshAll({ timeoutMs: 1_000 });
    expect(report?.outcomes).toContainEqual(EUREX_REFRESH);
    // The load still running is the one REFRESH stands for.
    expect(ask).toHaveBeenCalledTimes(1);
    stop();
  });
});
