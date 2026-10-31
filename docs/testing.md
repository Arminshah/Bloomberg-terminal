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

The 2.15 data-accuracy regressions are in `earnings-accuracy.test.ts`, `financial-completeness.test.ts`, `sec-quarters.test.ts`, `extended-hours.test.ts`, and `ownership-accuracy.test.ts`. They cover fiscal/calendar matching and separate EPS bases, currency/period compatibility, cumulative monetary quarter calculations, sparse trailing fields, debt snapshots, source timestamps, and holder-date filtering. `desktop-e2e/provider-ipc.spec.ts` also exercises NBIS-style missing SEC quarters through online lookup and provider fallback, supplementary session quotes alongside IEX, holder sorting/filtering, short float, management zero pay, and header/value alignment. These synthetic fixtures verify application behavior; they do not establish current live-provider coverage or current officer appointments.

| File | Covers |
| --- | --- |
| `commands.test.ts` | The command parser, old command names and what they are called now, search and autocomplete |
| `engine.test.ts` | The market engine and its previous close |
| `prevclose.test.ts` | Daily changes against the previous close that matches the daily bars, across sessions and time zones |
| `freshness.test.ts` | The freshness labels and the market session, kept apart |
| `realdata.test.ts` | Company data from Yahoo answers, quote hygiene, streaming quotes, figures that sit side by side agreeing, gaps left empty rather than filled |
| `yahooscope.test.ts` | The main process blocking Yahoo option chains/news and independently gating analyst data |
| `official.test.ts` | Treasury, central bank and statistics office parsers, the FOMC calendar, the fed funds futures path, FRED releases |
| `fredloop.test.ts` | FRED's refresh loop, refused keys and rate limits |
| `macro.test.ts` | The macro dashboard's figures and FRED's first releases (ALFRED) |
| `sec.test.ts` | SEC requests allowed by the main process, the company list, filing histories, reported figures and their periods |
| `kraken.test.ts` | Kraken requests, answers and lines in the engine; CoinGecko market values |
| `eod.test.ts` | Requests, budgets and answers of Massive, Alpha Vantage, Tiingo and Twelve Data, and the close comparison |
| `analysts.test.ts` | Financial Modeling Prep requests, price targets, the ratings tally, rating actions, estimates under both field namings, and refusals in words |
| `research-check.test.ts` | Per-symbol endpoint diagnostics, no-data versus denial, cached responses, stale reports, missing keys and transport failures |
| `finnhub.test.ts` | Preserved profile/ratio, EPS-surprise and next-report readers; recommendation date/count/symbol validation and replaced-key race regression |
| `marketnews.test.ts` | News requests and switches, canonical links, Finnhub, Marketaux, MarketWatch and SEC 8-K answers, and duplicates merged |
| `alpaca.test.ts` | Alpaca requests limited to the market data host and IEX, snapshots, times with nanoseconds, symbols |
| `exchanges.test.ts` | NYSE and Euronext holidays and early closes against the exchanges' own tables, and the market timers' sessions |
| `providers.test.ts` | Credentials and pasted key lists, request accounting, daily allowances, providers' refusals, switches, limits and provider states |
| `american-options.test.ts` | Ten independent QuantLib finite-difference prices, PDE Greeks, deterministic interior exercise, no-early-exercise bounds, American IV ambiguity, invalid grids and NY expiry DST |
| `portfolio-risk.test.ts` | Historical FX/futures NAV, no omitted positions or filled prices, missing-session gap exclusions, fractional/tied ES, additive signed covariance/ES risk, observed multi-interval shocks, benchmark endpoint alignment and manual cost adjustment |
| `fields.test.ts` | Source/receipt separation, missing/nonfinite values, crossed/locked BBO, stale IEX trades, previous-close verification, yield/minor units and filtered raw CSV provenance |
| `panel-links.test.ts` | Real command/registry compatibility, monitor publishing, separate groups, hidden/incompatible panels, back/forward cursors, bounded histories, preset restoration and aliases |
| `navigation-race.test.ts` | A pending online ticker lookup cannot overwrite a newer linked-panel security selection |
| `store.test.ts` | Immediate reload/close flushes pending state so the latest screen and groups survive without waiting for the debounce |
| `refresh.test.ts` | The REFRESH registry (every source at once, the main process first, a second click ignored, slow and failing sources reported), the main process treating kept answers from before a click as expired while keeping young answers of sources with a daily allowance and its caps and pacing, and news requests in use asked again |
| `favalerts.test.ts` | Favourite pop-ups: once per story by link and title, newest on top, dismissing one or all, the caps, kept across a restart, and which stories count as about a favourite |
| `finance.test.ts` | Black-Scholes, Treasury math, indicators and statistics |
| `contracts.test.ts` | Independent bond yield/price and finite-difference risk checks, zero-volatility option limits, covered interest parity, dual-curve swap PV/par/coupon/curve risk, date/curve/input boundaries |
| `nasdaq-options.test.ts` | Nasdaq's option-chain request boundary, "Symbol not exists" as an answer, text figures and "--", OCC symbols from the row links, mismatched rows left out, the stock-then-ETF lookup, quote times and NDX's morning expiry |
| `eurex.test.ts` | Eurex's request boundary and answer check, its statistics (dates, contract months), the front month and its code, VG1 from two days' settlements, and the DAX future's fair value without a dividend yield |
| `auctions.test.ts` | The auction requests (Fiscal Data's 600 latest, TreasuryDirect's last 30 days and schedule, nothing else); each kind's result fields from both sources on the Treasury's answers of 31 October 2026, the same figures from both for the same auction, TreasuryDirect's results over Fiscal Data's blanks, the bidder shares, CMB and reopening names, a partial answer naming what failed, a held auction without results kept out of Upcoming, and the AUCR alias |
| `spf.test.ts` | The ECB survey request; the Q4 2026 round against Q3's from the Data Portal's answer of 31 October 2026 (years 2026 to 2028, the longer term as 2031), rolling horizons left out, a wrong answer named, and the table's two decimals, signed changes and uncoloured 0.00 |
| `asic.test.ts` | ASIC's request boundary, its index (a republished day under its later version), day files with quoted names, the days SI samples, and ASX codes |
| `identifiers.test.ts` | CUSIP, ISIN and SEDOL check digits, a US issuer's ISIN from its CUSIP, the SEC's state codes, and the codes taken from SPY's holdings |
| `spdr.test.ts` | State Street's holdings workbooks (a synthetic ZIP in their layout), the stock lines kept, layout changes, SPX weights from SPY's shares at each previous close, the fallback to market values, and DIA's Dow membership |
| `bis-policy.test.ts` | The BIS's policy-rate CSV, the four banks it supplies, a failed check that keeps earlier levels, and the BIS named and credited on CENTRALBANKS and RATEANALYSIS |
| `option-chain-analytics.test.ts` | Black's formula and its inversion, put-call parity, Greeks against bumped prices, the par curve, the implied forward, a whole synthetic chain, adjusted roots and a missing rate |
| `option-chain.test.ts` | Indicative-only read-only request boundary, OCC decoding, missing fields, event ages, sequential pagination, repeated tokens, page limits, partial failures and credentials/entitlements |
| `strategy-spreads.test.ts` | Independent common-expiry strategy payoffs, unlimited tails, breakevens, aggregate Greeks/scenarios, and bond Z-spreads against zero-coupon and explicit nonflat-curve cash flows |
| `data.test.ts`, `layout.test.ts`, `lookup.test.ts`, `portfolio.test.ts` | Heat map layout, calendars, fundamentals, workspace layouts, ticker lookup, the portfolio without paper trading |

