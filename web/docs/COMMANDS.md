# Armin Terminal: command language, symbols and keys

Everything in Armin Terminal can be reached by typing in the command bar or with the keys below. The words,
aliases, symbol formats and shortcuts were designed for Armin Terminal; none are taken from another product.

## 1. Command bar

- Open it with `/` or `Ctrl+K` (`Cmd+K` on macOS). It acts on the **focused pane**.
- Typing shows fuzzy suggestions over commands, instruments (symbol and name), saved layouts, saved screens
  and help topics. Each suggestion shows an inline hint: what the command does, or the instrument's name,
  type and market.
- `↑`/`↓` move through suggestions; `Tab` completes the highlighted one; `Enter` runs it.
- On an empty bar, `↑` walks back through your command history (kept per browser, last 200).
- `Ctrl+Enter` runs the line in a **new pane to the right**; `Shift+Enter` in a **new pane below**.
- `Esc` closes the bar without running anything.
- Commands, aliases and symbols are case-insensitive.

## 2. Grammar

```
<symbol>                         open the instrument's OVERVIEW
<COMMAND>                        run on the pane's current instrument (or market-wide)
<COMMAND> <symbol> [options]     command first
<symbol> <COMMAND> [options]     symbol first: the same thing
```

Options are plain words or `key:value` pairs, in any order:

```
CHART AAPL.US 5Y candle sma:50,200 rsi
AAPL.US CHART 1D area
NEWS src:sec q:"guidance"
SCREEN mkt_cap>10e9 pe_ttm<25 rev_growth_yoy>0.15
CALENDAR week earnings watch
MACRO CPIAUCSL.MAC yoy
COMPARE AAPL.US MSFT.US SPX.IDX 1Y
LAYOUT SAVE morning
```

A bare word that is neither a command nor an exact symbol is treated as a search (`apple` → suggestions,
`Enter` → `FIND apple`).

## 3. Commands

| Command | Alias | Needs an instrument? | What it shows |
| --- | --- | --- | --- |
| `OVERVIEW` | `ov` | yes (a bare symbol opens it) | Price, change, ranges, volume, market value, key ratios, profile summary, next events |
| `QUOTE` | `qt` | yes | Full quote: bid/ask, last trade, session high/low, volume vs average, timestamps and source |
| `CHART` | `ch` | yes | Price chart: `1D 5D 1M 3M 6M YTD 1Y 5Y MAX`; `candle line area`; `volume`; studies `sma ema rsi macd bb`; `events`; `table` |
| `COMPARE` | `cmp` | 2+ instruments | Several instruments on one chart, rebased or in percent |
| `PROFILE` | `pro` | stock | Description, sector, industry, headquarters, staff, officers, website |
| `FINANCIALS` | `fin` | stock | Income, balance sheet, cash flow, ratios; `annual` / `quarterly`; chart any line |
| `EARNINGS` | `earn` | stock | Report dates, reported vs expected where available, price reaction |
| `DIVIDENDS` | `div` | stock | Dividend history, yield, growth, next dates |
| `PEERS` | `vs` | stock | Peer table with medians; `add:` / `drop:` peers |
| `FILINGS` | `fil` | US stock | SEC filings by form type, with links |
| `NEWS` | `nw` | optional | Company news on a stock, market news otherwise; `q:` `src:` `topic:` filters |
| `MARKETS` | `mk` | no | World stock indices by region |
| `MOVERS` | `mv` | no | Gainers, losers, most active; `mkt:` filter |
| `FX` | — | no | Major pairs, cross-rate matrix, period ranking |
| `RATES` | `yld` | no | Government yields, curves, money-market rates |
| `COMMODITIES` | `com` | no | Energy, metals, agriculture |
| `CRYPTO` | `cx` | no | Main crypto assets |
| `SCREEN` | `scr` | no | Stock screener; `SCREEN <name>` runs a saved screen |
| `CALENDAR` | `cal` | no | Earnings, dividends, economic releases, central bank meetings; `day week month` |
| `MACRO` | `mac` | optional series | Macro dashboard, or one or more series with `yoy mom index=100 log` |
| `WATCH` | `wl` | no | Watchlists with live prices; `WATCH <name>` opens a list, `WATCH ADD <symbol>` adds to the open list |
| `ALERTS` | `al` | no | Price alerts and their log; `ALERTS ADD AAPL.US > 250` |
| `PORTFOLIO` | `pf` | no | Positions, trades, P&L, allocation |
| `FIND` | — | no | Search commands, instruments, help and saved items |
| `FIELDS` | `dict` | no | The field dictionary: every data field, its unit, type and source |
| `EXPORT` | `csv` | — | Download the focused pane's table as CSV |
| `LAYOUT` | `lay` | no | `LAYOUT <name>` loads, `LAYOUT SAVE <name>` saves, `LAYOUT` lists |
| `SOURCES` | `src` | no | Data providers: configured or not, allowance left, last error |
| `SETTINGS` | `set` | no | Theme, density, default market, date format, refresh rates |
| `HELP` | `h`, `?` | no | Help; `HELP <command>`, `HELP KEYS`, `HELP SYMBOLS` |

