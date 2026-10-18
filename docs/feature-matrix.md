# Feature and data coverage

What each function shows, its source and missing data. Coverage reviewed against the code on 18 October 2026 (version 2.6.1); live-provider checks are described separately below and in the release notes. The [Bloomberg workflow audit](bloomberg-parity.md) records gaps for all 70 registered commands. Browser demo figures are simulated and excluded from real-data coverage.

Status:

- **Real**: figures as the source publishes them.
- **Calculated**: worked out from real data by a stated method (returns, ratios, models).
- **Partial**: real, with parts that no permitted free source covers left out and said so.
- **Not available**: no permitted free source; the screen explains why and shows no figures.

Freshness is shown on every price (REAL-TIME, DELAYED, END OF DAY, REFERENCE, STALE, UNKNOWN FRESHNESS); [data-dictionary.md](data-dictionary.md) defines the labels.

## Calculations and derivatives: versions 2.4–2.6

`OPTIONS` / `OMON` now uses Alpaca's explicit indicative feed for listed US equity contracts: indicative bids/asks, delayed trades, provider IV/Greeks, expiry filters, source times and CSV. Both keys/account access are required; live keyed access remains unverified here. Pagination failures remain visibly partial. No OPRA, index options, open interest or daily volume is claimed. `OPTIONSTRATEGY` / `OSA` calculates common-expiry multi-leg/stock risk and scenarios offline. `OPTIONCALC` / `OVME` values European and American exercise, solves model IV from a manual premium and exports its inputs/scenarios. `BONDCALC` / `YAS` adds benchmark G-spread and zero-curve Z-spread, Z01 and spread scenarios. See [conventions](calculators.md).

`PORTFOLIO` replays fixed quantities with historical FX and complete shared dates. Historical current-exposure shocks support multi-interval VaR/ES, signed volatility/ES contributions, matched benchmark tracking error and per-position price/FX stress. Minimum samples, source marks, overlapping windows and annualisation assumptions are visible. Missing histories do not produce partial or fabricated risk. This is not realised performance or an institutional transaction/factor system.

## Version 2.3.0 additions

`BONDCALC` (`YAS`), `FXFORWARD` (`FRD`) and `SWAPCALC` (`SWPM`) now calculate from explicit user inputs in desktop and browser builds. They do not require licensed bond prices or dealer curves to perform the calculation. Inputs begin blank; numbered example actions are labelled examples. Bond/forward/swap CSV exports include their inputs and assumptions. [Calculator conventions](calculators.md) define their scope. Equity and FX option calculators accept manual inputs, reject invalid overrides and support zero volatility; visible IEX quote panels receive polling priority without starving background subscriptions.

## Version 2.2.0 additions

The original source coverage table below remains subject to each provider's access and entitlement. Version 2.2.0 adds an explicit `ALPACA_IEX_PRICES_ENABLED` setting for US equity prices throughout panels and watchlists. It supplies IEX-only trades, quotes and daily bars, with source timestamps and a 60-second freshness threshold. This is one exchange's data, not consolidated US prices, NBBO or market-wide volume. With this mode selected, Yahoo price writes are excluded. Long price history, 52-week statistics and long-horizon analytics are unavailable from the snapshot feed; intraday charts contain samples observed since this process started. Company fundamentals remain a separate source.

The default retains Yahoo prices and history alongside the separate IEX box on `QUOTE`. The new mode is opt-in so existing long-history workflows keep their source unless the owner changes it. Bloomberg-style command mnemonics map to the app's existing functions; aliases do not add missing datasets. [Release validation](release-v2.2.0.md) distinguishes deterministic tests from live-provider access.

