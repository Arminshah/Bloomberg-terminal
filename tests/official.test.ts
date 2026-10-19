import { describe, expect, it } from 'vitest';
import { euroAreaCode, parseAbsCsv, parseBoeColumns, parseBubaCsv, parseJsonStat, parseMofCsv, parseOnsCsv, parseOnsMonths, parseRbaTable, parseSgs, parseSnbCube, parseStatcanVectors, parseValetGroup } from '../src/data/live/official';
import { parseFomcCalendar, parseNyFedLatest } from '../src/data/live/policy';
import { obsToBars, OFFICIAL_LINES, parseSource } from '../src/data/live/govyields';
import { fedPath, meetingMoves } from '../src/data/fedpath';
import { centralBanks, releaseDays } from '../src/data/eco';
import { isoToDay } from '../src/data/calendar';

import fomcHtml from './fixtures/fomc-calendar.html?raw';
import estatHicp from './fixtures/eurostat-hicp.json?raw';
import estatUnemp from './fixtures/eurostat-unemp.json?raw';
import estatGdp from './fixtures/eurostat-gdp.json?raw';
import onsMgsx from './fixtures/ons-mgsx.json?raw';
import statcanJson from './fixtures/statcan-unemp-cpi.json?raw';
import absUnemp from './fixtures/abs-unemp.csv?raw';
import absCpi from './fixtures/abs-cpi.csv?raw';

// Excerpts of what each source returned on 12 Oct 2026.
const BUBA = `\uFEFF"",BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A,BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A_FLAGS,BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R30XX.R.A.A._Z._Z.A,BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R30XX.R.A.A._Z._Z.A_FLAGS
"",Term structure of interest rates on listed Federal securities (method by Svensson) / residual maturity of 10.0 years / daily data,,Term structure of interest rates on listed Federal securities (method by Svensson) / residual maturity of 30.0 years / daily data,
Decimals,2,,2,
last update,2026-10-09 12:07:32,,2026-10-09 12:07:33,
2026-10-08,3.57,,3.99,
2026-10-09,3.53,,3.94,
2026-10-10,.,No value available,.,No value available`;

const GILTS = `DATE,IUDSNPY,IUDMNPY,IUDLNPY
06 Oct 2026,4.8999,5.3368,5.6997
07 Oct 2026,4.9428,5.3852,5.758`;

const MOF = `Interest Rate (October 2026),,,,,,,,,,,,,,,(Unit : %)
Date,1Y,2Y,3Y,4Y,5Y,6Y,7Y,8Y,9Y,10Y,15Y,20Y,25Y,30Y,40Y
2026/10/7,1.665,1.951,2.096,2.298,2.437,2.566,2.695,2.849,2.975,3.111,3.642,3.943,4.186,4.148,4.17
2026/10/8,1.657,1.936,2.084,2.277,2.414,2.54,2.669,2.824,2.954,3.089,3.618,3.916,4.165,4.136,4.134
,,,,,,,,,,,,,,,
"  If you cannot download the latest csv data, please clear the browser's cache and download again.",,,,,,,,,,,,,,,`;

const MOF_OLD = `Date,1Y,2Y,3Y,4Y,5Y,6Y,7Y,8Y,9Y,10Y,15Y,20Y,25Y,30Y,40Y
1974/9/24,10.327,9.362,8.83,8.515,8.348,8.29,8.24,8.121,8.127,-,-,-,-,-,-`;

const VALET = JSON.stringify({
  observations: [
    { d: '2026-10-07', 'BD.CDN.10YR.DQ.YLD': { v: '3.94' }, 'BD.CDN.2YR.DQ.YLD': { v: '3.23' } },
    { d: '2026-10-08', 'BD.CDN.10YR.DQ.YLD': { v: '3.93' }, 'BD.CDN.2YR.DQ.YLD': { v: '3.24' }, 'BD.CDN.LONG.DQ.YLD': {} },
  ],
});

