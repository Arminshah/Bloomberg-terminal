import type { AssetClass } from '../data/types';
import type { FnDef } from './types';
import { HELP } from '../functions/HELP';
import { GIP, GP } from '../functions/GP';
import { DES } from '../functions/DES';
import { HP } from '../functions/HP';
import { FA } from '../functions/FA';
import { ANR } from '../functions/ANR';
import { EE } from '../functions/EE';
import { DVD } from '../functions/DVD';
import { HDS } from '../functions/HDS';
import { RV } from '../functions/RV';
import { EVTS } from '../functions/EVTS';
import { FILINGS } from '../functions/FILINGS';
import { CROSSCHECK } from '../functions/CROSSCHECK';
import { WACC } from '../functions/WACC';
import { COMP } from '../functions/COMP';
import { BETA } from '../functions/BETA';
import { CORR } from '../functions/CORR';
import { DEPTH } from '../functions/DEPTH';
import { TAS } from '../functions/TAS';
import { BQ } from '../functions/BQ';
import { CN, N, TOP } from '../functions/NEWS';
import { MNEWS } from '../functions/MNEWS';
import { WEI, WEIF } from '../functions/WEI';
import { IMAP } from '../functions/IMAP';
import { MOST } from '../functions/MOST';
import { EQS } from '../functions/EQS';
import { BTMM, GC, WB, WIRP } from '../functions/RATES';
import { YAS } from '../functions/YAS';
import { CRYP, FXC, GLCO, WCRS } from '../functions/FXMON';
import { ECO, ECST } from '../functions/ECO';
import { MACRO } from '../functions/MACRO';
import { OMON, OVME } from '../functions/OPTIONS';
import { W } from '../functions/W';
import { PORT } from '../functions/PORT';
import { ALRT } from '../functions/ALRT';
import { LAST, LPAD, PDFU, SECF } from '../functions/TOOLS';
import { PROV } from '../functions/PROV';
import { IB } from '../functions/IB';
import { HS } from '../functions/HS';
import { NOTE } from '../functions/NOTE';
import { MENU } from '../functions/MENU';
import { ALLQ, DDIS, SRCH } from '../functions/CREDIT';
import { GF, HVT, MOV, TRA, VWAP } from '../functions/ANALYSIS';
import { CDR, CENB, FRD, OVML, SWPM } from '../functions/FXRATES';

const EQ: AssetClass[] = ['equity'];
const TRADABLE: AssetClass[] = ['equity', 'commodity', 'crypto', 'future'];

