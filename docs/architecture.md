# Architecture

Armin Terminal is a React 19 and TypeScript app built with Vite. It runs in two forms:

- The desktop app (Electron 43, Windows installer and portable .exe). This is the normal way to use it: real data only, simulator off.
- The browser build. It has no data source of its own and opens on a page that says so. A demo with simulated values, each marked DEMO DATA, runs only after you choose it (or open the page with `?demo=1`).

## Trust boundary

The Electron main process is the app's back end. Every request to a data provider goes out from there, and the page talks to it only through the bridge in `electron/preload.cjs` (context isolation on, sandboxed renderer, no Node integration).

```
renderer (React screens, engine)          main process (electron/main.cjs)            providers
  window.arminDesktop.yahoo(path)   --->  allowlisted path, crumb, user agent   --->  Yahoo Finance
  .treasury(year)                   --->  fixed URL by year                     --->  US Treasury
  .official(source, since)          --->  fixed URL per source key              --->  central banks, ONS, Eurostat
  .fred(kind, id, from)             --->  allowlisted series and releases       --->  FRED API (with FRED_API_KEY)
  .stream*                          --->  relays Yahoo's websocket              --->  Yahoo streamer
  .providersStatus/Set/Clear        --->  electron/providers.cjs (keys, counts, limits)
```

Each IPC handler checks that the request comes from the app's own page (`file://`) and only accepts known paths, series or source keys, so a page cannot turn the main process into a general web client.

`electron/providers.cjs` holds the credentials (`FRED_API_KEY`, `MASSIVE_API_KEY`, `SEC_USER_AGENT`). A value comes from the environment first, then a `.env` file next to the app when running from source, then the user's app data folder, where saved values are encrypted with the operating system's key store (Electron `safeStorage`). The page can save or clear a value and learn whether one is configured, never read it back. The same module counts requests per provider, records the last success and the last failure (with URLs removed from error text), and spaces requests to stay under a limit (FRED: 60 a minute).

## Renderer

- `src/data/engine.ts`: the market engine. In the desktop app every line is driven by external data (`setExternalDaily`, `setExternalQuote`); the simulator runs only in the browser demo.
- `src/data/live/*.ts`: one module per source: `yahoo.ts` (quotes, history, stream relay, timing labels), `yfund.ts` (company data), `yopt.ts` (options), `ynews.ts`, `ust.ts` (Treasury), `policy.ts` (central bank rates and calendars), `govyields.ts` (official government yields), `official.ts` (parsers for the official formats), `fred.ts` (FRED API, ONS and Eurostat statistics), `lookup.ts` (any US ticker).
- `src/data/providers.ts`: the provider registry shown by `PROV`: what each provider serves, its data class, terms, official pages and check date, and a policy (enabled, needs a credential, planned, disabled).
- `src/functions/*.tsx`: one file per screen or group of screens. `src/terminal/registry.ts` maps function codes to screens.
- `src/data/demo.ts` and `src/components/NoDataSource.tsx`: the browser build's no-data page and demo opt-in.

## Data flow for a quote

1. Yahoo's quote poll or stream delivers a price. `timingOf()` in `yahoo.ts` reads only what the quote says about timing: real time when its source name says so, delayed by the minutes it gives, otherwise unknown.
2. The engine stores the price with the market's own time (`time`), the time the app received it (`fetched`), the timing and the source's name.
3. Screens show the price with a freshness label (`srcLabelLong` in `QuoteStrip.tsx`): Live (provider-labelled), Delayed N min (provider-labelled), Timing not confirmed, Market closed, Stale, End of day, No data, or DEMO DATA.

## Persistence

- Watchlists, portfolio and paper orders, alerts, notes, chats, layouts and settings: the renderer's local storage, per user and machine.
- Provider keys: the encrypted file `provider-credentials.json` in the app data folder (main process only).
- Window positions: `window-state.json` in the app data folder.
- Market and economic data: kept in memory for the session; nothing is written to disk.

There is no database yet. A local SQLite store (`node:sqlite`, which ships with the Node 24 inside Electron 43) is the planned next step for portfolio transactions and last-known values, once each provider's storage terms are confirmed; see `roadmap.md`.

## Builds and CI

- `npm run build`: type-checks and builds the renderer into `dist/`.
- `npm run desktop` / `npm run desktop:build`: run or package the desktop app.
- `.github/workflows/ci.yml`: lint, type check, unit tests, browser tests and the Windows build as a workflow artifact (`armin-terminal-windows`).
- `.github/workflows/release.yml`: builds the Windows app and attaches it to a GitHub Release when a version tag is pushed.
- The repository is private, so artifacts and releases are visible only to people with access. Nothing is deployed to a public site; the GitHub Pages workflow was removed on 12 October 2026.
