# Armin Terminal 2.8.0

This release merges the 2.7.1 and 2.7.2 work with fixes for keys, European stocks, portfolio currency and the heatmap.

## Keys

- Pasting your whole key list on `PROVIDERS` reads every entry in the layout you keep them: numbered lines, site names, Finnhub's 40-character key followed by its webhook block, the Alpaca secret on its own line, notes after a value, and TipRanks' and Equibles' keys. The webhook secret is never saved as the Finnhub key. The result lists what was saved, notes, and skipped entries one per line, and counts lines that name no provider instead of listing each one.
- Finnhub keys are kept whole. Builds 2.4.1 to 2.7.1 cut 40-character keys to 20 characters; if Finnhub answers 401, paste the key again.
- Every key still has its own field on `PROVIDERS`, so an expired or replaced key can be typed, replaced or removed on its own.

## European stocks

- Stocks on 15 European exchanges load from the command line, typed with the market code (`ABI BB`, `KBC BB Equity`, `ASML NA`, `VOLV/B SS`) or Yahoo's symbol (`ABI.BR`), also after a function (`COMPANYNEWS ABI BB`, `QUOTE KBC BB`). Codes: Brussels BB, Paris FP, Amsterdam NA, Lisbon PL, Dublin ID, Xetra GY, London LN, Milan IM, Madrid SM, SIX SW, Stockholm SS, Copenhagen DC, Helsinki FH, Oslo NO, Vienna AV. Search lists European listings under the same names.
- When Yahoo's summary has no share count (KBC, for example), it comes from the last reported balance sheet; the stock loads either way.
- `COMPANYNEWS` and `QUOTE` show Yahoo Finance's headline feed for any stock, European ones included. `MARKETNEWS` adds Euronext's latest company press releases. Switches: `YAHOO_RSS_ENABLED`, `EURONEXT_RSS_ENABLED`.

## Heatmap and market caps

- `HEATMAP` showed only the stocks whose profile had been opened (APLD, for example). Share counts came from Yahoo's quote endpoint, which needs the session Yahoo refuses until its EU cookie terms are accepted; without a share count a stock has no market cap and is left off the map. Share counts now also come from Yahoo's fundamentals series, which needs no session: one request per stock, 1.5 seconds apart, starting 15 seconds after launch, kept for a week. The map fills in over the first two minutes after the first start. The quote endpoint's count still wins when it answers.

## Portfolio

- `PORTFOLIO` can be valued in USD, EUR, GBP, CHF or JPY (selector on the summary). Holdings, performance, risk, the benchmark and exports use that currency, with historical FX into it. Cash is held in the chosen currency and converted at today's rate when you switch.
- Positions added from now on record the FX rate at entry, and the holdings table splits P&L into the local price move and the FX move. Positions entered earlier show the FX part as unknown.

## Fixes from reviewing 2.5.0 to 2.7.0

- Portfolio risk: a crypto holding's weekend prices no longer drop every Friday-to-Monday stock interval from VaR and volatility.
- Equibles: an expired session is renewed even when an older report is kept; kept reports survive a renewed session; the "Daily call limit exceeded" answer counts as a rate limit, not a report.
- `OPTIONCALC` no longer recomputes the American lattice on every screen refresh.
- `ANALYSTS` asks again when the screen reopens after a network error, 429 or server error.
- A linked `OPTIONCALC` panel drops the previous stock's strike and volatility when the group changes stock.
- The self-test shows the provider's reason for a refusal.

## FMP

FMP's free plan covers a fixed sample of about 87 symbols; other symbols answer HTTP 402 ("not available under your current subscription"). That is the plan's limit, not a key problem. `ANALYSTS` and `EARNINGS` fall back to Finnhub recommendation trends, Yahoo's analyst research (switch `YAHOO_RESEARCH_ENABLED`; in the EU it needs Yahoo's cookie consent, via "Open Yahoo to accept") and an Equibles estimate report.

## Downloads

Windows: `Armin-Terminal-Setup-2.8.0.exe`, `Armin-Terminal-2.8.0-Portable.exe`. Linux: `Armin-Terminal-2.8.0-x86_64.AppImage`, `armin-terminal_2.8.0_amd64.deb`. Each package has a SHA256 sidecar. Settings and saved keys are kept on upgrade.
