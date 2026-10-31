# Limits and entitlements

Every provider in one table: what its free access allows, how often the app asks, and how fresh the result can be. The numbers in quotation marks, the terms and their sources are in [data-providers.md](data-providers.md). `PROVIDERS` shows the requests each provider received in the last minute against the app's own ceiling, and today's requests against the daily allowance where there is one.

The keyed sources added in 2.1.0 share one way of asking: a request times out after a while, a network failure or server error is retried twice (about 1 and 2 seconds apart, with a little random delay), five failures in a row pause the source for two minutes (the last answer shows meanwhile, marked STALE), the same request asked twice at once goes out once, and nothing is sent past the app's daily ceiling.

| Provider | Access | Published limit | How often the app asks | Freshness | Use the terms allow |
| --- | --- | --- | --- | --- | --- |
| Yahoo Finance | No key; undocumented endpoints | None published | Quotes every 30 s while streaming, 10 s without the stream, 60 s with the window hidden, with backoff after errors; intraday bars every 20 s for open panels; daily history three requests at a time at start | Real time or delayed by exchange, as Yahoo labels each quote (Nasdaq real time; NYMEX and COMEX 30 min; London 20 min; and so on); history end of day | Yahoo's terms forbid automated collection without permission and any redistribution. Kept for private personal use at the owner's risk; Yahoo can block it at any time |
| Kraken | No key | Public calls "at a frequency of 1 per second (or less)" stay within limits | Ticker for all ten pairs every 5 s in one request (Yahoo takes the lines for the session if Kraken never answers); order book every 3 s while `DEPTH` is open; candles when a chart asks | Real time as of each snapshot, timed by Kraken's server | Pricing data "only for your own benefit"; bots and third-party applications restricted without consent. Used for the owner's display only, a risk accepted as with Yahoo |
| CoinGecko | Free Demo key | 10,000 calls a month, 100 a minute | Every 10 minutes | Aggregated across exchanges, as of each answer | Attribution required; caching discouraged, refresh at least every 24 hours; kept in memory only |
| US Treasury | No key | None found | The current year every 30 minutes; finished years once, then kept on the computer | End of day (REFERENCE): indicative bid-side quotes at about 15:30 New York time | Terms not reviewed |
| New York Fed | No key | None found | Every hour | Published about 09:00 New York time for the previous business day | Terms not reviewed (the page needs a browser) |
| Central banks, Japan's Ministry of Finance | No key | None found | Every hour | End of day or as decided (REFERENCE) | See [attribution.md](attribution.md) |
| ONS, Eurostat, Statistics Canada, ABS | No key | Statistics Canada: 50 requests a second, 25 per IP address | Every 10 minutes | As published, monthly or quarterly | Reuse with the source credited; see attribution |
| Official announcements (RSS) | No key | None found | Every 10 minutes | As each publisher posts | Source acknowledged |
| FRED | Free key | Version 1: 120 requests a minute | At most 60 a minute; series every 10 minutes, release calendars every 12 hours | As each agency publishes; release dates without times | Personal use of a subset through the API; the FRED notice; copyrighted series for personal use only |
| SEC EDGAR | Your contact in `SEC_USER_AGENT` | 10 requests a second | At most 5 a second; filing lists kept 5 minutes, company facts an hour, the company list a day, a proxy statement's file list a day and its XBRL a week | Filings as disseminated (usually within a second; XBRL within a minute) | Free to access and reuse |
| Massive | Free key (Stocks Basic) | 5 calls a minute; 2 years of history; end of day | At most 5 a minute in all; `CROSSCHECK` answers kept an hour; market news every 15 minutes, a company's every 30, while a screen shows them | End of day, split-adjusted; news updated hourly | Personal, non-commercial, non-business use; no display or redistribution to others |
| Alpha Vantage | Free key | 25 requests a day | At most one a minute and 20 a day, only from `CROSSCHECK` | End of day, as traded; latest 100 sessions | Personal, non-commercial use; real-time and full history are premium |
| Twelve Data | Key, plus `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` | Basic: 8 a minute, 800 a day | Nothing until the switch is on; then at most 6 a minute and 600 a day | End of day | Basic plan: "Internal non-display usage"; display needs a plan that allows it |
| Tiingo | Free key | 50 an hour, 1,000 a day, 500 symbols a month | At most 1 a minute, 40 an hour and 500 a day, only from `CROSSCHECK`, kept an hour in memory | End of day, as traded | Internal use only; not shown or shared with others; no storage on disk |
| Financial Modeling Prep | Free key | 250 a day | At most 220 a day and 30 a minute; a company's research kept 6 hours, estimates 24; only for the company on screen | As of each answer; targets and ratings as FMP collects them | Not quoted: FMP's pages refuse automated reading (HTTP 403); check the terms in your account |
| Finnhub | Free key | 60 a minute | At most 30 a minute; market and merger news every 5 minutes, a company's news every 15, while a screen shows them; a company's earnings, past reports and peers kept 6 to 24 hours, not asked for a calendar's rows | As each publisher posts | Personal use only; no sharing; delete the data when the subscription ends |
| Marketaux | Free token | 100 a day, 3 articles a request | At most 90 a day and 10 a minute; the watchlist in one request an hour; a company once an hour; backs off after failures | As each publisher posts | Personal, non-commercial use; snippets and links only |
| MarketWatch (RSS) | No key; off by default | None published | Every 10 minutes when switched on | As posted | Dow Jones's terms bar automated access without written consent |
| Google News (RSS) | No key | None published | At most 10 a minute; the market search in two editions every 10 minutes, a stock's searches (up to three editions) every 15, while a screen shows them | As each publisher posts; searches cover the last day (market) or week (company) | For a personal feed reader, personal, non-commercial use |
| Anthropic | Own API key, billed per token | Rate limits by account tier | One request per step of an answer, 1 to 8 a question, at most 400 a day; only when you ask the help desk | As of each question; figures as the tools read them | Anthropic's commercial terms |
| Banco de España | No key | None published | The 10-year yield with the other official yields: the whole table at start (1.3 MB), the last three months (4 KB) every hour | End of day, about two business days behind | Free reuse naming the Bank as the source |
| BIS policy rates | No key | None published | With the other central bank rates: at start, every hour, and two minutes after a failure; one request for four banks | The BIS's observations follow each bank by days to about three weeks; the screens show their date | Unrestricted, citing the BIS as the source |
| Cleveland Fed (inflation nowcasts) | No key | None published | One file (about 360 KB compressed) with the other official statistics | Updated each business day | Noncommercial or personal use, credited |
| Eurex (market statistics) | No key | None published; robots.txt asks for 30 seconds between requests | Four requests (two products, the latest day and the day before) at start and every six hours, one every 30 seconds | End of day: the daily settlement | One copy for personal, non-commercial use |
| ASIC (short position reports) | No key | None published | The index and up to 50 day files when an ASX stock's SHORTINTEREST first opens; the index every three hours, each day file kept a week | Positions four trading days old at publication | CC BY 4.0 with ASIC credited |
| State Street (SPDR holdings) | No key | None published | SPY's file while an S&P 500 board is open, DIA's when Yahoo gives no Dow membership; each at most every six hours | Holdings a business day behind; weights follow today's prices | Personal use only, no copying or redistribution |
| Nasdaq (nasdaq.com data pages) | No key; the JSON behind nasdaq.com's pages | None published | 60 requests a minute shared by its pages (20 a minute for the watchlist's quotes). Company pages kept 2 to 24 hours; an option chain kept a minute, asked when `OPTIONS` opens or refreshes, one underlying per request | Option chains delayed, with no quote time; open interest as of the start of the day | Personal, non-commercial use; its terms ask users not to capture data by any process. Kept for private use at the owner's risk |
| Alpaca | Own key ID/secret and dataset access | 200 historical calls/min; app pace 120/min shared | Stocks: 20 symbols/request, fair foreground/background polling, 4-second cache. Options: manual refresh, max 5 × 1,000-record pages, 15-second memory cache | Stocks: IEX only. Options: indicative quotes/delayed trades, never real-time OPRA. News: Benzinga's, 15 minutes after publication on the free plan, every 5 minutes (market) or 10 (a company) within the same pace | Personal, non-commercial use; account entitlement applies |

