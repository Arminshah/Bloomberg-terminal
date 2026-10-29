import { describe, expect, it } from 'vitest';
import * as fmpMain from '../electron/fmp.cjs';
import * as finnhubMain from '../electron/finnhub.cjs';
import * as nasdaqMain from '../electron/nasdaq.cjs';
import { mergeConsensus, parseYahooEarnings } from '../src/data/live/consensus';
import { daysBetween, growthPct, historyDays, historyWindows, mergeCalendar, nasdaqNumber, parseFinnhubWindow, parseFmpEarnings, parseNasdaqDay, parseNasdaqListings, tickerKey } from '../src/data/live/earnings-calendar';
import tsm from './fixtures/yahoo-earnings-tsm.json';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const NOW = day('2026-10-20') + 12 * 3_600_000;

// Shapes as Nasdaq answered on 20 October 2026: a reported day, a coming day and a day without reports.
const reportedDay = JSON.stringify({ data: { asOf: 'Tue, Oct 14, 2026', rows: [
  { eps: '$1.08', surprise: '-2.7', time: 'time-pre-market', symbol: 'BAC', name: 'Bank of America Corporation', marketCap: '$358,238,487,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$1.11', noOfEsts: '7' },
  { eps: '($0.17)', surprise: 'N/A', time: 'time-not-supplied', symbol: 'NUCL', name: 'Small Nuclear Inc', marketCap: '$410,000,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '', noOfEsts: 'N/A' },
] }, status: { rCode: 200 } });
const comingDay = JSON.stringify({ data: { rows: [
  { lastYearRptDt: '10/29/2025', lastYearEPS: '$7.25', time: 'time-after-hours', symbol: 'META', name: 'Meta Platforms, Inc.', marketCap: '$1,807,009,840,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$6.54', noOfEsts: '11' },
  { lastYearRptDt: '10/22/2025', lastYearEPS: '($0.12)', time: 'time-after-hours', symbol: 'BRK/B', name: 'Berkshire Hathaway', marketCap: '$1,000,000,000,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$5.00', noOfEsts: '2' },
] } });
const emptyDay = JSON.stringify({ data: null, message: null, status: { rCode: 200, bCodeMessage: [{ code: 1002, errorMessage: 'Earnings Calendar: No record found.' }] } });

const parsed = <T,>(r: { data: T } | { error: string }): T => {
  if ('error' in r) throw new Error(r.error);
  return r.data;
};

describe('the market earnings calendar', () => {
  it("reads Nasdaq's figures, negatives in brackets and N/A as nothing", () => {
    expect(nasdaqNumber('$1.08')).toBe(1.08);
    expect(nasdaqNumber('($0.17)')).toBe(-0.17);
    expect(nasdaqNumber('-4.17')).toBe(-4.17);
    expect(nasdaqNumber('$632,670,780,000')).toBe(632_670_780_000);
    expect(nasdaqNumber('5820952445.00')).toBe(5_820_952_445);
    for (const none of ['N/A', '', null, undefined, 'abc']) expect(nasdaqNumber(none)).toBeNaN();
    expect(tickerKey('brk/b')).toBe('BRK.B');
    expect(tickerKey('BRK-B')).toBe('BRK.B');
  });

  it("reads a day's reports: timing, fiscal quarter, forecast, reported EPS and a coming report's year-earlier EPS", () => {
    const [bac, nucl] = parsed(parseNasdaqDay(reportedDay, '2026-10-14', Date.parse('2026-11-30')));
    expect(bac).toMatchObject({ symbol: 'BAC', date: '2026-10-14', timing: 'Bef-mkt', marketCap: 358_238_487_000, fiscalEnd: '2026-09', epsEst: 1.11, epsActual: 1.08, analysts: 7 });
    expect(nucl.epsActual).toBe(-0.17);
    expect(nucl.epsEst).toBeNaN();
    expect(nucl.timing).toBe('--');
    // In the days after a report Nasdaq's EPS is the reported one only with its surprise (or when it equals the
    // estimate): until it has the figures the field holds the year-earlier EPS.
    const fresh = parsed(parseNasdaqDay(JSON.stringify({ data: { rows: [
      { eps: '$1.66', surprise: 'N/A', time: 'time-pre-market', symbol: 'GE', name: 'GE Aerospace', marketCap: '$322,972,451,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$2.02', noOfEsts: '7' },
      { eps: '$0.43', surprise: 'N/A', time: 'time-pre-market', symbol: 'FNB', name: 'F.N.B.', marketCap: '$5,990,000,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$0.43', noOfEsts: '6' },
    ] } }), '2026-10-20', Date.parse('2026-10-21')));
    expect(fresh[0].epsActual).toBeNaN();
    expect(fresh[0].epsEst).toBe(2.02);
    expect(fresh[1].epsActual).toBe(0.43);
    expect(parsed(parseNasdaqDay(reportedDay, '2026-10-14', Date.parse('2026-10-21')))[1].epsActual).toBeNaN();
    const [meta, brk] = parsed(parseNasdaqDay(comingDay, '2026-10-28'));
    expect(meta).toMatchObject({ timing: 'Aft-mkt', epsEst: 6.54, yearAgoEps: 7.25, yearAgoDate: '2025-10-29' });
    expect(meta.epsActual).toBeNaN();
    expect(brk.symbol).toBe('BRK.B');
    expect(parsed(parseNasdaqDay(emptyDay, '2027-03-01'))).toEqual([]);
    expect(parseNasdaqDay('<html>', '2026-10-14')).toHaveProperty('error');
  });

  it("reads Nasdaq's stock list for market values, without preferred shares", () => {
    const list = parsed(parseNasdaqListings(JSON.stringify({ data: { rows: [{ symbol: 'APLD', name: 'Applied Digital', marketCap: '5820952445.00', country: 'United States', sector: 'Technology' }, { symbol: 'ABR^D', name: 'Arbor preferred', marketCap: '1' }] } })));
    expect(list.get('APLD')).toMatchObject({ cap: 5_820_952_445, sector: 'Technology' });
    expect(list.has('ABR^D')).toBe(false);
  });

  it("reads Finnhub's and FMP's calendars with revenue", () => {
    const fh = parsed(parseFinnhubWindow(JSON.stringify({ earningsCalendar: [{ date: '2026-10-14', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 1.1, epsActual: 1.09, revenueEstimate: 27.4e9, revenueActual: 27.9e9, symbol: 'BAC' }] })));
    expect(fh[0]).toMatchObject({ symbol: 'BAC', timing: 'Bef-mkt', label: 'Q3 2026', revEst: 27.4e9, revActual: 27.9e9 });
    expect(parseFinnhubWindow(JSON.stringify({ error: 'You don\'t have access to this resource.' }))).toEqual({ error: "You don't have access to this resource." });
    const fmp = parsed(parseFmpEarnings(JSON.stringify([{ symbol: 'MMM', date: '2026-10-20', epsActual: 2.5, epsEstimated: 2.38, revenueActual: 6.584e9, revenueEstimated: 6.61e9 }, { symbol: 'MMM', date: '2027-01-20', epsActual: null, epsEstimated: 2.1, revenueActual: null, revenueEstimated: 6.4e9 }])));
    expect(fmp[0]).toMatchObject({ symbol: 'MMM', epsEst: 2.38, epsActual: 2.5, revEst: 6.61e9, revActual: 6.584e9 });
    expect(fmp[1].revActual).toBeNaN();
    expect(parseFmpEarnings(JSON.stringify({ 'Error Message': 'Premium Query Parameter' }))).toEqual({ error: 'Premium Query Parameter' });
  });

  it('merges the calendars per report: Nasdaq for EPS, the others for revenue, each figure with its source', () => {
    const nasdaq = parsed(parseNasdaqDay(reportedDay, '2026-10-14', Date.parse('2026-10-21')));
    const finnhub = parsed(parseFinnhubWindow(JSON.stringify({ earningsCalendar: [
      { date: '2026-10-14', hour: 'bmo', quarter: 3, year: 2026, epsEstimate: 1.1, epsActual: 1.09, revenueEstimate: 27.4e9, revenueActual: 27.9e9, symbol: 'BAC' },
      // A company Nasdaq leaves out takes its market value from the stock list.
      { date: '2026-10-15', hour: 'amc', quarter: 3, year: 2026, epsEstimate: 0.5, epsActual: 0.6, revenueEstimate: 1e9, revenueActual: 1.1e9, symbol: 'XYZ' },
    ] })));
    const listings = new Map([['XYZ', { cap: 3e9, name: 'XYZ Holdings', country: 'United States', sector: 'Industrials' }]]);
    const history = parsed(parseNasdaqDay(JSON.stringify({ data: { rows: [
      { eps: '$0.85', time: 'time-pre-market', symbol: 'BAC', name: 'Bank of America', marketCap: '$300,000,000,000', fiscalQuarterEnding: 'Sep/2025', epsForecast: '$0.80', noOfEsts: '7' },
    ] } }), '2025-10-15')).concat(parsed(parseNasdaqDay(JSON.stringify({ data: { rows: [
      { eps: '$0.90', time: 'time-pre-market', symbol: 'BAC', name: 'Bank of America', marketCap: '$300,000,000,000', fiscalQuarterEnding: 'Jun/2026', epsForecast: '$0.86', noOfEsts: '7' },
    ] } }), '2026-07-15')));
    const merged = mergeCalendar({ nasdaq, finnhub, listings, nasdaqHistory: history });
    const bac = merged.find((r) => r.symbol === 'BAC')!;
    expect(bac.eps).toMatchObject({ est: 1.11, actual: 1.08, estFrom: 'Nasdaq', actualFrom: 'Nasdaq', analysts: 7 });
    expect(bac.rev).toMatchObject({ est: 27.4e9, actual: 27.9e9, estFrom: 'Finnhub', actualFrom: 'Finnhub' });
    expect(bac).toMatchObject({ label: 'Q3 2026', timing: 'Bef-mkt', epsYearAgo: 0.85, epsQuarterAgo: 0.9, sources: ['Nasdaq', 'Finnhub'] });
    expect(growthPct(bac.eps.actual, bac.epsYearAgo)).toBeCloseTo(27.06, 1);
    const xyz = merged.find((r) => r.symbol === 'XYZ')!;
    expect(xyz).toMatchObject({ name: 'XYZ Holdings', marketCap: 3e9, timing: 'Aft-mkt', sources: ['Finnhub'] });
    expect(xyz.eps.estFrom).toBe('Finnhub');
    // Growth is not worked out across sources.
    expect(xyz.epsYearAgo).toBeNaN();
    expect(merged.filter((r) => r.symbol === 'BAC')).toHaveLength(1);
  });

  it("compares a coming report's estimate with the year-earlier EPS on its line, and revenue growth within FMP's figures", () => {
    const [meta] = mergeCalendar({ nasdaq: parsed(parseNasdaqDay(comingDay, '2026-10-28')) });
    expect(meta.epsYearAgo).toBe(7.25);
    expect(growthPct(meta.eps.est, meta.epsYearAgo)).toBeCloseTo(-9.8, 1);
    const fmp = parsed(parseFmpEarnings(JSON.stringify([{ symbol: 'MMM', date: '2026-10-20', epsActual: 2.5, epsEstimated: 2.38, revenueActual: 6.584e9, revenueEstimated: 6.61e9 }])));
    const fmpHistory = parsed(parseFmpEarnings(JSON.stringify([{ symbol: 'MMM', date: '2025-10-21', revenueActual: 6.33e9 }, { symbol: 'MMM', date: '2026-07-22', revenueActual: 6.52e9 }])));
    const [mmm] = mergeCalendar({ nasdaq: [], fmp, fmpHistory });
    expect(mmm.rev).toMatchObject({ est: 6.61e9, actual: 6.584e9, estFrom: 'FMP' });
    expect(growthPct(mmm.rev.actual, mmm.revYearAgo)).toBeCloseTo(4.0, 1);
    expect(growthPct(mmm.rev.actual, mmm.revQuarterAgo)).toBeCloseTo(0.98, 1);
    // No growth to or from a loss.
    expect(growthPct(-0.1, 0.2)).toBeNaN();
    expect(growthPct(0.1, -0.2)).toBeNaN();
  });

  it('asks for the days and the year- and quarter-earlier windows around them', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(historyWindows('2026-10-06', '2026-11-03')).toEqual([['2025-09-30', '2025-11-11'], ['2026-06-30', '2026-08-11']]);
    // 52 and 13 weeks before each day up to today first, the latest day's first, then a day further each way, up to a
    // week; nothing for coming days.
    const days = historyDays('2026-10-19', '2026-10-25', '2026-10-20');
    expect(days.slice(0, 4)).toEqual(['2025-10-21', '2025-10-20', '2026-07-21', '2026-07-20']);
    // In a season of five weeks, the latest report's year-earlier day is asked first, not after a month of others.
    expect(historyDays('2026-09-21', '2026-10-27', '2026-10-27')[0]).toBe('2025-10-28');
    expect(new Set(days).size).toBe(days.length);
    expect(days).toContain('2025-10-13');
    expect(historyDays('2026-10-21', '2026-10-30', '2026-10-20')).toEqual([]);
  });

  it('builds only the requests the app makes, for real dates in reach', () => {
    expect(nasdaqMain.nasdaqCalendarRequest('2026-10-20', NOW)).toMatchObject({ url: 'https://api.nasdaq.com/api/calendar/earnings?date=2026-10-20', ttl: 3_600_000 });
    expect(nasdaqMain.nasdaqCalendarRequest('2025-10-21', NOW)!.ttl).toBe(7 * 24 * 3_600_000);
    for (const bad of ['2026-02-30', '2026-10-20&x=1', '20261020', '2030-01-01', '2020-01-01', 7]) expect(nasdaqMain.nasdaqCalendarRequest(bad, NOW), String(bad)).toBeNull();
    expect(nasdaqMain.nasdaqProblem(emptyDay)).toBeNull();
    expect(nasdaqMain.nasdaqProblem(JSON.stringify({ data: null, status: { rCode: 400, bCodeMessage: [{ errorMessage: 'Bad request' }] } }))).toMatch(/refused/);
    expect(nasdaqMain.nasdaqProblem('<html>')).toMatch(/not JSON/);
    expect(finnhubMain.finnhubCalendarRequest('2026-10-06', '2026-11-03', NOW)).toEqual({ url: 'https://finnhub.io/api/v1/calendar/earnings?from=2026-10-06&to=2026-11-03', ttl: 2 * 3_600_000 });
    expect(finnhubMain.finnhubCalendarRequest('2026-01-01', '2026-12-31', NOW)).toBeNull();
    expect(finnhubMain.finnhubCalendarRequest('2026-11-03', '2026-10-06', NOW)).toBeNull();
    expect(fmpMain.fmpCalendarRequest('2025-09-30', '2025-11-11', 'k', NOW)).toEqual({ url: 'https://financialmodelingprep.com/stable/earnings-calendar?from=2025-09-30&to=2025-11-11&apikey=k', ttl: 24 * 3_600_000 });
    // The free plan answers HTTP 402 to a limit above 5 (checked live on 25 October 2026).
    expect(fmpMain.fmpRequest('earnings', 'MMM', 'k')).toEqual({ url: 'https://financialmodelingprep.com/stable/earnings?symbol=MMM&limit=5&apikey=k', ttl: 12 * 3_600_000 });
    for (const kind of Object.keys(fmpMain.KINDS)) {
      const limit = /[?&]limit=(\d+)/.exec(fmpMain.fmpRequest(kind, 'MMM', 'k')!.url)?.[1];
      if (kind === 'earnings') expect(Number(limit), kind).toBeLessThanOrEqual(5);
    }
  });
});

