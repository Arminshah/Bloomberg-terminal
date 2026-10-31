import { describe, expect, it } from 'vitest';
import * as main from '../electron/cftc.cjs';
import { COMMODITY_CODES, COT_MARKETS, cotProblem, cotRows, FINANCIAL_CODES, parseCot, reportLate, type CotPosition } from '../src/data/live/cftc';
import { engine } from '../src/data/market';
// The CFTC's public reporting platform as it answered on 28 October 2026 (positions of 20 October, published 23 October).
import DISAGG from './fixtures/cftc/latest-disaggregated-futures-2026-10-28.json?raw';
import TFF from './fixtures/cftc/latest-tff-futures-2026-10-28.json?raw';
import LEGACY from './fixtures/cftc/latest-legacy-combined-2026-10-28.json?raw';
import WTI_HISTORY from './fixtures/cftc/history-disaggregated-futures-067651-2026-10-28.json?raw';

const NOW = Date.parse('2026-10-28T15:00:00Z');
const parsed = (text: string, report: 'legacy' | 'disaggregated' | 'tff'): Map<string, CotPosition[]> => {
  const p = parseCot(text, report);
  if ('error' in p) throw new Error(p.error);
  return p;
};

describe('CFTC requests', () => {
  it('asks the dataset of the report and mode chosen, for the listed markets only', () => {
    // Each ID checked against the dataset's own name on 28 October 2026 (jun7-fc8e is "Legacy - Combined").
    expect(main.DATASETS).toEqual({ legacy: { futures: '6dca-aqww', combined: 'jun7-fc8e' }, disaggregated: { futures: '72hh-3qpy', combined: 'kh3c-gbw2' }, tff: { futures: 'gpe5-46if', combined: 'yw9f-hn96' } });
    const latest = new URL(main.cftcRequest('latest', 'disaggregated', 'futures', undefined, NOW)!.url);
    expect(latest.origin + latest.pathname).toBe('https://publicreporting.cftc.gov/resource/72hh-3qpy.json');
    // 120 days back: after the federal shutdown of October 2025 the CFTC published positions up to 50 days late.
    expect(latest.searchParams.get('$where')).toBe(`cftc_contract_market_code in(${main.COMMODITY_CODES.map((c) => `'${c}'`).join(',')}) AND report_date_as_yyyy_mm_dd >= '2026-06-30T00:00:00.000'`);
    expect(latest.searchParams.get('$select')).toContain('m_money_positions_long_all,m_money_positions_short_all');
    expect(latest.searchParams.get('$select')).toContain(':created_at,:updated_at');
    const history = new URL(main.cftcRequest('history', 'tff', 'combined', '13874A', NOW)!.url);
    expect(history.pathname).toBe('/resource/yw9f-hn96.json');
    expect(history.searchParams.get('$where')).toBe("cftc_contract_market_code in('13874A') AND report_date_as_yyyy_mm_dd >= '2024-10-26T00:00:00.000'");
    expect(main.cftcRequest('history', 'tff', 'futures', '067651', NOW)).toBeNull();
    expect(main.cftcRequest('latest', 'cit', 'futures', undefined, NOW)).toBeNull();
    expect(main.cftcRequest('everything', 'legacy', 'futures', undefined, NOW)).toBeNull();
  });
});

describe("COT's markets", () => {
  it('lists the markets the desktop app asks for, in order, each tied to a line the app carries', () => {
    // The lists were once an object's keys, and '111659' (RBOB) and the other number-like codes came first.
    expect(COMMODITY_CODES).toEqual(main.COMMODITY_CODES);
    expect(FINANCIAL_CODES).toEqual(main.FINANCIAL_CODES);
    expect(COMMODITY_CODES[0]).toBe('067651');
    expect(COT_MARKETS.size).toBe(40);
    expect([...COT_MARKETS].filter(([, id]) => !engine.get(id))).toEqual([]);
  });
});

