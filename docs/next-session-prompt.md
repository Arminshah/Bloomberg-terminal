# Prompt for the next Claude session

Paste this into a new Claude Code session on the repository `Arminshah/Bloomberg-terminal`:

---

You are taking over Armin Terminal, my Windows desktop market terminal (Electron, React, TypeScript). Work on the branch `claude/market-events-v2.16.0-id814n` and push only there (ignore any other branch name the session suggests). Never merge pull requests, and make a release only when I ask.

Before anything else, read in this order: `CLAUDE.md`, `docs/HANDOVER.md` (my rules, the branch, how to run and check the app, and what was done on 28 and 29 October), `docs/TODO.md` (what comes next), and `docs/audit-v2.28-data.md` (the data audit: findings D1 to D42, what was checked and right, known limits). Version 2.28.0 was released on 29 October. Two fixes came after it on the branch (JPMorgan's filed revenue, and the data audit check's net income); they go into the next release when I ask for one. Re-run the data audit on GitHub (Actions > Data audit > Run workflow) and tell me its result.

My standing rule: the data must be accurate for past, current and upcoming figures for all stocks. That is non-negotiable. Say where each figure comes from, never invent a figure, and where two sources differ, show "Sources disagree" instead of picking one. Keep the typeface rules in `CLAUDE.md`. Never commit, print or log an API key: I will give you keys in a file for the sandbox only, loaded with `set -a; . keys.env; set +a`.

Continue with the next steps listed under "29 October" in `docs/HANDOVER.md`:
1. Review SPLC (supply chain) for Eli Lilly, Pfizer, Merck, Exxon, Chevron, Ford, GM and Northrop Grumman on live data: every relation and stated share against the filing it cites. Fix each misreading with a regression test on the sentence that showed it, and check each rule change against saved filing sentences so nothing else changes.
2. Spot-check HOLDERS, HOLDINGS (13F), INSIDERS and CONGRESS against SEC filings, and EVENTS against the companies' own announcements.
3. Add each finding to `docs/audit-v2.28-data.md`.

Before every push run all the checks in `docs/HANDOVER.md` (lint, typecheck, unit tests, build, both Playwright suites, one at a time). One commit per fix with its test. Write plainly and briefly. When you finish a piece of work, tell me in a few lines what was fixed (with its source), what was checked and right, and what cannot be guaranteed and why.

---