const RBA_F2 = `\uFEFFF2 CAPITAL MARKET YIELDS – GOVERNMENT BONDS
Title,Australian Government 2 year bond,Australian Government 3 year bond,Australian Government 5 year bond,Australian Government 10 year bond,Australian Government Indexed Bond
Frequency,Daily,Daily,Daily,Daily,Daily
Series ID,FCMYGBAG2D,FCMYGBAG3D,FCMYGBAG5D,FCMYGBAG10D,FCMYGBAGID
02-Oct-2026,4.909,4.891,4.960,5.334,2.926
05-Oct-2026
06-Oct-2026,4.931,4.923,5.005,5.394,2.987
07-Oct-2026,4.940,4.933,5.014,5.404,3.002`;

const RBA_F1 = `F1 INTEREST RATES AND YIELDS – MONEY MARKET
Title,Cash Rate Target,Change in the Cash Rate Target,Interbank Overnight Cash Rate
Series ID,FIRMMCRTD,FIRMMCCRT,FIRMMCRID
06-May-2026,4.35,0.25,4.35
29-Sep-2026,4.35,,4.35
30-Sep-2026,4.60,,4.60
09-Oct-2026,4.60,,4.60
12-Oct-2026,,,`;

const SNB = `\uFEFF"CubeId";"snbgwdzid"
"PublishingDate";"2026-10-05 10:00"

"Date";"D0";"Value"
"2026-10-02";"LZ";"0"
"2026-10-02";"SARON";"-0.04"
"2026-10-01";"LZ";"0"`;

const SGS = JSON.stringify([
  { data: '17/09/2026', valor: '13.75' },
  { data: '12/10/2026', valor: '13.75' },
  { data: '04/11/2026', valor: '13.75' },
]);

const NYFED = JSON.stringify({
  refRates: [
    { effectiveDate: '2026-10-09', type: 'SOFRAI', average30day: 3.81569, index: 1.26208139 },
    { effectiveDate: '2026-10-08', type: 'EFFR', percentRate: 3.88, percentPercentile1: 3.85, percentPercentile25: 3.87, percentPercentile75: 3.88, percentPercentile99: 3.89, targetRateFrom: 3.75, targetRateTo: 4.0, volumeInBillions: 117 },
    { effectiveDate: '2026-10-08', type: 'SOFR', percentRate: 3.87, percentPercentile1: 3.83, percentPercentile25: 3.85, percentPercentile75: 3.91, percentPercentile99: 3.95, volumeInBillions: 2963 },
  ],
});

