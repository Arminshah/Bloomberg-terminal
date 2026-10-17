# Troubleshooting

`PROVIDERS` is the first place to look: it shows each provider's state, its last attempt and success, and its last problem with its kind.

## Prices

**No prices at all, or CONNECTION LOST in the top bar.** The app shows no prices rather than old or simulated ones. Check the internet connection, then `PROVIDERS`: Yahoo with "not entitled" or "rate limited" means Yahoo refused or throttled the app. Yahoo's endpoints are undocumented and it can do that at any time; the app backs off and tries again. If `YAHOO_PRICES_ENABLED` is off, every line Yahoo feeds shows no data by design.

**A price is marked S (STALE).** Its source has not delivered a new price for longer than the instrument's threshold (10 minutes for currencies, crypto and indices, 30 for stocks and futures, beyond any delay the source states) while its market should be trading, or the source stopped answering. Hover the price for the reason.

**A price is marked D, E, R or ?.** DELAYED by the minutes the source states, END OF DAY (the session is over), REFERENCE (an official value published once a day) or UNKNOWN FRESHNESS (the source does not say whether it is real time). These are labels, not faults.

**A day's change is grey with a ?.** The previous close behind it is not yet confirmed for the right session, for example just after midnight or before a market's daily bar has arrived. It turns normal once confirmed. `--` means there is no previous close, or the sources disagree.

**Crypto prices missing, or Kraken shows ERROR.** Crypto comes from Kraken. Its row in `PROVIDERS` gives the last problem, for example `HTTP 403` (Kraken refused the request, which it does for some networks and regions), `HTTP 429` or `EGeneral:Too many requests` (rate limited), or a timeout (a firewall or proxy). If Kraken never answers in a session, the app gives the crypto lines to Yahoo Finance for the rest of that session: after three failed tries, or at once when the daily candles failed too. `CRYPTO` then says why, and the prices are Yahoo's (CoinMarketCap's aggregate) rather than one exchange's. Once Kraken has answered in a session, a later outage marks its prices stale instead. Switching `KRAKEN_ENABLED` off hands the crypto lines to Yahoo after a reload.

## Keys and providers

**"FRED needs your API key".** Add `FRED_API_KEY` on `PROVIDERS`. Until then `MACRO`, `RELEASES` and FRED's series in `ECONSTATS` stay empty; the ONS, Eurostat, Statistics Canada and ABS figures do not need it.

**"The FRED API key was not accepted".** FRED refused the key; the reason is on `PROVIDERS`. Check it in your FRED account. The app sends almost nothing more until you save a key. After a rate limit (HTTP 429) or 423 it waits two minutes.

**`FILINGS` asks for SEC_USER_AGENT.** The SEC requires every automated client to give a name and a contact email it can reach. Set `SEC_USER_AGENT` to a name followed by your email, for example `Armin Terminal you@example.com` with your own address; labels such as `Name:` or `e-mail:` are not needed. Nothing is sent to the SEC without it.

**Market value and supply show `--` on `CRYPTO`.** They need `COINGECKO_API_KEY`.

**`CROSSCHECK` says "no key", "display rights not confirmed" or "budget spent".** Each second source needs its own key; Twelve Data also needs `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` on; Alpha Vantage's free key allows 25 requests a day, and the app stops at 20 until midnight UTC; Tiingo stops at 40 an hour and 500 a day.

**`ANALYSTS` says "Needs FMP_API_KEY", "free plan does not include this" or "allowance spent".** Analyst research needs your Financial Modeling Prep key. HTTP 402 means FMP's plan does not cover that request, usually that company on the free plan; the screen shows FMP's own words. The app stops at 220 requests a day (FMP allows 250); the count restarts at midnight UTC. Research is kept for six hours, so reopening a company costs nothing.

**`MARKETNEWS` is empty.** Its status line says, per source, what happened: a missing key, a switch that is off (MarketWatch is off by default), a daily allowance that is spent, or the provider's own refusal. Marketaux allows 100 requests a day and three stories a request, so its stories are few; the app asks once an hour. The SEC's 8-K filings need `SEC_USER_AGENT`.

**`QUOTE` shows no IEX box, or "Needs ALPACA_API_KEY_ID".** The box is for US-listed stocks in the desktop app and needs both Alpaca keys. Its figures are IEX's alone: a thinly traded stock may not have traded on IEX for a while, so the IEX last trade can lag the main price, and IEX's volume is a small part of the day's total.

**I pasted my keys but some were skipped.** "Save these keys" on `PROVIDERS` lists every line it skipped and why: no provider named, no value in that provider's key format (a placeholder such as `tr_live_xxxxxxxx`, for example), or the same provider twice. Paste a skipped key into its own field instead. A key set by an environment variable or `.env` wins over a saved one.

**"This system cannot encrypt saved keys".** On Linux the app saves keys only through a desktop keyring (GNOME Keyring or KWallet). Install and unlock one, or set the keys as environment variables before starting the app.

**A key is set but the switch or key cannot be changed on `PROVIDERS`.** It comes from an environment variable or the `.env` file, which win over the screen. Change it there.

## Yields

**`BONDS` or `CURVE` says "Loading the US Treasury curve".** The Treasury's site answers programs slowly, about 18 seconds per yearly file (14 October 2026), against under a second for a browser; the app identifies itself honestly rather than posing as a browser. The current year comes first, then the year before (for year-to-date and one-year changes), then the rest three at a time. Finished years are kept on this computer, so later starts fetch only the current year.

## Market timers

The timers come first in the top bar, Euronext then NYSE, before the clocks. They count to the regular session only: 09:30 to 16:00 New York time for the NYSE, 09:00 to 17:30 Brussels time for Euronext. Pre-market and after-hours trading are not counted. Holidays and early closes follow each exchange's published rules; a closure announced at short notice (a national day of mourning, an outage) is not known to the app. Click a timer for that exchange's holiday calendar.

On narrower windows the Hong Kong, Tokyo and London clocks, and then some layout buttons, give way so the timers and the connection status stay visible.

## Commands

**Mnemonic commands.** From version 2.2.0, `DES`, `GP`, `FA`, `ANR`, `BQ`, `WEI`, `W`, `PORT` and the other existing mnemonic mappings execute their corresponding functions. `HELP GP` or `GP?` explains the chart function. The descriptive command names still work. An alias provides access to the implemented function; its data coverage is listed in the feature matrix.

**"Unknown function".** `HELP` lists every function; `CHART?` explains one.

## Installing

**Windows: "Windows protected your PC".** The executables are not code-signed. Choose More info, then Run anyway.

**Linux AppImage: "dlopen(): error loading libfuse.so.2".** Install FUSE 2: `sudo apt install libfuse2` (Ubuntu 22.04) or `libfuse2t64` (24.04).

**Linux AppImage: "The SUID sandbox helper binary was found, but is not configured correctly".** Ubuntu 24.04 and later restrict the user namespaces Chromium's sandbox needs. Install the .deb instead, which sets the sandbox up. Starting the AppImage with `--no-sandbox` works too, but without that sandbox.

## Starting over

Close the app and delete its data folder (`%APPDATA%\armin-terminal` on Windows, `~/.config/armin-terminal` on Linux). That removes watchlists, layouts, alerts, notes, the portfolio, settings and saved keys.
