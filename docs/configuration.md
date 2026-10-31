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
| `SEC_USER_AGENT` | SEC filings and reported figures (`FILINGS`), executives' pay from proxy statements (`MANAGEMENT`), the latest 8-Ks and SEC press releases | Not a key: an application name and your own contact email, for example `Armin Terminal you@example.com`. The SEC asks every automated client for one | The SEC allows 10 requests a second; the app keeps to 5 and caches answers |
| `COINGECKO_API_KEY` | Market value and circulating supply of the ten listed coins (`CRYPTO`, `PROFILE`) | Free Demo key from a CoinGecko developer account | 10,000 calls a month; the app asks once every 10 minutes |
| `MASSIVE_API_KEY` | A second source for US stock closes (`CROSSCHECK`); market and ticker news (`MARKETNEWS`, `COMPANYNEWS`) | Free Stocks Basic plan at [massive.com](https://massive.com/pricing?product=stocks) | 5 calls a minute, end of day, news updated hourly; the app keeps to 5 for both together, market news every 15 minutes and a company's every 30 |
| `ALPHA_VANTAGE_API_KEY` | A third source for US stock closes (`CROSSCHECK`) | Free key at [alphavantage.co](https://www.alphavantage.co/support/) | 25 requests a day; the app keeps to 20, one a minute |
| `TWELVE_DATA_API_KEY` | A fourth source for US stock closes (`CROSSCHECK`), only with the switch below | Account at [twelvedata.com](https://twelvedata.com/pricing) | Basic: 8 a minute, 800 a day, for internal, non-display use; the app keeps to 6 and 600 |
| `TIINGO_API_KEY` | Another source for US stock closes (`CROSSCHECK`) | Free Starter account at [tiingo.com](https://www.tiingo.com/about/pricing) | 50 an hour, 1,000 a day, internal use only, no storage on disk; the app keeps to 1 a minute, 40 an hour and 500 a day, in memory |
| `FMP_API_KEY` | Analyst price targets, ratings, rating actions and estimates (`ANALYSTS`, `EARNINGS`) | Free account at [financialmodelingprep.com](https://site.financialmodelingprep.com/pricing-plans) | 250 requests a day; the app keeps to 220 and keeps answers 6 to 24 hours |
| `FINNHUB_API_KEY` | Market, merger and company news (`MARKETNEWS`, `COMPANYNEWS`, `QUOTE`); US company ratios, recommendation trends, EPS surprises, the past year's reports with revenue expected and reported, the next report (`PROFILE`, `ANALYSTS`, `EARNINGS`), companies in the same sub-industry (`PEERS`) | Free account at [finnhub.io](https://finnhub.io). The API key is 20 characters on older accounts and 40 on newer ones; the webhook secret shown under it is not an API key | 60 a minute, personal use; the app keeps to 30, asks every 5 to 15 minutes while a screen shows news and keeps company data 6 to 24 hours |
| `MARKETAUX_API_TOKEN` | News tagged with tickers, with sentiment (`MARKETNEWS`, `COMPANYNEWS`) | Free account at [marketaux.com](https://www.marketaux.com/pricing) | 100 requests a day, 3 articles each; the app keeps to 90, one request for the whole watchlist an hour |
| `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` | IEX stock quotes and indicative option snapshots on `OPTIONS`; Benzinga news (`MARKETNEWS`, `COMPANYNEWS`, `QUOTE`) | Own [Alpaca account](https://alpaca.markets/data), subject to dataset entitlement | Read-only data host; IEX stock polling, option refresh manual with up to 5 pages, 15-second option cache; no paid OPRA selection; news every 5 to 10 minutes, 15 minutes after publication on the free plan |
| `ANTHROPIC_API_KEY` | Claude answers the help desk's questions (`MESSAGES`), with the app's data as tools | Key beginning `sk-ant-` from [console.anthropic.com](https://console.anthropic.com/) | Billed per token by Anthropic (Claude Opus 5.5: $4 per million input tokens, $20 per million output); a question takes 1 to 8 requests; the app stops at 400 requests a day |
| `EIA_API_KEY` | Natural gas storage history, weekly petroleum figures and monthly gas production and consumption (`NGAS`, `OILMARKET`); the weekly storage report needs no key | Free key from [eia.gov/opendata/register.php](https://www.eia.gov/opendata/register.php), 40 letters and digits, sent as the `api_key` parameter | EIA suspends a key that asks too often; the app asks each dataset at most every 30 minutes |
| `BEA_API_KEY` | US national accounts on `NIPA`: contributions to real GDP growth (Table 1.1.2) and personal income, spending and saving (Table 2.6) | Free UserID from [apps.bea.gov/API/signup](https://apps.bea.gov/API/signup/), a 36-character GUID, sent as the `UserID` parameter; BEA's echo of it is removed in the main process | 100 requests, 100 MB and 30 errors a minute; the app asks two tables, each kept six hours |
| `CONGRESS_GOV_API_KEY` | Bills and laws in Congress (`LEGISLATION`, typed as BILL): the latest bills, the laws of the current Congress, and each bill's sponsor, cosponsors, committees, summary, actions and text | Free key from [api.congress.gov/sign-up](https://api.congress.gov/sign-up/) (an api.data.gov key, 40 letters and digits), sent in the X-Api-Key header | 5,000 requests an hour; the app sends at most 60 a minute, keeps lists 30 minutes and a bill's details an hour |
| `OPENFIGI_API_KEY` | Optional: faster ticker lookups for the holdings of a company's 13F (`HOLDINGS`). OpenFIGI answers without it | Key from a free account at [openfigi.com](https://www.openfigi.com/api) (a UUID) | 25 requests a minute of 10 codes without a key, 250 of 100 with one; the app keeps to 20 and 200 and keeps each answer a week |
| `TIPRANKS_API_KEY` | Analyst consensus, average price target and rating actions on `ANALYSTS`, US and some other markets, when you click | Key beginning `tr_live_` from [mcp.tipranks.com](https://mcp.tipranks.com/) | 50 calls a month and 10 a minute on the free plan, every call counted; the app stops at 45 a month and keeps answers in memory for an hour |

## Switches

| Name | Default | What it does |
| --- | --- | --- |
| `YAHOO_PRICES_ENABLED` | on | Yahoo Finance prices, history, company profiles and statements, holders and symbol search, from undocumented endpoints, used here for private personal use. Off stops every request to Yahoo, its streaming socket included; the lines Yahoo feeds then show no data. |
| `YAHOO_RESEARCH_ENABLED` | on | Yahoo research fallback for FMP/Finnhub refusals: targets, recommendations, rating actions and annual estimates; and the analysts' expected EPS and revenue against the reports on `EARNINGS`, `EVENTS` and the help desk. Requires Yahoo prices enabled. Off strips analyst modules/fields from Yahoo answers. |
| `KRAKEN_ENABLED` | on | Kraken's public market data for the ten crypto lines. Off hands them back to Yahoo, if Yahoo is on. |
| `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` | off | Twelve Data's free plan is for internal, non-display use. Switch this on only if your Twelve Data plan allows displaying its data; until then nothing is sent to Twelve Data. |
| `MARKETWATCH_RSS_ENABLED` | off | MarketWatch's top stories feed on `MARKETNEWS`. Dow Jones's terms bar automated access to its content, RSS feeds included, without written consent; switch it on only if you accept that risk for your own use. |
| `OPENFIGI_ENABLED` | on | Tickers for the CUSIPs a 13F lists (`HOLDINGS`); only the CUSIPs are sent. Off shows the holdings without tickers or today's prices. |
| `TIPRANKS_ENABLED` | on | TipRanks on `ANALYSTS`, only when you click; the usage check is free. |
| `CLAUDE_HELPDESK_ENABLED` | on | With `ANTHROPIC_API_KEY` set, Claude answers the help desk's questions; your questions and the figures it looks up go to Anthropic. Off, or without the key, the built-in assistant answers from the same sources and nothing goes to Anthropic. |
| `YAHOO_RSS_ENABLED` | on | Yahoo Finance's headline feed for the stock on screen (`COMPANYNEWS`, `QUOTE`), any market Yahoo lists. |
| `EURONEXT_RSS_ENABLED` | on | Euronext's feed of the latest company press releases on `MARKETNEWS`. |
| `GOOGLE_NEWS_RSS_ENABLED` | on | Google News's search for the day's market news on `MARKETNEWS` (US and UK editions), and for the stock on screen in its market's languages on `COMPANYNEWS` and `QUOTE`. No key. Google's feeds are for a personal feed reader, for personal, non-commercial use. |
| `MASSIVE_NEWS_ENABLED` | on | Massive's market and ticker news, while `MASSIVE_API_KEY` is set. Off leaves Massive's 5 calls a minute to `CROSSCHECK`. |
| `ALPACA_IEX_PRICES_ENABLED` | off | Use Alpaca IEX-only prices for US equities in watchlists and panels. Both keys and `ALPACA_ENABLED` are required. Reload to apply. The last price, previous close and the latest two daily bars are IEX's; earlier days on charts and in 52-week or period figures are consolidated daily bars from Yahoo. Intraday history contains snapshots observed while the app is open. |
| `FMP_ENABLED`, `FINNHUB_ENABLED`, `MARKETAUX_ENABLED`, `ALPACA_ENABLED`, `TIINGO_ENABLED` | on | Each keyed source added in 2.1.0 is used while its key is set; its switch off stops every request to it. |
| `DEMO_MODE` | off | Browser build only, set when building: opens straight into the demo, whose every value is simulated and marked DEMO DATA. The desktop app never runs the demo. |

Switch changes take effect after a reload of the window (Ctrl+R).

## What works with what

- No key, no account: prices and history (Yahoo Finance, personal use), crypto (Kraken, with Yahoo as the fallback), the US Treasury curve, the New York Fed's reference rates, central bank policy rates and calendars, government yields from the Bundesbank, the Bank of England, Japan's Ministry of Finance, the Bank of Canada and the RBA, statistics from the ONS, Eurostat, Statistics Canada and the ABS, EIA's weekly gas storage report, the CFTC's Commitments of Traders (`COT`; the CFTC's optional Socrata app token is not needed for the few requests the app makes), the Treasury's Fiscal Data (`DEBTPROFILE T GOVT`), and official announcements.
- Free registration or your own contact: FRED, SEC EDGAR, CoinGecko, Massive, Alpha Vantage, Twelve Data, Tiingo, Financial Modeling Prep, Finnhub, Marketaux, Alpaca.
- End of day or as published: official yields and rates (marked REFERENCE), economic statistics, SEC filings, the `CROSSCHECK` sources, and analyst research (as of FMP's answer). Yahoo's quotes are real time or delayed by exchange, as Yahoo labels them; Alpaca's are real time for IEX alone and marked IEX only; every price shows its label.
- Options: `OPTIONS AAPL` / `AAPL OMON` opens on Nasdaq's delayed composite chain (no key): bid, ask, last, volume and open interest for US stocks, ETFs, NDX and XND, with the app's IVM and Greeks. Source > Alpaca indicative uses Alpaca's indicative quotes and delayed trades with provider IV/Greeks and source times; it needs both keys and `ALPACA_ENABLED`, and may be refused for an account. Neither is real-time OPRA; SPX, RUT and VIX options have no free source the app may use.
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

Finnhub keys are preserved in full. If an older build shortened a saved key and Finnhub returns HTTP 401, re-save the complete REST API key from the dashboard. The app cannot reconstruct a truncated saved value; webhook secrets do not authenticate data requests.
