import type { AssetClass, SecurityDef } from '../data/types';
import type { FnDef } from './types';
import { LEGACY_CODES, primaryMnemonic } from './legacy';
import { engine } from '../data/market';
import { configureSecurityLinks } from './state';
import { HELP } from '../functions/HELP';
import { WHATSNEW } from '../functions/WHATSNEW';
import { GIP, GP } from '../functions/GP';
import { DES } from '../functions/DES';
import { HP } from '../functions/HP';
import { FA } from '../functions/FA';
import { ANR } from '../functions/ANR';
import { EE } from '../functions/EE';
import { EESummary } from '../functions/EESummary';
import { DVD } from '../functions/DVD';
import { HDS } from '../functions/HDS';
import { INSD, MGMT } from '../functions/MGMT';
import { RV } from '../functions/RV';
import { EVTS } from '../functions/EVTS';
import { FILINGS } from '../functions/FILINGS';
import { CROSSCHECK } from '../functions/CROSSCHECK';
import { FIELDS } from '../functions/FIELDS';
import { WACC } from '../functions/WACC';
import { COMP } from '../functions/COMP';
import { BETA } from '../functions/BETA';
import { CORR } from '../functions/CORR';
import { CMGR } from '../functions/CMGR';
import { BTST } from '../functions/BTST';
import { DEPTH } from '../functions/DEPTH';
import { TAS } from '../functions/TAS';
import { BQ } from '../functions/BQ';
import { CN, HEADLINES, N } from '../functions/NEWS';
import { MNEWS } from '../functions/MNEWS';
import { BREAKING } from '../functions/BREAKING';
import { WEI, WEIF } from '../functions/WEI';
import { HEATMAP, IMAP } from '../functions/IMAP';
import { MOST } from '../functions/MOST';
import { TOPMOVERS } from '../functions/TOPMOVERS';
import { EXCH } from '../functions/EXCH';
import { EQS } from '../functions/EQS';
import { BTMM, GC, WB, WBMV, WIRP } from '../functions/RATES';
import { YAS } from '../functions/YAS';
import { CRYP, FXC, GLCO, WCRS } from '../functions/FXMON';
import { AGS, GAS, MINE, OIL } from '../functions/CMDSECTOR';
import { NGAS } from '../functions/NGAS';
import { COT } from '../functions/COT';
import { NIPA } from '../functions/NIPA';
import { WCR } from '../functions/WCR';
import { WEIS, WM } from '../functions/WORLDEQ';
import { BOE, BOJ, ECB } from '../functions/CBPORTAL';
import { CBRT } from '../functions/CBRT';
import { MYN } from '../functions/MYN';
import { ECO, ECST } from '../functions/ECO';
import { MACRO } from '../functions/MACRO';
import { OMON, OVME } from '../functions/OPTIONS';
import { OptionStrategy } from '../functions/OptionStrategy';
import { W } from '../functions/W';
import { FAV } from '../functions/FAV';
import { PORT } from '../functions/PORT';
import { FRONTIER } from '../functions/FRONTIER';
import { MPC } from '../functions/MPC';
import { ALRT } from '../functions/ALRT';
import { LAST, LPAD, PDFU, SECF } from '../functions/TOOLS';
import { PROV } from '../functions/PROV';
import { IB } from '../functions/IB';
import { HS } from '../functions/HS';
import { NOTE } from '../functions/NOTE';
import { MENU } from '../functions/MENU';
import { ALLQ, DDIS, SRCH } from '../functions/CREDIT';
import { GF, HVT, MEMB, MOV, MRR, GRR, TRA, VWAP } from '../functions/ANALYSIS';
import { EEO } from '../functions/EEO';
import { CACS } from '../functions/CACS';
import { SI } from '../functions/SI';
import { SPLC } from '../functions/SPLC';
import { BBK } from '../functions/BBK';
import { HOLDINGS13F } from '../functions/HOLDINGS13F';
import { CONGRESS } from '../functions/CONGRESS';
import { MCAP } from '../functions/MCAP';
import { IPO } from '../functions/IPO';
import { DS } from '../functions/DS';
import { WBF } from '../functions/WBF';
import { EQRP } from '../functions/EQRP';
import { CDR, CENB, FRD, OVML, SWPM } from '../functions/FXRATES';
import { FOMC } from '../functions/FOMC';
import { TECH } from '../functions/TECH';
import { IN } from '../functions/IN';
import { IYC } from '../functions/IYC';
import { FED } from '../functions/FED';
import { EEG } from '../functions/EEG';
import { EM } from '../functions/EM';
import { EA } from '../functions/EA';
import { CACT } from '../functions/CACT';
import { SIA } from '../functions/SIA';
import { GX } from '../functions/GX';
import { CCB } from '../functions/CCB';
import { FLNG } from '../functions/FLNG';
import { RELS } from '../functions/RELS';
import { ECOW } from '../functions/ECOW';
import { CCRV } from '../functions/CCRV';
import { CTM } from '../functions/CTM';
import { ECFC } from '../functions/ECFC';
import { ECTR } from '../functions/ECTR';
import { EQBT } from '../functions/EQBT';
import { BILL } from '../functions/BILL';
import { FXCA } from '../functions/FXCA';
import { WS } from '../functions/WS';
import { SEAR } from '../functions/SEAR';

const EQ: AssetClass[] = ['equity'];
const TRADABLE: AssetClass[] = ['equity', 'commodity', 'crypto', 'future'];

