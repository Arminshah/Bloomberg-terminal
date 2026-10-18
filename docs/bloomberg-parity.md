# Bloomberg workflow audit — Armin Terminal 2.4.0

Audited 18 October 2026 against the registered commands, screen implementations, source adapters and calculation models. **Armin Terminal is not a 1:1 Bloomberg Terminal replacement.** This inventory covers all 70 commands in this release; it is not an inventory of every function in Bloomberg's proprietary product. Matching a mnemonic or opening a screen does not establish functional, visual or dataset parity.

Bloomberg's product overview is at <https://www.bloomberg.com/professional/products/bloomberg-terminal/>. Its website was blocked by this cloud's network policy during this audit. No licensed Bloomberg session, reference outputs, complete function specification or pixel-by-pixel comparison was available. The comparisons below concern the named workflows and their known data/convention requirements, not a certified comparison to a particular Bloomberg software version. Browser demo figures are excluded from real-data coverage.

## Findings addressed in this release

- `OPTIONS` / `OMON` previously showed only an unavailable screen. It now requests actual listed US equity contract snapshots using Alpaca's **indicative** feed, with calls/puts, expiry filters, provider IV/Greeks, separate quote/trade timestamps, partial pagination status and CSV. It does not supply real-time OPRA quotes, open interest, daily option volume, index options or adjusted deliverables.
- `OPTIONCALC` / `OVME` can now solve European implied volatility from an entered premium, with no-arbitrage validation. This does not turn realised volatility into market implied volatility or value American early exercise.
- `OPTIONSTRATEGY` / `OSA` adds up to twelve signed common-expiry option legs plus stock, premiums, aggregate European-model Greeks, exact piecewise-linear expiry breakevens and risk including unlimited tails, time/spot/volatility scenarios, five labelled examples and CSV.
- `BONDCALC` / `YAS` previously had “Spread” in its title without spread analytics. It now computes a manual matching-compounding benchmark G-spread and solves continuous ACT/365F Z-spread against an entered zero curve, with spread duration, Z01 and spread scenarios. It does not claim option-adjusted spread or obtain issue terms/market curves.