export const FUNCTIONS: FnDef[] = [
  // Equity research
  { code: 'PROFILE', name: 'Profile', category: 'Equity', needsSec: true, desc: 'Security description: business profile, price and valuation snapshot, ownership. Adapts to indices, currencies, commodities, yields, crypto and index futures.', component: DES, aliases: ['DESCRIBE'], example: 'PROFILE NVDA' },
  { code: 'FINANCIALS', name: 'Financial Analysis', category: 'Equity', needsSec: true, classes: EQ, desc: 'Income statement, balance sheet, cash flow and ratios, annual and quarterly, with growth and trend.', component: FA, aliases: ['STATEMENTS'] },
  { code: 'ANALYSTS', name: 'Analyst Research', category: 'Equity', needsSec: true, classes: EQ, desc: 'Analyst price targets (consensus, median, high, low) against the live price, how targets moved, the tally of broker ratings, recent rating actions and annual estimates, from Financial Modeling Prep with your key. US-listed stocks.', component: ANR, aliases: ['TARGETS'], example: 'ANALYSTS AAPL' },
  { code: 'EARNINGS', name: 'Earnings', category: 'Equity', needsSec: true, classes: EQ, desc: 'Reported diluted EPS and revenue by quarter, report dates and the next report date, with annual analyst estimates from Financial Modeling Prep (your key).', component: EE },
  { code: 'DIVIDENDS', name: 'Dividend History', category: 'Equity', needsSec: true, classes: EQ, desc: 'Cash dividends over ten years by ex-date, with amounts, frequency, 12-month yield and the next expected ex-date.', component: DVD, aliases: ['DIVS'] },
  { code: 'HOLDERS', name: 'Holders', category: 'Equity', needsSec: true, classes: EQ, desc: 'Largest institutional and fund holders with position, percent outstanding and change, and the ownership breakdown.', component: HDS, aliases: ['OWNERSHIP'] },
  { code: 'PEERS', name: 'Relative Valuation', category: 'Equity', needsSec: true, classes: EQ, desc: 'Peer comparison of valuation multiples, profitability and returns with peer medians.', component: RV, aliases: ['COMPS'] },
  { code: 'EVENTS', name: 'Corporate Events', category: 'Equity', classes: EQ, desc: 'Calendar of earnings releases and ex-dividend dates, for one company or the whole universe.', component: EVTS, aliases: ['CORPCAL'] },
  { code: 'FILINGS', name: 'Company Filings', category: 'Equity', classes: EQ, desc: 'SEC EDGAR: a company\'s filings (annual and quarterly reports, current reports, ownership, proxies, offerings) with links to the documents on sec.gov, and the figures it reported in its XBRL financial statements. Finds any SEC filer by ticker, name or CIK.', component: FILINGS, aliases: ['EDGAR'], example: 'FILINGS MSFT' },
  { code: 'CROSSCHECK', name: 'Close Cross-Check', category: 'Equity', needsSec: true, classes: EQ, desc: "A US stock's daily closes in the app beside other end-of-day sources (Massive, Alpha Vantage, Tiingo, Twelve Data, with your keys), with the gaps in basis points.", component: CROSSCHECK, aliases: ['VERIFY'], example: 'CROSSCHECK AAPL' },
  { code: 'WACC', name: 'Cost of Capital', category: 'Equity', needsSec: true, classes: EQ, desc: 'Weighted average cost of capital from CAPM and after-tax cost of debt, with a perpetuity value check.', component: WACC },
  { code: 'FUNDCHART', name: 'Graph Fundamentals', category: 'Equity', needsSec: true, classes: EQ, desc: 'Charts of revenue, EPS, margins, P/E and cash flow across fiscal years and quarters.', component: GF },
  // Charts
  { code: 'CHART', name: 'Price Chart', category: 'Charts', needsSec: true, desc: 'Historical chart with line, mountain, candle and bar styles, daily/weekly/monthly frequency, SMA/EMA, Bollinger bands, volume, RSI, MACD and comparison overlays. Scroll to zoom, drag to pan.', component: GP, aliases: ['GRAPH'], example: 'CHART AAPL' },
  { code: 'INTRADAY', name: 'Intraday Chart', category: 'Charts', needsSec: true, desc: "The latest session's intraday chart against the previous close, updating as prices arrive.", component: GIP, example: 'CHART EURUSD 1D' },
  { code: 'HISTORY', name: 'Historical Prices', category: 'Charts', needsSec: true, desc: 'Daily, weekly, monthly, quarterly or yearly price table with changes and volume; copy or export to CSV.', component: HP, aliases: ['PRICES'] },
  { code: 'RETURNS', name: 'Comparative Returns', category: 'Charts', needsSec: true, desc: 'Rebased performance of a security against benchmarks and peers over a chosen period.', component: COMP, aliases: ['COMPARE'] },
  { code: 'TOTALRETURN', name: 'Total Return Analysis', category: 'Charts', needsSec: true, classes: ['equity', 'index', 'commodity', 'crypto', 'fx', 'future'], desc: 'Price and total return with dividends reinvested against a benchmark: annualised return, volatility and drawdown.', component: TRA },
  { code: 'SPREAD', name: 'Historical Spread', category: 'Charts', needsSec: true, desc: 'Spread or ratio between two securities with mean, standard deviation, z-score and percentile (2s10s, Brent-WTI, gold/silver).', component: HS, aliases: ['RATIO'], example: 'SPREAD USGG10YR' },
  { code: 'BETA', name: 'Historical Beta', category: 'Charts', needsSec: true, classes: ['equity', 'index', 'crypto', 'commodity', 'fx'], desc: 'Regression of returns against an index: raw and adjusted beta, alpha, R², with scatter plot.', component: BETA },
  { code: 'VOLATILITY', name: 'Historical Volatility', category: 'Charts', needsSec: true, desc: 'Realised volatility over 10 to 260 days with percentiles and a rolling chart. Implied volatility is not available (option quotes are licensed).', component: HVT },
  // News
  { code: 'HEADLINES', name: 'Official Announcements', category: 'News', desc: 'Press releases from central banks, the BEA and ESMA, newest first, with topic tabs and a reader.', component: TOP, aliases: ['ANNOUNCEMENTS'] },
  { code: 'NEWS', name: 'News Search', category: 'News', desc: 'Keyword search of the official announcements, or a topic: NEWS CB (central banks), NEWS REG (regulators), NEWS STATS (statistics). With a security it opens COMPANYNEWS.', component: N, example: 'NEWS CB' },
  { code: 'MARKETNEWS', name: 'Market News', category: 'News', desc: 'Market news from Finnhub, MarketWatch and Marketaux (your watchlist, with sentiment), with the SEC\'s latest 8-K filings, merged without duplicates; filter by ticker or keyword.', component: MNEWS, aliases: ['MNEWS', 'WIRE'], example: 'MARKETNEWS NVDA' },
  { code: 'COMPANYNEWS', name: 'Company News', category: 'News', needsSec: true, desc: "A US company's news from the last week (Finnhub) and Marketaux's latest stories tagged with it, with sentiment, and a way to its SEC filings.", component: CN, example: 'COMPANYNEWS AAPL' },
  // Markets
  { code: 'MARKET', name: 'World Equity Indices', category: 'Markets', desc: 'Major equity indices by region with net and percent change, YTD in local currency and USD, intraday sparkline.', component: WEI, aliases: ['INDICES'], example: 'MARKET US' },
  { code: 'INDEXFUTURES', name: 'World Index Futures', category: 'Markets', desc: 'Front equity index futures with basis, fair value and premium or discount to fair value.', component: WEIF },
  { code: 'CONTRIB', name: 'Index Movers', category: 'Markets', desc: 'What moved an index today: members in index points for the Dow, and for other indices the app\'s stocks in that market by change in market value, with advancers and decliners.', component: MOV, example: 'CONTRIB SPX' },
  { code: 'HEATMAP', name: 'Intraday Market Map', category: 'Markets', desc: 'Heat map of stocks by sector sized by market cap and coloured by performance.', component: IMAP },
  { code: 'MOVERS', name: 'Most Active', category: 'Markets', desc: 'Most active, top gainers, losers, value traded and unusual volume by region.', component: MOST, aliases: ['ACTIVE'] },
  { code: 'SCREEN', name: 'Equity Screening', category: 'Markets', desc: 'Screen stocks by region, sector, size, valuation, yield, quality and momentum.', component: EQS, aliases: ['SCREENER'] },
  { code: 'QUOTE', name: 'Quote', category: 'Markets', needsSec: true, desc: "One-screen quote: price, intraday chart, best bid and offer, recent updates and key statistics; for US stocks also IEX's last trade and bid and offer from Alpaca (labelled IEX only) and the company's latest news from Finnhub, with your keys.", component: BQ, example: 'QUOTE AAPL' },
  { code: 'TRADES', name: 'Time and Sales', category: 'Markets', needsSec: true, classes: TRADABLE, desc: 'Tape of the price and volume updates the source reports (not single trades) with a VWAP and volume summary; the browser version models single trades.', component: TAS, aliases: ['TAPE'] },
  { code: 'DEPTH', name: 'Market Depth', category: 'Markets', needsSec: true, classes: ['equity', 'commodity', 'crypto', 'fx', 'future'], desc: 'Order book for crypto from Kraken, and the best bid and offer from the source for everything else; the browser version models a full book.', component: DEPTH, aliases: ['BOOK'] },
  { code: 'VWAP', name: 'VWAP Analysis', category: 'Markets', needsSec: true, classes: TRADABLE, desc: 'Intraday volume-weighted average price with 30-minute buckets, TWAP and price against VWAP.', component: VWAP },
  // FX & crypto
  { code: 'FXMATRIX', name: 'Currency Cross Rates', category: 'FX & Crypto', desc: 'Cross rates of major currencies, worked out from each currency\'s rate against the US dollar.', component: FXC, aliases: ['CROSSES'] },
  { code: 'FXRANK', name: 'World Currency Ranker', category: 'FX & Crypto', desc: 'Currencies ranked by performance against the US dollar over a chosen period.', component: WCRS },
  { code: 'CRYPTO', name: 'Crypto Monitor', category: 'FX & Crypto', desc: 'Ten major coins on Kraken\'s USD pairs: price, range and volume over the UTC day, market value from CoinGecko, and returns.', component: CRYP, example: 'CRYPTO BTC' },
  { code: 'FXFORWARD', name: 'Forward Rates', category: 'FX & Crypto', desc: 'FX forward points and outrights by covered interest parity (browser model; the desktop app shows the live spot, as forward points have no free source).', component: FRD, aliases: ['FORWARDS'], example: 'FXFORWARD EURUSD' },
  { code: 'FXOPTION', name: 'FX Option Valuation', category: 'FX & Crypto', desc: 'Vanilla FX option pricer (Garman-Kohlhagen): premium in pips and percent, greeks and expiry P&L.', component: OVML, example: 'FXOPTION EURUSD' },
  // Rates
  { code: 'BONDS', name: 'World Bond Markets', category: 'Rates & Credit', desc: 'Government yields by country and tenor with changes, spreads to Treasuries and Bunds, and curve slope.', component: WB, aliases: ['WORLDBONDS'] },
  { code: 'CURVE', name: 'Graph Curves', category: 'Rates & Credit', desc: 'Yield curves (US, Germany, UK, Japan) today versus one week, one month and one year ago.', component: GC, aliases: ['CURVES', 'YIELDS'] },
  { code: 'MONEYMARKET', name: 'Treasury & Money Markets', category: 'Rates & Credit', desc: 'Fed funds target and New York Fed reference rates, bills, curve spreads and SOFR futures.', component: BTMM },
  { code: 'BONDCALC', name: 'Yield & Spread Analysis', category: 'Rates & Credit', needsSec: true, classes: ['bond'], desc: 'Bond calculator: price/yield, accrued, duration, convexity, DV01, scenarios and cash flows (browser model; bond prices have no free source).', component: YAS, example: 'BONDCALC CT10 GOVT', unavailable: 'bond prices have no free source' },
  { code: 'RATEPROBS', name: 'Rate Probabilities', category: 'Rates & Credit', desc: 'Market-implied Fed moves meeting by meeting, from fed funds futures and the FOMC calendar.', component: WIRP },
  { code: 'SWAPCALC', name: 'Swap Manager', category: 'Rates & Credit', desc: 'USD SOFR swap valuation: par rate, NPV, DV01, bootstrapped discount and forward curves, cash flows (browser model; swap rates have no free source).', component: SWPM, unavailable: 'swap rates have no free source' },
  { code: 'CENTRALBANKS', name: 'Central Bank Monitor', category: 'Rates & Credit', desc: 'Policy rates, last moves and next decision dates for major central banks against 2-year yields.', component: CENB },
  { code: 'BONDSEARCH', name: 'Fixed Income Search', category: 'Rates & Credit', desc: 'Search Treasuries and corporate bonds by issuer, rating, maturity and coupon with yields and spreads (browser model; bond prices have no free source).', component: SRCH, example: 'AAPL CORP', unavailable: 'bond prices have no free source' },
  { code: 'DEBTPROFILE', name: 'Debt Distribution', category: 'Rates & Credit', desc: "An issuer's bonds by maturity: amounts outstanding, weighted coupon, life and spread (browser model).", component: DDIS, example: 'DEBTPROFILE JPM CORP', unavailable: 'bond data has no free source' },
  { code: 'DEALERQUOTES', name: 'All Quotes', category: 'Rates & Credit', needsSec: true, classes: ['bond'], desc: 'Dealer quote montage for a bond with best bid and offer, yields and sizes (browser model; dealer quotes have no free source).', component: ALLQ, unavailable: 'dealer quotes have no free source' },
  // Commodities
  { code: 'COMMODITIES', name: 'Global Commodities', category: 'Commodities', desc: 'Energy, metals, grains, softs and livestock futures with changes, YTD and intraday.', component: GLCO },
  // Economics
  { code: 'MACRO', name: 'Macro Dashboard', category: 'Economics', desc: 'US policy rate, Treasury yields and curve, inflation, jobs, growth, money, credit spreads, financial conditions and recession signals from the FRED API, with how payrolls and GDP were revised since first published.', component: MACRO, example: 'MACRO CPI' },
  { code: 'RELEASES', name: 'Economic Calendar', category: 'Economics', desc: 'Releases and central bank decisions with actual and prior; actuals appear once published. The desktop app takes US release dates and values from FRED and decisions from the central banks.', component: ECO, aliases: ['ECONCAL'] },
  { code: 'ECONSTATS', name: 'World Economic Statistics', category: 'Economics', desc: 'GDP, inflation, unemployment and policy rates by country alongside live yields and markets.', component: ECST },
  { code: 'HOLIDAYS', name: 'Holiday Calendar', category: 'Economics', desc: 'Exchange holiday and early-close calendars for New York, Euronext, London, Frankfurt and Tokyo.', component: CDR, example: 'HOLIDAYS US' },
  // Derivatives
  { code: 'OPTIONS', name: 'Option Monitor', category: 'Derivatives', needsSec: true, classes: ['equity', 'index'], desc: 'Listed option chains: not available, as option quotes are licensed exchange data.', component: OMON, unavailable: 'listed option quotes are licensed exchange data' },
  { code: 'OPTIONCALC', name: 'Option Valuation', category: 'Derivatives', needsSec: true, classes: ['equity', 'index'], desc: 'Black-Scholes valuation with realised volatility: greeks, P&L profile and spot scenarios for a single option.', component: OVME },
  // Portfolio & tools
  { code: 'WATCHLIST', name: 'Watchlists', category: 'Portfolio & Tools', desc: 'Editable watchlists with live prices, changes, volume and intraday sparklines.', component: W, aliases: ['WATCH'], example: 'WATCHLIST TECH' },
  { code: 'PORTFOLIO', name: 'Portfolio & Risk', category: 'Portfolio & Tools', desc: 'Holdings and P&L, performance against a benchmark, VaR, beta, volatility and allocation.', component: PORT },
  { code: 'ALERTS', name: 'Alerts', category: 'Portfolio & Tools', desc: 'Price, percent-change and keyword alerts that pop up wherever you are while the app is open.', component: ALRT, aliases: ['ALERT'] },
  { code: 'CORRELATION', name: 'Correlation Matrix', category: 'Portfolio & Tools', desc: 'Correlation of daily returns across any set of securities and periods.', component: CORR },
  { code: 'SEARCH', name: 'Security Finder', category: 'Portfolio & Tools', desc: 'Search every security by ticker, name or alias, filtered by asset class.', component: SECF, aliases: ['FIND'] },
  { code: 'RECENT', name: 'Recently Used', category: 'Portfolio & Tools', desc: 'Your recently viewed securities and functions.', component: LAST },
  { code: 'NOTES', name: 'Notes', category: 'Portfolio & Tools', desc: 'Personal notes per security or general, saved as you type.', component: NOTE },
  { code: 'LAYOUTS', name: 'Layouts', category: 'Portfolio & Tools', desc: 'Save the panels as a named workspace and bring it back, or apply a preset.', component: LPAD, aliases: ['WORKSPACES'] },
  // Communication
  { code: 'MESSAGES', name: 'Help Desk Messages', category: 'Communication', desc: 'Chat with the help desk bot (quotes, news, calendar); the browser version adds simulated trading desks.', component: IB, aliases: ['CHAT'] },
  // System
  { code: 'HELP', name: 'Function Directory', category: 'System', desc: 'Searchable list of every function, command syntax and keyboard shortcuts.', component: HELP },
  { code: 'MENU', name: 'Related Functions Menu', category: 'System', desc: 'Numbered menu of every function for the loaded security, a market sector menu for a sector word (EQUITY), or the main menu.', component: MENU, example: 'IBM US EQUITY' },
  { code: 'PROVIDERS', name: 'Data Providers & Status', category: 'System', desc: 'Every data provider: what it serves, its state, last answer and error, requests per minute, the terms that apply, and credentials (desktop).', component: PROV, aliases: ['STATUS', 'SOURCES'] },
  { code: 'SETTINGS', name: 'Settings & Data Sources', category: 'System', desc: 'Display preferences, time zone, live data connections and workspace reset.', component: PDFU, aliases: ['PREFS'] },
];

const BY_CODE = new Map<string, FnDef>();
for (const f of FUNCTIONS) BY_CODE.set(f.code, f);
for (const f of FUNCTIONS) for (const a of f.aliases ?? []) if (!BY_CODE.has(a)) BY_CODE.set(a, f);

export function lookupFn(code: string): FnDef | undefined {
  return BY_CODE.get(code.toUpperCase());
}
