// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fmtNum } from '../core/format';
import type { DatasetHealth } from './live/provenance';
import type { PolicyDecision } from './live/policy-decisions';
import type { EcoEvent, PolicyCalendarEvent } from './eco';

/**
 * ECO's agenda lines in one shape, whichever source a release comes from: Nasdaq's calendar (the desktop app), FRED's
 * release dates with the central banks' own decisions (the desktop app without Nasdaq), or the browser demo's
 * generated calendar. Figures stay as their source writes them; a blank is shown as "--", as the terminal does.
 */
export interface EcoRow {
  id: string;
  /** The release (epoch ms); for a release whose source gives only its day, noon UTC on that day. */
  time: number;
  /** A release whose source gives its day but no time: that day (YYYY-MM-DD). */
  date?: string;
  country: string;
  countryName: string;
  name: string;
  period: string;
  survey: string;
  actual: string;
  prior: string;
  revised: string;
  /** The app's 1 to 3 reading of how closely markets follow the release (no free source gives its importance). */
  relevance: number;
  /** R's lit bars, 1 to 4, from the same reading. */
  bars: number;
  /** Its actual is out, or its time has passed. */
  released: boolean;
  description: string;
  /** Where its figures come from, for the row's tooltip and the CSV. */
  source: string;
  /** A real record; the demo's generated rows are not. */
  real: boolean;
  policyStatus?: 'confirmed' | 'awaiting-publication' | 'statement-unavailable' | 'scheduled';
  policyDecision?: PolicyDecision;
  /** Where a release's time of day comes from, when not from the source of its figures. */
  timeFrom?: string;
  health?: DatasetHealth;
  /** A word on a cell's figure (a vendor's own policy figures beside the official statement's). */
  notes?: Partial<Record<'survey' | 'actual' | 'prior', string>>;
  /** The FRED series (with FRED's transformation) that charts the release's history, for its detail. */
  chart?: string;
}

/** FRED's transformation for each way the app works a figure out of a series. */
const UNITS: Record<string, string> = { level: '', diff: ':CHG', mom: ':PCH', yoy: ':PC1' };

/** US releases on Nasdaq's calendar with a FRED series of their own (named as Nasdaq names them). */
const NASDAQ_FRED: [RegExp, string][] = [
  [/^nonfarm payrolls$/i, 'PAYEMS:CHG'],
  [/^unemployment rate$/i, 'UNRATE'],
  [/^retail sales$/i, 'RSAFS:PCH'],
  [/^industrial production$/i, 'INDPRO:PCH'],
  [/^housing starts$/i, 'HOUST'],
  [/^new home sales$/i, 'HSN1F'],
  [/^durable goods orders$/i, 'DGORDER:PCH'],
];

/** The ECONCHART series for a FRED indicator, from how the app works its figure out. */
export function fredChart(series: string, calc: string): string {
  return `${series}${UNITS[calc] ?? ''}`;
}

/** The releases markets move on most: the fourth bar. */
const TOP = /non-?farm payrolls|\bnonfarm\b|\bcpi\b|consumer price index|\bgdp\b|gross domestic product|interest rate decision|rate decision/i;

/** R's bars from the app's reading of the release: the headline releases four, the rest by relevance. */
export function relevanceBars(name: string, relevance: number): number {
  if (relevance >= 3) return TOP.test(name) ? 4 : 3;
  return Math.max(1, Math.min(2, relevance));
}

/** A row from Nasdaq's calendar (with the Fed's decisions from its own statements). */
export function fromNasdaq(e: PolicyCalendarEvent, now: number): EcoRow {
  const policy = !!e.policyStatus;
  return {
    id: e.id,
    time: e.time,
    date: e.date,
    country: e.country,
    countryName: e.countryName,
    name: e.name,
    period: '',
    survey: e.consensus,
    actual: e.actual,
    prior: e.previous,
    revised: '',
    relevance: e.relevance,
    bars: relevanceBars(e.name, e.relevance),
    released: policy ? e.policyStatus === 'confirmed' : !!e.actual || e.time <= now,
    description: e.description,
    source: policy ? "Nasdaq's calendar; the decision from the Fed's own statement" : "Nasdaq's calendar (its data partner's consensus)",
    real: true,
    policyStatus: e.policyStatus,
    policyDecision: e.policyDecision,
    chart: e.country === 'US' && !policy ? NASDAQ_FRED.find(([re]) => re.test(e.name))?.[1] : undefined,
    notes: policy
      ? {
          ...(e.reportedActual ? { actual: `Nasdaq reports ${e.reportedActual}; the official statement gives the announced upper bound` } : {}),
          ...(e.reportedConsensus ? { survey: `Nasdaq reports ${e.reportedConsensus}; its definition against the target range is not verified` } : {}),
          ...(e.reportedPrevious ? { prior: `Nasdaq reports ${e.reportedPrevious}; the official record gives the upper bound` } : {}),
        }
      : undefined,
  };
}

const value = (e: EcoEvent, v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '' : `${fmtNum(v, e.dec)}${e.unit}`);

/** A row from FRED's release dates, a central bank's own decision, or the demo's generated calendar. */
export function fromEco(e: EcoEvent, now: number, today: string, real: boolean, chart?: string): EcoRow {
  const released = e.policyStatus ? e.policyStatus === 'confirmed' : e.date ? e.actual != null || e.date < today : real ? e.time <= now : e.actual != null;
  return {
    id: e.id,
    time: e.date ? Date.parse(`${e.date}T12:00:00Z`) : e.time,
    date: e.date,
    country: e.country,
    countryName: e.country,
    name: e.name,
    period: e.period,
    survey: value(e, e.survey),
    actual: released ? value(e, e.actual) : '',
    prior: value(e, e.prior),
    revised: value(e, e.revised),
    relevance: e.relevance,
    bars: relevanceBars(e.name, e.relevance),
    released,
    description: '',
    source: e.real ? (e.kind === 'rate' ? "the central bank's own data" : 'FRED (release dates and published values)') : 'generated for the demo',
    real: !!e.real,
    policyStatus: e.policyStatus,
    policyDecision: e.policyDecision,
    timeFrom: e.timeFrom,
    health: e.health,
    chart,
  };
}

