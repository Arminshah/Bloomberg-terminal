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

The default-branch scheduler is active and its installation-triggered run executed. As of 30 October 06:44 UTC, GitHub's public schedule-event history showed no automatic cron execution. The configured schedule and an observed scheduled execution are distinct operational claims.
