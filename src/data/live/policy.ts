import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import { setFeed } from './status';
import { registerRefresh } from '../../terminal/refresh';
import { official, officialAvailable, parseRbaTable, parseSgs, parseSnbCube } from './official';

/**
 * Real policy and funding rates for the desktop app, from the central banks'
 * own data services: the Fed's target range, effective fed funds, SOFR and the
 * other reference rates (New York Fed), the FOMC calendar (Federal Reserve
 * Board), the ECB deposit rate (ECB Data Portal), Bank Rate (Bank of
 * England), the overnight target (Bank of Canada), the cash rate target
 * (Reserve Bank of Australia), the SNB policy rate (Swiss National Bank) and
 * the Selic target (Banco Central do Brasil). Each series keeps the date and
 * size of every move.
 */

export interface PolicySeries {
  /** [ISO date, level] at each change, in date order. */
  changes: [string, number][];
  last: number;
  asOf: string;
}

export interface PolicyRates {
  fedUpper?: PolicySeries;
  fedLower?: PolicySeries;
  effr?: PolicySeries;
  sofr?: PolicySeries;
  ecb?: PolicySeries;
  boe?: PolicySeries;
  boc?: PolicySeries;
  rba?: PolicySeries;
  snb?: PolicySeries;
  bcb?: PolicySeries;
  /** The euro short-term rate (ECB) and SONIA (Bank of England): each overnight benchmark, daily. */
  estr?: PolicySeries;
  sonia?: PolicySeries;
  /** The Bank of Japan's basic loan rate (with every change) and the overnight call rate its guideline targets (daily average). */
  bojLoan?: PolicySeries;
  bojCall?: PolicySeries;
  /** FOMC decision days (the second day of each scheduled meeting), from the Federal Reserve Board's calendar. */
  fomc?: string[];
  /** The New York Fed's latest reference rates. */
  funding?: FundingRate[];
}

/** One New York Fed reference rate (EFFR, OBFR, SOFR, BGCR, TGCR) for its latest business day. */
export interface FundingRate {
  type: string;
  date: string;
  rate: number;
  p1: number;
  p25: number;
  p75: number;
  p99: number;
  /** USD billions. */
  volume: number;
}

export const policyRates = createStore<PolicyRates>({});

type Obs = [string, number][];

/** Keeps the first day of each level, so the last entry is the latest move. */
export function toChanges(obs: Obs): PolicySeries | undefined {
  const sorted = obs.filter(([, v]) => Number.isFinite(v)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (!sorted.length) return undefined;
  const changes: Obs = [];
  for (const [d, v] of sorted) if (!changes.length || changes[changes.length - 1][1] !== v) changes.push([d, v]);
  return { changes, last: sorted[sorted.length - 1][1], asOf: sorted[sorted.length - 1][0] };
}

/** The level in effect on an ISO date. */
export function levelOn(s: PolicySeries, iso: string): number {
  let v = NaN;
  for (const [d, x] of s.changes) {
    if (d > iso) break;
    v = x;
  }
  return v;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** New York Fed reference rates: {refRates: [{effectiveDate, percentRate, targetRateFrom, targetRateTo}]}. */
export function parseNyFed(text: string): { rate: Obs; lower: Obs; upper: Obs } {
  const out = { rate: [] as Obs, lower: [] as Obs, upper: [] as Obs };
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return out;
  }
  for (const r of (json?.refRates ?? []) as any[]) {
    const d = String(r?.effectiveDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (Number.isFinite(r.percentRate)) out.rate.push([d, r.percentRate]);
    if (Number.isFinite(r.targetRateFrom)) out.lower.push([d, r.targetRateFrom]);
    if (Number.isFinite(r.targetRateTo)) out.upper.push([d, r.targetRateTo]);
  }
  return out;
}

/** Bank of Canada Valet: {observations: [{d, V39079: {v}}]}. */
export function parseValet(text: string, series: string): Obs {
  try {
    const json: any = JSON.parse(text);
    return ((json?.observations ?? []) as any[]).map((o) => [String(o?.d), Number(o?.[series]?.v)] as [string, number]).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v));
  } catch {
    return [];
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** ECB Data Portal csvdata: a header row naming TIME_PERIOD and OBS_VALUE. */
export function parseEcbCsv(text: string): Obs {
  const lines = text.trim().split(/\r?\n/);
  const cells = (line: string) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '').trim());
  const head = cells(lines[0] ?? '');
  const ti = head.indexOf('TIME_PERIOD');
  const vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) return [];
  return lines
    .slice(1)
    .map(cells)
    .filter((c) => c[vi] !== undefined && c[vi] !== '')
    .map((c) => [c[ti], Number(c[vi])] as [string, number])
    .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v));
}