describe('official sources', () => {
  it('reads the Bundesbank yield curve and skips days without a value', () => {
    const m = parseBubaCsv(BUBA);
    expect(m.get('BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A')).toEqual([
      ['2026-10-08', 3.57],
      ['2026-10-09', 3.53],
    ]);
    expect(m.get('BBSIS.D.I.ZST.ZI.EUR.S1311.B.A604.R30XX.R.A.A._Z._Z.A')).toEqual([
      ['2026-10-08', 3.99],
      ['2026-10-09', 3.94],
    ]);
    expect([...m.keys()].some((k) => k.endsWith('_FLAGS'))).toBe(false);
  });

  it('reads Bank of England par yields by series code', () => {
    const m = parseBoeColumns(GILTS);
    expect(m.get('IUDMNPY')).toEqual([
      ['2026-10-06', 5.3368],
      ['2026-10-07', 5.3852],
    ]);
    expect(m.get('IUDLNPY')?.[1]).toEqual(['2026-10-07', 5.758]);
  });

  it('reads the Ministry of Finance JGB file, including old rows with gaps', () => {
    const m = parseMofCsv(MOF);
    expect(m.get('10Y')).toEqual([
      ['2026-10-07', 3.111],
      ['2026-10-08', 3.089],
    ]);
    expect(m.get('30Y')?.[1]).toEqual(['2026-10-08', 4.136]);
    const old = parseMofCsv(MOF_OLD);
    expect(old.get('2Y')).toEqual([['1974-09-24', 9.362]]);
    expect(old.get('10Y')).toBeUndefined();
  });

  it('reads Bank of Canada benchmark yields and RBA tables', () => {
    expect(parseValetGroup(VALET).get('BD.CDN.10YR.DQ.YLD')).toEqual([
      ['2026-10-07', 3.94],
      ['2026-10-08', 3.93],
    ]);
    expect(parseValetGroup(VALET).get('BD.CDN.LONG.DQ.YLD')).toBeUndefined();
    const f2 = parseRbaTable(RBA_F2);
    expect(f2.get('FCMYGBAG10D')).toEqual([
      ['2026-10-02', 5.334],
      ['2026-10-06', 5.394],
      ['2026-10-07', 5.404],
    ]);
    const f1 = parseRbaTable(RBA_F1);
    expect(f1.get('FIRMMCRTD')?.slice(-1)).toEqual([['2026-10-09', 4.6]]);
    expect(f1.get('FIRMMCCRT')).toEqual([['2026-05-06', 0.25]]);
    expect(f1.get('FIRMMCRTD')?.find(([, v]) => v === 4.6)?.[0]).toBe('2026-09-30');
  });

  it('reads the SNB policy rate and the Selic target up to today', () => {
    expect(parseSnbCube(SNB, 'LZ')).toEqual([
      ['2026-10-02', 0],
      ['2026-10-01', 0],
    ]);
    expect(parseSgs(SGS, '2026-10-12')).toEqual([
      ['2026-09-17', 13.75],
      ['2026-10-12', 13.75],
    ]);
  });

  it('reads the New York Fed reference rates with volumes', () => {
    const r = parseNyFedLatest(NYFED);
    expect(r.map((x) => x.type)).toEqual(['EFFR', 'SOFR']);
    expect(r[0]).toMatchObject({ date: '2026-10-08', rate: 3.88, p1: 3.85, p99: 3.89, volume: 117 });
  });

  it('maps every official line to a series its source publishes', () => {
    const texts: Record<string, string> = { bunds: BUBA, gilts: GILTS, jgb: MOF, canadas: VALET, acgb: RBA_F2 };
    for (const id of ['GDBR10 Index', 'GDBR30 Index', 'GUKG10 Index', 'GUKG20 Index', 'GJGB10 Index', 'GCAN10YR Index', 'GACGB10 Index']) {
      const line = OFFICIAL_LINES.find((l) => l.id === id)!;
      expect(parseSource(line.source, texts[line.source]).get(line.key)?.length, id).toBeGreaterThan(0);
    }
    expect(obsToBars([['2026-10-09', 3.53], ['2026-10-08', 3.57]]).map((b) => [b.day, b.c])).toEqual([
      [isoToDay('2026-10-08'), 3.57],
      [isoToDay('2026-10-09'), 3.53],
    ]);
  });
});

describe('FOMC calendar', () => {
  const dates = parseFomcCalendar(fomcHtml);

  it('takes the decision day of each scheduled meeting from the Board page', () => {
    expect(dates.filter((d) => d.startsWith('2027'))).toEqual(['2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08']);
    expect(dates.filter((d) => d.startsWith('2026'))).toEqual(['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09']);
  });

  it('puts meetings that span two months on their second day and skips notation votes', () => {
    expect(dates).toContain('2024-05-01');
    expect(dates.filter((d) => d.startsWith('2025-08'))).toEqual([]);
  });

  it('matches the built-in schedule', () => {
    const builtIn = centralBanks().find((b) => b.code === 'FED')!.meetings;
    expect(builtIn.filter((d) => d >= '2026')).toEqual(dates.filter((d) => d >= '2026'));
  });
});

