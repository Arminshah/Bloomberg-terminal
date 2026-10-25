# Bloomberg workflow audit — Armin Terminal 2.9.0

Reviewed 19 October 2026 against the registered commands, screen implementations, source adapters and calculation models. **Armin Terminal is not a 1:1 Bloomberg Terminal replacement.** This inventory covers all 72 commands in version 2.9.0; it is not an inventory of every function in Bloomberg's proprietary product. Matching a mnemonic or opening a screen does not establish functional, visual or dataset parity.

Bloomberg's [current product overview](https://professional.bloomberg.com/products/bloomberg-terminal/), [getting-started guide](https://data.bloomberglp.com/professional/sites/10/Getting-Started-Guide-for-Students-English.pdf) and public product documentation were accessible during the 19 October review. The [terminal fidelity audit](terminal-fidelity-audit.md) records primary references, presentation conventions, wider capability gaps and implementation priorities. No licensed Bloomberg session, reference outputs, complete function specification or pixel-by-pixel comparison was available. The comparisons below concern the named workflows and their known data/convention requirements, not a certified comparison to a particular Bloomberg software version. Browser demo figures are excluded from real-data coverage.

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
| `ANALYSTS` | ANR analyst research | Partial: independent FMP sections, Finnhub/Yahoo research fallbacks, eight Equibles datasets with automatic estimate fallback, optional on-demand TipRanks consensus/actions | Account/issuer coverage and quota limits; no verified broker-target replacement, broker research documents or complete consensus universe |
| `EARNINGS` | EE earnings estimates | Partial: reported EPS/revenue, close-to-close price reaction per report, Finnhub quarterly EPS comparisons and annual estimates | No full quarterly consensus history, estimate contributors or revisions surface |
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
| `MARKETNEWS` | TOP top news headlines | Partial: Finnhub/Marketaux/SEC/Euronext headlines and links, merged; `TOP` opens it | Provider coverage/quota limits; no Bloomberg editors' ranking of top stories or real-time news service |
| `COMPANYNEWS` | CN company news | Partial: ticker-tagged external headlines and sentiment; Yahoo headlines; a Euronext-listed company's press releases matched by issuer name | Limited lookback/tagging; Euronext's feed holds only its 10 latest releases; no transcripts or proprietary Bloomberg reporting |
| `MARKET` | WEI global index monitor | Partial: major index prices and currency-adjusted YTD | Coverage/freshness depend on public feeds; no exchange-wide terminal universe |
| `INDEXFUTURES` | WEIF index futures | Partial: US index futures and model fair value | No global futures/depth/settlement/roll coverage |
| `CONTRIB` | MOV index contribution | Partial: Dow point contribution; local-universe proxies elsewhere | No full licensed constituent/weight/history dataset for other indices |
| `HEATMAP` | IMAP market map | Partial: local-universe sector map | Not complete exchange/index membership; no global drill-down field catalogue |
| `MOVERS` | MOST market movers | Partial: local-universe rankings | Not exhaustive exchange-wide scanning; some volume/value measures are estimates |
| `SCREEN` | EQS equity screening | Partial: local built-in/looked-up stocks and loaded fundamentals | No exhaustive global security database, saved expression language or historical point-in-time screening |
| `QUOTE` | BQ quote monitor | Partial: underlying quote, chart, stats, separate IEX box | No guaranteed consolidated real-time price, NBBO, full trade tape or market-wide volume |
| `TRADES` | TAS time and sales | Partial: aggregated source price/volume updates | These are not individual exchange prints; no conditions, venue audit or full tape |
| `DEPTH` | Depth of market | Partial: Kraken crypto book; BBO elsewhere | No stock/futures Level 2/order-by-order feed or execution |
| `VWAP` | VWAP analysis | Model: bar-based VWAP/TWAP and buckets | Not transaction-level exchange VWAP or an execution algorithm |
| `FXMATRIX` | FXC cross-currency monitor | Partial: derived cross rates | Not simultaneous dealer bid/ask crosses or an executable FX marketplace |
| `FXRANK` | WCRS currency ranking | Partial: supplied USD pair returns | No exhaustive currency universe or forward/hedged ranking |
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
| `BONDSEARCH` | SRCH fixed-income search | Unavailable for real bond datasets | Needs a connected issue master, ratings, outstanding amounts and permitted prices; browser model excluded |
| `DEBTPROFILE` | DDIS issuer debt | Unavailable for real issue-level debt | Needs issue/maturity/outstanding datasets; browser model excluded |
| `DEALERQUOTES` | ALLQ bond quote montage | Unavailable for dealer data | Needs licensed/contributed dealer quotes; browser dealers are fictional |
| `COMMODITIES` | GLCO commodity monitor | Partial: selected front futures | No global physical pricing, curves, inventories, shipping or exchange depth |
| `MACRO` | Macro data dashboard | Partial: FRED levels and selected first-release vintages | Not a full economics database or point-in-time research platform |
| `RELEASES` | ECO economic calendar | Partial: FRED dates/actual/prior and bank decisions | No consensus survey, release-time coverage or global surprise monitoring |
| `ECONSTATS` | ECST world economics | Partial: selected countries/official statistics | Coverage/frequencies/revisions incomplete; Japan CPI not connected |
| `HOLIDAYS` | CDR market calendars | Partial: selected exchanges and early closes | No global settlement/calendar engine; some tables stop at 2027 and unscheduled closures are unknown |
| `OPTIONS` | OMON option monitor | Partial: Alpaca indicative US equity snapshots | No real-time OPRA, index options, open interest/daily volume, exercise/deliverable reference data or surface history |
| `OPTIONCALC` | OVME option valuation | Model: European/American value/IV, exercise premium, Greeks, grid diagnostics, scenarios and CSV | No exotics, discrete cash dividends, fitted market surface, margin/assignment or complete exchange conventions |
| `OPTIONSTRATEGY` | OSA option strategy | Model: common-expiry multi-leg + stock risk/scenarios | No different-expiry calendars, American exercise/assignment, margin, funding or live strategy execution |
| `WATCHLIST` | W/Launchpad monitors | Local tool: editable lists and source prices | No shared enterprise monitors or arbitrary Bloomberg data columns |
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

