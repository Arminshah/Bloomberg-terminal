// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { blsReleaseTimes, parseBlsSchedule } from './bls-schedule';
import { fmtMonthDayNum } from '../../core/format';
import { createStore } from '../../core/store';
import { setFeed } from './status';
import { registerRefresh } from '../../terminal/refresh';
import { euroAreaCode, officialAnswer, parseAbsCsv, parseClevelandNowcast, parseJsonStat, parseOnsCsv, parseOnsMonths, parseStatcanVectors, type OfficialAnswer } from './official';
import { datasetHealth, type DatasetHealth } from './provenance';
import type { KeyedAnswer } from './lookup';
import { FIRST_RELEASE_IDS, MACRO_SERIES } from '../macroseries';

/**
 * US economic releases and international statistics for the desktop app from
 * the FRED API (Federal Reserve Bank of St. Louis), which needs the user's own
 * free key: the scheduled release dates of each release, and the published
 * values of each series. FRED republishes the agencies' figures (BLS, BEA,
 * Census, the Fed, the OECD) and gives release dates without times of day.
 * Consensus forecasts are not public, so there is no survey.
 */

export type Obs = [string, number][];

export interface FredState {
  /** Series id -> observations in date order. */
  series: Record<string, Obs>;
  /** Release id -> scheduled release dates (ISO), in order. */
  releases: Record<number, string[]>;
  loaded: boolean;
  /** True when the FRED API key is not configured, so nothing from FRED loads. */
  needsKey: boolean;
  /** FRED's reason for refusing the configured key, '' when it has not refused it. */
  keyRefused: string;
  /** Series id -> first published values (ALFRED): [period, value, day first published]. */
  firstRelease: Record<string, FirstRelease[]>;
  /** When the series values were last received (epoch ms). */
  at: number;
  /** Confirmation and failed attempts for each series/release; a retained value does not renew its check. */
  health: Record<string, DatasetHealth>;
  /** Release id -> day -> the time in New York the BLS's release schedule gives ("08:30"), for the BLS's releases. */
  releaseTimes?: Record<number, Record<string, string>>;
}

export type FirstRelease = [date: string, value: number, published: string];

export const fredData = createStore<FredState>({ series: {}, releases: {}, loaded: false, needsKey: false, keyRefused: '', firstRelease: {}, at: 0, health: {} });

export type Calc = 'level' | 'diff' | 'mom' | 'yoy';
export type Freq = 'm' | 'q' | 'w';

export interface FredEvent {
  rid: number;
  name: string;
  series: string;
  calc: Calc;
  freq: Freq;
  /** Earliest the source publishes a period: days after the period ends (see expectedPeriod). */
  minDelay: number;
  unit: string;
  dec: number;
  /** Multiplier from the series' units to the shown ones (claims in people to thousands, say). */
  scale?: number;
  rel: number;
  kind: 'activity' | 'inflation' | 'rate' | 'other';
  /** For a release with two reports a month: true for the one late in the month, false for the one early in the month. */
  early?: boolean;
}