describe('fed funds futures path', () => {
  // CBOT 30-day fed funds settlements on 12 Oct 2026 (100 - price), EFFR 3.88.
  const prices: [number, number, number][] = [
    [2026, 9, 96.1175], [2026, 10, 96.07], [2026, 11, 95.93], [2027, 0, 95.86], [2027, 1, 95.77], [2027, 2, 95.695],
    [2027, 3, 95.59], [2027, 4, 95.5], [2027, 5, 95.43], [2027, 6, 95.395], [2027, 7, 95.36], [2027, 8, 95.335],
  ];
  const months = prices.map(([year, month, px]) => ({ year, month, avg: 100 - px }));
  const meetings = parseFomcCalendar(fomcHtml);
  const now = Date.UTC(2026, 9, 12, 14);
  const path = fedPath(months, meetings, 3.88, now);

  it('anchors a meeting on the following month when that month has no decision', () => {
    expect(path[0]).toMatchObject({ date: '2026-10-28', start: 3.88 });
    expect(path[0].end).toBeCloseTo(3.93, 6);
  });

  it('splits a decision month into days before and after the decision', () => {
    // December: 9 days at the November rate, 22 at the new one, averaging 4.07.
    const dec = path[1];
    expect(dec.date).toBe('2026-12-09');
    expect((dec.start * 9 + dec.end * 22) / 31).toBeCloseTo(100 - 95.93, 6);
  });

  it('stops where the listed futures end', () => {
    // September 2027 is the last listed month here, and its meeting is mid-month, so it is still covered.
    expect(path.map((p) => p.date)).toEqual(['2026-10-28', '2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15']);
  });

  it('needs a current rate and a calendar', () => {
    expect(fedPath(months, meetings, NaN, now)).toEqual([]);
    expect(fedPath(months, [], 3.88, now)).toEqual([]);
  });

  it('counts WIRP moves cumulatively from today and the probability per meeting', () => {
    const [oct, dec, jan] = path.map((p) => meetingMoves(p.start, p.end, 3.88));
    // October: 3.88 -> 3.93 (November's average), +5 bp = 0.2 moves = 20%, all of it at this meeting.
    expect(oct.cumBp).toBeCloseTo(5, 9);
    expect(oct.cumMoves).toBeCloseTo(0.2, 9);
    expect(oct.cumPct).toBeCloseTo(20, 9);
    expect(oct.stepProb).toBeCloseTo(20, 9);
    // December: after = (4.07 × 31 - 3.93 × 9) / 22 = 4.127273; +24.73 bp from today = 98.91%, +19.73 bp at the meeting = 78.91%.
    expect(dec.cumBp).toBeCloseTo((90.8 / 22 - 3.88) * 100, 9);
    expect(dec.cumPct).toBeCloseTo(98.909091, 5);
    expect(dec.stepProb).toBeCloseTo(78.909091, 5);
    // January: after = February's average 4.23; +35 bp from today = 1.4 moves = 140%, above 100%,
    // while this meeting alone prices 4.23 - 4.127273 = 10.27 bp = 41.09%.
    expect(jan.cumBp).toBeCloseTo(35, 9);
    expect(jan.cumMoves).toBeCloseTo(1.4, 9);
    expect(jan.cumPct).toBeCloseTo(140, 9);
    expect(jan.stepProb).toBeCloseTo(41.090909, 5);
  });

  it('signs cuts negative and caps only the per-meeting probability', () => {
    // From 4.33%: 37.5 bp of cuts at the first meeting, 12.5 bp more at the second.
    const first = meetingMoves(4.33, 3.955, 4.33);
    expect([first.cumBp, first.cumMoves, first.cumPct, first.stepBp, first.stepProb].map((v) => +v.toFixed(9))).toEqual([-37.5, -1.5, -150, -37.5, 100]);
    const second = meetingMoves(3.955, 3.83, 4.33);
    expect([second.cumBp, second.cumPct, second.stepBp, second.stepProb].map((v) => +v.toFixed(9))).toEqual([-50, -200, -12.5, 50]);
  });
});

import { eventDates, expectedPeriod, keyState, parseFredObservations, parseFredReleaseDates, periodLabel, previousPeriod, US_EVENTS, valueAt, type Obs } from '../src/data/live/fred';
import fredMonthly from './fixtures/fred-us-monthly.csv?raw';
import fredMonthly2 from './fixtures/fred-us-monthly2.csv?raw';
import fredQuarterly from './fixtures/fred-us-quarterly.csv?raw';
import fredWeekly from './fixtures/fred-us-weekly.csv?raw';

/** The saved FRED downloads ("observation_date,A,B" then dated rows), one observation list per series. */
function csvSeries(text: string): Record<string, Obs> {
  const rows = text.trim().split(/\r?\n/);
  const head = rows[0].split(',');
  const out: Record<string, Obs> = Object.fromEntries(head.slice(1).map((id) => [id, [] as Obs]));
  for (const row of rows.slice(1)) {
    const cells = row.split(',');
    head.forEach((id, i) => {
      const v = Number(cells[i]);
      if (i > 0 && cells[i] && cells[i] !== '.' && Number.isFinite(v)) out[id].push([cells[0], v]);
    });
  }
  return out;
}

