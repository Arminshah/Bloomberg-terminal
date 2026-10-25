# Feature and data coverage

What each function shows, its source and missing data. Coverage reviewed against version 2.9.0 on 19 October 2026; live-provider checks are described separately below and in the release notes. The [Bloomberg workflow audit](bloomberg-parity.md) records gaps for all 72 registered commands; the [terminal fidelity audit](terminal-fidelity-audit.md) adds primary Bloomberg references and priorities. Browser demo figures are simulated and excluded from real-data coverage.

Status:

- **Real**: figures as the source publishes them.
- **Calculated**: worked out from real data by a stated method (returns, ratios, models).
- **Partial**: real, with parts that no permitted free source covers left out and said so.
- **Not available**: no permitted free source; the screen explains why and shows no figures.

Freshness is shown on every price (REAL-TIME, DELAYED, END OF DAY, REFERENCE, STALE, UNKNOWN FRESHNESS); [data-dictionary.md](data-dictionary.md) defines the labels.

## Terminal workflow in 2.21.0

A company's name typed in the command line finds its stock: the line suggests the stocks the online search finds for the name, best match first, and running it opens the best one, with a function typed before or after it (`coca cola SPLC`, `PROFILE nvidia`). The mouse's back and forward buttons step the panel under the pointer through its screens, as in a browser tab (also Alt+← / Alt+→ and Backspace on an empty line).

## Terminal workflow after 2.12.0

Screens page with PgUp/PgDn and show `Page n/m`; monitor rows (WEI, WEIF, GLCO, CRYP, WB, MOST, EQS) and news headlines are numbered and open with their number and GO. `EXCH` lists exchange hours from the existing calendars. New mnemonics ERN, CF, NSE, EQRV, OWN, QR, HVG, PDF, GPO and GPC open existing screens; they add no data. See [terminal-fidelity-v2.13.md](terminal-fidelity-v2.13.md).

## Coverage additions in versions 2.8–2.9

European equity lookup covers fifteen exchanges and familiar market-code input. `MARKET` adds BEL 20, OMX Stockholm 30, ATX, PSI and ISEQ; `ECONSTATS` adds Belgium; currency monitors add selected Nordic and Central European currencies. `ANALYSTS` includes optional, manually requested TipRanks data under its own account coverage, attribution and monthly budget. None of this creates a universal security master or Bloomberg consensus feed.

`BETA` defaults to two years of Friday-ending weekly observations against a local benchmark, including BEL 20 for Belgium. `BONDCALC` supports five day counts and explicit or T+0–T+3 settlement, with weekends skipped but no holiday calendar. `RATEPROBS` distinguishes cumulative expected moves from the signed meeting-specific move. `PORTFOLIO` supports USD/EUR/GBP/CHF/JPY base valuation, entry-FX metadata for newer positions and separate local-price/FX P&L where known. The [2.9.0](release-v2.9.0.md) and [2.8.1](release-v2.8.1.md) notes retain the validation and limitations for these changes.

## Linked workflows and inspection: version 2.7

`FIELDS` / `FLDS` searches 29 currently held local identity/quote/calculation/source fields, with value, units, definitions, provider, freshness, timestamp basis, unavailable states and filtered raw CSV. It adds no provider calls or entitlement. Real bid/ask event times remain unavailable in this engine, independently of last-trade age. Invalid/future source times cannot establish real-time freshness. Portfolio risk calculations/CSV now use captured prices and captured source metadata together, with CNY/CNH conversion disclosed.

Colored link groups share security changes across visible compatible panels, preserving their functions. Linked monitors keep their lists open; named layouts include groups; the Linked Security Research preset and optional mnemonic display make these workflows directly accessible. See [workspace behavior](linked-workspaces.md). These are local tools, not Bloomberg integration or licensed field coverage.

## Calculations and derivatives: versions 2.4–2.6

