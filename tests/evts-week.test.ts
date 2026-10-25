import { describe, expect, it } from 'vitest';
import { latestSession, US_MARKET } from '../src/data/exchanges';
import { companyName, mergeCalendar, parseNasdaqDay, parseNasdaqListings, type CalendarReport, type CalendarTiming } from '../src/data/live/earnings-calendar';
import { byRelevance, PER_OTHER, PER_SLOT, topReleases, weekStart } from '../src/functions/EVTSWeek';

const at = (iso: string) => Date.parse(iso);
const parsed = <T,>(r: { data: T } | { error: string }): T => {
  if ('error' in r) throw new Error(r.error);
  return r.data;
};
const NONE = { est: NaN, actual: NaN };
const report = (symbol: string, name: string, date: string, timing: CalendarTiming, traded: number, marketCap = NaN): CalendarReport => ({
  symbol, name, date, timing, traded, marketCap, fiscalEnd: '2026-09', eps: { ...NONE }, rev: { ...NONE }, epsYearAgo: NaN, epsQuarterAgo: NaN, revYearAgo: NaN, revQuarterAgo: NaN, sources: ['Nasdaq'],
});

describe('the latest trading day', () => {
  it('is Friday at the weekend, and the trading day before until the market opens', () => {
    expect(latestSession(US_MARKET, at('2026-10-24T15:00:00Z'))).toBe('2026-10-23'); // Saturday
    expect(latestSession(US_MARKET, at('2026-10-25T23:00:00Z'))).toBe('2026-10-23'); // Sunday evening
    expect(latestSession(US_MARKET, at('2026-10-26T13:29:00Z'))).toBe('2026-10-23'); // Monday 09:29 New York
    expect(latestSession(US_MARKET, at('2026-10-26T13:30:00Z'))).toBe('2026-10-26'); // Monday 09:30, the open
    expect(latestSession(US_MARKET, at('2026-10-27T21:00:00Z'))).toBe('2026-10-27'); // Tuesday after the close
  });

  it("counts New York's date, not London's", () => {
    // 23:30 on Tuesday in New York is Wednesday in UTC; Wednesday's session has not opened.
    expect(latestSession(US_MARKET, at('2026-10-28T03:30:00Z'))).toBe('2026-10-27');
  });

  it('skips holidays but not early closes', () => {
    expect(latestSession(US_MARKET, at('2026-11-26T18:00:00Z'))).toBe('2026-11-25'); // Thanksgiving
    expect(latestSession(US_MARKET, at('2026-11-27T15:00:00Z'))).toBe('2026-11-27'); // the day after, closing at 13:00
  });
});

describe('the week EVTS opens on', () => {
  it('is this week on a weekday and the coming one at the weekend', () => {
    expect(weekStart(at('2026-10-24T15:00:00Z'))).toBe('2026-10-26'); // Saturday
    expect(weekStart(at('2026-10-25T15:00:00Z'))).toBe('2026-10-26'); // Sunday
    expect(weekStart(at('2026-10-26T15:00:00Z'))).toBe('2026-10-26'); // Monday
    expect(weekStart(at('2026-10-28T15:00:00Z'))).toBe('2026-10-26'); // Wednesday
    expect(weekStart(at('2026-10-30T22:00:00Z'))).toBe('2026-10-26'); // Friday evening in New York
    expect(weekStart(at('2026-10-28T15:00:00Z'), -1)).toBe('2026-10-19');
    expect(weekStart(at('2026-10-28T15:00:00Z'), 1)).toBe('2026-11-02');
  });
});

