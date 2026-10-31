import { describe, expect, it } from 'vitest';
import { parseFredFirstRelease, type Obs } from '../src/data/live/fred';
import { parseClevelandNowcast } from '../src/data/live/official';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import { MACRO_SERIES, FIRST_RELEASE_IDS, FRED_NOTICE } from '../src/data/macroseries';
import { history, latestReading } from '../src/functions/MACRO';

const line = (id: string) => MACRO_SERIES.find((m) => m.id === id)!;

describe('macro dashboard figures', () => {
  it('takes a daily rate and the observation before it', () => {
    const obs: Obs = [['2026-10-08', 4.12], ['2026-10-09', 4.15], ['2026-10-13', 4.1]];
    expect(latestReading(line('DGS10'), obs)).toEqual({ value: 4.1, date: '2026-10-13', prev: 4.15 });
  });

  it('works out a year-on-year change from the index, for the latest month that has a year before it', () => {
    const obs: Obs = [];
    for (let m = 0; m < 14; m++) obs.push([new Date(Date.UTC(2025, 7 + m, 1)).toISOString().slice(0, 10), 300 + m]);
    const r = latestReading(line('CPIAUCSL'), obs)!;
    // Sep 2026 (313) against Sep 2025 (301), and Aug 2026 (312) against Aug 2025 (300) before it.
    expect(r.date).toBe('2026-09-01');
    expect(r.value).toBeCloseTo((313 / 301 - 1) * 100, 10);
    expect(r.prev).toBeCloseTo((312 / 300 - 1) * 100, 10);
  });

  it('shows payrolls as the monthly change in the level', () => {
    const obs: Obs = [['2026-07-01', 159_500], ['2026-08-01', 159_600], ['2026-09-01', 159_742]];
    const r = latestReading(line('PAYEMS'), obs)!;
    expect(r).toEqual({ value: 142, date: '2026-09-01', prev: 100 });
  });

  it("shows GDPNow's nowcast for the quarter as published, the quarter before it beside it, and says it is a nowcast", () => {
    // FRED's GDPNOW: one value a quarter, the current one revised until the BEA's advance estimate (synthetic values).
    const r = latestReading(line('GDPNOW'), [['2026-07-01', 3.3], ['2026-10-01', 3.2]])!;
    expect(r).toEqual({ value: 3.2, date: '2026-10-01', prev: 3.3 });
    expect(line('GDPNOW')).toMatchObject({ group: 'Growth', freq: 'q', calc: 'level' });
    expect(line('GDPNOW').label).toMatch(/nowcast/);
    expect(line('GDPNOW').source).toMatch(/^Federal Reserve Bank of Atlanta \(a model nowcast/);
  });

  it('scales weekly claims to thousands', () => {
    const r = latestReading(line('ICSA'), [['2026-09-26', 231_000], ['2026-10-03', 225_000]])!;
    expect(r.value).toBe(225);
    expect(r.prev).toBe(231);
  });

  it('gives nothing rather than a guess when there is not enough history', () => {
    expect(latestReading(line('CPIAUCSL'), [['2026-09-01', 313]])).toBeNull();
    expect(latestReading(line('DGS10'), [])).toBeNull();
    expect(latestReading(line('DGS10'), undefined)).toBeNull();
  });

  it('thins daily history to a point a week', () => {
    const obs: Obs = [];
    const start = Date.UTC(2026, 0, 5);
    for (let d = 0; d < 28; d++) obs.push([new Date(start + d * 86_400_000).toISOString().slice(0, 10), d]);
    const h = history(line('DGS10'), obs, 3, Date.UTC(2026, 1, 10));
    expect(h.length).toBeLessThanOrEqual(5);
    expect(h[h.length - 1]).toEqual(['2026-02-01', 27]);
  });

  it('marks the copyrighted series and carries the notice FRED requires', () => {
    expect(MACRO_SERIES.filter((m) => m.copyrighted).map((m) => m.id).sort()).toEqual(['BAMLC0A0CM', 'BAMLH0A0HYM2']);
    expect(FRED_NOTICE).toBe('This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.');
  });
});

describe('first releases (ALFRED)', () => {
  it('reads each value with the day it was first published', () => {
    // Layout of fred/series/observations with output_type=4 over every vintage.
    const text = JSON.stringify({
      realtime_start: '1776-07-04',
      realtime_end: '9999-12-31',
      output_type: 4,
      observations: [
        { realtime_start: '2026-10-02', realtime_end: '2026-11-05', date: '2026-09-01', value: '159801' },
        { realtime_start: '2026-09-04', realtime_end: '2026-10-01', date: '2026-08-01', value: '159650' },
        { realtime_start: '2026-08-07', realtime_end: '2026-09-03', date: '2026-07-01', value: '.' },
      ],
    });
    expect(parseFredFirstRelease(text)).toEqual([
      ['2026-08-01', 159650, '2026-09-04'],
      ['2026-09-01', 159801, '2026-10-02'],
    ]);
    expect(parseFredFirstRelease('nope')).toEqual([]);
    expect(FIRST_RELEASE_IDS).toEqual(['PAYEMS', 'A191RL1Q225SBEA']);
  });
});

describe("the Cleveland Fed's inflation nowcasts", () => {
  // A synthetic file in the layout of nowcast_month.json (read on 31 October 2026): one chart a target month, its
  // categories with a vertical line between days, and a nowcast series per measure beside the actuals. Made-up values.
  const chart = (month: string, cpi: string[], actual: string[]) => ({
    chart: { _comment: '2026-10-30 00:00', caption: 'Inflation Nowcasting', subcaption: month },
    categories: [{ category: [{ label: '10/28' }, { label: '10/29' }, { label: 'PCE Sep', vline: 'true' }, { label: '10/30' }] }],
    dataset: [
      { seriesname: 'CPI Inflation', data: cpi.map((value) => ({ value })) },
      { seriesname: 'Core PCE Inflation', data: [{ value: '0.25' }, { value: '' }] },
      { seriesname: 'Actual CPI Inflation', data: actual.map((value) => ({ value })) },
    ],
  });
  const text = JSON.stringify([chart('2026-9', ['0.52', '0.53', ''], ['0.65']), chart('2026-10', ['0.23', '0.24', ''], [''])]);

  it("takes each month's latest nowcast, leaving the actuals out", () => {
    const m = parseClevelandNowcast(text);
    expect(m.get('CPI')).toEqual([['2026-09-01', 0.53], ['2026-10-01', 0.24]]);
    expect(m.get('COREPCE')).toEqual([['2026-09-01', 0.25], ['2026-10-01', 0.25]]);
    expect(m.has('CORECPI')).toBe(false);
    expect(parseClevelandNowcast('<html>').size).toBe(0);
  });

  it('shows on MACRO as this month against last, named as a nowcast, and opens from its own line', () => {
    const r = latestReading(line('CLEV:CPI'), parseClevelandNowcast(text).get('CPI'))!;
    expect(r).toEqual({ value: 0.24, date: '2026-10-01', prev: 0.53 });
    expect(line('CLEV:CPI').label).toMatch(/nowcast/);
    expect(parseCommand('MACRO CLEV:CPI', lookupFn)).toMatchObject({ kind: 'route', fn: 'MACRO', args: 'CLEV:CPI' });
  });
});
