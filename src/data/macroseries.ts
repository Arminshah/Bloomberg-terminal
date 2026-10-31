// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
/**
 * The series on the macro dashboard (MACRO), all from the FRED API, which
 * republishes each agency's figures. Each line names the agency that
 * publishes the figure, its frequency and how it is shown. The app forecasts
 * nothing: every value is a published observation or a change worked out
 * from two of them. One line is a published nowcast, the Atlanta Fed's
 * GDPNow, and says so: the current quarter's figure is revised as the
 * month's data arrive, and a past quarter keeps its last nowcast before the
 * BEA's advance estimate. The Cleveland Fed's inflation nowcasts are the same
 * kind: this month's change in CPI and PCE prices, from its own file (ids
 * CLEV:...), not FRED.
 */

export type MacroFreq = 'd' | 'w' | 'm' | 'q';

/** level: as published; yoy: change on a year earlier, %; diff: change on the period before, in the series' units. */
export type MacroCalc = 'level' | 'yoy' | 'diff';

export interface MacroSeries {
  /** FRED series id. */
  id: string;
  label: string;
  group: 'Policy and rates' | 'Inflation' | 'Labour' | 'Growth' | 'Money and credit' | 'Financial conditions' | 'Recession signals';
  freq: MacroFreq;
  calc: MacroCalc;
  unit: string;
  dec: number;
  /** Multiplier to the shown units (claims in people to thousands, say). */
  scale?: number;
  /** Who publishes the figure FRED republishes. */
  source: string;
  /** The owner restricts reuse beyond personal use (FRED marks such series Copyrighted). */
  copyrighted?: boolean;
  /** Words that pick this line on MACRO <word>. */
  keys: string[];
}

