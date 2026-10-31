# Data audit scripts (development only)

`check.cjs` (`npm run audit:check`) is the maintained check: it captures the screens, fetches the references and compares them within stated tolerances, and exits with code 1 when a figure is beyond its tolerance. See `docs/audit-check.md`. The scripts below are the first run's, kept as they were used on 28 October 2026 (some compare against that day's dates).

They compare what the desktop app shows with sources it does not use for the same figure. API keys come from the
environment (load them from a file outside the repository with `set -a; . <file>; set +a`); the scripts never print
them.

1. `npm run build`, then capture the screens on live data:
   `xvfb-run -a node scripts/live/capture.cjs cmds.json out 8000 60000`, with `cmds.json` a list such as
   `["AAPL US Equity DES", "AAPL US Equity BQ", "AAPL US Equity FA", "AAPL US Equity DVD"]`.
2. Fetch the references at the same time: `node scripts/live/audit/refs.cjs ref AAPL NVDA` (Nasdaq, Massive, Tiingo,
   SEC companyfacts; needs `MASSIVE_API_KEY`, `TIINGO_API_KEY`, `SEC_USER_AGENT`).
3. Compare:
   - `node scripts/live/audit/quote.cjs out ref AAPL NVDA`: last, open, high, low, previous close, volume, 30-day
     average volume, 52-week range, market cap, yield, realised volatility, YTD, 12-month total return, shares, P/E,
     short interest.
   - `node scripts/live/audit/financials.cjs out ref AAPL NVDA`: FINANCIALS' revenue, gross profit, net income, diluted
     EPS, operating cash flow and capital expenditure against the filings, annual and LTM.
   - `node scripts/live/audit/dividends.cjs out ref AAPL NVDA`: DVD's dates and amounts against Nasdaq's record.
   - `node scripts/live/audit/filed-vs-feed.cjs dir MSFT JPM ...`: the statements feed's annual revenue and EPS
     against the filings, for many companies at once.

Findings of the first run (28 October 2026) are in `docs/audit-v2.28-data.md`.
