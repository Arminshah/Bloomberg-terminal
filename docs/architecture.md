# Architecture

Armin Terminal is a React 19 and TypeScript app built with Vite, packaged for Windows with Electron 43. It runs in two forms:

- The desktop app (Windows installer and portable .exe). This is the normal way to use it. It shows real data only and never runs the simulator.
- The browser build. It has no data source of its own and opens on a page that says so. A demo with simulated values, each marked DEMO DATA, runs only after you choose it, or when the build is made with `DEMO_MODE=true`.

## Trust boundary

The Electron main process is the app's back end. Every request to a data provider goes out from there. The page talks to it only through the bridge in `electron/preload.cjs`, with context isolation on, a sandboxed renderer and no Node integration. Each handler checks that the call comes from the app's own page and accepts only known paths, series, source keys, pairs or tickers, so a page cannot turn the main process into a general web client.

```
renderer: window.arminDesktop.*            main process (electron/)                       provider
  yahoo(path)                       --->   allowlist, analyst/news filter (yahoo-scope)  --->  Yahoo Finance (unofficial)
  streamOpen/Send/Close, onStream   --->   relays Yahoo's websocket                      --->  Yahoo streamer
  treasury(year)                    --->   fixed URL by year                             --->  US Treasury
  official(source, since)           --->   fixed URL per source key                      --->  central banks, ONS, Eurostat,
                                                                                               StatCan, ABS, RSS feeds
  fred(kind, id, from)              --->   allowlisted series and releases, FRED_API_KEY --->  FRED API
  sec(kind, arg)                    --->   sec.cjs: fixed files by kind and CIK,         --->  SEC EDGAR
                                           SEC_USER_AGENT, 5 a second, cached
  kraken(kind, pair, n)             --->   kraken.cjs: fixed pairs and request kinds     --->  Kraken public API
  coingecko()                       --->   one fixed request, COINGECKO_API_KEY          --->  CoinGecko Demo API
  eod(provider, ticker, from, to)   --->   eod.cjs: keys, gates, per-minute and daily    --->  Massive, Alpha Vantage,
                                           budgets                                             Twelve Data
  providersStatus/Set/Clear/Setting --->   providers.cjs: keys, switches, counts, limits
  settings (read once at load)      --->   provider switches as they were at start
```

`electron/providers.cjs` holds the credentials (`FRED_API_KEY`, `SEC_USER_AGENT`, `COINGECKO_API_KEY`, `MASSIVE_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY`) and the switches (`YAHOO_PRICES_ENABLED`, `KRAKEN_ENABLED`, `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED`). A value comes from the environment first, then a `.env` file when running from source, then the user's app data folder, where keys are encrypted with the operating system's key store (Electron `safeStorage`). The page can save or clear a key and learn whether one is configured and in the right format, never read it back. A key in the wrong format is never sent. The same module counts requests per provider, records the last attempt, success, failure and latency (with URLs and key values removed from error text), and spaces requests to stay under each provider's limit.

With `YAHOO_PRICES_ENABLED` off, the app's network session also cancels every request to Yahoo hosts, the page's own streaming socket included.

## Renderer

- `src/data/engine.ts` and `src/data/market.ts`: the market engine. In the desktop app every line is driven by external data (`setExternalDaily`, `setExternalQuote`) and the engine's `realOnly` flag keeps the simulator off; the simulator runs only in the browser demo.
- `src/data/live/*.ts`, one module per source:
  - `yahoo.ts`, `yquotes.ts`, `ystream.ts`, `yfund.ts`: Yahoo quotes, history, the streaming relay and company data.
  - `kraken.ts`, `coingecko.ts`: crypto prices, candles and order books from Kraken; market value and supply from CoinGecko.
  - `ust.ts`, `policy.ts`, `govyields.ts`, `official.ts`: the Treasury curve, central bank rates and calendars, government yields, and parsers for the official formats.
  - `fred.ts`: FRED releases and series, and the ONS, Eurostat, Statistics Canada and ABS statistics.
  - `officialnews.ts`: press releases from official RSS feeds.
  - `sec.ts`: EDGAR company search, filing lists and XBRL company facts.
  - `eod.ts`: daily bars from the optional end-of-day sources for `CROSSCHECK`.
  - `lookup.ts`: finding any US ticker online. `sources.ts`, `feeds.ts` and `status.ts`: which source owns which line, start-up, and the feed status in the top bar.
