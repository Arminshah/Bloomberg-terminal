# Data providers

Checked between 12 and 14 October 2026 against each provider's own pages; sections read after the 12th give their date. Text in quotation marks is copied from those pages. Where a page could not be read, the entry says so instead of guessing. Re-read these pages before changing how a provider is used, and update the date.

In the desktop app, every request below goes out from the Electron main process (`electron/main.cjs`); the screens never call a provider directly and never see a key. The `PROVIDERS` screen shows each provider's live state, and `src/data/providers.ts` holds the same list in code.

## Summary

| Provider | Used for | Access | Credential | State in the app |
| --- | --- | --- | --- | --- |
| Yahoo Finance (unofficial) | Quotes, streaming prices, history, company profiles and statements, holders, symbol search | Undocumented web endpoints | None | Enabled (desktop), switch `YAHOO_PRICES_ENABLED`; options, news and analyst data off |
| US Treasury | Daily par yield curve | CSV download | None | Enabled |
| Federal Reserve Bank of New York | EFFR, SOFR and the other reference rates | Markets data API | None | Enabled |
| Federal Reserve Board | FOMC meeting calendar | Web page | None | Enabled |
| European Central Bank | Deposit facility rate | Data Portal API | None | Enabled |
| Bank of England | Bank Rate; 5, 10 and 20-year gilt par yields | Database CSV | None | Enabled |
| Deutsche Bundesbank | German zero-coupon yields, 2 to 30 years | Time series API | None | Enabled |
| Swiss National Bank | SNB policy rate | Data portal | None | Enabled |
| Bank of Canada | Policy rate; benchmark bond yields | Valet API | None | Enabled |
| Reserve Bank of Australia | Cash rate target; government bond yields | Statistical tables (CSV) | None | Enabled |
| Banco Central do Brasil | Selic target | SGS API | None | Enabled |
| Ministry of Finance Japan | JGB yields | CSV download | None | Enabled |
| Office for National Statistics | UK CPI, GDP growth, unemployment | Time series CSV and JSON | None | Enabled |
| Eurostat | HICP, GDP growth and unemployment for the euro area and its largest members | Statistics API (JSON-stat) | None | Enabled |
| Statistics Canada | Canada unemployment rate and CPI | Web Data Service | None | Enabled |
| Australian Bureau of Statistics | Australia unemployment rate and monthly CPI | Data API (SDMX, CSV) | None | Enabled |
| FRED | US release dates and values; OECD series for Japan, Canada and Australia | FRED API | `FRED_API_KEY` | Enabled once the key is set |
| SEC EDGAR | Company search, filing histories with document links, XBRL reported figures (`FILINGS`) | data.sec.gov APIs and the SEC's company ticker file | `SEC_USER_AGENT` (your contact) | Enabled once `SEC_USER_AGENT` is set |
| Kraken | Crypto prices, best bid and offer, daily and 5-minute candles, order books for 10 USD pairs | Public REST API | None | Enabled (desktop), switch `KRAKEN_ENABLED` |
| CoinGecko | Market value and circulating supply of the listed coins (aggregated) | Demo API | `COINGECKO_API_KEY` | Enabled once the key is set |
| Official announcements | Press releases from the Fed Board, ECB, Bank of England, Bank of Canada, RBA, BEA and ESMA (`HEADLINES`, `NEWS`) | Each publisher's RSS feed | None | Enabled |
| Massive (formerly Polygon.io) | Second source for US stock daily closes (`CROSSCHECK`) | REST API | `MASSIVE_API_KEY` | Enabled once the key is set |
| Alpha Vantage | Second source for US stock daily closes (`CROSSCHECK`) | REST API | `ALPHA_VANTAGE_API_KEY` | Enabled once the key is set |
| Twelve Data | Second source for US stock daily closes (`CROSSCHECK`) | REST API | `TWELVE_DATA_API_KEY` | Off until the key is set and `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` is on |
| Binance | | Spot REST API | | Evaluated, not connected (see below) |
| Finnhub, Coinbase Exchange, Frankfurter | Former browser-build feeds | | | Disabled |
| Financial Modeling Prep | | | | Not connected: its documentation could not be read (see below) |

## Yahoo Finance

