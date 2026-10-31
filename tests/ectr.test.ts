import { describe, expect, it } from 'vitest';
import { latestYear, monthLabel, monthRows, parseAreaNames, parseImts, tradeRows, yearBefore } from '../src/data/live/imts';
import { reporterOf, yearsOf } from '../src/functions/ECTR';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as imfMain from '../electron/imf.cjs';
import imts from './fixtures/imf-imts-usa-2026-10.json';

// The IMF's answers as given: United States trade with eight partners and groups by year from 2016, with China by
// month from April 2024; the codelist trimmed to the codes used.
describe('Trade flows (ECTR)', () => {
  const trade = parseImts(JSON.stringify(imts.annual))!;
  const names = parseAreaNames(JSON.stringify(imts.areas))!;

  it("reads the IMF's exports and imports by partner and year, in US dollars, with the names", () => {
    expect(Object.keys(trade).sort()).toEqual(['CAN', 'CHN', 'DEU', 'G001', 'G998', 'GX170', 'JPN', 'MEX', 'TX910']);
    expect(trade.CHN.x['2024']).toBe(143545739507);
    expect(trade.CHN.m['2024']).toBe(438947386145);
    expect(names.CHN).toBe("China, People's Republic of");
    expect(names.G001).toBe('World');
    expect(latestYear(trade)).toBe('2025');
    expect(yearsOf(trade)[0]).toBe('2025');
    expect(yearsOf(trade)).toHaveLength(10);
    expect(parseImts('<html>')).toBeNull();
    // A query no figure matches: a data set with no series.
    expect(parseImts(JSON.stringify({ data: { dataSets: [{ structure: 0, action: 'Replace' }], structures: [{}] } }))).toEqual({});
  });

  it("ranks the partners by total trade, with the balance, the share of the economy's trade with the world and the change on the year before", () => {
    const rows = tradeRows(trade, names, '2025', 'partners', '');
    expect(rows.map((r) => r.code)).toEqual(['MEX', 'CAN', 'CHN', 'DEU', 'JPN']);
    const chn = rows[2];
    expect(chn.x).toBe(106308397841);
    expect(chn.m).toBe(308379722302);
    expect(chn.balance).toBe(106308397841 - 308379722302);
    expect(chn.share).toBeCloseTo(((106308397841 + 308379722302) / (2185205847471 + 3415747108487)) * 100, 6);
    expect(chn.xChg).toBeCloseTo((106308397841 / 143545739507 - 1) * 100, 6);
    expect(tradeRows(trade, names, '2025', 'partners', 'china').map((r) => r.code)).toEqual(['CHN']);
  });

  it("lists the groups in the order of the IMF's table, and leaves out groups outside it", () => {
    const rows = tradeRows(trade, names, '2025', 'regions', '');
    expect(rows.map((r) => r.code)).toEqual(['G001', 'TX910', 'G998']);
    expect(rows[0].share).toBeCloseTo(100, 9);
  });

  it("gives a partner's months, latest first, with the change on the same month a year before", () => {
    const months = monthRows(parseImts(JSON.stringify(imts.monthly))!.CHN);
    expect(months).toHaveLength(24);
    expect(months[0]).toMatchObject({ period: '2026-M06', x: 9571187957, m: 25149961532 });
    const june25 = parseImts(JSON.stringify(imts.monthly))!.CHN.x['2025-M06'];
    expect(months[0].xChg).toBeCloseTo((9571187957 / june25 - 1) * 100, 6);
    expect(yearBefore('2026-M01')).toBe('2025-M01');
    expect(monthLabel('2026-M06')).toBe('Jun 2026');
  });

  it('asks the IMF for the checked codes only, ten years by year and 40 months by month', () => {
    const now = Date.UTC(2026, 9, 26);
    expect(imfMain.imfRequest('trade', 'USA', now)?.url).toBe('https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/IMTS/+/USA.XG_FOB_USD%2BMG_CIF_USD.*.A?c%5BTIME_PERIOD%5D=ge:2016-01');
    expect(imfMain.imfRequest('trade-monthly', 'USA:CHN', now)?.url).toBe('https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/IMTS/+/USA.XG_FOB_USD%2BMG_CIF_USD.CHN.M?c%5BTIME_PERIOD%5D=ge:2023-06');
    expect(imfMain.imfRequest('trade-areas')?.url).toBe('https://api.imf.org/external/sdmx/3.0/structure/codelist/IMF.STA/CL_IMTS_COUNTRY/+');
    for (const bad of ['usa', 'USA.X', 'USA/../x', '']) expect(imfMain.imfRequest('trade', bad, now)).toBeNull();
    expect(imfMain.imfRequest('trade-monthly', 'USA', now)).toBeNull();
    expect(imfMain.imfRequest('trade-monthly', 'USA:*', now)).toBeNull();
  });

  it('opens under ECTR on the economy named, the United States otherwise', () => {
    expect(parseCommand('ECTR', lookupFn)).toEqual({ kind: 'route', fn: 'TRADEFLOWS' });
    expect(reporterOf('deu')).toBe('DEU');
    expect(reporterOf('')).toBe('USA');
    expect(reporterOf('GERMANY')).toBe('USA');
  });
});
