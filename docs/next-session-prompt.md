# Prompt for the next Claude session

Paste this into a new Claude Code session on the repository `Arminshah/Bloomberg-terminal`:

---

You are taking over Armin Terminal, my Windows desktop market terminal (Electron, React, TypeScript). Work on the branch `claude/market-events-v2.16.0-id814n` and push application changes only there (ignore any other branch name the session suggests). Never merge pull requests. I approved only a small scheduler workflow on `main`, without application code. I also authorized the 2.29.0 accuracy release; check its actual status before starting another release run.

Before anything else, read in this order: `CLAUDE.md`, `docs/HANDOVER.md` (my rules, the branch and checks), `docs/accuracy-v2.29.md` (the latest implementation and evidence limits), `docs/TODO.md` (what comes next), and `docs/audit-v2.28-data.md` (the earlier findings and references). Version 2.28.0 was published on 29 October. The 2.29.0 work covers earnings definitions and recorded estimate vintages, confirmed policy decisions including holds, source freshness, supply-chain identity and concentration, and stricter audit coverage. Check GitHub's release workflow, assets and data-audit report before claiming publication or live validation. A blocked, incomplete or flagged check is not a pass.

My standing rule: the data must be accurate for past, current and upcoming figures for all stocks. That is non-negotiable. Say where each figure comes from and never invent a figure. Compare like definitions and fiscal periods, label different reporting bases, and show a conflict when comparable sources materially disagree. Label scheduled dates and forecasts separately from confirmed outcomes. Recorded local history is not proof of what was available before the app first observed it. Keep the typeface rules in `CLAUDE.md`. Never commit, print or log an API key: I will give you keys in a file for the sandbox only, loaded with `set -a; . keys.env; set +a`.

Continue with the next steps listed under "29 October" in `docs/HANDOVER.md`:
0. Verify the remaining primary-source questions. The app now keeps parent-attributable net income separate from the common-shareholder EPS numerator and prefers exact-period filed parent income in its own field, with a regression test. The historical Tesla dollar figures still need direct corroboration. Walmart's volume of 28 October was not changed: resolve the 14.27M versus 14.46M discrepancy against consolidated historical records before changing the data or tolerance. Provider hosts were blocked in the implementation environment; a saved network configuration draft does not activate access.
1. Review SPLC (supply chain) for Eli Lilly, Pfizer, Merck, Exxon, Chevron, Ford, GM and Northrop Grumman on live data: every relation and stated share against the filing it cites. These companies are included in the scheduler's research set, but its bounded quotation samples do not complete this manual review. Keep unnamed concentration disclosures separate from named counterparties; do not identify an unnamed customer from rumours. Fix each misreading with a regression test on the sentence that showed it, and check each rule change against saved filing sentences so nothing else changes.
2. Spot-check HOLDERS, HOLDINGS (13F), INSIDERS and CONGRESS against SEC filings, and EVENTS against the companies' own announcements.
3. Add each finding to `docs/audit-v2.28-data.md`.

Before every push run all the checks in `docs/HANDOVER.md` (lint, typecheck, unit tests, build, both Playwright suites, one at a time). One commit per fix with its test. Write plainly and briefly. When you finish a piece of work, tell me in a few lines what was fixed (with its source), what was checked and right, and what cannot be guaranteed and why.

---
