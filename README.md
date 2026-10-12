# Armin Terminal

Armin Terminal is a Bloomberg-style market terminal for the browser and the Windows desktop. It copies the way the Bloomberg Professional terminal is driven: amber-on-black screens, a command line where you type a ticker, a yellow market sector key and a function mnemonic, numbered menus you pick with `3 <GO>`, the F1 to F12 sector keys, and up to six independent panels. It has 66 functions covering equities, charts, news, FX, rates, credit, commodities, index futures, economics, options, swaps, paper trading, portfolios, alerts and chat.

The Windows desktop app runs on real data from free public sources: prices, ten years of history, intraday bars, company financials, estimates, analyst ratings, holders, dividends, listed options and headlines from Yahoo Finance, the US Treasury yield curve from the Treasury, and policy rates from the Fed, ECB, Bank of England and Bank of Canada. Anything those sources do not cover is simulated and marked SIMULATED or SIM on screen.

The browser version cannot reach those sources, so it runs a simulated market calibrated to real closing levels, with real crypto prices from Coinbase, real ECB currency fixings and, with a free Finnhub key, live US stock quotes and headlines. Its screens say SIMULATED wherever the figures are generated.

![Four-panel workspace: world indices, an Apple price chart, top news and a sector heat map](docs/workspace.png)

## Download for Windows