/** The US releases shown in ECO, by FRED release id. */
export const US_EVENTS: FredEvent[] = [
  { rid: 50, name: 'Change in Nonfarm Payrolls', series: 'PAYEMS', calc: 'diff', freq: 'm', minDelay: 1, unit: 'k', dec: 0, rel: 3, kind: 'activity' },
  { rid: 50, name: 'Unemployment Rate', series: 'UNRATE', calc: 'level', freq: 'm', minDelay: 1, unit: '%', dec: 1, rel: 3, kind: 'other' },
  { rid: 10, name: 'CPI MoM', series: 'CPIAUCSL', calc: 'mom', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 10, name: 'CPI YoY', series: 'CPIAUCNS', calc: 'yoy', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 10, name: 'CPI Ex Food and Energy MoM', series: 'CPILFESL', calc: 'mom', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 10, name: 'CPI Ex Food and Energy YoY', series: 'CPILFENS', calc: 'yoy', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 46, name: 'PPI Final Demand MoM', series: 'PPIFIS', calc: 'mom', freq: 'm', minDelay: 8, unit: '%', dec: 1, rel: 2, kind: 'inflation' },
  { rid: 9, name: 'Retail Sales Advance MoM', series: 'RSAFS', calc: 'mom', freq: 'm', minDelay: 10, unit: '%', dec: 1, rel: 3, kind: 'activity' },
  { rid: 13, name: 'Industrial Production MoM', series: 'INDPRO', calc: 'mom', freq: 'm', minDelay: 10, unit: '%', dec: 1, rel: 2, kind: 'activity' },
  { rid: 27, name: 'Housing Starts', series: 'HOUST', calc: 'level', freq: 'm', minDelay: 12, unit: 'k', dec: 0, rel: 2, kind: 'activity' },
  { rid: 97, name: 'New Home Sales', series: 'HSN1F', calc: 'level', freq: 'm', minDelay: 18, unit: 'k', dec: 0, rel: 2, kind: 'activity' },
  { rid: 95, name: 'Durable Goods Orders MoM', series: 'DGORDER', calc: 'mom', freq: 'm', minDelay: 20, unit: '%', dec: 1, rel: 2, kind: 'activity', early: true },
  { rid: 95, name: 'Factory Orders MoM', series: 'AMTMNO', calc: 'mom', freq: 'm', minDelay: 28, unit: '%', dec: 1, rel: 1, kind: 'activity', early: false },
  { rid: 53, name: 'GDP Annualized QoQ', series: 'A191RL1Q225SBEA', calc: 'level', freq: 'q', minDelay: 20, unit: '%', dec: 1, rel: 3, kind: 'activity' },
  // One decimal, as BEA publishes them. BEA works from unrounded data, so in a rare month the last digit
  // worked out from the published index can differ from BEA's.
  { rid: 54, name: 'PCE Core Deflator MoM', series: 'PCEPILFE', calc: 'mom', freq: 'm', minDelay: 20, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 54, name: 'PCE Core Deflator YoY', series: 'PCEPILFE', calc: 'yoy', freq: 'm', minDelay: 20, unit: '%', dec: 1, rel: 3, kind: 'inflation' },
  { rid: 54, name: 'PCE Deflator YoY', series: 'PCEPI', calc: 'yoy', freq: 'm', minDelay: 20, unit: '%', dec: 1, rel: 2, kind: 'inflation' },
  { rid: 180, name: 'Initial Jobless Claims', series: 'ICSA', calc: 'level', freq: 'w', minDelay: 4, unit: 'k', dec: 0, scale: 0.001, rel: 2, kind: 'other' },
  { rid: 192, name: 'JOLTS Job Openings', series: 'JTSJOL', calc: 'level', freq: 'm', minDelay: 28, unit: 'k', dec: 0, rel: 2, kind: 'activity' },
  { rid: 51, name: 'Trade Balance', series: 'BOPGSTB', calc: 'level', freq: 'm', minDelay: 28, unit: 'bn', dec: 1, scale: 0.001, rel: 2, kind: 'other' },
];

/**
 * Country statistics for ECST: [series, frequency, calculation], the calculation defaulting to the
 * year-on-year change for GDP and prices. Wherever a statistics office publishes the headline rate
 * itself, that published rate is used: BEA's real GDP growth on a year earlier, Eurostat's HICP
 * annual rate, GDP growth and unemployment, and the ONS's CPI, GDP growth and unemployment.
 * Canada's unemployment and inflation come from Statistics Canada and Australia's from the ABS.
 * Japan, Canada and Australia have no published growth rate here: it is worked out from real GDP
 * levels (Japan's Cabinet Office; the IMF's International Financial Statistics for Canada and
 * Australia), via FRED. Japan's unemployment is the OECD harmonised rate on FRED.
 */
export const COUNTRY_STATS: Record<string, { gdp?: [string, Freq, Calc?]; cpi?: [string, Freq, Calc?]; un?: [string, Freq] }> = {
  US: { gdp: ['A191RO1Q156NBEA', 'q', 'level'], cpi: ['CPIAUCNS', 'm'], un: ['UNRATE', 'm'] },
  EZ: { gdp: ['ESTAT:GDP:EA', 'q', 'level'], cpi: ['ESTAT:HICP:EA', 'm', 'level'], un: ['ESTAT:UN:EA', 'm'] },
  DE: { gdp: ['ESTAT:GDP:DE', 'q', 'level'], cpi: ['ESTAT:HICP:DE', 'm', 'level'], un: ['ESTAT:UN:DE', 'm'] },
  FR: { gdp: ['ESTAT:GDP:FR', 'q', 'level'], cpi: ['ESTAT:HICP:FR', 'm', 'level'], un: ['ESTAT:UN:FR', 'm'] },
  IT: { gdp: ['ESTAT:GDP:IT', 'q', 'level'], cpi: ['ESTAT:HICP:IT', 'm', 'level'], un: ['ESTAT:UN:IT', 'm'] },
  ES: { gdp: ['ESTAT:GDP:ES', 'q', 'level'], cpi: ['ESTAT:HICP:ES', 'm', 'level'], un: ['ESTAT:UN:ES', 'm'] },
  NL: { gdp: ['ESTAT:GDP:NL', 'q', 'level'], cpi: ['ESTAT:HICP:NL', 'm', 'level'], un: ['ESTAT:UN:NL', 'm'] },
  BE: { gdp: ['ESTAT:GDP:BE', 'q', 'level'], cpi: ['ESTAT:HICP:BE', 'm', 'level'], un: ['ESTAT:UN:BE', 'm'] },
  GB: { gdp: ['ONS:IHYR', 'q', 'level'], cpi: ['ONS:D7G7', 'm', 'level'], un: ['ONS:MGSX', 'm'] },
  JP: { gdp: ['JPNRGDPEXP', 'q'], un: ['LRHUTTTTJPM156S', 'm'] },
  CA: { gdp: ['NGDPRSAXDCCAQ', 'q'], cpi: ['STATCAN:CPI', 'm'], un: ['STATCAN:UN', 'm'] },
  AU: { gdp: ['NGDPRSAXDCAUQ', 'q'], cpi: ['ABS:CPI', 'm', 'level'], un: ['ABS:UN', 'm'] },
};

