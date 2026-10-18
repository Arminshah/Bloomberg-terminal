import { describe, expect, it } from 'vitest';
import { isMarketCode, parseListing, yahooListingSymbol } from '../src/data/listings';
import { defFromYahoo, latestReportedShares } from '../src/data/live/lookup';
import { parseCommand } from '../src/terminal/commands';
import { lookupFn } from '../src/terminal/registry';

import sofiChart from './fixtures/yahoo-sofi-chart.json';
import sofiSummary from './fixtures/yahoo-sofi-summary.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const clone = (v: unknown): any => structuredClone(v);
const parse = (s: string) => parseCommand(s, lookupFn);

/** The SOFI fixture moved to Brussels in euros: only the exchange and currency matter to these checks. */
function brusselsChart() {
  const chart = clone(sofiChart);
  chart.chart.result[0].meta.exchangeName = 'BRU';
  chart.chart.result[0].meta.currency = 'EUR';
  return chart;
}

describe('European listings', () => {
  it('reads market codes, Yahoo suffixes and class shares', () => {
    expect(parseListing('ABI BB')).toMatchObject({ root: 'ABI', listing: { code: 'BB', suffix: 'BR' } });
    expect(parseListing('abi bb equity')).toMatchObject({ root: 'ABI', listing: { code: 'BB' } });
    expect(parseListing('ABI.BR')).toMatchObject({ root: 'ABI', listing: { code: 'BB' } });
    expect(parseListing('VOLV/B SS')).toMatchObject({ root: 'VOLV/B', listing: { code: 'SS' } });
    expect(parseListing('VOLV-B.ST')).toMatchObject({ root: 'VOLV/B', listing: { code: 'SS' } });
    expect(yahooListingSymbol('VOLV/B', parseListing('VOLV/B SS')!.listing)).toBe('VOLV-B.ST');
    // US class shares and unknown codes are not European listings.
    expect(parseListing('BRK.B')).toBeNull();
    expect(parseListing('AAPL US')).toBeNull();
    expect(parseListing('ABI XX')).toBeNull();
    expect(isMarketCode('fp')).toBe(true);
    expect(isMarketCode('US')).toBe(false);
  });

  it('looks a listing up however it is typed, then runs the function', () => {
    expect(parse('ABI BB')).toMatchObject({ kind: 'error', lookup: 'ABI BB' });
    expect(parse('ABI BB EQUITY')).toMatchObject({ kind: 'error', lookup: 'ABI BB' });
    expect(parse('ABI BB CHART')).toMatchObject({ kind: 'error', lookup: 'ABI BB' });
    expect(parse('COMPANYNEWS ABI BB')).toMatchObject({ kind: 'error', lookup: 'ABI BB' });
    expect(parse('QUOTE KBC BB')).toMatchObject({ kind: 'error', lookup: 'KBC BB' });
    expect(parse('ABI.BR')).toMatchObject({ kind: 'error', lookup: 'ABI.BR' });
    expect(parse('PROFILE ABI.BR')).toMatchObject({ kind: 'error', lookup: 'ABI.BR' });
    // A US ticker still goes to the US lookup.
    expect(parse('COMPANYNEWS ZZZQ')).toMatchObject({ kind: 'error', lookup: 'ZZZQ' });
  });

  it('builds a Brussels stock in euros, named the app way', () => {
    const built = defFromYahoo('ABI BB', brusselsChart(), clone(sofiSummary), parseListing('ABI BB')!);
    if ('error' in built) throw new Error(built.error);
    expect(built.def).toMatchObject({ id: 'ABI BB Equity', ticker: 'ABI BB', ccy: 'EUR', country: 'BE', region: 'EMEA', exch: 'EN Brussels' });
    expect(built.def.alias).toContain('ABI.BR');
    expect(built.def.dynamic).toMatchObject({ source: 'yahoo', symbol: 'ABI.BR' });
  });

  it('loads from the price history alone when the company summary is refused', () => {
    const built = defFromYahoo('ABI BB', brusselsChart(), null, parseListing('ABI BB')!);
    if ('error' in built) throw new Error(built.error);
    expect(built.def.eq!.shares).toBeNaN();
    expect(built.bars.length).toBeGreaterThan(5);
  });

  it('takes the share count from the reported balance sheet when the summary leaves it out', () => {
    // Yahoo's summary for KBC.BR on 18 October 2026: sharesOutstanding and marketCap empty.
    const summary = clone(sofiSummary);
    const r = summary.quoteSummary.result[0];
    r.defaultKeyStatistics.sharesOutstanding = {};
    r.price.marketCap = {};
    r.summaryDetail.marketCap = {};
    const series = {
      timeseries: {
        result: [
          { meta: { type: ['annualOrdinarySharesNumber'] }, annualOrdinarySharesNumber: [{ asOfDate: '2025-12-31', reportedValue: { raw: 396_000_000 } }] },
          { meta: { type: ['quarterlyOrdinarySharesNumber'] }, quarterlyOrdinarySharesNumber: [{ asOfDate: '2026-03-31', reportedValue: { raw: 397_000_000 } }, { asOfDate: '2026-06-30', reportedValue: { raw: 396_681_919 } }, null] },
        ],
      },
    };
    const shares = latestReportedShares(series);
    expect(shares).toBe(396_681_919);
    expect(latestReportedShares(null)).toBeUndefined();
    const built = defFromYahoo('KBC BB', brusselsChart(), summary, parseListing('KBC BB')!, shares);
    if ('error' in built) throw new Error(built.error);
    expect(built.def.eq!.shares).toBeCloseTo(396.681919, 6);
    // Without any count the stock still loads, with the count unknown.
    const none = defFromYahoo('KBC BB', brusselsChart(), summary, parseListing('KBC BB')!);
    if ('error' in none) throw new Error(none.error);
    expect(none.def.eq!.shares).toBeNaN();
  });

  it('refuses a listing on another exchange than the one typed', () => {
    const paris = brusselsChart();
    paris.chart.result[0].meta.exchangeName = 'PAR';
    expect(defFromYahoo('ABI BB', paris, null, parseListing('ABI BB')!)).toMatchObject({ error: expect.stringMatching(/not listed on EN Brussels/) });
  });

  it('keeps London prices in pence', () => {
    const london = brusselsChart();
    london.chart.result[0].meta.exchangeName = 'LSE';
    london.chart.result[0].meta.currency = 'GBp';
    const built = defFromYahoo('BARC LN', london, null, parseListing('BARC LN')!);
    if ('error' in built) throw new Error(built.error);
    expect(built.def).toMatchObject({ ccy: 'GBp', minor: true, dec: 1, alias: ['BARC.L'] });
  });
});