Planned after v1: `ESTIMATES` (`est`), `HOLDERS` (`hold`), `INSIDERS` (`ins`), macros.

## 4. Symbols

One scheme for every asset class. The display form is always the full symbol.

| Asset class | Format | Examples |
| --- | --- | --- |
| Stocks and ETFs | `TICKER.CC` (ISO 3166 country of the listing) | `AAPL.US`, `SPY.US`, `VOD.GB`, `SAP.DE`, `ABI.BE`, `7203.JP` |
| Indices | `NAME.IDX` | `SPX.IDX`, `NDX.IDX`, `DAX.IDX`, `FTSE.IDX`, `N225.IDX` |
| Currency pairs | `BASEQUOTE.FX` | `EURUSD.FX`, `USDJPY.FX` |
| Crypto | `ASSET-QUOTE` | `BTC-USD`, `ETH-EUR` |
| Government yields | `CCnnY.GOV` (tenor in months `M` or years `Y`) | `US10Y.GOV`, `US3M.GOV`, `DE10Y.GOV` |
| Commodities (front contract) | `NAME.CMD` | `WTI.CMD`, `BRENT.CMD`, `GOLD.CMD`, `NATGAS.CMD` |
| Macro series | `SERIESID.MAC` (the source's series id) | `CPIAUCSL.MAC`, `UNRATE.MAC` |

Typing a bare ticker (`AAPL`) resolves to the default market from SETTINGS (`US` unless changed); if that
fails it becomes a search. Names work too: `apple` suggests `AAPL.US`.

## 5. Keys

Shortcuts never fire while you type in a text field, except the ones marked *anywhere*.

### Global

| Keys | Action |
| --- | --- |
| `/`, `Ctrl/Cmd+K` *anywhere* | Command bar for the focused pane |
| `F1` *anywhere* | Help for the focused pane's view |
| `?` | Shortcut sheet |
| `Esc` *anywhere* | Close the bar, menu or dialog |
| `Alt+1` … `Alt+9` *anywhere* | Focus pane 1–9 |
| `Alt+R` | Related commands for the focused pane's instrument |
| `F` | Jump hints: every row, tab and link in the focused pane gets a short label; type it to activate |
| `Backspace` / `Shift+Backspace` | Back / forward in the focused pane's history |
| `Ctrl+Shift+C` | Copy the focused table as tab-separated text |
| `T` | Switch dark / light theme |

### Panes (press `Ctrl+Space`, release, then the key)

| Key | Action |
| --- | --- |
| `V` | Split the focused pane to the right |
| `S` | Split the focused pane below |
| `X` | Close the focused pane |
| `Z` | Maximise / restore the focused pane |
| `←` `↑` `→` `↓` | Focus the neighbouring pane |
| `Shift` + arrows | Grow or shrink the focused pane |
| `1` … `9` | Focus pane by number |
| `O` | Open the layouts list |

### Tables and lists

| Keys | Action |
| --- | --- |
| `↑` `↓`, `PgUp` `PgDn`, `Home` `End` | Move the selection |
| `Enter` | Open the selected row (an instrument opens its OVERVIEW in the pane) |
| `Ctrl+Enter` | Open the selected row in a new pane |
| `←` `→` | Move between columns; `Enter` on a header sorts |
| `Alt+↑` / `Alt+↓` | Move a watchlist row up or down |
| `Delete` | Remove the selected row (watchlist, alert, position), with undo |

### Charts

| Keys | Action |
| --- | --- |
| `+` / `-` | Zoom in / out |
| `←` / `→` | Pan |
| `0` | Reset the view |
| `1`–`9` | Range presets in the order shown on the chart |
| `C` | Cycle candle / line / area |
