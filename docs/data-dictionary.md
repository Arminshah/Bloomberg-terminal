# Data dictionary

Definitions of the figures the desktop app shows, the units and dates they carry, and the formulas behind the calculated ones.

## Quotes

| Field | Meaning |
| --- | --- |
| `last` | Latest price from the source, in the currency and unit the line is quoted in (pence for London lines, marked GBp). |
| `prevClose` | The previous session's close as the source reports it. |
| `time` | When the market set the latest value: the last trade, or the date of an end-of-day value. Shown as "source". |
| `fetched` | When the app received that value. Shown as "retrieved". |
| `src` | Freshness state, below. |
| `delay` | Minutes of delay, when the source gives a figure. |
| `sourceName` | The source's own name for its quote ("Nasdaq Real Time Price", "Delayed Quote"). |

Freshness states:

| State | Shown as | When |
| --- | --- | --- |
| `LIVE` | Live (provider-labelled) | The market is open and Yahoo's quote names itself real time. |
| `DELAYED` | Delayed N min (provider-labelled) | The market is open and the quote gives a delay in minutes. |
| `UNCONFIRMED` | Timing not confirmed | The market is open and the quote says neither; or no quote has arrived yet, in which case the price is the latest daily bar's and the time shows only its date ("as of"). |
| `CLOSE` | Market closed | The market is outside its regular session; the price is the last trade. |
| `STALE` | Stale | Neither the stream nor the poll has answered for two minutes while the market is open. |
| `EOD` | End of day | Official end-of-day figures (yields, policy rates). |
| `NONE` | No data | No value from the source yet. |
| `SIM` | DEMO DATA | Browser demo only: simulated. |

## Calculated figures

| Figure | Formula and inputs | Where |
| --- | --- | --- |
| Dividend yield 12M | Dividends with ex-dates in the past 365 days, divided by the live price, both in the unit the line is quoted in. Source: Yahoo's dividend history and quote. | `DES`, `BQ`, `DVD`, `EQS`, `RV` |
| P/E (LTM) | Price over the LTM diluted EPS shown beside it (the statements' trailing figure, else the sum of the last four quarters); "--" when that EPS is zero or negative. Yahoo's own trailing P/E is used only when the statements give no EPS. | `DES`, `BQ`, `RV`, `EQS` |
| P/E (FY1 est.) | Price over the FY1 consensus EPS shown beside it; "--" when that estimate is not positive. | `DES`, `BQ`, `RV` |
| Price / book | Market cap over the equity in the latest balance sheet. | `DES`, `RV` |
| LTM figures | The source's trailing figures, unless their net income, operating income or revenue differs from the sum of the last four quarters by more than 0.5%; then the sum. When a quarter has no EPS in the source, LTM EPS is LTM net income over the latest diluted shares, marked "computed". FA says which basis it shows. | `DES`, `FA` |
| Revenue | The statements' total revenue, unless the latest year differs from the company's reported revenue (the source's earnings module) by more than 5%, as when investment gains are added; then the reported revenue for every year and quarter it has. | `FA`, `DES`, `EE` |
| 52-week high and low | The highest high and lowest low over the last 365 days of daily bars. | `DES`, `BQ` |
| Enterprise value | Market cap shown, plus total debt, minus cash, from the latest balance sheet in the statements. | `DES`, `RV` |
| EBITDA | Operating income plus depreciation and amortisation, in every period. The source's own EBITDA starts from pretax income and so includes gains such as revaluations of investments. | `FA`, `GF`, `DES`, `RV` |
| EV/EBITDA | The enterprise value above over LTM EBITDA as defined above; "--" when EBITDA is zero or negative. | `DES`, `RV` |
| Holder % Out | A holder's reported position over the shares outstanding now (the source's own percentages use older share counts). "new or 2x" where the source reports +100%, which it uses for a new position as well as a doubled one. | `HDS`, `DES` |
| Option volume | Contracts traded in the underlying's latest session; a contract that last traded on an earlier day counts as 0, and its last price is greyed with that date. | `OMON` |
| Next earnings date | Confirmed only when the source says so and has the earnings call on that date; otherwise marked expected (~), without before or after market. | `DES`, `BQ`, `EE`, `EVTS` |
| Index dividend yield | The same, for the ETF that tracks the index (SPY, QQQ, DIA, IWM). | `DES`, `WEIF`, `OVME` |
| Index future fair value | index × e^((r − q) × days / 365), with r the 3-month Treasury par yield, q the index dividend yield and days to the contract's last trade date. A model, labelled as one. | `DES`, `WEIF` |
| Fed path | CME FedWatch method: a 30-day fed funds future's implied average rate is 100 − price; a meeting month splits into days before and after the decision. | `WIRP` |
| Year-on-year and month-on-month rates for US releases | From the published index levels, (level / level a year or a month earlier − 1) × 100, rounded to the decimals the agency publishes. | `ECO`, `ECST` |
| GDP growth for Japan, Canada, Australia | Real GDP level against the same quarter a year earlier: Japan's Cabinet Office series and the IMF's International Financial Statistics for Canada and Australia, on FRED. Marked * on screen. | `ECST` |
| Canada inflation | 12-month change of Statistics Canada's all-items CPI, from the published index as StatCan works it out. | `ECST` |
| Option Greeks | Black-Scholes-Merton with each contract's implied volatility from the source. | `OMON`, `OVME` |

Published rates are shown as published, not recalculated: Eurostat's HICP annual rate, GDP growth and unemployment; the ONS's CPI annual rate, GDP growth and unemployment; BEA's real GDP growth; Statistics Canada's and the ABS's unemployment rates; the ABS's monthly CPI annual change.

## Periods and dates

- Dates are ISO (YYYY-MM-DD). Monthly figures are dated by the first day of the month, quarterly ones by the first day of the quarter.
- UK unemployment is a three-month average. The ONS dates it by the middle month; the app dates it by the last month and shows the window ("May-Jul 2026").
- Eurostat flags: "estimate" for figures flagged e (flash estimates), "provisional" for p.
- US release dates come from the FRED API without a time of day; ECO shows the date and no time.
- Times on screen are in the display time zone chosen in `PDFU`. Session dates follow each exchange's own time zone.

## Missing values

A value the source does not give is shown as "--". The app does not fill gaps with defaults, estimates or simulated values. Examples: a company without a beta from the source shows no beta; a past earnings report without a date from the source shows "--" and stays off the `EVTS` calendar.
