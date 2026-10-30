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

## Fresh public-repository run

At `d2c8c0e`, [CI 41028238433](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41028238433) passed, including the native Windows desktop checks. The separate [live audit 41028233779](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41028233779) ran and reported 620 passes, five failures, five flags, two blocked checks, 12 incomplete results and 31 skips. Making the repository public restored runner execution for these runs. The earlier billing annotation describes the earlier scheduled run only.

The five failed comparisons were:

| Figure, 29 October 2026 session | Displayed | Reference | Allowed difference |
| --- | --- | --- | --- |
| Tesla open | 405.94 | 405.625 | 0.2028125 |
| Walmart open | 120.83 | 120.74 | 0.06037 |
| Walmart volume | 15.84 million | 16,048,288 | 160,482.88 |
| Coca-Cola volume | 15.38 million | 15,872,118 | 158,721.18 |
| NVIDIA market value | 5.16 trillion | 5,020,789,150,000 | 100,415,783,000 |

Tiingo and unadjusted Massive agreed on the disputed opens and approximately agreed on the volumes. This corroborates the reference observations, without yet establishing why the app differs. The Nasdaq diagnostic was cut off in some public rows. Public detail should put the failed field and displayed day first, with full observations retained in the report.

The two Tesla income failures and the NVIDIA filed-EPS incomplete result were absent from the new unresolved list. Public annotations do not expose individual passing rows, so this does not independently certify those exact former cells. Ten financial-basis warnings remain explicit, alongside two incomplete supply-chain captures. The Lilly share-definition conflict, inaccessible Fed announcement and absent Tesla dividend reference remain unresolved. A matching parent-income amount does not reconcile the remaining statement basis.

The next diagnostics observe only Yahoo responses the app already requests and preserve the displayed quote's source and clocks. They must distinguish provider values, engine updates and capture timing before a runtime quote fix is selected. The observer bounds response size, read time, concurrent reads and retained observations; it stores whitelisted market fields without authentication data. Records completed after the DOM capture are excluded. Minute bars are labelled with their interval and timestamp.

A separate reproduced market-value defect derived shares using a current market value and previous close. Profile share selection now uses a current price and market value from the same provider response, selected before fallback fields are merged. A Nasdaq fallback market value cannot be paired with a Yahoo price. Explicit reported counts remain available when no current pair exists. Share provenance preserves the original app-observation clock; missing publisher dates stay unknown. The role of this defect in the NVIDIA failure remains unproven.

Financial-basis captures now retain the exact conflicting field names, raw monetary values, periods and available SEC concepts, filing dates and source links. The warning refers to other statement lines, since common income, operating income or gross profit can trigger it even when revenue agrees. The warning and withheld margins remain until the source bases are reconciled.

No tolerance or reference value is changed, and 2.29.1 publication remains held. An audit captured during regular trading deliberately skips end-of-day open/volume comparisons when no completed reference session is available. Such skips do not resolve the 29 October failures above.

Local checks for the source-observation follow-up passed sequentially: lint, type checks, 1,851 unit tests in 180 files, production build, 95 browser checks and 76 fixture desktop checks. The first unit attempt found an invalid new ADR fixture referencing a security outside the built-in list. An explicit synthetic receipt fixture corrected that input, with additional share-unit assertions; all checks then passed. The fresh live source evidence remains a separate requirement.

## Settled-volume readiness

A separate scheduler review reproduced a delay in the existing settled-volume route: a stock opened at second 61, just after the minute poll, could wait until second 120 for its first Nasdaq request. A capture taken after 12 seconds could therefore precede that request even with history already loaded. This establishes a scheduling gap; it does not establish the cause of the earlier Walmart or Coca-Cola mismatches.

The service now reacts to panel and watchlist additions and to engine changes for visible stocks, coalescing checks within 100 ms. History becoming available can start the existing request immediately. Empty clock notifications and unrelated securities do not schedule checks. The finished-session rule, Nasdaq source, 30-minute spacing, four-attempt session limit and periodic retry remain. Stopping the service removes subscriptions, cancels queued work and prevents late answers from changing the engine.

This timing patch passed the complete sequential local checks: lint, type checks, 1,858 unit tests in 181 files, build, 95 browser checks and 76 fixture desktop checks. Those results precede the further DES and reported-operating-income changes below.

## Intraday audit at `37b8241`

[CI 41065482940](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41065482940) passed, including native Windows desktop checks. [Live audit 41065471341](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41065471341) reported 550 passes, three failures, five flags, two blocked checks, 13 incomplete results and 103 skips. All 23 unresolved rows were visible in public annotations, although one long candidate row was truncated. The run captured regular trading; its count cannot be compared directly with the earlier completed-session audit as a measure of improved accuracy.

| New failed comparison | Displayed | Reference | Allowed difference |
| --- | --- | --- | --- |
| Exxon previous close | 183.18 | 183.29 | 0.036658 |
| Lilly previous close | 1,373.00 | 1,373.70 | 0.27474 |
| Tesla YTD return | -12.66% | -12.5522547363% | 0.1 percentage point |

The earlier opens and volumes remain unverified by this intraday run. NVIDIA market value was absent from the unresolved list; individual passing comparisons are not available in the public annotations, so that absence alone does not certify the earlier exact observation.

The new financial evidence identifies operating-income differences behind the ten earlier basis warnings. Examples, in raw USD: Coca-Cola FY2024, Yahoo 14,022,000,000 versus SEC 9,992,000,000; Tesla FY2024, 7,760,000,000 versus 7,076,000,000; NVIDIA FY2023, 5,577,000,000 versus 4,224,000,000. A separate new Exxon LTM warning records quarterly revenue of 114,529,000,000 versus 116,017,000,000. The parser maps Yahoo's operating-income field literally; no application EBIT substitution was found. The provider also supports a distinct `TotalOperatingIncomeAsReported` field. Exact expense exclusions behind the differing observations remain unverified.

DES had an independently reproduced update defect: its profile subscribed to every fifth clock tick, while its price child subscribed to quote updates. A network update between ticks could therefore show a new price alongside an old YTD return. The profile now subscribes to quotes, and return captures retain the actual price, year-end base and dates. The observed Tesla comparison still requires new corroboration. All failed quote comparisons now receive capture provenance. Previous-close diagnostics retain both spark previous-close fields, available quote change fields and the daily-history closes; the engine's selection rule is unchanged. Tolerances remain unchanged.

The statement request now includes Yahoo's distinct `TotalOperatingIncomeAsReported` field for annual, quarterly and trailing periods. A finite reported value in the same period and currency is selected for operating income and its basis comparison. The original `OperatingIncome` value remains a separate captured alternative. An absent reported field keeps the existing comparison; a reported value that still disagrees with SEC preserves the warning and withheld margin. Zero and negative operating results remain valid observations. Existing whole-statement filed-basis selection takes precedence, and no adjacent-period or currency substitution is allowed. The next live run must establish which reported fields actually arrive and agree.

The combined follow-up passed all local checks sequentially: lint, type checks, 1,868 unit tests in 182 files, production build, 95 browser checks and 77 fixture desktop checks. The new desktop regression changes a provider quote between engine clock ticks and verifies that the displayed price and YTD refresh together with an unchanged tick counter. These software results do not certify the remaining previous-close discrepancies or the earlier completed-session figures. Publication remains held.
