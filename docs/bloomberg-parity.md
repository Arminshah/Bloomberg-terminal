# Bloomberg workflow audit — Armin Terminal 2.9.0

Reviewed 19 October 2026 against the registered commands, screen implementations, source adapters and calculation models. **Armin Terminal is not a 1:1 Bloomberg Terminal replacement.** This inventory covers all 72 commands in version 2.9.0; it is not an inventory of every function in Bloomberg's proprietary product. Matching a mnemonic or opening a screen does not establish functional, visual or dataset parity.

Bloomberg's [current product overview](https://professional.bloomberg.com/products/bloomberg-terminal/), [getting-started guide](https://data.bloomberglp.com/professional/sites/10/Getting-Started-Guide-for-Students-English.pdf) and public product documentation were accessible during the 19 October review. The [terminal fidelity audit](terminal-fidelity-audit.md) records primary references, presentation conventions, wider capability gaps and implementation priorities. No licensed Bloomberg session, reference outputs, complete function specification or pixel-by-pixel comparison was available. The comparisons below concern the named workflows and their known data/convention requirements, not a certified comparison to a particular Bloomberg software version. Browser demo figures are excluded from real-data coverage.

## Parity build (from 31 October 2026)

The owner's plan (`docs/parity-build-plan.md`) works from the private reference pack, cloned into the git-ignored `reference/visual/bloomberg-pack-2026-10-31/`. Frames are cited as in the plan: "TE01 03:11" is `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_03m11s.jpg`. Colours were sampled with Pillow as the median of a flat box; video colours hold to about ±10 per channel. Evidence levels: E3 for a frame looked at, E1 for written pages. Two things stay as the owner fixed them whatever a frame shows: the typeface (`CLAUDE.md`) and the watchlist (`tests/watchlist-guard.test.ts`, `e2e/watchlist-guard.spec.ts`, added before any change).

Text sizes are not changed. Where the frames show a larger size than the app's (the red bar's labels and the two quote lines are about a third larger than table text; the numbers before items are smaller), the app keeps its sizes and the case is listed here for the owner.

### M1.1 Red function bar (E3)

Evidence: TE01 03:11, TE01 01:41, TE04 04:55 (and the pack's 337-frame median). Sampled again for this change: TE01 03:11 bar `#880E1D`, amber security box `#FFA029`.

- Now: the bar is `#870E1F` (was `#A21826`, from 2017 screens). The numbered items sit on the bar's own red in white, with a 2px dark divider `#3F0209` between them (they had their own darker red boxes). The security box keeps the amber fill, its text near-black `#2D0000`. Page count, launch mark and title stay at the right.
- Not changed: the frames draw the bar's labels larger than body text and the "98)" numbers smaller and condensed; the app keeps its text sizes (owner's rule). The app has no red-bar dropdown yet, so the dropdown red `#840C1E` (TE02 04:43) has nothing to apply to; a dropdown built later takes it.
- Checked: `e2e/look.spec.ts` (bar colour, item background and divider).

### M1.2 Command line (E3)

Evidence: TE01 05:09 (typed "OF"), TE04 01:13 (typed "WEI"), TE01 01:53 (empty field), TE05 03:59. Sampled: cursor `#348EFF` on TE01 05:09 (the pack measures `#2E8AF6` over three videos).

- Now: a black field with a thin muted blue outline (`#6D96D4`) over about three quarters of the row, a small blue triangle at its left and a blue block cursor (`#2E8AF6`); typed text stays white IBM Plex Mono capitals. Empty, the line shows only the triangle and cursor: the "<HELP> for explanation." hint and the grey route text are gone (no 2024 frame shows either). What the panel runs stays available to screen readers as the line's description. Messages (errors, "Saved…") moved to a row under the command line, in white; errors keep a dark red ground so they stand out.
- Kept, with no counterpart in the frames: the GO and ? buttons at the right of the row (mouse users), until M1.4 decides where they sit.
- Not shown in any frame: what the hint row says outside a function's own mode, so it stays empty unless there is a message.
- Checked: `e2e/look.spec.ts` (outline, triangle, cursor colour and shape, no placeholder, width share, message row), `desktop-e2e/provider-ipc.spec.ts` (block cursor in Electron), `e2e/terminal.spec.ts` (the route is still named).

### M1.3 Two-line quote strip (E3)

Evidence: TE01 03:11 (AAPL DES), TE01 01:41 (GOOGL, whole window), TE04 04:55 (VOW FA), TE04 04:11 (RV loaded after typing).

- Now: every screen with a security shows the strip in the panel's chrome, above the red bar, as each window does in the frames. Line 1 shares the command line's row: ticker in white, the currency's symbol in grey, an arrow for the last tick (green up, red down), the last price and the day's net change coloured by the change's sign, today's line (the same day chart the watchlist draws, used as it is), then bid/ask. Clicking the row or typing turns it into the command field; running a command brings the quote back. Line 2 takes the hint row: signal bars, a yellow clock, then amber At, Vol, O, H, L, Val and Prev with white values, "d" after the time when the source says it is delayed. The 27 screens that drew their own one-line strip under the red bar no longer do.
- Kept from the app (no counterpart in the frames): the source's name, the pre- and after-market price, the source and receipt times (on hover over At) and the freshness and session badges, at the right of line 2. The signal bars and clock carry the freshness and session on hover.
- Labelled blank: Val (the session's traded value). None of the app's sources supplies it, so it shows "--" with the reason on hover rather than last price times volume.
- Not done, no data: the grey exchange letters after prices and the bid and ask sizes ("4x1"); the quotes carry neither. Not shown: the percentage change, which the frames' line 1 does not carry (the screens still show it, DES's Px/Chg 1D for one).
- Not changed: the frames draw both lines about a third larger than table text; the app keeps the price at its 16px and the rest at 12px.
- Unverified: what the signal bars mean; the small blue block some frames show at the row's left edge.
- Checked: `e2e/look.spec.ts` (labels, order, colours, position above the red bar, typing and back), the whole browser suite.

### M1.4 Toolbar row (E3)

Evidence: TE01 03:11, TE06 04:15 (zoomed), TE01 01:41 (whole window, right end). Sampled: toolbar `#1A1A1A` on TE01 03:11.

- Now: one row on `#1A1A1A` with plain light grey text and thin vertical rules, no boxes: back "<" and forward ">", the loaded security by name with its yellow key and "▾" ("APPLE INC Equity ▾"), the function's mnemonic "▾" ("DES ▾", "GPC ▾" for a candlestick chart), "Related Functions Menu" with a double chevron; at the right an envelope with "Message" (opens the app's MESSAGES), a window button and a yellow "?" with "▾" (function help, F1; M2.2 turns it into the help menu). The security and function are still the native lists, laid invisibly over their labels.
- Moved: back and forward from the command row; the panel's link group (a coloured list, shown by name) and command recall "↶" sit before Message. They have no counterpart in the frames and stay as features.
- Removed: the frame title above the toolbar ("1-ARMIN" with a green mnemonic badge), which the 2024 frames do not have (the tab strip is the title bar). Its maximise button is now the window button (same names for screen readers), and a double-click on the toolbar's empty part maximises and restores as the title did. The command row's "?" went; the toolbar's yellow "?▾" does the same.
- Kept: the panel's number at the left of the command row (blue when the panel is active) and GO at its right end. Neither is in the frames; both are the app's own.
- Unverified: what the window button's "▾" opens in the frames (not shown); here it maximises the panel.
- Checked: `e2e/look.spec.ts` (order of the items, colours, no boxes, maximise by button and by double-click, Message), the whole browser and desktop suites.

### M1.5 Autocomplete (E3)

Evidence: TE01 05:09 (typed "OF"), TE04 01:13 (typed "WEI"), TE02 05:47 and 06:01 (typed "G"). Sampled on TE01 05:09: panel `#1E1E1E`, lit row `#133C68` (the pack measures `#153B67`).

