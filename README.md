# Armin Terminal

A keyboard-driven market terminal for private use, as a desktop app for Windows and Linux. You type a command such as `QUOTE AAPL`, `CHART NVDA 1D` or `MARKET US`, and up to six panels show quotes, charts, yields, central bank rates, economic statistics and company filings.

The desktop app shows real data only, from free public and official sources: the US Treasury, the Fed and other central banks, statistics offices, FRED, SEC EDGAR, the Kraken exchange, and Yahoo Finance for market prices and company data, for personal use. Every price carries a label saying how fresh it is. What no permitted free source covers, such as option chains, analyst estimates or bond prices, is left out and the screen says so; nothing is filled in with invented numbers. The browser build has no data source and runs a demo, marked DEMO DATA throughout, only when you choose it.

This is an independent project, not affiliated with Bloomberg L.P. It does not have the data coverage of a professional terminal; [docs/feature-matrix.md](docs/feature-matrix.md) says what is covered and what is not.

![Market Overview workspace: world equity indices, an S&P 500 chart, official announcements, a sector heat map and a watchlist](docs/workspace.png)

## Download

From the [Releases page](https://github.com/arminshah/bloomberg-terminal/releases) (the repository is private; sign in first):

| System | File | |
| --- | --- | --- |
| Windows | `Armin-Terminal-Setup-<version>.exe` | Installs with Start menu and desktop shortcuts |
| Windows | `Armin-Terminal-<version>-Portable.exe` | Runs without installing |
| Linux (Debian, Ubuntu) | `armin-terminal_<version>_amd64.deb` | `sudo apt install ./armin-terminal_<version>_amd64.deb` |
| Linux (most distributions) | `Armin-Terminal-<version>-x86_64.AppImage` | `chmod +x` it and run it; needs FUSE 2 |

The Windows files are not code-signed, so SmartScreen may warn on first launch (More info, then Run anyway). On Ubuntu 24.04 and later, use the .deb: an Electron AppImage cannot start Chromium's sandbox there. [docs/install.md](docs/install.md) has the details, running from source included.

## First start

Prices, charts, yields, central bank rates, official statistics, official announcements and crypto prices work at once, with no key. A few sources need a free key or your contact details; add them on the `PROVIDERS` screen, where they are encrypted with your system's key store and never shown again:

| Setting | Enables |
| --- | --- |
| `FRED_API_KEY` | US economic releases (`RELEASES`), the macro dashboard (`MACRO`), FRED's international series |
| `SEC_USER_AGENT` | SEC filings and reported figures (`FILINGS`): an application name and your own email, as the SEC requires |
| `COINGECKO_API_KEY` | Market value and supply of the listed coins |
| `MASSIVE_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY` | Second sources for US stock closes (`CROSSCHECK`) |

Environment variables of the same names work too and take precedence. [docs/configuration.md](docs/configuration.md) covers every key and switch.

## Using the terminal

Type anywhere: the text goes to the active panel's command line, with suggestions as you type. A command is a function and a security, in either order, with optional arguments:

| Command | What it does |
| --- | --- |
| `QUOTE AAPL` | Quote for Apple |
| `CHART NVDA` | Price chart; `CHART NVDA 1D` for today's intraday chart |
| `PROFILE MSFT` | Company profile |
| `FILINGS MSFT` | SEC filings and the figures Microsoft reported |
| `WATCHLIST TECH` | The watchlist named Tech |
| `MARKET US` | World equity indices, Americas |
| `MACRO CPI` | The macro dashboard, on inflation |
| `CRYPTO BTC` | Bitcoin on the crypto monitor |
| `AAPL` | The functions menu for Apple |
| `SOFI`, `$APLD` | Any US-listed stock, looked up online if it is not built in |
| `3` | Pick item 3) on the current screen |
| `CHART?` | Help on a function |

Enter runs a command, Esc clears the line, and Backspace on an empty line goes back a screen. F1 opens `HELP`, the function directory. Alt+1 to Alt+6 switch panels and Alt+Left and Alt+Right move through a panel's history. The buttons in the top bar switch between one and six panels, and the dividers between panels can be dragged; `LAYOUTS` saves and restores workspaces.

The top bar starts with two market timers, Euronext then NYSE: the time until each opens or closes its regular session (09:00 to 17:30 Brussels time, 09:30 to 16:00 New York time). They follow each exchange's holidays and early closes, turn green while the market is open, and open the holiday calendar when clicked. Clocks for Brussels, New York, London, Tokyo and Hong Kong follow.

Command names changed in version 2.0.0. An old code such as `GP` or `DES` says what it is called now, and saved layouts and settings carry over.

## Functions

