# Armin Terminal 2.23.0: audit against the reference documents

Status: **complete for this pass** (23 October 2026). Fourteen findings, all fixed on `claude/market-events-v2.16.0-id814n`, each with a regression test in `tests/audit-2.23.test.ts`.

## 1. Summary

### Baseline (tag `v2.23.0`, commit `0994b18`, run 22 October 2026 in a Linux cloud sandbox)

| Suite | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` (Vitest) | 1,188 passed, 90 files |
| `npm run e2e` (Playwright, browser) | 38 passed |
| `npm run e2e:desktop` (Playwright, Electron, under xvfb) | 34 passed |
| `npm run build` | pass |

Commands: a separate checkout of the tag (`git worktree add <dir> v2.23.0`), sharing `node_modules`; `npx vitest run --maxWorkers=2`; `npx playwright test`; `xvfb-run -a npx playwright test --config playwright.desktop.config.ts`.

### Decisions recorded at the start

- **Branch.** The brief asks for `audit/v2.23.0` branched from `main`. `main` (`338c566`) holds only the initial README; the application lives on `claude/market-events-v2.16.0-id814n`, which this session is allowed to push to. The audit's fixes are committed there, on top of the release. `main` is therefore *not* ahead of the tag: it is 0 commits ahead and does not contain the app.
- **What is audited.** The baseline above is the exact tag. The working branch was 2 commits past the tag when the audit started (`45106dc` analyst research for listings outside the US; `dfb7309` the heat maps: INDEXMAP with a Heatmap tab, HEATMAP's regional map restored). The audit is run on the working branch, as that is what the next release will contain; anything those commits changed is noted where it matters.
- **Environment limits.** No Bloomberg login (BPS, DOCS and in-terminal HELP not available). Yahoo refuses this sandbox's session (HTTP 429 on its crumb endpoint), so screens that need Yahoo's quote summary cannot be checked live here; they go to the owner-run checklist.

### Findings

| Severity | Count | IDs |
|---|---|---|
| S1 (wrong figure shown as fact) | 2 | A23-006 (NVIDIA EPS on the pre-split basis), A23-007 (a quarter "ended 30/09/26" shown as reported) |
| S2 (documented workflow missing or misleading label) | 4 | A23-001, A23-008, A23-010, A23-011 |
| S3 (label, order or format) | 8 | A23-002, A23-003, A23-004, A23-005, A23-009, A23-012, A23-013, A23-014 |
| S4 | 0 | |

No crash, freeze, data loss or exposed key was found. Each fix was checked in the desktop app where the data allowed it; the tests of A23-007, A23-013 and A23-014 were also run against the old code, where they fail.

### Final run (working branch, after the fixes)

| Suite | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| Vitest (`npx vitest run --maxWorkers=2`) | 1,223 passed, 94 files (baseline 1,188, 90) |
| Playwright, browser | 38 passed |
| Playwright, Electron under xvfb | 34 passed |
| `npm run build` | pass |

### Deviations from the brief

- The fixes are on the working branch, not `audit/v2.23.0` from `main` (see Decisions). No pull request was opened: `main` holds only the README, so a pull request into it would carry the whole application; the owner decides.
- A23-011 and A23-012 share one commit; A23-005's test needed a follow-up commit (it used `node:fs`, which the test typecheck does not include).
- No version bump, tag or release.

## 2. Reference documents

Stored in `reference/pdfs/` (git-ignored, never committed).

| # | Document | Status |
|---|---|---|
| 1 | Getting Started Guide (INSEAD-hosted, 2025) | received from the owner on 23 Oct, 28 pp: the same text as the Students guide (compared page by page), so that guide's notes cover it |
| 2 | Launchpad (Cornell) | retrieved, 16 pp |
| 3 | Equities Workflow (June 2025), primary | retrieved, 29 pp |
| 4 | Getting Started, extended (CMU) | retrieved, 36 pp |
| 5 | Equity Valuation (Babson) | retrieved, 22 pp |
| 6 | Excel Add-In Desktop Guide | retrieved, 52 pp |
| 7 | Excel Plug-In (Babson) | retrieved, 6 pp |
| 8 | WACC Components (Babson) | retrieved, 10 pp |
| 9 | Portfolio & Risk Analytics, long/short | retrieved, 19 pp |
| 10 | Fixed Income Indices | retrieved, 8 pp |
| 11 | BQL in Excel | retrieved, 4 pp |
| 12 | LUISS primer | retrieved, 11 pp |
| 13 | Education User Guide (Spanish) | retrieved, 32 pp |
| 14 | Quick Start: News (the owner's copy, 2020) | received from the owner on 23 Oct, 44 pp; read in full |
| 15 | EQS exercise, Graham (Crack 2023) | retrieved, 20 pp |
| 16 | Putting Bloomberg into Action (Abdoh, SSRN) | received from the owner on 23 Oct, 69 pp |
| 17 | EQS exercise, ESG (Crack, SSRN) | received from the owner on 23 Oct, 32 pp (sent twice, identical files) |
| 18 | Lei and Li (2012) | retrieved, 16 pp |
| 19 | Training Manual (Scranton) | retrieved, 69 pp |
| 20 | Market Data Manual (Aug 2024) | retrieved, 44 pp (scope: entitlement labelling only) |
| 21–32 | CMU cheat sheets | all 12 retrieved, 1–2 pp each |
| + | Getting Started Guide for Students | retrieved, 28 pp |

No match is claimed against a document that was not read.

## 3. Findings

Severity: S1 wrong figure shown as fact, crash, freeze, data loss, exposed key; S2 documented workflow/key/default/tab/column missing or different while the data exists, or a misleading label or freshness tag; S3 layout, label, order or format differs; S4 cosmetic.

| ID | Sev | Function | Steps | Expected (source) | Observed | Root cause | Fix / test |
|---|---|---|---|---|---|---|---|
| A23-001 | S2 | INDEXMAP (IMAP) | `SX5E Index INDEXMAP` (also BEL20, UKX) in the desktop app | The index's membership map, or a statement that it is not available | The US stocks' heat map titled "US by sector", with a footnote telling the user to use INDEXMAP | `src/functions/IMAP.tsx` `IMAP()`: an index without a loadable membership falls back to the regional map on its US tab | Fixed: the fallback opens the index's region (SX5E, UKX, BEL20: Europe; NKY, HSI: Asia Pacific) under an amber note naming the index and saying the map is not its membership and why; INDEXMAP no longer points to itself. Test: A23-001. Live: SX5E and UKX open "Europe by sector" with the note |
| A23-002 | S3 | HEATMAP, INDEXMAP | `RIVN` looked up, then `HEATMAP` | A stock without a sector in an "Unclassified" group | A sector tile named "--" | `IMAP.tsx`: the sector string "--" that the lookup stores for an unknown sector is used as a group name | Fixed: `groupName` maps the placeholder to "Unclassified" (industry: "Other"). Test: A23-002 |
| A23-003 | S3 | Command line | `CT10 Govt PROFILE` in the desktop app | A message that generic government bond prices are not available from the free sources (the yield is: `USGG10YR Index`) | "No stock found named "CT10 Govt". Unknown security", calling a Treasury note a stock | The desktop app has no bond universe (no free bond prices); the lookup message assumes a stock | Fixed: a generic Treasury (`CT2`…`CT30 Govt`) answers "Treasury prices are not available from the app's free sources. The 10-year yield is: USGG10YR Index"; any other unknown Govt/Corp security is "Unknown security: … Govt", never searched as a company name. Test: A23-003. Live: as quoted |
| A23-004 | S3 | Key bar / F12 | Look at the key bar; press F12 | One meaning for F12 (to be set from the keyboard documents) | The key bar labels F12 "PORT"; pressing F12 types "CLIENT" | `src/components/KeyBar.tsx` and `FKEY_TEXT` in `src/components/CommandLine.tsx` disagree | Fixed: the key bar's sector keys are built from `FKEY_TEXT`, so clicking PORT types CLIENT exactly as F12 does (it used to run the command at once); the label stays PORT (see section 6) and the tooltip says CLIENT <GO> opens PORTFOLIO (checked in the desktop app). Test: A23-004 |
| A23-005 | S3 | Documentation | `package.json` description | 91 registered functions (90 at the tag) | "75 functions" | not updated since 2.15 | Fixed: "91 functions"; a test now ties the number to the registry. (README's "75 functions" sits in the 2.9.0 paragraph and is historical.) Test: A23-005 |
| A23-006 | S1 | FUNDCHART, FINANCIALS (and FILINGS' reported figures) | `NVDA US Equity FUNDCHART` | FY2022 diluted EPS on today's share basis: 0.385 (3.85 filed 21 Feb 2024, before the 10-for-1 split of 10 Jun 2024); P/E about 59 at the year-end close (22.84 on today's basis) | EPS 3.85 and P/E 5.9 next to post-split years (0.17, 1.19, 2.94, 4.90) | `buildRealFund` (`src/data/live/yfund.ts`) filled the oldest year from the SEC's latest filing for it, whose per-share figures predate a later split; Yahoo's own four years are restated | Fixed: SEC EPS ÷ and diluted shares × the splits after the filing date (`splitFactorSince`); left out until the split history has loaded, then rebuilt; FILINGS keeps the as-filed figure, marks it "s" and gives today's basis in the tooltip. Test: `tests/audit-2.23.test.ts` A23-006. Live: FY2022 0.39, P/E 59.3 |
| A23-007 | S1 | EARNINGS (EE) | `NVDA US Equity EARNINGS` with a Finnhub key | Each fiscal quarter once: Q2 FY2027 ended 26 Jul 2026, reported 26 Aug 2026, 2.09 expected against 2.22 (FMP, Yahoo); nothing for a quarter not yet reported | Extra rows "Q2 2027 ended 30/09/26 · 2.14 · 2.22 · Beat by 3.8%" and "Q2 2026 ended 30/09/26" (a quarter that had not ended, shown as reported), "Q1 2027 26/08/26" twice, and an ERN row "26/08/26 Q1 2027 30/06/26" | Finnhub's `/stock/earnings` names each quarter by the end of the calendar quarter its fiscal quarter ends in (2026-09-30 for the July quarter, checked against its API on 23 Oct 2026) and lists the April quarter twice; `mergeConsensus` took the period as the quarter's end | Fixed: `finnhubQuarterEnd` maps the period to the fiscal quarter end inside it (from the fiscal year end, else a reported quarter end), the fiscal year names the quarter, a repeated period is used once. Test: A23-007 (fails on the old code). Live: eight quarters, each once; reported EPS 2.46 and 2.39 match the 10-Qs |
| A23-008 | S2 | EARNINGS (EE) | `SAP GY Equity EARNINGS` with every key set | Why the past quarters have no expected revenue, and no request for a key that cannot fill them | "4 of 4 reported quarters have no expected revenue … Set ALPHA_VANTAGE_API_KEY (free) on PROVIDERS" although the key was set | `missingRevenueHint` (`src/data/live/consensus.ts`) asked for the key whenever Alpha Vantage had no answer for the stock; the app asks Alpha Vantage, FMP and Finnhub about US listings only (`secTicker`) | Fixed: for a listing outside the US the hint says those sources are asked for US listings only. Test: A23-008 |
| A23-009 | S3 | FUNDCHART, QUOTE | `APLD US Equity FUNDCHART`, `APLD US Equity QUOTE` | NM (not meaningful) for a P/E on a loss, as PROFILE already shows | "--" in every FUNDCHART year (all losses) and for QUOTE's P/E LTM | the two screens printed the NaN P/E as a blank | Fixed: `yearPeBlank` (FUNDCHART) and `peText` (QUOTE) give NM when EPS is at or below zero; a missing price or another reporting currency stays blank. Test: A23-009 |
| A23-010 | S2 | MARKETNEWS (TOP), command line | Document 14 p3, p12-13, p21-22, p41: `TOP Oil`, `HCP`, `HCPI`, `FXFR`, `FIRS`, `CLA Comdty` | Oil stories; the historical price tables; the spot/forward screen; breaking news; the crude contract | `TOP Oil` read "oil" as the crude future and showed every story unfiltered; HCP, HCPI, FXFR and FIRS were "Unknown function"; `CLA Comdty` "Unknown security" | The parser takes the longest run of words naming a security, and MARKETNEWS filters by stock tickers only; the four codes had no mnemonic | Fixed: functions marked `topics` (MARKETNEWS) keep a word that names anything but a stock as the keyword; FIRS → BREAKING, HCP and HCPI → HISTORY, FXFR → FXFORWARD (the differences are in the coverage notes); an active-contract ticker names the front contract (CL1 Comdty). Test: A23-010 |
| A23-011 | S2 | SCREEN (EQS) | Document 17 criteria 4-7: leave out tobacco, defence, alcohol, casinos | An exclusion by industry | No way to leave an industry out, although every stock carries its sector and industry | `src/functions/EQS.tsx` had include filters only | Fixed: "Exclude industries" (comma-separated words matched against sector and industry; `excludedBy`). The ESG scores, emissions and UN Global Compact criteria have no free source (section 5). Test: A23-011 |
| A23-012 | S3 | Command line | Document 16 pp 13, 26: `GT10 Govt`, `PRTU` | The 10-year yield; the portfolio set-up | "Unknown security: GT10 Govt"; "Unknown command: PRTU" | GT generic tickers were not recognised; PRTU had no mnemonic | Fixed: GT tickers name the yield line as CT tickers do; PRTU opens PORTFOLIO. Test: A23-012 |
| A23-013 | S3 | Command line autocomplete | Type `apple` in the desktop app | Apple Inc (AAPL US Equity) first; documents 14 p7-9 and 16 p3 describe picking the company from the dropdown | First suggestion "APPLE US Equity · Load from Yahoo Finance", a ticker that does not exist, above Apple Inc | `src/terminal/suggest.ts` always put the online ticker load first | Fixed: the online load comes first only when nothing in the app matches; after the matches otherwise. Test: A23-013 (fails on the old code) |
| A23-014 | S3 | PROFILE (DES), QUOTE, keyStats | `SAP GY Equity PROFILE`, `BRK/B US Equity PROFILE` with the keys (22 Oct) | A P/E with the trailing EPS it comes from | P/E 32.24 (SAP) and 13.76 (BRK/B) next to "T12M EPS --"; FINANCIALS' LTM column blank | Yahoo's quarterly series skip quarters (SAP has no Q3 2025 EPS; BRK-B none for Q3 or Q4 2025; checked against its API) and SAP's newest quarter came from the earnings module with revenue only, so the statements had no LTM EPS; `keyStats` then used the source's P/E without the source's EPS | Fixed: the source's trailing EPS (`trailingEps`) is kept with its P/E and used when the statements have none, in the trading currency only; the statements' EPS still wins when they have one. Test: A23-014 (fails on the old code). The LTM column stays blank where four quarters cannot be summed (data gap) |

Observations that are **not** findings (checked and correct):
- Esc on the command line (desktop): with suggestions open the first Esc closes them and keeps the text; the second clears the line. The suggestions list functions before securities ("ib": IB, then IBOV, IBEX, IBM).
- Command forms (desktop, `scratchpad/live/mech.cjs`): `IBM US Equity DES`, `IBM US Equity DES <GO>`, lower case, extra spaces, `DES IBM US Equity`, `IBM US <EQUITY> DES <GO>`, `IBM US` F8 `DES` all open PROFILE on IBM US Equity; `USGG10YR Index GP` opens CHART; `EURUSD Curncy`, `CL1 Comdty`, `ABI BB Equity`, `AAPL` alone open the security's MENU; an unknown command explains itself in red beside the command line ("No stock found named …", "Unknown function: XQZ"); Backspace on an empty line goes back; Alt+←/→ move through history; F1 opens HELP; `DES` then F1 opens DES's help; Alt+End opens MENU and again the sector menu; `2 <GO>` on a menu opens item 2; PgDn/PgUp page; `3` PgDn moves three pages (1 → 4 of 14 on MEMBERS SPX); `99` PgDn stops at the last page (14 of 14); Ctrl+Tab and Alt+1/Alt+2 change the active panel; no console error in 43 steps.
- Clocks across the two daylight-saving changes: pinned by `tests/exchanges.test.ts` (Euronext opens 08:00 UTC on 26 Oct 2026; the NYSE opens 13:30 UTC = 14:30 Brussels that day and 14:30 UTC from 2 Nov; Thanksgiving closed, 13:00 early close on 27 Nov; Euronext half day 24 Dec).
- Treasury yields: USGG2YR 4.81, USGG10YR 5.13, USGG3M 4.25 in the app on 22 Oct 2026 equal the Treasury's par yield curve CSV for 21 Oct 2026 (2 Yr 4.81, 10 Yr 5.13, 3 Mo 4.25).
- Security: both windows run with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, new windows denied; keys are stored encrypted with Electron `safeStorage`; the renderer receives only "configured/valid/source" per credential (`electron/providers.cjs` `credentialStatus`), never a value; IPC handlers check the sender is the app's own page (`fromApp`).
- BRK/B: FINANCIALS diluted EPS 2025 31.04 is per Class B share (net income 66,968M over about 2.16B Class B equivalents), matching the B price; 2022–2025 net income matches Berkshire's reported results.
- 485 screens captured without keys (two runs): no failures, no console errors. 485 screens captured with the owner's keys (two runs, 222 + 263): no failures, no console errors.
- CURVE on 22 Oct 2026 (keys run, 21:15 UTC): every Treasury yield equals the Treasury's daily par yield curve for 22 Oct (3M 4.22, 6M 4.29, 1Y 4.41, 2Y 4.65, 3Y 4.72, 5Y 4.78, 7Y 4.86, 10Y 4.96, 20Y 5.32, 30Y 5.29), and the day changes equal the difference from 21 Oct (2Y −16bp, 10Y −17bp).
- ECONSTATS: US CPI 3.7% for Sep 2026 = FRED CPIAUCNS 336.94 / 324.80 − 1 = 3.74%; the real rate +0.26 = the Fed's upper limit 4.00 − 3.74, as the screen's note says.
- NVDA quarterly diluted EPS 2.46 (quarter ended 26 Jul 2026) and 2.39 (26 Apr 2026) in EARNINGS equal the 10-Qs' XBRL facts; FMP's revenue 96.221 billion for the July quarter matches EARNINGS.
- NVDA FY2022 P/E after A23-006: the 28 Jan 2022 close of about 228.40 is 22.84 on today's share basis; 22.84 / 0.385 = 59.3, as the app shows.

## 4. Coverage matrix

Full table: [`docs/audit-v2.23.0-coverage.md`](audit-v2.23.0-coverage.md) (the app's 91 functions with the mnemonics that open them and the documents that cite them; every code the documents use with its status).

- 525 codes appear in the documents. 91 open a screen in the app (after the four mnemonics added under A23-010 and PRTU under A23-012); 10 are market sector keys, which typed alone open the sector's MENU; 21 are not functions.
- **55 missing, could be built from free data (class a).** The ones cited most: ECFC (IMF forecasts), ECTR (IMF trade data), EA (an index's earnings season), EEG/EM (estimate history and trends), RELS, CTM/CT/CCRV (futures contract months), CACT (corporate actions across stocks), FXCA, WCR, WECO, INSD (SEC Form 4), OVDV (option IV surface from the contracts OPTIONS already loads), PSRT/PD/HLDR/FLNG/RANK (SEC 13F), central bank pages (ECB, FED, BOE, BOJ, CBRT).
- **348 missing, class b**: the provider's own content (its news, research, opinion, newspapers, billionaires, league tables), platform and account services (messaging, Launchpad, Excel and API tools, training, login, trading and execution), and data with no free source identified (credit ratings, ESG scores and emissions, M&A and new-issue databases, CDS, OAS, dealer runs, shipping and energy databases).
- Not built in this audit: implementing class-a functions is new work, listed here for after it.

## 5. Data gaps

Seen while checking screens against documents and primary sources; each is a blank or a missing screen because no free source supplies it, not a defect.
- **ESG** (document 17): disclosure scores, greenhouse-gas intensity, UN Global Compact and board-pay flags; green-bond flags in BONDSEARCH.
- **Ratings and debt** (documents 14, 16): issuer and bond credit ratings (CRPR); preferred stocks (SECF with Pfd: the app does not cover the Pfd sector); generic Treasury prices on the desktop (yields are there: USGG*).
- **Screening universe**: SCREEN covers the stocks the app follows and those looked up, not a global universe of tens of thousands (documents 15, 17).
- **ECONSTATS**: no 10-year yield for France, Italy, Spain, the Netherlands or Belgium; Japan's CPI and policy rate are blank (no connected source; the screen's note says so for inflation).
- **Earnings outside the US**: past quarters' expected revenue and report sessions for European listings (A23-008 now says why).
- **Options**: IV and Greeks blank where the provider gives none; no open interest or option volume from this endpoint (the screen says so).

## 6. Document conflicts

| Topic | Documents | What each says | Decision |
|---|---|---|---|
| The F12 key | #4 (CMU extended guide, keyboard figure) against the Students guide (keyboard figure) and #19 (Scranton, yellow keys table) | #4 prints F12 as CLIENT (and F1 as PEOPLE); the Students guide prints F12 Port (and F1 Help); #19 lists F12 as Portfolio Management | Newest keyboard wins for the label: PORT, with F1 HELP. The key types the sector word CLIENT that the command line already parses (`src/data/registry.ts`), and CLIENT <GO> opens PORTFOLIO. |

## 7. Owner-run checklist

To run on Windows with the installed app (Yahoo refuses this sandbox's session, and some screens need a person to look):
1. `NVDA US Equity FUNDCHART`: FY2022 EPS about 0.39 and P/E about 59 (A23-006). `NVDA US Equity FILINGS`, reported figures: the FY2022 EPS 3.85 marked s, its tooltip giving 0.39 on today's shares.
2. `NVDA US Equity EARNINGS` with a Finnhub key: each quarter once, no quarter ended 30/09/26 (A23-007).
3. `SX5E Index INDEXMAP`, `UKX Index INDEXMAP`: the amber note and the Europe map (A23-001). `HEATMAP` after looking up a stock with no sector: an Unclassified tile (A23-002).
4. `CT10 Govt`, `GT10 Govt`, `CLA Comdty`: the messages naming USGG10YR Index and CL1 Comdty (A23-003, A23-010, A23-012).
5. Click PORT on the key bar, then press F12: both type CLIENT; `CLIENT <GO>` opens PORTFOLIO (A23-004).
6. `SAP GY Equity EARNINGS`: the hint says the sources are asked for US listings only (A23-008). `SAP GY Equity PROFILE` and `BRK/B US Equity PROFILE` with Yahoo working: T12M EPS shown next to the P/E (A23-014).
7. `APLD US Equity FUNDCHART` and `QUOTE`: NM for the P/E (A23-009).
8. `TOP Oil`, `TOP Europe`: stories filtered by the word; `FIRS`, `HCP`, `HCPI`, `FXFR`, `PRTU` open BREAKING, HISTORY, FXFORWARD, PORTFOLIO (A23-010, A23-012).
9. SCREEN: Exclude industries "tobacco, casinos" removes those stocks (A23-011).
10. Type `apple`: Apple Inc is the first suggestion (A23-013).
11. With Yahoo working: PROFILE's employees and insiders, ASML's next earnings date and the FX bid/ask, which were blank here because Yahoo refused the session.
12. Rotate every API key that was pasted into chats during this work (all 13 providers, and the Alpaca key pair).

## 8. Appendix

- Captures: `scratchpad/live/capture.cjs` (one panel per command in the desktop app on live data: text, screenshot, header, console errors), run without keys (485 screens) and with the owner's keys (485 screens); the keys were passed as environment variables from a file outside the repository and never printed.
- Primary figures: `scratchpad/audit/expected/fetch_primary.py` (SEC XBRL company facts, FINRA short interest, NY Fed, ECB, FRED, Nasdaq closes), plus the Treasury's daily par yield CSV, FRED CPIAUCNS, the SEC companyconcept API and the Finnhub, FMP and Yahoo answers quoted in the findings.
- Reference notes in my own words: `scratchpad/refnotes/` (per document, with mnemonic tables); the documents themselves stay in `reference/pdfs/`, which git ignores.
