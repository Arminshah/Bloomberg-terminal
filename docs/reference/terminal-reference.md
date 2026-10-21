# Terminal reference: screen-by-screen targets

Written 20 October 2026 from the owner's reference material (an Equities Workflow guide, getting-started and
Launchpad guides, a training manual, valuation and WACC tutorials, a market-data manual, a newsroom guide, a
fixed-income index guide and a portfolio guide, 13 documents with about 70 screen images). This file describes,
in our own words, what each reference screen shows, so Armin Terminal's screens can match their layout, controls
and behaviour. The app keeps its own name; it never shows the other product's name, logo or a login screen (the
app is for private use and has no accounts). Data comes from the app's own sources; a field no source gives
stays blank rather than invented.

Status per function: **have** (screen exists; differences listed), **new** (to build), **no data** (no free
source; built only as far as data allows, or left out).

## Shared chrome

- **Panel toolbar** (top of each panel): back/forward arrows, the loaded security as a dropdown ("APPLE INC
  Equity ▾"), the function as a dropdown ("WEI ▾"), "Related Functions Menu ▾", then at the right Message,
  favourite star, layout/expand icons and a yellow "?" help key.
- **Command line** below it: a blue block cursor where typed text appears, and a "<Search>" box at the right.
- **Autocomplete**: a dark dropdown grouped in sections with amber headings: FUNCTIONS (mnemonic in white, its
  title in amber, the matching words emphasised; "More Functions…" link), SECURITIES (ticker with yellow-key
  class, e.g. "AAPL US Equity", and the name in amber; "More Securities…"), SEARCH ("SEARCH <text>" entries).
  Typing a ticker alone offers "SEARCH AAPL", "AAPL US Equity DES", "… CN", "… GP", news searches.
- **Function header**: the loaded security in an amber box at the far left ("GOOG US Equity"), then on the red
  bar dark-red buttons with numbers and dropdown arrows ("96) Actions ▾", "97) Export ▾", "98) Settings ▾",
  sometimes "94) Suggested Charts ▾", "98) Report", "99) Contact IR"), and at the right "Page 1/5" when paged,
  a small launch icon (⧉) and the function's title in white ("Security Description: Equity", "Financial
  Analysis", "World Equity Indices"). The mnemonic is not repeated in the bar.
- **Inputs**: amber (orange) fields with black text for editable values and dropdowns (security, periodicity,
  currency, dates), with a small ▾. Check boxes and radio buttons in white on black.
- **Tabs**: grey tab strips with numbered labels ("1) Key Stats", "2) I/S"); the selected tab lighter; a second
  row of sub-tabs where the selected one is blue.
- **Text colours**: labels amber/orange; figures white; security and company names cyan (in headers) or amber
  (in lists); section headings white on dark grey bands; numbered items "11)" before row labels; positive
  changes green, negative red; links "Name | MNEMONIC »".
- **Font**: a proportional sans with even-width figures, slightly bold, on a pure black ground.
- **Security menu** (loading a security with GO and no function): "Main Menu > Equities > Analyze APPLE INC
  Equity" breadcrumb, then numbered categories with ">" and numbered functions under each: Company Overview
  (DES, CN), Company Analysis (FA, OWN/HDS), Research & Estimates (MODL, DS, BICO), Comparative Analytics
  (EQRV, RV), Charting & Reporting (GP, GF), Security Surveillance (EVT, BQ), Trade Analytics (VWAP, depth),
  Derivatives (OMON). A favourite arrow marks common ones.
- **Quote line** under a security's tabs: ticker, currency, last with a source letter, net change, a small
  sparkline, bid/ask with size, then "On <date> Vol … O … H … L … Val …".

## Market and portfolio monitoring

- **W, worksheets** (have WATCHLIST): left rail of worksheet folders; a library table (No., Name, Last
  Opened); a worksheet is a grid of securities with chosen columns (last, change, ratios, estimates, inline
  range bars), grouped sections with collapsible headings, right-click to insert/replace rows and columns,
  formulas, Export. Differences: ours has lists and column choice; no library rail, groups or formulas.
- **WEI, world equity indices** (have MARKET): bar with "News ▾ Settings ▾" and title. Amber region dropdown
  (Americas, EMEA, APAC, all) and check boxes Movers, Volatility, Ratios, Futures, ΔAVAT with a period, %Chg YTD,
  currency. Numbered region headings "1) Americas", rows numbered "11) DOW JONES" with the index name in amber,
  a two-day sparkline, Value, Net Chg, %Chg with a small coloured bar, ΔAVAT, Time, Adv/Dcl, %Ytd, %YtdCur.
- **WEIF** (have), **WBF, world bond futures** (new: bond futures in price or yield).
- **WATC, watchlist analytics** (new): an index or list, Refine By / Group By bars, "As of" date, tabs
  Overview, Returns, Valuation, Estimates, Actuals, Credit, Technicals, Custom; summary rows for the universe;
  members with metrics and sortable columns.
- **IMAP, intraday market map** (have HEATMAP as a treemap): a sunburst pie of the index by sector (inner ring)
  and members (outer ring), coloured by % change, sized by weight; drill down by clicking a segment; Region /
  Sector toggle; Market Cap filter; tabs "Pie Chart & Table", "Table", "Pie Chart"; a side list of sectors with
  %Chg bars and the share of members up.
- **MOV, index movers** (have CONTRIB): header block #Up/#Down/#Unch/Vol, Last/Net Chg/%Chg/Time,
  Open/High/Low; two tables Leaders and Laggards with Ticker, Price, %Chg, Points (index points contributed),
  Volume; Group By, time range, History.
- **MEMB, index members** (new): members with weights, shares, price, market value.
- **MOST, most active** (have MOVERS): left rail of filters (security type, sector, market cap range, exchanges,
  pre-market / regular / post-market, period trailing/today/previous day, display name or ticker, change in
  percent or net); tabs Volume, Chg Up, Chg Down, Value, ΔAVAT, 52Wk Highs, 52Wk Lows; columns Security, Last,
  %Chg, Volume with a bar, Vol 5', and the latest News headline per stock.
- **MRR / GRR, member / group ranked returns** (have RANKEDRETURNS, GROUPRETURNS): members or industry groups ranked by return over a period.
- **FTW, TLTS factors** (no data: needs factor models).
- **PORT** (have PORTFOLIO): workspace with tabs Intraday, Aggregate, Trend, TEV, VaR, ESG, Attribution; a
  topline summary (Market Value, Div Yld, P/E, P/CF, P/B, Debt/Equity, Current Ratio, ROE) for portfolio vs
  benchmark with Diff; top/bottom sector difference bars; classification table by sector.

## News and events

- **TOP** (have MARKETNEWS): sections Top News, Featured Stories, Bloomberg Editorials-like opinion, Columnists,
  each numbered with source code and time; right column Spotlight and Top Research; category check boxes at the
  bottom (Newsletters, Deals, ESG, Finance, Eco & Gov, Tech, Sports).
- **CN / NI / NEWS ON / NH** (have COMPANYNEWS, NEWS): "Search News ▾ Actions ▾ Custom Searches ▾ Translate ▾"
  bar; amber query chips ("Match All ▾", topic, "china in Headlines"); "My Sources ▾", "All Dates ▾", "Time";
  sections Top Ranked News and Time Ordered News; numbered headlines with source code and time at the right.
- **NLRT, NSUB, FIRS** (new / no data: saved searches can be local; curated subscriptions and First Word are not
  available).
- **EVTS, events calendar** (have EVENTS): bar "Saved Searches ▾ Alerts ▾ Export ▾ Settings"; amber search
  "US Earnings Next 30 Days"; chips (Earnings Release ×, Earnings Call ×, United States ×); left rail: securities
  input, date presets with Start/End, event type check boxes (Earnings Call, Earnings Release, Sales Result,
  Dividends, Conferences, Investor Day, Capital Markets Day, Shareholder Meetings, Corporate Access, Analyst
  Marketing, Deal Roadshow, Other); List / Weekly / Monthly; Group By Date; count of events; rows grouped by date
  with Company, an icon, Description ("Q3 25 A:0.45 E:0.374 S:20.3 G:--" for results: actual, estimate,
  surprise, guidance), Date, Time and resource icons.
- **ECO, economic calendar** (have RELEASES): bar "Calendars ▾ Alerts ▾ Export ▾ Settings ▾"; country with flag,
  Browse, clock; date range; "Economic Releases ▾", "All Economic Releases ▾"; View Agenda / Weekly; columns Date
  Time, A (alert), M (market-moving), R (relevance bars), Event, Period, Surv(M), Actual, Prior, Revised, C
  (country); numbered rows.
- **DS, document search** (have DOCSEARCH): the SEC's full-text search of filings and exhibits since 2001, by company, form and dates, with the sentences where each document matches.

## Financials and earnings

- **DES** (have PROFILE): tabs Profile, Issue Info, Ratios, Revenue & EPS, ESG; buttons "98) Report", "99)
  Contact IR"; company name in cyan, identifier at right, classification; description in amber with "More".
  Boxes: "8) Price Chart | GP »" (one-year chart, then Px/Chg 1D, 52 Wk H/L with dates, YTD Change/%, Mkt Cap,
  Shrs Out/Float, SI/% of Float, Days to Cover); "9) Estimates | EE »" (Date (E), P/E, Est P/E, T12M EPS, Est
  EPS, Est PEG); "12) Dividend | DVD »" (Ind Gross Yield, Cash <date> amount); "13) Corporate Info" (website,
  city, employees with date); "15) Management | MGMT »" with numbered officers and titles; 12M Tot Ret; Beta vs
  index; Depositary receipts. No news on the page.
- **FA** (have FINANCIALS): bar "96) Actions ▾ 97) Export ▾ 98) Settings ▾"; controls Periods (number), Annuals
  ▾, Cur ▾; tabs 1) Key Stats 2) I/S 3) B/S 4) C/F 5) Ratios 6) Segments 7) Addl 8) ESG 9) Custom; sub-tabs
  (adjusted, GAAP, as reported); header rows "In Millions of USD except Per Share" and "12 Months Ending" with
  year labels (2023 Y) and period ends, then estimate columns (2024 Y Est); rows indented with + / − signs and a
  chart icon at the left; key lines in amber, sub-lines white; bottom bar << < > >> and "Earnings: <date> | EVTS
  »".
