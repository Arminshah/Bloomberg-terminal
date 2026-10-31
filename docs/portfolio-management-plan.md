# Portfolio-management upload: plan

The owner uploaded `Portfolio_Management-…zip` on 30 October 2026 and asked for everything in it to be built as an exact copy, accurate in every figure. This file is the plan and the record of what was found. It is kept apart from the files Codex is editing (`docs/accuracy-v2.29.1.md`, `docs/audit-v2.28-data.md`, `docs/release-v2.29.1.md`, `docs/HANDOVER.md`).

The upload is in `reference/portfolio-management/`, which Git ignores (the whole `reference/` folder), so its screenshots and PDFs stay out of the public history. Short descriptions and figures from them appear here; no image is committed.

## What the upload contains

The README swaps the two titles. The files are:

- `2360760J_ECON5071_1.pdf` (34 pages, March 2019): "Equity Research and Portfolio Analysis", a FTSE 100 portfolio built with the terminal and Excel. 67 screen captures and spreadsheet figures.
- `2360760_ECON5102p_1.pdf` (92 pages, August 2019): the MSc dissertation "Model Predictive Control applied to Portfolio Management". 15 result tables and 20 charts.
- `MPC1.ipynb`: the dissertation's Python notebook (cvxportfolio). It holds a partly masked Quandl key, which is not copied anywhere.

## The workflow in the first paper

1. Screening (EQS). Criteria, each with its running match count: security universe 1,055,919; trading status active 339,956; index FTSE 100 101; latest-filing gross margin above 25%, 37; latest-filing return on common equity above 25%, 11. The screen is dated 31 January 2019. Results open in a watchlist analytics view with tabs Overview, Returns, Valuation, Estimates, Actuals, Credit, Technicals, Custom and Results; the Results tab lists the 11 names with GM LF (sorted, with a bar), ROE LF, Market Cap, Price:D-1, P/E and Total Return YTD, under a summary row "Investable Universe (11)".
2. A 10-asset minimum-variance portfolio on ten years of monthly closes (Figure 1.4). Six names with weights under 1% are dropped, leaving British American Tobacco, GSK, Reckitt Benckiser and Diageo.
3. Company analysis of each of the four: the security description (5 pages: Profile, Issue Info, Ratios, Revenue & EPS, Industry Info), news stories, financial analysis (Adj Highlights; Segments by measure as a bar chart), the price chart against the UKX index normalised to the start (with a 20-day average and volume), relative valuation (comp range panel, Overview and Comp Sheets, Profitability), and analyst recommendations.
4. Mean-variance analysis in Excel on monthly last prices: the efficient frontier σp = √((A·µp² − 2·B·µp + C)/D) with A = 1′Σ⁻¹1, B = 1′Σ⁻¹µ, C = µ′Σ⁻¹µ and D = AC − B²; the global minimum-variance portfolio Σ⁻¹1/(1′Σ⁻¹1); the equally weighted portfolio; the tangency portfolio Σ⁻¹(µ − rf·1)/(B − A·rf); the capital market line µp = rf + σp·√(C − 2·rf·B + rf²·A); the Sharpe ratio. rf is 3% a year, entered as 0.0025 a month. Results: a table of the three portfolios' weights, return, variance and standard deviation, and a chart with EPF, CML, TP and "GMVP ≈ EWP".

A figure-by-figure description of every capture (layout, buttons, tabs, columns in order, panels, charts and formats) is in `docs/portfolio-management-screens.md`. Each screen is built from it. The values transcribed from the captures are kept out of the public repository, in `reference/portfolio-management/screens-full.md`.

## The dissertation

A back-test from 3 January 2013 to 29 December 2016 on 20 S&P 500 stocks, $10,000 each ($200,000), self-financing, with a 250-day estimation window (2012). Policies: Hold (no trades) and model predictive control (multi-period optimisation), maximising forecast return minus risk aversion × w′Σw, trading aversion × transaction cost and holding aversion × holding cost, subject to the self-financing condition and a constraint set (leverage limit, long only, dollar neutral). Transaction cost: half the bid-ask spread on each trade (plus an optional 3/2-power market-impact term); holding cost: a borrow fee on short positions. Metrics: annual return, annual excess return, annual excess risk, Sharpe ratio, maximum drawdown and annual turnover, on 250 periods a year.

Its tests: forecast horizon 0, 10, 50, 100 and 250 days; risk aversion 1, 5, 10, 20 and 50 (at horizons 10 and 100); trading aversion 0.5 to 1.5; holding aversion 1 to 50; leverage limit 1 to 3; long only; dollar neutral (risk aversion and leverage tests). Each test has an input table (dates, history, horizon, budget, aversions, half spread 0.05%, borrow cost 0.01%, constraints), a result table and charts of portfolio value and weights over time.

