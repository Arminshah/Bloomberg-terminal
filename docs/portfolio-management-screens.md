# Portfolio-management screens

This is the build reference for the screens and figures in the two papers of the portfolio-management upload (`docs/portfolio-management-plan.md`): the equity research report of March 2019, a FTSE 100 portfolio built with a market terminal and a spreadsheet, and the MSc dissertation of August 2019 on model predictive control for portfolios. It records each screen's layout, labels, order, formats and chart types, so the app's own screens can follow them.

What it leaves out, because the repository is public:

- The provider's data. A field has at most one short value, as a format example. There are no analyst, holder or peer lists, no headlines and no news or research text.
- The footer's phone numbers, copyright line and session codes. The document only says where the footer is.
- The students' tables in full. Their labels and layout are here, with a few example values.

The figure-by-figure transcription with every visible value is in `reference/portfolio-management/screens-full.md`, which Git ignores, beside the source PDFs.

How to read it:

- Text in `code` is copied from the screen, with its spelling, spacing and signs. `▾` marks a drop-down and `n)` a numbered button.
- Amber is the label colour, white the value colour, cyan the company-name colour. Hex values were sampled from the captures.
- "Report Figure 2.4" is in the equity report, "dissertation Figure 5.5" in the dissertation. Captions are quoted as printed.
- Where a label names the provider or one of its products (the `BI` research badge, the `BICS` classification, the footer, promotional banners), it is recorded to explain the layout. The app uses its own names and assets.
- The typefaces in the captures (the terminal's, the spreadsheet's, the plotting library's) are observations only. The app's faces are fixed in `CLAUDE.md`, and nothing here changes them.

The title-page logos and report Figure 0.1 (a photograph) have nothing to build.

## Shared screen elements

Used by every terminal capture in sections 1 to 7.

### Quote header

Two lines above the function bar.

Line 1, left to right:

1. Ticker, white (`BATS LN`).
2. Pricing currency, grey (`GBp`).
3. Flags where present: `XD` in red (ex-dividend), `AT` in amber on some captures.
4. Tick arrow: green `↑` for an up-tick, red `↓` for a down-tick. Its colour does not follow the day change.
5. Last price and net change: green when the day is up, red when down, white when unchanged (the change then reads `--`). Example `2635.00`, `+3.00`.
6. An intraday sparkline: white line, the latest part red or green.
7. Bid and ask with exchange markers, `L2634.50 / 2635.00L` (the `L` letters and slash grey).
8. Bid size and ask size, `185 x 79` (grey `x`).

Line 2: a signal-strength icon, a yellow (`#FFE100`) gauge icon, `At hh:mm d` (time of the last trade, `d` for delayed; `At` amber, time grey), then amber labels with white values: `Vol` (`1,347,889`), `O`, `H` and `L` (prices with a grey trailing `L`, `2656.50L`), `Val` (traded value, `3.544B`, or `M` for millions).

The March captures add a small blue square at the far left of line 1 (window marker) and a small green and white window icon at the far right of line 2.

### Function bar

Full width, dark red `#870F1E`. At the left, the security load box: amber with black text (`BATS LN Equity`, `UKX Index`). Then the function's menu buttons, white on red, numbered on some functions (`96) Actions ▾`) and not on others (`Export ▾`), with black 2-pixel dividers. At the right, the function's title in white (`Financial Analysis`). A button that cannot be used is dark maroon (`#3D0B25`) and barely visible.

### Message line

Some captures have one line above the function bar, white, large fixed-pitch text on black:

- `1 <GO> for Results, 89 <GO> to see last unsaved screen`
- `Screen saved successfully, <Back> to Return`
- `<Back> to Return`
- `Theme (*) has been changed, 18<GO> to Save Template, <Back> to Return`

The index description has `Backpage` at the far left of that line instead.

### Tabs and panels

- Tabs are trapezoids with a slanted right edge. Unselected: dark grey `#464646`, light text. Selected: lighter grey `#9E9E9E`, dark text.
- A second row of sub-tabs sits on a grey strip. Its selected sub-tab is blue with white text.
- Panel title band: dark grey, grey button number, white title, then `| CODE »` when the panel links to another function (`8) Price Chart | GP »`).
- A focused panel or box has a thin white outline.
- Dimmed state, when another panel has focus or a table is being edited: labels turn grey, inputs turn beige or grey, menu buttons turn dark red on red.

### Colours that carry meaning

| Use | Colour |
|---|---|
| Labels, row labels, input boxes | amber `#FFA028` (Key Insights body text `#FF9E24`) |
| Values | white |
| Company name in titles, the subject row in tables | cyan `#40ECFF` |
| Rise, up arrow | green `#35D655` |
| Fall, down arrow, `XD` | red `#FF2C4A` |
| Links | blue `#53B2F5` |
| Light text | light grey `#D7D7D7` |
| Dates and secondary text | grey `#787878` |
| Separator rules | `#2D2D2D` |
| Selected list row | navy `#0C2B49` |
| Sorted column | amber header text ending in `↓`; on relative valuation the whole column is dark navy |

### Footer and news ticker

- The captures of 31 January 2019 end with a three-line footer in white fixed-pitch text: the provider's sales phone numbers, its copyright line, and a session line with the capture date and time (`dd-Mmm-yyyy hh:mm:ss`). The app does not copy it. The capture dates in this document come from it.
- The March captures have no footer. In its place: a dark blue bar with `300) Edit Panel` and `301) Expand Panel` at the right (numbers grey, words white), then a three-line news ticker in amber fixed-pitch text on dark navy (`#00123E` header, `#000A2C` body), each line `<story no> <source code> <hh:mm> <headline>`. Source codes are white, grey or red-orange. "First word" headlines are upper case, start with `*` and may have no story number.
- A few captures add a promotional banner under the ticker: black, bold coloured text, and a coloured block at the right holding a function code.

The March captures also use a larger screen font than those of 31 January. The app keeps its fixed faces either way.

Capture dates: the screening, BATS and GSK screens are from 31 January 2019, except report Figures 2.8 and 2.11. The RB and DGE screens are from the evening of 4 March 2019 and the next trading morning (about 5 March).

## 1. Screening (EQS)

Report Figure 1.2 (criteria page) and Figure 1.3 (results), both 31 January 2019.

### Criteria page

Top to bottom:

1. Message line `1 <GO> for Results, 89 <GO> to see last unsaved screen`.
2. Function bar: `97) Formula`, `98) Actions ▾`, `99) Backtest`; title `Equity Screening`.
3. Under the bar at the right: amber label `As Of`, an amber date box (`01/31/2019`, `MM/DD/YYYY`, black text) and a calendar button.
4. Body: a left sidebar (about a fifth of the width, then a grey vertical scrollbar strip) and the main area.

Left sidebar:

- Band `My Recent Screens`: nine saved screens numbered `11)` to `19)` (grey number, amber name), then `20) All Saved Screens` in white (a link, not a screen).
- A blank line.
- Band `Popular Screens`: six ready-made screens numbered `21)` to `26)` (long names cut with `...`), then `30) More Screens` in white.

Main area, top to bottom:

1. Band `Screening Criteria`, then six category buttons in three columns (grey number, amber label):

   | Column 1 | Column 2 | Column 3 |
   |---|---|---|
   | `31) Exchanges` | `32) Sectors` | `33) Country of Domicile` |
   | `34) Indices` | `35) Portfolios/Monitors` | `45) More Categories` (white) |

2. Band `Add Criteria`, then a wide amber text input and a grey button `3) Fields`.
3. Empty space.
4. The selected-criteria table, with a thin grey border. Header band columns: row number (no header), drag handle (no header), `Selected Screening Criteria`, `Matches`, info icon (no header), delete icon (no header).
5. Under the table at the right, a grey button `1) See Results | WATC »`.

Rows of the criteria table, as in the figure:

| Number | Handle | Criterion | Matches | Info | Delete |
|---|---|---|---|---|---|
| none | none | `Security Universe` (white) | size of the universe | | |
| `51)` | grip | `Trading Status: Active` | running count | | red circled ⊗ |
| `52)` | grip | `Indices: FTSE 100 Index` | running count | | red circled ⊗ |
| `53)` | grip | `LF Gross Margin > 25` | running count | white circled `i` | red circled ⊗ |
| `54)` | grip | `LF Return on Common Equity > 25` | running count | white circled `i` | red circled ⊗ |
| `55)` | none | `Add screening criteria` (white; the add row) | | | |

- Criteria are amber and read `<category>: <value>` or `LF <field> <operator> <value>` (`LF` is the latest filing).
- `Matches` is white, right-aligned, a plain integer without separators (`1055919`). Each count is what is left after that row and every row above it.
- The grip is a small grid of dots. The info icon appears only on rows that test a fundamental field.

### Results view

The screen shown after the screen is saved (watchlist analytics). Top to bottom:

1. Message line `Screen saved successfully, <Back> to Return`.
2. Header bar: a tan drop-down `Equity Screen ▾`, a tan drop-down `Universe: <screen name> ▾`, red menu buttons `Actions ▾`, `Export ▾`, `Settings ▾`; title `Watchlist Analytics`.
3. Amber `Screen Name` and the name in white.
4. One line: amber `Refine By` with an amber input `<Countries, Sectors, etc.>` and a magnifier; amber `Group By` with the drop-down `Securities ▾`; a disabled grey checkbox `Show Hi/Lo`; amber `As of` with a date box and a calendar button.
5. Tab row, in order: `Overview`, `Returns`, `Valuation`, `Estimates`, `Actuals`, `Credit`, `Technicals`, `Custom`, `Results` (selected in the figure).
6. A light grey sub-tab strip with one blue tab, `Page 1`.
7. The grid: black, thin grey vertical dividers, empty below the last row.

Grid columns, in order (headers white on dark grey, right-aligned except `Name`):

| # | Header | Format |
|---|---|---|
| 1 | none | row number, grey (`31)`) |
| 2 | `Name` | upper case, long names cut with `...` |
| 3 | `GM LF↓` (sort column: amber header, `↓` for descending) | two decimals and `%` (`48.40%`), with a bar |
| 4 | `ROE LF` | two decimals and `%` |
| 5 | `Market Cap` | two decimals and `B`, no currency (`60.37B`) |
| 6 | `Price:D-1` | two decimals, no separator, no currency (the figures are pence) (`2632.00`) |
| 7 | `P/E` | two decimals |
| 8 | `Total Return` / `YTD` (two lines) | two decimals, no `%`, a minus for falls and no plus (`-0.70`) |

Rows under the header:

1. Filter row: an amber bar across the data columns. The sort column's cell reads `<Enter Filter>`.
2. Summary row, white: `Investable Universe (11)`, the label ending with the row count. Each value is the plain mean of the rows below, in the column's format (checked on all six columns).
3. A blank spacer row.
4. Data rows, numbered from `31)`, in sort order. Names and all values are amber, falls included (no red).

The bar: every cell of the sort column, the summary row included, has a solid green horizontal bar at its left, its length in proportion to the value.

## 2. Security description (DES)

Report Figure 0.2 (index, page 1); Figures 2.1, 2.10, 2.18 and 2.26 (equity page 1, Profile); Figures 2.2, 2.11, 2.19 and 2.27 (equity page 2, Issue Info). Pages 3 to 5 do not appear in the papers.

### Index description (Figure 0.2)

- Top line `Backpage`. No quote header.
- Function bar: load box `UKX Index`; at the right a small `Page 1/2` and a larger `Security Description: Index`.
- Tabs: `1) Profile` (selected), `2) Characteristics`.
- Title line: the index name in cyan; at the right, amber `FIGI` and the identifier.
- Description: an amber paragraph across the full width (five lines).
- Then two columns.

Left column:

1. Band `3) Price Chart | GP »`. A one-year daily mountain chart: white line, teal to navy gradient fill, black ground; month labels along the bottom with the year under `Jul` and `Jan`; price axis at the right (`7000`). No legend, volume, averages or range buttons.
2. Period table, header band `Period`, `Level`, `% Change`, `Net Change`. Rows: `Year to Date`, `52 Week Ago`, `52 Week High`, `52 Week Low`. Level with two decimals (`6728.13`); changes signed with two decimals, green or red (`+1.57`, `+105.80`). The high and low rows have no changes: their date follows the level in brackets (`(05/22/18)`) and runs into the next column.
3. Band `4) Financial Analysis | FA »`, then a grid of two label and value pairs per line: `P/E` and `Ex-Dividend`; `Positive P/E` and `T12 Div Yld` (two decimals).

Right column:

1. Band `Index Information`, then label and value rows: `Volume` (with its date, `663.23MLN (01/28/19)`), `Market Cap` (`1.82TRI`), `Divisor` (`N.A.`), `Trading Hours` (`15:00 - 23:50`), `Currency` (`GBP`), `Composite Vol` (`1.24BLN`) with an amber button on the same line, `5) <composite volume ticker>`. Units are written `MLN`, `BLN`, `TRI`.
2. Members line: amber `6) Members | MEMB »`, the member count in white, then green `↑n` (rising), red `↓n` (falling), grey `→ n` (unchanged).
3. A white line `No Industry Groups`.
4. Band `8) Movers | MOV »`. Header `Leaders`, `% Chg`, `Laggers`, `% Chg`. Four rows, buttons `9)` to `12)` for leaders and `13)` to `16)` for laggers. Ticker and exchange code amber; change signed with two decimals, green for leaders, red for laggers.

### Equity description: frame

- Quote header.
- Function bar: load box, red `98) Report`; at the right a small `Page 1/5` and a larger `Security Description: Equity`.
- Tabs, in order: `1) Profile`, `2) Issue Info`, `3) Ratios`, `4) Revenue & EPS`, `5) Industry Info`. The page number follows the tab (`Page 2/5` on Issue Info).

### Page 1, Profile

Above the panels:

1. Name line: the company name in cyan, upper case; at the right, amber `FIGI` and the identifier in white (12 characters, `BBG000BG9N74`).
2. White `6) BI Research Primer | BICO »` (a link to the provider's research primer); at the right, amber `Classification` and the industry in white (`Tobacco`).
3. The business description in amber, two to four lines, ending `... More` with `More` in grey (it expands the text). On report Figure 2.26 the description sits in a white-outlined box.

Then three columns of panels.

Left column:

1. `8) Price Chart | GP »`: a one-year daily mountain chart (white line, dark navy fill), month labels with the year under the middle month and January, price axis at the right. No legend, volume, averages or range buttons.
2. Key data, labels amber, values white and right-aligned:

   | Label | Format |
   |---|---|
   | `Px/Chg 1D (GBp)` | price / day change, no zero before the point (`2614.50/-.66%`) |
   | `52 Wk H (MM/DD/YY)` | the date of the high is in the label (`1648.80`) |
   | `52 Wk L (MM/DD/YY)` | as above (`5255.00`) |
   | `YTD Change/%` | `174.50/6.24%` |
   | thin divider | |
   | `Mkt Cap (GBP)` | millions with a separator (`41,934.9M`) |
   | `Shrs Out/Float` | `4,964.5M/4,962.3M` |

3. An amber note on two lines: `No short interest information` / `available from exchange.`

Middle column:

1. `9) Estimates | EE »`, three columns (label, qualifier, value):

   | Label | Qualifier | Format |
   |---|---|---|
   | `Date` | `(C)` or `(E)` (probably confirmed or estimated); one capture adds a time | `07/30/19` |
   | `P/E` | | `38.92` |
   | `Est P/E` | fiscal period `MM/YY` (`12/18`) | `22.97` |
   | `T12M EPS` | `(GBP)` | `3.07` |
   | `Est EPS` | | `1.15` |
   | `Est PEG` | | `3.19` |
   | `EU SSR Liquid` | | `Y` |

2. `12) Dividend | DVD »`: `Ind Gross Yield` (`5.44%`), `5Y Net Growth` (two decimals, one decimal on one capture), `Cash MM/DD/YY` (the label holds the date, the value has two decimals, `100.20`).
3. A blank line, a thin divider, `Round Lot` (`1`).

Right column:

1. `13) Corporate Info`: `14) <web address>` as a blue link; the head office in amber (city and country); amber `Empls` with the head count and its date in white (`91,402 (12/31/17)`).
2. `15) Management | MGMT »`: three people, `16)` to `18)`, the name in amber (long names cut with `...`) and the job title in grey on the line below.
3. A thin divider, then `12M Tot Ret` (`-42.47%`) and `Beta vs UKX` (`1.02`).
4. `21) Depositary Receipts`: `Active Receipts` (`2`).

### Page 2, Issue Info

Public Offerings across the left two columns at the top, Inst Holdings at the top right; below them Issue Information (left), Eq Wgts and Option (middle), Insider Holdings and Top Holders (right); then an empty strip.

1. `6) Public Offerings | CACS »`: either the centred amber message `Public offerings are not available.`, or a table with `7) More` at the right end of the band. Headers amber: `Date`, `Shares`, `Price`, a flags column without header, `Lead Manager`. Values white: date `MM/DD/YYYY`, shares (`44.00M`), price with its currency and cut (`GBp 1780....`), flags `F C` in amber, the lead manager cut with `...`. Under the rows: a blank line and amber `IPO` with the date in white.
2. `8) Inst Holdings | OWN »`: `# of Inst. Owners` (`1,146`), `Shares Owned` (`2.45B`), `Shares Out/Float` (`87%/87.1%`), `# of Buyers/Sellers` (`312/250`), `Shares Bought` (`160.10M`).
3. `9) Issue Information | RELS »`: label and value pairs, up to three per line, labels amber, values white:

   | Line | Content |
   |---|---|
   | 1 | `Sec Type` (`Common Stock`) |
   | 2 | `Pri Exch` (`London`), `PAR`, the par currency in amber (`GBp`), the par value |
   | 3 | `Pri MIC` (`XLON`), `Lcl Mic` |
   | 4 | `Incorp` (`BRITAIN`) |
   | 5 | `Segment` (`SET1`), `Sector` (`FE10`), `NMS` in amber and its value (`.30`) |
   | 6 | `FIGI` |
   | 7 | `ISIN` |
   | 8 | blank |
   | 9 | `SEDOL1` (code and country, `0287580 GB`), `WPK #` |
   | 10 | `Common`, and on some securities `Sicovam` |

4. `10) Eq Wgts | WGT »`: ten rows `21)` to `30)`, button number grey, index code amber, the security's weight in that index white with three decimals and `%` (`3.403%`) or `N.A.`. The indices listed depend on the security. Then the band `13) Option | OMON »` and amber `Options Available`.
5. `11) Insider Holdings | OWN »`: `% Held by Insiders` (`0.06%`), `Net Change Last 6M`.
6. `12) Top Holders | HDS »`: a white line `as of MM/DD/YYYY`, then seven holders, the name in amber (cut with `...`) and the holding in white with two decimals and `%`.

## 3. Financial analysis (FA)

Report Figures 2.3, 2.12, 2.20 and 2.28 (Key Stats, Adj Highlights); 2.4 and 2.13 (Segments, By Measure); 2.21 and 2.29 (Adj Highlights in graph mode).

### Frame

1. Quote header (Figure 2.4 has the message line `<Back> to Return` instead).
2. Function bar: load box, `96) Actions ▾`, `97) Export ▾`, `98) Settings`; title `Financial Analysis`.
3. Sub-header: a light grey `ADJ` badge (adjusted figures), the company name in cyan, mixed case. At the right: amber `Periodicity` with the drop-down `Annuals ▾` (on Segments: amber `Periods`, a box holding `16`, then `Annuals ▾`); amber `Cur` with `GBP ▾` or `FRC (GBP) ▾` (the reporting currency); a magnifier with a plus (field search).
4. Tab row 1, in order: `1) Key Stats`, `2) I/S`, `3) B/S`, `4) C/F`, `5) Ratios`, `6) Segments`, `7) Addl`, `8) ESG`, `9) Custom`.
5. Tab row 2 under Key Stats, in order: `11) Adj Highlights`, `12) GAAP Highlights`, `13) Earnings`, `14) Enterprise Value`, `15) Multiples`, `16) Per Share`, `17) Stock Value`.
6. Tab row 2 under Segments, in order: `11) By Measure`, `12) By Geography`, `13) By Segment`.

### Adj Highlights grid

- Black grid, the label column on dark grey, thin grey column dividers. The grid scrolls: rows continue below `Free Cash Flow`.
- Header row 1, white on dark grey: `In Millions of GBP`, then one header per period, `2017 Y` for a reported year and `2019 Y Est` for an estimate.
- Header row 2: `12 Months Ending`, then the fiscal year end as `MM/DD/YYYY` (`12/31/2017`; Diageo's years end on `06/30`).
- Seven period columns, five reported and two estimated, in one of two orders:
  - newest first (report Figures 2.3 and 2.12): `2019 Y Est`, `2018 Y Est`, `2017 Y` and back to `2013 Y`;
  - oldest first (Figures 2.20 and 2.28): `2014 Y` to `2018 Y`, then `2019 Y Est`, `2020 Y Est`.
- Reported columns are amber, estimate columns white, and the indented sub-rows grey in every column. Main row labels amber, sub-row labels grey and indented. Each row label has a small blue three-bar icon at its left (it charts the row).
- The selected cell has a white rectangular outline.
- Below the grid, grey paging buttons `<<`, `<`, `>`, `>>`.

Rows, in order:

| # | Row label | Kind | Estimate columns |
|---|---|---|---|
| 1 | `Market Capitalization` | money | blank |
| 2 | `Cash & Equivalents` | money | blank |
| 3 | `Preferred & Other` | money | blank |
| 4 | `Total Debt` | money | blank |
| 5 | `Enterprise Value` | money | blank |
| | blank spacer row | | |
| 6 | `Revenue, Adj` | money | filled |
| 7 | `Growth %, YoY` (sub-row) | percent | filled |
| 8 | `Gross Profit, Adj` | money | filled |
| 9 | `Margin %` (sub-row) | percent | filled |
| 10 | `EBITDA, Adj` | money | filled |
| 11 | `Margin %` (sub-row) | percent | filled |
| 12 | `Net Income, Adj` | money | filled |
| 13 | `Margin %` (sub-row) | percent | filled |
| 14 | `EPS, Adj` | per share | filled |
| 15 | `Growth %, YoY` (sub-row) | percent | filled |
| | blank spacer row | | |
| 16 | `Cash from Operations` | money | blank |
| 17 | `Capital Expenditures` | money, negative | filled |
| 18 | `Free Cash Flow` | money | filled |

Formats: money in millions with thousands separators and one decimal (`20,292.0`); percentages with one decimal and no `%` (`37.6`); EPS with two decimals (`2.70`); negatives with a leading minus (`-791.0`); an empty cell when there is no value.

These hold in every filled column of the four grids: Enterprise Value = Market Capitalization + Total Debt + Preferred & Other - Cash & Equivalents; each margin is its row over `Revenue, Adj`; Free Cash Flow = Cash from Operations + Capital Expenditures.

### Segments, By Measure (report Figures 2.4 and 2.13)

The body has a tree panel at the left (about 30 % of the width, dark grey, vertical and horizontal scrollbars) and the chart at the right (black).

Tree:

- One line per item, each with a checkbox: checked is blue with a white tick, unchecked dark grey.
- Measure headers in amber at the left edge (for example `Revenue`, `Operating Income`, `Assets`, `Liabilities`, `Capital Expenditures`). Under each, the company's reported segments in white, indented, and sub-segments one step further in. Long names are cut with `...` or `..`. The list scrolls.
- In the figures the revenue segments are ticked (on Figure 2.13 the `Revenue` header too).

Chart:

- Vertical bars, one group per fiscal year, the ticked items side by side. Series colours in tick order: orange, green, yellow, cyan, magenta. Estimate periods draw only the total, in a muted brown or khaki.
- The window holds as many periods as the `Periods` box. X labels `FY 2005`, and for estimates `FY 2019 Est`; on a crowded axis only every second year is labelled. Empty slots stay unlabelled.
- Y axis at the right, from zero, in billions with `B` (`5B`). Dotted grey gridlines at each tick and between years.
- Legend at the top left in a dark grey box, small text: a colour square, the label, and the latest value right-aligned with three decimals and a unit, `B` or `M` (`24.883B`). Labels read `Revenue` for the measure total and `Revenue: <segment>` for a segment.

### Measuring annotation

The chart's measuring tool draws, in thin white lines:

- a horizontal line at the start value, from the start period onward;
- a horizontal line at the end value;
- a vertical arrow between them, pointing up for a rise;
- a label above, or at the left end of, the upper line: total change and compound annual change, both signed with two decimals, `+94.41% (+39.37%ann.)`. There is no space before `ann.`.

The annual figure is the compound rate over the time between the two points. All four labels in the papers fit that rate with the time counted in calendar days divided by 365 between the two fiscal year ends (two years that include a 29 February count as 731/365). The tool measures between the points where it was drawn, so its percentage can differ a little from the change between two bars' printed values.

### Graph mode (report Figures 2.21 and 2.29)

`Adj Highlights` drawn as a chart. Header, tabs and sub-tabs as for the grid; no paging buttons.

- Left: the grid's row labels as a checkbox list, in the same order and spacing (main rows amber, sub-rows grey and indented). Only `Revenue, Adj` is ticked in the figures.
- Right: the band `30) Graph Fundamentals | GF »`, then the chart.
- A vertical drawing toolbar at the chart's left edge, in four groups with rotated labels `Favorites`, `Edit`, `Style`, `Modes` (pointer, line tools, text, horizontal line, ratio, pencil, move, cursor, trash can, font, colour, line weight, line style, eraser, crosshair, magnet, colour wheel, gear).
- Small buttons at the top centre: `+ Track`, `Annotate`.
- Legend at the top left: a colour square, the row label and its latest value (`Revenue, Adj 13.642B`).
- One bar per fiscal year: reported years orange, estimates muted brown. X labels `FY 2014` to `FY 2020 Est`.
- Y axis at the right in billions (`9B`; half steps with one decimal), dotted grid. It does not start at zero: the base sits just under the smallest bar.
- The measuring annotation as above.

## 4. Price chart against an index (GP)

Report Figures 2.5 (BATS), 2.14 (GSK), 2.22 (RB) and 2.30 (DGE): five years of daily prices against the FTSE 100 (`UKX Index`), both rebased to percent change.

### Controls

Top to bottom:

1. Quote header.
2. Function bar: load box, `95) Compare`, `96) Actions ▾`, `97) Edit ▾`; title `Line Chart`.
3. Date line: an amber start date box (`02/03/2014`, `MM/DD/YYYY`) with a calendar button, `-`, an amber end date box with a calendar button, then an unticked grey checkbox `Key Events` with a small amber `i` badge.
4. Toolbar, dark grey buttons with white text, left to right:
   - range buttons `1D`, `3D`, `1M`, `6M`, `YTD`, `1Y`, `5Y`, `Max` (the selected one blue, `5Y` in the figures);
   - frequency drop-down `Daily ▾`;
   - chart-type icons: line or mountain (selected, blue), bar or OHLC, a small `▾`;
   - `Table`;
   - `»` (folds the side panel away).
   
   At the right, over the side panel: a blue tab with a chart icon, `Chart Content` (selected), and a grey tab with a gear (settings).
5. Body: the chart at the left (about two thirds: price pane over volume pane, one shared time axis) and the Chart Content panel at the right.
6. On the March captures, a thin tool strip at the top centre of the price pane: `+ Track`, `Annotate`, `News`, `Zoom`, each with a small icon.

### Price pane

- Legend box at the top left (dark grey, small white text), one line each: `Normalized As Of MM/DD/YYYY`; `Last Price`; then one row per series with a colour square, the series name and its last value with three decimals (`12.645`). The security's row has a tiny expand box at its left.
- Series:
  1. The security's last price, mountain style: a thin white line over a navy gradient fill.
  2. A moving average of price when ticked, labelled `SMAVG (20)`: a thin pale green line close to the white one.
  3. `UKX Index` last price: a thin bright green line, no fill.
- Normalisation: each series is its percent change from its value on the normalisation date, (price / price on that date - 1) x 100, shown without a `%` sign.
- Y axis at the right in steps of 10 or 20 (`-20`), dotted grey gridlines.
- Last-value tags on the axis: a box in each series' colour holding its last value. A short white line joins the security's last point to its tag.

### Volume pane

- Under the price pane, about a quarter of the height, divided from it by a thin line with a drag handle.
- Legend: a steel-blue square and `<security> - Volume 1.210M`.
- Thin steel-blue daily bars; axis at the right in millions (`20M`); a last-value tag.
- When the volume average is ticked (report Figure 2.22), a white line over the bars: the 15-day simple average of volume.

### Time axis

Shared, under the volume pane: year labels centred in each year (`2014` to `2019`), tick marks at the year boundaries.

### Chart Content panel

1. White text `Add a security, field, study or event.`
2. An amber input `<Add>` and an amber link `41) Browse`.
3. Amber `Normalize by`, the drop-down `% ▾`, a white pencil.
4. A tree. Each row: an expand triangle where it has children, a checkbox (blue with a white tick when on), an amber label, then icons at the right: grey bell (alert), white pencil (edit), red circled ⊗ (remove). The March captures add a colour swatch for each plotted line.

The tree on report Figure 2.5:

| Indent | Row | Icons |
|---|---|---|
| 0 | `<security> Equity` (expanded) | ⊗ |
| 1 | `Last Px` | pencil, ⊗ |
| 2 | `Simple MA(10,0)` | bell, pencil, ⊗ |
| 2 | `Simple MA(20,0)` (ticked here) | bell, pencil, ⊗ |
| 2 | `Simple MA(30,0)` | bell, pencil, ⊗ |
| 2 | `News Headlines` | none |
| 1 | `Volume` | pencil, ⊗ |
| 2 | `Simple MA(15,0)` | bell, pencil, ⊗ |
| | blank line | |
| 0 | `UKX Index` (expanded) | ⊗ |
| 1 | `Last Px` | pencil, ⊗ |

The March captures (Figures 2.22 and 2.30) show a shorter tree with no price averages: `Last Px`, `News Headlines`, `Volume` and `Simple MA(15,0)` under the security, `Last Px` under the index. `Simple MA(n,0)` is an n-period simple moving average.

## 5. Relative valuation (RV)

Report Figures 2.6, 2.16, 2.23 and 2.31 (Overview); 2.7 and 2.15 (Comp Sheets, Profitability); 2.8, 2.24 and 2.32 (Profitability while a column is being added).

### Header controls

1. Quote header. Figure 2.7 has the message line `Theme (*) has been changed, 18<GO> to Save Template, <Back> to Return` instead. On Figure 2.23 a yellow pop-up tab `What's New in RV` with a `×` covers the right end of the quote header.
2. Function bar: a wide load box, `Export ▾`, `Settings ▾` (no numbers); title `Relative Valuation`.
3. A blank line.
4. Settings line: amber labels, amber drop-downs with dark text and a grey `▾` cell. Two forms, by comp source:
   - algorithmic peers: `Comp Source` `BICS Best Fit (Algo) ▾` and a white pencil (edit); `Region` `Global ▾` (also seen: `Global (Developed)`); `Mkt Cap >` with an input holding the market-cap floor (`762M`); `Curr` `GBP ▾`;
   - curated peers: `Comp Source` `Analyst Curated (BI) ▾` and a pencil; `Name` with the peer group's name in a drop-down; `Curr` `GBP ▾` at the right.
5. The segment panel (left, about half the width) and the comp range panel (right).
6. A magnifier with a plus at the far right, just above the tabs.

### Segment panel

- Header `Segment`, an icon column without header, `Revenue %`.
- One row per business segment: a radio ring (blue, and the row dark navy, when selected), the segment name in amber, a small boxed `BI` badge (research coverage), the share of revenue (`90%`) and a horizontal bar of that length, blue on the selected row and brown or amber on the others.
- Seen: a single segment at `100%`, or `Whole Firm` (`100%`, selected) followed by the segments.

### Comp range panel

- Header `Metric`, the subject's short ticker (`BATS`, `RB/`), `Low`, `Comp Range`, `High`.
- Five metric rows. Labels amber, cut with `...`. The subject's value cyan; Low and High amber. Two decimals (`9.05`); money metrics in billions (`4.48B`).
- `Comp Range` draws a thin grey line from Low (left end) to High (right end), a cyan dot at the subject's value and an orange diamond at the median. They can overlap. Low and High include the subject, so it sits at an end when it is the lowest or highest.
- Legend under the panel: a cyan dot with `<ticker> <exchange>` (`BATS LN`), an orange diamond with `Median`.

Metrics, in order:

| Row | Algorithmic peers | Curated peers (by peer group) |
|---|---|---|
| 1 | `Est P/E Current ...` | `Est P/E Current ...` |
| 2 | `EV/Est EBITDA C...` | `Ind. Dividend Yi...` or `EV/ Est EBITDA C...` |
| 3 | `Sales Growth Yo...` | `Sales Growth Yo...` |
| 4 | `EBITDA Margin (...` | `EBITDA Margin (...` |
| 5 | `ROIC (%)` | `R&D Expenses`, `SG&A as % Sales` or `ROIC (%)` |

### Tabs

- Row 1, in order: `Overview`, `Comp Sheets`, `Markets`, `EPS Preview`, `Ownership`, `Credit`, `Custom`, then a gear icon.
- Row 2 under `Comp Sheets`, in order: `Equity Valuation`, `CDS Spreads`, `Op Stats`, `Profitability`, `Balance Sheet`, `ESG`. `CDS Spreads` is missing on Figure 2.15.
- `Overview` has no second row.

### Tables

Rules for every table:

- Headers white on dark grey, many on two or three lines.
- First row `Median`, white. Second row the subject, pinned and numbered `100)`, cyan. Then the peers, numbered from `101)` in sorted order (renumbered after each sort).
- Sort column: amber header ending in `↓`, the whole column dark navy.
- Peer names amber, upper case, cut with `...`. A missing value is `--`.
- Values with two decimals; percentages with `%`; market values with `B` or `M`.
- A vertical scrollbar with ▲ and ▼ at the right; more peers lie below.

The `Median` row is the median of the subject and all peers, leaving out missing values; with an even count it is the mean of the two middle values. This matches every column of Figure 2.15, including one with a missing peer.

Overview table (Figures 2.6, 2.16, 2.23, 2.31), sorted by `ROE` in all four:

| # | Header | Format |
|---|---|---|
| 1 | none | row number (`101)`) |
| 2 | `Name` / `(BICS Best Fit)` or `(BI Peers)` | |
| 3 | `Mkt Cap` / `(GBP)` | `60.41B` (`M` below a billion) |
| 4 | `Last Px` | `26.34` |
| 5 | `Chg Pct` / `1D` | `-4.99%` |
| 6 | `Chg Pct 1M` | `1.14%` |
| 7 | `Rev - 1 Yr` / `Gr:Y` | `8.24%` |
| 8 | `EPS - 1 Yr` / `Gr:Y` | `-23.91%` |
| 9 | `P/E` | `21.42` |
| 10 | `ROE↓` | `16.59%` |
| 11 | `Dvd 12M` / `Yld` | `2.83%` |

- `Mkt Cap` and `Last Px` are in the selected currency, prices in its main unit (pounds, so a stock quoted in pence shows `26.34`); foreign peers are converted.
- The two change columns are green when positive and red when negative or zero, for the peers.
- With algorithmic peers (Figure 2.6) the subject row is cyan throughout and the peers' other values amber.
- With curated peers (Figures 2.16, 2.23, 2.31) the subject's name, `Mkt Cap`, `Last Px`, change columns, `P/E` and `Dvd 12M Yld` are cyan; the peers' `Mkt Cap`, `Last Px`, `P/E` and `Dvd 12M Yld` amber; the growth and `ROE` columns white in every row.

Profitability tables (columns after `Name`, in order):

| Figure | Peers | Columns | Sorted by |
|---|---|---|---|
| 2.7 | algorithmic | `Sales Growth 1` / `YR`, `Sales Growth 5` / `YR CAGR`, `Operating Margin TTM`, `EBITDA Margin TTM`, `Net Profit` / `Margin TTM` | `Sales Growth 1 YR` |
| 2.8 | algorithmic, column added | `GM:Y`, `Sales Growth 5 YR` / `CAGR`, `Operating` / `Margin TTM`, `EBITDA Margin TTM`, `Net Profit Margin` / `TTM` | `GM:Y` |
| 2.15 | curated | `Revenue Growth`, `Gross` / `Margin`, `Op` / `Margin`, `Return On Assets`, `Return` / `On` / `Equity`, `Return` / `On` / `Capital`, `Eff Tax` / `Rate`, `Revenue/Employee` | `Gross Margin` |
| 2.24, 2.32 | curated, column added | `GM:Y`, `EBITDA Margin TTM`, `Operating Margin`, `Profit Margin TTM` (four wide columns) | `GM:Y` |

Formats: percentages with two decimals (`68.43%`); `Revenue/Employee` in thousands with `k` (`307.43k`). Peer values are white on Figures 2.7 and 2.15, amber on Figure 2.8 and pale yellow on Figures 2.24 and 2.32.

Adding a column (Figures 2.8, 2.24, 2.32):

- An edit bar above the table: amber `Add Column`, a long amber input, grey buttons `93) Fields`, `19) Save`, `20) Discard`.
- Everything above the table is dimmed, and the unselected sub-tabs are greyed with boxed outlines.

### Accounting-adjustments line

Under the table: grey `(Accounting Adjustments: `, amber `Adjusted for Abnormal Items When Applicable`, grey `)`; at the right a grey button `10) Analyze List`.

## 6. Analyst recommendations (ANR)

Report Figures 2.9 (BATS), 2.17 (GSK), 2.25 (RB) and 2.33 (DGE).

### Frame

1. Quote header.
2. Function bar: load box, `Actions ▾`, `Alert`, `Export` (no numbers); title `Analyst Recommendations`.
3. The company name in cyan; at the right, amber `As of`, a date box (`01/31/19`, `MM/DD/YY`) and a calendar button.
4. Upper area: the consensus panel (left, about 28 % of the width) and the charts (right).
5. A dark grey band with white text, `Showing 22 of 28 sources`.
6. The analyst table, with a vertical scrollbar.

### Consensus panel

Labels amber; three columns (label, middle, right):

| Row | Middle | Right |
|---|---|---|
| `Consensus Rating` | | a small triangle (green `▲` or red `▼`) and the rating, white, two decimals (`3.71`) |
| `Buys` | share, green, one decimal (`34.6%`) | count, green (`13`) |
| `Holds` | share, yellow | count, yellow |
| `Sells` | share, red | count, red |
| blank line | | |
| `12M Tgt Px` | a white count pair (`23/32`) | consensus target, two decimals |
| `Last Price` | | two decimals |
| `Pricing Currency` | | `GBp` |
| `Return Potential` | | one decimal and `%` (`9.2%`) |
| `LTM Return` | | one decimal and `%` (`27.8%`) |

- The shares are each count over buys + holds + sells, so they add up to 100 %.
- Return Potential = 12M Tgt Px / Last Price - 1.
- On one capture the rating is exactly the average on a 1 to 5 scale (sell 1, hold 3, buy 5); on the other three that average comes out about 0.04 above the rating shown, so some sources are probably graded between those steps. What the triangle's colour means is not shown.

### Charts

- Range buttons above the charts: `6M`, `1Y`, `2Y` (selected, blue), `5Y`, `Max`.
- Upper pane:
  - one 100 % stacked bar per month (about 25 for `2Y`), bottom to top: `%Buy` green, `%Hold` khaki or tan, `%Sell` dark red;
  - left axis in percent, `0`, `50`, `100`; right axis in the pricing currency (`3000`);
  - two lines on the right axis: `12M Tgt Px` white (the consensus target over time) and `Price` yellow;
  - legend at the top left in a dark box: a white square with `12M Tgt Px` and its last value (two or four decimals, `6776.6802`), a yellow square with `Price` and its last value, then green `%Buy`, tan `%Hold`, red `%Sell` without values. The box covers the first bar or two;
  - the March captures add four small tools at the top centre (crosshair, pencil, list, magnifier).
- Lower pane, the price spread:
  - legend: a white square with `Price Spread (Tgt - Px)` and the last value (`808.50`);
  - a mountain of target minus price, green above zero and red below;
  - a left axis with one or two labels (`200`).
- Shared time axis: about one label a month as `Mon DD` (`Mar 30`), a `...` at the left, the years on a second line (`2017`, `2018`, `2019`) and ticks at the year boundaries.

### Analyst table

Columns, in order:

| # | Header | Content |
|---|---|---|
| 1 | none | row number, white (`1)`) |
| 2 | none | a white document icon on every row |
| 3 | none | a green grid-with-padlock icon on rows where the firm offers a model |
| 4 | `Firm` | amber, cut with `...` |
| 5 | `Analyst` | white, cut with `...` |
| 6 | `Recommendation` | the source's own wording, coloured by meaning |
| 7 | `Tgt Px` | red, two decimals, no separator (`3000.00`), empty when there is none |
| 8 | `Date↓` | white, `MM/DD/YY`; sorted, newest first |
| 9 | `1 Yr Rtn` | white, two decimals and `%` |
| 10 | `BARR` | amber integer |
| 11 | `Rank` | amber integer |
| 12 | none | a small line-chart button on every row |

Recommendation colours:

- green: `buy`, `add`, `overweight`, `outperform`;
- yellow: `hold`, `neutral`, `equalweight`, `sector perform`, `market perform`, `peerperform`;
- red: `sell`, `underperform`;
- orange: `Rating Suspended`, `restricted`, `Under Review`.

A green `⬆` before the word marks an upgrade. A source left out of the consensus is drawn entirely in grey. About 12 rows show; the rest scroll.

## 7. News story and research screens

Report Figures 4.2 to 4.9 (appendix): a news story (CN), a research report, the research unit's company primer, and the Key Insights screen. Only the layout is recorded; the text on these screens is not copied.

### News story (Figure 4.2)

1. Quote header.
2. Function bar: `4) Previous` and `3) Next` (disabled, dark maroon), `66) Send`, `98) Actions ▾`, `99) Translate ▾`; title `News: News Story`.
3. Headline list, numbered from `101)`: the headline in amber; at the right, the source code in red-orange (`#FA5A28`) and the date `MM/DD` in amber. A "first word" headline is upper case and starts with `*`. The open story's row is navy (`#0C2B49`) with grey text and a white tick.
4. Story header: `MM/DD/YYYY hh:mm:ss [SRC]` in grey; at the right, three small dark grey buttons (bookmark, magnifier, double chevron up).
5. Story body. In the figure it is a reposted social-media post:
   - a dark grey (`#333333`) rounded button with a bell, offering breaking-news alerts from the social network;
   - a post card (`#232323`): a round avatar, the account name in bold white with a blue verified badge, the handle in blue, three lines of light grey text with a blue link, and a footer row with the network's icon and a link to the original;
   - lines in dim amber (`#A26100`) giving the account's profile as of a date: description, post count, following, followers.
6. Footer.

### Research report (Figure 4.3)

1. Function bar: `4) Previous`, `3) Next` (disabled), `66) Send`, `98) Actions ▾`; title `News: Research`.
2. Report header: `MM/DD/YYYY hh:mm:ss [SRC]` in grey and the report title in white; tabs `Report` (dark grey) and `Summary` (light grey, selected); bookmark and magnifier buttons at the right.
3. Left body (about 1,100 of the 1,920 pixels):
   - a date line in amber, `Mon DD, YYYY hh:mm:ss AM [SRC]`;
   - the title, bold white, larger;
   - `Synopsis:` in amber;
   - a one-line summary in amber;
   - the summary paragraph in amber (seven lines in the figure);
   - blank lines, then an amber end line `-0- Mon/DD/YYYY hh:mm GMT`;
   - `Tags:` in white, followed by blue tag links separated by white commas (region, asset class, research type, country, sector).
4. Right side panel (about 430 pixels): a header bar `Tags & Notes` (white on blue `#0051BA`) with `»`; a bar `Authors` (white on `#1E1E1E`) with the authors' names as blue links; a bar `Report Tags` with an `(i)` icon and an amber input `Enter tag...`; a bar `Notes` with an add-note icon.

### Company primer (Figure 4.4)

1. Function bar: load box, `66) Send`, `98) Actions ▾`; a title naming the provider's research unit, ending `Company Primer`.
2. `[BI]` in grey at the top left; a magnifier at the top right.
3. Title, bold white, large: `<Company> Research Primer`. Under it a blue link to the industry dashboard, ending `| BI »`.
4. Tabs `1) Equity` (selected) and `2) Industry`.
5. A small amber section label (`Earnings`), a numbered white heading (`2. <heading>`), `Return to Top` in blue at the right, then grey `Research Note: ` and a blue link.
6. Two columns. Left: the body text in larger amber type (13 lines visible). Right: white `Key Points:` and five bullets with amber dots, each a blue link ending `| BI` with an external-link icon.
7. A scrollbar at the right.

### Key Insights (Figures 4.5 to 4.9)

1. Function bar: load box, `Alert`, `Export to Note`; title `Key Insights`.
2. An `ADJ` badge (white rounded rectangle, bold black text) and the company name in cyan; at the right, amber `Currency` and the currency in light grey (`GBP`).
3. Tabs with counts, in order: `All (n)`, `Valuation (n)`, `Estimates (n)`, `Fundamentals (n)`, `Industry (n)`, `News (n)`, `Deals (n)`. A count can be `(0)`.
4. Items, separated by thin dark grey rules (`#2D2D2D`):
   - a small grey number (`1)`) and the item title in light grey (`#D7D7D7`);
   - the body, indented, in amber (`#FF9E24`), one to three lines: a sentence giving a measure, a comparison and an as-of date, with the measure's name as a blue link;
   - at the right, the date `MM/DD` in grey and below it the signal: a grey outline diamond `◇` (neutral), a red `▼` (negative) or a green `▲` (positive).
   
   Titles are rule names, for example `Upcoming Presentation`, `Debt Maturities Approaching`, `Pending Management Changes`, `Recent Management Changes`, `Negative Credit Outlook`, `High FCF Margin vs History`, `Low FCF Margin vs History`, `High FCF Margin vs Comps`, `High Insider Activity`, `Pending Dividends`, `Dividend Declaration`, `High Days Sales Outstanding vs Comps`.
5. A scrollbar at the right.
6. Figures 4.7 and 4.8 dock the news panel below (`300) Edit Panel`, `301) Expand Panel`, three amber lines), and Figure 4.7 has a promotional banner under it.

## 8. Mean-variance spreadsheet figures

Report Figures 1.4, 3.1 to 3.7, 4.1 and 4.10 to 4.13, the students' spreadsheet work, plus the payoff chart of Figure 1.1. The returns in chapters 3 and 4 are monthly; Figure 1.4 does not say. Sheets: white cells, light grey gridlines (`#D5D5D5`), black text, no borders unless stated.

### Ten-asset minimum-variance weights (Figure 1.4)

Two blocks on one sheet with an empty column between them.

Left block:

- Column A: the ten securities as `<ticker> LN Equity`, left-aligned, in this order: `BATS`, `GSK`, `RB/`, `FERG`, `PSN`, `REL`, `NXT`, `DGE`, `CRDA`, `BKG`.
- Column B: header `Portfolio Weights`, centred; weights right-aligned as percent with two decimals (`19.93%`).
- Yellow fill on the six weights under 1 % (the names dropped next); no fill on the four kept.
- After two blank rows, the sum `100.00%` in column B.

Right block, labels then values (unformatted decimals, `0.01044967`):

- `Portfolio Return`, light green fill;
- `Portfolio Variance`, no fill;
- `Portfolio SD`, orange fill.

### Portfolio tables (Figures 3.2, 3.4, 3.6)

One layout for the three portfolios. Column A is 130 pixels wide, B to E (and F, G on Figure 3.6) 203 pixels each; rows are 24 pixels.

| Row | A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|---|
| 1 | | | title, bold, centred on C | | | | |
| 2 | | `Portfolio Weights` (centred) | | | | | |
| 3 | `BATS LN Equity` | weight | | `Portfolio Return` | value, green fill | | |
| 4 | `GSK LN Equity` | weight | | `Portfolio Variance` | value | | |
| 5 | `RB/ LN Equity` | weight | | `Portfolio SD` | value, gold fill | | |
| 6 | `DGE LN Equity` | weight | | | | | |
| 7 | | | | | | | |
| 8 | | `100.00%` (sum) | | `Rf=` | `0.0025` | `Sharpe Ratio =` | value, yellow fill |
| 9 | | | | `Risk Premium=` | value | | |

- Titles: `Global Minimum Variance Portfolio` (Figure 3.2), `Equal Weighted Portfolio` (3.4), `Tangency Portfolio` (3.6). Columns F and G, and the cells of rows 8 and 9 after B, exist only on Figure 3.6. `Rf=`, `Sharpe Ratio =` and `Risk Premium=` are right-aligned.
- Weights: percent with two decimals; negatives with a minus, no brackets (`-26.54%`). Statistics: General format, raw decimals up to nine significant digits (`0.030971611`).
- Fills: return green `#92D050` and SD gold `#FFC000` (the two numbers that place the portfolio on the chart); the Sharpe ratio yellow `#FFFF00` (what the tangency portfolio maximises).
- Risk Premium = return - Rf; Sharpe ratio = Risk Premium / SD. `0.0025` is 3 % a year divided by 12.

### Results table (Figure 4.1)

- All borders on, thin black, with a heavier line between `DGE LN Equity` and `Portfolio Return`. Column widths 203, 128, 115 and 108 pixels; rows 24 pixels.
- Header row: an empty cell, then `GMVP`, `EWP`, `TP`, bold and centred.
- Rows, in order: `BATS LN Equity`, `GSK LN Equity`, `RB/ LN Equity`, `DGE LN Equity`, `Portfolio Return`, `Portfolio Variance`, `Portfolio SD`. Labels left, values right.
- Every value is percent with three decimals, the variance too (`17.365%`, `-26.544%`, `0.096%`).
- Whole-row fills: `Portfolio Return` green `#92D050`, `Portfolio Variance` yellow `#FFFF00`, `Portfolio SD` gold `#FFC000`.

### Monthly price data (Figures 4.10 to 4.13)

One sheet, filled by the terminal's historical-data formula and split over four images.

- Row 1: `Start Date` in A, `30/01/2009` in B (right-aligned). Row 2: `End Date` in A, B empty. Rows 3 to 5 empty.
- Row 6: the ten tickers in B to K, in the order of Figure 1.4 (`BATS LN Equity` to `BKG LN Equity`). Row 7: `Dates` in A and `PX_LAST` under each ticker. Data from row 8.
- Column A is 110 pixels; B to G 173; H 109 (so `NXT LN Equity` nearly touches the next header); I to K 173; rows 20 pixels.
- Dates are month-end trading days, `dd/mm/yyyy`, right-aligned. Prices are in General format, so trailing zeros are dropped (`888`, `870.5`, `2633.118`). Header text left-aligned. No fills, no borders.
- 120 months without gaps, 27/02/2009 to 31/01/2019. The third image repeats rows 6 and 7 at its top; the second and fourth start straight with data.

### Mean-standard deviation chart (Figures 3.1, 3.3, 3.5, 3.7)

One spreadsheet chart (scatter with smooth lines), saved again with more marks each time.

- Chart and plot area dark grey `#3E3E3E`, no border. Major gridlines both ways, `#525252`. A horizontal axis line `#808080` at 0 %; no vertical axis line.
- Title `Mean-St Deviation Portfolio`, bold, light grey `#DADADA`, centred, about 14 pt.
- Axis titles, bold, small, `#C0C0C0`: `Portfolio Return` (vertical, rotated) and `St deviation` (horizontal).
- Tick labels `#C0C0C0`, about 9 pt, percent with two decimals (`5.00%`).
- Axes: x from `0.00%` to `45.00%` in steps of 5 %; y from `0.00%` to `8.00%` in steps of 1 % (Figures 3.1, 3.3, 3.5) or to `12.00%` in steps of 2 % (Figure 3.7).
- No legend: series names are free text boxes in the series colour.

| Item | Drawn as | Label | Figures |
|---|---|---|---|
| EPF (efficient frontier) | smooth line `#00B0F0`, about 2.25 pt, soft blue glow, no markers. It is σp = √((A·µp² - 2·B·µp + C)/D) for µp from 0 % to 7.5 %; the lower branch stops at 0 % return | `EPF` in `#00B0F0`, about 20 pt, near the upper end | all four |
| GMVP | orange `×` marker `#ED7D31`, about 14 pixels, on the curve's vertex | `GMVP` in orange, about 20 pt, right of the marker | 3.3, 3.5, 3.7 |
| EWP | no marker of its own (it sits almost on the GMVP) | the GMVP label becomes `GMVP ≈ EWP`, with `≈ EWP` in yellow `#FFFF00`; smaller (about 14 pt) on 3.7 | 3.5, 3.7 |
| CML | straight line, green `#00B050`, about 1 pt, orange glow, from (0 %, rf) upward with a slope equal to the Sharpe ratio | `CML` in green, about 20 pt, under the line's top end | 3.7 |
| TP | red `#FF0000` diamond, about 15 pixels, where the CML touches the EPF | `TP` in red, about 16 pt, up and left of the diamond | 3.7 |

### Long/short payoff chart (Figure 1.1)

A spreadsheet line chart on white. Title `Long/short share position` (grey, centred). X title `Stock Price £`, ticks `60` to `140` in tens along the zero line; y title `Profits/Losses £` (rotated), ticks `-40` to `60` in tens. Light grey gridlines. One straight line, profit = price - purchase price, red below zero and green above. No legend.

## 9. The dissertation

Dissertation Tables 5.3 to 5.15 and Figures 1.1 to 1.3, 4.1, 4.2 and 5.1 to 5.20. The charts come from a Python plotting library in its default style; the tables are set as text.

### Input and result tables (Tables 5.3 to 5.15)

A centred form of two columns (label, value) with bold section headings, under the heading `Investment Policy: MPC` (`Investment Policy: HOLD` on Table 5.3). Rows, in order:

1. `Data Inputs`: `Start date`, `End date`, `Historical data (days)`, `Forecast horizon (days)`, `Initial portfolio budget ($)`.
2. `Aversion Parameters`: `Risk Aversion`, `Trading Aversion`, `Holding Aversion`.
3. `Cost Parameters`: `Bid/ask half spread (%)`, `Borrow costs (%)`.
4. `General constraints`: `Leverage limit`, and on some tables `Long Only portfolio` or `Dollar Neutral portfolio`. Table 5.13 has `Long Only portfolio` and no leverage row.
5. `Results`: `Annual Expected Portfolio Return (%)`, `Annual Excess Return (%)`, `Annual Excess Risk (%)`, `Sharpe ratio`, `Maximum Drawdown (%)`, `Annual Portfolio Turnover (%)` (printed `Annual Porfolio Turnover (%)` from Table 5.6 on).

Test values as five columns: the tested parameter's row holds its five values side by side; every other input row holds one value, centred across the five columns; each result row holds five values, one under each tested value.

Formats: dates written out (`1st January 2012`); the budget with a thousands separator (`200,000`); costs as plain percent numbers (`0.05`); results mostly with two decimals (`31.80`); turnover with a thousands separator and as many decimals as fit (`1,331`, `354.1`, `52.95`).

Table 5.3 (Hold policy) has one value per row: labels without the units in brackets, `N/A` for every input that does not apply, the budget as `$200,000`, results with three decimals and a space before `%` (`12.379 %`), turnover `0%`.

The tests. Common to all: dates 1st January 2012 to 31st December 2016, history 250 days, budget 200,000, half spread 0.05, borrow cost 0.01.

| Table | Tested row and its five values | Horizon | Risk | Trading | Holding | Constraints |
|---|---|---|---|---|---|---|
| 5.4 | `Forecast horizon (days)`: 0, 10, 50, 100, 250 | tested | 5 | 1 | 1 | leverage 3 |
| 5.5 | `Risk Aversion`: 1, 5, 10, 20, 50 | 10 | tested | 1 | 1 | leverage 3 |
| 5.6 | `Risk Aversion`: 1, 5, 10, 20, 50 | 100 | tested | 1 | 1 | leverage 3 |
| 5.7 | `Trading Aversion`: 0.5, 0.7, 1, 1.2, 1.5 | 10 | 1 | tested | 1 | leverage 3 |
| 5.8 | `Trading Aversion`: 0.5, 0.7, 1, 1.2, 1.5 | 100 | 1 | tested | 1 | leverage 3 |
| 5.9 | `Holding Aversion`: 1, 5, 10, 20, 50 | 10 | 1 | 0.7 | tested | leverage 3 |
| 5.10 | `Holding Aversion`: 1, 5, 10, 20, 50 | 100 | 1 | 0.7 | tested | leverage 3 |
| 5.11 | `Leverage limit`: 1, 1.5, 2, 2.5, 3 | 10 | 1 | 0.7 | 1 | leverage tested |
| 5.12 | `Leverage limit`: 1, 1.5, 2, 2.5, 3 | 100 | 1 | 0.7 | 1 | leverage tested |
| 5.13 | `Risk Aversion`: 1, 5, 10, 20, 50 | 100 | tested | 0.7 | 1 | long only |
| 5.14 | `Risk Aversion`: 1, 5, 10, 20, 50 | 100 | tested | 0.7 | 1 | dollar neutral, leverage 3 |
| 5.15 | `Leverage limit`: 1, 1.5, 2, 2.5, 3 | 100 | 1 | 0.7 | 1 | dollar neutral, leverage tested |

### Chart style

- White figure and plot, a thin dark grey frame on all four sides, no gridlines, ticks pointing out. Title centred above (about 14 pt), axis labels about 14 pt, tick labels about 12 pt. The library's font is not copied.
- Series colours follow the library's default ten-colour cycle, in legend order: blue `#1F77B4`, orange `#FF7F0E`, green `#2CA02C`, red `#D62728`, purple `#9467BD`, brown `#8C564B`, pink `#E377C2`, grey `#7F7F7F`, olive `#BCBD22`, cyan `#17BECF`, then again from blue. Lines about 1.5 pixels, no markers.
- Daily data. Date tick labels rotated about 30° and right-aligned.
- Legend inside the plot: a white, slightly transparent box with a light grey rounded border, short line samples and labels.
- The x range has a 5 % margin at each end.

### Stock price charts (Figures 5.1 to 5.4)

X label `Time`, y label `Stock price ($)`, x ticks at the year starts `2012` to `2017`, data from the first trading day of 2012 to the end of 2016. Five series each, legend at the upper left.

| Figure | Title | Legend, in order | Y ticks |
|---|---|---|---|
| 5.1 | `I.T. stocks` | `AKAM`, `JNPR`, `MSI`, `ACN`, `ADBE` | `20` to `120` by 20 |
| 5.2 | `Pharmaceutical/Healthcare stocks` | `ABT`, `HCP`, `BAX`, `ALXN`, `PDCO` | `25` to `200` by 25 |
| 5.3 | `Entertainment/Shopping stocks` | `VIAB`, `ADS`, `URBN`, `ATVI`, `AMZN` | `0` to `800` by 200 |
| 5.4 | `Energy stocks` | `PPL`, `AEE`, `NOV`, `AES`, `AEP` | `10` to `80` by 10 |

### Value over time (Figures 5.5 to 5.15, 5.17, 5.19)

- Title `Portfolio value over time`; x label `Time`; y label `Portfolio value ($)`.
- X ticks every six months, `2013-01` to `2017-01` (`YYYY-MM`), rotated. Data from 2 January 2013 to 30 December 2016; 2012 is the 250-day history.
- Y tick labels with a thousands separator, no currency sign and no decimals (`1,500,000`).
- Every run starts at 200,000.
- Each test chart has five series, legend at the upper left in cycle order, labelled `H=<value>`, `RAv=<value>`, `TAv=<value>`, `HAv=<value>` or `Lev=<value>` (`RAv=1`). Figure 5.5 (Hold) has one blue line and no legend.

| Figure | Table | Legend | Y ticks |
|---|---|---|---|
| 5.5 | 5.3 | none | `200,000` to `320,000` by 20,000 |
| 5.6 | 5.4 | `H=` | `200,000` to `900,000` by 100,000 |
| 5.7 | 5.5 | `RAv=` | `500,000` to `2,500,000` by 500,000 |
| 5.8 | 5.6 | `RAv=` | `0` to `5,000,000` by 1,000,000 |
| 5.9 | 5.7 | `TAv=` | `0` to `5,000,000` by 1,000,000 |
| 5.10 | 5.8 | `TAv=` | `0` to `6,000,000` by 1,000,000 |
| 5.11 | 5.9 | `HAv=` | `500,000` to `3,500,000` by 500,000 |
| 5.12 | 5.10 | `HAv=` | `0` to `6,000,000` by 1,000,000 |
| 5.13 | 5.11 | `Lev=` | `500,000` to `3,500,000` by 500,000 |
| 5.14 | 5.12 | `Lev=` | `0` to `6,000,000` by 1,000,000 |
| 5.15 | 5.13 | `RAv=` | `200,000` to `500,000` by 50,000 |
| 5.17 | 5.14 | `RAv=` | `250,000` to `1,750,000` by 250,000 |
| 5.19 | 5.15 | `Lev=` | `250,000` to `1,750,000` by 250,000 |

Runs with the same inputs appear in several tables and draw the same curve (for example `TAv=0.7` in Table 5.8, `HAv=1` in Table 5.10 and `Lev=3` in Table 5.12).

### Weights over time (Figures 5.16, 5.18, 5.20)

- Title `Portfolio weights over time`; x label `Time`; y label `Portfolio weights`; x ticks as on the value charts; y ticks with one decimal (`-0.5`).
- 21 series, legend at the upper right in small type (about 7 pt), in this order: `AKAM`, `JNPR`, `MSI`, `ACN`, `ADBE`, `ABT`, `HCP`, `BAX`, `ALXN`, `PDCO`, `VIAB`, `ADS`, `URBN`, `ATVI`, `AMZN`, `PPL`, `AEE`, `NOV`, `AES`, `AEP`, `USDOLLAR` (cash). The ten colours repeat, so two or three series share each colour.
- Weights are fractions of the portfolio's value.

| Figure | Caption | Y ticks |
|---|---|---|
| 5.16 | `MPC investment policy. Long Only. Portfolio weights.` | `0.0` to `0.8` by 0.2 |
| 5.18 | `MPC investment policy. Dollar Neutral portfolio. Portfolio weights.` | `-1.5` to `1.0` by 0.5 |
| 5.20 | the same caption as 5.18 | `-0.6` to `1.0` by 0.2 |

On the dollar-neutral charts the cash line stays near 1.0, and the many zero weights draw one thick line at 0.0.

### Diagrams

Figure 1.1, "Closed Loop System (Trodden, 2015)". All lines and text in one blue (`#007EC6`) on white, 1-pixel lines, small open arrowheads. Left to right: an input arrow labelled `r` (italic) into a summing circle marked `+` at its upper left and `−` at its lower right; an arrow into a box `Controller`; an arrow labelled `u` into a box `System`; an output arrow labelled `y` to the right edge. A feedback path leaves the output line, runs down, left along the bottom and up into the circle's lower input.

Figure 1.2, "Closed Loop Portfolio Management System (Brdys and Zubowicz, 2011)". Black on white, boxes with 2-pixel borders, solid arrowheads.

- Boxes: a large one at the top left, `Active` / `portfolio managment` / `system`; `Decision` / `maker` at the bottom centre; `Global` / `market` at the bottom right.
- Arrows: from the top box down and right into `Decision maker`, labelled `portfolio` / `structure` / `for next period`; from `Decision maker` right to `Global market`, labelled `investment` above and `rebalancing` below; from `Global market` up and left into the top box, labelled `information feedback loop`.

Figure 1.3, "MPC algorithm (Trodden, 2015)". Two stacked plots without numbers.

- Colours: axes, arrows and their labels blue `#007EC6`; the past path solid navy `#302E7F`; predicted paths dashed, navy for the prediction made at k+1 and grey `#818181` for the one made at k; constraints red `#FF0000`; setpoint green `#008100`.
- Both plots share nine time ticks and two dotted blue verticals at `k` and `k+1` (italic labels under each time axis).
- Top plot: y label `output` (rotated), x label `time`; a red line `Constraint` and just below it a green line `Setpoint`, each labelled at its right end; the past output rising to k+1; the two dashed predictions overshooting and settling on the setpoint; two blue arrows of equal length labelled `horizon`, one starting at k and one at k+1.
- Bottom plot: y label `input`, x label `time` on the zero line; two red lines labelled `Constraint` (upper and lower); past inputs as a solid navy staircase whose last step sits on the upper constraint; planned inputs as dashed staircases, navy from k+1 (four steps) and grey from k (three steps).

Figure 4.1, "Maximum drawdown in MSCI Emerging Markets Index, Sept 2001/2011 (Ramani, 2013)". A third-party line chart on white, no title or legend. Y title `Comparative Performance`, `0` to `600` by 100, light grey gridlines. X monthly, labels every seventh month rotated 45° as `Mon-YY` (`Aug-01`). One dark navy line rebased to 100. Red marks: a horizontal line at the peak and another at the trough, a dashed double-headed vertical arrow between them, about six thin arrows from the peak to the following troughs. Labels: `MDD: -61.6%` in bold black on yellow, and bold black text `Drawdowns from local` / `maximum to succeeding` / `troughs`.

Figure 4.2, "Mean reverting & Momemtum trading strategies (Shal, 2017)". A third-party diagram on white.

- Title `BR, M, MR` in bold black on yellow.
- Legend at the top left: a blue circle `Entry point`, a green arrow `Movement before`, a red arrow `Expected movement after`.
- Two parallel rising lines, `Resistance level` (upper) and `Support level` (lower), with a grey zigzag price path bouncing between them and breaking out through the top at the right.
- Blue circles mark entries: `MR` at the support and at the resistance, `M` inside the channel after a fall, `BR` on the resistance at the upper right, each with a green arrow in and a red arrow out.
- An orange arrow at the right labelled `Trend`.
- Key at the bottom right: `M - Momentum` / `BR - Breakout` / `MR - Mean reversion`.

## Problems seen in the figures

1. Swapped price columns (report Figures 4.10 to 4.13). The column headed `BATS LN Equity` does not hold British American Tobacco's price; the column headed `BKG LN Equity` does. The paper's BATS results therefore come from Berkeley Group's prices (worked through in `docs/portfolio-management-plan.md`, error 1).
2. Start dates. The price sheet says `Start Date` 30/01/2009, but its first row is 27/02/2009. The dissertation's tables say 1st January 2012 to 31st December 2016, but the value and weight charts run from January 2013 (2012 is the history window) to 30 December 2016. On report Figure 2.5 the legend reads `Normalized As Of 01/31/2014` while the date range starts on 02/03/2014; the other three price charts are rebased on 02/03/2014.
3. Table 5.5 copy error: the `Annual Excess Return (%)` for `RAv=10` is printed equal to the `Annual Excess Risk (%)` cell under it; from the other columns it should be about 18.45. Table 5.9's excess return for `HAv=1` also looks wrong: the same run in Tables 5.7 and 5.11 has the usual small gap between expected and excess return, Table 5.9 a much larger one.
4. Segment chart against the grid: BATS's FY 2017 segment revenue in the legend of report Figure 2.4 is well above the 2017 `Revenue, Adj` of Figure 2.3.
5. Measured span: the GSK text says 2015 to 2017, but the annotation on report Figure 2.13 runs from FY 2014 to FY 2017, and its percentage differs a little from the change between the bars' values.
6. Relative valuation: the market-cap floor differs slightly between captures; Figure 2.8 is from a later, undated session (region `Global (Developed)`, other peers); Figure 2.7's peer list holds a second line for the subject company (another listing), and one peer row is orange for no visible reason; on Figure 2.23 one positive day change is white instead of green.
7. Mixed capture dates: report Figure 2.11 is from 3 March 2019 or later, while Figure 2.10 is from 31 January; Figures 2.8 and 2.11 have no footer; Figure 4.9 comes from another machine in another time zone; Figures 4.6 and 4.8 have blank quote headers.
8. Text against figures: the conclusions say the tangency portfolio short-sells 26.55 % of GSK, while Figure 4.1 shows `-26.544%`; the EWP table is titled `Equal Weighted Portfolio` while its caption says "Equally"; the dissertation calls `ADS` Konami (it is Alliance Data Systems) and puts ALXN's peak in the third quarter of 2016, where the chart has it in mid-2015.
9. Spellings kept as printed: `investibility` (index description), `Stretegic` and `Combustile` (BATS segment names), `managment` (dissertation Figure 1.2), `Momemtum` (Figure 4.2's caption), `Porfolio` (Tables 5.6 to 5.15).
10. The weights charts do not say which run they plot, and their colours repeat, so a line cannot be tied to a stock from the image.