- **GF** (have FUNDCHART): fields and securities in amber boxes at the right; period and range buttons; layout
  toggle.
- **DVD**: summary block (12 Month Yield Net/Gross, 1/3/5 Yr Dividend Growth, Last Price, Payment Frequency),
  Net/Gross toggle, chart of dividends and yield; Type filter; table Declaration, Ex Date, Record, Payable, Curr,
  Declared, Gross, Frank %, Type (Final, Interim, Special, rights).
- **CACS, corporate actions** (new): Actions for Company ▾, Announced/Effective date range, Filter Actions
  (Dividends, Splits, M&A, IPO/ADDL, Listings), count; table Effective Date, Action Type, Ticker, Summary.
- **BBK, buybacks** (have BUYBACKS): repurchases from the cash-flow statement, shares bought back, average price, authorization, yields.
- **HDS** (have HOLDERS): tabs Current, Historical, Matrix, Ownership Summary, Insider Transactions, Options,
  Issuer Debt; search/filters; Shrs Out, % Out, Float/Shrs Out, SI % Out; table Holder Name, Position, % Out,
  File Dt, Est. Holding Period, Portfolio Name, Source (13F, ULT-AGG), Opt, Latest Chg.
- **EEO, earnings estimate overview** (new): Periodicity, Source, Cur, Guidance check box; tabs Headline,
  Headline Growth, Company-Specific; columns per fiscal year: last actual, then estimates each with the number of
  analysts; rows EPS Adj+, EPS GAAP, Revenue, Gross Margin %, Operating Profit, EBIT, EBITDA, Pre-Tax Profit,
  Net Income Adj+, with up/down revision arrows; Current Multiples section (Price/EPS, Price/Book, Price/Cash
  Flow, EV/Revenue, EV/EBITDA, EV/EBIT, Dividend Yield) for last 4 quarters actual, next 4 quarters estimate and
  fiscal years.
