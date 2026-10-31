# Armin Terminal 2.7.1

The Euronext and NYSE controls now fit the compact terminal header: uppercase exchange names, the scheduled weekday/time in the exchange's local time, and a separate aligned OPENS IN/CLOSES IN countdown. Subtle session markers and green open-session countdowns make the status easy to scan. The controls use consistent widths and tabular digits, without the previous long captions and widely spaced text.

Hover details retain the next session's date, exchange/local times, holiday and early-close information. Clicking a timer still opens its market calendar. Accessible names describe the regular-session state and the next transition. Unknown schedules stay explicitly unavailable. Session calculations, exchange calendars and data feeds are unchanged.

The city clocks use the same label-above-value layout, aligned white local times and subtle separators. Exchange and city names retain the terminal's original orange; green stays reserved for open market sessions. Time zones, daylight-saving behavior and responsive clock ordering remain unchanged.

Validation includes lint, TypeScript, unit tests, browser workflows, native desktop integration and visual review of open/closed sessions at common window widths. Completed results and download verification are recorded on the published release.

Windows files: `Armin-Terminal-Setup-2.7.1.exe` and `Armin-Terminal-2.7.1-Portable.exe`. Linux files: `Armin-Terminal-2.7.1-x86_64.AppImage` and `armin-terminal_2.7.1_amd64.deb`. Each has a SHA256 sidecar. Installing over the app retains settings and provider credentials.
