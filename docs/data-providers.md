# Data providers

Checked on 12 October 2026 against each provider's own pages. Text in quotation marks is copied from those pages. Where a page could not be read, the entry says so instead of guessing. Re-read these pages before changing how a provider is used, and update the date.

In the desktop app, every request below goes out from the Electron main process (`electron/main.cjs`); the screens never call a provider directly and never see a key. The `PROV` screen shows each provider's live state, and `src/data/providers.ts` holds the same list in code.

## Summary

| Provider | Used for | Access | Credential | State in the app |
| --- | --- | --- | --- | --- |
| Yahoo Finance | Quotes, streaming prices, history, company data, options, headlines, search | Undocumented web endpoints | None | Enabled (desktop) |
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
| SEC EDGAR | Filings and reported company facts | data.sec.gov APIs | `SEC_USER_AGENT` (your contact) | Planned, not connected |
| Massive (formerly Polygon.io) | US stock end-of-day history | REST API | `MASSIVE_API_KEY` | Planned, not connected |
| Finnhub, Coinbase Exchange, Frankfurter | Former browser-build feeds | | | Disabled |
| Twelve Data, Financial Modeling Prep | | | | Not used; terms not reviewed |

## Yahoo Finance

What the app calls, from the main process: a cookie from `https://fc.yahoo.com/`, a crumb from `/v1/test/getcrumb`, then `query2.finance.yahoo.com` paths `/v7/finance/quote`, `/v8/finance/chart`, `/v10/finance/quoteSummary`, `/v7/finance/options`, `/v1/finance/search` and `/ws/fundamentals-timeseries`, plus the stream at `wss://streamer.finance.yahoo.com/?version=2`. Yahoo publishes no documentation for any of these. Requests carry Electron's own user agent, which names this app and the Chromium engine sending them. A test on 12 October 2026 showed Yahoo refusing a crumb to a client that names itself without a browser engine.

What Yahoo's pages say:

