# Live accuracy follow-up, 30 October 2026

Release 2.29.0 and normal CI passed their software checks. The independently run live audit remained incomplete. Run [40951008804](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/40951008804) reported 559 passes, six failures, four unresolved flags, five blocked checks, three incomplete results and 87 skips.

| Finding | Observed evidence | Follow-up |
| --- | --- | --- |
| Tesla annual net income | Screen/reference: 12,583/12,556 million for 2022 and 7,130/7,091 million for 2024 | Standard statement readers exclude proxy-context facts that can otherwise replace annual-report facts. Parent income and common EPS numerators remain separate. Synthetic annual, amendment and cumulative-quarter regressions reproduce the path. Live figures require a new run. |
| Lilly 52-week high | Screen 1,408.38; Tiingo reference 1,321.21 | A quote-correction cache defect and an unmatched-session reference fallback were independently reproduced. Both are corrected. Neither quoted high is declared authoritative without new dated corroboration. |
| Three APLD documentary checks | Sumitomo Mitsui Banking evidence failed exact quotation checks in the May 2026 annual and two preceding quarterly reports | The checker inserted spaces into inline XBRL and decoded fewer entities than the extractor. Canonicalization is corrected without accepting changed words or values. New diagnostics retain the unmatched quotation; a new run must establish whether this explains these three failures. |
| Lilly share counts | Yahoo market-implied 891.74 million; cover disclosure 940.75 million as of 26 October, filed 29 October | Warning remains unresolved. Captures now preserve measure-aware numeric alternatives and their dates. Current-price market-value sensitivities are explicitly distinguished from evidence resolving share definitions. |
| Access and coverage | Massive HTTP 429, Fed HTTP 403, no Tesla dividend reference, partial research coverage | Requests are paced and audit entry points serialized. Unavailable evidence remains blocked/incomplete. No absence is promoted into a proven zero. |

The audit also rejects inconsistent OHLC reference bars, keeps splits after the captured session out of historical normalization, and withholds EOD-only range comparisons while a session is trading. Quotation list context is separate from source text; original archived evidence is preserved with its parser version.

Local validation completed on 30 October: lint, type checks, production build, 1,808 unit tests in 175 files, 94 browser checks and 76 fixture-based Electron desktop checks all passed sequentially. The 2.29.1 publication request is held until the fresh live audit findings are reviewed. Software checks alone do not resolve the six observed live failures.

Public report annotations are limited to eight detail chunks plus one summary, each at most 3 KiB. Failure priority and explicit omission counts remain; full reports are in the signed-in run summary. Credentials and workflow command characters are sanitized.

No comparison tolerance was widened, and no reference price or Walmart volume was replaced to make a check pass. The 28 October Walmart volume discrepancy, full eight-company relationship review and the ownership/insider/Congress/EVENTS primary-source checks remain evidence work. The environment still blocks direct publisher hosts. Passing regression tests proves the reproduced safeguards; it does not independently corroborate every live figure.

The default-branch scheduler was triggered by a schedule event on 30 October at 07:42 UTC: run [41021723864](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41021723864). GitHub prevented the job from starting, citing account payments or its spending limit. This establishes that scheduling triggered, but no audit executed in that run. The owner subsequently made the repository public again; a new run must establish whether runner access is restored.


## Candidate audit and continuation

The candidate at `ecd1125` passed ordinary CI ([41016873777](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41016873777)). Its separate live audit ([41016869012](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41016869012)) reported 617 passes, six failures, five flags, two blocked checks, three incomplete results and 31 skips. All 16 unresolved findings were available in its public annotations.

The six failures were the two Tesla income comparisons above, Walmart's 29 October open (120.83 versus 120.74) and volume (15.84 million versus 16,048,288), Coca-Cola's volume (15.38 million versus 15,872,118), and Tesla's open (405.94 versus 405.625). The earlier Lilly high and three APLD quotation failures were absent from the failure list. That absence does not prove that those exact earlier observations were rechecked and passed.

The continuation addresses the remaining reproduced code paths:

- Select exact-period filed parent income before the general statement-conflict gate. Keep the common-shareholder EPS numerator separate. Preserve provenance through quarter sums and trailing observations; withhold parent-income margins when the remaining statement basis is unresolved.
- Capture visible financial periods and their basis warnings for the auditor. A corroborated dollar amount does not erase a separate basis warning.
- Corroborate earnings using the actual's exact fiscal end and currency when the screen row has a calendar label. Do not choose another quarter or derive quarterly EPS by subtracting annual and cumulative values.
- Attach same-day and previous-available-day Tiingo, unadjusted Massive and Nasdaq observations to open/volume failures. Record source identity and adjustment limits. These are diagnostic references; they do not replace prices, relax tolerances or change a failed comparison into a pass.

Direct publisher requests in this continuation still failed at the environment proxy before reaching SEC, Tiingo, Massive or Nasdaq. A source access failure is not an authentication diagnosis. Historical figures and the new diagnostic source joins require a fresh live audit. Publication remains held; the release request still names `v2.29.0`.


The continuation's final local checks passed sequentially: lint, type checks, production build, 1,830 unit tests in 178 files, 95 browser checks and 76 fixture-based Electron desktop checks. Existing assertions were preserved. The new white-marker regression verifies uniform geometry at 100%, 125% and 150% display scaling, fractional table positions and widths, and viewport resizing; generated close-ups of both range columns were inspected. This does not replace live-source corroboration.
