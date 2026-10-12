import { useEffect, useState } from 'react';
import type { FeedStatus } from './live/status';

/**
 * Every data provider the app uses or has planned, with what it serves, the
 * kind of data it is, the use conditions that apply, and the official pages
 * those come from (checked on the date given). The main process counts each
 * provider's requests and records how they end; the status screen (PROV)
 * puts the two together. See docs/data-providers.md for the full notes.
 */

export type Credential = 'FRED_API_KEY' | 'MASSIVE_API_KEY' | 'SEC_USER_AGENT';

/**
 * enabled: in use; needs-credential: in use once its key is configured;
 * planned: adapter not built yet; disabled: switched off by policy.
 */
export type ProviderPolicy = 'enabled' | 'needs-credential' | 'planned' | 'disabled';

export interface ProviderDef {
  /** The id the main process records requests under. */
  id: string;
  name: string;
  /** What the app takes from it. */
  serves: string;
  /** What kind of data it is, in the terms the screens use. */
  dataClass: string;
  policy: ProviderPolicy;
  credential?: Credential;
  /** The feed light this provider drives, if any. */
  feed?: keyof Omit<FeedStatus, 'detail'>;
  /** The app's own ceiling on requests, below what the provider allows. */
  limit?: string;
  /** Conditions of use that matter for this app, in one or two sentences. */
  terms: string;
  docs: { label: string; url: string }[];
  /** ISO date the docs and terms were last read. */
  checked: string;
  /** Desktop app only (the browser build has no backend). */
  desktop: boolean;
}

const CHECKED = '2026-10-12';

/**
 * The browser build's own feeds (Coinbase crypto, ECB rates through Frankfurter,
 * Finnhub quotes, news and lookups) stay off: Finnhub needed an API key held in
 * the browser, and none of their terms have been reviewed for this use. The
 * browser build is a demo; real data comes through the desktop app.
 */
