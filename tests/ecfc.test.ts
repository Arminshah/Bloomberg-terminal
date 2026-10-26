import { describe, expect, it } from 'vitest';
import { parseWeoEdition, parseWeoNames, parseWeoValues, WEO } from '../src/data/live/weo';
import { MAJOR, REGIONS, weoRows, yearsAround } from '../src/functions/ECFC';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as imfMain from '../electron/imf.cjs';
import imf from './fixtures/imf-weo-2026-10.json';

describe('Economic Forecasts (ECFC)', () => {
  const values = parseWeoValues(JSON.stringify(imf.values), 'NGDP_RPCH')!;
  const names = { ...parseWeoNames(JSON.stringify(imf.countries), 'countries')!, ...parseWeoNames(JSON.stringify(imf.groups), 'groups')! };

  it("reads the IMF's figures by economy and year, the projections included, with the names and the edition", () => {
    expect(values.USA[2026]).toBe(imf.values.values.NGDP_RPCH.USA['2026']);
    expect(values.WEOWORLD[2031]).toBe(imf.values.values.NGDP_RPCH.WEOWORLD['2031']);
    expect(names.USA).toBe('United States');
    expect(names.WEOWORLD).toBe('World');
    expect(parseWeoEdition(JSON.stringify(imf.indicators))).toBe('World Economic Outlook (October 2026)');
    // An economy the IMF gives no figure for in a year has no entry for it, not a zero.
    expect(Object.keys(values.AFG).every((y) => Number(y) <= 2025)).toBe(true);
    expect(parseWeoValues('<html>', 'NGDP_RPCH')).toBeNull();
    expect(parseWeoValues(JSON.stringify({ values: {} }), 'NGDP_RPCH')).toEqual({});
  });

  it('shows two years back to five ahead', () => {
    expect(yearsAround(2026)).toEqual([2024, 2025, 2026, 2027, 2028, 2031]);
  });

  it('lists the regions then the major economies, or every economy by name, only those the IMF has figures for', () => {
    const major = weoRows(values, names, 'major', '');
    expect(major.slice(0, 3)).toEqual(['WEOWORLD', 'ADVEC', 'MAE']);
    expect(major.every((c) => REGIONS.includes(c) || MAJOR.includes(c))).toBe(true);
    expect(major).not.toContain('RUS');
    const all = weoRows(values, names, 'all', '');
    expect(all.slice(0, 3).map((c) => names[c])).toEqual(['Afghanistan', 'Albania', 'Argentina']);
    expect(all).not.toContain('WEOWORLD');
    expect(weoRows(values, names, 'all', 'united')).toEqual(['GBR', 'USA']);
  });

  it('asks the IMF only for the indicators it shows, and the names', () => {
    expect(imfMain.imfRequest('weo', 'NGDP_RPCH')?.url).toBe('https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH');
    expect(imfMain.imfRequest('weo', 'NGDP_RPCH/../x')).toBeNull();
    expect(imfMain.imfRequest('countries')?.url).toBe('https://www.imf.org/external/datamapper/api/v1/countries');
    expect(imfMain.imfRequest('other')).toBeNull();
    expect(imfMain.WEO_INDICATORS).toEqual(WEO.map((w) => w.id));
  });

  it('opens under ECFC', () => {
    expect(parseCommand('ECFC', lookupFn)).toEqual({ kind: 'route', fn: 'ECOFORECASTS' });
  });
});
