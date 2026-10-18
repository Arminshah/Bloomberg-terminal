# Data dictionary

Definitions of the figures the desktop app shows, the units and dates they carry, and the formulas behind the calculated ones.

## Quotes

| Field | Meaning |
| --- | --- |
| `last` | Latest price from the source, in the currency and unit the line is quoted in (pence for London lines, marked GBp). |
| `prevClose` | The previous session's close. Yahoo gives two readings: its previous-close field and the close implied by its own change (last minus change). Either can be wrong: on 13 Oct 2026 the field was a session old for the Hang Seng, Shanghai, TAIEX, ASX 200, Sensex and Nifty (and by the evening for the DAX and FTSE 100), and already held the new settlement for CME livestock, while for crypto the change was the odd one out. A reading that matches the close of the previous bar in the daily history (within 0.1%) is used and marked verified. When the bars contradict every reading (they can be a contract behind after a futures roll) there is no previous close and the change shows "--". |
| `prevCloseDay` | The date of the session whose close `prevClose` is, from the daily bar that confirmed it. Shown on hover over a change: "Against the close of 10/12/26: 24,271.20". |
| `chgCheck` | `verified` when the previous close matches the previous daily bar; `unverified` when nothing has checked it yet (only the daily bars so far, the first price of a new session, or a market whose source gives a single day of history, such as the CSI 300). An unverified change is shown greyed with a "?". |
| `high`, `low` | The day's range. A full quote's own high and low replace the daily bar's, which can belong to another contract after a futures roll; a zero in the source counts as missing. |
| `time` | When the market set the latest value: the last trade, or the date of an end-of-day value. Shown as "source". |
| `fetched` | When the app received that value. Shown as "retrieved". |
| `src` | Freshness state, below. |
| `delay` | Minutes of delay, when the source gives a figure. |
| `sourceName` | The source's own name for its quote ("Nasdaq Real Time Price", "Delayed Quote"). |

Freshness. Each price carries one label, worked out from the source's own statements and timestamps (`src/data/freshness.ts`), and a separate session label (OPEN, PRE-MARKET, AFTER HOURS, OVERNIGHT, CLOSED):

| Label | Mark on a price | When |
| --- | --- | --- |
| REAL-TIME | none | The source labels the market real time and its latest price is recent enough for the instrument. |
| DELAYED | D | The source states a delay; the minutes are in the tooltip. |
| END OF DAY | E | The session is over and the price is its last, or a once-a-day value that is not an official reference. |
| REFERENCE | R | An official value published once a day: Treasury yields, central bank rates, official government yields. |
| STALE | S | Older than the instrument's threshold (10 minutes for currencies, crypto and indices, 30 for stocks and futures, beyond any stated delay) while its market should be updating; a daily series older than five days; or the source stopped answering. |
| UNKNOWN FRESHNESS | ? | The source does not say whether the price is real time or delayed, or no quote has arrived yet and the price is the latest daily bar's. |
| DEMO DATA | DEMO | Browser demo only: simulated. |

"--" means no value from the source.

## Calculated figures

User-input bond, FX-forward, fixed/float swap and European-option conventions are defined in [calculator conventions](calculators.md), including units, curve interpolation, risk bump definitions and excluded contract features.

