# Armin Terminal: features

Armin Terminal is a keyboard-first market research workstation that runs in the browser. This file lists the
workflows it supports and the Armin feature that covers each one.

## How this list was made

Six public training guides for professional market terminals (student guides, a training booklet, a set of
library cheat sheets, a spreadsheet add-in guide and an API developer guide) were read on 20 October 2026 to
learn *what analysts do* at a terminal. One of the seven links refused access (HTTP 403) and was skipped.

The guides were used for feature ideas only. Nothing in Armin Terminal copies another product's name, logo,
colours, screen layouts, command words, function codes, keyboard conventions or text, and the app quotes none
of the guides. Every command word, alias, identifier format, shortcut, label and visual below was designed for
Armin Terminal.

Status labels: **v1** is in the first release plan (see [PLAN.md](PLAN.md)); **later** is planned after v1;
**out of scope** has no free official data source or does not fit a personal tool.

## 1. Finding things and moving around

| Workflow (what analysts do) | Armin feature | Status |
| --- | --- | --- |
| Find an instrument when only part of its name is known, and narrow the matches by asset class | **Command bar** (`/` or Ctrl/Cmd+K) with fuzzy matching on symbol and name; type filters (`stock:`, `fx:`, `crypto:`, `index:`, `rate:`, `macro:`) | v1 |
| Load an instrument once, then run several analyses on it without retyping | Each **pane** keeps its own instrument; typing a command alone (`CHART`) applies it to the pane's instrument | v1 |
| Discover which analyses apply to the loaded instrument | **Related panel** (`Alt+R`): the commands that fit the instrument's type, grouped by topic | v1 |
| Search everything at once: commands, instruments, help topics | `FIND <text>` opens grouped results; the command bar shows the top hits inline | v1 |
| Identify instruments by standard codes (ISIN, CUSIP, FIGI) | Identifier lookup through the gateway's search; Armin's own symbol scheme stays the display format | later |
| Work on several things at once in separate windows | **Workspace** of panes: split, resize, close, maximise; every pane has its own instrument, view and history | v1 |
| Jump to an item on screen with the keyboard instead of the mouse | **Jump keys**: rows, tabs and links get a short hint (`Alt` held shows them); typing the hint activates it | v1 |
| Tell editable fields from read-only ones | Inputs use the violet secondary highlight and a visible focus ring; read-only figures never do | v1 |
| Go back to the previous screen | Per-pane history: `Alt+←` / `Alt+→` | v1 |
| Save a screen arrangement and get it back later | **Named layouts**: `LAYOUT SAVE <name>`, `LAYOUT <name>`; the last session is restored on load | v1 |
| Record a sequence of commands and replay it with one key | **Macros**: a saved list of commands bound to a key | later |

## 2. One company or instrument

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Get a one-page picture of a company: what it does, price, range, size, key ratios, next events | `OVERVIEW` (a bare symbol opens it): price, change, day and 52-week range, volume, market value, key ratios, profile text, next report date | v1 |
| See a quote in detail: bid/ask, last trade, session high/low, volume against average | `QUOTE` | v1 |
| Read the company's description, sector, headquarters, staff and officers | `PROFILE` | v1 |
| Chart prices from one day to many years, as candles, line or area, with volume | `CHART` with ranges `1D 5D 1M 3M 6M YTD 1Y 5Y MAX` and styles `candle line area` | v1 |
| Add technical studies (moving averages, momentum, bands) and change their settings and colours | Studies on `CHART`: `sma`, `ema`, `rsi`, `macd`, `bb` with parameters (`sma:50,200`); colours follow the theme | v1 |
| Mark earnings and dividends on the chart | Event markers on `CHART` (`events` on/off) | v1 |
| Compare the performance of several instruments on one chart | `COMPARE AAPL.US MSFT.US SPX.IDX`: rebased to 100, or percentage change | v1 |
| See daily prices as a table for a date range and export it | `CHART ... table` view with CSV export | v1 |
| Read income statement, balance sheet and cash flow, annual or quarterly | `FINANCIALS` with tabs and `annual`/`quarterly` switch | v1 |
| See valuation, profitability and leverage ratios | Ratios tab of `FINANCIALS` | v1 |
| Plot a fundamental line over time, alone or against a competitor | Chart toggle on any `FINANCIALS` row; add a peer to compare | v1 |
| Review earnings history, surprises and how the share price reacted | `EARNINGS`: report dates, expected vs reported EPS and revenue where sources give estimates, price move on the day | v1 |
| See analysts' ratings and price targets | `ESTIMATES` where a configured source provides them; marked unavailable otherwise | later |
| Review dividends paid and upcoming | `DIVIDENDS`: history, yield, growth, next dates | v1 |
| See who owns the company and what insiders bought or sold | `HOLDERS` (13F summary) and `INSIDERS` (SEC Form 4) | later |
| Compare a company with its peers on valuation and growth | `PEERS`: a peer table with medians, the company highlighted, peers editable | v1 |
| Read the company's official filings | `FILINGS` from SEC EDGAR, filtered by form type | v1 |
| Company-specific news | `NEWS` on a stock pane | v1 |
| Revenue by segment and region, supply-chain links, capital structure, cost of capital | Segments from filings where tagged | later; supply chain and proprietary research **out of scope** |

