import { describe, expect, it } from 'vitest';
import * as main from '../electron/eia.cjs';
import * as providers from '../electron/providers.cjs';
import { eiaProblem, gasMonths, parseEiaData, parseStorageReport, weeklyRows, type EiaSeries } from '../src/data/live/eia';
// EIA's answers as given on 28 October 2026 (trimmed to the fields the app reads; no key in them).
import REPORT from './fixtures/eia/storage-report-2026-10-22.json?raw';
import HISTORY from './fixtures/eia/storage-history-2026-10-28.json?raw';
import PETROLEUM from './fixtures/eia/petroleum-2026-10-28.json?raw';
import MONTHLY from './fixtures/eia/gas-monthly-2026-10-28.json?raw';

const NOW = Date.parse('2026-10-28T15:00:00Z');
const series = (text: string): Map<string, EiaSeries> => {
  const p = parseEiaData(text);
  if ('error' in p) throw new Error(p.error);
  return p.series;
};

describe('EIA requests', () => {
  it('asks the storage report without a key, and the API for fixed routes and series only', () => {
    expect(main.eiaRequest('storage-report', NOW)).toEqual({ url: 'https://ir.eia.gov/ngs/wngsr.json', keyed: false, ttl: 1_800_000 });
    const history = main.eiaRequest('storage-history', NOW)!;
    expect(history.keyed).toBe(true);
    expect(history.url).toMatch(/^https:\/\/api\.eia\.gov\/v2\/natural-gas\/stor\/wkly\/data\/\?frequency=weekly&data\[0\]=value&/);
    expect(history.url).toContain('facets[series][]=NW2_EPG0_SWO_R48_BCF');
    expect(history.url).toContain('start=2024-09-28');
    const oil = main.eiaRequest('petroleum', NOW)!;
    expect(oil.url).toContain('/v2/petroleum/sum/sndw/data/');
    expect(oil.url).toContain('start=2025-09-23');
    expect(main.PETROLEUM_SERIES.every((s) => oil.url.includes(`facets[series][]=${s}`))).toBe(true);
    expect(main.eiaRequest('gas-monthly', NOW)!.url).toContain('frequency=monthly');
    expect(main.eiaRequest('gas-monthly', NOW)!.url).toContain('start=2023-10&');
    expect(main.eiaRequest('anything-else', NOW)).toBeNull();
    expect(history.url).not.toContain('api_key');
    expect(main.withKey('https://api.eia.gov/v2/x/data/?frequency=weekly', 'K e y')).toBe('https://api.eia.gov/v2/x/data/?frequency=weekly&api_key=K%20e%20y');
  });
});

describe("EIA's weekly storage report", () => {
  it('reads each region with the comparisons EIA states for the week ending 16 October 2026', () => {
    const r = parseStorageReport(REPORT)!;
    expect(r).toMatchObject({ released: '2026-10-22', week: '2026-10-16', weekAgo: '2026-10-09', yearAgo: '2025-10-16', fiveYearLabel: '5-year (2021-25) average' });
    expect(r.rows.map((x) => x.name)).toEqual(['Total Lower 48', 'East', 'Midwest', 'Mountain', 'Pacific', 'South Central', 'Salt', 'Nonsalt']);
    // As EIA's report page shows them on 22 October 2026.
    expect(r.rows[0]).toMatchObject({ now: 3644, weekAgo: 3567, netChange: 77, impliedFlow: 77, yearAgo: 3796, pctYearAgo: -4, fiveYear: 3609, pctFiveYear: 1, revised: false, reclassified: false });
    expect(r.rows.find((x) => x.name === 'Mountain')).toMatchObject({ now: 257, weekAgo: 255, netChange: 2, yearAgo: 282, fiveYear: 246 });
    expect(r.rows.find((x) => x.name === 'Salt')).toMatchObject({ now: 251, weekAgo: 236, netChange: 15, yearAgo: 318, fiveYear: 295 });
  });

  it('reads a report with a byte order mark, and refuses anything else', () => {
    expect(parseStorageReport(`\uFEFF${REPORT}`)?.week).toBe('2026-10-16');
    expect(parseStorageReport('<html>')).toBeNull();
    expect(parseStorageReport('{"release_date":"2026-Oct-22 00:00:00"}')).toBeNull();
  });

  it("agrees with the API's weekly series for the same week", () => {
    const pts = series(HISTORY).get('NW2_EPG0_SWO_R48_BCF')!.points;
    expect(pts.at(-1)).toEqual({ period: '2026-10-16', value: 3644 });
    expect(pts.at(-2)).toEqual({ period: '2026-10-09', value: 3567 });
  });
});

