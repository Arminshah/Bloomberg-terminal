# Testing

## The checks

| Command | What it runs |
| --- | --- |
| `npm run lint` | ESLint over the whole project, the Electron main process included |
| `npm run typecheck` | The TypeScript project build (`tsc -b`) |
| `npm test` | Unit tests (Vitest), including provider transport and IEX ownership regressions |
| `npm run e2e` | Browser tests (Playwright, Chromium) against the browser build |
| `npm run e2e:desktop` | Real Electron preload/IPC/UI tests with deterministic provider transport fixtures; Linux needs Xvfb or a display |
| `npm run build` | Type check and production build of the renderer |

CI (`.github/workflows/ci.yml`) runs lint, type check, unit tests, browser and Linux desktop tests on branch pushes and pull requests, then builds Windows/Linux packages and runs native Windows desktop tests. Tag releases run the same checks, upload packages and SHA256 files directly to a draft GitHub Release, and publish only after both platform jobs and uploaded-asset checks pass. They do not depend on Actions artifact storage. The browser tests need Chromium: `npx playwright install chromium` once. Validate workflow changes with actionlint.

## What the unit tests cover

The data readers are tested on saved provider answers (`tests/fixtures/`) or on answers laid out as each provider documents them, never on live requests, so the tests pass offline and do not depend on today's market.

| File | Covers |
| --- | --- |
| `commands.test.ts` | The command parser, old command names and what they are called now, search and autocomplete |
| `engine.test.ts` | The market engine and its previous close |
| `prevclose.test.ts` | Daily changes against the previous close that matches the daily bars, across sessions and time zones |
| `freshness.test.ts` | The freshness labels and the market session, kept apart |
| `realdata.test.ts` | Company data from Yahoo answers, quote hygiene, streaming quotes, figures that sit side by side agreeing, gaps left empty rather than filled |
| `yahooscope.test.ts` | The main process keeping Yahoo's option chains, news and analyst data out |
| `official.test.ts` | Treasury, central bank and statistics office parsers, the FOMC calendar, the fed funds futures path, FRED releases |
| `fredloop.test.ts` | FRED's refresh loop, refused keys and rate limits |
| `macro.test.ts` | The macro dashboard's figures and FRED's first releases (ALFRED) |
| `sec.test.ts` | SEC requests allowed by the main process, the company list, filing histories, reported figures and their periods |
| `kraken.test.ts` | Kraken requests, answers and lines in the engine; CoinGecko market values |
| `eod.test.ts` | Requests, budgets and answers of Massive, Alpha Vantage, Tiingo and Twelve Data, and the close comparison |
| `analysts.test.ts` | Financial Modeling Prep requests, price targets, the ratings tally, rating actions, estimates under both field namings, and refusals in words |
| `marketnews.test.ts` | News requests and switches, canonical links, Finnhub, Marketaux, MarketWatch and SEC 8-K answers, and duplicates merged |
| `alpaca.test.ts` | Alpaca requests limited to the market data host and IEX, snapshots, times with nanoseconds, symbols |
| `exchanges.test.ts` | NYSE and Euronext holidays and early closes against the exchanges' own tables, and the market timers' sessions |
| `providers.test.ts` | Credentials and pasted key lists, request accounting, daily allowances, providers' refusals, switches, limits and provider states |
| `finance.test.ts` | Black-Scholes, Treasury math, indicators and statistics |
| `contracts.test.ts` | Independent bond yield/price and finite-difference risk checks, zero-volatility option limits, covered interest parity, dual-curve swap PV/par/coupon/curve risk, date/curve/input boundaries |
| `option-chain.test.ts` | Indicative-only read-only request boundary, OCC decoding, missing fields, event ages, sequential pagination, repeated tokens, page limits, partial failures and credentials/entitlements |
| `strategy-spreads.test.ts` | Independent common-expiry strategy payoffs, unlimited tails, breakevens, aggregate Greeks/scenarios, and bond Z-spreads against zero-coupon and explicit nonflat-curve cash flows |
| `data.test.ts`, `layout.test.ts`, `lookup.test.ts`, `portfolio.test.ts` | Heat map layout, calendars, fundamentals, workspace layouts, ticker lookup, the portfolio without paper trading |

## What the browser tests cover

`e2e/terminal.spec.ts` runs the browser build, which has no data source: the first test checks that it opens on the no-data page and that the demo, once chosen, says DEMO DATA. The rest use the demo to check that every function renders without errors, that typing goes to the command line with autocomplete, that numbered menus and back navigation work, that bad commands explain themselves, that watchlists and alerts persist, and that the phone layout shows one panel without horizontal scrolling.

Calculator checks use explicit inputs and independent expected values: bond price/yield/Z-spread, FX carry/PV, swap direction/coverage, zero-volatility equity/FX options, premium-to-IV via a separate normal-density integration, multi-leg payoff/breakevens and invalid-input clearing. CSV checks include inputs and results. The same calculator flows run in Electron real-data mode with provider prices/rates blocked. The rendering test verifies that its command list covers every registered function.

## Deterministic desktop integration

`npm run e2e:desktop` launches the pinned Electron version with real main/preload/IPC. Fake keys and fixed transport responses in disposable profiles verify provider refusals, IEX price ownership, option-chain pagination, adjusted roots, sorting across display pages, old source times, partial entitlement failures and invalid IPC rejection. They do not validate live providers or real API keys.

On Linux use `xvfb-run -a npm run e2e:desktop`, or set `DISPLAY` to an existing display. The test process uses `--no-sandbox` where the isolated cloud cannot configure Chromium user namespaces; installed desktop startup is unchanged.

For a preinstalled Chromium, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` when running browser tests; otherwise install Playwright's browser with `npx playwright install chromium`.

`scripts/cloud-setup.sh` reproduces dependencies in the existing `/workspace/Bloomberg-terminal` checkout. It preserves the npm lockfile and Electron checksum validation and supplies a user-local Xvfb from signed Debian repositories when needed. It does not install keys or create another Git worktree.

## Checking the desktop app

The browser tests never see real data. To check the desktop app against the real providers:

1. `npm run desktop`, or start an installed build.
2. Open `PROVIDERS`: every provider the screens have asked should read LIVE or ANSWERING, and any ERROR names its kind.
3. Spot-check prices against the provider's own site, with the freshness label in mind: `QUOTE AAPL`, `MARKET US`, `CURVE`, `CRYPTO`.
4. With the keys set: `MACRO`, `RELEASES`, `FILINGS MSFT`, `CROSSCHECK AAPL`.

On Linux without a display, `xvfb-run -a npm run desktop` works. Playwright can drive the desktop app as well (`_electron.launch` from `@playwright/test`), which is how the screens were checked during development.
