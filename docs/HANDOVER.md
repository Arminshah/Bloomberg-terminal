# Handover: where the work stands (30 October 2026)

For any Claude session that takes over Armin Terminal, on this account or another. Read this first, then `docs/TODO.md` (the one list of what comes next), then `docs/bloomberg-parity.md` ("Evidence pack v3: gap analysis" and "Screenshots from three public guides").

Parity build, 31 October: the owner asked for a 1:1 match of the provider's terminal, following `docs/parity-build-plan.md` with the owner's private reference pack (cloned into the git-ignored `reference/visual/`; `docs/next-session-prompt.md` says how). Setup and M1 (window chrome) are done and pushed; `docs/TODO.md`, item 14, lists the commits and the owner's open questions, and `docs/bloomberg-parity.md`, "Parity build", records the evidence and the differences left. The watchlist is guarded by `tests/watchlist-guard.test.ts` and `e2e/watchlist-guard.spec.ts`: never edit, weaken or remove them. The panel chrome now lives in `src/components/PanelToolbar.tsx`, `CommandLine.tsx` (with the quote strip's two lines from `QuoteStrip.tsx`), `SuggestedFunctions.tsx`, `Dialog.tsx` and `WorkspaceTabs.tsx` (Options menu; the desktop side is `window:options` in `electron/main.cjs`).

Owner's coordination update, 31 October: fetch and merge the latest development branch before pushing; no rebase or force push. Codex merged Claude's `6f113a9` and is applying the source-qualified Lilly share-definition and Exxon revenue-basis labels from `docs/accuracy-primary-sources-2026-10-30.md`. FRONTIER, MPC, FTSE 100 screening and SPLC are Claude's work; leave those files and tests alone. Claude will handle the planned 2.30.0 release after its screening and SPLC work. Do not publish 2.29.1 or change the release request from the accuracy continuation. The earlier 2.29.1 release instructions below are historical status, superseded by this owner update.

The source-label changes and the pending Fed publication-identity safeguard passed all local checks on that merged branch: lint, type checks, 1,970 unit tests, build, 97 browser checks and 79 fixture desktop checks. Lilly's historical trust explanation remains conditional with current holdings unconfirmed; Exxon retains both named revenue observations and withheld mixed-basis margins. Fresh live results are recorded in `docs/accuracy-v2.29.1.md` when available.

## Published 2.29.0 and the 2.29.1 follow-up

2.29.0 was published on 29 October by release run 40946612641. Both Windows executables and checksum files were verified publicly; normal CI also passed. Diagnostic live run 40951008804 reported 559 passes, 6 failures, 4 unresolved flags, 5 blocked checks, 3 incomplete results and 87 skips. The failures and follow-up are recorded in `docs/accuracy-v2.29.1.md`; they are not erased by the software test results. The 2.29.1 release request will start the same gated workflow after the follow-up checks pass. Verify its actual result before claiming publication.


The owner authorized accuracy remediation and a new release on 29 October. Implementation and evidence limits are in `docs/accuracy-v2.29.md`; release notes are in `docs/release-v2.29.0.md`. The version-matched `.github/release-request.json` starts the gated Windows release workflow when that explicit request changes on the development branch. Check the release/workflow result before claiming publication.

The owner separately approved **only** a scheduler workflow on `main`, without merging application code. It calls the reusable audit on `claude/market-events-v2.16.0-id814n` and includes the eight handover companies alongside APLD and NVIDIA. Application pushes remain restricted to the development branch. Do not merge the draft PR.

Provider access was blocked in this environment; fixture checks and public GitHub reads work. A network draft was saved but does not activate access by itself. The remaining manual source checks below remain pending evidence work. The Tesla income definitions are separate and the exact-period filed parent line now has priority in its own field; Walmart's volume question still needs direct corroboration.

## Continuation after the candidate audit

The `ecd1125` candidate's live audit `41016869012` reported 617 passes, six failures, five flags, two blocked checks, three incomplete results and 31 skips. Ordinary CI passed separately. The two Tesla income failures persisted; four open/volume comparisons failed. Further parent-income selection, margin-basis, fiscal-period and dated quote diagnostics are documented in `docs/accuracy-v2.29.1.md`. The release request remains at `v2.29.0`; do not publish 2.29.1 before reviewing fresh live evidence.

