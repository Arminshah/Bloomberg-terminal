# Armin Terminal 2.6.0

This release deepens option valuation and portfolio risk. It also fixes portfolio history/date alignment, cost-basis handling and correlation edge cases. The previous Equibles research, Finnhub fallback, provider diagnostics and Yahoo session fixes are retained.

## American option valuation

`AAPL OVME` / `OPTIONCALC AAPL` now offers European BSM and American Tian binomial exercise with terminal continuation smoothing and grid-adapted spot bumps to reduce Greek noise. American valuation shows the European reference, early-exercise premium, approximate Greeks and the change from a coarser lattice. Select 200/400/800/1600 steps, enter a manual calendar-day tenor, invert a premium to model IV, and export inputs/results/scenarios as CSV. Friday calendar timestamps now use 16:00 New York with winter/summer offsets. Entering a new option command refreshes its argument-derived terms.

Zero-volatility American pricing searches possible exercise times, including an interior optimum. Negative rates and continuous dividend yields are supported. An exercise-floor premium can support multiple volatilities, so the calculator refuses to invent a unique IV there. Invalid inputs and overflowing grids clear the result. Finite-grid approximation and bump conventions are explicit; this is not a discrete cash-dividend, margin, assignment or executable-quote engine.

Ten independent QuantLib 1.40 finite-difference PDE reference cases cover calls, puts, dividends, negative rates and immediate exercise. Default 400-step prices must be within 0.025/share, and 800-step prices within 0.008/share, of those reference cases. These are case-specific checks, not uniform accuracy guarantees. QuantLib is used only to generate the saved reference fixture, and is not shipped as a dependency.

## Portfolio risk and performance

- Historical replay requires every holding and its historical FX, on exact shared dates before today's UTC date. Missing holdings never disappear from totals; missing observations are not zero or forward-filled. Risk intervals that bridge a missing session are excluded. Current quotes do not replace historical closing levels.
- VaR and expected shortfall support 95%, 97.5% and 99% confidence and 1/5/10/20 shared-observation intervals. Multi-interval historical shocks reprice actual endpoint moves without square-root scaling. Expected shortfall uses fractional/tied tail weights; signed losses and small-tail warnings remain visible.
- Signed volatility and ES contributions identify hedges and sum to portfolio totals. Gross/notional leverage, benchmark beta/correlation, tracking error, information ratio and worst scenarios have explicit samples and methods. Benchmark risk matches both interval endpoints. Percentage ratios require positive NAV; unavailable funding inputs no longer produce a guessed Sharpe ratio.
- Per-position local-price and FX stress tests fully reprice linear holdings and futures P&L, including price×FX effects. Allocation uses absolute gross notional, so a hedged long/short book does not divide by zero. Risk/history CSVs include methods, dates, current sources, inputs and scenarios.
- Reducing a manually entered position preserves the remaining average cost; reversing resets the new side's cost. Bad cost prices and yield-only references are rejected. Holdings are snapshots with separately entered cash, not trade execution or a realised transaction ledger.
- Correlation displays unavailable values for insufficient/constant samples, counts observations correctly and allows the final security to be removed safely.

Performance is explicitly a replay of today's fixed quantities/cash. It excludes trading, deposits, interest and dividend cash flows and is affected by source adjustment conventions and generic futures rolls. It is not your realised investment track record. Shared intervals are not guaranteed exchange business days; annualisation is an explicit assumption.

## Validation and scope

Release checks cover lint, TypeScript, unit mathematics/provider regressions, Chromium workflows and real Electron preload/IPC/UI workflows with deterministic transport fixtures. Native Windows and Linux packaging and uploaded SHA256 verification gate publication. The installer is not interactively installed in this cloud.

Local validation passed: **497 unit tests in 34 files**, **14 Chromium tests**, **14 Linux Electron tests**, lint, type checking and the production build. The existing 600-ms engine-construction test remains unchanged; performance tests were run separately from builds and browser suites. Electron tests cover manual American valuation/IV without provider prices, and reject invented portfolio risk when real history is absent. Native Windows runs the same 14 Electron workflows as a release gate.

These additions require no new market-data subscription for manual calculations. Real portfolio risk requires sufficient source history; two Alpaca IEX snapshot bars are not a one-year history. Authenticated provider/issuer coverage remains account-dependent and unverified in this cloud; FMP HTTP 402 still denotes an entitlement restriction. No secrets are bundled. There is no complete Bloomberg feature/data parity, consolidated exchange feed or real-time OPRA entitlement.

Windows files: `Armin-Terminal-Setup-2.6.0.exe` and `Armin-Terminal-2.6.0-Portable.exe`. Linux files: `Armin-Terminal-2.6.0-x86_64.AppImage` and `armin-terminal_2.6.0_amd64.deb`. Every package has a SHA256 sidecar. Installing over the existing app retains saved settings and credentials.

See [calculator and risk conventions](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.6.0/docs/calculators.md), [workflow coverage](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.6.0/docs/bloomberg-parity.md) and [provider coverage](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.6.0/docs/data-providers.md).