## Equity

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `PROFILE` | Business description, key figures, ownership; one page per asset class | Yahoo Finance; CoinGecko for coin supply and market value; official sources for yields | Real, ratios calculated. No founding year or analyst figures |
| `FINANCIALS` | Income statement, balance sheet, cash flow, ratios; annual and quarterly | Yahoo Finance (as companies report) | Real, ratios calculated |
| `FUNDCHART` | Revenue, EPS, margins, P/E at each year end, cash flow | Yahoo Finance | Calculated. P/E only where trading and reporting currencies match |
| `EARNINGS` | Reported EPS and revenue, report dates, next date; annual EPS and revenue estimates | Yahoo Finance; Financial Modeling Prep (your key) for estimates | Partial: no quarterly estimates or surprises |
| `DIVIDENDS` | Ex-dates and amounts over ten years, frequency, 12-month yield, next ex-date | Yahoo Finance | Partial: declared and record dates not given |
| `HOLDERS` | Largest institutional and fund holders, ownership breakdown | Yahoo Finance (13F and fund filings) | Real, as of each filing |
| `PEERS` | Valuation, profitability and returns against peers | Yahoo Finance | Calculated. Peers chosen from the app's own industry labels |
| `EVENTS` | Earnings and ex-dividend calendar | Yahoo Finance | Real; ~ marks a date the source calls expected |
| `FILINGS` | SEC filings with links, and figures from XBRL statements | SEC EDGAR (needs `SEC_USER_AGENT`) | Real |
| `CROSSCHECK` | A US stock's closes beside other end-of-day sources | Massive, Alpha Vantage, Tiingo, Twelve Data (your keys) | Real |
| `WACC` | Cost of equity and debt, weights, perpetuity check | Yahoo Finance statements and prices; official 10-year yields | Calculated, inputs named. Blank where the app has no official 10-year yield for the currency |
| `ANALYSTS` | Price targets (consensus, median, high, low) against the live price, how targets moved, the ratings tally, rating actions, annual estimates | Financial Modeling Prep (your key) | Real, as FMP collects it; US-listed stocks its free plan covers |

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
| `HEADLINES`, `NEWS` | Press releases, newest first, by topic or keyword | Federal Reserve Board, ECB, Bank of England, Bank of Canada, RBA, BEA, ESMA (RSS) | Real. Not a market news wire |
| `MARKETNEWS` | Market news merged without duplicates, with the latest 8-K filings; ticker and keyword filters | Finnhub, Marketaux (with sentiment), SEC EDGAR; MarketWatch if switched on | Real: headlines, summaries and links, not article text |
| `COMPANYNEWS` | A US company's news from the last week, with sentiment where Marketaux gives it | Finnhub, Marketaux (your keys) | Real: headlines and links |

## Markets

| Function | What it shows | Source | Status |
| --- | --- | --- | --- |
| `MARKET` | World equity indices with changes and YTD in local currency and USD | Yahoo Finance | Real; USD YTD calculated |
| `INDEXFUTURES` | US index futures with basis and fair value | Yahoo Finance (CME, delay as Yahoo states it) | Real; fair value a stated model. Non-US futures not available |
| `CONTRIB` | What moved an index | Yahoo Finance | Calculated. Index points for the Dow only (its membership is public); other indices by the app's stocks in that market |
| `HEATMAP` | Stocks by sector, sized by market value, coloured by change | Yahoo Finance | Calculated |
| `MOVERS` | Most active, gainers, losers, value traded, unusual volume | Yahoo Finance | Real; value traded and relative volume estimated |
| `SCREEN` | Stock screener | Yahoo Finance | Real and calculated; ROE and beta once a company's data has loaded |
| `QUOTE` | Price, intraday chart, best bid and offer, recent updates, key statistics; for US stocks IEX's last trade, bid and offer, and the latest company news | Yahoo Finance, Kraken, official sources; Alpaca (IEX only) and Finnhub with your keys | Real. IEX figures are one exchange's, labelled IEX only |
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
| `BONDCALC` | Price/yield, accrued, duration, convexity, DV01, G/Z-spread, Z01, scenarios and cash flows | User terms, price/yield, optional benchmark yield and continuous zero curve | Calculated regular bullet; no observed price/curve, OAS or callable bond model |
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
| `WATCHLIST` | Your lists with prices and changes | Each line's source | Real |
| `PORTFOLIO` | Manual holdings/cash, historical-FX replay, empirical VaR/ES, additive signed contributions, matched benchmark risk, per-line stress and CSV | Every holding's prior-date price/FX history and current marks; selectable benchmark | Requires complete shared dates and ≥20 scenarios; no transaction ledger, dividend cash flows, corporate-action reconciliation or factor model |
| `ALERTS` | Price, percent-change and keyword alerts while the app is open | Each line's source; official announcements | Real |
| `CORRELATION` | Correlation of daily returns | Daily closes | Calculated |
| `SEARCH`, `RECENT`, `NOTES`, `LAYOUTS` | Finding securities, history, notes, saved workspaces | Yahoo Finance search for stocks not built in | Tools |
| `MESSAGES` | A rule-based help desk bot | The quotes and announcements the app has loaded | Tool |
| `HELP`, `MENU`, `PROVIDERS`, `SETTINGS` | Directory, menus, provider status and keys, preferences | | System |

## Checked how

The screens added or changed in 2.1.0 (`ANALYSTS`, `EARNINGS` estimates, `MARKETNEWS`, `COMPANYNEWS`, the IEX and news boxes on `QUOTE`, Tiingo on `CROSSCHECK`) were opened in the desktop app without keys, where each says which key it needs, and their parsers are tested on answers in each provider's documented layout. With keys, only Financial Modeling Prep was tried live (price targets, summary, ratings and rating actions for AAPL); the other new sources were not, because keys could not be used in the build environment.
