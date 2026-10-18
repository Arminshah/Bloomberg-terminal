import { useEffect, useState } from 'react';
import type { FeedName } from './live/status';

/**
 * Every data provider the app uses or has planned, with what it serves, the
 * kind of data it is, the use conditions that apply, and the official pages
 * those come from (checked on the date given). The main process counts each
 * provider's requests and records how they end; the status screen (PROVIDERS)
 * puts the two together. See docs/data-providers.md for the full notes.
 */

export type Credential =
  | 'FRED_API_KEY'
  | 'MASSIVE_API_KEY'
  | 'SEC_USER_AGENT'
  | 'COINGECKO_API_KEY'
  | 'ALPHA_VANTAGE_API_KEY'
  | 'TWELVE_DATA_API_KEY'
  | 'FINNHUB_API_KEY'
  | 'MARKETAUX_API_TOKEN'
  | 'TIINGO_API_KEY'
  | 'ALPACA_API_KEY_ID'
  | 'ALPACA_API_SECRET_KEY'
  | 'FMP_API_KEY'
  | 'EQUIBLES_API_KEY'
  | 'TIPRANKS_API_KEY';

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
  /** A second key the provider needs (Alpaca's secret). */
  credential2?: Credential;
  /** The feed light this provider drives, if any. */
  feed?: FeedName;
  /** The switch that turns it off, for providers that have one. */
  setting?: SettingName;
  /** How often the app asks while it runs: longer without an answer counts as stale. */
  cadenceMs?: number;
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
    serves: 'Quotes, price history, company profiles and statements, holders, symbol search; crypto when Kraken is switched off or does not answer. Options chains, news and analyst data are switched off.',
    dataClass: 'Yahoo Finance quote: live or delayed as Yahoo labels each exchange; history end of day',
    policy: 'enabled',
    setting: 'YAHOO_PRICES_ENABLED',
    cadenceMs: 60_000,
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
    id: 'kraken',
    name: 'Kraken (exchange)',
    serves: 'Crypto prices, best bid and offer, the UTC day\'s range and volume, daily and 5-minute candles, and order books for 10 USD pairs',
    dataClass: 'Exchange data: one exchange\'s market, real time as of each snapshot (Kraken\'s server time)',
    policy: 'enabled',
    setting: 'KRAKEN_ENABLED',
    cadenceMs: 15_000,
    feed: 'crypto',
    limit: '60',
    terms: 'Kraken\'s terms let you use its content, pricing data included, only for your own benefit, and restrict bots and third-party applications without its consent (Global Terms of 6 Oct 2026, sections 8 and 9): a risk this private app accepts. The public REST API is Kraken\'s documented interface for market data; the app sends at most one request a second, as Kraken\'s support pages advise.',
    docs: [
      { label: 'REST API: ticker', url: 'https://docs.kraken.com/api/docs/rest-api/get-ticker-information' },
      { label: 'API rate limits', url: 'https://support.kraken.com/at/articles/206548367-What-are-the-API-rate-limits-' },
      { label: 'Terms of service', url: 'https://www.kraken.com/legal' },
    ],
    checked: '2026-10-13',
    desktop: true,
  },
  {
    id: 'coingecko',
    name: 'CoinGecko',
    serves: 'Market capitalisation and circulating supply of the listed coins (CRYPTO, PROFILE)',
    dataClass: 'Aggregated across exchanges; reference figures, not a price',
    policy: 'needs-credential',
    cadenceMs: 10 * 60_000,
    credential: 'COINGECKO_API_KEY',
    limit: '10',
    terms: 'Free Demo plan with your own key: 10,000 calls a month, 100 a minute, attribution required ("Powered by CoinGecko"). The API terms discourage storing data and rule out redistributing access. The app asks every 10 minutes and keeps the answer in memory only.',
    docs: [
      { label: 'API pricing (Demo plan)', url: 'https://www.coingecko.com/en/api/pricing' },
      { label: 'API terms', url: 'https://www.coingecko.com/en/api_terms' },
      { label: 'Attribution guide', url: 'https://brand.coingecko.com/resources/attribution-guide' },
    ],
    checked: '2026-10-13',
    desktop: true,
  },
  {
    id: 'yahoo-stream',
    name: 'Yahoo Finance streaming',
    serves: 'Price updates pushed as trades print, for the securities on screen',
    dataClass: 'Yahoo Finance quote (streamed)',
    policy: 'enabled',
    setting: 'YAHOO_PRICES_ENABLED',
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
    serves: 'FOMC meeting calendar; press releases (RSS)',
    dataClass: 'Official calendar and announcements',
    policy: 'enabled',
    feed: 'policy',
    terms: 'Public domain unless marked otherwise; cite the Board as the source.',
    docs: [
      { label: 'FOMC calendars', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
      { label: 'Press releases feed', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
      { label: 'Website policies', url: 'https://www.federalreserve.gov/disclaimer.htm' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'ecb',
    name: 'European Central Bank',
    serves: 'Deposit facility rate; press releases (RSS)',
    dataClass: 'Policy rate and announcements (official)',
    policy: 'enabled',
    feed: 'policy',
    terms: 'ESCB statistics may be reused free of charge if the source is quoted (Source: ECB statistics) and the figures are not modified. Website content such as press releases may be reproduced with the source acknowledged.',
    docs: [
      { label: 'ECB Data Portal API', url: 'https://data.ecb.europa.eu/help/api/overview' },
      { label: 'Website disclaimer and copyright', url: 'https://www.ecb.europa.eu/home/disclaimer/html/index.en.html' },
      { label: 'Reuse policy', url: 'https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'boe',
    name: 'Bank of England',
    serves: 'Bank Rate; nominal par gilt yields (5, 10 and 20 years); news (RSS)',
    dataClass: 'Policy rate; end-of-day fitted yields (official)',
    policy: 'enabled',
    feed: 'yields',
    terms: 'Database figures are reproduced under the UK Open Government Licence; some exchange-rate series are excluded. Other website content, news included, is for personal, non-commercial use.',
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
    serves: 'Policy rate; benchmark bond yields; press releases (RSS)',
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
    serves: 'Cash rate target; government bond yields (table F2); media releases (RSS)',
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
    id: 'bea',
    name: 'US Bureau of Economic Analysis',
    serves: 'Release announcements (RSS)',
    dataClass: 'Official announcements',
    policy: 'enabled',
    feed: 'news',
    terms: 'Public domain unless stated otherwise; a citation such as "Source: U.S. Bureau of Economic Analysis" is appreciated.',
    docs: [
      { label: 'Reproducing BEA information (FAQ)', url: 'https://bea.gov/help/faq/145' },
      { label: 'RSS feed', url: 'https://apps.bea.gov/rss/rss.xml' },
    ],
    checked: '2026-10-13',
    desktop: true,
  },
  {
    id: 'esma',
    name: 'European Securities and Markets Authority',
    serves: 'News and press releases (RSS)',
    dataClass: 'Official announcements',
    policy: 'enabled',
    feed: 'news',
    terms: 'Reproduction is authorised with the source acknowledged; adapted material must say so, and nothing may imply ESMA endorsement.',
    docs: [
      { label: 'Legal notice', url: 'https://www.esma.europa.eu/legal-notice' },
      { label: 'RSS feed', url: 'https://www.esma.europa.eu/rss.xml' },
    ],
    checked: '2026-10-13',
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
    id: 'statcan',
    name: 'Statistics Canada',
    serves: 'Canada unemployment rate and consumer price index',
    dataClass: 'Economic release (official)',
    policy: 'enabled',
    feed: 'eco',
    terms: 'Statistics Canada Open Licence: free use with the notice "Source: Statistics Canada, name of product, reference date" ("Adapted from" for figures worked out from it). The Web Data Service allows 25 requests a second per address.',
    docs: [
      { label: 'Web Data Service user guide', url: 'https://www.statcan.gc.ca/en/developers/wds/user-guide' },
      { label: 'Open Licence', url: 'https://www.statcan.gc.ca/en/terms-conditions/open-licence' },
    ],
    checked: CHECKED,
    desktop: true,
  },
  {
    id: 'abs',
    name: 'Australian Bureau of Statistics',
    serves: 'Australia unemployment rate and monthly CPI',
    dataClass: 'Economic release (official)',
    policy: 'enabled',
    feed: 'eco',
    terms: 'Creative Commons Attribution 4.0: free reuse with credit to the ABS. The Data API needs no key.',
    docs: [
      { label: 'Data API user guide', url: 'https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/data-api-user-guide' },
      { label: 'Copyright and Creative Commons', url: 'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer' },
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
    serves: 'US release dates and published values (MACRO, RELEASES); on ECONSTATS the US figures, Japan\'s GDP (Cabinet Office) and unemployment (OECD), and the GDP of Canada and Australia (IMF)',
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
    serves: 'Company search (ticker to CIK), filing histories with links to the documents, figures reported in XBRL financial statements, and the latest 8-K filings for MARKETNEWS',
    dataClass: 'Reference: filed documents and as-filed figures',
    policy: 'needs-credential',
    credential: 'SEC_USER_AGENT',
    limit: '300',
    terms: 'Free to access and reuse (SEC Webmaster FAQ). Automated clients must declare a User-Agent with a name and contact email and stay under 10 requests a second; the app sends at most 5 a second and keeps answers (filing lists 5 minutes, company facts an hour, the company list a day).',
    docs: [
      { label: 'Accessing EDGAR data', url: 'https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data' },
      { label: 'EDGAR APIs', url: 'https://www.sec.gov/search-filings/edgar-application-programming-interfaces' },
      { label: 'Webmaster FAQ (developers)', url: 'https://www.sec.gov/os/webmaster-faq' },
      { label: 'RSS feeds (latest filings)', url: 'https://www.sec.gov/about/rss-feeds' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'massive',
    name: 'Massive (formerly Polygon.io)',
    serves: 'US stock daily bars for checking the closes the app shows (CROSSCHECK)',
    dataClass: 'End of day, split-adjusted',
    policy: 'needs-credential',
    credential: 'MASSIVE_API_KEY',
    limit: '5',
    terms: 'Personal, non-commercial, non-business use as a non-professional; no redistribution or display to anyone else, derived works included. Stocks Basic: "$0 /month", "5 API Calls / Minute", "2 Years Historical Data", "End of Day Data". The app asks at most 5 times a minute, only from CROSSCHECK.',
    docs: [
      { label: 'Stocks pricing', url: 'https://massive.com/pricing?product=stocks' },
      { label: 'REST quickstart (keys)', url: 'https://massive.com/docs/rest/quickstart' },
      { label: 'Custom bars', url: 'https://www.massive.com/docs/rest/stocks/aggregates/custom-bars' },
      { label: 'Individual terms', url: 'https://www.massive.com/legal/individuals-terms-of-service' },
      { label: 'Market data terms', url: 'https://massive.com/legal/market-data-terms-of-service' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    serves: 'US stock daily bars (latest 100 sessions) for checking closes (CROSSCHECK)',
    dataClass: 'End of day, as traded (not adjusted)',
    policy: 'needs-credential',
    credential: 'ALPHA_VANTAGE_API_KEY',
    limit: '1',
    terms: 'Licence: "install, use, access, display and run" for "personal, non-commercial use"; use counts as commercial if, among other things, you work for a financial firm such as a broker-dealer or investment adviser. Free key: "25 API requests per day"; the full history and real-time or 15-minute delayed US data are premium. The app keeps to 20 requests a day and one a minute, only from CROSSCHECK.',
    docs: [
      { label: 'API documentation', url: 'https://www.alphavantage.co/documentation/' },
      { label: 'Support and limits', url: 'https://www.alphavantage.co/support/' },
      { label: 'Terms of service', url: 'https://www.alphavantage.co/terms_of_service/' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'twelvedata',
    name: 'Twelve Data',
    serves: 'US stock daily bars for checking closes (CROSSCHECK), once display rights are confirmed',
    dataClass: 'End of day',
    policy: 'needs-credential',
    credential: 'TWELVE_DATA_API_KEY',
    setting: 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED',
    limit: '6',
    terms: 'Basic (free) plan: 8 requests a minute, 800 a day, "Internal non-display usage". Showing its prices on a screen needs a plan that allows display, so the app sends nothing until you switch on TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED.',
    docs: [
      { label: 'Pricing', url: 'https://twelvedata.com/pricing' },
      { label: 'API documentation', url: 'https://twelvedata.com/docs' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'tiingo',
    name: 'Tiingo',
    serves: 'US stock daily bars for checking closes (CROSSCHECK)',
    dataClass: 'End of day, as traded',
    policy: 'needs-credential',
    credential: 'TIINGO_API_KEY',
    setting: 'TIINGO_ENABLED',
    limit: '1',
    terms: 'Starter (free) plan: "Max Requests Per Hour 50", "Max Requests Per Day 1000", "Unique Symbols per Month 500"; licence "Internal Use Only": for your own personal use, not to be displayed or shared with anyone else. Its data may not be kept in persistent storage (terms 1.6(a)), so the app keeps it in memory only. News is not on the free plan. The app asks only from CROSSCHECK: at most 40 an hour and 500 a day.',
    docs: [
      { label: 'End-of-day API', url: 'https://www.tiingo.com/documentation/end-of-day' },
      { label: 'Pricing', url: 'https://www.tiingo.com/about/pricing' },
      { label: 'Terms', url: 'https://www.tiingo.com/about/terms' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'fmp',
    name: 'Financial Modeling Prep',
    serves: 'Analyst price targets, the tally of ratings, rating actions and annual estimates (ANALYSTS, EARNINGS)',
    dataClass: "Analyst opinions as FMP gathers them; as of each answer",
    policy: 'needs-credential',
    credential: 'FMP_API_KEY',
    setting: 'FMP_ENABLED',
    limit: '30',
    terms: "The account's request quota does not unlock premium endpoints or every symbol. The supplied report shows HTTP 402 for APLD; availability for AAPL does not imply access to APLD. This app caps requests at 220/day and keeps answers six hours (estimates a day). A failed section remains separate from working research; recommendation counts can fall back to Finnhub.",
    docs: [
      { label: 'Pricing', url: 'https://site.financialmodelingprep.com/pricing-plans' },
      { label: 'Price target API', url: 'https://site.financialmodelingprep.com/developer/docs/stable/price-target-consensus' },
      { label: 'Terms', url: 'https://site.financialmodelingprep.com/terms-of-service' },
    ],
    checked: '2026-10-18',
    desktop: true,
  },
  {
    id: 'equibles',
    name: 'Equibles',
    serves: 'On-request analyst consensus estimates, guidance, KPIs, investor events, insider trades, FINRA short interest, 13F holders and IR news on ANALYSTS',
    dataClass: 'Filed/reported research and provider analysis, as labelled in each report; distinct from broker consensus',
    policy: 'needs-credential', credential: 'EQUIBLES_API_KEY', setting: 'EQUIBLES_ENABLED', limit: '10',
    terms: 'Hosted free tier: 100 requests/day shared across REST, MCP and other clients, resetting at midnight UTC. This app caps all MCP transport requests at 90/day, discovers server schemas, sends only read-only research queries, and caches answers in memory for six hours. Public live tool discovery was verified on 18 October 2026, including analyst estimates; authenticated account coverage remains unverified. No portfolio writes or automatic polling. Hosted service terms apply.',
    docs: [
      { label: 'API documentation', url: 'https://equibles.com/docs/api' },
      { label: 'Hosted tools and limits', url: 'https://github.com/daniel3303/stock-market-mcp-server' },
      { label: 'Service terms', url: 'https://equibles.com/legal/terms' },
    ],
    checked: '2026-10-18', desktop: true,
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    serves: 'Company profile/ratios fallback, monthly analyst recommendations, quarterly EPS comparisons, next-report calendar, and market/company news; price targets remain separate',
    dataClass: 'Company reference data and ratios; monthly recommendations; provider-basis EPS comparisons and calendar; news headlines',
    policy: 'needs-credential',
    credential: 'FINNHUB_API_KEY',
    setting: 'FINNHUB_ENABLED',
    limit: '30',
    terms: 'Free plan: "Personal Use", "60 API calls/minute". Market news and company news are on it (company news: North American companies, a year of history); price targets are not ("Premium required"). Terms: plans are "strictly for personal use", data is to be deleted when a subscription ends, no sharing. The app asks for market news every 5 minutes and a company\'s news every 15 while a screen shows it, and shows headlines with links, not article text.',
    docs: [
      { label: 'Market news', url: 'https://finnhub.io/docs/api/market-news' },
      { label: 'Company news', url: 'https://finnhub.io/docs/api/company-news' },
      { label: 'Recommendation trends', url: 'https://finnhub.io/docs/api/recommendation-trends' },
      { label: 'Terms of service', url: 'https://finnhub.io/terms-of-service' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'marketaux',
    name: 'Marketaux',
    serves: 'News tagged with tickers and per-company sentiment, for your watchlist and the company on screen (MARKETNEWS, COMPANYNEWS)',
    dataClass: 'News headlines with sentiment scores',
    policy: 'needs-credential',
    credential: 'MARKETAUX_API_TOKEN',
    setting: 'MARKETAUX_ENABLED',
    limit: '10',
    terms: 'Free plan: "100 requests daily" (reset at midnight UTC), "3 articles / news request"; "We only provide a short snippet of articles along with their links." Licence for personal, non-commercial use. The app asks for the whole watchlist in one request, keeps each answer an hour, never polls in a loop and stops at 90 requests a day.',
    docs: [
      { label: 'Documentation', url: 'https://www.marketaux.com/documentation' },
      { label: 'Pricing', url: 'https://www.marketaux.com/pricing' },
      { label: 'Terms', url: 'https://www.marketaux.com/terms' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch (RSS)',
    serves: 'Top stories headlines (MARKETNEWS), only with its switch on',
    dataClass: 'News headlines with time and link',
    policy: 'enabled',
    setting: 'MARKETWATCH_RSS_ENABLED',
    limit: '6',
    terms: "Dow Jones's terms of use (30 June 2026) bar access to its content \"using any automated means ... API client\" without written consent (9.4.1), RSS feeds included (9.1). Off by default; switching it on accepts that risk, as with Yahoo. When on: the top stories feed every 10 minutes, headlines and links only.",
    docs: [{ label: 'Top stories feed', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' }],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'yahoo-rss',
    name: 'Yahoo Finance headlines (RSS)',
    serves: 'Headlines for one stock at a time, any market Yahoo lists, Brussels and Paris included (COMPANYNEWS, QUOTE)',
    dataClass: 'News headlines with time, publisher and link',
    policy: 'enabled',
    setting: 'YAHOO_RSS_ENABLED',
    limit: '20',
    terms: 'Yahoo\'s RSS terms: "you are only permitted to display the content that is provided in the feed, without modification, and you must provide attribution to our source website and link to the full article." The screens show the headline, a short description and the publisher, with a link to the article. Each stock\'s feed is asked at most every 15 minutes while a screen shows it.',
    docs: [
      { label: 'Example feed (AB InBev)', url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=ABI.BR&region=US&lang=en-US' },
      { label: 'Yahoo terms', url: 'https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html' },
    ],
    checked: '2026-10-18',
    desktop: true,
  },
  {
    id: 'euronext',
    name: 'Euronext press releases (RSS)',
    serves: 'The latest company press releases filed through Euronext (MARKETNEWS)',
    dataClass: 'Issuer announcements with time and link',
    policy: 'enabled',
    setting: 'EURONEXT_RSS_ENABLED',
    limit: '6',
    terms: 'The public RSS feed Euronext links from its press release pages; it holds the 10 latest releases. Asked every 10 minutes while MARKETNEWS is open; headlines and links only. Euronext\'s terms of use were not reviewed for this feed.',
    docs: [{ label: 'Company press releases', url: 'https://live.euronext.com/en/listview/company-press-release' }],
    checked: '2026-10-18',
    desktop: true,
  },
  {
    id: 'alpaca',
    name: 'Alpaca Market Data',
    serves: 'IEX stock quotes; optional IEX-only US equity prices across panels; indicative option chains on OPTIONS',
    dataClass: 'Stocks: real time, IEX only. Options: indicative quotes and delayed trades; not consolidated OPRA',
    policy: 'needs-credential',
    credential: 'ALPACA_API_KEY_ID',
    credential2: 'ALPACA_API_SECRET_KEY',
    setting: 'ALPACA_ENABLED',
    limit: '120',
    terms: 'Personal, non-commercial market-data use with your own account. The app explicitly selects IEX for stocks and indicative for options; it never silently selects paid SIP/OPRA. Indicative option quotes are not executable prices; option trades are delayed. Access depends on account entitlement. Only data.alpaca.markets is called, never an account/order endpoint. In-memory cache: 4 seconds stocks, 15 seconds options.',
    docs: [
      { label: 'Market data API', url: 'https://docs.alpaca.markets/docs/about-market-data-api' },
      { label: 'Snapshots', url: 'https://docs.alpaca.markets/reference/stocksnapshots-1' },
      { label: 'Option chain SDK request and feed', url: 'https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/requests.py#L442' },
      { label: 'Pricing', url: 'https://alpaca.markets/data' },
    ],
    checked: '2026-10-18',
    desktop: true,
  },
  {
    id: 'tipranks',
    name: 'TipRanks',
    serves: 'Nothing yet: not connected',
    dataClass: 'None',
    policy: 'planned',
    credential: 'TIPRANKS_API_KEY',
    terms: 'An MCP server (JSON-RPC over HTTP) with tools such as get_assets_data (consensus, price target, Smart Score) and get_recent_analyst_ratings. API-key free plan: 10 requests a minute and 50 a month per account, every tool call counted. Terms (1 June 2026): use "solely to build and operate your own applications", credit "Data by TipRanks", no storage beyond transient caching. Not connected yet: its tools\' inputs and answers are only visible with a key, and this build could not check them. Analyst price targets come from Financial Modeling Prep meanwhile.',
    docs: [
      { label: 'MCP docs', url: 'https://mcp.tipranks.com/docs' },
      { label: 'MCP terms', url: 'https://mcp.tipranks.com/terms' },
    ],
    checked: '2026-10-14',
    desktop: true,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Exchange (browser build)',
    serves: 'Nothing: switched off',
    dataClass: 'None',
    policy: 'disabled',
    terms: 'Not approved: its market data terms have not been reviewed for this use. The desktop app takes crypto prices from Kraken.',
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
  /** When a request last went out. */
  lastAttemptAt?: number | null;
  /** How long the last successful request took (ms). */
  lastLatencyMs?: number | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  lastErrorKind: string | null;
  /** Requests sent today (UTC), and the provider's daily limit and the app's own ceiling where they apply. */
  today?: number;
  dayLimit?: number;
  dayCap?: number;
}

export type SettingName = 'YAHOO_PRICES_ENABLED' | 'KRAKEN_ENABLED' | 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED' | 'MARKETWATCH_RSS_ENABLED' | 'FMP_ENABLED' | 'FINNHUB_ENABLED' | 'EQUIBLES_ENABLED' | 'MARKETAUX_ENABLED' | 'ALPACA_ENABLED' | 'ALPACA_IEX_PRICES_ENABLED' | 'TIINGO_ENABLED' | 'YAHOO_RSS_ENABLED' | 'EURONEXT_RSS_ENABLED';

export interface SettingState {
  label: string;
  value: boolean;
  source: string | null;
}

export interface ProviderReport {
  credentials: Partial<Record<Credential, CredentialState>>;
  /** Switches that are not secrets, such as YAHOO_PRICES_ENABLED. */
  settings?: Partial<Record<SettingName, SettingState>>;
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

export type ProviderState = 'live' | 'ok' | 'idle' | 'error' | 'stale' | 'not-configured' | 'switched-off' | 'planned' | 'disabled';

/** One word for a provider's state from its policy, switch, credential and recent requests. */
export function providerState(def: ProviderDef, report: ProviderReport | null, feed?: string, now = Date.now()): ProviderState {
  if (def.policy === 'disabled') return 'disabled';
  if (def.policy === 'planned') return 'planned';
  if (def.setting && report?.settings?.[def.setting]?.value === false) return 'switched-off';
  if (def.credential && !report?.credentials[def.credential]?.configured) return 'not-configured';
  if (def.credential2 && !report?.credentials[def.credential2]?.configured) return 'not-configured';
  const s = report?.providers[def.id];
  // "No data" for one symbol or series is an answer, not a failure of the provider.
  if (s?.lastErrorAt && s.lastErrorKind !== 'no-data' && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt)) return 'error';
  // A provider the app asks continually that has not answered for several rounds.
  if (def.cadenceMs && s?.lastSuccessAt && now - s.lastSuccessAt > 3 * def.cadenceMs) return 'stale';
  if (feed === 'live' && s?.lastSuccessAt) return 'live';
  if (s?.lastSuccessAt) return 'ok';
  return 'idle';
}
