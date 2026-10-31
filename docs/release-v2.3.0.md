# Armin Terminal 2.3.0

This version makes the bond, FX-forward and swap screens usable as explicit-input calculators, improves option boundaries and visible IEX refreshes, and repairs release delivery. It does not provide every Bloomberg function or its licensed datasets.

## Changes

- `BONDCALC` / `YAS`: regular fixed-rate bullet pricing and yield solving, accrued interest, invoice amount, duration, convexity, DV01, yield scenarios, discounted cash flows and CSV export. Starts with blank contract inputs; a numbered, labelled example is available. No issue terms or market quotes are inferred from a ticker.
- `FXFORWARD` / `FRD`: covered-interest-parity outright/points, separate currency day bases, user term deposit rates, manual/source spot and long-base contract PV at spot settlement. Tenor scenarios hold input rates flat. Dealer points, basis and valuation-to-spot discounting remain outside this model.
- `SWAPCALC` / `SWPM`: forward-start fixed/float NPV and par coupon with separate user discount/projection zero curves, log-linear discount factors, cash flows and pay/receive signs. Curve and coupon bumps are separate; a curve bump holds the original contract coupon fixed, including a base par trade. Insufficient curve coverage is rejected.
- European equity and FX options accept manual inputs without source prices/rates. Zero volatility correctly discounts deterministic payoff. Invalid overrides produce an explanation and clear results. Equity options accept dividend-yield and multiplier overrides; FX options accept both currency rates and point size. These remain European models, without American exercise or listed option quotes.
- Bond yield solving no longer clamps to -5%/60%; invalid/matured schedules terminate. Treasury 64ths round and carry correctly. Month arithmetic preserves literal years below 100.
- Visible IEX quote panels receive polling priority. Large foreground and background subscription sets rotate fairly; closing a panel returns its symbol to normal background rotation. One exchange's data and five-second polling remain distinct from consolidated quotes or a complete trade stream.
- A 52-week fixture now uses a fixed completed-session date instead of depending on the weekday of the test run. This was the unit failure in the previous tag's GitHub run; the market-window calculation was not loosened.
- Tagged releases now upload native builds directly to a draft GitHub Release, with SHA256 files. This avoids the account's exhausted Actions artifact-storage quota without deleting existing artifacts. Publication requires verification, Windows/Linux builds, native Windows Electron checks, complete assets and matching reported digests. Branch/PR jobs validate builds without uploading duplicate artifacts. The workflow checks out the requested tag and verifies its package version, retains a draft on failures and refuses to overwrite a published release.
- Checkout/setup actions use their current Node 24 versions, verified against their published manifests. Linux CI is pinned to Ubuntu 24.04 rather than the moving `ubuntu-latest` image.

[Calculator conventions](calculators.md) define inputs, units and scope. Inputs and calculation assumptions accompany bond/forward/swap exports. [Feature coverage](feature-matrix.md) lists the remaining data gaps.

## Local verification

| Check | Result |
| --- | --- |
| ESLint, TypeScript and production renderer build | Passed |
| Unit suite | 377 passed in 26 files |
| Browser suite | 11 passed, including every function rendering, independent calculator examples, invalid-input clearing and CSV export |
| Electron main/preload/IPC/UI suite on Linux | 5 passed, including the same manual calculations in real-data mode without any provider inputs |
| Workflow validation | Checksum-verified actionlint 1.7.12; no errors |
| Linux packages | AppImage and Debian package built; file formats and SHA256 manifests checked |
| Packaged Linux startup | Version 2.3.0 opened, preload/IPC and command UI exercised, no renderer exceptions; initial live calls encountered the cloud certificate-store issue described below |

The deterministic UI tests use disposable profiles, synthetic transport fixtures and no real credentials. Formula checks include independent coupon/zero-coupon prices, finite-difference bond risk, option limits and parity, FX carry/PV, flat-curve par swap/telescoping floating PV, dual curves, forward starts and curve-coverage failures. They do not establish live credential validity or full market-standard contract coverage.

## Public-feed check

The earlier proxy denials were rechecked on 18 October 2026. All ten public endpoints below returned HTTP 200. Downloaded payloads were also run through the app's parsers where indicated:

| Source | Observed response |
| --- | --- |
| Yahoo AAPL daily chart | Chart JSON with history and source price/time; this does not validate crumb-authenticated company data or streaming |
| US Treasury current-year CSV | Ten supported tenors, 199 observations per tenor |
| Kraken BTC/USD and ETH/USD ticker | Both pairs parsed with finite bid, ask, trade price and volume; no API errors |
| New York Fed latest reference rates | EFFR, OBFR, TGCR, BGCR and SOFR parsed |
| ECB deposit-facility CSV | 291 observations parsed |
| Bank of Canada overnight target | 205 observations parsed |
| Reserve Bank of Australia money-market CSV | Series codes and dated observations parsed |
| Japan Ministry of Finance current-month yields | 15 tenors parsed |
| ONS unemployment JSON | 665 monthly observations parsed |
| Federal Reserve news | RSS XML returned successfully |

An HTTP success and valid parsing establish access and schema compatibility at that check, not guaranteed accuracy, future availability or unlimited free access. Source timestamps/freshness still apply. Key-based providers remain unverified: none of the twelve canonical provider credential variables is populated in this cloud process, and the saved environment requirements have no key bindings. Chat text does not populate secure runtime settings. TipRanks' adapter is still unimplemented.

The initial packaged Electron live check returned `ERR_CERT_AUTHORITY_INVALID` for Yahoo, Treasury and Kraken while Python's OS-trust requests succeeded. This cloud's legacy user NSS database takes precedence over an isolated workspace database and lacks the platform proxy CA. Importing that CA into the shared user store requires explicit approval because it changes trust for future applications. Certificate validation was not disabled. This is separate from the deterministic IPC tests and the public endpoint/parser checks above; it prevents claiming successful live Electron feeds from those checks alone.

## Packages

Version tags build `Armin-Terminal-Setup-2.3.0.exe`, `Armin-Terminal-2.3.0-Portable.exe`, a Linux AppImage and a Debian package. Each has a SHA256 file. The native Windows job runs the Electron regression suite before uploading. Publishing the draft is gated on both platform jobs and uploaded-asset validation; pushing a tag alone is not proof of publication.

Windows executables are unsigned. See [installation](install.md) for Windows and Linux setup and [configuration](configuration.md) for the encrypted desktop `PROVIDERS` key store. Never put provider keys into source, release notes or renderer variables.

IEX remains a single venue, not consolidated prices/NBBO/market-wide volume. Listed option chains, individual bond/dealer prices, dealer forward/swap curves, licensed research and full Bloomberg functionality remain outside the connected free datasets. User-input analytics provide useful calculations with their stated assumptions; they do not supply those datasets.