const MON: Record<string, string> = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

/** Bank of England database CSV: "DATE,IUDBEDR" then "08 Oct 2026,3.75". */
export function parseBoeCsv(text: string): Obs {
  const out: Obs = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const m = /^(\d{2}) ([A-Z][a-z]{2}) (\d{4}),\s*([-\d.]+)/.exec(line.trim());
    if (m && MON[m[2]]) out.push([`${m[3]}-${MON[m[2]]}-${m[1]}`, Number(m[4])]);
  }
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The Bank of Japan's Time-Series Data Search API (getDataCode, JSON): RESULTSET[0].VALUES holds SURVEY_DATES
 * (YYYYMMDD) and VALUES (a number, or null on a day without one).
 */
export function parseBojJson(text: string): Obs {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const v = json?.RESULTSET?.[0]?.VALUES;
  const dates: unknown[] = Array.isArray(v?.SURVEY_DATES) ? v.SURVEY_DATES : [];
  const values: unknown[] = Array.isArray(v?.VALUES) ? v.VALUES : [];
  const out: Obs = [];
  dates.forEach((d, i) => {
    const s = String(d);
    const x = values[i];
    if (/^\d{8}$/.test(s) && typeof x === 'number' && Number.isFinite(x)) out.push([`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`, x]);
  });
  return out;
}

/** The New York Fed's latest reference rates: {refRates: [{type, effectiveDate, percentRate, percentPercentile1, ..., volumeInBillions}]}. */
export function parseNyFedLatest(text: string): FundingRate[] {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const out: FundingRate[] = [];
  for (const r of (json?.refRates ?? []) as any[]) {
    const date = String(r?.effectiveDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(r?.percentRate)) continue;
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);
    out.push({ type: String(r.type), date, rate: r.percentRate, p1: n(r.percentPercentile1), p25: n(r.percentPercentile25), p75: n(r.percentPercentile75), p99: n(r.percentPercentile99), volume: n(r.volumeInBillions) });
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTH = (m: string) => MONTH_NAMES.findIndex((x) => x.startsWith(m));

/**
 * FOMC decision days from the Board's calendar page: each year's panel lists
 * "January 27-28" or "Apr/May 30-1". Notation votes and unscheduled meetings
 * are left out; the decision is announced on the last day of a meeting.
 */
export function parseFomcCalendar(html: string): string[] {
  const panels = [...html.matchAll(/(\d{4}) FOMC Meetings/g)].map((m) => ({ year: Number(m[1]), at: m.index ?? 0 })).sort((a, b) => a.at - b.at);
  const out = new Set<string>();
  panels.forEach((p, i) => {
    const seg = html.slice(p.at, i + 1 < panels.length ? panels[i + 1].at : html.length);
    for (const m of seg.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>\s*<\/div>\s*<div[^>]*fomc-meeting__date[^>]*>([^<]+)<\/div>/g)) {
      const months = m[1].trim().split('/');
      const days = /^(\d{1,2})-(\d{1,2})\*?$/.exec(m[2].trim());
      if (!days) continue; // notation votes, unscheduled meetings
      const k = SHORT_MONTH(months[months.length - 1].trim().slice(0, 3));
      if (k < 0) continue;
      out.add(`${p.year}-${String(k + 1).padStart(2, '0')}-${days[2].padStart(2, '0')}`);
    }
  });
  return [...out].sort();
}