export const BROWSER_FEEDS_ENABLED = false;

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'yahoo',
    name: 'Yahoo Finance',
    serves: 'Quotes, price history, company profiles and statements, analyst fields, holders, options chains, news headlines, symbol search',
    dataClass: 'Yahoo Finance quote: live or delayed as Yahoo labels each exchange; history end of day',
    policy: 'enabled',
    feed: 'market',
    terms: 'Personal use only and no redistribution (Yahoo\'s help page). Yahoo\'s terms of service forbid collecting data by automated means without permission: a known risk this private app accepts. The endpoints are undocumented and can change or stop without notice.',
    docs: [
      { label: 'Exchanges, data providers and delays', url: 'https://help.yahoo.com/kb/finance/SLN2310.html' },
      { label: 'Yahoo terms of service', url: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html' },
      { label: 'Yahoo API terms', url: 'https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apitnc/index.html' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'yahoo-stream',
    name: 'Yahoo Finance streaming',
    serves: 'Price updates pushed as trades print, for the securities on screen',
    dataClass: 'Yahoo Finance quote (streamed)',
    policy: 'enabled',
    terms: 'Same as Yahoo Finance.',
    docs: [{ label: 'Exchanges, data providers and delays', url: 'https://help.yahoo.com/kb/finance/SLN2310.html' }],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'treasury',
    name: 'US Treasury',
    serves: 'Daily par yield curve, 1 month to 30 years',
    dataClass: 'End of day (official)',
    policy: 'enabled',
    feed: 'rates',
    terms: 'A Treasury publication: the par curve is fitted to indicative bid-side quotes the New York Fed collects near 3:30 pm New York time each trading day.',
    docs: [
      { label: 'Daily par yield curve rates', url: 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve' },
      { label: 'Yield curve methodology', url: 'https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'nyfed',
    name: 'Federal Reserve Bank of New York',
    serves: 'Effective fed funds rate and target range, SOFR and the other reference rates',
    dataClass: 'Daily reference rates (official)',
    policy: 'enabled',
    feed: 'policy',
    terms: 'EFFR is published about 9:00 am New York time each business day and can be revised by about 2:30 pm. The New York Fed\'s terms of use apply; their text needs a browser and was not reviewed in this check.',
    docs: [
      { label: 'Markets data API', url: 'https://markets.newyorkfed.org/static/docs/markets-api.html' },
      { label: 'About the reference rates', url: 'https://www.newyorkfed.org/markets/reference-rates/additional-information-about-reference-rates' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'fedboard',
    name: 'Federal Reserve Board',
    serves: 'FOMC meeting calendar',
    dataClass: 'Official calendar',
    policy: 'enabled',
    feed: 'policy',
    terms: 'Public domain unless marked otherwise; cite the Board as the source.',
    docs: [
      { label: 'FOMC calendars', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
      { label: 'Website policies', url: 'https://www.federalreserve.gov/disclaimer.htm' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'ecb',
    name: 'European Central Bank',
    serves: 'Deposit facility rate',
    dataClass: 'Policy rate (official)',
    policy: 'enabled',
    feed: 'policy',
    terms: 'ESCB statistics may be reused free of charge if the source is quoted (Source: ECB statistics) and the figures are not modified.',
    docs: [
      { label: 'ECB Data Portal API', url: 'https://data.ecb.europa.eu/help/api/overview' },
      { label: 'Reuse policy', url: 'https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'boe',
    name: 'Bank of England',
    serves: 'Bank Rate; nominal par gilt yields (5, 10 and 20 years)',
    dataClass: 'Policy rate; end-of-day fitted yields (official)',
    policy: 'enabled',
    feed: 'yields',
    terms: 'Database figures are reproduced under the UK Open Government Licence; some exchange-rate series are excluded.',
    docs: [
      { label: 'Bank of England Database', url: 'https://www.bankofengland.co.uk/boeapps/database/' },
      { label: 'Legal and reuse', url: 'https://www.bankofengland.co.uk/legal' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'boc',
    name: 'Bank of Canada',
    serves: 'Policy rate; benchmark bond yields',
    dataClass: 'Policy rate; end-of-day yields (official)',
    policy: 'enabled',
    feed: 'yields',
    terms: 'Free to use with the Bank of Canada named as the source and any changes indicated.',
    docs: [
      { label: 'Valet API', url: 'https://www.bankofcanada.ca/valet/docs' },
      { label: 'Terms of use', url: 'https://www.bankofcanada.ca/terms/' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'rba',
    name: 'Reserve Bank of Australia',
    serves: 'Cash rate target; government bond yields (table F2)',
    dataClass: 'Policy rate; end-of-day yields (official)',
    policy: 'enabled',
    feed: 'yields',
    terms: 'Creative Commons Attribution 4.0: free to use with the RBA properly attributed.',
    docs: [
      { label: 'Statistical tables', url: 'https://www.rba.gov.au/statistics/tables/' },
      { label: 'Copyright and licence', url: 'https://www.rba.gov.au/copyright/' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'snb',
    name: 'Swiss National Bank',
    serves: 'SNB policy rate',
    dataClass: 'Policy rate (official)',
    policy: 'enabled',
    feed: 'policy',
    terms: 'Not verified: the SNB\'s legal page did not load in this check.',
    docs: [{ label: 'SNB data portal', url: 'https://data.snb.ch/en' }],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'bcb',
    name: 'Banco Central do Brasil',
    serves: 'Selic target',
    dataClass: 'Policy rate (official)',
    policy: 'enabled',
    feed: 'policy',
    terms: 'Published on the central bank\'s open data portal; its terms were not reviewed in this check.',
    docs: [{ label: 'Selic target (series 432)', url: 'https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom' }],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'bundesbank',
    name: 'Deutsche Bundesbank',
    serves: 'German government zero-coupon yields (Svensson curve), 2, 5, 10 and 30 years',
    dataClass: 'End-of-day fitted yields (official)',
    policy: 'enabled',
    feed: 'yields',
    terms: 'The Bundesbank is a national central bank of the ESCB, whose statistics may be reused free of charge with the source quoted; the Bundesbank\'s own terms were not reviewed in this check.',
    docs: [
      { label: 'Time series API', url: 'https://api.statistiken.bundesbank.de/doc/index.html' },
      { label: 'ESCB reuse policy', url: 'https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'mof',
    name: 'Ministry of Finance Japan',
    serves: 'JGB yields at constant maturities',
    dataClass: 'End-of-day yields (official)',
    policy: 'enabled',
    feed: 'yields',
    terms: 'Not verified: the Ministry\'s terms page did not load in this check.',
    docs: [{ label: 'JGB interest rates', url: 'https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm' }],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'ons',
    name: 'Office for National Statistics',
    serves: 'UK CPI, GDP growth and unemployment',
    dataClass: 'Economic release (official)',
    policy: 'enabled',
    feed: 'eco',
    terms: 'Open Government Licence v3.0: free reuse; credit: Source: Office for National Statistics licensed under the Open Government Licence v.3.0.',
    docs: [
      { label: 'ONS time series', url: 'https://www.ons.gov.uk/timeseriestool' },
      { label: 'Licences', url: 'https://www.ons.gov.uk/methodology/geography/licences' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'eurostat',
    name: 'Eurostat',
    serves: 'HICP inflation, GDP growth and unemployment for the euro area and its largest members',
    dataClass: 'Economic release (official), with flash-estimate and provisional flags',
    policy: 'enabled',
    feed: 'eco',
    terms: 'Reuse, commercial or not, is authorised provided the source is acknowledged; any change to the data must be stated.',
    docs: [
      { label: 'API introduction', url: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-introduction' },
      { label: 'Statistics API guide', url: 'https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/api' },
      { label: 'Copyright and reuse', url: 'https://ec.europa.eu/eurostat/en/help/copyright-notice' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'fred',
    name: 'FRED (St. Louis Fed)',
    serves: 'US release dates and published values; OECD series for Japan, Canada and Australia',
    dataClass: 'Economic release (official, republished by FRED)',
    policy: 'enabled',
    credential: 'FRED_API_KEY',
    feed: 'eco',
    limit: '60',
    terms: 'Each user needs their own API key; the site terms rule out scraping. Cite FRED and the original source; series marked Copyrighted are for personal use only without the owner\'s permission. API version 1 allows up to 120 requests a minute; the app sends at most 60.',
    docs: [
      { label: 'FRED API', url: 'https://fred.stlouisfed.org/docs/api/fred/' },
      { label: 'API keys (version 1)', url: 'https://fred.stlouisfed.org/docs/api/api_key.html' },
      { label: 'Errors and rate limit', url: 'https://fred.stlouisfed.org/docs/api/fred/errors.html' },
      { label: 'API terms of use', url: 'https://fred.stlouisfed.org/docs/api/terms_of_use.html' },
      { label: 'FRED terms', url: 'https://fred.stlouisfed.org/legal/' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'sec',
    name: 'SEC EDGAR',
    serves: 'Company filings and reported financial facts (planned)',
    dataClass: 'Filing-reported',
    policy: 'planned',
    credential: 'SEC_USER_AGENT',
    terms: 'Free public data, no key. Every request must declare a User-Agent with your contact email, at most 10 requests a second.',
    docs: [
      { label: 'Accessing EDGAR data', url: 'https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data' },
      { label: 'EDGAR APIs', url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'massive',
    name: 'Massive (formerly Polygon.io)',
    serves: 'US stock end-of-day history (planned)',
    dataClass: 'End of day',
    policy: 'planned',
    credential: 'MASSIVE_API_KEY',
    terms: 'Personal, non-commercial, non-business use as a non-professional; no redistribution or display to anyone else, derived works included.',
    docs: [
      { label: 'Stocks pricing', url: 'https://massive.com/pricing?product=stocks' },
      { label: 'Stocks REST docs', url: 'https://massive.com/docs/rest/stocks' },
      { label: 'Individual terms', url: 'https://www.massive.com/legal/individuals-terms-of-service' },
      { label: 'Market data terms', url: 'https://massive.com/legal/market-data-terms-of-service' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    serves: 'Nothing: switched off',
    dataClass: 'None',
    policy: 'disabled',
    terms: 'Not approved: it needed an API key held in the browser, and its terms have not been reviewed for this use.',
    docs: [{ label: 'Terms of service', url: 'https://finnhub.io/terms-of-service' }],
    checked: CHECKED,
    desktop: false,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Exchange (browser build)',
    serves: 'Nothing: switched off',
    dataClass: 'None',
    policy: 'disabled',
    terms: 'Not approved: its market data terms have not been reviewed for this use. The desktop app takes crypto prices from Yahoo Finance.',
    docs: [{ label: 'Exchange API', url: 'https://docs.cdp.coinbase.com/exchange/docs/welcome' }],
    checked: CHECKED,
    desktop: false,
  },
  {
    id: 'frankfurter',
    name: 'Frankfurter (browser build)',
    serves: 'Nothing: switched off',
    dataClass: 'None',
    policy: 'disabled',
    terms: 'Not approved: its terms have not been reviewed for this use. The desktop app takes FX rates from Yahoo Finance.',
    docs: [{ label: 'Frankfurter', url: 'https://frankfurter.dev/' }],
    checked: CHECKED,
    desktop: false,
  },
];

export interface CredentialState {
  label: string;
  configured: boolean;
  valid: boolean;
  source: string | null;
}

export interface ProviderStats {
  lastMinute: number;
  total: number;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastErrorKind: string | null;
}

export interface ProviderReport {
  credentials: Partial<Record<Credential, CredentialState>>;
  providers: Record<string, ProviderStats>;
}

export function providersAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.arminDesktop?.providersStatus === 'function';
}

/** The main process's view of providers and credentials, refreshed every few seconds while a screen shows it. */
export function useProviderReport(refreshMs = 3000): [ProviderReport | null, () => void] {
  const [report, setReport] = useState<ProviderReport | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!providersAvailable()) return;
    let live = true;
    const load = () =>
      void window
        .arminDesktop!.providersStatus!()
        .then((r) => live && setReport(r))
        .catch(() => undefined);
    load();
    const t = setInterval(load, refreshMs);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [refreshMs, n]);
  return [report, () => setN((x) => x + 1)];
}

export type ProviderState = 'live' | 'ok' | 'idle' | 'error' | 'not-configured' | 'planned' | 'disabled';

/** One word for a provider's state from its policy, credential and recent requests. */
export function providerState(def: ProviderDef, report: ProviderReport | null, feed?: string): ProviderState {
  if (def.policy === 'disabled') return 'disabled';
  if (def.policy === 'planned') return 'planned';
  if (def.credential && !report?.credentials[def.credential]?.configured) return 'not-configured';
  const s = report?.providers[def.id];
  // "No data" for one symbol or series is an answer, not a failure of the provider.
  if (s?.lastErrorAt && s.lastErrorKind !== 'no-data' && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt)) return 'error';
  if (feed === 'live' && s?.lastSuccessAt) return 'live';
  if (s?.lastSuccessAt) return 'ok';
  return 'idle';
}
