# Armin Terminal 2.9.0

Closer to the real terminal's screens and conventions: Belgian and other European markets, Bloomberg's beta defaults, bond day counts, WIRP columns as Bloomberg shows them, analyst figures on the profile and quote, short interest, a management screen, splits and dividend growth, and the share-price reaction to earnings. Everything in 2.8.1 is included.

## European markets

- `MARKET` (WEI) shows BEL 20, OMX Stockholm 30, ATX, PSI and ISEQ next to the other European indices, with their year-to-date change in local currency and in dollars. OBX is left out: Yahoo gives it no price history.
- `ECONSTATS` lists Belgium with the euro-area countries: inflation (HICP), unemployment and GDP growth from Eurostat, BEL 20 as its market line and the ECB rate as its policy rate.
- `FXMATRIX` adds the Swedish, Norwegian and Danish krone, the Polish zloty and the Czech koruna, with euro crosses; `FXRANK` adds the last three.

## Conventions as Bloomberg uses them

- `BETA` defaults to two years of weekly returns against the stock's local index: S&P 500 for US stocks, BEL 20 for Belgian ones, DAX, CAC 40, AEX, FTSE 100, SMI, IBEX, FTSE MIB, Nikkei 225 and Hang Seng for theirs. A week runs to Friday and uses its last close, so a holiday Friday uses Thursday. It shows raw and adjusted beta (0.67 × raw + 0.33), alpha, R², the standard error and the number of observations. Daily and monthly are items 11 and 13, and any benchmark can still be typed.
- `BONDCALC` (YAS) has the day counts 30/360 US (with the SIA end-of-month rules), 30E/360, ACT/360, ACT/365F and ACT/ACT ICMA, used consistently for accrued interest, price, yield, risk and the Z-spread. Settlement is T+0 to T+3 business days or a date you type: T+1 for US bonds (US corporates moved to T+1 on 28 May 2024), T+2 elsewhere. The tests check Excel's and ISDA's published examples. Holidays are not yet skipped in settlement.
- `RATEPROBS` (WIRP): `#Hikes/Cuts` is cumulative and `%Hike/Cut` is the move priced at that meeting alone, signed and not capped, as on Bloomberg (+140% is one hike fully priced and a 40% chance of a second).

## Company screens

- `PROFILE` and `QUOTE` show the analysts' average price target (FMP, else Yahoo), the buy/hold/sell count with its source and month (FMP, else Finnhub, else Yahoo) and the next quarter's EPS estimate with its date (Finnhub). They reuse the requests `ANALYSTS` makes. `QUOTE` only offers SEC filings for US stocks.
- `PROFILE` shows the float and short interest: shares short, percentage of float, days to cover, the date and the change from the month before (US stocks; Yahoo gives none for European listings).
- `MANAGEMENT` (MGMT, OFFICERS) lists the company's officers with title, age, year of birth and pay, and the fiscal year it covers.
- `DIVIDENDS` lists splits next to the dividends, with the last split, and the 5-year growth rate of the yearly dividend when five full years are on record.
- `EARNINGS` shows the share-price reaction to each past report: before the open, the report day's close against the day before; after the close, the next day's close against the report day's; the screen says which it used.

## Checks

Lint, types, 660 unit tests, 18 browser workflows and 21 desktop workflows pass. The new reference values come from Excel's documentation for PRICE, YIELD, ACCRINT and the COUPDAY functions, ISDA's 30/360 tables, and the CBOT fed funds fixture.

## Downloads

Windows: `Armin-Terminal-Setup-2.9.0.exe`, `Armin-Terminal-2.9.0-Portable.exe`. Linux: `Armin-Terminal-2.9.0-x86_64.AppImage`, `armin-terminal_2.9.0_amd64.deb`. Each package has a SHA256 sidecar. Settings and saved keys are kept on upgrade.
