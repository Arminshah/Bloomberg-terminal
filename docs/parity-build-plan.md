# Armin Terminal: 1:1 build plan

For Claude Code, from the owner (Armin). Written 31 October 2026 against version 2.29.0 (`016a930`).

The goal is a terminal that looks, navigates and calculates like the Bloomberg Terminal, screen for screen, within the owner's rules in section 1. This plan says what to build and in which order, which files in the reference pack prove each detail, which app files change, and how to check that a screen is finished.

The visual target is the window design in Bloomberg's eight 2024 "Terminal Essentials" videos (screens recorded October 2023 to November 2024), because it is the most completely documented. A newer design appears in some videos published in 2026 (`08_video_frames/SHORTS_SCREENS.md`, "Shared screen conventions"); use it only where the 2024 videos show nothing, and see M6.

Paths starting with a two-digit folder (`08_video_frames/...`) are inside the pack, which lives at `reference/visual/bloomberg-pack-2026-10-31/`. A frame written as "TE01 01:53" is `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_01m53s.jpg`. Files marked "(FULL)" in the appendices are only in the FULL edition of the pack (same path), which is what the private repository `Arminshah/armin-terminal-reference` holds.

## Progress

Ticked when finished, with the commit. The next session starts at the first unticked item. The evidence and what still differs for each item are in `docs/bloomberg-parity.md`, "Parity build".

Setup
- [x] S1 Branch, `npm ci`, every check passing before any change (31 October: lint, types, 1,994 unit, build, 97 browser, 81 desktop)
- [x] S2 The pack at `reference/visual/bloomberg-pack-2026-10-31/`, git-ignored
- [x] S3 The pack's reading list read
- [x] S4 This plan in `docs/parity-build-plan.md`, item 14 in `docs/TODO.md` (`4fbb0da`)
- [x] S5 Watchlist guards (`6d78081`)

M1. Window chrome
- [x] 1.1 Red function bar (`f2c4c62`)
- [x] 1.2 Command line (`201adf0`)
- [x] 1.3 Two-line quote strip (`3105797`)
- [x] 1.4 Toolbar row (`ddcdd45`)
- [ ] 1.5 Autocomplete
- [ ] 1.6 Section strips and the Suggested Functions footer
- [ ] 1.7 Tab strip as the title bar
- [ ] 1.8 Options menu and window keys
- [ ] 1.9 Dialogs
- [ ] 1.10 Field dropdowns
- [ ] 1.11 Fixed-width pages for DES, EE, ANR and EQS

M2. Navigation, keyboard and menus
- [ ] 2.1 Related Functions Menu overlay
- [ ] 2.2 Help menu and Live Help
- [ ] 2.3 Keyboard table and gaps
- [ ] 2.4 Command grammar and plain-word search
- [ ] 2.5 New-tab page
- [ ] 2.6 Codes and aliases

M3 to M5: ticked per screen, calculation and function as they are done (see sections M3, M4 and M5 below).

## 1. Rules that come before anything in this plan

### Never touch these

1. **The typeface.** `CLAUDE.md` fixes IBM Plex Sans (weight 500, 0.01em spacing, 600 for bold and headers) and IBM Plex Mono (command line and chart labels). Do not change the faces, weights, spacing or the app's text sizes. The pack describes Bloomberg's fonts and proportions for reference only. Where matching a Bloomberg row height would need a different text size, leave the text size alone and list the case in your report for the owner. `tests/typeface.test.ts` and the first test in `e2e/look.spec.ts` stay as they are.

2. **The watchlist.** WATCHLIST (typed `WATCHLIST` or `WATCH`) stays exactly as the owner built it on 27 October:
   - its default columns in this order: Security, Name, Last Price, Change (%), Change, Pre-mkt, After-hrs, Volume, Avg Vol (3M), YTD, 52-Wk %, Day Range, 52-Wk Range, Day Chart, Market Cap;
   - the one-line range bars, the day chart with its dotted previous-close line, the Pre-mkt and After-hrs session rules, sorting, the filter, 94) Columns, copy and export;
   - its row height, text size and colours;
   - its place as the right-hand column (panel 5) of the default layout.

   The files behind it: `src/functions/W.tsx`, `src/data/watchlist-columns.ts`, `src/data/live/extended-hours.ts`, `withSessionChart` and `extendedSessions` in `src/data/live/yahoo.ts`, `src/components/RangeBar.tsx`, `src/components/Sparkline.tsx`, `src/components/SessionNow.tsx`, the watchlist store and its migrations in `src/terminal/userdata.ts`, the panel-5 default in `src/terminal/state.ts`, and the tests `tests/watchlist-columns.test.ts`, `e2e/watchlist-columns.spec.ts` and `e2e/watchlist-reorder.spec.ts`.

   - App-wide chrome around the watchlist panel (tab strip, toolbar, red bar colour) may follow the changes in M1. Nothing inside the watchlist table changes.
   - If a shared component (`Sparkline`, `RangeBar`, `cells.tsx`, `DataTable`, table CSS) must change for another screen, make the change opt-in for that screen so the watchlist renders as before. `WS.tsx` imports `FieldCell` from `W.tsx`: give WORKSHEET its own cell rendering rather than changing `FieldCell`.
   - `W` stays Worksheets (WORKSHEET), as now. If you build Bloomberg's WATC (Watchlist Analytics), it is a separate new screen, and typing `WATCH` must still open the watchlist, including in the autocomplete order.
   - Before the first change, add guards like the typeface ones: `tests/watchlist-guard.test.ts` pinning the default columns, their order and the panel-5 default, and a Playwright test that checks the header labels and compares a screenshot of the watchlist panel with prices masked (`mask` option). Never edit, weaken or remove these guards. Only the owner can change the watchlist, by asking in so many words.