What the app calls, from the main process: a cookie from `https://fc.yahoo.com/`, a crumb from `/v1/test/getcrumb`, then `query2.finance.yahoo.com` paths `/v7/finance/quote`, `/v8/finance/chart`, `/v10/finance/quoteSummary`, `/v1/finance/search` and `/ws/fundamentals-timeseries`, plus the stream at `wss://streamer.finance.yahoo.com/?version=2`. Option chains, news and analyst data are switched off in the main process (`electron/yahoo-scope.cjs`): the options path is not on the allowlist, symbol search asks for no news, and analyst modules and fields (ratings, recommendations, price targets, estimates, forward P/E and EPS) are removed from every answer before a screen sees it. Yahoo publishes no documentation for any of these. Requests carry Electron's own user agent, which names this app and the Chromium engine sending them. A test on 12 October 2026 showed Yahoo refusing a crumb to a client that names itself without a browser engine.

What Yahoo's pages say:

- [Exchanges and data providers](https://help.yahoo.com/kb/finance/SLN2310.html): "You must not redistribute information displayed on or provided by Yahoo Finance." and "All data provided on Yahoo Finance is provided for informational purposes only, and is not intended for trading or investing purposes."
- [Terms of service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), among the things users may not do: "access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission." This app collects data that way. The project brief keeps Yahoo for private personal use and accepts this risk. Yahoo can block the app at any time.
- [API terms](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apitnc/index.html) cover Yahoo's official APIs used with Yahoo API credentials. The app uses no credentials. The same terms bar using "any automated means other than the Yahoo APIs, including agents, robots, scripts or spiders, to access, query or otherwise collect Yahoo-related information".
- The [yfinance repository](https://github.com/ranaroussi/yfinance) refused this check (HTTP 403), so its disclaimer is not quoted here.

Delays listed on Yahoo's page, for the markets this app covers: Nasdaq, S&P indices, Dow Jones indexes, currencies, crypto (Coinbase, CoinMarketCap) and the Toronto Stock Exchange are real time; CBOT and CME 10 minutes; NYMEX, COMEX and ICE Futures US 30 minutes; Cboe indices, NYSE indices, OPRA (options) and OTC Markets 15 minutes; London Stock Exchange 20 minutes; Xetra, Euronext Paris, Euronext Amsterdam and Hong Kong 15 minutes; SIX Swiss Exchange 30 minutes; Tokyo 20 minutes; ASX 20 minutes; FTSE indices 15 minutes; Nikkei indices 30 minutes. NYSE-listed stocks have no row of their own; Yahoo quotes them as "Nasdaq Real Time Price".

The same page names the providers behind Yahoo's data: US equity and global index history from Commodity Systems, Inc.; international history from Morningstar; financial statements, valuation ratios, market cap and shares outstanding from Morningstar; estimates, analyst recommendations and price targets from S&P Global Market Intelligence; holders from Vickers-stock.com; upgrades and downgrades from Benzinga.

Quote metadata does not always agree with that page. On 12 October 2026 the quote API returned: AAPL "Nasdaq Real Time Price" with `exchangeDataDelayedBy` 15; SHEL.L "Delayed Quote" with 15 (the page lists 20 for London); CL=F "Delayed Quote" with 10 (the page lists 30 for NYMEX); EURUSD=X "Delayed Quote" with 0 (the page lists currencies as real time); BTC-USD "CoinMarketCap" with 0. The app labels each quote from its own metadata and timestamps and nothing else (`src/data/freshness.ts`): REAL-TIME when the source name says real time and the latest price is recent enough for the instrument, DELAYED with the minutes it gives, UNKNOWN FRESHNESS when it says neither, END OF DAY once the session is over, and STALE when a price is older than its threshold (10 minutes for currencies, crypto and indices, 30 for stocks and futures, beyond any stated delay) while its market should be updating. The quote strip shows the source time next to the time the app received the quote, so a quote's real age is visible.

Request pacing: quotes are polled every 30 seconds while the stream is connected, every 10 seconds without it and every 60 seconds while the window is hidden, with exponential backoff after errors. Daily history loads three requests at a time at start-up, the panels on screen first. Intraday bars refresh every 20 seconds for open panels only.

## US Treasury

The app downloads the daily par yield curve CSV for each year from `home.treasury.gov`. The [methodology page](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology) says: "The Treasury's official yield curve is a par yield curve derived using a monotone convex method. Our inputs are indicative, bid-side market price quotations (not actual transactions) for the most recently auctioned securities obtained by the Federal Reserve Bank of New York at or near 3:30 PM each trading day." Treasury's terms of use were not reviewed in this check.

## Federal Reserve Bank of New York

The app reads `markets.newyorkfed.org/api/rates/...` ([API docs](https://markets.newyorkfed.org/static/docs/markets-api.html)). The [reference rates page](https://www.newyorkfed.org/markets/reference-rates/additional-information-about-reference-rates) says: "The EFFR and the OBFR will be published at approximately 9:00 a.m. ET each business day", and that a rate may be revised at about 2:30 p.m. ET when the change exceeds one basis point. The New York Fed's [terms of use](https://www.newyorkfed.org/termsofuse) render only in a browser and were not reviewed in this check.

## Federal Reserve Board

The app reads the [FOMC calendar page](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm). The Board's [website policies](https://www.federalreserve.gov/disclaimer.htm): "Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information."

## European Central Bank and Deutsche Bundesbank

The app reads the deposit facility rate from the [ECB Data Portal API](https://data.ecb.europa.eu/help/api/overview) and German yields from the [Bundesbank time series API](https://api.statistiken.bundesbank.de/doc/index.html). The [ESCB reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html): "All publicly available ESCB statistics may be reused free of charge on the condition that the source is quoted (e.g. "Source: ECB statistics.") and that the statistics (including metadata) are not modified." The Bundesbank is a national central bank of the ESCB; its own terms of use were not reviewed in this check.

## Bank of England

The app reads Bank Rate (IUDBEDR) and nominal par gilt yields (IUDSNPY, IUDMNPY, IUDLNPY) from the [database](https://www.bankofengland.co.uk/boeapps/database/). The [legal page](https://www.bankofengland.co.uk/legal): "Reproduction of data in the Database is subject to the terms of the UK Open Government Licence", except "selected exchange rate data and series" reproduced under third-party licences.

## Bank of Canada

The app reads the policy rate and benchmark bond yields from the [Valet API](https://www.bankofcanada.ca/valet/docs). The [terms of use](https://www.bankofcanada.ca/terms/): "the Bank permits you to freely use, copy, distribute and transmit its website content", and "You must attribute the Bank of Canada as the source of the content, and indicate if changes were made."

## Reserve Bank of Australia

The app reads tables F1 and F2 from the [statistical tables](https://www.rba.gov.au/statistics/tables/). The [copyright page](https://www.rba.gov.au/copyright/): RBA material "is provided under a Creative Commons Attribution 4.0 International License (CC BY 4.0 Licence)" and may be reproduced and adapted "provided that the RBA is properly attributed".

## Swiss National Bank, Banco Central do Brasil, Ministry of Finance Japan

The app reads the SNB policy rate from the [data portal](https://data.snb.ch/en), the Selic target from the [BCB open data portal](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom) and JGB yields from the [Ministry of Finance](https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm). Their terms were not verified in this check: the SNB and Ministry of Finance terms pages returned 404, and the BCB terms were not reviewed.

## Office for National Statistics

The app reads CPI (D7G7) and GDP growth (IHYR) as CSV and unemployment (MGSX) as JSON. The [licences page](https://www.ons.gov.uk/methodology/geography/licences): under the Open Government Licence "if you wish to use or re-use ONS material, whether commercially or privately, you may do so freely without a specific application for a licence", with the credit "Source: Office for National Statistics licensed under the Open Government Licence v.3.0".

The ONS dates each Labour Force Survey rate by the middle month of its three months: the JSON for MGSX labels the row dated "2026 JUN" as "2026 MAY-JUL". The app dates such a figure by the last month it covers and shows the window ("May-Jul 2026").

## Eurostat

The app calls the [Statistics API](https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-getting-started/api) for `prc_hicp_minr`, `une_rt_m` and `namq_10_gdp` in JSON-stat, filtered with `sinceTimePeriod`. The [copyright notice](https://ec.europa.eu/eurostat/en/help/copyright-notice): "Reuse of statistical data, metadata, publications, and other dissemination tools published on this website for commercial or non-commercial purposes is authorised provided the source is acknowledged." Modifications to the data "must be stated clearly to the end user".

The app keeps Eurostat's status flags: "e" (estimated, as for flash estimates) and "p" (provisional), and ECST shows them next to the period. For the euro area it uses geo code EA, the series Eurostat headlines: its July 2026 rate, 2.9%, matches the euro area rate in Eurostat's release for that month, while the fixed-composition EA21 series reads 3.0%.

## Statistics Canada

Checked on 13 October 2026.

- [Web Data Service user guide](https://www.statcan.gc.ca/en/developers/wds/user-guide): the app uses `getDataFromVectorByReferencePeriodRange` for vector 2062815 (unemployment rate, seasonally adjusted) and vector 41690973 (CPI, all items), in one request. "Server limits of 50 requests per second with a individual IP address limit of 25 requests per second."
- [Open Licence](https://www.statcan.gc.ca/en/terms-conditions/open-licence): "You shall include and maintain the following notice on all licensed rights of the Information: Source: Statistics Canada, name of product, reference date. Reproduced and distributed on an "as is" basis with the permission of Statistics Canada." For figures worked out from it: "Adapted from Statistics Canada, name of product, reference date".

ECST shows the unemployment rate as published and the 12-month CPI change worked out from the published index (StatCan's own method), and names Statistics Canada as the source. Before 13 October 2026 Canada's unemployment came from the OECD's series on FRED, a month behind StatCan, and its inflation was not shown.

## Australian Bureau of Statistics

Checked on 13 October 2026.

- [Data API user guide](https://www.abs.gov.au/about/data-services/application-programming-interfaces-apis/data-api-user-guide): "As of the 29th of November 2024, Data API keys have been removed" and "The Data API is freely accessible without the need for an API key." CSV with `format=csv`. The app reads `ABS,LF,1.0.0/M13.3.1599.20.AUS.M` (unemployment rate, seasonally adjusted) and `ABS,CPI,2.0.0/3.10001.10.50.M` (monthly CPI, all groups, percentage change from a year earlier).
- [Copyright](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer): "All material presented on this website is provided under a Creative Commons Attribution 4.0 International licence", with exceptions (the coat of arms, the ABS logo, trade marks, microdata, third-party content) that the app does not use.

## FRED (Federal Reserve Bank of St. Louis)

What the pages say:

- [API keys, version 1](https://fred.stlouisfed.org/docs/api/api_key.html): "All web service requests require an API key to identify requests." "Developers should request a distinct API key for each application they build." "All users of an application shall use their own API key." "The API key is set using the api_key variable, a 32 character lower-cased alpha-numeric string."
- [API keys, version 2](https://fred.stlouisfed.org/docs/api/fred/v2/api_key.html): "An API key must be specified in the request header in the following way: Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456". Both key pages send you to the same fredaccount.stlouisfed.org account to request or view keys.
- [Version 2](https://fred.stlouisfed.org/docs/api/fred/v2/index.html) has one endpoint, [`fred/v2/release/observations`](https://fred.stlouisfed.org/docs/api/fred/v2/release_observations.html): "Get the observations for all series on a release of economic data", up to 500,000 observations a page, with `next_cursor` for the rest. Version 1 has the series-level endpoints, among them `fred/series/observations` and `fred/release/dates`.
- Rate limits, from the errors pages. [Version 1](https://fred.stlouisfed.org/docs/api/fred/errors.html): "Up to 120 requests per minute are allowed before being served a 429 error code. Not complying with the throttling can result in a temporary block." [Version 2](https://fred.stlouisfed.org/docs/api/fred/v2/errors.html): "Up to 2 requests per second are allowed before being served a 429 error code." The version 1 page also lists 423 Locked without explaining it.
- [FRED terms](https://fred.stlouisfed.org/legal/): "Don't do any data mining, scraping or extraction of FRED data." Personal use allows you to "Create an app using a subset of FRED data through the free API". Copyrighted series: "Before using data with a copyright notice for anything other than your own personal use, you must contact the data owner to obtain permission." Cite the source and FRED, for example "Source: BLS via FRED".
- [API terms of use](https://fred.stlouisfed.org/docs/api/terms_of_use.html): the Bank "may impose or adjust the limit on the amount of bandwidth you may use or the number of transactions you may send or receive through the FRED® API". Applications must "Place the following notice prominently on your application": "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis." The app shows it, with a link to the terms, under every screen with FRED data (RELEASES, ECONSTATS, MACRO).
- [Series observations](https://fred.stlouisfed.org/docs/api/fred/series_observations.html): `output_type` "4 = Observations, Initial Release Only"; `realtime_start` and `realtime_end` set the real-time period (ALFRED vintages).
- [Release dates](https://fred.stlouisfed.org/docs/api/fred/release_dates.html) are dates only: "release dates are published by data sources and do not necessarily represent when data will be available on the FRED or ALFRED websites." Future dates need `include_release_dates_with_no_data=true`.

How the app uses it: API version 1, `api.stlouisfed.org/fred/series/observations` and `/fred/release/dates`, with your key in the `api_key` parameter, sent only from the main process and at most 60 requests a minute. Version 2 would return every series on each release with its full history, far more than the app reads, so the app does not use it.

The macro dashboard (`MACRO`) reads 21 series: the fed funds target and effective rate, 2 and 10-year Treasury yields and two curve spreads, CPI, core CPI and core PCE inflation, unemployment, payrolls, jobless claims, real GDP growth, industrial production, M2, ICE BofA investment-grade and high-yield spreads, the Chicago Fed and St. Louis Fed financial conditions indexes, the real-time Sahm rule and the NBER recession indicator. Each line names the agency behind it. The two ICE series are copyrighted and marked "personal use only", as FRED's terms require. For payrolls and GDP growth the app also asks for the first published values (`output_type=4` over every vintage, `realtime_start=1776-07-04`, `realtime_end=9999-12-31`), and shows them against today's values with the day each was first published.

When FRED turns a request down, the body says why, for example `{"error_code":400,"error_message":"Bad Request.  Variable api_key is not set. ..."}` (the answer to one request sent without a key on 12 October 2026). The app keeps that explanation, without the key or links: `PROVIDERS` shows it, and when it is about the key (HTTP 400 naming `api_key`, such as "The value for variable api_key is not registered.") `RELEASES` says the key was not accepted, and the app sends nothing more until you save a key in `PROVIDERS`, apart from one request at each scheduled refresh. On 429 or 423 it stops the pass and tries again two minutes later. A configured key that is not 32 lowercase letters and digits is never sent.

What changed on 12 October 2026: the app used to download the website's `fredgraph.csv` and read the HTML release calendar, presenting a browser user agent first. That goes against the terms above, so FRED now goes through the API with your key. Without a key nothing is sent, and RELEASES, ECONSTATS and MACRO say the key is needed. RELEASES shows US release dates without a time of day, because the API gives none.

Live-tested on 14 October 2026 with the owner's key: release dates, series values, the macro series and the first releases all answered (for example, real GDP growth for the fourth quarter of 2025 was first published at 1.4% on 20 February 2026 and stands at 0.2% now). The parsers are also tested on the example layouts in FRED's documentation.

## Kraken

Read on 13 October 2026.

- [Ticker](https://docs.kraken.com/api/docs/rest-api/get-ticker-information): `GET https://api.kraken.com/0/public/Ticker?pair=...`, no key. Per pair: `a` ask, `b` bid, `c` "Last trade closed", and `v`, `p`, `t`, `l`, `h` as `[<today>, <last 24 hours>]`, `o` "Today's opening price". "Today's prices start at midnight UTC." The ticker carries no time of its own.
- OHLC (`/0/public/OHLC?pair=...&interval=...`): `[time, open, high, low, close, vwap, volume, count]` per candle, oldest first; the last candle is still forming, and `last` names the last complete one. Depth (`/0/public/Depth?pair=...&count=...`): asks and bids as `[price, volume, timestamp]`. Checked against live answers.
- [Rate limits](https://support.kraken.com/at/articles/206548367-What-are-the-API-rate-limits-): public endpoints are limited by IP address (Trades and OHLC also by pair); calling them "at a frequency of 1 per second (or less) would remain within the rate limits". Errors come in the body, for example `EGeneral:Too many requests`.
- [Terms](https://www.kraken.com/legal) (Global Terms, last updated 6 October 2026; EEA Terms effective 7 October 2026): Kraken's content, "including, for example, our pricing data", may be used "only for your own benefit"; the restrictions include bots and scripts and "any third party applications that interact with Our Content without our prior written consent". The public REST API is Kraken's documented route to market data. This private app uses it only for its owner's display, one request a second at most: a risk accepted here, as with Yahoo.

How the app uses it (`electron/kraken.cjs`, `src/data/live/kraken.ts`): Kraken owns the ten crypto lines (BTC, ETH, SOL, XRP, ADA, DOGE as Kraken's XDG, AVAX, LINK, LTC, DOT, all against USD) unless `KRAKEN_ENABLED` is off. Two years of daily candles at start; the ticker for all ten pairs every 5 seconds in one request; five-minute candles of the UTC day when a chart asks; the top 15 levels of the order book every 3 seconds while DEPTH is open. A snapshot is timed by Kraken's `Date` header. The day's change is against the close of Kraken's previous daily candle; after midnight UTC the candles are reloaded and the change shows unverified until they are. Every price is labelled Kraken's: one exchange's market, not a market-wide price.

## CoinGecko

Read on 13 October 2026. [Pricing](https://www.coingecko.com/en/api/pricing): the Demo plan is "$0 /month", 10k call credits a month, 100 calls a minute, one API key, "Attribution required". [API terms](https://www.coingecko.com/en/api_terms) (5 September 2025): show "Powered by CoinGecko" (section 4.1.4); "We do not encourage caching or storage of Data", and a cache should be refreshed at least every 24 hours (section 6.1); no redistributing or syndicating access (4.1.6).

The app asks `coins/markets` for the ten coins every 10 minutes with your key (`COINGECKO_API_KEY`), keeps the answer in memory only, and shows market value and circulating supply in CRYP and DES, marked as CoinGecko's and aggregated, with the attribution. Without a key nothing is sent and those fields show `--`. Not live-tested: no key was available.

## Binance (evaluated, not connected)

From the build environment, `api.binance.com` answered HTTP 451: "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms". The app does not route around that, for example through another Binance host. Binance's spot market also quotes these coins against USDT and USDC, not US dollars, so its prices are for different instruments than the app's USD lines and would not be mixed into them. A Binance adapter would follow the Kraken one (a fixed list of pairs and request kinds in the main process); it would need its own lines, labelled as USDT pairs, and a check that Binance serves the owner's location.

## Official announcements

The news screens (`HEADLINES`, `NEWS`) show press releases from each publisher's own RSS feed, with the publisher's headline, link and publication time, and the time the app received it. Nothing is summarised, generated or labelled as breaking. Feeds are read every 10 minutes. Terms, read on 13 October 2026:

| Publisher | Feed | Terms |
| --- | --- | --- |
| Federal Reserve Board | `https://www.federalreserve.gov/feeds/press_all.xml` | [Website policies](https://www.federalreserve.gov/disclaimer.htm): public domain unless marked otherwise; cite the Board. |
| European Central Bank | `https://www.ecb.europa.eu/rss/press.html` | [Disclaimer and copyright](https://www.ecb.europa.eu/home/disclaimer/html/index.en.html): reproduction with the source acknowledged. |
| Bank of England | `https://www.bankofengland.co.uk/rss/news` | [Legal](https://www.bankofengland.co.uk/legal): website content for personal, non-commercial use. |
| Bank of Canada | `https://www.bankofcanada.ca/content_type/press-releases/feed/` | [Terms](https://www.bankofcanada.ca/terms/): free use with the Bank named as the source. |
| Reserve Bank of Australia | `https://www.rba.gov.au/rss/rss-cb-media-releases.xml` | [Copyright](https://www.rba.gov.au/copyright/): CC BY 4.0 with attribution. |
| US Bureau of Economic Analysis | `https://apps.bea.gov/rss/rss.xml` | [FAQ](https://bea.gov/help/faq/145): "in the public domain and may be used or reproduced without specific permission"; a citation such as "Source: U.S. Bureau of Economic Analysis" is appreciated. |
| ESMA | `https://www.esma.europa.eu/rss.xml` | [Legal notice](https://www.esma.europa.eu/legal-notice): "Reproduction of all information on this site (ESMA Library) is authorised except as otherwise stated", with the source acknowledged; adaptations must say so. |

Not used: the BLS feeds refused the app's requests (HTTP 403), and no working US Treasury press release feed was found. Company news comes from no feed: a company's own announcements are its SEC filings (`FILINGS`). Yahoo's headlines are switched off.

## SEC EDGAR

Read on 13 October 2026. SEC.gov refuses automated requests that do not declare a contact, including requests for its documentation pages, so these pages were read through a tool that summarises; the quotes below are as it returned them.

- [Accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data): "Current max request rate: 10 requests/second." Declare a user agent such as "Sample Company Name AdminContact@<sample company domain>.com". Filing index pages are at `/Archives/edgar/data/{CIK}/{accession}-index.html`, and every document of a filing sits in `/Archives/edgar/data/{CIK}/{accession without dashes}/`. The page lists `/files/company_tickers.json`.
- [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces): submissions at `https://data.sec.gov/submissions/CIK##########.json` (a ten-digit CIK with leading zeros), company facts at `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`. "These APIs do not require any authentication or API keys to access." "data.sec.gov does not support Cross Origin Resource Scripting (CORS)." The JSON is updated "in real time, as submissions are disseminated", with "a typical processing delay of less than a second" for submissions and "under a minute" for XBRL data, longer at peak filing times. A company's recent filings cover "at least one year's of filing or to 1,000 (whichever is more)"; older ones are in extra files the main file lists.
- [Webmaster FAQ](https://www.sec.gov/os/webmaster-faq): "We allow scripted access to sec.gov content", "our current maximum access rate is 10 requests per second", declare a user agent in the sample format above. `/files/company_tickers.json` maps ticker, CIK and EDGAR conformed name, updated periodically "without a guarantee of accuracy or scope". "All Government-created content on sec.gov and EDGAR public filing content are free to access and reuse."

The documentation pages do not list the JSON field names. The parsers follow the field names published for these files (`filings.recent` with the columns `accessionNumber`, `filingDate`, `reportDate`, `acceptanceDateTime`, `form`, `items`, `size`, `isXBRL`, `primaryDocument`, `primaryDocDescription`; `filings.files` with `name`, `filingCount`, `filingFrom`, `filingTo`; company facts as `facts.{taxonomy}.{concept}.units.{unit}[]` with `start`, `end`, `val`, `accn`, `fy`, `fp`, `form`, `filed`) and skip anything that does not match.

How the app uses it (`electron/sec.cjs`, `src/data/live/sec.ts`, the `FILINGS` screen):

- Nothing is sent until `SEC_USER_AGENT` holds an application name and your contact email. The app never makes one up and never fills in an address from anywhere else; until it is set, `FILINGS` says what is needed.
- At most 5 requests a second, half the SEC's ceiling. Answers are kept: filing lists for 5 minutes, company facts for an hour, the company list for a day (also on disk). If a refresh fails, the copy fetched earlier is shown marked STALE with its time.
- A company is found by its US ticker in the SEC's list, or by name or CIK on the search screen. Securities that are not US-listed have no ticker there.
- Filings show the filing date, form, report period, 8-K items by name, and links to the primary document and the filing index on sec.gov. The acceptance time is shown as the submissions file gives it: its time zone suffix was not checked against a live filing.
- Reported figures come from company facts: income statement, cash flow and balance sheet lines in US GAAP or IFRS, annual and quarterly. Each period shows the figure from the most recent filing that reports it, with that filing's form, date and accession; a figure a later filing changed is marked `r` and keeps the first figure in its tooltip. A period is named by the fiscal year of the filing that first reported it, counted back for prior-year comparatives; nothing is named when the dates do not line up. Fourth quarters are not derived from the year.

Not live-tested: no contact User-Agent was available while building this, and sending one that is not the owner's would break the SEC's rules. The parsers are tested on files laid out in the documented structure (`tests/sec.test.ts`), and the screen was checked with the same kind of files served in place of the SEC.

## Second sources for daily closes

`CROSSCHECK` sets the daily closes the app shows for a US stock (from Yahoo) beside the same sessions' closes from Massive, Alpha Vantage and Twelve Data, with the gap in basis points; gaps over 5 bp are marked. These sources are asked only from that screen, only with your own key, and only for finished sessions. Answers are kept for an hour. Requests go out from `electron/eod.cjs` through the main process like every other provider; the parsers are in `src/data/live/eod.ts`.

None of the three was live-tested with a real key: no key was available while building this. The Alpha Vantage and Twelve Data parsers were checked against the answers their documented `demo` keys gave on 14 October 2026 (IBM and AAPL daily series), the Massive parser against the sample in its documentation.

The closes do not all mean the same thing. Massive's are split-adjusted by default; Alpha Vantage's `TIME_SERIES_DAILY` is "raw (as-traded)", so a split inside the window shows as a large gap; Twelve Data gives the session's close. None is adjusted for dividends, and neither are the closes the app charts.

### Massive (formerly Polygon.io)

Pricing and terms as read on 12 October 2026, the API pages on 14 October.

- [Pricing](https://massive.com/pricing?product=stocks), Stocks Basic: "$0 /month", "5 API Calls / Minute", "2 Years Historical Data", "End of Day Data", "Reference Data", "Corporate Actions", "Technical Indicators", "Minute Aggregates", "Individual use".
- [REST quickstart](https://massive.com/docs/rest/quickstart): "You can include your API key in two ways": an `apiKey` query parameter or an `Authorization: Bearer` header. The app uses the header, so the key never appears in a URL.
- [Custom bars](https://www.massive.com/docs/rest/stocks/aggregates/custom-bars): `GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}` on `https://api.massive.com`. Plan recency for Stocks Basic: "End-of-day". `adjusted`: "By default, results are adjusted. Set this to false to get results that are NOT adjusted for splits." `limit`: "Max 50000 and Default 5000." Response: `ticker`, `adjusted`, `queryCount`, `request_id`, `resultsCount`, `status`, `results` (`c`, `h`, `l`, `n`, `o`, `otc`, `t` "The Unix millisecond timestamp for the start of the aggregate window", `v`, `vw`) and `next_url`. Bars are built in Eastern Time, and "If no eligible trades occur within a given timeframe, no aggregate bar is produced".
- [Individual terms](https://www.massive.com/legal/individuals-terms-of-service) (last updated 18 July 2025): use "solely for your own personal, non-commercial, and non-business purposes".
- [Market data terms](https://massive.com/legal/market-data-terms-of-service) (last updated 28 August 2025): non-professional, "personal, non-business use" only; no redistribution or display of the data, or of works derived from it, to any third party; no "non-display use" or derivative works "unless you are licensed to do so".

The app asks for daily bars over the last 45 days, at most 5 requests a minute. A bar's session date is the New York date of its window start.

### Alpha Vantage

Read on 14 October 2026.

- [Support](https://www.alphavantage.co/support/): "free stock API service covering the majority of our datasets for 25 API requests per day". No per-minute limit is stated for the free key.
- [Documentation](https://www.alphavantage.co/documentation/), `TIME_SERIES_DAILY`: "raw (as-traded) daily time series"; `outputsize` defaults to `compact`, the latest 100 data points, and `full` needs a premium key. Real-time and 15-minute delayed US data are premium. The key goes in the `apikey` query parameter, the only way the page documents.
- [Terms of service](https://www.alphavantage.co/terms_of_service/): the licence is to "install, use, access, display and run" the platform "for personal, non-commercial use". Use counts as commercial if, among other things, it goes beyond "investment analysis, research, testing, monitoring, and any other activities that are private and individual in nature", or if you work for or are affiliated with a financial planning advisor, insurance company, investment adviser, investment bank, money manager, registered representative or securities broker-dealer.

The app asks for the compact series only, at most one request a minute and 20 a day (the count restarts at midnight UTC). When Alpha Vantage answers with a limit notice instead of data, `CROSSCHECK` shows the notice.

### Twelve Data

Read on 14 October 2026.

- [Pricing](https://twelvedata.com/pricing), Basic (free) plan: "Basic plan with 8 requests per minute limit", "API requests: 8 (800 a day)", "Internal non-display usage". The Grow plan lists "Internal display data access". The page does not map its personal and commercial licence types to plans.
- [Documentation](https://twelvedata.com/docs): `GET /time_series` on `https://api.twelvedata.com` with `symbol`, `interval` (`1day`), `start_date`, `end_date` and `order` (default `desc`); one credit per symbol. The key goes in the query string or, the recommended way, an `Authorization: apikey <key>` header, which the app uses. The answer has `meta`, `values` (`datetime`, `open`, `high`, `low`, `close`, `volume`, as strings) and `status`.

Showing Twelve Data's prices on a screen is display use, which the free plan's "Internal non-display usage" does not cover. So nothing is sent to Twelve Data until you switch on `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED`, which says your plan allows display. Leave it off on the free plan. When it is on, the app keeps to 6 requests a minute and 600 a day.

### Financial Modeling Prep (not connected)

Its API documentation answered HTTP 403 to automated reading on 14 October 2026, so its free plan's endpoints and answer format could not be confirmed, and no adapter was written. There is no `FMP_API_KEY` setting. An adapter would go in `electron/eod.cjs` beside the three above.

## Disabled and not reviewed

- Finnhub, Coinbase Exchange and Frankfurter fed the browser build. They are switched off (`BROWSER_FEEDS_ENABLED` in `src/data/providers.ts`): Finnhub needed an API key held in the browser, and none of their terms were reviewed for this use. A Finnhub key saved by an earlier version is erased at start-up.

## User agents

- Yahoo: Electron's own user agent.
- Every other provider: `ArminTerminal/<version> (+https://github.com/arminshah/bloomberg-terminal)`. All 14 official endpoints the app reads answered it on 12 October 2026.
- SEC: the value of `SEC_USER_AGENT`, exactly as you set it.
