# Armin Terminal 2.25.0

This release adds two screens, a company's 13F holdings (HOLDINGS) and members of Congress's trades and holdings (CONGRESS); turns EVENTS into a weekly board of the most relevant earnings releases; shows revenue expected and reported wherever EPS is; lets you build layouts of your own; and corrects several figures and descriptions after a review of the data sources and the reference guides. Windows only.

## New screens

- **HOLDINGS** (also `13F`), beside HOLDERS in a stock's menu: what a company reports on its Form 13F filings with the SEC. Each holding has its shares, its value at the quarter's end, its share of the portfolio and the change since the quarter before (new, added, reduced, unchanged, sold out), beside today's price and value. Tabs give a map sized by value and the holdings sold out, with a chart of the portfolio's value by quarter and a CSV export. Tickers come from OpenFIGI. A 13F lists what the manager has investment discretion over: for a bank or asset manager that includes its clients' accounts, and the screen says so.
- **CONGRESS** (also `CONG`): representatives ranked by the assets in their latest annual report, every trade disclosed in a period (latest week to 12 months), the stocks bought, sold and owned most. House reports are read from the House Clerk's own PDFs; senators' latest trades come from FMP (its free plan lists 25), kept by the app from the first time you open the screen. Amounts are ranges, as the law requires. The screen shows the law's notice on these reports before reading anything.
  - Reports are read four at a time, with a progress bar and the time left; a first read of 12 months takes about two minutes, later opens are instant.
  - Holdings without a ticker (Treasury bills, private funds) are left out unless Assets is set to Everything.

## Earnings

- **EVENTS** opens on a board of the week's most relevant releases: a column a day, split into before the open and after the close, the six most traded companies of each by name, with the EPS and revenue expected, or the surprise once reported. The week's five most traded are named above the board. When Nasdaq's stock list does not load, Yahoo's quotes rank the companies, and the note says why.
- Every list opens on the latest trading day; earlier days fold above it. The Market tab starts from $50B.
- **Revenue beside EPS:** EARNINGS has Rev Reported, Rev Est and Rev %Surp next to the EPS columns; EVENTS has revenue expected, reported and beat / miss.

## Layouts and the window

- **LAYOUTS** builds a layout of your own in three steps: how the rows look (up to 4 rows, 6 tiles), a screen per tile, a name. Drag the lines to size the tiles; a dot on LAYOUTS ▾ offers to save changes. Building a layout opens on the whole window, and your panels before are kept to save or go back to.
- **The tab bar is the window's title bar**, with minimise, maximise and close at its right end.
- **WATCHLIST** says which session US stocks are trading in now (pre-market, regular, after hours, closed), the time to the next change and which column is live.
- **PORTFOLIO** holds several portfolios as tabs. A lot bought on a past date takes the ECB's reference rate of that day as its entry exchange rate, and says so; the ECB's rates are for information, and the rate a bank or broker applied can differ.
- **WHATSNEW** shows the version and the release notes inside the app.

## Corrections

- **Estimates:** FMP's earnings history now loads (the app asked for more reports than the free plan gives); FMP's revenue estimates sit only beside revenue in dollars; answers for a company's home listing are no longer read as its US listing's (TSMC's figures in Taiwan dollars, ASML's in euros).
- **HISTORY** says that stock prices and volumes are adjusted for splits and not for dividends.
- **Beta:** WACC and RISKPREMIUM use the same beta as BETA (two years of weekly returns against the local index); they used daily returns.
- **Menus:** no grey block where a row has fewer sections.
- **Data:** CoinGecko answers shared by every window, TipRanks answers kept per account, official statistics kept current, kept answers marked stale with their own time, and IEX sessions kept while the window stays open.

## Data sources

- The provider self-test on PROVIDERS also checks OpenFIGI and the House Clerk.
- A review of every source, checked live, is in `docs/data-providers.md`; the audit against the reference guides is in the repository's docs folder.

## Under the hood

- 1,335 unit tests, 46 browser and 42 desktop end-to-end tests.
