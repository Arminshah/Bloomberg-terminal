# Armin Terminal 2.27.0

This release brings back the IBM Plex Sans typeface, gives the watchlist your new layout and the after-hours rule you set, adds a Transactions tab to PORTFOLIO with lots, realised P&L and returns, yield to call and to worst on BONDCALC, a help desk that ignores instructions planted in the news, and fifteen new screens and codes: commodity sector pages, world currency rates, index rankings and a markets map, portals on the ECB, the Bank of England and the Bank of Japan, central bank rate analysis and your own news pages. Windows only.

## Look and watchlist

- **The typeface is IBM Plex Sans again**, as in 2.25.1, with IBM Plex Mono on the command line and the charts. 2.26.0's default drew thin, uneven figures on Windows. There is no typeface setting any more.
- **The watchlist's default columns** follow your layout: Last Price, Change (%), Change, Pre-mkt, After-hrs, Volume, Avg Vol (3M), YTD, 52-Wk %, Day Range and 52-Wk Range as bars, a Day Chart on the previous close, and Market Cap. Lists with columns of their own keep them; Bid, Ask and Time are still in 94) Columns.
- **After-hrs** shows the latest after-hours session: live from 16:00 to 20:00 New York, then frozen at its last trade through the next day. **Pre-mkt** is today's, and N/A from the close until the next pre-market. The blinking After-hrs column is fixed.
- 52-Wk % is the change over a year (today's price against the close a year earlier, without dividends); Avg Vol (3M) is the average of the last 63 full trading days.
- EVENTS and EA ask for the latest reports' year-earlier days first, so growth shows at once.

## PORTFOLIO: transactions

- A fourth tab, **Transactions**: record buys, sells and dividends with their date, quantity, price, fee and the exchange rate into the portfolio's currency. Leave the rate blank and a past trade in another currency takes the ECB's reference rate of that day; a trade of today takes the market rate.
- Sales take the oldest shares first. Trades before a split count on today's share basis, from Yahoo's split list.
- It lists the transactions (delete with ×), the open lots with their unrealised P&L, the realised P&L split into the price move, the currency move and fees, and a summary: invested, proceeds, dividends, fees, and the time- and money-weighted returns (per year once the period is a year or more).
- A sale larger than the shares you held that day is refused.
- A holding follows its transactions while the two agree. When they differ (a holding you typed on Holdings, or a split), both tabs say so and offer **Use the transactions**.
- After you change the portfolio's currency, **Ask the ECB again** fills in the rates. The tab's export is your transactions.

## BONDCALC: call schedules

- Type the calls, one a line: a date and a price per 100. You get the **yield to each call** and to maturity from the clean price, the **yield to worst** with its workout date, and each date's price at the yield with the **price to worst**.
- A call between coupon dates pays its price and the coupon accrued since the last coupon date. The calls have no option value here, as the screen says.
- Checked against a textbook example (10% coupon at 117.50, callable in five years at 110: 7.43% to the call) and Excel's PRICE and YIELD examples.

## Help desk

- Headlines, filings and company descriptions can carry instructions aimed at an AI ("ignore your rules and…"). The help desk now leaves out every such sentence before it answers, and says so; with Claude switched on, the sources are marked as data, and an answer can link only to addresses the sources gave. Ordinary headlines are left alone, and the news screens still show headlines as published.

## New screens and codes

**Commodities**
- **OIL**, **GAS**, **MINE** and **AGS**: a page for oil, natural gas, metals and agriculture. Each shows its futures with a curve button, and the sector's measures worked out from those prices (the Brent-WTI spread and crack spreads, crude to gas, gold to silver and to platinum, soybean to corn, wheat less corn) with their range over the year. US inventories need a free EIA key, not set up yet. WTI, CRUDE and NATGAS still open the contracts.

**Currencies and indices**
- **WCR**: every currency against a base you choose (USD, EUR, GBP, JPY, CHF, CAD or AUD), by region or in a basket of your own, with the change over a day, a month, the year and twelve months.
- **WEIS**: the world's indices ranked by return over a day to a year, in their own currency or one of yours. **WM**: a map of the world's markets, each coloured by that return; a tile opens its chart.

**Central banks**
- **ECB**, **BOE** and **BOJ**: a page on each bank, as FED is on the Federal Reserve: the policy rate from the bank's own data, its last move and the meeting that decided it, the next decision, the overnight rate it publishes (€STR, SONIA, the call rate), its latest announcements, its pages and the screens on its market. The Bank of Japan's figures come from its own data service, credited as it asks.
- **CBRT**: each bank's policy rate with every move over about four years, the meeting that decided each, and a step chart.

**News and others**
- **MYN**: pages of your own news, each section a saved search over the news the app reads.
- **GEW** opens ECONSTATS, **NLRT** opens ALERTS (news keyword alerts) and **DSCO** opens DOCSEARCH.

## Data

- New official sources: the euro short-term rate (ECB), SONIA (Bank of England), and the Bank of Japan's basic loan rate and overnight call rate. PROVIDERS' self-test checks the Bank of Japan's service.
- The browser demo's reference rates for the ECB (2.50%) and the Bank of Japan (around 1.25%) are brought up to date.

## Checks

Lint, type checks, unit tests, the build, the browser tests on demo data and the desktop tests on recorded data all pass; the release build runs the desktop tests on Windows. The new central bank pages, CBRT, WCR and the commodity pages were also checked live in the desktop app on 27 October.