`OPTIONS` / `OMON` now uses Alpaca's explicit indicative feed for listed US equity contracts: indicative bids/asks, delayed trades, provider IV/Greeks, expiry filters, source times and CSV. Both keys/account access are required; live keyed access remains unverified here. Pagination failures remain visibly partial. No OPRA, index options, open interest or daily volume is claimed. `OPTIONSTRATEGY` / `OSA` calculates common-expiry multi-leg/stock risk and scenarios offline. `OPTIONCALC` / `OVME` values European and American exercise, solves model IV from a manual premium and exports its inputs/scenarios. `BONDCALC` / `YAS` adds benchmark G-spread and zero-curve Z-spread, Z01 and spread scenarios. See [conventions](calculators.md).

`PORTFOLIO` replays fixed quantities with historical FX and complete shared dates. Historical current-exposure shocks support multi-interval VaR/ES, signed volatility/ES contributions, matched benchmark tracking error and per-position price/FX stress. Minimum samples, source marks, overlapping windows and annualisation assumptions are visible. Missing histories do not produce partial or fabricated risk. This is not realised performance or an institutional transaction/factor system.

## Version 2.3.0 additions

`BONDCALC` (`YAS`), `FXFORWARD` (`FRD`) and `SWAPCALC` (`SWPM`) now calculate from explicit user inputs in desktop and browser builds. They do not require licensed bond prices or dealer curves to perform the calculation. Inputs begin blank; numbered example actions are labelled examples. Bond/forward/swap CSV exports include their inputs and assumptions. [Calculator conventions](calculators.md) define their scope. Equity and FX option calculators accept manual inputs, reject invalid overrides and support zero volatility; visible IEX quote panels receive polling priority without starving background subscriptions.

## Version 2.2.0 additions

The original source coverage table below remains subject to each provider's access and entitlement. Version 2.2.0 adds an explicit `ALPACA_IEX_PRICES_ENABLED` setting for US equity prices throughout panels and watchlists. It supplies IEX-only trades, quotes and daily bars, with source timestamps and a 60-second freshness threshold. This is one exchange's data, not consolidated US prices, NBBO or market-wide volume. With this mode selected, Yahoo never sets the last price, the previous close or the latest two daily bars. Since 2.18.0 the days before IEX's own bars come from Yahoo's consolidated daily history, so charts, 52-week statistics and period returns keep their history; intraday charts contain samples observed since this process started. Company fundamentals remain a separate source.

The default retains Yahoo prices and history alongside the separate IEX box on `QUOTE`. The new mode is opt-in so existing long-history workflows keep their source unless the owner changes it. Bloomberg-style command mnemonics map to the app's existing functions; aliases do not add missing datasets. [Release validation](release-v2.2.0.md) distinguishes deterministic tests from live-provider access.