## What the browser tests cover

`e2e/terminal.spec.ts` runs the browser build, which has no data source: the first test checks that it opens on the no-data page and that the demo, once chosen, says DEMO DATA. The rest use the demo to check that every function renders without errors, that typing goes to the command line with autocomplete, that numbered menus and back navigation work, that bad commands explain themselves, that watchlists and alerts persist, and that the phone layout shows one panel without horizontal scrolling.

Calculator checks use explicit inputs and independent expected values: bond price/yield/Z-spread, FX carry/PV, swap direction/coverage, zero-volatility equity/FX options, premium-to-IV via a separate normal-density integration, multi-leg payoff/breakevens and invalid-input clearing. American checks invert an independent QuantLib PDE premium and reject ambiguous exercise-floor IV. Portfolio checks verify reduced-position cost retention, historical risk controls, independent price-shock P&L and CSV provenance. CSV checks include inputs and results. The same calculator flows run in Electron real-data mode with provider prices/rates blocked. The rendering test verifies that its command list covers every registered function.

## Deterministic desktop integration

The shared `e2e/workspace-checks.ts` workflow runs in Chromium and Electron: linked monitor selections, function preservation, currency/financial compatibility, back/forward, named-layout/top-menu restoration, reload persistence and the linked research preset. Browser tests also verify mnemonic preference persistence and field-search CSV contents. Desktop field checks start with no source price, then use a five-minute-old IEX fixture to verify stale trade provenance and unavailable bid/ask event time. No test data is presented as a live provider validation.

`npm run e2e:desktop` launches the pinned Electron version with real main/preload/IPC. Fake keys and fixed transport responses in disposable profiles verify provider refusals, IEX price ownership, option-chain pagination, adjusted roots, sorting across display pages, old source times, partial entitlement failures and invalid IPC rejection. They do not validate live providers or real API keys.

Version 2.7.2 additionally exercises simultaneous FMP 402/Finnhub 401 recovery through Yahoo, full repeated-prefix Finnhub keys and immediate replacement-key recovery, missing-profile lookup, automatic Equibles fallback/cache reuse, live socket status without HTTP ledger entries, sticky provider names, Treasury timeout recovery SEC reporting-currency changes, quarterly trailing totals versus fiscal years, ended quarterly tagging and mixed revenue/EPS currencies for foreign issuers. These use explicitly synthetic fixtures.

REFRESH and favourite pop-ups: the button asks Alpaca's company news again although the main process holds it for ten minutes, Alt+R does the same, and its tooltip names what was left to the daily allowances; a story about a favourite published while the app was closed pops up, stays through a reload, is listed on `BREAKING FAV`, and does not come back once dismissed.

Research regressions exercise a denied FMP target alongside working annual estimates and Finnhub counts, each availability row's own source and plain-worded refusals, refusal recovery, APLD-specific access checks, and that the retired Equibles source receives no request. The published 2.4.1 Yahoo session/chart fallback and key-import regressions are retained.

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

Independent American option references are stored in `tests/fixtures/american-options.json`. Optional `scripts/option-reference.py` regenerates them using QuantLib 1.40 in a separate Python environment; QuantLib is not shipped and is not required for ordinary tests. Keep timing-sensitive unit checks separate from builds/browser suites; the existing 600-ms engine construction limit is unchanged.
