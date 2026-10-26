import { describe, expect, it } from 'vitest';
import { parseFilings13F } from '../src/data/live/sec';
import { cikArg } from '../src/data/live/thirteenf';
import { filingIndexUrl, filingQuery, quarterOf } from '../src/functions/FLNG';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';
import * as secMain from '../electron/sec.cjs';
import bridgewater from './fixtures/edgar-13f-bridgewater.json';

describe('13F Filings (FLNG)', () => {
  it("reads EDGAR's search answer: one line a filing, with the manager, quarter and form", () => {
    const r = parseFilings13F(JSON.stringify(bridgewater))!;
    expect(r.total).toBe(98);
    expect(r.filings).toHaveLength(11);
    expect(r.filings[0]).toEqual({ cik: 1350694, filer: 'Bridgewater Associates, LP', form: '13F-HR', filed: '2026-08-14', period: '2026-06-30', accession: '0001350694-26-000003' });
    expect(r.filings.at(-1)).toMatchObject({ form: '13F-HR/A', filed: '2018-08-13', period: '2018-03-31' });
    expect(quarterOf(r.filings[0].period)).toBe('Q2 2026');
    expect(filingIndexUrl(r.filings[0])).toBe('https://www.sec.gov/Archives/edgar/data/1350694/000135069426000003/');
    // A filing whose documents are each a hit (older text filings) is one line.
    const twice = structuredClone(bridgewater);
    twice.hits.hits.push({ ...twice.hits.hits[0], _id: `${twice.hits.hits[0]._source.adsh}:infotable.xml` });
    expect(parseFilings13F(JSON.stringify(twice))!.filings).toHaveLength(11);
    expect(parseFilings13F('<html>')).toBeNull();
  });

  it('searches the recent filings, or a manager by name over any time', () => {
    const now = Date.UTC(2026, 9, 26);
    expect(filingQuery('', 1, now, 0)).toEqual({ startdt: '2026-10-23', enddt: '2026-10-26' });
    expect(filingQuery(' Bridgewater ', 4, now, 2)).toEqual({ name: 'Bridgewater', from: 200 });
    expect(filingQuery('', 4, now, 0)).toBeNull();
    expect(filingQuery('b', 2, now, 0)).toEqual({ startdt: '2026-10-19', enddt: '2026-10-26' });
  });

  it('asks EDGAR for Form 13F holdings reports only, with checked arguments', () => {
    expect(secMain.filings13fUrl('name=bridgewater')).toBe('https://efts.sec.gov/LATEST/search-index?forms=13F-HR&entityName=bridgewater');
    expect(secMain.filings13fUrl('startdt=2026-10-23&enddt=2026-10-26&from=100')).toBe('https://efts.sec.gov/LATEST/search-index?forms=13F-HR&dateRange=custom&startdt=2026-10-23&enddt=2026-10-26&from=100');
    expect(secMain.filings13fUrl('')).toBeNull();
    expect(secMain.filings13fUrl('name=x')).toBeNull();
    expect(secMain.filings13fUrl('forms=10-K&name=apple')).toBeNull();
    expect(secMain.filings13fUrl('startdt=2026-10-26&enddt=2026-10-23')).toBeNull();
    expect(secMain.filings13fUrl('name=bridgewater&from=150')).toBeNull();
    expect(secMain.secRequest('filings13f', 'name=bridgewater')?.url).toBe('https://efts.sec.gov/LATEST/search-index?forms=13F-HR&entityName=bridgewater');
  });

  it("opens HOLDINGS on a manager's CIK, and FLNG US is still FLEX LNG", () => {
    expect(cikArg('CIK 1350694')).toBe(1350694);
    expect(cikArg('cik0001350694')).toBe(1350694);
    expect(cikArg('AAPL')).toBeNull();
    expect(parseCommand('FLNG', lookupFn)).toEqual({ kind: 'route', fn: 'FILINGS13F' });
    expect(parseCommand('FLNG bridgewater', lookupFn)).toEqual({ kind: 'route', fn: 'FILINGS13F', args: 'BRIDGEWATER' });
    expect(parseCommand('FLNG US', lookupFn)).toMatchObject({ kind: 'error', lookup: 'FLNG' });
  });
});
