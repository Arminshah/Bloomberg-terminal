# Handover: where the work stands (25 October 2026)

For whoever continues on Armin Terminal. Read this first, then `docs/TODO.md`, then `docs/audit-v2.23.0.md`.

## The project

- **Armin Terminal**: a Windows desktop market terminal for the owner's private use (Electron 43, React 19, Vite 7, TypeScript), with an opt-in browser demo.
- **Repository**: `arminshah/bloomberg-terminal` (public). All work is on the branch **`claude/market-events-v2.16.0-id814n`**. `main` holds only the first README; do not push to it. A new cloud session may be told to use another branch name: the owner's choice is to keep working on this one.
- **Last release**: 2.24.0 (tag `v2.24.0`, published 23 October 2026). It has the audit of 2.23.0 (14 findings fixed, report `docs/audit-v2.23.0.md`), workspace tabs, the heat maps' labels and analyst research outside the US. Notes: `docs/release-v2.24.0.md`.

## Since 2.24.0 (on the branch, not released)

1. **WHATSNEW** (`src/functions/WHATSNEW.tsx`, `src/data/releases.ts`): the version and every release's notes inside the app, packed in at build time from `docs/release-v*.md` (2.15.0 and later; older notes named another product and stay out). The installed version is marked; HELP shows the version with a "What's new" action; after an update a one-time notice links to it (`src/terminal/whatsnew.ts`). The app does not ask GitHub for newer versions. Every release still needs its `docs/release-vX.Y.Z.md`; a test fails if a note names another product.
2. **Data fixes** (each with tests in `tests/api-fixes.test.ts` or `tests/iex-engine.test.ts`): CoinGecko answered once for every window (the free plan's calls were spent three times over with three windows); TipRanks calls, cap and answers kept per key; Eurostat flags and BLS series stay current within a session; an answer kept after a failed refresh stays marked stale with its own time; IEX keeps every session seen while a window stays open.
3. **Weekend demo** (`src/data/engine.ts`, tests in `tests/engine.test.ts` under "a weekend"): the demo simulated a trading session every calendar day, so at weekends stocks ticked and HP showed a Saturday row. Markets on a weekday calendar now show Friday's finished session (no ticks or trades, marked CLOSED); crypto trades every day. A real close known for that Friday ends the session.
4. **Portfolio tabs** (owner's request): PORTFOLIO keeps several portfolios as tabs above its Holdings / Performance / Risk views, each with its own holdings, cash, currency and benchmark. + new (name ready to type), double click rename, drag reorder, × close (asks first when it holds anything; the last one stays). Store: `portfolios` in `src/terminal/userdata.ts`; `portfolio` there is now the one on screen, so the other screens did not change. The single portfolio saved before (`armin:portfolio`) becomes the first tab and is never changed. Operations: `src/terminal/portfolio-tabs.ts`. Tests: `tests/portfolio-tabs.test.ts`, an e2e test in `e2e/terminal.spec.ts`.

State at handover: lint, typecheck, 1,266 Vitest tests (98 files), 41 browser and 34 desktop Playwright tests, and the build all pass (run on a Saturday, so the weekend demo was exercised).

## What is left

`docs/TODO.md` is the one list of what comes next, in order, with what is waiting on the owner. Keep it up to date: move an item to "Done" with its commit when it is finished. The owner's feedback of 24 October 2026 (13F portfolios of companies, a congress trade tracker, a review of Codex's API notes, your own layouts, window buttons in the tab bar, corporate events, the watchlist's live session) is in it. That feedback document also held API keys; none of them were stored or committed.

The visual pass (the owner's brief of 25 October 2026) starts from `docs/visual-research-2026-10.md`: colours measured from Bloomberg-published images, a free stand-in for the Terminal's typeface (Bergoom, OFL), layout details of the current window, Launchpad and ASKB, and a chart blur on Windows scaling (`PriceChart.ts`, `XYChart.tsx`).

## The owner's rules (keep them)

- **Real data only.** No invented or simulated values in the desktop app; a labelled blank beats a plausible wrong number. Say where each figure comes from.
- **Never print, log, screenshot or commit an API key.** Keys live in a file outside the repository (e.g. a scratch folder, `chmod 600`) and are passed only as environment variables: `set -a; . <file>; set +a`. The SEC user agent the owner gave is `Armin Shah arminshahw98@gmail.com`.
- **Reference PDFs are copyrighted**: keep them in `reference/pdfs/` (git-ignored); never commit them or text or screenshots copied from them. Describe layouts in your own words and cite the document number and page. The owner has the PDFs and can upload them again; documents 1-33 are listed in `docs/audit-v2.23.0.md` section 2.
- **No branding of the other product** in the app: not its name, logo or login.
- **Windows only** for the desktop app. Ask before any release. Push only to the branch above. No pull request unless the owner asks.
- **Never weaken, skip or delete a test.** Never report as checked anything not run. One commit per fix, with a regression test.
- Commit messages end with the session's attribution lines; no model names in commits, code or docs.
- Write for the owner in plain, short language; they are not always technical.

## How to work on it

```
npm ci
npm run lint && npm run typecheck
npx vitest run --maxWorkers=2                      # unit tests
npm run build
npx playwright test                                # browser e2e (demo data)
# In a cloud sandbox whose Chromium is not the one Playwright expects, first:
#   export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium
xvfb-run -a npx playwright test --config playwright.desktop.config.ts   # desktop e2e (Linux sandbox)
```

Checking screens on live data in a Linux sandbox (the real desktop app, one panel per command):

```
npm run build
echo '["NVDA US Equity FUNDCHART","SPX Index IMAP"]' > /tmp/cmds.json
xvfb-run -a node scripts/live/capture.cjs /tmp/cmds.json /tmp/out 8000 40000
```

It saves each panel's text, a screenshot, its header and any console errors (`/tmp/out/index.json`). With keys: load them into the environment first (see the rules). `scripts/live/fetch_primary.py` fetches figures from the SEC, FINRA, the NY Fed, the ECB, FRED and Nasdaq for independent checks.

Known limits of a cloud sandbox: Yahoo refuses its session there (HTTP 429 on the crumb), so screens that need Yahoo's quote summary can only be checked on the owner's Windows machine; its statements and charts still load.

## Where things are

- Function registry: `src/terminal/registry.ts`; mnemonics (DES → PROFILE etc.): `src/terminal/legacy.ts`; command parsing: `src/terminal/commands.ts`; suggestions: `src/terminal/suggest.ts`.
- Workspace state (panels, layouts): `src/terminal/state.ts`; workspace tabs: `src/terminal/tabs.ts`.
- Live data sources: `src/data/live/` (Yahoo, SEC, Nasdaq, Finnhub, FMP, Alpha Vantage, FRED, Treasury and others); key handling in `electron/providers.cjs` (keys stay in the main process, encrypted with safeStorage).
- Screens: `src/functions/`; shared components: `src/components/`; styles: `src/styles/global.css`.
- Release notes: `docs/release-v*.md`; the release workflow: `.github/workflows/release.yml`.
