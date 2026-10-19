# Armin Terminal

Version **2.7.2** fixes Finnhub key truncation and stock lookup without a company profile, adds Yahoo research fallback for FMP/Finnhub refusals and automatic Equibles estimate fallback, and selects the latest SEC reporting currency so currency changes do not hide current financial figures. Provider status follows the actual price socket; Treasury refreshes recover automatically. The orange exchange timers and city clocks, linked panels, field inspection and earlier analytics remain available. See [release validation](docs/release-v2.7.2.md), the [Bloomberg workflow audit](docs/bloomberg-parity.md) of all 72 commands, and [calculator conventions](docs/calculators.md). IEX covers one exchange; indicative options are not real-time OPRA. Full Bloomberg feature/data parity remains incomplete.

A keyboard-driven market terminal for private use, as a desktop app for Windows and Linux. You type a command such as `QUOTE AAPL`, `CHART NVDA 1D` or `MARKET US`, and up to six panels show quotes, charts, yields, central bank rates, economic statistics and company filings.

The desktop app uses public and official sources: the US Treasury, the Fed and other central banks, statistics offices, FRED, SEC EDGAR, Kraken, and Yahoo Finance for personal-use prices/company data. With your own keys it adds research (FMP, Finnhub recommendations and Equibles), news (Finnhub, Marketaux), IEX stocks and indicative option snapshots (Alpaca), plus sources for checking closes. Sources, timestamps, subscription refusals and missing coverage stay explicit. The browser build has no data source and opens a marked demo only when chosen.

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
| `MASSIVE_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TIINGO_API_KEY`, `TWELVE_DATA_API_KEY` | Second sources for US stock closes (`CROSSCHECK`) |
| `FMP_API_KEY` | Analyst price targets, ratings and estimates (`ANALYSTS`, `EARNINGS`) |
| `EQUIBLES_API_KEY` | Estimate report fallback, plus on-request guidance, KPIs, investor events, insider trades, short interest, 13F holders and IR news on `ANALYSTS` |
| `FINNHUB_API_KEY`, `MARKETAUX_API_TOKEN` | Market and company news (`MARKETNEWS`, `COMPANYNEWS`, `QUOTE`) |
| `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | IEX stock quotes and indicative option contracts on `OPTIONS`; read-only market data, subject to account entitlement |

To add several at once, paste your whole list into "Save these keys" on `PROVIDERS`: it recognises each key, saves it encrypted and tells you which names it saved. Environment variables of the same names work too and take precedence. [docs/configuration.md](docs/configuration.md) covers every key and switch.

Finnhub also supplies company-profile/ratio fallbacks, monthly recommendation history, quarterly EPS comparisons and the next-report calendar. These use the REST key; the webhook signing secret is a different credential.

After upgrading, re-save the complete Finnhub REST API key on `PROVIDERS` if it was rejected: older builds could shorten valid 40-character keys. A shortened saved value cannot be reconstructed. Environment variables take precedence over saved keys.

For APLD research, `ANALYSTS` falls back to Yahoo targets, recommendations, rating actions and annual estimates when the primary providers cannot answer; `YAHOO_RESEARCH_ENABLED` controls this separately. If structured annual estimates are unavailable, one Equibles estimate report loads automatically. Other reports remain on request. **Research source availability** retains the exact provider failures; **Test research access** on `PROVIDERS` checks six datasets for the selected issuer. Coverage depends on source and issuer: quota does not unlock a denied endpoint. Equibles' shared 100/day allowance is unsuitable for polling stock prices.

`FILINGS` → **Reported figures** defaults to the currency with the latest monetary reporting period. Older currencies remain selectable with their coverage dates. Standalone quarters absent from SEC company facts are identified explicitly, with access to newer 6-K/8-K documents; they are not inferred from annual figures.

## Using the terminal

Type anywhere: the text goes to the active panel's command line, with suggestions as you type. A command is a function and a security, in either order, with optional arguments:

| Command | What it does |
| --- | --- |
| `QUOTE AAPL` | Quote for Apple |
| `ANALYSTS AAPL` | Analyst price targets, ratings and estimates (also `TARGETS AAPL`) |
| `MARKETNEWS NVDA` | Market news, filtered to Nvidia |
| `CHART NVDA` | Price chart; `CHART NVDA 1D` for today's intraday chart |
| `PROFILE MSFT` | Company profile |
| `FLDS AAPL` / `FIELDS AAPL PX_LAST` | Search current local fields and inspect value, units, definition, source, freshness and UTC time; copy/export filtered fields |
| `FILINGS MSFT` | SEC filings and the figures Microsoft reported |
| `WATCHLIST TECH` | The watchlist named Tech |
| `MARKET US` | World equity indices, Americas |
| `MACRO CPI` | The macro dashboard, on inflation |
| `CRYPTO BTC` | Bitcoin on the crypto monitor |
| `YAS` / `BONDCALC` | Bond price/yield, cash flows, DV01, benchmark G-spread and zero-curve Z-spread from explicit inputs |
| `AAPL OMON` / `OPTIONS AAPL` | Indicative listed equity option chain, provider IV/Greeks and source times with Alpaca keys |
| `AAPL OVME` / `OPTIONCALC AAPL` | European/American value or implied volatility from premium, exercise premium and CSV |
| `OSA` / `OPTIONSTRATEGY` | Multi-leg option/stock payoff, breakevens, aggregate Greeks and scenarios |
| `EURUSD FRD` / `FXFORWARD EURUSD` | Covered-interest-parity forwards and contract PV from your spot and term rates |
| `SWPM` / `SWAPCALC` | Fixed/float swap NPV, par coupon, cash flows and bump risk from your zero curves |
| `AAPL` | The functions menu for Apple |
| `SOFI`, `$APLD` | Any US-listed stock, looked up online if it is not built in |
| `3` | Pick item 3) on the current screen |
| `CHART?` | Help on a function |

Enter runs a command, Esc clears the line, and Backspace on an empty line goes back a screen. F1 opens `HELP`, the function directory. Alt+1 to Alt+6 switch panels and Alt+Left and Alt+Right move through a panel's history. The buttons in the top bar switch between one and six panels, and the dividers between panels can be dragged; `LAYOUTS` saves and restores workspaces.

The top bar starts with two compact market timers, Euronext then NYSE. Each shows the exchange, the scheduled weekday/time in that exchange's local time, and an aligned OPENS IN/CLOSES IN countdown. They cover the regular session (09:00 to 17:30 Brussels time, 09:30 to 16:00 New York time), follow holidays and early closes, and open the exchange calendar when clicked. Open sessions have a green marker and countdown. Clocks for Brussels, New York, London, Tokyo and Hong Kong follow, with orange city names above aligned white local times. Exchange names use the same original orange.

Command names changed in version 2.0.0. Mnemonic commands such as `GP` and `DES` are supported as aliases for the corresponding implemented functions; saved layouts and settings carry over.

## Functions

| Area | Functions |
| --- | --- |
| Equity | `PROFILE` description and key figures, `FINANCIALS` statements and ratios, `FUNDCHART` fundamentals over time, `EARNINGS` reported results, `DIVIDENDS`, `HOLDERS`, `MANAGEMENT` company officers, `PEERS` relative valuation, `EVENTS` earnings and dividend calendar, `FILINGS` SEC filings and reported figures, `CROSSCHECK` closes against other sources, `WACC` cost of capital, `ANALYSTS` price targets, ratings and estimates |
| Charts | `CHART` with studies and comparisons, `INTRADAY`, `HISTORY`, `RETURNS`, `TOTALRETURN`, `SPREAD`, `BETA`, `VOLATILITY` |
| Markets | `MARKET` world indices, `INDEXFUTURES`, `CONTRIB` index movers, `HEATMAP`, `MOVERS`, `SCREEN` stock screener, `QUOTE`, `TRADES`, `DEPTH` (order book for crypto, best bid and offer otherwise), `VWAP` |
| News | `MARKETNEWS` (`TOP`) market news, the latest 8-K filings and Euronext press releases, `COMPANYNEWS` a company's news, with its Euronext press releases for a stock listed there; `HEADLINES` and `NEWS`: press releases from central banks, the BEA and ESMA |
| FX and crypto | `FXMATRIX` cross rates, `FXRANK`, `CRYPTO`, `FXOPTION` European option pricer with overrides, `FXFORWARD` calculated forwards and contract PV from your term rates |
| Rates | `BONDS` world government yields, `CURVE`, `MONEYMARKET`, `RATEPROBS` the Fed path priced in futures, `CENTRALBANKS`; `BONDCALC` contract analytics and `SWAPCALC` from user zero curves; `BONDSEARCH`, `DEBTPROFILE` and `DEALERQUOTES` still need bond/dealer datasets |
| Commodities | `COMMODITIES` |
| Economics | `MACRO` dashboard with first-release revisions, `RELEASES` calendar, `ECONSTATS` world statistics, `HOLIDAYS` exchange calendars |
| Derivatives | `OPTIONS` indicative listed US equity snapshots with Alpaca; `OPTIONCALC` European/American value/IV; `OPTIONSTRATEGY` common-expiry multi-leg/stock risk and scenarios |
| Portfolio and tools | `WATCHLIST`, `PORTFOLIO` manual holdings, historical-FX replay, VaR/ES, risk contributions and price/FX stress, `ALERTS`, `CORRELATION`, `SEARCH`, `RECENT`, `NOTES`, `LAYOUTS` |
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
| Analyst price targets, ratings, rating actions, annual estimates | Financial Modeling Prep (key) | As of each answer, kept 6 to 24 hours |
| Market and company news | Finnhub and Marketaux (keys), SEC EDGAR 8-K filings; MarketWatch if you switch it on | As each publisher posts |
| IEX last trade, bid and offer for US stocks | Alpaca (keys) | Real time, IEX only (one exchange) |

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

Use Node.js 24, as used by CI. Node.js 22 can also run the project.

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
