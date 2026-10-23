# Armin Terminal 2.23.0: audit against the reference documents

Status: **in progress**. This file is the audit's working record; it is updated as the audit goes.

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

(Filled in as the audit goes; see section 3.)

## 2. Reference documents

Stored in `reference/pdfs/` (git-ignored, never committed).

| # | Document | Status |
|---|---|---|
| 1 | Getting Started Guide (INSEAD-hosted, 2025) | **Not retrieved**: the host answers with a Cloudflare bot check (HTTP 403). Asked the owner for the file. |
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
| 14 | Quick Start: News & Market Research (Ohio) | **Not retrieved**: the host resets the connection from this sandbox. Asked the owner. |
| 15 | EQS exercise, Graham (Crack 2023) | retrieved, 20 pp |
| 16 | Putting Bloomberg into Action (Abdoh, SSRN) | **Not retrieved**: SSRN answers with a Cloudflare bot check. Asked the owner. |
| 17 | EQS exercise, ESG (Crack, SSRN) | **Not retrieved**: as #16. Asked the owner. |
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

Observations that are **not** findings (checked and correct):
- Command forms (desktop, `scratchpad/live/mech.cjs`): `IBM US Equity DES`, `IBM US Equity DES <GO>`, lower case, extra spaces, `DES IBM US Equity`, `IBM US <EQUITY> DES <GO>`, `IBM US` F8 `DES` all open PROFILE on IBM US Equity; `USGG10YR Index GP` opens CHART; `EURUSD Curncy`, `CL1 Comdty`, `ABI BB Equity`, `AAPL` alone open the security's MENU; an unknown command explains itself in red beside the command line ("No stock found named …", "Unknown function: XQZ"); Backspace on an empty line goes back; Alt+←/→ move through history; F1 opens HELP; `DES` then F1 opens DES's help; Alt+End opens MENU and again the sector menu; `2 <GO>` on a menu opens item 2; PgDn/PgUp page; `3` PgDn moves three pages (1 → 4 of 14 on MEMBERS SPX); `99` PgDn stops at the last page (14 of 14); Ctrl+Tab and Alt+1/Alt+2 change the active panel; no console error in 43 steps.
- Clocks across the two daylight-saving changes: pinned by `tests/exchanges.test.ts` (Euronext opens 08:00 UTC on 26 Oct 2026; the NYSE opens 13:30 UTC = 14:30 Brussels that day and 14:30 UTC from 2 Nov; Thanksgiving closed, 13:00 early close on 27 Nov; Euronext half day 24 Dec).
- Treasury yields: USGG2YR 4.81, USGG10YR 5.13, USGG3M 4.25 in the app on 22 Oct 2026 equal the Treasury's par yield curve CSV for 21 Oct 2026 (2 Yr 4.81, 10 Yr 5.13, 3 Mo 4.25).
- Security: both windows run with `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, new windows denied; keys are stored encrypted with Electron `safeStorage`; the renderer receives only "configured/valid/source" per credential (`electron/providers.cjs` `credentialStatus`), never a value; IPC handlers check the sender is the app's own page (`fromApp`).
- BRK/B: FINANCIALS diluted EPS 2025 31.04 is per Class B share (net income 66,968M over about 2.16B Class B equivalents), matching the B price; 2022–2025 net income matches Berkshire's reported results.
- 485 screens captured without keys (two runs): no failures, no console errors.

## 4. Coverage matrix

(Generated; see `docs/audit-v2.23.0-coverage.md` once built.)

## 5. Data gaps

## 6. Document conflicts

| Topic | Documents | What each says | Decision |
|---|---|---|---|
| The F12 key | #4 (CMU extended guide, keyboard figure) against the Students guide (keyboard figure) and #19 (Scranton, yellow keys table) | #4 prints F12 as CLIENT (and F1 as PEOPLE); the Students guide prints F12 Port (and F1 Help); #19 lists F12 as Portfolio Management | Newest keyboard wins for the label: PORT, with F1 HELP. The key types the sector word CLIENT that the command line already parses (`src/data/registry.ts`), and CLIENT <GO> opens PORTFOLIO. |

## 7. Owner-run checklist

## 8. Appendix