- [Exchanges and data providers](https://help.yahoo.com/kb/finance/SLN2310.html): "You must not redistribute information displayed on or provided by Yahoo Finance." and "All data provided on Yahoo Finance is provided for informational purposes only, and is not intended for trading or investing purposes."
- [Terms of service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), among the things users may not do: "access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission." This app collects data that way. The project brief keeps Yahoo for private personal use and accepts this risk. Yahoo can block the app at any time.
- [API terms](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apitnc/index.html) cover Yahoo's official APIs used with Yahoo API credentials. The app uses no credentials. The same terms bar using "any automated means other than the Yahoo APIs, including agents, robots, scripts or spiders, to access, query or otherwise collect Yahoo-related information".
- The [yfinance repository](https://github.com/ranaroussi/yfinance) refused this check (HTTP 403), so its disclaimer is not quoted here.

Delays listed on Yahoo's page, for the markets this app covers: Nasdaq, S&P indices, Dow Jones indexes, currencies, crypto (Coinbase, CoinMarketCap) and the Toronto Stock Exchange are real time; CBOT and CME 10 minutes; NYMEX, COMEX and ICE Futures US 30 minutes; Cboe indices, NYSE indices, OPRA (options) and OTC Markets 15 minutes; London Stock Exchange 20 minutes; Xetra, Euronext Paris, Euronext Amsterdam and Hong Kong 15 minutes; SIX Swiss Exchange 30 minutes; Tokyo 20 minutes; ASX 20 minutes; FTSE indices 15 minutes; Nikkei indices 30 minutes. NYSE-listed stocks have no row of their own; Yahoo quotes them as "Nasdaq Real Time Price".

The same page names the providers behind Yahoo's data: US equity and global index history from Commodity Systems, Inc.; international history from Morningstar; financial statements, valuation ratios, market cap and shares outstanding from Morningstar; estimates, analyst recommendations and price targets from S&P Global Market Intelligence; holders from Vickers-stock.com; upgrades and downgrades from Benzinga.

Quote metadata does not always agree with that page. On 12 October 2026 the quote API returned: AAPL "Nasdaq Real Time Price" with `exchangeDataDelayedBy` 15; SHEL.L "Delayed Quote" with 15 (the page lists 20 for London); CL=F "Delayed Quote" with 10 (the page lists 30 for NYMEX); EURUSD=X "Delayed Quote" with 0 (the page lists currencies as real time); BTC-USD "CoinMarketCap" with 0. The app labels each quote from its own metadata and nothing else: "Live (provider-labelled)" when the source name says real time, "Delayed N min (provider-labelled)" when it gives minutes, and "Timing not confirmed" otherwise. The quote strip shows the source time next to the time the app received the quote, so a quote's real age is visible.

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
- [API terms of use](https://fred.stlouisfed.org/docs/api/terms_of_use.html): the Bank "may impose or adjust the limit on the amount of bandwidth you may use or the number of transactions you may send or receive through the FRED® API".
- [Release dates](https://fred.stlouisfed.org/docs/api/fred/release_dates.html) are dates only: "release dates are published by data sources and do not necessarily represent when data will be available on the FRED or ALFRED websites." Future dates need `include_release_dates_with_no_data=true`.

How the app uses it: API version 1, `api.stlouisfed.org/fred/series/observations` and `/fred/release/dates`, with your key in the `api_key` parameter, sent only from the main process and at most 60 requests a minute. Version 2 would return every series on each release with its full history, far more than the app reads, so the app does not use it.

When FRED turns a request down, the body says why, for example `{"error_code":400,"error_message":"Bad Request.  Variable api_key is not set. ..."}` (the answer to one request sent without a key on 12 October 2026). The app keeps that explanation, without the key or links: `PROV` shows it, and when it is about the key (HTTP 400 naming `api_key`, such as "The value for variable api_key is not registered.") `ECO` says the key was not accepted, and the app sends nothing more until you save a key in `PROV`, apart from one request at each scheduled refresh. On 429 or 423 it stops the pass and tries again two minutes later. A configured key that is not 32 lowercase letters and digits is never sent.

What changed on 12 October 2026: the app used to download the website's `fredgraph.csv` and read the HTML release calendar, presenting a browser user agent first. That goes against the terms above, so FRED now goes through the API with your key. Without a key nothing is sent, and ECO and ECST say the key is needed. ECO shows US release dates without a time of day, because the API gives none.

Not live-tested with a key: none was available while building this. The parsers are tested on the example responses in FRED's documentation, and the error format on the one keyless request above.

## SEC EDGAR (planned)

SEC.gov refuses automated requests that do not declare a contact, including requests for its documentation pages, so these two pages were read through a tool that summarises; the quotes below are as it returned them.

- [Accessing EDGAR data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) (last reviewed 26 June 2024): "Current max request rate: 10 requests/second." Declare a user agent such as "Sample Company Name AdminContact@<sample company domain>.com".
- [EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) (last reviewed 8 April 2025): submissions at `https://data.sec.gov/submissions/CIK##########.json`, company facts at `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`, plus companyconcept and frames. "These APIs do not require any authentication or API keys to access." "data.sec.gov does not support Cross Origin Resource Scripting (CORS)." The JSON is updated as filings are disseminated, typically within a second for submissions and a minute for XBRL data; bulk ZIP files are rebuilt nightly at about 3:00 a.m. ET.

The pages do not list the JSON field names, so the adapter will be written against real responses once `SEC_USER_AGENT` holds a contact you control. Planned limit: 5 requests a second.

## Massive (planned)

- [Pricing](https://massive.com/pricing?product=stocks), Stocks Basic: "$0 /month", "5 API Calls / Minute", "2 Years Historical Data", "End of Day Data", "Reference Data", "Corporate Actions", "Technical Indicators", "Minute Aggregates", "Individual use".
- [Custom bars](https://www.massive.com/docs/rest/stocks/aggregates/custom-bars): `GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}`; the example uses `https://api.massive.com` with an `apiKey` query parameter. Plan recency for Stocks Basic: "End-of-day". `adjusted`: "Whether or not the results are adjusted for splits. By default, results are adjusted." `limit`: "Max 50000 and Default 5000." Response: `ticker`, `adjusted`, `queryCount`, `request_id`, `resultsCount`, `status`, `results` (`c`, `h`, `l`, `n`, `o`, `otc`, `t` "The Unix millisecond timestamp for the start of the aggregate window", `v`, `vw`) and `next_url`. Bars are built in Eastern Time, and "If no eligible trades occur within a given timeframe, no aggregate bar is produced".
- [Individual terms](https://www.massive.com/legal/individuals-terms-of-service) (last updated 18 July 2025): use "solely for your own personal, non-commercial, and non-business purposes".
- [Market data terms](https://massive.com/legal/market-data-terms-of-service) (last updated 28 August 2025): non-professional, "personal, non-business use" only; no redistribution or display of the data, or of works derived from it, to any third party; no "non-display use" or derivative works "unless you are licensed to do so".

Not connected and not live-tested: no key was available. Bars from Massive will be kept apart from Yahoo's and labelled End of day, split-adjusted.

## Disabled and not reviewed

- Finnhub, Coinbase Exchange and Frankfurter fed the browser build. They are switched off (`BROWSER_FEEDS_ENABLED` in `src/data/providers.ts`): Finnhub needed an API key held in the browser, and none of their terms were reviewed for this use. A Finnhub key saved by an earlier version is erased at start-up.
- Twelve Data and Financial Modeling Prep are not used. Their pricing and display terms were not reviewed in this check.

## User agents

- Yahoo: Electron's own user agent.
- Every other provider: `ArminTerminal/<version> (+https://github.com/arminshah/bloomberg-terminal)`. All 14 official endpoints the app reads answered it on 12 October 2026.
- SEC (when connected): the value of `SEC_USER_AGENT`.
