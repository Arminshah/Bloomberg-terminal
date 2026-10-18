# Roadmap

## Version 2.5.1

- Eight manual, read-only Equibles research datasets on ANALYSTS, including its live-catalogue analyst-consensus tool. Actual MCP schemas, JSON/SSE replies and sessions are handled without inventing REST paths or executing provider text.
- FMP section failures remain independent; recommendation counts can fall back to Finnhub with the source and monthly period retained. A 402 remains an account entitlement refusal rather than a whole-screen failure.
- Per-symbol five-endpoint research diagnostics on PROVIDERS; the inherited all-source self-test now includes Equibles and shares ordinary broker quotas/pacing/refusal handling.
- Preserves published 2.4.1 Yahoo consent, session/statement/chart fallback and Finnhub/Alpaca import fixes. Adds Equibles credential import and explicit webhook-secret rejection.
- Public Equibles discovery verified, authenticated account/issuer coverage unverified. [Validation and limits](release-v2.5.1.md).

## Version 2.4.0

- Audit of all 70 registered workflows and wider product gaps: [Bloomberg workflow audit](bloomberg-parity.md). No exact function/data/visual parity claim.
- `OPTIONS` / `OMON`: actual listed US equity snapshots via Alpaca's explicit indicative feed, calls/puts, expiry filtering, provider IV/Greeks, source times, bounded pagination, partial failures and CSV. Access remains account-dependent; no OPRA, open interest, daily option volume or index options.
- `OPTIONSTRATEGY` / `OSA`: common-expiry multi-leg + stock valuation/Greeks, exact expiry breakevens/extrema with unlimited tails, scenario analysis and CSV; five labelled examples.
- `OPTIONCALC` / `OVME`: implied volatility from entered premium with European no-arbitrage bounds.
- `BONDCALC` / `YAS`: manual benchmark G-spread and continuous zero-curve Z-spread, Z01/spread duration and spread scenarios.
- [Release verification](release-v2.4.0.md) distinguishes deterministic provider/desktop checks from unverified live keyed access.

## Version 2.3.1

- Constant-time coupon annuity repricing with log1p/expm1 stability near zero yield, checked against explicit discounted cash flows across coupon frequencies, negative and high yields.
- CI uses the locally validated Node 24 toolchain and serial unit workers, preserving the existing 600-ms startup gate. The v2.3.0 GitHub runner exceeded that gate with parallel workers; no release was published from that failed run.
- Includes the v2.3.0 analytical workflows and repaired draft-release delivery below. [Patch validation](release-v2.3.1.md).

## Version 2.3.0

- Bond, FX-forward and fixed/float swap calculators now work from explicit contract inputs; labelled examples, CSV inputs/results and documented conventions.
- Bond yield solving supports valid negative and high yields; invalid schedules terminate. Treasury 64ths carry correctly, including end-of-month/date edge cases.
- European options discount deterministic payoffs at zero volatility, reject impossible implied-volatility targets and invalid inputs, and accept manual spot/rate/dividend/volatility/multiplier inputs.
- FX options accept rate overrides for currencies without a connected source, plus spot, volatility, strike, notional and point-size inputs.
- Open IEX quote panels receive polling priority; excess foreground and background subscriptions still rotate fairly.
- [Release verification and limits](release-v2.3.0.md). Bloomberg datasets, dealer curves and consolidated exchange coverage remain separate source gaps.

## Version 2.2.0 (17 October 2026)

- Optional IEX-only prices throughout US equity panels and watchlists, with source timestamps, source labels, explicit history coverage and no blending with consolidated Yahoo data. Enable `ALPACA_IEX_PRICES_ENABLED` on `PROVIDERS` and reload after setting both Alpaca keys.
- Alpaca retains quote-only snapshots, rejects invalid prices and timestamps, shares subscriptions and rotates batches so symbols beyond the first twenty are polled.
- Shared keyed-request broker validates entire response bodies before recording success or caching. HTTP-200 provider refusals show as errors, rate limits honor `Retry-After`, concurrent work respects persisted daily caps, and stale fallback retains its original retrieval time and failure reason. Cached responses are isolated when credentials change.
- End-of-day comparisons use completed New York sessions, including holidays, early closes and DST. Incomplete bars are excluded and stale cached comparisons are marked.
- Key imports accept common environment aliases, Markdown contacts and padded secrets; ambiguous entries are refused. Errors redact configured keys even when a provider echoes a value outside a URL. Pure provider tests no longer require Electron's binary.
- Bloomberg-style mnemonic compatibility is restored for the functions the app implements; canonical descriptive names remain available.
- See [v2.2.0 validation](release-v2.2.0.md) for the checks and live-data limitations. This release does not provide full Bloomberg feature or dataset parity.

## Done (14 October 2026, version 2.1.1)