The continuation at `d2c8c0e` passed all local checks sequentially: lint, type checks, build, 1,830 unit tests (178 files), 95 browser checks and 76 fixture desktop checks. The white current-price markers now align evenly in both watchlist range columns; their browser regression covers 100%, 125% and 150% scaling. Fresh CI `41028238433` passed, including native Windows desktop checks. Live audit `41028233779` ran and reported 620 passes, five failures, five flags, two blocked checks, 12 incomplete results and 31 skips. The disputed figures and diagnostic follow-up are recorded in `docs/accuracy-v2.29.1.md`. Publication remains held.

A real schedule event triggered run `41021723864` at 07:42 UTC on 30 October. GitHub blocked its job before execution with an account billing/spending-limit annotation. The owner subsequently made the repository public again; the fresh CI and audit above both executed. The historical annotation does not describe current runner access.

The source-observation follow-up fixes mismatched market-cap/previous-close share derivation and cross-provider fallback pairing. QUOTE captures its actual price/share inputs; the development audit observes bounded, whitelisted Yahoo responses already requested by the app, excluding observations completed after the screen capture. FA records the actual differing statement lines and source values behind basis warnings. Local sequential checks passed: lint, type checks, build, 1,851 unit tests (180 files), 95 browser checks and 76 fixture desktop checks. A fresh live run must establish the remaining source causes; intraday skips do not resolve prior end-of-day failures. Push audits now pin their triggering commit; explicit scheduler refs remain supported.

At `37b8241`, CI `41065482940` passed including Windows. Live audit `41065471341` reported 550 passes, three failures, five flags, two blocked checks, 13 incomplete results and 103 skips. Its three failures are Exxon/Lilly previous closes and Tesla YTD; intraday skips leave the earlier open/volume questions unresolved. Operating-income differences explain the ten earlier basis warnings; Exxon adds a revenue-basis warning. Follow-up fixes a settled-volume first-view delay, synchronizes DES price/YTD refresh, requests the provider's separate reported operating-income line while retaining its alternative, and extends previous-close/return diagnostics. Full details and remaining evidence limits are in `docs/accuracy-v2.29.1.md`. Publication stays held.

The combined follow-up passed local checks sequentially: lint, type checks, build, 1,868 unit tests (182 files), 95 browser checks and 77 fixture desktop checks. The new desktop test verifies a provider price/YTD update between engine ticks. Fresh live corroboration is still required for source comparisons; neither prior-source failures nor intraday skips are erased by passing software checks.

Latest checked application revision: `8234588`. CI `41070636036` passed including Windows. Live audit `41070625015` reported **553 passes, zero numerical failures, five flags, two blocked checks, three incomplete results and 103 skips**; exit 2, assurance incomplete. The prior intraday failures and ten operating-income warnings were absent from its unresolved list. Individual passing rows are not public, so do not certify each former cell from absence alone. Remaining evidence: Lilly's share definition, Exxon's revenue basis, partial APLD/NVDA supply-chain coverage, Fed HTTP 403 and no Tesla dividend reference. Earlier open/volume questions still need completed-session corroboration. Publication remains held at the `v2.29.0` request. The evidence and validation record is in `docs/accuracy-v2.29.1.md`.

The owner requested continued work on those definitions. The next patch makes share-conflict labels source-aware with unknown or ineligible origins explicit, retains exactly aligned SEC revenue alternatives as diagnostics, and adds official RSS discovery plus full statement/implementation verification to the Fed audit. It does not choose a share/revenue definition from a numerical match. Earlier trust explanations lack a retained primary quotation and are qualified. This patch passed all local checks sequentially: lint, type checks, build, 1,895 unit tests (184 files), 95 browser checks and 77 fixture desktop checks. Fresh remote evidence is required before claiming the remaining definitions or blocked sources are resolved.

## The project