## Errors found in the sources, and how each is handled

The app follows the correct definition each time and says so on screen where it matters.

1. The first paper's "BATS LN" prices are Berkeley Group's. Its appendix column headed "BATS LN Equity" (870.5, 888, 980.5 for February to April 2009) equals Yahoo's BKG.L closes divided by a constant 1.0364, and the column headed "BKG LN Equity" (1,797, 1,613, 1,639) is exactly Yahoo's BATS.L. Recomputing on Yahoo's month-end closes, February 2009 to January 2019 (119 monthly returns, sample covariance), with Berkeley's prices in the BATS slot reproduces every figure the paper shows: GMVP 17.36%, 22.10%, 24.02% and 36.52% with return 0.945% and SD 3.097%; EWP 0.943%; TP 29.59%, −26.54%, 28.26% and 68.69%; Sharpe 0.2812. So the paper's British American Tobacco results are Berkeley Group's. The app uses each name's own prices. On British American Tobacco's real prices the same window gives GMVP −7.85%, 26.43%, 27.29% and 54.13% (return 0.894%, SD 3.326%), EWP 0.701% (SD 3.661%) and TP −45.67%, −26.03%, 48.64% and 123.06% (return 1.464%, SD 4.567%, Sharpe 0.2659). The paper's own figures are kept as a test, run on Berkeley's prices and labelled as such, to prove the maths matches the spreadsheet.
2. Annual excess risk is printed as (Std[PR] − rf) × 250 × 100 (equation 4.12). The tables follow the standard definition, the standard deviation of excess returns × √250 (the Hold policy's 12.264 / 14.199 = 0.864, its Sharpe ratio). The app uses the standard definition.
3. Dollar neutral is printed per asset (wᵢ + zᵢ = 0 for every i, equation 3.31), which would leave only cash. The intended constraint is that the asset weights sum to zero (cash weight 1). The app uses the sum.
4. The leverage limit is printed per asset (|wᵢ + zᵢ| ≤ L, equation 3.30). The notebook's cvxportfolio `LeverageLimit` limits the sum of absolute asset weights. The app uses the sum.
5. "Long cash only" is printed as an equality (= 0, equation 3.32). It is an inequality (≥ 0).
6. The self-financing condition (3.16) has −1′·PPₜ on the right; it is −1′·Trₜ, as in (3.20).
7. The uploaded notebook passes `expected_returns`, the rolling forecasts, to the market simulator instead of the realised returns. The dissertation's tables cannot have come from that version: its Hold results match a simulation on real returns closely (on Tiingo's prices the app gives an annual return of 12.155%, excess return 12.042%, excess risk 14.141%, Sharpe ratio 0.852 and maximum drawdown 17.766%; the dissertation prints 12.379, 12.264, 14.199, 0.864 and 17.759), while forecasts used as returns would give an excess risk near zero. The app simulates on realised returns.
8. The notebook's multi-period policy is given a forecast table indexed by date; cvxportfolio's multi-period policy then reads it at the future dates of the horizon, whose rolling means include returns not yet known at the decision. That is the likeliest reason the dissertation's MPC results (Sharpe ratios of 1.0 to 1.9 against the Hold policy's 0.86) are so high. In the app every forecast made at a close uses the returns up to that close only, for every step of the horizon.
9. The notebook's half spread is 10E-4 (0.1%), the dissertation's tables say 0.05%. The app uses 0.05%, as the owner asked, and lets it be changed.
10. The notebook's holding aversions are 1, 5, 1, 10 and 50; the tables test 1, 5, 10, 20 and 50. The app uses the tables' values.
11. The notebook combines `LongOnly` with `DollarNeutral`, which together allow no positions at all. The app offers them as separate tests, as the tables do.
12. The notebook does not run as written: `returns`, `market_sim` and `results` are undefined, and `MultiPeriodOpt` is given neither trading times nor a horizon.
13. A forecast horizon of 0 days is not a multi-period problem. The app runs it as single-period optimisation (one step), which is what a zero look-ahead means.
14. The tables are headed 1 January 2012 to 31 December 2016; the back-test itself runs from 3 January 2013 (2012 is the estimation window), as the notebook and the charts show. The app states both.
15. The dissertation says holding costs triple over a weekend; cvxportfolio charges per period. The app accrues borrow fees and the risk-free rate by calendar day, so Friday to Monday counts three days.
16. Company facts in Tables 5.1 and 5.2 are wrong in places: "Konami (ADS)" is Alliance Data Systems (the notebook uses ADS), Motorola Solutions was not founded in 2011, and Abbott's headquarters are not in San Jose. The app shows each company's profile from its live sources, not the table.
17. Table 5.5 prints an excess return of 14.27% for risk aversion 10, equal to its excess risk, beside an expected return of 18.56%: a copy error. The app computes its own results and does not reuse the printed ones.
18. The first paper's conclusions say the tangency portfolio short-sells 26.55% of its weight in GSK; its own table gives −26.544%, which rounds to 26.54%.
19. On the correct prices, the paper's own workflow keeps different names: the long-only optimum over the nine screened names that still have London prices (February 2009 to January 2019) puts 0% in British American Tobacco and Persimmon and keeps the other seven above 1%, where the paper kept four. The app shows that result; the paper's four names stay the default portfolio so its analysis can be compared.