3. **Features with no Bloomberg counterpart** (the top bar's clocks and market timers, the ticker tape, the key bar, the help desk, PROVIDERS, favourite stars, the extra panel layouts): keep them working. List them and ask the owner which, if any, to hide in a 1:1 view. Never delete a working feature.

### The repository's rules (from `CLAUDE.md` and `docs/HANDOVER.md`)

- Work and push only on `claude/market-events-v2.16.0-id814n`. Never merge a pull request. No release unless the owner asks.
- The pack stays in the git-ignored `reference/visual/` folder. Never `git add -f` anything from it, and never commit its PDFs, frames, images or text copied from them. Your own descriptions, with the pack path and page or frame, go in `docs/bloomberg-parity.md`.
- No Bloomberg name, logo, artwork or keyboard art in the app or the release notes. The app keeps its own name and assets. Function mnemonics, layouts, workflows and calculations are function, which the owner's note in `docs/HANDOVER.md` covers.
- Real data only. A labelled blank beats a plausible number. Where Bloomberg shows data the app cannot get, build the same layout, fill it from the app's named sources, and show the source on hover as the app already does.
- Evidence levels E1 to E4 as in `docs/bloomberg-parity.md`. A detail not seen in a frame or page is "unverified". Never present a guess as Bloomberg's behaviour or method.
- Run every check in `docs/HANDOVER.md` before each push (lint, typecheck, unit tests, build, both Playwright suites, one at a time). One commit per fix with its test. Never weaken, skip or delete a test. API keys never in the repository, logs or output.
- Write for the owner in plain, short language, without em dashes or stock phrases.

## 2. Setup (first session only)

1. Check out the branch, run `npm ci` and all the checks. They should pass before you change anything.
2. Put the pack at `reference/visual/bloomberg-pack-2026-10-31/`:
   - the private repository `Arminshah/armin-terminal-reference`, which holds the FULL edition: from the app repository's root run `git clone --depth 1 https://github.com/Arminshah/armin-terminal-reference reference/visual/bloomberg-pack-2026-10-31` (about 530 MB, allow up to 10 minutes; add the repository to the session first if it is not attached, read access is enough). This is the normal way;
   - or the attached zips `ArminPack_1_core.zip` to `ArminPack_5_guides_cheatsheets_images.zip`: five parts under 30 MB each that share one top folder and together make the LITE pack. Unzip all of them into the same place. Part 1 alone is enough for the setup, M1, M2 and most of M4; `PARTS.txt` says what each part holds. The FULL edition adds every frame and PDF at the same paths and is needed for the files marked "(FULL)" in M3 and M5;
   - a private reference repository the owner names: clone it there;
   - on the owner's PC the zips are in `C:\Users\armin\Downloads\`.

   Then run `git check-ignore -v reference/visual/bloomberg-pack-2026-10-31/README.md` and `git status` to confirm nothing from it can be committed.
3. Read, in this order: the pack's `README.md`, `START_HERE_FOR_CLAUDE.md`, `VISUAL_SPEC_2024.md`, `METHODOLOGY.md` ("Ten most valuable changes, ranked"), `08_video_frames/SHORTS_SCREENS.md` ("Shared screen conventions"). Use `INDEX_BY_FUNCTION.md` as the lookup for each screen.
4. Copy this plan to `docs/parity-build-plan.md` (it holds only descriptions and paths, no copied material) and add item 14 to `docs/TODO.md` pointing to it. Tick items in `docs/parity-build-plan.md` as they are finished, with the commit.
5. Add the watchlist guards (rule 2) and commit them on their own.

## 3. How to do each item

1. **Open the evidence.** Look up the code in `INDEX_BY_FUNCTION.md` (newest first) or use the frames named below. Open images and PDF pages with the Read tool (`pages` for PDFs). Look at the contact sheet of a video first, then the frames. The transcript says what the presenter clicks and why.
2. **Write an inventory of the reference screen**: every row, label, number, column, tab, button and menu item, in order, with its colour and alignment, plus what happens on a click or a typed command. Crop frames to the DEMO card before measuring. Sample colours with Pillow on a flat area of several frames; video colours are accurate to about ±10 per channel.
3. **Screenshot the app** in the same state and size with Playwright, as the e2e suites do (browser demo for layout; the desktop suite for desktop-only screens).
4. **Implement the differences.** Keep data rules: named sources, labelled blanks.
5. **Compare side by side** (app left, reference right) and list what still differs. Repeat until every remaining difference has a stated reason: data the app cannot get, the fixed typeface, branding, or missing evidence.
6. **Test**: unit tests for maths, Playwright for labels, numbering, order and behaviour. Run all checks, including the watchlist and typeface guards.
7. **Record** the result in `docs/bloomberg-parity.md`: pack path and page or frame, evidence level, what now matches, what does not and why.
8. **Commit** one fix at a time with its test.

A screen counts as 1:1 when:
- every label, number, column, tab, button and menu item in the newest reference picture is present in the same order and place, with the same short functional wording;
- colours are within about ±10 per channel of the measured values;
- every control on it works (`docs/HANDOVER.md`, principle 4);
- every figure comes from a named source or is a labelled blank;
- the side-by-side comparison shows no unexplained difference;
- `docs/bloomberg-parity.md` says so, with the evidence.

## 4. Milestones

### M1. Window chrome (applies to every screen)

Evidence for all items: `VISUAL_SPEC_2024.md`, sections "Global chrome", "Colour table", "Command line and autocomplete", "Tabs and windows" and "Differences from Armin Terminal today". `START_HERE_FOR_CLAUDE.md` lists the same corrections; the owner approved them for this plan on 31 October, except anything touching the typeface or the watchlist.

| # | What to build | Frames and pages | App files today |
| --- | --- | --- | --- |
| 1.1 | Red function bar `#870E1F` (today `#a21826`). Amber security box at its left, numbered white items with thin dark dividers, page title at the right with "Page 1/5" where paged. Its dropdowns open in the bar's red (`#840C1E`) with white items | TE01 01:53, TE01 01:41, TE02 04:43, TE04 04:55 | `--function-bar` in `src/styles/global.css` (line 32), `src/components/FnHeader.tsx`, `src/components/PageIndicator.tsx` |
| 1.2 | Command line: black field, thin muted blue outline (peak `#6D96D4`), small blue right-pointing triangle at the left, white uppercase text in IBM Plex Mono, blue block cursor `#2E8AF6`. Empty field shows only the triangle and cursor: remove the "<HELP> for explanation." placeholder. Contextual hints go on the row below in white ("<Back> to Return", "1 <GO> for Results, <Back> to Return") | TE04 01:13, TE05 03:59, TE04 04:09, TE01 02:05 | `--cmd-cyan` in `src/styles/global.css` (line 34) and the comment near line 460, `src/components/CommandLine.tsx` |
| 1.3 | Two-line quote strip, sharing its first row with the command line (the row turns into the command field when typing starts). Line 1: ticker in white, currency in grey, green or red tick arrow, last price and change coloured by sign, bid and ask with grey exchange letters and sizes. Line 2: signal bars, yellow clock icon, amber labels At, Vol, O, H, L, Val, Prev with white values. Screens without a quote (TOP, DS, EQS, W, new tab) always show the command field and a hint row | TE04 04:55, TE04 06:27, TE04 07:13, TE01 03:11 | `src/components/QuoteStrip.tsx` (one line under the header today, ticker in yellow), `src/components/CommandLine.tsx`, `src/components/Panel.tsx` |
| 1.4 | Toolbar row on `#1A1A1A`, plain light grey text (`#CCCCCD` to `#DFDEDF`) with thin vertical rules and no boxes: "<" ">" (back, forward), security "▾", function "▾", "Related Functions Menu" with a double chevron. At the right: "Message" with an envelope (opens the app's MESSAGES), a screen icon "▾" (window options), a yellow "?▾" (help menu, M2.2) | TE01 03:11, TE06 04:15, TE01 01:41 | `src/components/PanelToolbar.tsx` |
| 1.5 | Autocomplete under the command row, full width, `#1E1E1E`, thin grey line on top. White uppercase group headings (FUNCTIONS, SECURITIES, Charts). Function rows: command in white, title in amber, typed letters bold in both. History icon on recent rows. "More Functions..." and "More Securities..." in grey italics. First row selected with `#153B67`, text colours kept. Security rows: ticker and yellow key in white, name in amber, extra descriptors in amber italics. "(Did You Mean?)" rows. Natural-language rows in light grey uppercase with matching words bold. No category column | TE01 05:09, TE04 01:13, TE02 05:47, TE02 06:01, TE02 06:03, TE08 02:22.5 | `src/components/CommandLine.tsx`, `src/terminal/suggest.ts` |
| 1.6 | Section strips `#222222` to `#262626`. Footer "Suggested Functions" on `#1A1A1A`: amber label in its own cell, then two suggestions (bold white mnemonic, grey `#ACACAE` description), the second at the right edge, thin dividers. Bloomberg shows it on NSN, MODL, FXIP, FXFC, FXFM, SDRV, ALLQ, FRD and WSL; fill it from each screen's related functions. Replace any blue banner | TE01 01:53, TE01 02:31, TE08 06:12.0 | `src/styles/global.css`, the screens concerned |
| 1.7 | Tab strip as the window's title bar: light `#CFCDD0` (a dark `#424242` state also appears; the cause is not shown, so ask the owner which to use), square equal-width tabs with a small bold mnemonic and the title, cut at the edge without an ellipsis. Active tab `#1A1A1A`, joined to the toolbar, with "×"; inactive tabs dark grey text, no "×". "+" after the tabs opens the new-tab tips page (M2.5). At the right: inward-arrows icon, "≡ Options", minimise, restore, close. No "1-BLOOMBERG" frame title | TE01 03:11, TE01 01:53, TE04 02:59, TE04 03:01 | `src/components/WorkspaceTabs.tsx` (dark rounded tabs with an amber top line today), `titleBarOverlay` in `electron/main.cjs` (line 1730) |
| 1.8 | "≡ Options" menu: New Tab, New Window, Zoom with "−", a percentage and "+", Best Fit Window Size, Reset Window Size & Zoom. Keys: Ctrl − and Ctrl = (zoom), Ctrl [ and Ctrl ] (cycle windows), Ctrl N (new window), up to 16 windows, a tab dragged out becomes its own window. Check what already exists first (Ctrl+T, Ctrl+W, Ctrl+Shift+T, Ctrl+PageUp/PageDown do) | TE01 02:27 (tips text), TE01 02:31 (two windows, each with full chrome) | `src/terminal/tabs.ts`, `src/components/WorkspaceTabs.tsx`, `electron/main.cjs` |
| 1.9 | Dialogs: light grey title bar `#CECDCE` with dark title and "×", dark body `#1B1A18`, grey buttons with white text, the page behind dimmed | TE01 05:11 | dialog components |
| 1.10 | Field dropdowns: dark grey panel (`#1E1E1E` to `#262626`), amber choices, white group headers, grey codes, a blue "Browse..." or grey "More..." at the end | TE02 00:59, TE02 01:55, TE04 02:29, TE07 01:45 | amber field components |
| 1.11 | Fixed-width page centred in wide panels for DES, EE, ANR and EQS (black margins of about 15 percent on each side at TE01 01:41) | TE01 01:41, TE04 frames of EE, ANR, EQS | those screens |

The app shows several panels in one window, with the watchlist column at the right. Keep the panel layouts. Bloomberg's tabs belong to a window, so the tab strip stays per window, and each panel keeps its own toolbar, command line, quote strip and red bar, as each Bloomberg window does (TE01 02:31 shows two windows side by side, each with the full chrome).

Check for M1: screenshots of DES, FA, GP, TOP and an empty new tab next to TE01 01:41, TE01 03:11, TE04 04:55 and TE02 05:47. The watchlist and typeface guards pass.

### M2. Navigation, keyboard and menus

| # | What to build | Evidence | App files today |
| --- | --- | --- | --- |
| 2.1 | Related Functions Menu as an overlay panel (`#1E1E1E`) under the toolbar, the screen still visible at the right edge: "<Cancel> X" top right; a home icon and a breadcrumb in blue italics ending in the current page in white italics; two columns of numbered groups ("1) Company Overview >") and items (grey number, white mnemonic, amber title), numbering running across both columns. Equity and commodity groups as listed in `VISUAL_SPEC_2024.md`, "Related Functions Menu". The right-click popup is a smaller window "Related Functions": the security in white with its description, five numbered items, "6) More Related Functions...", "Close". Keep `MENU <GO>` working | TE01 02:53, TE01 03:35, TE03 02:51, TE03 05:59; `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.4 | `src/functions/MENU.tsx` (a full page today), `src/terminal/mouse-nav.ts` |
| 2.2 | Help menu from the yellow "?▾": a dark panel, first two rows on yellow `#FCE103` with dark text ("See What's New in <function>", "Take a Tour of <function>"), then amber items (Help Page, Live Help, Training Request, Training Videos and Events, Recent Enhancements), the page behind dimmed. "Live Help" opens the app's own help desk in a window laid out like TE03 09:07 (greeting, large input box, "Start Chat", frequent questions), with the app's name and no Bloomberg badge | TE01 04:45, TE03 09:07, TE07 05:11 | `src/functions/HELP.tsx`, the help desk components |
| 2.3 | Keyboard: build a table of every key in the Keyboard 5 guide (key, colour group, Bloomberg action, guide page, app behaviour, status) and close the gaps: GO, MENU (back), HELP (once for the help page, twice for live help), PAGE FWD and PAGE BACK, CANCEL, the yellow market sector keys, the green action keys, Pg Up and Pg Dn, number plus GO for numbered items. Put the table in `docs/bloomberg-parity.md` | `03_bloomberg_getting_started_and_keyboard/Bloomberg_Keyboard_5_Reference_Guide_2023.pdf`, `Bloomberg_Keyboard_4_Reference_Guide_2023.pdf` (FULL), `Getting_Started_Guide_for_Students_2017.pdf`, `Bloomberg_Terminal_Quick_Start_2024.pdf` p.41 (FULL), all in the same folder | `src/components/KeyBar.tsx`, `src/components/CommandLine.tsx` (F2 to F12), `src/terminal/actions.ts`, `src/terminal/exec.ts` |
| 2.4 | Command grammar: `<ticker> <yellow key> <function> <GO>`; a loaded security carries to the next function; plain words typed in the command line run a search that opens a results page with tabs Top Results, Functions, Reference, FAQs and a securities table ("<Pg Dn> for More Results, <Back> to Return" on the hint row) | TE01 02:05, TE01 02:11, TE04 02:53 | `src/terminal/commands.ts`, `src/terminal/exec.ts`, `src/terminal/name-search.ts` |
| 2.5 | New-tab page (WELC): a page of tips about the app, laid out like TE01 01:57, opened by "+" | TE01 01:57, TE01 02:27 | new screen |
| 2.6 | Every Bloomberg code that the app already covers resolves to its screen and the header shows the mnemonic (`src/terminal/legacy.ts`). Add aliases where a screen exists but the code does not (BLP for the Launchpad, for example) | Appendix A and B below | `src/terminal/legacy.ts`, `src/terminal/registry.ts` |

### M3. Screen parity for functions the app already has

Work in this order (most used and best evidenced first): DES (all five pages), FA, EE, ANR, RV, EQS, WEI, IMAP, GP and G, TOP, N, CN and NSE, DS, YAS, SRCH, WB, ALLQ, PORT (every tab), WACC, BETA, ECO and ECST, WIRP, BTMM, GC, OMON and OSA, HDS, DVD, MGMT, SPLC, EEG, ERN, IB, worksheets (W), and the Launchpad. Appendix A lists each code with the app file and the newest evidence to open first; `VISUAL_SPEC_2024.md`, "Function screens", describes most of them.

Notes for particular screens:
- **DES**: drop the numbers on "12M Tot Ret" and "Beta vs <index>" (`src/functions/DESEquity.tsx` lines 355 and 363); the numbering runs 18) then 21) (`02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.13, January 2025; TE01 01:45). Page 1 items 9) Estimates, 12) Dividend, 13) Corporate Info, 14) web address, 15) Management, 16) to 18) officers with titles in grey. Page 4/5 Revenue & EPS from TE01 02:31. Issue Info, Ratios and ESG have no recent picture (Ratios: `04_university_guides/Scranton_Bloomberg_Training_Manual.pdf` p.28, 2016 (FULL); ESG of 2022: `07_official_images/ux_article_2022/ArminRef_IMG_UXarticle2022_EV3_pic3.webp`): build them from those and mark the look unverified.
- **Worksheets (W, `src/functions/WS.tsx`)**: red bar "Options ▾ Export ▾ Settings"; ribbon (File, News, Analytics, Edit, Format, Formulas) with button rows; header row `#373737`; group rows dark grey with "▾" and a count; %1D as heat cells (green `#3AA24C` with dark text, red `#98162B` to `#EC1F40` with white text, grey `#909090` for "--"); %1M and %YTD with thin bars at a centre line; sigma columns; the field search in a header cell (TE05 03:37, TE06 05:47, TE06 05:57). This is WORKSHEET only: the watchlist keeps its own look (rule 2).
- **Launchpad (`LAYOUTS`, add `BLP`)**: the toolbar as a small window (clock, view name, "≡ Options", "Save View", "Views ▾", the amber "<Add Component>" field, folder button, undo and redo, blue "Page 1", "+"); the Views menu; Add Component suggestions; components with a thin title bar (move handle, title, security box with "▾" and chain icon, "≡ Options", pop-out, maximise, "×"); link groups from the chain icon (Group-A with a blue badge, No Group, Create New Group, Group Manager) so one security change updates linked components; chart components on `#19242D` with a dotted grid (TE06 04:05 to 05:57; `07_official_images/` 2026 render).
- **PORT**: follow the tab order and fields of the 2015 help page (`01_bloomberg_help_pages/`, 284 pages); the Equities brochure p.9 (January 2025) for the current look; the PORT shorts for scenarios and attribution.
- **OMON**: `04_university_guides/WU_Vienna_Options_in_Bloomberg_2024.pdf` (March 2024) is the newest picture.
- **YAS**: TE07 and the YAS Mobile short (2026); the calculations are in M4.

### M4. Calculations

Implement `METHODOLOGY.md`, "Ten most valuable changes, ranked", in that order, then the lower-ranked items in its sections. Each change gets a unit test built from the help page's own worked numbers where one exists.

1. YAS: yield basis setting (semi-annual or the bond's frequency), a Risk field (modified duration x full price / 100), "Spread vs benchmark" plus interpolated GSPRD and ISPRD (`src/finance/bonds.ts`, `src/functions/BondCalc.tsx`).
2. WACC: the Economic Value Added block (NOPAT, capital charge, EVA, ROIC, EVA spread), with NOPAT and invested capital labelled as approximations (`src/functions/WACC.tsx`).
3. DDM: a new function to the three-stage specification of the 2018 help page; its worked example (theoretical price about 10.8) is the first test.
4. WACC: cost of debt from government rates with the 1.38 factor for unrated issuers and the "rough approximation" warning, preferred equity, risk-free rate by country of domicile (WACC help page pp.18 to 25).
5. PORT VaR: one-day VaR scaled by the square root of time, 250/500/750-day historical windows, parametric, marginal and partial VaR (`src/finance/portfolio-risk.ts`, `src/functions/PortfolioRisk.tsx`).
6. PORT statistics: annualise daily figures with 261 (PORT help p.262), Sharpe on the 3-month yield, Sortino, Jensen, Treynor, downside risk, capture ratio, drawdown length and recovery.
7. PORT Brinson-Fachler attribution (needs benchmark weights: say where the app lacks them).
8. ANR: 12-month staleness, the 5 to 1 mapping, the improver score, a flag below 11 recommendations (`src/data/anr.ts`).
9. EQRP: market-implied country premium (depends on 3 and on estimate coverage).
10. Z-spread with discrete compounding and the par asset-swap spread (`src/finance/bond-spreads.ts`).

`METHODOLOGY.md`, "Not found in the pack", and the "Gaps" section of `START_HERE_FOR_CLAUDE.md` list methods no public document describes (EE implied move, BEst consensus rules, blended forward P/E, GP study defaults and others). Keep the app's own measure where it has one, label it as the app's own, and never call it Bloomberg's.

### M5. Functions the app lacks

Appendix B sorts the codes the pack shows but the app lacks into four groups. Build group A in this order: DDM (with M4.3), MODL, WATC (a new screen, rule 2), SEAG, OPX, FXIP, DOTS (check FOMC first), ECAN, GMM, TLTS, TSIG, FICM, GN, MREP, TRST, SDRV, FFLO. Before each, open its evidence, confirm the scope, and reconcile it with `docs/audit-v2.23.0-coverage.md` (section 3) and `docs/bloomberg-parity.md`. Group B gets the layout with labelled blanks only where the owner agrees. Group C needs Bloomberg's own content, network or platform: do not build it unless the owner asks. Group D needs a look at the frames first.

### M6. Later, only if the owner asks

- The 2026 window design (dark tab strip, one field holding a security "pill" and the command cursor, "Explore Functions" and "Message" buttons, a dark grey title bar where the red toolbar was on IMAP): `08_video_frames/SHORTS_SCREENS.md`, "Shared screen conventions", and the shorts `PT_IMAP_rally_drivers`, `PT_ASKB_questions`, `PT_ASKB_intro`.
- Chart themes (Charcoal, Blue, Light Blue, Grey, White, Black and White) and the blue-grey chart background `#19242D` (`VISUAL_SPEC_2024.md`, GP and SEAG).

## 5. What cannot be 1:1, and what to do instead

| Bloomberg has | Why the app cannot copy it | Do this instead |
| --- | --- | --- |
| Its typeface, logo, name, keyboard artwork | The owner's rule and Bloomberg's rights | IBM Plex as fixed; the app's own name and icons |
| Its own data and research: BEst estimates, Bloomberg Intelligence, BNEF, its news wires, dealer quotes, ESG scores, alternative data | Licensed content | The same layout from the app's named sources, with the source on hover, or labelled blanks |
| Its network and platform: IB chat network, MSG, ASKB's model, BQL, BQuant, EMSX | Bloomberg's services | Keep the app's own versions (MESSAGES, help desk, STRATEGIES); do not imitate the service |
| Methods no public document describes (pack "Gaps") | No evidence | Keep or add the app's own method, labelled as the app's own |
| Screens with no picture in the pack (BQ, CN, GC in full, BTMM, FXC, OVML, WCRS, GLCO, CMDF, BMAP, GIP, DES Issue Info) | No visual evidence | Build from written evidence; mark the look unverified in `docs/bloomberg-parity.md` |

## 6. Reporting

After each milestone, and at the end of every session, tell the owner in a few plain lines: what changed (with the pack file and page or frame behind it), what was checked and passed, and what cannot be guaranteed and why. Include the screenshots side by side for chrome and screen changes. Then update `docs/TODO.md`, the ticks in `docs/parity-build-plan.md`, and `docs/next-session-prompt.md`, so the next session can continue from the next unticked item.

## Appendix A. Codes the app already covers, with the evidence to open first

Bloomberg code, the app command it opens, the screen's file, the number of indexed screens in the pack (PDF pages looked at plus video frames), and the newest two pointers from `INDEX_BY_FUNCTION.md`. Open `INDEX_BY_FUNCTION.md` under the code for the full list. Only codes with at least two indexed screens are listed.

| Code | App command | App file | Evidence items | Newest evidence to open first |
| --- | --- | --- | --- | --- |
| PORT | PORTFOLIO | `src/functions/PORT.tsx` | 172 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.9 (Jan 2025); `08_video_frames/PT_PORT_Enterprise_attribution/frames/PT_PORT_Enterprise_attribution_00m09s1.jpg` (PT_PORT_Enterprise_attribution 0:09.1) |
| GP | CHART | `src/functions/GP.tsx` | 64 | `08_video_frames/PT_chart_trading_signals/frames/PT_chart_trading_signals_00m15s6.jpg` (PT_chart_trading_signals 0:15.6); `08_video_frames/PT_performance_vs_peers/frames/PT_performance_vs_peers_00m30s0.jpg` (PT_performance_vs_peers 0:30.0) |
| IB | MESSAGES | `src/functions/IB.tsx` | 47 | `08_video_frames/PT_IB_chats_to_action/frames/PT_IB_chats_to_action_00m15s3.jpg` (PT_IB_chats_to_action 0:15.3); `08_video_frames/PT_IB_chats_to_action/frames/PT_IB_chats_to_action_00m30s5.jpg` (PT_IB_chats_to_action 0:30.5) |
| FA | FINANCIALS | `src/functions/FA.tsx` | 43 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.13 (Jan 2025); `08_video_frames/PT_FA_business_drivers/frames/PT_FA_business_drivers_00m17s0.jpg` (PT_FA_business_drivers 0:17.0) |
| DES | PROFILE | `src/functions/DES.tsx` | 41 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.13 (Jan 2025); `08_video_frames/FFM_EEG/frames/FFM_EEG_00m12s6.jpg` (FULL) (FFM_EEG 0:12.6) |
| DS | DOCSEARCH | `src/functions/DS.tsx` | 38 | `08_video_frames/FFM_DS_TA/frames/FFM_DS_TA_00m35s5.jpg` (FFM_DS_TA 0:35.5); `08_video_frames/FFM_DS_TA/frames/FFM_DS_TA_00m30s7.jpg` (FULL) (FFM_DS_TA 0:30.7) |
| EQS | SCREEN | `src/functions/EQS.tsx` | 29 | `08_video_frames/FFM_EQS/frames/FFM_EQS_00m31s7.jpg` (FFM_EQS 0:31.7); `08_video_frames/FFM_EQS/frames/FFM_EQS_00m34s5.jpg` (FFM_EQS 0:34.5) |
| G | CHART | `src/functions/GP.tsx` | 27 |  |
| HELP | HELP | `src/functions/HELP.tsx` | 21 | Guide page `04_university_guides/Ljubljana_Bloomberg_Guide_2023/` section "Some useful tips" (11 images, e.g. `images/na; `01_bloomberg_help_pages/HELP_PAGE_STOP_and_help_system.pdf` p.19 (2021 to 2022) |
| W | WORKSHEET | `src/functions/WS.tsx` | 19 |  |
| WEI | MARKET | `src/functions/WEI.tsx` | 19 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.7 (Dec 2024 to Jan 2025); `08_video_frames/UX_hide_complexity/frames/UX_hide_complexity_00m39s6.jpg` (UX_hide_complexity 0:39.6) |
| SRCH | BONDSEARCH | `src/functions/CREDIT.tsx` | 17 | `08_video_frames/PT_FI_search_plain_language/frames/PT_FI_search_plain_language_00m30s0.jpg` (PT_FI_search_plain_language 0:30.0); `08_video_frames/PT_FI_search_plain_language/frames/PT_FI_search_plain_language_00m41s6.jpg` (PT_FI_search_plain_language 0:41.6) |
| IMAP | INDEXMAP | `src/functions/IMAP.tsx` | 16 | `08_video_frames/PT_IMAP_rally_drivers/` (Pro Tips: See what's driving a market rally or decline, published 2026-09-10, 32 frames); `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.8 (Dec 2024 to Jan 2025) |
| TOP | MARKETNEWS | `src/functions/MNEWS.tsx` | 15 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.11 (Jan 2025); `08_video_frames/PT_AI_trending_news/` (Pro Tips: Discover trending news with AI, published 2025-02-20, 47 frames) |
| ANR | ANALYSTS | `src/functions/ANR.tsx` | 14 | `08_video_frames/FFM_EQS/frames/FFM_EQS_00m20s4.jpg` (FFM_EQS 0:20.4); `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.22 (Dec 2024) |
| NSE | NEWS | `src/functions/NEWS.tsx` | 12 | `08_video_frames/FFM_NI_PRIVCRED/frames/FFM_NI_PRIVCRED_00m20s8.jpg` (FFM_NI_PRIVCRED 0:20.8); `08_video_frames/FFM_NI_PRIVCRED/frames/FFM_NI_PRIVCRED_00m32s8.jpg` (FFM_NI_PRIVCRED 0:32.8) |
| GC | CURVE | `src/functions/RATES.tsx` | 10 | `08_video_frames/FFM_GC/frames/FFM_GC_00m35s4.jpg` (FFM_GC 0:35.4); `08_video_frames/FFM_GC/frames/FFM_GC_00m41s1.jpg` (FFM_GC 0:41.1) |
| RV | PEERS | `src/functions/RV.tsx` | 10 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.25 (Dec 2024); `08_video_frames/TE04_Best_Equities_Functions/frames/TE04_Best_Equities_Functions_04m11s.jpg` (TE04_Best_Equities_Functions 04:11) |
| YAS | BONDCALC | `src/functions/YAS.tsx` | 10 | `08_video_frames/PT_YAS_mobile/` (Pro Tips: YAS Mobile, published 2026-03-18, 22 frames); `08_video_frames/PT_YAS_mobile/frames/PT_YAS_mobile_00m29s0.jpg` (PT_YAS_mobile 0:29.0) |
| WACC | WACC | `src/functions/WACC.tsx` | 9 | `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.17 (2023 Q1); `04_university_guides/Babson_WACC_Components_in_Bloomberg_2022.pdf` p.4 (Mar 2022) |
| NH | NEWS | `src/functions/NEWS.tsx` | 9 | `08_video_frames/TE05_News_and_Research/frames/TE05_News_and_Research_02m01s.jpg` (FULL) (TE05_News_and_Research 02:01); `08_video_frames/TE05_News_and_Research/frames/TE05_News_and_Research_02m03s.jpg` (FULL) (TE05_News_and_Research 02:03) |
| EE | EARNINGSSUMMARY | `src/functions/EESummary.tsx` | 8 | `08_video_frames/TE04_Best_Equities_Functions/frames/TE04_Best_Equities_Functions_06m27s.jpg` (TE04_Best_Equities_Functions 06:27); `08_video_frames/TE04_Best_Equities_Functions/frames/TE04_Best_Equities_Functions_06m33s.jpg` (FULL) (TE04_Best_Equities_Functions 06:33) |
| SEARCH | SEARCH | `src/functions/TOOLS.tsx` | 8 | `01_bloomberg_help_pages/HELP_PAGE_STOP_and_help_system.pdf` p.9 (Apr 2021); `01_bloomberg_help_pages/HELP_PAGE_STOP_and_help_system.pdf` p.21 (late 2021) |
| ALLQ | DEALERQUOTES | `src/functions/CREDIT.tsx` | 7 | `08_video_frames/UX_hide_complexity/frames/UX_hide_complexity_00m31s6.jpg` (UX_hide_complexity 0:31.6); `08_video_frames/TE07_Fixed_Income/frames/TE07_Fixed_Income_04m17s.jpg` (TE07_Fixed_Income 04:17) |
| SECF | SEARCH | `src/functions/TOOLS.tsx` | 7 | `04_university_guides/Babson_WACC_Components_in_Bloomberg_2022.pdf` p.7 (Mar 2022); `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.9 (Jan to May 2020) |
| CN | COMPANYNEWS | `src/functions/NEWS.tsx` | 6 | `08_video_frames/PT_CN_AI_summary/` (Pro Tips: AI Summary in CN, published 2026-06-25, 13 frames); `08_video_frames/PT_CN_AI_summary/frames/PT_CN_AI_summary_00m17s3.jpg` (PT_CN_AI_summary 0:17.3) |
| ECO | RELEASES | `src/functions/ECO.tsx` | 6 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.12 (Jan 2025); `08_video_frames/PT_BQL_economic_calendar/` (Pro Tips: Economic release calendars via BQL, published 2024-08-19, 17 frames) |
| ECST | ECONSTATS | `src/functions/ECO.tsx` | 6 | `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.22 (Mar 2023); `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.33 (Jan to May 2020) |
| GF | FUNDCHART | `src/functions/ANALYSIS.tsx` | 6 | `08_video_frames/PT_GF_company_trends/frames/PT_GF_company_trends_00m09s1.jpg` (PT_GF_company_trends 0:09.1); `08_video_frames/PT_GF_company_trends/frames/PT_GF_company_trends_00m31s2.jpg` (PT_GF_company_trends 0:31.2) |
| WB | BONDS | `src/functions/RATES.tsx` | 6 | `08_video_frames/TE07_Fixed_Income/frames/TE07_Fixed_Income_01m15s.jpg` (TE07_Fixed_Income 01:15); `08_video_frames/TE07_Fixed_Income/frames/TE07_Fixed_Income_01m29s.jpg` (FULL) (TE07_Fixed_Income 01:29) |
| BETA | BETA | `src/functions/BETA.tsx` | 5 | `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.5 (Mar 2023); `04_university_guides/Babson_WACC_Components_in_Bloomberg_2022.pdf` p.5 (Mar 2022) |
| DDIS | DEBTPROFILE | `src/functions/CREDIT.tsx` | 5 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.20 (Dec 2024); `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.10 (Mar 2023) |
| SPLC | SUPPLYCHAIN | `src/functions/SPLC.tsx` | 5 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.15 (2025); `04_university_guides/UNF_Getting_Started_with_Bloomberg_2023.pdf` p.11 (Nov 2022) |
| WIRP | RATEPROBS | `src/functions/RATES.tsx` | 5 | `08_video_frames/PT_WIRP_predicted_global_rates/frames/PT_WIRP_predicted_global_rates_00m16s4.jpg` (PT_WIRP_predicted_global_rates 0:16.4); `08_video_frames/PT_WIRP_predicted_global_rates/frames/PT_WIRP_predicted_global_rates_00m28s2.jpg` (PT_WIRP_predicted_global_rates 0:28.2) |
| CCRV | FUTURESCURVE | `src/functions/CCRV.tsx` | 5 | `08_video_frames/TE03_Commodities/frames/TE03_Commodities_02m13s.jpg` (FULL) (TE03_Commodities 02:13); `08_video_frames/TE03_Commodities/frames/TE03_Commodities_02m23s.jpg` (FULL) (TE03_Commodities 02:23) |
| BTMM | MONEYMARKET | `src/functions/RATES.tsx` | 4 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.20 (Dec 2024); `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.36 (Jan 2020) |
| ECFC | ECOFORECASTS | `src/functions/ECFC.tsx` | 4 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.18 (Dec 2024); `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.34 (Jan to May 2020) |
| EEG | ESTIMATEGRAPH | `src/functions/EEG.tsx` | 4 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.16 (Feb 2025); `08_video_frames/FFM_EEG/frames/FFM_EEG_00m15s4.jpg` (FFM_EEG 0:15.4) |
| HDS | HOLDERS | `src/functions/HDS.tsx` | 4 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.15 (late 2024); `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.11 (Mar 2023) |
| IN | INDEXLIST | `src/functions/IN.tsx` | 4 |  |
| PRTU | PORTFOLIO | `src/functions/PORT.tsx` | 4 | `03_bloomberg_getting_started_and_keyboard/LUISS_Bloomberg_Primer_2018.pdf` (FULL) p.33 (2018); `02_bloomberg_methodology/PORT_Teaching_Asset_Management_Borri_2016.pdf` (FULL) p.13 (2014 to 2016) |
| DVD | DIVIDENDS | `src/functions/DVD.tsx` | 3 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.14 (Dec 2024); `08_video_frames/PT_BDVD_dividends/` (Pro Tips: Historical and projected dividends with BDVD, published 2024-11-05, 34 frames) |
| EQRP | RISKPREMIUM | `src/functions/EQRP.tsx` | 3 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.20 (Dec 2024); `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.19 (Mar 2023) |
| ERN | EARNINGS | `src/functions/EE.tsx` | 3 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.16 (Feb 2025); `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.13 (Mar 2023) |
| EVTS | EVENTS | `src/functions/EVTS.tsx` | 3 | `08_video_frames/PT_ETT_earnings_transcript_takeaways/` (Pro Tips: Earnings Transcript Takeaways, published 2026-05-28, 18 frames); `08_video_frames/PT_earnings_call_AI_summaries/` (Pro Tips: AI-powered earnings call summaries, published 2025-02-05, 36 frames) |
| FLDS | FIELDS | `src/functions/FIELDS.tsx` | 3 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.17 (2025); `02_bloomberg_methodology/Accessing_Bloomberg_Fixed_Income_Indices_on_the_Terminal.pdf` (FULL) p.5 (May 2020) |
| MEMB | MEMBERS | `src/functions/ANALYSIS.tsx` | 3 | `08_video_frames/PT_IN_index_turnover/frames/PT_IN_index_turnover_00m42s7.jpg` (PT_IN_index_turnover 0:42.7); `02_bloomberg_methodology/Accessing_Bloomberg_Fixed_Income_Indices_on_the_Terminal.pdf` (FULL) p.4 (Aug 2021) |
| MOST | MOVERS | `src/functions/MOST.tsx` | 3 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.8 (Dec 2024 to Jan 2025); `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.25 (Jan to May 2020) |
| OSA | OPTIONSTRATEGY | `src/functions/OptionStrategy.tsx` | 3 | `04_university_guides/Xavier_11_Derivatives_Options_Futures_Swaps_PARTIAL.pdf` (FULL) p.3 (Jan 2007 (legacy terminal, greyscale); `04_university_guides/Xavier_11_Derivatives_Options_Futures_Swaps_PARTIAL.pdf` (FULL) p.4 (Jan 2007 (legacy terminal, greyscale) |
| OWN | HOLDERS | `src/functions/HDS.tsx` | 3 | `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.15 (Jan to May 2020); `04_university_guides/Scranton_Bloomberg_Training_Manual.pdf` (FULL) p.31 (Sep 2015 to May 2016) |
| DSCO | DOCSEARCH | `src/functions/DS.tsx` | 3 | `08_video_frames/TE04_Best_Equities_Functions/frames/TE04_Best_Equities_Functions_05m53s.jpg` (FULL) (TE04_Best_Equities_Functions 05:53); `08_video_frames/TE04_Best_Equities_Functions/frames/TE04_Best_Equities_Functions_05m55s.jpg` (TE04_Best_Equities_Functions 05:55) |
| FRD | FXFORWARD | `src/functions/FXRATES.tsx` | 3 | `08_video_frames/TE08_FX/frames/TE08_FX_06m49s1.jpg` (TE08_FX 06:49.1); `08_video_frames/TE08_FX/frames/TE08_FX_07m05s2.jpg` (TE08_FX 07:05.2) |
| CMGR | COMPLIANCE | `src/functions/CMGR.tsx` | 3 | `08_video_frames/PT_CMGR_compliance/frames/PT_CMGR_compliance_00m12s0.jpg` (PT_CMGR_compliance 0:12.0); `08_video_frames/PT_CMGR_compliance/frames/PT_CMGR_compliance_00m32s7.jpg` (PT_CMGR_compliance 0:32.7) |
| BTST | STRATEGIES | `src/functions/BTST.tsx` | 3 | `08_video_frames/PT_BTST_backtesting/frames/PT_BTST_backtesting_00m11s3.jpg` (PT_BTST_backtesting 0:11.3); `08_video_frames/PT_BTST_backtesting/frames/PT_BTST_backtesting_00m29s9.jpg` (PT_BTST_backtesting 0:29.9) |
| CACS | CORPACTIONS | `src/functions/CACS.tsx` | 2 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.14 (Dec 2024); `04_university_guides/Xavier_07_Corporate_Bond_Menu_YAS_OAS.pdf` (FULL) p.5 (2007 to 2010 (legacy terminal, greyscale printouts) |
| ECTR | TRADEFLOWS | `src/functions/ECTR.tsx` | 2 | `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.35 (Jan to May 2020); `04_university_guides/Scranton_Bloomberg_Training_Manual.pdf` (FULL) p.56 (Sep 2015 to May 2016) |
| EEO | ESTIMATES | `src/functions/EEO.tsx` | 2 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.15 (early 2025); `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.15 (Mar 2023) |
| EQRV | PEERS | `src/functions/RV.tsx` | 2 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.26 (Dec 2024); `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.20 (Mar 2023) |
| HP | HISTORY | `src/functions/HP.tsx` | 2 | `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.13 (Jan to May 2020); `04_university_guides/Scranton_Bloomberg_Training_Manual.pdf` (FULL) p.30 (Sep 2015 to May 2016) |
| HVT | VOLATILITY | `src/functions/ANALYSIS.tsx` | 2 | `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.16 (Mar 2023); `04_university_guides/Damodaran_NYU_Using_Bloomberg_for_data.pdf` (FULL) p.28 (2005 to 2007 (legacy amber terminal) |
| NLRT | ALERTS | `src/functions/ALRT.tsx` | 2 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.10 (Dec 2024); `08_video_frames/TE05_News_and_Research/frames/TE05_News_and_Research_04m43s.jpg` (TE05_News_and_Research 04:43) |
| OMON | OPTIONS | `src/functions/OPTIONS.tsx` | 2 | `04_university_guides/WU_Vienna_Options_in_Bloomberg_2024.pdf` p.2 (Mar 2024); `04_university_guides/Xavier_11_Derivatives_Options_Futures_Swaps_PARTIAL.pdf` (FULL) p.1 (Jan 2007 (legacy terminal, greyscale) |
| TRA | TOTALRETURN | `src/functions/ANALYSIS.tsx` | 2 | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.25 (Dec 2024); `04_university_guides/Xavier_07_Corporate_Bond_Menu_YAS_OAS.pdf` (FULL) p.11 (2007 to 2010 (legacy terminal, greyscale printouts) |
| HISTORY | HISTORY | `src/functions/HP.tsx` | 2 | `08_video_frames/UX_cutting_edge/frames/UX_cutting_edge_00m08s0.jpg` (UX_cutting_edge 0:08.0); `08_video_frames/UX_cutting_edge/frames/UX_cutting_edge_00m27s8.jpg` (UX_cutting_edge 0:27.8) |

## Appendix B. Codes the pack shows that the app lacks

A first sorting by the evidence's first line. Confirm each from its frames or pages before building, and reconcile with `docs/audit-v2.23.0-coverage.md` (section 3).

### A. Buildable from free or public data (confirm the scope from the evidence first)

| Code | What to build | Evidence to open first |
| --- | --- | --- |
| WELC | New-tab tips page (chrome) | `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_01m57s.jpg` |
| SEAR | Search results page for natural-language and keyword searches (Top Results, Functions, Reference, FAQs tabs) | `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_02m11s.jpg` |
| RFM | Related Functions Menu overlay (chrome, see M2) | `04_university_guides/Babson_Equity_Valuation_using_Bloomberg_2023.pdf` p.4 |
| BLP | Launchpad: alias to LAYOUTS plus the Launchpad toolbar and components (M3) | `08_video_frames/PT_BQuant_in_Launchpad/frames/PT_BQuant_in_Launchpad_00m34s9.jpg` |
| MODL | Company financials and estimates model with Interactive Calculator; filed figures plus the app's named estimate providers | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.15 |
| DDM | Three-stage dividend discount model, fully specified in the 2018 help page (METHODOLOGY.md section 5) | `01_bloomberg_help_pages/DDM_HELP_PAGE_printed_2018.pdf` p.3 |
| WATC | Watchlist Analytics: a NEW, separate screen over a list or index (tabs Overview, Returns, Valuation, Estimates, Actuals, Credit, Technicals). Never changes WATCHLIST; WATCH must keep opening the watchlist | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.7 |
| SEAG | Seasonality chart from daily history (line and heat map, 5-year lines, high/low/average) | `08_video_frames/TE03_Commodities/frames/TE03_Commodities_02m57s.jpg` (FULL) |
| OPX | Options open interest by strike, max pain, put/call markers, from the app's options sources | `08_video_frames/PT_zero_day_options/frames/PT_zero_day_options_00m16s4.jpg` |
| FXIP | FX information portal (G10 list, rates vs a base currency, index chart, news) | `08_video_frames/TE08_FX/frames/TE08_FX_01m21s1.jpg` |
| TLTS | Factor exposures by regression on public factor returns (state the factor source) | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.9 |
| TSIG | Signal statistics on price history (events, pre/post-event returns); extends STRATEGIES | `08_video_frames/PT_trade_signal_alerts/frames/PT_trade_signal_alerts_00m20s6.jpg` |
| GMM | Global macro movers tiles from free market data | `08_video_frames/UX_cutting_edge/frames/UX_cutting_edge_00m54s2.jpg` |
| DOTS | FOMC dot plot from the Fed's Summary of Economic Projections (check FOMC first: it may already hold the data) | `08_video_frames/PT_WIRP_fed_rate_projection/frames/PT_WIRP_fed_rate_projection_00m11s7.jpg` |
| ECAN | CPI contributions by component from BLS data | `08_video_frames/FFM_ECAN/frames/FFM_ECAN_00m11s9.jpg` |
| GN | News count, price and sentiment chart from the app's news sources | `08_video_frames/PT_news_market_impact/frames/PT_news_market_impact_00m24s9.jpg` |
| MREP | Custom morning news report built from the app's news and the user's lists | `08_video_frames/PT_custom_news_reports/frames/PT_custom_news_reports_00m13s6.jpg` |
| FICM | Credit monitor: sector OAS series (FRED ICE BofA indices), credit ETF prices, news | `08_video_frames/PT_AI_research_workflow/frames/PT_AI_research_workflow_00m47s4.jpg` |
| SDRV | Swap data repository volumes from public SDR dissemination (heavy; check feasibility) | `08_video_frames/TE08_FX/frames/TE08_FX_05m07s5.jpg` |
| TRST | Tearsheets the user writes about a security (own notes, ratings field, thesis) | `08_video_frames/PT_custom_tearsheets/frames/PT_custom_tearsheets_00m22s3.jpg` |
| FFLO | ETF flows estimated from shares outstanding times NAV (label as estimated) or leave out | `08_video_frames/FFM_FFLO/frames/FFM_FFLO_00m10s8.jpg` |

### B. Layout possible, some fields need data the app cannot get (labelled blanks, never invented)

| Code | Limit | Evidence to open first |
| --- | --- | --- |
| FXFC | Forward rows computable; analyst forecasts are the provider's own | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.19 |
| BDVD | History from public data; projections are the provider's own | `08_video_frames/PT_BDVD_dividends/frames/PT_BDVD_dividends_00m17s6.jpg` |
| CHRT | Curated chart library: own curated charts from free data | `08_video_frames/PT_CHRT_curated_charts/` |
| WSL | Worksheet templates: ship own templates | `08_video_frames/PT_WSL_worksheets/` |
| KPIC | KPI comparison: only KPIs found in filings | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.16 |
| COMB | Comparable bonds: needs a bond universe the app lacks | `08_video_frames/TE07_Fixed_Income/frames/TE07_Fixed_Income_03m17s.jpg` (FULL) |
| CRPR | Agency ratings are licensed; only public rating actions | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.19 |
| FIW | Fixed income worksheet: needs a bond universe | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.20 |
| NSTM | Grouped key news: possible with the app's assistant over its own news | `08_video_frames/PT_AI_trending_news/frames/PT_AI_trending_news_00m12s9.jpg` |
| NSN | Story view with AI summary: possible with the app's assistant | `08_video_frames/PT_AI_trending_news/frames/PT_AI_trending_news_00m49s4.jpg` |
| AID | AI company snapshot: possible with the app's assistant over its own data | `08_video_frames/PT_AID_company_snapshot/` |
| TA | Transcript viewer with questions: needs transcripts the app can get | `08_video_frames/FFM_DS_TA/frames/FFM_DS_TA_00m35s5.jpg` |
| DSX | AI document search: needs documents the app can get | `08_video_frames/PT_AI_peer_analysis/frames/PT_AI_peer_analysis_00m15s9.jpg` |
| DOCW | AI document workspace: same as DSX | `08_video_frames/PT_AI_peer_analysis/frames/PT_AI_peer_analysis_00m24s5.jpg` |

### C. Needs the provider's own content, network or platform (do not build unless the owner asks)

| Code | Why | Evidence to open first |
| --- | --- | --- |
| BI | Bloomberg Intelligence research | `08_video_frames/FFM_BI/frames/FFM_BI_00m38s3.jpg` |
| BICO | BI company primers | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.23 |
| BNEF | BloombergNEF research | `02_bloomberg_methodology/Equities_Workflow_Brochure_EN.pdf` p.23 |
| DSET | BNEF datasets | `08_video_frames/FFM_DS_TA/frames/FFM_DS_TA_00m50s7.jpg` |
| ASKB | the provider's AI over its content | `08_video_frames/PT_ASKB_intro/` |
| MSG | the provider's mail network | `08_video_frames/PT_ASKB_intro/frames/PT_ASKB_intro_00m33s1.jpg` |
| LOGIN | login and B-Unit, not a function | `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_01m13s.jpg` (FULL) |
| TOUR | installer tour | `02_bloomberg_methodology/Market_Data_Manual_11.8.pdf` (FULL) p.31 |
| BBU | uploader | `03_bloomberg_getting_started_and_keyboard/LUISS_Bloomberg_Primer_2018.pdf` (FULL) p.35 |
| IMGR | dealer quotes | `08_video_frames/PT_IMGR_liquidity/` |
| BBTI | swap trading portal | `08_video_frames/TE07_Fixed_Income/frames/TE07_Fixed_Income_01m41s.jpg` (FULL) |
| EMSX | execution platform | `08_video_frames/PT_automation_alpha/frames/PT_automation_alpha_00m17s7.jpg` |
| PM | order management | `08_video_frames/PT_PORT_model_orders/frames/PT_PORT_model_orders_00m11s8.jpg` |
| BQL | query language platform | `08_video_frames/PT_BQL_excel/frames/PT_BQL_excel_00m19s0.jpg` (FULL) |
| BQNT | BQuant platform | `08_video_frames/PT_BQuant_in_Launchpad/frames/PT_BQuant_in_Launchpad_00m15s0.jpg` |
| ALTD | licensed alternative data | `08_video_frames/PT_ALTD/frames/PT_ALTD_00m14s9.jpg` |
| SUST | ESG data | `08_video_frames/PT_SUST_ESG/frames/PT_SUST_ESG_00m17s5.jpg` |
| BCLO | CLO data | `08_video_frames/PT_BCLO/frames/PT_BCLO_00m16s7.jpg` |
| PREL | new issue pipeline | `08_video_frames/PT_News_Issues_Feed/frames/PT_News_Issues_Feed_00m14s7.jpg` |
| MM | ABS market data | `08_video_frames/PT_MM_ABS_spreads/frames/PT_MM_ABS_spreads_00m17s6.jpg` |
| CPR | ABS queries | `08_video_frames/PT_MM_ABS_spreads/frames/PT_MM_ABS_spreads_00m48s5.jpg` (FULL) |
| NSUB | the provider's newsletters | `08_video_frames/PT_NSUB_news_cycle/frames/PT_NSUB_news_cycle_00m15s6.jpg` |
| BTM | options trade feed (OPRA) | `08_video_frames/PT_BTM_options_trades/` |
| CRAN | credit research | `08_video_frames/PT_CRAN_credit/` |
| FXFM | contributor forecasts | `08_video_frames/TE08_FX/frames/TE08_FX_04m08s9.jpg` |
| BMAP | map layers and satellite data | `03_bloomberg_getting_started_and_keyboard/Bloomberg_Terminal_Quick_Start_2024.pdf` (FULL) p.29 |

### D. Only typed in a video so far: look at the frames after the typing before deciding

| Code | What to do | Evidence to open first |
| --- | --- | --- |
| CFVL | Open the frames that follow the typed code in `08_video_frames/TE03_Commodities/` or `TE01` | `08_video_frames/TE03_Commodities/frames/TE03_Commodities_01m39s.jpg` (FULL) |
| COMM | Open the frames that follow the typed code in `08_video_frames/TE03_Commodities/` or `TE01` | `08_video_frames/TE03_Commodities/frames/TE03_Commodities_03m45s.jpg` (FULL) |
| FDM | Open the frames that follow the typed code in `08_video_frames/TE03_Commodities/` or `TE01` | `08_video_frames/TE03_Commodities/frames/TE03_Commodities_04m35s.jpg` |
| LINE | Open the frames that follow the typed code in `08_video_frames/TE03_Commodities/` or `TE01` | `08_video_frames/TE03_Commodities/frames/TE03_Commodities_05m29s.jpg` (FULL) |
| RMAP | Open the frames that follow the typed code in `08_video_frames/TE03_Commodities/` or `TE01` | `08_video_frames/TE01_Getting_Started/frames/TE01_Getting_Started_02m55s.jpg` (FULL) |