- **ERN** (have EARNINGS): Periodicity, Source, Cur; "Surprise for more measures" and "Earnings History & Price
  Reaction | EE SURP"; Measure ▾ (EPS Adj+), Px Chg Window ▾ (One Day After), Chart Type ▾ (Comparable vs
  Estimate); Earnings/Surprise Snapshot: Industry, Next Announcement, Prior Announcement, P/E Actual, 5 Year
  Growth, Earnings Trend; Exp. for Next Period, Average Surprise, Average Abs. Surp, Surp/Px Chg Corr., Average
  Abs. Px Chg, Implied 1 Day Move; a chart of comparable vs estimate; table Ann Date, Per, Per End, C, Reported,
  Comp, Estimate, %Surp, Guidance, %Guid Surp, %Px Chg, P/E, with an "Average of Absolute Values" first row and
  future periods' estimates above the reported ones.
- **SPLC** (have SUPPLYCHAIN): Suppliers/Customers, Summary tab with suppliers at the left, customers at the right
  and company-reported competitors below, each box with Rev/COGS/CAPEX shares and an info mark; the company in the
  middle with revenue and costs quantified; Source, Filter By, Sort By (Company Exposure), Color Coding (Latest
  Sales Surprise %), Peers. Built from SEC filings: the shares companies disclose, not estimated COGS or capex.
- **EEG, GUID, MODL, KPIC, ALTD** (no data or partial: no free contributor history, guidance, models, KPIs or
  alternative data).