- Now: the list opens under the command row across the whole panel on `#1E1E1E`, with a thin grey line on top. Headings are white capitals (FUNCTIONS, SECURITIES). Function rows: the command in white and the title in amber, the typed letters bold in both; a circular history mark before functions used recently. Security rows: ticker and yellow key in white with the typed letters bold, the name in amber. "More Functions…" and a new "More Securities…" (opens the security finder with the text typed) in grey italics under the titles. The row the arrows light is dark blue `#153B67` and keeps its colours. No category column.
- The first row is lit only when it is what Enter runs anyway (WEI typed, WEI listed first). The frames light the first row whatever was typed; doing that here would make Enter run a suggestion instead of the command typed (with its security and arguments), so Enter keeps running what was typed unless a row was chosen with the arrows.
- Kept from the app: the favourites and recent securities listed before anything is typed, with their prices, and the hint line at the foot ("↑↓ select · Enter run…").
- Not done, no source: natural-language rows ("SEARCH WHO OWNS …") and "(Did You Mean?)" rows; the app's suggestions have neither. The amber italic descriptors after some security names (TE04 01:13) are the provider's own data.
- The watchlist's add-a-security list uses the same building blocks; the new look is limited to the command line, so the watchlist's list is unchanged.
- Checked: `e2e/look.spec.ts` (colours, bold letters, no category column, lit row, More Functions and More Securities), the whole browser suite.

### M1.6 Section strips and the Suggested Functions footer (E3)

Evidence: TE04 01:21 (WEI region strips), TE01 03:11 (DES box headers), TE01 01:53 (NSN footer), TE08 06:12 (FRD footer), the EEG short (`FFM_EEG` 0:15.4), and the OCR of every tutorial and short (`*_OCR_TEXT.txt`, "Suggested Functions"). Sampled: WEI strips `#222222` and `#212121`, header row `#232323`, DES box headers `#1E1E1E`, footer `#1A1A1A`.

