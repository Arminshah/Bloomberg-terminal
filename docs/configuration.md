# Configuration

Every setting below is read by the desktop app's main process only. No key is built into the app, sent to a screen, written to a log or included in an error message, and a key in the wrong format is never sent.

## Where a value comes from

For each name, the first of these that has a value wins:

1. An environment variable of the same name.
2. A `.env` file in the project folder, only when running from source (`npm run desktop`). Copy `.env.example` to start one; git ignores it.
3. A value saved on the `PROVIDERS` screen. Keys are encrypted with the system's key store (Windows: DPAPI; Linux: GNOME Keyring or KWallet). On a Linux system without a keyring the app refuses to save keys, and they can only come from environment variables.

`PROVIDERS` shows where each value came from, and cannot change a value fixed by the environment or `.env`.

### Pasting all keys at once

`PROVIDERS` has a box, "Save these keys", that takes a whole list pasted in one go: lines such as `FMP_API_KEY = ...`, or a site name followed by its key (`finnhub.io: ...`, `site.financialmodelingprep.com: ...`, `app.alpaca.markets: ...`), numbered or not. Each key it recognises is saved through the same encrypted store as the Save button next to each field, the box is cleared, and the screen lists the names it saved and the lines it skipped, with the reason, never the values. A key set by the environment or `.env` still wins over a saved one. Lines that name no provider (a heading, Finnhub's webhook block, TipRanks' usage notes) are counted and ignored; a Finnhub webhook secret is never saved as the API key. Each key also keeps its own field on the screen, so an expired or replaced key can be typed, replaced or removed one at a time.

