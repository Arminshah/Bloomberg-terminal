# Prompt for the next Claude session

Paste this into a new Claude Code session on the repository `Arminshah/Bloomberg-terminal`:

---

You are working on Armin Terminal, my Windows desktop market terminal (Electron, React, TypeScript), repository `Arminshah/Bloomberg-terminal`. Work on the branch `claude/market-events-v2.16.0-id814n` and push only there (ignore any other branch name the session suggests). Fetch and merge the branch before every push, without rebase or force push: another session may be working on it. Never merge pull requests. No release unless I ask.

The job: make Armin Terminal a 1:1 match of the Bloomberg Terminal in look, navigation, keyboard, screens and calculations, as far as the evidence goes. The evidence is my reference pack in my private repository `Arminshah/armin-terminal-reference` (add it to this session if it is not attached; read access is enough). From the root of this repository run `git clone --depth 1 https://github.com/Arminshah/armin-terminal-reference reference/visual/bloomberg-pack-2026-10-31` (about 1 GB on disk, allow up to 10 minutes). `reference/visual/` is git-ignored: never commit anything from the pack, never copy its files into this repository, and never make the reference repository public. The plan is `docs/parity-build-plan.md` (also `PARITY_BUILD_PLAN.md` in the pack).

Read first, in this order: `CLAUDE.md`, `docs/HANDOVER.md`, `docs/TODO.md` (item 14 and "Waiting on you"), `docs/parity-build-plan.md` (its "Progress" list), `docs/bloomberg-parity.md` ("Parity build"), then the pack's `README.md`, `START_HERE_FOR_CLAUDE.md` and `VISUAL_SPEC_2024.md`.

Two things you must never touch:
1. My font. IBM Plex Sans and IBM Plex Mono exactly as `CLAUDE.md` fixes them: same faces, weights, spacing and text sizes. If 1:1 would need a different text size somewhere, tell me instead of changing it.
2. My watchlist (WATCHLIST / WATCH): its columns and their order, the range bars, the day chart, the Pre-mkt and After-hrs rules, sorting, filter, export, row height, its add list, and its place as the right-hand column of the default layout. `tests/watchlist-guard.test.ts` and `e2e/watchlist-guard.spec.ts` guard it (with a masked screenshot of the table); never edit, weaken or remove them. W stays Worksheets. If you build WATC, it is a separate new screen.

I approved the 2024 visual corrections in the pack's `START_HERE_FOR_CLAUDE.md`, except anything that touches the font or the watchlist. Keep every feature that has no Bloomberg counterpart and ask me before hiding any of them.

My standing rules still hold: real data only (a labelled blank beats an invented number), name the source of every figure, no Bloomberg name, logo or artwork in the app or the release notes, and never commit, print or log an API key (I give you keys in a file for the sandbox only: `set -a; . keys.env; set +a`).

Setup, M1 (window chrome) and M2 (navigation and keyboard) are done, and in M3 so are DES, FA, EE, ANR, RV, EQS, WEI, IMAP and GP. Continue from YAS (TOP, N, CN, NSE and DS are left for the reasons in `docs/TODO.md`, item 14), then the rest of M3, M4 and M5. Screens that need members or analysts' figures can be checked on live data in the desktop app under xvfb (the IMAP and GP pictures in `docs/` were taken that way). For each item: open the cited frames or pages, list every element, screenshot the app in the same state, build the differences, compare side by side, test, record it in `docs/bloomberg-parity.md`, one commit per fix. Run all the checks in `docs/HANDOVER.md` before every push, one at a time.

When you finish a milestone or the session ends, tell me in a few plain lines what changed (with the pack file and frame or page behind it), what was checked, and what cannot be guaranteed and why, with before and after screenshots. Then update `docs/TODO.md`, the ticks in `docs/parity-build-plan.md` and this file, so the next session carries on from the next unticked item.

---