describe("FMP's history fills the revenue estimates of reported quarters", () => {
  const yahoo = (() => {
    const r = parseYahooEarnings(tsm);
    if ('error' in r) throw new Error(r.error);
    return r.data;
  })();

  it('matches its reports by report date and keeps its estimate and reported revenue together', () => {
    const plain = mergeConsensus({ yahoo });
    const q = plain.past[1];
    expect(q.rev.est).toBeNaN();
    const fmpReports = parsed(parseFmpEarnings(JSON.stringify(plain.past.filter((p) => p.date).map((p, i) => ({ symbol: 'TSM', date: new Date(p.date!).toISOString().slice(0, 10), epsActual: p.eps.actual, epsEstimated: p.eps.est, revenueActual: 30e9 + i, revenueEstimated: 29e9 + i })))));
    const filled = mergeConsensus({ yahoo, fmpReports });
    for (const [i, p] of filled.past.filter((x) => x.date).entries()) expect(p.rev, p.label).toMatchObject({ est: 29e9 + i, actual: 30e9 + i, estFrom: 'FMP', actualFrom: 'FMP' });
    // Yahoo's EPS comparison stays where it has both figures.
    expect(filled.past[0].eps.estFrom).toBe('Yahoo Finance');
  });

  it("keeps FMP's revenue estimate, in dollars, away from reported revenue in another currency", () => {
    const plain = mergeConsensus({ yahoo });
    const q = plain.past[1];
    expect(q.rev.ccy).toBe('TWD');
    expect(q.rev.actual).toBeGreaterThan(0);
    const reportDay = new Date(q.date!).toISOString().slice(0, 10);
    // FMP has the EPS reported but not yet the revenue; its estimate is of the same order, so only the currency tells
    // the two apart.
    const fmpReports = parsed(parseFmpEarnings(JSON.stringify([{ symbol: 'TSM', date: reportDay, epsActual: 4.6, epsEstimated: 4.45, revenueActual: null, revenueEstimated: q.rev.actual * 0.98 }])));
    const twd = mergeConsensus({ yahoo, fmpReports }).past[1];
    expect(twd.rev.est).toBeNaN();
    expect(twd.rev).toMatchObject({ actual: q.rev.actual, ccy: 'TWD', actualFrom: 'Yahoo Finance' });
    // Changing the actual's currency label is not proof of the FMP estimate's currency or issuer scope.
    const usd = mergeConsensus({ yahoo: { ...yahoo, revCcy: 'USD' }, fmpReports }).past[1];
    expect(usd.rev.est).toBeNaN();
    expect(usd.rev).toMatchObject({ actual: q.rev.actual, ccy: 'USD', actualFrom: 'Yahoo Finance' });
    const far = parsed(parseFmpEarnings(JSON.stringify([{ symbol: 'TSM', date: reportDay, epsActual: 4.6, epsEstimated: 4.45, revenueEstimated: q.rev.actual / 31 }])));
    expect(mergeConsensus({ yahoo: { ...yahoo, revCcy: 'USD' }, fmpReports: far }).past[1].rev.est).toBeNaN();
  });

  it("gives the coming report FMP's estimates when the others leave them out", () => {
    const base = mergeConsensus({ yahoo: { ...yahoo, next: null, following: null } });
    expect(base.next).toBeNull();
    const fmpReports = parsed(parseFmpEarnings(JSON.stringify([{ symbol: 'TSM', date: '2027-01-15', epsEstimated: 5.2, revenueEstimated: 1.7e12, epsActual: null, revenueActual: null }])));
    const next = mergeConsensus({ yahoo: { ...yahoo, next: null, following: null }, fmpReports }).next!;
    expect(next.eps).toMatchObject({ est: 5.2, estFrom: 'FMP' });
    expect(next.rev).toMatchObject({ est: 1.7e12, estFrom: 'FMP' });
    expect(new Date(next.date!).toISOString().slice(0, 10)).toBe('2027-01-15');
  });
});