export const FUNCTIONS: FnDef[] = [
  // Equity research
  { code: 'FIELDS', name: 'Field Search & Inspection', category: 'Portfolio & Tools', needsSec: true, desc: 'Search local quote, identity, calculated and provenance fields for a security. Inspect values, units, definitions, sources, freshness, missing data and timestamp limits; copy/export filtered fields. No compatibility with another vendor’s fields or API is implied.', component: FIELDS, example: 'FLDS AAPL' },
  { code: 'PROFILE', name: 'Profile', category: 'Equity', needsSec: true, desc: 'Security description: business profile, price and valuation snapshot, ownership. Adapts to indices, currencies, commodities, yields, crypto and index futures.', component: DES, aliases: ['DESCRIBE'], example: 'PROFILE NVDA' },
  { code: 'FINANCIALS', name: 'Financial Analysis', category: 'Equity', needsSec: true, classes: EQ, desc: 'Income statement, balance sheet, cash flow and ratios, annual and quarterly, with growth and trend.', component: FA, aliases: ['STATEMENTS'] },
  { code: 'ANALYSTS', name: 'Analyst Research', category: 'Equity', needsSec: true, classes: EQ, desc: 'FMP targets, ratings and estimates with independent section errors; Finnhub recommendation fallback; Yahoo Finance and Nasdaq where FMP has none; links to insider trades, short interest, holders, events and company news on their own screens. Own keys and endpoint access required. US-listed stocks.', component: ANR, aliases: ['TARGETS'], example: 'ANALYSTS AAPL' },
  { code: 'EARNINGSSUMMARY', name: 'Earnings & Estimates', category: 'Equity', needsSec: true, classes: EQ, desc: "One page on a company's earnings, leading to the screens with the detail: the next and last report dates and the price's average move around reports (EARNINGS), the trailing and blended forward P/E and next year's EPS growth (ESTIMATES), the analysts' ratings and target (ANALYSTS), the last quarter against its estimate with the past surprises and the next quarter's estimate, the trend of EPS (EARNINGSTREND) and how the consensus moved (ESTIMATEGRAPH). Analysts' figures in the desktop app.", component: EESummary, example: 'EARNINGSSUMMARY NVDA' },
  { code: 'EARNINGS', name: 'Earnings', category: 'Equity', needsSec: true, classes: EQ, desc: 'Reported diluted EPS/revenue by quarter; Finnhub quarterly EPS comparisons and next-report calendar; annual analyst estimates from FMP. Provider figures and reporting bases remain labelled; own keys required.', component: EE },
  { code: 'ESTIMATES', name: 'Consensus Overview', category: 'Equity', needsSec: true, classes: EQ, desc: "The last reported fiscal year against the analysts' consensus for the next ones, line by line (EPS, revenue, operating profit, EBITDA, net income) with the number of estimates and their growth, and the multiples at today's price and shares outstanding: P/E, P/B, P/CF, EV/Revenue, EV/EBITDA, EV/EBIT (with debt and cash both known) and dividend yield.", component: EEO, example: 'ESTIMATES NVDA' },
  { code: 'ESTIMATEGRAPH', name: 'Earnings Estimates Graph', category: 'Equity', needsSec: true, classes: EQ, desc: "How the analysts' consensus EPS for the current and next quarter and fiscal year moved over 90 days: Yahoo Finance's consensus now and 7, 30, 60 and 90 days before, the change, and the analysts who raised or cut their estimate in the last week and month (desktop app).", component: EEG, example: 'ESTIMATEGRAPH NVDA', suggested: ['ESTIMATES', 'CHART'] },
  { code: 'EARNINGSTREND', name: 'Earnings Trends', category: 'Equity', needsSec: true, classes: EQ, desc: "Reported EPS by quarter and fiscal year with the consensus before each report, the surprise and the growth on the year and the quarter (and revenue's), carried on into the analysts' consensus for the next two quarters and the current and next fiscal years with their growth on the year-ago figure (desktop app).", component: EM, example: 'EARNINGSTREND NVDA' },
  { code: 'CORPACTIONS', name: 'Corporate Actions', category: 'Equity', needsSec: true, classes: EQ, desc: "A company's corporate actions by announcement or effective date: cash dividends and splits, and from its SEC filings acquisitions completed, merger and tender offer documents, offerings registered, listing changes and shareholder meetings.", component: CACS, example: 'CORPACTIONS AAPL' },
  { code: 'ACTIONCALENDAR', name: 'Corporate Action Calendar', category: 'Equity', classes: EQ, desc: "Corporate actions across companies for a period: the dividends going ex with their amount, record, payment and announcement dates, the stock splits and reverse splits, and the IPOs priced or expected, for every US-listed company, your watchlist or your portfolio, from Nasdaq's public calendars (desktop app).", component: CACT, example: 'ACTIONCALENDAR' },
  { code: 'SHORTINTEREST', name: 'Short Interest', category: 'Equity', needsSec: true, classes: EQ, desc: "Shares sold short at each settlement over six months to two years from FINRA's consolidated record (every US listing, no key), with the short interest ratio (days to cover), the share of the shares outstanding at each settlement (the SEC count dated on or before it), the latest settlement's share of today's float, the average daily volume and their changes, beside the price.", component: SI, example: 'SHORTINTEREST TSLA' },
  { code: 'SHORTRANKING', name: 'Short Interest Analysis', category: 'Equity', classes: EQ, desc: "The market's short interest at a FINRA settlement: the US listings with the most shares sold short, the most as a share of their shares outstanding, the most days to cover, and the largest rises and falls since the settlement before, with the average daily volume, for every listing trading over 500,000 shares a day (desktop app). A row opens the stock's own history.", component: SIA, example: 'SHORTRANKING' },
  { code: 'BUYBACKS', name: 'Buyback Summary', category: 'Equity', needsSec: true, classes: EQ, desc: "A company's share buybacks from its SEC filings: cash spent each quarter or year, shares bought back and the average price paid, dividends paid beside them, the share count on each report's cover, the repurchase program's authorization and remaining amount, and the buyback, dividend and shareholder yields on today's market value (desktop app, SEC_USER_AGENT).", component: BBK, example: 'BUYBACKS AAPL' },
  { code: 'SUPPLYCHAIN', name: 'Supply Chain Analysis', category: 'Equity', needsSec: true, classes: EQ, desc: "A company's suppliers, customers and competitors as annual reports filed with the SEC state them: suppliers that say how much of their revenue it brings, customers that resell or buy its products, the unnamed customers behind its own revenue, and the competitors it names, each with the statement and filing behind it, coloured by the day's change (desktop app, SEC_USER_AGENT).", component: SPLC, example: 'SUPPLYCHAIN NVDA' },
  { code: 'RISKPREMIUM', name: 'Equity Risk Premium', category: 'Equity', needsSec: true, classes: EQ, desc: "The market's expected return, the risk-free 10-year yield and the country risk premium between them, and the stock's equity risk premium through its beta, with their history; each input can be changed.", component: EQRP, example: 'RISKPREMIUM AAPL' },
  { code: 'DIVIDENDS', name: 'Dividend History', category: 'Equity', needsSec: true, classes: EQ, desc: 'Cash dividends over ten years by ex-date, with amounts, frequency, 12-month yield and the next expected ex-date.', component: DVD, aliases: ['DIVS'] },
  { code: 'HOLDERS', name: 'Holders', category: 'Equity', needsSec: true, classes: EQ, desc: 'Largest institutional and fund holders with position, percent outstanding and change, and the ownership breakdown.', component: HDS, aliases: ['OWNERSHIP'] },
  { code: 'HOLDINGS', name: '13F Holdings', category: 'Equity', needsSec: true, classes: EQ, desc: "What a company reports on its Form 13F filings on SEC EDGAR: the US-listed stocks, options and convertible bonds it managed at a quarter's end (its own investments; for a bank or asset manager also its clients' accounts), each with its value as filed, share of the portfolio and change in shares since the quarter before (new, added, reduced, sold out), beside today's price and value; a map sized by value, and the portfolio's value by quarter. Tickers from OpenFIGI (desktop app, SEC_USER_AGENT).", component: HOLDINGS13F, aliases: ['13F', 'PORTFOLIO13F'], example: 'HOLDINGS NVDA' },
  { code: 'FILINGS13F', name: '13F Filings', category: 'Equity', desc: "Form 13F holdings reports filed with the SEC by investment managers, the latest first: those filed in the last days, week or month, or a manager's by name, with the quarter, form (amendments marked) and a link to the filing; a row opens the manager's holdings on HOLDINGS, whether or not it has listed shares (SEC EDGAR full-text search, desktop app).", component: FLNG, example: 'FILINGS13F BRIDGEWATER' },
  { code: 'MANAGEMENT', name: 'Management', category: 'Equity', needsSec: true, classes: EQ, desc: "The company's officers from Yahoo Finance's company profile (name, title, age, pay, options exercised and unexercised), each insider's Form 4 purchases, sales, awards, exercises and holdings of the last 12 months from SEC EDGAR, and the proxy statement's total compensation (desktop app).", component: MGMT, aliases: ['OFFICERS'], example: 'MANAGEMENT AAPL' },
  { code: 'INSIDERS', name: 'Insider Transactions', category: 'Equity', needsSec: true, classes: EQ, desc: "The insiders' purchases, sales, awards and option exercises of the last 12 months from their SEC Form 4 filings: each insider's totals and every transaction with its filing, with a CSV (desktop app, US-listed companies).", component: INSD },
  { code: 'PEERS', name: 'Relative Valuation', category: 'Equity', needsSec: true, classes: EQ, desc: 'Peer comparison of valuation multiples, profitability and returns with peer medians.', component: RV, aliases: ['COMPS'] },
  { code: 'CLASSIFICATION', name: 'Company Classification Browser', category: 'Equity', classes: EQ, desc: "Every US-listed company on Nasdaq's stock list by sector and industry, with the number of companies and their market value at each level and an industry's companies largest first; find any company by ticker or name. Typed with a stock, it opens on its sector and industry (desktop app).", component: CCB, example: 'CLASSIFICATION NVDA' },
  { code: 'RELATED', name: 'Related Securities', category: 'Equity', needsSec: true, classes: EQ, desc: "A company's related securities: every ticker the SEC lists under its CIK (other share classes, preferred shares and other listed securities) with each one's name, exchange, price, change and value from Yahoo Finance, and the listings of its share class in other countries from OpenFIGI (desktop app, US-registered companies).", component: RELS, example: 'RELATED BAC' },
  { code: 'EVENTS', name: 'Corporate Events', category: 'Equity', classes: EQ, desc: "Calendar of earnings releases and ex-dividend dates, for one company, your active watchlist, your portfolio or every built-in stock; in the desktop app, a week's most relevant releases (the most traded companies by day, before the open and after the close), and every US-listed company reporting above a market value, with EPS and revenue expected and reported, the surprise, growth and an earnings card.", component: EVTS, aliases: ['CORPCAL'] },
  { code: 'FILINGS', name: 'Company Filings', category: 'Equity', classes: EQ, desc: 'SEC EDGAR: a company\'s filings (annual and quarterly reports, current reports, ownership, proxies, offerings) with links to the documents on sec.gov, and the figures it reported in its XBRL financial statements. Finds any SEC filer by ticker, name or CIK.', component: FILINGS, aliases: ['EDGAR'], example: 'FILINGS MSFT' },
  { code: 'DOCSEARCH', name: 'Document Search', category: 'Equity', classes: EQ, desc: "Words searched in the text of every SEC filing and exhibit since 2001: for the loaded company or all companies, by kind of document (annual and quarterly reports, current reports, proxies, prospectuses, ownership, mergers) and dates, with the forms that match most and, for each document, the sentences where it matches (EDGAR full-text search, desktop app, SEC_USER_AGENT).", component: DS, example: 'DOCSEARCH AAPL' },
  { code: 'CROSSCHECK', name: 'Close Cross-Check', category: 'Equity', needsSec: true, classes: EQ, desc: "A US stock's daily closes in the app beside other end-of-day sources (Massive, Alpha Vantage, Tiingo, Twelve Data, with your keys), with the gaps in basis points.", component: CROSSCHECK, aliases: ['VERIFY'], example: 'CROSSCHECK AAPL' },
  { code: 'WACC', name: 'Cost of Capital', category: 'Equity', needsSec: true, classes: EQ, desc: 'Weighted average cost of capital from CAPM and after-tax cost of debt, with a perpetuity value check.', component: WACC },
  { code: 'MARKETCAP', name: 'Market Cap History', category: 'Equity', needsSec: true, classes: EQ, desc: "A company's market value over time: each day's close times the shares outstanding as last published (the count on the cover of the latest SEC filing filed before that day, split adjusted), with its value at the end of each year and the change on the year before, in its trading currency or in US dollars. Click any market value to open it.", component: MCAP, aliases: ['MCAP', 'CAPHIST'], example: 'MARKETCAP AAPL' },
  { code: 'FUNDCHART', name: 'Graph Fundamentals', category: 'Equity', needsSec: true, classes: EQ, desc: 'Charts of revenue, EPS, margins, P/E and cash flow across fiscal years and quarters.', component: GF },
  // Charts
  { code: 'CHART', name: 'Price Chart', category: 'Charts', needsSec: true, desc: 'Historical chart with line, mountain, candle and bar styles, daily/weekly/monthly frequency, SMA/EMA, Bollinger bands, volume, RSI, MACD and comparison overlays. Scroll to zoom, drag to pan. GPO opens it as open-high-low-close bars, GPC as candlesticks; RSI, MACD and BOLL open it with that study added.', component: GP, aliases: ['GRAPH', 'GPO', 'GPC', 'RSI', 'MACD', 'BOLL'], example: 'CHART AAPL' },
  { code: 'INTRADAY', name: 'Intraday Chart', category: 'Charts', needsSec: true, desc: "The latest session's intraday chart against the previous close, updating as prices arrive.", component: GIP, example: 'CHART EURUSD 1D' },
  { code: 'HISTORY', name: 'Historical Prices', category: 'Charts', needsSec: true, desc: 'Daily, weekly, monthly, quarterly or yearly price table with changes and volume; copy or export to CSV. A range and periodicity can follow the security: HP AAPL 1Y W.', component: HP, aliases: ['PRICES'], example: 'HP AAPL 1Y W' },
  { code: 'RETURNS', name: 'Comparative Returns', category: 'Charts', needsSec: true, desc: 'Rebased performance of a security against benchmarks and peers over a chosen period.', component: COMP, aliases: ['COMPARE'] },
  { code: 'TOTALRETURN', name: 'Total Return Analysis', category: 'Charts', needsSec: true, classes: ['equity', 'index', 'commodity', 'crypto', 'fx', 'future'], desc: 'Price and total return with dividends reinvested against a benchmark: annualised return, volatility and drawdown.', component: TRA },
  { code: 'SPREAD', name: 'Historical Spread', category: 'Charts', needsSec: true, desc: 'Spread or ratio between two securities with mean, standard deviation, z-score and percentile (2s10s, Brent-WTI, gold/silver).', component: HS, aliases: ['RATIO'], example: 'SPREAD USGG10YR' },
  { code: 'BETA', name: 'Historical Beta', category: 'Charts', needsSec: true, classes: ['equity', 'index', 'crypto', 'commodity', 'fx'], desc: 'Regression of returns against an index: raw and adjusted beta, alpha, R², with scatter plot.', component: BETA },
  { code: 'REGRESSION', name: 'Regression Analysis', category: 'Charts', needsSec: true, classes: ['equity', 'index', 'crypto', 'commodity', 'fx'], desc: "One security's returns regressed on another's (any security, typed after the function): beta, alpha, R², correlation and the scatter, daily, weekly or monthly over six months to five years.", component: BETA, example: 'AAPL US Equity HRA MSFT US Equity' },
  { code: 'STUDIES', name: 'Technical Studies', category: 'Charts', desc: 'The technical studies charts draw (moving averages, Bollinger bands, RSI, MACD, volume), what each computes, and the command that adds it to a chart.', component: TECH },
  { code: 'VOLATILITY', name: 'Historical Volatility', category: 'Charts', needsSec: true, desc: 'Realised volatility over 10 to 260 days with percentiles and a rolling chart. Implied volatility is not available (option quotes are licensed).', component: HVT },
  // News
  { code: 'HEADLINES', name: 'Official Announcements', category: 'News', desc: 'Official announcements, newest first, by topic: central banks (Fed, ECB, Bank of England, Bank of Canada, RBA, Bank of Japan), regulators (ESMA, SEC), statistics (BEA) and speeches (Fed, ECB blog, BIS). TOP opens the market news (MARKETNEWS).', component: HEADLINES, aliases: ['ANNOUNCEMENTS'] },
  { code: 'NEWS', name: 'News Search', category: 'News', desc: 'Search all news: NEWS <words> finds every story the app holds with those words (market news from each source, official announcements) and asks Google News for the last week. NEWS CB, REG, STATS or SPEECH lists official announcements on that topic; with a security it opens COMPANYNEWS.', component: N, example: 'NEWS CB' },
  { code: 'MYNEWS', name: 'My News', category: 'News', desc: 'Pages of your own news: each section a saved search (a ticker, a company or a topic) over the news the app reads, with its latest stories; a section opens NEWS on its words.', component: MYN },
  { code: 'MARKETNEWS', name: 'Market News', category: 'News', topics: true, desc: 'Top market news merged without duplicates: Finnhub (general and mergers), Benzinga through Alpaca, Massive, Google News, Marketaux (your watchlist, with sentiment), the SEC\'s latest 8-K filings and Euronext\'s press releases; filter by ticker or keyword. 4) Official opens HEADLINES.', component: MNEWS, aliases: ['MNEWS', 'WIRE'], example: 'MARKETNEWS NVDA' },
  { code: 'COMPANYNEWS', name: 'Company News', category: 'News', needsSec: true, desc: "Any security's news: for a US stock Finnhub, Alpaca, Massive and Marketaux, with a way to its SEC filings; for anything Yahoo quotes, its headlines (indices, currencies, commodities, coins); Google News in its market's languages; for a stock listed on Euronext, its press releases.", component: CN, example: 'COMPANYNEWS AAPL' },
  { code: 'BREAKING', name: 'Breaking News', category: 'News', desc: 'The newest stories from every news source, the official announcements and your favourites\' news, with their age: last hour, 4 hours, 24 hours, favourites or watchlist. NEW marks the last 15 minutes; refreshed every 1 to 3 minutes while open.', component: BREAKING, aliases: ['FIRST', 'BN', 'BREAK'], example: 'BREAKING FAV' },
  // Markets
  { code: 'MARKET', name: 'World Equity Indices', category: 'Markets', desc: 'Major equity indices by region with net and percent change, YTD in local currency and USD, intraday sparkline.', component: WEI, aliases: ['INDICES'], example: 'MARKET US' },
  { code: 'INDEXRANKING', name: 'World Equity Index Rankings', category: 'Markets', desc: "MARKET's indices ranked by price return over a day, a week, a month, three months, the year to date or a year, in each index's own currency or in USD, EUR, GBP, JPY or CHF, by region.", component: WEIS },
  { code: 'WORLDMAP', name: 'World Equity Markets Map', category: 'Markets', desc: "One main index per market on a grid laid out like the world, coloured by its price return over the period chosen, in its own currency or one currency; a tile opens the index's chart.", component: WM },
  { code: 'INDEXFUTURES', name: 'World Index Futures', category: 'Markets', desc: 'Front equity index futures with basis, fair value and premium or discount to fair value.', component: WEIF },
  { code: 'CONTRIB', name: 'Index Movers', category: 'Markets', desc: 'What moved an index today: members in index points for the Dow, and for other indices the app\'s stocks in that market by change in market value, with advancers and decliners.', component: MOV, example: 'CONTRIB SPX' },
  { code: 'INDEXLIST', name: 'Index Directory', category: 'Markets', desc: 'The indices the app follows by region: what each is, its country and currency, today\'s move, and its members where the app lists them.', component: IN },
  { code: 'MEMBERS', name: 'Index Members', category: 'Markets', desc: "An index's members with their weights, shares, price, change and market value: the S&P 500, the Nasdaq-100 and the Dow (desktop app). Weights of cap-weighted indices are estimated from market values.", component: MEMB, example: 'SPX INDEX MEMBERS' },
  { code: 'RANKEDRETURNS', name: 'Member Ranked Returns', category: 'Markets', desc: "An index's best and worst members by price return over a day, a week, a month, three or six months, the year to date or a year (S&P 500, Nasdaq-100, Dow; desktop app).", component: MRR, example: 'NDX INDEX RANKEDRETURNS' },
  { code: 'EARNINGSSEASON', name: 'Earnings Season Results', category: 'Markets', desc: "An index's earnings season (S&P 500, Nasdaq-100, Dow): the members that have reported the calendar quarter, how many beat, met or missed the EPS forecast, the median surprise, earnings against expected and growth on the year (EPS times shares), revenue surprises with a Finnhub or FMP key, the same by sector, and the members still to report, from Nasdaq's earnings calendar (desktop app).", component: EA, example: 'SPX INDEX EARNINGSSEASON' },
  { code: 'CROSSSECTION', name: 'Graphical Cross Sectional', category: 'Markets', desc: "An index's members (S&P 500, Nasdaq-100, Dow) plotted on two fields against each other: market value, price returns over a day to a year, index weight, dollars traded and FINRA short interest, with the least-squares line, the correlation and each member's distance from the line; a sector can be highlighted (desktop app).", component: GX, example: 'NDX INDEX CROSSSECTION' },
  { code: 'GROUPRETURNS', name: 'Group Ranked Returns', category: 'Markets', desc: "An index's industry groups ranked by price return over a day, a week, one, three or six months, the year to date or a year: GICS sectors or sub-industries of the S&P 500, sectors and industries of the Nasdaq-100 and the Dow, cap-weighted or equal-weighted, each with its best and worst members (desktop app).", component: GRR, example: 'SPX INDEX GROUPRETURNS' },
  { code: 'TOPMOVERS', name: 'Stock Movers', category: 'Markets', desc: "US stocks as Yahoo Finance's markets pages list them: most active, trending now, the day's top gainers and losers, and the 52-week gainers and losers, with the day's price path, change, volume against the three-month average, market value, P/E and the 52-week change and range (desktop app). GAINERS, LOSERS and TRENDING open those lists.", component: TOPMOVERS, aliases: ['GAINERS', 'LOSERS', 'TRENDING'], example: 'TOPMOVERS GAINERS' },
  { code: 'CONGRESS', name: 'Congress Trading', category: 'Markets', desc: "Members of Congress's trades and holdings from their financial disclosures: representatives ranked by the assets in their latest annual report (a range: the sum of the disclosed value ranges), every trade disclosed in a period by either chamber with its amount range and the days it took to disclose, and the stocks traded most; on a stock, its trades. The House from the Clerk's reports, read from their PDFs; the Senate from FMP's latest trades (FMP_API_KEY), kept as they arrive (desktop app).", component: CONGRESS, aliases: ['CONG'], example: 'CONGRESS' },
  { code: 'IPOS', name: 'Capital Raisings: IPOs', category: 'Markets', desc: "US initial public offerings priced, expected, filed and withdrawn in a period (Nasdaq's IPO calendar, all US exchanges, no key), the money raised against the same months a year earlier, and each new listing's first-day and since-offer returns with the best and worst performers; SPACs left out unless included (desktop app).", component: IPO, example: 'IPOS' },
  { code: 'HEATMAP', name: 'Market Heat Map', category: 'Markets', desc: 'US, European and Asia-Pacific stocks (or all of them) by sector and industry, sized by market value and coloured by their change over a day, five days, a month, the year to date or a year. Click a sector to open it.', component: HEATMAP, example: 'HEATMAP' },
  { code: 'INDEXMAP', name: 'Intraday Market Map', category: 'Markets', desc: "An index's whole membership (S&P 500, Nasdaq-100, Dow; desktop app) by GICS sector or country: a sunburst with a table of the groups, the members' table, and a heat map by sector and industry group sized by estimated weight, coloured by today's change.", component: IMAP, example: 'INDEXMAP SPX' },
  { code: 'MOVERS', name: 'Most Active', category: 'Markets', desc: 'Most active, top gainers, losers, value traded and unusual volume by region.', component: MOST, aliases: ['ACTIVE'] },
  { code: 'EXCHANGES', name: 'Exchange Hours', category: 'Markets', desc: "Each exchange the app keeps a calendar for (NYSE, Euronext, London, Xetra, Tokyo): its local time, whether its regular session is open, today's holiday or early close, and when it next opens or closes, with a countdown. Numbered rows open the exchange's holiday calendar.", component: EXCH, example: 'EXCHANGES' },
  { code: 'SCREEN', name: 'Equity Screening', category: 'Markets', desc: 'Screen stocks by region, sector, size, valuation, yield, quality and momentum.', component: EQS, aliases: ['SCREENER'] },
  { code: 'STRATEGIES', name: 'Strategy Backtesting', category: 'Charts', needsSec: true, desc: "Popular trading rules on the security's daily closes (moving average cross, price above its 200-day average, MACD, RSI and Bollinger reversals, breakout, momentum, beside buy and hold), long only or long and short, with a cost per trade, ranked by return, Sharpe ratio, drawdown or win rate, each one's growth drawn beside buying and holding.", component: BTST, example: 'STRATEGIES SPX' },
  { code: 'BACKTEST', name: 'Equity Backtesting', category: 'Markets', desc: "Back-tests a stock-picking rule (momentum, short-term reversal, low volatility or trend) on an index's members over up to ten years of month-end closes, held in equal weights and rebalanced monthly or quarterly with trading costs, against the index and the members in equal weights: growth, annual return, volatility, drawdown, each calendar year and the picks at each rebalance. Price returns on today's members (desktop app).", component: EQBT, example: 'BACKTEST SPX' },
  { code: 'QUOTE', name: 'Quote', category: 'Markets', needsSec: true, desc: "One-screen quote: price, intraday chart, best bid and offer, recent updates and key statistics; for US stocks also IEX's last trade and bid and offer from Alpaca (labelled IEX only) and the company's latest news from Finnhub, with your keys.", component: BQ, example: 'QUOTE AAPL' },
  { code: 'TRADES', name: 'Time and Sales', category: 'Markets', needsSec: true, classes: TRADABLE, desc: 'Tape of the price and volume updates the source reports (not single trades) with a VWAP and volume summary; the browser version models single trades.', component: TAS, aliases: ['TAPE'] },
  { code: 'DEPTH', name: 'Market Depth', category: 'Markets', needsSec: true, classes: ['equity', 'commodity', 'crypto', 'fx', 'future'], desc: 'Order book for crypto from Kraken, and the best bid and offer from the source for everything else; the browser version models a full book.', component: DEPTH, aliases: ['BOOK'] },
  { code: 'VWAP', name: 'VWAP Analysis', category: 'Markets', needsSec: true, classes: TRADABLE, desc: 'Intraday volume-weighted average price with 30-minute buckets, TWAP and price against VWAP.', component: VWAP },
  // FX & crypto
  { code: 'CONVERT', name: 'Currency Conversion', category: 'FX & Crypto', desc: "An amount in one currency in another and in the other main currencies, at the live rates against the US dollar or at the ECB's reference rate of any day since 1999, with the rate, its inverse and where it comes from.", component: FXCA, example: 'CONVERT 1000 EUR USD' },
  { code: 'FXMATRIX', name: 'Currency Cross Rates', category: 'FX & Crypto', desc: 'Cross rates of major currencies, worked out from each currency\'s rate against the US dollar.', component: FXC, aliases: ['CROSSES'] },
  { code: 'CURRENCYRATES', name: 'World Currency Rates', category: 'FX & Crypto', desc: 'Every currency the app carries against a base you choose (USD, EUR, GBP, JPY, CHF, CAD, AUD), by region or in a basket of your own, with the change over the day, a month, the year to date and a year.', component: WCR },
  { code: 'FXRANK', name: 'World Currency Ranker', category: 'FX & Crypto', desc: 'Currencies ranked by performance against the US dollar over a chosen period.', component: WCRS },
  { code: 'CRYPTO', name: 'Crypto Monitor', category: 'FX & Crypto', desc: 'Ten major coins on Kraken\'s USD pairs: price, range and volume over the UTC day, market value from CoinGecko, and returns.', component: CRYP, example: 'CRYPTO BTC' },
  { code: 'FXFORWARD', name: 'Forward Rates', category: 'FX & Crypto', desc: 'FX forward points, outrights and contract PV from your simple deposit rates, day-count bases and input or source spot; calculated, with no dealer bid/ask quotes.', component: FRD, aliases: ['FORWARDS'], example: 'FXFORWARD EURUSD', suggested: ['MONEYMARKET', 'FXOPTION'] },
  { code: 'FXOPTION', name: 'FX Option Valuation', category: 'FX & Crypto', desc: 'Vanilla FX option pricer (Garman-Kohlhagen): premium in pips and percent, greeks and expiry P&L.', component: OVML, example: 'FXOPTION EURUSD' },
  // Rates
  { code: 'BONDS', name: 'World Bond Markets', category: 'Rates & Credit', desc: 'Government yields by country and tenor with changes, spreads to Treasuries and Bunds, and curve slope.', component: WB, aliases: ['WORLDBONDS', 'SOVM'] },
  { code: 'BONDMOVERS', name: 'World Bond Movers', category: 'Rates & Credit', desc: 'Every government yield the app has, ranked by how far it moved over a day, five days, a month or the year to date: the markets with the most price action first.', component: WBMV },
  { code: 'CURVE', name: 'Graph Curves', category: 'Rates & Credit', desc: 'Yield curves (US, Germany, UK, Japan) today versus one week, one month and one year ago.', component: GC, aliases: ['CURVES', 'YIELDS'] },
  { code: 'CURVEMENU', name: 'Yield Curve Analysis', category: 'Rates & Credit', desc: "A menu of the yield curve screens: each country's curve now and in the past, then the bond monitors and calculators.", component: IYC },
  { code: 'BONDFUTURES', name: 'World Bond Futures', category: 'Rates & Credit', desc: 'US Treasury futures (2-year to Ultra Bond) in 32nds with change, range and the cash benchmark yield beside each, and SOFR and Fed funds futures with the rate they imply; price or yield view.', component: WBF, example: 'BONDFUTURES' },
  { code: 'MONEYMARKET', name: 'Treasury & Money Markets', category: 'Rates & Credit', desc: 'Fed funds target and New York Fed reference rates, bills, curve spreads and SOFR futures.', component: BTMM },
  { code: 'BONDCALC', name: 'Yield & Spread Analysis', category: 'Rates & Credit', classes: ['bond'], desc: 'Fixed-rate bond calculator: price/yield, accrued, duration, convexity, DV01, yield to each call and to worst from a typed call schedule, G-spread, zero-curve Z-spread, spread risk, scenarios, cash flows and CSV export. Uses explicit contract, call, benchmark and curve inputs.', component: YAS, example: 'BONDCALC' },
  { code: 'RATEPROBS', name: 'Rate Probabilities', category: 'Rates & Credit', desc: 'Market-implied Fed moves meeting by meeting, from fed funds futures and the FOMC calendar.', component: WIRP },
  { code: 'SWAPCALC', name: 'Swap Manager', category: 'Rates & Credit', desc: 'Fixed/float swap analytics from user-entered zero curves: par coupon, NPV, separate discount/projection curves, cash flows and curve/coupon bump risk. No market swap curve is inferred.', component: SWPM },
  { code: 'FEDPORTAL', name: 'Federal Reserve', category: 'Rates & Credit', desc: "A portal on the Federal Reserve: the target range and when it last moved, the next decision, the New York Fed's funding rates, the Board's latest announcements, its publications and the app's screens on US rates.", component: FED },
  { code: 'ECBPORTAL', name: 'European Central Bank', category: 'Rates & Credit', desc: "A portal on the ECB: the deposit facility rate and its last move from the ECB's own data, the next decision from its calendar, €STR, its latest announcements, its pages and the screens on euro rates.", component: ECB },
  { code: 'BOEPORTAL', name: 'Bank of England', category: 'Rates & Credit', desc: "A portal on the Bank of England: Bank Rate and its last move from the Bank's database, the next MPC decision, SONIA, its latest announcements, its pages and the screens on sterling rates.", component: BOE },
  { code: 'BOJPORTAL', name: 'Bank of Japan', category: 'Rates & Credit', desc: "A portal on the Bank of Japan: the basic loan rate and its last move and the overnight call rate from the Bank's Time-Series Data Search, the next meeting, its latest announcements, its pages and the screens on yen rates.", component: BOJ },
  { code: 'FEDMEETINGS', name: 'FOMC Meetings', category: 'Rates & Credit', desc: "The year's scheduled FOMC announcement days from the Federal Reserve Board's calendar, each decided one with the target range that took effect and the move in basis points, from the New York Fed's daily series; numbered links to the Fed path, central banks and money markets.", component: FOMC, example: 'FOMC' },
  { code: 'CENTRALBANKS', name: 'Central Bank Monitor', category: 'Rates & Credit', desc: 'Policy rates, last moves and next decision dates for major central banks against 2-year yields.', component: CENB },
  { code: 'RATEANALYSIS', name: 'Central Bank Rate Analysis', category: 'Rates & Credit', desc: "Each central bank's policy rate from its own data with every move over about four years: the level, the last move, the change over a year, the rises and cuts, the next decision, a step chart and the meeting that decided each move.", component: CBRT },
  { code: 'BONDSEARCH', name: 'Fixed Income Search', category: 'Rates & Credit', desc: 'Search Treasuries and corporate bonds by issuer, rating, maturity and coupon with yields and spreads (browser model; bond prices have no free source).', component: SRCH, example: 'AAPL CORP', unavailable: 'bond prices have no free source' },
  { code: 'DEBTPROFILE', name: 'Debt Distribution', category: 'Rates & Credit', desc: "An issuer's bonds by maturity: amounts outstanding, weighted coupon, life and spread (browser model).", component: DDIS, example: 'DEBTPROFILE JPM CORP', unavailable: 'bond data has no free source' },
  { code: 'DEALERQUOTES', name: 'All Quotes', category: 'Rates & Credit', needsSec: true, classes: ['bond'], desc: 'Dealer quote montage for a bond with best bid and offer, yields and sizes (browser model; dealer quotes have no free source).', component: ALLQ, unavailable: 'dealer quotes have no free source', suggested: ['BONDCALC', 'BONDSEARCH'] },
  // Commodities
  { code: 'COMMODITIES', name: 'Global Commodities', category: 'Commodities', desc: 'Energy, metals, grains, softs and livestock futures with changes, YTD and intraday.', component: GLCO },
  { code: 'OILMARKET', name: 'Oil', category: 'Commodities', desc: 'The oil page: WTI, Brent, heating oil and gasoline futures, the Brent-WTI spread and two crack spreads with their year\'s range, curves and news.', component: OIL },
  { code: 'COT', name: 'Commitments of Traders', category: 'Commodities', desc: "The CFTC's Commitments of Traders: positions by category of reportable trader in 40 futures markets, held each Tuesday and published the following Friday (delayed and aggregated): Disaggregated for commodities, Traders in Financial Futures for financial futures, Legacy for both; futures only or with options; two years of a market's history (desktop app).", component: COT },
  { code: 'NGAS', name: 'Natural Gas Statistics', category: 'Commodities', desc: "EIA's weekly natural gas storage report by region with EIA's own year-ago and five-year comparisons, two years of the Lower 48's weekly stocks, and monthly dry gas production and consumption (desktop app; EIA_API_KEY for the history and monthly figures).", component: NGAS },
  { code: 'NATURALGAS', name: 'Natural Gas', category: 'Commodities', desc: 'The natural gas page: Henry Hub futures, the crude to gas ratio with its year\'s range, the curve and news.', component: GAS },
  { code: 'METALS', name: 'Metals & Mining', category: 'Commodities', desc: 'Precious and base metal futures, the gold to silver and gold to platinum ratios with their year\'s range, curves and news.', component: MINE },
  { code: 'AGRICULTURE', name: 'Agriculture', category: 'Commodities', desc: 'Grain, soft and livestock futures, the soybean to corn ratio and the wheat-corn spread with their year\'s range, curves and news.', component: AGS },
  { code: 'FUTURESCURVE', name: 'Commodity Forward Curves', category: 'Commodities', desc: "A commodity's forward curve: every listed contract month with its own price and expiry, the curve a week and a month ago from each contract's closes, the change, the spread to the front month, open interest and volume, and whether the curve is in contango or backwardation (Yahoo Finance, desktop app).", component: CCRV, example: 'CL1 COMDTY FUTURESCURVE' },
  { code: 'CONTRACTS', name: 'Exchange Contracts', category: 'Commodities', desc: "The futures the app carries (commodities, rate and equity index futures), found by sector, exchange or name, with each contract's size or multiplier, price unit or tick and listed months, and in the desktop app Yahoo's front month with its expiry, price, change and open interest. A commodity opens on its forward curve.", component: CTM, example: 'CONTRACTS CRUDE' },
  // Economics
  { code: 'NIPA', name: 'US National Accounts', category: 'Economics', desc: "BEA's national accounts: what drove real GDP growth in each of the last six quarters (contributions by component, Table 1.1.2) and personal income, spending and saving by month (Table 2.6), with BEA's revision dates (desktop app, BEA_API_KEY).", component: NIPA },
  { code: 'MACRO', name: 'Macro Dashboard', category: 'Economics', desc: 'US policy rate, Treasury yields and curve, inflation, jobs, growth, money, credit spreads, financial conditions and recession signals from the FRED API, with how payrolls and GDP were revised since first published.', component: MACRO, example: 'MACRO CPI' },
  { code: 'ECONCHART', name: 'Economic Data Chart', category: 'Economics', desc: "Up to four FRED series on one chart, each as published or transformed by FRED (change, % change, on a year ago, compounded annual rate), over two years to the whole history, with a second scale for different units, each one's latest value and the one before, and FRED's description; a search finds any of FRED's series (desktop app, FRED_API_KEY).", component: ECOW, example: 'ECONCHART HOUST CPIAUCSL:PC1' },
  { code: 'ECOFORECASTS', name: 'Economic Forecasts', category: 'Economics', desc: "The IMF's World Economic Outlook for the world, its regions and the largest economies, or every economy: GDP growth, inflation, unemployment, current account, government balance and debt, two years back to five ahead with the IMF's projections marked, and any economy's history and projections on a chart (desktop app).", component: ECFC, example: 'ECOFORECASTS USA' },
  { code: 'TRADEFLOWS', name: 'Trade Flows', category: 'Economics', desc: "An economy's goods exports and imports with each partner country and region from the IMF's International Trade in Goods (formerly the Direction of Trade Statistics): any of the last ten years with the balance, each partner's share and the change on the year before, a partner's trade by year on a chart, and its last 24 months (desktop app).", component: ECTR, example: 'TRADEFLOWS DEU' },
  { code: 'LEGISLATION', name: 'U.S. Legislation', category: 'Economics', desc: "Bills in Congress from Congress.gov: the latest by update with where each stands, the laws enacted in the current Congress, and a bill's sponsor, cosponsors, committees, Congressional Research Service summary, actions, subjects and text; found by words in the title or by number (desktop app, CONGRESS_GOV_API_KEY).", component: BILL, example: 'LEGISLATION HR 7831' },
  { code: 'RELEASES', name: 'Economic Calendar', category: 'Economics', desc: 'Releases and central bank decisions with actual and prior; actuals appear once published. The desktop app takes US release dates and values from FRED and decisions from the central banks.', component: ECO, aliases: ['ECONCAL', 'WECO'] },
  { code: 'ECONSTATS', name: 'World Economic Statistics', category: 'Economics', desc: 'GDP, inflation, unemployment and policy rates by country alongside live yields and markets.', component: ECST, aliases: ['GEW'] },
  { code: 'HOLIDAYS', name: 'Holiday Calendar', category: 'Economics', desc: 'Exchange holiday and early-close calendars for New York, Euronext, London, Frankfurt and Tokyo.', component: CDR, example: 'HOLIDAYS US' },
  // Derivatives
  { code: 'OPTIONS', name: 'Option Monitor', category: 'Derivatives', needsSec: true, classes: ['equity', 'index'], desc: 'Listed US equity contracts from Alpaca with your keys: indicative bids/asks, delayed trades, provider IV/Greeks, expiry filters, source timestamps and CSV. No OPRA, index options, open interest or daily volume.', component: OMON },
  { code: 'OPTIONCALC', name: 'Option Valuation', category: 'Derivatives', needsSec: true, classes: ['equity', 'index'], desc: 'European BSM or American Tian binomial value/IV, early-exercise premium, Greeks, grid diagnostic, manual tenor, scenarios and CSV for a single option; continuous dividends.', component: OVME },
  { code: 'OPTIONSTRATEGY', name: 'Option Strategy Analysis', category: 'Derivatives', classes: ['equity', 'index'], desc: 'Up to 12 common-expiry option legs plus stock: signed positions, entry premiums, aggregate Greeks, exact expiry risk/breakevens, time/spot/volatility scenarios and CSV. Manual European model, with labelled strategy examples.', component: OptionStrategy, aliases: ['STRATEGY'], example: 'OPTIONSTRATEGY' },
  // Portfolio & tools
  { code: 'WORKSHEET', name: 'Worksheets', category: 'Portfolio & Tools', desc: "Tables of the securities you choose by the fields you choose: the watchlist's market fields and fundamentals (market value, enterprise value, P/E, P/B, EV/EBITDA, dividend yield, ROE, margins, growth, beta), several saved sheets, sorting, and CSV with every cell's source.", component: WS, aliases: ['SHEETS'], example: 'WORKSHEET' },
  { code: 'WATCHLIST', name: 'Watchlists', category: 'Portfolio & Tools', desc: 'Editable watchlists with saved field columns, quote/source presets, sorting, filtering, intraday sparklines and CSV with field provenance.', component: W, aliases: ['WATCH'], example: 'WATCHLIST TECH' },
  { code: 'FAVOURITES', name: 'Favourites', category: 'Portfolio & Tools', desc: 'The securities you starred (☆ beside a security\'s name, anywhere): 1) live prices and changes, 2) their news merged from every source. The command line offers them as soon as you click it.', component: FAV, aliases: ['FAV', 'FAVORITES', 'FAVS'], example: 'FAVOURITES NEWS' },
  { code: 'FRONTIER', name: 'Mean-Variance Portfolio', category: 'Portfolio & Tools', desc: "Mean-variance analysis on month-end last prices (desktop app): a long-only minimum-variance optimum over screened names with those under 1% marked, then the efficient frontier, the global minimum-variance, equally weighted and tangency portfolios, the capital market line and the Sharpe ratio, with the monthly price table. Prices from Yahoo Finance, adjusted for splits and not dividends.", component: FRONTIER, aliases: ['MVO', 'EFFICIENT'], example: 'FRONTIER' },
  { code: 'MPC', name: 'MPC Portfolio Back-test', category: 'Portfolio & Tools', desc: "The model-predictive-control portfolio back-tests of a 2019 dissertation on its 20 US stocks (desktop app): Hold, and multi-period optimisation over forecast horizons, risk, trading and holding aversions, leverage limits, long only and dollar neutral, each with its input and result table (return, excess return, excess risk, Sharpe ratio, maximum drawdown, turnover) and its value and weight charts. Adjusted closes from Tiingo (delisted stocks included), the 3-month bill rate from FRED; forecasts from past returns only.", component: MPC, aliases: ['MPO', 'PORTBACKTEST'], example: 'MPC' },
  { code: 'PORTFOLIO', name: 'Portfolio & Risk', category: 'Portfolio & Tools', desc: 'Several portfolios as tabs, each with its own holdings, cash and transactions (first-in first-out lots, fees, ECB rates of the day, realised P&L, time- and money-weighted returns); historical-FX replay, date-aligned VaR/ES, signed risk contributions, benchmark tracking error, allocation, price/FX stress and CSV. Complete history required.', component: PORT },
  { code: 'ALERTS', name: 'Alerts', category: 'Portfolio & Tools', desc: 'Price, percent-change and news keyword alerts that pop up wherever you are while the app is open.', component: ALRT, aliases: ['ALERT', 'NLRT'] },
  { code: 'COMPLIANCE', name: 'Compliance Manager', category: 'Portfolio & Tools', desc: "Your own rules on a portfolio (largest position, sector, country, region or asset class weights, UCITS 5/10/40, a restricted list, fewest holdings, cash, no shorts), checked as prices move, with an exception blotter; PORTFOLIO asks before recording a trade that would add an exception.", component: CMGR },
  { code: 'CORRELATION', name: 'Correlation Matrix', category: 'Portfolio & Tools', desc: 'Correlation of daily returns across any set of securities and periods, and the lines that moved most closely with one.', component: CORR },
  { code: 'SEARCH', name: 'Security Finder', category: 'Portfolio & Tools', desc: 'Search every security by ticker, name or alias, filtered by asset class.', component: SECF, aliases: ['FIND'] },
  { code: 'SEARCHRESULTS', name: 'Search Results', category: 'Portfolio & Tools', desc: 'Plain words or a question typed on the command line: the functions, securities and headlines in the app that match, with tabs for each kind.', component: SEAR, aliases: ['SEAR'], example: 'SEAR green bonds', hint: '<Pg Dn> for More Results, <Back> to Return' },
  { code: 'RECENT', name: 'Recently Used', category: 'Portfolio & Tools', desc: 'Your recently viewed securities and functions.', component: LAST },
  { code: 'NOTES', name: 'Notes', category: 'Portfolio & Tools', desc: 'Personal notes per security or general, saved as you type.', component: NOTE },
  { code: 'LAYOUTS', name: 'Layouts', category: 'Portfolio & Tools', desc: 'Build a layout of your own (rows, then a screen per tile, then a name), save the panels as a named workspace with their sizes and bring it back, or apply a preset.', component: LPAD, aliases: ['WORKSPACES'] },
  // Communication
  { code: 'MESSAGES', name: 'Help Desk Messages', category: 'Communication', desc: 'Chat with the help desk bot (quotes, news, calendar); the browser version adds simulated trading desks.', component: IB, aliases: ['CHAT'] },
  // System
  { code: 'HELP', name: 'Function Directory', category: 'System', desc: 'Searchable list of every function, command syntax and keyboard shortcuts.', component: HELP, aliases: ['HL'] },
  { code: 'WHATSNEW', name: "What's New", category: 'System', desc: "What each release changed, newest first, with the installed version marked: the release notes packed into the app. A version can follow: WHATSNEW 2.23.0.", component: WHATSNEW, aliases: ['VERSION', 'RELEASENOTES', 'CHANGELOG'], example: 'WHATSNEW' },
  { code: 'MENU', name: 'Related Functions Menu', category: 'System', desc: 'Numbered analysis functions for the loaded security, market sector menus, news and research, or portfolio tools. Use the menu path to return to a sector or the main menu.', component: MENU, example: 'IBM US EQUITY' },
  { code: 'PROVIDERS', name: 'Data Providers & Status', category: 'System', desc: 'Every data provider: what it serves, its state, last answer and error, requests per minute, the terms that apply, and credentials (desktop).', component: PROV, aliases: ['STATUS', 'SOURCES'] },
  { code: 'SETTINGS', name: 'Settings & Data Sources', category: 'System', desc: 'Display preferences, time zone, live data connections and workspace reset.', component: PDFU, aliases: ['PREFS'] },
];

