# Armin Terminal 2.30.0

This release adds the portfolio-management screens built from two papers the owner supplied, a FTSE 100 universe for the screener, and a review of the supply-chain screen against the filings it cites, with the fixes it found. It also contains the accuracy work prepared as 2.29.1, which was not published separately. Windows only.

New screens

- FRONTIER, mean-variance portfolio analysis on month-end last prices: the long-only minimum-variance optimum over screened names (those under 1% marked), the efficient frontier with the capital market line, and the minimum-variance, equally weighted and tangency portfolios with their returns, risk and Sharpe ratio. Its arithmetic reproduces the paper's spreadsheet exactly on the same prices.
- MPC, the dissertation's portfolio back-tests: the Hold policy and twelve model-predictive-control tests (forecast horizon, risk, trading and holding aversion, leverage, long only, dollar neutral), each with its input and result table and its value and weight charts, on adjusted daily closes from Tiingo (delisted stocks included) and the 3-month bill rate from FRED. Forecasts use only past returns. The solver agrees with an independent convex solver on every test problem.
- SCREEN can now screen the FTSE 100: members from Wikipedia's constituents table, gross margin and return on common equity (on average equity) from Yahoo's annual statements, a running count after each criterion, and the paper's results view with the average row.

Company screens, compared with the paper's terminal captures

- PEERS has the Overview, Comp Sheets (Equity Valuation, Profitability, Balance Sheet) and Markets pages, a Median line of the company and its peers first, the company pinned as 100) with its peers from 101), and a comp range panel with each figure's low, high, median and the company.
- FINANCIALS gives the market value, cash, preferred and other, total debt and enterprise value at each period's end; growth, margins and EBITDA in the estimate columns; money in millions with one decimal; a graph mode for any line with its total and compound annual change; and the segments' revenue as bars by fiscal year.
- PROFILE has Issue Info's holdings and issue panels, market value and share counts in millions, a beta measured against the home index for a stock outside the US (the source's is against the S&P 500), and an Est P/E that stays on a fiscal year until its results are reported. An index's page has the period table, and its list of the country's equities no longer reads as the index's members.
- CHART measures every line from a fixed date named in the legend ("Normalized As Of"), with three-decimal figures; it adds the 10- and 30-day averages, a 15-day average of volume and Key Events (ex-dividend dates, splits, earnings reports).
- ANALYSTS scores the consensus rating on the 5, 3, 1 scale the captures fit (the old weights read Microsoft 4.29 where the consensus scale gives 4.91), lists each firm's standing rating in its own words, coloured by meaning, and charts over 6M to Max.
- COMPANYNEWS numbers headlines from 101) and heads a story with its date, time and source code.

Interface

- The panel's command line, red function bar, two-line quote strip, toolbar, tab strip, options menu, dialogs, autocomplete and section strips follow the terminal's 2024 layout more closely; DES, EE, ANR and EQS sit on a fixed-width page. The Related Functions menu opens over the screen (and a small one on right-clicking a security), the yellow ? opens a help menu and Live Help, plain words on the command line search the app, a new tab opens on a page of tips, and BLP opens the Launchpad. The watchlist's columns, order, row height and colours are guarded by tests, with a screenshot baseline for each browser that runs them.

Accuracy

- The supply-chain screen was checked relation by relation against the filings for Eli Lilly, Pfizer, Merck, Exxon, Chevron, Ford, General Motors and Northrop Grumman. Companies are named by their own SEC record, not by a ticker since reused; agreements a filing says ended show as ended; lawsuits, competing products, careers and notices are no longer relations; shares are read for the right company, period and revenue; federal contracts go to the agency that funds them, count each subaward report once and roll units up to their real parent. Every finding and its fix is in `docs/splc-review-2026-10-30.md`.
- A finished session's official open, high, low and volume come from Nasdaq's historical record, replacing the price source's provisional readings, and say so. A request that gets no answer is asked again after two minutes.
- Exxon's revenue basis is labelled under its new holding company's SEC record. Lilly's share counts carry their definitional difference.
- The data audit checks market values against the company's SEC cover share count, and a disputed day high or low against Nasdaq's official row.
- Revenue and EPS growth in the key statistics are the fiscal year's, from the statements, not the source's quarterly figures. The FTSE 100 screen's return on common equity is not meaningful when equity crosses zero during the year (Rolls-Royce read 644%).
- The changes prepared as 2.29.1: financial-statement selection that proxy disclosures cannot override, parent income kept apart from the EPS numerator, same-session range corrections, market values from a matched price and share count, even current-price markers, and the audit's dated diagnostics. Their detail is in `docs/release-v2.29.1.md` and `docs/accuracy-v2.29.1.md`.

These fixes do not settle every source discrepancy. What was checked, what was right and what remains open are recorded in `docs/portfolio-management-plan.md`, `docs/splc-review-2026-10-30.md` and `docs/accuracy-primary-sources-2026-10-30.md`.