- Pasted keys: a word from the label around a key ("formerly", "personal") is no longer saved in its place.
- `MARKETNEWS NVDA` starts filtered to NVDA; 8-K items whose names hold a colon keep them; class shares such as BRK/B get their news from Finnhub and Marketaux.
- The daily ceilings hold when several requests leave together, and a plan refusal (HTTP 402) shows as "not entitled" on `PROVIDERS`.

## Done (14 October 2026, version 2.1.0)

- Analyst research from Financial Modeling Prep with your key: `ANALYSTS` (also `TARGETS`) shows the price target consensus, median, high and low against the live price, how targets moved over the last month, quarter and year with their publishers, the ratings tally, recent rating actions and annual estimates. `EARNINGS` shows the annual EPS and revenue estimates.
- `MARKETNEWS`: market news from Finnhub and Marketaux (with sentiment, labelled as Marketaux's) and the SEC's latest 8-K filings in one list without duplicates, filtered by ticker or keyword. MarketWatch's feed can be switched on, off by default because of its terms; CNBC is not used.
- `COMPANYNEWS` shows a company's news from Finnhub and Marketaux; `QUOTE` shows its latest headlines and, with Alpaca keys, IEX's last trade, bid and offer, labelled IEX only.
- Tiingo joins `CROSSCHECK` as another source for daily closes, kept in memory only as its terms require.
- Keys can be pasted as one list on `PROVIDERS` ("Save these keys"); each is saved encrypted and only its name is shown. Every new source has its own switch.
- The keyed sources share timeouts, retries with backoff and jitter, a circuit breaker, daily ceilings below each free plan (counted per UTC day across restarts), and one request for identical asks; `PROVIDERS` shows today's requests against each daily allowance.
- Kraken prices show even when its daily candles fail.

## Done (14 October 2026, version 2.0.1)

- Kraken hands the crypto lines to Yahoo Finance for the session when it never answers, and `CRYPTO` and `PROVIDERS` say why. `TRADES` shows Kraken's volume as aggregated prints.
- The market timers come first in the top bar, named "Euronext opens/closes in" and "NYSE opens/closes in". Yahoo Finance is labelled "Yahoo Finance" without "(unofficial)".
- `HOLIDAYS` judges today and the next session by each exchange's own date and time, shows whether it is open now, and names where each calendar comes from. The 2027 Copom dates are in.
- `LAYOUTS` saves the panels as named workspaces, and the top bar's layout menu lists them.
- Rate decisions on `RELEASES` show as pending until the bank's own data reaches the day the new rate applies, instead of an unchanged level.
- Day changes that rest on an unconfirmed previous close are left out of rankings, maps, averages, alerts, the portfolio's day P&L and the help desk's movers.
- Futures tables state the delay Yahoo gives for the contracts, not an assumed one; `OPTIONCALC` and `FXOPTION` name the rate they use, take a rate you type where none is published, and say why a value is blank.
- Wording that overstated what a screen does was corrected (function descriptions, `QUOTE`'s news box, `TRADES`, `VWAP`, `HISTORY`, `PORTFOLIO`, `MESSAGES`, `SETTINGS`), menus mark screens with no data in the desktop app, and the rates screens carry every publisher's credit.
- The US Treasury curve keeps finished years on the computer, so later starts fetch only the current year.

## Done (14 October 2026, version 2.0.0)

- Linux builds: an AppImage that runs without installing and a .deb for Debian and Ubuntu, built and released next to the Windows files.
- Market timers in the top bar: the time until Euronext and the NYSE open or close their regular sessions, from each exchange's holiday and early-close rules. HOLIDAYS gains a Euronext calendar.
- Original command names in place of Bloomberg's function mnemonics (`QUOTE AAPL`, `CHART NVDA 1D`, `MARKET US`, `FILINGS MSFT`, `CRYPTO BTC`). Typing an old code says what it is called now, and saved layouts and settings are carried over.
- Yahoo Finance kept only as an unofficial, personal-use price source and labelled so; its option chains, news and analyst data are switched off in the main process. The news screens show official announcements from central banks, the BEA and ESMA instead.
- Paper trading switched off: the portfolio holds only the positions you enter.
- SEC EDGAR (`FILINGS`): company search, filing histories with links to the documents, and the figures companies reported in their XBRL statements, with restatements marked. Needs `SEC_USER_AGENT`.
- A freshness label on every price (REAL-TIME, DELAYED, END OF DAY, REFERENCE, STALE, DEMO DATA, UNKNOWN FRESHNESS), kept apart from the market session.
- Daily changes only against a previous close confirmed for the right session; until then the change is marked unverified. The whole US Treasury curve comes from the Treasury; the Cboe yield indices are separate lines.
- Crypto from the Kraken exchange: prices, best bid and offer, daily and five-minute candles, and the order book on `DEPTH`. Market value and circulating supply from CoinGecko with a free key.
- Macro dashboard (`MACRO`) from FRED, with first published values against today's for payrolls and GDP growth, and FRED's required notice on every screen with FRED data.
- `CROSSCHECK`: a US stock's daily closes beside Massive, Alpha Vantage and Twelve Data (each with your own key; Twelve Data only once you confirm display rights).
- The provider screen (`PROVIDERS`) shows each provider's last attempt, latency, last data, switches and the kind of its last error.
- `CENTRALBANKS` shows the Fed's target range from the New York Fed's own limits.

## Done (12 October 2026)

- Provider status screen (`PROV`): each provider's state, last answer, last problem, requests per minute, terms and official pages with the date they were checked.
- Credentials kept in the desktop app's main process: environment variables, a `.env` file when running from source, or saved and encrypted from `PROV`. The screens never read a key back.
- FRED through its official API with your own key. The website downloads and the HTML calendar scraping are gone.
- Honest user agents for every provider.
- Quote freshness from the provider's own metadata, with the source time and the time received.
- Browser build: no data until you open the demo; every simulated value says DEMO DATA; browser feeds that needed a key in the browser or whose terms were not reviewed are off; the public Pages deployment is removed.
- Gaps no longer filled with defaults: looked-up companies, earnings dates, dividend rates.

## Done (13 October 2026, version 1.2.2)

- The adversarial check of the 15-stock audit confirmed all 13 findings and refined four fixes: forward P/E on FY1 also before company data loads, LTM EPS from net income over shares when a quarter's EPS is missing (ASML), revenue switched only on a gap over 5%, and growth kept between two losses.

## Done (13 October 2026, version 1.2.1)

- From the audit of 15 stocks: forward P/E on the FY1 estimate shown, price to book from market cap and equity, 52-week ranges over 365 days, LTM figures checked against the four quarters, quarters matched by end date, reported revenue where the feed adds gains, expected (not declared) dividend dates, Shell's pence dividends labelled, EE's EPS basis marked.
- From the audit of `ECO` and `ECST`: no phantom Housing Starts or retail-revision rows; PCE to one decimal; sources named right; the Fed's target range; Canada and Australia from Statistics Canada and the ABS (current months, and their inflation).

## Done (13 October 2026, version 1.2.0)

- Brussels clock first in the top bar; a layout with the watchlist as a full-height column beside the four main panels, now the default.
- Company data reloads after 6 hours (hourly once a due report is out), and a stock looked up online no longer brings back the figures saved the day it was looked up.
- From an audit of every NBIS screen against Nebius's filings: P/E, enterprise value and EV/EBITDA are worked out from the figures shown beside them; EBITDA has one definition; growth across a change of sign shows "--"; holder percentages use today's share count; OVME uses listed expiries; option volume counts today's trades only; WACC labels its assumptions; next earnings dates are marked expected unless the call is scheduled.
- FRED: the reason for a refused key is shown; no retries every 2 minutes without a key.

## Next

1. Finish the data audit: rates against each central bank's file (`BONDS`, `CURVE`, `MONEYMARKET`, `RATEPROBS`, `CENTRALBANKS`) and the market screens (`MARKET`, `FXMATRIX`, `COMMODITIES`, `CRYPTO`, `MOVERS`). NBIS, the 15-stock sample and the economic screens are done.
2. Live-test the 2.1.0 sources with the owner's keys: Finnhub, Marketaux, Alpaca, Tiingo, and FMP's estimates and its coverage beyond AAPL.
3. Japan's unemployment from the Statistics Bureau (the OECD series runs a month behind) and its CPI, which needs an e-Stat key.
4. Release times for US economic data from the agencies' own schedules, if their terms allow automated reading.
5. Holiday calendars for London, Xetra and Tokyo beyond 2027 (NYSE and Euronext follow their rules for any year).
6. The remaining conventions taken from Bloomberg: security identifiers such as `AAPL US Equity` and the market sector keys on F2 to F12.
7. TipRanks through its MCP server, once its tools can be checked with a key; Binance, if it serves the owner's location (as separate USDT lines).
8. Local SQLite store (`node:sqlite`) for portfolio transactions and last-known values, after checking each provider's storage terms.

## Blocked until a licensed source is approved

These datasets remain unavailable until a suitable provider is connected: prices and dealer quotes for individual bonds, CDS and structured credit; dealer FX-forward points and swap curves; market depth beyond the best bid and offer; index futures outside the US; consensus economic forecasts; real-time OPRA option chains (indicative Alpaca snapshots are available); quarterly estimates and earnings surprises; consolidated real-time quotes from an official feed; full-text licensed news, transcripts and broker research; trading through a broker. User-input bond, forward and swap calculations are available separately. Paper trading is switched off.
