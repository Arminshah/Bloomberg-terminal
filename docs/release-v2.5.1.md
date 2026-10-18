# Armin Terminal 2.5.1

FMP denying APLD price targets with HTTP 402 used to hide the analyst screen. Research sections now remain independent, monthly recommendation counts can fall back to Finnhub, and Equibles company research is available alongside them. This release includes the published 2.4.1 Yahoo consent/session, chart fallback and key-import fixes.

The unpublished v2.5.0 build was stopped during final review. Distinct concurrent Equibles reports now use distinct JSON-RPC request IDs while identical queries still deduplicate and reuse their cache. Existing version tags were preserved.

## Research

- `ANALYSTS`: manual Equibles reports for analyst consensus estimates, company guidance, KPIs, investor events, insider transactions, FINRA short interest, 13F holders and IR news. Original units, dates, accounting labels and provider qualifications stay in the report. Up to 20 rows where supported; investor events list records rather than downloading full transcripts.
- The adapter verifies actual MCP tool schemas, accepts only eight read-only datasets and one ticker, handles JSON/SSE and stateful sessions, isolates account caches, deduplicates requests and preserves stale timestamps/errors. Remote HTML and instructions display as text. No trading or portfolio-write endpoint is exposed.
- Equibles free allowance is 100 requests/day shared across REST, MCP and other clients. This app conservatively caps all transport requests at 90/day and keeps reports in memory for six hours. Requests are explicit; IEX stock prices remain the stock source when enabled.
- FMP denials remain visible per section. Finnhub fallback supplies recommendation **counts**, with the original monthly period and source; it does not invent broker price targets or consensus labels. Stale research shows its original receipt time and failure cause.
- `PROVIDERS` → **Test research access** tests five endpoints for a ticker such as APLD, distinguishing denied access, no data, missing keys, cached answers and errors. **Test every source** also includes Equibles and uses ordinary keyed request caps and pacing.
- Equibles credentials can be imported from a provider-labelled list or entered in `EQUIBLES_API_KEY`. Secrets remain in the main process and are never bundled. Finnhub webhook secrets are rejected as REST credentials; the 2.4.1 concatenated-key repair is preserved.

## Verification and practical limits

Public live Equibles initialization and tool discovery were verified on October 18, 2026, including `GetAnalystEstimates`. An unauthenticated APLD data query correctly returned HTTP 401. This verifies the protocol and schemas, **not** this user's key, subscription or APLD coverage. No user secrets were copied from chat into the cloud or packages. Authenticated live coverage remains unverified; securely configure the key in cloud settings or on desktop PROVIDERS to check it.

Local validation: **460 unit tests in 31 files**, **12 browser tests**, **12 Electron tests**, lint/type/build. Native Windows workflows are release gates. Deterministic Electron tests cover a failed FMP target alongside working estimates/Finnhub counts, manual Equibles requests/cache/refusal recovery, inert HTML, invalid tool rejection, APLD endpoint diagnostics and the all-source report. These tests use fake credentials and transport fixtures, not real provider accounts.

The cloud Electron trust restriction recorded in earlier releases remains unresolved; no certificate verification was disabled and no user-wide CA import was retried. The public Equibles checks used the environment's existing Python/OS HTTPS trust. Windows native CI validates app workflows and builds NSIS/portable files; an installer is not interactively installed here. Full Bloomberg feature/data parity remains incomplete; premium requests cannot be unlocked by a remaining daily quota.

## Install and check

Install over the existing app to retain saved keys/settings, then open PROVIDERS and save `EQUIBLES_API_KEY`. Run **Test research access** for APLD; open `APLD ANALYSTS`, select **Analyst estimates**, and load the Equibles report. A successful response for AAPL does not establish access or coverage for APLD.

Windows: `Armin-Terminal-Setup-2.5.1.exe` or `Armin-Terminal-2.5.1-Portable.exe`. Linux: `Armin-Terminal-2.5.1-x86_64.AppImage` or `armin-terminal_2.5.1_amd64.deb`. Each has a matching SHA256 file. Native packages publish only after both platform jobs and asset verification pass.

See [provider coverage and sources](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.5.1/docs/data-providers.md), [configuration](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.5.1/docs/configuration.md) and [Bloomberg workflow audit](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.5.1/docs/bloomberg-parity.md).