/** The first dropdown: what kind of event (the app sorts them by name; its sources give no kind). */
export type EcoType = 'releases' | 'banks' | 'auctions';

export const ECO_TYPES: { id: EcoType; label: string }[] = [
  { id: 'releases', label: 'Economic Releases' },
  { id: 'banks', label: 'Central Banks' },
  { id: 'auctions', label: 'Government Auctions' },
];

const AUCTION = /\bauction\b/i;
const DECISION = /rate decision|rate statement|policy statement|monetary policy (?:statement|decision)|fomc statement/i;
const BANK_TALK = /press conference|speaks|speech|testifies|testimony|minutes|monetary policy report|beige book|policy report/i;

/** The kinds an event belongs to: a rate decision is an economic release and a central bank event at once. */
export function ecoTypesOf(r: Pick<EcoRow, 'name' | 'policyStatus'>): EcoType[] {
  if (AUCTION.test(r.name)) return ['auctions'];
  if (r.policyStatus || DECISION.test(r.name)) return ['releases', 'banks'];
  if (BANK_TALK.test(r.name)) return ['banks'];
  return ['releases'];
}

/** The second dropdown: each kind's subtypes, by the release's name. */
export const ECO_SUBTYPES: Record<EcoType, { id: string; label: string; re?: RegExp }[]> = {
  releases: [
    { id: 'all', label: 'All Economic Releases' },
    { id: 'prices', label: 'Prices', re: /\bcpi\b|\bppi\b|hicp|inflation|price|deflator|\bpce\b/i },
    { id: 'labor', label: 'Labor Market', re: /payroll|employment|unemploy|jobless|jobs|jolts|wage|earnings|labou?r|jobseekers/i },
    { id: 'output', label: 'GDP and Output', re: /\bgdp\b|gross domestic|industrial|production|output|factory|durable|capacity/i },
    { id: 'surveys', label: 'Surveys and Sentiment', re: /\bpmi\b|\bism\b|confidence|sentiment|climate|\bzew\b|\bifo\b|tankan|survey|expectations|\bbsi\b|leading/i },
    { id: 'housing', label: 'Housing and Real Estate', re: /housing|home|mortgage|building|construction|\bhpi\b|real estate/i },
    { id: 'consumer', label: 'Consumer and Retail', re: /retail|consumer|spending|personal income|household/i },
    { id: 'trade', label: 'Trade and Balance of Payments', re: /trade|export|import|current account|balance|reserves|flows/i },
    { id: 'energy', label: 'Energy', re: /crude|\beia\b|gasoline|distillate|heating oil|natural gas|refin|\boil\b/i },
    { id: 'money', label: 'Money and Credit', re: /money supply|\bm[0-3]\b|credit|lending|loans|deposits/i },
  ],
  banks: [
    { id: 'all', label: 'All Central Bank Events' },
    { id: 'decisions', label: 'Rate Decisions and Statements', re: DECISION },
    { id: 'talk', label: 'Speeches and Press Conferences', re: /press conference|speaks|speech|testifies|testimony/i },
    { id: 'reports', label: 'Minutes and Reports', re: /minutes|report|beige book/i },
  ],
  auctions: [{ id: 'all', label: 'All Government Auctions' }],
};

/** Whether a row is of the chosen kind and subtype. */
export function ofKind(r: Pick<EcoRow, 'name' | 'policyStatus'>, type: EcoType, sub: string): boolean {
  if (!ecoTypesOf(r).includes(type)) return false;
  const s = ECO_SUBTYPES[type].find((x) => x.id === sub);
  return !s?.re || s.re.test(r.name) || (type === 'banks' && sub === 'decisions' && !!r.policyStatus);
}

/** ECO's regions, as the terminal's region field takes them, and the countries each covers. */
export const ECO_REGIONS: { id: string; name: string; countries: string[] }[] = [
  { id: 'WORLD', name: 'World', countries: [] },
  { id: 'G7', name: 'G7', countries: ['US', 'CA', 'GB', 'DE', 'FR', 'IT', 'JP', 'EZ', 'EU'] },
  { id: 'AMER', name: 'Americas', countries: ['US', 'CA', 'BR', 'MX', 'AR', 'CL', 'CO'] },
  { id: 'EMEA', name: 'Europe, Middle East and Africa', countries: ['EZ', 'EU', 'DE', 'FR', 'IT', 'ES', 'GB', 'CH', 'SE', 'NO', 'DK', 'NL', 'BE', 'AT', 'IE', 'PT', 'PL', 'CZ', 'FI', 'GR', 'RU', 'TR', 'ZA', 'IL', 'SA'] },
  { id: 'APAC', name: 'Asia/Pacific', countries: ['JP', 'CN', 'AU', 'NZ', 'IN', 'KR', 'SG', 'HK', 'ID', 'TW'] },
];

/** Whether a country is in a region: a region's id, a country's code, or a custom calendar's list of codes. */
export function inRegion(country: string, region: string | string[]): boolean {
  if (Array.isArray(region)) return region.includes(country);
  const r = ECO_REGIONS.find((x) => x.id === region);
  if (r) return !r.countries.length || r.countries.includes(country);
  return country === region;
}
