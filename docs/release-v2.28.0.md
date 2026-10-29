# Armin Terminal 2.28.0

This release widens the supply chain analysis (SPLC) with what a company's own filings of two years say and with the federal government's contract records, fixes the watchlist's volume, day range and day chart when the IEX price is on, makes the range bars easier to read, and adds an earnings and estimates page (EE), each stock's percentile among its peers, the FIGI on DES and the count left after each SCREEN criterion. Windows only.

## Supply chain (SPLC)

- **More of the company's own filings are read**: its last two annual reports, the quarterly reports since, and its 8-Ks of two years on agreements, deals, financings and announcements, with the press releases filed with them. Other companies' reports and 8-Ks that name it are now searched over two years, and more of them are read.
- **Lenders, investors, suppliers and partners from those filings**: the banks behind a credit agreement and its agent, the parties to the agreements in the exhibit list, a buyer of shares or units it issued and the manager behind that buyer, the suppliers named for its purchasing, and the deals of its subsidiaries. A loan the filings say was repaid drops its lender. The company's own entities are never listed as its counterparties.
- **Federal contracts (USAspending.gov)**: for a US-listed company, the agencies whose contracts with it ran in the last year are customers, with the dollars obligated; prime contractors that subcontracted to it in the last two years are customers too; and the subcontractors on its largest contracts over five years are suppliers. A unit of a listed group counts as the group (Northrop Grumman Systems is Northrop Grumman). Each box shows the amount ("Contracts $1.3B"), each record links to its page on USAspending.gov, and Filings Read lists the three federal steps.
- Checked live on 28 October: Applied Digital went from 29 relations to 43 (lenders 2 to 10, suppliers 2 to 4, partners and investors 5 to 9), read from 129 filings instead of 78. Palantir gains 31 customers from its federal records (24 agencies and 7 prime contractors, among them General Dynamics, Northrop Grumman and Booz Allen Hamilton); Lockheed Martin 41 customers and 29 suppliers (Northrop Grumman, BAE Systems, Aerojet Rocketdyne, Boeing, Leonardo, Moog, RTX, Honeywell, L3Harris and others).
- What it still cannot give: the share of revenue behind most relations, which companies rarely state; contract dollars are obligations over a contract's life, not revenue. Companies without federal work have no federal records.

## Watchlist

- **Volume, open, high and low of all US venues**: with the IEX price switched on, IEX's own figures stood for the whole market, and IEX is one venue (Applied Digital's volume showed 892K where all venues traded about 15M). The last price, bid and ask stay IEX's; the day's volume, open, high and low now come from Yahoo Finance's quote of all US venues, for the same session only.
- **Day chart**: it draws the minute bars of all venues, its last point moving with IEX's price, instead of the few IEX trades seen since the window opened (a flat line).
- **Range bars**: the low and high figures are white, and the price is a white bar across the track instead of a triangle.
- Each figure says where it comes from: "Yahoo Finance · all US venues" for the volume and range, "Alpaca · IEX only" for the last price.

## Earnings, peers, profile and screening

- **EE** opens a page of its own, Earnings & Estimates: the next and last reports and the price's average move around the last eight, the trailing P/E and the P/E on the blended next twelve months' EPS with next year's growth, the analysts' ratings and average target, the last quarter against its estimates with how many of the last eight reports came in above, the next quarter's estimates, the trend of EPS and how the consensus moved. Each box opens the screen with the detail. ERN stays the earnings history, and its "Prior Announcement" is now the newest dated report.
- **PEERS** adds a line under the average and median: the loaded stock's percentile among the peers on each figure (0 the lowest, 100 the highest).
- **DES** shows the US listing's FIGI beside the name (from OpenFIGI) and writes the report date as "Aft-mkt (C) 02/25/26".
- **SCREEN** shows how many stocks are left after each criterion, beside it.

## Data

- New source: USAspending.gov, the U.S. Treasury's public contract records (no key). PROVIDERS lists it with its terms.

## Data accuracy audit

Every screen with figures was checked against a second, independent source on 28 and 29 October; `docs/audit-v2.28-data.md` lists each finding with its source and fix. The main corrections:

- **Prices and returns**: the session's volume after the close (it was 0.3% to 2.8% short), short interest a settlement behind, and the 12-month return counted from the calendar day instead of the last session.
- **Financial statements**: bank revenue, restated years and IPO-year EPS now follow the filings (JPMorgan, Applied Digital, CoreWeave); Eli Lilly's 2022 EPS shows 6.90 as filed.
- **Dividends**: declared dividends of NYSE stocks, which had no source (Coca-Cola's $0.53 of 15 October), now come from Massive's record; Walmart's exact amounts replace three-decimal roundings.
- **Analysts, earnings and events**: the ratings tally counts current ratings only; beats on mixed bases are flagged; the economic calendar's dates are no longer a day late.
- **"Sources disagree"**: where two sources give the same figure and differ (next report date, a dividend, market value and share count, a quarter's EPS), the screen says so in amber with both values, instead of showing one as fact.
- **Supply chains (SPLC)**: many misreadings fixed and tested on the sentence that showed them, among them Bank of America and about 100 other companies whose SEC name has a small word ("Bank OF America" matched no filing); a segment's share shown as the company's; a quarter's share shown as the year's; data sources and glossary lines read as suppliers; banks behind a credit facility now listed as lenders; and federal contract records of companies USAspending wrongly files under a parent (Clariant and Transworld Systems under JPMorgan) left out unless the company's own filings name them.

## New sources and screens

- **COT**: the CFTC's Commitments of Traders for 18 commodity and financial futures (no key), with a note when a report is late.
- **DEBTPROFILE T GOVT**: the U.S. Treasury's marketable debt by class and year of maturity from the Monthly Statement of the Public Debt (Fiscal Data, no key), adding up to the statement's totals.
- **EIA** for natural gas storage and the weekly oil figures, **BEA** for the national accounts (NIPA).
- **Equibles removed**: no requests and no key; what it gave is shown from the app's other sources or as not available.
- **A data audit check** (`npm run audit:check`) compares the app's figures with independent references and fails when one is beyond its tolerance; a GitHub workflow runs it.

## Checks

Lint, type checks, unit tests, the build, the browser tests on demo data and the desktop tests on recorded data all pass; the release build runs the desktop tests on Windows. SPLC was also checked live in the desktop app on 28 and 29 October for Applied Digital, Palantir, JPMorgan, Bank of America, Costco, Target and Home Depot, each stated share against the supplier's own filing.
