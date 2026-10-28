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
  | 'OPENFIGI_API_KEY'
  | 'TIPRANKS_API_KEY'
  | 'CONGRESS_GOV_API_KEY'
  | 'EIA_API_KEY'
  | 'BEA_API_KEY'
  | 'ANTHROPIC_API_KEY';

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
    serves: 'Quotes, history, company profiles/statements, holders and symbol and company-name search; optional analyst research fallback. Crypto when Kraken does not answer. Options chains and news are switched off.',
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
    feed: 'stream',
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
    serves: 'FOMC meeting calendar; press releases and speeches (RSS)',
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
    serves: 'Deposit facility rate; the euro short-term rate (€STR); press releases and blog posts (RSS)',
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
    serves: 'Bank Rate; SONIA; nominal par gilt yields (5, 10 and 20 years); news (RSS)',
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
    id: 'boj',
    name: 'Bank of Japan',
    serves: "Basic loan rate and the overnight call rate (Time-Series Data Search API, BOJPORTAL); what's new: announcements, speeches and statistics releases (RSS, HEADLINES)",
    dataClass: 'Policy rates and announcements (official)',
    policy: 'enabled',
    feed: 'news',
    terms: 'Site content may be copied with the Bank of Japan named as the source, except for commercial use, material marked as needing permission, and graphics; it may not be altered. The Time-Series Data Search API needs no key; its notice asks for a credit line where the figures are shown (BOJPORTAL shows it), no excessive requests, and an email to the Bank before a service using it is released to others.',
    docs: [
      { label: 'Copyright', url: 'https://www.boj.or.jp/en/about/copyright.htm' },
      { label: 'API user manual', url: 'https://www.stat-search.boj.or.jp/info/api_manual_en.pdf' },
      { label: 'Notice on the use of the API', url: 'https://www.stat-search.boj.or.jp/info/api_notice_en.pdf' },
      { label: 'RSS feed', url: 'https://www.boj.or.jp/en/rss/whatsnew.xml' },
    ],
    checked: '2026-10-27',
    desktop: true,
  },
  {
    id: 'bis',
    name: 'Bank for International Settlements',
    serves: "Central bankers' speeches from around the world (RSS, HEADLINES)",
    dataClass: 'Official announcements',
    policy: 'enabled',
    feed: 'news',
    terms: '"Users may download, display, print out, photocopy or redistribute any BIS Material for non-commercial purposes." Nothing may imply BIS endorsement.',
    docs: [
      { label: 'Terms and conditions', url: 'https://www.bis.org/terms_conditions.htm' },
      { label: 'RSS feed', url: 'https://www.bis.org/doclist/cbspeeches.rss' },
    ],
    checked: '2026-10-19',
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
    id: 'bls',
    name: 'U.S. Bureau of Labor Statistics',
    serves: 'US CPI and unemployment rate when no FRED key is set (ECONSTATS, ECO, MACRO)',
    dataClass: 'Economic release (official)',
    policy: 'enabled',
    feed: 'eco',
    terms: 'US government work in the public domain. The public API, version 1, needs no key and allows a small number of requests a day from each address; the app asks twice a day at most, and only while FRED has no key.',
    docs: [
      { label: 'Public Data API', url: 'https://www.bls.gov/developers/' },
      { label: 'API signatures (version 1)', url: 'https://www.bls.gov/developers/api_signature.htm' },
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
    serves: 'Company search (ticker to CIK), filing histories with links to the documents, figures reported in XBRL financial statements, the latest 8-K filings for MARKETNEWS, press releases for HEADLINES, full-text search of filings with the sentences that name a company (SPLC supply chain, DS), and the holdings a company reports on Form 13F (HOLDINGS)',
    dataClass: 'Reference: filed documents and as-filed figures',
    policy: 'needs-credential',
    credential: 'SEC_USER_AGENT',
    limit: '300',
    terms: 'Free to access and reuse (SEC Webmaster FAQ). Automated clients must declare a User-Agent with a name and contact email and stay under 10 requests a second; the app sends at most 5 a second and keeps answers (filing lists 5 minutes, company facts an hour, the company list a day, the sentences SPLC reads from a filing a month, 13F holdings for the session).',
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
    id: 'nasdaq',
    name: 'Nasdaq (nasdaq.com data pages)',
    serves: "EVENTS' market-wide earnings calendar and stock list; for one US-listed stock, what Yahoo leaves empty: market value, industry, description, dividend and its declaration, record and payment dates, short interest (Nasdaq listings), institutional ownership, the price target and buy/hold/sell count, the coming quarters' EPS consensus and the next report date",
    dataClass: 'Reference: exchange and analyst data as nasdaq.com publishes it; EPS consensus from Zacks as Nasdaq credits it',
    policy: 'enabled',
    limit: '60/min',
    terms: "The JSON behind nasdaq.com's public quote, company, analyst and calendar pages, without a key, for personal use. The app asks only for the stock on screen (peers: the market value only), keeps answers 2 to 24 hours and fills only fields the other sources leave empty. Nasdaq's servers refuse a User-Agent with a web address or Electron's, so the app sends its plain name and version.",
    docs: [
      { label: 'nasdaq.com market activity', url: 'https://www.nasdaq.com/market-activity' },
      { label: 'Terms of use', url: 'https://www.nasdaq.com/terms-of-use' },
    ],
    checked: '2026-10-20',
    desktop: true,
  },
  {
    id: 'finra',
    name: 'FINRA Query API',
    serves: 'Consolidated short interest for US-listed stocks outside Nasdaq (shares short, average daily volume, days to cover), twice a month',
    dataClass: 'Official: FINRA consolidated short interest, by settlement date',
    policy: 'enabled',
    limit: '20/min',
    terms: "FINRA's public consolidatedShortInterest dataset, asked without a key: one stock's settlements of the last 75 days, only when Nasdaq's page has none, kept for 12 hours.",
    docs: [
      { label: 'Query API', url: 'https://developer.finra.org/docs' },
      { label: 'Short interest data', url: 'https://www.finra.org/finra-data/browse-catalog/equity-short-interest' },
    ],
    checked: '2026-10-20',
    desktop: true,
  },
  {
    id: 'finviz',
    name: 'Finviz (quote page)',
    serves: "Two years of reports with the revenue and EPS expected and reported, each quarter's end date, the report date and session, and the coming report's estimates (EARNINGS, EVENTS); the companies it lists as a US stock's peers (PEERS, PROFILE)",
    dataClass: 'Reference: consensus revenue estimates as Finviz publishes them on its public quote page',
    policy: 'enabled',
    limit: '36/min',
    terms: "Finviz's public quote page for one stock (allowed by its robots.txt), for personal use: asked only for the stock on screen and the EVENTS lines in view that lack figures, kept until the company's next report, figures and peer tickers only. Reported revenue from the company's own filings wins over the page's.",
    docs: [
      { label: 'Terms of use', url: 'https://finviz.com/terms' },
      { label: 'robots.txt', url: 'https://finviz.com/robots.txt' },
    ],
    checked: '2026-10-21',
    desktop: true,
  },
  {
    id: 'zacks',
    name: 'Zacks (earnings calendar page)',
    serves: "Past quarters' consensus EPS and revenue estimates against reported, about five years, with report date and session (EARNINGS), where the keyless sources keep only the coming quarters",
    dataClass: 'Reference: consensus estimates as Zacks publishes them on its public earnings page',
    policy: 'enabled',
    limit: '6/min',
    terms: "Zacks' public earnings calendar page for one stock, for personal use: asked only for the stock on screen (and EVENTS lines Finviz has no figures for), kept for 12 hours, figures only. Zacks turns away clients that are not a browser engine, so the app sends Electron's own User-Agent, as for Yahoo. When Zacks answers with its bot protection page the app does not try to get past it: it rests Zacks for half an hour and asks MarketBeat.",
    docs: [{ label: 'Terms of service', url: 'https://www.zacks.com/terms-of-service' }],
    checked: '2026-10-21',
    desktop: true,
  },
  {
    id: 'marketbeat',
    name: 'MarketBeat (earnings page)',
    serves: "Past quarters' consensus EPS and revenue estimates against reported, by fiscal quarter, when Zacks does not answer (EARNINGS); analysts' rating actions with the analyst, firm and price target before and after (ANALYSTS)",
    dataClass: 'Reference: consensus estimates as MarketBeat publishes them on its public earnings page',
    policy: 'enabled',
    limit: '6/min',
    terms: "MarketBeat's public earnings page for one stock, for personal use, only when Zacks has no answer, and its forecast page for the stock ANALYSTS shows: kept 12 and 6 hours, figures only. Reported revenue from the company's own filings wins over the page's.",
    docs: [{ label: 'Terms of service', url: 'https://www.marketbeat.com/terms/' }],
    checked: '2026-10-21',
    desktop: true,
  },
  {
    id: 'massive',
    name: 'Massive (formerly Polygon.io)',
    serves: 'US stock daily bars for checking the closes the app shows (CROSSCHECK); market and ticker news (MARKETNEWS, COMPANYNEWS) while MASSIVE_NEWS_ENABLED is on',
    dataClass: 'End of day, split-adjusted; news headlines with publisher, time, tickers and link',
    policy: 'needs-credential',
    credential: 'MASSIVE_API_KEY',
    limit: '5',
    terms: 'Personal, non-commercial, non-business use as a non-professional; no redistribution or display to anyone else, derived works included. Stocks Basic: "$0 /month", "5 API Calls / Minute", "2 Years Historical Data", "End of Day Data". Ticker news is "Included in all Stocks plans", "Updated hourly". The app asks at most 5 times a minute in all, CROSSCHECK and news together: market news every 15 minutes while MARKETNEWS is open, a company\'s every 30 while COMPANYNEWS shows it.',
    docs: [
      { label: 'Ticker news', url: 'https://massive.com/docs/rest/stocks/news' },
      { label: 'Stocks pricing', url: 'https://massive.com/pricing?product=stocks' },
      { label: 'REST quickstart (keys)', url: 'https://massive.com/docs/rest/quickstart' },
      { label: 'Custom bars', url: 'https://www.massive.com/docs/rest/stocks/aggregates/custom-bars' },
      { label: 'Individual terms', url: 'https://www.massive.com/legal/individuals-terms-of-service' },
      { label: 'Market data terms', url: 'https://massive.com/legal/market-data-terms-of-service' },
    ],
    checked: '2026-10-19',
    desktop: true,
  },
  {
    id: 'alphavantage',
    name: 'Alpha Vantage',
    serves: "Each reported quarter's date, session and EPS expected and reported, and the analysts' EPS and revenue estimates by fiscal quarter and year (EARNINGS, PROFILE, ANALYSTS); US stock daily bars (latest 100 sessions) for checking closes (CROSSCHECK)",
    dataClass: 'End of day, as traded (not adjusted)',
    policy: 'needs-credential',
    credential: 'ALPHA_VANTAGE_API_KEY',
    limit: '20/day',
    terms: 'Licence: "install, use, access, display and run" for "personal, non-commercial use"; use counts as commercial if, among other things, you work for a financial firm such as a broker-dealer or investment adviser. Free key: "25 API requests per day"; the full history and real-time or 15-minute delayed US data are premium. The app keeps to 20 requests a day. Earnings and estimates (two requests per company) are asked only for the stock on screen and kept on disk for three days; CROSSCHECK asks one a minute.',
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
    serves: "Analyst price targets, the tally of ratings, rating actions and annual estimates (ANALYSTS, EARNINGS); the latest 25 trades disclosed by senators and by representatives (CONGRESS), asked every six hours once CONGRESS has been opened and kept by the app",
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
    id: 'eia',
    name: 'EIA (US Energy Information Administration)',
    serves: "NGAS: the weekly natural gas storage report with EIA's own comparisons (no key) and two years of weekly storage; monthly dry gas production and consumption; OILMARKET: the weekly petroleum supply estimates (stocks, production, refinery runs, products supplied)",
    dataClass: 'Official US government statistics (weekly and monthly), as EIA publishes them',
    policy: 'needs-credential', credential: 'EIA_API_KEY', limit: '20',
    terms: "Public US government data, free with a registered key (the storage report file needs none). EIA's documentation asks programs to throttle requests per second and per hour and suspends a key that exceeds its tolerances for a short while; it gives at most 5,000 rows an answer. The app asks four datasets, each at most every 30 minutes while a screen shows it, and keeps answers 30 minutes to six hours.",
    docs: [
      { label: 'API documentation', url: 'https://www.eia.gov/opendata/documentation.php' },
      { label: 'Register for a key', url: 'https://www.eia.gov/opendata/register.php' },
      { label: 'Weekly Natural Gas Storage Report', url: 'https://ir.eia.gov/ngs/ngs.html' },
      { label: 'Weekly Petroleum Status Report', url: 'https://www.eia.gov/petroleum/supply/weekly/' },
      { label: 'Copyright and reuse', url: 'https://www.eia.gov/about/copyrights_reuse.php' },
    ],
    checked: '2026-10-28', desktop: true,
  },
  {
    id: 'house-clerk',
    name: 'Clerk of the House (financial disclosures)',
    serves: "CONGRESS: the House's member list with party and seat, the yearly index of members' financial disclosures, and each periodic transaction report and annual report, read from its PDF in the app (reports filed on paper are scans: linked only)",
    dataClass: 'Reference: members’ own disclosures as filed; amounts as the ranges the forms give',
    policy: 'enabled',
    limit: '2/s',
    terms: "Public records under the Ethics in Government Act; 5 U.S.C. § 13107(c) makes it unlawful to obtain or use them for an unlawful or commercial purpose (other than by news media), to set a credit rating or to solicit money, and CONGRESS asks the owner to acknowledge this before reading anything. The app asks at most at most four times a second, only while CONGRESS is open, and keeps each report it has read on disk (a filed report never changes).",
    docs: [
      { label: 'Financial disclosure reports', url: 'https://disclosures-clerk.house.gov/FinancialDisclosure' },
      { label: 'Asset type codes', url: 'https://fd.house.gov/reference/asset-type-codes.aspx' },
      { label: 'Member data (XML)', url: 'https://clerk.house.gov/xml/lists/MemberData.xml' },
    ],
    checked: '2026-10-25', desktop: true,
  },
  {
    id: 'senate',
    name: 'U.S. Senate (member list)',
    serves: "CONGRESS: senators with party and state. Senators' own disclosures are on efdsearch.senate.gov, which refuses automated requests; the app does not try to get past it",
    dataClass: 'Reference: official member list',
    policy: 'enabled',
    limit: 'once a day',
    terms: 'Public information published by the Senate; asked once a day while CONGRESS is open.',
    docs: [{ label: 'Senators (XML)', url: 'https://www.senate.gov/general/contact_information/senators_cfm.xml' }],
    checked: '2026-10-25', desktop: true,
  },
  {
    id: 'imf',
    name: 'IMF DataMapper and SDMX API',
    serves: "The World Economic Outlook: GDP growth, inflation, unemployment, current account, government balance and debt by economy and region, with the forecasts (ECFC); an economy's goods exports and imports by partner, by year and month, from International Trade in Goods by partner country (ECTR)",
    dataClass: 'Economic and trade statistics and projections (official), the World Economic Outlook of April and October',
    policy: 'enabled',
    terms: 'The IMF lets anyone download, reuse and redistribute its data, the World Economic Outlook included, with the IMF named as the source ("Source: International Monetary Fund, database, link"); a material change to the figures must be stated. The app asks once per indicator and keeps each answer 12 hours; trade once per economy a day (one partner\'s months 12 hours), and the names of the economies a week.',
    docs: [
      { label: 'DataMapper API', url: 'https://www.imf.org/external/datamapper/api/help' },
      { label: 'IMF data API (SDMX)', url: 'https://data.imf.org/en/Resource-Pages/IMF-API' },
      { label: 'Copyright and usage', url: 'https://www.imf.org/en/About/copyright-and-terms' },
    ],
    checked: '2026-10-26', desktop: true,
  },
  {
    id: 'congressgov',
    name: 'Congress.gov API (Library of Congress)',
    serves: "Bills and their latest actions, the laws enacted in the current Congress, and each bill's sponsor, cosponsors, committees, actions, summaries, subjects and text (BILL)",
    dataClass: 'Legislative information (official)',
    policy: 'enabled',
    credential: 'CONGRESS_GOV_API_KEY',
    limit: '60',
    terms: "Each user signs up for their own free key at api.data.gov; the app sends it in the X-Api-Key header. The API allows 5,000 requests an hour; the app sends at most 60 a minute and keeps lists 30 minutes and a bill's details an hour. Bills, actions and the Congressional Research Service's summaries are works of the US government, not under copyright in the US (17 U.S.C. § 105).",
    docs: [
      { label: 'Congress.gov API', url: 'https://api.congress.gov/' },
      { label: 'API documentation (GitHub)', url: 'https://github.com/LibraryOfCongress/api.congress.gov' },
      { label: 'API keys (api.data.gov)', url: 'https://api.data.gov/docs/developer-manual/' },
      { label: 'Library of Congress legal', url: 'https://www.loc.gov/legal/' },
    ],
    checked: '2026-10-26', desktop: true,
  },
  {
    id: 'usaspending',
    name: 'USAspending.gov (U.S. Treasury)',
    serves: "A company's federal contracts and subcontracts for SPLC: the agencies whose contracts with it ran in the last year, the prime contractors that subcontracted to it in two years, and the subcontractors on its largest contracts over five years",
    dataClass: 'Government records: federal prime contracts (DATA Act) and subcontract reports (FFATA)',
    policy: 'enabled',
    terms: "The Treasury's public API needs no key and states no request limit. Its records are the federal government's own, published as the DATA Act requires; works of the US government are not under copyright in the US (17 U.S.C. § 105). The app asks only when SPLC opens a US-listed company, waits and asks again when the API answers 503, and keeps each answer 12 hours.",
    docs: [
      { label: 'API home', url: 'https://api.usaspending.gov/' },
      { label: 'Award search endpoint', url: 'https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/search/spending_by_award.md' },
      { label: 'Recipient endpoints', url: 'https://github.com/fedspendingtransparency/usaspending-api/tree/master/usaspending_api/api_contracts/contracts/v2/recipient' },
    ],
    checked: '2026-10-28', desktop: true,
  },
  {
    id: 'openfigi',
    name: 'OpenFIGI',
    serves: 'The US ticker of each holding a 13F lists, from its CUSIP or CINS (HOLDINGS)',
    dataClass: 'Reference: open security identifiers (FIGI) and the tickers they map to',
    policy: 'enabled', credential: 'OPENFIGI_API_KEY', setting: 'OPENFIGI_ENABLED', limit: '200/min with a key, 20/min without',
    terms: 'Free and open: the FIGI terms of service allow any use of the identifiers, commercial or not, with no attribution required; the names FIGI and OpenFIGI may be used only to refer to them. Without a key 25 requests a minute of 10 codes each; with one 250 a minute of 100. The app sends only the CUSIPs of the 13F on screen (its 300 largest holdings) and keeps each answer a week on disk, a code without a US listing a day.',
    docs: [
      { label: 'API documentation', url: 'https://www.openfigi.com/api/documentation' },
      { label: 'Terms of service', url: 'https://www.openfigi.com/docs/terms-of-service' },
    ],
    checked: '2026-10-25', desktop: true,
  },
  {
    id: 'finnhub',
    name: 'Finnhub',
    serves: 'Company profile/ratios fallback, monthly analyst recommendations, quarterly EPS comparisons, next-report calendar, and market, merger and company news; price targets remain separate',
    dataClass: 'Company reference data and ratios; monthly recommendations; provider-basis EPS comparisons and calendar; news headlines',
    policy: 'needs-credential',
    credential: 'FINNHUB_API_KEY',
    setting: 'FINNHUB_ENABLED',
    limit: '30',
    terms: 'Free plan: "Personal Use", "60 API calls/minute". Market news and company news are on it (company news: North American companies, a year of history); price targets are not ("Premium required"). Terms: plans are "strictly for personal use", data is to be deleted when a subscription ends, no sharing. The app asks for market news and merger news every 5 minutes and a company\'s news every 15 while a screen shows it, and shows headlines with links, not article text.',
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
    id: 'google-news',
    name: 'Google News (RSS)',
    serves: "A search for the day's market news, US and UK editions (MARKETNEWS); a search for the stock on screen in its market's languages, Dutch, French and English for Brussels (COMPANYNEWS, QUOTE)",
    dataClass: 'News headlines with time, publisher and link, from many publishers',
    policy: 'enabled',
    setting: 'GOOGLE_NEWS_RSS_ENABLED',
    limit: '10',
    terms: 'Each feed\'s copyright notice: "This XML feed is made available solely for the purpose of rendering Google News results within a personal feed reader for personal, non-commercial use. Any other use of the feed is expressly prohibited." This private terminal shows the headline, the publisher Google names and Google\'s link to the article. The market search is asked every 10 minutes while MARKETNEWS is open, each company search every 15 while a screen shows it.',
    docs: [
      { label: 'Market search feed (US)', url: 'https://news.google.com/rss/search?q=(stocks%20OR%20%22stock%20market%22%20OR%20%22Wall%20Street%22%20OR%20earnings%20OR%20bonds%20OR%20%22central%20bank%22)%20when%3A1d&hl=en-US&gl=US&ceid=US:en' },
      { label: 'Google terms of service', url: 'https://policies.google.com/terms' },
    ],
    checked: '2026-10-19',
    desktop: true,
  },
  {
    id: 'alpaca',
    name: 'Alpaca Market Data',
    serves: 'IEX stock quotes; optional IEX-only US equity prices across panels; indicative option chains on OPTIONS (Benzinga news: see Alpaca news)',
    dataClass: 'Stocks: real time, IEX only. Options: indicative quotes and delayed trades; not consolidated OPRA',
    policy: 'needs-credential',
    credential: 'ALPACA_API_KEY_ID',
    credential2: 'ALPACA_API_SECRET_KEY',
    setting: 'ALPACA_ENABLED',
    limit: '120',
    terms: 'Personal, non-commercial market-data use with your own account. The app explicitly selects IEX for stocks and indicative for options; it never silently selects paid SIP/OPRA. Indicative option quotes are not executable prices; option trades are delayed. Access depends on account entitlement. Only data.alpaca.markets is called, never an account/order endpoint. In-memory cache: 4 seconds stocks, 15 seconds options. News requests are counted under Alpaca news.',
    docs: [
      { label: 'Market data API', url: 'https://docs.alpaca.markets/docs/about-market-data-api' },
      { label: 'News', url: 'https://docs.alpaca.markets/reference/news-3' },
      { label: 'Historical news data', url: 'https://docs.alpaca.markets/docs/historical-news-data' },
      { label: 'Snapshots', url: 'https://docs.alpaca.markets/reference/stocksnapshots-1' },
      { label: 'Option chain SDK request and feed', url: 'https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/requests.py#L442' },
      { label: 'Pricing', url: 'https://alpaca.markets/data' },
    ],
    checked: '2026-10-19',
    desktop: true,
  },
  {
    id: 'alpaca-news',
    name: 'Alpaca news (Benzinga)',
    serves: 'Benzinga stories: the market\'s latest 50 (MARKETNEWS, BREAKING) and a US company\'s (COMPANYNEWS, QUOTE, PROFILE, FAVOURITES)',
    dataClass: 'News headlines and summaries, 15 minutes after publication on Basic',
    policy: 'needs-credential',
    credential: 'ALPACA_API_KEY_ID',
    credential2: 'ALPACA_API_SECRET_KEY',
    setting: 'ALPACA_ENABLED',
    limit: '30',
    terms: '"All news data is currently provided directly by Benzinga." Basic\'s historical data starts 15 minutes back, so stories arrive 15 minutes after publication. Personal, non-commercial use with your own account. Counted apart from Alpaca\'s quotes and options; at most 30 requests a minute, which with their 120 stays under the plan\'s 200.',
    docs: [
      { label: 'News', url: 'https://docs.alpaca.markets/reference/news-3' },
      { label: 'Historical news data', url: 'https://docs.alpaca.markets/docs/historical-news-data' },
    ],
    checked: '2026-10-19',
    desktop: true,
  },
  {
    id: 'tipranks',
    name: 'TipRanks',
    serves: 'Analyst consensus, average price target, Smart Score and recent rating actions with each analyst\'s record (ANALYSTS), on request, US and some other markets',
    dataClass: 'Analyst opinions as TipRanks aggregates them; Data by TipRanks',
    policy: 'needs-credential',
    credential: 'TIPRANKS_API_KEY',
    setting: 'TIPRANKS_ENABLED',
    limit: '8',
    terms: 'Hosted MCP server (JSON-RPC over HTTP). Checked 18 October 2026: the handshake and tool list answer without a key and are not metered; every tool call counts against the monthly allowance (50 on the free API-key plan, 10 a minute), whether or not it returns data, and get_my_usage is free. The key goes in the documented ?apikey= parameter from the main process only. Terms (1 June 2026): use "solely to build and operate your own applications", credit "Data by TipRanks", no storage beyond transient caching; the app keeps answers in memory for an hour, never on disk, calls only get_assets_data and get_recent_analyst_ratings on your click, and stops at 45 calls a month.',
    docs: [
      { label: 'MCP docs', url: 'https://mcp.tipranks.com/' },
      { label: 'MCP terms', url: 'https://mcp.tipranks.com/terms' },
    ],
    checked: '2026-10-18',
    desktop: true,
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude help desk)',
    serves: 'Answers to open questions on MESSAGES: Claude reads prices, earnings, filings, analysts and news through the app\'s own sources as tools',
    dataClass: 'Generated answers from the figures the app looked up, each with its source',
    policy: 'needs-credential',
    credential: 'ANTHROPIC_API_KEY',
    setting: 'CLAUDE_HELPDESK_ENABLED',
    limit: '400/day',
    terms: 'Messages API with your own key, billed by Anthropic per token (Claude Opus 5.5: $4 per million input tokens, $20 per million output; the instructions and tools are cached after the first question). Your questions and the figures the tools return are sent to Anthropic; the key stays in the main process. The request names a server-side fallback, so an overloaded model is replaced by another rather than failing. The app stops at 400 requests a day; a question takes 1 to 8.',
    docs: [
      { label: 'Messages API', url: 'https://docs.claude.com/en/api/messages' },
      { label: 'Pricing', url: 'https://www.anthropic.com/pricing#api' },
      { label: 'Commercial terms', url: 'https://www.anthropic.com/legal/commercial-terms' },
    ],
    checked: '2026-10-19',
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

export type SettingName = 'YAHOO_PRICES_ENABLED' | 'YAHOO_RESEARCH_ENABLED' | 'KRAKEN_ENABLED' | 'TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED' | 'MARKETWATCH_RSS_ENABLED' | 'FMP_ENABLED' | 'FINNHUB_ENABLED' | 'OPENFIGI_ENABLED' | 'TIPRANKS_ENABLED' | 'MARKETAUX_ENABLED' | 'ALPACA_ENABLED' | 'ALPACA_IEX_PRICES_ENABLED' | 'TIINGO_ENABLED' | 'YAHOO_RSS_ENABLED' | 'EURONEXT_RSS_ENABLED' | 'GOOGLE_NEWS_RSS_ENABLED' | 'MASSIVE_NEWS_ENABLED' | 'CLAUDE_HELPDESK_ENABLED';

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

export type ProviderState = 'live' | 'connecting' | 'ok' | 'idle' | 'error' | 'stale' | 'not-configured' | 'switched-off' | 'planned' | 'disabled';

/** One word for a provider's state from its policy, switch, credential and recent requests. */
export function providerState(def: ProviderDef, report: ProviderReport | null, feed?: string, now = Date.now()): ProviderState {
  if (def.policy === 'disabled') return 'disabled';
  if (def.policy === 'planned') return 'planned';
  if (def.setting && report?.settings?.[def.setting]?.value === false) return 'switched-off';
  if (def.credential && !report?.credentials[def.credential]?.configured) return 'not-configured';
  if (def.credential2 && !report?.credentials[def.credential2]?.configured) return 'not-configured';
  // A direct renderer socket has no HTTP request in the main-process ledger.
  if (def.feed === 'stream') {
    if (feed === 'live') return 'live';
    if (feed === 'connecting') return 'connecting';
    if (feed === 'error') return 'error';
    return 'idle';
  }
  // Historical-year downloads must not conceal a failed current-year curve.
  if (def.id === 'treasury' && (feed === 'live' || feed === 'error' || feed === 'connecting')) return feed;
  const s = report?.providers[def.id];
  // "No data" for one symbol or series is an answer, not a failure of the provider.
  if (s?.lastErrorAt && s.lastErrorKind !== 'no-data' && (!s.lastSuccessAt || s.lastErrorAt > s.lastSuccessAt)) return 'error';
  // A provider the app asks continually that has not answered for several rounds.
  if (def.cadenceMs && s?.lastSuccessAt && now - s.lastSuccessAt > 3 * def.cadenceMs) return 'stale';
  if (feed === 'live' && s?.lastSuccessAt) return 'live';
  if (s?.lastSuccessAt) return 'ok';
  return 'idle';
}