const BY_CODE = new Map<string, FnDef>();
for (const f of FUNCTIONS) BY_CODE.set(f.code, f);
// Keep help, completion and execution on one alias list. Saved routes and
// function headers retain the descriptive canonical names.
for (const [alias, code] of Object.entries(LEGACY_CODES)) {
  const f = BY_CODE.get(code);
  if (f && !BY_CODE.has(alias)) f.aliases = [...new Set([...(f.aliases ?? []), alias])];
}
for (const f of FUNCTIONS) for (const a of f.aliases ?? []) if (!BY_CODE.has(a)) BY_CODE.set(a, f);

export function lookupFn(code: string): FnDef | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** A runnable example, using the loaded security only when the function accepts it. */
export function exampleCommand(fn: FnDef, sec?: SecurityDef, mnemonics = true): string {
  const code = mnemonics ? primaryMnemonic(fn.code) : fn.code;
  if (sec && (!fn.classes || fn.classes.includes(sec.cls)) &&
      (fn.needsSec || fn.classes || ['MENU', 'ALERTS', 'NOTES', 'CORRELATION'].includes(fn.code))) {
    return `${sec.id} ${code}`;
  }
  if (fn.example) {
    const [head, ...rest] = fn.example.split(' ');
    return lookupFn(head)?.code === fn.code ? [code, ...rest].join(' ') : fn.example;
  }
  if (!fn.needsSec) return code;
  const fallback = [engine.get('AAPL US Equity'), ...engine.securities]
    .find((d) => d && (!fn.classes || fn.classes.includes(d.cls)));
  return fallback ? `${fallback.id} ${code}` : code;
}

configureSecurityLinks((route, id) => {
  const fn = lookupFn(route.fn);
  const sec = engine.get(id);
  return !!fn && !!sec && !!(fn.needsSec || fn.code === 'MENU' || (route.sec && fn.code === 'BONDCALC')) && (!fn.classes || fn.classes.includes(sec.cls));
});