Every push builds the Windows app in CI. Open the [Actions tab](https://github.com/arminshah/bloomberg-terminal/actions), pick the latest successful CI run, and download `armin-terminal-windows` under Artifacts (you need to be signed in to GitHub). The zip holds two files:

- `Armin-Terminal-Setup-<version>.exe` installs the app with Start menu and desktop shortcuts.
- `Armin-Terminal-<version>-Portable.exe` runs without installing.

The executables are not code-signed, so the first launch may show "Windows protected your PC". Choose More info, then Run anyway.

This is the version with real market and company data (see [Where the data comes from](#where-the-data-comes-from)). It needs an internet connection; offline it falls back to the simulator.

The desktop app has no menu bar, so every F-key reaches the terminal. Window commands use Ctrl+Shift: Ctrl+Shift+N opens another terminal window with its own panel layout, Ctrl+Shift+F toggles full screen, Ctrl+Shift+I opens developer tools, and Ctrl+plus, Ctrl+minus and Ctrl+0 zoom. Watchlists, the portfolio, orders, alerts and settings are shared and stay in sync across windows. Each window remembers its size and position.

To publish a release instead, push a tag such as `v1.0.1`. The workflow in `.github/workflows/release.yml` builds both files on a Windows runner and attaches them to a GitHub Release for that tag. Locally, `npm run desktop` starts the desktop app and `npm run desktop:build` writes the installers to `release/` (on Windows; building the installer on Linux needs Wine).

## Run it in the browser

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` writes a static site to `dist/` that any web server can host.

## Using the terminal

Type anywhere and the text goes to the active panel's command line. The syntax follows the Bloomberg pattern of security, yellow key, function, GO:

| Command | What it does |
| --- | --- |
| `IBM US <EQUITY> <GO>` | Loads IBM and shows its related functions menu, numbered by category |
| `AAPL US <EQUITY> GP <GO>` | Price graph for Apple |
| `NVDA DES` | Ticker shorthand plus a function |
| `$APLD` | Cashtags work too |
| `SOFI US <EQUITY> <GO>` | Any US-listed stock; looked up online if it is not built in (see below) |
| `EQUITY <GO>` | Market sector menu for equities (works for every yellow key) |
| `AAPL <CORP> <GO>` | Apple's bonds outstanding |
| `CT10 <GOVT> YAS` | Yield analysis on the current 10-year Treasury |
| `ES1 <INDEX> DES` | S&P 500 E-mini front contract: expiry, basis and fair value |
| `EURUSD <CRNCY> FRD` | Forward points for EUR-USD |
| `GP` | Price graph for the security already loaded in the panel |
| `3 <GO>` | Pick numbered item 3) on the current screen |
| `GP?` | Help on a function |
| `HELP HELP` | Message the help desk (pressing F1 twice does the same) |

Aliases work too: `gold`, `brent`, `bund`, `btc`, `tsmc` and similar names resolve to the right security, and suggestions appear as you type.

Keys follow the Bloomberg keyboard. Enter is GO, Esc is CANCEL, Backspace on an empty line is MENU (back one screen), and PgUp and PgDn page through long screens. F1 is HELP. F2 to F12 are the yellow sector keys GOVT, CORP, MTGE, M-MKT, MUNI, PFD, EQUITY, CMDTY, INDEX, CRNCY and CLIENT; CLIENT opens the portfolio. Mortgages, money market instruments, municipals and preferreds are not covered, and their keys say so and point to related screens. Alt+1 to Alt+6 switch panels and Alt+Left/Right move through history. The key bar at the bottom has the main keys for mouse and touch.

The layout buttons in the top bar switch between one, two, three, four and six panels, and the dividers between panels can be dragged (double-click one to reset). LAUNCHPAD applies preset workspaces such as Trading Desk or Macro & Rates. Clicking a security opens it in the same panel; shift-click opens it in the next one. On a phone the panels become tabs.

![Trading Desk preset: monitor, composite quote, intraday chart, most active, time and sales, market depth](docs/trading-desk.png)

## Functions

| Area | Functions |
| --- | --- |
| Menus | `MENU` related functions for the loaded security, market sector menus and the main menu |
| Equity | `DES` description, `FA` financial statements and ratios, `GF` graph fundamentals, `ANR` analyst recommendations, `EE` earnings and estimates, `DVD` dividends, `HDS` holders, `RV` relative valuation, `EVTS` earnings and ex-dividend calendar, `WACC` cost of capital |
| Charts | `GP` price graph with studies and comparisons, `GIP` intraday, `HP` price history table, `COMP` comparative returns, `TRA` total return with dividends reinvested, `HS` spread and ratio analysis, `BETA` regression beta, `HVT` historical volatility |
| News | `TOP` top news (`TOP TECH` for one topic), `N` news search, `CN` company news, `READ` most read stories |
| Markets | `WEI` world equity indices, `WEIF` world index futures, `MOV` index movers, `IMAP` sector heat map, `MOST` most active, `EQS` equity screener, `BQ` composite quote with buy and sell buttons, `TAS` time and sales, `DEPTH` order book, `VWAP` intraday VWAP |
| Trading | `EMSX` order ticket, working orders, fills and cancels; fills book into `PORT` |
| FX and crypto | `FXC` cross rates, `WCRS` currency ranker, `FRD` forward rates, `OVML` FX option pricer, `CRYP` crypto monitor |
| Rates and credit | `WB` world bond yields, `GC` yield curves, `BTMM` Treasury and money markets, `YAS` bond calculator, `WIRP` implied rate path, `CENB` central bank monitor, `SWPM` SOFR swap valuation, `SRCH` fixed income search, `DDIS` debt distribution, `ALLQ` dealer quote montage |
| Commodities | `GLCO` global commodities |
| Economics | `ECO` economic calendar with live releases, `ECST` world economic statistics, `CDR` exchange holiday calendars |
| Derivatives | `OMON` option chain, `OVME` option valuation |
| Tools | `W` watchlists, `PORT` portfolio, performance and risk, `ALRT` price and news keyword alerts, `CORR` correlation matrix, `NOTE` notes, `SECF` security finder, `LAST` recent history, `LPAD` workspaces |
| Communication and system | `IB` chat with a help-desk bot and simulated trading desks, `HELP` function directory, `PDFU` settings and data sources |

![Related functions menu for IBM next to an EMSX ticket with a filled S&P 500 futures order](docs/menu-emsx.png)

EMSX is paper trading. Market orders fill at the bid or offer, limit orders rest until the market reaches them, stop orders trigger on the last price, DAY orders expire at the end of the UTC day, and algorithmic brokers slice large orders. Stocks and crypto settle against cash at the full price. Index and commodity futures are margined: fills only move cash by commission and realised P&L, and PORT counts them at unrealised P&L while showing their full notional as exposure. Gross exposure is capped at twice net asset value.

Tables can be copied or exported as CSV. Watchlists, the portfolio, orders, alerts, notes, chats, panel layouts and settings are saved locally.

## Any US stock

The built-in universe covers the large caps, but you can type any US-listed stock, with or without a `$`. If the ticker is not built in, the terminal looks it up online, adds it, and runs your command:

- The desktop app asks Yahoo Finance through its own process, so no key is needed. The stock then gets the same real data as the built-in ones: ten years of daily prices, quotes every 10 seconds, one-minute intraday bars, and the company's statements, estimates, ratings and holders.
- In the browser, add a free Finnhub key in `PDFU`. Lookups then use Finnhub's profile, key metrics and quote; the history is calibrated through the real 1-week, 1-month, 3-month, 6-month, year-to-date and 1-year returns, and prices stream live.

`SECF` searches all US stocks by name as well (click Search all US stocks). Looked-up stocks are saved and load instantly, calibrated, the next time, even offline. Funds, ETFs and non-US listings are not looked up; the terminal says so.

## Where the data comes from

The universe holds 84 stocks across the US, Europe and Asia, 28 equity indices, 11 equity index futures, 23 currency pairs and the dollar index, 19 commodity futures, 32 government yields, 10 cryptocurrencies, the seven on-the-run US Treasuries and 42 corporate bonds from 20 large US issuers. Any other US stock can be added by typing its ticker.

### Desktop app: real data

The desktop app fetches everything through its own process, so it needs no keys and no browser permissions. The top bar shows REAL DATA once it is connected, and `PDFU` lists each source and its state.

| Data | Source | Screens |
| --- | --- | --- |
| Quotes, daily history (10 years), intraday one-minute bars, dividends and splits for stocks, indices, US index futures, commodities and currencies | Yahoo Finance | Every price screen, `GP`, `GIP`, `HP`, `BQ`, `W`, `WEI`, `IMAP`, `DVD` |
| Crypto prices and candles | Coinbase (Yahoo Finance when crypto streaming is off in `PDFU`) | `CRYP`, every price screen |
| Financial statements, estimates, earnings dates and surprises, analyst ratings and price targets by firm, institutional and fund holders, company profile and key ratios | Yahoo Finance | `DES`, `FA`, `GF`, `EE`, `ANR`, `HDS`, `RV`, `EQS`, `EVTS`, `WACC` |
| Listed option chains: expiries, strikes, bid, offer, last, volume, open interest and implied volatility | Yahoo Finance | `OMON`, `HVT`, `OVME` from a quote |
| Company and market headlines with links to the publisher | Yahoo Finance | `TOP`, `N`, `CN`, `BQ` |
| US Treasury par yields for every tenor, end of day | US Treasury | `GC`, `WB`, `BTMM`, `WIRP`, bond pricing |
| Fed target range, effective fed funds and SOFR | New York Fed | `BTMM`, `CENB`, `WIRP`, `ECO` |
| ECB deposit rate, Bank Rate, Bank of Canada overnight target | ECB, Bank of England, Bank of Canada | `CENB`, `ECO` |

Prices stop moving when their market is closed and show the last session's change, the way a real terminal does; the quote strip says CLOSE, and LIVE during the session. Yahoo labels its US stock prices real time (Nasdaq last sale); other exchanges and futures can be delayed 15 to 20 minutes, and option quotes are delayed 15 minutes. The 5, 10 and 30-year Treasury yields update live; the other tenors show the Treasury's official close (marked EOD). Yahoo gives volume rather than individual trades, so `TAS` shows the volume traded between updates. Greeks in `OMON` are computed from each contract's own implied volatility, since Yahoo publishes none.

Some things have no free source and stay simulated in the desktop app, marked SIM or SIMULATED where they appear: order book depth (built around the real best bid and offer), non-US government yields, index futures outside the US (modelled at fair value to the real index), bond prices (modelled off the real Treasury curve plus an issuer spread), dealer quotes in `ALLQ`, economic releases other than central bank decisions, policy rates other than the four banks above, FX forward points and swap rates (models), the readership ranking in `READ` and the chat desks in `IB`. The CSI 300 index and the offshore yuan also stay simulated, because Yahoo returns no price history for them.

### Browser: simulated market

`scripts/snapshot.ts` reduces five years of daily closes for each instrument to a few anchor points (the last close and the levels one week, one month, three months, six months, year-to-date, one, two, three and five years ago) plus realised volatility and average volume. Those anchors live in `src/data/universe/snapshot.json`, currently as of 9 October 2026. The engine draws ten years of daily history that passes exactly through every anchor, so one-year returns and price levels match the real market at the snapshot date. From there a factor model (global, regional, sector, rates, dollar, oil, metals and crypto factors) simulates each day and each minute. The randomness is a pure function of instrument, date and minute, so every browser sees the same market and a reload shows the same history. Run `npm run snapshot` to refresh the calibration, or `npm run snapshot -- --only "APLD US Equity"` for one instrument.

Some instruments are priced from others. Treasuries and corporate bonds are priced off the generic Treasury curve, interpolated to each maturity. A corporate bond adds a credit spread that widens when the issuer's shares fall. Index futures trade at fair value to their index: the index carried at the financing rate less the dividend yield to the third-Friday expiry, rounded to the contract's tick. Currency crosses and the dollar index come from the underlying currencies.

Live feeds replace the simulation where the browser can reach them, and the status chip in the top bar shows which are connected:

- Crypto prices and daily candles from the public Coinbase Exchange API, streamed over WebSocket with a polling fallback.
- Daily ECB reference rates from Frankfurter, which become the FX history; intraday FX stays simulated around the latest fixing.
- With a free key from finnhub.io entered in `PDFU`, US stock quotes and trades plus general and company headlines.

In the browser, company fundamentals, analyst views, holders, dividends, option chains, order books, the economic calendar and most news stories are generated from each company's real scale and sector profile so the screens behave realistically. Every such screen is labelled SIMULATED, and the analyst firms and bond dealers it shows are fictional.

## What it does not do

A real Bloomberg terminal has tens of thousands of functions, licensed real-time data from hundreds of exchanges, and a network of other users. Armin Terminal reproduces the interface, the command language and the behaviour of the most used screens. Its desktop data comes from free public sources, with their delays and gaps, and the browser version is simulated. It has no messaging network beyond the built-in bot and simulated desks, and its orders never leave your machine.

## Deploying the web version

The workflow in `.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`. Turn it on once under Settings, Pages, Build and deployment, by choosing GitHub Actions as the source.

`npm run build:single` produces `dist-single/armin-terminal.html`, a single self-contained file with scripts, styles and fonts inlined. It runs from disk or any static host; where network access is blocked it uses the simulator only.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run desktop` | Build and start the desktop app |
| `npm run desktop:build` | Windows installer and portable .exe in `release/` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript project build |
| `npm test` | Unit tests (Vitest): market engine, bonds and futures pricing, calibration, option math, indicators, parser, online ticker lookup, paper trading, calendar, fundamentals, and the real-data readers (company data, option chains, Treasury curve, central bank rates) checked against saved responses |
| `npm run e2e` | Browser tests (Playwright): every function renders, keyboard flow, menus, persistence, phone layout |
| `npm run snapshot` | Refresh calibration anchors from public daily closes |

The code is split into `src/data` (universe, engine, generators, live feeds), `src/finance` (bond, option, statistics and indicator math), `src/terminal` (command parser, function registry, panel state, order management, background services), `src/components` (shell, tables and the canvas chart engine), `src/functions` (one file per screen or group of screens) and `electron` (the desktop shell). To add a function, write a component that takes `{ route, sec }` and register it in `src/terminal/registry.ts`.

## Disclaimer

Armin Terminal is an independent project and is not affiliated with Bloomberg L.P. Bloomberg is a trademark of Bloomberg Finance L.P. This project is for learning and demonstration and is not investment advice.
