# Armin Terminal 2.23.0

This release corrects the figures an independent audit of 2.22.0 found wrong, fills the profiles of European stocks, and shows every currency's daily change. 2.22.0 was not published on its own, so its changes are included here too: a market cap history for every US-listed stock, an earnings calendar that opens on today with a 500B+ tag, more supply-chain relations, and far fewer blank fields. Windows only.

## Corrections from the audit

- **SHORTINTEREST:** every settlement was divided by today's float and shares.
  - % Shrs Out now takes the shares outstanding at each settlement: the count on the cover of the SEC filing dated on or before it, with a split between the two dates applied. Hover a figure for the count and its date. APLD on 30/09/26: 19.43%.
  - No source publishes a float for past dates, so % of float is given for the latest settlement only, labelled as today's float. Its change across settlements is gone.
  - The CSV gives the share count used and its date for each settlement.
- **ESTIMATES (consensus overview):**
  - The market value was the price times a statement period's weighted diluted share count. It is now today's shares outstanding, the same count as the quote's market value.
  - A missing debt or cash balance counted as zero in enterprise value. EV and its multiples are now left out unless both are known, and the note says which is missing.
- **DIVIDENDS for London stocks:** the indicated yield divided a rate in pence by a price in pounds, so it read 100 times too high. Unilever now reads 3.25%. Stocks added through the online lookup keep the rate in pence too.
- **MARKETCAP:** each day now takes the latest share count filed before that day; a revision applies from its filing date on. Nothing published later reaches an earlier day. Held and scaled share counts are labelled as estimates. The CSV gives each year's shares, the count's date, its filing date and the basis. Year-end values are unchanged, for example NVIDIA 2024: 3.29T; Apple 2024: 3.79T.

## Buybacks

- Coca-Cola files its repurchased shares in whole millions, so a quarter of "1 million shares" for $102 million gave an average price of 102.00 while the stock traded near 70.
- Where the rounding of a filed share count could move the average price by more than 1%, the count is marked ~ and no average is given.
- When the filings give no share count for one of the last four quarters, the headline names that quarter instead of showing three dashes. Coca-Cola's annual report gives no full-year count, so its fourth quarter can't be worked out.

## European stocks (ASML, LVMH, SAP and others)

- The market value and share count load as soon as the profile or MARKETCAP opens, instead of waiting for every other stock's count.
- Without the source's beta, the profile shows the one BETA works out: two years of weekly returns against the local index, marked *. ASML against the AEX: 1.51.
- Short interest reads "US listings only". Exchanges elsewhere publish only large individual short positions.
- Without an ownership breakdown, one line says so instead of three dashes.

## Currencies

The daily change no longer goes blank when the price source's previous close and its daily bar disagree.
- Yahoo's daily currency bars close at the start of each day.
- A previous close within 0.5% of the session's first price is now used, marked unverified (USD/MXN after the peso fell 1.5%).
- Without that first price, a previous close within 1% of the bar is used (NZD/USD, USD/CNY).

## From 2.22.0

### Market cap history (MARKETCAP)

- Click any market value to open it: on PROFILE, SCREEN, PEERS, TOPMOVERS, the earnings calendar and the index members. You can also type `MARKETCAP AAPL` or `MCAP AAPL`.
- It shows:
  - the market value each day since 2016, and today's value with the share count behind it;
  - the change over 1, 3, 5 or 10 years or the whole history;
  - each year-end's value with its change, as a chart and a table;
  - values in the trading currency or in US dollars.
- Berkshire Hathaway's share count was read in Class A units, which put its market value at about 760M. It is now about 1.15T on every screen.

### Earnings calendar (EVENTS)

- It opens on today. The earlier days of the two-week window fold into one line at the top.
- Companies worth more than $500 billion carry a **500B+** tag, and the market value filter has a $500B step.

### Supply chain (SPLC)

The 27 test companies went from 869 to 887 relations, each checked against the statement behind it.
- More competitor wordings, and stakes and joint ventures from the company's own report.
- Short names a filing defines are written out ("CCEP").
- Partners, customers and stakes found in other companies' filings. Examples: Costco's competitor Target, GE's CFM International and Safran, Coca-Cola's stakes in Monster and its bottlers, and NVIDIA's partners Uber and T-Mobile.

### Blank fields

A run of every screen found 284 blank lines in 2.21.0. Most are now filled from real sources or explained in words:
- **Filled:**
  - SCREEN's ROE and beta;
  - crypto market values;
  - Canadian and Australian yield curves;
  - US inflation and unemployment from the BLS;
  - missing EPS, net income and IFRS operating cash flow.
- **Explained:** "NM" for multiples on losses, and notes where a source publishes nothing.

### Also

- The mouse's back and forward buttons step through a screen's tabs before leaving it.

## Validation

- **Tests:** 1,188 unit tests, 38 browser tests and 34 desktop tests, plus ESLint, TypeScript and the production build. New tests reproduce each audit finding and its fix.
- **Live:** the corrected screens were run on live data in the desktop app:
  - SHORTINTEREST for APLD; ESTIMATES for APLD and Coca-Cola;
  - DIVIDENDS for Unilever and Shell;
  - MARKETCAP for NVIDIA and Apple;
  - BUYBACKS for Coca-Cola, Apple and NVIDIA;
  - the profiles of ASML, LVMH and SAP;
  - the currency monitor.
- **Not checked from the test machine:** Yahoo refuses its sessions, so European analyst estimates and some profile fields could not be checked there. They load from Yahoo on a normal connection.