- **Armin Terminal**: a Windows desktop market terminal for the owner's private use (Electron 43, React 19, Vite 7, TypeScript), with a browser demo on simulated data. 137 functions.
- **Repository**: `Arminshah/Armin-terminal` (renamed from `Arminshah/Bloomberg-terminal` on 31 October 2026; GitHub forwards the old address). **Public again since the evening of 28 October** (the owner opened it so CI, the data audit and releases can run). The owner may make it private again; while it is private, GitHub starts no runner: on 27 October every job failed within seconds, its annotation saying "recent account payments have failed or your spending limit needs to be increased" (the account's Actions minutes for private repositories). Then check everything locally before each push, and before a release ask the owner to open the repository for about half an hour or raise the spending limit.
- **Pull request**: https://github.com/Arminshah/Armin-terminal/pull/4, a draft into `main`. Its description is out of date; rewrite it only if the owner wants it out of draft. Do not merge it. An older one (number 1) overlaps; the owner decides.
- **Working branch**: `claude/market-events-v2.16.0-id814n` (the owner's choice; a session's own suggested branch name is an older ancestor: ignore it). Push only there.
- **Last confirmed published release: 2.29.0** (tag `v2.29.0` on `016a930`, 29 October 2026), release workflow 40946612641. Native Windows tests, both executables and published checksums passed verification. The 2.29.1 candidate fixes and remaining live evidence are in `docs/accuracy-v2.29.1.md`; do not claim it is published before checking its workflow and assets.

## The objective (the owner's, 26 October 2026)

The closest legally and technically achievable functional equivalent of the provider's terminal: 1:1 parity in commands, navigation, workflows, keyboard shortcuts, screen behaviour, analytics, calculations, data presentation, multiple windows and completeness. It is not an app merely inspired by it. Work by these principles:

1. **Functional parity.** Where a workflow is documented well enough, build the same behaviour, not a simplified version of it.
2. **Interface fidelity.** Match the functional arrangement, information density, interaction patterns and feel as closely as practicable, with original visual assets and none of the provider's branding.
3. **Financial accuracy.** Validated formulas, correct market conventions, verified data from suitable providers. Never fabricate missing data.
4. **Completeness.** A screen that renders is not finished: every control, filter, command, calculation, export and interaction on it must work.
5. **Research depth.** Use every lawfully accessible reference (PDFs, screenshots, tutorials, videos, technical documentation) and study the interactions and workflows in detail.
6. **Evidence discipline.** Keep verified behaviour apart from reasonable assumption. Where the evidence is thin, research further or record the limit (`docs/bloomberg-parity.md`).
7. **Independent implementation.** Original code only. Never take the provider's source code, protected assets or restricted datasets.
8. **Integration.** Securities, portfolios, charts, screening, analytics and workspaces share the same data and navigation.
9. **Testing.** Check the maths, the behaviour, the integration, edge cases and the UI separately. Tests alone are not proof of parity.
10. **A running parity audit.** Keep the evidence-backed gap analysis in `docs/bloomberg-parity.md` current with what the app actually does.

Never lower fidelity on purpose to make the app look different. Separate what is genuinely protected (the provider's own wording, artwork, logos, name, source code) and licensed data the app cannot get from ordinary software behaviour, which can be rebuilt. Continue the roadmap in `docs/TODO.md` (PORTFOLIO, BONDCALC and the rest); do not restart finished work, remove working features, or merge or release without the owner's approval.

Public or private, the repository is not for sharing research material: copyrighted reference files stay out of its history.

## Starting on the new account

1. Attach the repository, check out the branch above, run `npm ci`, then the checks under "How to work on it". They all passed at handover.
2. Ask the owner for the API keys again if the environment's settings do not hold them: they are kept only in each session's scratch folder, which a new session cannot see. The names are: `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY`, `COINGECKO_API_KEY`, `FRED_API_KEY`, `MASSIVE_API_KEY`, `SEC_USER_AGENT`, `FINNHUB_API_KEY` (and `FINNHUB_SECRET_KEY`, the webhook secret, which no data request uses), `TIINGO_API_KEY`, `MARKETAUX_API_TOKEN`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `TIPRANKS_API_KEY`, `OPENFIGI_API_KEY`, `EULERPOOL_API_KEY` (evaluation only), `CONGRESS_GOV_API_KEY`, `EIA_API_KEY`, `BEA_API_KEY`. Equibles was retired on 28 October 2026: do not ask for or use its key. Save them as `NAME=value` lines in a file in the session's scratch folder (`chmod 600`), never in the repository.
3. Carry on with `docs/TODO.md`: items 10 to 13 are done (NGAS came with the EIA key on 28 October), and the owner chooses what comes next from "Later".

The assistant owns reference research: find and inspect lawful public manuals, illustrated guides and publisher images, then record the source, date, page or image URL and what was actually seen in `docs/bloomberg-parity.md`. Missing video frames do not block documented functional work. Keep exact visual details unverified where the evidence is missing. Ask the owner for one precise image only if that gap blocks the current change and accessible alternatives have been exhausted. Keep reference media out of public Git history and preserve the fixed typefaces in `CLAUDE.md`.

## The owner's rules (keep them)

- **Real data only.** No invented or simulated values in the desktop app; a labelled blank beats a plausible wrong number. Say where each figure comes from.
- **API keys**: never commit one, and never let one into a release build (the app keeps keys in the main process, encrypted with Windows' safeStorage, entered on PROVIDERS; a desktop test checks that a `.env` beside the source is ignored). The owner relaxed the earlier caution: you may use the keys freely in the sandbox, passed as environment variables (`set -a; . <file>; set +a`).
- **Reference material**: study any document, screenshot or video frame the owner gives in full detail; functionality, commands, workflows and calculations are free to rebuild in original code (CJEU, SAS Institute v World Programming, C‑406/10; Directive 2009/24, Article 1(2)). Whole PDFs, screenshots and frames stay out of Git: they go in the git-ignored `reference/` folder. Short attributed quotations in the docs are fine where the exact wording is the evidence. The app reproduces the function, layout and behaviour as closely as practicable (the objective above), drawn with its own assets: never the other product's text, artwork, logos or name.
- **The typeface is fixed** (the owner, 27 October 2026): IBM Plex Sans at weight 500 and 0.01em spacing for all text, IBM Plex Mono for the command line and the charts. Never change it, add another face or offer a choice; see `CLAUDE.md`. `tests/typeface.test.ts` and `e2e/look.spec.ts` guard it.
- **No branding of the other product** in the app or the release notes: not its name, logo or login (a test fails if a release note names it).
- **Windows only** for the desktop app. Push only to the branch above. No pull request, merge or release unless the owner asks.
- **Never weaken, skip or delete a test.** Never report as checked anything not run. One commit per fix, with a regression test. Run lint, type checks, unit tests, the build and both Playwright suites before each push.
- Commit messages end with the session's attribution lines; no model names in commits, code or docs.
- Write for the owner in plain, short language, without AI writing habits (no em dashes, no "not X but Y", no stock phrases). They are not always technical.

## What this account did since 2.25.1 (all in 2.26.0)

- 25 new functions, most from the reference guides (each reads real data only, with unit, browser and desktop tests): IN, GX, EA, WBMV, SIA, CACT, CCB, INSD, RELS, EEG, EM, FLNG, HRA, TECH, EQBT, FED, IYC, ECOW/ECWB, ECFC, ECTR, CCRV, CTM, BILL, FXCA, WORKSHEET; HL, WECO and SOVM map to existing screens. Commits are listed in `docs/TODO.md` ("Done in 2.26.0") and `docs/audit-v2.23.0-coverage.md`.
- The visual pass: Bergoom by default, measured colours, colour-blind schemes, panel chrome, the help desk's own page (`docs/visual-research-2026-10.md`).
- Evidence pack v3 (from Codex) checked and compared with the app: `docs/bloomberg-parity.md`, "Evidence pack v3: gap analysis". The owner approved its five additions and five defect tests on 26 October. Done: SCREEN over Nasdaq's whole US list with AND/OR groups, explicit missing values and saved screens (`8caa5d7`); worksheets under W (`f26fa11`); PEERS' EV with preferred stock and minority interest (`89ef249`); LLP to LAYOUTS (`3951765`). Left: items 10 to 12 in `docs/TODO.md`.
- `27947b2`: the portfolio ledger's calculations, without a screen (below).

## Done on 27 October, before the second account (in 2.27.0)

- `6e6171a` **Typeface fixed to IBM Plex Sans** (see `CLAUDE.md`): Bergoom drew uneven figures on Windows. No typeface setting any more; `tests/typeface.test.ts` and `e2e/look.spec.ts` guard it.
- `e01d65b` EA/EVENTS ask the latest reports' year-earlier days first, so growth figures show at once.
- `a152d9a` **Watchlist sessions, the owner's rule:** After-hrs is the latest after-hours session, live 16:00 to 20:00 New York, then frozen at its last trade through the next pre-market and day until the next evening trades. Pre-mkt is today's, live 04:00 to 09:30, then frozen; from the regular close until the next pre-market (and at weekends) it reads N/A. The blinking After-hrs column was the price poller replacing the stored Yahoo quote without the evening read from the chart (`withSessionChart` in `src/data/live/yahoo.ts`).
- The next commit: **the owner's watchlist layout** (after Yahoo Finance's watchlist summary): Security, Name, Last Price, Change (%), Change, Pre-mkt, After-hrs, Volume, Avg Vol (3M), YTD, 52-Wk %, Day Range and 52-Wk Range (one-line range bars: low, bar with marker at the last price, high; the day fills the move from the open, the year fills today's range), Day Chart (dotted line at the previous close, green above, red below), Market Cap. Lists that still carried the old default columns move to it once; lists with their own columns keep them. Bid, Ask and Time are still in 94) Columns.

## The second account's work, 27 October (TODO items 10 to 13, in 2.27.0)

Done after the morning's handover, each with unit, browser and desktop tests, and checked live where data was involved (`docs/TODO.md`, "Done"):
- Item 10, PORTFOLIO transactions (`9642efe`): the Transactions tab is `src/functions/PortTransactions.tsx`; the store operations (add, delete, holdings kept in step, rates after a currency change) are `src/terminal/transactions.ts`; the calculations stay in `src/finance/ledger.ts`, now also checked against Microsoft's XIRR example. Formulas in `docs/calculators.md`, "Portfolio performance and risk".
- Item 11, BONDCALC call schedules (`af1e679`): `parseCallSchedule`, `redemptionFlows`, `yieldToRedemption` and `workouts` in `src/finance/bonds.ts`; conventions in `docs/calculators.md`, "Calls".
- Item 12, the help desk against planted instructions (`454a482`): `src/data/assistant/guard.ts`, used by `local.ts` and `claude.ts`; Claude's instructions in `electron/assistant.cjs`.
- Item 13, the newly confirmed codes: the sector pages `src/functions/CMDSECTOR.tsx` (measures in `src/data/sector-measures.ts`), WCR `src/functions/WCR.tsx`, WEIS and WM `src/functions/WORLDEQ.tsx`, the ECB, BOE and BOJ portals `src/functions/CBPORTAL.tsx` (new series €STR, SONIA and the Bank of Japan's API in `src/data/live/policy.ts` and `electron/main.cjs`), CBRT `src/functions/CBRT.tsx`, MYN `src/functions/MYN.tsx`; GEW, NLRT and DSCO open existing screens. NGAS waits on an EIA key.
- Reference research: DSCO and BTM rechecked at their sources; reference hosts answer from this environment (`docs/bloomberg-parity.md`, under the gap analysis).

## After 2.27.0 (27 October, evening)

- 2.27.0 was published by the release workflow once the owner opened the repository (the first attempt was refused for the billing reason above).
- The owner sent three archives of public guides with screenshots (a student DES guide of February 2026, a Taiwanese university manual with TSMC's earnings screens of July 2024, a BQuant tutorial with the fixed income search of April 2023). They are not in the repository; a new session needs them sent again to look at the pictures. Every picture inspected, with its source, date, what it shows and the app's status: `docs/bloomberg-parity.md`, "Screenshots from three public guides", which ends with the open questions and what would settle each.
- Built from them: `e8b56ff` EE's own page (`EARNINGSSUMMARY`, `src/functions/EESummary.tsx`; EARNINGS' report matching is the shared hook `useErnReports` in `src/functions/EE.tsx`), `1b0cefc` the FIGI on DES, `6e1e5bd` the stocks left after each criterion on SCREEN (`matchesAfterEach` in `src/data/screen.ts`).

## 28 October (in 2.28.0, not yet published)

- The owner found SPLC far too thin (Applied Digital: 2 suppliers, 4 customers) and the watchlist wrong with the IEX price on (volume 892K against about 15M, flat day charts, grey range figures, triangles). Fixed: `e87e66d` and `400b566` read much more of the company's own filings (lenders, investors, suppliers, subsidiaries; two years of reports, agreement 8-Ks and their press releases) and two years of other companies' filings; `55358fe` adds USAspending.gov's federal contract records (`src/data/live/usaspending.ts`, `electron/usaspending.cjs`, documented in `docs/data-providers.md`); `84c8a8d` takes the session's volume, open, high, low and minute bars of all US venues from Yahoo beside IEX's last price (`withConsolidatedDay` in `src/data/live/iex-engine.ts`).
- `1dcb295` PEERS percentile rank.
- Measuring SPLC: run the live capture (below) on `<TICKER> US Equity SPLC` and compare the centre box's counts. Applied Digital went from 29 relations to 43. News of deals (Alpaca's Benzinga headlines and an earnings call transcript) was checked for Applied Digital and named no counterparty the filings had not, so it was not added.

## 28 October, later: the data audit and new sources (after the 2.28.0 commit, not released)

The owner asked for a full audit ("accurate for past, current and upcoming data for all stocks; non-negotiable") and for errors to be hard to bring back. Everything is in `docs/audit-v2.28-data.md` (findings D1 to D28, each with its second source and fix commit, what was checked and found right, and the known limits). In short:
- Fixed figures: volume after the close, short interest, 12-month return, statements (JPMorgan, Applied Digital, CoreWeave), the ratings tally, HSBC's price to book, Apple's CEO, earnings beats on mixed bases, ECO's dates, earnings dates (past or unset shown as next), net income rows, 30-day volume, STOCK MOVERS' volume, CNY and CNH, the research rows' wording, and many supply chains (AMD/Meta, Lockheed/DoW and the U.S. Government's share, NVIDIA/SoftBank and lettered customers, Super Micro's suppliers, Oracle/Rimini Street and Black Titan, Microsoft/Insight).
- `2506c36` **"Sources disagree"** where two sources give the same figure and differ: the next report date (Yahoo against Nasdaq, both confirmed) and dividends (Yahoo's price history against Nasdaq's record, amounts on today's share basis). Broadcom's 2018 dividends are the live example. The EPS case existed (`0f4bf83`).
- `DEBTPROFILE T GOVT`: the Treasury's marketable debt by class and maturity from Fiscal Data's Monthly Statement of the Public Debt (no key; `electron/fiscal.cjs`, `src/data/live/fiscal.ts`, `src/functions/TreasuryDebt.tsx`). Market value now also says "Sources disagree" where Yahoo's share count and the filing cover differ by more than 2% (Eli Lilly), and DIVIDENDS shows the record's exact amount where Yahoo rounds to three decimals (Walmart). For NYSE stocks, which Nasdaq's dividend record does not cover, DIVIDENDS reads Massive's (declared dividends and their dates; `src/data/live/massive-dividends.ts`).
- `9c46990` **Equibles retired**: no requests, key or research section; a key saved earlier is dropped at start. `54d9b29` **EIA** (NGAS, the oil and gas pages), `587c549` **BEA** (NIPA), `02f8ea2` **CFTC Commitments of Traders** (COT, no key). Each documented in `docs/data-providers.md`, checked live against the publisher's own pages.
- `b6c9554` **The data audit check**: `npm run audit:check` (`scripts/live/audit/check.cjs`, `docs/audit-check.md`) captures the screens, fetches independent references and fails (exit 1) when a figure is beyond its stated tolerance; blocked references exit 2 and are never counted as passed. `.github/workflows/data-audit.yml` runs it on GitHub: on a schedule once the file is on `main`, when the check changes, or by hand.
- SPLC rule changes are checked against about 6,000 saved filing sentences of 32 companies before they go in: only the intended classifications may change.

## 29 October: SPLC review of more companies, and the 2.28.0 release

The owner asked for SPLC to be checked on 15 or more companies across banks, retailers, pharma, energy and autos. Done for JPMorgan, Bank of America, Costco, Target and Home Depot (every stated share checked against the supplier's own 10-K); findings D33 to D41 in `docs/audit-v2.28-data.md`, each fixed with a test on the sentence that showed it. Then the owner asked for the release and this handover (their weekly allowance on this account was running out).

- **Not done yet** (next steps, in order): (1) SPLC review of Eli Lilly, Pfizer, Merck, Exxon, Chevron, Ford, GM, Northrop: capture each with `ARMIN_LIVE_CSV=1` (below) and check every relation and share against the filing it cites; (2) spot checks of HOLDERS, HOLDINGS (13F), INSIDERS and CONGRESS against the SEC (references: Berkshire's 13F of 30 June 2026, Apple's Form 4s of October 2026, Nasdaq's institutional holders); (3) EVENTS (upcoming dates) against the companies' own announcements.
- **How a SPLC review is done**: `ARMIN_LIVE_CSV=1` makes `scripts/live/capture.cjs` save each screen's whole table (`<name>.csv`: relation, name, share, filer, form, date, statement, document link). For a share, download the filer's 10-K and find the sentence. Before committing a rule change, run the changed classifier over saved sentences and diff it against the last commit: only the intended statements may change (that is how the 7,737-sentence comparison in the commits was made; the scripts were scratch files, rebuild them: `classify(sentence, targetPattern(targetNames(ticker, title).names), filerPattern)` from `src/data/live/supply-chain.ts`, sentences from `electron/supply-chain.cjs` `mentionSentences`).
- **Watch for regex cost**: SPLC BAC hung because one rule nested repeats (68 seconds on four bank names in capitals, `0a6735f`). Keep new patterns linear: no repeat inside a repeat over the same characters.
- **Known SPLC limits**: very widely named companies are read from the few hundred filings the full-text search ranks first; a share of one revenue line ("16% of our loyalty services revenue", Bakkt on Bank of America) still shows as a share of the filer's revenue.

- **The data audit on GitHub with the owner's secrets** (run 40779877914, attempt 2, 28 October 22:45 UTC): 520 passed, 1 flagged on screen (Eli Lilly's market value, "Sources disagree" as intended), 4 blocked (Massive's rate limit of 5 a minute for three share counts; Tesla pays no dividend, so no record), 57 skipped, 5 failed. The failures: JPMorgan's revenue of 2022 and 2025 (the app kept the feed's figure, under 1% from the filed one; fixed in `a8dee8f`, `docs/audit-v2.28-data.md` D42) and Tesla's net income three times (the check compared it with ProfitLoss, which includes minority interests; the check is fixed). The re-run on `640fa59` (run 40834710766): 577 passed, 4 failed, 1 flagged, 4 blocked, 1 skipped. JPMorgan's revenue passes. Two questions are open for the next session: (1) **Tesla's net income**: the check took a proxy statement's 7,153 (fixed after that run: only 10-K and 10-Q facts now), but the 10-K gives net income to common stockholders as 7,091 (`NetIncomeLoss`) while FINANCIALS shows 7,130 (`NetIncomeLossAvailableToCommonStockholdersBasic`, the EPS numerator): decide which line FINANCIALS should show, against the 10-K's income statement, and fix with a test. (2) **Walmart's volume of 28 October**: 14.27M on the screen against Tiingo's 14.46M (1.3%); find which is the consolidated figure (Nasdaq's historical, Massive's daily bar) before changing anything.

## Waiting on the owner

- **Secrets for the data audit on GitHub**: Settings > Secrets and variables > Actions > New repository secret: `TIINGO_API_KEY`, `MASSIVE_API_KEY`, `SEC_USER_AGENT`, optional `EIA_API_KEY` and `COINGECKO_API_KEY`. Keys in a session's scratch folder never reach GitHub or a scheduled task: each runner needs its own copy. Missing credentials are reported explicitly, and missing required evidence prevents a verified result. The owner approved adding only `.github/workflows/scheduled-data-audit.yml` to `main`, without merging application code. Once installed, it calls the development branch's reusable audit Tuesday to Saturday at 01:37 UTC, with the eight outstanding SPLC companies alongside APLD and NVIDIA. Check the workflow's actual run and report; scheduled quotation samples do not complete the full documentary reviews.

- Points on the watchlist layout of 27 October: "52-WK" was read as the one-year change (labelled 52-Wk %); Avg Vol (3M) is worked out from the last 63 sessions of the daily history (Yahoo's own figure may differ slightly); Market Cap is in each stock's own currency; Currency and Market Time (Yahoo's columns) were not asked for and are not in the default.

## How to work on it

```
npm ci
npm run lint && npm run typecheck
npx vitest run --maxWorkers=2                      # unit tests (1,784 for 2.29.0)
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test     # browser e2e, demo data (94)
xvfb-run -a npx playwright test --config playwright.desktop.config.ts                 # desktop e2e on fixtures (76)
npm run audit:check                                 # live data audit (keys from the environment; docs/audit-check.md)
```

Never run two of these at once, and never rebuild while a Playwright suite runs. Do not run Vitest with `--root /`: it runs out of memory. Tests cannot use Node modules (no Node types in the tests' tsconfig); load a text fixture with `?raw`.

Checking screens on live data in a Linux sandbox (the real desktop app, one panel per command), with the keys loaded:

```
npm run build
echo '["NVDA US Equity FUNDCHART","SPX Index IMAP"]' > <scratch>/cmds.json
(set -a; . <scratch>/keys.env; set +a; YAHOO_PRICES_ENABLED=true timeout 200 xvfb-run -a node scripts/live/capture.cjs <scratch>/cmds.json <scratch>/out 8000 30000)
```

It saves each panel's text, a screenshot, its header and any console errors (`out/index.json`). Yahoo prices are off in the desktop tests unless `YAHOO_PRICES_ENABLED` is set.

Access observed in the 25 and 26 October session: YouTube refused playback, the Senate's disclosure site refused automated reading, and Eulerpool answered HTTP 500 (TODO, "Waiting on you"). These are dated observations; check access again in the current environment.

Earlier on 27 October, Codex's environment refused CONNECT requests to public reference hosts with HTTP 403; later that day the publisher's and universities' sites answered from the new account's environment. Check access again in the current environment. An inaccessible source is not evidence that it does not exist, and source collection does not block the documented functional work above.

## Making a release (only when the owner asks)

1. `docs/release-vX.Y.Z.md`: it starts `# Armin Terminal X.Y.Z`, then a paragraph starting "This release", and never names the other product.
2. `npm version X.Y.Z --no-git-tag-version`; update the README's version line and the release status in `docs/TODO.md`. Mark it published only after confirming the release and its assets.
3. Set `.github/release-request.json` to `{"schema":1,"tag":"vX.Y.Z","branch":"claude/market-events-v2.16.0-id814n"}`. The tag must match `package.json`. Run every check above; commit the changes and push the development branch. A change to this request file starts the gated release workflow, which creates the tag on that commit. Do not also push the tag or start a duplicate release run.
4. Confirm the workflow finishes successfully and the public release has both Windows executables and their SHA256 files. Linux checks, native Windows desktop tests, package checks and upload verification must pass before publication. A started workflow or a draft is not a published release.

The existing tag-push and manual workflow triggers remain available for an authorized release when no request-file push is used. A manual run takes `tag` = `vX.Y.Z` on the development branch and requires the same version in `package.json`; an existing tag must point to that exact commit. The cloud session's git proxy has refused tag pushes, so use the request-file route for this environment.

## Where things are

- Function registry: `src/terminal/registry.ts` (the "N functions" in `package.json`'s description must equal its length: `tests/audit-2.23.test.ts`); mnemonics: `src/terminal/legacy.ts`; command parsing: `src/terminal/commands.ts`. Every new code also goes in the `COMMANDS` list of `e2e/terminal.spec.ts`.
- Desktop data requests: `electron/*.cjs` (URL builders with `.d.cts` types), handlers in `electron/main.cjs` (`usableKey`, `keyedGet`), exposed in `electron/preload.cjs`, typed in `src/data/live/lookup.ts`; keys in `electron/providers.cjs`. Desktop test fixtures: `desktop-e2e/bootstrap.cjs`, by flag.
- Live data in the renderer: `src/data/live/`. Screens: `src/functions/`. Calculations: `src/finance/`. Styles: `src/styles/global.css`.
- New in this account's work: the screener's logic `src/data/screen.ts`; worksheets `src/functions/WS.tsx` and `src/data/worksheet-fields.ts`; the ledger `src/finance/ledger.ts`.
- Research and parity: `docs/bloomberg-parity.md`, `docs/audit-v2.23.0-coverage.md`, `docs/visual-research-2026-10.md`.
