// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { fmtDay } from '../core/format';
import { COMPUTED_GROWTH, COUNTRY_STATS, EUROSTAT_MEMBERS, figurePeriod, figureStatus, previousPeriod, valueAt, type Calc, type Freq, type Obs } from './live/fred';

/**
 * ECST's indicators: each country's categories (the tree at the left), their sections (the cyan heads on the right)
 * and their rows, each a series the app already reads with the way its figure is worked out. The labels follow the
 * terminal's ("Real GDP (qoq %, saar)"); the Ticker column shows the source's own series code, as the terminal's
 * tickers are its own.
 */
export interface StatDef {
  label: string;
  series: string;
  calc: Calc;
  /** 'd' for a daily series, whose figures are its last two values. */
  freq: Freq | 'd';
  dec: number;
  scale?: number;
  /** The publisher. */
  source: string;
  /** A figure worked out here rather than published as such. */
  note?: string;
  /** A rate set in steps (a policy target): Current is the level and the day it took effect, Previous the one before. */
  step?: boolean;
}

export interface StatSection {
  title: string;
  rows: StatDef[];
}

export interface StatCategory {
  name: string;
  sections: StatSection[];
}

const BEA = 'US Bureau of Economic Analysis';
const BLS = 'US Bureau of Labor Statistics';
const CENSUS = 'US Census Bureau';
const FED = 'Federal Reserve Board';