The Alpaca request and field schema was checked against its official SDK: [chain request](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/requests.py#L442), [client endpoint](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/historical/option.py#L203), [feed enum](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/enums.py#L103), [snapshot fields](https://github.com/alpacahq/alpaca-py/blob/master/alpaca/data/models/snapshots.py#L89). Retrieved Git blob IDs: `87157fadad47f609a278cdb850832b8b2816442f`, `f2c4f0b4c149713bd569d7a1c469d6c6d3391c4e`, `952e287923a5ef728a122323a8877df16f4a5640`, `3f1ef66468aa5f88880956448ba272954cdb9eb1`. Keyed live access was not verified in this environment; the provider may refuse an account or dataset. No keys are bundled.

## Every registered command

“Partial” means a useful subset of a comparable professional workflow, not parity. “Model” means explicit calculations with the conventions in [calculators.md](calculators.md). “Local tool” does not imply equivalence to Bloomberg's service, integration or collaboration features. Data sources and delays are detailed in [feature-matrix.md](feature-matrix.md).

| Command | Comparable workflow | Working scope | Remaining gap |
| --- | --- | --- | --- |
| `PROFILE` | DES security description | Partial: asset-specific profile and fundamentals | Global instrument master, identifiers, issue terms and vendor fields are incomplete |
| `FINANCIALS` | FA financial analysis | Partial: reported annual/quarterly statements and ratios | No Bloomberg-standardised global history, restatement database or complete line-item mapping |
| `ANALYSTS` | ANR analyst research | Partial: FMP targets, ratings, actions and annual estimates | Entitlement-dependent coverage; no broker research documents or complete consensus universe |
| `EARNINGS` | EE earnings estimates | Partial: reported EPS/revenue and annual estimates | No quarterly consensus, surprise history, estimate contributors or revisions surface |
| `DIVIDENDS` | DVD dividend analysis | Partial: ex-date cash history and derived yield | Missing declaration/record/payment dates and comprehensive forecasts/actions |
| `HOLDERS` | HDS ownership | Partial: institution/fund filing snapshots | No complete ownership intelligence, beneficial ownership history or all asset classes |
| `PEERS` | RV relative valuation | Partial: multiples and profitability comparison | Local peer selection; no global comparison/template/data-field universe |
| `EVENTS` | EVTS corporate calendar | Partial: earnings/ex-dividend events | No comprehensive corporate actions, conferences or transcript workflow |
| `FILINGS` | Company filing/document search | Partial: SEC submissions and XBRL reported figures | SEC only; no global document library, translations or transcripts |
| `CROSSCHECK` | Multiple-source data validation | Project tool: completed-session EOD price comparisons | Not an exchange reconciliation or Bloomberg data-quality service; keys/entitlements required |
| `WACC` | Cost-of-capital analysis | Model: CAPM/debt weights from named inputs | No proprietary assumptions, capital structure database or full valuation suite |
| `FUNDCHART` | GF historical fundamentals | Partial: reported fundamentals and ratios over time | No arbitrary vendor-field charting, contributor estimates or full fiscal normalisation |
| `CHART` | GP historical chart | Partial: OHLC, studies, comparisons, pan/zoom | Smaller history/universe/study set; no Bloomberg chart templates or tick archive |
| `INTRADAY` | GIP intraday chart | Partial: supplied bars or observed IEX samples | No consolidated tick history; IEX mode has only observations since startup |
| `HISTORY` | HP historical prices | Partial: available daily history/table/export | No full vendor field/date/calendar/corporate-action selection |
| `RETURNS` | COMP comparison | Partial: rebased price returns | No comprehensive total-return/currency/hedging framework |
| `TOTALRETURN` | TRA total return | Partial: paid-dividend reinvestment and benchmarks | Some indices are price-only; no complete corporate-action treatment |
| `SPREAD` | HS relative history | Model: spreads/ratios and distribution statistics | Not a credit spread database or universal relative-value engine |
| `BETA` | BETA regression | Model: daily-return raw/adjusted beta, alpha and R² | Limited benchmark, frequency and data history coverage |
| `VOLATILITY` | HVT volatility | Model: realised rolling volatility and percentiles | No market implied surface, skew/term structure or volatility cube |
| `HEADLINES` | TOP headlines | Partial: official central-bank/statistics/regulator announcements | No Bloomberg News wire or full-text newsroom/archive |
| `NEWS` | N news search | Partial: keyword/topic search of fetched announcements | No global licensed archive, advanced news classification or full-text search |
| `MARKETNEWS` | Market news feed | Partial: Finnhub/Marketaux/SEC headlines and links | Provider coverage/quota limits; no Bloomberg real-time news service |
| `COMPANYNEWS` | CN company news | Partial: ticker-tagged external headlines and sentiment | Limited lookback/tagging; no transcripts or proprietary Bloomberg reporting |
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
| `BONDCALC` | YAS yield/spread analysis | Model: regular bullet price/yield/risk, G/Z-spread and scenarios | No OAS, calls/puts, stubs, defaults, inflation/floating conventions or observed issue/dealer data |
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
| `OPTIONCALC` | OVME option valuation | Model: European value/IV, Greeks, P&L and scenarios | No American exercise, exotics, discrete dividends, fitted market surface or exchange convention engine |
| `OPTIONSTRATEGY` | OSA option strategy | Model: common-expiry multi-leg + stock risk/scenarios | No different-expiry calendars, American exercise/assignment, margin, funding or live strategy execution |
| `WATCHLIST` | W/Launchpad monitors | Local tool: editable lists and source prices | No shared enterprise monitors or arbitrary Bloomberg data columns |
| `PORTFOLIO` | PORT portfolio analytics | Partial: manually entered positions/cash, P&L and statistical risk | No institutional position/corporate-action reconciliation, full transaction ledger, factor attribution, multi-asset derivatives or enterprise risk |
| `ALERTS` | ALRT alerts | Local tool: prices, changes and announcement keywords while open | No server-side alerts when closed, mobile push or enterprise notification service |
| `CORRELATION` | CORR correlation | Model: daily-return correlation matrix | No factor model, covariance service, optimisation or full data universe |
| `SEARCH` | SECF security lookup | Partial: local universe and online equity search | No universal instrument/identifier/issue master |
| `RECENT` | LAST history | Local tool: navigation history | Local profile only; no Bloomberg account synchronisation |
| `NOTES` | NOTE annotations | Local tool: saved notes | No team sharing, document linkage or enterprise archive |
| `LAYOUTS` | Launchpad workspace | Local tool: panels, saved layouts and windows | No complete Bloomberg component library, account sync or BLP integration |
| `MESSAGES` | IB messaging | Local rule-based help bot | No human Bloomberg network, authenticated peers, chat delivery, compliance archive or trading-desk connectivity |
| `HELP` | Function help | Local tool: command directory/help | Covers this app only; no Bloomberg help desk or complete Bloomberg function catalogue |
| `MENU` | Security/sector menus | Local tool: numbered related-function menus | Only implemented workflows; unsupported asset classes remain absent |
| `PROVIDERS` | Data/source administration | Project tool: credentials, switches, budgets and diagnostics | Configured does not mean entitled; no Bloomberg entitlement/data-management platform |
| `SETTINGS` | Preferences | Local tool: display, timezone and source preferences | No full terminal keyboard, account/firm policies or remote settings service |

## Workflows with no equivalent implementation

Beyond the commands above, important missing product areas include Bloomberg Excel/Office add-ins, BDP/BDH/BDS/BQL, Bloomberg Anywhere and mobile account services, Bloomberg Intelligence/NEF/broker research and transcripts, Bloomberg's messaging network, execution/order routing and EMSX/TOMS/AIM, trade booking/reconciliation and compliance, enterprise risk/factor/attribution/optimisation, credit/CDS and structured credit, securitisation/MBS/municipal/preferred-specific analytics, comprehensive security identifiers/corporate actions, pricing contributors and evaluated prices, global options/futures curves, and professional data licensing/redistribution services. Adding a command name would not implement these systems.

## What “real time” can mean here

The optional Alpaca stock feed is **IEX only**, one US exchange. It is not consolidated US tape, NBBO, official market-wide last price or volume. The option feed explicitly selects **indicative**. Public Yahoo values retain Yahoo's source labels and can be delayed or unavailable; official rates are published references. No free provider key can be assumed to grant every dataset or exchange entitlement.

## Verification boundary

Unit tests check model mathematics against independent cash flows/payoffs, pagination and refusals. Browser checks cover each registered command and calculator interactions. Electron tests exercise the actual preload, IPC validators, broker and UI with deterministic provider responses; they are not live-feed validation. See [release-v2.4.0.md](release-v2.4.0.md) for the completed build/test record and remaining environment restrictions.
