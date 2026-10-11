# Amber Terminal

Amber Terminal is a Bloomberg-style market terminal that runs in the browser. It has the amber-on-black screens, the command line with yellow market-sector keys, up to six independent panels and 49 functions covering equities, charts, news, FX, rates, commodities, economics, options, portfolios, alerts and chat.

Prices come from a simulated market that is calibrated to real closing levels and keeps ticking every second, day or night. When the browser can reach the internet it also streams real crypto prices from Coinbase and real ECB currency fixings, and with a free Finnhub key it adds live US stock quotes and real headlines.

![Four-panel workspace: world indices, an Apple price chart, top news and a sector heat map](docs/workspace.png)

## Run it

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
| `AAPL US <EQUITY> GP <GO>` | Price graph for Apple |
| `NVDA DES` | Ticker shorthand plus a function |
| `EURUSD <CRNCY> GIP` | Intraday EUR-USD |
| `USGG10YR <INDEX> HS` | US 10-year yield against the 2-year (2s10s) |
| `CT10 <GOVT> YAS` | Yield analysis on the current 10-year Treasury |
| `N CRYPTO` | News search by topic |
| `GP` | Price graph for the security already loaded in the panel |
| `3 <GO>` | Pick numbered item 3) on the current screen |
| `GP?` | Help on a function |

Aliases work too: `gold`, `brent`, `bund`, `btc`, `tsmc` and similar names resolve to the right security, and suggestions appear as you type.

Keys: Enter runs a command, Esc clears it, Backspace on an empty line goes back a screen, Alt+1 to Alt+6 switch panels and Alt+Left/Right move through history. F1 opens help, and F2, F8, F9, F10 and F11 type the GOVT, EQUITY, CMDTY, INDEX and CRNCY yellow keys. The key bar at the bottom has the same keys for mouse and touch.

The layout buttons in the top bar switch between one, two, three, four and six panels, and the dividers between panels can be dragged (double-click one to reset). LAUNCHPAD applies preset workspaces such as Trading Desk or Macro & Rates. Clicking a security opens it in the same panel; shift-click opens it in the next one. On a phone the panels become tabs.

![Trading Desk preset: monitor, composite quote, intraday chart, most active, time and sales, market depth](docs/trading-desk.png)

## Functions

| Area | Functions |
| --- | --- |
| Equity | `DES` description, `FA` financial statements and ratios, `ANR` analyst recommendations, `EE` earnings and estimates, `DVD` dividends, `HDS` holders, `RV` relative valuation, `EVTS` earnings and ex-dividend calendar, `WACC` cost of capital |
| Charts | `GP` price graph with studies and comparisons, `GIP` intraday, `HP` price history table, `COMP` comparative returns, `HS` spread and ratio analysis, `BETA` regression beta |
| News | `TOP` top news, `N` news search, `CN` company news |
| Markets | `WEI` world equity indices, `IMAP` sector heat map, `MOST` most active, `EQS` equity screener, `BQ` composite quote, `TAS` time and sales, `DEPTH` order book |
| FX and crypto | `FXC` cross rates, `WCRS` currency ranker, `CRYP` crypto monitor |
| Rates | `WB` world bond yields, `GC` yield curves, `BTMM` Treasury and money markets, `YAS` bond calculator, `WIRP` implied rate path |
| Commodities | `GLCO` global commodities |
| Economics | `ECO` economic calendar with live releases, `ECST` world economic statistics |
| Derivatives | `OMON` option chain, `OVME` option valuation |
| Tools | `W` watchlists, `PORT` portfolio, performance and risk, `ALRT` price alerts, `CORR` correlation matrix, `NOTE` notes, `SECF` security finder, `LAST` recent history, `LPAD` workspaces |
| Communication and system | `IB` chat with a help-desk bot and simulated trading desks, `HELP` function directory, `PDFU` settings and data sources |

Tables can be copied or exported as CSV. Watchlists, the portfolio, alerts, notes, chats, panel layouts and settings are saved in the browser's local storage.

## Where the data comes from

The universe holds 83 stocks across the US, Europe and Asia, 28 equity indices, 23 currency pairs and the dollar index, 19 commodity futures, 32 government yields, 10 cryptocurrencies and the seven on-the-run US Treasuries.

`scripts/snapshot.ts` reduces five years of daily closes for each instrument to a few anchor points (the last close and the levels one week, one month, three months, six months, year-to-date, one, two, three and five years ago) plus realised volatility and average volume. Those anchors live in `src/data/universe/snapshot.json`, currently as of 9 October 2026. The engine draws ten years of daily history that passes exactly through every anchor, so one-year returns and price levels match the real market at the snapshot date. From there a factor model (global, regional, sector, rates, dollar, oil, metals and crypto factors) simulates each day and each minute. The randomness is a pure function of instrument, date and minute, so every browser sees the same market and a reload shows the same history. Run `npm run snapshot` to refresh the calibration.

Live feeds replace the simulation where they are available, and the status chip in the top bar shows which are connected:

- Crypto prices and daily candles from the public Coinbase Exchange API, streamed over WebSocket with a polling fallback.
- Daily ECB reference rates from Frankfurter, which become the FX history; intraday FX stays simulated around the latest fixing.
- With a free key from finnhub.io entered in `PDFU`, US stock quotes and trades plus general and company headlines.

Company fundamentals, analyst views, holders, dividends, option chains, order books, the economic calendar and most news stories are generated from each company's real scale and sector profile so the screens behave realistically. They are clearly marked as simulated and are not reported figures. Analyst firms are fictional.

## Deploying

The workflow in `.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to `main`. Turn it on once under Settings, Pages, Build and deployment, by choosing GitHub Actions as the source.

`npm run build:single` produces `dist-single/amber-terminal.html`, a single self-contained file with scripts, styles and fonts inlined. It runs from disk or any static host; where network access is blocked it uses the simulator only.

## Development

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript project build |
| `npm test` | Unit tests (Vitest): market engine, calibration, bond and option math, indicators, parser, calendar, fundamentals |
| `npm run e2e` | Browser tests (Playwright): every function renders, keyboard flow, menus, persistence, phone layout |
| `npm run snapshot` | Refresh calibration anchors from public daily closes |

The code is split into `src/data` (universe, engine, generators, live feeds), `src/finance` (bond, option, statistics and indicator math), `src/terminal` (command parser, function registry, panel state, background services), `src/components` (shell, tables and the canvas chart engine) and `src/functions` (one file per screen or group of screens). To add a function, write a component that takes `{ route, sec }` and register it in `src/terminal/registry.ts`.

## Disclaimer

Amber Terminal is an independent project and is not affiliated with Bloomberg L.P. It is for learning and demonstration and is not investment advice.