| Figure | Formula and inputs | Where |
| --- | --- | --- |
| Dividend yield 12M | Dividends with ex-dates in the past 365 days, divided by the live price, both in the unit the line is quoted in. Source: Yahoo's dividend history and quote. | `PROFILE`, `QUOTE`, `DIVIDENDS`, `SCREEN`, `PEERS` |
| P/E (LTM) | Price over the LTM diluted EPS shown beside it (the statements' trailing figure, else the sum of the last four quarters); "--" when that EPS is zero or negative. Yahoo's own trailing P/E is used only when the statements give no EPS. | `PROFILE`, `QUOTE`, `PEERS`, `SCREEN` |
| Price / book | Market cap over the equity in the latest balance sheet. | `PROFILE`, `PEERS` |
| LTM figures | The source's trailing figures, unless their net income, operating income or revenue differs from the sum of the last four quarters by more than 0.5%; then the sum. When a quarter has no EPS in the source, LTM EPS is LTM net income over the latest diluted shares, marked "computed". FINANCIALS says which basis it shows. | `PROFILE`, `FINANCIALS` |
| Revenue | The statements' total revenue, unless the latest year differs from the company's reported revenue (the source's earnings module) by more than 5%, as when investment gains are added; then the reported revenue for every year and quarter it has. | `FINANCIALS`, `PROFILE`, `EARNINGS` |
| 52-week high and low | The highest high and lowest low over the last 365 days of daily bars. | `PROFILE`, `QUOTE` |
| Enterprise value | Market cap shown, plus total debt, minus cash, from the latest balance sheet in the statements. | `PROFILE`, `PEERS` |
| EBITDA | Operating income plus depreciation and amortisation, in every period. The source's own EBITDA starts from pretax income and so includes gains such as revaluations of investments. | `FINANCIALS`, `FUNDCHART`, `PROFILE`, `PEERS` |
| EV/EBITDA | The enterprise value above over LTM EBITDA as defined above; "--" when EBITDA is zero or negative. | `PROFILE`, `PEERS` |
| Holder % Out | A holder's reported position over the shares outstanding now (the source's own percentages use older share counts). "new or 2x" where the source reports +100%, which it uses for a new position as well as a doubled one. | `HOLDERS`, `PROFILE` |
| Next earnings date | Confirmed only when the source says so and has the earnings call on that date; otherwise marked expected (~), without before or after market. | `PROFILE`, `QUOTE`, `EARNINGS`, `EVENTS` |
| Index dividend yield | The same, for the ETF that tracks the index (SPY, QQQ, DIA, IWM). | `PROFILE`, `INDEXFUTURES`, `OPTIONCALC` |
| Index future fair value | index × e^((r − q) × days / 365), with r the 3-month Treasury par yield, q the index dividend yield and days to the contract's last trade date. A model, labelled as one. | `PROFILE`, `INDEXFUTURES` |
| Fed path | CME FedWatch method: a 30-day fed funds future's implied average rate is 100 − price; a meeting month splits into days before and after the decision. | `RATEPROBS` |
| Market timers | Time until the regular session opens or closes: NYSE 09:30 to 16:00 New York time, Euronext 09:00 to 17:30 Brussels time, with holidays and early closes from each exchange's published rules. | Top bar, `HOLIDAYS` |
| Close gap | (other source's close / the app's close − 1) × 10,000, in basis points, for sessions past their NYSE regular or early close in New York time; over 5 bp is marked. The app's source is named on screen. IEX closes cover one exchange and can differ from market-wide closing prices. | `CROSSCHECK` |
| Crypto change on the day | Kraken's last price against the close of its previous daily candle (UTC days). | `CRYPTO`, `QUOTE` |
| First release | The value an agency first published for a period (FRED's ALFRED vintages), beside today's value and the day it was first published. | `MACRO` |
| Year-on-year and month-on-month rates for US releases | From the published index levels, (level / level a year or a month earlier − 1) × 100, rounded to the decimals the agency publishes. | `RELEASES`, `ECONSTATS` |
| GDP growth for Japan, Canada, Australia | Real GDP level against the same quarter a year earlier: Japan's Cabinet Office series and the IMF's International Financial Statistics for Canada and Australia, on FRED. Marked * on screen. | `ECONSTATS` |
| Canada inflation | 12-month change of Statistics Canada's all-items CPI, from the published index as StatCan works it out. | `ECONSTATS` |
| Option value and Greeks | European Black-Scholes-Merton with explicit/manual or named reference inputs. Volatility is manual, realised history, or solved from a manual premium in IV mode; those sources remain distinct. See calculator conventions for units and bounds. | `OPTIONCALC` |
| Strategy expiry P&L | Signed stock/option intrinsic payoffs less entry premiums/cost; extrema and breakevens cover the entire nonnegative spot domain, including unlimited tails. Model Greeks/scenarios use European BSM. | `OPTIONSTRATEGY` |
| Bond Z-spread | Constant continuous spread added to an entered zero curve so discounted cash flows match dirty price; Z01 bumps that spread, holding the curve fixed. G-spread compares matching-compounding nominal yields. | `BONDCALC` |
| Indicative option fields | Alpaca provider bids/asks, delayed trades, IV and Greeks, with independent source event times. Not OPRA or executable prices; no missing open interest/volume/deliverable is inferred. | `OPTIONS` |

Published rates are shown as published, not recalculated: Eurostat's HICP annual rate, GDP growth and unemployment; the ONS's CPI annual rate, GDP growth and unemployment; BEA's real GDP growth; Statistics Canada's and the ABS's unemployment rates; the ABS's monthly CPI annual change.

## Periods and dates

- Dates are ISO (YYYY-MM-DD). Monthly figures are dated by the first day of the month, quarterly ones by the first day of the quarter.
- UK unemployment is a three-month average. The ONS dates it by the middle month; the app dates it by the last month and shows the window ("May-Jul 2026").
- Eurostat flags: "estimate" for figures flagged e (flash estimates), "provisional" for p.
- US release dates come from the FRED API without a time of day; RELEASES shows the date and no time.
- Times on screen are in the display time zone chosen in `SETTINGS`. Session dates follow each exchange's own time zone.

## Missing values

A value the source does not give is shown as "--". The app does not fill gaps with defaults, estimates or simulated values. Examples: a company without a beta from the source shows no beta; a past earnings report without a date from the source shows "--" and stays off the `EVENTS` calendar.
