# Armin Terminal 2.23.0 audit: coverage matrix

Generated on 23 Oct 2026 from the registry (`src/terminal/registry.ts`), the mnemonic table (`src/terminal/legacy.ts`) and the mnemonics found in reference documents 1-33 (read from my own notes and, for documents 13, 18, 19 and 21-32, from the documents' text layer by pattern). Document numbers as in `docs/audit-v2.23.0.md` section 2; #33 is the Getting Started Guide for Students, whose text document #1 shares. Only codes and document numbers are reproduced here.

Totals: 525 codes in the documents. 91 open a screen in the app; 10 are market sector keys (typed alone they open that sector's MENU); 55 are missing but could be built from free data (class a); 348 are missing and are the provider's own content, platform or account services, or data with no free source identified (class b); 21 are not functions (office cities, keys, words caught by the pattern).

## 1. The app's functions

| Code | Category | Name | Mnemonics that open it | Cited in |
|---|---|---|---|---|
| FIELDS | Portfolio & Tools | Field Search & Inspection | FLDS | #10, #11, #12, #15, #16, #17, #33 |
| PROFILE | Equity | Profile | DES | #4, #5, #6, #10, #12, #13, #14, #15, #17, #19, #32, #33 |
| FINANCIALS | Equity | Financial Analysis | FA | #4, #5, #8, #12, #14, #21, #33 |
| ANALYSTS | Equity | Analyst Research | ANR | #4, #5, #14, #19, #21, #33 |
| EARNINGS | Equity | Earnings | EE, ERN | #4, #5, #14, #21, #33 |
| ESTIMATES | Equity | Consensus Overview | EEO, EEB | #4, #5, #14, #21 |
| CORPACTIONS | Equity | Corporate Actions | CACS | #4, #33 |
| SHORTINTEREST | Equity | Short Interest | SI | #21 |
| BUYBACKS | Equity | Buyback Summary | BBK | - |
| SUPPLYCHAIN | Equity | Supply Chain Analysis | SPLC | #4, #19, #21 |
| RISKPREMIUM | Equity | Equity Risk Premium | EQRP | #4, #5 |
| DIVIDENDS | Equity | Dividend History | DVD | #4, #5, #12, #14, #19, #33 |
| HOLDERS | Equity | Holders | HDS, OWN | #5, #12, #14, #19, #21 |
| MANAGEMENT | Equity | Management | MGMT | #4, #5, #12, #14, #33 |
| PEERS | Equity | Relative Valuation | RV, EQRV | #4, #5, #12, #14, #19, #21, #33 |
| EVENTS | Equity | Corporate Events | EVTS, EVT | #4, #5, #8, #12, #14, #19, #23, #30, #33 |
| FILINGS | Equity | Company Filings | CF | #4, #21 |
| DOCSEARCH | Equity | Document Search | DS | #5, #33 |
| CROSSCHECK | Equity | Close Cross-Check | - | - |
| WACC | Equity | Cost of Capital | - | #4, #5, #8 |
| MARKETCAP | Equity | Market Cap History | - | - |
| FUNDCHART | Equity | Graph Fundamentals | GF | #4, #5, #12, #19, #21, #22, #23, #33 |
| CHART | Charts | Price Chart | GP, G | #4, #5, #10, #12, #13, #14, #15, #19, #21, #33 |
| INTRADAY | Charts | Intraday Chart | GIP | #3, #4, #6, #33 |
| HISTORY | Charts | Historical Prices | HP, HCP, HCPI | #4, #6, #8, #14, #19, #33 |
| RETURNS | Charts | Comparative Returns | COMP | #4 |
| TOTALRETURN | Charts | Total Return Analysis | TRA | #4 |
| SPREAD | Charts | Historical Spread | HS | #8, #21, #33 |
| BETA | Charts | Historical Beta | - | #4, #5, #8, #12 |
| VOLATILITY | Charts | Historical Volatility | HVT, HVG, GV | #4, #5 |
| HEADLINES | News | Official Announcements | - | - |
| NEWS | News | News Search | N, NSE, NI, NH | #5, #12, #14, #19, #21 |
| MARKETNEWS | News | Market News | TOP | #4, #14, #21, #33 |
| COMPANYNEWS | News | Company News | CN | #3, #4, #5, #6, #12, #14, #21, #33 |
| BREAKING | News | Breaking News | FIRS | #14, #24, #28, #33 |
| MARKET | Markets | World Equity Indices | WEI | #4, #12, #13, #14, #19, #21, #23, #33 |
| INDEXFUTURES | Markets | World Index Futures | WEIF | #23 |
| CONTRIB | Markets | Index Movers | MOV | #19 |
| MEMBERS | Markets | Index Members | MEMB | #10, #12 |
| RANKEDRETURNS | Markets | Member Ranked Returns | MRR | #4, #22 |
| GROUPRETURNS | Markets | Group Ranked Returns | GRR | #23 |
| TOPMOVERS | Markets | Stock Movers | - | - |
| IPOS | Markets | Capital Raisings: IPOs | IPO | #4, #14, #33 |
| HEATMAP | Markets | Market Heat Map | - | - |
| INDEXMAP | Markets | Intraday Market Map | IMAP | #21, #22, #23 |
| MOVERS | Markets | Most Active | MOST | #14, #19, #21, #23 |
| EXCHANGES | Markets | Exchange Hours | EXCH | - |
| SCREEN | Markets | Equity Screening | EQS | #4, #6, #10, #12, #13, #14, #15, #16, #17, #19, #21, #22, #23, #30, #33 |
| QUOTE | Markets | Quote | BQ | #5, #15 |
| TRADES | Markets | Time and Sales | TAS, QR | #4 |
| DEPTH | Markets | Market Depth | - | - |
| VWAP | Markets | VWAP Analysis | - | #5 |
| FXMATRIX | FX & Crypto | Currency Cross Rates | FXC | #14, #19, #24, #33 |
| FXRANK | FX & Crypto | World Currency Ranker | WCRS | #14, #24, #28, #33 |
| CRYPTO | FX & Crypto | Crypto Monitor | CRYP | - |
| FXFORWARD | FX & Crypto | Forward Rates | FRD, FXFR | #14, #24 |
| FXOPTION | FX & Crypto | FX Option Valuation | OVML | #33 |
| BONDS | Rates & Credit | World Bond Markets | WB | #12, #14, #19, #23, #27, #33 |
| CURVE | Rates & Credit | Graph Curves | GC | #4, #33 |
| BONDFUTURES | Rates & Credit | World Bond Futures | WBF | #4, #14, #27, #28 |
| MONEYMARKET | Rates & Credit | Treasury & Money Markets | BTMM | #4, #14, #19, #20, #27, #33 |
| BONDCALC | Rates & Credit | Yield & Spread Analysis | YAS | #4, #6, #19, #33 |
| RATEPROBS | Rates & Credit | Rate Probabilities | WIRP | #12, #24, #28 |
| SWAPCALC | Rates & Credit | Swap Manager | SWPM | #4, #9, #28 |
| FEDMEETINGS | Rates & Credit | FOMC Meetings | FOMC | #19 |
| CENTRALBANKS | Rates & Credit | Central Bank Monitor | CENB | #14, #24, #28, #33 |
| BONDSEARCH | Rates & Credit | Fixed Income Search (desktop: no data) | SRCH | #4, #5, #8, #12, #14, #15, #16, #17, #28, #33 |
| DEBTPROFILE | Rates & Credit | Debt Distribution (desktop: no data) | DDIS | #4, #5, #14, #21, #33 |
| DEALERQUOTES | Rates & Credit | All Quotes (desktop: no data) | ALLQ | #4, #33 |
| COMMODITIES | Commodities | Global Commodities | GLCO | #12, #14, #19, #30, #33 |
| MACRO | Economics | Macro Dashboard | - | - |
| RELEASES | Economics | Economic Calendar | ECO | #4, #5, #12, #14, #19, #21, #23, #24, #27, #30, #32, #33 |
| ECONSTATS | Economics | World Economic Statistics | ECST, ECMX | #4, #5, #12, #14, #19, #23, #24, #28, #30, #32, #33 |
| HOLIDAYS | Economics | Holiday Calendar | CDR | - |
| OPTIONS | Derivatives | Option Monitor | OMON | #4, #5, #12, #23, #33 |
| OPTIONCALC | Derivatives | Option Valuation | OVME | #33 |
| OPTIONSTRATEGY | Derivatives | Option Strategy Analysis | OSA | - |
| WATCHLIST | Portfolio & Tools | Watchlists | W | - |
| FAVOURITES | Portfolio & Tools | Favourites | - | - |
| PORTFOLIO | Portfolio & Tools | Portfolio & Risk | PORT, PRTU | #4, #9, #10, #12, #16, #23, #30, #33 |
| ALERTS | Portfolio & Tools | Alerts | ALRT, MLRT | #22, #25 |
| CORRELATION | Portfolio & Tools | Correlation Matrix | CORR | #22 |
| SEARCH | Portfolio & Tools | Security Finder | SECF | #4, #5, #8, #12, #14, #19, #33 |
| RECENT | Portfolio & Tools | Recently Used | LAST | - |
| NOTES | Portfolio & Tools | Notes | NOTE | - |
| LAYOUTS | Portfolio & Tools | Layouts | LPAD | - |
| MESSAGES | Communication | Help Desk Messages | IB | #30 |
| HELP | System | Function Directory | - | #4, #10, #12, #13, #14, #33 |
| MENU | System | Related Functions Menu | - | #15 |
| PROVIDERS | System | Data Providers & Status | PROV | - |
| SETTINGS | System | Settings & Data Sources | PDF, PDFU | - |

## 2. Every code the documents use

Status: a function code means the code opens that screen; **a** missing, could be built from free data (what it would use); **b** missing, provider content or service or no free source; sector = market sector key; n/a = not a function.

| Code | Documents | Status | Note |
|---|---|---|---|
| AGRI | #30 | b |  |
| AGS | #14 | **a** | COMMODITIES filtered |
| AHOY | #31 | b |  |
| AIRLN | #19 | b |  |
| ALERTS | #25 | ALERTS |  |
| ALLQ | #4, #33 | DEALERQUOTES |  |
| ALRT | #22 | ALERTS |  |
| ANR | #4, #5, #14, #19, #21, #33 | ANALYSTS |  |
| ANY | #30 | n/a | not a function (an office, a key or a word in the text) |
| AOAS | #27 | b |  |
| APOD | #20 | b |  |
| ARB | #31 | b |  |
| ARGU | #30 | b |  |
| ASW | #4, #6 | b |  |
| ATEC | #22 | b |  |
| AZS | #4 | b |  |
| BARG | #31 | b |  |
| BBAM | #28 | b |  |
| BBAR | #30 | b |  |
| BBPC | #20 | b |  |
| BBTI | #28 | b |  |
| BBU | #9, #23, #33 | b |  |
| BCHG | #20 | b |  |
| BDVD | #4, #14 | b |  |
| BDXY | #24 | b |  |
| BESS | #12, #19 | b |  |
| BETA | #4, #5, #8, #12 | BETA |  |
| BFX | #31 | b |  |
| BGAS | #30, #33 | b |  |
| BGOV | #31 | b |  |
| BHL | #14, #33 | b |  |
| BHRQ | #33 | b |  |
| BI | #4, #5, #12, #14, #19, #21, #23, #30, #33 | b |  |
| BICO | #5, #33 | b |  |
| BILL | #21, #30 | **a** | congress.gov API |
| BIP | #33 | b |  |
| BIZW | #14 | b |  |
| BLAW | #31 | b |  |
| BLP | #6, #20, #30 | b |  |
| BLRT | #21 | b |  |
| BLRV | #27 | b |  |
| BMAP | #12, #14, #19, #30 | b |  |
| BMART | #20 | b |  |
| BMC | #12, #33 | b |  |
| BMMI | #4 | b |  |
| BNKF | #4 | b |  |
| BOE | #14 | **a** | CENTRALBANKS data |
| BOIL | #30, #31, #33 | b |  |
| BOJ | #14, #28 | **a** | CENTRALBANKS data |
| BON | #19 | b |  |
| BPS | #4, #13, #14, #19, #33 | b |  |
| BQ | #5, #15 | QUOTE |  |
| BQLX | #11 | b |  |
| BRC | #8, #21 | b |  |
| BRIE | #33 | b |  |
| BRIEF | #19 | b |  |
| BSR | #4 | b |  |
| BSV | #21 | b |  |
| BT | #24 | b |  |
| BTMM | #4, #14, #19, #20, #27, #33 | MONEYMARKET |  |
| BTRS | #33 | b |  |
| BTS | #12 | b |  |
| BTTC | #20 | b |  |
| BU | #4, #13, #14, #33 | b |  |
| BUYP | #33 | b |  |
| BXT | #4, #6 | b |  |
| BYFC | #28 | b |  |
| CACS | #4, #33 | CORPACTIONS |  |
| CACT | #4, #16, #23 | **a** | CORPACTIONS across the followed stocks |
| CANN | #4 | b |  |
| CAST | #21, #33 | b |  |
| CBRT | #14 | **a** | CENTRALBANKS data |
| CCA | #21 | b |  |
| CCAL | #30 | b |  |
| CCB | #21 | **a** | the sector/industry data the app has |
| CCRV | #4, #12, #16 | **a** | futures contract months from Yahoo |
| CDAT | #31 | b |  |
| CDE | #21, #33 | b |  |
| CDRA | #4 | b |  |
| CDSW | #9 | b |  |
| CDX | #12 | b |  |
| CENB | #14, #24, #28, #33 | CENTRALBANKS |  |
| CF | #4, #21 | FILINGS |  |
| CFS | #21 | b |  |
| CFVL | #31 | b |  |
| CHAR | #24 | n/a | not a function (an office, a key or a word in the text) |
| CIX | #30 | b |  |
| CL | #21 | n/a | not a function (an office, a key or a word in the text) |
| CLAC | #4 | b |  |
| CLC | #4 | b |  |
| CLCX | #4 | b |  |
| CLIENT | #4 | sector | sector key: typed alone opens the sector MENU |
| CLRK | #31 | b |  |
| CMAP | #5 | b |  |
| CMDTY | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| CMPC | #20 | b |  |
| CMSP | #30 | b |  |
| CMW | #27 | b |  |
| CN | #3, #4, #5, #6, #12, #14, #21, #33 | COMPANYNEWS |  |
| COAL | #14 | b |  |
| COAT | #4 | b |  |
| COC | #4 | b |  |
| COMB | #4 | b |  |
| COMP | #4 | RETURNS |  |
| CONN | #20 | b |  |
| CORP | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| CORR | #22 | CORRELATION |  |
| COSY | #14 | b |  |
| CPF | #30, #33 | b |  |
| CPG | #4 | b |  |
| CPH | #4 | b |  |
| CPLY | #14, #30 | b |  |
| CRCK | #30 | b |  |
| CRDT | #5 | b |  |
| CRNCY | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| CRPR | #4, #5, #14, #21, #33 | b |  |
| CRR | #30 | b |  |
| CRSR | #5 | b |  |
| CRV | #27, #28 | b |  |
| CRVD | #4, #27 | b |  |
| CRVF | #4, #33 | b |  |
| CSDR | #12, #27 | b |  |
| CT | #14, #16 | **a** | futures contract months from Yahoo |
| CTM | #4, #16, #30, #31 | **a** | futures contract months from Yahoo |
| CTOP | #30 | b |  |
| DA | #33 | n/a | not a function (an office, a key or a word in the text) |
| DAPI | #4, #13, #33 | b |  |
| DASH | #4, #33 | b |  |
| DDIS | #4, #5, #14, #21, #33 | DEBTPROFILE |  |
| DEBT | #14, #33 | b |  |
| DES | #4, #5, #6, #10, #12, #13, #14, #15, #17, #19, #32, #33 | PROFILE |  |
| DLIB | #28 | b |  |
| DLV | #4 | b |  |
| DMMV | #28 | b |  |
| DOTS | #33 | **a** | IMF Direction of Trade Statistics |
| DPDF | #6 | b |  |
| DRAM | #21 | b |  |
| DRS | #20 | b |  |
| DRSK | #5, #21 | b |  |
| DRVD | #28 | b |  |
| DS | #5, #33 | DOCSEARCH |  |
| DSCL | #20 | b |  |
| DSCO | #8 | b |  |
| DVD | #4, #5, #12, #14, #19, #33 | DIVIDENDS |  |
| EA | #4, #14, #21, #23, #33 | **a** | an index's reported quarter from the earnings sources |
| ECB | #14, #28 | **a** | CENTRALBANKS data |
| ECCG | #23 | b |  |
| ECFC | #4, #12, #14, #19, #21, #23, #24, #30, #32, #33 | **a** | IMF World Economic Outlook forecasts |
| ECMX | #4, #19, #33 | ECONSTATS |  |
| ECO | #4, #5, #12, #14, #19, #21, #23, #24, #27, #30, #32, #33 | RELEASES |  |
| ECON | #19 | b |  |
| ECOW | #12, #14, #28 | **a** | parts of ECONSTATS and MACRO |
| ECST | #5, #12, #14, #19, #23, #24, #28, #30, #32, #33 | ECONSTATS |  |
| ECSU | #24 | b |  |
| ECTR | #14, #19, #24, #30, #32 | **a** | IMF Direction of Trade Statistics |
| ECWB | #14, #21, #23, #24, #32, #33 | **a** | charting of FRED/Eurostat series (MACRO has some) |
| EE | #4, #5, #14, #21, #33 | EARNINGS |  |
| EEB | #21 | ESTIMATES |  |
| EEG | #3, #5, #21, #22 | **a** | FMP/Yahoo estimate history |
| EEO | #4, #5, #14, #21 | ESTIMATES |  |
| EIS | #20 | b |  |
| EM | #4, #5, #21 | **a** | FMP/Yahoo estimate trends |
| EMEQ | #12 | b |  |
| EMIS | #14 | b |  |
| EMMV | #28 | b |  |
| EMS | #6 | b |  |
| EMSX | #4, #7, #33 | b |  |
| ENTV | #20 | b |  |
| EQBT | #15, #21, #23, #30, #33 | **a** | SCREEN rules over price history |
| EQR | #21 | b |  |
| EQRP | #4, #5 | RISKPREMIUM |  |
| EQRV | #5, #21, #33 | PEERS |  |
| EQS | #4, #6, #10, #12, #13, #14, #15, #16, #17, #19, #21, #22, #23, #30, #33 | SCREEN |  |
| EQUITY | #4, #15, #33 | sector | sector key: typed alone opens the sector MENU |
| ERN | #4, #5, #14, #21, #33 | EARNINGS |  |
| ESG | #16, #17 | b |  |
| ESGD | #3 | b |  |
| ET | #28 | n/a | not a function (an office, a key or a word in the text) |
| ETF | #8 | b |  |
| ETOR | #27 | b |  |
| EUM | #31 | b |  |
| EV | #21 | n/a | not a function (an office, a key or a word in the text) |
| EVT | #5, #12 | EVENTS |  |
| EVTS | #4, #8, #14, #19, #23, #30, #33 | EVENTS |  |
| F11 | #19 | n/a | not a function (an office, a key or a word in the text) |
| FA | #4, #5, #8, #12, #14, #21, #33 | FINANCIALS |  |
| FAVE | #19 | b |  |
| FCON | #24, #32 | b |  |
| FDM | #30, #31, #33 | b |  |
| FED | #4, #14, #28, #33 | **a** | CENTRALBANKS and FEDMEETINGS data |
| FEDL | #28 | b |  |
| FFA | #31 | b |  |
| FIHG | #4 | b |  |
| FIHR | #4 | b |  |
| FILE | #4, #7, #33 | b |  |
| FIPX | #4 | b |  |
| FIRS | #14, #24, #28, #33 | BREAKING |  |
| FIRST | #21 | BREAKING |  |
| FIRV | #4 | b |  |
| FIT | #27, #28 | b |  |
| FIX | #31 | b |  |
| FIXI | #24 | b |  |
| FLDS | #10, #11, #12, #15, #16, #17, #33 | FIELDS |  |
| FLEH | #31 | b |  |
| FLET | #31 | b |  |
| FLNG | #16, #23 | **a** | SEC 13F filings |
| FOMC | #19 | FEDMEETINGS |  |
| FPA | #4 | b |  |
| FRD | #24 | FXFORWARD |  |
| FSRC | #12, #23 | b |  |
| FTST | #4, #21, #23 | b |  |
| FTW | #33 | b |  |
| FWCM | #4, #28 | b |  |
| FWCV | #4, #28 | b |  |
| FX | #24 | n/a | not a function (an office, a key or a word in the text) |
| FXC | #14, #19, #24, #33 | FXMATRIX |  |
| FXCA | #14, #33 | **a** | FX rates and their history |
| FXFA | #28 | b |  |
| FXFC | #14, #24, #33 | b |  |
| FXFM | #24 | b |  |
| FXFR | #14 | FXFORWARD |  |
| FXGO | #24 | b |  |
| FXIP | #14, #19 | b |  |
| FXSW | #24 | b |  |
| FXTF | #24 | b |  |
| G | #4, #33 | CHART |  |
| GALB | #31 | b |  |
| GALL | #4 | b |  |
| GAS | #14 | **a** | COMMODITIES filtered |
| GASC | #31 | b |  |
| GC | #4, #33 | CURVE |  |
| GC3D | #28 | b |  |
| GCSN | #20 | b |  |
| GE | #22 | n/a | not a function (an office, a key or a word in the text) |
| GEW | #14 | **a** | parts of ECONSTATS and MACRO |
| GF | #4, #5, #12, #19, #21, #22, #23, #33 | FUNDCHART |  |
| GFV | #22 | b |  |
| GGR | #4 | b |  |
| GIP | #3, #4, #6, #33 | INTRADAY |  |
| GLCO | #12, #14, #19, #30, #33 | COMMODITIES |  |
| GMM | #12, #33 | b |  |
| GOVT | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| GP | #4, #5, #10, #12, #13, #14, #15, #19, #21, #33 | CHART |  |
| GPC | #3 | CHART |  |
| GPL | #12 | b |  |
| GRAB | #12 | b |  |
| GRAP | #30 | b |  |
| GRR | #23 | GROUPRETURNS |  |
| GUID | #21 | b |  |
| GX | #21, #23 | **a** | cross-section of fields the app has |
| GX24 | #24 | b |  |
| GY | #16 | **a** | yield chart (CHART on USGG10YR) |
| HCP | #14 | HISTORY |  |
| HCPI | #14 | HISTORY |  |
| HDS | #5, #12, #14, #21 | HOLDERS |  |
| HDSK | #20 | b |  |
| HDWRG | #5 | b |  |
| HEFF | #24 | b |  |
| HELP | #4, #10, #12, #13, #14, #33 | HELP |  |
| HFA | #23 | b |  |
| HG | #4 | b |  |
| HIVG | #4 | b |  |
| HL | #4, #14, #33 | **a** | SEARCH |
| HLDR | #16 | **a** | SEC 13F holdings |
| HP | #4, #6, #8, #14, #19, #33 | HISTORY |  |
| HRA | #21 | **a** | regression on price history (BETA does one) |
| HS | #8, #21, #33 | SPREAD |  |
| HSA | #28 | b |  |
| HSST | #4 | b |  |
| HVG | #4 | VOLATILITY |  |
| HVT | #5 | VOLATILITY |  |
| IAM | #20 | b |  |
| IB | #30 | MESSAGES |  |
| IBSR | #20 | b |  |
| ICS | #10 | b |  |
| ICVS | #4, #28 | b |  |
| IDOC | #20 | b |  |
| IFMO | #24 | b |  |
| ILBE | #4, #12, #28 | b |  |
| ILBI | #28 | b |  |
| IMAP | #21, #22, #23 | INDEXMAP |  |
| IMOV | #23 | b |  |
| IMRX | #31 | b |  |
| IN | #10 | **a** | the indices the app follows |
| INCH | #20 | b |  |
| INDEX | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| INP | #10 | b |  |
| INQ | #20 | b |  |
| INSD | #21 | **a** | SEC Form 4 filings |
| IOIA | #5 | b |  |
| IOM | #4 | b |  |
| IPO | #4, #14, #33 | IPOS |  |
| IRDD | #4, #28 | b |  |
| IRDL | #28 | b |  |
| IRH | #21 | b |  |
| IRR | #22 | b |  |
| IRSB | #4, #28 | b |  |
| ISSD | #4 | b |  |
| IVSP | #28 | b |  |
| IYC | #4 | **a** | CURVE for more countries |
| JOBS | #19, #33 | **a** | BLS employment data |
| LALT | #4 | b |  |
| LANG | #4, #20, #33 | b |  |
| LEAD | #30 | b |  |
| LEAG | #4, #14 | b |  |
| LIST | #6 | b |  |
| LNGC | #31 | b |  |
| LNGJ | #31 | b |  |
| LNGU | #31 | b |  |
| LOGI | #4 | b |  |
| LONDON | #21, #23, #24, #25, #27, #28, #29, #30, #31, #32 | n/a | not a function (an office, a key or a word in the text) |
| LRSK | #23 | b |  |
| LSRC | #4 | b |  |
| LVI | #19 | b |  |
| MA | #4, #14, #20, #23, #30, #33 | b |  |
| MAIN | #12 | n/a | not a function (an office, a key or a word in the text) |
| MAP | #14 | b |  |
| MAPS | #14 | b |  |
| MARB | #23, #33 | b |  |
| MARS | #4, #24, #28, #31 | b |  |
| MBWD | #4 | b |  |
| MCUR | #4 | b |  |
| MDM | #5 | b |  |
| MEDI | #14 | b |  |
| MEMB | #10, #12 | MEMBERS |  |
| MENU | #15 | MENU |  |
| MFDF | #4 | b |  |
| MFID | #5 | b |  |
| MGMT | #4, #5, #12, #14, #33 | MANAGEMENT |  |
| MGU | #20 | b |  |
| MIFA | #4 | b |  |
| MINE | #14 | **a** | COMMODITIES filtered |
| MIPD | #5 | b |  |
| MMAP | #22 | b |  |
| MMCV | #4 | b |  |
| MMR | #4 | b |  |
| MODL | #5, #8 | b |  |
| MOST | #14, #19, #21, #23 | MOVERS |  |
| MOV | #19 | CONTRIB |  |
| MRA | #22 | b |  |
| MRGC | #33 | b |  |
| MRKT | #4 | b |  |
| MRR | #4, #22 | RANKEDRETURNS |  |
| MRUL | #12, #33 | b |  |
| MRV | #4 | **a** | PEERS for a market |
| MSG | #4, #33 | b |  |
| MSM | #27 | b |  |
| MSRB | #4 | b |  |
| MSRC | #4 | b |  |
| MTGE | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| MTL | #30 | b |  |
| MUMBAI | #21, #23, #24, #25, #27, #28, #29, #30, #31, #32 | n/a | not a function (an office, a key or a word in the text) |
| MUNI | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| MVP | #33 | b |  |
| MYN | #14 | **a** | saved NEWS searches |
| N | #5, #14 | NEWS |  |
| NGAS | #33 | **a** | COMMODITIES filtered |
| NI | #12, #14 | NEWS |  |
| NIM | #4, #16 | b |  |
| NLRT | #14, #27 | **a** | ALERTS on news keywords |
| NPH | #12 | b |  |
| NRGZ | #30 | b |  |
| NSE | #12, #19, #21 | NEWS |  |
| NSV | #4, #28 | b |  |
| NW | #6 | b |  |
| NWZR | #4, #8 | b |  |
| NYT | #14 | b |  |
| OAS | #6 | b |  |
| OASD | #27 | b |  |
| OIL | #14 | **a** | COMMODITIES filtered |
| OMON | #4, #5, #12, #23, #33 | OPTIONS |  |
| OMST | #23 | b |  |
| OPIN | #14 | b |  |
| OPIS | #30 | b |  |
| OTC | #24 | b |  |
| OUTL | #27 | b |  |
| OV | #4 | b |  |
| OVCV | #6 | b |  |
| OVDV | #16 | **a** | option IVs from Alpaca (OPTIONS has them per contract) |
| OVME | #33 | OPTIONCALC |  |
| OVML | #33 | FXOPTION |  |
| OVRA | #24 | b |  |
| OWN | #5, #14, #19 | HOLDERS |  |
| PANEL | #15 | n/a | not a function (an office, a key or a word in the text) |
| PC | #8 | n/a | not a function (an office, a key or a word in the text) |
| PD | #16 | **a** | SEC 13F holdings |
| PE | #23, #30, #33 | n/a | not a function (an office, a key or a word in the text) |
| PEOP | #12, #19, #33 | b |  |
| PEOPLE | #4 | n/a | not a function (an office, a key or a word in the text) |
| PFD | #4, #33 | sector | sector key: typed alone opens the sector MENU |
| PGM | #4 | b |  |
| PHDC | #12 | b |  |
| PIB | #21 | b |  |
| PICK | #4 | b |  |
| PLAT | #30 | b |  |
| PLST | #6 | b |  |
| POAT | #4 | b |  |
| PORT | #4, #9, #10, #12, #23, #30, #33 | PORTFOLIO |  |
| POTN | #31 | b |  |
| PPC | #19 | b |  |
| PPCR | #4 | b |  |
| PRINT | #15 | n/a | not a function (an office, a key or a word in the text) |
| PRTU | #9, #12, #16, #23, #33 | PORTFOLIO |  |
| PSET | #15, #16, #17 | b |  |
| PSRT | #16 | **a** | SEC 13F filers |
| PVG | #4 | b |  |
| PXAM | #27 | b |  |
| QMGR | #4 | b |  |
| QR | #4 | TRADES |  |
| QUIC | #14, #33 | b |  |
| QUOTE | #15 | QUOTE |  |
| RANK | #5, #16 | **a** | SEC 13F holdings ranked |
| RATC | #4 | b |  |
| READ | #14 | b |  |
| REFO | #30 | b |  |
| RELS | #4, #14, #33 | **a** | a company's other listings from the lookup sources |
| RENE | #14 | b |  |
| RES | #4, #21, #23, #27, #33 | b |  |
| RG | #4, #22, #33 | b |  |
| RICH | #14, #33 | b |  |
| RPP | #4 | b |  |
| RRG | #23 | b |  |
| RRRA | #4 | b |  |
| RUNZ | #27 | b |  |
| RV | #4, #5, #12, #14, #19, #21, #33 | PEERS |  |
| RVM | #4 | b |  |
| RVP | #30 | b |  |
| SALT | #33 | b |  |
| SDR | #24, #28 | b |  |
| SDRV | #24, #28 | b |  |
| SDSK | #4 | b |  |
| SEAR | #8 | b |  |
| SEARCH | #5 | SEARCH |  |
| SECF | #4, #8, #12, #14, #19, #33 | SEARCH |  |
| SHIP | #14, #31 | b |  |
| SI | #21 | SHORTINTEREST |  |
| SIA | #21 | **a** | FINRA short interest (SHORTINTEREST has it per stock) |
| SMNR | #19 | b |  |
| SMUN | #4 | b |  |
| SND | #28 | b |  |
| SOURCE | #3 | n/a | not a function (an office, a key or a word in the text) |
| SOVM | #14, #28 | **a** | BONDS and CURVE by country |
| SPA | #4 | b |  |
| SPDL | #20 | b |  |
| SPLC | #4, #19, #21 | SUPPLYCHAIN |  |
| SPOS | #21 | b |  |
| SRCH | #4, #5, #8, #12, #14, #15, #16, #17, #28, #33 | BONDSEARCH |  |
| SRSK | #14, #33 | b |  |
| SSYF | #31 | b |  |
| STAT | #14 | b |  |
| STATS | #14 | b |  |
| STNI | #30 | b |  |
| SURP | #22 | **a** | the earnings sources (EARNINGS has it per stock) |
| SWDF | #4, #28 | b |  |
| SWIL | #28 | b |  |
| SWPM | #4, #9, #28 | SWAPCALC |  |
| SXT | #4, #6 | b |  |
| SYDNEY | #21, #23, #24, #25, #27, #28, #29, #30, #31, #32 | n/a | not a function (an office, a key or a word in the text) |
| TAYL | #24 | b |  |
| TBHF | #24 | b |  |
| TDH | #4 | b |  |
| TECH | #19 | **a** | CHART studies (RSI, MACD, BOLL exist) |
| TED | #4 | b |  |
| TEL | #14 | b |  |
| TNI | #12 | b |  |
| TNKS | #31 | b |  |
| TOKYO | #21, #23, #24, #25, #27, #28, #29, #30, #31, #32 | n/a | not a function (an office, a key or a word in the text) |
| TOP | #4, #14, #21, #33 | MARKETNEWS |  |
| TRA | #4 | TOTALRETURN |  |
| TRMS | #4 | b |  |
| TTST | #20 | b |  |
| TWEE | #14 | b |  |
| TWTR | #14, #21, #33 | b |  |
| TZDF | #20 | b |  |
| UNCL | #33 | b |  |
| UPGR | #20 | b |  |
| USER | #13, #33 | n/a | not a function (an office, a key or a word in the text) |
| USRR | #31 | b |  |
| USSW | #4, #27, #28 | b |  |
| UUF | #20 | b |  |
| VALL | #4 | b |  |
| VCA | #24 | b |  |
| VCON | #4 | b |  |
| VCUB | #4, #28 | b |  |
| VENU | #5 | b |  |
| VOLC | #24 | b |  |
| VOLT | #14 | b |  |
| VSLU | #31 | b |  |
| VWAP | #5 | VWAP |  |
| WACC | #4, #5, #8 | WACC |  |
| WALG | #4 | b |  |
| WATC | #15, #33 | **a** | WATCHLIST with more analytics |
| WB | #12, #14, #19, #23, #27, #33 | BONDS |  |
| WBF | #4, #14, #27, #28 | BONDFUTURES |  |
| WBI | #4, #33 | b |  |
| WBIX | #28 | b |  |
| WBMV | #4, #14 | **a** | BONDS changes |
| WBX | #4 | b |  |
| WCDM | #14 | b |  |
| WCR | #12, #14, #24 | **a** | FX rates (FXMATRIX shows a matrix) |
| WCRS | #14, #24, #28, #33 | FXRANK |  |
| WEAT | #31 | b |  |
| WECO | #14, #23, #28 | **a** | RELEASES filtered by country |
| WEI | #4, #12, #13, #14, #19, #21, #23, #33 | MARKET |  |
| WEIF | #23 | INDEXFUTURES |  |
| WEIS | #14 | **a** | MARKET data, ranked |
| WELC | #5 | b |  |
| WETR | #30, #31, #33 | b |  |
| WFII | #14, #32 | b |  |
| WIR | #4 | b |  |
| WIRA | #24, #33 | b |  |
| WIRP | #12, #24, #28 | RATEPROBS |  |
| WM | #14 | **a** | MARKET data on a world map |
| WPT | #14 | b |  |
| WS | #27, #28 | b |  |
| WSJ | #14 | b |  |
| WVOL | #24 | b |  |
| XCCY | #24, #27, #28 | b |  |
| XDF | #24 | b |  |
| XDSH | #24 | b |  |
| XLTP | #4, #5, #12, #13, #30, #33 | b |  |
| XODF | #24 | b |  |
| YAS | #4, #6, #19, #33 | BONDCALC |  |
| YASN | #4 | b |  |
| YTC | #4 | b |  |