describe('the most relevant releases', () => {
  it('reads the last price and shares traded from Nasdaq\'s stock list, and works out the dollars traded', () => {
    // Rows as Nasdaq's stock list answered on 25 October 2026.
    const listings = parsed(parseNasdaqListings(JSON.stringify({ data: { asOf: null, rows: [
      { symbol: 'HOOD', name: 'Robinhood Markets, Inc. Class A Common Stock', lastsale: '$96.58', volume: '19174495', marketCap: '86833365926.00', country: 'United States', sector: 'Finance' },
      { symbol: 'BFST', name: 'Business First Bancshares, Inc. Common Stock', lastsale: '$31.94', volume: '176841', marketCap: '1039643263.00', country: 'United States', sector: 'Finance' },
      { symbol: 'NOVOL', name: 'No Trading Inc.', lastsale: '$5.00', volume: '', marketCap: '1000000.00', country: 'United States', sector: 'Finance' },
    ] } })));
    expect(listings.get('HOOD')).toMatchObject({ name: 'Robinhood Markets, Inc.', price: 96.58, volume: 19174495 });
    const day = parsed(parseNasdaqDay(JSON.stringify({ data: { rows: [
      { time: 'time-after-hours', symbol: 'HOOD', name: 'Robinhood Markets, Inc.', marketCap: '$86,833,365,926', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$0.62', noOfEsts: '9' },
      { time: 'time-pre-market', symbol: 'BFST', name: 'Business First Bancshares, Inc.', marketCap: '$1,039,643,263', fiscalQuarterEnding: 'Sep/2026', epsForecast: '$0.72', noOfEsts: '3' },
      { time: 'time-pre-market', symbol: 'NOVOL', name: 'No Trading Inc.', marketCap: '$1,000,000', fiscalQuarterEnding: 'Sep/2026', epsForecast: '', noOfEsts: 'N/A' },
    ] } }), '2026-10-27', at('2026-10-25T12:00:00Z')));
    const merged = mergeCalendar({ nasdaq: day, listings });
    expect(merged.find((r) => r.symbol === 'HOOD')!.traded).toBeCloseTo(96.58 * 19174495, 0);
    expect(merged.find((r) => r.symbol === 'BFST')!.traded).toBeCloseTo(31.94 * 176841, 0);
    expect(merged.find((r) => r.symbol === 'NOVOL')!.traded).toBeNaN();
    // Without the stock list there is no trading figure.
    expect(mergeCalendar({ nasdaq: day })[0].traded).toBeNaN();
  });

  it('puts the most traded first in each day and session, share classes once, the rest counted', () => {
    const tue = '2026-10-27';
    const reports = [
      report('BFST', 'Business First Bancshares, Inc.', tue, 'Bef-mkt', 5.6e6, 1.0e9),
      report('KO', 'Coca-Cola Company (The)', tue, 'Bef-mkt', 1.2e9, 300e9),
      report('SOFI', 'SoFi Technologies, Inc.', tue, 'Bef-mkt', 0.61e9, 19e9),
      report('HOOD', 'Robinhood Markets, Inc.', tue, 'Aft-mkt', 1.85e9, 87e9),
      report('GOOGL', 'Alphabet Inc.', '2026-10-28', 'Aft-mkt', 9e9, 3.9e12),
      report('GOOG', 'Alphabet Inc.', '2026-10-28', 'Aft-mkt', 6e9, 3.9e12),
      report('NOTIME', 'Untimed Corp', tue, '--', 1e8, 5e9),
      report('MIDDAY', 'Midday Corp', tue, 'During-mkt', 2e8, 5e9),
      // Not in the stock list: after those with trading figures, by market value.
      report('OTCX', 'Over The Counter Co', tue, 'Bef-mkt', NaN, 900e9),
      report('OLD', 'Last Week Inc.', '2026-10-23', 'Bef-mkt', 9e9, 1e12),
    ];
    const week = topReleases(reports, '2026-10-26');
    expect(week.map((d) => d.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
    const t = week[1];
    expect(t.pre.reports.map((r) => r.symbol)).toEqual(['KO', 'SOFI', 'BFST', 'OTCX']);
    expect(t.post.reports.map((r) => r.symbol)).toEqual(['HOOD']);
    expect(t.other.reports.map((r) => r.symbol)).toEqual(['MIDDAY', 'NOTIME']);
    expect(t.total).toBe(7);
    // GOOG and GOOGL are one company: the more traded class stands for it.
    expect(week[2].post.reports.map((r) => r.symbol)).toEqual(['GOOGL']);
    expect(week[2].total).toBe(1);
    expect(week[0].total).toBe(0);
    // A busy session shows the first ten and counts the others.
    const busy = Array.from({ length: PER_SLOT + 3 }, (_, i) => report(`C${i}`, `Company ${i}`, tue, 'Aft-mkt', 1e6 * (i + 1)));
    const slot = topReleases(busy, '2026-10-26')[1].post;
    expect(slot.reports).toHaveLength(PER_SLOT);
    expect(slot.reports[0].symbol).toBe(`C${PER_SLOT + 2}`);
    expect(slot.more).toBe(3);
    expect([...busy].sort(byRelevance)[0].symbol).toBe(`C${PER_SLOT + 2}`);
    // Fewer at other times (during the session, or no time given).
    const untimed = busy.map((r) => ({ ...r, timing: '--' as const }));
    const other = topReleases(untimed, '2026-10-26')[1].other;
    expect(other.reports).toHaveLength(PER_OTHER);
    expect(other.more).toBe(PER_SLOT + 3 - PER_OTHER);
  });

  it("names a company without the share description Nasdaq's stock list adds", () => {
    // Names as the stock list gave them on 25 October 2026.
    expect(companyName('FuboTV Inc. Class A Common Stock')).toBe('FuboTV Inc.');
    expect(companyName('Ionis Pharmaceuticals Inc. Common Stock')).toBe('Ionis Pharmaceuticals Inc.');
    expect(companyName('Energy Fuels Inc Ordinary Shares (Canada)')).toBe('Energy Fuels Inc');
    expect(companyName('Verizon Communications Inc.')).toBe('Verizon Communications Inc.');
    expect(companyName(' Common Stock ')).toBe('Common Stock');
  });

  it('marks a day the market is closed', () => {
    const week = topReleases([], '2026-11-23');
    expect(week[3]).toMatchObject({ date: '2026-11-26', holiday: 'Thanksgiving Day' });
    // An early close is a trading day.
    expect(week[4].holiday).toBeUndefined();
  });
});