## Evidence audit from the reference atlas, 25 October 2026 (to-do item 9)

The owner sent an audited atlas of 69 public references (ChatGPT's second audit, 25 October 2026). It replaces the earlier request for reference PDFs 1 to 33. The sources below were downloaded into a scratch folder outside the repository and read in this session; no text or screenshot from them is copied here, only short notes. No video was watched: YouTube refuses this cloud session, and the official pages give chapter lists only. Evidence levels as in the atlas: E1 a written description, E2 an official chapter list, E3 frames or screenshots inspected, E4 checked in running software or against an independent specification.

| ID | Source | Edition, as checked | What was read | Reachable |
| --- | --- | --- | --- | --- |
| N01 | ECB, framework for the euro foreign exchange reference rates | 23 June 2026, 7 pages, SHA-256 `0fafe6c7f319…` | All 7 pages (text) | Yes |
| D01 | SEC, Form 13F FAQ | page last reviewed 28 September 2026 | Questions 1, 3, 6 to 8, 39 and 41 to 43 | Yes |
| V01 | Babson College, Equity Valuation using Bloomberg | 22 pages, file of 20 March 2023 (screenshots of that time), `d6bf76d090c3…` | All 22 pages (text) | Yes |
| P02 | Bloomberg Global Equity Indices Methodology | October 2026: the rendered cover, the text and the file date (21 October 2026) agree for this copy, `862d098f3846…` | Cover and contents only; an index methodology, not a description of a screen | Yes |
| H07, H08 | Bloomberg's official pages for two tutorials | published 10 and 13 October 2024 | Chapter lists (E2) | Yes |
| H12, H13, H18 to H26, H36 to H39 | University library guides (NYU, Harvard, Penn, Duke, Johns Hopkins, Michigan, Brooklyn, San Diego) | pages updated between January 2025 and October 2026; their screenshots can be older | All text (E1) | Yes |
| H10, H11 | CME's guides to FX futures and options on the terminal | — | Not read | No: HTTP 403 to automated requests |
| V02 to V06, N02 to N07 | Older manuals and cheat sheets (2012 to 2022) | downloaded, text extracted | Not yet reviewed | Yes |

Findings, and what was done:

| Area | What the source says | In the app | Status and action |
| --- | --- | --- | --- |
| 13F scope (D01, questions 3 and 6) | A 13F lists what the manager has investment discretion over; a bank's or adviser's includes its clients' accounts | `HOLDINGS` said "what the company itself owns" | Was wrong; fixed (`5ef039b`) |
| ECB reference rates (N01, section 2) | Set about 14:10 CET, published about 16:00 CET, for information only, amendable until the next business day | Code and docs said 14:15 | Was wrong; fixed (`6a8ac50`), and `PORTFOLIO` says the rate a bank or broker applied can differ |
| Split adjustment (H25) | Users should check whether a price history is split-adjusted | `HISTORY` did not say; checked on NVIDIA's 2024 split: Yahoo's prices and volumes are split-adjusted, not dividend-adjusted (E4, against Tiingo's as-traded figures) | Was missing; now said on screen and in the data dictionary (`921cf87`) |
| Beta (V01, page 5) | The profile's beta: two years of weekly returns against the S&P 500; adjusted = 0.67 × raw + 0.33 | `BETA` defaults to exactly that; `WACC` and `RISKPREMIUM` used two years of daily returns | Was inconsistent; fixed (`812edcd`) |
| WACC (V01, page 17) | We/(We+Wd) × Ke + Wd/(We+Wd) × Kd × (1 − t), Ke = Rf + β × ERP | The same formula in `src/functions/WACC.tsx` | Verified in code (E1 and code) |
| Equity risk premium (V01, page 18) | Writes the premium as "βa (Rm − Rf)" | That is one stock's premium; the market's is Rm − Rf. `RISKPREMIUM` takes the market premium and multiplies it by beta | Not copied; the app's formula is the conventional one. Babson's WACC guide (V02), whose CAPM notation the atlas flags, is not yet reviewed |
| Relative valuation (H39) | Peers with valuation multiples and percentile rankings | `PEERS` shows each multiple with the peers' average and median, no percentile | Partial; percentile rank is buildable from the figures on screen ("Later") |
| Financial statements (V01, page 7) | Segments tab (revenue by product), ratios, export | `FINANCIALS` has statements, ratios and CSV; no segments | Partial; segments need the filings' XBRL dimensions ("Later") |
| Earnings (V01, pages 12 to 15) | EE leads to ERN, EEG, EM, EEO, ANR | `EARNINGS`, `ESTIMATES` (EEO), `ANALYSTS` exist; EEG and EM do not | Partial; EEG and EM were already in "Later" |
| Ownership (V01, page 11) | HDS summary and insider transactions | `HOLDERS`, and insider trades (Form 4) on `MANAGEMENT` | Partial |
| Screening (H18) | Criteria by category, results, output to Excel or PDF | `SCREEN`: a fixed set (region, sector, market value, P/E, dividend yield, YTD, beta, ROE, exclusions), CSV | Partial; no category browser or AND/OR groups |
| Options (H19) | Calls left, puts right, grouped by expiry; a contract leads to scenario analysis | `OPTIONS` pairs calls and puts by strike for an expiry | Matches the layout; the link from a contract to `OPTIONSTRATEGY` was not checked |
| Charts and history (H21, H25) | GP's longest range; HP by year | `CHART` has MAX; `HISTORY` takes Y | Present |
| Navigation (H12) | Sector keys, GO, MENU, back, HELP | Present (the function key bar, MENU, back, HELP) | Present |
| Credit ratings (H20, H23, CRPR, CSDR) | Agency ratings | None | Not available: ratings are licensed |

Limitations: the university guides are second-hand descriptions, often of older screens; V01's screenshots are from 2023 and only its text was read; nothing here establishes how the provider's 2026 screens look or behave in detail.

## Workflows with no equivalent implementation

Beyond the commands above, important missing product areas include Bloomberg Excel/Office add-ins, BDP/BDH/BDS/BQL, Bloomberg Anywhere and mobile account services, Bloomberg Intelligence/NEF/broker research and transcripts, Bloomberg's messaging network, execution/order routing and EMSX/TOMS/AIM, trade booking/reconciliation and compliance, enterprise risk/factor/attribution/optimisation, credit/CDS and structured credit, securitisation/MBS/municipal/preferred-specific analytics, comprehensive security identifiers/corporate actions, pricing contributors and evaluated prices, global options/futures curves, and professional data licensing/redistribution services. Adding a command name would not implement these systems.

## What “real time” can mean here

The optional Alpaca stock feed is **IEX only**, one US exchange. It is not consolidated US tape, NBBO, official market-wide last price or volume. The option feed explicitly selects **indicative**. Public Yahoo values retain Yahoo's source labels and can be delayed or unavailable; official rates are published references. No free provider key can be assumed to grant every dataset or exchange entitlement.

## Verification boundary

Unit tests check model mathematics against independent cash flows/payoffs, pagination, refusals, linking history/compatibility and field/snapshot provenance. Browser checks cover each registered command, calculator interactions, linked layout persistence and field CSV. Electron tests exercise the actual preload, IPC validators, broker and UI with deterministic provider responses, including linking and stale/missing field data; they are not live-feed validation. See [release-v2.9.0.md](release-v2.9.0.md) and [release-v2.8.1.md](release-v2.8.1.md) for those releases' build/test records. This documentation review does not independently repeat or upgrade those verification claims.
