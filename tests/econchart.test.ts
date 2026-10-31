import { describe, expect, it } from 'vitest';
import { parseFredSeriess } from '../src/data/live/fred-chart';
import { parseFredObservations } from '../src/data/live/fred';
import { latest, linesFromArgs, rangeStart, unitLabel, yearTicks } from '../src/functions/ECOW';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as fredMain from '../electron/fred.cjs';
import search from './fixtures/fred-search-cpi.json';
import houst from './fixtures/fred-series-houst.json';
import houstObs from './fixtures/fred-houst-2025.json';

describe('Economic Data Chart (ECOW, ECWB)', () => {
  it("reads FRED's search and series answers as given", () => {
    const found = parseFredSeriess(JSON.stringify(search))!;
    expect(found.map((f) => f.id)).toEqual(['CPIAUCSL', 'PCEPI', 'FPCPITOTLZGUSA', 'APU0000703112', 'CPILFESL']);
    const h = parseFredSeriess(JSON.stringify(houst))![0];
    expect(h).toMatchObject({ id: 'HOUST', title: 'New Privately-Owned Housing Units Started: Total Units', frequency: 'Monthly', units: 'Thousands of Units', seasonal: 'SAAR', start: '1959-01-01', end: '2026-09-01' });
    expect(parseFredSeriess('<html>')).toBeNull();
  });

  it('gives the latest observation, the one before and the change', () => {
    const obs = parseFredObservations(JSON.stringify(houstObs));
    expect(obs).toHaveLength(21);
    expect(latest(obs)).toEqual({ date: '2026-09-01', value: 1221, prevDate: '2026-08-01', prev: obs[19][1], change: 1221 - obs[19][1] });
    expect(latest([])).toBeNull();
  });

  it('opens the series typed after the function, each with its transformation, at most four', () => {
    expect(linesFromArgs('HOUST CPIAUCSL:PC1')).toEqual([{ id: 'HOUST', units: 'lin' }, { id: 'CPIAUCSL', units: 'pc1' }]);
    expect(linesFromArgs('a b c d e')).toHaveLength(4);
    expect(linesFromArgs('CPIAUCSL:XYZ HOUST HOUST')).toEqual([{ id: 'HOUST', units: 'lin' }]);
    expect(linesFromArgs(undefined)).toEqual([]);
  });

  it('labels a line by its units, or by the transformation', () => {
    const h = parseFredSeriess(JSON.stringify(houst))![0];
    expect(unitLabel({ id: 'HOUST', units: 'lin' }, h)).toBe('Thousands of Units');
    expect(unitLabel({ id: 'HOUST', units: 'pc1' }, h)).toBe('% change on a year ago');
    expect(rangeStart(2, Date.UTC(2026, 9, 26))).toBe('2024-10-25');
    expect(rangeStart(0, Date.UTC(2026, 9, 26))).toBe('1776-07-04');
  });

  it('labels the time axis once a year, or every few years over a long history', () => {
    const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    expect(yearTicks(t('2016-10-01'), t('2026-09-01')).map((x) => x.label)).toEqual(['2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']);
    expect(yearTicks(t('1959-01-01'), t('2026-09-01')).map((x) => x.label)).toEqual(['1960', '1967', '1974', '1981', '1988', '1995', '2002', '2009', '2016', '2023']);
    expect(yearTicks(t('2026-01-01'), t('2025-01-01'))).toEqual([]);
  });

  it("asks FRED only for its search, a series' description or its transformed observations", () => {
    expect(fredMain.fredChartUrl('chart', 'houst|pc1', '2020-01-01')).toBe('https://api.stlouisfed.org/fred/series/observations?series_id=HOUST&units=pc1&observation_start=2020-01-01&file_type=json');
    expect(fredMain.fredChartUrl('series', 'HOUST')).toBe('https://api.stlouisfed.org/fred/series?series_id=HOUST&file_type=json');
    expect(fredMain.fredChartUrl('search', 'housing starts')).toBe('https://api.stlouisfed.org/fred/series/search?search_text=housing%20starts&limit=30&order_by=popularity&sort_order=desc&file_type=json');
    expect(fredMain.fredChartUrl('chart', 'HOUST|log', '2020-01-01')).toBeNull();
    expect(fredMain.fredChartUrl('chart', 'HOUST|pc1', 'soon')).toBeNull();
    expect(fredMain.fredChartUrl('series', 'HOUST&api_key=x')).toBeNull();
    expect(fredMain.fredChartUrl('search', 'x')).toBeNull();
    expect(fredMain.fredChartUrl('search', 'a <script>')).toBeNull();
    expect(fredMain.fredChartUrl('observations', 'HOUST')).toBeNull();
  });

  it('opens under ECOW and ECWB', () => {
    expect(parseCommand('ECOW', lookupFn)).toEqual({ kind: 'route', fn: 'ECONCHART' });
    expect(parseCommand('ECWB', lookupFn)).toEqual({ kind: 'route', fn: 'ECONCHART' });
    expect(parseCommand('ECOW HOUST CPIAUCSL:PC1', lookupFn)).toEqual({ kind: 'route', fn: 'ECONCHART', args: 'HOUST CPIAUCSL:PC1' });
  });
});
