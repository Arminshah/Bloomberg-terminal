# Watchlist field columns

Open `WATCHLIST` (or `W`), then **94) Columns**. The original columns remain the default for existing and new lists. Choose **Default**, **Quote detail** or **Source check**, or select individual fields. The arrows beside each selected field change its column order. Choices are saved separately for each watchlist; the security identifier always remains visible.

The available columns use the app's local [field catalogue](data-dictionary.md), plus its existing YTD calculation and intraday sparkline. Selecting a field does not add a data entitlement. Hover a value to inspect its units, source, status and timing limits; unavailable values show `--` with a reason. Bid and ask do not inherit the last trade's timestamp.

Click a column heading to sort ascending, descending, then return to manual order. Missing values and values with an unverified previous-close base remain last in either direction. Ties retain the original list order. Sorting is saved with the list; **95) Manual order** restores the order edited with the row arrows. The row arrows are disabled while a sort is active.

**Filter this list** matches security identifiers and names. It changes the rows shown and exported without removing holdings from the watchlist. The filter is temporary and clears when another list is selected or the page reloads.

**98) Copy** and **99) Export** use the selected columns and current filtered/sorted row order. The first table contains raw field values; a second section supplies each field's unit, source, status, timestamp and limitations. Formatted volumes export as numbers; timestamps use UTC; yield changes export as percentage points while the screen displays basis points. Intraday sparklines export their available close samples separated by semicolons. No prices are substituted for missing securities or fields.

These are local monitor features. They do not provide Bloomberg Worksheets, shared monitors, arbitrary Bloomberg fields or spreadsheet/API compatibility.
