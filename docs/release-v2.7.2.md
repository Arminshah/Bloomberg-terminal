# Armin Terminal 2.7.2

Stock lookup and analyst research recover when an optional company profile is missing or a primary research provider refuses a request. SEC reported figures now default to the latest monetary reporting currency, rather than the currency with the largest historical archive.

## Stock lookup and research

- Preserve complete Finnhub REST API keys. Older builds incorrectly shortened some valid 40-character keys. **Re-save the complete key on PROVIDERS after upgrading if Finnhub reports 401.** Previously shortened saved values cannot be reconstructed. Explicit webhook-secret entries remain rejected; environment variables take precedence over saved credentials.
- A stock with valid listing metadata and price history can open without a company profile or share count. Missing fundamentals remain unavailable. Search can fall back to the SEC ticker directory; the listing is checked against actual Yahoo chart metadata when opened.
- If FMP cannot supply research, ratings try Finnhub, then Yahoo can supply current price targets, recommendation snapshots, rating actions and annual estimates. One shared Yahoo request supplies four sections, with a separate `YAHOO_RESEARCH_ENABLED` switch. Fresh primary-provider data is retained when available.
- Source labels, currencies, fiscal end dates and receipt times remain attached to each dataset. Yahoo's relative recommendation periods stay relative; negative/zero EPS estimates remain intact. Revenue and EPS keep separate provider currencies: live Toyota research reports JPY revenue with USD EPS, and SAP reports EUR revenue with USD EPS. Target-history averages are not fabricated from current targets or rating actions.
- A concise research-coverage summary replaces repeated error blocks; full provider refusals remain in the expandable source table. If structured annual estimates are absent, one Equibles estimate report loads automatically. Other reports stay on request, within existing cache and quota limits.
- Rejected credentials pause repeated requests for five minutes, scoped to that credential. Replacing a key permits an immediate retry. Entitlement denials pause only the exact request, not every company or endpoint.

## SEC financial figures

- Select the currency with the newest monetary reporting period, with filing recency and coverage breaking ties. The live NBIS response contains USD figures through FY2025; the previous archive-size rule selected RUB, whose monetary figures stop in 2023.
- Historical currencies remain selectable, with their last reporting periods shown. Currency-free share counts no longer create misleading later columns when an old monetary currency is selected.
- Show the latest annual and standalone quarterly income periods explicitly. NBIS's current company-facts response has annual revenue through 2025, with no standalone quarterly revenue series. Newer 6-K documents are linked separately; missing quarters are not filled with annual amounts or estimated figures. Older quarterly coverage is flagged, quarter views stop extending empty annual columns after quarterly tagging ceases, and the screen links to financial analysis as a separately labelled source.
- Require annual-filing or explicit fiscal-year evidence before treating a twelve-month flow as a fiscal year. This excludes quarterly trailing-twelve-month disclosures, confirmed in the live Amazon response.

## Provider status and diagnostics

- The streaming row follows actual socket events, including direct renderer connections. A connected socket does not claim a newly delivered trade. The header identifies price transport rather than claiming every provider is connected.
- Provider names and states remain visible during horizontal scrolling; descriptions wrap and detailed source links expand on demand. Older resolved problems are identified as previous problems.
- Treasury annual exports get a longer bounded timeout. A failed current-year refresh retries after one, two, then at most five minutes; recovery clears the feed error. Historical-year downloads cannot conceal current-year failure.
- Request ECB data explicitly as CSV and reject blank observations. Select an actual percentage-rate observation in the NY Fed self-test rather than passing an index with an unknown rate.
- If the Federal Reserve all-press RSS feed fails, try its official monetary-policy feed and label that narrower coverage. Empty/malformed Yahoo HTTP 200 responses no longer pass the stock-data self-test; stock search and APLD research checks are included.

## Validation and limits

Local verification passed: lint, TypeScript, production build, **543 unit tests in 41 files**, **17 browser workflows**, and **20 Linux Electron integration workflows**. The desktop fixture now waits for its actual file document before accessing storage, eliminating an initial about:blank race. Native Windows checks and package verification are recorded on the published release. Deterministic Electron tests use synthetic responses and disposable profiles, not owner API keys. Separately, live public HTTPS checks verified Yahoo APLD search/chart/research, SEC NBIS facts/submissions, ECB formats, Fed feeds, New York Fed reference rates and the Treasury CSV. Production parsers read actual SEC responses for AAPL, MSFT, NVDA, AMZN, TSLA, BRK-B, JPM, ASML, BABA, SAP, TM, NVO, SONY, NBIS and APLD; and Yahoo research for APLD, MSFT, ASML, BABA, NVO, TM and SAP. This covers US GAAP/IFRS, differing fiscal-year ends, currency changes and separate EPS/revenue units. It is a sample check, not a claim of universal dataset access.

Public SEC sample, checked 18 October 2026 through the production parser. Dates below describe the tagged dataset; newer documents can exist separately.

| Ticker | Currency | Latest fiscal year end | Latest tagged standalone quarter |
| --- | --- | --- | --- |
| NVDA | USD | 2026-01-25 | 2026-07-26 |
| AAPL | USD | 2025-09-27 | 2026-06-27 |
| MSFT | USD | 2026-06-30 | 2026-03-31 |
| AMZN | USD | 2025-12-31 | 2026-06-30 |
| TSLA | USD | 2025-12-31 | 2026-06-30 |
| BRK-B | USD | 2025-12-31 | 2026-06-30 |
| JPM | USD | 2025-12-31 | 2026-06-30 |
| ASML | EUR | 2025-12-31 | Not present |
| BABA | CNY | 2026-03-31 | Not present |
| SAP | EUR | 2025-12-31 | Not present |
| TM | JPY | 2025-03-31 | 2020-12-31 |
| NVO | DKK | 2025-12-31 | Not present |
| SONY | JPY | 2025-03-31 | Not present |
| NBIS | USD | 2025-12-31 | Not present |
| APLD | USD | 2026-05-31 | 2026-08-31 |

The cloud's Electron HTTPS path remains blocked by its certificate authority configuration. These public checks used normal OS HTTPS verification and do not constitute live Windows/account validation. Subscription access, issuer coverage, provider delays and free-plan quotas remain source constraints. Yahoo endpoints are unofficial; IEX covers one exchange; options are indicative. Bloomberg feature and data parity remains incomplete.

Windows: `Armin-Terminal-Setup-2.7.2.exe`, `Armin-Terminal-2.7.2-Portable.exe`. Linux: `Armin-Terminal-2.7.2-x86_64.AppImage`, `armin-terminal_2.7.2_amd64.deb`. Each package has a SHA256 sidecar. Existing settings and saved keys are retained on upgrade; the Finnhub re-save step above is still necessary for a previously shortened value.
