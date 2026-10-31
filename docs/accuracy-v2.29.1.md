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

## Latest verified run at `8234588`

[CI 41070636036](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41070636036) passed, including the Windows build and native desktop tests. [Live audit 41070625015](https://github.com/Arminshah/Bloomberg-terminal/actions/runs/41070625015) reported **553 passes, zero numerical failures, five flags, two blocked checks, three incomplete results and 103 skips**. Its exit code is 2 and assurance remains incomplete. All ten unresolved rows were available publicly; one long candidate row was truncated.

The prior two previous-close failures and Tesla YTD failure were absent from this run's failure list. The ten operating-income basis warnings were also absent. Public annotations do not expose individual passing observations, so this does not independently certify each former cell or explain the previous-close source difference. No previous-close selection rule or tolerance was changed.

The remaining findings are:

- Five related Lilly flags preserve the unresolved Yahoo market-implied count of about 890.75 million versus 940.75 million on the SEC cover, with their market-value sensitivities and Massive comparison. Matching the SEC alternative does not resolve the share-definition conflict.
- Exxon's LTM revenue basis remains unreconciled: 114,529 million from the statement feed versus 116,017 million from the filed quarterly observation. Its affected parent-income margin stays withheld.
- Applied Digital and NVIDIA supply-chain source coverage remains partial.
- The Fed announcement reference is blocked by HTTP 403, and neither dividend reference supplies a Tesla record. An absent dividend record is not a proven zero.
- The run captured regular trading. Its 103 skips leave earlier completed-session open/volume discrepancies unverified; the settled-volume scheduling regression does not replace their live corroboration.

The release request remains `v2.29.0`. No 2.29.1 tag or publication was requested. These results establish the checked scope and its limits, not complete accuracy for every security or historical observation.

## Definition review after the latest run

The owner requested continued work on the remaining findings. Normal SEC, Exxon IR and Lilly IR requests remain blocked by the local proxy, and no retained primary filing or quotation was found locally for the revenue or trust definitions. A difference near 50 million shares does not prove which trust or treasury treatment explains it.

The share-conflict renderer now uses the actual recorded share-count provider and method. A reported count is identified as reported; a matched current market-value/price pair is identified as implied. A count whose origin is untracked or no longer matches the recorded observation remains explicitly unknown. Values, conflict thresholds and cover-page eligibility are unchanged. Earlier trust explanations in the historical notes are qualified until primary evidence is retained.

Revenue-conflict diagnostics now expose the selected SEC concept, start/end, filing date and source URL, plus other recognized revenue concepts for exactly the same currency and period. These alternatives use facts already retrieved by the app, with proxy and future observations excluded. The selected amount and concept priority remain unchanged. A matching alternative is diagnostic evidence, not a resolution of the statement basis.

The Fed audit now tries the official press RSS feeds when the calendar cannot provide a published statement link, following the app's existing discovery strategy. RSS establishes a link only. The full canonical statement must confirm the publication date, action and target bounds; its dated implementation note must independently confirm the same target and an explicit FOMC Desk effective date. Metadata and visible publication dates must agree. The target must occur in that Desk instruction or its immediately associated list. Only a matching official response URL and at most one same-document host-canonicalization redirect are accepted. Missing, contradictory or inaccessible bodies remain blocked; an IORB date or a headline cannot establish the effective date. Direct access to these sources remains unestablished locally.

The definition and Fed follow-up passed the full local sequence: lint, type checks, 1,895 unit tests in 184 files, production build, 95 browser checks and 77 fixture desktop checks. Independent review caught and corrected publication-date ambiguity, unrelated implementation-target association and redirect-destination checks before this pass. A missing TypeScript container annotation was corrected without a suppression. Financial selection and tolerance rules remain unchanged; a fresh live audit must establish source availability and definition evidence.

## 31 October: shared-branch sync and primary-source definitions

The owner asked this session to fetch and merge Claude's work before pushing, without rebasing or force-pushing. Revision `6f113a9` was merged by fast-forward. Its portfolio screens, data services, request limits, PEERS exact-value markup and tests are retained. FRONTIER, MPC, FTSE 100 screening and SPLC remain Claude's scope; this continuation does not edit them. Claude will handle the planned 2.30.0 release. Do not publish 2.29.1 or change the existing `v2.29.0` release request from this continuation.

CI `41114423180` passed for `d16fede`, including Windows. Live audit `41114414962` reported **553 passes, zero numerical failures, five flags, two blocked checks, three incomplete results and 103 skips**, with assurance incomplete (exit 2). All three official Fed discovery URLs returned HTTP 403. Exxon's selected quarterly observation was `us-gaap:Revenues`, 1 April to 30 June 2026, filed 3 August, from the company-facts URL for CIK 2115436. No exactly aligned alternative recognized revenue concept appeared. The run occurred before the US close, so its skips did not settle the earlier finished-session questions.

Claude's retained primary-source checks in [accuracy-primary-sources-2026-10-30.md](accuracy-primary-sources-2026-10-30.md) now supersede this continuation's earlier lack of a trust quotation and revenue-line explanation:

- Lilly's 2025 10-K states that its employee benefit trust held 50 million shares at both December 2025 and December 2024, and that these shares are excluded from EPS. Its October 2026 cover count minus 50 million agrees with the market-implied count to normal quote rounding. This supports a qualified definition label. The dated trust disclosure and an unchanged dollar cost do not establish the trust's October 2026 holding.
- Exxon's Q2 2026 statement reports sales and other operating revenue of USD 114,529 million, equity-affiliate income of 893 million and other income of 595 million, totaling 116,017 million. The same `us-gaap:Revenues` concept represents the dimensional sales line and the undimensioned total. Company facts supplies the total, which explains why searching other concepts did not find the sales line. A definition label does not justify combining a revenue line with parent income from another statement basis.
- Nasdaq's historical records corroborated the earlier Walmart, Coca-Cola and Tesla open/volume references. Claude's `5f4eebd` settles a finished session's official open alongside volume and preserves it through later Yahoo polls and history reloads. The specific 30 October session still needs its published Nasdaq record or a fresh completed-session audit.

The Lilly renderer now says **Possible definitional difference** only for the reviewed October cover/accession and an eligible same-provider Yahoo current market-cap/price observation whose gap rounds to 50.00 million at 0.01 million-share precision. That precision gates the explanatory label only; the conflict and reference tolerances are unchanged. The unrounded gap, original counts, observation clocks, full historical quotation, filing links and current-holding limitation remain in its captured evidence. The auditor still reports the warning as flagged, including when the SEC alternative matches its numeric reference. A regression uses the retained live pair of 1,260,239,323,136 divided by 1,414.815, whose implied count differs from the cover-minus-trust arithmetic by about 76 shares.

The Exxon label names **Sales and other operating revenue** against **Total revenues and other income (includes equity-affiliate and other income)**. It applies only to the reviewed XOM issuer, USD quarter, exact start/end, values and August filing accession; derived observations or another filing do not inherit the label. The visible financial note and audit metadata cite the filing, and an LTM sum keeps the original quarter's definition. The actual company-facts URL remains separate from the reviewed filing's archive link. Neither amount is replaced, and the mixed-basis parent margin remains withheld. A fresh live audit must confirm that the current filing metadata qualifies for the label.

The additional Fed guard distinguishes an FOMC decision statement from minutes and strategy publications before reading policy action. A retained calendar links a strategy statement using the same canonical URL shape, so the URL alone cannot prove a new decision. Contradictory publication titles are rejected; an unreadable newer unknown candidate still blocks assurance instead of silently selecting an older statement. Existing publication bodies and effective-date requirements remain.

All checks passed sequentially on the merged branch with these changes: lint, type checks, 1,970 unit tests in 189 files, production build, 97 browser checks and 79 fixture desktop checks. The first new unit run exposed a test-helper HTML apostrophe-decoding omission; correcting the decoder retained the full-quotation assertion, and the complete sequence then passed. The uniform white range-marker and fixed-typeface browser regressions also passed. Independent review found no blocking issue in the three changes. Software checks do not resolve the remaining live-source assurance limits.
