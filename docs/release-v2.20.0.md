# Armin Terminal 2.20.0

This release works through the owner's feedback document point by point, fills the expected revenue that EARNINGS and EVENTS left blank, and adds a stock movers screen like Yahoo Finance's markets pages. Every new source is public and needs no key.

## Expected revenue for every quarter (EARNINGS, EVENTS)

Yahoo drops a quarter's revenue estimate once the quarter is reported, so past quarters showed "--". The desktop app now reads each stock's earnings history from public pages:

- **Finviz's quote page** first: about two years of reports with each quarter's end date, the revenue and EPS expected and reported, the GAAP diluted EPS, the report's date and session, and the coming report's estimates.
- **Zacks' earnings page** for older quarters (about five years). When Zacks answers with its bot-protection page, the app does not try to get past it: it rests Zacks for half an hour and reads **MarketBeat's** earnings page instead.
- Reported revenue from the company's own filings still wins over a page's. An estimate far from the reported figure (another basis or currency) is not used.
- Histories are kept on disk until the company's next report, so reopening a stock or the calendar is instant.

APLD's EARNINGS now shows expected revenue for all eight quarters: Q1 2027 116.29M expected against 341.88M reported. Fourth quarters, which the filings do not tag, take their GAAP EPS from the histories (Coca-Cola Q4 2024: 0.508). A duplicate Q4 line (MarketBeat lists the annual report as a second row) is merged, and quarter names are written one way (Q2 2026, not Q2 26).

## EVENTS: a readable market calendar, with accurate EPS

- One figure per column: company, period, EPS expected, reported and surprise, revenue expected, reported and surprise, market value and time. The description strings are gone. A two-line legend replaces the long note.
- The calendar opens at today, with the column headings kept in view. Revenue and the session fill in for the lines on screen first, then those around them.
- **Accuracy fix:** for reports of the last days, Nasdaq's "eps" field holds last year's EPS until Nasdaq has the figures (on 21 October all 53 reports of the day before showed their Q3 2025 EPS, such as Netflix 0.59 against an actual 0.87). That EPS is now used only once Nasdaq gives its surprise; until then the line takes the earnings history's figures, or reads "awaiting".
- The earnings card fills its figures from the company's merged consensus, one source per comparison. APLD: revenue 116.29M expected, 341.88M reported, a 194% beat.

## Feedback document

1. **PROFILE news** is back under the profile: the company's six latest stories, with All news for the rest.
2. **Relevant peers.** A US stock's peers are now the companies Finviz lists on its quote page, with the stocks Yahoo links to it both ways. APLD: Cipher, Core Scientific, TeraWulf, IREN, MARA, Riot, CleanSpark, Galaxy, Hut 8, Bit Digital (it was Snowflake, GoDaddy and Akamai). Coca-Cola: PepsiCo, Keurig Dr Pepper, Monster. DES Industry Info and PEERS share the list.
3. **MANAGEMENT** shows each named executive's real pay, read from the latest proxy statement's Summary Compensation Table: total pay for the fiscal year, salary and the year before (APLD: Wes Cummins $189.2M in FY26, salary $875K; Apple: Tim Cook $74.3M). Yahoo's unlabelled "Pay" and its columns of zero option values are gone. Officers outside the table read "not disclosed", and zero cells in the insider tables are blank.
4. **ANALYSTS' rating actions** read like TipRanks': date, analyst, firm, the price target before and after (green when raised, red when cut: Needham $83 → $70), BUY, HOLD or SELL, the upside from the last price, and the action. They come from MarketBeat's public forecast page; quantitative rating services are left out.
5. **Equibles research** is readable: analyst estimates are one table by period (average, low, high, analysts, the average 30 days ago and its change, the month's revisions), asked in one request for every observation. When a company's newest guidance is old, the guidance report says so first (APLD: last given on 16 January 2024).
6. **PEERS (Relative Valuation)** uses the peers above. Ratios that are not meaningful read NM (P/E on a loss, P/B and ROE on negative equity, EV/EBITDA on negative EBITDA). The dividend column shows only when someone pays.
7. **WATCHLIST**: US stocks' bid, ask and volume come from Nasdaq's real-time quote where the price source has none, or one far wider than Nasdaq's (Alphabet showed a $10 spread; now 331.46 / 331.49). A 1Y column sits beside YTD. Empty cells are blank, and currencies, indices and yields show no volume instead of 0.
8. **Corporate events**: see EVENTS above.

**BREAKING** tags now mark only stock-moving news: a story of the last two hours about the company that reports results, guidance, a rating or target change, a deal, an approval, an offering, a management change, legal action or a large share move. Questions, rankings, previews, opinions and round-ups are never tagged. The top bar's count and the BREAKING screen follow the same rule, and the screen has a "Breaking only" switch.

## TOPMOVERS: stock movers

A new screen in the Markets menu with Yahoo Finance's lists: Most Active, Trending Now, Top Gainers, Top Losers, 52 Week Gainers and 52 Week Losers. Each stock shows its day's price path, price, change, volume against the three-month average, market value, P/E, 52-week change and a 52-week range bar. Lists refresh every minute; a symbol opens the stock. Typing GAINERS, LOSERS or TRENDING opens that list.

## Also

- **WBF** (bond futures): US Treasury futures from 2-year to Ultra Bond with cash benchmark yields and the implied rate of SOFR and fed funds futures.
- Est P/E and Est PEG on PROFILE read NM when the year's EPS estimate is a loss.
- PROVIDERS lists the new public sources (Finviz, Zacks, MarketBeat) with what each serves and how often it is asked.

Validation: 964 unit tests, 35 browser tests and 32 Electron tests (new: PROFILE's news box and BREAKING tags), ESLint, TypeScript and the production build. The desktop app was run on live data: EARNINGS for APLD, NVIDIA, Coca-Cola and Apple; the EVENTS market calendar and its APLD and Netflix cards; PEERS for APLD and Coca-Cola; MANAGEMENT for APLD and Apple; ANALYSTS for APLD; the watchlist; and every TOPMOVERS list.
