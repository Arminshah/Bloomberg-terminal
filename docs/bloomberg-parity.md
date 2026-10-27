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
| `SCREEN` | EQS equity screening | Partial: the app's stocks, or in the desktop app every US-listed stock in Nasdaq's list; AND and OR groups, a stated choice for missing values, saved screens | No universe beyond US listings; over the US list, ratios only for the app's own stocks; no expression language or point-in-time screening |
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
video. On 27 October, this environment refused publisher connections with proxy
CONNECT HTTP 403, before any PDF or image could be read. Required publisher
domains were saved in a configuration draft; access and fresh source inspection
remain pending. Earlier dated inspections below are preserved as historical
evidence, not claimed as repeated in this session.

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
| Financial statements (V01, page 7) | Segments tab (revenue by product), ratios, export | `FINANCIALS` has statements, ratios and CSV; no segments | Partial; segments need the filings' XBRL dimensions ("Later") |
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
- DSCO: the University of San Diego's Bloomberg guide (https://libguides.sandiego.edu/bloomberg/home) lists DSCO as "Document Search" in its table of codes and links slides on finding SEC filings with it. This is a university's summary, not the publisher's (the same table calls EQS "Industry Averages"), so DSCO is taken as document search at E1, and what its screen holds stays unverified. The app's nearest screens are `DOCSEARCH` and `FILINGS`; DSCO does not open either yet.
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
| FA | E2 | `FINANCIALS` (`FA.tsx`), SEC XBRL | Partial | No segment tables |
| DSCO | E2 (code), E1 (a university guide names it Document Search) | `DOCSEARCH` (DS, `DS.tsx`), `FILINGS` | Unverified | Taken as document search (27 October recheck above); its screen is not established, and DSCO opens nothing in the app |
| EE | E2 | `EARNINGS`, `ESTIMATES`, `ESTIMATEGRAPH`, `EARNINGSTREND` | Implemented | Estimates come only from named providers |
| ANR | E2 | `ANALYSTS` (`ANR.tsx`): FMP, Finnhub, TipRanks, Equibles | Implemented | Named providers only |
| BI | E2 | None | Blocked | The provider's own research |
| LLP | E2 | `LAYOUTS` (LPAD, and LLP since `3951765`); more windows with Ctrl+Shift+N, each keeping its own layout | Partial | Launchpad's own components are not established from the evidence |
| W | E2 | `WORKSHEET` (`WS.tsx`, `f26fa11`) | Partial | Sheets of securities by the market fields the watchlist offers and 13 fundamentals; other provider fields are not available |
| TOP | E2 | `MARKETNEWS` (TOP) | Implemented | MREP (the morning report) is missing |
| FX | E2 | `FXMATRIX`, `FXRANK`, `FXFORWARD`, `FXOPTION`; ECB rates kept apart | Partial | Mid rates; dealer bid and ask are not available free |
| CHART | E1 | `CHART` (GP) with studies | Implemented | `HISTORY` says its prices are split-adjusted and not dividend-adjusted; `CHART` neither says so nor offers dividend-adjusted prices |
| BOND | E1 | `BONDCALC` (YAS), `BONDS`, `CURVE` | Partial | Yield to each call and to worst from a typed call schedule since item 11 (27 October); issue terms and calls are typed in, and calls carry no option value (no OAS) |
| COMMOD | E2 | `COMMODITIES`, `FUTURESCURVE`, `CONTRACTS` | Partial | No seasonality (chapter 02:30) and no supply, demand or trade-flow data |
| PORT | E1 | `PORTFOLIO` (`PORT.tsx`), its risk tab, its Transactions tab (`PortTransactions.tsx`) | Partial | Transactions with fees and rates of the day, first-in first-out lots, splits, realised P&L, time- and money-weighted returns since item 10 (27 October). No attribution, no factor model, other corporate actions not applied |
| BTST | E1 | `BACKTEST` (EQBT) | Partial | Today's members (warned on screen), price returns, no delisted names, monthly steps |
| BTM | E1 (publisher post, 16 October 2026) | None | Blocked | Needs the options trade tape (OPRA) |
| YAS | E1 | `BONDCALC` | Partial | As BOND; the mobile page says nothing of the desktop screen |
| BQUANT | E1 | None | Blocked | A platform |
| CHRT | E1 | None | Missing | Buildable: saved chart templates of the user's own |
| AID | E1 | `PROFILE` comes closest | Missing | Buildable: a snapshot of the company from the app's real figures, each with its source and date |
| CN-AI | E1 | `COMPANYNEWS` | Missing | Buildable with the owner's Anthropic key: a summary of the headlines shown, each sentence tied to its story |
| ETT | E1 | None | Blocked | No transcript source among the app's providers |
| DSX | E1 | `DOCSEARCH`, help desk | Missing | Search with page citations over filings |
| CRAN | E1 | None | Blocked | Credit ratings are licensed |
| CMGR | E1 | None | Missing | Buildable: the user's own limits checked on `PORTFOLIO` (already in "Later") |
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

## Workflows with no equivalent implementation

Beyond the commands above, important missing product areas include Bloomberg Excel/Office add-ins, BDP/BDH/BDS/BQL, Bloomberg Anywhere and mobile account services, Bloomberg Intelligence/NEF/broker research and transcripts, Bloomberg's messaging network, execution/order routing and EMSX/TOMS/AIM, trade booking/reconciliation and compliance, enterprise risk/factor/attribution/optimisation, credit/CDS and structured credit, securitisation/MBS/municipal/preferred-specific analytics, comprehensive security identifiers/corporate actions, pricing contributors and evaluated prices, global options/futures curves, and professional data licensing/redistribution services. Adding a command name would not implement these systems.

## What “real time” can mean here

The optional Alpaca stock feed is **IEX only**, one US exchange. It is not consolidated US tape, NBBO, official market-wide last price or volume. The option feed explicitly selects **indicative**. Public Yahoo values retain Yahoo's source labels and can be delayed or unavailable; official rates are published references. No free provider key can be assumed to grant every dataset or exchange entitlement.

## Verification boundary

Unit tests check model mathematics against independent cash flows/payoffs, pagination, refusals, linking history/compatibility and field/snapshot provenance. Browser checks cover each registered command, calculator interactions, linked layout persistence and field CSV. Electron tests exercise the actual preload, IPC validators, broker and UI with deterministic provider responses, including linking and stale/missing field data; they are not live-feed validation. See [release-v2.9.0.md](release-v2.9.0.md) and [release-v2.8.1.md](release-v2.8.1.md) for those releases' build/test records. This documentation review does not independently repeat or upgrade those verification claims.