- `src/data/freshness.ts`: the freshness label of every price (REAL-TIME, DELAYED, END OF DAY, REFERENCE, STALE, DEMO DATA, UNKNOWN FRESHNESS) and the market session label, kept apart.
- `src/data/providers.ts`: the provider registry shown by `PROVIDERS`: what each provider serves, its data class, terms, official pages, check date and policy (enabled, needs a credential, planned, disabled).
- `src/data/macroseries.ts`: the series on the macro dashboard and the FRED notice.
- `src/finance/*.ts`: bond, option, statistics and indicator math.
- `src/terminal/`: the command parser (`commands.ts`), the function registry (`registry.ts`), old command names and their migration (`legacy.ts`), panel state, settings, user data and background services such as alerts.
- `src/functions/*.tsx`: one file per screen or group of screens.
- `src/data/demo.ts` and `src/components/NoDataSource.tsx`: the browser build's no-data page and demo opt-in.

## Which source owns a line

Each instrument line has one owner, decided once at start-up from the switches, so two providers never write into the same series:

- US Treasury yields, every tenor: the US Treasury's daily par curve. The Cboe 5, 10 and 30-year yield indices are separate lines, from Yahoo.
- The ten crypto lines: Kraken, unless `KRAKEN_ENABLED` is off, when they go back to Yahoo (if Yahoo is on).
- Other government yields and policy rates: the central bank or finance ministry that publishes them.
- Everything else with a price: Yahoo, if `YAHOO_PRICES_ENABLED` is on; otherwise the line has no data.

## Data flow for a quote

1. A provider delivers a price: Yahoo's stream or quote poll, Kraken's ticker, or an official daily file.
2. The engine stores it with the market's own time, the time the app received it, the provider, what the provider says about timing (real time, delayed by N minutes, or nothing), and the session (open, pre-market, after hours, overnight, closed).
3. `freshnessOf()` turns that into a label from the source's statements and timestamps, never from how often the app asks. Screens show it as a badge or as a one-letter mark on a price cell, with the reason on hover.
4. A previous close counts toward the day's change only once it is confirmed for the right session date. Until then the change is marked unverified.

## Persistence

- Watchlists, the portfolio, alerts, notes, layouts and settings: the renderer's local storage, per user and machine.
- Provider keys: `provider-credentials.json` in the app data folder, encrypted, readable only by the main process.
- Provider switches: `provider-settings.json` in the app data folder.
- The SEC's company list: `sec-company-tickers.json` in the app data folder, refreshed daily.
- Window positions: `window-state.json` in the app data folder.
- Market and economic data: kept in memory for the session.

There is no database. A local SQLite store is on the [roadmap](roadmap.md), once each provider's storage terms are confirmed.

## Builds and CI

- `npm run build`: type-checks and builds the renderer into `dist/`.
- `npm run desktop` and `npm run desktop:build`: run or package the desktop app.
- `.github/workflows/ci.yml`: lint, type check, unit tests, browser tests and the Windows build as a workflow artifact (`armin-terminal-windows`). When a push raises the version in `package.json`, it also publishes a GitHub Release with the installer and the portable app.
- `.github/workflows/release.yml`: builds and attaches the Windows app when a version tag is pushed.
- The repository is private, so artifacts and releases are visible only to people with access. Nothing is deployed to a public site: the GitHub Pages workflow was removed on 12 October 2026, and the repository has no Pages site.
