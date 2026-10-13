# Roadmap

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

1. Finish the data audit: rates against each central bank's file (`WB`, `GC`, `BTMM`, `WIRP`, `CENB`) and the market screens (`WEI`, `FXC`, `GLCO`, `CRYP`, `MOST`). NBIS, the 15-stock sample and `ECO`/`ECST` are done.
2. Japan's unemployment from the Statistics Bureau (the OECD series runs a month behind) and its CPI, which needs an e-Stat key.
2. SEC EDGAR filings (`CF`). Needs `SEC_USER_AGENT` with a contact you control. Recent filings with form, filing date, accession number and a link to the filing; then a small set of reported facts from company facts with period, form and accession. Acceptance: tested against real responses, at most 5 requests a second, no request without the user agent.
3. Massive end-of-day history. Needs `MASSIVE_API_KEY` (free Stocks Basic). A source switch on `GP`: Yahoo or Massive, never mixed in one series; Massive bars labelled End of day, split-adjusted, with the last bar's market date. Acceptance: at most 5 calls a minute, paging through `next_url`, an honest error when the plan does not cover a request.
4. Release times for US economic data from the agencies' own schedules, if their terms allow automated reading.
5. Local SQLite store (`node:sqlite`) for portfolio transactions and last-known values, after checking each provider's storage terms.

## Blocked until a licensed source is approved

These stay out of the app, or show "not available", until a provider with suitable terms is chosen and approved: prices and dealer quotes for individual bonds, CDS and structured credit; FX forward points and swap rates; market depth beyond the best bid and offer; index futures outside the US; consensus economic forecasts; full-text licensed news, transcripts and broker research; trading through a broker. Paper trading stays separate from real holdings and never sends orders anywhere.