## Equity

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `PROFILE` | Business description, key figures, ownership with float and short interest (shares, % of float, days to cover, settlement date, change on the prior month); for US stocks the analyst consensus (price target, buy/hold/sell tally, next quarter's EPS estimate and report date); one page per asset class | Yahoo Finance; CoinGecko for coin supply and market value; official sources for yields; FMP, Finnhub and Yahoo research for the consensus, each figure labelled with its source | Real, ratios calculated. No founding year; short interest only where Yahoo gives it (US listings) |
| `FINANCIALS` | Income statement, balance sheet, cash flow, ratios; annual and quarterly | Yahoo Finance (as companies report) | Real, ratios calculated |
| `FUNDCHART` | Revenue, EPS, margins, P/E at each year end, cash flow | Yahoo Finance | Calculated. P/E only where trading and reporting currencies match |
| `EARNINGS` | The latest report against the analysts' expectations (EPS and revenue expected and reported, beat or miss, growth on the year and the quarter); the next quarter's expected EPS and revenue with range and analysts; the last quarters expected against reported; reported EPS and revenue, report dates, the close-to-close price reaction to each past report; annual estimates | Yahoo Finance (research modules); earnings histories from Finviz's quote page, Zacks or MarketBeat (no key) for past quarters' expected revenue and EPS; Finnhub and Financial Modeling Prep (your keys) | Real. Reported revenue from the company's filings wins over a page's; reaction timing only where the report time is known |
| `DIVIDENDS` | Ex-dates and amounts over ten years with splits as their own rows, frequency, 12-month yield, 5-year dividend growth, next ex-date | Yahoo Finance | Partial: declared and record dates not given; Yahoo records some spin-offs as fractional splits |
| `HOLDERS` | Largest institutional and fund holders, ownership breakdown | Yahoo Finance (13F and fund filings) | Real, as of each filing |
| `HOLDINGS` (`13F`) | What a company reports on Form 13F: the US-listed stocks, options and convertible bonds it managed with investment discretion (its own investments; for a bank, broker or asset manager also its clients' accounts), from its latest Form 13F (or an earlier quarter), each with shares, value at the quarter's end, share of the portfolio and the change in shares since the quarter before (new, added, reduced, unchanged, sold out); today's price and value, and the change since the quarter's end; a map sized by value; the portfolio's value by quarter | SEC EDGAR 13F filings (needs `SEC_USER_AGENT`); tickers from OpenFIGI by CUSIP; today's prices from the app's quotes or Yahoo Finance | Real, as filed. Only companies that file a 13F (a manager with $100M or more of US-listed securities); filed up to 45 days after the quarter; amendments applied; no short positions, options written, cash or holdings listed only outside the US; positions under 10,000 shares and $200,000 may be left out |
| `MANAGEMENT` | Executives: name, title, age; each named executive's total pay and salary for the latest fiscal year and the year before; shares held and net shares bought or sold (Form 4); insider transactions; the chief executive's pay against performance by year | Yahoo Finance (company profile); SEC EDGAR proxy statements (Summary Compensation Table read from the filing, pay-versus-performance XBRL) and Form 4 filings (needs `SEC_USER_AGENT`) | Real. Pay only for the named executive officers a proxy covers; other officers read "not disclosed" |
| `PEERS` | Valuation, profitability and returns against the company's peers | Finviz's peer list (US stocks, no key); Yahoo Finance (profiles, similar stocks, ratios); Finnhub sub-industry peers (your key) | Calculated. US stocks: the companies Finviz lists as peers, with stocks Yahoo links to both ways (·similar); otherwise by Yahoo's industry. NM where a ratio is not meaningful. The browser build uses the built-in list |
| `EVENTS` | Earnings and ex-dividend calendar. In the desktop app it opens on a board of a week's most relevant releases: a column a day, Monday to Friday, split into before the open and after the close, the six most traded companies of each by name and ticker (dollars traded in the latest session from Nasdaq's stock list, or Yahoo Finance's quotes when that list does not load; share classes once), with the EPS expected or the surprise, and the week's five most traded named above it. Also for one company, the active watchlist, the portfolio or every US stock above a market value ($50B by default): period, EPS and revenue expected, reported and surprise, market value and time, opening at the latest trading day with the days before it above; an earnings card per report | Yahoo Finance; Nasdaq's earnings calendar and stock list; Finviz, Zacks or MarketBeat earnings histories for revenue; Finnhub and FMP with your keys | Real; ~ marks a date the source calls expected. Nasdaq's EPS for the last days is used only once Nasdaq gives its surprise (until then the field holds last year's EPS) |
| `FILINGS` | SEC filings with links, and figures from XBRL statements | SEC EDGAR (needs `SEC_USER_AGENT`) | Real |
| `DOCSEARCH` (`DS`) | Words searched in the text of every SEC filing and exhibit since 2001, for one company or all, by kind of document and dates; form facets; the sentences where each document matches | EDGAR full-text search (desktop app, needs `SEC_USER_AGENT`) | Real. 100 documents a page, at most 10,000 per search, ranked by the SEC's relevance or by date |
| `BUYBACKS` (`BBK`) | Cash spent on buybacks each quarter or year, shares bought back and average price, dividends paid, cover share counts, program authorization and remaining amount; buyback, dividend and shareholder yields | SEC EDGAR XBRL company facts (needs `SEC_USER_AGENT`); the app's price | Real, as filed. Quarters reported only year to date are calculated (marked); share counts before splits as filed; authorizations only where tagged |
| `MARKETCAP` (`MCAP`) | A company's market value each day and at each year's end, with the change on the year before, in its currency or US dollars; any market value on the app's screens opens it | The app's daily closes (Yahoo Finance); share counts on the covers of SEC filings, or the balance sheet for a company that gives its cover count by class (needs `SEC_USER_AGENT`) | Calculated from real inputs: close times the shares outstanding then, splits applied. Outside the SEC, today's share count is held (said on screen) |
| `SUPPLYCHAIN` (`SPLC`) | Suppliers, customers and competitors around a company, with partners, investors and lenders: suppliers that state the share of their revenue it brings (and the period), buyers and resellers that name it as their supplier, the customers (named or unnamed) behind its own revenue, the agreements in its own press releases and 8-Ks (leases, supply, offtake, loans, investments), and what other companies' 8-K press releases say about it. Each relation shows who stated it, when (newest first), how many statements back it, and every statement with its filing; a "Stated in the Last 12 Months" filter and the list of documents read | SEC full-text search: annual and quarterly reports (10-K, 20-F, 40-F, 10-Q) of the last 18 months, IPO prospectuses of three years, 8-Ks of the last year, read by the desktop app (needs `SEC_USER_AGENT`); the company's own latest 10-K, 10-Q and 8-Ks; Yahoo spark for the day's change; Nasdaq's stock list for market values | Real statements, classified by precision-first rules checked against 27 companies' results in four review rounds: a share only when a filing gives it to that company (never a figure for a group, a range or a product's sales). Only what companies disclose (most name customers above 10% of revenue, many leave them unnamed); no cost-of-goods or capex estimates, which need a licensed supply-chain dataset |
| `CROSSCHECK` | A US stock's closes beside other end-of-day sources | Massive, Alpha Vantage, Tiingo, Twelve Data (your keys) | Real |
| `WACC` | Cost of equity and debt, weights, perpetuity check | Yahoo Finance statements and prices; official 10-year yields | Calculated, inputs named. Blank where the app has no official 10-year yield for the currency |
| `ANALYSTS` | Price targets (consensus, median, high, low) against the current source price, target changes, ratings tally; rating actions with analyst, firm, price target before and after, buy/hold/sell and upside; annual estimates; Equibles' estimates by period and guidance; optional TipRanks consensus, Smart Score and actions | FMP, Finnhub, Yahoo Finance, MarketBeat's forecast page (no key), Equibles; on-demand TipRanks | Source-labelled fallbacks; issuer/endpoint/market coverage and quotas vary; no invented target-history averages or Bloomberg consensus |

## Charts

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `CHART` | Daily, weekly or monthly prices with studies and comparisons | Yahoo Finance, Kraken, US Treasury, Bundesbank, Bank of England, Ministry of Finance Japan, Bank of Canada, RBA | Real; studies calculated |
| `INTRADAY` | The latest session against the previous close | Yahoo Finance (1-minute bars), Kraken (5-minute bars) | Real. Official yields have no intraday source |
| `HISTORY` | Price table with changes | As `CHART` | Real |
| `RETURNS` | Rebased price returns against benchmarks | Daily closes | Calculated, price only |
| `TOTALRETURN` | Total return with dividends reinvested | Yahoo Finance closes and dividends; for the S&P 500, Nasdaq 100, Dow and Russell 2000 the yield of the ETF that tracks them | Calculated. Other indices are price only and say so |
| `SPREAD`, `BETA`, `VOLATILITY` | Spread statistics, regression beta, realised volatility | Daily closes | Calculated. Implied volatility not available |

## News

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `HEADLINES` | Press releases and speeches, newest first, by topic | Federal Reserve Board (releases and speeches), ECB (releases and blog), Bank of England, Bank of Canada, RBA, Bank of Japan, BEA, ESMA, SEC, BIS central bankers' speeches (RSS) | Real. Not a market news wire |
| `NEWS` | Every story the app holds that matches your words, with Google News's search for them | The market news sources below, the official announcements, Google News | Real: headlines and links |
| `BREAKING` (`FIRST`, `BN`) | The newest stories from every source in the last hour, 4 hours or day, your favourites' and watchlist's stories, NEW marks for the last 15 minutes; pop-ups for new stories on your favourites, which stay until dismissed and are listed on the ★ Favourites tab, and brief ones for central bank announcements | All the news sources here | Real: headlines and links |
| `MARKETNEWS` (`TOP`) | Market and merger news merged without duplicates, with the latest 8-K filings and Euronext press releases; ticker and keyword filters; 4) Official opens `HEADLINES` | Finnhub, Alpaca (Benzinga), Massive, Marketaux (with sentiment), with your keys; Google News's market search, SEC EDGAR, Euronext; MarketWatch if switched on | Real: headlines, summaries and links, not article text |
| `COMPANYNEWS` | A US company's news from Finnhub (the last week), Alpaca and Massive, with sentiment where Marketaux gives it; for any stock, Yahoo headlines and Google News's search in its market's languages (Dutch, French and English for Brussels); a Euronext-listed company's press releases among Euronext's latest | Finnhub, Alpaca, Massive, Marketaux (your keys); Yahoo Finance; Google News; Euronext | Real: headlines and links |

## Markets

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `MARKET` | World equity indices with changes and YTD in local currency and USD | Yahoo Finance | Real; USD YTD calculated |
| `INDEXFUTURES` | US index futures with basis and fair value | Yahoo Finance (CME, delay as Yahoo states it) | Real; fair value a stated model. Non-US futures not available |
| `EXCHANGES` (`EXCH`) | NYSE, Euronext, London, Xetra and Tokyo: local time, open/closed/holiday/weekend, early closes, next open or close | NYSE and Euronext rules; LSE, Xetra and JPX tables through 2027 | Real (published calendars). Regular sessions only; unscheduled closures not known |
| `CONTRIB` | What moved an index | Yahoo Finance | Calculated. Index points for the Dow only (its membership is public); other indices by the app's stocks in that market |
| `HEATMAP` | Stocks by sector, sized by market value, coloured by change | Yahoo Finance | Calculated |
| `MOVERS` | Most active, gainers, losers, value traded, unusual volume | Yahoo Finance | Real; value traded and relative volume estimated |
| `GROUPRETURNS` (`GRR`) | An index's sectors or industries ranked by return over a day to a year, cap- or equal-weighted, with each group's best and worst members | S&P 500 member list (GICS), Nasdaq's lists; Yahoo daily closes (desktop app) | Calculated: a group's return is the change in its members' combined value, dividends not added |
| `TOPMOVERS` (`GAINERS`, `LOSERS`, `TRENDING`) | US stocks most active, trending now, the day's top gainers and losers, 52-week gainers and losers, with day path, volume against the three-month average, market value, P/E, 52-week change and range | Yahoo Finance's predefined lists and US trending (desktop app) | Real, as Yahoo lists them; refreshed every minute while open |
| `CONGRESS` (`CONG`) | Members of Congress: representatives ranked by the assets in their latest annual report (the sum of the disclosed value ranges, as a range), each one's assets and trades; every trade disclosed in a period (latest week to 12 months) by either chamber with owner, account, amount range and days to disclose; the stocks bought, sold and traded most; the securities owned by the most representatives; on a stock, its trades | The House Clerk's index, trade reports and annual reports, read from their PDFs (desktop app); the House Clerk's and the Senate's member lists; FMP's latest 25 trades of each chamber (`FMP_API_KEY`), kept by the app | Real, as disclosed. Amounts are ranges. House reports filed on paper are scans (linked; FMP lists some of their trades). Senators: trades only from FMP's lists since the app first kept them; their holdings cannot be read (the Senate's site refuses automated requests) |
| `IPOS` (`IPO`) | US IPOs priced, expected, filed and withdrawn by period; money raised against a year earlier; first-day and since-offer returns; best and worst | Nasdaq's IPO calendar (no key, desktop app); Yahoo daily closes | Real; SPACs left out unless included. No follow-ons or M&A |
| `SCREEN` | Stock screener | Yahoo Finance | Real and calculated; ROE and beta once a company's data has loaded |
| `QUOTE` | Price, intraday chart, best bid and offer, recent updates, key statistics; for US stocks the analyst consensus as on `PROFILE`, IEX's last trade, bid and offer, and the latest company news | Yahoo Finance, Kraken, official sources; Alpaca (IEX only, and Benzinga news) and Finnhub with your keys; Yahoo and Google News headlines | Real. IEX figures are one exchange's, labelled IEX only |
| `TRADES` | Volume added up between price updates | Yahoo Finance, Kraken | Partial: not single trades or venues |
| `DEPTH` | Order book for crypto; best bid and offer for the rest | Kraken; Yahoo Finance | Partial: no free order book for stocks |
| `VWAP` | VWAP, TWAP and 30-minute buckets for the latest session | Intraday bars | Calculated |

## FX and crypto

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `FXMATRIX` | Cross rates | Yahoo Finance rates against the dollar | Calculated: crosses derived, not quoted |
| `FXRANK` | Currencies ranked against the dollar | Yahoo Finance | Calculated |
| `CRYPTO` | Ten coins: price, range, volume, market value, returns | Kraken (Yahoo Finance for the session if Kraken does not answer); CoinGecko (key) | Real |
| `FXFORWARD` | Outright, points, contract PV, tenor scenarios | User deposit rates, day bases, point size, notional and input/source spot | Calculated covered interest parity; no dealer quotes or cross-currency basis |
| `FXOPTION` | Garman-Kohlhagen option value, Greeks and expiry P&L | Source spot/reference rates/realised volatility or manual overrides | Calculated European model. All inputs can be supplied offline; rates are continuous model rates |

## Rates

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `BONDS` | Government yields by country and tenor, spreads, slope | US Treasury, Bundesbank, Bank of England, Ministry of Finance Japan, Bank of Canada, RBA | Real, end of day. France, Italy, Spain and others not available |
| `CURVE` | US, German, UK and Japanese curves against a week, a month and a year ago | As `BONDS` | Real, end of day |
| `MONEYMARKET` | Fed funds and reference rates, bills, spreads, SOFR futures | New York Fed, US Treasury, Fed Board, Yahoo Finance (CME) | Real |
| `RATEPROBS` | Fed moves priced meeting by meeting | CBOT fed funds futures via Yahoo Finance, New York Fed, Fed Board | Calculated (CME FedWatch method). Fed only |
| `CENTRALBANKS` | Policy rates, last moves, next decisions | Fed, ECB, Bank of England, Bank of Canada, RBA, SNB, Banco Central do Brasil | Real. Meeting dates other than the Fed's entered from published calendars |
| `BONDCALC` | Price/yield, accrued, duration, convexity, DV01, G/Z-spread, Z01, scenarios and cash flows; five day counts and explicit/lagged settlement | User terms, price/yield, optional benchmark yield and continuous zero curve | Calculated regular bullet; settlement skips weekends only; no observed price/curve, OAS or callable bond model |
| `SWAPCALC` | Par coupon, NPV, projected cash flows, curve/coupon bump P&L | User contract and separate discount/projection zero curves | Calculated forward-start fixed/float model; no dealer curve, fixing history or OIS conventions |
| `BONDSEARCH`, `DEBTPROFILE`, `DEALERQUOTES` | | none | Not available: individual bond/dealer datasets have no connected free source |

## Commodities and economics

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `COMMODITIES` | 19 front-month futures | Yahoo Finance (delays as Yahoo states them) | Real |
| `MACRO` | US macro dashboard with first-release revisions | FRED (key) | Real |
| `RELEASES` | Release calendar and rate decisions with actual and prior | FRED (key), central banks | Real. US release times and consensus forecasts not available |
| `ECONSTATS` | GDP, inflation, unemployment, rates and markets by country | ONS, Eurostat, Statistics Canada, ABS, FRED | Real. Japan's inflation not connected |
| `HOLIDAYS` | NYSE, Euronext, LSE, Xetra and Tokyo calendars | NYSE and Euronext rules; LSE, Xetra and JPX tables through 2027 | Real. Unscheduled closures not known |

## Derivatives, portfolio and tools

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `OPTIONCALC` | European BSM or American Tian lattice value/IV, exercise premium, bump Greeks, convergence diagnostic, scenarios and CSV | Manual inputs or named source references | Continuous yields, manual tenor or Friday calendar, finite-grid error; no discrete dividends or fitted market surface |
| `OPTIONS` | Listed US equity contracts, indicative bids/asks, delayed trades, provider IV/Greeks and source times | Alpaca indicative snapshots, own keys/account entitlement | Partial; no OPRA, index contracts, open interest, daily volume or assumed deliverables |
| `OPTIONSTRATEGY` | Up to 12 common-expiry option legs + stock; exact expiry payoff/risk/breakevens, model Greeks and scenarios | Explicit positions, entry premiums, rates and per-leg volatility; optional source spot | European model; no calendars, American exercise, assignment, margin or execution |
| `WATCHLIST` | Your lists with prices and changes, pre-market and after-hours prices for stocks, bid, ask, volume, YTD and 1Y changes, and fields you choose; in the desktop app a line says which session US stocks are trading in now (pre-market, regular, after hours or closed, with the time to the next change) and marks the live column, and says whether the list's other markets are open | Each line's source; Yahoo Finance for extended sessions; Nasdaq's real-time quote for US stocks' bid and ask (no key) | Real. Nasdaq's bid and ask are Nasdaq Basic, not consolidated NBBO |
| `FAVOURITES` (`FAV`) | The securities you starred (☆ beside any name), with prices and their merged news; the command line offers them as soon as it is clicked | Each line's source; the news sources | Real |
| `PORTFOLIO` | Several portfolios as tabs (add, rename, reorder, close), each with its own manual holdings/cash, five base currencies, entry-FX metadata where recorded (for a lot bought on a past date, the ECB's reference rate of that day, named on the position), historical-FX replay, empirical VaR/ES, additive signed contributions, matched benchmark risk, per-line stress and CSV | Every holding's prior-date price/FX history and current marks; selectable benchmark | Requires complete shared dates and ≥20 scenarios; no transaction ledger, dividend cash flows, corporate-action reconciliation or factor model |
| `ALERTS` | Price, percent-change and keyword alerts while the app is open | Each line's source; official announcements | Real |
| `CORRELATION` | Correlation of daily returns | Daily closes | Calculated |
| `SEARCH`, `RECENT`, `NOTES`, `LAYOUTS` | Finding securities, history, notes, saved workspaces; layouts of your own (up to 4 rows, each with up to 4 tiles of its own widths, 6 in all, a screen per tile), saved with their sizes; LAYOUTS ▾ offers to save a saved layout's changes | Yahoo Finance search for stocks not built in | Tools |
| `MESSAGES` | A help desk that answers questions about a security or the market: next earnings and expectations, beat or miss, SEC filings, analyst consensus, news, profile, officers, dividends, valuation, movers, the economic calendar and which screen does what; with your Anthropic key, Claude answers open questions using the same data | The app's sources, each answer naming its own; Anthropic (your key) for Claude | Tool |
| `HELP`, `MENU`, `PROVIDERS`, `SETTINGS` | Directory, menus, provider status and keys, preferences | | System |

## Checked how

The screens added or changed in 2.1.0 (`ANALYSTS`, `EARNINGS` estimates, `MARKETNEWS`, `COMPANYNEWS`, the IEX and news boxes on `QUOTE`, Tiingo on `CROSSCHECK`) were opened in the desktop app without keys, where each says which key it needs, and their parsers are tested on answers in each provider's documented layout. With keys, only Financial Modeling Prep was tried live (price targets, summary, ratings and rating actions for AAPL); the other new sources were not, because keys could not be used in the build environment.
