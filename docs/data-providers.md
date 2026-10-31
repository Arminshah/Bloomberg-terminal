# Data providers

Checked between 12 and 14 October 2026 against each provider's own pages; sections read after the 12th give their date. Text in quotation marks is copied from those pages. Where a page could not be read, the entry says so instead of guessing. Re-read these pages before changing how a provider is used, and update the date.

In the desktop app, every request below goes out from the Electron main process (`electron/main.cjs`); the screens never call a provider directly and never see a key. The `PROVIDERS` screen shows each provider's live state, and `src/data/providers.ts` holds the same list in code.

## Summary

| Provider | Used for | Access | Credential | State in the app |
| --- | --- | --- | --- | --- |
| Yahoo Finance | Quotes, streaming prices, pre-market and after-hours prices, history, company profiles and statements, holders, symbol search, US stocks and stocks on 15 European exchanges; crypto when Kraken does not answer; analysts' expected EPS and revenue against the reports (`EARNINGS`, `EVENTS`); similar stocks (`PEERS`) | Undocumented web endpoints, personal use | None | Enabled (desktop), switch `YAHOO_PRICES_ENABLED`; options off; research switch `YAHOO_RESEARCH_ENABLED`; headlines from its RSS feed (next row) |
| Yahoo Finance headlines | Headlines for the stock on screen, any market Yahoo lists (`COMPANYNEWS`, `QUOTE`) | RSS | None | Enabled (desktop), switch `YAHOO_RSS_ENABLED` |
| Euronext | The latest company press releases filed through Euronext (`MARKETNEWS`) | RSS | None | Enabled (desktop), switch `EURONEXT_RSS_ENABLED` |
| Google News | A search for the day's market news (`MARKETNEWS`); a search for the stock on screen in its market's languages (`COMPANYNEWS`, `QUOTE`) | RSS | None | Enabled (desktop), switch `GOOGLE_NEWS_RSS_ENABLED` |
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
| Congress.gov (Library of Congress) | Bills and laws, with each bill's sponsor, cosponsors, committees, summary, actions and text (`LEGISLATION`) | Congress.gov API v3 | `CONGRESS_GOV_API_KEY` | Enabled once the key is set |
| International Monetary Fund | The World Economic Outlook with its projections (`ECOFORECASTS`); goods trade by partner country, by year and month (`TRADEFLOWS`) | DataMapper API; SDMX API (api.imf.org) | None | Enabled (desktop) |
| FRED | US release dates and values; OECD series for Japan, Canada and Australia | FRED API | `FRED_API_KEY` | Enabled once the key is set |
| SEC EDGAR | Company search, filing histories with document links, XBRL reported figures (`FILINGS`); the latest 8-K filings (`MARKETNEWS`); executives' total compensation from proxy statements (`MANAGEMENT`); what a company reports on its 13F filings (`HOLDINGS`); press releases (`HEADLINES`) | data.sec.gov APIs, the SEC's company ticker file, the latest filings Atom feed, filing folders in the EDGAR archive | `SEC_USER_AGENT` (your contact) | Enabled once `SEC_USER_AGENT` is set |
| Kraken | Crypto prices, best bid and offer, daily and 5-minute candles, order books for 10 USD pairs | Public REST API | None | Enabled (desktop), switch `KRAKEN_ENABLED` |
| CoinGecko | Market value and circulating supply of the listed coins (aggregated) | Demo API | `COINGECKO_API_KEY` | Enabled once the key is set |
| Official announcements | Press releases from the Fed Board, ECB, Bank of England, Bank of Canada, RBA, Bank of Japan, BEA, ESMA and the SEC; Fed speeches, the ECB blog and central bankers' speeches from the BIS (`HEADLINES`, `NEWS`, `BREAKING`) | Each publisher's RSS feed | None | Enabled |
| Massive (formerly Polygon.io) | Second source for US stock daily closes (`CROSSCHECK`); market and ticker news (`MARKETNEWS`, `COMPANYNEWS`) | REST API | `MASSIVE_API_KEY` | Enabled once the key is set; news switch `MASSIVE_NEWS_ENABLED` |
| Alpha Vantage | Second source for US stock daily closes (`CROSSCHECK`) | REST API | `ALPHA_VANTAGE_API_KEY` | Enabled once the key is set |
| Twelve Data | Second source for US stock daily closes (`CROSSCHECK`) | REST API | `TWELVE_DATA_API_KEY` | Off until the key is set and `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` is on |
| Tiingo | Second source for US stock daily closes (`CROSSCHECK`) | REST API | `TIINGO_API_KEY` | Enabled once the key is set, switch `TIINGO_ENABLED` |
| Financial Modeling Prep | Analyst price targets, ratings, rating actions and annual estimates (`ANALYSTS`, `EARNINGS`) | Stable REST API | `FMP_API_KEY` | Enabled once the key is set, switch `FMP_ENABLED` |
| Finnhub | Market, merger and company news (`MARKETNEWS`, `COMPANYNEWS`, `QUOTE`); US company profiles and ratios when Yahoo's summary is refused (`PROFILE`), recommendation trends (`ANALYSTS`), EPS surprises, the past year's reports with revenue expected and reported, and the next report (`EARNINGS`); companies in the same sub-industry (`PEERS`) | REST API | `FINNHUB_API_KEY` | Enabled once the key is set, switch `FINNHUB_ENABLED` |
| Marketaux | News tagged with tickers, with sentiment (`MARKETNEWS`, `COMPANYNEWS`) | REST API | `MARKETAUX_API_TOKEN` | Enabled once the token is set, switch `MARKETAUX_ENABLED` |
| MarketWatch | Top stories headlines (`MARKETNEWS`) | RSS | None | Off until `MARKETWATCH_RSS_ENABLED` is on (Dow Jones terms) |
| Alpaca Market Data | IEX stocks and indicative listed equity option snapshots (`OPTIONS`); Benzinga news (`MARKETNEWS`, `COMPANYNEWS`, `QUOTE`) | Market Data API v2 / v1beta1 | `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | Enabled with both keys and account access, switch `ALPACA_ENABLED`; read-only data host |
| Clerk of the House | Members' trade reports and annual reports, the yearly index of filings, the member list with party (`CONGRESS`) | The Clerk's ZIP index, PDF reports read with PDF.js in the app, MemberData XML | None | Enabled; asked only while `CONGRESS` is open, after its legal notice |
| U.S. Senate | Senators with party and state (`CONGRESS`) | senators_cfm.xml | None | Enabled. Senators' disclosures (efdsearch.senate.gov) refuse automated requests: not read |
| OpenFIGI | The US ticker of each security a 13F lists, by CUSIP or CINS (`HOLDINGS`) | Mapping API v3 | `OPENFIGI_API_KEY` (optional) | Enabled; switch `OPENFIGI_ENABLED` |
| USAspending.gov (U.S. Treasury) | A company's federal contracts and subcontracts (`SPLC`): agencies and prime contractors as customers, subcontractors as suppliers | API v2 (recipient, recipient children, award search) | None | Enabled (desktop) |
| Wikipedia | The FTSE 100's members with ticker, ISIN and ICB sector (`SCREEN`'s FTSE 100 universe) | MediaWiki Action API (`parse`) | None | Enabled (desktop) |
| TipRanks | Analyst consensus, average price target, Smart Score and recent rating actions (`ANALYSTS`), on request | MCP server | `TIPRANKS_API_KEY` | On request only, 45 calls a month at most, switch `TIPRANKS_ENABLED` |
| Anthropic | Answers to open questions on the help desk (`MESSAGES`), with the app's own data as tools | Messages API | `ANTHROPIC_API_KEY` | Enabled once the key is set, switch `CLAUDE_HELPDESK_ENABLED`; without it the built-in assistant answers |
| Nasdaq option chains | Listed options of US stocks and ETFs, NDX and XND: composite bid, ask, last, change, the day's volume and open interest (`OPTIONS`) | JSON behind nasdaq.com's option-chain page | None | Enabled (desktop); see [Nasdaq option chains](#nasdaq-option-chains) |
| Binance | | Spot REST API | | Evaluated, not connected (see below) |
| Cboe delayed quotes | | JSON behind cboe.com's delayed quote pages | | Evaluated, not connected: Cboe forbids automated download (see below) |
| CNBC | | RSS | | Not used: its feeds refuse programs and its owner's terms bar it |
| Coinbase Exchange, Frankfurter | Former browser-build feeds | | | Disabled |

## Access by endpoint, 28 October 2026

One small read-only request per key and endpoint, from the build environment, each result classed as the app classes them. A working key does not open a provider's whole catalogue: the plan decides endpoint by endpoint.

| Provider | Endpoint | Result |
| --- | --- | --- |
| Alpha Vantage | `GLOBAL_QUOTE` | works |
| Alpha Vantage | `EARNINGS_ESTIMATES` | rate limit (the free key's one request a second; a second, slower request is needed to tell the plan) |
| Twelve Data | quote, time series | works |
| CoinGecko | `coins/markets` (demo key) | works |
| FRED | series observations | works |
| Massive | daily bars, dividends | works |
| Massive | stock snapshot | not entitled (plan) |
| SEC EDGAR | submissions, company facts | works (with `SEC_USER_AGENT`) |
| Finnhub | quote, earnings calendar, recommendations | works |
| Finnhub | price target | not entitled (premium) |
| Tiingo | daily prices, IEX | works |
| Marketaux | news | works |
| Alpaca | market data snapshot, news (read-only; no trading endpoint is called) | works |
| FMP | quote, price target for AAPL, senate trades | works |
| FMP | price target for APLD | not entitled (HTTP 402, the plan's symbol list) |
| TipRanks | MCP `initialize`, `Authorization: Bearer` | works |
| OpenFIGI | mapping | works |
| Congress.gov | bills | works |
| EIA | natural gas storage series | works |
| BEA | NIPA tables | works |
| CFTC | public reporting platform (no key) | works |
| Treasury Fiscal Data | debt datasets (no key) | works |
| Eulerpool | congress trades, equity profile | outage (HTTP 502 from its own servers, as on 25 to 27 October); evaluation only, not used |

`FINNHUB_SECRET_KEY` is Finnhub's webhook secret: no request the app makes needs it, so it is never sent. CME Group's settlement pages refuse automated reading (HTTP 403, and its terms forbid scraping), so futures settlements have no independent free reference.

## Review of Codex's notes, 25 October 2026

Codex reviewed the sources of version 2.24.0 and sorted them into keep, keep with clear labels, and optional. Each point was checked against the code and, where it could be, against the live sources with the owner's keys: the self-test on `PROVIDERS`, run twice from a cloud session on 25 October. Every source that is switched on answered at least once.

Where the notes are right, the app already does what they ask:
- The official sources (SEC, FRED, Treasury, central banks, statistics offices) remain the base for filings, macro data and reference rates.
- Kraken gives exchange prices and order books. CoinGecko gives market value and supply only, never a price.
- Alpaca's IEX data is labelled as one exchange wherever it appears (`BQ`, `CROSSCHECK`, the IEX history notice, the help for `ALPACA_IEX_PRICES_ENABLED`). Its options are labelled indicative quotes and delayed trades, not OPRA (`OPTIONS`).
- Yahoo is the largest single dependency. The app retries a refused quote once with a new session, falls back to Yahoo's charts (which need no session) for prices, and says on screen when Yahoo refuses the session. In the second self-test run Yahoo refused quotes and company data (HTTP 401) while its charts and search answered. From the same cloud address, Yahoo answered a plain request for a session with "Too Many Requests", so this looks like throttling of a shared address, not a fault in the app.
- Twelve Data stays off until the owner confirms the plan allows displaying its data. Anthropic is optional and paid.
- A key does not guarantee every endpoint: the app keeps a refusal (HTTP 402 or 403) to the one request, so one refused ticker does not switch off the provider.

Where they are not:
- "Running every overlapping source adds limited value." The second sources for daily closes run only when the owner opens `CROSSCHECK`, and comparing is their purpose. On 25 October they matched Yahoo's closes to the cent for all 34 sessions shown: Apple against Massive, Alpha Vantage and Tiingo, NVIDIA against Massive and Tiingo. The news feeds repeat each other less than the note implies. In the last seven days of Apple and NVIDIA stories, Alpaca (mostly Benzinga) and Massive (mostly The Motley Fool and Zacks) had none in common. Stories no other feed carried: Alpaca 16 of 50 for Apple and 41 of 50 for NVIDIA, Massive 37 and 19 of 50, Finnhub 200 of 246 and 210 of 250. A story two feeds carry is already shown once (`mergeStories` in `src/data/live/marketnews.ts`). No source is dropped.
- Frankfurter republishes the ECB's reference rates. `PORTFOLIO` reads them from the ECB itself (see the ECB section), so Frankfurter would add a dependency and nothing else. It stays off.
- OpenFIGI cannot match a company's ADR to its home share. Checked live on 25 October: ASML's New York shares and the ADRs of Shell, TSMC and AB InBev each have their own share-class FIGI, with no link to the home share and no ADR ratio. OpenFIGI does link one share across exchanges: Shell in London and in Amsterdam share one share-class FIGI. No screen needs that today. The one place where two listings of a company gave wrong numbers (Finnhub's answers for a home listing read as the US listing's) is fixed by checking the currency and the listing.
- "Live account verification remains pending." It was done on 25 October with the owner's keys, as above.

Changed (`691a733`): the self-test on `PROVIDERS` now also checks OpenFIGI (Apple's CUSIP to its ticker, without a key when none is set, as the app also asks without one) and the House Clerk (this year's index of members' filings; last year's in January). Both passed live: "037833100 is AAPL, APPLE INC" and "2026: 1763 filings, 437 of them trade reports, latest filed 2026-10-22".

Seen while checking: Alpha Vantage answered "our standard API rate limit is 25 requests per day" at 16:01 UTC, then answered normally at 16:05 and 16:10 with the same key. Its notice therefore does not prove the day's allowance is spent. After such a notice the app waits one minute before asking again, so it does not give up for the day.

## Yahoo Finance

What the app calls, from the main process: a cookie from `https://fc.yahoo.com/`, a crumb from `/v1/test/getcrumb`, then `query2.finance.yahoo.com` paths `/v7/finance/quote`, `/v8/finance/chart`, `/v10/finance/quoteSummary`, `/v1/finance/search`, `/v6/finance/recommendationsbysymbol` (similar stocks, for `PEERS`) and `/ws/fundamentals-timeseries`, plus the stream at `wss://streamer.finance.yahoo.com/?version=2`. Option chains and news remain switched off in the main process (`electron/yahoo-scope.cjs`). `YAHOO_RESEARCH_ENABLED` separately controls analyst modules and fields; when off, they are stripped before delivery. When enabled, Yahoo targets, recommendation snapshots, rating actions and annual estimates can serve as research fallbacks. One bundled request per issuer is reused for six hours, with failed refreshes retried after a minute and older answers marked stale. Relative recommendation periods and provider fiscal dates/currencies are retained, with revenue and EPS units kept separate for ADRs; missing target-history averages are not inferred. Yahoo publishes no documentation for any of these. Requests carry Electron's own user agent, which names this app and the Chromium engine sending them. A test on 12 October 2026 showed Yahoo refusing a crumb to a client that names itself without a browser engine.

