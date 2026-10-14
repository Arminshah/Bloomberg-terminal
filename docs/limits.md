# Limits and entitlements

Every provider in one table: what its free access allows, how often the app asks, and how fresh the result can be. The numbers in quotation marks, the terms and their sources are in [data-providers.md](data-providers.md). `PROVIDERS` shows the requests each provider received in the last minute against the app's own ceiling.

| Provider | Access | Published limit | How often the app asks | Freshness | Use the terms allow |
| --- | --- | --- | --- | --- | --- |
| Yahoo Finance (unofficial) | No key; undocumented endpoints | None published | Quotes every 30 s while streaming, 10 s without the stream, 60 s with the window hidden, with backoff after errors; intraday bars every 20 s for open panels; daily history three requests at a time at start | Real time or delayed by exchange, as Yahoo labels each quote (Nasdaq real time; NYMEX and COMEX 30 min; London 20 min; and so on); history end of day | Yahoo's terms forbid automated collection without permission and any redistribution. Kept for private personal use at the owner's risk; Yahoo can block it at any time |
| Kraken | No key | Public calls "at a frequency of 1 per second (or less)" stay within limits | Ticker for all ten pairs every 5 s in one request; order book every 3 s while `DEPTH` is open; candles when a chart asks | Real time as of each snapshot, timed by Kraken's server | Pricing data "only for your own benefit"; bots and third-party applications restricted without consent. Used for the owner's display only, a risk accepted as with Yahoo |
| CoinGecko | Free Demo key | 10,000 calls a month, 100 a minute | Every 10 minutes | Aggregated across exchanges, as of each answer | Attribution required; caching discouraged, refresh at least every 24 hours; kept in memory only |
| US Treasury | No key | None found | Every 30 minutes | End of day (REFERENCE): indicative bid-side quotes at about 15:30 New York time | Terms not reviewed |
| New York Fed | No key | None found | Every hour | Published about 09:00 New York time for the previous business day | Terms not reviewed (the page needs a browser) |
| Central banks, Japan's Ministry of Finance | No key | None found | Every hour | End of day or as decided (REFERENCE) | See [attribution.md](attribution.md) |
| ONS, Eurostat, Statistics Canada, ABS | No key | Statistics Canada: 50 requests a second, 25 per IP address | Every 10 minutes | As published, monthly or quarterly | Reuse with the source credited; see attribution |
| Official announcements (RSS) | No key | None found | Every 10 minutes | As each publisher posts | Source acknowledged |
| FRED | Free key | Version 1: 120 requests a minute | At most 60 a minute; series every 10 minutes, release calendars every 12 hours | As each agency publishes; release dates without times | Personal use of a subset through the API; the FRED notice; copyrighted series for personal use only |
| SEC EDGAR | Your contact in `SEC_USER_AGENT` | 10 requests a second | At most 5 a second; filing lists kept 5 minutes, company facts an hour, the company list a day | Filings as disseminated (usually within a second; XBRL within a minute) | Free to access and reuse |
| Massive | Free key (Stocks Basic) | 5 calls a minute; 2 years of history; end of day | At most 5 a minute, only from `CROSSCHECK`, answers kept an hour | End of day, split-adjusted | Personal, non-commercial, non-business use; no display or redistribution to others |
| Alpha Vantage | Free key | 25 requests a day | At most one a minute and 20 a day, only from `CROSSCHECK` | End of day, as traded; latest 100 sessions | Personal, non-commercial use; real-time and full history are premium |
| Twelve Data | Key, plus `TWELVE_DATA_DISPLAY_RIGHTS_CONFIRMED` | Basic: 8 a minute, 800 a day | Nothing until the switch is on; then at most 6 a minute and 600 a day | End of day | Basic plan: "Internal non-display usage"; display needs a plan that allows it |

## What no free source here covers

Each of these screens says so instead of showing a number:

- listed option chains, their quotes and implied volatilities (OPRA data, licensed);
- analyst ratings, price targets and consensus estimates;
- prices and dealer quotes for individual bonds, CDS and structured credit;
- FX forward points and swap rates;
- order books beyond the best bid and offer, except crypto from Kraken;
- index futures outside the US, and government yields for France, Italy, Spain, Switzerland, China, India, Brazil and Mexico, the UK's 2 and 30-year gilts and policy rates without a free daily source;
- consensus economic forecasts, news readership and licensed news, transcripts and research.
