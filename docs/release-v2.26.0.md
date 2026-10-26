# Armin Terminal 2.26.0

This release adds 25 screens, most of them built from the public reference guides, among them worksheets under W, currency conversion and US legislation; screens Nasdaq's whole list of US stocks with AND and OR groups and saved screens; adds preferred stock and minority interest to enterprise value on PEERS; and gives the app the terminal's typeface, measured colours and colour-blind schemes. Windows only.

## New screens

**Markets and indices**
- **IN**: the index directory. **GX**: an index's members plotted on any two fields. **EA**: an index's earnings season, member by member and by sector.
- **WBMV**: government bond yields ranked by their move, for a day, a week, a month and longer.
- **SIA**: the market's short interest at a FINRA settlement date.
- **CACT**: dividends, splits and IPOs across the market, filtered to your watchlist or portfolio if you like.
- **CCB**: US-listed companies by sector and industry.

**Companies**
- **INSD**: insiders' Form 4 trades on their own screen.
- **RELS**: a company's other securities and its listings abroad.
- **EEG**: how the consensus EPS for the coming quarters and years has moved. **EM**: reported earnings and their growth, carried on into the consensus.
- **FLNG**: find Form 13F filings and open any manager's holdings.

**Analysis**
- **HRA**: a regression of one security's returns on another's.
- **TECH**: the technical studies, what each one computes, and a chart with it.
- **EQBT** (BACKTEST): back-test a stock-picking rule on an index's members, month by month. It uses today's members, and the screen warns about that.

**Economics and commodities**
- **FED**: a page on the Federal Reserve. **IYC**: the yield curve menu; CURVE opens on the country you name.
- **ECOW** and **ECWB**: chart any FRED series as published, or transformed (change, % change, year on year).
- **ECFC**: the IMF's World Economic Outlook forecasts. **ECTR**: an economy's goods trade by partner and region from the IMF, any year, with a partner's months.
- **CCRV**: a commodity's forward curve, with the curves of a week and a month ago. **CTM**: the futures the app carries, found by sector, exchange or name.
- **BILL** (LEGISLATION): US bills and laws from Congress.gov, with their stage, sponsors and actions. It needs a free Congress.gov key, set on PROVIDERS.
- **FXCA** (CONVERT): an amount in one currency in another, at the live rate or at a past day's ECB reference rate.
- **HL**, **WECO** and **SOVM** open the screens that do what the guides describe.

## Worksheets

- **W** now opens **WORKSHEET**: sheets of the securities you add, by the columns you pick. The columns are the watchlist's market fields plus market value and enterprise value in dollars, P/E, P/B, EV/EBITDA, dividend yield, ROE, net margin, revenue growth, EPS and beta. Hover a cell for its source; any column sorts; the export lists every cell's source. `W TECH` opens the sheet named Tech.
- The watchlist is now **WATCH** (or WATCHLIST).
- **LLP** opens LAYOUTS, as LPAD does.

## Screening

- **SCREEN** can screen every US-listed stock in Nasdaq's list (about 6,500), as well as the app's own stocks. Nasdaq's list gives market value, price, change, volume, IPO year, sector, industry and country; P/E, yield, ROE, beta and returns exist only for the app's own stocks, and the screen says so.
- Pick criteria by category. Criteria in a group must all hold, and a stock passes when any group holds.
- A stock missing a value a criterion needs is no longer dropped silently: you choose whether it is left out or kept (marked ?), and the screen says how many and for which fields.
- Save a screen by name and open it again with `SCREEN NAME`.

## Corrections

- **PEERS**: enterprise value now adds preferred stock and minority interest from the latest balance sheet, and hovering EV shows how it is built up.
- **CONGRESS**: a member you click opens in sight, and the report year says which year the report covers.
- **TECH US**, **HL US** and **IYC US** open those stocks, not the functions.
- The quarter after next is named by the fiscal year the reports show.

## Look

- The terminal's look by default: the Bergoom typeface (free, OFL), and colours measured from the terminal for the function bar, section strips and command line.
- Colour-blind schemes, with the heat scale taken through the measured tiles.
- Panel frames and suggestions drawn as the terminal draws them.
- The help desk opens on its own page until you ask something, with New chat to start again.
