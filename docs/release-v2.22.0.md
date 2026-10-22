# Armin Terminal 2.22.0

This release adds a market cap history for every US-listed stock, opens the earnings calendar on today, tags the largest companies, finds more supply-chain relations without adding wrong ones, and fills or explains most of the remaining blank fields. It is released for Windows only, as the portable app.

## Market cap history (MARKETCAP)

Click any market value to open it: on PROFILE, SCREEN, PEERS, TOPMOVERS, the earnings calendar and the index members. You can also type `MARKETCAP AAPL` or `MCAP AAPL`.

- **What it shows:**
  - the market value each day since 2016;
  - today's value and the share count behind it;
  - the change over 1, 3, 5 or 10 years or all of the history;
  - a bar chart and a table of the value at each year's end with the change on the year before;
  - the trading currency, or US dollars at each day's exchange rate.
- **How it is worked out:** each day's close times the shares outstanding that day. The share count is the one on the cover of the company's latest SEC filing at the time, with later stock splits applied. A company that gives its cover count by share class only (Alphabet) uses its balance sheet's count instead. A company outside the SEC keeps today's share count, and the screen says so.
- **Checked:** year-end values match published ones within about 1-2%, for example:
  - NVIDIA 2022: 359.5B; 2024: 3.29T;
  - Microsoft 2024: 3.13T;
  - Apple 2024: 3.79T;
  - Alphabet 2024: 2.31T.
- **Berkshire Hathaway:** its share count was read in Class A units, which put its market value at 753M to 771M. It is now about 1.15T, on every screen, and the float is fixed too.

## Earnings calendar (EVENTS)

- It opens on today. The earlier days of the two-week window fold into one line at the top: "Earlier in this window ... show". Choosing another window opens on today again.
- Companies worth more than $500 billion carry a **500B+** tag, and the market value filter has a $500B step.

## Supply chain (SPLC)

The 27 test companies went from 869 to 887 relations. Every new relation was checked against the statement behind it; five wrong ones were found and fixed before release.

- **The company's own report:**
  - more competitor wordings ("compete internationally with", "competition ... from");
  - equity-method investees and stated stakes, with joint ventures and their other owner ("CFM International, a 50-50 joint venture with Safran");
  - a stake the report says was sold, or a company it owns more than half of, is left out.
- **Names:**
  - a company whose name is also a word counts inside a list of companies ("Walmart, Target, Kroger, and Amazon");
  - the short names a filing defines are written out ("CCEP", "CCHBC");
  - more companies are known by their usual names: Uber, T-Mobile, Monster, Safran, Deckers, PUMA and New Balance;
  - initials no longer split a sentence ("J.C. Bamford").
- **Other companies' filings:**
  - a rival that is also a partner ("who is also our partner");
  - "partnered with Vertiv to build the data center" (a customer);
  - "partnership with Oracle to provide power" (a supplier);
  - "Boeing to take a stake" (an investment).
- Examples of what is new: Costco's competitor Target, Caterpillar's JCB, GE's CFM International and Safran, Coca-Cola's stakes in Monster and five bottlers, and NVIDIA's partners Uber and T-Mobile and its stake in Anthropic.

## Blank fields

A run of every screen found 284 blank lines in 2.21.0 and 135 now. Many of the rest are dates or headlines that contain a dash.

- **Filled from real sources:**
  - SCREEN: ROE, and beta worked out from price history.
  - CRYPTO: coins' market value and supply.
  - BONDS and CENTRALBANKS: full yield curves for Canada (Bank of Canada) and Australia (RBA).
  - US inflation and unemployment from the Bureau of Labor Statistics when no FRED key is set.
  - FINANCIALS:
    - EPS a later restatement left blank (Applied Digital FY2025);
    - Apple's FY2021 net income;
    - operating cash flow for companies that report under international standards (ASML).
  - Currencies' daily change when the price source misses a day.
  - WACC: the latest year's free cash flow when a quarter is missing.
- **Said instead of "--":**
  - "NM" for growth and multiples on losses;
  - empty cells with a note where a source publishes nothing, such as the CSI 300's year-to-date change, gilts at 2 and 30 years, and a share class without a market value;
  - plain words on PROVIDERS, FILINGS, FIELDS and the portfolio.

## Also

- **Mouse back and forward buttons** now step through a screen's tabs before leaving it, as in a browser.
- **Windows only:** releases build only the Windows files. `npm run desktop:build:portable` builds the portable app without GitHub Actions.

## Validation

- **Tests:** 1,172 unit tests, 38 browser tests and 34 desktop tests, plus ESLint, TypeScript and the production build.
- **Live:** MARKETCAP was run for Apple, NVIDIA, Microsoft, Alphabet, Berkshire Hathaway, Applied Digital and ASML on live data. SPLC was re-run for all 27 companies on live SEC filings.