What Yahoo's pages say:

- [Exchanges and data providers](https://help.yahoo.com/kb/finance/SLN2310.html): "You must not redistribute information displayed on or provided by Yahoo Finance." and "All data provided on Yahoo Finance is provided for informational purposes only, and is not intended for trading or investing purposes."
- [Terms of service](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html), among the things users may not do: "access or collect data, or attempt to access or collect data, from our Services using any automated means, devices, programs, algorithms or methodologies, including but not limited to robots, spiders, scrapers, data mining tools, or data gathering or extraction tools, for any purpose without our express, prior permission." This app collects data that way. The project brief keeps Yahoo for private personal use and accepts this risk. Yahoo can block the app at any time.
- [API terms](https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apitnc/index.html) cover Yahoo's official APIs used with Yahoo API credentials. The app uses no credentials. The same terms bar using "any automated means other than the Yahoo APIs, including agents, robots, scripts or spiders, to access, query or otherwise collect Yahoo-related information".
- The [yfinance repository](https://github.com/ranaroussi/yfinance) refused this check (HTTP 403), so its disclaimer is not quoted here.

European stocks are looked up the same way as US ones, typed with the market code (`ABI BB`, `KBC BB Equity`, `ASML NA`, `VOLV/B SS`) or Yahoo's symbol (`ABI.BR`). The codes cover Brussels (BB), Paris (FP), Amsterdam (NA), Lisbon (PL), Dublin (ID), Xetra (GY), London (LN), Milan (IM), Madrid (SM), SIX Swiss (SW), Stockholm (SS), Copenhagen (DC), Helsinki (FH), Oslo (NO) and Vienna (AV); Yahoo's exchange codes for them were checked against its chart answers on 18 October 2026. Yahoo's summary leaves the share count out for many European stocks; the count then comes from the last reported balance sheet in Yahoo's fundamentals series (`quarterlyOrdinarySharesNumber`), and stays unknown if that is missing too. London prices are in pence.

Delays listed on Yahoo's page, for the markets this app covers: Nasdaq, S&P indices, Dow Jones indexes, currencies, crypto (Coinbase, CoinMarketCap) and the Toronto Stock Exchange are real time; CBOT and CME 10 minutes; NYMEX, COMEX and ICE Futures US 30 minutes; Cboe indices, NYSE indices, OPRA (options) and OTC Markets 15 minutes; London Stock Exchange 20 minutes; Xetra, Euronext Paris, Euronext Amsterdam and Hong Kong 15 minutes; SIX Swiss Exchange 30 minutes; Tokyo 20 minutes; ASX 20 minutes; FTSE indices 15 minutes; Nikkei indices 30 minutes. NYSE-listed stocks have no row of their own; Yahoo quotes them as "Nasdaq Real Time Price".

The same page names the providers behind Yahoo's data: US equity and global index history from Commodity Systems, Inc.; international history from Morningstar; financial statements, valuation ratios, market cap and shares outstanding from Morningstar; estimates, analyst recommendations and price targets from S&P Global Market Intelligence; holders from Vickers-stock.com; upgrades and downgrades from Benzinga.

Quote metadata does not always agree with that page. On 12 October 2026 the quote API returned: AAPL "Nasdaq Real Time Price" with `exchangeDataDelayedBy` 15; SHEL.L "Delayed Quote" with 15 (the page lists 20 for London); CL=F "Delayed Quote" with 10 (the page lists 30 for NYMEX); EURUSD=X "Delayed Quote" with 0 (the page lists currencies as real time); BTC-USD "CoinMarketCap" with 0. The app labels each quote from its own metadata and timestamps and nothing else (`src/data/freshness.ts`): REAL-TIME when the source name says real time and the latest price is recent enough for the instrument, DELAYED with the minutes it gives, UNKNOWN FRESHNESS when it says neither, END OF DAY once the session is over, and STALE when a price is older than its threshold (10 minutes for currencies, crypto and indices, 30 for stocks and futures, beyond any stated delay) while its market should be updating. The quote strip shows the source time next to the time the app received the quote, so a quote's real age is visible.

Request pacing: quotes are polled every 30 seconds while the stream is connected, every 10 seconds without it and every 60 seconds while the window is hidden, with exponential backoff after errors. Daily history loads three requests at a time at start-up, the panels on screen first. Intraday bars refresh every 20 seconds for open panels only.

## US Treasury

The app downloads the daily par yield curve CSV for each year from `home.treasury.gov`. The site answers programs slowly: about 18 seconds per yearly file for the app's own user agent on 14 October 2026, against under a second for a browser's. The app keeps its honest user agent; it fetches the current year first, then the year before, then the rest three at a time, and keeps finished years on the computer (they do not change), so later starts fetch only the current year. The [methodology page](https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics/treasury-yield-curve-methodology) says: "The Treasury's official yield curve is a par yield curve derived using a monotone convex method. Our inputs are indicative, bid-side market price quotations (not actual transactions) for the most recently auctioned securities obtained by the Federal Reserve Bank of New York at or near 3:30 PM each trading day." Treasury's terms of use were not reviewed in this check.

## Federal Reserve Bank of New York

The app reads `markets.newyorkfed.org/api/rates/...` ([API docs](https://markets.newyorkfed.org/static/docs/markets-api.html)). The [reference rates page](https://www.newyorkfed.org/markets/reference-rates/additional-information-about-reference-rates) says: "The EFFR and the OBFR will be published at approximately 9:00 a.m. ET each business day", and that a rate may be revised at about 2:30 p.m. ET when the change exceeds one basis point. The New York Fed's [terms of use](https://www.newyorkfed.org/termsofuse) render only in a browser and were not reviewed in this check.

## Federal Reserve Board

The app reads the [FOMC calendar page](https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm). The Board's [website policies](https://www.federalreserve.gov/disclaimer.htm): "Unless otherwise indicated, information on Board's website is in the public domain and may be copied and distributed without permission. Please cite to the Board as the source of the information."

## European Central Bank and Deutsche Bundesbank

The app reads the deposit facility rate from the [ECB Data Portal API](https://data.ecb.europa.eu/help/api/overview) and German yields from the [Bundesbank time series API](https://api.statistiken.bundesbank.de/doc/index.html). The [ESCB reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html): "All publicly available ESCB statistics may be reused free of charge on the condition that the source is quoted (e.g. "Source: ECB statistics.") and that the statistics (including metadata) are not modified." PORTFOLIO also reads the ECB's euro foreign exchange reference rates (dataset `EXR`, series `D.{currency}.EUR.SP00.A`, every published currency for the ten days to a date, checked live on 25 October 2026: 29 currencies). The ECB's [framework for the rates](https://www.ecb.europa.eu/stats/pdf/exchange/Frameworkfortheeuroforeignexchangereferencerates.en.pdf) (23 June 2026, 7 pages, read 25 October 2026) says they are set around 14:10 CET and published around 16:00 CET on days TARGET2 operates, are "intended for information purposes only" and not for use in market transactions, and may be amended until the next business day's rates are published. Since 27 October 2026 the app also reads the euro short-term rate (dataset `EST`, `B.EU000A2X2A25.WT`) for the ECB portal: 2.441% on 26 October when checked live. They are used when a lot is entered with a past purchase date: the entry rate is the rate of that day, or of the last day before it with rates, crossed through the euro, and the position keeps where its rate comes from. A currency the ECB does not publish (TWD, for one) leaves the lot's FX P&L unknown. The Bundesbank is a national central bank of the ESCB; its own terms of use were not reviewed in this check.

## Bank of England

The app reads Bank Rate (IUDBEDR), SONIA (IUDSOIA, since 27 October 2026, for the Bank of England portal) and nominal par gilt yields (IUDSNPY, IUDMNPY, IUDLNPY) from the [database](https://www.bankofengland.co.uk/boeapps/database/). The database answers this app's own User-Agent; a browser-like one received an error page on 27 October. The [legal page](https://www.bankofengland.co.uk/legal): "Reproduction of data in the Database is subject to the terms of the UK Open Government Licence", except "selected exchange rate data and series" reproduced under third-party licences.

## Bank of Japan

Since 27 October 2026 the app reads two series from the Bank's [Time-Series Data Search API](https://www.stat-search.boj.or.jp/info/api_manual_en.pdf) (no key; manual of 18 February 2026, read on 27 October): the basic loan rate (database IR01, `MADR1Z@D`, daily with every change) and the uncollateralized overnight call rate, daily average (FM01, `STRDCLUCON`). Checked live on 27 October: basic loan rate 1.5% from 24 September 2026, call rate 1.227% on 23 October. The policy guideline itself is not a series: the Bank's [statement of 18 September 2026](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k260918a.pdf) set the call rate "at around 1.25 percent" and the basic loan rate at 1.5 percent, both from 24 September; the BOJ portal shows the two published rates under their own names and links the statements. The API's [notice](https://www.stat-search.boj.or.jp/info/api_notice_en.pdf) asks for the credit line "This service uses the API provided by the "Bank of Japan Time-Series Data Search." The Bank of Japan does not guarantee the content of the service." where the figures are shown (the portal shows it), forbids excessive requests (the app asks once an hour), and asks anyone releasing a service that uses it to tell the Bank by email first: for the owner's private use there is nothing to send; if the app were ever offered to others, that email is due.

## Bank of Canada

The app reads the policy rate and benchmark bond yields from the [Valet API](https://www.bankofcanada.ca/valet/docs). The [terms of use](https://www.bankofcanada.ca/terms/): "the Bank permits you to freely use, copy, distribute and transmit its website content", and "You must attribute the Bank of Canada as the source of the content, and indicate if changes were made."

## Reserve Bank of Australia

The app reads tables F1 and F2 from the [statistical tables](https://www.rba.gov.au/statistics/tables/). The [copyright page](https://www.rba.gov.au/copyright/): RBA material "is provided under a Creative Commons Attribution 4.0 International License (CC BY 4.0 Licence)" and may be reproduced and adapted "provided that the RBA is properly attributed".

## BIS central bank policy rates

Read and tested on 31 October 2026. For the banks with no free daily feed of their own, the app reads the BIS's compilation of central bank policy rates ([WS_CBPOL](https://data.bis.org/topics/CBPOL)): `https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.CN+IN+MX+JP?startPeriod=...&format=csv&detail=dataonly`, no key, the last four years in one answer (about 14 KB). Rows are `FREQ,REF_AREA,TIME_PERIOD,OBS_VALUE`, one a day, with NaN on weekends and holidays.

- What each series is, in the BIS's definitions: China "From 20 Aug 2019 onwards: Loan Prime Rate (1 year)"; India "official repo overnight rate"; Mexico "Central Bank target, money-market overnight rate"; Japan the guideline for the uncollateralized overnight call rate ("From 24 Sep 2026: the BOJ encourages the uncollateralized overnight call rate to remain at around 1.25 percent").
- Delay: on 31 October 2026 the latest observations were 19 October (China, India) and 27 October (Japan, Mexico). A decision can reach the BIS days to about three weeks later, so `CENTRALBANKS` and `RATEANALYSIS` show the date of the latest observation beside each rate and say the rate comes via the BIS.
- Checks the same day: the RBI's homepage gave a policy repo rate of 5.50%, as the BIS did (raised from 5.25% on 7 October 2026). The survey of 31 October also found Banxico's own target (6.50%) and the BCB's Selic equal to the BIS's.
- Terms: [Terms of permitted use of BIS statistics](https://data.bis.org/help/legal): "The use of the statistics is unrestricted, provided that: if the statistics are reproduced, the BIS must be cited in your publication or product as the source of the statistics" and the use does not imply endorsement. The app's credit under the rates names the BIS and the four banks.

The Bank of Japan's basic loan rate on `RATEANALYSIS` and `BOJPORTAL` still comes from the Bank's own Time-Series Data Search; `CENTRALBANKS` shows its call-rate guideline from the BIS, which is the rate the Bank sets.

## Swiss National Bank, Banco Central do Brasil, Ministry of Finance Japan

The app reads the SNB policy rate from the [data portal](https://data.snb.ch/en), the Selic target from the [BCB open data portal](https://dadosabertos.bcb.gov.br/dataset/432-taxa-de-juros---meta-selic-definida-pelo-copom) and JGB yields from the [Ministry of Finance](https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/index.htm). Their terms were not verified in this check: the SNB and Ministry of Finance terms pages returned 404, and the BCB terms were not reviewed. Meeting dates for the banks other than the Fed are entered from their published calendars; the BCB's 2027 Copom dates (decisions on 27 January, 17 March, 28 April, 16 June, 4 August, 22 September, 27 October and 8 December) were published on 23 June 2026. The BCB's calendar page could not be read automatically on 14 October 2026; the dates were taken from news reports of that release, which agree with each other, and the first date with the BCB's English Copom page.

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

## US Energy Information Administration (EIA)

NGAS, and the gas and oil pages (NATURALGAS, OILMARKET), in the desktop app. Two parts, checked live on 28 October 2026:

- The **Weekly Natural Gas Storage Report** as EIA publishes it each Thursday at 10:30 New York time: `https://ir.eia.gov/ngs/wngsr.json`, no key. Each region's working gas this week, a week and a year before, the net change, the implied flow and the five-year average, with EIA's revision and reclassification flags. The app shows EIA's own year-ago and five-year figures: EIA works them out by interpolating to the report's date, and from the API's weekly series alone they cannot be reproduced exactly (on 28 October the Mountain region's interpolated year-ago level came to 271.6 against EIA's 282). The week ending 16 October 2026 read 3,644 Bcf, +77, year ago 3,796, five-year average 3,609, as on EIA's report page.
- The **Open Data API** (version 2) with the owner's `EIA_API_KEY` (40 letters and digits, sent as the `api_key` parameter; EIA does not echo it in its answers): two years of weekly working gas by region (`natural-gas/stor/wkly`), the weekly petroleum supply estimates (`petroleum/sum/sndw`: commercial crude, Cushing, SPR, gasoline and distillate stocks; crude production, refinery input and utilisation; products supplied), and monthly dry gas production and consumption (`natural-gas/sum/snd`, series N9070US2 and N9140US2). The petroleum year-ago figure is the same week 364 days earlier, as EIA's weekly report compares it (its table 1 set 23 October 2026 against 24 October 2025); the week ending 16 October 2026 matched the report's table 1 (412.517, 282.683, 205.310 and 104.286 million barrels; 13,269 and 16,649 thousand barrels a day).

EIA publishes its weekly petroleum report on Wednesdays at 10:30 New York time; on 28 October the API still gave the week ending 16 October hours after the report for 23 October was out, so every figure is shown with its week. Monthly gas figures come about two months after the month and are revised. A bad key answers HTTP 403 with `API_KEY_INVALID`; EIA suspends a key for a short while if it asks too often (no number stated) and gives at most 5,000 rows an answer. The app asks four datasets, each at most every 30 minutes while a screen shows it.

## US Bureau of Economic Analysis (BEA)

NIPA, in the desktop app, with the owner's `BEA_API_KEY` (BEA's UserID, a GUID). Two tables from the API's `GetData` method on the NIPA dataset, checked live on 28 October 2026:

- **Table 1.1.2**, contributions to the percent change in real GDP, quarterly (the last three years asked): line 1 is real GDP's growth at an annual rate, the others each part's contribution in percentage points. Q2 2026 read 2.2, consumption 2.51, net exports -1.10, last revised 30 September 2026; FRED's copies (A191RL1Q225SBEA, DPCERY2Q224SBEA, A019RY2Q224SBEA) gave the same.
- **Table 2.6**, personal income and its disposition, monthly (the last two years asked), in millions of dollars at seasonally adjusted annual rates, shown in billions: August 2026 personal income 27,626.9, disposable income 24,223.2, saving rate 4.1%, as FRED's PI, DSPI and PSAVERT.

FRED stays the source of GDP growth and the PCE price indexes one series at a time (MACRO, with first releases); BEA adds the whole table at once, revised together, with its revision date. BEA's answers repeat the UserID in a `Request` block: the main process removes it before the answer goes anywhere, and returns nothing from an answer that is not BEA's JSON. BEA reports errors inside HTTP 200 answers: code 1 is an unknown UserID, code 7 and others its limits of 100 requests, 100 MB and 30 errors a minute (a minute's lockout). The app asks two tables, each kept six hours.

## CFTC Commitments of Traders

COT, in the desktop app, from the CFTC's public reporting platform (Socrata, `https://publicreporting.cftc.gov/resource/<dataset>.json`), no key. The CFTC's documentation offers an optional Socrata app token for higher request limits; the app asks at most a few requests an hour while COT is open, so it sends none. Datasets, each checked against its own name on 28 October 2026:

| Report | Futures only | Futures and options combined |
| --- | --- | --- |
| Legacy | `6dca-aqww` | `jun7-fc8e` |
| Disaggregated (commodities) | `72hh-3qpy` | `kh3c-gbw2` |
| Traders in Financial Futures | `gpe5-46if` | `yw9f-hn96` |

The app asks only those six datasets, for 40 contract codes (18 commodities read on the Disaggregated report, 22 financial futures on TFF, all 40 on Legacy), with fixed columns: the position date (`report_date_as_yyyy_mm_dd`, the Tuesday the positions were held), open interest, each trader group's long and short positions, and the platform's own row times (`:created_at`, when the CFTC published the row, and `:updated_at`, shown as "revised" when it differs). The latest request covers 120 days, the history two years of one market; each is kept an hour.

What the figures are: delayed, aggregated positions of reportable traders by category, in contracts, held at the close on Tuesday and published the following Friday at 15:30 New York time, or the Monday after when a holiday intervenes. The positions are then sometimes another day's: Tuesday 11 November 2025 was Veterans Day, so that week's report holds Monday 10 November's. Reports can also come late: after the federal shutdown of October 2025 the positions of 30 September were published on 19 November, 50 days later, and the schedule was normal again only from the positions of 30 December. The app therefore shows each row's own position date and the time the CFTC published it, asks for the last 120 days rather than a fixed week, and says so on screen when the newest report is more than 15 days old. Net is long minus short; spreading positions are left out of the nets. The change compares the previous report, as the CFTC's own "changes from" column does: the report before, if it is 4 to 10 days earlier, else none. Checked on 28 October 2026 against the CFTC's report pages: WTI (067651), positions of 20 October: open interest 1,835,144, managed money 163,413 long and 127,226 short, changes -8,560 and -4,173; E-mini S&P 500 (13874A) on the TFF report: leveraged funds 135,034 long and 506,279 short, asset managers 1,101,642 and 200,265. A request the platform does not understand answers with `{"message": ..., "error": true}`, which the app shows; HTTP 429 is its rate limit.

## U.S. Treasury Fiscal Data

`DEBTPROFILE T GOVT`, in the desktop app, from the Treasury's Fiscal Data API (`https://api.fiscaldata.treasury.gov`), no key or registration. It is used for this one workflow, the Treasury as an issuer: its debt outstanding. It is not a source of prices or yields (Treasury yields come from the Treasury's par yield curve and the other curves on `CURVE` and `BONDS`), and it does not stand in for dealer quotes, which have no free public source.

Two datasets, checked live on 28 October 2026:

- The **Monthly Statement of the Public Debt**, table 3, marketable securities (`/v1/debt/mspd/mspd_table_3_market`): every bill, note, bond, TIPS and floating rate note outstanding at the month's end, with its CUSIP, interest rate, maturity date and amount outstanding in millions of dollars (TIPS with their inflation adjustment). The first line of each CUSIP carries the amount of all its issues together; the lines after it are reopenings. The app asks the newest 3,000 rows (one month is about 900) and refuses an answer that lacks the month's "Total Marketable" line, so a statement cut short is never shown as whole. For 30 September 2026 the 463 securities add up to the statement's own unmatured totals for every class, to the cent (bills 7,118,144.9, notes 16,281,473.1, bonds 5,550,990.6, TIPS 2,172,641.6, floating rate notes 707,975.5 million); the screen checks this each time and says so when they do not. The statement's marketable total (31,834,878.4 million) also counts matured securities not yet redeemed and the Federal Financing Bank's. An asterisk in the statement marks an amount under $500,000; the app reads it as no figure.
- **Average interest rates on U.S. Treasury securities** (`/v2/accounting/od/avg_interest_rates`): the Treasury's own average rate by class and for all marketable debt (3.518% for September 2026), shown for the statement's month only.

The statement is published on the fourth business day of each month for the month before ("New Data Expected 11/05/2026" on the dataset's page on 28 October). The app keeps each answer six hours.

## Kraken

Read on 13 October 2026.

- [Ticker](https://docs.kraken.com/api/docs/rest-api/get-ticker-information): `GET https://api.kraken.com/0/public/Ticker?pair=...`, no key. Per pair: `a` ask, `b` bid, `c` "Last trade closed", and `v`, `p`, `t`, `l`, `h` as `[<today>, <last 24 hours>]`, `o` "Today's opening price". "Today's prices start at midnight UTC." The ticker carries no time of its own.
- OHLC (`/0/public/OHLC?pair=...&interval=...`): `[time, open, high, low, close, vwap, volume, count]` per candle, oldest first; the last candle is still forming, and `last` names the last complete one. Depth (`/0/public/Depth?pair=...&count=...`): asks and bids as `[price, volume, timestamp]`. Checked against live answers.
- [Rate limits](https://support.kraken.com/at/articles/206548367-What-are-the-API-rate-limits-): public endpoints are limited by IP address (Trades and OHLC also by pair); calling them "at a frequency of 1 per second (or less) would remain within the rate limits". Errors come in the body, for example `EGeneral:Too many requests`.
- [Terms](https://www.kraken.com/legal) (Global Terms, last updated 6 October 2026; EEA Terms effective 7 October 2026): Kraken's content, "including, for example, our pricing data", may be used "only for your own benefit"; the restrictions include bots and scripts and "any third party applications that interact with Our Content without our prior written consent". The public REST API is Kraken's documented route to market data. This private app uses it only for its owner's display, one request a second at most: a risk accepted here, as with Yahoo.

How the app uses it (`electron/kraken.cjs`, `src/data/live/kraken.ts`): Kraken owns the ten crypto lines (BTC, ETH, SOL, XRP, ADA, DOGE as Kraken's XDG, AVAX, LINK, LTC, DOT, all against USD) unless `KRAKEN_ENABLED` is off. Two years of daily candles at start; the ticker for all ten pairs every 5 seconds in one request; five-minute candles of the UTC day when a chart asks; the top 15 levels of the order book every 3 seconds while DEPTH is open. A snapshot is timed by Kraken's `Date` header. The day's change is against the close of Kraken's previous daily candle; after midnight UTC the candles are reloaded and the change shows unverified until they are. Every price is labelled Kraken's: one exchange's market, not a market-wide price. The ticker's volume counts the UTC day (`v[0]`), so each rise between two polls is volume traded on Kraken in between; `TRADES` shows those rises as aggregated prints at the last price, marked `KRAKEN AGG`.

When Kraken never answers in a session (three failed tickers, or one when the daily candles failed as well), the crypto lines go to Yahoo Finance for the rest of the session and `CRYPTO` and `PROVIDERS` give the reason Kraken's answer carried (its own error text, the HTTP status, or no answer at all). Once Kraken has answered, a later outage marks its prices stale instead. On 14 October 2026 Kraken answered normally from the build environment, so an ERROR on another machine points to that machine's network, a firewall or proxy, or Kraken refusing its region, not to a change in Kraken's API; `tests/kraken.test.ts` covers the hand-back.

## CoinGecko

Read on 13 October 2026. [Pricing](https://www.coingecko.com/en/api/pricing): the Demo plan is "$0 /month", 10k call credits a month, 100 calls a minute, one API key, "Attribution required". [API terms](https://www.coingecko.com/en/api_terms) (5 September 2025): show "Powered by CoinGecko" (section 4.1.4); "We do not encourage caching or storage of Data", and a cache should be refreshed at least every 24 hours (section 6.1); no redistributing or syndicating access (4.1.6).

The app asks `coins/markets` for the ten coins every 10 minutes with your key (`COINGECKO_API_KEY`), keeps the answer in memory only, and shows market value and circulating supply in CRYP and DES, marked as CoinGecko's and aggregated, with the attribution. Without a key nothing is sent and those fields show `--`. Live-tested on 14 October 2026 with the owner's key: the ten coins' market values and supply answered.

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
| Bank of Japan | `https://www.boj.or.jp/en/rss/whatsnew.xml` | [Copyright](https://www.boj.or.jp/en/about/copyright.htm): content may be copied with the Bank of Japan named as the source, except for commercial use, material marked as needing permission and graphics; it may not be altered. |
| Federal Reserve Board, speeches | `https://www.federalreserve.gov/feeds/speeches.xml` | As for the Board's press releases above. |
| ECB blog | `https://www.ecb.europa.eu/rss/blog.html` | As for the ECB's press releases above. |
| Bank for International Settlements, central bankers' speeches | `https://www.bis.org/doclist/cbspeeches.rss` | [Terms and conditions](https://www.bis.org/terms_conditions.htm): "Users may download, display, print out, photocopy or redistribute any BIS Material for non-commercial purposes." Nothing may imply BIS endorsement. |
| SEC press releases | `https://www.sec.gov/news/pressreleases.rss` | Government content, free to reuse (see [SEC EDGAR](#sec-edgar)); sent with `SEC_USER_AGENT` and skipped until it is set. |
| ESMA | `https://www.esma.europa.eu/rss.xml` | [Legal notice](https://www.esma.europa.eu/legal-notice): "Reproduction of all information on this site (ESMA Library) is authorised except as otherwise stated", with the source acknowledged; adaptations must say so. |

Not used: the BLS feeds refused the app's requests (HTTP 403), and no working US Treasury press release feed was found. Yahoo's headlines are switched off. Market and company news are separate screens with their own sources (see [Market and company news](#market-and-company-news)).

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

On 18 October 2026, live public NBIS company facts and submissions confirmed the currency-switch regression: monetary RUB figures stop in 2023, while USD figures extend through 2025. The default now follows the newest monetary period, with explicit coverage dates and a historical-currency selector. Currency-free shares cannot extend an obsolete monetary series. Missing standalone quarters stay unavailable; newer 6-K/8-K documents and financial analysis from other providers are linked separately. Older quarterly coverage is flagged, and quarter views do not extend empty annual columns indefinitely after tagging stops. A twelve-month flow requires annual-filing or FY evidence before it is treated as a fiscal year, excluding 10-Q trailing totals. The parser was also checked against 14 other US/foreign issuers in five currencies; all use the same selection rules. Microsoft's filings and reported figures were also checked in the earlier 14 October validation. The parsers are also tested on files laid out in the documented structure (`tests/sec.test.ts`).

`MANAGEMENT` reads executives' pay from the company's latest proxy statement (DEF 14A). Company facts cover the periodic and current reports, not proxy statements, so the app reads the filing's own XBRL: the folder's file list (`/Archives/edgar/data/{CIK}/{accession without dashes}/index.json`) and the XBRL instance EDGAR extracts from the inline XBRL document (`{name}_htm.xml`), kept for a day and a week. From the pay-versus-performance table (Item 402(v) of Regulation S-K, tagged with the SEC's Executive Compensation Disclosure taxonomy since 2023) it shows, for each year, the chief executive's total compensation as the Summary Compensation Table gives it (`ecd:PeoTotalCompAmt`) and compensation actually paid (`ecd:PeoActuallyPaidCompAmt`), the other named executives' averages (`ecd:NonPeoNeoAvgTotalCompAmt`, `ecd:NonPeoNeoAvgCompActuallyPaidAmt`) and the chief executive's name (`ecd:PeoName`); a year with two chief executives shows each. Adjustment rows are left out. The layout was checked on 19 October 2026 against Fabrinet's 2024 proxy statement (`ny20035073x1_def14a_htm.xml`). Yahoo's officer pay on the same screen is its "Pay": salary, bonus and other cash, without stock and option awards.

`HOLDINGS` reads a company's own Form 13F filings: the quarterly report an institutional investment manager with discretion over $100 million or more of Section 13(f) securities files within 45 days of each quarter's end ([Form 13F FAQ](https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f), read 25 October 2026). The FAQ's points the screen relies on: values are rounded to the nearest dollar from 3 January 2023 ("rather than to the nearest one thousand dollars") and filings made from that date use the amended form, amendments to earlier quarters included; a restatement amendment resubmits the whole report and a new-holdings amendment "only should include the securities that are being added", which is how holdings kept confidential are disclosed later; a 13F Notice (13F-NT) lists no holdings and names the managers that report them; short positions and options the manager wrote are not reported; a position of fewer than 10,000 shares worth less than $200,000 may be left out (question 39). A 13F lists the securities over which the manager has investment discretion (questions 3 and 6, re-read 25 October 2026 on the page last reviewed 28 September 2026): a corporation that manages its own portfolio reports what it owns, but a bank, broker-dealer or investment adviser also reports accounts of others it manages, so JPMorgan's 13F is not JPMorgan's own holdings. The screen says this. The app finds the 13F-HR, 13F-HR/A and 13F-NT filings in the company's submissions, groups them by the period of the report, and reads each filing's cover (`primary_doc.xml`, every 13F filed in XML since 2013 has one) and its information table (the other XML file in the folder, named by the filer) in the main process (`electron/thirteenf.cjs`): a bank's table runs to 10 to 25 MB, so only the holdings go to the page, the lines of a security (by CUSIP, shares or principal, put or call) added up, as a manager reporting under several other managers files them. Amendments are applied in the order filed. A new-holdings amendment that repeats the whole report (the same number of lines and the same total, each within 1%) is read as a restatement and the screen says so: JPMorgan's 13F-HR/A for the third quarter of 2025 is marked NEW HOLDINGS but repeats the report's 32,847 lines ($1,669.08 billion against $1,669.07 billion), and adding it would count every holding twice. The lines' sum is checked against the cover's stated total. Values before 2023 are multiplied by 1,000. Checked on 25 October 2026 against the filings of NVIDIA, Berkshire Hathaway (89 lines, 29 securities, a new-holdings amendment), Alphabet, Amazon, Intel, Qualcomm (2022, in thousands, namespace prefixes), JPMorgan, Goldman Sachs and BlackRock; all of these sums matched their covers. The tests use the NVIDIA, Berkshire and Qualcomm filings as filed (`tests/fixtures/13f/`).

`MARKETNEWS` also reads the SEC's latest 8-K filings, the Atom feed the [RSS feeds page](https://www.sec.gov/about/rss-feeds) points to (`/cgi-bin/browse-edgar?action=getcurrent&type=8-K&...&count=40&output=atom`), every 10 minutes while the screen is open, with the same User-Agent and within the same 5 requests a second. A filing listed once for each role (filer, subject) shows once; its 8-K items are named from the entry's summary.

## Second sources for daily closes

`CROSSCHECK` sets the daily closes the app shows for a US stock (from Yahoo) beside the same sessions' closes from Massive, Alpha Vantage, Tiingo and Twelve Data, with the gap in basis points; gaps over 5 bp are marked. These sources are asked only from that screen, only with your own key, and only for finished sessions. Answers are kept for an hour. Requests go out from `electron/eod.cjs` through the main process like every other provider; the parsers are in `src/data/live/eod.ts`.

Live-tested on 14 October 2026 with the owner's keys: Massive and Alpha Vantage returned daily closes, and Alpha Vantage's matched Yahoo's to 0.0 bp over 20 sessions. Twelve Data was sent one request outside the screen to check the key (HTTP 200, 14 daily bars); nothing from it is shown until `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` is on. The parsers are also tested on the documented answers (`tests/eod.test.ts`).

The closes do not all mean the same thing. Massive's are split-adjusted by default; Alpha Vantage's `TIME_SERIES_DAILY` is "raw (as-traded)", so a split inside the window shows as a large gap; Tiingo's `close` is as traded too (the app does not use its `adjClose`); Twelve Data gives the session's close. None is adjusted for dividends, and neither are the closes the app charts.

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

The app asks for the compact series only, at most one request a minute and 20 a day (the count restarts at midnight UTC). When Alpha Vantage answers with a limit notice instead of data, `CROSSCHECK` marks the source "error" and shows the notice on hover. The notice can come before the day's 25 are spent (see the review above).

### Twelve Data

Read on 14 October 2026.

- [Pricing](https://twelvedata.com/pricing), Basic (free) plan: "Basic plan with 8 requests per minute limit", "API requests: 8 (800 a day)", "Internal non-display usage". The Grow plan lists "Internal display data access". The page does not map its personal and commercial licence types to plans.
- [Documentation](https://twelvedata.com/docs): `GET /time_series` on `https://api.twelvedata.com` with `symbol`, `interval` (`1day`), `start_date`, `end_date` and `order` (default `desc`); one credit per symbol. The key goes in the query string or, the recommended way, an `Authorization: apikey <key>` header, which the app uses. The answer has `meta`, `values` (`datetime`, `open`, `high`, `low`, `close`, `volume`, as strings) and `status`.

Showing Twelve Data's prices on a screen is display use, which the free plan's "Internal non-display usage" does not cover. So nothing is sent to Twelve Data until you switch on `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED`, which says your plan allows display. Leave it off on the free plan. When it is on, the app keeps to 6 requests a minute and 600 a day.

### Tiingo

Read on 14 October 2026.

- [Pricing](https://www.tiingo.com/about/pricing), Starter (free): "Max Requests Per Hour 50", "Max Requests Per Day 1000", "Unique Symbols per Month 500"; licence "Internal Use Only". News is not on the free plan, so the app does not ask for it.
- [End-of-day API](https://www.tiingo.com/documentation/end-of-day): `GET /tiingo/daily/{ticker}/prices?startDate=&endDate=&format=json` on `https://api.tiingo.com`, the token in an `Authorization: Token <key>` header. Rows have `date`, `open`, `high`, `low`, `close`, `volume` and the adjusted versions; class shares are written with a dash (`brk-b`).
- [Terms](https://www.tiingo.com/about/terms): for your own personal use, not to be displayed or shared with anyone else; its data may not be kept in persistent storage (1.6(a)). The app keeps Tiingo's answers in memory for an hour and never writes them to disk.

The app asks only from `CROSSCHECK`: at most one request a minute, 40 an hour and 500 a day. Not live-tested: the request and parser follow the documentation and are tested on an answer in its layout (`tests/eod.test.ts`).

## Analyst research: Financial Modeling Prep

`ANALYSTS` (also `TARGETS`) and `EARNINGS` show, for a US-listed stock: the price target consensus (average), median, high and low against the live price; how many targets were published in the last month, quarter and year and their averages, with the publishers FMP gathers them from; the tally of ratings from strong buy to strong sell with FMP's consensus word; the latest rating actions by firm; and annual revenue and EPS estimates with their ranges and analyst counts. Requests go out from `electron/fmp.cjs` through the main process; the parsers are in `src/data/live/analysts.ts`.

| Screen part | Endpoint (`https://financialmodelingprep.com/stable`) | Kept for |
| --- | --- | --- |
| Price target consensus | `/price-target-consensus?symbol=` | 6 hours |
| Target history and publishers | `/price-target-summary?symbol=` | 6 hours |
| Ratings tally | `/grades-consensus?symbol=` | 6 hours |
| Rating actions | `/grades?symbol=` | 6 hours |
| Annual estimates | `/analyst-estimates?symbol=&period=annual&limit=10` | 24 hours |

- The free plan allows 250 requests a day, as the owner's account page states. The app stops at 220 a day (the count restarts at midnight UTC and survives a restart), asks only for the company on screen, and asks for a kind of research again at most every ten minutes. Opening `ANALYSTS` for a new company costs five requests; `EARNINGS` costs one; `PROFILE` and `QUOTE` cost two (the price target consensus and the ratings tally), which `ANALYSTS` then reuses, as they reuse its answers (and the Finnhub earnings calendar `EARNINGS` loads) when it was opened first.
- Its documentation answers HTTP 403 to automated reading, so the endpoints were checked another way: on 14 October 2026 the price target consensus, the summary, the ratings tally and the rating actions answered for AAPL with the owner's free key, in the layouts the parsers read. The estimates' field names (`revenueAvg`, `epsAvg`, `numAnalystsEps` and so on) come from published examples of the stable API, not from a live answer; the parser also reads the older v3 names, and a field that is missing shows as `--`.
- The supplied October 18 report shows FMP denying APLD research with HTTP 402. Remaining request quota does not grant endpoint/symbol entitlements. The screen identifies the subscription denial per section and preserves working sections; the old whole-screen early return was removed. AAPL answering does not establish APLD access.
- Price targets and ratings are analysts' opinions as FMP collects them from published notes and news, not a forecast by the app. FMP does not say which currency its estimates are in; the app names it only for companies that report and trade in dollars.

### Finnhub recommendation counts

The tally of ratings comes first from Finnhub's documented `/stock/recommendation?symbol=` endpoint with `X-Finnhub-Token`, its latest month. The data audit of 28 October 2026 found FMP's `grades-consensus` counting every firm's last grade however old: 112 ratings for Apple, 79 for NVIDIA, 61 for JPMorgan, against Finnhub's 49, 69 and 30 for October (Nasdaq named 29, 39 and 24 analysts). FMP's tally is used only when Finnhub's fails, is missing, empty or stale. Its official schema was read on October 18, 2026; unlike Finnhub price targets, upgrades and EPS estimates, this endpoint has no premium marker. Counts must be nonnegative integers for the requested symbol and a valid monthly period. The original period and source are shown; the app does not invent a consensus word or price target from the counts. Both providers' failures are retained if neither answers. This still requires a working Finnhub REST key: its webhook secret cannot authenticate data requests. Version 2.7.2 removes the old repeated-prefix heuristic that shortened valid 40-character REST keys. Complete keys are preserved after whitespace trimming. Re-save a rejected key after upgrading; a saved truncated value cannot be reconstructed. Explicitly webhook-labelled entries remain rejected.

### Equibles (retired)

Equibles was retired on 28 October 2026 at the owner's request: its answers were unreliable. The app sends it no request, has no switch or key for it, and deletes an Equibles key or switch saved by an earlier version when it starts. What its eight reports covered, and where the app has it instead:

| Equibles report | In the app now | Source |
| --- | --- | --- |
| Analyst estimates | ANALYSTS, "Estimates, by fiscal year" | FMP, then Yahoo Finance, then Nasdaq (EPS) and Alpha Vantage; marked "not available" when none has the company |
| Insider trades | INSIDERS | The insiders' SEC Form 4 filings |
| Short interest | SHORTINTEREST | FINRA's settlements (Nasdaq's page) |
| Institutional holders | HOLDERS, HOLDINGS | Yahoo Finance and Nasdaq; SEC 13F filings |
| Investor events | EVENTS | Nasdaq, Yahoo Finance, SEC filings |
| IR news | COMPANYNEWS, FILINGS | Finnhub, Alpaca, Massive, Marketaux; 8-K filings |
| Guidance | Not available | No source the app uses publishes it reliably; the results releases are on FILINGS |
| Company KPIs | Not available | No source the app uses publishes them reliably |

Eulerpool is not a replacement: it stays evaluation-only until its reliability, coverage and terms are shown.

## Market and company news

`MARKETNEWS` (also `TOP`, `MNEWS`, `WIRE`) merges market news from these sources into one list, newest first, apart from the official announcements on `HEADLINES` (its 4) Official item opens them). A story carried twice (the same link once tracking parameters are removed, or the same title) shows once, with every source that carried it; the link kept is the first source's in the order Finnhub, Alpaca, Massive, MarketWatch, SEC, Marketaux, Euronext, Google News, so a direct link wins over Google's redirect. You can filter by ticker or keyword. `COMPANYNEWS` shows a company's news: for a US company, Finnhub (the last seven days), Alpaca's and Massive's latest 50, and the stories tagged with its ticker in Marketaux's answers and the market lists; for any stock, Yahoo Finance's headline feed for its symbol and Google News's search for its name; for a stock listed on Euronext (Brussels, Paris, Amsterdam, Lisbon, Dublin), its press releases among Euronext's latest. `QUOTE` shows its latest 8 headlines from Finnhub, Alpaca, Yahoo and Google News, leaving Massive's 5 calls a minute and Marketaux's daily allowance to `COMPANYNEWS`. `MARKETNEWS` also lists Euronext's latest company press releases. Only the headline, publisher, publication time, a short summary where the source gives one, and a link out are shown; no article text is fetched. Requests go out from `electron/news.cjs`; the parsers are in `src/data/live/marketnews.ts`.

### Finnhub

Read on 14 October 2026. [Market news](https://finnhub.io/docs/api/market-news) (`/news?category=general`, and `category=merger` for mergers and acquisitions since 19 October 2026) and [company news](https://finnhub.io/docs/api/company-news) (`/company-news?symbol=&from=&to=`) are on the free plan ("Personal Use", "60 API calls/minute"); company news covers North American companies and a year of history. Its price target endpoint says "Premium required", so analyst targets come from FMP. The key goes in the `X-Finnhub-Token` header, never in a URL. [Terms](https://finnhub.io/terms-of-service): plans are "strictly for personal use"; data is to be deleted when a subscription ends; no sharing. The app asks for market and merger news every 5 minutes and a company's news every 15 while a screen shows it, at most 30 requests a minute. Not live-tested: the requests and parser follow the documentation and are tested on answers in its layout (`tests/marketnews.test.ts`).

### Marketaux

Read on 14 October 2026. [Pricing](https://www.marketaux.com/pricing), free plan: "100 requests daily" (reset at midnight UTC), "3 articles / news request". [Documentation](https://www.marketaux.com/documentation): `/v1/news/all` with `symbols`, `filter_entities`, `language`, `limit` and `api_token`; each article lists the companies it mentions with a `sentiment_score` from -1 to 1. [Terms](https://www.marketaux.com/terms): personal, non-commercial use; "We only provide a short snippet of articles along with their links."

The free plan's three articles a request decide how the app asks: one request for the whole active watchlist (up to 20 tickers) at most once an hour from `MARKETNEWS`, and one for a company the first time `COMPANYNEWS` opens it, each kept an hour. The app stops at 90 requests a day, shows "N of 90 requests today" on `MARKETNEWS`, and after a failure waits 1, 2, 4, 8 minutes and so on (never more than the source's usual interval) before asking again, so an outage does not spend the allowance. Sentiment is shown only where Marketaux gives it, labelled as Marketaux's. Not live-tested; tested on answers in the documented layout.

### Yahoo Finance headlines

Yahoo publishes an RSS feed of headlines per symbol (`https://feeds.finance.yahoo.com/rss/2.0/headline?s=ABI.BR&region=US&lang=en-US`), for US and European listings alike. Its RSS terms say "you are only permitted to display the content that is provided in the feed, without modification, and you must provide attribution to our source website and link to the full article." The screens show the headline, the short description and the publisher, with the link, and ask for a stock's feed at most every 15 minutes while a screen shows it, 20 requests a minute at most. The feed refuses a browser-like user agent, so the main process sends its own. Switch: `YAHOO_RSS_ENABLED`.

### Euronext press releases

Euronext links an RSS feed of the latest company press releases (`https://live.euronext.com/en/rss/company-pr-release`) from its [press release pages](https://live.euronext.com/en/listview/company-press-release). It holds the 10 most recent releases from Euronext issuers, in the language the issuer published (French, Dutch and English on 18 October 2026). `MARKETNEWS` reads it every 10 minutes while open and shows the title, the issuer and the link; the release itself is on Euronext's site. `COMPANYNEWS` reads it as often for a stock listed on Euronext and keeps the releases whose issuer is the company: the names are compared without case, accents, punctuation or legal forms (SA, NV, SA/NV, PLC, N.V., S.A. and the like), and one may be the first words of the other ("LVMH" for LVMH Moet Hennessy Louis Vuitton SE), except on a first word of three letters or fewer alone, so KBC Group's releases are not KBC Ancora's. A title that names no issuer counts when it starts with the company's name. A parent and a subsidiary that share their first words (Orange and Orange Belgium) can still be taken for each other. Euronext's terms of use were not reviewed for this feed. Switch: `EURONEXT_RSS_ENABLED`.

### Alpaca news (Benzinga)

Read on 19 October 2026. [News](https://docs.alpaca.markets/reference/news-3) (`GET https://data.alpaca.markets/v1beta1/news`) takes `symbols`, `start`, `sort` and `limit` ("from 1 to 50") with the same `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY` headers as the IEX quotes. [Historical news data](https://docs.alpaca.markets/docs/historical-news-data): "All news data is currently provided directly by Benzinga", "an average of 130+ news articles per day". The [plans page](https://docs.alpaca.markets/docs/about-market-data-api) does not name news; Basic (free) limits historical data to before "the latest 15 minutes", and the news reference says its default end is 15 minutes back without real-time access, so on Basic a story arrives 15 minutes after publication. The app asks for the latest 50 stories of the last three days every 5 minutes while `MARKETNEWS` is open, and for a company's latest 50 of the last 30 days every 10 minutes while a screen shows it, within the 120 requests a minute it keeps for Alpaca. Each story shows Benzinga as publisher, its summary and its link. Without a key, the endpoint answers HTTP 401. Switch: `ALPACA_ENABLED`. Not live-tested with a key; tested on answers in the documented layout.

### Massive ticker news

Read on 19 October 2026. [Ticker news](https://massive.com/docs/rest/stocks/news) (`GET https://api.massive.com/v2/reference/news`) is "Included in all Stocks plans", Stocks Basic among them, "Updated hourly"; it takes `ticker`, `order`, `sort` and `limit` and gives each article's publisher, title, author, publication time, link, tickers and description. The key goes in the `Authorization: Bearer` header, as for `CROSSCHECK`. Stocks Basic allows 5 calls a minute, and news shares them with `CROSSCHECK`'s bars: the market's latest 100 stories every 15 minutes while `MARKETNEWS` is open, a company's latest 50 every 30 minutes while `COMPANYNEWS` shows it. `QUOTE` does not ask Massive. Without a key it answers HTTP 401 with `{"status":"ERROR","error":"API Key was not provided"}`. Massive's per-ticker sentiment (`insights`) is not shown. Switch: `MASSIVE_NEWS_ENABLED`, which stops news requests and leaves the 5 calls to `CROSSCHECK`. Not live-tested with a key.

### Google News

Read on 19 October 2026. Google News answers RSS searches at `https://news.google.com/rss/search?q=...&hl=...&gl=...&ceid=...` without a key. Each feed carries this notice: "This XML feed is made available solely for the purpose of rendering Google News results within a personal feed reader for personal, non-commercial use. Any other use of the feed is expressly prohibited." This private terminal shows the headline, the publisher Google names and Google's link to the article, nothing else. Switch: `GOOGLE_NEWS_RSS_ENABLED`.

- `MARKETNEWS` searches `(stocks OR "stock market" OR "Wall Street" OR earnings OR bonds OR "central bank") when:1d` in the US and UK editions every 10 minutes. On 19 October 2026 it returned 100 stories of the last day in each, from Reuters, the WSJ, Bloomberg and CNBC among others. Google's Business section was tried first and dropped: it mixes in shopping and product recalls.
- `COMPANYNEWS` and `QUOTE` search the stock's name as the press writes it (`shortName`: "KBC Groep NV" is KBC, "Anheuser-Busch InBev SA/NV" is AB InBev) in quotation marks, with words about shares and results in the edition's language, or its ticker, over the last 7 days. A Brussels stock is searched in the Belgian Dutch and French editions and the UK one; other continental markets in their language and the UK; London, Dublin, Toronto and US stocks in their own English edition; anything else in the US edition. In the UK edition a stock listed abroad is searched with its country as well: on 19 October 2026 "KBC" alone found 47 English stories, most about an Indian quiz show and fund pages, and "KBC" with Belgium found 9, all about KBC Group. Each company search is asked every 15 minutes while a screen shows it.
- Google's titles end with " - Publisher"; that part is removed, so the same story from another source merges with it. Its descriptions only repeat the title and are not shown. Quote pages that Google lists as stories ("Stock Price, News, Quote & History", titles ending with an ISIN) are left out.
- Measured on 19 October 2026 without any key, `COMPANYNEWS` showed 43 stories for KBC (Yahoo's feed alone had 12, the oldest from October 2025), 70 for AB InBev (Yahoo: 20) and 104 for Apple (Yahoo: 18).

### MarketWatch (switched off by default)

The top stories RSS feed (`https://feeds.content.dowjones.io/public/rss/mw_topstories`) answers without a key. Dow Jones's terms of use (30 June 2026) bar access to its content "using any automated means ... API client" without written consent (9.4.1), RSS feeds included (9.1). The feed is therefore off until you switch on `MARKETWATCH_RSS_ENABLED`, which accepts that risk for your own use, as with Yahoo. When on, it is read every 10 minutes. Its "real-time headlines" and "market pulse" feeds stopped updating in 2025 and are not used.

### CNBC (not used)

CNBC's www feeds answered HTTP 403 to programs, and its owner's terms bar using software to gather its content. The app does not route around that.

### SEC 8-K filings

See [SEC EDGAR](#sec-edgar).

## Alpaca Market Data (IEX stocks, indicative options)

Read on 14 October 2026. On the Basic (free) plan, [Alpaca](https://alpaca.markets/data) gives "Real-time market coverage IEX": the trades and quotes of one exchange, IEX, not the whole US market. Consolidated (SIP) data is delayed 15 minutes on that plan, and the latest-quote and snapshot endpoints need a subscription for SIP, so the app asks for `feed=iex`. Historical calls are limited to 200 a minute. Use "solely for your own personal and non-commercial purposes".

- Stock snapshots use `https://data.alpaca.markets/v2/stocks/snapshots?symbols=&feed=iex`, with key ID/secret in `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY`. The answer is a symbol map with trade, quote and bars. The stock builder accepts only this request; account/order/trading hosts are never called.
- `QUOTE` labels IEX's trade, BBO, sizes and session bars separately. The optional `ALPACA_IEX_PRICES_ENABLED` setting uses IEX prices throughout US equity panels/watchlists and excludes Yahoo price blending; long history is unavailable in that mode. IEX volume and BBO are never called market-wide.
- One request covers every stock a screen shows (up to 20), every 5 seconds while IEX trades and once a minute when nothing new has printed for five minutes; answers are kept 4 seconds. Not live-tested: the request and parser follow the reference page and are tested on an answer in its layout (`tests/alpaca.test.ts`).

Added 19 October 2026: Benzinga's news through the same keys and host, from `electron/news.cjs`; see [Alpaca news](#alpaca-news-benzinga).

Added 18 October 2026: `electron/option-chain.cjs` builds only `https://data.alpaca.markets/v1beta1/options/snapshots/{underlying}?feed=indicative&limit=1000`, optional exact expiry and encoded pagination token. It always selects indicative, never paid OPRA. Alpaca's official SDK documents this endpoint/feed and the `snapshots`, `latestQuote`, `latestTrade`, `impliedVolatility`, `greeks` and `next_page_token` schema; source references/blob IDs are in the [workflow audit](bloomberg-parity.md). The docs website was network-blocked during this audit; account access remains unverified. Existing personal-use terms above still apply.

Since 31 October 2026 `OPTIONS` opens on [Nasdaq's chain](#nasdaq-option-chains); Alpaca's is the second source under Source. With Alpaca, `OPTIONS` / `OMON` displays indicative bid/ask, delayed trades, provider IV/Greeks and separate source times. Missing fields stay blank. No open interest, daily volume, index contracts, multiplier or adjusted deliverable is invented. The compact OCC symbol supplies root, expiry, call/put and strike. Adjusted roots remain separate. A source event older than 20 minutes is marked stale independently of HTTP retrieval. All option prices stay labelled indicative/delayed even with recent timestamps.

Refresh is manual, up to five sequential 1,000-record pages. Repeated tokens and failed next pages stop with explicit partial status. A previously cached response can be stale; its original retrieval time remains. Tables paginate 100 rows after sorting the filtered set; CSV includes all filtered records and provenance. Data stays in memory, uses the same credential-scoped broker and shares the 120/min app pacing with stocks. Cache lifetime is 15 seconds for option pages.

## Nasdaq option chains

Read and tested on 31 October 2026. `electron/nasdaq.cjs` builds only `https://api.nasdaq.com/api/quote/{symbol}/option-chain?assetclass={stocks|etf|index}&limit=10000&fromdate=all&excode=oprac&callput=callput&money=all&type=all`, the request behind nasdaq.com's option-chain page, without a key. `excode=oprac` is the page's "Composite" choice: the best bid and offer across all US option exchanges. One answer holds the whole chain (SPY: 5,985 strike rows, 240 KB). Each strike row gives the call's and the put's last, change, bid, ask, volume and open interest as text, with "--" for none, and ends in a link to the call's OCC symbol (`msft--261120c00470000`: the root padded with dashes to six characters, YYMMDD, C, the strike times 1,000 in eight digits). The app takes the root, expiry and strike from that symbol and leaves out any row whose link disagrees with its strike or date (`src/data/live/nasdaq-options.ts`).

- Asset classes: Nasdaq files ETFs apart from stocks and answers `{"status":{"rCode":400,"bCodeMessage":[{"code":1001,"errorMessage":"Symbol not exists."}]}}` for the wrong class. The app asks for a stock, then an ETF, and remembers which answered. Of indices, only the Nasdaq-100 (NDX, with its PM-settled NDXP weeklies) and the Nasdaq-100 micro index (XND) have chains; SPX, RUT and VIX answer "Symbol not exists". Their options trade only on Cboe (below).
- Times: the answer carries only the underlying's last price and date, "LAST TRADE: $521.91 (AS OF OCT 30, 2026)" ("LATEST INDEX VALUE" for an index). Nasdaq states no time and no delay for the option quotes, so `OPTIONS` labels them DELAYED with the time they arrived, and takes them as the close of the underlying's date when that date is past.
- Accuracy: Microsoft's chain of 30 October 2026, compared contract by contract with Cboe's delayed file of the same close (one download for this comparison, before Cboe's notice below was read; not kept): open interest agreed on 3,827 of 3,828 contracts and the last price on all but one; the day's volume differed on 45 (by one or two contracts, late trades); bids on about 6% and asks on 5% differed by a few cents, quotes taken at slightly different moments after the close. Open interest is the start of the day's (OCC's count after the previous session): OCC's own series search, read the day after, already counted the positions after that session and differed on about half the contracts.
- Not used: Nasdaq's Greeks endpoint (`/option-chain/greeks`). On 31 October 2026 it put each put's figures in the call columns of the row before, returned 0 for every implied volatility and covered only 31 strikes of an expiry.
- Terms: Nasdaq's [Legal Information](https://www.nasdaq.com/legal) (last updated 11 May 2026) grants "a personal, limited, revocable, non-exclusive ... license to use the Services solely for your personal, non-commercial use" and asks users not to "access or use the Service, or any process, whether automated or manual, to capture data or content from the Service". The app reads Nasdaq's pages for its owner's display, one underlying at a time, kept a minute: a risk accepted here, as with Yahoo and Kraken. The page also says "Data is delayed twenty (20) minutes unless otherwise noted" for sections powered by HyperFeed; the option chain names no delay.

How `OPTIONS` uses it: the chain opens on the nearest expiry with ten strikes around the money; Calls/Puts shows Strike, Ticker, Bid, Ask, Last, IVM, Volm and OInt for each side, and Greeks shows IVM, DM, gamma, vega and Nasdaq's change. Each expiry's line reads as Bloomberg's does: date and days, `CSize 100` for a standard root, `R` the Treasury par yield for the maturity, `IFwd` the implied forward. IVM, DM, gamma, vega and IFwd are the app's calculation (`src/finance/option-chain-analytics.ts`):

- the forward is put-call parity, F = K + (C − P)/D, the median over the three strikes where the call and put mids are closest, using only two-sided quotes;
- D is the discount factor at the Treasury par yield for the maturity (linear between the published tenors, flat before three months; converted from semiannual to continuous compounding);
- IVM is the volatility at which Black's formula on that forward gives the contract's mid; DM and gamma are per unit of the underlying at Nasdaq's last price, vega per volatility point.

On Microsoft's chain of 30 October 2026 the app's IVM was within a median 0.22 volatility points of Cboe's published IV for out-of-the-money contracts (90% within 0.69), and its delta within 0.004. Deep in the money, where spreads are widest and early exercise of an American contract has value, the two differed by a median 2.6 points. Adjusted roots (deliverables other than 100 shares, such as AAPL1) are listed without IVM or CSize. Without a Treasury yield in the app the IVM column stays blank and says why.

## Cboe delayed quotes (evaluated, not connected)

Evaluated 31 October 2026. Cboe's delayed quote pages load `https://cdn.cboe.com/api/global/delayed_quotes/options/{symbol}.json` (indices with an underscore, `_SPX`), a file per underlying with every contract's bid and ask with sizes, last, volume, open interest, implied volatility, delta, gamma, vega, theta, rho and a theoretical value, for stocks, ETFs and Cboe's own index options (SPX/SPXW, RUT, VIX, XSP), which no other free source carries. The [terms](https://www.cboe.com/terms) (16 November 2022) allow one copy of the materials "for your personal non-commercial use", but every delayed quote page carries this notice: "IT IS STRICTLY PROHIBITED TO DOWNLOAD DELAYED QUOTE TABLE DATA FROM THIS WEB SITE BY USING AUTO-EXTRACTION PROGRAMS/QUERIES AND/OR SOFTWARE. CBOE WILL BLOCK IP ADDRESSES OF ALL PARTIES WHO ATTEMPT TO DO SO. ... DOWNLOADING THIS DATA IN ANY OTHER WAY THAN BY MANUAL TICKER SYMBOL ENTRY IS STRICTLY PROHIBITED." The app does not read it. SPX, RUT and VIX options therefore have no free source in the app; `OPTIONS` says so on those indices.

## Earnings expectations

`EARNINGS` opens with the latest report as the analysts expected it and as reported, EPS and revenue, the beat or miss in percent of the estimate, and growth on the year and the quarter; then the next quarter's expected EPS and revenue with their range and number of analysts; then the last quarters expected against reported. `EVENTS` shows the expected EPS and revenue beside each report in view and, once reported, the EPS beat or miss. The help desk answers "did it beat" and "when does it report" from the same figures (`src/data/live/consensus.ts`).

- Yahoo Finance, with `YAHOO_RESEARCH_ENABLED` (no key): one quoteSummary request per stock with `earningsHistory` (the last four quarters, EPS estimate against reported, on the analysts' usually adjusted basis), `earningsTrend` (EPS and revenue estimates for the current and next quarter, with low, high, number of analysts and the year-ago figure), `calendarEvents` (the next report date) and `earnings` (report dates and reported revenue), kept for six hours and asked again hourly once a report date has passed. Checked on 19 October 2026: TSMC's third quarter of 2026 reads 4.60 against an estimate of 4.52449. Yahoo drops a quarter's estimates once it is reported, so the app keeps the last estimates it read for each coming quarter (`earnings-expectations` in local storage, six quarters per stock, 400 stocks) and compares them with the reported figures in the same currency.
- Finnhub (`FINNHUB_API_KEY`, US-listed stocks): `/stock/earnings` (four quarters of EPS against the estimate) and, new, `/calendar/earnings` over the past 13 months, which gives revenue expected and reported for each report; its revenue is compared only with its own estimate, as it names no currency.

Growth on the year and the quarter is worked out from one series at a time: the reported figures of the source that gave the comparison, else the statements; no growth is shown to or from a loss.

## Peers

`PEERS` in the desktop app finds companies in the stock's own industry as Yahoo Finance's company profiles name it (`src/data/live/peers.ts`): Finnhub's companies in the same sub-industry (`/stock/peers?grouping=subIndustry`, with `FINNHUB_API_KEY`), the app's own stocks in that industry, and the stocks Yahoo finds similar (`/v6/finance/recommendationsbysymbol`), followed through those that share the industry; each candidate's industry is read from its company profile (at most 30 profiles and 9 similar-stock lists per stock). Yahoo's industries can split a young niche: on 19 October 2026 Nebius was "Internet Content & Information", CoreWeave "Software - Infrastructure", IREN "Capital Markets" and Applied Digital "Information Technology Services". When fewer than four companies share the industry, stocks named in at least two of the similar-stock lists read that also name the stock back fill the list, marked `·similar`. A peer group is kept for a day; peers the app has not loaded are looked up for the session and saved once a watchlist, favourites or the portfolio names them. The browser build keeps the built-in list's industry.

## Wikipedia (the FTSE 100's members)

`SCREEN`'s FTSE 100 universe takes the index's members from Wikipedia's [FTSE 100 Index](https://en.wikipedia.org/wiki/FTSE_100_Index) article, the table in its "Constituents" section: company, ticker, ISIN and the sector in FTSE Russell's Industry Classification Benchmark. The main process asks the MediaWiki Action API (`https://en.wikipedia.org/w/api.php?action=parse&page=FTSE_100_Index`, no key) first for the article's sections (`prop=tocdata`), so the app finds the section by its title, then for that section's text (`prop=text&section=N`); each answer is kept a day (`electron/index-members.cjs`, `src/data/live/ftse100.ts`). On 30 October 2026 the section was number 7 and its table had 100 rows, "after the changes on 1 October 2026". Wikimedia asks programs to send a User-Agent that names them and a way to reach their author, which the app's own agent does. From a shared cloud address the API first answered HTTP 429 with `Retry-After: 21`, pointing to [its rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits), and answered on the next try; the app waits at least a minute after a 429. An error answer (`{"error": {...}}` with HTTP 200, such as a missing section) is a failure and is not kept. Wikipedia's text is under CC BY-SA; the screen names the article as the list's source, and the tests keep only the table.

London tickers become Yahoo symbols with `.L` (`BT.A` is `BT-A.L`, the exchange's trailing dot in `RR.` is dropped). All 100 members of 30 October answered at Yahoo's chart under those symbols. Three lines are not quoted in pence: Compass Group (`CPG.L`) and IHG (`IHG.L`) in US dollars, Metlen (`MTLN.L`) in euros.

## Anthropic (Claude help desk)

Request format and prices as Anthropic's API documentation gave them in October 2026; not yet tried with a live key. With `ANTHROPIC_API_KEY` set and `CLAUDE_HELPDESK_ENABLED` on, the help desk (`MESSAGES`) sends each question to Claude (model `claude-opus-5-5`) through the [Messages API](https://docs.claude.com/en/api/messages) from the main process (`electron/assistant.cjs`), using the official TypeScript SDK (`@anthropic-ai/sdk`, pinned). Claude answers with the app's own data as tools (quotes, earnings dates and expectations, SEC filings, analyst ratings, news, profiles, officers, dividends, key figures, the market, the economic calendar, the terminal's screens); the page runs each tool from the same sources its screens read. What goes to Anthropic: the conversation's last exchanges and the tools' answers. The instructions and tool definitions are cached after the first question. The request names a server-side fallback (`server-side-fallback-2026-07-01`), so an overloaded model is replaced by another rather than failing. Billing is Anthropic's, per token: Claude Opus 5.5 is $4 per million input tokens and $20 per million output ([pricing](https://www.anthropic.com/pricing#api)); a question takes 1 to 8 requests. The app stops at 400 requests a day. Without the key, or switched off, the built-in assistant answers from the same sources, with no request to Anthropic. [Commercial terms](https://www.anthropic.com/legal/commercial-terms) apply to API use.

## TipRanks

Checked 18 October 2026. TipRanks runs a hosted MCP server at `https://mcp.tipranks.com/mcp/` (JSON-RPC over HTTP, answering with server-sent events). Its handshake (`initialize`, `tools/list`) answers without a key and is not metered; the app reads the published input schemas from `tools/list` before calling a tool, and refuses a tool whose schema changed. Every `tools/call` is metered against the account's monthly allowance, whether or not it returns data: 50 calls a month and 10 a minute on the free API-key plan. `get_my_usage` is free. Over the allowance the server answers HTTP 429. The key goes in the documented `?apikey=` query parameter, from the main process only; the URL is never shown or logged.

`ANALYSTS` has a TipRanks panel. Opening it runs the free usage check; nothing else is asked until you click:

- "Consensus and price target" calls `get_assets_data`: the consensus of all covering analysts and of the top-performing ones, the average 12-month price target and its upside, the Smart Score, news, hedge fund and insider signals, and the next earnings date.
- "Analyst rating actions" calls `get_recent_analyst_ratings`: the last 12 months of rating actions with analyst, firm, rating, action, price target and the analyst's TipRanks star rating.

The ticker is TipRanks' own: US tickers as they are, London as `GB:`, Xetra as `DE:` and Paris as `FR:`. Other markets are filled in by hand, as TipRanks writes them (AB InBev is `IT:1ABI` there). [Terms](https://mcp.tipranks.com/terms) (1 June 2026): use "solely to build and operate your own applications", credit "Data by TipRanks" where the data is shown, no storage beyond transient caching. The panel links "Data by TipRanks" to the stock's TipRanks page, keeps answers in memory for an hour and never on disk, and the app stops at 45 calls a month (the count restarts on the 1st, UTC). Portfolio tools are never called. Switch: `TIPRANKS_ENABLED`.

## Congress: the House Clerk, the Senate and FMP

Checked 25 October 2026. `CONGRESS` lists members' trades and holdings from their own financial disclosures.

- **The House.** The Clerk publishes a yearly index (`/public_disc/financial-pdfs/{year}FD.zip`, a tab-separated list of every filing: member, type, seat, year, filing date, document ID) and each report as a PDF: periodic transaction reports under `ptr-pdfs/{year}/{id}.pdf`, annual reports under `financial-pdfs/{year}/{id}.pdf` (filed under the year they cover). About 9 in 10 are filed electronically, with text; the rest are scans of paper forms (88% of 2026's 437 trade reports, 93% of the 2025 annual reports). The app reads the text with PDF.js (Mozilla, `pdfjs-dist` 6.4.299) in the main process (`electron/pdf-text.cjs`), line by line with each piece's position, and takes the forms' tables apart by their column headings (`electron/congress.cjs`): a trade report's transactions (owner, asset with its ticker and type code, purchase, sale, partial sale or exchange, date, date notified, amount range, and the labels under each: status, sub-account, description), and an annual report's Schedule A (each asset with its owner and value range, sub-holdings listed as "account ⇒ holding" once each with their own value). The forms' bold labels come out as capitals only ("F S: New" for "Filing Status: New"), as their font maps no lower case to text; both spellings are read. PDF.js's Node build loads `@napi-rs/canvas` to draw pages, and loading it in Electron's main process crashed the app: the app refuses that one module (it reads text only) and the packaged app leaves it out. Checked on the reports of Nancy Pelosi, Cleo Fields, Sheri Biggs (two pages), Michael McCaul (a scan), Brian Mast and others; a live run read all 426 current members' latest annual reports and all 529 trade reports of the last 12 months. Reports are read four at a time, at most four requests a second (a first read of 12 months, 529 reports, took about 105 seconds on 25 October 2026), only while `CONGRESS` is open, and kept on disk. Members' party and seat come from the Clerk's `MemberData.xml`, which answers HTTP 406 to `Accept: application/xml`; the app asks for `text/xml`.
- **The Senate.** Senators' reports are on efdsearch.senate.gov behind a usage agreement and bot protection that refuses automated requests, even after the agreement (HTTP 403); the app does not try to get past it. Senators' trades come from FMP's `senate-latest` (and representatives' paper filings from `house-latest`), with the owner's key: the free plan gives the latest 25 of each chamber only (a larger limit or another page answers HTTP 402; `senate-trades`, the per-name and per-symbol lists, and the older v4 endpoints are refused). Once `CONGRESS` has been opened the app asks every six hours while it runs and keeps every row on disk (`congress-fmp-trades.json`), and says when a new list does not reach back to the rows it had. FMP lists one line where a House report has several (three NVIDIA purchases in three accounts on one day, 1 October 2026), so House trades are read from the reports themselves and FMP's line of a report the app reads is left out. Other services offering Senate history were checked: CongressInvests' free API returned duplicated rows and impossible dates (a trade "made" after its disclosure), and is not used; Eulerpool needs an account and its terms could not be read.
- **The law.** 5 U.S.C. § 13107(c) makes it unlawful to obtain or use these reports for any unlawful purpose; any commercial purpose, other than by news and communications media for dissemination to the general public; to determine or establish a credit rating; or to solicit money. `CONGRESS` shows this and asks nothing of these sources until the owner acknowledges it.

Amounts are disclosed as ranges; totals are ranges too (an open range, "Over $50,000,000", has no upper end), never a single estimated figure. Annual-report totals are assets, liabilities not subtracted.

## OpenFIGI

Read on 25 October 2026. The [API documentation](https://www.openfigi.com/api/documentation): `POST https://api.openfigi.com/v3/mapping` with a JSON array of jobs (`idType`, `idValue`, optional `exchCode`), the key, when there is one, in the `X-OPENFIGI-APIKEY` header; the answer holds one entry per job, `data` (with `ticker`, `name`, `exchCode`, `compositeFIGI`, `securityType`, `securityType2`), `warning` ("No identifier found.") or `error`. Limits: without a key 25 requests a minute of 10 jobs; with one 250 a minute of 100; over them HTTP 429 with `retry-after`, too many jobs HTTP 413. The [terms of service](https://www.openfigi.com/docs/terms-of-service) dedicate the identifiers to the public domain, allow their use "for any purpose, commercial or non-commercial", and allow the names FIGI and OpenFIGI only to refer to them, without suggesting endorsement.

`HOLDINGS` asks for the US composite listing (`exchCode: "US"`) of each CUSIP in the 13F on screen, its 300 largest holdings, as `ID_CUSIP`, or `ID_CINS` for a foreign issue's code (it starts with a letter: Nebius's N97284108 has no answer as a CUSIP and one as a CINS, checked live). Answers are kept a week on disk (`openfigi-cusips.json` in the app's data folder), a code without a US listing a day. The app keeps to 200 requests a minute with a key and 20 without. Switch: `OPENFIGI_ENABLED`.

One share listed on several exchanges has one share-class FIGI (`shareClassFIGI`): Shell's London and Amsterdam lines share BBG0149N4YG4. An ADR has its own share-class FIGI and OpenFIGI gives no link to the home share and no ADR ratio (checked live on 25 October 2026 for ASML, Shell, TSMC and AB InBev), so it cannot match ADRs to their home shares.

## USAspending.gov

Read on 28 October 2026. The [API home](https://api.usaspending.gov/) says the API "allows the public to access comprehensive U.S. government spending data", which "the federal law" requires to be publicly accessible; it names no key, no request limit and no licence. The records are the federal government's own (prime awards reported under the DATA Act, subawards under FFATA); works of the US government are not under copyright in the US (17 U.S.C. § 105). The [award search contract](https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/search/spending_by_award.md): `recipient_search_text` is "Text searched across a recipient's name, UEI, and DUNS"; `subawards: true` searches subawards instead of awards; `award_ids` matches award numbers (fuzzy unless quoted); `Prime Award Recipient UEI` and `Sub-Recipient UEI` are fields of a subaward.

`SPLC` asks only for a US-listed company, from the main process (`electron/usaspending.cjs`), in this order:

1. `POST /api/v2/recipient/` with the company's name without its legal form ("palantir technologies"), contracts only. Only entries whose name is the company's, once normalized, count: "PALANTIR TECHNOLOGIES INC." is Palantir, "PALANTIR.NET INC" and "APPLIED DIGITAL SOLUTIONS INC" (for Applied Digital Corp) are not.
2. `GET /api/v2/recipient/children/{UEI}/` for up to four parents of that name: the units SAM.gov files under them ("PALANTIR USG INC" under Palantir Technologies; 217 under Lockheed Martin).
3. The award search for the 30 largest units' UEIs, ten a request (a longer list answered 503 on 28 October): contracts (types A to D) with activity in the last two years, largest first. `Award Amount` is the amount obligated to date (`total_obligation` on the award's page: $637,552,404.79 for Army task order W9128Z26FA001, checked). Contracts that ended more than a year ago are dropped; the rest are summed by awarding sub-agency (the Army, not the Department of Defense; an office such as "Office of the Chief Financial Officer" with its department).
4. The same search with `subawards: true`: subcontracts the units received in two years. The prime contractor is the customer, unless it is one of the company's own units (by `Prime Award Recipient UEI`).
5. Subawards under the company's ten largest running contracts (`award_ids`), five years: the subcontractors are its suppliers, when the prime is one of its units.

A unit of a listed group is named by the group: "NORTHROP GRUMMAN SYSTEMS CORPORATION" is Northrop Grumman (NOC), "GENERAL DYNAMICS LAND SYSTEMS INC." General Dynamics, "BOEING COMPANY, THE" Boeing; others keep the name as written. Records repeated word for word (one Northrop Grumman report to Palantir appears five times) count once. Each answer is kept 12 hours; a request is tried four times, after 2, 4 and 8 seconds, because the API answers 503 or drops the connection at times. Checked live on 28 October 2026: Palantir 31 customers (24 agencies, 7 prime contractors, among them General Dynamics, Northrop Grumman, Booz Allen Hamilton and SAIC); Lockheed Martin 41 customers and 29 suppliers (Northrop Grumman, BAE Systems, Aerojet Rocketdyne, Boeing, Leonardo, Moog, RTX, Honeywell, L3Harris and others); Applied Digital none (no federal contracts under its name).

What it cannot give: contract dollars are obligations over a contract's life, not a share of the company's revenue; subcontract reports are filed by the primes and are incomplete; companies without federal work have no records.

## Disabled and not reviewed

- Finnhub, Coinbase Exchange and Frankfurter fed the browser build. That build's feeds are switched off (`BROWSER_FEEDS_ENABLED` in `src/data/providers.ts`): Finnhub needed an API key held in the browser, and none of their terms were reviewed for that use. A Finnhub key saved in the browser by an earlier version is erased at start-up. The desktop app now asks Finnhub for news from the main process, with the key in the encrypted store (see above).

## User agents

- Yahoo: Electron's own user agent.
- Every other provider: `ArminTerminal/<version> (+https://github.com/arminshah/bloomberg-terminal)`. All 14 official endpoints the app reads answered it on 12 October 2026. Wikipedia gets it too, as its policy asks.
- SEC: the value of `SEC_USER_AGENT`, exactly as you set it.
