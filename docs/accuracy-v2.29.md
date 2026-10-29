# Accuracy remediation, 29 October 2026

Version 2.29.0 addresses definitions, chronology, evidence and failed refreshes in the policy, earnings and supply-chain workflows. Checks use deterministic publisher fixtures and explicitly synthetic chronological scenarios. A fixture check is not a live-provider coverage claim.

| Problem | Implementation | Main regression evidence |
| --- | --- | --- |
| A hold vanished because CBRT listed only rate changes | Shared published decisions, explicit effective targets, last nonzero changes and dated observations | policy-decisions, policy-chronology, policy-calendar, policy-screens and desktop IPC |
| Retained values looked freshly confirmed | Per-dataset attempts and successful checks, original source dates and errors | freshness-provenance, fred-provenance, earnings-calendar-history |
| Different EPS definitions became generic source conflicts | Preserved methodology, equivalent-definition comparison and retained alternatives | consensus, earnings-evidence, accuracy-assurance |
| Estimate revisions destroyed earlier observations | Append-only observed vintages, announcement cutoffs and original-local/latest/as-of views | earnings-evidence |
| A provider's reported-history response included a future result | Future fiscal periods, report dates and exact announcement times are withheld before they can affect reported or upcoming comparisons; diagnostics remain visible | earnings-chronology |
| Historical results were assumed immutable | Budgeted correction checks and a separate observation journal | earnings-calendar-history, estimate-history |
| Incompatible quarters formed trailing denominators | Four consecutive compatible quarters; unknown dated normalization leaves historical valuation unavailable | earnings-evidence |
| Concentration rows inflated counterparty counts | Separate counterparties, concentration observations and contract intervals | supply-chain-own, supply-chain-history |
| Termination or one loan repayment closed the wrong relationship | Scoped, dated assertions; unscoped closure remains unresolved | supply-chain-history |
| Failed searches looked like complete empty results | Failed/capped source coverage and dated records retained after refresh failure | supply-chain-history |
| Warnings/omissions coexisted with an unqualified green audit | Required scope, documentary corroboration versus invariants, incomplete assurance result | accuracy-assurance |
| Parent income and the common-shareholder EPS numerator were conflated | Exact-period filed parent income has priority in its own field; the common-shareholder measure stays separate | financial-completeness |
| Archive storage failures were silent | Persistence health and session-only warning, without dropping observed versions | observation-persistence |

The release workflow gates publication on type/lint/unit/browser checks, native Windows desktop tests, installer/portable generation and asset checksums. A version-matched explicit release request can start it from the development branch; ordinary pushes do not publish. The default-branch scheduler is a separate, user-approved workflow-only commit. No application merge into main is authorized.

## Validation completed locally

On 29 October 2026, lint, TypeScript checks and the production build passed. All 1,784 unit tests in 168 files, 94 Chromium browser checks and 76 Electron desktop checks passed. These ran sequentially; the desktop suite used Linux under Xvfb with controlled provider fixtures. It includes the confirmed-hold/outage path, separated concentration records and source-paired earnings behavior. Native Windows checks and package verification run separately as release gates on GitHub.

## Scope and remaining evidence limits

- Live market/statistical hosts were blocked by this cloud environment's destination policy during implementation. No supplied API key was independently validated here. The saved network draft needs activation before access changes.
- The reusable scheduled check uses GitHub's configured runner secrets and network. It reports blocked sources, partial extraction, unresolved conflicts and missing required corroboration. The scheduler includes APLD, NVIDIA and the eight handover companies; documentary sampling is not a complete manual relationship audit.
- The remaining eight-company SPLC review and ownership/13F/insider/Congress/EVENTS checks are not completed merely because URLs or samples were fetched.
- The Tesla handover question is resolved at the definition/selection level: parent-attributable filed income and common-shareholder income are independent fields. Historical dollar amounts still require primary-source corroboration. Walmart's competing 28 October volume figures remain unsettled; no value or tolerance was changed to force a pass.
- Fed outcomes require official published statements and explicit implementation evidence. Other banks retain their rate observations and honest statement-coverage limits. Future outcomes are never inferred from a calendar or flat observation series.
- Historical knowledge begins with recorded evidence. Later collection cannot reconstruct an unobserved original consensus, undisclosed identity or missing publication time. Local storage is finite and failure is exposed.
- Required-scope verification does not certify every screen, all historical figures, complete global supply chains or future outcomes.