const US = {
  gdpQ: { label: 'Real GDP (qoq %, saar)', series: 'A191RL1Q225SBEA', calc: 'level', freq: 'q', dec: 1, source: BEA },
  gdpY: { label: 'Real GDP (yoy %)', series: 'A191RO1Q156NBEA', calc: 'level', freq: 'q', dec: 1, source: BEA },
  gdpNow: { label: 'GDPNow Nowcast (qoq %, saar)', series: 'GDPNOW', calc: 'level', freq: 'q', dec: 1, source: 'Federal Reserve Bank of Atlanta', note: 'A model nowcast of the quarter, revised through it' },
  cpiM: { label: 'CPI (mom %, sa)', series: 'CPIAUCSL', calc: 'mom', freq: 'm', dec: 1, source: BLS },
  cpiY: { label: 'CPI (yoy %)', series: 'CPIAUCNS', calc: 'yoy', freq: 'm', dec: 1, source: BLS },
  coreM: { label: 'CPI Ex Food and Energy (mom %, sa)', series: 'CPILFESL', calc: 'mom', freq: 'm', dec: 1, source: BLS },
  coreY: { label: 'CPI Ex Food and Energy (yoy %)', series: 'CPILFENS', calc: 'yoy', freq: 'm', dec: 1, source: BLS },
  pceY: { label: 'PCE Price Index (yoy %)', series: 'PCEPI', calc: 'yoy', freq: 'm', dec: 1, source: BEA },
  corePceM: { label: 'Core PCE Price Index (mom %, sa)', series: 'PCEPILFE', calc: 'mom', freq: 'm', dec: 1, source: BEA },
  corePceY: { label: 'Core PCE Price Index (yoy %)', series: 'PCEPILFE', calc: 'yoy', freq: 'm', dec: 1, source: BEA },
  ppiM: { label: 'PPI Final Demand (mom %, sa)', series: 'PPIFIS', calc: 'mom', freq: 'm', dec: 1, source: BLS },
  nfp: { label: 'Change in Nonfarm Payrolls (k, sa)', series: 'PAYEMS', calc: 'diff', freq: 'm', dec: 0, source: BLS },
  ur: { label: 'Unemployment Rate (%, sa)', series: 'UNRATE', calc: 'level', freq: 'm', dec: 1, source: BLS },
  claims: { label: 'Initial Jobless Claims (k, sa)', series: 'ICSA', calc: 'level', freq: 'w', dec: 0, scale: 0.001, source: 'US Department of Labor' },
  jolts: { label: 'JOLTS Job Openings (k, sa)', series: 'JTSJOL', calc: 'level', freq: 'm', dec: 0, source: BLS },
  sahm: { label: 'Sahm Rule Recession Indicator (pts)', series: 'SAHMREALTIME', calc: 'level', freq: 'm', dec: 2, source: 'Federal Reserve Bank of St. Louis' },
  retailM: { label: 'Retail Sales Advance (mom %, sa)', series: 'RSAFS', calc: 'mom', freq: 'm', dec: 1, source: CENSUS },
  retailY: { label: 'Retail Sales Advance (yoy %)', series: 'RSAFS', calc: 'yoy', freq: 'm', dec: 1, source: CENSUS },
  ipM: { label: 'Industrial Production (mom %, sa)', series: 'INDPRO', calc: 'mom', freq: 'm', dec: 1, source: FED },
  ipY: { label: 'Industrial Production (yoy %)', series: 'INDPRO', calc: 'yoy', freq: 'm', dec: 1, source: FED },
  durables: { label: 'Durable Goods New Orders (mom %, sa)', series: 'DGORDER', calc: 'mom', freq: 'm', dec: 1, source: CENSUS },
  factory: { label: 'Factory Orders (mom %, sa)', series: 'AMTMNO', calc: 'mom', freq: 'm', dec: 1, source: CENSUS },
  starts: { label: 'Housing Starts (k, saar)', series: 'HOUST', calc: 'level', freq: 'm', dec: 0, source: CENSUS },
  newHomes: { label: 'New Home Sales (k, saar)', series: 'HSN1F', calc: 'level', freq: 'm', dec: 0, source: CENSUS },
  trade: { label: 'Trade Balance (USD bn, sa)', series: 'BOPGSTB', calc: 'level', freq: 'm', dec: 1, scale: 0.001, source: CENSUS },
  ffUpper: { label: 'Fed Funds Target Rate, Upper Bound (%)', series: 'DFEDTARU', calc: 'level', freq: 'd', dec: 2, source: FED, step: true },
  effr: { label: 'Effective Fed Funds Rate (%)', series: 'EFFR', calc: 'level', freq: 'd', dec: 2, source: 'Federal Reserve Bank of New York' },
  m2: { label: 'M2 Money Stock (yoy %)', series: 'M2SL', calc: 'yoy', freq: 'm', dec: 1, source: FED },
  y2: { label: '2-Year Treasury Yield (%)', series: 'DGS2', calc: 'level', freq: 'd', dec: 2, source: 'Federal Reserve Board (H.15)' },
  y10: { label: '10-Year Treasury Yield (%)', series: 'DGS10', calc: 'level', freq: 'd', dec: 2, source: 'Federal Reserve Board (H.15)' },
  s210: { label: '10-Year less 2-Year (pts)', series: 'T10Y2Y', calc: 'level', freq: 'd', dec: 2, source: 'Federal Reserve Bank of St. Louis' },
  s3m10: { label: '10-Year less 3-Month (pts)', series: 'T10Y3M', calc: 'level', freq: 'd', dec: 2, source: 'Federal Reserve Bank of St. Louis' },
  nfci: { label: 'Chicago Fed National Financial Conditions', series: 'NFCI', calc: 'level', freq: 'w', dec: 2, source: 'Federal Reserve Bank of Chicago' },
  stress: { label: 'St. Louis Fed Financial Stress Index', series: 'STLFSI4', calc: 'level', freq: 'w', dec: 2, source: 'Federal Reserve Bank of St. Louis' },
} satisfies Record<string, StatDef>;