/** Euro area members ECST lists with Eurostat's figures: the geo codes the desktop app asks Eurostat for besides the euro area's. */
export const EUROSTAT_MEMBERS = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE'];

/** Countries whose growth figure is worked out here rather than published as a rate. */
export const COMPUTED_GROWTH = new Set(['JP', 'CA', 'AU']);

// ------------------------------------------------------------------ parsing

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * fred/series/observations JSON: {observations: [{date: "2026-08-01", value: "334.131"}]}.
 * Values are strings; "." marks a period without a value and is left out.
 */
export function parseFredObservations(text: string): Obs {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out: Obs = [];
  for (const o of (Array.isArray(json?.observations) ? json.observations : []) as any[]) {
    const d = String(o?.date ?? '');
    const c = String(o?.value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^-?\d*\.?\d+$/.test(c)) continue;
    out.push([d, Number(c)]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * fred/series/observations with output_type=4 ("Observations, Initial Release Only") over every vintage:
 * each observation's realtime_start is the day its value was first published.
 */
export function parseFredFirstRelease(text: string): FirstRelease[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out: FirstRelease[] = [];
  for (const o of (Array.isArray(json?.observations) ? json.observations : []) as any[]) {
    const d = String(o?.date ?? '');
    const r = String(o?.realtime_start ?? '');
    const c = String(o?.value ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(r) || !/^-?\d*\.?\d+$/.test(c)) continue;
    out.push([d, Number(c), r]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/** fred/release/dates JSON: {release_dates: [{release_id: 10, date: "2026-10-14"}]}. The release's dates, in order. */
export function parseFredReleaseDates(text: string, rid: number): string[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out = new Set<string>();
  for (const r of (Array.isArray(json?.release_dates) ? json.release_dates : []) as any[]) {
    const d = String(r?.date ?? '');
    if (Number(r?.release_id) === rid && /^\d{4}-\d{2}-\d{2}$/.test(d)) out.add(d);
  }
  return [...out].sort();
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------- calculations

const iso = (y: number, m0: number, d = 1) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);

/**
 * The period a release publishes: the latest one that has ended at least
 * `minDelay` days before the release (for weekly claims, the latest week
 * ending on a Saturday at least four days before). Delays do not shift it:
 * a late report still covers the period the agency was due to publish.
 */
export function expectedPeriod(ev: Pick<FredEvent, 'freq' | 'minDelay'>, release: number): string {
  const day = Math.floor(release / 86_400_000) * 86_400_000;
  if (ev.freq === 'w') {
    let t = day - ev.minDelay * 86_400_000;
    while (new Date(t).getUTCDay() !== 6) t -= 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
  }
  const step = ev.freq === 'q' ? 3 : 1;
  const d = new Date(day);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() - (d.getUTCMonth() % step);
  for (let k = 0; k < 24; k++) {
    const end = Date.UTC(y, m + step, 0);
    if (end + ev.minDelay * 86_400_000 <= day) return iso(y, m);
    m -= step;
    if (m < 0) {
      m += 12;
      y--;
    }
  }
  return iso(y, m);
}

/** The period before `p` (a month, quarter or week earlier). */
export function previousPeriod(p: string, freq: Freq, steps = 1): string {
  const [y, m, d] = p.split('-').map(Number);
  if (freq === 'w') return new Date(Date.UTC(y, m - 1, d) - 7 * steps * 86_400_000).toISOString().slice(0, 10);
  return iso(y, m - 1 - (freq === 'q' ? 3 : 1) * steps);
}

/** A series value transformed for display at period `p`, or null when the source has not published it. */
export function valueAt(obs: Obs | undefined, p: string, calc: Calc, freq: Freq, scale = 1): number | null {
  if (!obs?.length) return null;
  const at = (q: string) => obs.find(([d]) => d === q)?.[1];
  const v = at(p);
  if (v == null) return null;
  switch (calc) {
    case 'level':
      return v * scale;
    case 'diff': {
      const prev = at(previousPeriod(p, freq));
      return prev == null ? null : (v - prev) * scale;
    }
    case 'mom': {
      const prev = at(previousPeriod(p, freq));
      return prev == null || prev === 0 ? null : (v / prev - 1) * 100;
    }
    case 'yoy': {
      const prev = at(previousPeriod(p, freq, freq === 'q' ? 4 : freq === 'w' ? 52 : 12));
      return prev == null || prev === 0 ? null : (v / prev - 1) * 100;
    }
  }
}

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 2026", "2Q 2026" or "Wk 03/10" (week ending 3 October, in the display date order). */
export function periodLabel(p: string, freq: Freq): string {
  const [y, m, d] = p.split('-').map(Number);
  if (freq === 'q') return `${Math.floor((m - 1) / 3) + 1}Q ${y}`;
  if (freq === 'w') return `Wk ${fmtMonthDayNum(m, d)}`;
  return `${SHORT[m - 1]} ${y}`;
}

/**
 * Releases of one event: which of a release id's dates belong to it. The Census
 * M3 survey has two reports a month under one release: the advance report on
 * durable goods late in the month and the full report early in the next, so
 * the day of the month tells them apart.
 */
export function eventDates(ev: FredEvent, dates: string[]): string[] {
  if (ev.early == null) return dates;
  return dates.filter((d) => Number(d.slice(8, 10)) >= 15 === ev.early);
}

// ------------------------------------------------------------------ loading

export function fredAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.fred === 'function';
}

/** Why a pass over FRED stops early: no key, a key FRED refused, or FRED throttling requests. */
interface Stop {
  stop: 'missing' | 'refused' | 'throttled';
  why?: string;
}

type FredAnswer = KeyedAnswer & { attemptedAt: number; receivedAt: number };
const validFredAnswer = (answer: FredAnswer) => answer.status === 200 && !answer.stale && !answer.error;

/** Keep transport provenance even when a source returns an older usable response. */
async function get(kind: 'release-dates' | 'observations' | 'first-release', arg: string, from?: string): Promise<FredAnswer | Stop> {
  const attemptedAt = Date.now();
  try {
    const res: KeyedAnswer = await window.arminDesktop!.fred!(kind, arg, from);
    if (res.missing) return { stop: 'missing' };
    if (res.refused) return { stop: 'refused', why: res.refused };
    if (res.throttled) return { stop: 'throttled' };
    return { ...res, attemptedAt, receivedAt: Date.now() };
  } catch (err) {
    return { status: 0, text: '', attemptedAt, receivedAt: Date.now(), error: err instanceof Error ? err.message : 'FRED could not be reached.' };
  }
}

function fredHealth(previous: DatasetHealth | undefined, answer: FredAnswer, valid: boolean, source: string, sourceDate?: string): DatasetHealth {
  return datasetHealth(previous, { at: answer.attemptedAt, ok: valid && validFredAnswer(answer), checkedAt: answer.receivedAt, receivedAt: answer.at ?? answer.receivedAt, cached: answer.cached, stale: answer.stale, source, sourceDate, error: answer.error ?? (valid && validFredAnswer(answer) ? undefined : answer.status !== 200 ? `HTTP ${answer.status}` : 'The source did not return valid observations.') });
}

/** The key flags after a pass: a missing or refused key sets them, a pass that got through clears them, throttling leaves them. */
export function keyState(s: Pick<FredState, 'needsKey' | 'keyRefused'>, stop: Stop | null): Pick<FredState, 'needsKey' | 'keyRefused'> {
  if (!stop) return { needsKey: false, keyRefused: '' };
  if (stop.stop === 'missing') return { needsKey: true, keyRefused: '' };
  if (stop.stop === 'refused') return { needsKey: false, keyRefused: stop.why || 'FRED did not accept it.' };
  return { needsKey: s.needsKey, keyRefused: s.keyRefused };
}

/** Every FRED series the app reads: the US releases and the OECD figures for Japan, Canada and Australia. */
function fredSeriesIds(): string[] {
  const ids = new Set<string>();
  for (const ev of US_EVENTS) ids.add(ev.series);
  for (const c of Object.values(COUNTRY_STATS)) for (const s of [c.gdp, c.cpi, c.un]) if (s && !s[0].includes(':')) ids.add(s[0]);
  // Lines from other publishers (CLEV:) load with the statistics offices' figures below.
  for (const m of MACRO_SERIES) if (!m.id.includes(':')) ids.add(m.id);
  return [...ids];
}

/** Headline rates the statistics offices publish themselves (ONS, Eurostat), under pseudo series ids. */
async function loadOfficialStats(series: Record<string, Obs>, health: Record<string, DatasetHealth>): Promise<number> {
  const since = new Date(Date.now() - 3 * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const [cpi, gdp, unemp, hicp, eun, egdp, statcan, absUnemp, absCpi, clev] = await Promise.all(
    (['ukcpi', 'ukgdp', 'ukunemp', 'estatHicp', 'estatUnemp', 'estatGdp', 'statcan', 'absUnemp', 'absCpi', 'clevNowcast'] as const).map((k) => officialAnswer(k, since)),
  );
  let fresh = 0;
  const text = (r: OfficialAnswer) => r.status === 200 && !r.stale && !r.error ? r.text : '';
  const put = (id: string, obs: Obs | undefined, answer: OfficialAnswer, source: string) => {
    const valid = !!obs?.length && answer.status === 200 && !answer.stale && !answer.error;
    if (valid) series[id] = obs!;
    health[id] = datasetHealth(health[id], { at: answer.attemptedAt, ok: valid, checkedAt: answer.checkedAt, receivedAt: answer.at ?? answer.receivedAt, cached: answer.cached, stale: answer.stale, sourceDate: valid ? obs![obs!.length - 1][0] : undefined, source, error: valid ? undefined : answer.error ?? (answer.status !== 200 ? `HTTP ${answer.status}` : 'No valid observations in the source response.') });
    if (valid && !answer.cached) fresh++;
  };
  // Canada: Statistics Canada's unemployment rate and all-items CPI (the 12-month change is worked out
  // from the published index, as StatCan does). Australia: the ABS's unemployment rate and the monthly
  // CPI's published annual change.
  const sc = parseStatcanVectors(text(statcan));
  put('STATCAN:UN', sc.get(2062815), statcan, 'Statistics Canada');
  put('STATCAN:CPI', sc.get(41690973), statcan, 'Statistics Canada');
  // The Cleveland Fed's nowcasts of this month's inflation (MACRO), each month's latest.
  const nowcasts = parseClevelandNowcast(text(clev));
  for (const k of ['CPI', 'CORECPI', 'PCE', 'COREPCE'] as const) put(`CLEV:${k}`, nowcasts.get(k), clev, 'Federal Reserve Bank of Cleveland');
  put('ABS:UN', parseAbsCsv(text(absUnemp)), absUnemp, 'ABS');
  put('ABS:CPI', parseAbsCsv(text(absCpi)), absCpi, 'ABS');
  put('ONS:D7G7', parseOnsCsv(text(cpi)), cpi, 'ONS');
  put('ONS:IHYR', parseOnsCsv(text(gdp), 'q'), gdp, 'ONS');
  const lfs = parseOnsMonths(text(unemp));
  put('ONS:MGSX', lfs.obs, unemp, 'ONS');
  for (const [d, label] of lfs.labels) periodNames.set(`ONS:MGSX|${d}`, label);
  for (const [kind, answer] of [['HICP', hicp], ['UN', eun], ['GDP', egdp]] as const) {
    const flags = new Map<string, string>();
    const m = parseJsonStat(text(answer), flags);
    const ea = euroAreaCode(m);
    for (const [g, as] of [[ea ?? 'EA', 'EA'], ...EUROSTAT_MEMBERS.map((x) => [x, x])]) {
      const id = `ESTAT:${kind}:${as}`;
      put(id, m.get(g), answer, 'Eurostat');
      recordStatus(id, (m.get(g) ?? []).map(([d]) => d), (d) => flags.get(`${g}|${d}`));
    }
  }
  return fresh;
}

/**
 * The status flags a source gives with the figures it just sent. A figure it sends without a flag loses the one it
 * had (Eurostat drops "p" once a provisional figure is final); figures it did not send keep theirs.
 */
export function recordStatus(id: string, dates: string[], flagOf: (date: string) => string | undefined): void {
  for (const d of dates) {
    const f = flagOf(d);
    if (f) statusFlags.set(`${id}|${d}`, f);
    else statusFlags.delete(`${id}|${d}`);
  }
}

/** Status of an official figure, "estimate" or "provisional", when the source flags it. */
export function figureStatus(id: string, date: string): string | undefined {
  const f = statusFlags.get(`${id}|${date}`);
  return f === 'e' ? 'estimate' : f === 'p' ? 'provisional' : undefined;
}

/** The period a figure covers: the source's own name for it ("May-Jul 2026" for a UK three-month average), else from its date. */
export function figurePeriod(id: string, date: string, freq: Freq): string {
  return periodNames.get(`${id}|${date}`) ?? periodLabel(date, freq);
}

const statusFlags = new Map<string, string>();
const periodNames = new Map<string, string>();

/** BLS answers kept twelve hours: its keyless API allows a few requests a day from each address. */
let bls: { cpi: Obs; un: Obs; health: Record<string, DatasetHealth> } | null = null;

/** BLS version 1 JSON → observations in date order (monthly; the annual average M13 left out). */
export function parseBls(text: string): Obs {
  try {
    const json = JSON.parse(text) as { status?: string; Results?: { series?: { data?: { year: string; period: string; value: string }[] }[] } };
    if (json.status !== 'REQUEST_SUCCEEDED') return [];
    const rows = json.Results?.series?.[0]?.data ?? [];
    return rows
      .filter((r) => /^M(0[1-9]|1[0-2])$/.test(r.period) && Number.isFinite(Number(r.value)))
      .map((r): [string, number] => [`${r.year}-${r.period.slice(1)}-01`, Number(r.value)])
      .sort((a, b) => a[0].localeCompare(b[0]));
  } catch {
    return [];
  }
}

/**
 * The BLS's own series in place of FRED's copies, which this load did not get: when none is shown yet, or when the
 * BLS's runs to a later month than the one shown (the figures shown came from an earlier answer). A series FRED gave
 * in this load stays.
 */
export function takeBlsSeries(series: Record<string, Obs>, fromFred: Set<string>, got: { cpi: Obs; un: Obs }): void {
  const later = (a: Obs, b: Obs | undefined) => a.length > 0 && (!b?.length || a[a.length - 1][0] >= b[b.length - 1][0]);
  if (!fromFred.has('CPIAUCNS') && later(got.cpi, series.CPIAUCNS)) series.CPIAUCNS = got.cpi;
  if (!fromFred.has('UNRATE') && later(got.un, series.UNRATE)) series.UNRATE = got.un;
}

async function loadBls(series: Record<string, Obs>, fromFred: Set<string>, health: Record<string, DatasetHealth>): Promise<number> {
  let fresh = 0;
  const ids = ['CPIAUCNS', 'UNRATE'] as const;
  const due = !bls || ids.some((id) => !bls!.health[id]?.checkedAt || Date.now() - bls!.health[id].checkedAt! > 12 * 3600_000);
  if (due) {
    const since = new Date(Date.now() - 3 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    const answers = await Promise.all((['blsCpi', 'blsUnemp'] as const).map((k) => officialAnswer(k, since)));
    const next = { cpi: bls?.cpi ?? [], un: bls?.un ?? [], health: { ...bls?.health } };
    for (const [index, id] of ids.entries()) {
      if (fromFred.has(id)) continue;
      const answer = answers[index];
      const obs = parseBls(answer.status === 200 && !answer.stale && !answer.error ? answer.text : '');
      const valid = obs.length > 0;
      next.health[id] = datasetHealth(next.health[id], { at: answer.attemptedAt, ok: valid, checkedAt: answer.checkedAt, receivedAt: answer.at ?? answer.receivedAt, cached: answer.cached, stale: answer.stale, source: 'BLS', sourceDate: obs[obs.length - 1]?.[0], error: valid ? undefined : answer.error ?? 'BLS did not return valid observations.' });
      if (valid) next[index === 0 ? 'cpi' : 'un'] = obs;
      if (valid && !answer.cached) fresh++;
    }
    bls = next;
  }
  if (bls) {
    for (const [id, obs] of [['CPIAUCNS', bls.cpi], ['UNRATE', bls.un]] as const) {
      if (fromFred.has(id)) continue;
      const selected = obs.length > 0 && (!series[id]?.length || obs[obs.length - 1][0] >= series[id][series[id].length - 1][0]);
      if (selected) series[id] = obs;
      const sourceHealth = bls.health[id];
      if (sourceHealth && (selected || !series[id]?.length)) health[id] = !due && sourceHealth.state === 'current' ? { ...sourceHealth, state: 'cached' } : sourceHealth;
    }
  }
  return fresh;
}

async function loadSeries(): Promise<boolean> {
  const series = { ...fredData.get().series };
  // Calendar requests run concurrently; only merge this pass's series health back into the shared store.
  const health = Object.fromEntries(Object.entries(fredData.get().health).filter(([id]) => !id.startsWith('release:')));
  let any = false;
  let stop: Stop | null = null;
  const fromFred = new Set<string>();
  const official = loadOfficialStats(series, health);
  for (const id of fredSeriesIds()) {
    const attemptedAt = Date.now();
    const answer = await get('observations', id);
    if ('stop' in answer) {
      stop = answer;
      for (const remaining of fredSeriesIds().slice(fredSeriesIds().indexOf(id))) {
        health[remaining] = datasetHealth(health[remaining], { at: attemptedAt, ok: false, source: 'FRED', error: answer.why ?? `FRED request ${answer.stop}.` });
      }
      break;
    }
    const obs = parseFredObservations(validFredAnswer(answer) ? answer.text : '');
    health[id] = fredHealth(health[id], answer, obs.length > 0, 'FRED', obs[obs.length - 1]?.[0]);
    if (obs.length) {
      series[id] = obs;
      fromFred.add(id);
      any ||= !answer.cached;
    }
  }
  // First releases of the series whose revisions MACRO shows.
  if (stop) for (const id of FIRST_RELEASE_IDS) {
    const key = `first-release:${id}`;
    health[key] = datasetHealth(health[key], { at: Date.now(), ok: false, source: 'ALFRED', error: stop.why ?? `ALFRED request ${stop.stop}.` });
  }
  const firstRelease = { ...fredData.get().firstRelease };
  for (const id of stop ? [] : FIRST_RELEASE_IDS) {
    const answer = await get('first-release', id);
    if ('stop' in answer) {
      stop = answer;
      for (const remaining of FIRST_RELEASE_IDS.slice(FIRST_RELEASE_IDS.indexOf(id))) {
        const key = `first-release:${remaining}`;
        health[key] = datasetHealth(health[key], { at: Date.now(), ok: false, source: 'ALFRED', error: answer.why ?? `ALFRED request ${answer.stop}.` });
      }
      break;
    }
    const rows = parseFredFirstRelease(validFredAnswer(answer) ? answer.text : '');
    if (rows.length) firstRelease[id] = rows;
    const key = `first-release:${id}`;
    health[key] = fredHealth(health[key], answer, rows.length > 0, 'ALFRED', rows[rows.length - 1]?.[0]);
  }
  const officialFresh = await official;
  // Without a FRED key, the US CPI and unemployment rate come from the BLS itself, the same series FRED republishes.
  // A series shown from an earlier BLS answer is brought up to date too (it is not FRED's this time either).
  const blsFresh = stop && stop.stop !== 'throttled' && (!fromFred.has('CPIAUCNS') || !fromFred.has('UNRATE')) ? await loadBls(series, fromFred, health) : 0;
  any ||= officialFresh > 0 || blsFresh > 0;
  fredData.set((s) => ({ ...s, series, firstRelease, health: { ...s.health, ...health }, loaded: s.loaded || Object.values(series).some((obs) => obs.length > 0), ...(any ? { at: Date.now() } : {}), ...keyState(s, stop) }));
  return any;
}

async function loadCalendars(): Promise<boolean> {
  // Six weeks back (ECO's "last week", and the first date of each period, so later dates for it can be left out) onwards.
  const from = new Date(Date.now() - 45 * 86_400_000).toISOString().slice(0, 10);
  const rids = [...new Set(US_EVENTS.map((e) => e.rid))];
  const releases = { ...fredData.get().releases };
  const health: Record<string, DatasetHealth> = {};
  let any = false;
  let stop: Stop | null = null;
  for (const rid of rids) {
    const key = `release:${rid}`;
    const attemptedAt = Date.now();
    const answer = await get('release-dates', String(rid), from);
    if ('stop' in answer) {
      stop = answer;
      for (const remaining of rids.slice(rids.indexOf(rid))) {
        const key = `release:${remaining}`;
        health[key] = datasetHealth(fredData.get().health[key], { at: attemptedAt, ok: false, source: 'FRED', error: answer.why ?? `FRED calendar request ${answer.stop}.` });
      }
      break;
    }
    const dates = parseFredReleaseDates(validFredAnswer(answer) ? answer.text : '', rid);
    health[key] = fredHealth(fredData.get().health[key], answer, dates.length > 0, 'FRED', dates[dates.length - 1]);
    if (dates.length) {
      releases[rid] = dates;
      any ||= !answer.cached;
    }
  }
  // The BLS's own schedule gives its releases' times, which FRED does not; it needs no FRED key.
  const bls = await window.arminDesktop?.official?.('blsSchedule', new Date().toISOString().slice(0, 10)).catch(() => undefined);
  const schedule = bls?.text ? parseBlsSchedule(bls.text) : undefined;
  const releaseTimes = schedule && !('error' in schedule) ? blsReleaseTimes(schedule) : undefined;
  // Without SEC_USER_AGENT nothing was asked, so nothing failed: the dates simply show without times.
  if (!bls?.missing) {
    health['bls-schedule'] = datasetHealth(fredData.get().health['bls-schedule'], releaseTimes
      ? { at: Date.now(), ok: true, source: 'BLS release schedule' }
      : { at: Date.now(), ok: false, source: 'BLS release schedule', error: schedule && 'error' in schedule ? schedule.error : `The BLS answered ${bls?.status ? `HTTP ${bls.status}` : 'nothing'}.` });
  }
  fredData.set((s) => ({ ...s, releases, ...(releaseTimes ? { releaseTimes } : {}), health: { ...s.health, ...health }, ...keyState(s, stop) }));
  return any;
}

let reload: (() => void) | null = null;

/** Loads FRED again now, after the user saves an API key. */
export function reloadFred() {
  reload?.();
}

/**
 * Loads release dates (every 12 hours) and series values (every 10 minutes);
 * retries every 2 minutes until both answer, except while the key is missing or
 * refused: then asking again cannot help, and saving a key in PROVIDERS loads again.
 */
export function startFred(): () => void {
  if (!fredAvailable()) return () => undefined;
  setFeed('eco', 'connecting', 'FRED API (St. Louis Fed), ONS and Eurostat');
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const report = () => {
    const s = fredData.get();
    const fredOk = !s.needsKey && !s.keyRefused && Object.keys(s.releases).some((rid) => s.health[`release:${rid}`]?.state === 'current') && US_EVENTS.some((e) => s.series[e.series]?.length && s.health[e.series]?.state === 'current');
    const checks = Object.values(s.health);
    const successful = checks.filter((h) => h.state === 'current');
    const failed = checks.filter((h) => h.state !== 'current');
    if (successful.length && !failed.length) setFeed('eco', 'live', `${successful.length} economic datasets checked`, { deliveredAt: s.at });
    else if (successful.length) setFeed('eco', 'error', `Partial economic data: ${successful.length} datasets checked; ${failed.length} checks failed or returned cached answers. Earlier values keep their original check dates.`);
    else if (s.keyRefused) setFeed('eco', 'blocked', 'The FRED API key was not accepted (check it in PROVIDERS); earlier values are retained with their check dates.');
    else if (s.needsKey) setFeed('eco', 'blocked', 'FRED needs your API key (PROVIDERS); no successful current source check.');
    else setFeed('eco', 'error', 'Economic data sources did not answer; earlier values retain their original check dates.');
    return fredOk;
  };
  const first = async () => {
    if (retry) clearTimeout(retry);
    retry = null;
    await Promise.all([loadCalendars(), loadSeries()]);
    if (stopped) return;
    const { needsKey, keyRefused } = fredData.get();
    const fredOk = report();
    const failed = Object.values(fredData.get().health).some((health) => health.state === 'error');
    if ((!fredOk || failed) && !needsKey && !keyRefused) retry = setTimeout(() => void first(), 120_000);
  };
  reload = () => void first();
  void first();
  const seriesTimer = setInterval(() => void loadSeries().then(report), 10 * 60_000);
  const calTimer = setInterval(() => void loadCalendars().then(report), 12 * 3600_000);
  // A refresh asks for the values again; release dates (asked twice a day) only when none have loaded yet.
  const offRefresh = registerRefresh({
    source: 'Economic data (FRED, ONS, Eurostat, StatCan, ABS)',
    run: async () => {
      const source = 'Economic data (FRED, ONS, Eurostat, StatCan, ABS)';
      await Promise.all([loadSeries(), Object.keys(fredData.get().releases).length ? Promise.resolve(true) : loadCalendars()]);
      const fredOk = report();
      const s = fredData.get();
      const failed = Object.values(s.health).filter((h) => h.state === 'error').length;
      if (fredOk && !failed) return { source, state: 'asked' };
      if (s.needsKey || s.keyRefused) return { source, state: 'failed', detail: `FRED ${s.keyRefused ? 'refused the configured key' : 'needs FRED_API_KEY'} (PROVIDERS); statistics-office results are tracked separately` };
      return { source, state: 'failed', detail: `${failed} dataset checks failed; retained values were not renewed` };
    },
  });
  return () => {
    stopped = true;
    reload = null;
    clearInterval(seriesTimer);
    clearInterval(calTimer);
    if (retry) clearTimeout(retry);
    offRefresh();
  };
}

/** The specific series' source check, independent of whether another economic dataset loaded. */
export function fredSeriesHealth(id: string): DatasetHealth | undefined {
  return fredData.get().health[id];
}