The aliases `MARKETAUX_API_KEY`, `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `APCA_API_KEY_ID`, `APCA_API_SECRET_KEY` and `FINANCIAL_MODELING_PREP_API_KEY` are accepted in imports and environment configuration. The canonical name wins within a source; environment settings take precedence over `.env` and saved keys. Import accepts Markdown contact links and preserves padding in Alpaca secrets. Ambiguous lines are refused with no key echoed.

## Keys

| Name | What it enables | How to get it | Free plan, as the app uses it |
| --- | --- | --- | --- |
| `FRED_API_KEY` | US economic releases (`RELEASES`), the macro dashboard (`MACRO`), FRED's series for Japan in `ECONSTATS`, first published values (ALFRED) | Free account at [fredaccount.stlouisfed.org](https://fredaccount.stlouisfed.org): 32 lowercase letters and digits | FRED allows 120 requests a minute; the app keeps to 60 |
| `SEC_USER_AGENT` | SEC filings and reported figures (`FILINGS`) | Not a key: an application name and your own contact email, for example `Armin Terminal you@example.com`. The SEC asks every automated client for one | The SEC allows 10 requests a second; the app keeps to 5 and caches answers |
| `COINGECKO_API_KEY` | Market value and circulating supply of the ten listed coins (`CRYPTO`, `PROFILE`) | Free Demo key from a CoinGecko developer account | 10,000 calls a month; the app asks once every 10 minutes |
| `MASSIVE_API_KEY` | A second source for US stock closes (`CROSSCHECK`) | Free Stocks Basic plan at [massive.com](https://massive.com/pricing?product=stocks) | 5 calls a minute, end of day; the app keeps to 5 |
| `ALPHA_VANTAGE_API_KEY` | A third source for US stock closes (`CROSSCHECK`) | Free key at [alphavantage.co](https://www.alphavantage.co/support/) | 25 requests a day; the app keeps to 20, one a minute |
| `TWELVE_DATA_API_KEY` | A fourth source for US stock closes (`CROSSCHECK`), only with the switch below | Account at [twelvedata.com](https://twelvedata.com/pricing) | Basic: 8 a minute, 800 a day, for internal, non-display use; the app keeps to 6 and 600 |
| `TIINGO_API_KEY` | Another source for US stock closes (`CROSSCHECK`) | Free Starter account at [tiingo.com](https://www.tiingo.com/about/pricing) | 50 an hour, 1,000 a day, internal use only, no storage on disk; the app keeps to 1 a minute, 40 an hour and 500 a day, in memory |
| `FMP_API_KEY` | Analyst price targets, ratings, rating actions and estimates (`ANALYSTS`, `EARNINGS`) | Free account at [financialmodelingprep.com](https://site.financialmodelingprep.com/pricing-plans) | 250 requests a day; the app keeps to 220 and keeps answers 6 to 24 hours |
| `EQUIBLES_API_KEY` | Eight manual read-only research datasets on `ANALYSTS`, including analyst estimates | Key beginning `eq_` from the [Equibles dashboard](https://equibles.com/dashboard/apikeys) | 100/day shared with REST/MCP/other clients; app caps all transport requests at 90/day, caches reports six hours |
| `FINNHUB_API_KEY` | Market and company news (`MARKETNEWS`, `COMPANYNEWS`, `QUOTE`); US company ratios, recommendation trends, EPS surprises and the next report (`PROFILE`, `ANALYSTS`, `EARNINGS`) | Free account at [finnhub.io](https://finnhub.io). The API key is 20 characters on older accounts and 40 on newer ones; the webhook secret shown under it is not an API key | 60 a minute, personal use; the app keeps to 30, asks every 5 to 15 minutes while a screen shows news and keeps company data 6 to 24 hours |
| `MARKETAUX_API_TOKEN` | News tagged with tickers, with sentiment (`MARKETNEWS`, `COMPANYNEWS`) | Free account at [marketaux.com](https://www.marketaux.com/pricing) | 100 requests a day, 3 articles each; the app keeps to 90, one request for the whole watchlist an hour |
| `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | IEX stock quotes and indicative option snapshots on `OPTIONS` | Own [Alpaca account](https://alpaca.markets/data), subject to dataset entitlement | Read-only data host; IEX stock polling, option refresh manual with up to 5 pages, 15-second option cache; no paid OPRA selection |
| `TIPRANKS_API_KEY` | Nothing yet: saved for a later version | [mcp.tipranks.com](https://mcp.tipranks.com/docs) | 50 requests a month on the free plan |

## Switches

| Name | Default | What it does |
| --- | --- | --- |
| `EQUIBLES_ENABLED` | on | Allows explicit company research requests on ANALYSTS and in diagnostics; no polling, trading or portfolio writes |
| `YAHOO_PRICES_ENABLED` | on | Yahoo Finance prices, history, company profiles and statements, holders and symbol search, from undocumented endpoints, used here for private personal use. Off stops every request to Yahoo, its streaming socket included; the lines Yahoo feeds then show no data. |
| `KRAKEN_ENABLED` | on | Kraken's public market data for the ten crypto lines. Off hands them back to Yahoo, if Yahoo is on. |
| `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` | off | Twelve Data's free plan is for internal, non-display use. Switch this on only if your Twelve Data plan allows displaying its data; until then nothing is sent to Twelve Data. |
| `MARKETWATCH_RSS_ENABLED` | off | MarketWatch's top stories feed on `MARKETNEWS`. Dow Jones's terms bar automated access to its content, RSS feeds included, without written consent; switch it on only if you accept that risk for your own use. |
| `YAHOO_RSS_ENABLED` | on | Yahoo Finance's headline feed for the stock on screen (`COMPANYNEWS`, `QUOTE`), any market Yahoo lists. |
| `EURONEXT_RSS_ENABLED` | on | Euronext's feed of the latest company press releases on `MARKETNEWS`. |
| `ALPACA_IEX_PRICES_ENABLED` | off | Use Alpaca IEX-only prices for US equities in watchlists and panels. Both keys and `ALPACA_ENABLED` are required. Reload to apply. Daily history is limited to previous/current IEX bars; intraday history contains snapshots observed while the app is open. Yahoo price history is kept separate. |
| `FMP_ENABLED`, `FINNHUB_ENABLED`, `MARKETAUX_ENABLED`, `ALPACA_ENABLED`, `TIINGO_ENABLED` | on | Each keyed source added in 2.1.0 is used while its key is set; its switch off stops every request to it. |
| `DEMO_MODE` | off | Browser build only, set when building: opens straight into the demo, whose every value is simulated and marked DEMO DATA. The desktop app never runs the demo. |

Switch changes take effect after a reload of the window (Ctrl+R).

## What works with what

- No key, no account: prices and history (Yahoo Finance, personal use), crypto (Kraken, with Yahoo as the fallback), the US Treasury curve, the New York Fed's reference rates, central bank policy rates and calendars, government yields from the Bundesbank, the Bank of England, Japan's Ministry of Finance, the Bank of Canada and the RBA, statistics from the ONS, Eurostat, Statistics Canada and the ABS, and official announcements.
- Free registration or your own contact: FRED, SEC EDGAR, CoinGecko, Massive, Alpha Vantage, Twelve Data, Tiingo, Financial Modeling Prep, Finnhub, Marketaux, Alpaca.
- End of day or as published: official yields and rates (marked REFERENCE), economic statistics, SEC filings, the `CROSSCHECK` sources, and analyst research (as of FMP's answer). Yahoo's quotes are real time or delayed by exchange, as Yahoo labels them; Alpaca's are real time for IEX alone and marked IEX only; every price shows its label.
- Options: `OPTIONS AAPL` / `AAPL OMON` uses indicative quotes and delayed trades, provider IV/Greeks, actual returned contract expiries and source times. It is not real-time OPRA, provides no index options/open interest/daily volume and may be refused for an account. Configure both keys and `ALPACA_ENABLED`, then refresh. No stock IEX price-mode switch is needed for options.
- Not supplied by connected sources: real-time OPRA option chains, quarterly estimates/earnings surprises, individual bond/dealer quotes, dealer FX-forward points/swap curves, order books beyond BBO (crypto aside), and economic consensus forecasts. `BONDCALC`, `FXFORWARD`, `SWAPCALC`, `OPTIONCALC` and `OPTIONSTRATEGY` calculate from explicit inputs; see [conventions](calculators.md).

[data-providers.md](data-providers.md) has each provider's terms, limits and the pages they come from; [limits.md](limits.md) collects the limits in one place.

## Cloud development credentials

Enter credentials securely in environment settings using the canonical names above, then save and publish the environment configuration. Chat text does not populate the running process. The cloud draft declares the required API hosts and names, never key values. Alpaca credentials are scoped to `data.alpaca.markets`; trading hosts are not needed.

A proxy `CONNECT 403` means the cloud network policy blocked the connection before the provider could validate a key. Keep that separate from a provider's HTTP 401/402/403 response. Saving a draft alone does not apply it to the current runtime or prove that the keys work.

## The provider screen

`PROVIDERS` lists every provider with:

- its state: LIVE or ANSWERING (its last request succeeded), ERROR (its last request failed), STALE (a provider asked continually that has stopped answering), NOT ASKED YET, NOT CONFIGURED (needs a key), SWITCHED OFF, NOT CONNECTED (planned, not built) or DISABLED (off by policy);
- the switch and key it depends on, and where their values come from;
- the last attempt, the last success with its latency, when its data last reached the screens, the requests in the last minute against the app's own ceiling, the requests today against the daily allowance where the free plan has one (the count restarts at midnight UTC and survives a restart), and the last problem with its kind (rate limited, not entitled, no data, provider error, timeout, network);
- its terms and links to the provider's own pages, with the date they were checked.

The same screen saves and removes keys and flips the switches. A configured key is not proof that a provider works: the state comes from the answers to real requests.
