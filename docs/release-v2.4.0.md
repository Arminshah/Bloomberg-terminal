# Armin Terminal 2.4.0

This release addresses missing option and bond-analysis workflows and publishes a [comparison of all 70 registered commands](bloomberg-parity.md). It remains a partial professional-terminal implementation, with explicit source and model limits.

## Added and improved

- **OPTIONS / OMON** now requests listed US equity contracts from Alpaca's explicit **indicative** feed. Calls/puts, exact-expiry requests, loaded-expiry filtering, provider IV/Greeks, independent quote/trade times and CSV replace the old unavailable-only screen. Indicative quotes and delayed trades are never labelled real-time OPRA. Adjusted roots remain separate. Open interest, daily option volume, index options, multipliers and deliverables are not invented.
- Up to five sequential provider pages load per request. Repeated tokens or a refused next page produce visible partial status. Cached snapshots survive failed refreshes with original retrieval times and stale labels. Invalid option schemas are rejected before the request broker caches them or records success. Tables display 100 rows while sorting/export cover the whole filtered result; column headers support keyboard sorting.
- **OPTIONSTRATEGY / OSA**: up to 12 signed common-expiry option legs plus stock, entry premiums, European-model values and aggregate Greeks, exact expiry risk/breakevens with unlimited-tail detection, time/spot/volatility scenarios and CSV. Bull call, straddle, condor, covered-call and protective-put examples are labelled calculations.
- **OPTIONCALC / OVME** solves European implied volatility from a manual premium, rejecting impossible prices and clearing invalid results.
- **BONDCALC / YAS** adds matching-compounding benchmark G-spread, continuous zero-curve Z-spread, spread duration, Z01 and spread scenarios. The curve is explicitly entered, settlement-relative, log-linearly interpolated without extrapolation; it is not inferred from Treasury par yields. CSV includes benchmark/curve provenance.

[Calculator conventions](calculators.md) define units and excluded contract features. [Provider setup](configuration.md) explains the existing Alpaca key pair and switch; no trading/account endpoint is enabled and no secret is bundled.

## Validation

- 431 unit tests in 28 files passed, including independent strategy payoff/risk and nonflat-curve discounted cash-flow checks, endpoint schema validation, bounded pagination, stale recovery and entitlement failures.
- 12 browser tests passed. The rendering test checks every registered function has a command case; calculator tests use explicit inputs and independent expected values and exercise invalid inputs and CSV exports.
- 8 Linux Electron tests passed with the real main/preload/IPC/broker/UI and deterministic transport fixtures. They cover calculator workflows without provider prices/rates, large-chain pagination/global sorting/keyboard access, adjusted roots/source times, partial refusal, schema failure/recovery, existing IEX ownership/freshness and source `.env` isolation.
- Lint, TypeScript and the production build passed. No dependency versions changed; the package and lockfile versions match 2.4.0.
- The tag release workflow repeats verification, builds Windows NSIS/portable and Linux AppImage/deb natively, runs the eight desktop checks on Windows, calculates SHA256 sidecars, validates all four uploaded package sizes/digests and publishes the complete draft. Publication status and outputs are the GitHub release/workflow records; the repository document does not substitute for those records.

## Downloads

The [v2.4.0 release](https://github.com/Arminshah/Bloomberg-terminal/releases/tag/v2.4.0) supplies `Armin-Terminal-Setup-2.4.0.exe`, `Armin-Terminal-2.4.0-Portable.exe`, `Armin-Terminal-2.4.0-x86_64.AppImage` and `armin-terminal_2.4.0_amd64.deb`, plus their SHA256 files, once its verification/build/publication gates complete. Windows files are unsigned; see [installation](install.md).

## Limits and live access

Alpaca's official SDK was checked for the option endpoint/feed/schema; authenticated access is **unverified** in this cloud because the supplied credentials are not bound securely to its process. Account entitlement may refuse data. Unit/desktop transport fixtures prove application behavior, not live feed correctness. The SDK references and exact retrieved Git blob IDs are in the workflow audit.

The cloud's packaged Electron live checks previously failed certificate validation for its platform proxy CA. Automatic approval review rejected importing that CA into the user-wide NSS trust store because it would affect TLS trust for future applications. That change remains unapproved and was not bypassed. Public shell/OS-trust checks and deterministic desktop tests do not prove live Electron access. No TLS verification is disabled in the app.

IEX remains one venue, without consolidated tape/NBBO/full-market volume. Indicative options are not OPRA; European calculators do not supply American exercise, different-expiry strategies, assignment or broker margin. Bond spread analytics do not supply OAS, callable/irregular models or live dealer curves. Individual bond/dealer datasets, licensed research, messaging/execution networks and many other Bloomberg workflows remain absent. See the audit rather than interpreting matching mnemonics as 1:1 parity.