const US_TREE: StatCategory[] = [
  {
    name: 'Key Indicators',
    sections: [
      { title: 'National Accounts', rows: [US.gdpQ, US.gdpY] },
      { title: 'Consumer Prices', rows: [US.cpiM, US.cpiY, US.coreM, US.coreY, US.corePceY] },
      { title: 'Producer Prices', rows: [US.ppiM] },
      { title: 'Labor Market', rows: [US.nfp, US.ur, US.claims] },
      { title: 'Economic Activity', rows: [US.retailM, US.ipM, US.durables] },
      { title: 'Housing Market', rows: [US.starts, US.newHomes] },
      { title: 'External Sector', rows: [US.trade] },
      { title: 'Monetary Sector', rows: [US.ffUpper, US.m2] },
    ],
  },
  { name: 'National Accounts (GDP)', sections: [{ title: 'Gross Domestic Product', rows: [US.gdpQ, US.gdpY, US.gdpNow] }] },
  {
    name: 'Prices',
    sections: [
      { title: 'Consumer Prices', rows: [US.cpiM, US.cpiY, US.coreM, US.coreY] },
      { title: 'Personal Consumption Expenditure Prices', rows: [US.pceY, US.corePceM, US.corePceY] },
      { title: 'Producer Prices', rows: [US.ppiM] },
    ],
  },
  { name: 'Labor Market', sections: [{ title: 'Employment', rows: [US.nfp, US.ur, US.claims, US.jolts, US.sahm] }] },
  { name: 'Retail & Wholesale Sector', sections: [{ title: 'Retail Sales', rows: [US.retailM, US.retailY] }] },
  { name: 'Industrial Sector', sections: [{ title: 'Production and Orders', rows: [US.ipM, US.ipY, US.durables, US.factory] }] },
  { name: 'Housing and Real Estate', sections: [{ title: 'Housing', rows: [US.starts, US.newHomes] }] },
  { name: 'Intl Trade & BoP', sections: [{ title: 'Trade', rows: [US.trade] }] },
  { name: 'Monetary Sector', sections: [{ title: 'Policy Rates and Money', rows: [US.ffUpper, US.effr, US.m2] }] },
  { name: 'Financial Indicators', sections: [{ title: 'Treasury Yields', rows: [US.y2, US.y10, US.s210, US.s3m10] }, { title: 'Financial Conditions', rows: [US.nfci, US.stress] }] },
];

/** The countries ECST lists in the desktop app: those whose statistics offices the app reads. */
export const ECST_COUNTRIES = ['US', 'EZ', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'GB', 'JP', 'CA', 'AU'];

const PUBLISHER: Record<string, string> = {
  ESTAT: 'Eurostat',
  ONS: 'Office for National Statistics',
  STATCAN: 'Statistics Canada',
  ABS: 'Australian Bureau of Statistics',
};

const publisher = (id: string, fallback: string) => PUBLISHER[id.split(':')[0]] ?? fallback;

/** A country other than the US: its growth, inflation and unemployment, as the statistics offices publish them. */
function countryTree(c: string): StatCategory[] {
  const k = COUNTRY_STATS[c];
  if (!k) return [];
  const eu = c === 'EZ' || EUROSTAT_MEMBERS.includes(c);
  const gdp: StatDef | null = k.gdp
    ? {
        label: 'Real GDP (yoy %)',
        series: k.gdp[0],
        calc: k.gdp[2] ?? 'yoy',
        freq: k.gdp[1],
        dec: 1,
        source: publisher(k.gdp[0], c === 'JP' ? "Japan's Cabinet Office, via FRED" : "the IMF's International Financial Statistics, via FRED"),
        note: COMPUTED_GROWTH.has(c) ? 'Worked out from the real GDP level a year earlier' : undefined,
      }
    : null;
  const cpi: StatDef | null = k.cpi ? { label: eu ? 'HICP (yoy %)' : 'CPI (yoy %)', series: k.cpi[0], calc: k.cpi[2] ?? 'yoy', freq: k.cpi[1], dec: 1, source: publisher(k.cpi[0], 'FRED') } : null;
  const un: StatDef | null = k.un
    ? { label: c === 'GB' ? 'ILO Unemployment Rate, 3 months (%)' : 'Unemployment Rate (%)', series: k.un[0], calc: 'level', freq: k.un[1], dec: 1, source: publisher(k.un[0], c === 'JP' ? 'OECD harmonised rate, via FRED' : 'FRED') }
    : null;
  const sec = (title: string, rows: (StatDef | null)[]) => ({ title, rows: rows.filter((r): r is StatDef => !!r) });
  const key = [sec('National Accounts', [gdp]), sec('Consumer Prices', [cpi]), sec('Labor Market', [un])].filter((s) => s.rows.length);
  return [
    { name: 'Key Indicators', sections: key },
    ...(gdp ? [{ name: 'National Accounts (GDP)', sections: [sec('Gross Domestic Product', [gdp])] }] : []),
    ...(cpi ? [{ name: 'Prices', sections: [sec('Consumer Prices', [cpi])] }] : []),
    ...(un ? [{ name: 'Labor Market', sections: [sec('Employment', [un])] }] : []),
  ];
}