## The REFRESH button

↻ REFRESH in the top bar (Alt+R; F5 is a market sector key and Ctrl+Shift+R reloads the desktop window) asks again now for what the open screens and the background use, instead of waiting for each source's interval or throttle. It runs only in the desktop app; the browser build has no data source and no button. A second click while it runs does nothing.

Asked again:

- Yahoo quotes for every line (in requests of 50 symbols), today's minute bars for the lines on screen, and daily history that failed to load; the quotes for futures contract months and the rate path on screen;
- Alpaca's IEX quotes (the next batch of up to 20 symbols) and Kraken's crypto tickers;
- every news request a screen or the background asked for in the last six minutes: market and breaking news, and company news for your favourites, the watchlist and the securities on screen;
- the official announcements, central bank rates, government bond yields, the US Treasury curve, and FRED and the statistics offices' values (FRED's release calendars only if none loaded);
- the fundamentals, earnings expectations, analyst research and Finnhub company data of the companies on screen, and the SEC filings and option chains on screen.

The main process keeps answers for a while (`electron/requests.cjs`, the SEC cache). For two minutes after a click, an answer kept from before it counts as expired there, so these requests reach the sources. Pacing, the pause after repeated failures and the daily ceilings above still apply to each one.

Not asked again:

- Marketaux, Financial Modeling Prep, Alpha Vantage, Twelve Data and Tiingo keep answers younger than an hour: their daily allowances are small, and a click must not spend them. An older answer is asked for again, within the daily ceiling;
- TipRanks is asked only when you ask on `ANALYSTS` (50 calls a month), and CoinGecko's market caps every 10 minutes (10,000 calls a month);
- what changes rarely or never: daily history already loaded, `CROSSCHECK`'s closes of completed sessions (kept an hour), the SEC's company list and filed documents, peer groups, index members and the index ETFs' dividends.

The button then shows the time the refresh finished; its tooltip lists each source as asked again, failed, still loading (no answer within 45 seconds; it shows when it arrives) or not asked again, with the reason.

## What no free source here covers

Each of these screens says so instead of showing a number:

- real-time consolidated OPRA option chains; the connected Alpaca feed provides indicative quotes/delayed trades only, without open interest/daily volume/index options;
- revenue estimates of quarters already reported, without a Finnhub key, until the app has seen the estimate before a report (Yahoo drops it at the report; EPS estimates against the reports, the coming quarters' EPS and revenue estimates, annual estimates, price targets and ratings are covered);
- market-wide (consolidated) real-time bid, offer and volume from an official feed (Alpaca's free feed is IEX alone);
- prices and dealer quotes for individual bonds, CDS and structured credit;
- dealer FX-forward points and swap curves (the calculators accept your own rates and curves);
- order books beyond the best bid and offer, except crypto from Kraken;
- index futures outside the US, and government yields for France, Italy, Spain, Switzerland, China, India, Brazil and Mexico, the UK's 2 and 30-year gilts and policy rates without a free daily source;
- consensus economic forecasts, news readership and licensed news, transcripts and research.
