# Armin Terminal 2.7.0

This release brings linked-panel research and familiar command presentation to the desktop app, adds an inspectable local field catalogue, and fixes mark/timestamp provenance. American option analytics, portfolio risk, Equibles research, Finnhub fallbacks and provider-access diagnostics from earlier releases remain available.

## Linked panels and terminal presentation

Choose **LAYOUTS ▾ → Linked Security Research** for a profile, chart, financial statements, field inspector and watchlist. Clicking a watchlist security updates the compatible peers while keeping each function and the watchlist on screen. Colored selectors beside panel numbers offer four independent groups or Unlinked. Hidden panels and incompatible functions keep their securities. Back/forward changes propagate without taking focus, histories remain bounded, and saved layouts retain groups through both the LAYOUTS screen and top-bar menu. Slow ticker lookups cannot overwrite a newer linked selection. Pending autosave writes flush when the page closes, preserving the last screen/groups on an immediate reload.

Headers show familiar mnemonics such as `DES`, `GP`, `FA` and `FLDS` with `<GO>` cues, alongside descriptive function names. Command placeholders and help also surface the shorter names. **SETTINGS** offers a saved display toggle; both forms continue to execute the same functions. Stored routes remain compatible with previous descriptive names. See [workspace behavior](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.7.0/docs/linked-workspaces.md).

## Field search and accuracy

`FLDS AAPL` / `FIELDS AAPL PX_LAST` searches 29 local identity, quote, calculated and source fields. Inspect a field's raw value, unit, definition, provider, freshness, source time and timestamp basis. Search/category/availability filters apply to copied and exported CSV. Missing values remain unavailable, reference yields and minor currency units stay explicit, crossed BBO calculations are refused and legitimate zero volume/locked spreads remain zero.

Last-price, daily-close and app-receipt timestamps remain distinct. Real bid/ask fields have no independent event time exposed by this engine, so inspection explicitly leaves that time unavailable rather than borrowing a last-trade time or implying NBBO. Stale IEX trades stay stale even after a fresh HTTP response. Missing, invalid or excessively future source times cannot establish real-time freshness. This screen reads existing values and consumes no additional provider requests.

Portfolio risk now captures prices, FX rates and their provider/state/source-time/receipt-time/freshness metadata together. Calculations, coverage tables and CSV use that same snapshot even after the engine advances. Freshness is evaluated at capture. CNY holdings disclose that offshore CNH is used as a USD conversion proxy; USD identity conversion has no market timestamp.

## Validation and delivery

Local validation passed: **515 unit tests in 38 files**, **17 Chromium workflows**, **16 Linux Electron workflows**, lint, TypeScript and the production build, including the immediate-reload autosave regression. Unit/performance checks ran separately from builds and UI suites; the existing 600-ms engine-construction assertion remains unchanged. Visual review covered the linked desktop workspace and field inspection at desktop/phone sizes, including readable wrapped definitions in narrow panels.

The release workflow gates publication on those checks with deterministic provider fixtures, then native Windows/Linux packaging, the same 16 native Windows Electron workflows and uploaded SHA256 checks. The Windows installer is not interactively installed in this cloud. Fixture tests verify the actual main/preload/IPC/UI path rather than authenticated live accounts.

Windows packages: `Armin-Terminal-Setup-2.7.0.exe` and `Armin-Terminal-2.7.0-Portable.exe`. Linux packages: `Armin-Terminal-2.7.0-x86_64.AppImage` and `armin-terminal_2.7.0_amd64.deb`. All have SHA256 sidecars. Installing over the app retains existing settings and credentials; older unlinked layouts remain usable.

## Scope

These additions need no new data subscription. Field definitions and identifiers are local; this is not the complete Bloomberg field catalogue or a BDP/BDH/BDS/BQL implementation. Linked panels do not provide Bloomberg Launchpad/BLP integration or account collaboration. Public Bloomberg documentation remains blocked by this cloud's network policy, and no licensed session or pixel-level comparison was available. The [71-command workflow audit](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.7.0/docs/bloomberg-parity.md) records partial implementations and remaining gaps.

Authenticated provider/issuer coverage remains account-dependent and unverified here. HTTP 402 is an entitlement denial, not a code fix or an indication that a daily quota is exhausted. Alpaca IEX covers one exchange rather than consolidated US tape/NBBO; indicative options are not real-time OPRA. No keys are bundled. Automated fixture tests establish application behavior, not flawless live providers or full Bloomberg parity. The cloud's separate Electron HTTPS trust restriction remains unresolved; certificate checks were not disabled.
