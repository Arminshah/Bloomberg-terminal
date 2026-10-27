# Handover: where the work stands (27 October 2026)

For any Claude session that takes over Armin Terminal, on this account or another. Read this first, then `docs/TODO.md` (the one list of what comes next), then `docs/bloomberg-parity.md` ("Evidence pack v3: gap analysis" and "Screenshots from three public guides").

## The project

- **Armin Terminal**: a Windows desktop market terminal for the owner's private use (Electron 43, React 19, Vite 7, TypeScript), with a browser demo on simulated data. 132 functions.
- **Repository**: `Arminshah/Bloomberg-terminal`. The owner keeps it private and opens it when a release is built. While it is private, GitHub starts no runner: on 27 October every job failed within seconds, its annotation saying "recent account payments have failed or your spending limit needs to be increased" (the account's Actions minutes for private repositories). Then check everything locally before each push, and before a release ask the owner to open the repository for about half an hour or raise the spending limit.
- **Pull request**: https://github.com/Arminshah/Bloomberg-terminal/pull/4, a draft into `main`. Its description is out of date; rewrite it only if the owner wants it out of draft. Do not merge it. An older one (number 1) overlaps; the owner decides.
- **Last release**: 2.27.0 (tag `v2.27.0`, 27 October 2026), built by `.github/workflows/release.yml` from this branch. Notes: `docs/release-v2.27.0.md`. 2.26.0 came the day before.

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
2. Ask the owner for the API keys again if the environment's settings do not hold them: they are kept only in each session's scratch folder, which a new session cannot see. The names are: `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY`, `COINGECKO_API_KEY`, `FRED_API_KEY`, `MASSIVE_API_KEY`, `SEC_USER_AGENT` (`Armin Shah arminshahw98@gmail.com`), `FINNHUB_API_KEY`, `TIINGO_API_KEY`, `MARKETAUX_API_TOKEN`, `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `FMP_API_KEY`, `TIPRANKS_API_KEY`, `EQUIBLES_API_KEY`, `OPENFIGI_API_KEY`, `EULERPOOL_API_KEY`, `CONGRESS_GOV_API_KEY`. Save them as `NAME=value` lines in a file in the session's scratch folder (`chmod 600`), never in the repository.
3. Carry on with `docs/TODO.md`: items 10 to 13 were done on 27 October; NGAS waits on an EIA key, and the owner chooses what comes next from "Later".

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

## Waiting on the owner

- An EIA key for NGAS and the oil and gas inventories (`docs/TODO.md`, "Waiting on you").
- Points on the watchlist layout of 27 October: "52-WK" was read as the one-year change (labelled 52-Wk %); Avg Vol (3M) is worked out from the last 63 sessions of the daily history (Yahoo's own figure may differ slightly); Market Cap is in each stock's own currency; Currency and Market Time (Yahoo's columns) were not asked for and are not in the default.

## How to work on it

```
npm ci
npm run lint && npm run typecheck
npx vitest run --maxWorkers=2                      # unit tests (1,541 after 2.27.0)
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium npx playwright test     # browser e2e, demo data (89)
xvfb-run -a npx playwright test --config playwright.desktop.config.ts                 # desktop e2e on fixtures (70)
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
2. `npm version X.Y.Z --no-git-tag-version`; the README's version line; "Released" in `docs/TODO.md`.
3. Run every check above; commit "Release X.Y.Z"; push the branch.
4. `git tag vX.Y.Z && git push origin vX.Y.Z`. The release workflow tests the tag, builds the Windows installer and portable app, uploads them and publishes the release. Check it in the repository's Actions tab. When the tag push fails through the cloud session's git proxy (it did on 27 October), start the workflow by hand instead (GitHub's "run workflow" with the input `tag` = `vX.Y.Z`, on this branch): it creates the tag on the branch's last commit, which must carry that version.

## Where things are

- Function registry: `src/terminal/registry.ts` (the "N functions" in `package.json`'s description must equal its length: `tests/audit-2.23.test.ts`); mnemonics: `src/terminal/legacy.ts`; command parsing: `src/terminal/commands.ts`. Every new code also goes in the `COMMANDS` list of `e2e/terminal.spec.ts`.
- Desktop data requests: `electron/*.cjs` (URL builders with `.d.cts` types), handlers in `electron/main.cjs` (`usableKey`, `keyedGet`), exposed in `electron/preload.cjs`, typed in `src/data/live/lookup.ts`; keys in `electron/providers.cjs`. Desktop test fixtures: `desktop-e2e/bootstrap.cjs`, by flag.
- Live data in the renderer: `src/data/live/`. Screens: `src/functions/`. Calculations: `src/finance/`. Styles: `src/styles/global.css`.
- New in this account's work: the screener's logic `src/data/screen.ts`; worksheets `src/functions/WS.tsx` and `src/data/worksheet-fields.ts`; the ledger `src/finance/ledger.ts`.
- Research and parity: `docs/bloomberg-parity.md`, `docs/audit-v2.23.0-coverage.md`, `docs/visual-research-2026-10.md`.
