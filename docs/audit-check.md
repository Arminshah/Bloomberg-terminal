# The data audit check

`npm run audit:check` (`scripts/live/audit/check.cjs`) runs the data audit as one check: it opens the desktop app on live data, captures its screens, fetches independent references and compares each figure within a stated tolerance. It is the audit of 28 October 2026 (`docs/audit-v2.28-data.md`) made repeatable, so that a figure that goes wrong is caught the next time it runs.

## What it compares

For each ticker (by default AAPL, NVDA, JPM, XOM, WMT, LLY, KO and TSLA: technology, banks, energy, retail, pharma, consumer staples and autos), plus bitcoin and natural gas:

| Screen | Figure | Reference | Tolerance |
| --- | --- | --- | --- |
| `QUOTE` | Last price, open, high, low, volume of the session shown | Tiingo's daily bar for that date | 0.02% (a cent) for the close and the previous close; 0.05% for open, high and low; 1% for volume |
| `QUOTE` | Previous close | Tiingo's close of the session before | 0.02% or a cent |
| `QUOTE` | Average volume, 30 days; realised volatility, 30 days | Tiingo's last 30 sessions | 1.5%; 3% |
| `QUOTE` | 52-week low and high | Tiingo's daily highs and lows, adjusted for splits, over 52 weeks or a year (sources differ by that day) | 0.1% |
| `QUOTE` | Market value | Nasdaq's summary | 2% |
| `PROFILE` | YTD % (from the price the screen shows); 12-month total return | Tiingo's close of the last session of the year before; adjusted closes | 0.1 and 1 percentage point |
| `PROFILE` | Shares outstanding; short interest | Massive's share-class count; FINRA's latest settlement (from Nasdaq's page for its listings, FINRA's Query API for others) | 1.5%; 0.5% |
| `DIVIDENDS` | Every dividend in the span both sources cover: declaration, ex, record and payable dates, amount | Nasdaq's dividend record, or Massive's dividends where Nasdaq gives none; amounts as paid, set on today's share basis with the splits the screen lists | Same dates; amount within $0.0005 |
| `FINANCIALS` | Revenue, gross profit, net income, diluted EPS, operating cash flow and capital expenditure, each year and the last twelve months | The SEC filings (companyfacts) | 0.2% or $0.6 million; EPS within 0.011 |
| `QUOTE` for XBTUSD | Bitcoin's last price (Kraken) | CoinGecko's price | 1.5% (one exchange against an aggregate, minutes apart) |
| `NGAS` | Lower 48 working gas for the week shown | EIA's data series for the same week | Exact |

The report gives each tolerance with its reason. While a session trades, the session's own figures are skipped (they move); the scheduled runs come after the US evening session, when they are settled.

## Results

Each comparison is one of:

- **PASS**: within tolerance.
- **FAIL**: beyond tolerance. The check exits with code 1.
- **FLAGGED**: the reference differs, and the screen already shows "Sources disagree" for that figure.
- **BLOCKED**: the reference or the capture could not be checked, with the reason: `auth` (key refused), `entitlement` (the plan does not cover it), `rate-limit`, `network-policy` (the network refused the host), `network`, `outage` (the provider's server failed), `no-data`, `malformed` (an answer that is not the expected data), `setup` (the app was not built or the capture failed). Exit code 2 when nothing failed but something was blocked.
- **SKIP**: not compared, with the reason (a key not set, a session still trading, a reference not published yet).

A blocked or skipped comparison is never counted as passed. The report is written to `audit-out/<date>/report.md` and `report.json`, with the screens' text and screenshots under `screens/`. `audit-out/` is not committed.

## Running it

```
npm ci
npm run build
npm run audit:check                          # all default tickers
node scripts/live/audit/check.cjs --tickers AAPL,KO --out audit-out/today
node scripts/live/audit/check.cjs --skip-capture --out audit-out/today   # compare screens captured before
```

On Linux without a display it starts the app under `xvfb-run`. A run of the eight default tickers takes about 15 minutes, most of it the capture.

## Keys it needs

The check reads keys from the environment only. It never prints them, writes them to the report or sends them anywhere but their own provider.

| Name | Used for | Without it |
| --- | --- | --- |
| `TIINGO_API_KEY` | Daily bars: last, open, high, low, previous close, volume, 30-day average, volatility, YTD, total return | Those comparisons are skipped |
| `MASSIVE_API_KEY` | Shares outstanding; dividends where Nasdaq gives none | Skipped |
| `SEC_USER_AGENT` | The SEC's figures for FINANCIALS (a name and contact email, as the SEC requires; also used by the app itself) | Skipped |
| `EIA_API_KEY` | EIA's storage series for NGAS (also used by the app for NGAS's history) | Skipped |
| `COINGECKO_API_KEY` | Optional: CoinGecko answers without it at a lower rate | Asked without a key |

Nasdaq's and FINRA's figures need no key.

## Where it runs

The check needs a machine that can run the desktop app (Linux with `xvfb-run`, or Windows) and reach the providers. Keys in a conversation or a cloud session's scratch folder do not reach any scheduler: each runner needs its own copy.

- **On your computer**: set the keys in the environment (or a `.env` file, which is never committed) and run `npm run audit:check`.
- **A Claude Code scheduled task in the cloud environment**: it starts a fresh session on schedule, checks out the work branch, builds and runs the check, and reports the result. The keys go in the cloud environment's settings (the environment menu in the session's title bar, then Edit), as environment variables or network secrets under the names above. A new session picks them up.
- **GitHub Actions** (`.github/workflows/data-audit.yml`): the keys go in the repository's Settings > Secrets and variables > Actions > New repository secret, under the names above; the workflow passes each to the check, and the report appears on the run's summary page. GitHub runs a schedule only from the default branch (`main`), so until the workflow file is on `main` it runs when the check itself changes and when started by hand (Actions > Data audit > Run workflow, choosing the work branch). While the repository is public, runners are free; while it is private they need Actions minutes (on 27 and 28 October every job failed within seconds for the account's billing). The report of a public repository's run is public too: it holds market figures, never a key.
