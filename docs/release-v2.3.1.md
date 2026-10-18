# Armin Terminal 2.3.1

Includes the [v2.3.0 analytical workflows and release-delivery changes](release-v2.3.0.md): bond, FX-forward and fixed/float swap calculators, European-option fixes and manual inputs, visible IEX quote priority, CSV exports and native release builds with SHA256 files. See [calculator conventions](calculators.md) and [data coverage](feature-matrix.md).

## Startup and repricing correction

The v2.3.0 GitHub runner took 697 ms in the existing 600-ms engine-construction test, so its release was blocked before creating a draft. This patch replaces per-coupon summation in the precomputed bond pricer with a constant-time geometric annuity. `log1p` and `expm1` preserve precision around zero yield. Explicit cash-flow discounting remains an independent check across annual, semiannual, quarterly and monthly schedules, zero/nonzero coupons, negative yields and high yields.

CI uses the same Node 24 toolchain validated locally, with serial unit workers so competing tests do not distort the startup measurement. The 600-ms assertion is unchanged. The original per-cash-flow valuation and financial-risk checks remain in the suite.

## Verification and delivery

- 381 unit tests in 26 files, including the unchanged startup-time test.
- Browser checks cover every implemented function rendering, keyboard workflows, calculator examples, invalid-input clearing and CSV export.
- Electron checks cover real main/preload/IPC behavior and the same manual calculations without provider prices or rates. They use disposable profiles and synthetic transport fixtures.
- Tag releases require verification, native Windows and Linux packaging, native Windows Electron checks, four uploaded packages and four SHA256 files before publishing the draft. Direct uploads avoid the account's exhausted Actions artifact-storage quota. A failed draft is not published.

Windows assets: `Armin-Terminal-Setup-2.3.1.exe` and `Armin-Terminal-2.3.1-Portable.exe`. Linux assets: `Armin-Terminal-2.3.1-x86_64.AppImage` and `armin-terminal_2.3.1_amd64.deb`. All include SHA256 files. The Windows executables are unsigned; [installation instructions](install.md) describe first launch and updates.

## Data checks and remaining limits

The ten public HTTP/parser checks and the initial packaged Linux certificate-store finding are documented in [v2.3.0 validation](release-v2.3.0.md#public-feed-check). Shell access and valid parsing do not establish live Electron feeds: the cloud's legacy NSS store initially rejected its proxy certificate, and a shared-store CA import needs explicit approval. TLS validation was not bypassed. None of the twelve canonical provider credential variables is populated here; authenticated provider endpoints and keys remain unverified. Secure environment bindings or desktop `PROVIDERS` configuration are required.

IEX is one venue, with polling and limited snapshot history. Consolidated quotes/NBBO, full-market volume, licensed option chains, individual bond/dealer datasets, proprietary research and full Bloomberg function coverage remain unavailable through the connected free sources. Calculated forwards and swaps use your assumptions and inputs; they do not provide dealer curves or executable quotes. TipRanks remains unconnected. This release improves usable, tested workflows; it does not claim a complete Bloomberg replacement.
