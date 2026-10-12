# Roadmap

## Done (12 October 2026)

- Provider status screen (`PROV`): each provider's state, last answer, last problem, requests per minute, terms and official pages with the date they were checked.
- Credentials kept in the desktop app's main process: environment variables, a `.env` file when running from source, or saved and encrypted from `PROV`. The screens never read a key back.
- FRED through its official API with your own key. The website downloads and the HTML calendar scraping are gone.
- Honest user agents for every provider.
- Quote freshness from the provider's own metadata, with the source time and the time received.
- Browser build: no data until you open the demo; every simulated value says DEMO DATA; browser feeds that needed a key in the browser or whose terms were not reviewed are off; the public Pages deployment is removed.
- Gaps no longer filled with defaults: looked-up companies, earnings dates, dividend rates.

## Next

1. FRED, live. Add your FRED key in `PROV` and confirm US releases and the Japan, Canada and Australia statistics load. Acceptance: `ECO` lists this week's US releases with dates and published values; `PROV` shows FRED answering.
2. SEC EDGAR filings (`CF`). Needs `SEC_USER_AGENT` with a contact you control. Recent filings with form, filing date, accession number and a link to the filing; then a small set of reported facts from company facts with period, form and accession. Acceptance: tested against real responses, at most 5 requests a second, no request without the user agent.
3. Massive end-of-day history. Needs `MASSIVE_API_KEY` (free Stocks Basic). A source switch on `GP`: Yahoo or Massive, never mixed in one series; Massive bars labelled End of day, split-adjusted, with the last bar's market date. Acceptance: at most 5 calls a minute, paging through `next_url`, an honest error when the plan does not cover a request.
4. Release times for US economic data from the agencies' own schedules, if their terms allow automated reading.
5. Local SQLite store (`node:sqlite`) for portfolio transactions and last-known values, after checking each provider's storage terms.

## Blocked until a licensed source is approved

These stay out of the app, or show "not available", until a provider with suitable terms is chosen and approved: prices and dealer quotes for individual bonds, CDS and structured credit; FX forward points and swap rates; market depth beyond the best bid and offer; index futures outside the US; consensus economic forecasts; full-text licensed news, transcripts and broker research; trading through a broker. Paper trading stays separate from real holdings and never sends orders anywhere.
