# Armin Terminal 2.12.0

Further visual and chart refinements based on Bloomberg-authored screen references. All of the [2.11.0 additions](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.12.0/docs/release-v2.11.0.md) are retained: the data-backed help desk and optional Anthropic mode, earnings expectations, extended-hours watchlist columns, SEC proxy compensation, industry peers, formatted Equibles reports, favourites and news improvements.

## Function frame and navigation

- Gray security and function selectors, a blue command-focus treatment, gray table headings and blue selected views. Amber remains the editable-field color inside functions. Readable market timers from 2.10.0 are retained.
- The red function bar places actions at the left and the function title at the right, with security identity and source context on a separate dark strip. Frame controls and tabs use proportional type; market figures retain tabular numerals.
- The function selector now works: choose a recent function or any registered function for the current panel. Compatible analysis uses the retained security; functions requiring another security class are disabled until a compatible security is loaded.

## Quote workstation

- A compact security identity band, aligned last-price and change fields, distinct bid/ask cells and paired session statistics replace the loose oversized quote block.
- Currency, exchange, source freshness and update time remain visible. Yield changes retain basis points; London pence quotes retain GBp. No executable prices, sizes or trading services are inferred.
- Existing news, analyst data, depth and trade sections remain available.

## Chart observations

- A compact OHLC and volume strip follows the crosshair, or the last visible bar when no cursor is present. The chart identifies its frequency, units and visible date range.
- Historical panning now keeps price tags and study/comparison legends consistent with the visible history. Volume, RSI and MACD observations follow the inspected bar. Intraday crosshairs include date and time.
- Financial calculations and provider requests are unchanged by these visual refinements.

## Research and verification

The [visual research notes](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.12.0/docs/visual-fidelity-v2.12.0.md) distinguish directly observed conventions from local design choices. They use the Bloomberg getting-started guide, 2024 Terminal Essentials material, current chart documentation and accessibility guidance. This does not establish exact visual or service parity with a licensed Terminal.

The release workflow gates publication on lint, TypeScript, unit and browser suites, Linux and native Windows desktop workflows, both package builds and uploaded-asset checksum validation. Tests use synthetic provider responses; they do not verify owner credentials or the live figures quoted in earlier development notes. The optional Anthropic integration remains unverified with a real owner API key.

## Downloads

- Windows installer: `Armin-Terminal-Setup-2.12.0.exe`
- Windows portable: `Armin-Terminal-2.12.0-Portable.exe`
- Linux AppImage: `Armin-Terminal-2.12.0-x86_64.AppImage`
- Debian/Ubuntu: `armin-terminal_2.12.0_amd64.deb`

Each has a matching `.sha256` sidecar. Settings, saved keys, favourites, watchlists and workspaces are retained on upgrade.
