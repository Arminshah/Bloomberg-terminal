import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import { setFeed } from './status';
import { registerRefresh } from '../../terminal/refresh';
import { officialAnswer, officialAvailable, parseRbaTable, parseSgs, parseSnbCube, type OfficialAnswer } from './official';
import { datasetHealth, type DatasetHealth } from './provenance';
import type { OfficialSource } from './lookup';
import { fedStatementLinks, parseFedDecision, type PolicyDecision } from './policy-decisions';
import { bankDate, scheduledPolicyAt } from '../policy-state';

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
  /** Announced/source rows not yet effective; excluded from last, changes and historical calculations. */
  future?: [string, number][];
}

export interface PolicyRates {
  /** Statement-backed decisions, with immutable correction versions retained. */
  decisions?: PolicyDecision[];
  health?: Partial<Record<OfficialSource, DatasetHealth>>;
  /** A successful check of one statement cannot certify a different, older effective target. */
  documentHealth?: Record<string, DatasetHealth>;
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
const decisionArchive = createStore<{ decisions: PolicyDecision[] }>({ decisions: [] }, 'policy-decision-archive', 1);

type Obs = [string, number][];

/** Keeps the first day of each level, so the last entry is the latest move. */
export function toChanges(obs: Obs, today = new Date().toISOString().slice(0, 10)): PolicySeries | undefined {
  const sorted = obs.filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d && Number.isFinite(v)).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (sorted.some(([d, v], i) => i > 0 && sorted[i - 1][0] === d && sorted[i - 1][1] !== v)) return undefined;
  const future = sorted.filter(([d]) => d > today);
  const effective = sorted.filter(([d]) => d <= today);
  if (!effective.length) return undefined;
  const changes: Obs = [];
  for (const [d, v] of effective) if (!changes.length || changes[changes.length - 1][1] !== v) changes.push([d, v]);
  return { changes, last: effective[effective.length - 1][1], asOf: effective[effective.length - 1][0], ...(future.length ? { future } : {}) };
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
  for (const r of (Array.isArray(json?.refRates) ? json.refRates : []) as any[]) {
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
    return (Array.isArray(json?.observations) ? json.observations as any[] : []).filter((o) => o?.[series]?.v != null && String(o[series].v).trim() !== '').map((o) => [String(o?.d), Number(o?.[series]?.v)] as [string, number]).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v));
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
  for (const r of (Array.isArray(json?.refRates) ? json.refRates : []) as any[]) {
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
      const iso = `${p.year}-${String(k + 1).padStart(2, '0')}-${days[2].padStart(2, '0')}`;
      const parsed = Date.parse(`${iso}T00:00:00Z`);
      if (Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === iso) out.add(iso);
    }
  });
  return [...out].sort();
}

export function mergeDecisionVersions(previous: readonly PolicyDecision[], incoming: readonly PolicyDecision[]): PolicyDecision[] {
  const out = [...previous];
  const signature = (d: PolicyDecision) => JSON.stringify({ ...d, retrievedAt: 0 });
  for (const d of incoming) if (!out.some((x) => x.id === d.id && signature(x) === signature(d))) out.push(d);
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.retrievedAt - b.retrievedAt);
}

export const POLICY_SOURCE: Partial<Record<keyof PolicyRates, OfficialSource>> = {
  fedUpper: 'effr', fedLower: 'effr', effr: 'effr', sofr: 'sofr', ecb: 'ecb', boe: 'boe', boc: 'boc',
  rba: 'rba', snb: 'snb', bcb: 'bcb', estr: 'estr', sonia: 'sonia', bojLoan: 'bojLoan', bojCall: 'bojCall',
};

