# Armin Terminal

Armin Terminal is a Bloomberg-style market terminal for the browser and the Windows desktop. It copies the way the Bloomberg Professional terminal is driven: amber-on-black screens, a command line where you type a ticker, a yellow market sector key and a function mnemonic, numbered menus you pick with `3 <GO>`, the F1 to F12 sector keys, and up to six independent panels. It has 66 functions covering equities, charts, news, FX, rates, credit, commodities, index futures, economics, options, swaps, paper trading, portfolios, alerts and chat.

Prices come from a simulated market that is calibrated to real closing levels and keeps ticking every second, day or night. When the machine can reach the internet it also streams real crypto prices from Coinbase and real ECB currency fixings, and with a free Finnhub key it adds live US stock quotes and real headlines.

![Four-panel workspace: world indices, an Apple price chart, top news and a sector heat map](docs/workspace.png)

## Download for Windows

The [latest release](https://github.com/arminshah/bloomberg-terminal/releases/latest) has two files:

- `Armin-Terminal-Setup-<version>.exe` installs the app with Start menu and desktop shortcuts.
- `Armin-Terminal-<version>-Portable.exe` runs without installing.

The executables are not code-signed, so the first launch may show "Windows protected your PC". Choose More info, then Run anyway.

The desktop app has no menu bar, so every F-key reaches the terminal. Window commands use Ctrl+Shift: Ctrl+Shift+N opens another terminal window with its own panel layout, Ctrl+Shift+F toggles full screen, Ctrl+Shift+I opens developer tools, and Ctrl+plus, Ctrl+minus and Ctrl+0 zoom. Watchlists, the portfolio, orders, alerts and settings are shared and stay in sync across windows. Each window remembers its size and position.

To build the installers yourself, push a tag such as `v1.0.1`. The workflow in `.github/workflows/release.yml` builds both files on a Windows runner and attaches them to a GitHub Release for that tag. Locally, `npm run desktop` starts the desktop app and `npm run desktop:build` writes the installers to `release/` (on Windows; building the installer on Linux needs Wine).

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

## Where the data comes from

The universe holds 83 stocks across the US, Europe and Asia, 28 equity indices, 11 equity index futures, 23 currency pairs and the dollar index, 19 commodity futures, 32 government yields, 10 cryptocurrencies, the seven on-the-run US Treasuries and 42 corporate bonds from 20 large US issuers.

`scripts/snapshot.ts` reduces five years of daily closes for each instrument to a few anchor points (the last close and the levels one week, one month, three months, six months, year-to-date, one, two, three and five years ago) plus realised volatility and average volume. Those anchors live in `src/data/universe/snapshot.json`, currently as of 9 October 2026. The engine draws ten years of daily history that passes exactly through every anchor, so one-year returns and price levels match the real market at the snapshot date. From there a factor model (global, regional, sector, rates, dollar, oil, metals and crypto factors) simulates each day and each minute. The randomness is a pure function of instrument, date and minute, so every browser sees the same market and a reload shows the same history. Run `npm run snapshot` to refresh the calibration.

Some instruments are priced from others. Treasuries and corporate bonds are priced off the generic Treasury curve, interpolated to each maturity. A corporate bond adds a credit spread that widens when the issuer's shares fall. Index futures trade at fair value to their index: the index carried at the financing rate less the dividend yield to the third-Friday expiry, rounded to the contract's tick. Currency crosses and the dollar index come from the underlying currencies.

Live feeds replace the simulation where they are available, and the status chip in the top bar shows which are connected:

- Crypto prices and daily candles from the public Coinbase Exchange API, streamed over WebSocket with a polling fallback.
- Daily ECB reference rates from Frankfurter, which become the FX history; intraday FX stays simulated around the latest fixing.
- With a free key from finnhub.io entered in `PDFU`, US stock quotes and trades plus general and company headlines.

Company fundamentals, analyst views, holders, dividends, bond issues and amounts, dealer quotes, option chains, order books, the economic calendar and most news stories are generated from each company's real scale and sector profile so the screens behave realistically. They are clearly marked as simulated and are not reported figures. Analyst firms and bond dealers are fictional. Deposit and swap rates used by FRD, OVML and SWPM are indicative.

## What it does not do

A real Bloomberg terminal has tens of thousands of functions, licensed real-time data from hundreds of exchanges, and a network of other users. Armin Terminal reproduces the interface, the command language and the behaviour of the most used screens, but most of its data is simulated, it has no messaging network beyond the built-in bot and simulated desks, and its orders never leave your machine.

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
| `npm test` | Unit tests (Vitest): market engine, bonds and futures pricing, calibration, option math, indicators, parser, paper trading, calendar, fundamentals |
| `npm run e2e` | Browser tests (Playwright): every function renders, keyboard flow, menus, persistence, phone layout |
| `npm run snapshot` | Refresh calibration anchors from public daily closes |

The code is split into `src/data` (universe, engine, generators, live feeds), `src/finance` (bond, option, statistics and indicator math), `src/terminal` (command parser, function registry, panel state, order management, background services), `src/components` (shell, tables and the canvas chart engine), `src/functions` (one file per screen or group of screens) and `electron` (the desktop shell). To add a function, write a component that takes `{ route, sec }` and register it in `src/terminal/registry.ts`.

## Disclaimer

Armin Terminal is an independent project and is not affiliated with Bloomberg L.P. Bloomberg is a trademark of Bloomberg Finance L.P. This project is for learning and demonstration and is not investment advice.
