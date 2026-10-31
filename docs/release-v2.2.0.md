# Armin Terminal 2.2.0

17 October 2026. Based on the existing `v2.1.1` release source from `claude/amber-terminal`.

This release fixes provider reliability and adds an explicit IEX-only US equity price mode and working mnemonic aliases. It does not implement every Bloomberg function or provide Bloomberg's datasets.

## Changed behavior

- Provider refusals inside HTTP 200 responses become errors before caching or success accounting. This includes Alpha Vantage's `Information`/`Note`, FMP's `Error Message`, Twelve Data errors, and Marketaux/Finnhub errors.
- Keyed requests share a tested broker with full-body reads, credential-specific caching, request deduplication, bounded retries, provider cooldowns and `Retry-After`, daily cap checks after minute/hour queues, and fallback retaining the old timestamp and current failure reason.
- `PROVIDERS` imports accept common Alpaca/Marketaux/FMP environment aliases, Markdown SEC contacts and padded secrets. Ambiguous entries are refused; configured keys are redacted from error messages even outside URLs. Tests of pure provider logic no longer need an Electron binary.
- With both Alpaca keys configured, `ALPACA_IEX_PRICES_ENABLED` selects IEX-only US equity prices across watchlists and panels after a reload. IEX provenance remains visible; Yahoo cannot overwrite those prices or blend its daily bars and previous close into them. Old trades remain stale even when downloaded just now. Fair batches avoid starving subscriptions after the first twenty symbols.
- IEX snapshot history contains previous/current daily bars and intraday observations since startup. The UI explains its coverage, does not interpolate a complete trade tape, and leaves unavailable long-history statistics blank. Company fundamentals remain a separate Yahoo dataset. The default price mode preserves Yahoo's longer history and the separate IEX quote box.
- `CROSSCHECK` compares completed New York sessions, respecting holidays, early closes and DST, filters incomplete/out-of-range bars, and distinguishes stale fallback from a fresh answer.
- Existing mnemonics such as `DES`, `GP`, `GIP`, `FA`, `ANR`, `HP`, `BQ`, `WEI`, `W` and `PORT` execute the corresponding implemented functions. `HELP GP`, `GP?`, autocomplete, security-first/function-first input, and online ticker lookup use the same canonical mapping. Explicit sector input resolves mnemonic/ticker collisions.
- Native IPC regression tests join unit/browser checks. Tag releases must pass verification before publishing installers.

## Validation in this cloud machine

| Check | Result |
| --- | --- |
| Reusable `scripts/cloud-setup.sh` | Passed: lockfile install, pinned Electron checksum-verified download, production build; local signed-APT Xvfb available |
| ESLint | Passed |
| TypeScript build | Passed |
| Unit suite | 349 passed in 25 files |
| Browser suite, system Chromium | 9 passed, including every implemented function, mnemonic commands, keyboard navigation and mobile layout |
| Native Electron IPC/UI suite | 4 passed using disposable profiles, fake credentials, pre-main controlled provider transport and source .env isolation |
| Linux unpacked application | Built with pinned, verified Electron distribution; packaged startup, GP alias, provider screen and preload IPC smoke check passed with network disabled |
| Live provider credentials and endpoints | Unverified: required credentials absent from the process and proxy `CONNECT 403` before the provider is reached |
| Windows installer / Linux AppImage and `.deb` | Built by GitHub's workflows after pushing the version tag; local unpacked validation is distinct from those outputs |

One existing 600-ms construction performance assertion took about 622 ms while browser build/tests ran concurrently. The full 349-test suite passed with two workers after competing builds stopped; no assertion was relaxed or skipped.

`npm audit` reported seven moderate findings in the transitive desktop-packaging dependency chain, no high/critical findings. It proposed downgrading electron-builder rather than a compatible fixed update; the pinned toolchain was retained. This is not an assertion that dependencies have no vulnerabilities.

## Live-data prerequisites and remaining coverage

The cloud draft saves required provider hosts, canonical secret requirement names, the SEC contact variable, and reproducible setup/start instructions. Draft saving does not enter secret values, apply runtime network policy or publish a snapshot. Enter keys securely in environment settings, save and publish, then retry the live operations. Never put keys in GitHub, release notes or renderer build variables.

The current proxy denial means these tests cannot establish that the supplied keys are valid, that a particular subscription permits an endpoint, or that current market prices match a provider. Free-plan limits in the existing documentation were recorded by the previous version; current quotas were not independently revalidated here.

IEX is one exchange, not consolidated US coverage, NBBO, full-market volume or complete depth. Full listed option chains, individual bond/dealer prices, swaps/FX forwards, proprietary research and all Bloomberg functions remain outside the connected free datasets. TipRanks credentials can be stored but its adapter is still not implemented; authenticated MCP discovery and live schema validation remain necessary. The browser remains an explicitly simulated demo; real feeds are in the desktop main process.

On your desktop, set keys using `PROVIDERS` → `Save these keys`, check the actual errors/status, then enable the IEX price switch if desired. A configured key is not proof of successful access. No trading endpoint is called.
