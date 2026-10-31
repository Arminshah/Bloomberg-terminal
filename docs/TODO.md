# To-do list

Updated 30 October 2026. This is the one list of what comes next for Armin Terminal. When an item is finished it moves to "Done" with the commit that did it. Work happens on the branch `claude/market-events-v2.16.0-id814n`.

## Next, in this order

2.30.0 was requested on 31 October through `.github/release-request.json`: the portfolio-management screens (FRONTIER, MPC), the FTSE 100 screen, the SPLC review fixes (`docs/splc-review-2026-10-30.md`), official session figures from Nasdaq's record, the interface work of 31 October and the unpublished 2.29.1 accuracy work. It is published only once the release workflow has finished and both Windows executables and their checksums are on the release.

### 15. More free data sources (asked 31 October)

The owner asked for every free source that makes the data more complete, accurate and checked. One source at a time: read its terms, test it live, compare a sample with a second source, then build it with tests (`docs/adding-a-provider.md`).

- Done: `OPTIONS` opens on Nasdaq's composite option chain (US stocks, ETFs, NDX, XND) with volume and open interest, and the app's IVM, Greeks and implied forward per expiry; Alpaca stays as the second source (`docs/data-providers.md`, "Nasdaq option chains").
- Done: the PBoC, RBI and Banxico rates and the BOJ's guideline come from the BIS's policy-rate compilation, so `CENTRALBANKS` and `RATEANALYSIS` list them in the desktop app, dated by the BIS's latest observation. The Dow's fallback member list has Alphabet in Verizon's place (since 29 June 2026). The S&P 500's member weights come from State Street's SPY holdings (its shares at each previous close), within 0.006 points of SPY's own weights; DIA's holdings give the Dow's members when Yahoo gives none. FINANCIALS' Segments page reads foreign filers' 20-F and 40-F in IFRS too (IFRS 8 segments, products and services, geography, operating profit, in the filing's currency): checked on Novo Nordisk's, Shell's and TSMC's 20-Fs, whose lines add up to their totals. SAP tags its segment figures with a company axis of its own as well, so only its geography shows. DES shows an S&P 500 member's SEDOL1 and, for a company incorporated in a US state, its ISIN (from the CUSIP in SPY's file). SHORTINTEREST covers ASX stocks from ASIC's daily short position reports (CC BY 4.0). Spain's 10-year yield comes from Banco de España (secondary-market average, about two business days behind).
- Done: Treasury prices from TreasuryDirect's FedInvest (Bureau of the Fiscal Service): the day's Sell, Buy and End of Day price of every marketable Treasury by CUSIP. The page is a form with a token and a cookie and refuses Node's requests, so the desktop app asks through Chromium's stack (`net.fetch`), for the latest day with prices and the one before, when a Treasury is first needed. Each note and bond becomes a security ("T 4 5/8 08/15/36 Govt", its CUSIP an alias): ALLQ shows its Sell and Buy, SRCH's results have prices and open it, YAS starts from its terms and price.
- Not used: Cboe's delayed quote files (SPX, RUT and VIX options, Greeks). Every Cboe quote page forbids automated download and warns of IP blocks (`docs/data-providers.md`, "Cboe delayed quotes"). Only the owner can decide otherwise.
- Next, from the survey of 31 October (each still to be checked the same way before it is built):
  - Index futures outside the US: done for the Euro Stoxx 50 and DAX (Eurex's daily settlements on INDEXFUTURES, 31 October); next, JPX for Nikkei 225 (NK1) and TOPIX futures. Checked on 31 October 2026: JPX's daily settlement file (`rb_e<date>.csv`, 3.9 MB with every option) gives each contract month's settlement, theoretical price and the index close (Nikkei 225 December 2026 at 63,490 on 30 October, index 63,290.11), but only the latest day's file stays online (the day before's answered 404), so a day's change needs the app to keep each day's settlement with its date. JPX's terms bar collecting or reusing its data for commercial purposes only; its robots.txt allows all. No permitted free source gives their intraday prices.
  - UK short interest: the FCA's daily aggregated net short positions exist, but its terms (clause 3.3) bar including them in an electronic retrieval system without permission: the owner's call.
  - Treasuries: auction results and the auction schedule are on `AUCTIONS` (`AUCR`) since 31 October, from Fiscal Data and TreasuryDirect. Next: buybacks, and TIPS and FRN index figures; the Bank of England's 2 and 30-year gilt points exist only as zero-coupon yields.
  - Fund holders: the SEC's N-PORT data for every fund holding a stock (HOLDERS), and the 13F data sets for buyers and sellers counts.
  - Economics: GDPNow and the Cleveland Fed's inflation nowcasts are on MACRO, and the ECB's Survey of Professional Forecasters on ECOFORECASTS, since 31 October; ECO's release times are right in winter now. The BLS's release schedule gives ECO the official times of payrolls, CPI, PPI and JOLTS, asked with the owner's SEC_USER_AGENT contact as the owner allowed on 31 October. The Philadelphia Fed's US survey is on ECOFORECASTS too, read from its release page (the owner's choice, 31 October).
  - Not available free: SPX, RUT and VIX options (Cboe's terms), per-bond corporate and municipal prices, ESG scores, a history of consensus price targets.

### 14. Match the provider's terminal screen for screen (asked 31 October)

The owner's plan is `docs/parity-build-plan.md`, with the evidence in the owner's private reference pack (cloned into the git-ignored `reference/visual/bloomberg-pack-2026-10-31/`, never committed). Work through it in order: setup, M1 window chrome, M2 navigation and keyboard, M3 screens, M4 calculations, M5 missing functions. Its "Progress" list is ticked with each commit; start at the first unticked item. Two things never change: the typeface (`CLAUDE.md`) and the watchlist (`tests/watchlist-guard.test.ts`, `e2e/watchlist-guard.spec.ts`). The owner approved the 2024 visual corrections in the pack's `START_HERE_FOR_CLAUDE.md` except anything touching those two. Features with no counterpart stay; ask the owner before hiding any.

Done on 31 October: the setup (plan in docs, watchlist guards `6d78081`) and all of M1, the window chrome, one commit each: red bar `f2c4c62`, command line `201adf0`, two-line quote strip `3105797`, toolbar `ddcdd45`, autocomplete `ce374b7`, section strips and Suggested Functions footer `b9e8ef2`, tab strip as title bar `03644ee`, Options menu and window keys `8ef6d15`, dialogs `d77cab1`, field lists `e56c429`, fixed-width pages `f133377`. What each matches, what does not and why: `docs/bloomberg-parity.md`, "Parity build". Before and after: `docs/parity-m1-des.png`, `docs/parity-m1-typing.png`.

M2, navigation and keyboard, is done too (2.1 to 2.6, ticked in the plan with their commits).

M3, screen by screen, in the plan's order: DES (Profile `b61bebc`, Revenue & EPS `323e9e6`, Ratios `2e252ee`), FA (`fe08045` red bar dropdowns, numbered grey tabs and views from 11); `0387b8e` the grid, graph mode and settings; `c4c72f2` Segments), EE (`36f7dbb`), ANR (`e3eafc0`) and RV (`ff87aeb`). Each entry in `docs/bloomberg-parity.md` lists the frame's elements, what now matches, what is the app's own, what is a labelled blank and what is not built. Before and after: `docs/parity-m3-fa.png`, `docs/parity-m3-ee.png`, `docs/parity-m3-rv.png`.

Then EQS (`d7450ba`), WEI with 10D and 30D volatility (`ba4144e`), tab names (`5ba9041`), IMAP (`5455a63`, checked on live data in the desktop app) and GP (`1448c52`). Pictures: `docs/parity-m3-eqs.png`, `docs/parity-m3-imap-live.png`, `docs/parity-m3-gp-live.png`. A screen can now hold Back for a page of its own (`src/terminal/subpage.ts`), as EQS's results do.

Then YAS (`e6df1a3` the measures, `e37c4e3` the page), checked against the frame's own bond: Spread 105.07, yield 5.540202, Equiv 5.616937, 97 days, current yield 5.490 as the frame shows (`docs/parity-m3-yas.png`).

Then SRCH (`a71fab9`, the Treasury's 463 marketable securities), WB (`6b505c3`, official yields with the Data Range band and Security Analysis) and ALLQ (FedInvest's prices for Treasuries in the desktop app, simulated dealers in the demo). Pictures: `docs/parity-m3-srch-live.png`, `docs/parity-m3-wb-live.png`, `docs/parity-m3-allq-live.png`.

Next: PORT (every tab), then WACC, BETA and the rest of M3 in the plan's order; the YAS spreads still blank (G-Sprd on the government curve, I-Sprd and ASW on a swap curve) are M4 work. Left for now, and why: TOP, N, CN and NSE share `src/functions/MNEWS.tsx`, where the other session is working on CN (header line, Previous and Next, numbering from 101), so the parity build returns to them once that settles; TOP's frame (TE05 01:31) wants the red bar All Stories, Pages ▾, Custom Searches and Translate ▾, a <Narrow> field with Pause, numbered top stories with source codes and times, Featured Stories with a pager, "Scroll Down For:" topic boxes, and Spotlight and First Word at the right. DS's Ask a Question is built with the owner's Gemini key (31 October): answers from the filing's text only, each point over the filing's own words, the rest dropped and counted (`docs/bloomberg-parity.md`, "M3 DS"). GP's studies are in Edit Chart's side panel, as the owner chose on 31 October (closest to the terminal).

Portfolio management (asked 30 October): build everything in the owner's upload as exact copies, on real data. The plan, the errors found in the sources and how each is handled, and what cannot match are in `docs/portfolio-management-plan.md`; each screen's description is in `docs/portfolio-management-screens.md`. Order: mean-variance maths, month-end prices, the mean-variance screen, screening (FTSE 100, gross margin, return on common equity, running match counts), the MPC back-test with the Hold policy, then the company analysis screens.

2.29.0 is published. The live follow-up and the 2.29.1 patch are documented in `docs/accuracy-v2.29.1.md`. At `8234588`, CI including Windows passed; the live audit reported 553 passes, zero numerical failures, five flags, two blocked checks, three incomplete results and 103 skips. Verification remains incomplete. The earlier completed-session open/volume discrepancies still need corroboration. Next evidence work: Lilly's share definition, Exxon's revenue basis, partial supply-chain coverage and unavailable references. Keep coverage limits separate from passing software checks, and hold the 2.29.1 publication request.

Continued definition work now preserves actual share-count origins, exposes compatible filed revenue definitions, and verifies Fed statements through guarded official discovery and full bodies. All local checks passed (1,895 unit, 95 browser and 77 desktop tests, lint/type/build); review a fresh live run before calling those source questions resolved.

The owner-authorized 2.29.0 accuracy work is documented in `docs/accuracy-v2.29.md`, with release notes and explicit live-verification limits. The scheduler-only exception for main is recorded in HANDOVER. Do not treat the eight-company documentary samples as completion of the outstanding full SPLC/ownership reviews.

Items 1 to 8 and 10 to 13 are done, all on 27 October except the first eight; NGAS, the last code of item 13, came with the EIA key on 28 October. Item 9 continues with public written and illustrated sources: the three archives of public guides you sent on 27 October gave the first screenshots inspected, and three changes came from them (below, "Done after 2.27.0"). Missing video frames do not block documented functional work. What comes next is yours to choose: "Later" lists the candidates.


### 9. Compare the app with the reference atlas and Codex's list of Bloomberg videos

Review recorded on 26 October: evidence pack v3 (Codex) was read, its claims checked against the publisher's pages, and its 38 feature areas compared with the code. The gap analysis is in `docs/bloomberg-parity.md`, "Evidence pack v3: gap analysis". The findings then were:
- Its counts hold: 45 sources (6 at E2, 21 at E1, 18 at E0), no video frames or captions.
- One claim does not hold: the official page lists DSCO without saying what it is, so "DSCO means document search" is a guess. BTM could not be confirmed.
- Rechecked on 27 October from the new account (`docs/bloomberg-parity.md`, under the gap analysis): a university guide names DSCO Document Search, and the publisher's post on BTM (16 October 2026) exists. Both are now written evidence (E1); neither changes what can be built.
- It showed a real defect in the app: W opened `WATCHLIST`, but the official chapter list names W as Worksheets.
- Approved on 26 October and under way. Done: currency conversion (`FXCA`, `36c4515`), EV with preferred stock and minority interest on `PEERS` (`89ef249`), LLP to `LAYOUTS` (`3951765`), worksheets under W (`f26fa11`), and the screener over the full US list with AND and OR groups, a stated choice for missing values and saved screens (`8caa5d7`).
- Next: transactions on `PORTFOLIO`, call schedules on `BONDCALC`, the help desk tested against planted instructions, then the newly confirmed codes (WCR, WEIS, WM, the sector pages, the central bank portals, MYN, NLRT, GEW, CBRT).

Progress on 25 October (the audited atlas of 69 references replaces the request for PDFs 1 to 33):
- Read: the ECB's framework for its reference rates, the SEC's Form 13F FAQ, Babson's equity valuation walkthrough (22 pages), the cover of the Global Equity methodology (it is the October 2026 edition), Bloomberg's chapter lists for two tutorials and 15 university guides. The CME guides refuse automated requests. The older manuals (V02 to V06) and cheat sheets (N02 to N07) are downloaded, not yet reviewed.
- Fixed from them: what a 13F lists (`5ef039b`), the ECB rates' times and purpose (`6a8ac50`), split adjustment stated on HISTORY (`921cf87`), one beta basis on BETA, WACC and RISKPREMIUM (`812edcd`).
- Every finding, with its source and page, is in `docs/bloomberg-parity.md`, "Evidence audit from the reference atlas".
- V02's CAPM notation, flagged by the atlas, is checked: "Risk − Free Rate" is the risk-free rate, and the formula is the CAPM the app uses.
- Remaining research: review V03 to V06 and N02 to N07 where accessible, check the percentile rank on PEERS, and compare the priority screens with public written guides and illustrated pages. Record any exact visual details those sources do not settle.

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

Access recorded in the previous cloud session (checked 25 October, nothing installed):
- Python 3.13 and FFmpeg 6.1 are here; yt-dlp is not.
- YouTube returned Google's "unusual traffic" page; no frames or captions were fetched. No account cookies were used.
- Bloomberg's official chapter pages load, so their timestamps are usable as documented evidence. bloomberg.com's Pro Tips pages refuse automated requests (403). Vimeo pages load, but its player refuses (401).
- The "Watch" plugin (bradautomates/claude-video) was not used. Its README said its installer did not run in Claude Code on the web, and its default "Gemini" engine uploaded video to Google, another AI provider, which you ruled out.

Access checked on 27 October in Codex's environment: the proxy refused CONNECT requests to public reference hosts with HTTP 403. Network requirements were saved to the environment draft but have not been applied. No new PDF, image or video access is established by that save. A source being inaccessible here does not mean it does not exist; retry after access changes.

Access checked later on 27 October from the new account's environment: the University of San Diego's guide, the publisher's insights site (and its post search) and the ECB's framework PDF all answered. Reference research can continue from here.

Progress on 27 October, evening (the owner's three archives of public guides: a student DES guide of February 2026, a university manual with TSMC's earnings screens of July 2024, a BQuant tutorial with the fixed income search of April 2023):
- Inspected: every screen picture in them (the account sign-up forms left aside, the notebooks' plots checked and set aside as charts their code drew). Each picture's source, date, what it shows and the app's status are in `docs/bloomberg-parity.md`, "Screenshots from three public guides".
- Settled: DSCO is company document search (the related functions menu). EE is a page of its own, not ERN: fixed. The app's DES and ANR match their pictures closely.
- Found the same evening: the University of Ljubljana's EQS guide (screens of 2023) shows the equity screener's Matches column, so SCREEN's count after each criterion matches EQS itself; it also shows a "top N by a field" criterion the app lacks (now in "Later").
- Open questions, each with the picture or text that would settle it, are listed at the end of that section (DES pages 2 to 5, MODL, EE's implied move, ANR's BARR and rank).

Limits:
- The supplied evidence pack has no video frames or captions. Exact current screen details stay unverified until the relevant images or interactions are inspected; documented commands, calculations and workflows can proceed from suitable written sources.
- Several of the new codes need paid or proprietary data (alternative data, options trade flow, the provider's own research), or are platform features (BQuant, worksheets, compliance rules). They cannot be built without inventing data, which the rules forbid.

Plan:
- The initial title-based classification of 20 codes is in `docs/audit-v2.23.0-coverage.md`, section 3: 3 could use free data (BTST backtests, CFND correlation search, CMGR portfolio rules; added to "Later"), 12 need the provider's own content, platform or paid data, and 5 were uncertain (AID, MREP, OPX, OSCH, OVI). Reconcile these with the later written-source findings in `docs/bloomberg-parity.md`; leave unresolved scope unverified until a fuller public description or visual evidence settles it.
- The assistant gathers and inspects lawful public manuals, publisher pages, screenshots and illustrations first, recording the source, edition, page or image URL, and what was actually seen in the existing parity notes. Keep reference media outside public Git history. Ask for one precise image only if an identified visual gap blocks the current change and accessible alternatives have been exhausted. Source collection continues alongside items 10 to 13.
- Compare the screens you use most with the provider's own documentation, using Codex's checklist. Those screens are the screener, world indices, market map, relative valuation, financials, earnings, analysts, portfolio, bond calculator and options. The checklist covers:
  - how the screen opens
  - its inputs and logic
  - its layout and outputs
  - its links to other screens
  - whether the numbers check out
- Each screen is marked fully working, partial, broken or missing.
- A documented workflow is checked against the source page that describes it; a visual comparison requires an image actually inspected. Record those separately, and never infer either from a title alone.

## Waiting on you

- Parity build, four questions (31 October):
  1. The tab strip: the 2024 frames show it light (`#CFCDD0`) and dark (`#424242`) with no visible cause. The light one is built. Keep it, or the dark one?
  2. Features with no counterpart in the frames, all kept working: the top bar (clocks, market timers, layouts, BOT, BREAKING, FAV, ALERTS, FUNCTIONS, REFRESH), the ticker tape, the function-key bar, the demo banner, the help desk (MESSAGES), PROVIDERS, favourite stars, the extra panel layouts, and in each panel the panel number, the link group list, command recall and the GO button. Should any be hidden in a 1:1 view? Nothing is hidden until you say.
  3. Text sizes, kept as you fixed them: the frames draw the red bar's labels and the two quote lines about a third larger than table text, the numbers before items ("98)") smaller, and the tab's mnemonic in small capitals. Say if you want any of these sizes changed.
  4. Autocomplete: the frames light the first suggestion whatever is typed. Here the first row is lit only when it is what Enter runs, so Enter keeps running the command you typed. Say if you want Enter to run the first suggestion instead.
- The latest GitHub audit executed with the required repository secrets; no new credential request is pending. The approved scheduler on `main` calls the development branch. Fresh CI and audit jobs ran after the repository became public again. See `docs/audit-check.md` for configuration and `docs/accuracy-v2.29.1.md` for the unresolved findings.

- The watchlist layout of 27 October, two points to confirm: "52-Wk %" is the one-year price change (today's price against the close a year earlier, without dividends); "Avg Vol (3M)" is the average of the last 63 full trading days, so it can differ a little from Yahoo's own figure. Say if you meant something else.
- The Bank of Japan's API asks anyone who releases a service using it to tell the Bank by email first. For your own use there is nothing to send; if you ever share the app, that email is due (`docs/data-providers.md`, "Bank of Japan").
- The pull request into `main` is ready as a draft: https://github.com/Arminshah/Bloomberg-terminal/pull/4. An older one (number 1, `claude/amber-terminal`) overlaps with it: close it or keep it, your choice.
- Senators' history: the Senate's site refuses automated reading and FMP's free plan has only the latest 25 trades, so CONGRESS builds senators' history from today on. For 6 or 12 months of senators' trades and their holdings, there are two options:
  - Eulerpool: your key arrived, but on 25 and 26 October its API answered "Internal server error" to every request, even one with a made-up key, so the fault is on its side; on 27 October it answered "Bad gateway" (HTTP 502). I'll try again. Even working, its congress list gives no link to the filed report and no owner, so I'd check its rows against FMP's before using it.
  - An FMP plan that includes its senate-trades lists.

## Later

- Functions the reference documents name that the app lacks but could build from free data (class a in `docs/audit-v2.23.0-coverage.md`; all 27 the guides describe are built, section 2a). Next:
  - EQBT with fundamental rules (cheap on earnings, say): it needs each company's figures as they were known at each date. The SEC's XBRL frames give filing dates, so it can be built from them; it is a larger piece of work.
  - Use `docs/audit-v2.23.0-coverage.md`, section 2a, for the later research on those 27 codes: 17 now have public sources, PSRT and OVDV have weaker evidence, and 8 remain unresolved. FXCA is built, and the newly confirmed codes of item 13 were built on 27 October. Research the unresolved codes from accessible written or visual sources before claiming their scope.
- From Codex's video list, potentially buildable from free data; confirm each workflow from suitable written or visual sources before implementation:
  - CFND: the screen itself is not described in any public source found on 28 October, so the code is not mapped; the search it was thought to be is built (below).
- CONGRESS: liabilities (Schedule D) for an assets-less-debts range; each member's committees (in the Clerk's member list) beside their trades.
- Supply chain (SPLC): the share of revenue behind more relations; other public sources for companies whose filings and federal records name few counterparties (news of deals was checked on 28 October: for Applied Digital it named no counterparty the filings had not).
- Blank "--" fields: fill each from a real source or say why it is blank.
- The watchlist and favourites in the TOPMOVERS layout (low priority).
- Nasdaq and NYSE Arca plan a night session (21:00 to 04:00 New York, Sunday to Friday) from 6 December 2026, subject to industry readiness. Once it has started, add it to the watchlist's session line (`usSession` in `src/data/exchanges.ts`).

## Done after 2.28.0 was prepared

- The data audit (`docs/audit-v2.28-data.md`, findings D1 to D28 with their commits): every figure on the main screens set against a second source; the wrong ones fixed, each with a regression test. Since then: `2506c36` "Sources disagree" for the next report date and for dividends (Broadcom's 2018 dividends: Yahoo 0.35, Nasdaq and Broadcom 0.175); `b6c9554` and `3156d47` the repeatable check `npm run audit:check` with its GitHub workflow (`docs/audit-check.md`); `5f58f58` SPLC for Oracle and Microsoft (Rimini Street, Black Titan, Insight).
- `9c46990` Equibles retired. New sources: `54d9b29` EIA (NGAS, the oil and gas pages), `587c549` BEA (NIPA), `02f8ea2` the CFTC's Commitments of Traders (COT).
- `4f0b2f9` DEBTPROFILE T GOVT from the Treasury's Fiscal Data; `5d0e651` declared dividends and their dates for NYSE stocks from Massive (Coca-Cola's $0.53 of 15 October was missing); `6c118ac` Eli Lilly's filed 2022 EPS; `ad81c2b` "Sources disagree" on market value where share counts differ.

- `e39869e` SCREEN: a rank criterion, the top N of the stocks the criteria above it left, higher or lower is better (EQS's "Top 20 Sequential Rank, lower is better" on a 2023 screenshot); a period per criterion (P/E and ROE on the trailing 12 months or the latest fiscal year; revenue, EBITDA, net income and margins also on the latest quarter; revenue and EPS growth on the year or the quarter; price change over 1 day to 5 years); new fields from the statements (revenue, EBITDA, net income in dollars, revenue and EPS growth, operating and net margins); criteria move up and down, since a rank depends on what comes before it.

- CORRELATION's "Most correlated" view: the lines whose daily returns moved most closely with one (or most opposite, or strongest either way) over 3 months to 3 years, among all asset classes or one, with each one's beta and the days in common; the first nine open in the matrix. The S&P 500 future tops SPX's list, the VIX ends it.

- COMPLIANCE (CMGR): your own rules on each portfolio (largest position, sector, country, region or asset class weight, UCITS 5/10/40, a restricted list, fewest holdings, cash, no shorts), with warnings before the limits, checked as prices move; an exception blotter with when each was first seen; PORTFOLIO shows the exceptions and asks before recording a position or transaction that would add one.

- FINANCIALS' Segments page (`FA AAPL SEG`): from the latest 10-K's XBRL instance and its labels, revenue by business segment, product or service, geography and major customer, and the segments' operating income, for its three fiscal years, with each line's share and growth; lines a filing counts within a larger one (iPhone within Products, Compute within Data Center) are shown inside it.

- STRATEGIES (BTST): eight common trading rules on the loaded security's daily closes, long only or long and short, with a cost per trade, ranked by return, Sharpe ratio, drawdown or win rate, each drawn beside buying and holding; decisions use only the closes up to each day (tested).

## Done in 2.28.0 (prepared, not published)

The version and notes are ready (`docs/release-v2.28.0.md`). On 28 October you said to keep coding and release only when you say so; the notes will then take in what came after.

Your priorities of 27 October:
- SPLC far wider: `e87e66d` the company's own filings read for lenders (credit agreements and their agents, the exhibit list's parties), investors (buyers of its shares or units and their managers), suppliers named for its purchasing and its subsidiaries' deals, a repaid loan's lender dropped; `400b566` two years of its own filings (both annual reports, the quarterly reports since, agreement and financing 8-Ks and their press releases) and of other companies' reports and 8-Ks; `55358fe` federal contracts and subcontracts from USAspending.gov (agencies and prime contractors as customers with the dollars, subcontractors as suppliers). Applied Digital live: 29 relations to 43; Palantir +31 customers, Lockheed Martin +41 customers and +29 suppliers from the federal records.
- `84c8a8d` Watchlist with the IEX price on: volume, open, high and low of all US venues (Yahoo Finance) beside IEX's last price, the day chart from all venues' minute bars, white range figures and a white bar for the price.

From the screenshots of 27 October (`docs/bloomberg-parity.md`, "Screenshots from three public guides"), each with unit, browser and desktop tests:
- `e8b56ff` EE opens a new page, Earnings & Estimates (`EARNINGSSUMMARY`), laid out as the terminal's in July 2024: the next and last reports and the price's average move, the trailing and blended forward P/E and next year's growth, the analysts' ratings and target, the last quarter against its estimates with past surprises and the next quarter's estimates, the EPS trend and the consensus's moves. Each box opens the screen with the detail. ERN stays the earnings history (`EARNINGS`), whose "Prior Announcement" now takes the newest dated report (it showed "--" when only the analysts' sources dated it).
- `1b0cefc` DES shows the US listing's FIGI beside the name (OpenFIGI) and writes the report date as "Aft-mkt (C) 02/25/26".
- `6e1e5bd` SCREEN shows the stocks left after each criterion.
- `1dcb295` PEERS: the loaded stock's percentile among the peers on each figure (from "Later").

## Done in 2.27.0

- Item 13, the newly confirmed codes (`docs/audit-v2.23.0-coverage.md`, after section 2a's table), each on real data with unit, browser and desktop tests:
  - `81cea33` OIL, GAS, MINE and AGS: the commodity sector pages, with the sector's contracts and measures worked out from them (Brent-WTI, two crack spreads, crude to gas, gold to silver and to platinum, soybean to corn, wheat less corn) and each one's year's range.
  - `560c5e7` WCR: every currency against a base you choose, by region or in your own basket (`0aec525` says why a change is blank).
  - `d1e9f99` WEIS ranks the world's indices by return over a period, local or in one currency; WM maps one index per market, coloured by that return.
  - `9446ca7` ECB, BOE and BOJ: portals on the three banks from their own data, with €STR, SONIA and the Bank of Japan's API (basic loan rate, call rate), each move's meeting and the next decision. The browser demo's ECB and BoJ reference values are brought up to date.
  - `f403fc2` CBRT, in part: every bank's moves over about four years with the meeting that decided each.
  - `74fc0d5` MYN: pages of your own news sections, each a saved search.
  - `8b7830d` GEW opens ECONSTATS and NLRT opens ALERTS (news keyword alerts). `01e7211` DSCO opens DOCSEARCH.
- `454a482` Item 12, the help desk against planted instructions: headlines, filings, company descriptions and other text from the sources can carry instructions aimed at an AI ("ignore your rules and…"). Before an answer reaches the chat (built-in assistant) or Claude (each tool result), every sentence that addresses an assistant is left out and the answer says so. Claude reads the sources between marked tags as data, its instructions say never to follow or repeat such text, and its answer may link only to addresses the sources gave (others are replaced). Ordinary market headlines ("analysts urge investors to sell", "Goldman to act as adviser") are left alone. The news screens still show headlines as published. Tests: `tests/assistant-injection.test.ts` (a planted headline, filing and profile through both modes, a block-closing tag, a foreign link) and a desktop test with a planted headline.
- `af1e679` Item 11, BONDCALC call schedules: type the calls one a line (date, price per 100). The screen gives the yield to each call and to maturity from the clean price, the yield to worst with its workout date, and each date's clean price at the yield with the price to worst. A call between coupon dates pays its price and the coupon accrued since the last coupon date. Calls already past or at maturity are left out and counted. The calls carry no option value (no OAS), as the screen says. Checked against the textbook yield-to-call example (10% at 117.50, callable in five years at 110: 7.43%), Excel's PRICE and YIELD examples and a separate calculation of a call between coupon dates (`tests/bond-calls.test.ts`, and in the browser).
- `9642efe` Item 10, PORTFOLIO transactions: a fourth tab, Transactions. Buys, sells and dividends with dates, fees and a rate into the portfolio currency (typed, the ECB's of a past trade date on the desktop, today's market rate for a trade of today). Sales take the oldest shares first; trades before a split count on today's share basis (Yahoo's split list). It lists the transactions (delete with ×), the open lots, the realised P&L split into price, currency and fees, and a summary with the time- and money-weighted returns (a year once the period is a year or more). A sale larger than the shares held then is refused. A security's holding follows its transactions while the two agree; when they differ, both tabs say so and offer "Use the transactions". After a change of portfolio currency, "Ask the ECB again" fills the rates. The export on that tab is the transactions. Tests: `tests/transactions.test.ts`, `e2e/portfolio-transactions.spec.ts`, and a desktop test with a four-for-one split and the ECB's rate of 29 June.
- `6e6171a` The typeface is IBM Plex Sans again, fixed by the owner on 27 October: 2.26.0's default (Bergoom) drew thin, uneven figures on Windows. The typeface setting and the Bergoom files are gone; `CLAUDE.md`, `tests/typeface.test.ts` and `e2e/look.spec.ts` keep it from changing.
- `e01d65b` Earnings history: the latest reports' year-earlier days are asked first, so a long season's last week shows its growth at once.
- `a152d9a` Watchlist sessions, your rule: After-hrs is the latest after-hours session, live 16:00 to 20:00 New York and then frozen through the next day; Pre-mkt is today's, and N/A from the regular close to the next pre-market.
- `3fb2ed3` The watchlist layout you asked for, after Yahoo Finance's watchlist summary: Last Price, Change (%), Change, Pre-mkt, After-hrs, Volume, Avg Vol (3M), YTD, 52-Wk %, Day Range and 52-Wk Range bars, Day Chart and Market Cap.
- `2fc0294` Research: DSCO and BTM rechecked at their sources (written evidence now); reference sites answer from the new account's environment.

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
- CI: the repository is public again since 27 October, so CI runs on every push; every push is still checked locally first (lint, types, unit tests, both Playwright suites). While it was private (26 and 27 October) GitHub started no runner for the `test` job.
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

- 2.29.0 on 29 October 2026 (`docs/release-v2.29.0.md`): policy decisions, earnings versions and definitions, source freshness and supply-chain evidence. Release workflow and Windows assets verified; the separate live audit findings are retained in the 2.29.1 follow-up.
- 2.28.0 on 29 October 2026 (`docs/release-v2.28.0.md`), at your request: SPLC with own filings and federal records, the watchlist fixes, EE, and the data audit's fixes and new sources.
- 2.27.0 on 27 October 2026 (`docs/release-v2.27.0.md`), at your request: everything under "Done in 2.27.0".
- 2.26.0 on 26 October 2026 (`docs/release-v2.26.0.md`), at your request, before the work moved to another account.
- 2.25.1 on 26 October 2026 (`docs/release-v2.25.1.md`), at your request. 2.25.0 was built but not published (see "Done in 2.25.1").
- 2.24.0 on 23 October 2026 (`docs/release-v2.24.0.md`).
