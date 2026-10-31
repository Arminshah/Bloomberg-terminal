# Armin Terminal 2.10.0

A more consistent terminal workspace: persistent loaded securities, clearer menus and contextual help, command recall, configurable watchlist fields and more readable market countdowns. Includes the market and company news additions made after 2.9.0.

## Panels and keyboard navigation

- Each panel shows its loaded security, current function and recent-security selector. A loaded security remains available while visiting global screens or help; compatible security changes preserve the analysis function.
- Menu navigation climbs from related functions to sector and main menus. Back/forward history stays separate. Function discovery searches descriptive names, mnemonics and descriptions, with clearer numbered choices.
- F1 and the panel Help button open help for the current function. A second press opens the explicitly local assistant.
- Recall commands within each panel with the history button, Up/Down when suggestions are closed, or Ctrl+Up/Down. Recalling a command preserves unfinished input and waits for Enter to execute.
- Shared panel controls, function bars, editable fields and action styling are more consistent. Market countdowns have clearer labels and improved contrast.

## Watchlist fields

- **94) Columns** offers Default, Quote detail and Source check presets, individual field selection and column ordering. Choices and sorting are saved separately for each list; existing lists retain their original default columns.
- Click a heading to sort ascending, descending or return to manual order. Missing values and unverified previous-close bases remain last. A temporary filter matches security identifiers and names.
- Copy and CSV export follow the selected columns and filtered/sorted rows, with raw values and a separate section for units, sources, timestamps and missing-data reasons. Field selection uses existing local data and adds no provider entitlement.
- See [watchlist field instructions](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.10.0/docs/watchlist-fields.md).

## Broader news coverage

- Google News adds market searches and company searches in the listing's market languages, including Dutch, French and English for Brussels. No key is required; its feed is for personal, non-commercial use.
- Benzinga news through Alpaca uses the existing Alpaca keys/account access. Its free-plan news arrives approximately 15 minutes after publication.
- Massive adds market and ticker news, sharing its request allowance with `CROSSCHECK`; Finnhub adds merger news alongside general market headlines.
- Duplicate stories merge while retaining their sources; available direct article links take precedence over Google redirects. Screens show headlines, publication details, summaries where provided and links out. They do not fetch full articles. Coverage, delays and account access remain provider-dependent.

## Validation and remaining limits

Local validation passed lint, TypeScript, **689 unit tests, 27 browser workflows and 22 Linux Electron workflows**. These checks include deterministic provider responses; they do not establish live access to every keyed dataset.

The release pipeline separately gates publication on its verification jobs, native Windows desktop checks, Windows/Linux package builds and verification of all uploaded packages and SHA256 files. Local checks alone do not establish that those release jobs have completed.

The [fidelity audit](https://github.com/Arminshah/Bloomberg-terminal/blob/v2.10.0/docs/terminal-fidelity-audit.md) documents the public Bloomberg references, implemented workflows and remaining gaps. Armin Terminal is an independent project, not an exact Bloomberg replacement: licensed Bloomberg data, research, messaging, execution and enterprise services remain outside its coverage. IEX covers one exchange; indicative options are not real-time OPRA.

## Downloads

- Windows installer: `Armin-Terminal-Setup-2.10.0.exe`
- Windows portable: `Armin-Terminal-2.10.0-Portable.exe`
- Linux AppImage: `Armin-Terminal-2.10.0-x86_64.AppImage`
- Debian/Ubuntu package: `armin-terminal_2.10.0_amd64.deb`

Each package has a matching `.sha256` sidecar. Settings, saved keys, watchlists and workspaces are retained on upgrade.