| Area | Functions |
| --- | --- |
| Equity | `PROFILE` description and key figures, `FINANCIALS` statements and ratios, `FUNDCHART` fundamentals over time, `EARNINGS` reported results, `DIVIDENDS`, `HOLDERS`, `PEERS` relative valuation, `EVENTS` earnings and dividend calendar, `FILINGS` SEC filings and reported figures, `CROSSCHECK` closes against other sources, `WACC` cost of capital, `ANALYSTS` (not available: no permitted source) |
| Charts | `CHART` with studies and comparisons, `INTRADAY`, `HISTORY`, `RETURNS`, `TOTALRETURN`, `SPREAD`, `BETA`, `VOLATILITY` |
| Markets | `MARKET` world indices, `INDEXFUTURES`, `CONTRIB` index movers, `HEATMAP`, `MOVERS`, `SCREEN` stock screener, `QUOTE`, `TRADES`, `DEPTH` (order book for crypto, best bid and offer otherwise), `VWAP` |
| News | `HEADLINES` and `NEWS`: press releases from central banks, the BEA and ESMA; `COMPANYNEWS` points to the company's filings |
| FX and crypto | `FXMATRIX` cross rates, `FXRANK`, `CRYPTO`, `FXOPTION` option pricer, `FXFORWARD` (spot only: forward points have no free source) |
| Rates | `BONDS` world government yields, `CURVE`, `MONEYMARKET`, `RATEPROBS` the Fed path priced in futures, `CENTRALBANKS`; `SWAPCALC`, `BONDCALC`, `BONDSEARCH`, `DEBTPROFILE` and `DEALERQUOTES` say why they have no data (swap rates and bond prices have no free source) |
| Commodities | `COMMODITIES` |
| Economics | `MACRO` dashboard with first-release revisions, `RELEASES` calendar, `ECONSTATS` world statistics, `HOLIDAYS` exchange calendars |
| Derivatives | `OPTIONCALC` option calculator; `OPTIONS` (not available: listed option quotes are licensed) |
| Portfolio and tools | `WATCHLIST`, `PORTFOLIO` holdings you enter, with performance and risk, `ALERTS`, `CORRELATION`, `SEARCH`, `RECENT`, `NOTES`, `LAYOUTS` |
| System | `HELP`, `MENU`, `PROVIDERS` data providers and keys, `SETTINGS`, `MESSAGES` help-desk bot |

Tables can be copied or exported as CSV. Watchlists, the portfolio, alerts, notes, layouts and settings are kept on your computer. Paper trading is switched off: the portfolio holds only what you enter.

## Where the data comes from

| Data | Source | Freshness |
| --- | --- | --- |
| Stock, index, futures, currency and commodity prices; daily and intraday history; company profiles, statements, holders and dividends | Yahoo Finance (personal use) | Real time or delayed by exchange, as Yahoo labels each quote; history end of day |
| Crypto prices, best bid and offer, candles and order books (10 USD pairs) | Kraken; Yahoo Finance for the session if Kraken does not answer | Real time as of each snapshot |
| Crypto market value and supply | CoinGecko (key) | Aggregated, every 10 minutes |
| US Treasury yields, every tenor | US Treasury | End of day; the Cboe 5, 10 and 30-year indices intraday |
| Fed funds, SOFR and the other reference rates; FOMC dates | New York Fed, Federal Reserve Board | Daily |
| Policy rates | ECB, Bank of England, Bank of Canada, RBA, SNB, Banco Central do Brasil | As decided |
| Government yields | Bundesbank, Bank of England, Ministry of Finance Japan, Bank of Canada, RBA | End of day |
| Economic statistics | ONS, Eurostat, Statistics Canada, ABS; FRED (key) for US releases and other countries | As published |
| Filings and reported financial figures | SEC EDGAR (your contact) | As filed |
| Press releases | Central banks, BEA, ESMA (RSS) | As published |

Each price shows one of these labels: REAL-TIME, DELAYED, END OF DAY, REFERENCE (an official value published once a day), STALE, UNKNOWN FRESHNESS, or DEMO DATA in the browser demo. Hover a price for the reason, the source's own time and the time it arrived. A day's change is shown only against a previous close confirmed for the right session.

Some figures are calculated from the real data, and the screens say so: the Fed path on `RATEPROBS` (the CME FedWatch method on fed funds futures), index futures' fair value, year-on-year rates from published index levels, option values on `OPTIONCALC`, and returns, volatility, beta and correlation.

[docs/data-providers.md](docs/data-providers.md) gives each provider's terms and limits with the pages they come from.

## Documentation

- [Installing and starting](docs/install.md), on Windows and Linux
- [Configuration](docs/configuration.md): keys, switches and the provider screen
- [Data providers](docs/data-providers.md), [limits and entitlements](docs/limits.md) and [attribution](docs/attribution.md)
- [Feature and data coverage](docs/feature-matrix.md): what is implemented, with what data, and what is missing
- [Data dictionary](docs/data-dictionary.md): fields, freshness labels and formulas
- [Architecture](docs/architecture.md), [testing](docs/testing.md), [adding a provider](docs/adding-a-provider.md) and [troubleshooting](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md): what changed in each version and what comes next

## Development

You need Node.js 22.

| Command | Purpose |
| --- | --- |
| `npm run desktop` | Build and start the desktop app |
| `npm run dev` | Browser build with hot reload (no data; demo on request) |
| `npm run lint`, `npm run typecheck` | ESLint and the TypeScript build |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | Browser tests (Playwright) |
| `npm run desktop:build` | Windows installer and portable app in `release/` |
| `npm run desktop:build:linux` | Linux AppImage and .deb in `release/` |

The code is split into `electron/` (the main process, which makes every provider request and keeps the keys), `src/data/` (the engine, the provider registry and one module per source under `live/`), `src/finance/` (bond, option and statistics math), `src/terminal/` (command parser, function registry, panels and settings), `src/components/` and `src/functions/` (one file per screen or group of screens).

## Disclaimer

Armin Terminal is an independent project for private use and is not affiliated with Bloomberg L.P.; Bloomberg is a trademark of Bloomberg Finance L.P. The data it shows belongs to its providers and is for your own use only, not for redistribution. Free data has delays, gaps and errors, and calculated figures are models with stated assumptions. Nothing here is investment advice.