// Excerpts of the example responses in FRED's API documentation (series_observations.html and release_dates.html, read 12 Oct 2026).
const FRED_OBS = `{"realtime_start": "2013-08-14", "realtime_end": "2013-08-14", "observation_start": "1776-07-04", "observation_end": "9999-12-31", "units": "lin", "output_type": 1, "file_type": "json", "order_by": "observation_date", "sort_order": "asc", "count": 84, "offset": 0, "limit": 100000,
 "observations": [{"realtime_start": "2013-08-14", "realtime_end": "2013-08-14", "date": "1929-01-01", "value": "1065.9"}, {"realtime_start": "2013-08-14", "realtime_end": "2013-08-14", "date": "1930-01-01", "value": "975.5"}, {"realtime_start": "2013-08-14", "realtime_end": "2013-08-14", "date": "1931-01-01", "value": "912.1"}]}`;
const FRED_DATES = `{"realtime_start": "1776-07-04", "realtime_end": "9999-12-31", "order_by": "release_date", "sort_order": "asc", "count": 17, "offset": 0, "limit": 10000,
 "release_dates": [{"release_id": 82, "date": "1997-02-10"}, {"release_id": 82, "date": "1998-02-10"}, {"release_id": 82, "date": "1999-02-04"}]}`;

describe('FRED releases', () => {
  const ev = (name: string) => US_EVENTS.find((e) => e.name === name)!;
  const series = { ...csvSeries(fredMonthly), ...csvSeries(fredMonthly2), ...csvSeries(fredQuarterly), ...csvSeries(fredWeekly) };

  it('reads observations and release dates from the API', () => {
    expect(parseFredObservations(FRED_OBS)).toEqual([
      ['1929-01-01', 1065.9],
      ['1930-01-01', 975.5],
      ['1931-01-01', 912.1],
    ]);
    // FRED writes "." for a period without a value (this case is made up for the test).
    expect(parseFredObservations('{"observations": [{"date": "2026-09-01", "value": "."}, {"date": "2026-08-01", "value": "4.3"}]}')).toEqual([['2026-08-01', 4.3]]);
    expect(parseFredObservations('not json')).toEqual([]);
    expect(parseFredReleaseDates(FRED_DATES, 82)).toEqual(['1997-02-10', '1998-02-10', '1999-02-04']);
    expect(parseFredReleaseDates(FRED_DATES, 10)).toEqual([]);
  });

  it('works out which period each release publishes', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(expectedPeriod(ev('CPI MoM'), at('2026-10-14T00:00:00Z'))).toBe('2026-09-01');
    expect(expectedPeriod(ev('Change in Nonfarm Payrolls'), at('2026-10-02T00:00:00Z'))).toBe('2026-09-01');
    expect(expectedPeriod(ev('JOLTS Job Openings'), at('2026-10-06T00:00:00Z'))).toBe('2026-08-01');
    expect(expectedPeriod(ev('GDP Annualized QoQ'), at('2026-10-29T00:00:00Z'))).toBe('2026-07-01');
    expect(expectedPeriod(ev('GDP Annualized QoQ'), at('2026-09-30T00:00:00Z'))).toBe('2026-04-01');
    expect(expectedPeriod(ev('Initial Jobless Claims'), at('2026-10-08T00:00:00Z'))).toBe('2026-10-03');
    // A Wednesday release in Thanksgiving week still covers the week ending the Saturday before.
    expect(expectedPeriod(ev('Initial Jobless Claims'), at('2026-11-25T00:00:00Z'))).toBe('2026-11-21');
    // A report delayed by two weeks still covers the period it was due to cover.
    expect(expectedPeriod(ev('CPI MoM'), at('2026-10-28T00:00:00Z'))).toBe('2026-09-01');
    expect(previousPeriod('2026-01-01', 'm')).toBe('2025-12-01');
    expect(previousPeriod('2026-01-01', 'q', 4)).toBe('2025-01-01');
    expect(periodLabel('2026-07-01', 'q')).toBe('3Q 2026');
  });

  it('computes values from the published series', () => {
    // September payrolls: 159,044k against 159,015k in August.
    expect(valueAt(series.PAYEMS, '2026-09-01', 'diff', 'm')).toBe(29);
    expect(valueAt(series.UNRATE, '2026-09-01', 'level', 'm')).toBe(4.2);
    // August CPI: 334.131 / 332.813.
    expect(valueAt(series.CPIAUCSL, '2026-08-01', 'mom', 'm')).toBeCloseTo((334.131 / 332.813 - 1) * 100, 10);
    expect(valueAt(series.CPIAUCSL, '2026-09-01', 'mom', 'm')).toBeNull();
    expect(valueAt(series.ICSA, '2026-10-03', 'level', 'w', 0.001)).toBe(197);
    expect(valueAt(series.A191RL1Q225SBEA, '2026-04-01', 'level', 'q')).toBe(2.2);
    expect(valueAt(series.BOPGSTB, '2026-08-01', 'level', 'm', 0.001)).toBeCloseTo(-105.572, 6);
  });

  it('splits the two monthly M3 reports by day of the month', () => {
    const dates = ['2026-10-02', '2026-10-27'];
    expect(eventDates(ev('Durable Goods Orders MoM'), dates)).toEqual(['2026-10-27']);
    expect(eventDates(ev('Factory Orders MoM'), dates)).toEqual(['2026-10-02']);
    expect(eventDates(ev('CPI MoM'), dates)).toEqual(dates);
  });

  it('leaves out dates FRED files under a release for other reports', () => {
    // FRED's release dates from April 2026, as the API returned them on 13 October 2026.
    const iso = (s: string) => s.split(' ').map((d) => `2026-${d}`);
    const releases = {
      27: iso('04-29 05-05 05-21 05-28 06-16 06-24 07-17 07-24 08-18 08-25 09-17 09-24 10-20 10-27 11-18 11-25 12-17 12-23'),
      97: iso('05-05 05-28 06-24 07-24 08-25 09-24 10-27 11-25 12-23'),
      9: iso('04-01 04-21 05-14 06-17 07-16 08-14 09-16 09-28 10-15 11-17 12-16'),
    };
    // Housing Starts: the New Residential Sales dates are not Housing Starts releases (Census publishes starts once a month).
    expect(releaseDays(ev('Housing Starts'), releases)).toEqual(iso('04-29 05-21 06-16 07-17 08-18 09-17 10-20 11-18 12-17'));
    expect(releaseDays(ev('New Home Sales'), releases)).toEqual(releases[97]);
    // Retail Sales: 28 September was the annual revision, not a second August report.
    expect(releaseDays(ev('Retail Sales Advance MoM'), releases)).not.toContain('2026-09-28');
    expect(releaseDays(ev('Retail Sales Advance MoM'), releases)).toContain('2026-10-15');
  });

  it('keeps track of whether FRED has a key it accepts', () => {
    const fine = { needsKey: false, keyRefused: '' };
    expect(keyState(fine, { stop: 'missing' })).toEqual({ needsKey: true, keyRefused: '' });
    const refused = keyState(fine, { stop: 'refused', why: 'Bad Request. The value for variable api_key is not registered.' });
    expect(refused).toEqual({ needsKey: false, keyRefused: 'Bad Request. The value for variable api_key is not registered.' });
    // Throttling says nothing about the key; a pass that gets through clears both flags.
    expect(keyState(refused, { stop: 'throttled' })).toEqual(refused);
    expect(keyState(refused, null)).toEqual(fine);
  });
});

