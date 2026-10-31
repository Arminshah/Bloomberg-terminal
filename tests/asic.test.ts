import { describe, expect, it } from 'vitest';
import { asicRequest } from '../electron/asic.cjs';
import { asicSampleDays, asxCode, parseAsicDay, parseAsicIndex, type AsicDay } from '../src/data/live/asic';
import type { SecurityDef } from '../src/data/types';

// Synthetic answers in the layouts ASIC used on 31 October 2026: the index of published days, and a day's CSV with
// names that may hold commas (then quoted). The products and figures are made up.
const INDEX = JSON.stringify([{ date: 20261026, version: '001' }, { date: 20261023, version: '001' }, { date: 20261023, version: '002' }, { date: 'bad', version: '001' }]);
const DAY = [
  'Product,Product Code,Reported Short Positions,Total Product in Issue,% of Total Product in Issue Reported as Short Positions',
  'ALPHA MINING LIMITED ORDINARY,AMX,82537252,5084182410,1.62341248',
  '"BETA MEDICAL, INC. CDI US",BTM,151975,252023810,.06030184',
  'ZERO ISSUE LTD,ZIL,10,0,0',
  'BROKEN LINE',
].join('\r\n');

describe("ASIC's short position files", () => {
  it('asks only for the index or a real day with a three-digit version', () => {
    expect(asicRequest('index')?.url).toBe('https://download.asic.gov.au/short-selling/short-selling-data.json');
    expect(asicRequest('day', '20261026', '001')?.url).toBe('https://download.asic.gov.au/short-selling/RR20261026-001-SSDailyAggShortPos.csv');
    for (const [kind, date, version] of [['day', '20261332', '001'], ['day', '2026-10-26', '001'], ['day', '20261026', '1'], ['day', '20090105', '001'], ['other', '20261026', '001'], ['day', undefined, '001']]) {
      expect(asicRequest(kind, date, version)).toBeNull();
    }
  });

  it('lists the published days newest first, a republished day under its later version', () => {
    expect(parseAsicIndex(INDEX)).toEqual([{ date: '2026-10-26', version: '001' }, { date: '2026-10-23', version: '002' }]);
    expect(parseAsicIndex('{}')).toEqual([]);
    expect(parseAsicIndex('<html>')).toEqual([]);
  });

  it("reads each product's position from the end of its line, names with commas included", () => {
    const day = parseAsicDay(DAY);
    expect([...day.keys()]).toEqual(['AMX', 'BTM']);
    expect(day.get('AMX')).toEqual({ short: 82537252, issued: 5084182410, pct: 1.62341248 });
    expect(day.get('BTM')?.pct).toBeCloseTo(0.06030184, 10);
    expect(parseAsicDay('Product,Code\nX,Y,1,2,3').size).toBe(0);
  });

  it('samples the latest day and the last day published on or before each 15th and month end', () => {
    // Weekdays from 1 August to 26 October 2026.
    const index: AsicDay[] = [];
    for (let t = Date.UTC(2026, 9, 26); t >= Date.UTC(2026, 7, 1); t -= 86_400_000) {
      if (![0, 6].includes(new Date(t).getUTCDay())) index.push({ date: new Date(t).toISOString().slice(0, 10), version: '001' });
    }
    expect(asicSampleDays(index, 2).map((d) => d.date)).toEqual(['2026-10-26', '2026-10-15', '2026-09-30', '2026-09-15', '2026-08-31', '2026-08-14']);
    expect(asicSampleDays([])).toEqual([]);
  });

  it('takes the product code of an ASX line only', () => {
    const def = (ticker: string, country: string) => ({ ticker, country, cls: 'equity' }) as SecurityDef;
    expect(asxCode(def('BHP AU', 'AU'))).toBe('BHP');
    expect(asxCode(def('AAPL US', 'US'))).toBeNull();
    expect(asxCode(undefined)).toBeNull();
  });
});