/** Injected transport and time permit chronological checks without pretending fixture data are live observations. */
export async function loadPolicyRates(request: (source: OfficialSource, since: string) => Promise<OfficialAnswer> = officialAnswer, now = Date.now()): Promise<{ answered: number; failures: number }> {
  const since = new Date(now - 4 * 365 * DAY_MS).toISOString().slice(0, 10);
  const recent = new Date(now - 92 * DAY_MS).toISOString().slice(0, 10);
  const sources = ['effr', 'sofr', 'nyfed', 'fomc', 'ecb', 'boe', 'boc', 'rba', 'snb', 'bcb', 'estr', 'sonia', 'bojLoan', 'bojCall', 'newsFed'] as const;
  const answers = await Promise.all(sources.map(async (source) => {
    try { return await request(source, ['estr', 'sonia', 'bojCall'].includes(source) ? recent : since); }
    catch (err) { return { status: 0, text: '', attemptedAt: now, receivedAt: now, error: err instanceof Error ? err.message : 'Source unavailable' } as OfficialAnswer; }
  }));
  const response = Object.fromEntries(sources.map((key, i) => [key, answers[i]])) as Record<typeof sources[number], OfficialAnswer>;
  const prev = policyRates.get();
  const next: PolicyRates = { ...prev, health: { ...prev.health }, documentHealth: { ...prev.documentHealth } };
  const validTransport = (a: OfficialAnswer) => a.status === 200 && !!a.text && !a.error && !a.stale;
  const record = (source: OfficialSource, a: OfficialAnswer, valid: boolean, sourceDate?: string, error?: string) => {
    const document = (source === 'fedStatement' || source === 'fedImplementation') && sourceDate ? `${source}:${sourceDate}` : undefined;
    const previous = document ? next.documentHealth?.[document] : next.health?.[source];
    const health = datasetHealth(previous, { at: a.attemptedAt, receivedAt: a.receivedAt, checkedAt: a.checkedAt, ok: validTransport(a) && valid, cached: a.cached, stale: a.stale, sourceDate, source: a.url ?? source, error: a.error ?? (!valid ? error ?? `HTTP ${a.status || 'unavailable'}` : undefined) });
    next.health![source] = health;
    if (document) next.documentHealth![document] = health;
  };
  const text = (source: typeof sources[number]) => validTransport(response[source]) ? response[source].text : '';
  const fed = parseNyFed(text('effr'));
  const series: [keyof Pick<PolicyRates, 'fedUpper' | 'fedLower' | 'effr' | 'sofr' | 'ecb' | 'boe' | 'boc' | 'rba' | 'snb' | 'bcb' | 'estr' | 'sonia' | 'bojLoan' | 'bojCall'>, OfficialSource, Obs, string][] = [
    ['fedUpper', 'effr', fed.upper, 'FED'], ['fedLower', 'effr', fed.lower, 'FED'], ['effr', 'effr', fed.rate, 'FED'],
    ['sofr', 'sofr', parseNyFed(text('sofr')).rate, 'FED'], ['ecb', 'ecb', parseEcbCsv(text('ecb')), 'ECB'],
    ['boe', 'boe', parseBoeCsv(text('boe')), 'BOE'], ['boc', 'boc', parseValet(text('boc'), 'V39079'), 'BOC'],
    ['rba', 'rba', parseRbaTable(text('rba')).get('FIRMMCRTD') ?? [], 'RBA'], ['snb', 'snb', parseSnbCube(text('snb'), 'LZ'), 'SNB'],
    ['bcb', 'bcb', parseSgs(text('bcb'), bankDate('BCB', now)), 'BCB'], ['estr', 'estr', parseEcbCsv(text('estr')), 'ECB'],
    ['sonia', 'sonia', parseBoeCsv(text('sonia')), 'BOE'], ['bojLoan', 'bojLoan', parseBojJson(text('bojLoan')), 'BOJ'], ['bojCall', 'bojCall', parseBojJson(text('bojCall')), 'BOJ'],
  ];
  let fedValid = true;
  for (const [key, source, obs, bank] of series) {
    const candidate = toChanges(obs, bankDate(bank, now));
    const previous = prev[key];
    const regressed = !!candidate && !!previous && candidate.asOf < previous.asOf;
    if (candidate && !regressed) next[key] = candidate;
    if (source === 'effr') fedValid = fedValid && !!candidate && !regressed;
    else record(source, response[source as typeof sources[number]], !!candidate && !regressed, candidate?.asOf, regressed ? 'The source returned an older observation window; the newer value was retained.' : 'No valid effective observations in the response.');
  }
  fedValid = fedValid && !!next.fedLower && !!next.fedUpper && next.fedLower.asOf === next.fedUpper.asOf && next.fedLower.last <= next.fedUpper.last;
  if (!fedValid) { next.fedUpper = prev.fedUpper; next.fedLower = prev.fedLower; next.effr = prev.effr; }
  record('effr', response.effr, fedValid, next.fedUpper?.asOf, 'The response did not establish coherent effective fed funds and target-range observations.');
  const calendar = parseFomcCalendar(text('fomc'));
  if (calendar.length) next.fomc = calendar;
  record('fomc', response.fomc, calendar.length > 0, calendar.at(-1), 'No valid decision calendar in the response.');
  const funding = parseNyFedLatest(text('nyfed'));
  if (funding.length) next.funding = funding;
  record('nyfed', response.nyfed, funding.length > 0, funding.map((f) => f.date).sort().at(-1), 'No valid reference rates in the response.');
  const links = [...fedStatementLinks(text('fomc')), ...fedStatementLinks(text('newsFed'))];
  record('newsFed', response.newsFed, /<(?:item|entry)\b/i.test(text('newsFed')), undefined, 'No usable Federal Reserve announcements.');
  let archive = mergeDecisionVersions(decisionArchive.get().decisions ?? [], prev.decisions ?? []);
  // Discovery failures do not exempt previously displayed documents from revalidation. Keep their exact source
  // checks honest even when both calendar/RSS endpoints are unavailable.
  const dates = [...new Set([...links.map((l) => l.date), ...archive.map((d) => d.date)])].filter((date) => date <= bankDate('FED', now)).sort().reverse().slice(0, 3).sort();
  for (const date of dates) {
    const a = await request('fedStatement', date).catch(() => ({ status: 0, text: '', attemptedAt: now, receivedAt: now, error: 'Statement unavailable' } as OfficialAnswer));
    const note = await request('fedImplementation', date).catch(() => ({ status: 0, text: '', attemptedAt: now, receivedAt: now, error: 'Implementation note unavailable' } as OfficialAnswer));
    const url = `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date.replace(/-/g, '')}a.htm`;
    const d = validTransport(a) ? parseFedDecision(a.text, validTransport(note) ? note.text : '', url, a.receivedAt, now) : undefined;
    // Per-document records preserve a failure on today's statement even when an older statement works.
    record('fedStatement', a, !!d, date, 'The statement did not establish an unambiguous published target.');
    record('fedImplementation', note, !!d?.effectiveDate, date, 'The implementation note did not establish an effective date.');
    if (d) archive = mergeDecisionVersions(archive, [d]);
  }
  next.decisions = archive;
  decisionArchive.set({ decisions: archive });
  policyRates.set(next);
  const bankStates = BANKS.map(([key]) => next.health?.[POLICY_SOURCE[key]!]);
  return { answered: bankStates.filter((h) => h?.state === 'current').length, failures: bankStates.filter((h) => !h || h.state === 'error').length };
}