- Now: region strips ("1) Americas") and section headers are flat `#222222` (were `#343434` strips and a light grey gradient on headers). The panel gets a footer on the screens a frame shows one on, FRD (FXFORWARD), ALLQ (DEALERQUOTES) and EEG (ESTIMATEGRAPH): "Suggested Functions" in amber in its own cell, then two related functions, each a bold white mnemonic and the app's own name for it in grey `#ACACAE`, the second at the right edge. A click runs it with the panel's security. The suggestions are kept in the function registry (`suggested`).
- Chosen: the footer's suggestions in the frames read like the provider's recommendations and change with the screen; here each is two related functions of the app (FRD: BTMM and OVML; ALLQ: YAS and SRCH; EEG: EEO and GP, as the EEG short shows), described by the app's own names, not the provider's wording.
- Not done: footers on screens the app lacks (NSN, MODL, FXIP, FXFC, FXFM, SDRV, WSL; M5) and on screens where the OCR shows a footer whose suggestions the app cannot run (ANR's BAS). The app had no blue banner to replace.
- Checked: `e2e/look.spec.ts` (strip and header colours, footer label, colours, order, position and click), `tests/suggested-functions.test.ts` (each suggestion exists), the whole browser suite.

## Changes after 2.12.0

Paging with `Page n/m` and typed page counts, numbered monitor rows and headlines that open with GO, HELP on a typed mnemonic, mnemonics in autocomplete, the aliases ERN, CF (typed only), NSE, EQRV, OWN, QR, HVG, PDF, GPO and GPC, and the new `EXCHANGES` (`EXCH`) screen. Details and remaining differences: [terminal-fidelity-v2.13.md](terminal-fidelity-v2.13.md).

| Command | Comparable workflow | Working scope | Remaining gap |
| --- | --- | --- | --- |
| `EXCHANGES` | EXCH exchange information | Partial: five exchanges' regular sessions, status, early closes and next open/close from published rules and tables | No other exchanges, auctions, extended hours or unscheduled closures |

## Findings addressed in this release

- Colored security groups now connect compatible visible panels while retaining their functions and arguments. A linked watchlist publishes selections without disappearing; hidden/incompatible screens are preserved, back/forward propagates security changes, and saved layouts restore group choices through both entry points. The linked research preset supplies five connected panels. This is a local workflow, not Bloomberg Launchpad/BLP integration.
- Headers and command breadcrumbs can show familiar mnemonics (`DES`, `GP`, `FA`, `FLDS`) and `<GO>` cues while retaining canonical names. The preference is saved; either form still executes the same implementation.
- `FIELDS` / `FLDS` searches 29 defined local identity/quote/calculation/source fields, with values, units, definitions, source/freshness, explicit timestamp limits and filtered raw CSV. It is not Bloomberg's complete field catalogue, field contract or data API.
- Portfolio mark metadata is captured with the exact prices/FX used by risk and exports, avoiding newer-source/older-mark mismatches. CNY/CNH proxy conversion is explicit. Invalid/future source timestamps cannot establish real-time freshness.

## Earlier improvements retained

- `OPTIONS` / `OMON` previously showed only an unavailable screen. It now requests actual listed US equity contract snapshots using Alpaca's **indicative** feed, with calls/puts, expiry filters, provider IV/Greeks, separate quote/trade timestamps, partial pagination status and CSV. It does not supply real-time OPRA quotes, open interest, daily option volume, index options or adjusted deliverables.
- `OPTIONCALC` / `OVME` now supports European BSM and American Tian-lattice value/IV, early-exercise premium, manual tenor, grid diagnostics, bump Greeks and CSV. Ten independent QuantLib PDE references validate defined cases; continuous yields do not reproduce discrete cash-dividend conventions.
- `PORTFOLIO` now joins exact prior-date histories for every holding and FX currency, excludes intervals bridging missing sessions, reprices historical current-exposure shocks, computes empirical VaR/ES and additive signed risk contributions, and provides matched benchmark tracking error and per-position price/FX stress. This does not create a transaction ledger or realised track record.
- `CORRELATION` no longer displays a guaranteed diagonal 1 without sufficient variable data; removing the final security is safe and observation counts are corrected.
- `OPTIONSTRATEGY` / `OSA` adds up to twelve signed common-expiry option legs plus stock, premiums, aggregate European-model Greeks, exact piecewise-linear expiry breakevens and risk including unlimited tails, time/spot/volatility scenarios, five labelled examples and CSV.
- `BONDCALC` / `YAS` previously had “Spread” in its title without spread analytics. It now computes a manual matching-compounding benchmark G-spread and solves continuous ACT/365F Z-spread against an entered zero curve, with spread duration, Z01 and spread scenarios. It does not claim option-adjusted spread or obtain issue terms/market curves.

The Alpaca request and field schema was checked against its official SDK: [chain request](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/requests.py#L442), [client endpoint](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/historical/option.py#L203), [feed enum](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/enums.py#L103), [snapshot fields](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/models/snapshots.py#L89). Retrieved Git blob IDs: `87157fadad47f609a278cdb850832b8b2816442f`, `f2c4f0b4c149713bd569d7a1c469d6c6d3391c4e`, `952e287923a5ef728a122323a8877df16f4a5640`, `3f1ef66468aa5f88880956448ba272954cdb9eb1`. Keyed live access was not verified in this environment; the provider may refuse an account or dataset. No keys are bundled.

## Every registered command

“Partial” means a useful subset of a comparable professional workflow, not parity. “Model” means explicit calculations with the conventions in [calculators.md](calculators.md). “Local tool” does not imply equivalence to Bloomberg's service, integration or collaboration features. Data sources and delays are detailed in [feature-matrix.md](feature-matrix.md).

| Command | Comparable workflow | Working scope | Remaining gap |
| --- | --- | --- | --- |
| `PROFILE` | DES security description | Partial: asset-specific profile and fundamentals, float and short interest, source-labelled analyst consensus for US stocks | Global instrument master, identifiers, issue terms and vendor fields are incomplete; no BEst consensus |
| `FINANCIALS` | FA financial analysis | Partial: reported annual/quarterly statements and ratios | No Bloomberg-standardised global history, restatement database or complete line-item mapping |
| `ANALYSTS` | ANR analyst research | Partial: independent FMP sections, Finnhub/Yahoo/Nasdaq research fallbacks, links to the insider, short interest, holder, event and news screens (Equibles retired 28 October 2026), optional on-demand TipRanks consensus/actions | Account/issuer coverage and quota limits; no verified broker-target replacement, broker research documents or complete consensus universe |
| `EARNINGS` | ERN earnings history (EE until 27 October 2026) | Partial: reported EPS/revenue, close-to-close price reaction per report, Finnhub quarterly EPS comparisons and annual estimates | No full quarterly consensus history, estimate contributors or revisions surface |
| `EARNINGSSUMMARY` | EE earnings and estimates (seen on a July 2024 screenshot) | Partial: the page's boxes 1 to 5 and 7 from the other screens' figures | No research box, options-implied move or peer scorecard |
| `DIVIDENDS` | DVD dividend analysis | Partial: ex-date cash history with splits, derived yield and 5-year growth | Missing declaration/record/payment dates and comprehensive forecasts/actions |
| `HOLDERS` | HDS ownership | Partial: institution/fund filing snapshots | No complete ownership intelligence, beneficial ownership history or all asset classes |
| `MANAGEMENT` | MGMT management | Partial: officers, titles, ages and total pay as Yahoo's company profile lists them | No board, tenure, biographies, compensation breakdown or history |
| `PEERS` | RV relative valuation | Partial: multiples and profitability comparison | Local peer selection; no global comparison/template/data-field universe |
| `EVENTS` | EVTS corporate calendar | Partial: earnings/ex-dividend events for one company, the active watchlist, the portfolio's stocks or every stock in the app | No comprehensive corporate actions, conferences or transcript workflow |
| `FILINGS` | Company filing/document search | Partial: SEC submissions and XBRL reported figures | SEC only; no global document library, translations or transcripts |
| `CROSSCHECK` | Multiple-source data validation | Project tool: completed-session EOD price comparisons | Not an exchange reconciliation or Bloomberg data-quality service; keys/entitlements required |
| `FIELDS` | FLDS field search | Local tool: 29 current identity/quote/calculated/provenance fields, definitions, units, source times, status and CSV | No exhaustive Bloomberg field catalogue, identifiers, compatible field contracts, historical field requests or BDP/BDH/BDS/BQL API |
| `WACC` | Cost-of-capital analysis | Model: CAPM/debt weights from named inputs | No proprietary assumptions, capital structure database or full valuation suite |
| `FUNDCHART` | GF historical fundamentals | Partial: reported fundamentals and ratios over time | No arbitrary vendor-field charting, contributor estimates or full fiscal normalisation |
| `CHART` | GP historical chart | Partial: OHLC, studies, comparisons, pan/zoom | Smaller history/universe/study set; no Bloomberg chart templates or tick archive |
| `INTRADAY` | GIP intraday chart | Partial: supplied bars or observed IEX samples | No consolidated tick history; IEX mode has only observations since startup |
| `HISTORY` | HP historical prices | Partial: available daily history/table/export | No full vendor field/date/calendar/corporate-action selection |
| `RETURNS` | COMP comparison | Partial: rebased price returns | No comprehensive total-return/currency/hedging framework |
| `TOTALRETURN` | TRA total return | Partial: paid-dividend reinvestment and benchmarks | Some indices are price-only; no complete corporate-action treatment |
| `SPREAD` | HS relative history | Model: spreads/ratios and distribution statistics | Not a credit spread database or universal relative-value engine |
| `BETA` | BETA regression | Model: 2Y weekly (Friday-ending weeks) raw/adjusted beta, alpha, R² and standard error against the country's index, including BEL 20; daily/monthly and 6M-5Y selectable | Limited data history, benchmark and adjustment coverage; no licensed reference-output comparison |
| `VOLATILITY` | HVT volatility | Model: realised rolling volatility and percentiles | No market implied surface, skew/term structure or volatility cube |
| `HEADLINES` | Official/government announcements (`TOP` opens `MARKETNEWS`) | Partial: official central-bank/statistics/regulator announcements, also 4) Official on `MARKETNEWS` | No Bloomberg News wire or full-text newsroom/archive |
| `NEWS` | N news search | Partial: keyword/topic search of fetched announcements | No global licensed archive, advanced news classification or full-text search |
| `MYNEWS` | MYN personal news pages | Partial: pages of saved searches over the app's feeds and Google News | No licensed wire archive, provider topic codes or alert routing from a page |
| `MARKETNEWS` | TOP top news headlines | Partial: Finnhub/Marketaux/SEC/Euronext headlines and links, merged; `TOP` opens it | Provider coverage/quota limits; no Bloomberg editors' ranking of top stories or real-time news service |
| `COMPANYNEWS` | CN company news | Partial: ticker-tagged external headlines and sentiment; Yahoo headlines; a Euronext-listed company's press releases matched by issuer name | Limited lookback/tagging; Euronext's feed holds only its 10 latest releases; no transcripts or proprietary Bloomberg reporting |
| `MARKET` | WEI global index monitor | Partial: major index prices and currency-adjusted YTD | Coverage/freshness depend on public feeds; no exchange-wide terminal universe |
| `INDEXRANKING` | WEIS index rankings (name only in the 2020 Quick Start) | Partial: `MARKET`'s indices ranked by price return over 1D to 1Y, local or in one currency | Layout not documented; no total-return or index-family universe |
| `WORLDMAP` | WM world markets map (name only) | Partial: one main index per market on the app's own grid, coloured by return | Layout not documented; no geographic map artwork; 24 markets |
| `INDEXFUTURES` | WEIF index futures | Partial: US index futures and model fair value | No global futures/depth/settlement/roll coverage |
| `CONTRIB` | MOV index contribution | Partial: Dow point contribution; local-universe proxies elsewhere | No full licensed constituent/weight/history dataset for other indices |
| `HEATMAP` | IMAP market map | Partial: local-universe sector map | Not complete exchange/index membership; no global drill-down field catalogue |
| `MOVERS` | MOST market movers | Partial: local-universe rankings | Not exhaustive exchange-wide scanning; some volume/value measures are estimates |
| `SCREEN` | EQS equity screening | Partial: the app's stocks, or in the desktop app every US-listed stock in Nasdaq's list; AND and OR groups, a stated choice for missing values, saved screens | No universe beyond US listings; over the US list, ratios only for the app's own stocks; no expression language or point-in-time screening |
| `QUOTE` | BQ quote monitor | Partial: underlying quote, chart, stats, separate IEX box | No guaranteed consolidated real-time price, NBBO, full trade tape or market-wide volume |
| `TRADES` | TAS time and sales | Partial: aggregated source price/volume updates | These are not individual exchange prints; no conditions, venue audit or full tape |
| `DEPTH` | Depth of market | Partial: Kraken crypto book; BBO elsewhere | No stock/futures Level 2/order-by-order feed or execution |
| `VWAP` | VWAP analysis | Model: bar-based VWAP/TWAP and buckets | Not transaction-level exchange VWAP or an execution algorithm |
| `FXMATRIX` | FXC cross-currency monitor | Partial: derived cross rates | Not simultaneous dealer bid/ask crosses or an executable FX marketplace |
| `FXRANK` | WCRS currency ranking | Partial: supplied USD pair returns | No exhaustive currency universe or forward/hedged ranking |
| `CURRENCYRATES` | WCR world currency rates | Partial: every carried currency against a chosen base, by region and in a basket | Mid rates through the dollar; no dealer quotes, forwards or full currency universe |
| `CRYPTO` | Digital asset monitor | Partial: ten Kraken USD pairs and CoinGecko reference fields | One exchange, small universe; no consolidated liquidity, derivatives or custody |
| `FXFORWARD` | FRD forwards | Model: simple-rate CIP outrights/points and spot-settlement PV | No dealer quotes, cross-currency basis, calendars or full valuation-to-spot discounting |
| `FXOPTION` | OVML FX option analysis | Model: European Garman-Kohlhagen and manual scenarios | No observed smile/surface, premium-adjusted delta conventions, exotics or dealer liquidity |
| `BONDS` | WB bond-market monitor | Partial: selected official government par yields | No complete country/credit markets or tradable individual bond prices |
| `CURVE` | GC yield curves | Partial: selected official par-curve history | No full curve builder/bootstrap/instrument/contributor framework |
| `MONEYMARKET` | BTMM money markets | Partial: Fed/NYFed/bills/SOFR futures | No global cash/deposit/CD/CP instrument/dealer universe |
| `BONDCALC` | YAS yield/spread analysis | Model: regular bullet price/yield/risk, five day counts, manual or lagged settlement, G/Z-spread and scenarios | Settlement skips weekends only; no OAS, calls/puts, stubs, defaults, inflation/floating conventions or observed issue/dealer data |
| `RATEPROBS` | WIRP policy expectations | Model: Fed path inferred from futures | Fed only; not all central banks or a probability guarantee |
| `SWAPCALC` | SWPM swap valuation | Model: dual-curve forward-start common-frequency fixed/float | No past fixings, OIS compounding, calendars, leg-specific schedules, collateral/XVA or live dealer curves |
| `CENTRALBANKS` | CENB central-bank monitor | Partial: selected official rates/calendars | Limited countries; some calendar dates maintained manually |
| `RATEANALYSIS` | CBRT central bank rate analysis (name only) | Partial: each bank's moves over about four years, each with its meeting | Implied paths only for the Fed (`RATEPROBS`); eight banks |
| `ECBPORTAL`, `BOEPORTAL`, `BOJPORTAL` | ECB, BOE, BOJ bank portals (listed with FED) | Partial: policy rate and last move from each bank's data, next decision, overnight benchmark, announcements, pages | The BoJ guideline is in its statements, not the API; no balance sheets or speeches search |
| `BONDSEARCH` | SRCH fixed-income search | Unavailable for real bond datasets | Needs a connected issue master, ratings, outstanding amounts and permitted prices; browser model excluded |
| `DEBTPROFILE` | DDIS issuer debt | Unavailable for real issue-level debt | Needs issue/maturity/outstanding datasets; browser model excluded |
| `DEALERQUOTES` | ALLQ bond quote montage | Unavailable for dealer data | Needs licensed/contributed dealer quotes; browser dealers are fictional |
| `COMMODITIES` | GLCO commodity monitor | Partial: selected front futures | No global physical pricing, curves, inventories, shipping or exchange depth |
| `OILMARKET`, `NATURALGAS`, `METALS`, `AGRICULTURE` | OIL, GAS, MINE, AGS sector pages | Partial: the sector's front-month futures and relative measures with their year's range | No inventories (EIA key not set up), physical prices, shipping or seasonality |
| `MACRO` | Macro data dashboard | Partial: FRED levels and selected first-release vintages | Not a full economics database or point-in-time research platform |
| `RELEASES` | ECO economic calendar | Partial: FRED dates/actual/prior and bank decisions | No consensus survey, release-time coverage or global surprise monitoring |
| `ECONSTATS` | ECST world economics | Partial: selected countries/official statistics | Coverage/frequencies/revisions incomplete; Japan CPI not connected |
| `HOLIDAYS` | CDR market calendars | Partial: selected exchanges and early closes | No global settlement/calendar engine; some tables stop at 2027 and unscheduled closures are unknown |
| `OPTIONS` | OMON option monitor | Partial: Alpaca indicative US equity snapshots | No real-time OPRA, index options, open interest/daily volume, exercise/deliverable reference data or surface history |
| `OPTIONCALC` | OVME option valuation | Model: European/American value/IV, exercise premium, Greeks, grid diagnostics, scenarios and CSV | No exotics, discrete cash dividends, fitted market surface, margin/assignment or complete exchange conventions |
| `OPTIONSTRATEGY` | OSA option strategy | Model: common-expiry multi-leg + stock risk/scenarios | No different-expiry calendars, American exercise/assignment, margin, funding or live strategy execution |
| `WATCHLIST` | Launchpad monitors (WATCH) | Local tool: editable lists and source prices | No shared enterprise monitors or arbitrary Bloomberg data columns |
| `WORKSHEET` | W worksheets | Local tool: sheets of securities by chosen market and fundamental fields, each cell's source on hover and in the export | Fundamentals for stocks only, worked out as `PEERS` does; no provider-only fields |
| `PORTFOLIO` | PORT portfolio analytics | Partial: manual holdings/cash, five base currencies, entry-FX metadata, historical-FX replay, exact-date VaR/ES, signed hedge contributions, tracking error, per-line stress and CSV | No institutional position/corporate-action reconciliation, full transaction ledger, factor attribution, multi-asset derivatives or enterprise risk |
| `ALERTS` | ALRT alerts | Local tool: prices, changes and announcement keywords while open | No server-side alerts when closed, mobile push or enterprise notification service |
| `CORRELATION` | CORR correlation | Model: daily-return correlation matrix | No factor model, covariance service, optimisation or full data universe |
| `SEARCH` | SECF security lookup | Partial: local universe and online equity search | No universal instrument/identifier/issue master |
| `RECENT` | LAST history | Local tool: navigation history | Local profile only; no Bloomberg account synchronisation |
| `NOTES` | NOTE annotations | Local tool: saved notes | No team sharing, document linkage or enterprise archive |
| `LAYOUTS` | Launchpad workspace | Local tool: colored security groups, linked monitor selections, compatible panel following, saved groups/routes/splits and windows | No complete Bloomberg component library, account sync, cross-window linking or BLP integration |
| `MESSAGES` | IB messaging | Local rule-based help bot | No human Bloomberg network, authenticated peers, chat delivery, compliance archive or trading-desk connectivity |
| `HELP` | Function help | Local tool: command directory/help | Covers this app only; no Bloomberg help desk or complete Bloomberg function catalogue |
| `MENU` | Security/sector menus | Local tool: numbered related-function menus | Only implemented workflows; unsupported asset classes remain absent |
| `PROVIDERS` | Data/source administration | Project tool: credentials, switches, budgets and diagnostics | Configured does not mean entitled; no Bloomberg entitlement/data-management platform |
| `SETTINGS` | Preferences | Local tool: display, timezone and source preferences | No full terminal keyboard, account/firm policies or remote settings service |

## Continuing the research without a screenshot prerequisite

The implementation session owns source collection. Use accessible official
written instructions, public illustrated guides, PDF pages and publisher images
to check each documented workflow. Keep reference media outside Git. In this
document, record the source, edition, page or image URL, what was actually read
or seen, and the code or test it supports. A source mentioned in the atlas is a
candidate until inspected.

Written evidence can support documented functionality and calculation references;
an inspected PDF or page image can support the visible details it shows. Neither
proves an unobserved interaction, a newer screen layout or complete parity.
Keep those details unverified while continuing TODO items 10 to 13 in their
approved order. Missing video frames are not a general development blocker.

Request one precise owner capture only when a specific visual question blocks
the current task and accessible alternatives have been exhausted. A failed cloud
request does not make a source nonexistent or require the owner to collect every
video. Earlier on 27 October, Codex's environment refused publisher connections
with proxy CONNECT HTTP 403. Later that day the publisher's and universities'
sites answered from the new account's environment (the recheck under the gap
analysis), and the owner's archives of public guides gave the first screenshots
inspected here ("Screenshots from three public guides"). Earlier dated
inspections below are preserved as historical evidence.