/** A country's categories, sections and rows. */
export function ecstTree(c: string): StatCategory[] {
  return c === 'US' ? US_TREE : countryTree(c);
}

export interface Figure {
  v: number;
  /** The period's label as the terminal writes it ("Q3 2026", "Sep 2026", a day for a daily or weekly series). */
  period: string;
  /** The period's own key (its first day, or the day for a daily series). */
  at: string;
}

/** "3Q 2026" as the terminal writes it: "Q3 2026". */
const termPeriod = (s: string) => s.replace(/^(\d)Q (\d{4})/, 'Q$1 $2');

function labelOf(def: StatDef, p: string): string {
  if (def.freq === 'd' || def.freq === 'w') return fmtDay(Date.parse(`${p}T00:00:00Z`));
  const status = figureStatus(def.series, p);
  return `${termPeriod(figurePeriod(def.series, p, def.freq))}${status ? ` (${status})` : ''}`;
}

/** A row's latest figure and the one before it, each with its period; null where the source has none. */
export function currentAndPrevious(def: StatDef, obs: Obs | undefined): { cur: Figure | null; prev: Figure | null } {
  if (!obs?.length) return { cur: null, prev: null };
  const scale = def.scale ?? 1;
  if (def.freq === 'd') {
    const n = obs.length;
    const fig = (i: number): Figure | null => (i >= 0 ? { v: obs[i][1] * scale, period: labelOf(def, obs[i][0]), at: obs[i][0] } : null);
    if (!def.step) return { cur: fig(n - 1), prev: fig(n - 2) };
    // The first day of each level: walk back to where the current level began, then to where the one before began.
    const start = (end: number) => {
      let i = end;
      while (i > 0 && obs[i - 1][1] === obs[end][1]) i--;
      return i;
    };
    const c = start(n - 1);
    return { cur: fig(c), prev: c > 0 ? fig(start(c - 1)) : null };
  }
  const freq = def.freq;
  const at = (p: string): Figure | null => {
    const v = valueAt(obs, p, def.calc, freq, scale);
    return v == null ? null : { v, period: labelOf(def, p), at: p };
  };
  const cur = at(obs[obs.length - 1][0]);
  return { cur, prev: cur ? at(previousPeriod(cur.at, freq)) : null };
}

/** A row's history for its chart: each period's figure, oldest first, over the last `years`. */
export function history(def: StatDef, obs: Obs | undefined, years = 5): { t: number; v: number }[] {
  if (!obs?.length) return [];
  const from = Date.parse(obs[obs.length - 1][0]) - years * 365.25 * 86_400_000;
  const out: { t: number; v: number }[] = [];
  for (const [d, raw] of obs) {
    const t = Date.parse(`${d}T00:00:00Z`);
    if (t < from) continue;
    const v = def.freq === 'd' ? raw * (def.scale ?? 1) : valueAt(obs, d, def.calc, def.freq, def.scale ?? 1);
    if (v != null && Number.isFinite(v)) out.push({ t, v });
  }
  return out;
}

/** The source's own code for a series, for the Ticker column ("ESTAT:HICP:DE" reads "Eurostat HICP DE"). */
export function tickerOf(series: string): string {
  const [head, ...rest] = series.split(':');
  return rest.length ? `${PUBLISHER[head] === 'Eurostat' ? 'Eurostat' : head} ${rest.join(' ')}` : series;
}