describe("the CFTC's reports", () => {
  it("reads WTI's managed money on 20 October 2026 as the CFTC's own report page shows it", () => {
    const wti = parsed(DISAGG, 'disaggregated').get('067651')!;
    expect(wti.map((w) => w.positionDate)).toEqual(['2026-10-20', '2026-10-13', '2026-10-06']);
    expect(wti[0]).toMatchObject({ market: 'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE', positionDate: '2026-10-20', published: '2026-10-23T19:30:09.576Z', openInterest: 1_835_144 });
    expect(wti[0].groups.find((g) => g.key === 'mmoney')).toEqual({ key: 'mmoney', label: 'Managed money', long: 163_413, short: 127_226, net: 36_187 });
    expect(wti[0].groups.find((g) => g.key === 'prod')).toMatchObject({ long: 625_697, short: 266_129 });
    expect(wti[0].updated).toBeUndefined();
  });

  it("sets the latest week against the Tuesday before: the CFTC's changes, long -8,560 and short -4,173", () => {
    const rows = cotRows(parsed(DISAGG, 'disaggregated'), 'disaggregated', main.COMMODITY_CODES);
    const wti = rows.find((r) => r.pos.code === '067651')!;
    expect(wti).toMatchObject({ change: -8_560 - -4_173, priorDate: '2026-10-13' });
    expect(wti.netPctOi).toBeCloseTo((36_187 / 1_835_144) * 100, 9);
    expect(wti.second.key).toBe('prod');
    expect(rows).toHaveLength(18);
  });

  it("reads the E-mini S&P 500's leveraged funds and asset managers (Traders in Financial Futures)", () => {
    const es = parsed(TFF, 'tff').get('13874A')![0];
    expect(es.openInterest).toBe(1_935_470);
    expect(es.groups.find((g) => g.key === 'levmoney')).toMatchObject({ long: 135_034, short: 506_279, net: -371_245 });
    expect(es.groups.find((g) => g.key === 'assetmgr')).toMatchObject({ long: 1_101_642, short: 200_265 });
  });

  it('reads the Legacy report, futures and options combined, for all forty markets', () => {
    const legacy = parsed(LEGACY, 'legacy');
    expect(legacy.size).toBe(40);
    expect(legacy.get('088691')![0].groups.find((g) => g.key === 'noncomm')).toMatchObject({ long: 226_142, short: 34_351 });
  });

  it("gives two years of one market's reports, newest first, a holiday's Monday included", () => {
    const weeks = parsed(WTI_HISTORY, 'disaggregated').get('067651')!;
    expect(weeks).toHaveLength(104);
    expect(weeks[0].positionDate).toBe('2026-10-20');
    // Positions of Monday 10 November 2025, six days after the report before and eight before the next.
    expect(weeks.map((w) => w.positionDate)).toContain('2025-11-10');
    const at = weeks.findIndex((w) => w.positionDate === '2025-11-18');
    expect(cotRows(new Map([['067651', weeks.slice(at)]]), 'disaggregated', ['067651'])[0]).toMatchObject({ priorDate: '2025-11-10' });
    expect(Number.isFinite(cotRows(new Map([['067651', weeks.slice(at)]]), 'disaggregated', ['067651'])[0].change)).toBe(true);
  });

  it("says when the newest report is later than the CFTC's schedule, as after the shutdown of October 2025", () => {
    const weeks = parsed(WTI_HISTORY, 'disaggregated').get('067651')!;
    // Positions of 30 September 2025 were published on 19 November, 50 days later; normal again by 30 December.
    const late = weeks.find((w) => w.positionDate === '2025-09-30')!;
    expect(late.published.slice(0, 10)).toBe('2025-11-19');
    expect(reportLate('2025-09-30', Date.parse(late.published))).toBe(true);
    expect(reportLate('2025-12-30', Date.parse(weeks.find((w) => w.positionDate === '2025-12-30')!.published))).toBe(false);
    // On a normal schedule the newest positions are at most 14 days old: 20 October, just before 30 October's report.
    expect(reportLate('2026-10-20', Date.parse('2026-10-30T19:29:00Z'))).toBe(false);
    expect(reportLate('2026-10-20', Date.parse('2026-11-04T00:00:00Z'))).toBe(false);
    expect(reportLate('2026-10-20', Date.parse('2026-11-05T01:00:00Z'))).toBe(true);
  });

  it('leaves the change blank without the week before, and marks a revised row', () => {
    const one = new Map([['067651', [{ code: '067651', market: 'WTI', positionDate: '2026-10-20', published: '2026-10-23T19:30:09.576Z', updated: '2026-10-27T15:00:00.000Z', openInterest: 100, groups: [{ key: 'mmoney', label: 'Managed money', long: 10, short: 4, net: 6 }, { key: 'prod', label: 'Producer/merchant', long: 1, short: 2, net: -1 }] }]]]);
    const row = cotRows(one, 'disaggregated', ['067651'])[0];
    expect(row.change).toBeNaN();
    expect(row.pos.updated).toBe('2026-10-27T15:00:00.000Z');
  });

  it("reads the platform's errors, and says what each failure is", () => {
    expect(parseCot('{"message":"Unrecognized arguments [$limitt]","error":true}', 'legacy')).toEqual({ error: 'CFTC: Unrecognized arguments [$limitt]' });
    expect(parseCot('<html>', 'legacy')).toEqual({ error: 'The CFTC answered with something other than its data.' });
    expect(cotProblem({ status: 429, text: '' })).toContain('rate limit');
    expect(cotProblem({ status: 503, text: '' })).toBe('The CFTC platform failed (HTTP 503).');
    expect(cotProblem({ status: 0, text: '' })).toBe('The CFTC platform did not answer (network or service).');
  });
});