// ONS GDP growth on a year earlier (IHYR), as published on 30 Sep 2026.
const ONS_IHYR = `"Title","Gross Domestic Product: q-on-q4 growth rate CVM SA %"
"CDID","IHYR"
"Source dataset ID","QNA"
"PreUnit",""
"Unit","%"
"Release date","30-09-2026"
"Next release","12 November 2026"
"Important notes",
"2025 Q4","0.8"
"2026 Q1","0.8"
"2026 Q2","1.4"`;

describe('statistics offices', () => {
  it('reads Eurostat annual inflation by country with its flash-estimate flags', () => {
    const flags = new Map<string, string>();
    const m = parseJsonStat(estatHicp, flags);
    expect(m.get('EA')).toEqual([['2026-07-01', 2.9], ['2026-08-01', 3.2], ['2026-09-01', 3.8]]);
    expect(m.get('EA21')?.[0]).toEqual(['2026-07-01', 3.0]);
    expect(m.get('DE')?.[2]).toEqual(['2026-09-01', 3.3]);
    expect(flags.get('EA|2026-09-01')).toBe('e');
    expect(flags.get('EA|2026-08-01')).toBeUndefined();
    // Eurostat's euro area headline (2.9% in July) is the EA series, not the fixed EA21 one.
    expect(euroAreaCode(m)).toBe('EA');
  });

  it('leaves out months Eurostat has not published and falls back to the largest euro area aggregate', () => {
    const m = parseJsonStat(estatUnemp);
    expect(m.get('EA21')).toEqual([['2026-06-01', 6.4], ['2026-07-01', 6.4], ['2026-08-01', 6.4]]);
    expect(m.get('FR')?.at(-1)).toEqual(['2026-08-01', 8.2]);
    expect(euroAreaCode(m)).toBe('EA21');
  });

  it('dates Eurostat quarters by their first month and keeps provisional flags', () => {
    const flags = new Map<string, string>();
    const m = parseJsonStat(estatGdp, flags);
    expect(m.get('EA')?.at(-1)).toEqual(['2026-04-01', 1.2]);
    expect(m.get('ES')?.at(-1)).toEqual(['2026-04-01', 2.6]);
    expect(flags.get('ES|2026-04-01')).toBe('p');
    expect(flags.get('FR|2026-04-01')).toBeUndefined();
    expect(parseJsonStat('not json').size).toBe(0);
  });

  it('reads ONS quarterly rows and skips them when months are asked for', () => {
    expect(parseOnsCsv(ONS_IHYR, 'q')).toEqual([['2025-10-01', 0.8], ['2026-01-01', 0.8], ['2026-04-01', 1.4]]);
    expect(parseOnsCsv(ONS_IHYR)).toEqual([]);
  });

  it('dates each Labour Force Survey average by the last month it covers', () => {
    const { obs, labels } = parseOnsMonths(onsMgsx);
    // The ONS dates May-Jul 2026 as "2026 JUN".
    expect(obs.at(-1)).toEqual(['2026-07-01', 4.9]);
    expect(labels.get('2026-07-01')).toBe('May-Jul 2026');
    // Windows across a year end: "2024 NOV-JAN" and "2024 DEC-FEB".
    expect(obs[0]).toEqual(['2025-01-01', 4.4]);
    expect(labels.get('2025-01-01')).toBe('Nov 2024-Jan 2025');
    expect(labels.get('2025-02-01')).toBe('Dec 2024-Feb 2025');
    expect(obs.map(([d]) => d)).toEqual(['2025-01-01', '2025-02-01', '2026-05-01', '2026-06-01', '2026-07-01']);
  });
});