## 3. Markets at a glance

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Watch the world's main stock indices by region | `MARKETS`: indices grouped by region, auto-refreshing, sorted or by time zone | v1 |
| See the day's biggest movers and most active names | `MOVERS`: gainers, losers, most active, filterable by market | v1 |
| Watch the major currency pairs, cross rates and rank currencies over a period | `FX`: majors table, a cross-rate matrix and a ranking by period return | v1 |
| Follow government bond yields across countries and the shape of the yield curve | `RATES`: benchmark yields, curve chart with an earlier-date overlay | v1 |
| Follow money-market rates and the central bank's decisions | `RATES` money-market tab; central bank meetings in `CALENDAR` | v1 |
| Follow energy, metals and agricultural prices | `COMMODITIES` | v1 |
| Follow crypto assets | `CRYPTO` | v1 |
| See one market break down by sector or constituent | Sector breakdown on `MARKETS` | later |

## 4. Finding ideas

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Screen stocks on fundamentals and price measures (size, valuation, growth, momentum), see matches, sort | `SCREEN`: criteria builder (field, operator, value), live result count, sortable results | v1 |
| Save a screen and run it again later | Saved screens: `SCREEN <name>` | v1 |
| Export screen results | CSV export on every table | v1 |
| Back-test a screen over history | **out of scope** for v1 (needs point-in-time fundamentals) | later |

## 5. News and events

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Read the top market news | `NEWS` (market-wide) | v1 |
| Search news by keyword, company, topic or source and keep a search for later | Filters on `NEWS` (`q:`, `src:`, `topic:`), saved searches | v1 |
| See a live stream of headlines | Streaming headlines in `NEWS`, new ones highlighted briefly | v1 |
| Check what is scheduled: earnings, dividends, economic releases, central bank meetings, by day, week or month | `CALENDAR` with `day week month` views and type filters; watchlist-only switch | v1 |
| Most-read stories, broadcast TV and radio, social posts | **out of scope** | — |

## 6. Economics

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Find an economic indicator and chart its history | `MACRO <series>` (for example `MACRO CPIAUCSL.MAC`); search across series by keyword | v1 |
| Transform a series (change over a year or a month, rebase, log) and compare series | Transforms on `MACRO`: `yoy`, `mom`, `index=100`, `log`; up to four series | v1 |
| See upcoming releases with the previous value | Economic events on `CALENDAR` | v1 |
| A dashboard of the main indicators | `MACRO` with no series: a dashboard of growth, prices, jobs and rates | v1 |

## 7. Monitoring and the book

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Keep lists of instruments with live prices and chosen columns | `WATCH`: multiple named lists, columns to choose, live updates, sort, drag or `Alt+↑/↓` to reorder | v1 |
| Be told when a price crosses a level or moves by a percentage | `ALERTS`: price above/below, percentage move; in-app notifications and a log | v1 |
| News alerts on a company | Keyword alerts on headlines | later |
| Track holdings, cost, profit and loss, allocation | `PORTFOLIO`: positions and trades, unrealised and realised P&L, allocation by asset class and currency | v1 |
| Portfolio risk and attribution | **later** | later |

## 8. Getting data out

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Copy what is on screen into a spreadsheet | Every table: `Ctrl+Shift+C` copies as TSV; `EXPORT` downloads CSV | v1 |
| Pull a current snapshot, a historical series or intraday bars for a list of instruments and fields | The gateway's own HTTP API (`/api/v1/snapshot`, `/history`, `/intraday`) returns JSON or CSV | v1 |
| Look up what a data field means and where it comes from | `FIELDS`: Armin's field dictionary (name, description, unit, type, source, refresh rate) | v1 |
| Ready-made spreadsheet templates | **out of scope** | — |

## 9. Help

| Workflow | Armin feature | Status |
| --- | --- | --- |
| Learn how the system works overall | `HELP`: the command language, the identifier scheme, panes and shortcuts | v1 |
| Get help on the screen in front of you | `F1` or `?` opens help for the focused pane's view | v1 |
| See every command and every shortcut in one place | `HELP COMMANDS`, `HELP KEYS` | v1 |
| Ask a person or a training course | **out of scope** (a personal tool) | — |

## 10. Data access concepts (from the API guide)

The developer guide was read for general concepts, not its interface. Armin's gateway takes these ideas and
designs its own API:

- **Request/response and subscriptions are separate.** One-off reads (search, profile, financials, history) are
  HTTP requests; live prices and headlines are subscriptions over one WebSocket per browser tab, with
  subscribe/unsubscribe messages and a snapshot sent first.
- **A field dictionary.** Every value the app shows has a field id (`last`, `chg_pct`, `mkt_cap`, `pe_ttm`, ...)
  with type, unit and source, so screens, the screener, exports and the dictionary screen share one vocabulary.
- **Reference, historical and intraday reads** are different request kinds with different cache lifetimes.
- **Events, not callbacks per field.** The client receives typed messages (snapshot, update, status, error).
- **Entitlements and throttling** become provider status: each adapter reports whether it is configured, its
  remaining allowance and its last error, shown on a `SOURCES` status view, and the gateway paces requests to
  stay inside each provider's free tier.