## What cannot match exactly, and why

- Results of the first paper's analysis: they come from the mislabelled prices (error 1). The app reproduces them only in a test, labelled.
- The screen as of 31 January 2019: the app screens today's FTSE 100 on today's latest filings. Point-in-time membership and filings for 2019 are not in the free sources the app uses (Yahoo's fundamentals go back about four years).
- Stocks that no longer trade where the paper used them: Ferguson (FERG.L) and Evraz (EVR.L) have no London history at Yahoo any more; Ferguson's shares now trade in New York. Reckitt Benckiser is now RKT.L, not RB/. The 10-asset optimum therefore runs on eight of its ten names, and says which two are missing.
- The dissertation's numbers: they came from forecasts used as returns and from look-ahead (errors 7 and 8), so a correct back-test on real returns gives different, much lower results. The app shows its own results; the printed ones are not targets.
- The dissertation's data: Quandl's WIKI dataset stopped in 2018. Tiingo has adjusted daily closes for all 20 stocks in 2012, including the five that are now delisted (Alexion, Activision Blizzard, Patterson, Juniper, Viacom), Healthpeak (formerly HCP) as DOC and Alliance Data as BFH. Tiingo's free plan allows 50 requests an hour and keeps data in memory only. Tiingo's adjusted close is adjusted for splits and dividends, as Quandl's was. The risk-free rate is FRED's DTB3, as in the notebook.
- The provider's analyst list, research, news wires and its own estimates are not available from free data. The analyst screen shows the free consensus and actions it has, with the source named; blanks are labelled.

## Build order

Each step is one commit with its tests, after all the checks in `docs/HANDOVER.md`.

1. Mean-variance maths (`src/finance/mean-variance.ts`): A, B, C, D, the frontier, GMVP, EWP, TP, the CML and the Sharpe ratio, plus a long-only minimum-variance portfolio (Figure 1.4's ten names). Test: the paper's figures to the digits shown, on Yahoo's closes with Berkeley in the BATS slot, labelled; properties on synthetic data.
2. Monthly last prices for any window (Yahoo's daily chart, last close of each month; adjusted for splits, not dividends, like the paper's last prices).
3. The mean-variance screen, laid out like the spreadsheet: the monthly price table (start date, end date, a row per month, a column per security), the 10-asset optimum with names under 1% marked, the GMVP, EWP and TP tables (weights, return, variance, SD; for TP also Rf, risk premium and Sharpe), the summary table, and the chart with EPF, CML, TP, GMVP and EWP. Defaults: the paper's four names, February 2009 to January 2019, rf 3% a year.
4. Screening: an index criterion (FTSE 100 first) and trading status, latest-filing gross margin and return on common equity (net income over average common equity), a running match count after each criterion, and the results view with the summary row.
5. The MPC back-test: the simulator (self-financing, costs, calendar-day accrual), the policies (Hold, single-period, multi-period with horizon H), the constraints, the metrics, the input and result tables in the dissertation's layout, and the value and weight charts. Data from Tiingo and FRED on the desktop.
6. The company screens, each compared with its captures: the five description pages, financial highlights and segments by measure, the normalised comparison chart, relative valuation's comp range and comp sheets, analyst recommendations, and the news story view.

## What the built screens give on real data (30 October 2026)

FRONTIER, the first paper's four names on their own prices, February 2009 to January 2019 (119 monthly returns, rf 0.25% a month): GMVP −7.849%, 26.431%, 27.292% and 54.127% (return 0.894%, SD 3.326%); EWP return 0.701% (SD 3.661%); TP −45.668%, −26.025%, 48.637% and 123.056% (return 1.464%, SD 4.567%, Sharpe ratio 0.26588537). The long-only optimum over the nine screened names with London prices puts 0% in British American Tobacco and Persimmon.

SCREEN, the paper's screen on today's FTSE 100 (the preset "FTSE 100: gross margin and ROE above 25%"; members from Wikipedia's FTSE 100 Index article after the index changes of 1 October 2026, figures from Yahoo's annual statements, run on 31 October 2026 just after midnight UTC): security universe 100, gross margin above 25% 58, return on common equity above 25% 15. The paper's screen of 31 January 2019 gave 101, 37 and 11. The 15, by gross margin: United Utilities, Sage, Games Workshop, GSK, RELX, Reckitt, Fresnillo, Experian, IMI, Unilever, Next, Coca-Cola HBC, Compass, Rolls-Royce and IAG. An independent check on the same day's answers, outside the app's code, gave the same counts and names, and the same previous closes and year-to-date total returns to the second decimal. The summary row, prices to 30 October: Investable Universe (15), GM LF 55.70%, ROE LF 81.96% (Rolls-Royce's 644% lifts it), Market Cap 36.07B (pounds), P/E 19.74 over the 14 with one, Total Return YTD 6.76; no Price:D-1 average, as Compass is quoted in dollars.

- 27 members have no gross margin: banks, insurers, investment trusts and others whose statements carry no gross profit. The screen leaves them out by default (its choice for missing values); kept, they are marked.
- Smiths Group has no return on common equity: Yahoo has no balance sheet for July 2025, so its year to July 2026 has no opening equity, and an older year does not stand in. IHG's common equity was negative at both ends of 2025: not meaningful, so it fails.
- Rolls-Royce passes with 644%: it began 2025 with common equity of −£912m and ended it at £2,726m, so the average is a small £907m. That is the paper's definition (net income over average common equity); the figure is shown as it comes out.
- British American Tobacco, FY2025: gross margin 21,384 / 25,610 = 83.50%, return on common equity 7,677 / ((47,926 + 49,643) / 2) = 15.74%. It fails the second criterion.
- Experian has no P/E: Yahoo has no diluted EPS for its year to March 2026. Compass (CPG.L) and IHG (IHG.L) are quoted in dollars and Metlen in euros, so the Results tab marks their Price:D-1 and leaves its average blank when the rows mix currencies; market values are all in pounds.
- Total Return YTD is worked out from Yahoo's daily closes and dividends. Yahoo's own adjusted close is not used: for London lines it moves by a hundredth of each dividend, as if the pence were pounds. Every member's dividends this year were between 0.2% and 15% of the close before, so they are in the price's own units.
- Overnight Yahoo leaves the latest session's daily bar without a close; the app takes the chart's own latest price for that day (`ee4f2ad`).
- From a shared cloud address Wikipedia's API often answers HTTP 429; the screen says so and asks again each minute (the app waits at least a minute after a 429), and the list loaded on a later try. The app keeps each answer a day, so a running app asks for the list (two requests) once a day.

MPC, on Tiingo's adjusted closes of the 20 stocks (all complete from 3 January 2012 to 30 December 2016, no day carried) and DTB3, back-test from 2 January 2013, half spread 0.05%, borrow 0.01% a day:

| Test | App | Dissertation |
| --- | --- | --- |
| Hold: annual return, excess return, excess risk, Sharpe, max drawdown | 12.155, 12.042, 14.141, 0.852, 17.766 | 12.379, 12.264, 14.199, 0.864, 17.759 |
| Horizon 0, 10, 50, 100, 250: Sharpe | 0.11, −0.15, −0.27, −0.29, −0.30 | 0.40, 1.23, 1.65, 1.60, 1.81 |
| Horizon test: max drawdown (%) | 47.76, 59.42, 60.75, 61.31, 61.71 | 33.03, 20.48, 21.10, 21.07, 14.55 |
| Dollar neutral, risk aversion 1 to 50: Sharpe | −1.05, −0.88, −0.64, −0.57, −0.57 | 1.49, 1.65, 1.46, 1.44, 1.45 |

The Hold policy needs no forecast and matches closely; the small gaps fit different data vendors and the risk-free basis. The MPC policies, with forecasts from past returns only, lose money on these stocks: the rolling mean of the last 250 days is a poor forecast of the next day's return, and leverage of up to 3 magnifies its errors. The dissertation's high Sharpe ratios are consistent with forecasts that already contained the returns being forecast (error 8). The engine itself agrees with cvxpy on every test problem to within 2e-6, and its multi-period answer equals cvxpy's full H-period plan.
