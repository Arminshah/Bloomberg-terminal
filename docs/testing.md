# Testing

## The checks

| Command | What it runs |
| --- | --- |
| `npm run lint` | ESLint over the whole project, the Electron main process included |
| `npm run typecheck` | The TypeScript project build (`tsc -b`) |
| `npm test` | Unit tests (Vitest), about 220 in 19 files |
| `npm run e2e` | Browser tests (Playwright, Chromium) against the browser build |
| `npm run build` | Type check and production build of the renderer |

CI (`.github/workflows/ci.yml`) runs lint, type check, unit tests and browser tests on every push, then builds the Windows and Linux packages. Run the same four before pushing. The browser tests need Chromium: `npx playwright install chromium` once.

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
| `data.test.ts`, `layout.test.ts`, `lookup.test.ts`, `portfolio.test.ts` | Heat map layout, calendars, fundamentals, workspace layouts, ticker lookup, the portfolio without paper trading |

## What the browser tests cover

`e2e/terminal.spec.ts` runs the browser build, which has no data source: the first test checks that it opens on the no-data page and that the demo, once chosen, says DEMO DATA. The rest use the demo to check that every function renders without errors, that typing goes to the command line with autocomplete, that numbered menus and back navigation work, that bad commands explain themselves, that watchlists and alerts persist, and that the phone layout shows one panel without horizontal scrolling.

## Checking the desktop app

The browser tests never see real data. To check the desktop app against the real providers:

1. `npm run desktop`, or start an installed build.
2. Open `PROVIDERS`: every provider the screens have asked should read LIVE or ANSWERING, and any ERROR names its kind.
3. Spot-check prices against the provider's own site, with the freshness label in mind: `QUOTE AAPL`, `MARKET US`, `CURVE`, `CRYPTO`.
4. With the keys set: `MACRO`, `RELEASES`, `FILINGS MSFT`, `CROSSCHECK AAPL`.

On Linux without a display, `xvfb-run -a npm run desktop` works. Playwright can drive the desktop app as well (`_electron.launch` from `@playwright/test`), which is how the screens were checked during development.
