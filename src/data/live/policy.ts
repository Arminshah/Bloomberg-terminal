import { createStore } from '../../core/store';
import { DAY_MS } from '../calendar';
import { setFeed } from './status';

/**
 * Real policy and funding rates for the desktop app, from the central banks'
 * own data services: the Fed's target range, effective fed funds and SOFR
 * (New York Fed), the ECB deposit rate (ECB Data Portal), Bank Rate (Bank of
 * England) and the overnight target (Bank of Canada). Each series keeps the
 * date and size of every move. Other central banks stay reference settings.
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
  const head = (lines[0] ?? '').split(',');
  const ti = head.indexOf('TIME_PERIOD');
  const vi = head.indexOf('OBS_VALUE');
  if (ti < 0 || vi < 0) return [];
  return lines
    .slice(1)
    .map((l) => l.split(','))
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

async function get(source: 'effr' | 'sofr' | 'ecb' | 'boe' | 'boc', since: string): Promise<string> {
  try {
    const res = await window.arminDesktop!.policy(source, since);
    return res.status === 200 ? res.text : '';
  } catch {
    return '';
  }
}

async function load(): Promise<number> {
  const since = new Date(Date.now() - 4 * 365 * DAY_MS).toISOString().slice(0, 10);
  const [effr, sofr, ecb, boe, boc] = await Promise.all([get('effr', since), get('sofr', since), get('ecb', since), get('boe', since), get('boc', since)]);
  const fed = parseNyFed(effr);
  const next: PolicyRates = {
    fedUpper: toChanges(fed.upper),
    fedLower: toChanges(fed.lower),
    effr: toChanges(fed.rate),
    sofr: toChanges(parseNyFed(sofr).rate),
    ecb: toChanges(parseEcbCsv(ecb)),
    boe: toChanges(parseBoeCsv(boe)),
    boc: toChanges(parseValet(boc, 'V39079')),
  };
  policyRates.set(next);
  return ['fedUpper', 'ecb', 'boe', 'boc'].filter((k) => next[k as keyof PolicyRates]).length;
}

/** Loads the rates in the desktop app and refreshes them every six hours. */
export function startPolicyRates(): () => void {
  if (typeof window === 'undefined' || typeof window.arminDesktop?.policy !== 'function') return () => undefined;
  setFeed('policy', 'connecting', 'Central bank rates');
  const run = () =>
    void load().then((n) => {
      if (n) setFeed('policy', 'live', `${n} of 4 central banks: Fed (New York Fed), ECB, Bank of England, Bank of Canada`);
      else setFeed('policy', 'error', 'Central bank sources unavailable; policy rates are reference settings');
    });
  run();
  const timer = setInterval(run, 6 * 3600_000);
  return () => clearInterval(timer);
}
