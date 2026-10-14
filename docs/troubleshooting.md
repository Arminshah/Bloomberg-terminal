# Troubleshooting

`PROVIDERS` is the first place to look: it shows each provider's state, its last attempt and success, and its last problem with its kind.

## Prices

**No prices at all, or CONNECTION LOST in the top bar.** The app shows no prices rather than old or simulated ones. Check the internet connection, then `PROVIDERS`: Yahoo with "not entitled" or "rate limited" means Yahoo refused or throttled the app. Yahoo is an unofficial source and can do that at any time; the app backs off and tries again. If `YAHOO_PRICES_ENABLED` is off, every line Yahoo feeds shows no data by design.

**A price is marked S (STALE).** Its source has not delivered a new price for longer than the instrument's threshold (10 minutes for currencies, crypto and indices, 30 for stocks and futures, beyond any delay the source states) while its market should be trading, or the source stopped answering. Hover the price for the reason.

**A price is marked D, E, R or ?.** DELAYED by the minutes the source states, END OF DAY (the session is over), REFERENCE (an official value published once a day) or UNKNOWN FRESHNESS (the source does not say whether it is real time). These are labels, not faults.

**A day's change is grey with a ?.** The previous close behind it is not yet confirmed for the right session, for example just after midnight or before a market's daily bar has arrived. It turns normal once confirmed. `--` means there is no previous close, or the sources disagree.

**Crypto prices missing.** Crypto comes from Kraken. Check its row in `PROVIDERS`. Switching `KRAKEN_ENABLED` off hands the crypto lines back to Yahoo after a reload.

## Keys and providers

**"FRED needs your API key".** Add `FRED_API_KEY` on `PROVIDERS`. Until then `MACRO`, `RELEASES` and FRED's series in `ECONSTATS` stay empty; the ONS, Eurostat, Statistics Canada and ABS figures do not need it.

**"The FRED API key was not accepted".** FRED refused the key; the reason is on `PROVIDERS`. Check it in your FRED account. The app sends almost nothing more until you save a key. After a rate limit (HTTP 429) or 423 it waits two minutes.

**`FILINGS` asks for SEC_USER_AGENT.** The SEC requires every automated client to give a name and a contact email it can reach. Set `SEC_USER_AGENT` to something like `Armin Terminal you@example.com`, with your own address. Nothing is sent to the SEC without it.

**Market value and supply show `--` on `CRYPTO`.** They need `COINGECKO_API_KEY`.

**`CROSSCHECK` says "no key", "display rights not confirmed" or "budget spent".** Each second source needs its own key; Twelve Data also needs `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` on; Alpha Vantage's free key allows 25 requests a day, and the app stops at 20 until midnight UTC.

**"This system cannot encrypt saved keys".** On Linux the app saves keys only through a desktop keyring (GNOME Keyring or KWallet). Install and unlock one, or set the keys as environment variables before starting the app.

**A key is set but the switch or key cannot be changed on `PROVIDERS`.** It comes from an environment variable or the `.env` file, which win over the screen. Change it there.

## Market timers

The timers count to the regular session only: 09:30 to 16:00 New York time for the NYSE, 09:00 to 17:30 Brussels time for Euronext. Pre-market and after-hours trading are not counted. Holidays and early closes follow each exchange's published rules; a closure announced at short notice (a national day of mourning, an outage) is not known to the app. Click a timer for that exchange's holiday calendar.

On narrower windows the Hong Kong, Tokyo and London clocks, and then some layout buttons, give way so the timers and the connection status stay visible.

## Commands

**"DES was renamed PROFILE".** The command names changed in version 2.0.0. Type the new name, or `HELP` for the list. Saved layouts and settings are carried over by themselves.

**"Unknown function".** `HELP` lists every function; `CHART?` explains one.

## Installing

**Windows: "Windows protected your PC".** The executables are not code-signed. Choose More info, then Run anyway.

**Linux AppImage: "dlopen(): error loading libfuse.so.2".** Install FUSE 2: `sudo apt install libfuse2` (Ubuntu 22.04) or `libfuse2t64` (24.04).

**Linux AppImage: "The SUID sandbox helper binary was found, but is not configured correctly".** Ubuntu 24.04 and later restrict the user namespaces Chromium's sandbox needs. Install the .deb instead, which sets the sandbox up. Starting the AppImage with `--no-sandbox` works too, but without that sandbox.

## Starting over

Close the app and delete its data folder (`%APPDATA%\armin-terminal` on Windows, `~/.config/armin-terminal` on Linux). That removes watchlists, layouts, alerts, notes, the portfolio, settings and saved keys.