- **EQS** (have SCREEN): bar "Formula Actions ▾ Backtest"; As Of date; left My Recent Screens and Popular
  Screens (numbered); Screening Criteria categories (Exchanges, Sectors, Country, Indices, Portfolios, Equity
  Screens); Add Criteria amber box with Fields; Selected Screening Criteria with Matches per step and remove
  icons; "See Results" and WATC link.
- **FLDS** (have FIELDS): field mnemonic, description, overrides list.

## Economic forecasts and capital markets

- **ECFC, CPFC, FXFC** (no data for contributor forecasts; FXFC forwards are computable).
- **WIRP** (have RATEPROBS): left rail of models by region (US Fut, US OIS, EZ OIS…) with next meeting and
  %Hike/Cut; target and effective rate, pricing date; table Meeting, #Hikes/Cuts, %Hike/Cut, Imp. Rate Δ, Implied
  Rate, A.R.M.; bar chart of implied rate and hikes/cuts.
- **GC** (have CURVE): curve picker, X/Y axis choice, currency, relative dates (Last, 1D, 1W, 1M), Table toggle;
  curve chart; table of tenors.
- **CRPR** (no data: agency ratings are licensed).
- **DDIS** (have DEBTPROFILE): facets (asset class, country, currency), chart of amounts by maturity year
  stacked by currency, table and summary (total debt, issues, weighted coupon, maturity).
- **BTMM** (have MONEYMARKET): a dense grid of boxes: Fed funds, Fed O/N repo, T-bills, deposit rates, reverse
  repo, commercial paper, Dow, S&P futures, Nasdaq composite, CRB, US bonds with price and yield, SOFR futures,
  FRAs, SOFR OIS swaps, 10Y note future, FF futures, commodities, MBS, economic releases at the bottom.
- **EQRP, equity risk premium** (new): Period ▾ with date, currency; Country/Region data (Expected Market
  Return, Risk Free Rate, Country Risk Premium) and Equity data (Beta, Equity Risk Premium); historical graph.
- **WACC** (have): cost of equity (risk-free, beta, premium), cost of debt (pre/after tax), weights and WACC.
- **IPO** (have IPOS): offerings priced, expected, filed and withdrawn by period, money raised against a year earlier, first-day and since-offer returns, best and worst. **MA** (no data: deal terms are licensed).

## Research and valuation

- **ANR** (have ANALYSTS): Consensus Rating score, Buys/Holds/Sells with % and count, 12M Tgt Px, Last Price,
  Pricing Currency, Return Potential, LTM Return; chart of target vs price with stacked buy/hold/sell bars;
  table Firm, Analyst, Recommendation, Tgt Px, Date, 1 Yr Rtn, rank.
- **RV** (have PEERS): Comp Source, Index, Curr; segment revenue bars; mini chart of multiple vs comps; tabs
  Overview, Comp Sheets, ESG, Markets, EPS Preview, Ownership, Credit, Custom; table Name, Mkt Cap, Last Px, Chg
  Pct 1D, Chg Pct 1M, Rev 1 Yr Gr, EPS 1 Yr Gr, P/E, ROE, Dvd 12M Yld.
- **EQRV** (have PEERS): current vs historical premium to comps per multiple with range dots.
- **MRV** (new where data allows: index valuation comparison).
- **GP / GPC / GPO / GIP / G** (have CHART; G new): date range, Last Px, Local CCY, Mov Avgs, Key Events, Table;
  legend with values; dual axes; saved charts library.
- **COMP** (have RETURNS): range, period, securities in amber rows with currency, Price Change, Total Return,
  Difference, Annual Eq; period buttons; chart.
- **TRA** (have TOTALRETURN): buy/sell date and price, shares, currency, total dividends, gross/net, holding
  strategies (price change, reinvested in security, reinvested at a rate) with Total Return, Annual Eq,
  Gain/Loss; dividend event markers; cumulative return area chart.
- **HS** (have SPREAD): two securities, data, multipliers, calculation; spread chart with high/low; spread
  summary (last, mean, median, st dev, percentile, high/low with dates); histogram.
- **BETA** (have).
- **SI, short interest** (new): date range; Short Interest, Short Interest Ratio, % Float and their changes;
  chart of price and short-interest ratio; short interest; average daily volume.
- **OPX** (no data for open interest by strike).
- **GV / HVG** (have VOLATILITY): implied vs historical volatility lines.
- **MLRT, market alerts** (have ALERTS): New Limit Alert row (security, Last Trade ▾, condition, value, current
  price, expiration days, note); table Last, Securities, Alert Conditions, Limit, Notes, Delivery icons.