## Evidence audit from the reference atlas, 25 October 2026 (to-do item 9)

The owner sent an audited atlas of 69 public references (ChatGPT's second audit, 25 October 2026). It replaces the earlier request for reference PDFs 1 to 33. The sources below were downloaded into a scratch folder outside the repository and read in the 25 October research session; no text or screenshot from them is copied here, only short notes. No video was watched in that session: YouTube refused playback, and the official pages supplied chapter lists only. Evidence levels as in the atlas: E1 a written description, E2 an official chapter list, E3 frames or screenshots inspected, E4 checked in running software or against an independent specification.

| ID | Source | Edition, as checked | What was read | Reachable |
| --- | --- | --- | --- | --- |
| N01 | ECB, framework for the euro foreign exchange reference rates | 23 June 2026, 7 pages, SHA-256 `0fafe6c7f319…` | All 7 pages (text) | Yes |
| D01 | SEC, Form 13F FAQ | page last reviewed 28 September 2026 | Questions 1, 3, 6 to 8, 39 and 41 to 43 | Yes |
| V01 | Babson College, Equity Valuation using Bloomberg | 22 pages, file of 20 March 2023 (screenshots of that time), `d6bf76d090c3…` | All 22 pages (text) | Yes |
| P02 | Bloomberg Global Equity Indices Methodology | October 2026: the rendered cover, the text and the file date (21 October 2026) agree for this copy, `862d098f3846…` | Cover and contents only; an index methodology, not a description of a screen | Yes |
| H07, H08 | Bloomberg's official pages for two tutorials | published 10 and 13 October 2024 | Chapter lists (E2) | Yes |
| H12, H13, H18 to H26, H36 to H39 | University library guides (NYU, Harvard, Penn, Duke, Johns Hopkins, Michigan, Brooklyn, San Diego) | pages updated between January 2025 and October 2026; their screenshots can be older | All text (E1) | Yes |
| H10, H11 | CME's guides to FX futures and options on the terminal | — | Not read | No: HTTP 403 to automated requests |
| V02 | Babson College, WACC Components in Bloomberg | data of 25 March 2022, 10 pages, `e6fd0e870b31…` | Pages 1 to 6 (text) | Yes |
| V03 to V06, N02 to N07 | Older manuals and cheat sheets (2012 to 2023) | downloaded, text extracted | Not yet reviewed | Yes |

Findings, and what was done:

| Area | What the source says | In the app | Status and action |
| --- | --- | --- | --- |
| 13F scope (D01, questions 3 and 6) | A 13F lists what the manager has investment discretion over; a bank's or adviser's includes its clients' accounts | `HOLDINGS` said "what the company itself owns" | Was wrong; fixed (`5ef039b`) |
| ECB reference rates (N01, section 2) | Set about 14:10 CET, published about 16:00 CET, for information only, amendable until the next business day | Code and docs said 14:15 | Was wrong; fixed (`6a8ac50`), and `PORTFOLIO` says the rate a bank or broker applied can differ |
| Split adjustment (H25) | Users should check whether a price history is split-adjusted | `HISTORY` did not say; checked on NVIDIA's 2024 split: Yahoo's prices and volumes are split-adjusted, not dividend-adjusted (E4, against Tiingo's as-traded figures) | Was missing; now said on screen and in the data dictionary (`921cf87`) |
| Beta (V01, page 5) | The profile's beta: two years of weekly returns against the S&P 500; adjusted = 0.67 × raw + 0.33 | `BETA` defaults to exactly that; `WACC` and `RISKPREMIUM` used two years of daily returns | Was inconsistent; fixed (`812edcd`) |
| WACC (V01, page 17) | We/(We+Wd) × Ke + Wd/(We+Wd) × Kd × (1 − t), Ke = Rf + β × ERP | The same formula in `src/functions/WACC.tsx` | Verified in code (E1 and code) |
| Equity risk premium (V01, page 18) | Writes the premium as "βa (Rm − Rf)" | That is one stock's premium; the market's is Rm − Rf. `RISKPREMIUM` takes the market premium and multiplies it by beta | Not copied; the app's formula is the conventional one |
| Cost of equity (V02, Babson's WACC guide of March 2022, pages 2 and 4 to 5) | Prints "Cost of Equity = Risk − Free Rate + (Beta × Market Risk Premium)"; its own section "Risk-Free Rate" then takes the 10-year Treasury yield | The minus is the hyphen of "risk-free" set as a math sign, not a subtraction: the formula is CAPM, Rf + β × premium, as in `WACC` | Verified (text read; the atlas's warning holds) |
| Relative valuation (H39) | Peers with valuation multiples and percentile rankings | `PEERS` shows each multiple with the peers' average and median, no percentile | Partial; percentile rank is buildable from the figures on screen ("Later") |
| Financial statements (V01, page 7) | Segments tab (revenue by product), ratios, export | `FINANCIALS` has statements, ratios, CSV and a Segments page from the latest 10-K's XBRL (business segment, product, geography, customer; segment operating income) | Close for US filers on Form 10-K; none for 20-F filers (IFRS) or for quarters |
| Earnings (V01, pages 12 to 15) | EE leads to ERN, EEG, EM, EEO, ANR | `EARNINGS`, `ESTIMATES` (EEO), `ANALYSTS`; since 26 October also `ESTIMATEGRAPH` (EEG, `cfdd713`) and `EARNINGSTREND` (EM, `313c3e9`) | Present |
| Ownership (V01, page 11) | HDS summary and insider transactions | `HOLDERS`, and insider trades (Form 4) on `MANAGEMENT` | Partial |
| Screening (H18) | Criteria by category, results, output to Excel or PDF | `SCREEN`: criteria picked by category (market, valuation, profitability, risk and return, classification) in AND groups joined by OR, exclusions, CSV (`8caa5d7`) | Partial; no PDF output |
| Options (H19) | Calls left, puts right, grouped by expiry; a contract leads to scenario analysis | `OPTIONS` pairs calls and puts by strike for an expiry | Matches the layout; the link from a contract to `OPTIONSTRATEGY` was not checked |
| Charts and history (H21, H25) | GP's longest range; HP by year | `CHART` has MAX; `HISTORY` takes Y | Present |
| Navigation (H12) | Sector keys, GO, MENU, back, HELP | Present (the function key bar, MENU, back, HELP) | Present |
| Credit ratings (H20, H23, CRPR, CSDR) | Agency ratings | None | Not available: ratings are licensed |

Limitations: the university guides are second-hand descriptions, often of older screens; V01's screenshots are from 2023 and only its text was read; nothing here establishes how the provider's 2026 screens look or behave in detail.

## Evidence pack v3: gap analysis, 26 October 2026 (to-do item 9)

The owner sent Codex's audited evidence pack v3 (14 files). It replaces the earlier video pack. It is kept outside the repository, and nothing from it is copied here except function codes, chapter names and its own evidence levels: E0 a link only, E1 an official description, E2 an official chapter list, E3 a video frame inspected, E4 behaviour seen in running software. Tests of Armin Terminal are evidence about Armin, never about the provider's product.

What the pack holds, checked: 45 sources (6 at E2, 21 at E1, 18 at E0), 39 chapter markers, 38 feature areas, and no video frames or captions. No video was played for this analysis either.

Checked against the publisher's own pages on 26 October:
- The equities tutorial's chapters (WEI 01:05, IMAP 01:50, EQS and WATC 02:32, RV 03:48, FA and DSCO 04:20, EE 06:03, ANR 07:05, BI 07:46) match the pack.
- The Instant Bloomberg, Launchpad and Worksheets tutorial names Launchpad as LLP (03:43) and Worksheets as W (05:07), as the pack says.
- The 2026 pages on AID, CHRT, the AI summary in CN and Earnings Transcript Takeaways exist.
- Not confirmed: that DSCO means document search. The equities page lists "FA and DSCO" under fundamentals and estimates and does not say what DSCO is; Document Search appears on the news tutorial's page without a code. DSCO's meaning stays unknown. BTM did not appear on the insights index as fetched, so it stays E0 here.

Rechecked on 27 October, from the new account, with the publisher's and the universities' sites reachable from this environment again (the earlier 27 October note records a proxy refusal):
- DSCO: the University of San Diego's Bloomberg guide (https://libguides.sandiego.edu/bloomberg/home) lists DSCO as "Document Search" in its table of codes and links slides on finding SEC filings with it. This is a university's summary, not the publisher's (the same table calls EQS "Industry Averages"), so DSCO is taken as document search at E1, and what its screen holds stays unverified. The app's nearest screens are `DOCSEARCH` and `FILINGS`; DSCO now opens `DOCSEARCH`.
- BTM: the publisher's own Pro Tips post of 16 October 2026 exists (found through the site's post search: https://professional.content.cirrus.bloomberg.com/professional2023/insights/markets/bloomberg-pro-tips-monitor-the-options-trades-you-care-about-with-btm/). Its text says BTM shows how a large options trade can affect the market and sets alerts on the size and effect of such trades, without working out the Greeks yourself. E1 now. The video was not played. It still needs trade-by-trade options data (OPRA), so it stays blocked.
- Also found by the same search, for later research: Pro Tips posts on IMAP (11 September 2026: what drives a rally or a fall, in one click), ASKB (12 June and 31 August 2026) and WSL (8 May 2026). Titles and short descriptions only; no video was played.

Status of each area in Armin Terminal. Statuses as the pack defines them; "implemented" means Armin's own behaviour exists and is tested, not that it matches the provider's.

| Area | Pack evidence | Armin today | Status | Gap or next step |
| --- | --- | --- | --- | --- |
| NAV | E2 | Command line (`src/terminal/commands.ts`), linked panels, `HELP`; `tests/commands.test.ts`, `e2e/terminal.spec.ts` | Implemented | W and LLP now open worksheets and layouts (below) |
| WEI | E2 | `MARKET` (`WEI.tsx`), Yahoo index levels | Partial | Price indices only, no total-return variants |
| IMAP | E2, E1 | `INDEXMAP` (`IMAP.tsx`), members from `index-members.ts` | Partial | Weights are estimates (market values, not float-adjusted), as the screen says |
| EQS | E2 | `SCREEN` (`EQS.tsx`, `src/data/screen.ts`) | Partial | Since `8caa5d7`: the app's stocks or Nasdaq's 6,568 US-listed stocks, AND and OR groups, saved screens, and a stated choice for stocks missing a value, counted by field. Over the US list, P/E, yield, ROE, beta and returns exist only for the app's own stocks; Nasdaq's sectors are not GICS; no non-US universe |
| WATC | E2 | `WATCHLIST` (`W.tsx`), typed WATCH | Partial | No analytics across a list. W opens Worksheets since `f26fa11` |
| RV | E2 | `PEERS` (`RV.tsx`); EV in `src/data/fundamentals.ts` | Partial | Since `89ef249` EV adds preferred stock and minority interest from the latest balance sheet, and the build-up shows on hover. Banks are left out and negative EBITDA shows "not meaningful", both correct. No percentile rank |
| FA | E2 | `FINANCIALS` (`FA.tsx`), SEC XBRL | Partial | Segment tables from the latest 10-K only (no quarters, no 20-F filers) |
| DSCO | E2 (code), E1 (a university guide), E3 (the related functions menu, July 2024: company document search) | `DOCSEARCH` (DS, `DS.tsx`), `FILINGS` | Partial | Document search confirmed by the menu screenshot ("Screenshots from three public guides"); DSCO opens `DOCSEARCH`. No picture of its screen, so what it holds is not established |
| EE | E2, E3 (July 2024 screenshots) | `EARNINGSSUMMARY` (EE since `e8b56ff`), `EARNINGS` (ERN), `ESTIMATES`, `ESTIMATEGRAPH`, `EARNINGSTREND` | Implemented | Estimates come only from named providers. No research box, options-implied move or peer scorecard |
| ANR | E2 | `ANALYSTS` (`ANR.tsx`): FMP, Finnhub, Yahoo Finance, Nasdaq, TipRanks | Implemented | Named providers only |
| BI | E2 | None | Blocked | The provider's own research |
| LLP | E2 | `LAYOUTS` (LPAD, and LLP since `3951765`); more windows with Ctrl+Shift+N, each keeping its own layout | Partial | Launchpad's own components are not established from the evidence |
| W | E2 | `WORKSHEET` (`WS.tsx`, `f26fa11`) | Partial | Sheets of securities by the market fields the watchlist offers and 13 fundamentals; other provider fields are not available |
| TOP | E2 | `MARKETNEWS` (TOP) | Implemented | MREP (the morning report) is missing |
| FX | E2 | `FXMATRIX`, `FXRANK`, `FXFORWARD`, `FXOPTION`; ECB rates kept apart | Partial | Mid rates; dealer bid and ask are not available free |
| CHART | E1 | `CHART` (GP) with studies | Implemented | `HISTORY` says its prices are split-adjusted and not dividend-adjusted; `CHART` neither says so nor offers dividend-adjusted prices |
| BOND | E1 | `BONDCALC` (YAS), `BONDS`, `CURVE` | Partial | Yield to each call and to worst from a typed call schedule since item 11 (27 October); issue terms and calls are typed in, and calls carry no option value (no OAS) |
| COMMOD | E2 | `COMMODITIES`, `FUTURESCURVE`, `CONTRACTS` | Partial | No seasonality (chapter 02:30) and no supply, demand or trade-flow data |
| PORT | E1 | `PORTFOLIO` (`PORT.tsx`), its risk tab, its Transactions tab (`PortTransactions.tsx`) | Partial | Transactions with fees and rates of the day, first-in first-out lots, splits, realised P&L, time- and money-weighted returns since item 10 (27 October). No attribution, no factor model, other corporate actions not applied |
| BTST | E1 (the publisher's Pro Tips page: "rank popular trading strategies based on historical return and risk stats for any asset class") | `STRATEGIES` (BTST) since 28 October; `BACKTEST` (EQBT) for stock picking | Partial | Eight common rules with fixed settings on daily closes, price returns only; no optimisation of a rule's settings, no rules of the user's own, no intraday data |
| BTM | E1 (publisher post, 16 October 2026) | None | Blocked | Needs the options trade tape (OPRA) |
| YAS | E1 | `BONDCALC` | Partial | As BOND; the mobile page says nothing of the desktop screen |
| BQUANT | E1 | None | Blocked | A platform |
| CHRT | E1 | None | Missing | Buildable: saved chart templates of the user's own |
| AID | E1 | `PROFILE` comes closest | Missing | Buildable: a snapshot of the company from the app's real figures, each with its source and date |
| CN-AI | E1 | `COMPANYNEWS` | Missing | Buildable with the owner's Anthropic key: a summary of the headlines shown, each sentence tied to its story |
| ETT | E1 | None | Blocked | No transcript source among the app's providers |
| DSX | E1 | `DOCSEARCH`, help desk | Missing | Search with page citations over filings |
| CRAN | E1 | None | Blocked | Credit ratings are licensed |
| CMGR | E1 (the publisher's Pro Tips page: "build and run real-time compliance checks in every step of the buy-side process"; an award write-up: a rules engine and an exception blotter) | `COMPLIANCE` (CMGR) | Partial | The user's own rules on the app's portfolios, checked with every price and before a trade is recorded, with an exception blotter. No order management system to check orders in, no regulatory rule library beyond UCITS 5/10/40, issuers counted as holdings |
| WSL | E1 | None | Missing | Needs worksheets first |
| ASKB | E1 | `MESSAGES` (IB): the built-in assistant, or Claude with the app's data as tools | Partial | Instructions planted in news, filings or profiles are left out of both modes' answers and marked as data for Claude, with tests (item 12, 27 October) |
| ALTD | E1 | None | Blocked | Paid datasets |
| ECON | E0 | `RELEASES`, `ECONCHART`, `ECOFORECASTS`, first releases from FRED's vintages | Partial | No survey consensus (licensed) |
| OPTIONS | E0 | `OPTIONS` (Alpaca, indicative), `OPTIONCALC`, `OPTIONSTRATEGY`; put-call parity tested (`tests/finance.test.ts`, `tests/contracts.test.ts`) | Implemented (models), partial (data) | No OPRA quotes or open interest |
| SPAC | E0 | `CORPACTIONS`, `ACTIONCALENDAR` | Missing | Ticker changes and de-SPAC history |
| HOLDINGS13F | Outside the pack | `HOLDINGS`, `FILINGS13F` | Implemented | |
| CONGRESS | Outside the pack | `CONGRESS` | Partial | Senators' trades are FMP's latest 25, kept since the app first asked, as the screen says |

Five additions with the most use for the least data (approved 26 October):
1. `SCREEN` over Nasdaq's full US stock list, which the app already loads: an explicit choice for missing values, AND and OR groups, saved screens. Done, `8caa5d7`.
2. Worksheets under W: rows of securities, columns of market and fundamental fields, saved; `WATCHLIST` keeps WATCH. Done, `f26fa11`.
3. `PEERS`: preferred stock and minority interest in EV from the filings, with the EV build-up shown. Done, `89ef249`.
4. `PORTFOLIO` transactions: lots with dates, fees and FX, realised P&L, time- and money-weighted returns. Done, item 10 (27 October).
5. `BONDCALC` call schedules: yield to call and to worst. Done, item 11 (27 October).

Five defects to test first:
1. W opens `WATCHLIST`, though W is Worksheets in the official chapter list. Fixed with a test, `f26fa11`.
2. LLP does not open `LAYOUTS`. Fixed with a test, `3951765`.
3. `SCREEN` drops a stock missing any value a criterion needs, without saying so, and does not say it screens 84 stocks. Fixed with tests, `8caa5d7`.
4. `PEERS` leaves preferred stock and minority interest out of EV. Fixed with a test, `89ef249`.
5. The help desk has no test against instructions planted in the news or filings it reads. Fixed with tests, item 12 (27 October).

The pack's release gates (financial correctness, provenance, security) agree with this project's rules and are folded into the tests above as each item is built.

## Screenshots from three public guides, 27 October 2026 (to-do item 9)

The owner sent three archives of public guides on 27 October. They are kept outside the repository; no picture is copied here, only notes on what each one shows. These are the first screenshots this project has inspected (E3). A screenshot shows how one screen looked on the day it was taken, in the language and with the entitlements of that terminal. It does not show the calculations behind a figure, how the screen behaves now, or everything the function does. Labels from the Chinese interface are translated here.

| ID | Source | Taken (how this is known) | Pictures inspected | Left aside |
| --- | --- | --- | --- | --- |
| S1 | "Bloomberg Terminal Guide", a student guide for the UW Investment Group (https://github.com/lukealexluke/bloomberg-guide, archive at commit `af4eb6f`; the site says it was last updated in February 2026) | About 24 to 25 February 2026: the quote line reads "On 24-Feb" and the confirmed report of 02/25/26 is still ahead. English interface | Both: DES, Profile tab, of PSKY US Equity, whole page and the profile part with numbered callouts | None |
| S2 | A Taiwanese university's student manual in Traditional Chinese, written from its 2024 course slides (GitHub archive "Bloomberg-User-Guide" at commit `1bd6fd7`, files dated 22 October 2025) | About 22 July 2024: ANR is "as of 07/22/24", EEG's range is 07/22/2021 to 01/22/2025, EE gives the next report as (E) 10/21/24 and the last as 07/18/24. Chinese interface | 12 files of 2330 TT Equity (TSMC), 8 distinct screens: a new tab with the security autocomplete; the related functions menu (two copies); EE (four crops); EEO; ANR; EEG; the document viewer refusing a broker report. Also the photograph of the keyboard | 5 pictures of the account sign-up form (not opened), and the contact details on the welcome page behind the menu |
| S3 | A BQuant tutorial in two parts, equity and fixed income (GitHub archive "Bloomberg-tutorial" at commit `758a0d9`, files dated 12 October 2024; owner not identified) | Search and runs: 3 April 2023 ("As of 04/03/2023"; the runs were "Last Sent Fri Mar 31 2023"). CAST: after November 2020 (it lists Lakshmi Vilas Bank under DBS). The rest undated | 7 pictures: the fixed income search's criteria (SRCB), its Save As box, a dealer's runs manager, the capital structure tree (CAST), 2 pictures of an app built in a notebook, a toolbar icon. The notebooks' 36 plots, on a contact sheet | The 36 plots are charts the notebooks' code drew, not the interface; the notebook app is not a terminal function |

What the pictures show, against the app. "Seen" is what the picture shows, nothing more.

| Screen | Seen | In the app | Status and action |
| --- | --- | --- | --- |
| DSCO (S2, menu) | The related functions menu lists "8) DSCO, company document search" in the Company Analysis group; "4) DS BRC Document Search: Research" is a separate entry under Company Overview | DSCO opens `DOCSEARCH` (since `01e7211`) | Confirmed for July 2024: DSCO is company document search (E3). No picture of its screen, so what it holds stays unverified |
| Related functions menu (S2) | Opens over the page from "Related Functions Menu" in the second toolbar row. A path at the top (main menu, equity, analysis, the security), "<Cancel>" and a close box. Numbered groups with ">": 1 Company Overview (DES, CN, DS BRC, FA, BICO), 7 Company Analysis (DSCO, ANR, HDS, ESG, SPLC, CACS), 14 Graphs (GP, GF, EEG), 18 Earnings Analysis (MODL, EVT, DS TA, ALTD), 23 Comparison tools (EQRV, KPIC), 26 Equity derivatives (OMON, OPX, BDVD), 30 Trade analytics (TCA, AVAT, VWAP). An "AI" mark on CN, DS BRC, FA, MODL and DS TA, explained at the foot ("Indicates function uses Bloomberg AI technology"), and "MenuId: 6452" | `MENU` for a stock: numbered groups Company Overview, Company Analysis, Research & Estimates, Comparative Analytics, Charting & Reporting, Security Surveillance, Trade Analytics, Derivatives, Credit, Tools | Partial: the app's groups differ from the 2024 menu. Not in the app: BICO, ESG, MODL, DS TA, ALTD, KPIC, OPX, BDVD, TCA, AVAT (the provider's research, licensed data, or not built) |
| EE (S2) | Titled "Earnings & Estimates". A header with the company, consolidated (C), periodicity (quarterly), the consensus source and the currency. Seven boxes, each a link: 1) Earnings History, ERN (next report (E) 10/21/24, last 07/18/24, average and implied one-day move 3.65% and 1.70%); 2) Consensus Overview, EEO (trailing 12-month P/E 26.37, blended forward 12-month P/E 19.96, estimated long-term EPS growth 26.45%); 3) Analyst Coverage, ANR (buy, hold, sell 36/1/0, price 939.00, target 1214.79); 4) Company Financials, MODL, with tabs for the current quarter (Q3/24) and the last (Q2/24): actual, estimate and surprise for adjusted EPS, GAAP EPS, revenue, adjusted net income, operating income and EBITDA, a peer scorecard (above, met, below) and past surprises ("above 8/8"); 5) Earnings Trend, EM (estimate and actual adjusted EPS by quarter, Q2 2023 to Q1 2025, bars); 6) Bloomberg Intelligence, BI (a research note's title and opening); 7) Earnings Estimate Graph, EEG (the price with the quarter's EPS estimate and numbered revision marks) | EE and ERN both opened `EARNINGS`, which is laid out as ERN (the earnings history) | Was wrong; fixed: EE opens `EARNINGSSUMMARY` (`e8b56ff`) |
| EEO (S2) | Toolbar Actions, Output, Settings. Filters: consolidated, periodicity (quarterly), source (standard), currency, broker, a guidance box. "More estimates are available, MODL". Tabs Headline, Headline Growth, Company-Specific. Columns: the last quarter's actual, then that quarter's estimate and the next three quarters', each with its number of estimates and an arrow for the direction of revisions. 21 lines, from adjusted EPS to net asset value. Below, the ratios for the last four quarters' actuals, the next four quarters' estimates and fiscal 2024 to 2026: price to adjusted EPS, P/B, P/CF, EV to sales, to EBITDA, to EBIT and to operating income, and dividend yield. "More periods" arrows; reported figures in orange, estimates in white | `ESTIMATES`: the last fiscal year against the next ones, 8 lines with the number of estimates, and the multiples at today's price | Partial: the 2024 default is quarterly columns. The free sources give quarterly estimates of EPS and revenue only, for two quarters (Yahoo), so the quarterly layout cannot be filled. No revision arrows |
| ANR (S2) | Rating score 4.92 with an arrow; buys 97.3% (36), holds 2.7% (1), sells 0% (0); 12-month target 1214.79 from 33 of 39 firms; last price; currency; return potential 29.4%; return over the last 12 months 70.9%. A chart with 6M, 1Y, 2Y, 5Y and maximum: stacked bars of the shares of buys, holds and sells, the target and the price as lines, and below it the target less the price. A table "38 of 42 sources": firm, analyst, recommendation, target, date, one-year return, BARR, rank and a chart icon | `ANALYSTS`: rating score (5 buy to 1 sell), buys, holds and sells with their shares, average target, last price, return potential, LTM return, a year's chart with the target, and the firms' ratings | Close. Missing: the chart's periods, the target-less-price chart, and the per-analyst return, BARR and rank (the provider's own measures) |
| EEG (S2) | Field "adjusted EPS", consolidated, 1, 3, 5 or 10 years, a date range, source "FRC (TWD)". Grey bars for the actual and navy for the estimate, by quarter, Q3 2021 to Q4 2024. A side panel: type (estimate for a fixed period, rolling estimate, or actual against estimate), consensus source, format (bars), periodicity (quarterly), the series with show, edit and remove, and "add or edit sources" | `ESTIMATEGRAPH`: the consensus for this and next quarter and year now and 7, 30, 60 and 90 days ago (Yahoo) | Partial: "actual against estimate" by quarter is on `EARNINGS` and `EARNINGSTREND`. A fixed-period estimate over years needs each day's past consensus, which no free source gives |
| DES (S1) | The app's layout matches. Details: the name in cyan with "FIGI BBG01VS5NK99" on the right of the same line; below it "6) BI Research Primer, BICO" and "Classification Film & TV"; the description in orange; "Date Aft-mkt (C) 02/25/26"; "Est P/E 12/25"; "Cash 03/16/26 0.05"; "Multi-shares (EV) Y"; "12M Tot Ret" and "Beta vs SPX Index" with no number beside them (both N.A.); "21) Depositary Receipts, Active Receipts 1". Tabs Profile, Issue Info, Ratios, Revenue & EPS, ESG. The title bar: the security in amber, "98) Report" (a PDF of the page, as S1 says) and "Page 1/5 Security Description: Equity" | `PROFILE` with the same boxes and labels; 19) 12M Tot Ret and 20) Beta numbered; 21) Ownership; tab 5 Industry Info; no FIGI; the date written "(C) 02/25/26 Aft-mkt" | Close. Done (`1b0cefc`): the FIGI on the name line for US stocks, from OpenFIGI, and the date in the picture's order. Not available: BICO (the provider's research), ESG scores (licensed), depositary receipts. Unsettled: whether 19) and 20) lose their numbers only when the value is N.A. |
| Security autocomplete (S2) | On a new tab, typing "2330 TT Equity" lists "Securities": the ticker in bold with its yellow key, the name in amber, a clock on a recent one, futures and spreads on the stock, and "More securities…" | Suggestions headed RECENT SECURITIES, SECURITIES and FUNCTIONS; "More Functions…" | Close. No "More securities…" |
| Keyboard (S2) | Red: Cancel, Log Off. Green: Help, Search, Cmnd History, News, Quote Line, Quote Function, Message, IB, Menu, Print, End/Back, Enter/GO, Alt Badges. Yellow: F2 Govt to F12 Port. Blue: the fraction keys and Panel. White: Codes & Favorites | The key bar and the F2 to F12 sector keys | Matches for the sector keys |
| Fixed income search, SRCB (S3) | "Fixed Income Search", with a notice that SRCB is for internal use (SRCH is the published code). Tabs Build/Edit Search, My Searches, Example Searches; "build with criterion" or "by merging saved searches". An as-of date. The universe (asset classes, sources) and its count (3,177,963). Criteria, each joined by "And": field, include or exclude, the criterion, and the matches left after it (436,972, then 5,561, 1,368 and 325), with edit and remove. "325 securities", Results, "Copy BQL Formula". Below, follow-on analysis: results, maturity distribution, FIW, LEAG, debt holders, DDIS, IMGR. Save As asks for a name, an optional description and an optional shortcut | `SCREEN` (stocks) gave the final count only; `BONDSEARCH` lists Treasuries and the app's bonds | Partial. Done for `SCREEN` (`6e1e5bd`): the stocks left after each criterion; the equity screener shows the same column (S4, below) |
| CAST (S3) | The issuer's entities as a tree (DBS Group Holdings, DBS Bank Ltd, its branches and subsidiaries), each with a bar | None | Missing: the entities and their debt are not in the free sources. What the bars measure is not labelled in the crop |
| Runs manager (S3) | A dealer's runs sent to clients: recipients, subject, the last sending, bid and ask sizes, spreads, benchmark and prices | None | Out of scope: a dealer's tool |
| Document viewer (S2) | "You are not authorized to access this document", with the source, analyst, company and "Request Access" | None: the app has no broker research | Nothing to change |

Built from these pictures (27 October):
- `e8b56ff`: EE opens a new `EARNINGSSUMMARY` page laid out as the 2024 picture: report dates and the price's average move (1), the trailing and blended forward P/E and next year's growth (2), the analysts (3), the last quarter against its estimates with past surprises and the next quarter's estimates (4), the EPS trend (5) and the consensus's moves (7). Its figures are the other screens' own; no counterpart for box 6 (the provider's research), the implied move or the peer scorecard. ERN keeps `EARNINGS`, whose Prior Announcement now takes the newest dated report.
- `1b0cefc`: `PROFILE` shows the US listing's FIGI on the name line (OpenFIGI, US stocks), the classification on the line below, and writes the report date as "Aft-mkt (C) 02/25/26".
- `6e1e5bd`: `SCREEN` shows the stocks left after each criterion in its group ("325 left").