describe("EIA's weekly petroleum figures", () => {
  const rows = weeklyRows(series(PETROLEUM));
  const row = (id: string) => rows.find((r) => r.id === id)!;

  it("matches EIA's weekly report (table 1) for the week ending 16 October 2026", () => {
    // Commercial crude 412.517, SPR 282.683, gasoline 205.310, distillate 104.286 million barrels; production 13,269 and
    // refinery crude input 16,649 thousand barrels a day.
    expect(row('WCESTUS1')).toMatchObject({ week: '2026-10-16', unit: 'million barrels', priorWeek: '2026-10-09', yearAgoWeek: '2025-10-17' });
    expect(row('WCESTUS1').value).toBeCloseTo(412.517, 6);
    expect(row('WCSSTUS1').value).toBeCloseTo(282.683, 6);
    expect(row('WGTSTUS1').value).toBeCloseTo(205.31, 6);
    expect(row('WDISTUS1').value).toBeCloseTo(104.286, 6);
    expect(row('WCRFPUS2')).toMatchObject({ value: 13269, unit: 'thousand b/d' });
    expect(row('WCRRIUS2').value).toBe(16649);
    expect(row('WPULEUS3')).toMatchObject({ value: 93.4, unit: '%' });
  });

  it('sets each week against the week before and the same week a year earlier, from the series itself', () => {
    const pts = series(PETROLEUM).get('WCESTUS1')!.points;
    const at = (d: string) => pts.find((p) => p.period === d)!.value / 1000;
    expect(row('WCESTUS1').change).toBeCloseTo(at('2026-10-16') - at('2026-10-09'), 9);
    expect(row('WCESTUS1').yearAgo).toBeCloseTo(at('2025-10-17'), 9);
    expect(rows.map((r) => r.group)).toEqual(['Stocks', 'Stocks', 'Stocks', 'Stocks', 'Stocks', 'Supply', 'Supply', 'Supply', 'Demand', 'Demand', 'Demand']);
  });

  it('leaves a year-ago figure blank when the series does not reach back to that week', () => {
    const short = new Map([['WCESTUS1', { unit: 'MBBL', points: [{ period: '2026-10-09', value: 400000 }, { period: '2026-10-16', value: 401000 }] }]]);
    expect(weeklyRows(short)[0]).toMatchObject({ value: 401, change: 1 });
    expect(weeklyRows(short)[0].yearAgo).toBeNaN();
  });
});

describe("EIA's monthly natural gas figures", () => {
  it('turns million cubic feet into billions, and a day as the month over its days', () => {
    const months = gasMonths(series(MONTHLY));
    expect(months[0].month).toBe('2026-07');
    expect(months[0].production).toBeCloseTo(3524.896, 6);
    expect(months[0].consumption).toBeCloseTo(2775.752, 6);
    expect(months[0].productionPerDay).toBeCloseTo(3524.896 / 31, 9);
    expect(months.find((m) => m.month === '2026-02')!.productionPerDay).toBeCloseTo(3098.632 / 28, 9);
  });
});

describe('EIA answers that bring no data', () => {
  it("reads EIA's error body, and says what each failure is", () => {
    expect(parseEiaData('{"error":{"code":"API_KEY_INVALID","message":"An invalid api_key was supplied. Get one at https://api.eia.gov:443"}}')).toEqual({ error: 'EIA: An invalid api_key was supplied. Get one at https://api.eia.gov:443' });
    expect(parseEiaData('not json')).toEqual({ error: 'EIA answered with something other than its data.' });
    expect(eiaProblem({ status: 0, text: '', missing: 'EIA_API_KEY' })).toEqual({ state: 'needs-key', message: 'Needs EIA_API_KEY on PROVIDERS (a free key from eia.gov/opendata).' });
    expect(eiaProblem({ status: 403, text: '', error: 'API_KEY_INVALID An invalid api_key was supplied.' }).message).toBe('EIA refused the key (API_KEY_INVALID). Check EIA_API_KEY on PROVIDERS.');
    expect(eiaProblem({ status: 429, text: '' }).message).toContain('rate limit');
    expect(eiaProblem({ status: 503, text: '' }).message).toBe("EIA's service failed (HTTP 503).");
    expect(eiaProblem({ status: 0, text: '', error: 'fetch failed' }).message).toBe('EIA did not answer (network or service).');
  });

  it("checks the key's shape, takes it from a pasted list, and reads EIA's refusal as an entitlement problem", () => {
    expect(providers.CREDENTIALS.EIA_API_KEY.valid('abcdefghijABCDEFGHIJ0123456789klmnopqrst')).toBe(true);
    expect(providers.CREDENTIALS.EIA_API_KEY.valid('short')).toBe(false);
    expect(providers.CREDENTIALS.BEA_API_KEY.valid('01234567-89AB-CDEF-0123-456789ABCDEF')).toBe(true);
    expect(providers.parseCredentialList('EIA: abcdefghijABCDEFGHIJ0123456789klmnopqrst').found).toEqual([{ name: 'EIA_API_KEY', value: 'abcdefghijABCDEFGHIJ0123456789klmnopqrst' }]);
    expect(providers.providerPayloadProblem('eia', '{"error":{"code":"API_KEY_INVALID","message":"An invalid api_key was supplied."}}')).toMatchObject({ kind: 'not-entitled' });
  });
});