const BANKS: [keyof PolicyRates, string][] = [
  ['fedUpper', 'Fed (New York Fed)'],
  ['ecb', 'ECB'],
  ['boe', 'Bank of England'],
  ['bojLoan', 'Bank of Japan'],
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
  let running: Promise<number> | undefined;
  const run = (): Promise<number> => {
    if (running) return running;
    running = loadPolicyRates().then(({ answered: n, failures }) => {
      const got = BANKS.filter(([k]) => policyRates.get().health?.[POLICY_SOURCE[k]!]?.state === 'current').map(([, name]) => name);
      if (n) setFeed('policy', failures ? 'error' : 'live', `${n} of ${BANKS.length} central banks confirmed this check: ${got.join(', ')}${failures ? '; other sources failed; retained values show their dates' : ''}`, { delivered: true });
      else setFeed('policy', 'error', 'No central bank rate was freshly checked; any retained or cached values keep their own dates.');
      const p = policyRates.get();
      const missing = failures > 0 || ['nyfed', 'fomc', 'newsFed', 'fedStatement', 'fedImplementation'].some((key) => p.health?.[key as OfficialSource]?.state === 'error');
      if (retry) clearTimeout(retry);
      retry = null;
      if (missing && retries < 5) {
        retries++;
        retry = setTimeout(() => void run(), 120_000);
      } else if (!missing) retries = 0;
      return n;
    }).finally(() => { running = undefined; });
    return running;
  };
  void run();
  // Check more often around a published Fed decision time, without changing any provider quota.
  let lastRun = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const nearDecision = policyRates.get().fomc?.some((date) => Math.abs(scheduledPolicyAt('FED', date) - now) < 3 * 3600_000);
    if (now - lastRun >= (nearDecision ? 120_000 : 3600_000)) { lastRun = now; void run(); }
  }, 60_000);
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
