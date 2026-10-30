# Armin Terminal 2.29.1

This release fixes financial statement selection and quote corrections found while following up the live data audit. It retains the policy, earnings and supply-chain improvements in 2.29.0. Windows only.

- Proxy compensation disclosures cannot overwrite standard financial-statement figures or create statement periods. Genuine amendments remain available, and raw research data stays separate.
- Filed parent income remains separate from the common-shareholder EPS numerator even when another statement line conflicts. Unreconciled net margins stay blank with an explanation.
- Same-session corrections can lower a previously reported high or raise a low. Range statistics now recalculate when the underlying quote changes.
- White current-price markers in Day Range and 52-Wk Range keep the same thin dimensions and align to screen pixels, including fractional display scaling.
- Market values no longer derive shares by dividing a current market value by the previous close, or by combining one provider's market value with another's price. Reported counts remain available when a matched current pair is missing.
- Opening a stock starts its settled-volume check once history is ready, removing a wait of up to a minute. Existing source and request limits remain in place.
- DES refreshes its price and YTD return together when a provider quote changes between clock ticks.
- Financial statements use the provider's separate reported operating-income line when available, retaining the other line for comparison. Missing or disagreeing reported observations keep their existing source warnings.
- Share-count conflicts expose dated numeric alternatives, including the distinction between shares and market-value sensitivities. An alternative matching a reference does not resolve a share-definition conflict.
- Filing quotation checks preserve inline XBRL text and source entities. Competitor-list context is stored separately from the actual quotation and exported with it.
- The audit requires the same completed reference session for rolling analytics, validates reference OHLC data, and excludes corporate actions after the captured session. Intraday ranges remain unverified by an EOD-only reference.
- Direct and scheduled audits share the provider budget. Public findings use bounded annotation chunks, with missing coverage, unavailable sources and omissions explicit.
- Earnings corroboration uses the actual's filed fiscal period and currency. Open/volume failures retain their original comparison and add dated secondary-source diagnostics.
- Quote captures retain the displayed price and share-count sources. Financial-basis warnings identify the conflicting lines and their original source values, while keeping unreconciled margins blank.

These safeguards do not settle every historical source discrepancy. The detailed live audit results and remaining verification limits are recorded in `docs/accuracy-v2.29.1.md`.
