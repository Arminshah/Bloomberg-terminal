# Roadmap

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
2. Live-test the providers no key or contact was available for while building: SEC EDGAR, CoinGecko, Massive, Alpha Vantage and Twelve Data.
3. Japan's unemployment from the Statistics Bureau (the OECD series runs a month behind) and its CPI, which needs an e-Stat key.
4. Release times for US economic data from the agencies' own schedules, if their terms allow automated reading.
5. Holiday calendars for London, Xetra and Tokyo beyond 2027 (NYSE and Euronext follow their rules for any year).
6. The remaining conventions taken from Bloomberg: security identifiers such as `AAPL US Equity` and the market sector keys on F2 to F12.
7. Financial Modeling Prep, once its documentation can be read, and Binance, if it serves the owner's location (as separate USDT lines).
8. Local SQLite store (`node:sqlite`) for portfolio transactions and last-known values, after checking each provider's storage terms.

## Blocked until a licensed source is approved

These stay out of the app, or show "not available", until a provider with suitable terms is chosen and approved: prices and dealer quotes for individual bonds, CDS and structured credit; FX forward points and swap rates; market depth beyond the best bid and offer; index futures outside the US; consensus economic forecasts; listed option chains (OPRA); analyst ratings, price targets and estimates; full-text licensed news, transcripts and broker research; trading through a broker. Paper trading is switched off.