async function load(): Promise<number> {
  const since = new Date(Date.now() - 4 * 365 * DAY_MS).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  // The overnight benchmarks over the last quarter; the Bank of Japan's two rates as far back as the others.
  const recent = new Date(Date.now() - 92 * DAY_MS).toISOString().slice(0, 10);
  const [effr, sofr, nyfed, fomc, ecb, boe, boc, rba, snb, bcb, estr, sonia, bojLoan, bojCall] = await Promise.all([
    ...(['effr', 'sofr', 'nyfed', 'fomc', 'ecb', 'boe', 'boc', 'rba', 'snb', 'bcb'] as const).map((k) => official(k, since)),
    official('estr', recent),
    official('sonia', recent),
    official('bojLoan', since),
    official('bojCall', recent),
  ]);
  const fed = parseNyFed(effr);
  const calendar = parseFomcCalendar(fomc);
  const prev = policyRates.get();
  const next: PolicyRates = {
    fedUpper: toChanges(fed.upper),
    fedLower: toChanges(fed.lower),
    effr: toChanges(fed.rate),
    sofr: toChanges(parseNyFed(sofr).rate),
    ecb: toChanges(parseEcbCsv(ecb)),
    boe: toChanges(parseBoeCsv(boe)),
    boc: toChanges(parseValet(boc, 'V39079')),
    rba: toChanges(parseRbaTable(rba).get('FIRMMCRTD') ?? []),
    snb: toChanges(parseSnbCube(snb, 'LZ')),
    bcb: toChanges(parseSgs(bcb, today)),
    estr: toChanges(parseEcbCsv(estr)),
    sonia: toChanges(parseBoeCsv(sonia)),
    bojLoan: toChanges(parseBojJson(bojLoan)),
    bojCall: toChanges(parseBojJson(bojCall)),
    // A source that fails this time keeps what it gave before.
    fomc: calendar.length ? calendar : prev.fomc,
    funding: nyfed ? parseNyFedLatest(nyfed) : prev.funding,
  };
  for (const k of ['fedUpper', 'fedLower', 'effr', 'sofr', 'ecb', 'boe', 'boc', 'rba', 'snb', 'bcb', 'estr', 'sonia', 'bojLoan', 'bojCall'] as const) next[k] ??= prev[k];
  policyRates.set(next);
  return BANKS.filter(([k]) => next[k]).length;
}

const BANKS: [keyof PolicyRates, string][] = [
  ['fedUpper', 'Fed (New York Fed)'],
  ['ecb', 'ECB'],
  ['boe', 'Bank of England'],
  ['boc', 'Bank of Canada'],
  ['rba', 'Reserve Bank of Australia'],
  ['snb', 'Swiss National Bank'],
  ['bcb', 'Banco Central do Brasil'],
];

/** Loads the rates in the desktop app and refreshes them every hour; a source that fails is tried again after two minutes. */
export function startPolicyRates(): () => void {
  if (!officialAvailable()) return () => undefined;
  setFeed('policy', 'connecting', 'Central bank rates');
  let retry: ReturnType<typeof setTimeout> | null = null;
  let retries = 0;
  const run = () =>
    load().then((n) => {
      const got = BANKS.filter(([k]) => policyRates.get()[k]).map(([, name]) => name);
      if (n) setFeed('policy', 'live', `${n} of ${BANKS.length} central banks: ${got.join(', ')}`);
      else setFeed('policy', 'error', 'Central bank sources unavailable');
      const p = policyRates.get();
      const missing = n < BANKS.length || !p.funding?.length || !p.fomc?.length;
      if (retry) clearTimeout(retry);
      retry = null;
      if (missing && retries < 5) {
        retries++;
        retry = setTimeout(() => void run(), 120_000);
      } else if (!missing) retries = 0;
      return n;
    });
  void run();
  const timer = setInterval(() => void run(), 3600_000);
  const offRefresh = registerRefresh({
    source: 'Central bank rates',
    run: async () => {
      const n = await run();
      return { source: 'Central bank rates', state: n ? 'asked' : 'failed', detail: `${n} of ${BANKS.length} central banks answered` };
    },
  });
  return () => {
    clearInterval(timer);
    if (retry) clearTimeout(retry);
    offRefresh();
  };
}