Found afterwards, the same evening, to settle the first open question (EQS's match counts):

| ID | Source | Taken (how this is known) | Pictures inspected | Left aside |
| --- | --- | --- | --- | --- |
| S4 | University of Ljubljana, School of Economics and Business, Bloomberg guide, "Equity screening" (https://vodici.cek.ef.uni-lj.si/bbg-eng/comparing-securities/equity-screening, page last updated 14 October 2026) | "As Of 08/03/2023": 3 August or 8 March 2023, depending on that terminal's date setting | 5 of its 18 pictures: the criteria with the S&P 500 added, the index dialog, the EBITDA criterion with its period list, the whole screen with Actions open | The other 13 (results, ranking, saving, export) not yet inspected |
| S5 | The publisher's "Functions for the Market" sheet on EQS, kept by Oxford's Bodleian Libraries (https://www.bodleian.ox.ac.uk/sites/default/files/bodreader/documents/media/bloomberg-equity-screening.pdf) | 25 March 2013 (printed on each page and in the file) | Both pages: the start page (create, example screens, showcase, news) and a results page | Old screens: kept for history only |

Not reached: Hang Seng University of Hong Kong's EQS guide (https://ftl.hsu.edu.hk/wp-content/uploads/2019/10/eqs.pdf), the proxy answered HTTP 502 on 27 October.

| Screen | Seen | In the app | Status and action |
| --- | --- | --- | --- |
| EQS (S4) | Left: "My Recent Screens" and numbered "Popular Screens" (21 to 30). Right: an as-of date; "Screening Criteria" as numbered categories (31 Exchanges, 32 Sectors, 33 Country/Territory of Domicile, 34 Indices, 35 Portfolios/Worksheets, 36 Equity Screens; expanded: 37 to 45, security types and attributes, trading status, multi-listed, state of domicile, debt distribution, company description, product and geographic segments); "Add Criteria": a field, its period (trailing 12 months, latest quarter, half year, year, calendar year, latest filing, a period of your own), a comparison, a value with its unit (M), buttons for growth, info, benchmark and fields, and the criteria's currency. "Selected Screening Criteria" with **Matches**: Security Universe 1,645,973; 51) Trading Status: Active 531,711; 52) Indices: S&P 500 INDEX 503; 53) LF EBITDA [USD] > 1000M 173; 54) Top 20 Sequential Rank, lower is better (current market cap) 20; 55) Add screening criteria; each line with a handle to move it and a remove mark. "1) See Results, WATC". Toolbar: Formula, Actions (change currency, index override, result limit, display, parent or consolidated, scoring models, default universe, criteria options, intraday alert, screening alerts, save, save as, send, share, delete, news screens), Backtest. The index dialog lists each index with Included or Excluded | `SCREEN`: the universe and its count in the subtitle, criteria by category in AND groups joined by OR, the stocks left after each criterion, saved screens, an exclusion list, `BACKTEST` | Close for the count after each criterion (E3 now), the sequential rank ("top N, higher or lower is better", applied to what the criteria above left), a period per criterion (trailing 12 months, latest quarter, latest fiscal year; no half year, calendar year or own period) and moving a criterion (up and down buttons, not a drag handle). Missing: alerts on a screen's members entering or leaving, criteria by index membership (the app has no constituent lists beyond its own), segments |
| EQS (S5, 2013) | Start page: Create Screen, Example Screens with a search, Showcase, News Wire, tabs 91 Build/Edit Screen, 92 My Screens, 93 Example Screens. Results: 95 Output, 96 Actions, the count ("21 securities"), 97 Backtest, an as-of date, Add Column, 98 Fields, ranked columns, Analyze, 94 Stats, grouping | `SCREEN`, `BACKTEST` | History only: the 2023 screen (S4) differs |

Open questions that need a picture or a written source (each names what would settle it):
- EE's "implied one-day move": how it is worked out (the options market's straddle is the usual measure). A help page or a picture of the box's tooltip.
- DES pages 2 to 5 (Issue Info, Ratios, Revenue & EPS, ESG) as they are now: a 2025 or 2026 picture of each.
- Whether DES numbers 19) and 20) only when they have a value: a picture of a stock with a beta and a 12-month return.
- MODL, the model page EE and EEO link to: any picture.
- ANR's BARR and rank columns: what they measure.
- None of these archives shows WEI, IMAP, FA, RV, PORT, YAS or OMON: those comparisons still rest on written sources.

