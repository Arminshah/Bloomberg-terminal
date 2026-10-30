# Armin Terminal 2.29.1

This release fixes financial statement selection and quote corrections found while following up the live data audit. It retains the policy, earnings and supply-chain improvements in 2.29.0. Windows only.

- Proxy compensation disclosures cannot overwrite standard financial-statement figures or create statement periods. Genuine amendments remain available, and raw research data stays separate.
- Same-session corrections can lower a previously reported high or raise a low. Range statistics now recalculate when the underlying quote changes.
- Share-count conflicts expose dated numeric alternatives, including the distinction between shares and market-value sensitivities. An alternative matching a reference does not resolve a share-definition conflict.
- Filing quotation checks preserve inline XBRL text and source entities. Competitor-list context is stored separately from the actual quotation and exported with it.
- The audit requires the same completed reference session for rolling analytics, validates reference OHLC data, and excludes corporate actions after the captured session. Intraday ranges remain unverified by an EOD-only reference.
- Direct and scheduled audits share the provider budget. Public findings use bounded annotation chunks, with missing coverage, unavailable sources and omissions explicit.

These safeguards do not settle every historical source discrepancy. The detailed live audit results and remaining verification limits are recorded in `docs/accuracy-v2.29.1.md`.
