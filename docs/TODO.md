# To-do list

Updated 26 October 2026. This is the one list of what comes next for Armin Terminal. When an item is finished it moves to "Done" with the commit that did it. Work happens on the branch `claude/market-events-v2.16.0-id814n`.

## Next, in this order

Items 1 to 8 are done. Item 9 is under way: the atlas's sources are being read and compared with the app (see below); the videos need frames from your PC. Items 10 to 13 are the rest of the work you approved on 26 October, in this order.

### 10. PORTFOLIO transactions (the screen)

The calculations are done and tested (`27947b2`, `src/finance/ledger.ts`, `tests/ledger.test.ts`): buys, sells and dividends with dates, fees and exchange rates; first-in first-out lots; trades before a split on today's share basis; realised P&L split into price, FX and fees; the time-weighted return (buys counted from the start of their day, sales and dividends at its end, dates a holding lacks left out) and the money-weighted return (XIRR, annualised only over a year). Still to do, as designed in `docs/HANDOVER.md`:
- A `transactions` list on each portfolio (`Portfolio` in `src/terminal/userdata.ts`), and a fourth PORTFOLIO tab, Transactions: a form (type, security, date, quantity, price, fee, an optional exchange rate), the list with delete, the open lots, the realised P&L, and the returns.
- The rate of a past trade in another currency: the ECB's of that day (`ecbRateOn`), or the one typed in; today's market rate for a trade of today.
- Futures stay on Holdings: the ledger is for cash instruments.
- Holdings and the ledger: a trade updates its holding when the two agreed before; when they differ, say so and offer "Use the transactions".
- Tests: unit tests of the store operations, a browser test of the form and tables, a desktop test with a split (Yahoo's split list) and an ECB rate.

### 11. BONDCALC call schedules

Yield to call and yield to worst from a call schedule typed in (dates and prices), with the price of each call shown; tests against a worked example.

### 12. The help desk against planted instructions

Tests that the help desk (MESSAGES) ignores instructions planted in the news, filings and pages it reads ("ignore your rules and…"): fixtures with such text in a headline, a filing and a profile, and checks that the answer neither follows nor repeats them.

### 13. The newly confirmed codes

From `docs/audit-v2.23.0-coverage.md` (research of 26 October): WCR, WEIS, WM, the sector pages AGS, MINE, GAS and OIL, the ECB, BOE and BOJ portals (as FED), MYN, NLRT, GEW and CBRT (in part). NGAS needs an EIA key from you.


### 9. Compare the app with the reference atlas and Codex's list of Bloomberg videos

Evidence pack v3 (Codex, 26 October): read, its claims checked against the publisher's pages, and its 38 feature areas compared with the code. The gap analysis is in `docs/bloomberg-parity.md`, "Evidence pack v3: gap analysis". In short:
- Its counts hold: 45 sources (6 at E2, 21 at E1, 18 at E0), no video frames or captions.
- One claim does not hold: the official page lists DSCO without saying what it is, so "DSCO means document search" is a guess. BTM could not be confirmed.
- It showed a real defect in the app: W opened `WATCHLIST`, but the official chapter list names W as Worksheets.
- Approved on 26 October and under way. Done: currency conversion (`FXCA`, `36c4515`), EV with preferred stock and minority interest on `PEERS` (`89ef249`), LLP to `LAYOUTS` (`3951765`), worksheets under W (`f26fa11`), and the screener over the full US list with AND and OR groups, a stated choice for missing values and saved screens (`8caa5d7`).
- Next: transactions on `PORTFOLIO`, call schedules on `BONDCALC`, the help desk tested against planted instructions, then the newly confirmed codes (WCR, WEIS, WM, the sector pages, the central bank portals, MYN, NLRT, GEW, CBRT).

Progress on 25 October (the audited atlas of 69 references replaces the request for PDFs 1 to 33):
- Read: the ECB's framework for its reference rates, the SEC's Form 13F FAQ, Babson's equity valuation walkthrough (22 pages), the cover of the Global Equity methodology (it is the October 2026 edition), Bloomberg's chapter lists for two tutorials and 15 university guides. The CME guides refuse automated requests. The older manuals (V02 to V06) and cheat sheets (N02 to N07) are downloaded, not yet reviewed.
- Fixed from them: what a 13F lists (`5ef039b`), the ECB rates' times and purpose (`6a8ac50`), split adjustment stated on HISTORY (`921cf87`), one beta basis on BETA, WACC and RISKPREMIUM (`812edcd`).
- Every finding, with its source and page, is in `docs/bloomberg-parity.md`, "Evidence audit from the reference atlas".
- V02's CAPM notation, flagged by the atlas, is checked: "Risk − Free Rate" is the risk-free rate, and the formula is the CAPM the app uses.
- Next: review V03 to V06 and N02 to N07; a percentile rank on PEERS; then the screens you use most against the frames, once you send them.

You asked: whether Codex's research list of Bloomberg videos (official tutorials, feature demos, university recordings and webinars) is useful, and if so to add it.

What it adds: the list names 41 function codes.
- 15 already have a screen in the app: WEI, IMAP, EQS, RV, FA, EE, ANR, TOP, CN, PORT, YAS, SRCH, OMON, OVME and IB.
- 6 were already sorted by the 2.23.0 audit. WATC, HRA and OVDV can be built from free data (they are in "Later"). BI, OMST and BLP need the provider's own content or platform.
- The other 20 are new to the gap list: MREP, DSX, CHRT, ALTD, AID, BTM, BTST, CRAN, MM, CMGR, WSL, ASKB, FIW, CFND, SHOK, OVI, OPX, OSCH, BQL and BQNT.

Research pack (ChatGPT's improved version of 25 October, read in full):
- Useful: its evidence levels (a link, an official description, a chapter list, frames actually seen, behaviour checked in software) match this project's rule that nothing counts as checked from a title alone. Bloomberg's official chapter timestamps for three tutorials are a good start, and its checklist of financial tests is sound.
- Where it conflicts with how this project works:
  - It asks for six new documents (inventory, manifest, gap audit, feature matrix CSV, entitlements, access report). The project already keeps `docs/feature-matrix.md`, `docs/data-providers.md` (sources, terms, limits) and `docs/audit-v2.23.0-coverage.md`. I'll extend those rather than start parallel copies.
  - It suggests `research/video_evidence/` in the repository. Screenshots and transcripts of Bloomberg's videos are copyrighted and stay in a git-ignored folder (`reference/videos/`, like `reference/pdfs/`). Only my own short notes go into the repository.
- Already handled in the app, so not new work: IEX is labelled as one exchange, not the whole market; estimates come only from named providers; missing data is shown as missing.
- Its counts are right as far as I checked: 45 resource links plus 9 decorative images.

What works from this cloud session (checked 25 October, nothing installed):
- Python 3.13 and FFmpeg 6.1 are here; yt-dlp is not.
- YouTube answers this session with Google's "unusual traffic" page, so neither frames nor captions can be fetched from here. Getting around that would need your account's cookies, which I won't use.
- Bloomberg's official chapter pages load, so their timestamps are usable as documented evidence. bloomberg.com's Pro Tips pages refuse automated requests (403). Vimeo pages load, but its player refuses (401).
- The "Watch" plugin (bradautomates/claude-video) is not needed. Its own README says its installer does not run in Claude Code on the web, and its default "Gemini" engine uploads the video to Google, another AI provider, which you ruled out. Its local engine is the same FFmpeg and yt-dlp steps you can run yourself.

Limits:
- I cannot watch videos from here, so the frames must come from your PC (see "Waiting on you").
- Several of the new codes need paid or proprietary data (alternative data, options trade flow, the provider's own research), or are platform features (BQuant, worksheets, compliance rules). They cannot be built without inventing data, which the rules forbid.

Plan:
- Done: the 20 new codes are in `docs/audit-v2.23.0-coverage.md`, section 3, sorted from Codex's titles only. 3 can be built from free data (BTST backtests, CFND correlation search, CMGR portfolio rules; added to "Later"). 12 need the provider's own content, platform or paid data. 5 can't be sorted from a title (AID, MREP, OPX, OSCH, OVI) and wait for the videos.
- Compare the screens you use most with the provider's own documentation, using Codex's checklist. Those screens are the screener, world indices, market map, relative valuation, financials, earnings, analysts, portfolio, bond calculator and options. The checklist covers:
  - how the screen opens
  - its inputs and logic
  - its layout and outputs
  - its links to other screens
  - whether the numbers check out
- Each screen is marked fully working, partial, broken or missing.
- A workflow counts as checked only when I actually saw it, on a document page or in your screenshot, never from a title alone.

## Waiting on you

- The pull request into `main` is ready as a draft: https://github.com/Arminshah/Bloomberg-terminal/pull/4. An older one (number 1, `claude/amber-terminal`) overlaps with it: close it or keep it, your choice.
- For item 9:
  - The video frames have to come from your Windows PC. Choose one route:
    1. By hand, within YouTube's terms: play the video in your browser, pause at each chapter time and take a screenshot (Windows key + Shift + S). Then open the video's "…" menu, choose "Show transcript" and copy the text into a .txt file.
    2. With tools, outside YouTube's terms (its terms forbid downloading videos without permission): `winget install --id yt-dlp.yt-dlp --exact`, `winget install --id Gyan.FFmpeg --exact` and `winget install --id DenoLand.Deno --exact`. Then in an empty folder run `yt-dlp --write-auto-subs --sub-langs en --skip-download https://www.youtube.com/watch?v=h0hYYIGryJ4` for the captions, and `yt-dlp -f "bv*[height<=1080]" -o video https://www.youtube.com/watch?v=h0hYYIGryJ4` followed by `ffmpeg -i video.webm -vf fps=1/2 -q:v 3 frame_%04d.jpg` for one frame every 2 seconds (frame n is at (n − 1) × 2 seconds).
  - Either way, zip the files and attach them here. I will keep them in `reference/videos/`, which I'll add to `.gitignore` first (a one-line change, with your OK), and I will say which frames each finding comes from.
- Senators' history: the Senate's site refuses automated reading and FMP's free plan has only the latest 25 trades, so CONGRESS builds senators' history from today on. For 6 or 12 months of senators' trades and their holdings, there are two options:
  - Eulerpool: your key arrived, but on 25 and 26 October its API answered "Internal server error" to every request, even one with a made-up key, so the fault is on its side. I'll try again. Even working, its congress list gives no link to the filed report and no owner, so I'd check its rows against FMP's before using it.
  - An FMP plan that includes its senate-trades lists.

## Later

- Functions the reference documents name that the app lacks but could build from free data (class a in `docs/audit-v2.23.0-coverage.md`; all 27 the guides describe are built, section 2a). Next:
  - EQBT with fundamental rules (cheap on earnings, say): it needs each company's figures as they were known at each date. The SEC's XBRL frames give filing dates, so it can be built from them; it is a larger piece of work.
  - The 27 the guides on hand do not describe (FXCA, WCR, OVDV, PSRT/PD/HLDR and others) wait for documents 1 to 33 or the videos.
- From Codex's video list, buildable from free data (sorted from titles only, so to be checked against the videos first):
  - BTST: backtests of simple strategies on daily price history (EQBT's engine runs on month-end closes and could take daily ones).
  - CFND: the securities most correlated with one, from CORRELATION's daily returns.
  - CMGR: your own limits on a portfolio (weight of a position, sector or country), checked on PORTFOLIO.
- PEERS: each multiple's percentile rank among the peers (the university guides describe it; the figures are already on screen).
- FINANCIALS: revenue by segment, from the segment tables in the filings' XBRL.
- CONGRESS: liabilities (Schedule D) for an assets-less-debts range; each member's committees (in the Clerk's member list) beside their trades.
- Supply chain (SPLC): more coverage, how recent each relation is, classifier accuracy.
- Blank "--" fields: fill each from a real source or say why it is blank.
- The watchlist and favourites in the TOPMOVERS layout (low priority).
- Nasdaq and NYSE Arca plan a night session (21:00 to 04:00 New York, Sunday to Friday) from 6 December 2026, subject to industry readiness. Once it has started, add it to the watchlist's session line (`usSession` in `src/data/exchanges.ts`).

## Done, on the branch, not released yet

- The typeface is IBM Plex Sans again, fixed by the owner on 27 October: 2.26.0's default (Bergoom) drew thin, uneven figures on Windows. The typeface setting and the Bergoom files are gone; `CLAUDE.md`, `tests/typeface.test.ts` and `e2e/look.spec.ts` keep it from changing.
- `e01d65b` Earnings history: the latest reports' year-earlier days are asked first, so a long season's last week shows its growth at once.

## Done in 2.26.0

- `36c4515` FXCA (CONVERT): an amount at the live rate or a past day's ECB rate.
- `619fada` BILL (LEGISLATION): US bills and laws from Congress.gov, with your key.
- `89ef249` PEERS: enterprise value with preferred stock and minority interest, its build-up on hover.
- `3951765` LLP opens LAYOUTS. `f26fa11` W opens WORKSHEET (worksheets); the watchlist is WATCH.
- `8caa5d7` SCREEN: Nasdaq's whole US list, AND and OR groups, a stated choice for missing values, saved screens.
- `b334f2d` CONGRESS: a member opens in sight; the report year says what it covers.
- `27947b2` The portfolio ledger's calculations (no screen yet: item 10).
- Codes from the reference guides (`docs/audit-v2.23.0-coverage.md`, section 2a, with each commit): HL, WECO, SOVM, WBMV, HRA, TECH, IN, IYC, FED, INSD, EEG, EM, EA, CACT, SIA, GX, CCB, FLNG, RELS, ECOW, ECWB, CCRV, CTM, ECFC, ECTR, EQBT and BILL. Each reads real data only, says where every figure comes from, and has unit, browser and desktop tests. Along the way:
  - `c60f14f` The quarter after next is named by the fiscal year the reports show ("Q3 2027", not "2027-02-28").
  - `6441408` TECH US, HL US, IYC US, EA US and FLNG US still name the stocks (Bio-Techne, Hecla, the iShares fund, Electronic Arts, FLEX LNG).
  - `0ff1746` One company-name helper for Nasdaq's lists (partnership units included).
  - `5d7af8f` CACT's watchlist and portfolio filters match their stocks.
- CI: the repository is private again since 27 October, and GitHub starts no runner for the `test` job (it fails in 3 seconds with no log), as on 26 October. Every push is checked locally first (lint, types, unit tests, both Playwright suites). A release also needs GitHub Actions: check Settings → Billing → Actions, or make the repository public for the build.
- The visual pass (`docs/visual-research-2026-10.md`, "Done in the visual pass" and "What still differs"):
  - `ce9beb6` Bergoom by default, IBM Plex Sans or IBM Plex Mono in SETTINGS; chart labels follow.
  - `12dee50` Measured colours: function bar, section strips, the cyan command line with "<HELP> for explanation."
  - `9f4ce02` Colour-blind schemes (Deuteranopia, Protanomaly) for every rise and fall; the heat scale through the measured tiles.
  - `79d191f` A frame title per panel with maximise, light grey toolbar boxes, suggestions as the terminal lists them, More Functions….
  - `c3a6ce9` The help desk opens on its own page, with who answers and New chat.

## Done in 2.25.1

- `c7cbb74` CONGRESS reads the House Clerk's PDFs on Windows. The 2.25.0 build's tests on Windows found that every report showed "not read" there, as in your preview; 2.25.0 was not published.
- `51a0a32` Tab bar: with more tabs than it holds, + stays in sight and the tabs scroll to the active one (the same Windows tests found it).
- `f987214` PAGE BACK from a screen's last page always goes back a page (a browser test found it on 26 October).
- `ad598d2` Visual pass, step 1: charts sharp at 125% and 150% display scaling.
- `d617130` Revenue expected and reported beside EPS on EARNINGS, EVENTS and the week's board.

- Your feedback of 25 October:
  - `6a2789e` CONGRESS no longer freezes while reports load, a progress bar says what is read and about how long is left, 12 months read in about 105 seconds (was about 4.5 minutes), and holdings without a ticker (Treasury bills, private funds) are left out unless Assets is set to Everything.
  - `beeedbb` EVENTS: the week's most relevant releases as a board, a column a day before the open and after the close, six companies each by name. When Nasdaq's stock list fails (as it did on your PC), Yahoo's quotes rank the companies and the screen says why.
  - `298317a` No grey block in a menu where a row has fewer sections.
  - `73ab3de` Building a layout opens on the whole window; your panels before are kept to save or go back to.
- The browser practice mode stays, as you decided.
- Item 8, review of the data sources (`691a733`, `a1b1fe6`):
  - Codex's table checked source by source against the code and live with your keys (the self-test, run twice: every source that is switched on answered at least once). The write-up is in `docs/data-providers.md`, "Review of Codex's notes".
  - Agreed, and already in the app: official sources first, Kraken for crypto prices and CoinGecko only for market value, Alpaca labelled IEX-only with options marked indicative, Twelve Data off until you confirm display rights, Anthropic optional.
  - Disagreed, with evidence:
    - Nothing needed dropping. The second price sources run only on CROSSCHECK, and they matched Yahoo's closes to the cent for 34 sessions of Apple and NVIDIA. Each news feed carried stories the others did not.
    - Frankfurter only repeats the ECB, so PORTFOLIO reads the ECB itself (`a1b1fe6`): a lot bought on a past date gets that day's ECB rate.
    - OpenFIGI cannot match ADRs to their home shares: it gives an ADR its own identifier, with no link and no ratio. It can link one share across exchanges, which no screen needs yet (in "Later").
  - Added: the self-test now checks OpenFIGI and the House Clerk too (`691a733`).
  - Seen: Alpha Vantage sometimes says its 25 a day are used up when they are not (it answered again 4 minutes later). Yahoo throttled this cloud session's shared address once. The app copes with both.
- Item 7, congress trade tracker (`4221b3b`):
  - CONGRESS (also CONG) is in the Equity menu and in a stock's menu, with four tabs:
    - Members: representatives ranked by the assets in their latest annual report, shown as a range because the forms give ranges.
    - Trades: every trade disclosed in a period, from the latest week to 12 months, by either chamber.
    - Most Traded: the stocks bought, sold or traded most, by chamber, with your periods: latest week, 6 months, 12 months.
    - Most Owned: the stocks the most representatives own.
    - Opened on a stock, it lists that stock's trades.
  - The House is read from the members' own reports: the app reads the House Clerk's PDFs itself (checked live: 426 annual reports, and all 529 trade reports of the last 12 months). It caught something FMP misses: Cleo Fields bought NVIDIA three times on one day in three accounts, and FMP lists it once.
  - The Senate: its site refuses automated reading. Senators' trades therefore come from FMP's latest 25, which the app now asks for every 6 hours and keeps, so their history grows from today. Senators' holdings cannot be read, and the screen says so. See "Waiting on you" for a fuller source.
  - The screen shows the law's notice once (no commercial use, 5 U.S.C. § 13107(c)) before reading anything.
  - Limits: amounts are ranges by law. House reports filed on paper (about 1 in 10) are scans, linked only. Annual totals are assets, not net worth (debts are not subtracted).
- Item 6, 13F portfolios of companies (`fa93936`, chart fix `5b47a39`):
  - HOLDINGS (also `13F`) sits beside HOLDERS under Company Analysis in a stock's menu. It shows what a company reports on its 13F filings on the SEC (its own investments; for a bank or asset manager also its clients' accounts, so not its own holdings): each holding's shares, value at the quarter's end, share of the portfolio and the change since the quarter before (new, added, reduced, unchanged, sold out).
  - Beside the filing it shows today's price and value and the change since the quarter's end, with each figure labelled filing or today. Tabs give a map sized by value and the holdings sold out, and there is a chart of the portfolio's value by quarter, any earlier quarter and a CSV export.
  - Tickers come from OpenFIGI with your key.
  - Checked live: NVIDIA, Berkshire, JPMorgan and Apple on screen. The line totals match the filing's own total for nine companies, and NVIDIA's quarter-end prices match the 30 June closes to the cent.
  - Found while checking: JPMorgan filed an amendment marked "new holdings" that repeats its whole report. The app reads it as a restatement and says so, instead of counting every holding twice.
  - Apple files no 13F, and the screen says why.
  - Limits: a 13F is filed up to 45 days after the quarter. It leaves out cash, short positions and shares listed only outside the US. HedgeFollow's "average buy price" is an estimate and is not shown.
- Item 5, your own layouts (`58df78d`):
  - LAYOUTS builds one in three steps: how the rows look (up to 4 rows, 4 tiles in a row, 6 in all), a screen per tile, a name.
  - Each row keeps its own tile widths. Dragging the lines sizes the tiles, and the layout comes back exactly as saved.
  - After changes, a dot on LAYOUTS ▾ and "Save changes to …" offer to save them.
- Item 4, window buttons in the tab bar (`3d2d6a0`):
  - The white title bar is gone. Minimise, maximise and close sit at the right end of the dark tab bar, behind a grey line no tab passes, even with 12 tabs or a narrow window.
  - The bar drags the window, and a double click on its empty part maximises it.
  - Checked on Linux; please look at it on Windows.
- Item 3, the watchlist's live session (`440a174`):
  - A line above the list says which session US stocks are in now: pre-market, regular, after hours or closed (night, weekend or holiday). It gives the time to the next change and names the column to read, which is marked LIVE. It also says whether the list's other markets are open.
  - Hours are from Nasdaq; on early-close days after hours ends at 17:00 (NYSE Group's calendar).
  - Your screenshot's 0.00% after-hours figure was real: Yahoo's chart shows APLD's last after-hours trade on Friday at 18.25, the close.
- Item 2, corporate events (`ca6b4e9`):
  - EVENTS opens on the week's most relevant releases, Monday to Friday, before the open and after the close. It shows the 10 most traded companies of each (dollars traded in the latest session, from Nasdaq's stock list), with share classes counted once. Against an earnings site's list for the week of 26 October, 34 of its 45 companies are among ours, and 2 of the others aren't listed in the US.
  - The list of every report starts from $50B.
  - Every list opens on the latest trading day. Showing earlier days adds them above it without moving the view.
- Item 1, wrong numbers in estimates (Codex's seventh fix, checked live with your keys):
  - `41db98f` FMP never gave a company's earnings history: the app asked for 20 reports and the free plan refuses more than 5.
  - `8b60de7` FMP's revenue estimates, in dollars, could sit beside revenue reported in another currency.
  - `fe6937d` Finnhub answers for a foreign company's home listing were read as the US listing's: TSMC's figures in Taiwan dollars (a market value of 61.8 trillion, an EPS "surprise" of +409%), ASML's in euros. They are now left out, and the screen says why.
- `c679c7e` WHATSNEW: the version and release notes inside the app.
- `fd74386`, `947432e`, `7fc9d96`, `6a12a50`, `2b0fe97` Data fixes: CoinGecko, TipRanks, BLS and Eurostat, stale marks, IEX price history.
- `845e5f8` Browser practice mode: markets closed at the weekend show Friday's finished session.
- `79741bc` PORTFOLIO: several portfolios as tabs.

## Released

- 2.26.0 on 26 October 2026 (`docs/release-v2.26.0.md`), at your request, before the work moved to another account.
- 2.25.1 on 26 October 2026 (`docs/release-v2.25.1.md`), at your request. 2.25.0 was built but not published (see "Done in 2.25.1").
- 2.24.0 on 23 October 2026 (`docs/release-v2.24.0.md`).
