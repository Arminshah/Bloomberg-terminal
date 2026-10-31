# Armin Terminal 2.11.0

- MESSAGES: the help desk answers questions about any stock or the market from the app's sources: next earnings and expectations, beat or miss, SEC filings, analyst consensus, news, profile, officers, dividends, valuation, movers and which screen does what. With `ANTHROPIC_API_KEY` on PROVIDERS, Claude answers open questions with the same data (billed by Anthropic; at most 400 requests a day).
- EARNINGS and EVENTS: the analysts' expected EPS and revenue against each report, beat or miss in percent, growth on the year and the quarter, and the next quarter's expectations (Yahoo Finance research; Finnhub with your key).
- WATCHLIST and FAVOURITES: pre-market and after-hours columns for stocks.
- MANAGEMENT: Yahoo's pay labelled as salary and bonus; executives' total compensation from the latest proxy statement (needs `SEC_USER_AGENT`).
- PEERS: companies in the same industry instead of the whole sector.
- News: BREAKING, FAVOURITES with stars and command-line suggestions, NEWS search, more sources on every news screen, more official feeds.
- ANALYSTS: Equibles research shown as tables and links instead of raw Markdown.
- The panel link selector no longer overlaps its text.
