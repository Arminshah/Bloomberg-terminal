# Armin Terminal 2.18.0

This release rebuilds the main screens on the owner's reference documentation (the equities workflow guide, getting-started and training guides and their screen images), adds six functions, and fixes the screens reported broken: the APLD profile chart with IEX prices, its blank past revenue estimates, GLCO's missing changes and the EVENTS freeze. The app keeps its own name; it shows no login and needs none.

## Screens rebuilt on the reference

- **Look:** a flat crimson function bar with the title and a launch mark, the loaded security in its amber field, the terminal's proportional typeface by default (SETTINGS switches back to the monospaced one), autocomplete that offers a typed ticker's own functions first, and the security menu grouped as the terminal groups it (Company Overview, Company Analysis, Research & Estimates, Comparative Analytics, Charting & Reporting, ...).
- **DES (PROFILE):** numbered boxes as the description page has them: price chart, estimates, analysts, dividend, corporate info, management, total return, beta and ownership, with the company name in cyan and a three-line description with More.
- **WEI:** index names in amber capitals with row numbers, a region selector, a futures toggle (the front future beside its index), a %Chg YTD toggle with the YTD currency (USD, EUR, GBP, JPY, CHF), a bar for the day's change, and News and Export actions.
- **MOV (Equity Index Movers):** the S&P 500, Nasdaq-100 or Dow's whole membership: #Up, #Down, #Unch and volume beside the index's last, change, time, open, high and low, then numbered Leaders and Laggards with price, change, index points and volume, grouped by sector on request. The Dow's points use its divisor; the members' points add up to the index's change (+529.84 against +529.85 in the live check).
- **IMAP:** a sunburst of sectors (or countries) and their members, sized by index weight and coloured by the day's change, with drill-down, the group table with change bars and the share of members up, a market-cap filter and the Pie Chart & Table / Table / Pie Chart views.
- **MOST (Most Active Securities):** the index's members with an options rail (sector, market-cap range, name or ticker, percent or net change), the Volume, Chg Up, Chg Down, Value and 52-week tabs, volume bars and each stock's latest headline.
- **FA:** Periods, Annuals/Quarterlies and currency fields, headings as 2025 Y with full period-end dates, the analysts' consensus for the next two years as 2026 Y Est columns, a graph mark on each line and a bottom bar to page through periods with the next earnings date.
- **EARNINGS (ERN):** Periodicity and Measure (EPS or revenue), the Earnings/Surprise Snapshot in two columns beside a chart of the comparable figure against the estimate, and one table with the average of absolute values, coming periods' estimates, and each report's period end, reported and comparable figures, estimate, surprise, price change and P/E. The quarter-by-quarter comparison with revenue follows below.
- **DVD (Dividend/Split Summary):** range years, Adjust for Capital Change, 12-month and indicated yield, 1-, 3- and 5-year dividend growth, a chart of the 12-month dividend with its yield, a type filter and the Declaration / Ex Date / Record / Payable / Curr / Declared / Type table.
- **HDS (Security Ownership):** 1) Current, 4) Ownership Summary and 5) Insider Transactions (SEC Form 4), the holder group and period fields, Shrs Out, % Out, Float/Shrs Out and SI % Out, and the holder table in the terminal's order, sorted by position.
- **ANR:** a year of prices with the consensus target and the high and low targets beside the rating summary.
- **RV:** without Yahoo's company profiles, an S&P 500 member's peers come from its GICS sub-industry and other US stocks' from Nasdaq's industry (AAPL: Dell, Sandisk, Seagate, Western Digital, HPE, NetApp, HP, Super Micro).
- **EVTS:** the market calendar in the one-line form: company, event mark, a description such as "Sep 2026 A:2.34 E:2.29 S:+2.2%", market value, date and time, green for a beat, red for a miss, amber still to report. The empty revenue and growth columns are gone.
- **ECO:** the desktop calendar now comes from Nasdaq's economic calendar (no key): every country's releases with their times, the consensus (Surv(M)), the actual coloured against it and the prior value. The FRED-based calendar remains when Nasdaq does not answer.
- **TOP and CN:** stories several sources carry are listed under Top Ranked News above Time Ordered News.
- **MLRT (ALERTS):** New Limit Alert with the current price, an expiration in days and a note; alerts lapse unfired when they expire.

## New functions

- **MEMB** (Index Members): the members of the S&P 500, Nasdaq-100 or Dow with their weights, shares, price, change and market value.
- **MRR** (Member Ranked Returns): the best and worst members over a day, a week, one, three or six months, the year to date or a year.
- **EEO** (Consensus Overview): the last fiscal year against the consensus for the next ones, line by line with the number of estimates and their growth, and the multiples at today's price.
- **CACS** (Corporate Actions): dividends and splits, and from SEC filings completed acquisitions, merger and tender offer documents, offerings, listing changes and shareholder meetings, by announcement or effective date.
- **SI** (Short Interest): FINRA's consolidated short interest for every US listing over up to two years, with days to cover, the share of the float and the volume.
- **EQRP** (Equity Risk Premium): the expected market return, the 10-year yield and the premium between them, and the stock's premium through its beta; each input can be changed.
- Typed names: MEMB, MRR, EEO, EEB, CACS, SI, EQRP, MLRT, GV, NI, NH and G.

## Fixes

- **APLD's profile chart with IEX prices:** with `ALPACA_IEX_PRICES_ENABLED` on, the app kept only IEX's two daily bars, so the chart was a straight line and the 52-week range blank. Days before IEX's own bars now come from Yahoo's consolidated history; the last price, previous close and today's bar stay IEX's.
- **Past revenue estimates:** Alpha Vantage's revenue estimate is now kept for fast growers (reported revenue up to four times the estimate), and EARNINGS says when past quarters need `ALPHA_VANTAGE_API_KEY` for their expected revenue.
- **GLCO's missing changes:** a future's previous close is the exchange's settlement (or, after a roll, the new contract's), not the daily bar's last trade; WTI, heating oil, gasoline, silver, platinum, palladium, copper and cattle show their changes again. GLCO names each commodity (WTI Crude, Natural Gas, RBOB Gasoline...).
- **Index changes:** Shanghai, TAIEX and the ASX 200 showed "--" because Yahoo's previous-close field was a session behind; the previous bar is used when the field matches the close before it.
- **EVENTS freeze:** opening the market calendar blocked the app for seconds at a time. Only the lines in view are drawn now, and updates are batched. The market-value floor is $5B.
- **Statements:** a quarter that ends a few days apart in the SEC filings and Yahoo's feed (NVIDIA's) is one period, so quarters no longer appear twice.

## Sources added

All without a key: the S&P 500 member list with GICS sectors (the public dataset kept from the index's published membership), Nasdaq's Nasdaq-100 list, Nasdaq's quotes for member volumes, Nasdaq's economic calendar, and two years of FINRA short interest. Index weights are estimated from market values (a company with two share classes is not counted twice), not the index providers' float-adjusted weights, and each screen says so.

Validation: unit tests, 35 browser tests and 30 Electron tests; ESLint, TypeScript and production build. The desktop app was run against the live sources for the screens above (WEI, MOV for SPX, NDX and the Dow, MEMB, MRR, IMAP, MOST, FA, EARNINGS, EEO, DVD, HDS, CACS, ANR, RV, EVTS, ECO, SI, EQRP, GLCO). The IEX history change was checked with unit tests only (no Alpaca keys here), and Alpha Vantage only with its public demo answers.
