# Data audit, 28 October 2026

Status: **first pass done; continuing** (quotes, statements, dividends, analysts, earnings dates, management, market screens, currencies and the supply chains of about forty companies). Started after the owner found Applied Digital's supply chain missing Oracle and asked for a full audit of every figure. Since 28 October the comparisons also run as one repeatable check, `npm run audit:check` (`docs/audit-check.md`).

## How it was checked

The desktop app ran on live data in the sandbox (`scripts/live/capture.cjs`), screen by screen, and each figure was set against a second source that the app does not use for it:

| What | Reference |
| --- | --- |
| Last, open, high, low, previous close, volume | Nasdaq's quote and historical prices, Massive (formerly Polygon) daily bars, Tiingo daily prices |
| 52-week range, market cap, dividend yield, P/E | Nasdaq's summary page |
| Average volume, realised volatility, YTD, 12-month total return | Worked out from Tiingo's consolidated volumes, closes and dividend-adjusted closes |
| Short interest | FINRA's settlements (Nasdaq's page) |
| Statements: revenue, gross profit, net income, diluted EPS, operating cash flow, capital expenditure | The companies' own XBRL filings (SEC companyfacts), annual and last twelve months |
| Ratings and price targets | Finnhub, Nasdaq and FMP against each other |
| Earnings, surprises | Finnhub, Nasdaq (Zacks basis), the companies' 10-Q and press releases |
| Officers | The officers' own Form 4 filings |
| Dividends | Nasdaq's dividend history (dates; amounts are split-adjusted in the app by design) |
| Fed funds, SOFR, bills, curve spreads | New York Fed reference rates, US Treasury par yield curve |
| Equity indices | FRED (S&P 500, Dow, Nasdaq Composite, Nasdaq-100) |
| Currencies | ECB reference rates, Twelve Data |
| Policy rates | Bank of Canada Valet, ECB data portal, RBA statistical tables |
| GDP, CPI | FRED (BEA, BLS series) |
| Economic calendar | The weekday each release is known to fall on (jobless claims on Thursdays, the Fed's decision on 28 October) |

Six stocks were checked screen by screen (Apple, NVIDIA, Applied Digital, JPMorgan, Coca-Cola, CoreWeave), thirty more for revenue and EPS against their filings.

## Findings and fixes

Follow-up remediation for 2.29.0 is documented in `docs/accuracy-v2.29.md`. It addresses policy HOLD omission, retained-data freshness, EPS definitions and vintages, supply-chain entities/concentrations/lifecycle, partial extraction and required audit coverage. These are source-code and deterministic-regression findings; implementation did not independently recheck live policy or issuer facts while network access was blocked. D1–D42 below remain dated records of the earlier audit.

Severity: S1 a wrong figure shown as fact; S2 a misleading figure or label; S3 a small difference or presentation.

| ID | Sev | Screen | Finding | Second source | Fix |
| --- | --- | --- | --- | --- | --- |
| D1 | S1 | SPLC | Applied Digital: Oracle missing (its 8-K of 4 March 2026: Polaris Forge 2 "currently leased to Oracle"); the second hyperscaler's leases mixed with Oracle's; conditions of a deal read as deals | 8-K, 10-K of 29 July 2026 | `5ea2a2d` |
| D2 | S1 | All quotes, HP, watchlist | After the close, the session's volume was Yahoo's snapshot, 0.3% to 2.8% short: Apple 39.05M against 39.98M, JPMorgan 4.58M against 4.71M | Nasdaq, Massive, Tiingo | `a156012`: the finished session's volume from Nasdaq's historical prices, from 16:10 New York time |
| D3 | S1 | DES, HDS | Short interest a settlement or more behind SI: Apple 120.76M (30 Sep) against 131.59M (15 Oct), Applied Digital 56.63M against 65.47M | FINRA | `cfcb7ef` |
| D4 | S1 | DES, TOTALRETURN, watchlist 52-week %, WEI | A year counted back from the calendar day, not from the last session: before the open, NVIDIA's 12-month total return read +8.67% against +14.09% | Tiingo adjusted closes | `5ce2b7b` |
| D5 | S1 | FINANCIALS | JPMorgan's 2024 revenue 169,439 (177,556 filed); Applied Digital's FY2025 revenue 229 with the business it sold (144 restated, the basis of FY2026, so growth was understated); CoreWeave's 2024 diluted EPS -2.02 (-4.30 filed) | SEC filings | `4c00dfd` |
| D6 | S2 | ANALYSTS, DES, QUOTE, EE | The ratings tally counted every firm's last grade however old: 112 ratings for Apple, 61 for JPMorgan | Finnhub (49, 30), Nasdaq (29, 24) | `942dba0`: Finnhub's latest month first |
| D7 | S1 | PEERS | HSBC's receipt at a price to book of 8.31 (the receipt's price over one ordinary share's book value) | P/E × ROE ≈ 1.5 | `cc9db6c`: such a figure is left blank |
| D8 | S2 | MANAGEMENT, DES | Tim Cook listed as chief executive; his Form 4 filings say Executive Chair, and John Ternus files as CEO | Form 4 | `70677c3` |
| D9 | S2 | EARNINGS, EE | Applied Digital's last quarter shown as a 97% beat (Yahoo: adjusted -0.01 against -0.30) where Finnhub (-0.82 against -0.31) and Nasdaq (-0.76 against -0.26) show a large miss | Finnhub, Nasdaq, 10-Q | `0f4bf83`: "Sources disagree" with both comparisons |
| D10 | S1 | ECO | Every release shown a day late (Nasdaq lists a day's releases under the next date), with yesterday's actual figures under "next key release in 4h" | Weekday of each release | `a3f1558` |
| D11 | S2 | SPLC | NVIDIA: "Customer A, 23%" from a 10-Q of August 2025 and three more lettered customers from 2024 and 2025 beside the newest quarter's "one direct customer, 16%" (five unnamed customers from four periods) | NVIDIA's 10-Qs and 10-K | `538feaa`: a filing's letters go with its own shares only |
| D12 | S1 | SPLC | AMD: Meta shown as a supplier; AMD's 10-Q says Meta "agreed to deploy up to 6 gigawatts of AMD GPUs" under a master purchase agreement (the clause was cut at "Inc.") | AMD's 10-Q and 8-K | `832f482`, `7a86c0b` |
| D13 | S1 | SPLC | Lockheed Martin: Dow Inc. as a supplier, from "61% from U.S. Department of War (DoW)" | Lockheed's 10-Q | `7a86c0b`: DoW, DoD and DoE are departments |
| D14 | S1 | SPLC | NVIDIA: SoftBank as a supplier, from the ended agreement to buy Arm from it | NVIDIA's 10-K | `7a86c0b`: a share purchase is no purchase of supplies |
| D15 | S1 | SPLC | Apple: a company selling 5,759 Apple units through Apple's store shown as Apple's supplier with 41% | AIB Data Centers' 8-K/A | `7a86c0b` |
| D16 | S2 | SPLC | Super Micro: only Green Earth ("immaterial purchases") as a supplier; its 10-K names Ablecom (95.3% of its chassis) and Compuware, and one unnamed supplier with 63.1% of purchases | Super Micro's 10-K of 31 August 2026 | `7a86c0b`, `16e69d8` |
| D17 | S1 | EARNINGS, EE, DES, QUOTE | Coca-Cola's next report given as 27 October, the report made the day before; NVIDIA's as confirmed "(C) 25/11/26" with no date set (Nasdaq expected 18 November) | Nasdaq, the companies | `df53a10` |
| D18 | S1 | SPLC | Lockheed Martin: "No customer above 10% of revenue" though its 10-Q says 70% of sales were from the U.S. Government | Sixteen contractors' 2026 filings | `5035b03` |
| D19 | S2 | FINANCIALS | "Net Income" was net income to common shareholders: JPMorgan's 2025 55,681 against 57,048 in its 10-K | JPMorgan's 10-K | `3228ad6`: both rows, labelled |
| D20 | S2 | PROFILE | The 30-day average volume left out the session just finished | Tiingo | `ab2804a` |
| D21 | S2 | STOCK MOVERS | Yahoo's screener volume after the close, a few percent short (Apple 39.05M against 39.98M) | Nasdaq | `1311d84`: Nasdaq's consolidated volume for the first 30 rows, each figure's source shown |
| D22 | S1 | CURRENCYRATES, PORTFOLIO | CNY and CNH at the same rate; the ECB's onshore CNY fixing shown as CNH | ECB, Yahoo | `059a890` |
| D23 | S2 | ANALYSTS | FMP's HTTP 402 refusal shown on every research row, Yahoo's and Finnhub's included; refusals FMP sends with HTTP 200 read as "answered" | FMP's answers | `d52a665`, `bd5cf60` |
| D24 | S1 | SPLC | Oracle: Rimini Street shown as a customer with 3% ("Revenue related to providing services for Oracle PeopleSoft products"), and as a supplier with 33% from "SAP reported that support revenue represented approximately 33% of its total revenue" | Rimini Street's 10-K and 10-Qs | `5f58f58` |
| D25 | S2 | SPLC | Oracle: Black Titan's 78.9% (2024) shown though its 20-F gives 70.5% for 2025 | Black Titan's 20-F of November 2025 | `5f58f58` |
| D26 | S1 | SPLC | Microsoft: Insight Enterprises shown as supplying Microsoft with 50% of its revenue, from "our top five manufacturers/publishers as a group (Microsoft, Dell, ...)" | Insight's 10-K | `5f58f58`: a group's figure is no one company's |
| D27 | S1 | DIVIDENDS | Broadcom's dividends of March and June 2018 at 0.35 a share (after the 10:1 split) where Broadcom paid $1.75 (0.175): Yahoo's own history says 0.35 | Nasdaq's dividend record | `2506c36`: shown as "Sources disagree", with both amounts (see below) |
| D29 | S2 | QUOTE, PROFILE | Eli Lilly's market value differed by about 5%: Yahoo's count was 891.4M shares while the 10-Q cover gave 941.4M, consistent with Nasdaq's value. The earlier employee-benefit-trust explanation has no retained primary quotation in this continuation and remains unverified | SEC cover page, Nasdaq; share-definition reconciliation pending | `ad81c2b`: shown as "Sources disagree" with both counts (found by the check's first run on GitHub) |
| D30 | S3 | DIVIDENDS | Walmart's dividends of 2024 and 2026 at 0.208 and 0.248: Yahoo rounds to three decimals; Walmart paid 0.2075 and 0.2475 | Nasdaq's dividend record | `5d0e651`: the record's exact amount shown, with a note; not counted as a disagreement |
| D31 | S1 | FINANCIALS | Eli Lilly's 2022 diluted EPS 6.57 (the feed's: net income over 950.2M shares) against 6.90 in every 10-K: the filed EPS rule needed a net-income-to-common tag Lilly does not file. The earlier trust-based interpretation of the denominator lacks a retained primary quotation | Lilly's 10-Ks; denominator-definition interpretation pending | `6c118ac` |
| D32 | S1 | DIVIDENDS | Coca-Cola's dividend declared on 15 October 2026 ($0.53, ex 1 December) shown as "None announced": Nasdaq's dividend record has no rows for NYSE listings, so declared dividends of Coca-Cola, JPMorgan, Exxon and Lilly had no source | Massive's dividend record | `5d0e651`: Massive's record where Nasdaq's has none |
| D28 | S2 | COT | The commodities table built from an object's keys left seven of eighteen markets out (number-like codes come first) | The CFTC's report | `02f8ea2`, caught by the desktop test before release |
| D33 | S1 | SPLC | Bank of America: 268 filings read, no relation found. The SEC's title gave "Bank OF America", which no filing writes; about 100 listed companies have such a title (Royal Bank of Canada, Bank of Montreal, Packaging Corp of America), and titles in capitals missed "MasTec", "AutoZone" | The filings | `3dea904` |
| D34 | S2 | SPLC | JPMorgan: Morningstar, Nomura and Fair Isaac as suppliers from a footnote ("Quartile ranking sourced from Morningstar, Lipper and Nomura") and a glossary line; RTX: Lockheed as supplier from "aircraft ... produced by Lockheed Martin" | JPMorgan's 10-K of February 2026, RTX's 10-K | `b09056f` |
| D35 | S2 | SPLC | Costco: Emerson Radio's 11% shown as its share of 2025; the 10-Q says "for the three month period ended September 30, 2025" | Emerson Radio's 10-Q of 14 November 2025 | `3060628`: shown as "3M to Sep 2025" |
| D36 | S1 | SPLC | Target: Edgewell shown with 9.2% of its revenue from Target; the 10-K gives 9.2% of one segment's (Sun and Skin Care) | Edgewell's 10-K of November 2025 | `b89e3bf`: a segment's figure is no share of the company's |
| D37 | S2 | SPLC | Home Depot: Axil Brands as its customer (Axil received an order "to distribute three ... products through its on-line platform": Axil supplies); American Woodmark as its competitor ("we compete ... for ... orders from Home Depot") | Axil's release of 8 April 2026, American Woodmark's 10-K | `a642935` |
| D38 | S2 | SPLC | Bank of America: no lenders, and two wrong partners: Alliance Laundry's own name read as an "alliance" in its credit agreement, and Beta Bionics' licence naming the bank only as a source of currency quotes | The filings | `e20f568`: 73 lenders now (MasTec, Celestica, Booz Allen, JELD-WEN and others) |
| D39 | S1 | SPLC | JPMorgan: contracts of Clariant, Transworld Systems and Evonik shown as its federal customers. USAspending files them, NCO Financial and two railroads under JPMorgan Chase & Co. (old private equity holdings) | JPMorgan's own filings name none of them; General Dynamics' name Electric Boat, NASSCO and Iron EagleX, Lockheed's Sikorsky | `3dbe6aa`: a unit named unlike the company counts only when its own filings name it |
| D40 | S2 | SPLC | JPMorgan: Charles & Colvard as its customer ("we obtained from JPMorgan Chase our ... Credit Facility": a lender), Heartflow as a supplier (a lock-up notice "provided to J.P. Morgan"), J.P. Morgan's REIT as a partner ("Special Limited Partner") | The filings | `1408f28` |
| D41 | S1 | SPLC | SPLC BAC never finished: one lender rule backtracked for 68 seconds and more on four bank names in capitals | Timed on the saved sentences | `0a6735f`: loads in 77 seconds |
| D42 | S1 | FINANCIALS | JPMorgan's revenue of 2022 and 2025 shown as 127,727 and 181,847 (the feed's) against 128,695 and 182,447 filed: the filed figure replaced the feed's only beyond a 1% difference. Found by the check on GitHub, which also compared Tesla's net income with ProfitLoss (minority interests included) and failed on the check's side | JPMorgan's 10-Ks (SEC companyfacts) | `a8dee8f` (a bank's filing wins beyond 0.05%), `640fa59` (the check) |

## Checked and right

- QUOTE and PROFILE for the six stocks: last, open, high, low, previous close, 52-week range, market cap (within 0.15%), dividend yield, P/E, realised volatility (within 0.3%), YTD change (exact), shares outstanding (within 0.2%).
- FINANCIALS: 112 of 129 annual and LTM figures exact against the filings before the fixes; the rest explained above.
- HP: closes and volumes of past sessions (Yahoo's daily volumes are rounded to hundreds).
- DVD: every ex, record and payment date for Apple and NVIDIA.
- INSIDERS: Applied Digital's 45 Form 4 filings read as filed.
- MONEYMARKET: every reference rate, volume, bill yield and curve spread exact.
- WEI: S&P 500, Dow, Nasdaq Composite and Nasdaq-100 levels and changes exact.
- CURRENCYRATES: 22 currencies within the day's moves (NZD's and KRW's 1.5% and 0.7% moves confirmed by Twelve Data).
- CENTRALBANKS: the Fed, ECB, Bank of Canada and RBA rates.
- ECONSTATS, MACRO: US GDP (2.2% on the year) and CPI (3.7%).
- MARKETCAP: year-end values from closes and cover-page share counts.
- SPLC on 29 October, each stated share against the supplier's own 10-K: Costco (Lifetime Brands 11%, SharkNinja more than 10%, Freshpet 10%), Target (John B. Sanfilippo 12%, Helen of Troy 12%, Hanesbrands 11% in 2024, its last 10-K), Home Depot (Masco 38%, Hillman 22.5%, UFP Industries 17%, JELD-WEN 17%, Central Garden 16%, Stanley Black & Decker 15%, MasterBrand 13%, Fortune Brands 11%).
- SPLC, rechecked against the filings: AMD's Riot Platforms lease, Viavi, Udemy, Fortinet; Applied Optoelectronics' Oracle 12.4% (2024) and Microsoft 28.8% (2025); Insight's 32% of purchases from Microsoft and 17% of sales from Microsoft products.
- NGAS: EIA's storage report for the week ending 16 October 2026 (3,644 Bcf, +77, year ago 3,796, five-year average 3,609) as on EIA's page; the weekly petroleum figures as in EIA's table 1.
- NIPA: Q2 2026 real GDP +2.2%, consumption +2.51 points, net exports -1.10; August 2026 personal income 27,626.9 billion, saving rate 4.1%, as FRED's copies.
- COT: WTI, gold and corn on 20 October 2026 (open interest, managed money long and short, changes) as on the CFTC's report pages.
- The check's first runs (28 October): quotes and dividends of eight stocks (Apple, Coca-Cola, JPMorgan, Exxon, Microsoft, Procter & Gamble, Johnson & Johnson, Broadcom), then the whole check for Broadcom, Apple and Coca-Cola: 232 comparisons passed, and the only differences were Broadcom's two 2018 dividends (D27), now flagged on screen. The first runs also corrected the check itself (a 52-week window counted from yesterday, YTD against yesterday's close while the session traded, too few FINRA rows), never the app's figures.

## Where two sources differ

Where two sources give the same figure and differ, the screens now say "Sources disagree" in amber instead of showing one of them as fact, with both values on hover (`docs/troubleshooting.md`):

- a quarter's EPS when the sources report it on different bases (D9);
- the next report date, when Yahoo Finance and Nasdaq both confirm it on different days (QUOTE, PROFILE, FINANCIALS, EE, EARNINGSSUMMARY);
- a market value or share count, when Yahoo Finance's count and the company's latest filing cover differ by more than 2% (QUOTE, PROFILE: Eli Lilly, D29);
- a dividend whose ex-date, payable date or amount differs between Yahoo's price history and Nasdaq's dividend record, amounts compared on today's share basis (DIVIDENDS, with both values in the note under the table).

## Sources changed on 28 October

- **Equibles retired**: no requests, no key, no research section. What it gave on ANALYSTS (guidance, KPIs, insider and institutional summaries) is shown from the app's other sources where they have it (INSIDERS and HOLDERS from SEC filings, SHORTINTEREST from FINRA, EVENTS and COMPANYNEWS), and as not available otherwise; nothing is estimated in its place.
- **EIA** (NGAS, NATURALGAS, OILMARKET), **BEA** (NIPA) and the **CFTC's Commitments of Traders** (COT) added, each checked live against the publisher's own pages (above).
- **U.S. Treasury Fiscal Data** for one workflow: `DEBTPROFILE T GOVT`, the Treasury's marketable debt by class and maturity from its monthly statement of the public debt (463 securities on 30 September 2026, adding up to the statement's own totals to the cent). Amounts, not prices.

## Known limits

- Sources call a quarter's "actual" EPS on different bases (Finnhub gave Apple's September 2024 quarter as 0.97 GAAP against a 1.60 estimate on the adjusted basis). The app flags a disagreement only where two sources compare the same quarter.
- Yahoo's price history can carry a wrong dividend (D27). The app shows it with "Sources disagree" where Nasdaq's record covers the date; Nasdaq's record covers only the last few years for some stocks, so an older error there has no second source on screen.
- STOCK MOVERS' rows after the thirtieth keep Yahoo's screener volume, marked as such.
- Applied Digital's hyperscaler that is not Oracle is unnamed in every filing (Delta Forge 1, Polaris Forge 3 and Delta Forge 2, 810 MW). A trade publication has named Meta as the likely tenant of one campus from planning records; the app does not label it, as no filing or company statement does.
- SPLC for very widely named companies (JPMorgan, Bank of America) reads the few hundred filings the SEC's full-text search ranks first, not every filing that names them. The review of Eli Lilly, Pfizer, Merck, Exxon, Chevron, Ford, GM and Northrop (planned on 29 October) was not done: the session ended first. Bakkt's "16% of our loyalty services revenue" from Bank of America shows as a share of Bakkt's revenue: it is a share of one revenue line, a case the segment rule does not cover yet.
- The supply chains are read from what filings say in words: a relation a filing does not state, or states in a way no rule reads yet, is missing. Each fix above is tested on the sentence that showed it, and every rule change is run over about 6,000 saved sentences from 32 companies' filings to show what else it changes.

## Re-running it

`npm run build`, then `npm run audit:check`: it captures the screens, fetches the references and compares them, and exits with code 1 when a figure is beyond its tolerance (`docs/audit-check.md` gives the tolerances, the keys it needs and where it can run on a schedule). The first run's separate scripts are in `scripts/live/audit/` with its README. Keys come from the environment and are never printed.
