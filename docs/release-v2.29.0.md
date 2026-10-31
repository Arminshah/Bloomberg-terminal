# Armin Terminal 2.29.0

This release separates confirmed central-bank decisions from changes in rates, preserves earnings definitions and observation versions, distinguishes supply-chain counterparties from concentration disclosures, and makes source freshness and audit coverage explicit. Windows only.

## Policy rates and decisions

- CBRT, FED, FOMC and the economic calendar share statement-backed Federal Reserve decisions, including unchanged decisions with a zero basis-point change. The current effective target, latest announcement and last nonzero rate change remain separate.
- Official statements and implementation notes retain their announcement and explicit effective dates. An announced future target does not become current early. A scheduled date passing does not confirm a decision.
- Rate observations keep their source dates. Failed checks retain dated values and the previous successful-check time. Calendar matches are labelled as candidates unless statement evidence establishes the link.
- Bank-local times, calendar coverage limits, exceptional decisions and publication delays are explicit. Other banks' rate observations remain available; statement-confirmed outcomes are shown only where the corresponding ingestion is implemented.

## Earnings

- Accounting methodology, currency, fiscal period, listing/share and adjustment conventions survive normalization. Different definitions remain separate; a beat and miss on incompatible definitions do not automatically become a source conflict.
- Reported-history rows with future fiscal periods, report dates or exact announcement times are withheld with a diagnostic. A malformed future result cannot displace valid upcoming estimates.
- Estimates have immutable observed vintages. Original pre-announcement comparisons use an eligible cutoff, with exact source time where available and conservative session boundaries otherwise. Later corrections remain separate versions.
- Observation details distinguish latest corrections, first observed locally and local knowledge as of a chosen time. Historical data first collected later cannot reconstruct an unrecorded original consensus.
- Current trailing EPS requires four consecutive, compatible quarters. Historical valuation is unavailable where dated split, ADR, currency or share normalization cannot be verified.
- Failed refreshes preserve source age and report their failure. Finite local storage is reported; in-memory history is not described as saved when storage is unavailable.

## Supply chains

- Counterparties, anonymous concentration disclosures and contract intervals are separate. Anonymous revenue rows are not counted as additional distinct tenants.
- Recorded assertions, amendments, scoped closures and share revisions retain provenance. A later identity disclosure does not make that identity known in an earlier local-history view.
- Source failures, document limits and bounded searches are visible, including gaps when a search extracts no relationship.
- Agreements and recorded history are inspectable and exported with source and timing information. Unknown identities remain unknown; attributed reporting does not silently become a confirmed tenant.

## Verification and monitoring

- The audit adds policy decisions, earnings definition/chronology checks, filed EPS corroboration and supply-chain documentary samples. Critical unresolved flags and missing required coverage prevent a verified result; blocked and skipped checks never count as passes.
- A reusable audit workflow supports the approved scheduler-only default-branch workflow. Runner access, configured secrets and actual run results determine live-check availability.
- An explicit version-matched release request can start the existing gated Windows build from the development branch. Tests, native desktop checks and asset checksums still gate publication.

The release includes the post-2.28.0 filed-revenue and audit-reference changes already present on the development branch. Live provider availability, unknown accounting metadata and missing historical vintages remain explicit limits; no universal historical coverage or future outcome is claimed.