## Workflows with no equivalent implementation

Beyond the commands above, important missing product areas include Bloomberg Excel/Office add-ins, BDP/BDH/BDS/BQL, Bloomberg Anywhere and mobile account services, Bloomberg Intelligence/NEF/broker research and transcripts, Bloomberg's messaging network, execution/order routing and EMSX/TOMS/AIM, trade booking/reconciliation and compliance, enterprise risk/factor/attribution/optimisation, credit/CDS and structured credit, securitisation/MBS/municipal/preferred-specific analytics, comprehensive security identifiers/corporate actions, pricing contributors and evaluated prices, global options/futures curves, and professional data licensing/redistribution services. Adding a command name would not implement these systems.

## What “real time” can mean here

The optional Alpaca stock feed is **IEX only**, one US exchange. It is not consolidated US tape, NBBO, official market-wide last price or volume. The option feed explicitly selects **indicative**. Public Yahoo values retain Yahoo's source labels and can be delayed or unavailable; official rates are published references. No free provider key can be assumed to grant every dataset or exchange entitlement.

## Verification boundary

Unit tests check model mathematics against independent cash flows/payoffs, pagination, refusals, linking history/compatibility and field/snapshot provenance. Browser checks cover each registered command, calculator interactions, linked layout persistence and field CSV. Electron tests exercise the actual preload, IPC validators, broker and UI with deterministic provider responses, including linking and stale/missing field data; they are not live-feed validation. See [release-v2.9.0.md](release-v2.9.0.md) and [release-v2.8.1.md](release-v2.8.1.md) for those releases' build/test records. This documentation review does not independently repeat or upgrade those verification claims.
