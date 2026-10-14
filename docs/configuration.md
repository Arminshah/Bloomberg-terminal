# Configuration

Every setting below is read by the desktop app's main process only. No key is built into the app, sent to a screen, written to a log or included in an error message, and a key in the wrong format is never sent.

## Where a value comes from

For each name, the first of these that has a value wins:

1. An environment variable of the same name.
2. A `.env` file in the project folder, only when running from source (`npm run desktop`). Copy `.env.example` to start one; git ignores it.
3. A value saved on the `PROVIDERS` screen. Keys are encrypted with the system's key store (Windows: DPAPI; Linux: GNOME Keyring or KWallet). On a Linux system without a keyring the app refuses to save keys, and they can only come from environment variables.

`PROVIDERS` shows where each value came from, and cannot change a value fixed by the environment or `.env`.

## Keys

| Name | What it enables | How to get it | Free plan, as the app uses it |
| --- | --- | --- | --- |
| `FRED_API_KEY` | US economic releases (`RELEASES`), the macro dashboard (`MACRO`), FRED's series for Japan in `ECONSTATS`, first published values (ALFRED) | Free account at [fredaccount.stlouisfed.org](https://fredaccount.stlouisfed.org): 32 lowercase letters and digits | FRED allows 120 requests a minute; the app keeps to 60 |
| `SEC_USER_AGENT` | SEC filings and reported figures (`FILINGS`) | Not a key: an application name and your own contact email, for example `Armin Terminal you@example.com`. The SEC asks every automated client for one | The SEC allows 10 requests a second; the app keeps to 5 and caches answers |
| `COINGECKO_API_KEY` | Market value and circulating supply of the ten listed coins (`CRYPTO`, `PROFILE`) | Free Demo key from a CoinGecko developer account | 10,000 calls a month; the app asks once every 10 minutes |
| `MASSIVE_API_KEY` | A second source for US stock closes (`CROSSCHECK`) | Free Stocks Basic plan at [massive.com](https://massive.com/pricing?product=stocks) | 5 calls a minute, end of day; the app keeps to 5 |
| `ALPHA_VANTAGE_API_KEY` | A third source for US stock closes (`CROSSCHECK`) | Free key at [alphavantage.co](https://www.alphavantage.co/support/) | 25 requests a day; the app keeps to 20, one a minute |
| `TWELVE_DATA_API_KEY` | A fourth source for US stock closes (`CROSSCHECK`), only with the switch below | Account at [twelvedata.com](https://twelvedata.com/pricing) | Basic: 8 a minute, 800 a day, for internal, non-display use; the app keeps to 6 and 600 |

## Switches

| Name | Default | What it does |
| --- | --- | --- |
| `YAHOO_PRICES_ENABLED` | on | Yahoo Finance prices, history, company profiles and statements, holders and symbol search, from undocumented endpoints, used here for private personal use. Off stops every request to Yahoo, its streaming socket included; the lines Yahoo feeds then show no data. |
| `KRAKEN_ENABLED` | on | Kraken's public market data for the ten crypto lines. Off hands them back to Yahoo, if Yahoo is on. |
| `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` | off | Twelve Data's free plan is for internal, non-display use. Switch this on only if your Twelve Data plan allows displaying its data; until then nothing is sent to Twelve Data. |
| `DEMO_MODE` | off | Browser build only, set when building: opens straight into the demo, whose every value is simulated and marked DEMO DATA. The desktop app never runs the demo. |

Switch changes take effect after a reload of the window (Ctrl+R).

## What works with what

- No key, no account: prices and history (Yahoo Finance, personal use), crypto (Kraken, with Yahoo as the fallback), the US Treasury curve, the New York Fed's reference rates, central bank policy rates and calendars, government yields from the Bundesbank, the Bank of England, Japan's Ministry of Finance, the Bank of Canada and the RBA, statistics from the ONS, Eurostat, Statistics Canada and the ABS, and official announcements.
- Free registration or your own contact: FRED, SEC EDGAR, CoinGecko, Massive, Alpha Vantage, Twelve Data.
- End of day or as published: official yields and rates (marked REFERENCE), economic statistics, SEC filings, and the `CROSSCHECK` sources. Yahoo's quotes are real time or delayed by exchange, as Yahoo labels them; every price shows its label.
- Not covered by any source the app may use: listed option chains, analyst ratings and estimates, prices and dealer quotes for individual bonds, FX forward points, swap rates, order books beyond the best bid and offer (crypto aside), and consensus forecasts. Those screens say so instead of showing numbers.

[data-providers.md](data-providers.md) has each provider's terms, limits and the pages they come from; [limits.md](limits.md) collects the limits in one place.

## The provider screen

`PROVIDERS` lists every provider with:

- its state: LIVE or ANSWERING (its last request succeeded), ERROR (its last request failed), STALE (a provider asked continually that has stopped answering), NOT ASKED YET, NOT CONFIGURED (needs a key), SWITCHED OFF, NOT CONNECTED (planned, not built) or DISABLED (off by policy);
- the switch and key it depends on, and where their values come from;
- the last attempt, the last success with its latency, when its data last reached the screens, the requests in the last minute against the app's own ceiling, and the last problem with its kind (rate limited, not entitled, no data, provider error, timeout, network);
- its terms and links to the provider's own pages, with the date they were checked.

The same screen saves and removes keys and flips the switches. A configured key is not proof that a provider works: the state comes from the answers to real requests.
