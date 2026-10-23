# Armin Terminal 2.24.0

This release adds workspace tabs like a browser's, brings back the regional heat map beside a new heat map of each index's members, gives European stocks analyst research, and fixes what a full audit of 2.23.0 found, including two wrong figures. Windows only.

## Workspace tabs

Each tab above the top bar is a whole workspace: its layout, its panels and each panel's screen history.
- **+** or **Ctrl+T** opens a new tab. **×**, a middle click or **Ctrl+W** closes one; closing the last tab leaves a fresh one.
- **Ctrl+Shift+T** reopens the tab closed last, with its screens.
- **Ctrl+PageDown / Ctrl+PageUp** move to the next or previous tab; **Ctrl+1 to Ctrl+8** open that tab, **Ctrl+9** the last.
- Double-click a tab to rename it (EQUITY_LONG, Research); drag it to reorder.
- A tab is named after its active screen ("AAPL CHART"), or "New Tab" until something is opened in it.
- Tabs and their workspaces are kept per window and across restarts.

## Heat maps

- **HEATMAP** is the regional heat map again: the US, Europe, Asia Pacific and World stocks the app follows, by sector and industry, sized by market value and coloured by the 1-day, 5-day, 1-month, year-to-date or 1-year change.
- **INDEXMAP (IMAP)** gains a **Heatmap** tab beside the pie chart and the table: every member of the S&P 500, the Nasdaq-100 or the Dow, grouped by sector and industry group, sized by estimated index weight and coloured by today's change. Click a sector to open it, a tile to open the stock.
- For an index whose members the app cannot load (Euro Stoxx 50, FTSE 100, BEL 20 and others), INDEXMAP opens the map of its region under a note saying it is not the index's membership. It used to show the US map titled "US by sector".
- The labels are small and even, in the terminal's type, instead of large bold letters; a label that does not fit is in the tooltip rather than cut off.
- A stock without a known sector is grouped as Unclassified, not "--".

## Analyst research for stocks listed outside the US

With Yahoo research switched on, PROFILE, ANALYSTS, ESTIMATES, FINANCIALS and EARNINGS now ask Yahoo for the estimates, targets and ratings of European and other non-US listings (ASML, LVMH, SAP) under their Yahoo symbol; they used to ask by US ticker only and showed nothing. Estimates are compared with the statements only in the same currency, and P/Es on estimates take the price in the estimates' currency (pence in pounds, another currency at the day's rate). The other research sources cover US listings only.

## Corrections

- **NVIDIA's FY2022 EPS** was taken from a filing made before the 10-for-1 split of June 2024: FUNDCHART showed 3.85 and a P/E of 5.9 next to the later years' restated figures. Per-share figures from SEC filings now follow the splits made after each filing: 0.39 and a P/E of 59.3. The SEC filings screen keeps the figure as filed, marked **s**, with today's basis in its tooltip.
- **NVIDIA's EARNINGS** showed a quarter "ended 30/09/26" as already reported, and some quarters twice. Finnhub names each quarter by the calendar quarter its fiscal quarter ends in; those are now put on the company's own fiscal quarters. Each quarter shows once, and the reported EPS match the 10-Q filings.
- **P/E and EPS:** a P/E is no longer shown next to a blank trailing EPS (SAP, Berkshire). A P/E on a loss reads **NM** on FUNDCHART and QUOTE, as it already did on the profile.
- **SAP's EARNINGS** asked for an Alpha Vantage key that was already set. It now says the earlier estimates' sources cover US listings only.
- **Autocomplete:** typing "apple" lists Apple Inc first, not a ticker APPLE that doesn't exist.
- **Bonds:** `CT10 Govt` and `GT10 Govt` say Treasury prices are not available from the free sources and name the yield line (USGG10YR Index), instead of "No stock found".
- **Key bar:** the PORT key types CLIENT, as F12 does; `CLIENT <GO>` opens PORTFOLIO.

## Commands from the reference guides

- `TOP Oil`, `TOP Europe`, `TOP China`: market news filtered by the word (`TOP Oil` used to show every story).
- `FIRS` opens BREAKING; `HCP` and `HCPI` open HISTORY; `FXFR` opens FXFORWARD; `PRTU` opens PORTFOLIO.
- `CLA Comdty`, the active crude contract, names the front contract the app follows (CL1 Comdty).
- **SCREEN** can leave out industries: type words such as "tobacco, casinos, defense" in Exclude industries.

## Under the hood

- The audit report, with every figure checked against the Treasury, FRED, the SEC, FINRA and FMP: `docs/audit-v2.23.0.md`; the coverage of the guides' functions: `docs/audit-v2.23.0-coverage.md`.
- 1,231 unit tests, 39 browser and 34 desktop end-to-end tests.