describe('national statistics offices for Canada and Australia', () => {
  // Statistics Canada's Web Data Service and the ABS Data API, as they answered on 13 October 2026.
  it('reads the Canadian unemployment rate and CPI, newest month last', () => {
    const v = parseStatcanVectors(statcanJson);
    const un = v.get(2062815)!;
    // September's Labour Force Survey, released 9 October: 6.5%.
    expect(un[un.length - 1]).toEqual(['2026-09-01', 6.5]);
    const cpi = v.get(41690973)!;
    expect(cpi[cpi.length - 1]).toEqual(['2026-08-01', 169.8]);
    // The 12-month change as StatCan works it out from the published index: 3.0% in August.
    expect(valueAt(cpi, '2026-08-01', 'yoy', 'm')).toBeCloseTo((169.8 / 164.8 - 1) * 100, 6);
    expect(parseStatcanVectors('not json').size).toBe(0);
  });

  it('reads the ABS unemployment rate and the monthly CPI annual change, in date order', () => {
    const un = parseAbsCsv(absUnemp);
    expect(un[un.length - 1][0]).toBe('2026-08-01');
    // August's Labour Force release: "The seasonally adjusted unemployment rate rose to 4.6 per cent".
    expect(un[un.length - 1][1]).toBeCloseTo(4.646, 2);
    const cpi = parseAbsCsv(absCpi);
    expect(cpi.map((x) => x[0])).toEqual([...cpi.map((x) => x[0])].sort());
    // "CPI rose 4.0% in the year to August 2026".
    expect(cpi.find((x) => x[0] === '2026-08-01')?.[1]).toBe(4);
    expect(parseAbsCsv('nothing,here')).toEqual([]);
  });
});