export const MACRO_SERIES: MacroSeries[] = [
  { id: 'DFEDTARU', label: 'Fed funds target, upper', group: 'Policy and rates', freq: 'd', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Board', keys: ['FED', 'RATES', 'POLICY'] },
  { id: 'EFFR', label: 'Effective fed funds rate', group: 'Policy and rates', freq: 'd', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Bank of New York', keys: ['FED', 'RATES', 'EFFR'] },
  { id: 'DGS2', label: '2-year Treasury', group: 'Policy and rates', freq: 'd', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Board (H.15)', keys: ['RATES', 'YIELDS', 'TREASURY'] },
  { id: 'DGS10', label: '10-year Treasury', group: 'Policy and rates', freq: 'd', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Board (H.15)', keys: ['RATES', 'YIELDS', 'TREASURY'] },
  { id: 'T10Y2Y', label: '10-year minus 2-year', group: 'Policy and rates', freq: 'd', calc: 'level', unit: 'pts', dec: 2, source: 'Federal Reserve Bank of St. Louis', keys: ['CURVE', 'SPREAD', 'RECESSION'] },
  { id: 'T10Y3M', label: '10-year minus 3-month', group: 'Policy and rates', freq: 'd', calc: 'level', unit: 'pts', dec: 2, source: 'Federal Reserve Bank of St. Louis', keys: ['CURVE', 'SPREAD', 'RECESSION'] },
  { id: 'CPIAUCSL', label: 'CPI, all items, YoY', group: 'Inflation', freq: 'm', calc: 'yoy', unit: '%', dec: 1, source: 'US Bureau of Labor Statistics', keys: ['CPI', 'INFLATION'] },
  { id: 'CPILFESL', label: 'CPI less food and energy, YoY', group: 'Inflation', freq: 'm', calc: 'yoy', unit: '%', dec: 1, source: 'US Bureau of Labor Statistics', keys: ['CPI', 'CORE', 'INFLATION'] },
  { id: 'PCEPILFE', label: 'PCE price index less food and energy, YoY', group: 'Inflation', freq: 'm', calc: 'yoy', unit: '%', dec: 1, source: 'US Bureau of Economic Analysis', keys: ['PCE', 'CORE', 'INFLATION'] },
  { id: 'CLEV:CPI', label: 'Cleveland Fed nowcast: CPI, this month, MoM', group: 'Inflation', freq: 'm', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Bank of Cleveland (a model nowcast, updated each business day)', keys: ['CPI', 'INFLATION', 'NOWCAST'] },
  { id: 'CLEV:CORECPI', label: 'Cleveland Fed nowcast: core CPI, this month, MoM', group: 'Inflation', freq: 'm', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Bank of Cleveland (a model nowcast, updated each business day)', keys: ['CPI', 'CORE', 'INFLATION', 'NOWCAST'] },
  { id: 'CLEV:PCE', label: 'Cleveland Fed nowcast: PCE prices, this month, MoM', group: 'Inflation', freq: 'm', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Bank of Cleveland (a model nowcast, updated each business day)', keys: ['PCE', 'INFLATION', 'NOWCAST'] },
  { id: 'CLEV:COREPCE', label: 'Cleveland Fed nowcast: core PCE prices, this month, MoM', group: 'Inflation', freq: 'm', calc: 'level', unit: '%', dec: 2, source: 'Federal Reserve Bank of Cleveland (a model nowcast, updated each business day)', keys: ['PCE', 'CORE', 'INFLATION', 'NOWCAST'] },
  { id: 'UNRATE', label: 'Unemployment rate', group: 'Labour', freq: 'm', calc: 'level', unit: '%', dec: 1, source: 'US Bureau of Labor Statistics', keys: ['JOBS', 'UNEMPLOYMENT', 'LABOR', 'LABOUR'] },
  { id: 'PAYEMS', label: 'Nonfarm payrolls, monthly change', group: 'Labour', freq: 'm', calc: 'diff', unit: 'k', dec: 0, source: 'US Bureau of Labor Statistics', keys: ['JOBS', 'PAYROLLS', 'NFP', 'LABOR', 'LABOUR'] },
  { id: 'ICSA', label: 'Initial jobless claims', group: 'Labour', freq: 'w', calc: 'level', unit: 'k', dec: 0, scale: 0.001, source: 'US Department of Labor', keys: ['JOBS', 'CLAIMS', 'LABOR', 'LABOUR'] },
  { id: 'A191RL1Q225SBEA', label: 'Real GDP, annualised QoQ', group: 'Growth', freq: 'q', calc: 'level', unit: '%', dec: 1, source: 'US Bureau of Economic Analysis', keys: ['GDP', 'GROWTH'] },
  { id: 'GDPNOW', label: "Atlanta Fed GDPNow: the quarter's real GDP nowcast, annualised", group: 'Growth', freq: 'q', calc: 'level', unit: '%', dec: 1, source: 'Federal Reserve Bank of Atlanta (a model nowcast, revised through the quarter)', keys: ['GDP', 'GROWTH', 'NOWCAST', 'GDPNOW'] },
  { id: 'INDPRO', label: 'Industrial production, YoY', group: 'Growth', freq: 'm', calc: 'yoy', unit: '%', dec: 1, source: 'Federal Reserve Board', keys: ['GROWTH', 'PRODUCTION', 'IP'] },
  { id: 'M2SL', label: 'M2 money stock, YoY', group: 'Money and credit', freq: 'm', calc: 'yoy', unit: '%', dec: 1, source: 'Federal Reserve Board', keys: ['MONEY', 'M2'] },
  { id: 'BAMLC0A0CM', label: 'US corporate investment-grade spread (OAS)', group: 'Money and credit', freq: 'd', calc: 'level', unit: 'pts', dec: 2, source: 'ICE Data Indices', copyrighted: true, keys: ['CREDIT', 'SPREADS', 'IG'] },
  { id: 'BAMLH0A0HYM2', label: 'US high-yield spread (OAS)', group: 'Money and credit', freq: 'd', calc: 'level', unit: 'pts', dec: 2, source: 'ICE Data Indices', copyrighted: true, keys: ['CREDIT', 'SPREADS', 'HY'] },
  { id: 'NFCI', label: 'Chicago Fed National Financial Conditions Index', group: 'Financial conditions', freq: 'w', calc: 'level', unit: '', dec: 2, source: 'Federal Reserve Bank of Chicago', keys: ['CONDITIONS', 'NFCI', 'STRESS'] },
  { id: 'STLFSI4', label: 'St. Louis Fed Financial Stress Index', group: 'Financial conditions', freq: 'w', calc: 'level', unit: '', dec: 2, source: 'Federal Reserve Bank of St. Louis', keys: ['CONDITIONS', 'STRESS'] },
  { id: 'SAHMREALTIME', label: 'Sahm rule recession indicator (real time)', group: 'Recession signals', freq: 'm', calc: 'level', unit: 'pts', dec: 2, source: 'Claudia Sahm; Federal Reserve Bank of St. Louis', keys: ['RECESSION', 'SAHM'] },
  { id: 'USREC', label: 'NBER recession indicator (1 = recession)', group: 'Recession signals', freq: 'm', calc: 'level', unit: '', dec: 0, source: 'National Bureau of Economic Research; Federal Reserve Bank of St. Louis', keys: ['RECESSION', 'NBER'] },
];

/** Series whose first published values MACRO compares with today's (ALFRED vintages). */
export const FIRST_RELEASE_IDS = ['PAYEMS', 'A191RL1Q225SBEA'];

/** FRED's terms ask every application to show this notice. */
export const FRED_NOTICE = 'This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.';
export const FRED_TERMS_URL = 'https://fred.stlouisfed.org/docs/api/terms_of_use.html';
